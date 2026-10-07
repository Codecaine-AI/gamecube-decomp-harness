// The model-node enqueue hooks as the production run loop drives them (§6.3):
// a worker's settlement enqueues its checkpoint before the next worker
// starts, an epoch's completion enqueues its knowledge jobs before the next
// epoch's work starts, and the loop's exit leaves every item durable without
// running or waiting for a handler. Only the worker child and sandbox
// provisioning are faked (RunLoopDeps.workerJobDeps); the test never calls a
// lane hook.
import { afterEach, describe, expect, test } from "bun:test";
import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { GlobalArgs } from "@server/core/game-registry/runtime-options.js";
import { runRunLoop } from "@server/core/harness-runtime/phases/running/scheduler/run-loop.js";
import { activateRun } from "@server/core/harness-runtime/phases/running/run-control.js";
import { closeWorkerState, openState } from "@server/core/harness-runtime/run-state";
import { getHarnessState, transitionHarnessState } from "@server/core/harness-state/state.js";
import { createAcceptedRun } from "@server/core/harness-runtime/phases/running/test-fixture.js";
import { getJob } from "@server/core/job-queue/kernel.js";
import type { TaskHandle, TaskOutcome, TaskSpec, WorkerExecutor } from "@server/core/job-queue/types.js";
import { openKnowledgeGraph } from "@server/core/knowledge/graph";
import { writeReportProvenance } from "@server/core/knowledge/graph/storage/metadata.js";

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function git(cwd: string, args: string[]): void {
  const result = Bun.spawnSync(["git", ...args], { cwd, stdout: "pipe", stderr: "pipe" });
  if (result.exitCode !== 0) throw new Error(result.stderr.toString());
}

/** A game checkout with a two-function objdiff report and a knowledge board built from it. */
function fixtureRepo(dir: string): { repoRoot: string; graphDbPath: string } {
  const repoRoot = join(dir, "repo");
  mkdirSync(join(repoRoot, "build", "GALE01"), { recursive: true });
  git(repoRoot, ["init", "-q"]);
  git(repoRoot, ["config", "user.email", "lanes@example.test"]);
  git(repoRoot, ["config", "user.name", "Lanes Test"]);
  writeFileSync(join(repoRoot, "README"), "fixture\n");
  git(repoRoot, ["add", "README"]);
  git(repoRoot, ["commit", "-qm", "base"]);
  const reportPath = join(repoRoot, "build", "GALE01", "report.json");
  writeFileSync(reportPath, JSON.stringify({
    measures: { matched_code_percent: 90 },
    units: [0, 1].map((index) => ({
      name: `unit-${index}.o`,
      metadata: { source_path: `src/unit-${index}.c` },
      functions: [{ name: `function_${index}`, size: 32, fuzzy_match_percent: 90 }],
    })),
  }));
  const graphDbPath = join(dir, "graph.sqlite");
  const graph = openKnowledgeGraph(graphDbPath);
  try {
    writeReportProvenance(graph, {
      path: reportPath,
      mtimeMs: statSync(reportPath).mtimeMs,
      sha256: createHash("sha256").update(readFileSync(reportPath)).digest("hex"),
      revision: "test-revision",
      matchedCodePercent: 90,
    });
  } finally {
    graph.db.close();
  }
  return { repoRoot, graphDbPath };
}

interface WorkerObservation {
  epochId: string;
  checkpointId: string;
  /** checkpoint_* jobs that existed when this worker started, as `kind:checkpointId`. */
  jobsAtStart: string[];
}

/**
 * Stands in for the worker child: records an eligible shadow checkpoint, an
 * applied integration and the epoch's save point (the evidence a real worker,
 * its integration and the boundary leave), then closes the worker. Each start
 * records which checkpoint_* jobs already exist. The worker numbered
 * `pauseAtWorker` (1-based) also asks the harness to pause, as an operator
 * would, so the loop settles its epoch and exits as soon as that worker is done.
 */
function fakeWorkerExecutor(stateDir: string, observations: WorkerObservation[], pauseAtWorker: number): WorkerExecutor {
  const outcomes = new Map<string, TaskOutcome>();
  return {
    async submit(task: TaskSpec): Promise<TaskHandle> {
      const store = openState(stateDir, { migrate: false });
      try {
        const job = getJob(store, task.jobId)!;
        const workerStateId = String(job.payload.worker_state_id);
        const worker = store.db.query<{ run_id: string; epoch_id: string; epoch_target_id: string; target_claim_id: string }, [string]>(
          "SELECT run_id, epoch_id, epoch_target_id, target_claim_id FROM worker_state WHERE id = ?",
        ).get(workerStateId)!;
        const jobsAtStart = store.db.query<{ name: string }, []>(
          "SELECT kind || ':' || dedupe_key AS name FROM jobs WHERE kind LIKE 'checkpoint_%' ORDER BY kind, dedupe_key",
        ).all().map((row) => row.name);
        const checkpointId = `cp-${observations.length + 1}`;
        const at = new Date().toISOString();
        store.db.query(`INSERT INTO worker_checkpoints
          (id, worker_state_id, run_id, epoch_id, epoch_target_id, target_claim_id, attempt_index, validation_time,
           old_score, new_score, delta, exact_match, qa_status, validation_status, metadata_json)
          VALUES (?, ?, ?, ?, ?, ?, 1, ?, 10, 11, 1, 0, 'warnings', 'valid', ?)`).run(
          checkpointId, workerStateId, worker.run_id, worker.epoch_id, worker.epoch_target_id, worker.target_claim_id, at,
          JSON.stringify({ llm_review_candidate: { schema: "llm_review_candidate_v1", mode: "shadow", eligible: true } }),
        );
        store.db.query(`INSERT INTO integration_outcomes
          (id, run_id, epoch_id, epoch_target_id, target_claim_id, worker_state_id, worker_checkpoint_id, status, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, 'applied', ?, ?)`).run(
          `integration-${checkpointId}`, worker.run_id, worker.epoch_id, worker.epoch_target_id, worker.target_claim_id,
          workerStateId, checkpointId, at, at,
        );
        store.db.query(`INSERT OR IGNORE INTO save_points (id, campaign_id, run_id, trigger_kind, payload_json, created_at)
          VALUES (?, 'campaign', ?, 'epoch', '{}', ?)`).run(`epoch-save-point-${worker.epoch_id}`, worker.run_id, at);
        closeWorkerState(store, {
          authority: { host: "run-loop-lanes-test" },
          workerStateId,
          lifecycleStatus: "finished",
          epochTargetStatus: "finished",
          summary: { fake_worker: true },
        });
        observations.push({ epochId: worker.epoch_id, checkpointId, jobsAtStart });
        if (observations.length === pauseAtWorker) {
          const harness = getHarnessState(store.db, "test")!;
          transitionHarnessState(store.db, {
            gameId: "test",
            expectedRevision: harness.identity.revision,
            commandId: "run-loop-lanes-test-pause",
            patch: { execution: { desired: "paused" } },
          });
        }
      } finally {
        store.db.close();
      }
      const handleId = randomUUID();
      const at = new Date().toISOString();
      outcomes.set(handleId, { exitCode: 0, signal: null, stdout: "", stderr: "", timedOut: false, startedAt: at, endedAt: at });
      return { executorId: "run-loop-lanes-test", handleId };
    },
    async poll() {
      return { state: "exited" };
    },
    async collect(handle) {
      return outcomes.get(handle.handleId)!;
    },
    async cancel() {},
  };
}

describe("model-node lanes in the production run loop", () => {
  test("worker settlement and epoch completion enqueue durable checkpoint jobs at the source; exit never runs or waits for a handler", async () => {
    const dir = mkdtempSync(join(tmpdir(), "run-loop-lanes-"));
    dirs.push(dir);
    const { repoRoot, graphDbPath } = fixtureRepo(dir);
    const stateDir = join(dir, "state");
    const store = openState(stateDir);
    let runId = "";
    let leaseId = "";
    try {
      runId = createAcceptedRun(store, "matched_code_percent", 100, 1, { gameId: "test", repoRoot, stateDir }, { baseRevision: "base-test" }).id;
      leaseId = activateRun({ reason: "run-loop lanes test", runId, store }).leaseId;
    } finally {
      store.db.close();
    }
    const globals: GlobalArgs = {
      repoRoot, stateDir, gameId: "test", dryRunAgents: true, provider: "test", model: "test", thinkingLevel: "low", agentTimeoutSeconds: 600,
    };
    // Two targets per epoch and one worker at a time: workers 1 and 2 finish epoch 1, worker 3 is
    // the first of epoch 2 and pauses the harness, so the loop settles epoch 2 and exits right after it.
    const observations: WorkerObservation[] = [];
    const result = await runRunLoop(globals, new Map<string, string | true>([
      ["--lease-id", leaseId],
      ["--run-id", runId],
      ["--max-workers", "1"],
      // A backstop only: the run ends on the pause, which the assertions below check.
      ["--max-iterations", "5000"],
      ["--idle-sleep-ms", "20"],
      ["--graph-db", graphDbPath],
      ["--advisory-adjudication", "shadow"],
      ["--checkpoint-knowledge-feed", "on"],
    ]), {
      workerJobDeps: {
        executor: fakeWorkerExecutor(stateDir, observations, 3),
        provisionSandbox: async () => ({ sandboxId: `sandbox-${randomUUID()}`, workspaceRoot: repoRoot }),
      },
    });

    expect(result).toMatchObject({ stoppedReason: "paused", workersStarted: 3, workerErrors: [], epochErrors: [] });
    expect(observations.map((worker) => worker.checkpointId)).toEqual(["cp-1", "cp-2", "cp-3"]);
    const [first, second, third] = observations;
    expect(second!.epochId).toBe(first!.epochId);
    expect(third!.epochId).not.toBe(first!.epochId);
    // Worker settlement enqueues at the source: worker 1's checkpoint has its job before worker 2 starts.
    expect(second!.jobsAtStart).toEqual(["checkpoint_adjudication:cp-1"]);
    // Epoch completion enqueues at the source: epoch 1's integrations have their jobs before epoch 2's first worker.
    expect(third!.jobsAtStart).toEqual([
      "checkpoint_adjudication:cp-1",
      "checkpoint_adjudication:cp-2",
      "checkpoint_knowledge:cp-1",
      "checkpoint_knowledge:cp-2",
    ]);

    const check = openState(stateDir);
    try {
      // The loop settled epoch 2 and exited at once; worker 3 and epoch 2 left durable jobs, and
      // no job was ever claimed: a dry run builds no handler, so exit had nothing to wait for.
      expect(check.db.query("SELECT ordinal, status FROM epochs WHERE run_id = ? ORDER BY ordinal").all(runId)).toEqual([
        { ordinal: 1, status: "completed" },
        { ordinal: 2, status: "completed" },
      ]);
      expect(check.db.query(`SELECT kind, dedupe_key, status, attempts, json_extract(payload_json, '$.epochId') AS epoch_id
        FROM jobs WHERE kind LIKE 'checkpoint_%' ORDER BY kind, dedupe_key`).all()).toEqual([
        { kind: "checkpoint_adjudication", dedupe_key: "cp-1", status: "queued", attempts: 0, epoch_id: null },
        { kind: "checkpoint_adjudication", dedupe_key: "cp-2", status: "queued", attempts: 0, epoch_id: null },
        { kind: "checkpoint_adjudication", dedupe_key: "cp-3", status: "queued", attempts: 0, epoch_id: null },
        { kind: "checkpoint_knowledge", dedupe_key: "cp-1", status: "queued", attempts: 0, epoch_id: first!.epochId },
        { kind: "checkpoint_knowledge", dedupe_key: "cp-2", status: "queued", attempts: 0, epoch_id: first!.epochId },
        { kind: "checkpoint_knowledge", dedupe_key: "cp-3", status: "queued", attempts: 0, epoch_id: third!.epochId },
      ]);
      const lifecycle = check.db.query<{ event_type: string; count: number }, []>(`SELECT e.event_type, COUNT(*) AS count
        FROM game_events e JOIN jobs j ON j.job_id = e.subject_id
        WHERE e.subject_kind = 'job' AND j.kind LIKE 'checkpoint_%' GROUP BY e.event_type`).all();
      expect(lifecycle).toEqual([{ event_type: "job.enqueued", count: 6 }]);
    } finally {
      check.db.close();
    }
  }, 60_000);
});
