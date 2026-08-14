import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import {
  beginDrain,
  DispatchLeaseNotActiveError,
  initializeProjectState,
  requestDispatch,
  StaleLeaseError,
} from "@server/core/project-state";
import { createProjectSession } from "@server/core/project-session";
import { recordSavePointAnchor } from "@server/core/project-session/timeline.js";
import { openPrCampaign } from "@server/core/session-runtime/phases/pr/campaign";
import { addSavePoint, ensureCampaign } from "@server/core/session-runtime/phases/pr/state";
import { admitEpochTargets, claimNextEpochTarget, closeWorkerState, createRun, openState, startSchedulerEpoch } from "./index.js";

describe("worker claim dispatch fencing", () => {
  test("rejects a stale lease before creating a target claim", () => {
    const stateDir = mkdtempSync(join(tmpdir(), "worker-state-lease-"));
    const store = openState(stateDir);
    try {
      const run = createRun(store, "matched_code_percent", 100, 1, { projectId: "melee", stateDir }, { baseRevision: "base-test" });
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
      initializeProjectState(store, { projectId: "melee", traceId: "trace-project-melee" });
      const dispatch = requestDispatch(store, {
        kind: "run",
        workflowId: run.id,
        reason: "test worker fencing",
        commandId: "command-run-start",
        correlationId: run.id,
        actor: "operator",
        projectId: "melee",
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
    } finally {
      store.db.close();
    }
  });

  test("refuses new claims while the current holder drains but allows an existing claim to settle", () => {
    const stateDir = mkdtempSync(join(tmpdir(), "worker-state-draining-lease-"));
    const store = openState(stateDir);
    try {
      const run = createRun(store, "matched_code_percent", 100, 2, { projectId: "melee", stateDir }, { baseRevision: "base-test" });
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
      initializeProjectState(store, { projectId: "melee", traceId: "trace-project-melee" });
      const dispatch = requestDispatch(store, {
        kind: "run",
        workflowId: run.id,
        reason: "test draining worker fencing",
        commandId: "command-run-start",
        correlationId: run.id,
        actor: "operator",
        projectId: "melee",
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

      createProjectSession(store.db, {
        actor: "operator",
        baseSha: "base-test",
        id: "project-session:session-pr",
        projectId: "melee",
        sessionUuid: "session-pr",
      });
      const legacyCampaign = ensureCampaign(store, { projectId: "melee" });
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
        correlationId: "session-pr",
        commitSha: "base-test",
        projectId: "melee",
        savePointId: savePoint.id,
        triggerKind: "manual",
      });
      const campaign = openPrCampaign(store, {
        actor: "operator",
        campaignId: "campaign-worker-drain",
        commandId: "command-open-pr",
        correlationId: "campaign-worker-drain",
        namedSavePointId: savePoint.id,
        projectId: "melee",
        series: [{ batchIndex: 0, branch: "codex/test-pr", seriesId: "series-worker-drain", targetUnits: ["src/a.c"] }],
        sessionUuid: "session-pr",
      });

      const queuedPr = requestDispatch(store, {
        kind: "pr",
        workflowId: campaign.campaign_id,
        reason: "operator requested PR handoff",
        commandId: "command-pr-activate",
        correlationId: campaign.campaign_id,
        actor: "operator",
        projectId: "melee",
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
        projectId: "melee",
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
    } finally {
      store.db.close();
    }
  });
});
