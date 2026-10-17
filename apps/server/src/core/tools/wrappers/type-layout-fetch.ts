import { createHash } from "node:crypto";
import { posix } from "node:path";
import type { SandboxHandle } from "@server/core/job-queue/sandbox.js";
import type { ResolvedRegisteredTool } from "../resolver.js";
import { contextGenerationCommand, resolveSandboxProjectLayout } from "./sandbox-project-layout.js";
import { scaleTimeout } from "../timeout-scale.js";
import { runWorkspaceToolApi, sandboxPrerequisiteMissing, sandboxProbe, sandboxToolCacheRoot } from "./workspace-tool-exec.js";

const CONTEXT_PATH = "build/ctx.c";
const CONTEXT_CHECK_TIMEOUT_MS = 10_000;
const BUILD_TIMEOUT_MS = 120_000;
const MAX_BUILD_TIMEOUT_MS = 1_800_000;
const MODES = new Set(["dups", "near", "unions", "casts", "summary"]);

export interface SandboxTypeLayoutLookupInput {
  sandboxHandle: SandboxHandle;
  resolved: ResolvedRegisteredTool;
  resolvedTool: Record<string, unknown>;
  args: string[];
  /** Sandbox profile multiplier for the CPU-bound context build. */
  timeoutScale?: number;
  /** The claim target's checkout-relative source (worker packet `target.source_path`); scopes a per-source index. */
  targetSourcePath?: string | null;
}

/** A checkout-relative, non-escaping source path, or null (the packet renders a missing one as "undefined"). */
function scopedSourcePath(value: string | null | undefined): string | null {
  if (!value || value === "undefined" || value === "null") return null;
  const parts = value.split("/");
  if (posix.isAbsolute(value) || value.includes("\\") || value.includes("\0") || parts.some((part) => !part || part === "." || part === "..")) return null;
  return value;
}

/** Cache directory of a source-scoped index: one per (source path, checkout HEAD), so targets never collide. */
export function scopedTypeLayoutCacheRoot(cacheRoot: string, sourcePath: string, head: string): string {
  return `${cacheRoot}/scoped/${createHash("sha256").update(`${sourcePath}\0${head}`).digest("hex").slice(0, 16)}`;
}

/**
 * The clang the index runner shells out to (`-fdump-record-layouts-complete`):
 * the image's pinned oracle clang, else any clang on PATH; printed on stdout.
 */
const CLANG_PROBE = [
  "bash",
  "-lc",
  'for c in "${ORCH_IR_ORACLE_CLANG:-}" "$(command -v clang-21)" "$(command -v clang-18)" "$(command -v clang)"; do if [ -n "$c" ] && [ -x "$c" ]; then printf "%s" "$c"; exit 0; fi; done; exit 1',
];
function rejectedArguments(summary: string): Record<string, unknown> {
  return {
    status: "rejected_arguments",
    operation: "tool:type_layout_lookup:layout_lookup.py",
    tool_error: true,
    error_kind: "sandbox_fetch_contract_rejected",
    error_summary: summary,
  };
}

function pathBearing(value: string): boolean {
  return value.includes("/") || value.includes("\\") || value.includes("\0") || value.startsWith("~");
}

function validateApiArgs(args: string[]): Record<string, unknown> | null {
  const seen = new Set<string>();
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--json" || arg === "--prefix") {
      if (seen.has(arg)) return rejectedArguments(`duplicate ${arg}`);
      seen.add(arg);
      continue;
    }
    if (["--record", "--mode", "--at", "--limit"].includes(arg)) {
      if (seen.has(arg)) return rejectedArguments(`duplicate ${arg}`);
      seen.add(arg);
      const value = args[index + 1];
      if (value === undefined) return rejectedArguments(`${arg} requires a value`);
      index += 1;
      if (arg === "--record" && (!value.trim() || pathBearing(value))) {
        return rejectedArguments("type_layout_lookup record must be a non-path record name");
      }
      if (arg === "--mode" && !MODES.has(value)) {
        return rejectedArguments(`type_layout_lookup received an invalid mode: ${value}`);
      }
      if (arg === "--at" && !/^(?:0[xX][0-9A-Fa-f]+|\d+)$/.test(value)) {
        return rejectedArguments("type_layout_lookup --at must be a hex or decimal byte offset");
      }
      if (arg === "--limit" && (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > 100)) {
        return rejectedArguments("type_layout_lookup --limit must be between 1 and 100");
      }
      continue;
    }
    return rejectedArguments(`type_layout_lookup sandbox shim received unrecognized API argument: ${arg}`);
  }
  return null;
}

function parsedPayload(payload: Record<string, unknown>): Record<string, unknown> | null {
  const parsed = payload.parsed;
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
  return payload;
}

function payloadStatus(payload: Record<string, unknown>): string {
  return String(parsedPayload(payload)?.status ?? "");
}

function withIndexRoot(args: string[], indexRoot: string): string[] {
  const next = [...args];
  const jsonIndex = next.lastIndexOf("--json");
  next.splice(jsonIndex >= 0 ? jsonIndex : next.length, 0, "--index-root", indexRoot);
  return next;
}

function buildFailure(stage: string, summary: string, details: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    status: "type_index_build_failed",
    stage,
    guidance: "The sandbox type-layout cache could not be built. Do not retry unchanged; inspect the reported ctx, clang, or runner error and continue with local type evidence.",
    error_summary: summary,
    ...details,
  };
}

function runnerFailed(payload: Record<string, unknown>): boolean {
  if (payload.tool_error === true) return true;
  if (typeof payload.exit_code === "number" && payload.exit_code !== 0) return true;
  const parsed = parsedPayload(payload);
  return parsed?.success === false || parsed?.status === "error";
}

/**
 * type_layout_lookup entirely in the worker sandbox: query the image's shared
 * index (`/opt/tool-data/type_layout_lookup`, ORCH_TOOL_SHARED_DATA_ROOT), then
 * the sandbox-local cache (`/tmp/tool-cache/type_layout_lookup`), and only when
 * both report `index_not_built` build one with `runners/build_type_index.py`
 * and the image's clang: project-wide from `build/ctx.c` for a project-wide
 * generator (Melee), or scoped to the claim target's source for a per-source
 * generator (SMS), cached under `scoped/<sha(source, HEAD)>`. Nothing is downloaded or run on the host; an image
 * without clang answers `sandbox_prerequisite_missing`.
 */
export async function runSandboxTypeLayoutLookup(input: SandboxTypeLayoutLookupInput): Promise<Record<string, unknown>> {
  const argumentError = validateApiArgs(input.args);
  if (argumentError) return { ...argumentError, resolved_tool: input.resolvedTool };
  const { sandboxHandle, resolved, resolvedTool } = input;
  const workspaceRoot = resolved.gameRepoRoot;
  const run = (scriptName: string, args: string[], scriptDir?: string) => runWorkspaceToolApi({
    sandboxHandle,
    resolved,
    resolvedTool,
    scriptName,
    args,
    timeoutScale: input.timeoutScale,
    ...(scriptDir ? { scriptDir } : {}),
  });

  const initial = await run("layout_lookup.py", input.args);
  if (payloadStatus(initial) !== "index_not_built") return initial;
  const cacheRoot = sandboxToolCacheRoot(resolved.toolId);
  const cacheArgs = withIndexRoot(input.args, cacheRoot);
  const cached = await run("layout_lookup.py", cacheArgs);
  if (payloadStatus(cached) !== "index_not_built") return cached;

  const withTool = (payload: Record<string, unknown>) => ({ ...payload, resolved_tool: { ...resolvedTool, execution_surface: "sandbox_workspace" } });
  try {
    const clang = await sandboxProbe(sandboxHandle, CLANG_PROBE);
    const clangPath = clang.stdout.trim();
    if (clang.exitCode !== 0 || !clangPath) return sandboxPrerequisiteMissing(resolved.toolId, "clang", resolvedTool);

    const layout = await resolveSandboxProjectLayout(sandboxHandle, workspaceRoot);
    const buildIndex = async (ctxPath: string, outRoot: string, queryArgs: string[], lang: "c" | "c++" = "c") => {
      const built = await run("build_type_index.py", [
        "--ctx",
        ctxPath,
        "--clang",
        clangPath,
        ...(lang === "c" ? [] : ["--lang", lang]),
        "--skip-casts",
        "--project",
        resolved.gameId,
        "--out",
        outRoot,
      ], "runners");
      if (runnerFailed(built)) {
        const parsed = parsedPayload(built);
        return withTool(buildFailure(
          "sandbox_runner",
          String(built.error_summary ?? parsed?.error ?? parsed?.message ?? "type-layout index runner failed"),
          { runner_result: built },
        ));
      }
      return run("layout_lookup.py", queryArgs);
    };
    const generateContext = async (command: string[]) => {
      const generated = await sandboxHandle.exec(
        command,
        { cwd: workspaceRoot, timeoutMs: scaleTimeout(BUILD_TIMEOUT_MS, input.timeoutScale ?? 1, MAX_BUILD_TIMEOUT_MS) },
      );
      return generated.exitCode === 0
        ? null
        : withTool(buildFailure("context_generation", generated.stderr.trim() || `sandbox context generator exited ${generated.exitCode}`));
    };

    if (layout.contextScript === "tools/decompctx.py") {
      // SMS's generator builds the context of one source file, so the index is
      // scoped to the claim target's source and cached per (source, HEAD).
      const sourcePath = scopedSourcePath(input.targetSourcePath);
      if (!sourcePath) {
        return withTool({
          status: "type_index_unavailable",
          stage: "scoped_source",
          guidance: "This game's context generator needs a source file, and no claim target source is known, so no type-layout index can be built here. Continue with local type evidence.",
          error_summary: "no target source_path for a source-scoped type-layout index",
        });
      }
      const head = await sandboxHandle.exec(["git", "rev-parse", "HEAD"], { cwd: workspaceRoot, timeoutMs: CONTEXT_CHECK_TIMEOUT_MS });
      if (head.exitCode !== 0 || !head.stdout.trim()) {
        return withTool(buildFailure("scoped_head", head.stderr.trim() || `git rev-parse HEAD exited ${head.exitCode}`));
      }
      const scopedRoot = scopedTypeLayoutCacheRoot(cacheRoot, sourcePath, head.stdout.trim());
      const scopedArgs = withIndexRoot(input.args, scopedRoot);
      const scopedCached = await run("layout_lookup.py", scopedArgs);
      if (payloadStatus(scopedCached) !== "index_not_built") return scopedCached;
      const scopedContext = `${scopedRoot}/ctx.c`;
      let contextCommand: string[];
      try {
        contextCommand = contextGenerationCommand(layout, sourcePath, scopedContext);
      } catch (error) {
        return withTool(buildFailure("context_generation", error instanceof Error ? error.message : String(error)));
      }
      const made = await sandboxHandle.exec(["mkdir", "-p", scopedRoot], { timeoutMs: CONTEXT_CHECK_TIMEOUT_MS });
      if (made.exitCode !== 0) return withTool(buildFailure("scoped_cache", made.stderr.trim() || `mkdir exited ${made.exitCode}`));
      const contextFailure = await generateContext(contextCommand);
      if (contextFailure) return contextFailure;
      // decompctx is SMS's C++ context generator: dump it as C++ with the MWCC prelude.
      return await buildIndex(scopedContext, scopedRoot, scopedArgs, "c++");
    }

    // Project-wide generators (Melee's m2ctx): one index for the checkout in the cache root.
    const contextCheck = await sandboxHandle.exec(["test", "-f", CONTEXT_PATH], { cwd: workspaceRoot, timeoutMs: CONTEXT_CHECK_TIMEOUT_MS });
    if (contextCheck.exitCode !== 0 && contextCheck.exitCode !== 1) {
      return withTool(buildFailure("context_check", contextCheck.stderr.trim() || `sandbox context check exited ${contextCheck.exitCode}`));
    }
    if (contextCheck.exitCode === 1) {
      let contextCommand: string[];
      try {
        contextCommand = contextGenerationCommand(layout, null);
      } catch (error) {
        return withTool(buildFailure("context_generation", error instanceof Error ? error.message : String(error)));
      }
      const contextFailure = await generateContext(contextCommand);
      if (contextFailure) return contextFailure;
    }
    return await buildIndex(posix.join(workspaceRoot, CONTEXT_PATH), cacheRoot, cacheArgs);
  } catch (error) {
    return withTool(buildFailure("sandbox_build", error instanceof Error ? error.message : String(error)));
  }
}
