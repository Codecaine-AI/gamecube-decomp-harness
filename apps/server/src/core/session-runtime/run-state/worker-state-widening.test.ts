import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openState, writeSetHash, type StateStore } from "@server/core/orchestrator-state";
import type { TargetCandidate } from "@server/core/shared/types/index.js";
import { admitEpochTargets, startSchedulerEpoch } from "./epochs.js";
import { createRun } from "./runs.js";
import {
  activeClaimsForSession,
  claimNextEpochTarget,
  closeWorkerState,
  normalizeWriteSetEntries,
  recordWorkerCheckpoint,
  widenClaimWriteSet,
  workerCheckpointsForWorkerState,
} from "./worker-state.js";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function tempState(): { dir: string; store: StateStore } {
  const dir = mkdtempSync(join(tmpdir(), "worker-write-set-widening-"));
  tempDirs.push(dir);
  return { dir, store: openState(dir) };
}

function setupClaim(store: StateStore) {
  const candidate: TargetCandidate = {
    unit: "unit_a",
    symbol: "target_fn",
    sourcePath: "src/melee/ft/target.c",
    size: 64,
    fuzzy: 90,
    priority: 100,
    reason: "test target",
  };
  const run = createRun(store, "matched_code_percent", 100, 1);
  const epoch = startSchedulerEpoch(store, run.id, {
    size: { mode: "fixed", value: 1 },
    workerPoolSize: 1,
    candidateWindow: 1,
  });
  admitEpochTargets(store, {
    epochId: epoch.id,
    runId: run.id,
    candidates: [candidate],
    size: { mode: "fixed", value: 1 },
    workerPoolSize: 1,
  });
  const claim = claimNextEpochTarget({ store, sessionId: run.id, workerId: "worker-1", baseRev: "base", ttlSeconds: 1_800 });
  if (!claim) throw new Error("expected test claim");
  return { run, epoch, claim };
}

describe("write-set-aware worker state", () => {
  test("normalizes legacy flat write sets as target-source entries", () => {
    expect(normalizeWriteSetEntries("[]", '["src/a.c","src/b.c"]')).toEqual([
      { path: "src/a.c", category: "target-source", rung: 1, addedBy: "claim" },
      { path: "src/b.c", category: "target-source", rung: 1, addedBy: "claim" },
    ]);
  });

  test("creates typed claim entries and widens both claim and worker state atomically", () => {
    const { store } = tempState();
    try {
      const { run, claim } = setupClaim(store);
      expect(claim.writeSetEntries).toEqual([
        { path: "src/melee/ft/target.c", category: "target-source", rung: 1, addedBy: "claim" },
      ]);

      const widened = widenClaimWriteSet(store, claim.claimId, [
        {
          path: "src/melee/ft/target.h",
          category: "owning-header",
          rung: 3,
          addedBy: "widening",
          wideningId: "widening-1",
        },
      ]);
      expect(widened.writeSet).toEqual(["src/melee/ft/target.c", "src/melee/ft/target.h"]);
      expect(activeClaimsForSession(store, run.id)[0]?.writeSetEntries).toEqual(widened.entries);

      const claimRow = store.db
        .query("SELECT write_set_json, write_set_hash, write_set_entries_json FROM target_claims WHERE id = ?")
        .get(claim.claimId) as Record<string, unknown>;
      const workerRow = store.db
        .query("SELECT write_set_json, write_set_entries_json FROM worker_state WHERE id = ?")
        .get(claim.workerStateId) as Record<string, unknown>;
      expect(JSON.parse(String(claimRow.write_set_json))).toEqual(widened.writeSet);
      expect(claimRow.write_set_hash).toBe(writeSetHash(widened.writeSet));
      expect(JSON.parse(String(claimRow.write_set_entries_json))).toEqual(widened.entries);
      expect(JSON.parse(String(workerRow.write_set_json))).toEqual(widened.writeSet);
      expect(JSON.parse(String(workerRow.write_set_entries_json))).toEqual(widened.entries);
    } finally {
      store.db.close();
    }
  });

  test("recycling resets widened paths while preserving widening history", () => {
    const { store } = tempState();
    try {
      const { run, claim } = setupClaim(store);
      widenClaimWriteSet(store, claim.claimId, [
        { path: "config/GALE01/symbols.txt", category: "config-metadata", rung: 2, addedBy: "widening", wideningId: "widening-1" },
      ]);
      store.db
        .query(
          `
            INSERT INTO write_set_widenings (
              id, session_id, epoch_id, target_claim_id, worker_state_id,
              attempt_index, category, rung, requested_paths_json,
              approved_paths_json, evidence_json, status, created_at
            ) VALUES (?, ?, ?, ?, ?, 0, 'config-metadata', 2, '[]', '[]', '{}', 'approved', ?)
          `,
        )
        .run("widening-1", run.id, claim.epochId, claim.claimId, claim.workerStateId, new Date().toISOString());

      closeWorkerState(store, { workerStateId: claim.workerStateId, lifecycleStatus: "error", epochTargetStatus: "admitted" });
      const recycled = claimNextEpochTarget({
        store,
        sessionId: run.id,
        workerId: "worker-2",
        baseRev: "next-base",
        ttlSeconds: 1_800,
      });

      expect(recycled?.claimId).toBe(claim.claimId);
      expect(recycled?.writeSet).toEqual(["src/melee/ft/target.c"]);
      expect(recycled?.writeSetEntries).toEqual([
        { path: "src/melee/ft/target.c", category: "target-source", rung: 1, addedBy: "claim" },
      ]);
      const rows = store.db
        .query("SELECT write_set_json, write_set_entries_json FROM target_claims WHERE id = ?")
        .get(claim.claimId) as Record<string, unknown>;
      expect(JSON.parse(String(rows.write_set_json))).toEqual(["src/melee/ft/target.c"]);
      expect(JSON.parse(String(rows.write_set_entries_json))).toEqual(recycled?.writeSetEntries);
      expect(
        Number(
          (store.db.query("SELECT COUNT(*) AS count FROM write_set_widenings WHERE id = ?").get("widening-1") as Record<string, unknown>).count,
        ),
      ).toBe(1);
    } finally {
      store.db.close();
    }
  });

  test("persists the capture-time write set and validation state on checkpoints", () => {
    const { store } = tempState();
    try {
      const { run, claim } = setupClaim(store);
      const writeSet = ["src/melee/ft/target.c", "config/GALE01/symbols.txt"];
      recordWorkerCheckpoint(store, {
        workerStateId: claim.workerStateId,
        sessionId: run.id,
        epochId: claim.epochId,
        epochTargetId: claim.epochTargetId,
        targetClaimId: claim.claimId,
        attemptIndex: 0,
        oldScore: 90,
        newScore: 95,
        exactMatch: false,
        hardGatesPassed: true,
        validationStatus: "passed",
        writeSet,
      });
      expect(workerCheckpointsForWorkerState(store, claim.workerStateId)[0]).toMatchObject({
        writeSet,
        validationState: "tentative",
      });
    } finally {
      store.db.close();
    }
  });
});
