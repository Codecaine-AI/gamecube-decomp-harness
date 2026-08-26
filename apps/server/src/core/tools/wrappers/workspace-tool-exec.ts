import type { SandboxExecResult, SandboxHandle } from "@server/core/job-queue/sandbox.js";
import type { ResolvedRegisteredTool } from "../resolver.js";

export const SANDBOX_TOOLPACK_ROOT = "/opt/toolpacks";

const readyToolpacks = new Map<string, Set<string>>();

export function commandPayload(params: {
  operation: string;
  command: string[];
  cwd: string;
  exitCode: number;
  stdout: string;
  stderr: string;
}): Record<string, unknown> {
  let parsed: unknown = null;
  let parse_error: string | null = null;
  if (params.stdout.trim()) {
    try {
      parsed = JSON.parse(params.stdout);
    } catch (error) {
      parse_error = error instanceof Error ? error.message : String(error);
    }
  }
  const failed = params.exitCode !== 0 || parse_error !== null;
  return {
    operation: params.operation,
    cwd: params.cwd,
    command: params.command,
    exit_code: params.exitCode,
    tool_error: failed ? true : undefined,
    error_kind: failed ? (parse_error ? "tool_output_parse_error" : "command_failed") : undefined,
    error_summary: failed ? parse_error ?? (params.stderr.trim() || `command exited ${params.exitCode}`) : undefined,
    parsed,
    parse_error,
    stdout: parsed == null ? params.stdout : undefined,
    stderr: params.stderr || undefined,
  };
}

function timeoutMs(args: string[]): number {
  const index = args.indexOf("--timeout-seconds");
  if (index < 0 || index + 1 >= args.length) return 300_000;
  const seconds = Number(args[index + 1]);
  if (!Number.isFinite(seconds)) return 300_000;
  return Math.min(1_800_000, Math.max(120_000, (seconds + 180) * 1_000));
}

async function toolpackReady(sandboxHandle: SandboxHandle, toolpackId: string): Promise<boolean> {
  const cached = readyToolpacks.get(sandboxHandle.sandboxId);
  if (cached?.has(toolpackId)) return true;
  const result = await sandboxHandle.exec(
    ["test", "-f", `${SANDBOX_TOOLPACK_ROOT}/${toolpackId}/.ready`],
    { timeoutMs: 10_000 },
  );
  if (result.exitCode !== 0) return false;
  if (cached) cached.add(toolpackId);
  else readyToolpacks.set(sandboxHandle.sandboxId, new Set([toolpackId]));
  return true;
}

export async function runWorkspaceToolApi(params: {
  sandboxHandle: SandboxHandle;
  resolved: ResolvedRegisteredTool;
  resolvedTool: Record<string, unknown>;
  scriptName: string;
  args: string[];
}): Promise<Record<string, unknown>> {
  const { sandboxHandle, resolved, scriptName, args } = params;
  const toolPath = resolved.registryEntry.path ?? resolved.toolId;
  const sandboxToolpackRoot = `${SANDBOX_TOOLPACK_ROOT}/${resolved.toolpackId}`;
  const sandboxToolRoot = `${sandboxToolpackRoot}/${toolPath}`;
  const scriptPath = `${sandboxToolRoot}/api/${scriptName}`;
  const resolvedTool = { ...params.resolvedTool, execution_surface: "sandbox_workspace" };

  if (!await toolpackReady(sandboxHandle, resolved.toolpackId)) {
    return {
      status: "sandbox_toolpack_missing",
      tool_id: resolved.toolId,
      script_path: scriptPath,
      resolved_tool: resolvedTool,
    };
  }

  const command = [
    "bash",
    "-lc",
    'mkdir -p "$ORCH_TOOL_SHARED_DATA_ROOT" "$ORCH_TOOL_WORKTREE_CACHE_ROOT" && exec python3 "$@"',
    "--",
    scriptPath,
    ...args,
  ];
  const env: Record<string, string> = {
    ORCH_TOOLPACK_ID: resolved.toolpackId,
    ORCH_TOOL_ID: resolved.toolId,
    ORCH_WORKTREE_ID: resolved.worktreeId,
    ORCH_GAME_ID: resolved.gameId,
    ORCH_TOOLPACK_ROOT: sandboxToolpackRoot,
    ORCH_TOOL_ROOT: sandboxToolRoot,
    ORCH_TOOL_API_ROOT: `${sandboxToolRoot}/api`,
    ORCH_TOOL_IMPL_ROOT: `${sandboxToolpackRoot}/_impl/gamecube`,
    ORCH_GAME_REPO_ROOT: resolved.gameRepoRoot,
    ORCH_TOOL_SHARED_DATA_ROOT: `/opt/tool-data/${resolved.toolId}`,
    ORCH_TOOL_WORKTREE_CACHE_ROOT: `/tmp/tool-cache/${resolved.toolId}`,
    MWCC_WIBO: `${resolved.gameRepoRoot}/build/tools/wibo`,
    WINEDEBUG: "-all",
  };
  const result: SandboxExecResult = await sandboxHandle.exec(command, {
    cwd: resolved.gameRepoRoot,
    env,
    timeoutMs: timeoutMs(args),
  });
  return {
    ...commandPayload({
      operation: `tool:${resolved.toolId}:${scriptName}`,
      command,
      cwd: resolved.gameRepoRoot,
      ...result,
    }),
    resolved_tool: resolvedTool,
  };
}
