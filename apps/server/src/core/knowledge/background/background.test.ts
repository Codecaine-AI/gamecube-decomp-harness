import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  claimNextJob,
  getJobByDedupeKey,
  requeueJob,
} from "@server/core/job-queue/kernel.js";
import { openState, type StateStore } from "@server/core/orchestrator-state";
import {
  catchUpBackgroundKnowledge,
  enqueueBackgroundKnowledgeForWorker,
  processBackgroundKnowledge,
  queryBackgroundKnowledgeSummary,
  startBackgroundKnowledgeProcessor,
  triggerBackgroundKnowledgeProcess,
} from "./index.js";

const fixtures: Array<{ dir: string; store: StateStore }> = [];

function fixture(): { dir: string; store: StateStore } {
  const dir = mkdtempSync(join(tmpdir(), "background-knowledge-"));
  const store = openState(dir);
  fixtures.push({ dir, store });
  store.db
    .query(
      `INSERT INTO runs (id, goal_kind, goal_value, desired_workers, status, created_at, game_id, revision, trace_id)
      VALUES ('run-1', 'matched_percent', 100, 1, 'active', '2026-08-14T00:00:00.000Z', 'melee', 0, 'trace-run-1')`,
    )
    .run();
  return { dir, store };
}

function completedWorker(
  store: StateStore,
  id: string,
  endedAt = "2026-08-14T00:01:00.000Z",
): void {
  store.db
    .query(
      `INSERT INTO worker_state (id, run_id, epoch_id, epoch_target_id, target_claim_id, worker_id,
        target_key, lifecycle_status, started_at, ended_at, summary_json)
      VALUES (?, 'run-1', 'epoch-1', 'target-1', ?, 'worker-1', 'unit::symbol', 'finished',
        '2026-08-14T00:00:00.000Z', ?, '{}')`,
    )
    .run(id, `claim-${id}`, endedAt);
}

async function until(predicate: () => boolean, timeoutMs = 1_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error("timed out waiting for condition");
    await Bun.sleep(1);
  }
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
    expect(first).toMatchObject({
      workerStateId: "worker-state-1",
      status: "queued",
      executionClass: "background_safe",
      sourceClass: "worker_result",
      sourceKind: "worker_state",
      sourceId: "worker-state-1",
      provenance: {
        worker_state_id: "worker-state-1",
        run_id: "run-1",
        lifecycle_status: "finished",
      },
    });
    expect(catchUpBackgroundKnowledge(store, "melee")).toBe(1);
    expect(catchUpBackgroundKnowledge(store, "melee")).toBe(0);
    expect(
      store.db
        .query(
          "SELECT COUNT(*) count FROM jobs WHERE kind = 'knowledge_absorption'",
        )
        .get(),
    ).toEqual({ count: 2 });
  });

  test("automatic and operator processing publish through the kernel", async () => {
    const { store } = fixture();
    completedWorker(store, "worker-state-1");
    enqueueBackgroundKnowledgeForWorker(store, "worker-state-1");

    const result = await triggerBackgroundKnowledgeProcess(store, async (job) => ({
      digest: `sha256:${job.workerStateId}`,
      provenance: { worker_state_id: job.workerStateId, publication: "ledger" },
    }));
    expect(result).toMatchObject({
      outcome: "succeeded",
      digest: "sha256:worker-state-1",
    });
    expect(
      getJobByDedupeKey(store, "knowledge_absorption", "worker-state-1"),
    ).toMatchObject({
      status: "succeeded",
      resultRef: "sha256:worker-state-1",
      attempts: 1,
    });
    expect(queryBackgroundKnowledgeSummary(store, "melee")).toMatchObject({
      queued: 0,
      processing: 0,
      waiting: 0,
      failed: 0,
    });
  });

  test("processor failures persist error and kernel retry backoff", async () => {
    const { store } = fixture();
    completedWorker(store, "worker-state-1");
    enqueueBackgroundKnowledgeForWorker(store, "worker-state-1");

    const result = await processBackgroundKnowledge(store, async () => {
      throw new Error("materializer unavailable");
    });
    expect(result.outcome).toBe("failed");
    const summary = queryBackgroundKnowledgeSummary(store, "melee");
    expect(summary.waiting).toBe(1);
    expect(summary.retry?.attempts).toBe(1);
    expect(summary.recentFailures[0]?.error).toBe("materializer unavailable");
    const row = getJobByDedupeKey(
      store,
      "knowledge_absorption",
      "worker-state-1",
    );
    expect(row?.status).toBe("waiting");
    expect(Date.parse(row!.nextAttemptAt!) - Date.parse(row!.updatedAt)).toBe(2_000);
  });

  test("a requeued success reuses its digest without invoking the processor", async () => {
    const { store } = fixture();
    completedWorker(store, "worker-state-1");
    enqueueBackgroundKnowledgeForWorker(store, "worker-state-1");
    await processBackgroundKnowledge(store, async () => ({
      digest: "sha256:published",
      provenance: { publication: "ledger" },
    }));
    requeueJob(store, {
      kind: "knowledge_absorption",
      dedupeKey: "worker-state-1",
    });

    let calls = 0;
    const result = await processBackgroundKnowledge(store, async () => {
      calls += 1;
      throw new Error("processor must not run");
    });
    expect(calls).toBe(0);
    expect(result).toMatchObject({
      outcome: "succeeded",
      digest: "sha256:published",
    });
  });

  test("summary derives queue, lease, retry, and failure state from jobs", async () => {
    const { store } = fixture();
    const seeded = [
      ["processing", "2026-08-14T00:01:00.000Z"],
      ["queued", "2026-08-14T00:02:00.000Z"],
      ["waiting", "2026-08-14T00:03:00.000Z"],
      ["failed", "2026-08-14T00:04:00.000Z"],
    ] as const;
    for (const [id, endedAt] of seeded) {
      completedWorker(store, id, endedAt);
      enqueueBackgroundKnowledgeForWorker(store, id);
    }
    claimNextJob(store, {
      kind: "knowledge_absorption",
      concurrencyLimit: 2,
      leaseMs: 60_000,
    });
    store.db
      .query(
        `UPDATE jobs SET status = 'waiting', attempts = 2,
          next_attempt_at = '2026-08-14T00:05:00.000Z', error_json = '{"message":"retry me"}'
        WHERE kind = 'knowledge_absorption' AND dedupe_key = 'waiting'`,
      )
      .run();
    store.db
      .query(
        `UPDATE jobs SET status = 'failed', attempts = 3, error_json = '{"message":"terminal failure"}'
        WHERE kind = 'knowledge_absorption' AND dedupe_key = 'failed'`,
      )
      .run();

    const summary = queryBackgroundKnowledgeSummary(store, "melee");
    expect(summary).toMatchObject({
      queued: 1,
      processing: 1,
      waiting: 1,
      failed: 1,
      retry: { nextAttemptAt: "2026-08-14T00:05:00.000Z", attempts: 2 },
    });
    expect(summary.activeLease?.id).toStartWith("lease-");
    expect(summary.oldestPendingAt).toBe("2026-08-14T00:01:00.000Z");
    expect(summary.recentFailures.map((failure) => failure.workerStateId)).toEqual([
      "failed",
      "waiting",
    ]);
  });

  test("consumer start processes a job end-to-end and stop drains in-flight work", async () => {
    const { store } = fixture();
    completedWorker(store, "worker-state-1");
    enqueueBackgroundKnowledgeForWorker(store, "worker-state-1");
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let entered = false;
    const stop = startBackgroundKnowledgeProcessor(
      store,
      async (job) => {
        entered = true;
        await gate;
        return {
          digest: `sha256:${job.workerStateId}`,
          provenance: { publication: "consumer" },
        };
      },
      { intervalMs: 1 },
    );

    await until(() => entered);
    let stopped = false;
    const stopping = stop().then(() => {
      stopped = true;
    });
    await Bun.sleep(2);
    expect(stopped).toBe(false);
    release();
    await stopping;
    expect(
      getJobByDedupeKey(store, "knowledge_absorption", "worker-state-1"),
    ).toMatchObject({ status: "succeeded", resultRef: "sha256:worker-state-1" });
  });

  test("bounded stop resolves while an in-flight processor remains hung", async () => {
    const { store } = fixture();
    completedWorker(store, "worker-state-1");
    enqueueBackgroundKnowledgeForWorker(store, "worker-state-1");
    let entered = false;
    const stop = startBackgroundKnowledgeProcessor(
      store,
      async () => {
        entered = true;
        await new Promise<never>(() => {});
      },
      { intervalMs: 1 },
    );

    await until(() => entered);
    const startedAt = Date.now();
    await stop({ maxWaitMs: 50 });
    expect(Date.now() - startedAt).toBeLessThan(2_000);
  });
});
