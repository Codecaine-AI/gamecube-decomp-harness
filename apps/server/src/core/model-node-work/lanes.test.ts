import { afterEach, describe, expect, jest, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  activeWorkerCount,
  admitEpochTargets,
  blockingWorkerOutputIntegrationCount,
  claimNextEpochTarget,
  closeSchedulerEpoch,
  closeWorkerState,
  createRun,
  openState,
  schedulerEpochProgress,
  startSchedulerEpoch,
  unhandledEventCount,
  type StateStore,
} from "@server/core/harness-runtime/run-state";
import { seedRunHarness } from "@server/core/harness-runtime/run-state/test-harness.js";
import { epochBoundaryWorkPending } from "@server/core/harness-runtime/phases/running/scheduler/run-loop.js";
import { claimJobByDedupeKey, claimNextJob, markJobRunning } from "@server/core/job-queue/kernel.js";
import type { JobRecord, JobResult } from "@server/core/job-queue/types.js";
import {
  catchUpAdjudication,
  catchUpKnowledge,
  defaultModelNodeHandlers,
  ensureModelNodeLaneState,
  modelNodeLaneEnabledSince,
  ModelNodeLaneAbandonedError,
  startModelNodeLane,
  startModelNodeLanes,
  startModelNodeLanesIfEnabled,
  type ModelNodeHandlerContext,
  type ModelNodeHandlers,
  type ModelNodeJobHandler,
} from "./index.js";

const fixtures: Array<{ dir: string; store: StateStore }> = [];

afterEach(() => {
  for (const fixture of fixtures.splice(0)) {
    fixture.store.db.close();
    rmSync(fixture.dir, { recursive: true, force: true });
  }
});

function tempStore(): StateStore {
  const dir = mkdtempSync(join(tmpdir(), "model-node-lanes-"));
  const store = openState(dir);
  fixtures.push({ dir, store });
  return store;
}

const ago = (ms: number): string => new Date(Date.now() - ms).toISOString();
const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor(condition: () => boolean, timeoutMs = 5_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error("condition not reached in time");
    await sleep(10);
  }
}

function seedRun(store: StateStore, id: string): void {
  store.db.query(`INSERT INTO runs (id, goal_kind, goal_value, desired_workers, status, created_at, game_id, revision, trace_id)
    VALUES (?, 'matched_percent', 100, 1, 'active', ?, 'melee', 0, ?)`).run(id, ago(3_600_000), `trace-${id}`);
}

function seedCheckpoint(store: StateStore, input: {
  id: string;
  runId: string;
  workerStateId: string;
  validationTime: string;
  epochId?: string;
  eligible?: boolean;
  mode?: "shadow" | "enforce";
  qaStatus?: string;
  exact?: boolean;
  delta?: number | null;
}): void {
  const candidate = { schema: "llm_review_candidate_v1", mode: input.mode ?? "shadow", eligible: input.eligible ?? true };
  store.db.query(`INSERT INTO worker_checkpoints
    (id, worker_state_id, run_id, epoch_id, epoch_target_id, target_claim_id, attempt_index, validation_time,
     old_score, new_score, delta, exact_match, qa_status, validation_status, metadata_json)
    VALUES (?, ?, ?, ?, 'epoch-target', ?, 1, ?, 10, 11, ?, ?, ?, 'valid', ?)`).run(
    input.id,
    input.workerStateId,
    input.runId,
    input.epochId ?? "epoch-x",
    `claim-${input.workerStateId}`,
    input.validationTime,
    input.delta === undefined ? 1 : input.delta,
    input.exact ? 1 : 0,
    input.qaStatus ?? "warnings",
    JSON.stringify({ llm_review_candidate: candidate }),
  );
}

function seedSettledEpoch(store: StateStore, input: { id: string; runId: string; closedAt: string; savePoint?: boolean }): void {
  store.db.query(`INSERT INTO epochs (id, run_id, ordinal, worker_pool_size, status, created_at, closed_at)
    VALUES (?, ?, 1, 1, 'completed', ?, ?)`).run(input.id, input.runId, ago(3_600_000), input.closedAt);
  if (input.savePoint === false) return;
  store.db.query(`INSERT INTO save_points (id, campaign_id, run_id, trigger_kind, payload_json, created_at)
    VALUES (?, 'campaign', ?, 'epoch', '{}', ?)`).run(`epoch-save-point-${input.id}`, input.runId, input.closedAt);
}

function seedIntegration(store: StateStore, input: { checkpointId: string; runId: string; epochId: string; status?: string }): void {
  const at = ago(60_000);
  store.db.query(`INSERT INTO integration_outcomes
    (id, run_id, epoch_id, epoch_target_id, target_claim_id, worker_state_id, worker_checkpoint_id, status, created_at, updated_at)
    VALUES (?, ?, ?, 'epoch-target', 'claim', 'worker', ?, ?, ?, ?)`).run(
    `integration-${input.checkpointId}`, input.runId, input.epochId, input.checkpointId, input.status ?? "applied", at, at,
  );
}

interface JobRow { kind: string; dedupe_key: string; run_id: string | null; status: string; attempts: number; payload_json: string }

function jobs(store: StateStore, kind?: string): JobRow[] {
  return store.db.query<JobRow, [string | null]>(`SELECT kind, dedupe_key, run_id, status, attempts, payload_json FROM jobs
    WHERE kind LIKE 'checkpoint_%' AND (?1 IS NULL OR kind = ?1) ORDER BY kind, dedupe_key`).all(kind ?? null);
}

function recordingHandlers(): { handlers: ModelNodeHandlers; handled: string[] } {
  const handled: string[] = [];
  const handler: ModelNodeJobHandler = async (job: JobRecord): Promise<JobResult> => {
    handled.push(`${job.kind}:${String(job.payload.checkpointId)}`);
    return { resultRef: null, detail: { status: "ok" } };
  };
  return { handled, handlers: { checkpoint_adjudication: handler, checkpoint_knowledge: handler } };
}

describe("model-node lanes", () => {
  test("lanes: a pending checkpoint_* job does not delay settlement or keep the loop alive", async () => {
    const store = tempStore();
    seedRunHarness(store);
    const run = createRun(store, "matched_code_percent", 100, 1, { gameId: "test" }, { baseRevision: "base-test" });
    const epoch = startSchedulerEpoch(store, run.id, { workerPoolSize: 1 });
    admitEpochTargets(store, {
      epochId: epoch.id,
      runId: run.id,
      candidates: [{ kind: "function", unit: "unit", symbol: "fn", sourcePath: "src/fn.c", size: 64, fuzzy: 91 }],
      workerPoolSize: 1,
    });
    const claim = claimNextEpochTarget({ store, runId: run.id, workerId: "worker-1", baseRev: "base", ttlSeconds: 1800 });
    const workerStateId = claim?.workerStateId ?? "";
    let aborts = 0;
    const hanging: ModelNodeJobHandler = (_job, ctx) => new Promise<JobResult>((_resolve, reject) => {
      ctx.signal.addEventListener("abort", () => { aborts += 1; reject(ctx.signal.reason); });
    });
    const abandoned: number[] = [];
    const lanes = startModelNodeLanes({
      store,
      config: { adjudication: true, knowledge: true },
      handlers: { checkpoint_adjudication: hanging, checkpoint_knowledge: hanging },
      onShutdownAbandoned: (count) => abandoned.push(count),
      lane: { intervalMs: 10 },
      log: () => {},
    });
    let stopped = false;
    try {
      seedCheckpoint(store, { id: "cp-worker", runId: run.id, workerStateId, epochId: epoch.id, validationTime: new Date().toISOString() });
      closeWorkerState(store, {
        authority: { host: "model-node-lanes-test" },
        workerStateId,
        lifecycleStatus: "timeout",
        epochTargetStatus: "finished",
        summary: { test: true },
        timeoutSummary: "test finished",
      });
      lanes.afterWorkerSettled(workerStateId);
      seedSettledEpoch(store, { id: "epoch-prior", runId: run.id, closedAt: new Date().toISOString() });
      seedCheckpoint(store, { id: "cp-prior", runId: run.id, workerStateId: "worker-prior", epochId: "epoch-prior", validationTime: ago(1), qaStatus: "clean", eligible: false });
      seedIntegration(store, { checkpointId: "cp-prior", runId: run.id, epochId: "epoch-prior" });
      lanes.afterEpochBoundary("epoch-prior");
      await waitFor(() => jobs(store).length === 2 && jobs(store).every((job) => job.status === "claimed"));

      // Every settlement and exit predicate the run loop uses ignores the lane jobs.
      expect(activeWorkerCount(store, run.id)).toBe(0);
      expect(blockingWorkerOutputIntegrationCount(store, run.id)).toBe(0);
      expect(schedulerEpochProgress(store, epoch.id)).toMatchObject({ remaining: 0, claimed: 0 });
      expect(epochBoundaryWorkPending(store, run.id, new Date(), true)).toBe(true);
      expect(unhandledEventCount(store, run.id)).toBe(0);
      closeSchedulerEpoch(store, epoch.id, { status: "completed" });
      expect(store.db.query("SELECT status FROM epochs WHERE id = ?").get(epoch.id)).toEqual({ status: "completed" });
      expect(jobs(store).map((job) => [job.kind, job.dedupe_key, job.status])).toEqual([
        ["checkpoint_adjudication", "cp-worker", "claimed"],
        ["checkpoint_knowledge", "cp-prior", "claimed"],
      ]);

      // Shutdown waits only for the grace, aborts the handlers, and leaves the jobs for a later lease.
      const startedAt = Date.now();
      await lanes.stop({ maxWaitMs: 50 });
      stopped = true;
      expect(Date.now() - startedAt).toBeLessThan(2_000);
      expect(aborts).toBe(2);
      expect(abandoned.at(-1)).toBe(2);
      await waitFor(() => jobs(store).every((job) => job.status === "waiting"));
      expect(jobs(store).map((job) => job.attempts)).toEqual([1, 1]);
    } finally {
      if (!stopped) await lanes.stop({ maxWaitMs: 50 });
    }
  });

  test("lanes: shutdown past the grace releases a non-cooperative handler's claim; its late result writes nothing", async () => {
    const store = tempStore();
    seedRun(store, "run-a");
    ensureModelNodeLaneState(store, "checkpoint_adjudication", ago(600_000));
    seedCheckpoint(store, { id: "cp-1", runId: "run-a", workerStateId: "ws-1", validationTime: ago(60_000) });
    let lateResolve: ((result: JobResult) => void) | undefined;
    let context: ModelNodeHandlerContext | undefined;
    // Ignores the abort signal and never settles on its own.
    const stubborn: ModelNodeJobHandler = (_job, ctx) => {
      context = ctx;
      return new Promise<JobResult>((resolve) => { lateResolve = resolve; });
    };
    const abandoned: number[] = [];
    const lane = startModelNodeLane({
      store,
      kind: "checkpoint_adjudication",
      handler: stubborn,
      catchUp: () => catchUpAdjudication(store),
      intervalMs: 10,
      onShutdownAbandoned: (count) => abandoned.push(count),
      log: () => {},
    });
    const row = () => store.db.query<{ status: string; revision: number; lease_id: string | null; lease_expires_at: string | null;
      next_attempt_at: string | null; result_ref: string | null; attempts: number }, []>(
      "SELECT status, revision, lease_id, lease_expires_at, next_attempt_at, result_ref, attempts FROM jobs WHERE kind = 'checkpoint_adjudication'",
    ).get()!;
    await waitFor(() => row().status === "claimed" && context !== undefined);
    expect(lane.inFlight()).toBe(1);

    const startedAt = Date.now();
    await lane.stop({ maxWaitMs: 50 });
    expect(Date.now() - startedAt).toBeLessThan(2_000);
    expect(abandoned).toEqual([1]);
    expect(lane.inFlight()).toBe(0);
    expect(context!.signal.aborted).toBe(true);
    expect(() => context!.ensureClaim()).toThrow(ModelNodeLaneAbandonedError);
    const released = row();
    expect(released).toMatchObject({ status: "waiting", lease_id: null, lease_expires_at: null, result_ref: null, attempts: 1 });
    expect(Date.parse(released.next_attempt_at!)).toBeLessThanOrEqual(Date.now());

    // No heartbeat renews the released claim, and the handler's late result writes nothing.
    await sleep(100);
    lateResolve!({ resultRef: "late", detail: { status: "late" } });
    await sleep(50);
    expect(row()).toEqual(released);
    expect(store.db.query("SELECT COUNT(*) AS count FROM game_events WHERE event_type = 'job.succeeded'").get()).toEqual({ count: 0 });

    // Another lane (another run, after a restart) reclaims the job at once.
    const { handlers, handled } = recordingHandlers();
    const next = startModelNodeLane({ store, kind: "checkpoint_adjudication", handler: handlers.checkpoint_adjudication, catchUp: () => 0, intervalMs: 10 });
    try {
      await waitFor(() => row().status === "succeeded");
    } finally {
      await next.stop({ maxWaitMs: 1_000 });
    }
    expect(handled).toEqual(["checkpoint_adjudication:cp-1"]);
    expect(row()).toMatchObject({ status: "succeeded", attempts: 2, result_ref: null });
  });

  test("lanes: a dry run enqueues an existing cross-run backlog but never claims it or runs a registered handler", async () => {
    const store = tempStore();
    seedRun(store, "run-a");
    seedRun(store, "run-b");
    ensureModelNodeLaneState(store, "checkpoint_adjudication", ago(600_000));
    ensureModelNodeLaneState(store, "checkpoint_knowledge", ago(600_000));
    seedCheckpoint(store, { id: "cp-queued", runId: "run-a", workerStateId: "ws-queued", validationTime: ago(300_000) });
    catchUpAdjudication(store);
    seedCheckpoint(store, { id: "cp-stranded", runId: "run-a", workerStateId: "ws-stranded", validationTime: ago(200_000) });
    seedSettledEpoch(store, { id: "epoch-a", runId: "run-a", closedAt: ago(100_000) });
    seedCheckpoint(store, { id: "cp-integrated", runId: "run-a", workerStateId: "ws-integrated", epochId: "epoch-a", validationTime: ago(150_000), qaStatus: "clean" });
    seedIntegration(store, { checkpointId: "cp-integrated", runId: "run-a", epochId: "epoch-a" });
    const handler = jest.fn(async (): Promise<JobResult> => { throw new Error("a dry run must never execute a handler"); });

    const lanes = startModelNodeLanesIfEnabled({
      store,
      runId: "run-b",
      globals: { dryRunAgents: true } as never,
      advisoryAdjudication: "shadow",
      checkpointKnowledgeFeed: true,
      checkpointKnowledgeCap: 50,
      handlers: { checkpoint_adjudication: handler, checkpoint_knowledge: handler },
      start: (params) => startModelNodeLanes({ ...params, lane: { intervalMs: 10 } }),
    })!;
    expect(lanes.claimingKinds).toEqual([]);
    await sleep(100);
    await lanes.stop({ maxWaitMs: 1_000 });

    expect(handler).not.toHaveBeenCalled();
    expect(jobs(store).map((job) => [job.kind, job.dedupe_key, job.status, job.attempts])).toEqual([
      ["checkpoint_adjudication", "cp-queued", "queued", 0],
      ["checkpoint_adjudication", "cp-stranded", "queued", 0],
      ["checkpoint_knowledge", "cp-integrated", "queued", 0],
    ]);
    expect(JSON.parse(String((store.db.query("SELECT payload_json FROM events WHERE run_id = 'run-b'").get() as { payload_json: string }).payload_json)))
      .toMatchObject({ dry_run: true });
    // The gate sits in startModelNodeLanes too, for any other caller.
    const direct = startModelNodeLanes({
      store,
      config: { adjudication: true, knowledge: true },
      handlers: { checkpoint_adjudication: handler, checkpoint_knowledge: handler },
      dryRun: true,
      lane: { intervalMs: 10 },
    });
    expect(direct.claimingKinds).toEqual([]);
    await sleep(50);
    await direct.stop({ maxWaitMs: 1_000 });
    expect(handler).not.toHaveBeenCalled();
  });

  test("lanes: catch-up enqueues once per checkpoint and recovers after a simulated crash", async () => {
    const store = tempStore();
    seedRun(store, "run-a");
    ensureModelNodeLaneState(store, "checkpoint_adjudication", ago(600_000));
    seedCheckpoint(store, { id: "cp-1", runId: "run-a", workerStateId: "ws-1", validationTime: ago(300_000) });
    seedCheckpoint(store, { id: "cp-2", runId: "run-a", workerStateId: "ws-2", validationTime: ago(200_000) });
    seedCheckpoint(store, { id: "cp-3", runId: "run-a", workerStateId: "ws-3", validationTime: ago(100_000) });
    seedCheckpoint(store, { id: "cp-ineligible", runId: "run-a", workerStateId: "ws-2", validationTime: ago(200_000), eligible: false });
    seedCheckpoint(store, { id: "cp-enforce", runId: "run-a", workerStateId: "ws-2", validationTime: ago(200_000), mode: "enforce" });
    seedCheckpoint(store, { id: "cp-clean", runId: "run-a", workerStateId: "ws-2", validationTime: ago(200_000), qaStatus: "clean" });

    expect(catchUpAdjudication(store, { workerStateId: "ws-1" })).toBe(1);
    expect(catchUpAdjudication(store, { workerStateId: "ws-1" })).toBe(0);
    // A full scan keeps taking batches until one comes back short.
    expect(catchUpAdjudication(store, { batchSize: 1 })).toBe(2);
    expect(catchUpAdjudication(store)).toBe(0);
    expect(jobs(store).map((job) => [job.dedupe_key, job.run_id, job.status, JSON.parse(job.payload_json)])).toEqual([
      ["cp-1", "run-a", "queued", { checkpointId: "cp-1" }],
      ["cp-2", "run-a", "queued", { checkpointId: "cp-2" }],
      ["cp-3", "run-a", "queued", { checkpointId: "cp-3" }],
    ]);

    // cp-1: the process died after claiming it (lease long expired); cp-2 and cp-3: it died between enqueue and claim.
    const stale = claimJobByDedupeKey(store, { kind: "checkpoint_adjudication", dedupeKey: "cp-1", leaseMs: 120_000, at: ago(3_600_000) });
    expect(stale?.job.status).toBe("claimed");

    const { handlers, handled } = recordingHandlers();
    const lanes = startModelNodeLanes({ store, config: { adjudication: true, knowledge: false }, handlers, lane: { intervalMs: 10 } });
    try {
      await waitFor(() => jobs(store).every((job) => job.status === "succeeded"));
    } finally {
      await lanes.stop({ maxWaitMs: 1_000 });
    }
    expect(handled.sort()).toEqual(["checkpoint_adjudication:cp-1", "checkpoint_adjudication:cp-2", "checkpoint_adjudication:cp-3"]);
    expect(jobs(store).map((job) => [job.dedupe_key, job.attempts])).toEqual([["cp-1", 2], ["cp-2", 1], ["cp-3", 1]]);
  });

  test("lanes: settlement right after a scan, then immediate exit, leaves durable jobs", async () => {
    const store = tempStore();
    seedRun(store, "run-a");
    const handler = jest.fn(async (): Promise<JobResult> => ({ resultRef: null }));
    const lanes = startModelNodeLanes({
      store,
      config: { adjudication: true, knowledge: true },
      handlers: { checkpoint_adjudication: handler, checkpoint_knowledge: handler },
      lane: { intervalMs: 60_000, catchUpEveryMs: 60_000 },
    });
    lanes.catchUp();
    await sleep(1);

    // 1 ms after the scan: an epoch settles and a worker finishes with an eligible checkpoint.
    const at = new Date().toISOString();
    seedSettledEpoch(store, { id: "epoch-late", runId: "run-a", closedAt: at });
    seedCheckpoint(store, { id: "cp-integrated", runId: "run-a", workerStateId: "ws-integrated", epochId: "epoch-late", validationTime: at, qaStatus: "clean", eligible: false });
    seedIntegration(store, { checkpointId: "cp-integrated", runId: "run-a", epochId: "epoch-late" });
    seedCheckpoint(store, { id: "cp-late-worker", runId: "run-a", workerStateId: "ws-late", validationTime: at });
    lanes.afterEpochBoundary("epoch-late");
    expect(jobs(store).map((job) => [job.kind, job.dedupe_key])).toEqual([["checkpoint_knowledge", "cp-integrated"]]);

    // The loop stops at once, before the worker's settle callback could enqueue its checkpoint.
    await lanes.stop({ maxWaitMs: 1_000 });

    expect(jobs(store).map((job) => [job.kind, job.dedupe_key, job.status, JSON.parse(job.payload_json)])).toEqual([
      ["checkpoint_adjudication", "cp-late-worker", "queued", { checkpointId: "cp-late-worker" }],
      ["checkpoint_knowledge", "cp-integrated", "queued", { checkpointId: "cp-integrated", epochId: "epoch-late", integrationId: "integration-cp-integrated" }],
    ]);
    expect(handler).not.toHaveBeenCalled();
  });

  test("lanes: restart with a different run recovers stranded items", async () => {
    const store = tempStore();
    seedRun(store, "run-a");
    seedRun(store, "run-b");
    // Run A's lanes started ten minutes ago, then the process crashed.
    ensureModelNodeLaneState(store, "checkpoint_adjudication", ago(600_000));
    ensureModelNodeLaneState(store, "checkpoint_knowledge", ago(600_000));
    // Items of run A that never got a job (crash before enqueue).
    seedCheckpoint(store, { id: "cp-a1", runId: "run-a", workerStateId: "ws-a1", validationTime: ago(300_000) });
    seedSettledEpoch(store, { id: "epoch-a", runId: "run-a", closedAt: ago(240_000) });
    seedCheckpoint(store, { id: "cp-a2", runId: "run-a", workerStateId: "ws-a2", epochId: "epoch-a", validationTime: ago(280_000), qaStatus: "clean", eligible: false });
    seedIntegration(store, { checkpointId: "cp-a2", runId: "run-a", epochId: "epoch-a" });
    // A job run A's lane was running when it died; its lease has expired.
    seedCheckpoint(store, { id: "cp-a3", runId: "run-a", workerStateId: "ws-a3", validationTime: ago(400_000) });
    catchUpAdjudication(store, { workerStateId: "ws-a3" });
    const running = claimNextJob(store, { kind: "checkpoint_adjudication", concurrencyLimit: 4, leaseMs: 120_000, at: ago(3_600_000) });
    markJobRunning(store, running!.token, { at: ago(3_599_000) });
    expect(jobs(store).map((job) => [job.dedupe_key, job.status])).toEqual([["cp-a3", "running"]]);

    const { handlers, handled } = recordingHandlers();
    const lanes = startModelNodeLanesIfEnabled({
      store,
      runId: "run-b",
      globals: {} as never,
      advisoryAdjudication: "shadow",
      checkpointKnowledgeFeed: true,
      checkpointKnowledgeCap: 50,
      handlers,
      start: (params) => startModelNodeLanes({ ...params, lane: { intervalMs: 10 } }),
    });
    expect(lanes?.kinds).toEqual(["checkpoint_adjudication", "checkpoint_knowledge"]);
    try {
      await waitFor(() => jobs(store).length === 3 && jobs(store).every((job) => job.status === "succeeded"));
    } finally {
      await lanes?.stop({ maxWaitMs: 1_000 });
    }
    expect(handled.sort()).toEqual([
      "checkpoint_adjudication:cp-a1",
      "checkpoint_adjudication:cp-a3",
      "checkpoint_knowledge:cp-a2",
    ]);
    expect(jobs(store).map((job) => [job.dedupe_key, job.run_id])).toEqual([["cp-a1", "run-a"], ["cp-a3", "run-a"], ["cp-a2", "run-a"]]);
    expect(store.db.query("SELECT event_type, handled_at IS NOT NULL AS handled FROM events WHERE run_id = 'run-b'").all()).toEqual([
      { event_type: "model_node_lanes_recorded", handled: 1 },
    ]);
  });

  test("lanes: enabling a kind does not backfill history", async () => {
    const store = tempStore();
    seedRun(store, "run-a");
    seedCheckpoint(store, { id: "cp-old", runId: "run-a", workerStateId: "ws-old", validationTime: ago(60_000) });
    seedSettledEpoch(store, { id: "epoch-old", runId: "run-a", closedAt: ago(60_000) });
    seedCheckpoint(store, { id: "cp-old-integrated", runId: "run-a", workerStateId: "ws-old-2", epochId: "epoch-old", validationTime: ago(90_000), qaStatus: "clean" });
    seedIntegration(store, { checkpointId: "cp-old-integrated", runId: "run-a", epochId: "epoch-old" });
    // Before any lane started, catch-up has no window at all.
    expect(catchUpAdjudication(store)).toBe(0);
    expect(catchUpKnowledge(store)).toBe(0);

    const { handlers } = recordingHandlers();
    const first = startModelNodeLanes({ store, config: { adjudication: true, knowledge: true }, handlers, lane: { intervalMs: 60_000 } });
    await first.stop({ maxWaitMs: 1_000 });
    const enabledSince = modelNodeLaneEnabledSince(store, "checkpoint_adjudication");
    expect(enabledSince).not.toBeNull();
    expect(jobs(store)).toEqual([]);

    await sleep(2);
    const at = new Date().toISOString();
    seedCheckpoint(store, { id: "cp-new", runId: "run-a", workerStateId: "ws-new", validationTime: at });
    seedSettledEpoch(store, { id: "epoch-new", runId: "run-a", closedAt: at });
    seedCheckpoint(store, { id: "cp-new-integrated", runId: "run-a", workerStateId: "ws-new-2", epochId: "epoch-new", validationTime: at, qaStatus: "clean" });
    seedIntegration(store, { checkpointId: "cp-new-integrated", runId: "run-a", epochId: "epoch-new" });

    // A later start keeps the first enabled_since and only reaches items after it.
    const second = startModelNodeLanes({ store, config: { adjudication: true, knowledge: true }, handlers, lane: { intervalMs: 60_000 } });
    await second.stop({ maxWaitMs: 1_000 });
    expect(modelNodeLaneEnabledSince(store, "checkpoint_adjudication")).toBe(enabledSince);
    expect(jobs(store).map((job) => [job.kind, job.dedupe_key])).toEqual([
      ["checkpoint_adjudication", "cp-new"],
      ["checkpoint_knowledge", "cp-new-integrated"],
    ]);
  });

  test("knowledge catch-up: settled epochs only, exact matches then score gain, up to the epoch cap", () => {
    const store = tempStore();
    seedRun(store, "run-a");
    ensureModelNodeLaneState(store, "checkpoint_knowledge", ago(600_000));
    seedSettledEpoch(store, { id: "epoch-1", runId: "run-a", closedAt: ago(60_000) });
    const integrated = [
      { id: "cp-small", exact: false, delta: 0.5 },
      { id: "cp-exact", exact: true, delta: 0.1 },
      { id: "cp-large", exact: false, delta: 4 },
      { id: "cp-unscored", exact: false, delta: null },
    ];
    for (const row of integrated) {
      seedCheckpoint(store, { id: row.id, runId: "run-a", workerStateId: `ws-${row.id}`, epochId: "epoch-1", validationTime: ago(90_000), exact: row.exact, delta: row.delta, qaStatus: "clean" });
      seedIntegration(store, { checkpointId: row.id, runId: "run-a", epochId: "epoch-1" });
    }
    seedCheckpoint(store, { id: "cp-conflict", runId: "run-a", workerStateId: "ws-conflict", epochId: "epoch-1", validationTime: ago(90_000), qaStatus: "clean" });
    seedIntegration(store, { checkpointId: "cp-conflict", runId: "run-a", epochId: "epoch-1", status: "conflict" });
    // Closed without its save point: not settled yet.
    seedSettledEpoch(store, { id: "epoch-unsaved", runId: "run-a", closedAt: ago(60_000), savePoint: false });
    seedCheckpoint(store, { id: "cp-unsaved", runId: "run-a", workerStateId: "ws-unsaved", epochId: "epoch-unsaved", validationTime: ago(90_000), qaStatus: "clean" });
    seedIntegration(store, { checkpointId: "cp-unsaved", runId: "run-a", epochId: "epoch-unsaved" });

    expect(catchUpKnowledge(store, { cap: 2 })).toBe(2);
    expect(catchUpKnowledge(store, { cap: 2 })).toBe(0);
    expect(jobs(store).map((job) => job.dedupe_key)).toEqual(["cp-exact", "cp-large"]);
    expect(catchUpKnowledge(store, { cap: 50, epochId: "epoch-1" })).toBe(2);
    expect(jobs(store).map((job) => job.dedupe_key)).toEqual(["cp-exact", "cp-large", "cp-small", "cp-unscored"]);
  });
});

describe("startModelNodeLanesIfEnabled", () => {
  test("has zero footprint when every lane is off", () => {
    const start = jest.fn();
    const store = new Proxy({} as StateStore, {
      get() {
        throw new Error("lanes-off path accessed the store");
      },
    });
    expect(startModelNodeLanesIfEnabled({
      store,
      runId: "run-off",
      globals: {} as never,
      advisoryAdjudication: "off",
      checkpointKnowledgeFeed: false,
      checkpointKnowledgeCap: 50,
      start,
    })).toBeNull();
    expect(start).not.toHaveBeenCalled();
  });

  test("starts the adjudication lane for shadow and enforce and the knowledge lane for the feed; the adjudication handler is registered, the knowledge handler is not yet", () => {
    const store = tempStore();
    seedRun(store, "run-a");
    const configs: unknown[] = [];
    for (const [mode, feed] of [["shadow", false], ["enforce", false], ["off", true]] as const) {
      startModelNodeLanesIfEnabled({
        store,
        runId: "run-a",
        globals: {} as never,
        advisoryAdjudication: mode,
        checkpointKnowledgeFeed: feed,
        checkpointKnowledgeCap: 7,
        start: (params) => {
          configs.push(params.config);
          expect(typeof params.handlers.checkpoint_adjudication).toBe("function");
          expect(params.handlers.checkpoint_knowledge).toBeNull();
          return null as never;
        },
      });
    }
    expect(configs).toEqual([
      { adjudication: true, knowledge: false, knowledgeCap: 7 },
      { adjudication: true, knowledge: false, knowledgeCap: 7 },
      { adjudication: false, knowledge: true, knowledgeCap: 7 },
    ]);
    const defaults = defaultModelNodeHandlers({} as never);
    expect(typeof defaults.checkpoint_adjudication).toBe("function");
    expect(defaults.checkpoint_knowledge).toBeNull();
  });

  test("without a registered handler, enqueued checkpoint_* jobs stay queued after a lane tick and after stop", async () => {
    const store = tempStore();
    seedRun(store, "run-a");
    ensureModelNodeLaneState(store, "checkpoint_adjudication", ago(600_000));
    ensureModelNodeLaneState(store, "checkpoint_knowledge", ago(600_000));
    seedCheckpoint(store, { id: "cp-shadow", runId: "run-a", workerStateId: "ws-1", validationTime: ago(60_000) });
    seedSettledEpoch(store, { id: "epoch-1", runId: "run-a", closedAt: ago(30_000) });
    seedCheckpoint(store, { id: "cp-integrated", runId: "run-a", workerStateId: "ws-2", epochId: "epoch-1", validationTime: ago(60_000), qaStatus: "clean" });
    seedIntegration(store, { checkpointId: "cp-integrated", runId: "run-a", epochId: "epoch-1" });

    const lanes = startModelNodeLanesIfEnabled({
      store,
      runId: "run-a",
      globals: {} as never,
      advisoryAdjudication: "shadow",
      checkpointKnowledgeFeed: true,
      checkpointKnowledgeCap: 50,
      handlers: { checkpoint_adjudication: null, checkpoint_knowledge: null },
      start: (params) => startModelNodeLanes({ ...params, lane: { intervalMs: 10, leaseMs: 1 } }),
    })!;
    expect(lanes.kinds).toEqual(["checkpoint_adjudication", "checkpoint_knowledge"]);
    expect(lanes.claimingKinds).toEqual([]);
    const pending = () => jobs(store).map((job) => [job.kind, job.dedupe_key, job.status, job.attempts]);
    expect(pending()).toEqual([
      ["checkpoint_adjudication", "cp-shadow", "queued", 0],
      ["checkpoint_knowledge", "cp-integrated", "queued", 0],
    ]);
    await sleep(100);
    seedCheckpoint(store, { id: "cp-late", runId: "run-a", workerStateId: "ws-3", validationTime: new Date().toISOString() });
    const startedAt = Date.now();
    await lanes.stop({ maxWaitMs: 15_000 });
    expect(Date.now() - startedAt).toBeLessThan(1_000);
    await sleep(50);
    expect(pending()).toEqual([
      ["checkpoint_adjudication", "cp-late", "queued", 0],
      ["checkpoint_adjudication", "cp-shadow", "queued", 0],
      ["checkpoint_knowledge", "cp-integrated", "queued", 0],
    ]);
    expect(store.db.query("SELECT COUNT(*) AS count FROM game_events WHERE event_type IN ('job.claimed', 'job.succeeded', 'job.failed')").get())
      .toEqual({ count: 0 });
  });
});
