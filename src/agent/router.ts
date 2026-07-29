import { queryLLM } from "./llm.js";

export type IntentType = "chat" | "cli";

export interface ChatIntent {
  type: "chat";
  response: string;
}

export interface CLIIntent {
  type: "cli";
  tool: string;
  command: string;
  args: string[];
  rawArgs: string;
}

export type Intent = ChatIntent | CLIIntent;

const ROUTER_SYSTEM_PROMPT = `You are an intent classifier for a Discord bot that manages developer tools.

Given a user message, determine if it should be handled as a chat response or routed to a CLI tool.

Available CLI tools:
- outline-cli: Docs/wiki management (doc create, doc list, doc get, doc update)
- plane-cli: Project task management (task create, task list, task update, task close)
- forgejo-cli: Git/repo management (repo list, pr create, pr list, pr merge, issue create)

Respond with ONLY a JSON object, no markdown fences:
{
  "type": "chat" | "cli",
  "tool": "<tool-name or null>",
  "command": "<subcommand or null>",
  "args": ["<arg1>", "<arg2>"],
  "rawArgs": "<remaining unparsed arguments>"
}

Rules:
- If it's a greeting, question, or general conversation → type: "chat"
- If it clearly maps to a CLI operation → type: "cli"
- For CLI intents, extract the tool name, subcommand, and arguments from the natural language
- Be conservative: if unsure, default to "chat"`;

export async function classifyIntent(
  userMessage: string,
  channelAllowedTools: string[]
): Promise<Intent> {
  const toolContext =
    channelAllowedTools.length > 0
      ? `\nChannel allowed tools: ${channelAllowedTools.join(", ")}`
      : "\nNo CLI tools are allowed in this channel.";

  const response = await queryLLM(
    ROUTER_SYSTEM_PROMPT + toolContext,
    userMessage
  );

  try {
    const cleaned = response.content
      .replace(/```json\s*/g, "")
      .replace(/```\s*/g, "")
      .trim();
    const parsed = JSON.parse(cleaned) as {
      type?: string;
      tool?: string;
      command?: string;
      args?: string[];
      rawArgs?: string;
      response?: string;
    };

    if (parsed.type === "cli" && parsed.tool) {
      if (
        channelAllowedTools.length > 0 &&
        !channelAllowedTools.includes(parsed.tool)
      ) {
        return {
          type: "chat",
          response: `The tool \`${parsed.tool}\` is not available in this channel.`,
        };
      }
      return {
        type: "cli",
        tool: parsed.tool,
        command: parsed.command ?? "",
        args: parsed.args ?? [],
        rawArgs: parsed.rawArgs ?? "",
      } satisfies CLIIntent;
    }

    return { type: "chat", response: parsed.response ?? response.content };
  } catch {
    return { type: "chat", response: response.content };
  }
}

export async function generateChatResponse(
  userMessage: string,
  context?: string
): Promise<string> {
  const systemPrompt = context
    ? `You are a helpful Discord bot assistant for a developer automation pipeline. Context: ${context}`
    : "You are a helpful Discord bot assistant for a developer automation pipeline. Be concise and helpful. Use Discord markdown formatting when appropriate.";

  const res = await queryLLM(systemPrompt, userMessage);
  return res.content;
}
