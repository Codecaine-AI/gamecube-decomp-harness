import { afterEach, describe, expect, test } from "bun:test";

import { openState, type StateStore } from "@server/core/harness-runtime/run-state";
import type { JobRecord, JobResult } from "@server/core/job-queue/types.js";
import type { ModelNodeHandlerContext, ModelNodeJobHandler } from "@server/core/model-node-work/index.js";

import {
  ago,
  createFeedFixture,
  enableKnowledgeLane,
  seedCheckpoint,
  seedSettledEpoch,
  type FeedFixture,
} from "./__fixtures__/feed-fixture.js";
import {
  CHECKPOINT_KNOWLEDGE_USAGE,
  backfillCheckpointKnowledge,
  checkpointKnowledge,
  checkpointKnowledgeSubcommand,
  parseBackfillOptions,
  type CheckpointKnowledgeBackfillReport,
} from "./cli.js";

const fixtures: FeedFixture[] = [];
const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

afterEach(() => {
  for (const fixture of fixtures.splice(0)) fixture.cleanup();
});

/**
 * A store whose knowledge lane started an hour ago, with one epoch settled
 * two hours ago (history the lane never reaches) holding two applied
 * integrations, and one epoch that never settled.
 */
function historyFixture(name: string): FeedFixture {
  const f = createFeedFixture(name);
  fixtures.push(f);
  enableKnowledgeLane(f.store, ago(3_600_000));
  seedSettledEpoch(f, { id: "epoch-history", runId: "run-a", closedAt: ago(7_200_000) });
  seedCheckpoint(f, { id: "cp-h1", epochId: "epoch-history", runId: "run-a", symbol: "fn_h1", exact: true });
  seedCheckpoint(f, { id: "cp-h2", epochId: "epoch-history", runId: "run-a", symbol: "fn_h2" });
  seedSettledEpoch(f, { id: "epoch-open", runId: "run-a", status: "active", closedAt: null });
  seedCheckpoint(f, { id: "cp-open", epochId: "epoch-open", runId: "run-a" });
  return f;
}

interface JobRow { dedupe_key: string; status: string; attempts: number; result_ref: string | null; next_attempt_at: string | null }

function jobRows(store: StateStore): JobRow[] {
  return store.db.query<JobRow, []>(`SELECT dedupe_key, status, attempts, result_ref, next_attempt_at FROM jobs
    WHERE kind = 'checkpoint_knowledge' ORDER BY dedupe_key`).all();
}

function enqueueingHandler(): { handler: ModelNodeJobHandler; calls: Array<{ job: JobRecord; ctx: ModelNodeHandlerContext }> } {
  const calls: Array<{ job: JobRecord; ctx: ModelNodeHandlerContext }> = [];
  const handler: ModelNodeJobHandler = async (job, ctx): Promise<JobResult> => {
    calls.push({ job, ctx });
    ctx.ensureClaim();
    return { resultRef: `task:checkpoint_confirmed:${String(job.payload.checkpointId)}`, detail: { status: "enqueued" } };
  };
  return { handler, calls };
}

const BACKFILL_EPOCHS = ["epoch-history", "epoch-open", "epoch-missing"];

describe("checkpoint-knowledge CLI", () => {
  test("the subcommand and backfill options parse from argv and flags", () => {
    expect(checkpointKnowledgeSubcommand(["checkpoint-knowledge", "backfill", "--epochs", "a"])).toBe("backfill");
    expect(checkpointKnowledgeSubcommand(["checkpoint-knowledge", "--epochs", "a"])).toBeNull();
    expect(checkpointKnowledgeSubcommand(["checkpoint-knowledge"])).toBeNull();

    expect(parseBackfillOptions(new Map([["--epochs", "a,b , c,a"]]))).toEqual({ epochIds: ["a", "b", "c"], cap: 50, enqueueOnly: false });
    // The cap takes the usage's `--cap` or the run flag's spelling, validated as the run flag.
    for (const flag of ["--cap", "--checkpoint-knowledge-cap"]) {
      expect(parseBackfillOptions(new Map<string, string | true>([["--epochs", "a"], [flag, "3"], ["--enqueue-only", true]])))
        .toEqual({ epochIds: ["a"], cap: 3, enqueueOnly: true });
      expect(() => parseBackfillOptions(new Map([["--epochs", "a"], [flag, "0"]])))
        .toThrow("--checkpoint-knowledge-cap must be a positive integer");
    }
    for (const epochs of [undefined, true, " , "] as const) {
      const args = new Map<string, string | true>(epochs === undefined ? [] : [["--epochs", epochs]]);
      expect(() => parseBackfillOptions(args)).toThrow(`--epochs is required. ${CHECKPOINT_KNOWLEDGE_USAGE}`);
    }
  });

  test("backfill enqueues a named historical epoch, reports each epoch, and runs its jobs through the handler", async () => {
    const f = historyFixture("backfill");
    const { handler, calls } = enqueueingHandler();

    const report = await backfillCheckpointKnowledge(f.store, { epochIds: BACKFILL_EPOCHS, cap: 50, enqueueOnly: false }, handler);

    expect(report).toEqual({
      schema: "checkpoint_knowledge_backfill_v1",
      cap: 50,
      enqueue_only: false,
      epochs: [
        { id: "epoch-history", status: "settled", jobs: 2 },
        { id: "epoch-open", status: "not-settled", jobs: 0 },
        { id: "epoch-missing", status: "unknown", jobs: 0 },
      ],
      enqueued: 2,
      jobs: [
        { checkpoint_id: "cp-h1", epoch_id: "epoch-history", job_status: "succeeded", outcome: "enqueued" },
        { checkpoint_id: "cp-h2", epoch_id: "epoch-history", job_status: "succeeded", outcome: "enqueued" },
      ],
    });
    expect(calls.map(({ job }) => job.payload)).toEqual([
      { checkpointId: "cp-h1", epochId: "epoch-history", integrationId: "integration-cp-h1" },
      { checkpointId: "cp-h2", epochId: "epoch-history", integrationId: "integration-cp-h2" },
    ]);
    for (const { job, ctx } of calls) {
      expect(ctx.store).toBe(f.store);
      expect(ctx.token.jobId).toBe(job.jobId);
      expect(ctx.signal.aborted).toBe(false);
    }
    expect(jobRows(f.store).map((row) => [row.dedupe_key, row.status, row.attempts, row.result_ref])).toEqual([
      ["cp-h1", "succeeded", 1, "task:checkpoint_confirmed:cp-h1"],
      ["cp-h2", "succeeded", 1, "task:checkpoint_confirmed:cp-h2"],
    ]);

    // Re-running the same backfill enqueues and runs nothing again.
    const again = await backfillCheckpointKnowledge(f.store, { epochIds: BACKFILL_EPOCHS, cap: 50, enqueueOnly: false }, handler);
    expect(again.enqueued).toBe(0);
    expect(again.jobs.map((job) => [job.checkpoint_id, job.job_status, job.outcome])).toEqual([
      ["cp-h1", "succeeded", null],
      ["cp-h2", "succeeded", null],
    ]);
    expect(calls).toHaveLength(2);
  });

  test("a throwing handler leaves the job waiting for the queue's backoff with its error", async () => {
    const f = historyFixture("backfill-throws");
    const handler: ModelNodeJobHandler = async () => { throw new Error("knowledge store unavailable"); };

    const report = await backfillCheckpointKnowledge(f.store, { epochIds: ["epoch-history"], cap: 50, enqueueOnly: false }, handler);

    expect(report.jobs).toEqual([
      { checkpoint_id: "cp-h1", epoch_id: "epoch-history", job_status: "waiting", outcome: "knowledge store unavailable" },
      { checkpoint_id: "cp-h2", epoch_id: "epoch-history", job_status: "waiting", outcome: "knowledge store unavailable" },
    ]);
    for (const row of jobRows(f.store)) {
      expect(row).toMatchObject({ status: "waiting", attempts: 1, result_ref: null });
      expect(Date.parse(row.next_attempt_at!)).toBeGreaterThan(Date.now());
    }
  });

  test("a handler that outlives the lease keeps its claim by heartbeat", async () => {
    const f = historyFixture("backfill-slow");
    const leases: string[] = [];
    // Well past the 150 ms lease, as a full-length extraction is past the 120 s production lease.
    const slow: ModelNodeJobHandler = async (job, ctx) => {
      for (let tick = 0; tick < 10; tick += 1) {
        await sleep(60);
        leases.push(String(f.store.db.query<{ lease: string }, [string]>("SELECT lease_expires_at AS lease FROM jobs WHERE job_id = ?").get(job.jobId)?.lease));
      }
      ctx.ensureClaim();
      return { resultRef: `task:checkpoint_confirmed:${job.dedupeKey}`, detail: { status: "enqueued" } };
    };

    const report = await backfillCheckpointKnowledge(
      f.store, { epochIds: ["epoch-history"], cap: 50, enqueueOnly: false }, slow, undefined, { leaseMs: 150, intervalMs: 20 },
    );

    expect(report.jobs.map((job) => [job.checkpoint_id, job.job_status, job.outcome])).toEqual([
      ["cp-h1", "succeeded", "enqueued"],
      ["cp-h2", "succeeded", "enqueued"],
    ]);
    // The lease kept moving forward while each handler ran.
    expect(new Set(leases).size).toBeGreaterThan(10);
  });

  test("a claim lost on one job leaves it to its new owner, and the backfill continues with the next", async () => {
    const f = historyFixture("backfill-lease-lost");
    const handler: ModelNodeJobHandler = async (job, ctx) => {
      if (job.dedupeKey === "cp-h1") {
        // Another consumer took the job over (as after an expired lease): every write of ours is now stale.
        f.store.db.query("UPDATE jobs SET lease_id = 'lease-of-another-consumer' WHERE job_id = ?").run(job.jobId);
        await sleep(80);
        ctx.ensureClaim();
      }
      return { resultRef: `task:checkpoint_confirmed:${job.dedupeKey}`, detail: { status: "enqueued" } };
    };

    const report = await backfillCheckpointKnowledge(
      f.store, { epochIds: ["epoch-history"], cap: 50, enqueueOnly: false }, handler, undefined, { leaseMs: 150, intervalMs: 20 },
    );

    const [lost, next] = report.jobs;
    expect(lost).toMatchObject({ checkpoint_id: "cp-h1", job_status: "claimed" });
    expect(lost!.outcome).toContain("stale claim token");
    expect(next).toEqual({ checkpoint_id: "cp-h2", epoch_id: "epoch-history", job_status: "succeeded", outcome: "enqueued" });
    // The new owner's claim is untouched.
    expect(f.store.db.query("SELECT lease_id FROM jobs WHERE dedupe_key = 'cp-h1'").get()).toEqual({ lease_id: "lease-of-another-consumer" });
  });

  test("checkpointKnowledge opens its own store, prints the report, and with --dry-run-agents only enqueues", async () => {
    const f = historyFixture("command");
    const { handler, calls } = enqueueingHandler();
    const opened: string[] = [];
    const printed: CheckpointKnowledgeBackfillReport[] = [];
    // The command closes the store it opens, so it gets its own handle on the fixture's state directory.
    const deps = {
      openState: (stateDir: string) => { opened.push(stateDir); return openState(stateDir); },
      handler,
      print: (report: CheckpointKnowledgeBackfillReport) => { printed.push(report); },
    };
    const argv = ["checkpoint-knowledge", "backfill", "--epochs", "epoch-history"];
    const args = new Map<string, string | true>([["--epochs", "epoch-history"]]);

    // Rejected before any store is opened.
    await expect(checkpointKnowledge(f.globals, args, ["checkpoint-knowledge", "restore"], deps))
      .rejects.toThrow(`Unknown checkpoint-knowledge command: restore. ${CHECKPOINT_KNOWLEDGE_USAGE}`);
    await expect(checkpointKnowledge(f.globals, args, ["checkpoint-knowledge"], deps)).rejects.toThrow(CHECKPOINT_KNOWLEDGE_USAGE);
    // A subcommand the job parser recorded as `--subcommand` wins over argv.
    await expect(checkpointKnowledge(f.globals, new Map([...args, ["--subcommand", "restore"]]), argv, deps))
      .rejects.toThrow("Unknown checkpoint-knowledge command: restore.");
    await expect(checkpointKnowledge({ ...f.globals, dryRunAgents: true }, args, argv, deps))
      .rejects.toThrow("checkpoint-knowledge backfill makes model calls; drop --dry-run-agents or pass --enqueue-only");
    expect(opened).toEqual([]);

    // A dry run may enqueue: the jobs stay queued for the next lane start and no handler runs.
    const dryRun = await checkpointKnowledge(
      { ...f.globals, dryRunAgents: true },
      new Map<string, string | true>([...args, ["--enqueue-only", true]]),
      [...argv, "--enqueue-only"],
      deps,
    );
    expect(dryRun).toMatchObject({ enqueue_only: true, enqueued: 2 });
    expect(dryRun.jobs.map((job) => [job.checkpoint_id, job.job_status, job.outcome])).toEqual([
      ["cp-h1", "queued", null],
      ["cp-h2", "queued", null],
    ]);
    expect(calls).toEqual([]);

    const report = await checkpointKnowledge(f.globals, args, argv, deps);
    expect(report.jobs.map((job) => [job.checkpoint_id, job.job_status, job.outcome])).toEqual([
      ["cp-h1", "succeeded", "enqueued"],
      ["cp-h2", "succeeded", "enqueued"],
    ]);
    expect(calls).toHaveLength(2);
    expect(opened).toEqual([f.stateDir, f.stateDir]);
    expect(printed).toEqual([dryRun, report]);
    // The fixture's own handle is untouched by the command closing its store.
    expect(jobRows(f.store).map((row) => row.status)).toEqual(["succeeded", "succeeded"]);
  });
});
