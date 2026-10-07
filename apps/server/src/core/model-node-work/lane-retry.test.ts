import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { openState, type StateStore } from "@server/core/harness-runtime/run-state";
import { enqueueJob, getJobByDedupeKey } from "@server/core/job-queue/kernel.js";
import type { JobRecord } from "@server/core/job-queue/types.js";

import { SubmissionNotYetIngested } from "@server/core/knowledge-v2/checkpoint-feed/handler.js";

import type { ModelNodeJobKind } from "./catch-up.js";
import { startModelNodeLanes } from "./index.js";
import { startModelNodeLane, type ModelNodeJobHandler, type ModelNodeRetryPolicy } from "./lane.js";

const fixtures: Array<{ dir: string; store: StateStore }> = [];
afterEach(() => {
  for (const fixture of fixtures.splice(0)) {
    fixture.store.db.close();
    rmSync(fixture.dir, { recursive: true, force: true });
  }
});

function tempStore(): StateStore {
  const dir = mkdtempSync(join(tmpdir(), "model-node-lane-retry-"));
  const store = openState(dir);
  fixtures.push({ dir, store });
  return store;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
async function waitFor(condition: () => boolean, timeoutMs = 5_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error("condition not reached in time");
    await sleep(10);
  }
}

class Matching extends Error {
  constructor() {
    super("matching: retry me on the long schedule");
    this.name = "Matching";
  }
}

function enqueue(store: StateStore, kind: ModelNodeJobKind, dedupeKey: string): void {
  enqueueJob(store, { kind, dedupeKey, gameId: "melee", payload: { checkpointId: dedupeKey }, actor: "runner" });
}

function job(store: StateStore, kind: ModelNodeJobKind, dedupeKey: string): JobRecord {
  return getJobByDedupeKey(store, kind, dedupeKey)!;
}

/** Makes every waiting job of the store due now, so a long backoff does not slow the test. */
function dueNow(store: StateStore): void {
  store.db.query("UPDATE jobs SET next_attempt_at = ? WHERE status = 'waiting'").run(new Date(Date.now() - 1_000).toISOString());
}

/** Backoff of the job's last failure, from its retry time and its last update. */
function backoffMs(record: JobRecord): number {
  return Date.parse(record.nextAttemptAt!) - Date.parse(record.updatedAt);
}

/** Throws Matching for dedupe keys starting with "match", a plain Error otherwise. */
const failing: ModelNodeJobHandler = async (record) => {
  if (record.dedupeKey.startsWith("match")) throw new Matching();
  throw new Error("other: infrastructure");
};

describe("model-node lane retry policy", () => {
  test("the retry hook extends past maxAttempts only for the matching error", async () => {
    const store = tempStore();
    enqueue(store, "checkpoint_knowledge", "match-1");
    enqueue(store, "checkpoint_knowledge", "other-1");
    const seen: number[] = [];
    // Matching errors retry at once until attempt 4, then turn terminal; everything else keeps the default.
    const retry: ModelNodeRetryPolicy = (record, cause) => {
      if (!(cause instanceof Matching)) return null;
      seen.push(record.attempts);
      return { backoffMs: 0, terminal: record.attempts >= 4 };
    };
    const lane = startModelNodeLane({
      store, kind: "checkpoint_knowledge", handler: failing, catchUp: () => 0, retry, maxAttempts: 2, intervalMs: 10, log: () => {},
    });
    try {
      // The other error waits on the default backoff after attempt 1, then is terminal at maxAttempts.
      await waitFor(() => job(store, "checkpoint_knowledge", "other-1").status === "waiting");
      expect(backoffMs(job(store, "checkpoint_knowledge", "other-1"))).toBe(2_000);
      dueNow(store);
      await waitFor(() => job(store, "checkpoint_knowledge", "other-1").status === "failed");
      await waitFor(() => job(store, "checkpoint_knowledge", "match-1").status === "failed");
    } finally {
      await lane.stop({ maxWaitMs: 1_000 });
    }
    expect(job(store, "checkpoint_knowledge", "other-1")).toMatchObject({ attempts: 2, error: "other: infrastructure" });
    expect(job(store, "checkpoint_knowledge", "match-1")).toMatchObject({ attempts: 4, error: "matching: retry me on the long schedule" });
    expect(job(store, "checkpoint_knowledge", "match-1").completedAt).not.toBeNull();
    expect(seen).toEqual([1, 2, 3, 4]);
  });

  test("the hook's backoff is applied; null keeps today's 5-attempt behaviour", async () => {
    const store = tempStore();
    enqueue(store, "checkpoint_knowledge", "match-long");
    enqueue(store, "checkpoint_knowledge", "match-null");
    const retry: ModelNodeRetryPolicy = (record) => (record.dedupeKey === "match-long" ? { backoffMs: 1_800_000, terminal: false } : null);
    const lane = startModelNodeLane({ store, kind: "checkpoint_knowledge", handler: failing, catchUp: () => 0, retry, intervalMs: 10, log: () => {} });
    try {
      await waitFor(() => job(store, "checkpoint_knowledge", "match-long").status === "waiting");
      expect(backoffMs(job(store, "checkpoint_knowledge", "match-long"))).toBe(1_800_000);
      // A policy answering null, like no policy at all: the queue's backoff, terminal at attempt 5.
      for (let attempt = 1; attempt <= 4; attempt += 1) {
        await waitFor(() => job(store, "checkpoint_knowledge", "match-null").status === "waiting" && job(store, "checkpoint_knowledge", "match-null").attempts === attempt);
        expect(backoffMs(job(store, "checkpoint_knowledge", "match-null"))).toBe(1_000 * 2 ** attempt);
        store.db.query("UPDATE jobs SET next_attempt_at = ? WHERE dedupe_key = 'match-null'").run(new Date(Date.now() - 1_000).toISOString());
      }
      await waitFor(() => job(store, "checkpoint_knowledge", "match-null").status === "failed");
    } finally {
      await lane.stop({ maxWaitMs: 1_000 });
    }
    expect(job(store, "checkpoint_knowledge", "match-null").attempts).toBe(5);
    expect(job(store, "checkpoint_knowledge", "match-long")).toMatchObject({ status: "waiting", attempts: 1 });
  });

  test("without a retry option every error keeps today's 5-attempt behaviour", async () => {
    const store = tempStore();
    enqueue(store, "checkpoint_knowledge", "match-plain");
    const lane = startModelNodeLane({ store, kind: "checkpoint_knowledge", handler: failing, catchUp: () => 0, intervalMs: 10, log: () => {} });
    try {
      for (let attempt = 1; attempt <= 4; attempt += 1) {
        await waitFor(() => job(store, "checkpoint_knowledge", "match-plain").status === "waiting" && job(store, "checkpoint_knowledge", "match-plain").attempts === attempt);
        dueNow(store);
      }
      await waitFor(() => job(store, "checkpoint_knowledge", "match-plain").status === "failed");
    } finally {
      await lane.stop({ maxWaitMs: 1_000 });
    }
    expect(job(store, "checkpoint_knowledge", "match-plain").attempts).toBe(5);
  });

  test("an abandoned claim is released with the default, never the retry decision", async () => {
    const store = tempStore();
    enqueue(store, "checkpoint_knowledge", "match-hang");
    const calls: string[] = [];
    // Ignores the abort, then fails with the matching error long after the claim was released.
    const hanging: ModelNodeJobHandler = () => new Promise((_resolve, reject) => setTimeout(() => reject(new Matching()), 200));
    const retry: ModelNodeRetryPolicy = (record) => {
      calls.push(record.dedupeKey);
      return { backoffMs: 1_800_000, terminal: false };
    };
    const lane = startModelNodeLane({ store, kind: "checkpoint_knowledge", handler: hanging, catchUp: () => 0, retry, intervalMs: 10, log: () => {} });
    await waitFor(() => job(store, "checkpoint_knowledge", "match-hang").status === "claimed");
    await lane.stop({ maxWaitMs: 20 });
    // Released through the queue's failure path: retry due now, attempt 1 of the default 5.
    const released = job(store, "checkpoint_knowledge", "match-hang");
    expect(released).toMatchObject({ status: "waiting", attempts: 1, leaseId: null });
    expect(backoffMs(released)).toBe(0);
    await sleep(300);
    expect(job(store, "checkpoint_knowledge", "match-hang").revision).toBe(released.revision);
    expect(calls).toEqual([]);
  });

  test("startModelNodeLanes gives the long submission retry to the knowledge lane only", async () => {
    const store = tempStore();
    // Both kinds fail with the knowledge lane's retryable error.
    const notIngested: ModelNodeJobHandler = async (record) => {
      throw new SubmissionNotYetIngested(record.dedupeKey);
    };
    enqueue(store, "checkpoint_adjudication", "cp-adjudication");
    enqueue(store, "checkpoint_knowledge", "cp-knowledge");
    const lanes = startModelNodeLanes({
      store,
      config: { adjudication: true, knowledge: true },
      handlers: { checkpoint_adjudication: notIngested, checkpoint_knowledge: notIngested },
      lane: { intervalMs: 10, maxAttempts: 1 },
      log: () => {},
    });
    try {
      await waitFor(() => job(store, "checkpoint_adjudication", "cp-adjudication").status === "failed");
      await waitFor(() => job(store, "checkpoint_knowledge", "cp-knowledge").status === "waiting");
    } finally {
      await lanes.stop({ maxWaitMs: 1_000 });
    }
    // The adjudication lane is unaffected: terminal at its maxAttempts.
    expect(job(store, "checkpoint_adjudication", "cp-adjudication")).toMatchObject({ attempts: 1 });
    // The knowledge lane keeps retrying past maxAttempts on the submission schedule (one minute first).
    const knowledge = job(store, "checkpoint_knowledge", "cp-knowledge");
    expect(knowledge).toMatchObject({ status: "waiting", attempts: 1 });
    expect(backoffMs(knowledge)).toBe(60_000);
  });
});
