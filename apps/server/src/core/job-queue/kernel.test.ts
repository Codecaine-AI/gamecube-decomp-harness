import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openState, type StateStore } from "@server/core/orchestrator-state";
import {
  cancelJob,
  claimNextJob,
  completeJob,
  enqueueJob,
  failJob,
  getJob,
  heartbeatJob,
  jobQueueSummary,
  markJobRunning,
  reapExpiredJobs,
  requeueJob,
} from "./kernel.js";

const roots: string[] = [];
const stores: StateStore[] = [];

function fixture(dir?: string) {
  const root = dir ?? mkdtempSync(join(tmpdir(), "job-kernel-"));
  if (!dir) roots.push(root);
  const store = openState(root);
  stores.push(store);
  return { root, store };
}

afterEach(() => {
  for (const s of stores.splice(0)) s.db.close();
  for (const d of roots.splice(0)) rmSync(d, { recursive: true, force: true });
});

const base = "2026-08-17T12:00:00.000Z";

function put(
  store: StateStore,
  key: string,
  options: Partial<Parameters<typeof enqueueJob>[1]> = {},
) {
  return enqueueJob(store, {
    kind: "worker",
    dedupeKey: key,
    gameId: "melee",
    payload: { key },
    traceId: "trace-queue",
    at: base,
    ...options,
  });
}

function claim(store: StateStore, at = base, limit = 10) {
  const v = claimNextJob(store, {
    kind: "worker",
    concurrencyLimit: limit,
    leaseMs: 10_000,
    at,
  });
  if (!v) throw new Error("expected claim");
  return v;
}

function events(store: StateStore) {
  return store.db
    .query(
      "SELECT event_type,trace_id,causation_id,event_id,payload_json FROM game_events WHERE subject_kind='job' ORDER BY sequence",
    )
    .all() as Array<{
    event_type: string;
    trace_id: string;
    causation_id: string;
    event_id: string;
    payload_json: string;
  }>;
}

describe("unified job queue kernel", () => {
  test("1. deterministic claim order: priority DESC, created_at ASC, job_id ASC", () => {
    const { store } = fixture();
    put(store, "low", { priority: 1 });
    put(store, "later", { priority: 2, at: "2026-08-17T12:00:01.000Z" });
    put(store, "earlier", { priority: 2, at: base });
    expect(claim(store).job.dedupeKey).toBe("earlier");
    expect(claim(store).job.dedupeKey).toBe("later");
    expect(claim(store).job.dedupeKey).toBe("low");
  });
  test("2. enqueue is idempotent through completion and explicit requeue resets terminal state", () => {
    const { store } = fixture();
    const first = put(store, "same");
    expect(put(store, "same")).toEqual(first);
    const c = claim(store);
    completeJob(
      store,
      c.token,
      { resultRef: "evidence" },
      { at: "2026-08-17T12:00:01.000Z" },
    );
    expect(put(store, "same").status).toBe("succeeded");
    expect(
      requeueJob(store, {
        kind: "worker",
        dedupeKey: "same",
        at: "2026-08-17T12:00:02.000Z",
      }),
    ).toMatchObject({ status: "queued", attempts: 0, resultRef: "evidence" });
  });
  test("3. two connections cannot double-claim one job", () => {
    const { root, store: a } = fixture();
    const b = fixture(root).store;
    put(a, "once");
    expect(
      claimNextJob(a, {
        kind: "worker",
        concurrencyLimit: 2,
        leaseMs: 10_000,
        at: base,
      })?.job.dedupeKey,
    ).toBe("once");
    expect(
      claimNextJob(b, {
        kind: "worker",
        concurrencyLimit: 2,
        leaseMs: 10_000,
        at: base,
      }),
    ).toBeNull();
  });
  test("4. expired leases self-reap and every old token write is rejected", () => {
    const { store } = fixture();
    put(store, "expired");
    const old = claim(store);
    const fresh = claim(store, "2026-08-17T12:00:11.000Z");
    expect(fresh.job.attempts).toBe(2);
    for (const write of [
      () => heartbeatJob(store, old.token, { at: "2026-08-17T12:00:11.001Z" }),
      () =>
        markJobRunning(store, old.token, { at: "2026-08-17T12:00:11.001Z" }),
      () =>
        completeJob(store, old.token, {}, { at: "2026-08-17T12:00:11.001Z" }),
      () => failJob(store, old.token, "x", { at: "2026-08-17T12:00:11.001Z" }),
    ])
      expect(write).toThrow("stale claim token");
  });
  test("heartbeat renews lease_expires_at and bumps revision but appends no game_events row", () => {
    const { store } = fixture();
    put(store, "heartbeat");
    const claimed = claim(store);
    const eventCount = events(store).length;

    const heartbeat = heartbeatJob(store, claimed.token, {
      leaseMs: 20_000,
      at: "2026-08-17T12:00:01.000Z",
    });

    expect(heartbeat.leaseExpiresAt).toBe("2026-08-17T12:00:21.000Z");
    expect(heartbeat.revision).toBe(claimed.job.revision + 1);
    expect(events(store)).toHaveLength(eventCount);
  });
  test("5. kind concurrency limit and concurrency_key singleton are enforced", () => {
    const { store } = fixture();
    put(store, "a", { concurrencyKey: "single" });
    put(store, "b", {
      concurrencyKey: "single",
      at: "2026-08-17T12:00:00.001Z",
    });
    put(store, "c", {
      concurrencyKey: "other",
      at: "2026-08-17T12:00:00.002Z",
    });
    expect(claim(store, base, 1).job.dedupeKey).toBe("a");
    expect(
      claimNextJob(store, {
        kind: "worker",
        concurrencyLimit: 1,
        leaseMs: 10000,
        at: base,
      }),
    ).toBeNull();
    expect(claim(store, "2026-08-17T12:00:00.003Z", 3).job.dedupeKey).toBe("c");
  });
  test("6. failure enters waiting with exponential default backoff", () => {
    const { store } = fixture();
    put(store, "retry");
    const c = claim(store);
    const waiting = failJob(store, c.token, "boom", { at: base });
    expect(waiting).toMatchObject({
      status: "waiting",
      attempts: 1,
      nextAttemptAt: "2026-08-17T12:00:02.000Z",
      error: "boom",
    });
    expect(
      events(store)
        .slice(-2)
        .map((e) => e.event_type),
    ).toEqual(["job.failed", "job.waiting"]);
  });
  test("7. transitions append one event with lineage and rollback leaves no revision or event", () => {
    const { store } = fixture();
    put(store, "lineage");
    const c = claim(store);
    markJobRunning(store, c.token, { at: "2026-08-17T12:00:01.000Z" });
    const before = getJob(store, c.job.jobId)!;
    const count = events(store).length;
    expect(() =>
      completeJob(
        store,
        c.token,
        {},
        {
          at: "2026-08-17T12:00:02.000Z",
          onComplete: () => {
            throw new Error("rollback");
          },
        },
      ),
    ).toThrow("rollback");
    expect(getJob(store, c.job.jobId)).toEqual(before);
    expect(events(store)).toHaveLength(count);
    const es = events(store);
    expect(es.every((e) => e.trace_id === "trace-queue")).toBeTrue();
    for (let i = 1; i < es.length; i++)
      expect(es[i]!.causation_id).toBe(es[i - 1]!.event_id);
  });
  test("8. onComplete successor enqueue commits atomically and thrown callback rolls both back", () => {
    const { store } = fixture();
    put(store, "parent");
    const c = claim(store);
    completeJob(
      store,
      c.token,
      {},
      {
        at: "2026-08-17T12:00:01.000Z",
        onComplete: (_j, _r, ctx) => {
          put(ctx.store, "child", { at: "2026-08-17T12:00:01.000Z" });
        },
      },
    );
    expect(
      store.db.query("SELECT status FROM jobs WHERE dedupe_key='child'").get(),
    ).toEqual({ status: "queued" });
    put(store, "bad");
    const bad = claim(store);
    expect(() =>
      completeJob(
        store,
        bad.token,
        {},
        {
          at: "2026-08-17T12:00:02.000Z",
          onComplete: (_j, _r, ctx) => {
            put(ctx.store, "ghost");
            throw new Error("nope");
          },
        },
      ),
    ).toThrow("nope");
    expect(
      store.db.query("SELECT 1 FROM jobs WHERE dedupe_key='ghost'").get(),
    ).toBeNull();
    expect(getJob(store, bad.job.jobId)?.status).toBe("claimed");
  });
  test("cancel invalidates tokens, reaper selects only expired jobs, and summary counts", () => {
    const { store } = fixture();
    put(store, "cancel");
    put(store, "expired", { at: "2026-08-17T12:00:01.000Z" });
    put(store, "live", { at: "2026-08-17T12:00:02.000Z" });
    const cancelled = claim(store);
    cancelJob(store, {
      jobId: cancelled.job.jobId,
      at: "2026-08-17T12:00:01.000Z",
    });
    expect(() =>
      heartbeatJob(store, cancelled.token, { at: "2026-08-17T12:00:01.001Z" }),
    ).toThrow("stale claim token");
    claim(store, "2026-08-17T12:00:02.000Z");
    claim(store, "2026-08-17T12:00:02.000Z");
    expect(
      reapExpiredJobs(store, { at: "2026-08-17T12:00:12.001Z" }),
    ).toHaveLength(2);
    expect(jobQueueSummary(store, { gameId: "melee" })).toMatchObject({
      counts: { cancelled: 1, waiting: 2 },
      activeLeaseCount: 0,
      oldestPendingAt: "2026-08-17T12:00:01.000Z",
    });
  });
});
