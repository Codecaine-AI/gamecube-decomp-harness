import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { activeWorkerCount, getLatestRun, getRun, nextUnhandledEvent, openState, type StateStore } from "../../state/index.js";
import { withBusyRetry } from "../../state/db.js";
import { booleanArg, numberArg, stringArg, workerReportTypeArg, type GlobalArgs } from "../args.js";
import { assertSchedulableRun } from "./shared.js";
import { runDirectorTick, type DirectorTickResult } from "./tick.js";
import type { WorkerCycleResult } from "./worker.js";

interface WorkerError {
  workerId: string;
  error: string;
}

export interface TriggerAgentResult {
  runId: string;
  mode: "trigger_agent";
  stoppedReason: string;
  iterations: number;
  idleIterations: number;
  desiredWorkers: number;
  maxWorkers: number;
  directorTicks: number;
  workersStarted: number;
  workerResults: WorkerCycleResult[];
  workerErrors: WorkerError[];
  dryRun: boolean;
  finalStatus: {
    activeWorkers: number;
    queuedTargets: number;
    unhandledEvents: number;
  };
}

function sleep(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function scalar(store: StateStore, sql: string, runId: string): number {
  const row = withBusyRetry(() => store.db.query(sql).get(runId) as Record<string, unknown>);
  return Number(row.count ?? 0);
}

function queuedTargetCount(store: StateStore, runId: string): number {
  return scalar(store, "SELECT COUNT(*) AS count FROM queue WHERE run_id = ? AND status = 'queued'", runId);
}

function unhandledEventCount(store: StateStore, runId: string): number {
  return scalar(store, "SELECT COUNT(*) AS count FROM events WHERE run_id = ? AND handled_at IS NULL", runId);
}

function cloneArgs(args: Map<string, string | true>, entries: [string, string | true][]): Map<string, string | true> {
  const next = new Map(args);
  for (const [key, value] of entries) next.set(key, value);
  return next;
}

async function waitForRestingTrigger(runningWorkers: Set<Promise<void>>, idleSleepMs: number): Promise<void> {
  if (runningWorkers.size === 0) {
    await sleep(idleSleepMs);
    return;
  }
  await Promise.race([sleep(idleSleepMs), ...runningWorkers]);
}

function workerCommand(globals: GlobalArgs, params: { runId: string; workerId: string; reportType: string; baseRev: string; ttlSeconds: number }): string[] {
  const packageRoot = resolve(import.meta.dir, "../../..");
  const bin = resolve(packageRoot, "src/bin/decomp-orchestrator.ts");
  const command = [
    "bun",
    bin,
    "--repo-root",
    globals.repoRoot,
    "--state-dir",
    globals.stateDir,
    "--provider",
    globals.provider,
    "--model",
    globals.model,
    "--thinking-level",
    globals.thinkingLevel,
  ];
  if (globals.dryRunAgents) command.push("--dry-run-agents");
  if (globals.agentTimeoutSeconds != null) command.push("--agent-timeout-seconds", String(globals.agentTimeoutSeconds));
  command.push(
    "worker",
    "--run-id",
    params.runId,
    "--worker-id",
    params.workerId,
    "--report-type",
    params.reportType,
    "--base-rev",
    params.baseRev,
    "--ttl-seconds",
    String(params.ttlSeconds),
  );
  return command;
}

async function runWorkerProcess(
  globals: GlobalArgs,
  params: { runId: string; workerId: string; reportType: string; baseRev: string; ttlSeconds: number },
): Promise<WorkerCycleResult> {
  const packageRoot = resolve(import.meta.dir, "../../..");
  const command = workerCommand(globals, params);
  const proc = Bun.spawn(command, {
    cwd: packageRoot,
    stdout: "pipe",
    stderr: "pipe",
  });
  const stdoutPromise = new Response(proc.stdout).text();
  const stderrPromise = new Response(proc.stderr).text();
  const [stdout, stderr, exitCode] = await Promise.all([stdoutPromise, stderrPromise, proc.exited]);
  if (exitCode !== 0) {
    throw new Error(`Worker process failed (${exitCode}): ${command.join(" ")}\n${stderr || stdout}`);
  }
  try {
    return JSON.parse(stdout) as WorkerCycleResult;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Worker process returned non-JSON output: ${detail}\n${stdout}\n${stderr}`);
  }
}

export async function runTriggerAgent(globals: GlobalArgs, args: Map<string, string | true>): Promise<TriggerAgentResult> {
  const store = openState(globals.stateDir);
  const workerResults: WorkerCycleResult[] = [];
  const workerErrors: WorkerError[] = [];
  const directorResults: DirectorTickResult[] = [];
  const runningWorkers = new Set<Promise<void>>();
  let stoppedReason = "running";
  let stopRequested = false;
  let iterations = 0;
  let idleIterations = 0;
  let workersStarted = 0;
  let workerOrdinal = 0;
  const stop = () => {
    stopRequested = true;
    stoppedReason = "signal";
  };

  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);

  try {
    const runId = stringArg(args, "--run-id", getLatestRun(store)?.id ?? "");
    if (!runId) throw new Error("No run found. Run init-run first.");
    const run = getRun(store, runId);
    if (!run) throw new Error(`Run not found: ${runId}`);
    assertSchedulableRun(run, "trigger-agent");

    const candidateLimit = numberArg(args, "--candidate-limit", 50);
    const maxIterations = booleanArg(args, "--once") ? 1 : numberArg(args, "--max-iterations", 0);
    const maxIdleIterations = numberArg(args, "--max-idle-iterations", 0);
    const idleSleepMs = numberArg(args, "--idle-sleep-ms", 5_000);
    const maxWorkers = Math.max(0, Math.min(run.desiredWorkers, numberArg(args, "--max-workers", run.desiredWorkers)));
    const reportType = workerReportTypeArg(args, "--report-type", "stalled_no_useful_guess");
    const baseRev = stringArg(args, "--base-rev", "unknown");
    const ttlSeconds = numberArg(args, "--ttl-seconds", 60 * 60);

    while (!stopRequested) {
      let didWork = false;

      if (nextUnhandledEvent(store, runId)) {
        const result = await runDirectorTick(
          globals,
          cloneArgs(args, [
            ["--run-id", runId],
            ["--candidate-limit", String(candidateLimit)],
          ]),
        );
        directorResults.push(result);
        didWork = result.status !== "no_unhandled_events";
      }

      const activeWorkers = activeWorkerCount(store, runId);
      const queuedTargets = queuedTargetCount(store, runId);
      const openSlots = Math.max(0, maxWorkers - activeWorkers - runningWorkers.size);
      const workersToStart = Math.min(openSlots, queuedTargets);
      for (let index = 0; index < workersToStart; index += 1) {
        workerOrdinal += 1;
        workersStarted += 1;
        didWork = true;
        const workerId = `trigger-${process.pid}-${workerOrdinal}-${randomUUID().slice(0, 8)}`;
        let task: Promise<void>;
        task = runWorkerProcess(
          globals,
          {
            runId,
            workerId,
            reportType,
            baseRev,
            ttlSeconds,
          },
        )
          .then((result) => {
            workerResults.push(result);
          })
          .catch((error) => {
            workerErrors.push({
              workerId,
              error: error instanceof Error ? error.message : String(error),
            });
          })
          .finally(() => {
            runningWorkers.delete(task);
          });
        runningWorkers.add(task);
      }

      if (didWork || runningWorkers.size === 0) iterations += 1;
      if (didWork || runningWorkers.size > 0) idleIterations = 0;
      else idleIterations += 1;

      if (maxIterations > 0 && iterations >= maxIterations && runningWorkers.size === 0) {
        stoppedReason = "max_iterations";
        break;
      }
      if (maxIdleIterations > 0 && idleIterations >= maxIdleIterations) {
        stoppedReason = "idle";
        break;
      }

      await waitForRestingTrigger(runningWorkers, idleSleepMs);
    }

    if (runningWorkers.size > 0) await Promise.allSettled([...runningWorkers]);
    if (stoppedReason === "running") stoppedReason = "complete";

    return {
      runId,
      mode: "trigger_agent",
      stoppedReason,
      iterations,
      idleIterations,
      desiredWorkers: run.desiredWorkers,
      maxWorkers,
      directorTicks: directorResults.filter((result) => result.status !== "no_unhandled_events").length,
      workersStarted,
      workerResults,
      workerErrors,
      dryRun: globals.dryRunAgents,
      finalStatus: {
        activeWorkers: activeWorkerCount(store, runId),
        queuedTargets: queuedTargetCount(store, runId),
        unhandledEvents: unhandledEventCount(store, runId),
      },
    };
  } finally {
    process.off("SIGINT", stop);
    process.off("SIGTERM", stop);
    store.db.close();
  }
}

export async function triggerAgent(globals: GlobalArgs, args: Map<string, string | true>): Promise<void> {
  console.log(JSON.stringify(await runTriggerAgent(globals, args), null, 2));
}
