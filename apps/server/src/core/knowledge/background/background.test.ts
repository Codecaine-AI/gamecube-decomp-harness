import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openState, type StateStore } from "@server/core/orchestrator-state";
import {
  catchUpBackgroundKnowledge,
  claimBackgroundKnowledge,
  enqueueBackgroundKnowledgeForWorker,
  processBackgroundKnowledge,
  queryBackgroundKnowledgeSummary,
  triggerBackgroundKnowledgeProcess,
} from "./index.js";

const fixtures: Array<{ dir: string; store: StateStore }> = [];

function fixture(): { dir: string; store: StateStore } {
  const dir = mkdtempSync(join(tmpdir(), "background-knowledge-"));
  const store = openState(dir);
  fixtures.push({ dir, store });
  store.db.query(`INSERT INTO runs (id, goal_kind, goal_value, desired_workers, status, created_at, project_id, revision, trace_id)
    VALUES ('run-1', 'matched_percent', 100, 1, 'active', '2026-08-14T00:00:00.000Z', 'melee', 0, 'trace-run-1')`).run();
  return { dir, store };
}

function completedWorker(store: StateStore, id: string, endedAt = "2026-08-14T00:01:00.000Z"): void {
  store.db.query(`INSERT INTO worker_state (id, run_id, epoch_id, epoch_target_id, target_claim_id, worker_id,
    target_key, lifecycle_status, started_at, ended_at, summary_json)
    VALUES (?, 'run-1', 'epoch-1', 'target-1', ?, 'worker-1', 'unit::symbol', 'finished',
      '2026-08-14T00:00:00.000Z', ?, '{}')`).run(id, `claim-${id}`, endedAt);
}

afterEach(() => {
  for (const item of fixtures.splice(0)) {
    item.store.db.close();
    rmSync(item.dir, { recursive: true, force: true });
  }
});

describe("durable background knowledge queue", () => {
  test("enqueue is idempotent and catch-up discovers only missing completed workers", () => {
    const { store } = fixture();
    completedWorker(store, "worker-state-1");
    completedWorker(store, "worker-state-2", "2026-08-14T00:02:00.000Z");

    const first = enqueueBackgroundKnowledgeForWorker(store, "worker-state-1");
    const duplicate = enqueueBackgroundKnowledgeForWorker(store, "worker-state-1");
    expect(duplicate.jobId).toBe(first.jobId);
    expect(catchUpBackgroundKnowledge(store, "melee")).toBe(1);
    expect(catchUpBackgroundKnowledge(store, "melee")).toBe(0);
    expect(store.db.query("SELECT COUNT(*) count FROM background_knowledge_jobs").get()).toEqual({ count: 2 });
  });

  test("automatic and operator processing share fenced claim and summary state", async () => {
    const { store } = fixture();
    completedWorker(store, "worker-state-1");
    enqueueBackgroundKnowledgeForWorker(store, "worker-state-1");

    const claimed = claimBackgroundKnowledge(store, { at: "2026-08-14T00:02:00.000Z" });
    expect(claimed?.status).toBe("processing");
    expect(claimed?.attempts).toBe(1);
    expect(claimBackgroundKnowledge(store, { at: "2026-08-14T00:02:01.000Z" })).toBeNull();

    store.db.query("UPDATE background_knowledge_jobs SET lease_expires_at = '2026-08-14T00:01:00.000Z'").run();
    const result = await triggerBackgroundKnowledgeProcess(store, async (job) => ({
      digest: `sha256:${job.workerStateId}`,
      provenance: { worker_state_id: job.workerStateId, publication: "ledger" },
    }));
    expect(result.outcome).toBe("succeeded");
    expect(queryBackgroundKnowledgeSummary(store, "melee")).toMatchObject({ queued: 0, processing: 0, waiting: 0, failed: 0 });
  });

  test("processor failures persist error and retry backoff", async () => {
    const { store } = fixture();
    completedWorker(store, "worker-state-1");
    enqueueBackgroundKnowledgeForWorker(store, "worker-state-1");
    const result = await processBackgroundKnowledge(store, async () => { throw new Error("materializer unavailable"); });
    expect(result.outcome).toBe("failed");
    const summary = queryBackgroundKnowledgeSummary(store, "melee");
    expect(summary.waiting).toBe(1);
    expect(summary.retry?.attempts).toBe(1);
    expect(summary.recentFailures[0]?.error).toBe("materializer unavailable");
  });
});
