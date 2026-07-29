import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface ExecResult {
  success: boolean;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  command: string;
}

const ALLOWED_TOOLS = ["outline-cli", "plane-cli", "forgejo-cli"] as const;

function sanitizeArgs(args: string[]): string[] {
  return args.map((arg) => arg.replace(/[;&|`$()]/g, ""));
}

export async function execCLI(
  tool: string,
  args: string[],
  cwd: string = process.cwd()
): Promise<ExecResult> {
  if (!ALLOWED_TOOLS.includes(tool as (typeof ALLOWED_TOOLS)[number])) {
    return {
      success: false,
      stdout: "",
      stderr: `Unknown tool: ${tool}. Allowed tools: ${ALLOWED_TOOLS.join(", ")}`,
      exitCode: 1,
      command: tool,
    };
  }

  const binaryPath = `./bin/${tool}/${tool}`;
  const sanitized = sanitizeArgs(args);
  const fullCommand = `${binaryPath} ${sanitized.join(" ")}`;

  try {
    const { stdout, stderr } = await execFileAsync(binaryPath, sanitized, {
      cwd,
      timeout: 30_000,
      maxBuffer: 1024 * 1024,
    });

    return {
      success: true,
      stdout: stdout.trim(),
      stderr: stderr.trim(),
      exitCode: 0,
      command: fullCommand,
    };
  } catch (err: unknown) {
    const execErr = err as {
      stdout?: string;
      stderr?: string;
      code?: number;
      signal?: string;
    };
    return {
      success: false,
      stdout: execErr.stdout?.trim() ?? "",
      stderr: execErr.stderr?.trim() ?? execErr.signal ?? "Unknown error",
      exitCode: execErr.code ?? 1,
      command: fullCommand,
    };
  }
}

// ── Per-tool formatters ──────────────────────────────────────────

function formatOutlineDocs(data: Record<string, unknown>): string {
  const docs = data.data;
  if (!Array.isArray(docs) || docs.length === 0) return "*(no documents found)*";

  return docs
    .map((doc) => {
      const title = doc.title ?? "Untitled";
      const url = doc.url ? `https://outline.mhghi.my.id${doc.url}` : "";
      const created = doc.createdAt ? new Date(doc.createdAt).toLocaleDateString() : "";
      const lines = [`**${title}**`];
      if (url) lines.push(`<${url}>`);
      if (created) lines.push(`Created: ${created}`);
      return lines.join("\n");
    })
    .join("\n\n");
}

function formatOutlineDocSingle(data: Record<string, unknown>): string {
  const title = data.title ?? "Untitled";
  const url = data.url ? `https://outline.mhghi.my.id${data.url}` : "";
  const lines = [`**${title}**`];
  if (url) lines.push(`<${url}>`);
  return lines.join("\n");
}

function formatPlaneTasks(data: Record<string, unknown>): string {
  const results = data.results;
  if (!Array.isArray(results) || results.length === 0) return "*(no tasks found)*";

  return results
    .map((task) => {
      const name = task.name ?? "Untitled";
      const priority = task.priority ?? "";
      const state = task.state ?? "";
      const id = task.id ?? "";
      const lines = [`**${name}**`];
      if (priority) lines.push(`Priority: ${priority}`);
      if (state) lines.push(`State: ${state}`);
      if (id) lines.push(`ID: \`${id}\``);
      return lines.join("\n");
    })
    .join("\n\n");
}

function formatPlaneTaskSingle(data: Record<string, unknown>): string {
  const name = data.name ?? "Untitled";
  const priority = data.priority ?? "";
  const id = data.id ?? "";
  const lines = [`**${name}**`];
  if (priority) lines.push(`Priority: ${priority}`);
  if (id) lines.push(`ID: \`${id}\``);
  return lines.join("\n");
}

function formatForgejoRepos(data: unknown): string {
  if (!Array.isArray(data) || data.length === 0) return "*(no repositories found)*";

  return data
    .map((repo: Record<string, unknown>) => {
      const name = repo.full_name ?? repo.name ?? "Unknown";
      const desc = String(repo.description ?? "");
      const lines = [`**${name}**`];
      if (desc) lines.push(desc);
      return lines.join("\n");
    })
    .join("\n\n");
}

function formatForgejoPRs(data: unknown): string {
  if (!Array.isArray(data) || data.length === 0) return "*(no pull requests found)*";

  return data
    .map((pr: Record<string, unknown>) => {
      const title = pr.title ?? "Untitled";
      const number = pr.number ?? "";
      const state = pr.state ?? "";
      const user = pr.user as Record<string, unknown> | undefined;
      const author = user?.username ?? "";
      const lines = [`**#${number} ${title}** [${state}]`];
      if (author) lines.push(`by ${author}`);
      return lines.join("\n");
    })
    .join("\n\n");
}

function formatForgejoIssueSingle(data: Record<string, unknown>): string {
  const title = data.title ?? "Untitled";
  const number = data.number ?? "";
  const repo = data.repository as Record<string, unknown> | undefined;
  const repoName = repo?.full_name ?? "";
  const lines = [`**#${number} ${title}**`];
  if (repoName) lines.push(`Repo: ${repoName}`);
  return lines.join("\n");
}

// ── Dispatch ─────────────────────────────────────────────────────

function detectTool(command: string): string | null {
  if (command.includes("outline-cli")) return "outline";
  if (command.includes("plane-cli")) return "plane";
  if (command.includes("forgejo-cli")) return "forgejo";
  return null;
}

function detectSubcommand(command: string, tool: string): string | null {
  const parts = command.split(" ");
  const toolIdx = parts.findIndex((p) => p.includes(tool));
  if (toolIdx === -1) return null;
  const after = parts.slice(toolIdx + 1);
  if (after.length >= 2) return `${after[0]}_${after[1]}`;
  if (after.length === 1) return after[0];
  return null;
}

function formatToolOutput(result: ExecResult, data: Record<string, unknown>): string {
  const tool = detectTool(result.command);
  if (!tool) return formatGenericJSON(data);

  const sub = detectSubcommand(result.command, `${tool}-cli`);

  switch (tool) {
    case "outline":
      if (sub === "doc_list") return formatOutlineDocs(data);
      if (sub?.startsWith("doc_")) return formatOutlineDocSingle(data);
      break;
    case "plane":
      if (sub === "task_list") return formatPlaneTasks(data);
      if (sub?.startsWith("task_")) return formatPlaneTaskSingle(data);
      break;
    case "forgejo":
      if (sub === "repo_list") return formatForgejoRepos(data.data ?? data);
      if (sub === "pr_list") return formatForgejoPRs(data.data ?? data);
      if (sub?.startsWith("issue_")) return formatForgejoIssueSingle(data);
      break;
  }

  return formatGenericJSON(data);
}

export function formatCLIOutput(result: ExecResult): string {
  if (result.success) {
    try {
      const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
      return formatToolOutput(result, parsed);
    } catch {
      return result.stdout || "(no output)";
    }
  }

  const errorLines = [`**Error** (exit ${result.exitCode}):`];
  if (result.stderr) errorLines.push(`\`\`\`\n${result.stderr}\n\`\`\``);
  if (result.stdout) errorLines.push(`\`\`\`\n${result.stdout}\n\`\`\``);
  return errorLines.join("\n");
}

function formatGenericJSON(data: Record<string, unknown>): string {
  if (Array.isArray(data)) {
    if (data.length === 0) return "*(empty list)*";
    return data
      .map((item) => formatGenericJSON(item as Record<string, unknown>))
      .join("\n\n");
  }

  const lines: string[] = [];
  for (const [key, value] of Object.entries(data)) {
    if (value === null || value === undefined) continue;
    if (typeof value === "object") {
      lines.push(`**${key}:** ${JSON.stringify(value, null, 2)}`);
    } else {
      lines.push(`**${key}:** ${String(value)}`);
    }
  }
  return lines.join("\n") || "(empty object)";
}
