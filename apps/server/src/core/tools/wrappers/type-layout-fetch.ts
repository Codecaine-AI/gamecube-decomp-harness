import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, posix, resolve } from "node:path";
import type { SandboxHandle } from "@server/core/job-queue/sandbox.js";

const CONTEXT_PATH = "build/ctx.c";
const CONTEXT_SCRIPT = "tools/m2ctx/m2ctx.py";
const CONTEXT_CHECK_TIMEOUT_MS = 10_000;
const BUILD_TIMEOUT_MS = 120_000;
const MODES = new Set(["dups", "near", "unions", "casts", "summary"]);

export interface SandboxTypeLayoutIndexFallbackInput {
  sandboxHandle: SandboxHandle;
  workspaceRoot: string;
  gameId: string;
  worktreeCacheRoot: string;
  args: string[];
  runHostApi(args: string[]): Promise<Record<string, unknown>>;
  runHostRunner(args: string[]): Promise<Record<string, unknown>>;
  tempParent?: string;
}

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

/** Build a sandbox claim's type-layout cache only after the host shared index reports it is absent. */
export async function runSandboxTypeLayoutIndexFallback(
  input: SandboxTypeLayoutIndexFallbackInput,
): Promise<Record<string, unknown>> {
  const argumentError = validateApiArgs(input.args);
  if (argumentError) return argumentError;

  const initial = await input.runHostApi(input.args);
  if (payloadStatus(initial) !== "index_not_built") return initial;

  const cacheIndex = resolve(input.worktreeCacheRoot, "indexes/type_layout_index.json");
  const cacheArgs = withIndexRoot(input.args, input.worktreeCacheRoot);
  if (existsSync(cacheIndex)) {
    const cached = await input.runHostApi(cacheArgs);
    if (payloadStatus(cached) !== "index_not_built") return cached;
  }

  let mirrorRoot: string | undefined;
  try {
    const contextCheck = await input.sandboxHandle.exec(
      ["test", "-f", CONTEXT_PATH],
      { cwd: input.workspaceRoot, timeoutMs: CONTEXT_CHECK_TIMEOUT_MS },
    );
    if (contextCheck.exitCode !== 0 && contextCheck.exitCode !== 1) {
      return buildFailure(
        "context_check",
        contextCheck.stderr.trim() || `sandbox context check exited ${contextCheck.exitCode}`,
      );
    }
    if (contextCheck.exitCode === 1) {
      const generated = await input.sandboxHandle.exec(
        ["python3", CONTEXT_SCRIPT, "--quiet", "--preprocessor"],
        { cwd: input.workspaceRoot, timeoutMs: BUILD_TIMEOUT_MS },
      );
      if (generated.exitCode !== 0) {
        return buildFailure(
          "context_generation",
          generated.stderr.trim() || `sandbox m2ctx exited ${generated.exitCode}`,
        );
      }
    }

    mirrorRoot = await mkdtemp(join(input.tempParent ?? tmpdir(), "orch-type-layout-"));
    const mirrorContext = resolve(mirrorRoot, CONTEXT_PATH);
    await mkdir(dirname(mirrorContext), { recursive: true });
    await input.sandboxHandle.downloadFile(posix.resolve(input.workspaceRoot, CONTEXT_PATH), mirrorContext);

    const runnerArgs = [
      "--ctx",
      mirrorContext,
      "--skip-casts",
      "--project",
      input.gameId,
      "--out",
      input.worktreeCacheRoot,
    ];
    const built = await input.runHostRunner(runnerArgs);
    if (runnerFailed(built)) {
      const parsed = parsedPayload(built);
      return buildFailure(
        "host_runner",
        String(built.error_summary ?? parsed?.error ?? parsed?.message ?? "type-layout index runner failed"),
        { runner_result: built },
      );
    }

    return await input.runHostApi(cacheArgs);
  } catch (error) {
    return buildFailure(
      "sandbox_fetch",
      error instanceof Error ? error.message : String(error),
    );
  } finally {
    if (mirrorRoot) await rm(mirrorRoot, { recursive: true, force: true });
  }
}
