// A failed worker's recovered output must be integrated before the next worker
// on the same file starts, or that worker builds from a base its patch cannot
// apply over. Only the worker child and sandbox provisioning are faked; the
// loop's own settle, claim recovery, integration drain and claim run for real.
import { afterEach, describe, expect, test } from "bun:test";
import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { GlobalArgs } from "@server/core/game-registry/runtime-options.js";
import { runRunLoop } from "@server/core/harness-runtime/phases/running/scheduler/run-loop.js";
import { activateRun } from "@server/core/harness-runtime/phases/running/run-control.js";
import { closeWorkerState, openState, recordWorkerCheckpoint } from "@server/core/harness-runtime/run-state";
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

/** A game checkout whose report holds two functions in one source file. */
function fixtureRepo(dir: string): { repoRoot: string; graphDbPath: string } {
  const repoRoot = join(dir, "repo");
  mkdirSync(join(repoRoot, "build", "GALE01"), { recursive: true });
  git(repoRoot, ["init", "-q"]);
  git(repoRoot, ["config", "user.email", "hold@example.test"]);
  git(repoRoot, ["config", "user.name", "Hold Test"]);
  writeFileSync(join(repoRoot, "README"), "fixture\n");
  git(repoRoot, ["add", "README"]);
  git(repoRoot, ["commit", "-qm", "base"]);
  const reportPath = join(repoRoot, "build", "GALE01", "report.json");
  writeFileSync(reportPath, JSON.stringify({
    measures: { matched_code_percent: 90 },
    units: [{
      name: "enemy.o",
      metadata: { source_path: "src/enemy.cpp" },
      functions: ["walkToCurPathNode", "zigzagToCurPathNode"].map((name) => ({ name, size: 32, fuzzy_match_percent: 90 })),
    }],
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

interface WorkerStart {
  symbol: string;
  /** Integration job statuses for this run when the worker started. */
  integrationJobsAtStart: string[];
}

/**
 * The first worker records a selectable checkpoint and then fails, as a worker
 * whose sandbox dies does, leaving the loop to recover its claim and queue its
 * output. Every later worker records when it started and closes; the second
 * also pauses the harness so the loop settles the epoch and exits.
 */
function failingFirstWorkerExecutor(stateDir: string, starts: WorkerStart[]): WorkerExecutor {
  const outcomes = new Map<string, TaskOutcome>();
  return {
    async submit(task: TaskSpec): Promise<TaskHandle> {
      const store = openState(stateDir, { migrate: false });
      let exitCode = 0;
      try {
        const job = getJob(store, task.jobId)!;
        const workerStateId = String(job.payload.worker_state_id);
        const worker = store.db.query<{ run_id: string; epoch_id: string; epoch_target_id: string; target_claim_id: string; symbol: string }, [string]>(
          `SELECT worker_state.run_id, worker_state.epoch_id, worker_state.epoch_target_id, worker_state.target_claim_id, epoch_targets.symbol
           FROM worker_state JOIN epoch_targets ON epoch_targets.id = worker_state.epoch_target_id WHERE worker_state.id = ?`,
        ).get(workerStateId)!;
        starts.push({
          symbol: worker.symbol,
          integrationJobsAtStart: store.db.query<{ status: string }, [string]>(
            "SELECT status FROM jobs WHERE kind = 'integration' AND run_id = ? ORDER BY created_at",
          ).all(worker.run_id).map((row) => row.status),
        });
        if (starts.length === 1) {
          recordWorkerCheckpoint(store, {
            workerStateId,
            authority: { host: "run-loop-integration-hold-test" },
            runId: worker.run_id,
            epochId: worker.epoch_id,
            epochTargetId: worker.epoch_target_id,
            targetClaimId: worker.target_claim_id,
            attemptIndex: 1,
            oldScore: 90,
            newScore: 100,
            exactMatch: true,
            hardGatesPassed: true,
            validationStatus: "passed",
          });
          exitCode = 1;
        } else {
          store.db.query(`INSERT OR IGNORE INTO save_points (id, campaign_id, run_id, trigger_kind, payload_json, created_at)
            VALUES (?, 'campaign', ?, 'epoch', '{}', ?)`).run(`epoch-save-point-${worker.epoch_id}`, worker.run_id, new Date().toISOString());
          closeWorkerState(store, {
            authority: { host: "run-loop-integration-hold-test" },
            workerStateId,
            lifecycleStatus: "finished",
            epochTargetStatus: "finished",
            summary: { fake_worker: true },
          });
          const harness = getHarnessState(store.db, "test")!;
          transitionHarnessState(store.db, {
            gameId: "test",
            expectedRevision: harness.identity.revision,
            commandId: "run-loop-integration-hold-test-pause",
            patch: { execution: { desired: "paused" } },
          });
        }
      } finally {
        store.db.close();
      }
      const handleId = randomUUID();
      const at = new Date().toISOString();
      outcomes.set(handleId, {
        exitCode, signal: null, stdout: "", stderr: exitCode === 0 ? "" : "sandbox error", timedOut: false, startedAt: at, endedAt: at,
      });
      return { executorId: "run-loop-integration-hold-test", handleId };
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

describe("same-file claims behind a recovered worker's integration", () => {
  test("the next target on the file starts only after the recovered output's integration job settled", async () => {
    const dir = mkdtempSync(join(tmpdir(), "run-loop-integration-hold-"));
    dirs.push(dir);
    const { repoRoot, graphDbPath } = fixtureRepo(dir);
    const stateDir = join(dir, "state");
    const store = openState(stateDir);
    let runId = "";
    let leaseId = "";
    try {
      runId = createAcceptedRun(store, "matched_code_percent", 100, 2, { gameId: "test", repoRoot, stateDir }, { baseRevision: "base-test" }).id;
      leaseId = activateRun({ reason: "run-loop integration hold test", runId, store }).leaseId;
    } finally {
      store.db.close();
    }
    const globals: GlobalArgs = {
      repoRoot, stateDir, gameId: "test", dryRunAgents: true, provider: "test", model: "test", thinkingLevel: "low", agentTimeoutSeconds: 600,
    };
    const starts: WorkerStart[] = [];
    const result = await runRunLoop(globals, new Map<string, string | true>([
      ["--lease-id", leaseId],
      ["--run-id", runId],
      ["--max-workers", "2"],
      // A backstop only: the run ends on the pause. A queued integration that no
      // drain picks up would hold the second target until this cap instead.
      ["--max-iterations", "400"],
      ["--idle-sleep-ms", "20"],
      ["--graph-db", graphDbPath],
    ]), {
      workerJobDeps: {
        executor: failingFirstWorkerExecutor(stateDir, starts),
        provisionSandbox: async () => ({ sandboxId: `sandbox-${randomUUID()}`, workspaceRoot: repoRoot }),
      },
    });

    expect(result.stoppedReason).toBe("paused");
    expect(starts).toEqual([
      { symbol: "walkToCurPathNode", integrationJobsAtStart: [] },
      { symbol: "zigzagToCurPathNode", integrationJobsAtStart: ["succeeded"] },
    ]);
    const check = openState(stateDir);
    try {
      expect(check.db.query(`SELECT json_extract(jobs.payload_json, '$.metadata.recovered_by') AS recovered_by, integration_outcomes.status
        FROM jobs JOIN integration_outcomes ON integration_outcomes.id = jobs.job_id
        WHERE jobs.kind = 'integration' AND jobs.run_id = ?`).all(runId)).toEqual([{ recovered_by: "recover-claims", status: "skipped" }]);
    } finally {
      check.db.close();
    }
  }, 60_000);
});
