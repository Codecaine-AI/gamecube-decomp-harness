import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { initializeDispatchState, requestDispatch } from "@server/core/harness-state";
import {
  blockingWorkerOutputIntegrationCount,
  createRun,
  getWorkerOutputIntegration,
  openState,
  type StateStore,
  type WorkerOutputIntegrationStatus,
} from "@server/core/harness-runtime/run-state";
import { seedRunHarness } from "../../../run-state/test-harness.js";
import { resolveWorkerOutputIntegration } from "./resolve-integration.js";

const tempDirs: string[] = [];

interface Fixture {
  checkpointId: string;
  dir: string;
  outcomeId: string;
  runId: string;
  store: StateStore;
}

function fixture(status: WorkerOutputIntegrationStatus = "conflict"): Fixture {
  const dir = mkdtempSync(join(tmpdir(), "resolve-integration-state-"));
  tempDirs.push(dir);
  const store = openState(dir);
  seedRunHarness(store, "test", "base-test", dir);
  const run = createRun(store, "matched_code_percent", 100, 1, { gameId: "test" }, { baseRevision: "base-test" });
  const checkpointId = "checkpoint-1";
  const outcomeId = "outcome-1";
  const at = "2026-09-15T12:00:00.000Z";
  store.db.query(`
    INSERT INTO worker_checkpoints (
      id, worker_state_id, run_id, epoch_id, epoch_target_id, target_claim_id,
      attempt_index, validation_time, hard_gates_passed, validation_status,
      write_set_json, failure_reasons_json, metadata_json, selected
    ) VALUES (?, 'worker-state-1', ?, 'epoch-1', 'epoch-target-1', 'claim-1',
      0, ?, 1, 'passed', '["src/a.c"]', '[]', '{}', 1)
  `).run(checkpointId, run.id, at);
  store.db.query(`
    INSERT INTO integration_outcomes (
      id, run_id, epoch_id, epoch_target_id, target_claim_id, worker_state_id,
      worker_checkpoint_id, status, disposition, target_key, write_set_json,
      conflict_paths_json, failure_reasons_json, metadata_json, created_at, updated_at
    ) VALUES (?, ?, 'epoch-1', 'epoch-target-1', 'claim-1', 'worker-state-1',
      ?, ?, 'checkpoint_write_set_mismatch', 'unit::symbol', '["src/a.c"]',
      '["include/a.h"]', '["filtered patch would drop include/a.h"]',
      '{"existing":"value"}', ?, ?)
  `).run(outcomeId, run.id, checkpointId, status, at, at);
  return { checkpointId, dir, outcomeId, runId: run.id, store };
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("resolveWorkerOutputIntegration", () => {
  test("rejects a blocking outcome and records the operator decision", () => {
    const value = fixture();
    try {
      expect(blockingWorkerOutputIntegrationCount(value.store, value.runId)).toBe(1);

      const result = resolveWorkerOutputIntegration({
        choice: "reject",
        hasActiveLeaseProcess: () => ({ active: false }),
        outcomeId: value.outcomeId,
        reason: "validated patch includes an unapproved header",
        runId: value.runId,
        stateDir: value.dir,
        store: value.store,
      });

      expect(result).toMatchObject({
        choice: "reject",
        checkpoint_id: value.checkpointId,
        checkpoint_selected: false,
        disposition: "operator_rejected",
        outcome_id: value.outcomeId,
        previous_status: "conflict",
        status: "rejected",
        target_remains_open: true,
      });
      expect(blockingWorkerOutputIntegrationCount(value.store, value.runId)).toBe(0);
      expect(getWorkerOutputIntegration(value.store, value.outcomeId)).toMatchObject({
        disposition: "operator_rejected",
        metadata: {
          existing: "value",
          previous_status: "conflict",
          reason: "validated patch includes an unapproved header",
          rejected_by: "operator",
        },
        resolvedAt: expect.any(String),
        status: "rejected",
      });
      expect(value.store.db.query("SELECT selected FROM worker_checkpoints WHERE id = ?").get(value.checkpointId)).toEqual({ selected: 0 });

      const event = value.store.db
        .query("SELECT event_type, producer, payload_json FROM events WHERE run_id = ? AND event_type = 'worker_integration_rejected'")
        .get(value.runId) as { event_type: string; producer: string; payload_json: string };
      expect(event.event_type).toBe("worker_integration_rejected");
      expect(event.producer).toBe("operator");
      expect(JSON.parse(event.payload_json)).toEqual({
        checkpoint_id: value.checkpointId,
        outcome_id: value.outcomeId,
        reason: "validated patch includes an unapproved header",
        target_key: "unit::symbol",
      });
    } finally {
      value.store.db.close();
    }
  });

  test("refuses a nonblocking outcome", () => {
    const value = fixture("applied");
    try {
      expect(() => resolveWorkerOutputIntegration({
        choice: "reject",
        hasActiveLeaseProcess: () => ({ active: false }),
        outcomeId: value.outcomeId,
        reason: "operator reconsidered the result",
        runId: value.runId,
        stateDir: value.dir,
        store: value.store,
      })).toThrow(`Worker output integration ${value.outcomeId} is applied; only blocking outcomes can be rejected`);
      expect(getWorkerOutputIntegration(value.store, value.outcomeId)?.status).toBe("applied");
      expect(value.store.db.query("SELECT selected FROM worker_checkpoints WHERE id = ?").get(value.checkpointId)).toEqual({ selected: 1 });
    } finally {
      value.store.db.close();
    }
  });

  test("refuses while the run lease belongs to a live scheduler", () => {
    const value = fixture();
    try {
      initializeDispatchState(value.store, { gameId: "test", traceId: "trace-test" });
      const decision = requestDispatch(value.store, {
        actor: "runner",
        commandId: "command-run-live",
        correlationId: value.runId,
        gameId: "test",
        kind: "run",
        reason: "live scheduler",
        workflowId: value.runId,
      });
      if (decision.queued) throw new Error("expected active run lease");

      expect(() => resolveWorkerOutputIntegration({
        choice: "reject",
        hasActiveLeaseProcess: (_stateDir, leaseId) => ({ active: leaseId === decision.leaseId }),
        outcomeId: value.outcomeId,
        reason: "operator rejected the integration",
        runId: value.runId,
        stateDir: value.dir,
        store: value.store,
      })).toThrow(`Dispatch lease ${decision.leaseId} still has a live scheduler process; integration resolution refused`);
      expect(blockingWorkerOutputIntegrationCount(value.store, value.runId)).toBe(1);
      expect(getWorkerOutputIntegration(value.store, value.outcomeId)?.status).toBe("conflict");
      expect(value.store.db.query("SELECT selected FROM worker_checkpoints WHERE id = ?").get(value.checkpointId)).toEqual({ selected: 1 });
    } finally {
      value.store.db.close();
    }
  });
});
