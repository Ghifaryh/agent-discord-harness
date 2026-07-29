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

=== CLI TOOL REFERENCE (exact syntax) ===

outline-cli (Docs/Wiki):
  outline-cli doc list [--limit N] [--collection-id "..."]
  outline-cli doc create --title "..." --body "..."
  outline-cli doc get --id "..."
  outline-cli doc update --id "..." --body "..." [--title "..."]

plane-cli (Project Tasks):
  plane-cli task create --title "..." [--priority low|medium|high|urgent] [--description "..."]
  plane-cli task list [--state todo|in_progress|done|backlog]
  plane-cli task update --id "..." [--state "..."] [--title "..."]
  plane-cli task close --id "..."

forgejo-cli (Git/Repos):
  forgejo-cli repo list
  forgejo-cli pr create --repo "owner/name" --branch "..." --title "..." [--body "..."]
  forgejo-cli pr list --repo "owner/name" [--state open|closed|all]
  forgejo-cli pr merge --repo "owner/name" --id N
  forgejo-cli issue create --repo "owner/name" --title "..." [--body "..."] [--labels "a,b"]

=== OUTPUT FORMAT ===
Respond with ONLY a JSON object, no markdown fences:
{
  "type": "chat" | "cli" | "redirect",
  "tool": "<tool-name or null>",
  "command": "<command group: doc, task, repo, pr, issue — or null>",
  "args": ["<subcommand and flags, e.g. list, create, --title, My Title>"],
  "response": "<for chat: response text. For redirect: redirect message. For cli: null>"
}

=== RULES ===
- If it's a greeting, question, or general conversation → type: "chat"
- If it clearly maps to a CLI operation allowed in this channel → type: "cli"
- If the user wants to use a tool that is NOT allowed in this channel → type: "redirect"
  Explain which channel they should use instead.
- For CLI intents:
  - "command" = the CLI command group (doc, task, repo, pr, issue)
  - "args" = the subcommand + all flags (e.g. ["list"], ["create", "--title", "My Task"])
- Extract flag values from natural language (e.g. "called test" → "--title", "test")
- ALWAYS include --body "" (or --description "") when creating docs/tasks/issues and user did not provide content
- Be conservative: if unsure, default to "chat"`;

interface ChannelInfo {
  id: string;
  description?: string;
  allowedTools: string[];
}

function buildChannelContext(
  currentChannelId: string,
  allChannels: Record<string, ChannelInfo>,
  currentAllowedTools: string[]
): string {
  const lines: string[] = [];

  lines.push(`\nCurrent channel ID: ${currentChannelId}`);
  lines.push(
    `This channel allows: ${currentAllowedTools.length > 0 ? currentAllowedTools.join(", ") : "chat only (no CLI tools)"}`
  );

  const otherChannels = Object.entries(allChannels).filter(
    ([id]) => id !== currentChannelId
  );

  if (otherChannels.length > 0) {
    lines.push("\nOther available channels:");
    for (const [id, ch] of otherChannels) {
      lines.push(
        `- ${ch.description ?? id} (ID: ${id}): ${ch.allowedTools.join(", ")}`
      );
    }
  }

  return lines.join("\n");
}

export async function classifyIntent(
  userMessage: string,
  channelAllowedTools: string[],
  channelContext: {
    id: string;
    name?: string;
    description?: string;
    allChannels: Record<string, ChannelInfo>;
  }
): Promise<Intent> {
  const channelInfo = buildChannelContext(
    channelContext.id,
    channelContext.allChannels,
    channelAllowedTools
  );

  const response = await queryLLM(ROUTER_SYSTEM_PROMPT + channelInfo, userMessage);

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
      response?: string;
    };

    if (parsed.type === "cli" && parsed.tool) {
      if (
        channelAllowedTools.length > 0 &&
        !channelAllowedTools.includes(parsed.tool)
      ) {
        const targetChannel = Object.values(channelContext.allChannels).find(
          (ch) => ch.allowedTools.includes(parsed.tool!)
        );
        const redirect = targetChannel
          ? `That requires \`${parsed.tool}\` — head over to **${targetChannel.description ?? "the appropriate channel"}** and ask there.`
          : `The tool \`${parsed.tool}\` is not available in this channel.`;
        return { type: "chat", response: redirect };
      }
      return {
        type: "cli",
        tool: parsed.tool,
        command: parsed.command ?? "",
        args: parsed.args ?? [],
        rawArgs: "",
      } satisfies CLIIntent;
    }

    if (parsed.type === "redirect" && parsed.response) {
      return { type: "chat", response: parsed.response };
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
