import { randomUUID } from "node:crypto";
import type { SandboxHandle } from "@server/core/job-queue/sandbox.js";
import { SANDBOX_QA_STAMP_PATH } from "@server/core/job-queue/provisioning.js";
import { packageRoot } from "@server/core/knowledge/paths.js";
import { sandboxQaScanPlan } from "@server/core/validation/qa/sandbox-scan.js";
import type { ResolvedRegisteredTool } from "../resolver.js";
import { runWorkspaceToolApi, sandboxPrerequisiteMissing, sandboxProbe, sandboxToolCacheRoot } from "./workspace-tool-exec.js";

/** A `--text` snippet larger than this travels as a sandbox file (Linux caps one argv string at 128 KiB). */
export const REVIEW_LINT_TEXT_ARG_MAX_BYTES = 96 * 1024;

/**
 * review_lint `scan.py` in the worker sandbox: file calls read the claim's
 * sandbox checkout, text calls pass the snippet as an argument (or, when
 * large, as a file written into the sandbox). The standards env is the QA
 * lint's sandbox mapping (`sandboxQaScanPlan`) over the QA assets provisioning
 * synced under SANDBOX_QA_ROOT; without their stamp the tool answers
 * `sandbox_prerequisite_missing` and never runs on the host.
 */
export async function runSandboxReviewLintScan(params: {
  sandboxHandle: SandboxHandle;
  resolved: ResolvedRegisteredTool;
  resolvedTool: Record<string, unknown>;
  args: string[];
  timeoutScale?: number;
}): Promise<Record<string, unknown>> {
  const { sandboxHandle, resolved, resolvedTool } = params;
  const stamp = await sandboxProbe(sandboxHandle, ["test", "-f", SANDBOX_QA_STAMP_PATH]);
  if (stamp.exitCode !== 0) return sandboxPrerequisiteMissing(resolved.toolId, `QA assets (${SANDBOX_QA_STAMP_PATH})`, resolvedTool);

  const args = [...params.args];
  const textIndex = args.indexOf("--text");
  if (textIndex >= 0 && Buffer.byteLength(args[textIndex + 1] ?? "", "utf8") > REVIEW_LINT_TEXT_ARG_MAX_BYTES) {
    const path = `${sandboxToolCacheRoot(resolved.toolId)}/scan-input-${randomUUID()}.c`;
    await sandboxHandle.exec(["mkdir", "-p", sandboxToolCacheRoot(resolved.toolId)], { timeoutMs: 30_000 });
    await sandboxHandle.writeFile(path, args[textIndex + 1] ?? "");
    args.splice(textIndex, 2, "--file", path);
  }
  const { env } = sandboxQaScanPlan({
    resolved,
    orchestratorRoot: packageRoot(),
    repoRoot: resolved.gameRepoRoot,
    hostRepoRoot: resolved.gameHostRepoRoot,
  });
  return runWorkspaceToolApi({
    sandboxHandle,
    resolved,
    resolvedTool,
    scriptName: "scan.py",
    args,
    timeoutScale: params.timeoutScale,
    env,
  });
}
