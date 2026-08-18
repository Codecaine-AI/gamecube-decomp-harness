import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openState, type StateStore } from "@server/core/orchestrator-state";
import {
  attachJobPayload,
  cancelJob,
  claimJobByDedupeKey,
  claimNextJob,
  completeJob,
  enqueueJob,
  failJob,
  getJob,
  heartbeatJob,
  jobQueueSummary,
  markJobRunning,
  reapExpiredJobs,
  reprioritizeJob,
  requeueJob,
  verifyClaimToken,
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
  test("enqueue persists a fractional priority in the job.enqueued event", () => {
    const { store } = fixture();

    const job = enqueueJob(store, {
      kind: "worker",
      dedupeKey: "fractional-priority",
      gameId: "melee",
      priority: 12.5,
      payload: { key: "fractional-priority" },
      traceId: "trace-queue",
      at: base,
    });

    expect(job.priority).toBe(12.5);
    const event = events(store).find((candidate) => candidate.event_type === "job.enqueued");
    expect(event).toBeDefined();
    expect(JSON.parse(event!.payload_json)).toMatchObject({ priority: 12.5 });
  });
  test("verifyClaimToken accepts a current claim", () => {
    const { store } = fixture();
    put(store, "verify-current");
    const claimed = claim(store);

    expect(verifyClaimToken(store, claimed.token, base)).toEqual(claimed.job);
  });
  test("verifyClaimToken rejects cancelled and reaped claims", () => {
    const { store } = fixture();
    put(store, "verify-cancelled");
    put(store, "verify-reaped", { at: "2026-08-17T12:00:01.000Z" });
    const cancelled = claim(store);
    cancelJob(store, {
      jobId: cancelled.job.jobId,
      at: "2026-08-17T12:00:01.000Z",
    });
    expect(() =>
      verifyClaimToken(store, cancelled.token, "2026-08-17T12:00:01.001Z"),
    ).toThrow("stale claim token");

    const reaped = claim(store, "2026-08-17T12:00:01.001Z");
    reapExpiredJobs(store, { at: "2026-08-17T12:00:12.000Z" });
    expect(() =>
      verifyClaimToken(store, reaped.token, "2026-08-17T12:00:12.001Z"),
    ).toThrow("stale claim token");
  });
  test("verifyClaimToken rejects an expired lease before reaping", () => {
    const { store } = fixture();
    put(store, "verify-expired");
    const claimed = claim(store);

    expect(() =>
      verifyClaimToken(store, claimed.token, "2026-08-17T12:00:10.001Z"),
    ).toThrow("stale claim token");
  });
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
  test("specific claim selects only the dedupe key and skips concurrency scans", () => {
    const { store } = fixture();
    put(store, "active", { concurrencyKey: "shared", priority: 10 });
    put(store, "target", {
      concurrencyKey: "shared",
      priority: 1,
      at: "2026-08-17T12:00:01.000Z",
    });
    claim(store);

    const claimed = claimJobByDedupeKey(store, {
      kind: "worker",
      dedupeKey: "target",
      leaseMs: 15_000,
      at: "2026-08-17T12:00:02.000Z",
    });

    expect(claimed?.job).toMatchObject({
      dedupeKey: "target",
      status: "claimed",
      attempts: 1,
      leaseExpiresAt: "2026-08-17T12:00:17.000Z",
    });
    expect(
      claimJobByDedupeKey(store, {
        kind: "worker",
        dedupeKey: "target",
        leaseMs: 15_000,
        at: "2026-08-17T12:00:03.000Z",
      }),
    ).toBeNull();
  });
  test("specific claim self-reaps an expired active lease and respects run eligibility", () => {
    const { store } = fixture();
    put(store, "expired-specific", { runId: "run-a" });
    const old = claim(store);

    expect(
      claimJobByDedupeKey(store, {
        kind: "worker",
        dedupeKey: "expired-specific",
        leaseMs: 20_000,
        runId: "run-b",
        at: "2026-08-17T12:00:11.000Z",
      }),
    ).toBeNull();
    const fresh = claimJobByDedupeKey(store, {
      kind: "worker",
      dedupeKey: "expired-specific",
      leaseMs: 20_000,
      runId: "run-a",
      at: "2026-08-17T12:00:11.000Z",
    });

    expect(fresh?.job).toMatchObject({ status: "claimed", attempts: 2 });
    expect(events(store).slice(-2).map((event) => event.event_type)).toEqual([
      "job.waiting",
      "job.claimed",
    ]);
    expect(() =>
      verifyClaimToken(store, old.token, "2026-08-17T12:00:11.001Z"),
    ).toThrow("stale claim token");
  });
  test("successful retry clears its prior error", () => {
    const { store } = fixture();
    put(store, "retry-success");
    const first = claim(store);
    failJob(store, first.token, "boom", { at: base, backoffMs: 1 });
    const retry = claim(store, "2026-08-17T12:00:00.001Z");
    const succeeded = completeJob(store, retry.token, {}, { at: "2026-08-17T12:00:00.002Z" });
    expect(succeeded).toMatchObject({ status: "succeeded", error: null });
  });
  test("completion defaults result_ref to the worker domain row id", () => {
    const { store } = fixture();
    put(store, "worker-evidence", { payload: { worker_state_id: "worker-state-1" } });
    const c = claim(store);
    const succeeded = completeJob(store, c.token, { resultRef: null }, { at: "2026-08-17T12:00:01.000Z" });
    expect(succeeded.resultRef).toBe("worker-state-1");
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
  test("payload attachment shallow-merges, bumps revision, and appends no game event", () => {
    const { store } = fixture();
    put(store, "payload");
    const claimed = claim(store);
    const eventCount = events(store).length;

    const attached = attachJobPayload(
      store,
      claimed.token,
      { linked_id: "claim-1", key: "updated" },
      { at: "2026-08-17T12:00:01.000Z" },
    );

    expect(attached.payload).toEqual({ key: "updated", linked_id: "claim-1" });
    expect(attached.revision).toBe(claimed.job.revision + 1);
    expect(attached.updatedAt).toBe("2026-08-17T12:00:01.000Z");
    expect(events(store)).toHaveLength(eventCount);
  });
  test("payload attachment rejects a stale claim token", () => {
    const { store } = fixture();
    put(store, "stale-payload");
    const stale = claim(store);
    claim(store, "2026-08-17T12:00:11.000Z");

    expect(() =>
      attachJobPayload(
        store,
        stale.token,
        { linked_id: "claim-1" },
        { at: "2026-08-17T12:00:11.001Z" },
      ),
    ).toThrow("stale claim token");
  });
  test("queued job reprioritization bumps revision without appending a game event", () => {
    const { store } = fixture();
    const queued = put(store, "reprioritize", { priority: 1 });
    const eventCount = events(store).length;

    const reprioritized = reprioritizeJob(store, {
      kind: "worker",
      dedupeKey: "reprioritize",
      priority: 9,
      at: "2026-08-17T12:00:01.000Z",
    });

    expect(reprioritized).toMatchObject({
      priority: 9,
      revision: queued.revision + 1,
      updatedAt: "2026-08-17T12:00:01.000Z",
    });
    expect(events(store)).toHaveLength(eventCount);
  });
  test("running job reprioritization is a no-op", () => {
    const { store } = fixture();
    put(store, "running-priority", { priority: 1 });
    const claimed = claim(store);
    const running = markJobRunning(store, claimed.token, {
      at: "2026-08-17T12:00:01.000Z",
    });

    expect(
      reprioritizeJob(store, {
        kind: "worker",
        dedupeKey: "running-priority",
        priority: 9,
        at: "2026-08-17T12:00:02.000Z",
      }),
    ).toEqual(running);
  });
  test("reprioritization returns null for a missing job", () => {
    const { store } = fixture();

    expect(
      reprioritizeJob(store, {
        kind: "worker",
        dedupeKey: "missing",
        priority: 9,
      }),
    ).toBeNull();
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
  test("claim run filter only selects jobs from that run", () => {
    const { store } = fixture();
    put(store, "integration-a", { kind: "integration", runId: "run-a" });
    put(store, "integration-b", {
      kind: "integration",
      runId: "run-b",
      at: "2026-08-17T12:00:00.001Z",
    });

    expect(
      claimNextJob(store, {
        kind: "integration",
        concurrencyLimit: 1,
        leaseMs: 10_000,
        runId: "run-b",
        at: base,
      })?.job.dedupeKey,
    ).toBe("integration-b");
  });
  test("claim run filter scopes kind and concurrency-key limits per run", () => {
    const { store } = fixture();
    put(store, "integration-a", {
      kind: "integration",
      runId: "run-a",
      concurrencyKey: "integration-singleton",
    });
    put(store, "integration-b", {
      kind: "integration",
      runId: "run-b",
      concurrencyKey: "integration-singleton",
      at: "2026-08-17T12:00:00.001Z",
    });
    expect(
      claimNextJob(store, {
        kind: "integration",
        concurrencyLimit: 1,
        leaseMs: 10_000,
        runId: "run-a",
        at: base,
      })?.job.dedupeKey,
    ).toBe("integration-a");

    expect(
      claimNextJob(store, {
        kind: "integration",
        concurrencyLimit: 1,
        leaseMs: 10_000,
        runId: "run-b",
        at: base,
      })?.job.dedupeKey,
    ).toBe("integration-b");
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
  test("terminal failure stops at failed without scheduling a retry", () => {
    const { store } = fixture();
    put(store, "terminal-failure");
    const c = claim(store);
    const eventCount = events(store).length;

    const failed = failJob(store, c.token, "not retryable", {
      terminal: true,
      at: "2026-08-17T12:00:01.000Z",
    });

    expect(failed).toMatchObject({
      status: "failed",
      nextAttemptAt: null,
      leaseId: null,
      leaseExpiresAt: null,
      completedAt: "2026-08-17T12:00:01.000Z",
      error: "not retryable",
    });
    expect(events(store).slice(eventCount).map((event) => event.event_type)).toEqual([
      "job.failed",
    ]);
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
  test("force cancellation transitions succeeded and failed jobs", () => {
    const { store } = fixture();
    put(store, "succeeded-cancel");
    put(store, "failed-cancel", { at: "2026-08-17T12:00:00.001Z" });
    const succeededClaim = claim(store);
    const succeeded = completeJob(store, succeededClaim.token, {}, {
      at: "2026-08-17T12:00:01.000Z",
    });
    expect(
      cancelJob(store, {
        jobId: succeeded.jobId,
        at: "2026-08-17T12:00:02.000Z",
      }),
    ).toEqual(succeeded);
    expect(
      cancelJob(store, {
        jobId: succeeded.jobId,
        force: true,
        reason: "discarded",
        at: "2026-08-17T12:00:02.000Z",
      }).status,
    ).toBe("cancelled");

    const failedClaim = claim(store, "2026-08-17T12:00:02.001Z");
    const failed = failJob(store, failedClaim.token, "terminal", {
      terminal: true,
      at: "2026-08-17T12:00:03.000Z",
    });
    expect(
      cancelJob(store, {
        jobId: failed.jobId,
        force: true,
        at: "2026-08-17T12:00:04.000Z",
      }).status,
    ).toBe("cancelled");
    expect(events(store).slice(-1)[0]?.event_type).toBe("job.cancelled");
  });
});
