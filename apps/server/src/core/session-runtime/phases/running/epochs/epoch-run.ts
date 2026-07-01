import { resolve } from "node:path";
import { runEpochCycle } from "@server/core/session-runtime/phases/running/epochs";
import { getLatestRun, openState } from "@server/core/session-runtime/run-state";
import { booleanArg, numberArg, stringArg, type GlobalArgs } from "@server/core/project-registry/runtime-options.js";
import { publishSessionDraftPr } from "./session-draft-pr.js";

/**
 * Run one epoch checkpoint cycle by hand: commit validated work (excluding
 * in-flight worker files), rebuild the full report in the epoch worktree,
 * record the progress save point, and readmit regression repairs. The same
 * pipeline the run loop runs automatically at scheduler epoch boundaries.
 */
export async function epochRun(globals: GlobalArgs, args: Map<string, string | true>): Promise<void> {
  const store = openState(globals.stateDir);
  try {
    const runId = stringArg(args, "--run-id", getLatestRun(store)?.id ?? "");
    if (!runId) throw new Error("No run found. Run init-run first.");
    const result = await runEpochCycle(store, runId, globals.repoRoot, globals.stateDir, {
      baseRef: globals.project?.baseRef,
      configureCommand: stringArg(args, "--configure-command", "python3 configure.py --require-protos"),
      label: stringArg(args, "--label", "") || null,
      linkPaths: stringArg(args, "--link-paths", "orig")
        .split(",")
        .map((path) => path.trim())
        .filter(Boolean),
      projectId: globals.project?.projectId ?? globals.projectId ?? null,
      regressionPauseThreshold: Math.max(0, Math.floor(numberArg(args, "--regression-pause-threshold", 12))),
      regressionRequeueLimit: Math.max(0, Math.floor(numberArg(args, "--regression-requeue-limit", 32))),
      reportRelPath: globals.project?.validation.reportPath,
      reportChangesRelPath: globals.project?.validation.reportChangesPath,
      requeueRegressions: !booleanArg(args, "--no-requeue"),
      worktreeDir: stringArg(args, "--worktree", resolve(globals.stateDir, "epoch_worktree")),
    });
    const publish = booleanArg(args, "--no-session-draft-pr")
      ? null
      : await publishSessionDraftPr({
          baseRef: globals.project?.baseRef,
          commitSha: result.commitSha,
          epochLabel: result.label,
          matchedCodePercent: result.matchedCodePercent,
          projectId: globals.project?.projectId ?? globals.projectId ?? null,
          qaGate: result.qaGate as unknown as Record<string, unknown> | null,
          regressions: result.regressions as unknown as Record<string, unknown>,
          repoRoot: globals.repoRoot,
          runId,
          savePointId: result.savePointId,
          stateDir: globals.stateDir,
          store,
        });
    console.log(JSON.stringify({ ...result, sessionDraftPr: publish }, null, 2));
  } finally {
    store.db.close();
  }
}
