#!/usr/bin/env bun
import { existsSync, readFileSync } from "node:fs";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { leaseNextQueuedTarget, openState } from "../src/state/index.js";

type SqlBinding = string | number | bigint | boolean | null | Uint8Array;

interface CommandResult {
  command: string[];
  stdout: string;
  stderr: string;
}

interface AssertionRecord {
  name: string;
  passed: boolean;
}

const packageRoot = resolve(import.meta.dir, "..");
const fixtureRoot = resolve(packageRoot, "testdata/smoke_repo");
let stateDir = "";
const commands: CommandResult[] = [];
const assertions: AssertionRecord[] = [];

function assertSmoke(name: string, condition: unknown): void {
  const passed = Boolean(condition);
  assertions.push({ name, passed });
  if (!passed) throw new Error(`Smoke assertion failed: ${name}`);
}

async function runCli(args: string[]): Promise<CommandResult> {
  const command = ["bun", "src/bin/decomp-orchestrator.ts", ...args];
  const proc = Bun.spawn(command, {
    cwd: packageRoot,
    stdout: "pipe",
    stderr: "pipe",
  });
  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  const exitCode = await proc.exited;
  const result = { command, stdout, stderr };
  commands.push(result);
  if (exitCode !== 0) {
    throw new Error(`Command failed (${exitCode}): ${command.join(" ")}\n${stderr || stdout}`);
  }
  return result;
}

function parseJson<T>(result: CommandResult): T {
  return JSON.parse(result.stdout) as T;
}

function count(store: ReturnType<typeof openState>, sql: string, ...params: SqlBinding[]): number {
  const row = store.db.query(sql).get(...params) as Record<string, unknown>;
  return Number(row.count ?? 0);
}

async function main(): Promise<void> {
  stateDir = await mkdtemp(join(tmpdir(), "decomp-orchestrator-smoke-"));
  const commonFlags = ["--repo-root", fixtureRoot, "--state-dir", stateDir, "--dry-run-agents"];

  const init = parseJson<{ run: { id: string }; targetCount: number }>(
    await runCli([...commonFlags, "init-run", "--desired-workers", "1", "--candidate-limit", "8", "--goal-kind", "matched_code_percent", "--goal-value", "72"]),
  );
  assertSmoke("init-run queues only the imperfect fixture function", init.targetCount === 1);

  const tick = parseJson<{ directorOutput: string; directorCycleId: string; directorSystemPrompt: string; directorUserPrompt: string }>(
    await runCli([...commonFlags, "tick", "--run-id", init.run.id, "--candidate-limit", "8"]),
  );
  const worker = parseJson<{
    leaseId: string;
    workerOutput: string;
    workerSystemPrompt: string;
    workerUserPrompt: string;
    workerReport: string;
    wakeEvent: string;
  }>(await runCli([...commonFlags, "worker", "--run-id", init.run.id, "--worker-id", "smoke-worker-1", "--report-type", "stalled_no_useful_guess"]));
  const status = parseJson<Record<string, unknown>>(await runCli([...commonFlags, "status"]));

  const store = openState(stateDir);
  try {
    const runId = init.run.id;
    assertSmoke("runs row exists", count(store, "SELECT COUNT(*) AS count FROM runs WHERE id = ?", runId) === 1);
    assertSmoke("targets row exists", count(store, "SELECT COUNT(*) AS count FROM targets WHERE run_id = ?", runId) === 1);
    assertSmoke("queue row exists", count(store, "SELECT COUNT(*) AS count FROM queue WHERE run_id = ?", runId) === 1);
    assertSmoke("events include run start and worker wake", count(store, "SELECT COUNT(*) AS count FROM events WHERE run_id = ?", runId) >= 2);
    assertSmoke("run_started event handled", count(store, "SELECT COUNT(*) AS count FROM events WHERE run_id = ? AND event_type = 'run_started' AND handled_at IS NOT NULL", runId) === 1);
    assertSmoke("worker wake remains unhandled", count(store, "SELECT COUNT(*) AS count FROM events WHERE run_id = ? AND event_type = 'worker_stalled' AND handled_at IS NULL", runId) === 1);
    assertSmoke("director session row exists", count(store, "SELECT COUNT(*) AS count FROM pi_sessions WHERE run_id = ? AND role = 'director' AND status = 'dry_run'", runId) === 1);
    assertSmoke("worker session row exists", count(store, "SELECT COUNT(*) AS count FROM pi_sessions WHERE run_id = ? AND role = 'worker' AND lease_id = ? AND status = 'dry_run'", runId, worker.leaseId) === 1);
    assertSmoke("director cycle row exists", count(store, "SELECT COUNT(*) AS count FROM director_cycles WHERE run_id = ?", runId) === 1);
    assertSmoke("lease row exists", count(store, "SELECT COUNT(*) AS count FROM leases WHERE id = ? AND status = 'released_stalled'", worker.leaseId) === 1);
    assertSmoke("released lease removes file lock row", count(store, "SELECT COUNT(*) AS count FROM file_locks WHERE lease_id = ?", worker.leaseId) === 0);
    assertSmoke("worker report row exists", count(store, "SELECT COUNT(*) AS count FROM worker_reports WHERE lease_id = ? AND report_type = 'stalled_no_useful_guess'", worker.leaseId) === 1);
  } finally {
    store.db.close();
  }

  const recoveryStateDir = await mkdtemp(join(tmpdir(), "decomp-orchestrator-recover-smoke-"));
  const recoveryFlags = ["--repo-root", fixtureRoot, "--state-dir", recoveryStateDir, "--dry-run-agents"];
  const recoveryInit = parseJson<{ run: { id: string } }>(
    await runCli([
      ...recoveryFlags,
      "init-run",
      "--desired-workers",
      "1",
      "--candidate-limit",
      "8",
      "--goal-kind",
      "matched_code_percent",
      "--goal-value",
      "72",
    ]),
  );
  const recoveryStore = openState(recoveryStateDir);
  let recoveryLeaseId = "";
  try {
    const leased = leaseNextQueuedTarget({
      store: recoveryStore,
      runId: recoveryInit.run.id,
      workerId: "interrupted-smoke-worker",
      baseRev: "smoke-base",
      ttlSeconds: 3600,
    });
    assertSmoke("recovery smoke created an active lease", Boolean(leased));
    recoveryLeaseId = leased?.leaseId ?? "";
  } finally {
    recoveryStore.db.close();
  }
  const recovered = parseJson<{ recoveredLeases: number }>(
    await runCli([...recoveryFlags, "recover-leases", "--run-id", recoveryInit.run.id, "--force", "--reason", "smoke interrupted worker"]),
  );
  const recoveredStore = openState(recoveryStateDir);
  try {
    assertSmoke("recover-leases recovers one active lease", recovered.recoveredLeases === 1);
    assertSmoke("recover-leases releases lease", count(recoveredStore, "SELECT COUNT(*) AS count FROM leases WHERE id = ? AND status = 'released_stalled'", recoveryLeaseId) === 1);
    assertSmoke("recover-leases writes worker report row", count(recoveredStore, "SELECT COUNT(*) AS count FROM worker_reports WHERE lease_id = ? AND report_type = 'stalled_no_useful_guess'", recoveryLeaseId) === 1);
    assertSmoke("recover-leases emits worker stalled wake event", count(recoveredStore, "SELECT COUNT(*) AS count FROM events WHERE run_id = ? AND event_type = 'worker_stalled' AND handled_at IS NULL", recoveryInit.run.id) === 1);
    assertSmoke("recover-leases leaves no active leases", count(recoveredStore, "SELECT COUNT(*) AS count FROM leases WHERE status = 'active'") === 0);
    assertSmoke("recover-leases removes recovered file lock", count(recoveredStore, "SELECT COUNT(*) AS count FROM file_locks WHERE lease_id = ?", recoveryLeaseId) === 0);
    recoveredStore.db
      .query("UPDATE queue SET status = 'queued', leased_at = NULL WHERE id = (SELECT queue_id FROM leases WHERE id = ?)")
      .run(recoveryLeaseId);
    recoveredStore.db
      .query(
        `
          UPDATE targets
          SET status = 'queued'
          WHERE id = (
            SELECT queue.target_id
            FROM queue
            JOIN leases ON leases.queue_id = queue.id
            WHERE leases.id = ?
          )
        `,
      )
      .run(recoveryLeaseId);
    const released = leaseNextQueuedTarget({
      store: recoveredStore,
      runId: recoveryInit.run.id,
      workerId: "reused-lock-smoke-worker",
      baseRev: "smoke-base",
      ttlSeconds: 3600,
    });
    assertSmoke("released file lock does not block a later lease for the same path", Boolean(released));
  } finally {
    recoveredStore.db.close();
  }

  const triggerStateDir = await mkdtemp(join(tmpdir(), "decomp-orchestrator-trigger-smoke-"));
  const triggerFlags = ["--repo-root", fixtureRoot, "--state-dir", triggerStateDir, "--dry-run-agents"];
  const triggerInit = parseJson<{ run: { id: string } }>(
    await runCli([
      ...triggerFlags,
      "init-run",
      "--desired-workers",
      "1",
      "--candidate-limit",
      "8",
      "--goal-kind",
      "matched_code_percent",
      "--goal-value",
      "72",
    ]),
  );
  const triggerRun = parseJson<{
    stoppedReason: string;
    directorTicks: number;
    workersStarted: number;
    workerResults: unknown[];
    workerErrors: unknown[];
    finalStatus: { activeWorkers: number; queuedTargets: number; unhandledEvents: number };
  }>(
    await runCli([
      ...triggerFlags,
      "trigger-agent",
      "--run-id",
      triggerInit.run.id,
      "--max-workers",
      "1",
      "--max-iterations",
      "5",
      "--max-idle-iterations",
      "1",
      "--idle-sleep-ms",
      "1",
      "--candidate-limit",
      "8",
    ]),
  );
  const triggerStore = openState(triggerStateDir);
  try {
    assertSmoke("trigger-agent rests after bounded idle", triggerRun.stoppedReason === "idle");
    assertSmoke("trigger-agent wakes director for run and worker event", triggerRun.directorTicks === 2);
    assertSmoke("trigger-agent starts one worker for fixture target", triggerRun.workersStarted === 1);
    assertSmoke("trigger-agent captures worker result", triggerRun.workerResults.length === 1);
    assertSmoke("trigger-agent has no worker errors", triggerRun.workerErrors.length === 0);
    assertSmoke("trigger-agent leaves no active workers", triggerRun.finalStatus.activeWorkers === 0);
    assertSmoke("trigger-agent drains unhandled events", triggerRun.finalStatus.unhandledEvents === 0);
    assertSmoke("trigger-agent records two director cycles", count(triggerStore, "SELECT COUNT(*) AS count FROM director_cycles WHERE run_id = ?", triggerInit.run.id) === 2);
    assertSmoke("trigger-agent records one worker report", count(triggerStore, "SELECT COUNT(*) AS count FROM worker_reports") === 1);
    assertSmoke("trigger-agent handled all wake events", count(triggerStore, "SELECT COUNT(*) AS count FROM events WHERE run_id = ? AND handled_at IS NULL", triggerInit.run.id) === 0);
  } finally {
    triggerStore.db.close();
  }

  const initialBoard = resolve(stateDir, "runs", init.run.id, "snapshots", "initial_board.json");
  const smokeSummaryPath = resolve(stateDir, "runs", init.run.id, "smoke_summary.json");
  assertSmoke("initial board snapshot artifact exists", existsSync(initialBoard));
  assertSmoke("director dry-run artifact exists", existsSync(tick.directorOutput));
  assertSmoke("director system prompt artifact exists", existsSync(tick.directorSystemPrompt));
  assertSmoke("director user prompt artifact exists", existsSync(tick.directorUserPrompt));
  assertSmoke("worker dry-run artifact exists", existsSync(worker.workerOutput));
  assertSmoke("worker system prompt artifact exists", existsSync(worker.workerSystemPrompt));
  assertSmoke("worker user prompt artifact exists", existsSync(worker.workerUserPrompt));
  assertSmoke("worker report artifact exists", existsSync(worker.workerReport));
  assertSmoke("status output includes worker report count", Number(status.workerReports ?? 0) === 1);
  const directorSystemPrompt = readFileSync(tick.directorSystemPrompt, "utf8");
  const directorUserPrompt = readFileSync(tick.directorUserPrompt, "utf8");
  const workerSystemPrompt = readFileSync(worker.workerSystemPrompt, "utf8");
  const workerUserPrompt = readFileSync(worker.workerUserPrompt, "utf8");
  const renderedPrompts = [directorSystemPrompt, directorUserPrompt, workerSystemPrompt, workerUserPrompt].join("\n");
  assertSmoke("director system prompt names director role", directorSystemPrompt.includes("director Pi agent"));
  assertSmoke("director user prompt includes current state", directorUserPrompt.includes("<current_state_json>"));
  assertSmoke("worker system prompt names lease write-set rule", workerSystemPrompt.includes("write_set"));
  assertSmoke("worker system prompt requires local regression ledger", workerSystemPrompt.includes("local regression ledger"));
  assertSmoke("worker system prompt has local regression output contract", workerSystemPrompt.includes("local_regression_check"));
  assertSmoke("worker user prompt forbids unresolved local regressions", workerUserPrompt.includes("unresolved local regression"));
  assertSmoke("worker user prompt includes primary source path", workerUserPrompt.includes("src/melee/ft/chara/ftDemo.c"));
  assertSmoke("director dry-run uses gpt-5.5", readFileSync(tick.directorOutput, "utf8").includes("model: gpt-5.5"));
  assertSmoke("director dry-run uses xhigh thinking", readFileSync(tick.directorOutput, "utf8").includes("thinking: xhigh"));
  assertSmoke("worker dry-run uses gpt-5.5", readFileSync(worker.workerOutput, "utf8").includes("model: gpt-5.5"));
  assertSmoke("worker dry-run uses xhigh thinking", readFileSync(worker.workerOutput, "utf8").includes("thinking: xhigh"));
  assertSmoke("rendered prompts do not reference design doc", !renderedPrompts.includes("decomp-orchestrator-design.html"));
  assertSmoke("rendered prompts do not reference Codex skill paths", !renderedPrompts.includes(".codex/skills"));
  assertSmoke("rendered prompts include structured past PR index", renderedPrompts.includes("decomp-orchestrator/knowledge/past_prs/prs/index.jsonl"));
  assertSmoke("rendered prompts include data sheet resources", renderedPrompts.includes("data_sheets/ssbm_data_sheet_1_02/csv"));
  assertSmoke("rendered prompts include knowledge manifest", renderedPrompts.includes("decomp-orchestrator/knowledge/manifest.json"));
  assertSmoke("rendered prompts include director scheduling reference", renderedPrompts.includes("references/director/scheduling.md"));
  assertSmoke("rendered prompts include targeted iteration workflow", renderedPrompts.includes("workflows/targeted-iteration.md"));
  assertSmoke("rendered prompts omit legacy sweep workflow", !renderedPrompts.includes("melee-decomp-sweep"));
  assertSmoke("rendered prompts include decomp context helper", renderedPrompts.includes("decomp_context_lookup.py"));

  const summary = {
    state_dir: stateDir,
    fixture_root: fixtureRoot,
    run_id: init.run.id,
    commands: commands.map((command) => command.command),
    row_counts: {
      runs: 1,
      targets: 1,
      queue: 1,
      events: 2,
      pi_sessions: 2,
      director_cycles: 1,
      leases: 1,
      file_locks: 0,
      worker_reports: 1,
    },
    artifacts: {
      initial_board: initialBoard,
      director_output: tick.directorOutput,
      director_system_prompt: tick.directorSystemPrompt,
      director_user_prompt: tick.directorUserPrompt,
      worker_output: worker.workerOutput,
      worker_system_prompt: worker.workerSystemPrompt,
      worker_user_prompt: worker.workerUserPrompt,
      worker_report: worker.workerReport,
      smoke_summary: smokeSummaryPath,
    },
    status,
    assertions,
  };
  await writeFile(smokeSummaryPath, JSON.stringify(summary, null, 2));
  assertSmoke("smoke summary artifact exists", existsSync(smokeSummaryPath));

  console.log(JSON.stringify({ ok: true, stateDir, runId: init.run.id, summaryPath: smokeSummaryPath }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  if (stateDir) console.error(`Smoke state dir: ${stateDir}`);
  process.exit(1);
});
