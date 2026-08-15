import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { runEpochCycle } from "@server/core/cycle-runtime/phases/running/epochs";
import { getLatestRun, openState } from "@server/core/cycle-runtime/run-state";
import {
  reconcilePendingIntegrationAttempt,
  recordDeferredSavePointEvidenceDurably,
  recordEpochCompleted,
} from "@server/core/cycle";
import { booleanArg, numberArg, stringArg, type GlobalArgs } from "@server/core/game-registry/runtime-options.js";
import { publishCycleDraftPr } from "./cycle-draft-pr.js";
import { writeSetIntegrationFlags } from "@server/core/cycle-runtime/phases/running/integration/write-set-options.js";
import { newSpanId } from "@server/core/harness-state";

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
    const epochId = stringArg(args, "--epoch-id", "") || `manual-epoch-${randomUUID()}`;
    const leaseId = stringArg(args, "--lease-id", "").trim();
    if (!leaseId) throw new Error("epoch-run requires --lease-id");
    const retained = reconcilePendingIntegrationAttempt(store, { runId, epochId });
    if (retained.status === "completed") {
      console.log(JSON.stringify({ reconciled: true, ...retained.completed }, null, 2));
      return;
    }
    const writeSetFlags = writeSetIntegrationFlags(args);
    const result = await runEpochCycle(store, runId, globals.repoRoot, globals.stateDir, {
      baseRef: globals.game?.baseRef,
      confirmationPass: writeSetFlags.confirmationPass,
      configureCommand: stringArg(args, "--configure-command", "python3 configure.py --require-protos"),
      epochId,
      label: stringArg(args, "--label", "") || null,
      leaseId,
      linkPaths: stringArg(args, "--link-paths", "orig")
        .split(",")
        .map((path) => path.trim())
        .filter(Boolean),
      mergeOnFinish: writeSetFlags.mergeOnFinish,
      gameId: globals.game?.gameId ?? globals.gameId ?? null,
      regressionPauseThreshold: Math.max(0, Math.floor(numberArg(args, "--regression-pause-threshold", 12))),
      regressionRequeueLimit: Math.max(0, Math.floor(numberArg(args, "--regression-requeue-limit", 32))),
      reportRelPath: globals.game?.validation.reportPath,
      reportChangesRelPath: globals.game?.validation.reportChangesPath,
      requeueRegressions: !booleanArg(args, "--no-requeue"),
      worktreeDir: stringArg(args, "--worktree", resolve(globals.stateDir, "epoch_worktree")),
    });
    if (!result.commitSha) throw new Error("Manual epoch integration commit is missing");
    const gameId = globals.game?.gameId ?? globals.gameId;
    const actionCommandId = `command-epoch-integrated-${randomUUID()}`;
    const actionSpanId = newSpanId();
    const epochEntry = recordEpochCompleted(store, {
      gameId,
      epochId,
      runId,
      integrationCommit: result.commitSha,
      scoreDelta: result.scoreDelta,
      commandId: actionCommandId,
      correlationId: runId,
      spanId: actionSpanId,
      actor: "runner",
    });
    const evidenceContext = {
      gameId,
      actor: "runner" as const,
    };
    recordDeferredSavePointEvidenceDurably(store, result.savePointEvidence, {
      ...evidenceContext,
      causationId: epochEntry.caused_by_event_id ?? actionCommandId,
      commandId: actionCommandId,
      correlationId: epochEntry.cycle_uuid,
      cycleUuid: epochEntry.cycle_uuid,
      spanId: actionSpanId,
    });
    const publish = booleanArg(args, "--no-cycle-draft-pr")
      ? null
      : await publishCycleDraftPr({
          baseRef: globals.game?.baseRef,
          commitSha: result.commitSha,
          epochLabel: result.label,
          matchedCodePercent: result.matchedCodePercent,
          gameId: globals.game?.gameId ?? globals.gameId ?? null,
          qaGate: result.qaGate as unknown as Record<string, unknown> | null,
          regressions: result.regressions as unknown as Record<string, unknown>,
          repoRoot: globals.repoRoot,
          runId,
          savePointId: result.savePointId,
          stateDir: globals.stateDir,
          store,
        });
    console.log(JSON.stringify({ ...result, cycleDraftPr: publish }, null, 2));
  } finally {
    store.db.close();
  }
}
