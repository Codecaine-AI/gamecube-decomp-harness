import type { SandboxHandle } from "@server/core/job-queue/sandbox.js";
import type { ResolvedRegisteredTool } from "../resolver.js";
import { runWorkspaceToolApi, sandboxPrerequisiteMissing, sandboxProbe } from "./workspace-tool-exec.js";

export const ASM_WINDOW_SEARCH_TOOL_ID = "asm_window_search";
/** The prebuilt index `window_search.py` reads (`INDEX_FILES`), relative to the tool's shared data root. */
export const ASM_WINDOW_INDEX_FILES = [
  "indexes/functions.jsonl",
  "indexes/windows.meta.jsonl",
  "indexes/windows.vec.bin",
  "indexes/manifest.json",
] as const;
/** Sandbox data root (ORCH_TOOL_SHARED_DATA_ROOT under `runWorkspaceToolApi`); provisioning syncs the index here. */
export const SANDBOX_ASM_WINDOW_DATA_ROOT = `/opt/tool-data/${ASM_WINDOW_SEARCH_TOOL_ID}`;

/**
 * asm_window_search in the worker sandbox, against the index provisioning
 * synced (or the image baked) under SANDBOX_ASM_WINDOW_DATA_ROOT. Without
 * every non-empty index file it answers `sandbox_prerequisite_missing`;
 * queries are never scored on the host.
 */
export async function runSandboxAsmWindowSearch(params: {
  sandboxHandle: SandboxHandle;
  resolved: ResolvedRegisteredTool;
  resolvedTool: Record<string, unknown>;
  scriptName: string;
  args: string[];
  timeoutScale?: number;
}): Promise<Record<string, unknown>> {
  const probe = await sandboxProbe(params.sandboxHandle, [
    "test",
    ...ASM_WINDOW_INDEX_FILES.flatMap((file, index) => [...(index ? ["-a"] : []), "-s", `${SANDBOX_ASM_WINDOW_DATA_ROOT}/${file}`]),
  ]);
  if (probe.exitCode !== 0) {
    return sandboxPrerequisiteMissing(params.resolved.toolId, `the asm-window index (${SANDBOX_ASM_WINDOW_DATA_ROOT}/indexes)`, params.resolvedTool);
  }
  return runWorkspaceToolApi({
    sandboxHandle: params.sandboxHandle,
    resolved: params.resolved,
    resolvedTool: params.resolvedTool,
    scriptName: params.scriptName,
    args: params.args,
    timeoutScale: params.timeoutScale,
  });
}
