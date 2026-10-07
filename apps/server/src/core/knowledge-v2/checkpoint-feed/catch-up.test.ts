// Knowledge catch-up over settled epochs (plan §5 M11, §6.3, §6.8): the scan
// reads stored rows only, so every way an epoch settles is covered, a crash
// before the post-boundary trigger is recovered by the next scan, Sync is
// never consulted, and history is reached only by naming it.
import { afterEach, describe, expect, test } from "bun:test";

import { getHarnessState } from "@server/core/harness-state/state.js";
import { addSavePoint, ensureCampaign } from "@server/core/harness-runtime/phases/pr/state";
import {
  closeSchedulerEpoch,
  closeSchedulerEpochWithEvidence,
  createRun,
  startSchedulerEpoch,
  type StateStore,
} from "@server/core/harness-runtime/run-state";
import { seedRunHarness } from "@server/core/harness-runtime/run-state/test-harness.js";
import { claimJobByDedupeKey, completeJob, failJob } from "@server/core/job-queue/kernel.js";
import { catchUpKnowledge, startModelNodeLanes, type ModelNodeJobHandler } from "@server/core/model-node-work/index.js";

import {
  ago,
  createFeedFixture,
  enableKnowledgeLane,
  seedCheckpoint,
  seedRun,
  seedSettledEpoch,
  type FeedFixture,
} from "./__fixtures__/feed-fixture.js";

const fixtures: FeedFixture[] = [];

afterEach(() => {
  for (const fixture of fixtures.splice(0)) fixture.cleanup();
});

function fixture(name: string): FeedFixture {
  const f = createFeedFixture(name);
  fixtures.push(f);
  return f;
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor(condition: () => boolean, timeoutMs = 5_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error("condition not reached in time");
    await sleep(10);
  }
}

interface KnowledgeJob {
  jobId: string;
  checkpointId: string;
  runId: string | null;
  status: string;
  payload: Record<string, unknown>;
}

function knowledgeJobs(store: StateStore): KnowledgeJob[] {
  return store.db.query<{ job_id: string; dedupe_key: string; run_id: string | null; status: string; payload_json: string }, []>(`
    SELECT job_id, dedupe_key, run_id, status, payload_json FROM jobs
    WHERE kind = 'checkpoint_knowledge' ORDER BY dedupe_key`).all()
    .map((row) => ({ jobId: row.job_id, checkpointId: row.dedupe_key, runId: row.run_id, status: row.status, payload: JSON.parse(row.payload_json) }));
}

const queuedCheckpoints = (store: StateStore): string[] => knowledgeJobs(store).map((job) => job.checkpointId);

/** The epoch save point settlement records before the boundary closes the epoch (settlement.ts). */
function recordEpochSavePoint(f: FeedFixture, epochId: string, runId: string, commitSha = "b".repeat(40)): string {
  const campaign = ensureCampaign(f.store, { gameId: "melee" });
  return addSavePoint(f.store, {
    id: `epoch-save-point-${epochId}`,
    campaignId: campaign.id,
    runId,
    triggerKind: "epoch_finish",
    commitSha,
    committed: true,
  }).id;
}

function git(repoRoot: string, ...args: string[]): string {
  const result = Bun.spawnSync(["git", "-C", repoRoot, ...args], { stdout: "pipe", stderr: "pipe" });
  if (result.exitCode !== 0) throw new Error(`git ${args.join(" ")} failed: ${result.stderr.toString()}`);
  return result.stdout.toString().trim();
}

/** A harness checkout with an accepted head and one epoch integration commit on top. */
function harnessRepo(repoRoot: string): { head: string; integrationCommit: string } {
  git(repoRoot, "init", "-q");
  git(repoRoot, "config", "user.email", "feed@example.invalid");
  git(repoRoot, "config", "user.name", "feed");
  git(repoRoot, "config", "commit.gpgsign", "false");
  git(repoRoot, "commit", "-q", "--allow-empty", "-m", "base");
  const head = git(repoRoot, "rev-parse", "HEAD");
  git(repoRoot, "commit", "-q", "--allow-empty", "-m", "epoch integration");
  return { head, integrationCommit: git(repoRoot, "rev-parse", "HEAD") };
}

describe("knowledge catch-up over settled epochs", () => {
  test("catch-up covers reconciled settlements and recovers after a crash right after save point and evidence capture", async () => {
    const f = fixture("crash");
    enableKnowledgeLane(f.store);

    // A reconciled boundary: the integration was already done, so the boundary
    // closes the epoch with the reconcile summary (epoch-boundary.ts) and the
    // post-boundary trigger runs for it like for a fresh settlement.
    seedRun(f.store, "run-a");
    const reconciled = startSchedulerEpoch(f.store, "run-a", { workerPoolSize: 1 }).id;
    seedCheckpoint(f, { id: "cp-reconciled", epochId: reconciled, runId: "run-a" });
    recordEpochSavePoint(f, reconciled, "run-a");
    closeSchedulerEpoch(f.store, reconciled, {
      status: "completed",
      boundaryStatus: "success",
      routingSummary: {
        trigger: "scheduler epoch 1 completed", reconciled: true, commitSha: "b".repeat(40),
        skipped_steps: ["integration"], rerun_steps: [], breakage_gate: null,
      },
    });
    expect(catchUpKnowledge(f.store, { epochId: reconciled })).toBe(1);
    expect(knowledgeJobs(f.store).map((job) => [job.checkpointId, job.runId, job.payload])).toEqual([
      ["cp-reconciled", "run-a", { checkpointId: "cp-reconciled", epochId: reconciled, integrationId: "integration-cp-reconciled" }],
    ]);

    // A fresh boundary through the real evidence path: the save point is
    // recorded, the epoch closes with its evidence and admits Sync, and the
    // process dies before the post-boundary trigger runs.
    const repo = harnessRepo(f.repoRoot);
    seedRunHarness(f.store, "melee", repo.head, f.repoRoot);
    const run = createRun(f.store, "matched_code_percent", 100, 1, { gameId: "melee" }, { baseRevision: repo.head });
    const crashed = startSchedulerEpoch(f.store, run.id, { workerPoolSize: 1 }).id;
    seedCheckpoint(f, { id: "cp-crashed", epochId: crashed, runId: run.id, exact: true });
    const savePointId = recordEpochSavePoint(f, crashed, run.id, repo.integrationCommit);
    closeSchedulerEpochWithEvidence(f.store, crashed, {
      status: "completed",
      boundaryStatus: "success",
      routingSummary: { trigger: "scheduler epoch 1 completed", save_point_id: savePointId },
      integration: {
        gameId: "melee", runId: run.id, integrationCommit: repo.integrationCommit, scoreDelta: 0.5,
        commandId: `command-epoch-integrated-${crashed}`, correlationId: run.id,
      },
      savePointEvidence: { status: "recorded", savePointId, commitSha: repo.integrationCommit, triggerKind: "epoch_finish", artifactPaths: [] },
    });
    // Closed as completed, but its save point was never recorded: not settled yet.
    const unsaved = startSchedulerEpoch(f.store, "run-a", { workerPoolSize: 1 }).id;
    seedCheckpoint(f, { id: "cp-unsaved", epochId: unsaved, runId: "run-a", exact: true });
    closeSchedulerEpoch(f.store, unsaved, { status: "completed", boundaryStatus: "success" });
    expect(queuedCheckpoints(f.store)).toEqual(["cp-reconciled"]);
    // Sync was admitted by the boundary and has not run; the scan does not wait for it.
    expect(getHarnessState(f.store.db, "melee")?.execution).toMatchObject({ workflow: "sync", status: "active" });

    // The next lane start in this state directory finds the crashed epoch's integration.
    const handled: string[] = [];
    const handler: ModelNodeJobHandler = async (job) => {
      handled.push(String(job.payload.checkpointId));
      return { resultRef: null, detail: { status: "ok" } };
    };
    const lanes = startModelNodeLanes({
      store: f.store,
      config: { adjudication: false, knowledge: true },
      handlers: { checkpoint_adjudication: null, checkpoint_knowledge: handler },
      lane: { intervalMs: 10 },
      log: () => {},
    });
    try {
      await waitFor(() => knowledgeJobs(f.store).length === 2 && knowledgeJobs(f.store).every((job) => job.status === "succeeded"));
    } finally {
      await lanes.stop({ maxWaitMs: 1_000 });
    }
    expect(handled.sort()).toEqual(["cp-crashed", "cp-reconciled"]);
    expect(knowledgeJobs(f.store).map((job) => [job.checkpointId, job.runId, job.payload])).toEqual([
      ["cp-crashed", run.id, { checkpointId: "cp-crashed", epochId: crashed, integrationId: "integration-cp-crashed" }],
      ["cp-reconciled", "run-a", { checkpointId: "cp-reconciled", epochId: reconciled, integrationId: "integration-cp-reconciled" }],
    ]);
    expect(catchUpKnowledge(f.store)).toBe(0);

    // Once the missing save point exists, the epoch is settled and the next scan enqueues it once.
    recordEpochSavePoint(f, unsaved, "run-a");
    expect(catchUpKnowledge(f.store)).toBe(1);
    expect(catchUpKnowledge(f.store)).toBe(0);
    expect(queuedCheckpoints(f.store)).toEqual(["cp-crashed", "cp-reconciled", "cp-unsaved"]);
  });

  test("catch-up never depends on Sync", () => {
    const f = fixture("no-sync");
    enableKnowledgeLane(f.store);
    // Epochs closed by the plain boundary close: no harness, Sync, or dispatch state is ever written.
    for (const [runId, checkpointId, boundaryStatus] of [["run-dry", "cp-dry", "dry_run"], ["run-plain", "cp-plain", "success"]] as const) {
      seedRun(f.store, runId);
      const epochId = startSchedulerEpoch(f.store, runId, { workerPoolSize: 1 }).id;
      seedCheckpoint(f, { id: checkpointId, epochId, runId });
      recordEpochSavePoint(f, epochId, runId);
      closeSchedulerEpoch(f.store, epochId, { status: "completed", boundaryStatus, routingSummary: { trigger: "scheduler epoch 1 completed" } });
    }
    for (const table of ["harness_state", "harness_timeline_entries", "sync_state", "sync_push_records", "dispatch_state"]) {
      expect(f.store.db.query<{ count: number }, []>(`SELECT COUNT(*) AS count FROM ${table}`).get()).toEqual({ count: 0 });
    }

    expect(catchUpKnowledge(f.store)).toBe(2);
    expect(knowledgeJobs(f.store).map((job) => [job.checkpointId, job.runId])).toEqual([["cp-dry", "run-dry"], ["cp-plain", "run-plain"]]);
  });

  test("catch-up scans settled epochs across all runs since enabled_since", () => {
    const f = fixture("all-runs");
    seedSettledEpoch(f, { id: "epoch-a", runId: "run-a", closedAt: ago(300_000) });
    seedCheckpoint(f, { id: "cp-a", epochId: "epoch-a", runId: "run-a" });
    seedSettledEpoch(f, { id: "epoch-b", runId: "run-b", closedAt: ago(60_000) });
    seedCheckpoint(f, { id: "cp-b", epochId: "epoch-b", runId: "run-b" });
    // Settled before the lane was first enabled in this state directory.
    seedSettledEpoch(f, { id: "epoch-old", runId: "run-a", closedAt: ago(900_000) });
    seedCheckpoint(f, { id: "cp-old", epochId: "epoch-old", runId: "run-a" });

    // No lane state: the kind never started here, so catch-up has no window at all.
    expect(catchUpKnowledge(f.store)).toBe(0);

    enableKnowledgeLane(f.store, ago(600_000));
    // One epoch per batch: the scan keeps taking batches across runs until one comes back short.
    expect(catchUpKnowledge(f.store, { batchSize: 1 })).toBe(2);
    expect(knowledgeJobs(f.store).map((job) => [job.checkpointId, job.runId, job.payload.epochId])).toEqual([
      ["cp-a", "run-a", "epoch-a"],
      ["cp-b", "run-b", "epoch-b"],
    ]);
  });

  test("enqueue is idempotent across retries; cap stops at 50", () => {
    const f = fixture("cap");
    enableKnowledgeLane(f.store);
    seedSettledEpoch(f, { id: "epoch-big", runId: "run-a" });
    // 60 applied integrations: five exact matches with the smallest score gains, then gains 1..55.
    const exact = [1, 2, 3, 4, 5].map((n) => `cp-exact-${n}`);
    const gains = Array.from({ length: 55 }, (_, i) => `cp-gain-${String(i + 1).padStart(2, "0")}`);
    // One target per checkpoint, as in a real epoch.
    const seed = (id: string, extra: { exact?: boolean; delta: number; integrationStatus?: string }) =>
      seedCheckpoint(f, { id, epochId: "epoch-big", runId: "run-a", symbol: `fn_${id}`, ...extra });
    exact.forEach((id, i) => seed(id, { exact: true, delta: (i + 1) / 100 }));
    gains.forEach((id, i) => seed(id, { delta: i + 1 }));
    // Integrations that did not land are never fed, however good the checkpoint.
    for (const status of ["conflict", "skipped", "failed"]) seed(`cp-${status}`, { exact: true, delta: 1_000, integrationStatus: status });

    // A smaller cap takes the best three: exact matches first, then larger gains.
    expect(catchUpKnowledge(f.store, { cap: 3 })).toBe(3);
    expect(queuedCheckpoints(f.store)).toEqual(["cp-exact-3", "cp-exact-4", "cp-exact-5"]);

    // The default cap fills the epoch to 50: every exact match, and the ten smallest gains left out.
    expect(catchUpKnowledge(f.store)).toBe(47);
    expect(queuedCheckpoints(f.store)).toEqual([...exact, ...gains.slice(10)]);
    expect(catchUpKnowledge(f.store)).toBe(0);

    // A retried job (failed back to waiting) and a finished one keep their single job.
    const retried = claimJobByDedupeKey(f.store, { kind: "checkpoint_knowledge", dedupeKey: "cp-exact-1", leaseMs: 60_000 })!;
    failJob(f.store, retried.token, "store busy");
    const finished = claimJobByDedupeKey(f.store, { kind: "checkpoint_knowledge", dedupeKey: "cp-gain-55", leaseMs: 60_000 })!;
    completeJob(f.store, finished.token, { resultRef: null, detail: { status: "not-confirmed" } });
    const before = knowledgeJobs(f.store).map((job) => [job.checkpointId, job.jobId]);
    expect(catchUpKnowledge(f.store)).toBe(0);
    expect(catchUpKnowledge(f.store, { epochId: "epoch-big" })).toBe(0);
    expect(knowledgeJobs(f.store).map((job) => [job.checkpointId, job.jobId])).toEqual(before);
    expect(knowledgeJobs(f.store).filter((job) => ["cp-exact-1", "cp-gain-55"].includes(job.checkpointId)).map((job) => job.status))
      .toEqual(["waiting", "succeeded"]);

    // Raising the cap counts the epoch's existing jobs and adds only the ten left; failed integrations stay out.
    expect(catchUpKnowledge(f.store, { cap: 100 })).toBe(10);
    expect(queuedCheckpoints(f.store)).toEqual([...exact, ...gains]);
  });

  test("history is reached only by naming it", () => {
    const f = fixture("history");
    // Settled long before the lane was enabled.
    seedSettledEpoch(f, { id: "epoch-history", runId: "run-a", closedAt: ago(7_200_000) });
    seedCheckpoint(f, { id: "cp-history", epochId: "epoch-history", runId: "run-a" });
    seedSettledEpoch(f, { id: "epoch-history-2", runId: "run-a", closedAt: ago(5_400_000) });
    seedCheckpoint(f, { id: "cp-history-2", epochId: "epoch-history-2", runId: "run-a" });
    // Settled after it.
    seedSettledEpoch(f, { id: "epoch-recent", runId: "run-b", closedAt: ago(60_000) });
    seedCheckpoint(f, { id: "cp-recent", epochId: "epoch-recent", runId: "run-b" });
    // Named but not settled: still active, and completed without its save point.
    seedSettledEpoch(f, { id: "epoch-active", runId: "run-a", status: "active", closedAt: null });
    seedCheckpoint(f, { id: "cp-active", epochId: "epoch-active", runId: "run-a" });
    seedSettledEpoch(f, { id: "epoch-unsaved", runId: "run-a", closedAt: ago(7_000_000), savePoint: false });
    seedCheckpoint(f, { id: "cp-unsaved", epochId: "epoch-unsaved", runId: "run-a" });

    // No lane state yet: only a named backfill reaches anything, and only the named settled epochs.
    expect(catchUpKnowledge(f.store, { includeHistory: true })).toBe(0);
    expect(catchUpKnowledge(f.store, { includeHistory: true, epochIds: [] })).toBe(0);
    expect(catchUpKnowledge(f.store, {
      includeHistory: true,
      epochIds: ["epoch-history", "epoch-active", "epoch-unsaved", "epoch-missing"],
    })).toBe(1);
    expect(knowledgeJobs(f.store).map((job) => [job.checkpointId, job.payload.epochId])).toEqual([["cp-history", "epoch-history"]]);

    enableKnowledgeLane(f.store);
    // Naming alone does not reach history, and includeHistory without names is the ordinary scan.
    expect(catchUpKnowledge(f.store, { epochIds: ["epoch-history-2"] })).toBe(0);
    expect(catchUpKnowledge(f.store, { includeHistory: true })).toBe(1);
    expect(queuedCheckpoints(f.store)).toEqual(["cp-history", "cp-recent"]);
  });

  test("a job terminal with submission-not-found is re-enqueued once its submission exists, and no other terminal outcome is", () => {
    const f = fixture("stranded");
    enableKnowledgeLane(f.store);
    seedSettledEpoch(f, { id: "epoch-1", runId: "run-a" });
    const ids = ["cp-stranded", "cp-still-missing", "cp-other-error", "cp-succeeded", "cp-waiting"];
    ids.forEach((id, index) => seedCheckpoint(f, { id, epochId: "epoch-1", runId: "run-a", symbol: `fn_${index}` }));
    seedSettledEpoch(f, { id: "epoch-2", runId: "run-a" });
    seedCheckpoint(f, { id: "cp-other-epoch", epochId: "epoch-2", runId: "run-a" });
    expect(catchUpKnowledge(f.store)).toBe(6);
    const notIngested = (id: string) => `submission-not-found: no knowledge submission records checkpoint ${id} yet`;
    const settle = (id: string, outcome: { error: string; terminal: boolean } | "succeeded") => {
      const claim = claimJobByDedupeKey(f.store, { kind: "checkpoint_knowledge", dedupeKey: id, leaseMs: 60_000 })!;
      if (outcome === "succeeded") completeJob(f.store, claim.token, { resultRef: id, detail: { status: "not-confirmed" } });
      else failJob(f.store, claim.token, outcome.error, { terminal: outcome.terminal });
    };
    settle("cp-stranded", { error: notIngested("cp-stranded"), terminal: true });
    settle("cp-still-missing", { error: notIngested("cp-still-missing"), terminal: true });
    settle("cp-other-epoch", { error: notIngested("cp-other-epoch"), terminal: true });
    settle("cp-other-error", { error: "checkpoint_knowledge cp-other-error: node kernel unavailable", terminal: true });
    settle("cp-succeeded", "succeeded");
    settle("cp-waiting", { error: notIngested("cp-waiting"), terminal: false });
    const status = () => Object.fromEntries(knowledgeJobs(f.store).map((job) => [job.checkpointId, job.status]));
    const before = status();

    // Every candidate has its submission except cp-still-missing; only the stranded terminal jobs qualify.
    const asked: Array<[string, string[]]> = [];
    const ingested = (gameId: string, checkpointIds: readonly string[]) => {
      asked.push([gameId, [...checkpointIds].sort()]);
      return new Set(checkpointIds.filter((id) => id !== "cp-still-missing"));
    };
    // Narrowed to one epoch, it leaves the other epoch's stranded job alone.
    expect(catchUpKnowledge(f.store, { epochId: "epoch-1", ingestedSubmissions: ingested })).toBe(1);
    expect(asked).toEqual([["melee", ["cp-still-missing", "cp-stranded"]]]);
    expect(status()).toEqual({ ...before, "cp-stranded": "queued" });
    expect(knowledgeJobs(f.store).find((job) => job.checkpointId === "cp-stranded")?.payload)
      .toEqual({ checkpointId: "cp-stranded", epochId: "epoch-1", integrationId: "integration-cp-stranded" });

    expect(catchUpKnowledge(f.store, { ingestedSubmissions: ingested })).toBe(1);
    expect(status()).toEqual({ ...before, "cp-stranded": "queued", "cp-other-epoch": "queued" });
    // Idempotent: queued jobs are not candidates, and the rest never qualify.
    expect(catchUpKnowledge(f.store, { ingestedSubmissions: ingested })).toBe(0);
    expect(status()).toMatchObject({ "cp-still-missing": "failed", "cp-other-error": "failed", "cp-succeeded": "succeeded", "cp-waiting": "waiting" });

    // A failed lookup is logged and skipped; the ordinary scan still enqueues.
    seedCheckpoint(f, { id: "cp-new", epochId: "epoch-1", runId: "run-a", symbol: "fn_new" });
    const logged: string[] = [];
    expect(catchUpKnowledge(f.store, {
      ingestedSubmissions: () => { throw new Error("knowledge store unreadable"); },
      log: (message) => logged.push(message),
    })).toBe(1);
    expect(logged).toEqual(["[model-node-lanes] checkpoint_knowledge submission lookup failed for melee: knowledge store unreadable"]);
    expect(status()).toMatchObject({ "cp-new": "queued", "cp-still-missing": "failed" });
  });
});
