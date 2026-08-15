import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import {
  beginDrain,
  DispatchLeaseNotActiveError,
  initializeHarnessState,
  requestDispatch,
  StaleLeaseError,
} from "@server/core/harness-state";
import { createCycle } from "@server/core/cycle";
import { recordSavePointAnchor } from "@server/core/cycle/timeline.js";
import { openPrCampaign } from "@server/core/cycle-runtime/phases/pr/campaign";
import { addSavePoint, ensureCampaign } from "@server/core/cycle-runtime/phases/pr/state";
import { admitEpochTargets, claimNextEpochTarget, closeWorkerState, createRun, openState, startSchedulerEpoch } from "./index.js";

describe("worker claim dispatch fencing", () => {
  test("rejects a stale lease before creating a target claim", () => {
    const stateDir = mkdtempSync(join(tmpdir(), "worker-state-lease-"));
    const store = openState(stateDir);
    try {
      const run = createRun(store, "matched_code_percent", 100, 1, { gameId: "melee", stateDir }, { baseRevision: "base-test" });
      const epoch = startSchedulerEpoch(store, run.id, {
        size: { mode: "fixed", value: 1 },
        workerPoolSize: 1,
        candidateWindow: 1,
      });
      admitEpochTargets(store, {
        epochId: epoch.id,
        runId: run.id,
        candidates: [{ unit: "unit", symbol: "fn", sourcePath: "src/fn.c", size: 64, fuzzy: 90, priority: 1, reason: "test" }],
        size: { mode: "fixed", value: 1 },
        workerPoolSize: 1,
      });
      initializeHarnessState(store, { gameId: "melee", traceId: "trace-game-melee" });
      const dispatch = requestDispatch(store, {
        kind: "run",
        workflowId: run.id,
        reason: "test worker fencing",
        commandId: "command-run-start",
        correlationId: run.id,
        actor: "operator",
        gameId: "melee",
      });
      if (dispatch.queued) throw new Error("Expected the run dispatch lease to be acquired");

      expect(() =>
        claimNextEpochTarget({
          store,
          runId: run.id,
          workerId: "worker-stale",
          baseRev: "base",
          ttlSeconds: 1_800,
          leaseId: "lease-stale",
        }),
      ).toThrow(StaleLeaseError);
      expect(store.db.query("SELECT status FROM epoch_targets WHERE epoch_id = ?").get(epoch.id)).toEqual({ status: "admitted" });
      expect(store.db.query("SELECT COUNT(*) AS count FROM target_claims WHERE run_id = ?").get(run.id)).toEqual({ count: 0 });

      const claim = claimNextEpochTarget({
        store,
        runId: run.id,
        workerId: "worker-current",
        baseRev: "base",
        ttlSeconds: 1_800,
        leaseId: dispatch.leaseId,
      });
      expect(claim?.workerId).toBe("worker-current");
      if (!claim) throw new Error("Expected a current worker claim");

      store.db.exec("DROP TABLE background_knowledge_jobs");
      expect(() => closeWorkerState(store, {
        workerStateId: claim.workerStateId,
        lifecycleStatus: "finished",
      })).toThrow();
      expect(store.db.query("SELECT lifecycle_status, ended_at FROM worker_state WHERE id = ?").get(claim.workerStateId)).toEqual({
        lifecycle_status: "running",
        ended_at: null,
      });
      expect(store.db.query("SELECT status, closed_at FROM target_claims WHERE id = ?").get(claim.claimId)).toEqual({
        status: "active",
        closed_at: null,
      });
    } finally {
      store.db.close();
    }
  });

  test("refuses new claims while the current holder drains but allows an existing claim to settle", () => {
    const stateDir = mkdtempSync(join(tmpdir(), "worker-state-draining-lease-"));
    const store = openState(stateDir);
    try {
      const run = createRun(store, "matched_code_percent", 100, 2, { gameId: "melee", stateDir }, { baseRevision: "base-test" });
      const epoch = startSchedulerEpoch(store, run.id, {
        size: { mode: "fixed", value: 2 },
        workerPoolSize: 2,
        candidateWindow: 2,
      });
      admitEpochTargets(store, {
        epochId: epoch.id,
        runId: run.id,
        candidates: [
          { unit: "unit-a", symbol: "fn_a", sourcePath: "src/a.c", size: 64, fuzzy: 90, priority: 2, reason: "test" },
          { unit: "unit-b", symbol: "fn_b", sourcePath: "src/b.c", size: 64, fuzzy: 90, priority: 1, reason: "test" },
        ],
        size: { mode: "fixed", value: 2 },
        workerPoolSize: 2,
      });
      initializeHarnessState(store, { gameId: "melee", traceId: "trace-game-melee" });
      const dispatch = requestDispatch(store, {
        kind: "run",
        workflowId: run.id,
        reason: "test draining worker fencing",
        commandId: "command-run-start",
        correlationId: run.id,
        actor: "operator",
        gameId: "melee",
      });
      if (dispatch.queued) throw new Error("Expected the run dispatch lease to be acquired");

      const existingClaim = claimNextEpochTarget({
        store,
        runId: run.id,
        workerId: "worker-existing",
        baseRev: "base",
        ttlSeconds: 1_800,
        leaseId: dispatch.leaseId,
      });
      if (!existingClaim) throw new Error("Expected an existing claim before drain");

      createCycle(store.db, {
        actor: "operator",
        baseSha: "base-test",
        id: "cycle:cycle-pr",
        gameId: "melee",
        cycleUuid: "cycle-pr",
      });
      const legacyCampaign = ensureCampaign(store, { gameId: "melee" });
      const savePoint = addSavePoint(store, {
        campaignId: legacyCampaign.id,
        triggerKind: "manual",
        label: "stable PR handoff",
        commitSha: "base-test",
        committed: true,
      });
      recordSavePointAnchor(store, {
        actor: "operator",
        commandId: "command-anchor-pr",
        correlationId: "cycle-pr",
        commitSha: "base-test",
        gameId: "melee",
        savePointId: savePoint.id,
        triggerKind: "manual",
      });
      const campaign = openPrCampaign(store, {
        actor: "operator",
        campaignId: "campaign-worker-drain",
        commandId: "command-open-pr",
        correlationId: "campaign-worker-drain",
        namedSavePointId: savePoint.id,
        gameId: "melee",
        series: [{ batchIndex: 0, branch: "codex/test-pr", seriesId: "series-worker-drain", targetUnits: ["src/a.c"] }],
        cycleUuid: "cycle-pr",
      });

      const queuedPr = requestDispatch(store, {
        kind: "pr",
        workflowId: campaign.campaign_id,
        reason: "operator requested PR handoff",
        commandId: "command-pr-activate",
        correlationId: campaign.campaign_id,
        actor: "operator",
        gameId: "melee",
      });
      if (!queuedPr.queued) throw new Error("Expected PR dispatch to queue behind the run");
      beginDrain(store, {
        leaseId: dispatch.leaseId,
        targetKind: "pr",
        targetWorkflowId: campaign.campaign_id,
        reason: "handoff to PR",
        commandId: "command-run-drain",
        correlationId: run.id,
        actor: "operator",
        gameId: "melee",
      });

      expect(() =>
        claimNextEpochTarget({
          store,
          runId: run.id,
          workerId: "worker-new",
          baseRev: "base",
          ttlSeconds: 1_800,
          leaseId: dispatch.leaseId,
        }),
      ).toThrow(DispatchLeaseNotActiveError);
      expect(store.db.query("SELECT COUNT(*) AS count FROM target_claims WHERE run_id = ?").get(run.id)).toEqual({ count: 1 });

      expect(() =>
        closeWorkerState(store, {
          workerStateId: existingClaim.workerStateId,
          lifecycleStatus: "finished",
          epochTargetStatus: "finished",
          summary: { settled_while_draining: true },
        }),
      ).not.toThrow();
      expect(store.db.query("SELECT status FROM target_claims WHERE id = ?").get(existingClaim.claimId)).toEqual({ status: "closed" });
      expect(() => closeWorkerState(store, {
        workerStateId: existingClaim.workerStateId,
        lifecycleStatus: "finished",
        epochTargetStatus: "finished",
        summary: { replayed_close: true },
      })).not.toThrow();
      expect(store.db.query("SELECT COUNT(*) AS count FROM background_knowledge_jobs WHERE worker_state_id = ?").get(existingClaim.workerStateId)).toEqual({ count: 1 });
    } finally {
      store.db.close();
    }
  });
});
