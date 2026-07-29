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

interface KeywordMatch {
  tool: string;
  command: string;
  subcommand: string;
  extractTitle?: (msg: string) => string | null;
}

const KEYWORD_RULES: KeywordMatch[] = [
  // Outline / Docs
  { tool: "outline-cli", command: "doc", subcommand: "list", extractTitle: () => null },
  { tool: "outline-cli", command: "doc", subcommand: "create", extractTitle: (msg) => extractAfter(msg, ["called", "titled", "named", "title"]) },
  { tool: "outline-cli", command: "doc", subcommand: "get", extractTitle: (msg) => extractAfter(msg, ["called", "titled", "named"]) },
  // Plane / Tasks
  { tool: "plane-cli", command: "task", subcommand: "list", extractTitle: () => null },
  { tool: "plane-cli", command: "task", subcommand: "create", extractTitle: (msg) => extractAfter(msg, ["called", "titled", "named", "title"]) },
  { tool: "plane-cli", command: "task", subcommand: "close", extractTitle: (msg) => extractAfter(msg, ["called", "titled", "named"]) },
  // Forgejo / Repos
  { tool: "forgejo-cli", command: "repo", subcommand: "list", extractTitle: () => null },
  { tool: "forgejo-cli", command: "pr", subcommand: "list", extractTitle: () => null },
  { tool: "forgejo-cli", command: "issue", subcommand: "create", extractTitle: (msg) => extractAfter(msg, ["called", "titled", "named", "title"]) },
];

function extractAfter(msg: string, markers: string[]): string | null {
  const lower = msg.toLowerCase();
  for (const marker of markers) {
    const idx = lower.indexOf(marker);
    if (idx !== -1) {
      const after = msg.slice(idx + marker.length).trim().replace(/^["':]+|["':]+$/g, "");
      if (after.length > 0) return after;
    }
  }
  return null;
}

function keywordFallback(userMessage: string, channelAllowedTools: string[]): Intent | null {
  const lower = userMessage.toLowerCase();

  for (const rule of KEYWORD_RULES) {
    if (channelAllowedTools.length > 0 && !channelAllowedTools.includes(rule.tool)) continue;

    const toolKeywords: Record<string, string[]> = {
      "outline-cli": ["doc", "docs", "document", "documents", "wiki", "note", "notes", "write"],
      "plane-cli": ["task", "tasks", "ticket", "issue"],
      "forgejo-cli": ["repo", "repos", "repository", "repositories", "pr", "pull request", "merge"],
    };

    const keywords = toolKeywords[rule.tool] ?? [];
    const hasKeyword = keywords.some((k) => lower.includes(k));
    if (!hasKeyword) continue;

    const actionKeywords: Record<string, string[]> = {
      "list": ["list", "show", "get", "display", "view", "see", "fetch"],
      "create": ["create", "make", "add", "new", "write", "draft"],
      "close": ["close", "done", "complete", "finish"],
    };

    const actions = actionKeywords[rule.subcommand] ?? [];
    const hasAction = actions.some((a) => lower.includes(a));
    if (!hasAction) continue;

    const title = rule.extractTitle?.(userMessage);

    if (rule.subcommand === "list") {
      return { type: "cli", tool: rule.tool, command: rule.command, args: ["list"], rawArgs: "" };
    }
    if (rule.subcommand === "create") {
      const args = ["create"];
      if (title) args.push("--title", title, "--body", "");
      else args.push("--title", "New " + rule.command, "--body", "");
      return { type: "cli", tool: rule.tool, command: rule.command, args, rawArgs: "" };
    }
    if (rule.subcommand === "close" && title) {
      return { type: "cli", tool: rule.tool, command: rule.command, args: ["close"], rawArgs: "" };
    }
  }

  return null;
}

const ROUTER_SYSTEM_PROMPT = `You are an intent router for a Discord bot that manages developer tools. You are ACTION-ORIENTED — prefer routing to CLI tools over chatting.

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

=== ROUTING EXAMPLES ===
User: "hello" → type: "chat", response: "Hey! What do you need?"
User: "thanks" → type: "chat", response: "👍"
User: "what can you do?" → type: "chat", response: "I manage docs, tasks, and repos. Tell me what to do."
User: "list my docs" → type: "cli", tool: "outline-cli", command: "doc", args: ["list"]
User: "create a doc called Meeting Notes" → type: "cli", tool: "outline-cli", command: "doc", args: ["create", "--title", "Meeting Notes", "--body", ""]
User: "let's brainstorm an app idea" → type: "cli", tool: "outline-cli", command: "doc", args: ["create", "--title", "Brainstorm: App Idea", "--body", ""]
User: "create some tasks" → type: "cli", tool: "plane-cli", command: "task", args: ["create", "--title", "New Task", "--body", ""]
User: "create a task called fix login bug" → type: "cli", tool: "plane-cli", command: "task", args: ["create", "--title", "Fix login bug", "--priority", "high"]
User: "show me open PRs" → type: "cli", tool: "forgejo-cli", command: "pr", args: ["list", "--repo", "owner/name", "--state", "open"]
User: "list repos" in forgejo channel → type: "cli", tool: "forgejo-cli", command: "repo", args: ["list"]
User: "list repos" in outline channel → type: "redirect", response: "That needs forgejo-cli — use the Forgejo channel."

=== OUTPUT FORMAT ===
Respond with ONLY a JSON object, no markdown fences:
{
  "type": "chat" | "cli" | "redirect",
  "tool": "<tool-name or null>",
  "command": "<command group: doc, task, repo, pr, issue — or null>",
  "args": ["<subcommand and flags, e.g. list, create, --title, My Title>"],
  "response": "<for chat/redirect: response text. For cli: null>"
}

=== RULES ===
- PREFER CLI routing. Only use "chat" for: greetings, thank yous, pure questions about the bot itself, or when absolutely no CLI tool applies.
- If the user's intent can even loosely map to a CLI action, route it there.
- If the user wants a tool NOT allowed in this channel → type: "redirect", suggest the correct channel.
- For CLI intents:
  - "command" = the CLI command group (doc, task, repo, pr, issue)
  - "args" = the subcommand + all flags (e.g. ["list"], ["create", "--title", "My Task"])
- Extract flag values from natural language (e.g. "called test" → "--title", "test"; "urgent" → "--priority", "urgent")
- ALWAYS include --body "" (or --description "") when creating docs/tasks/issues and user did not provide content
- For vague requests like "let's brainstorm X" → create a doc titled "Brainstorm: X"
- For vague requests like "make some tasks" → create a task with a reasonable title from context
- Chat responses must be under 2 sentences. Be terse.`;

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

    // If LLM returned chat, check if keyword fallback can route to CLI instead
    const keywordResult = keywordFallback(userMessage, channelAllowedTools);
    if (keywordResult) {
      if (keywordResult.type === "cli" && channelAllowedTools.length > 0 && !channelAllowedTools.includes(keywordResult.tool)) {
        const targetChannel = Object.values(channelContext.allChannels).find(
          (ch) => ch.allowedTools.includes(keywordResult.tool)
        );
        const redirect = targetChannel
          ? `That requires \`${keywordResult.tool}\` — head over to **${targetChannel.description ?? "the appropriate channel"}** and ask there.`
          : `The tool \`${keywordResult.tool}\` is not available in this channel.`;
        return { type: "chat", response: redirect };
      }
      return keywordResult;
    }

    return { type: "chat", response: parsed.response ?? response.content };
  } catch {
    // LLM returned unparseable output, try keyword fallback
    const keywordResult = keywordFallback(userMessage, channelAllowedTools);
    if (keywordResult) {
      if (keywordResult.type === "cli" && channelAllowedTools.length > 0 && !channelAllowedTools.includes(keywordResult.tool)) {
        const targetChannel = Object.values(channelContext.allChannels).find(
          (ch) => ch.allowedTools.includes(keywordResult.tool)
        );
        const redirect = targetChannel
          ? `That requires \`${keywordResult.tool}\` — head over to **${targetChannel.description ?? "the appropriate channel"}** and ask there.`
          : `The tool \`${keywordResult.tool}\` is not available in this channel.`;
        return { type: "chat", response: redirect };
      }
      return keywordResult;
    }
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
