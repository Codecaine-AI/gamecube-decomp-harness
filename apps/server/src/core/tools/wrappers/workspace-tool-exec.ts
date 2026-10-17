import type { SandboxExecResult, SandboxHandle } from "@server/core/job-queue/sandbox.js";
import type { ResolvedRegisteredTool } from "../resolver.js";
import { scaleTimeout } from "../timeout-scale.js";
import { STACK_FRAME_POLICY_ENV } from "../stack-frame-policy.js";
import { STEERING_GATE_ENV } from "../steering-gate.js";
import { ORDERING_MODE_ENV, ORDERING_POLICY_ENV } from "../ordering.js";

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

const MAX_TIMEOUT_MS = 1_800_000;

/** Exec timeout for a tool call; the default and floor scale with the sandbox profile, the cap does not. */
export function workspaceToolTimeoutMs(args: string[], scale = 1): number {
  const fallback = scaleTimeout(300_000, scale, MAX_TIMEOUT_MS);
  const index = args.indexOf("--timeout-seconds");
  if (index < 0 || index + 1 >= args.length) return fallback;
  const seconds = Number(args[index + 1]);
  if (!Number.isFinite(seconds)) return fallback;
  return Math.min(MAX_TIMEOUT_MS, Math.max(scaleTimeout(120_000, scale, MAX_TIMEOUT_MS), (seconds + 180) * 1_000));
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

/** Image path of the pinned TP/TWW JSystem reference sources (`/opt/refs/jsystem/{tp,tww}`). */
export const SANDBOX_JSYSTEM_REFS_ROOT = "/opt/refs/jsystem";
const SANDBOX_PROBE_TIMEOUT_MS = 30_000;
const sandboxProbes = new WeakMap<SandboxHandle, Map<string, Promise<SandboxExecResult>>>();

/**
 * Run a read-only prerequisite probe once per sandbox handle and cache its
 * result (the image does not change under a live sandbox). An exec that
 * throws is not cached.
 */
export function sandboxProbe(sandboxHandle: SandboxHandle, command: string[]): Promise<SandboxExecResult> {
  let probes = sandboxProbes.get(sandboxHandle);
  if (!probes) sandboxProbes.set(sandboxHandle, probes = new Map());
  const key = JSON.stringify(command);
  const cached = probes.get(key);
  if (cached) return cached;
  const probe = sandboxHandle.exec(command, { timeoutMs: SANDBOX_PROBE_TIMEOUT_MS });
  probes.set(key, probe);
  probe.catch(() => probes.delete(key));
  return probe;
}

/** Whether `path` is a directory in the sandbox (cached per sandbox handle). */
export async function sandboxDirectoryExists(sandboxHandle: SandboxHandle, path: string): Promise<boolean> {
  return (await sandboxProbe(sandboxHandle, ["test", "-d", path])).exitCode === 0;
}

/**
 * A worker tool whose sandbox prerequisite is missing from the image. Worker
 * tools never fall back to host execution (plan 3.6); the snapshot must be
 * rebuilt.
 */
export function sandboxPrerequisiteMissing(
  toolId: string,
  missing: string,
  resolvedTool?: Record<string, unknown>,
): Record<string, unknown> {
  return {
    status: "sandbox_prerequisite_missing",
    tool: toolId,
    missing,
    guidance: `This sandbox image lacks ${missing}; the tool does not run on the host. Rebuild the worker snapshot, and continue with other evidence meanwhile.`,
    ...(resolvedTool ? { resolved_tool: { ...resolvedTool, execution_surface: "sandbox_workspace" } } : {}),
  };
}

/** The sandbox-local cache directory `runWorkspaceToolApi` exports as ORCH_TOOL_WORKTREE_CACHE_ROOT. */
export function sandboxToolCacheRoot(toolId: string): string {
  return `/tmp/tool-cache/${toolId}`;
}

/**
 * `real_code_evidence.py` arguments for an in-sandbox run, or a
 * prerequisite-missing result. The sandbox repo is the claim's checkout (the
 * `usage` certification list sits at its default path there) and the
 * compiler source is `/opt/mwcc`; `jsystem` reads the image's refs.
 */
export async function realCodeEvidenceSandboxArgs(
  sandboxHandle: SandboxHandle,
  args: string[],
): Promise<{ args: string[] } | { missing: string }> {
  if (args[0] !== "jsystem" || args.includes("--refs-root")) return { args };
  if (!await sandboxDirectoryExists(sandboxHandle, SANDBOX_JSYSTEM_REFS_ROOT)) return { missing: SANDBOX_JSYSTEM_REFS_ROOT };
  return { args: [...args, "--refs-root", SANDBOX_JSYSTEM_REFS_ROOT] };
}

export async function runWorkspaceToolApi(params: {
  sandboxHandle: SandboxHandle;
  resolved: ResolvedRegisteredTool;
  resolvedTool: Record<string, unknown>;
  scriptName: string;
  args: string[];
  timeoutScale?: number;
  /** Tool-relative directory holding the script; `api` unless a runner is invoked. */
  scriptDir?: string;
  /** Extra sandbox env (e.g. the QA standards roots); the base tool env wins on a shared key. */
  env?: Record<string, string>;
}): Promise<Record<string, unknown>> {
  const { sandboxHandle, resolved, scriptName, args } = params;
  const toolPath = resolved.registryEntry.path ?? resolved.toolId;
  const sandboxToolpackRoot = `${SANDBOX_TOOLPACK_ROOT}/${resolved.toolpackId}`;
  const sandboxToolRoot = `${sandboxToolpackRoot}/${toolPath}`;
  const scriptPath = `${sandboxToolRoot}/${params.scriptDir ?? "api"}/${scriptName}`;
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
    ...params.env,
    ORCH_TOOLPACK_ID: resolved.toolpackId,
    ORCH_TOOL_ID: resolved.toolId,
    ORCH_WORKTREE_ID: resolved.worktreeId,
    ORCH_GAME_ID: resolved.gameId,
    // The sandbox has no ORCH_GAME_DIR, so the toolpack reads the policy from here.
    ...(resolved.env[STACK_FRAME_POLICY_ENV] ? { [STACK_FRAME_POLICY_ENV]: resolved.env[STACK_FRAME_POLICY_ENV] } : {}),
    ...(resolved.env[STEERING_GATE_ENV] ? { [STEERING_GATE_ENV]: resolved.env[STEERING_GATE_ENV] } : {}),
    ...(resolved.env[ORDERING_MODE_ENV] ? { [ORDERING_MODE_ENV]: resolved.env[ORDERING_MODE_ENV] } : {}),
    ...(resolved.env[ORDERING_POLICY_ENV] ? { [ORDERING_POLICY_ENV]: resolved.env[ORDERING_POLICY_ENV] } : {}),
    ORCH_TOOLPACK_ROOT: sandboxToolpackRoot,
    ORCH_TOOL_ROOT: sandboxToolRoot,
    ORCH_TOOL_API_ROOT: `${sandboxToolRoot}/api`,
    ORCH_TOOL_IMPL_ROOT: `${sandboxToolpackRoot}/_impl/gamecube`,
    ORCH_GAME_REPO_ROOT: resolved.gameRepoRoot,
    ORCH_TOOL_SHARED_DATA_ROOT: `/opt/tool-data/${resolved.toolId}`,
    ORCH_TOOL_WORKTREE_CACHE_ROOT: sandboxToolCacheRoot(resolved.toolId),
    MWCC_WIBO: `${resolved.gameRepoRoot}/build/tools/wibo`,
    WINEDEBUG: "-all",
  };
  const result: SandboxExecResult = await sandboxHandle.exec(command, {
    cwd: resolved.gameRepoRoot,
    env,
    timeoutMs: workspaceToolTimeoutMs(args, params.timeoutScale),
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
