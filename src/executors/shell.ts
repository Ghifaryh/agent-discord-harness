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

export function formatCLIOutput(result: ExecResult): string {
  if (result.success) {
    try {
      const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
      return formatJSONOutput(parsed);
    } catch {
      return result.stdout || "(no output)";
    }
  }

  const errorLines = [`**Error** (exit ${result.exitCode}):`];
  if (result.stderr) errorLines.push(`\`\`\`\n${result.stderr}\n\`\`\``);
  if (result.stdout) errorLines.push(`\`\`\`\n${result.stdout}\n\`\`\``);
  return errorLines.join("\n");
}

function formatJSONOutput(data: Record<string, unknown>): string {
  if (Array.isArray(data)) {
    if (data.length === 0) return "*(empty list)*";
    return data.map((item) => formatJSONOutput(item as Record<string, unknown>)).join("\n\n");
  }

  if (typeof data === "object" && data !== null) {
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

  return String(data);
}
