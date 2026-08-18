import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { packageRoot } from "@server/core/knowledge";
import { getLatestRun, openState, statusSnapshot } from "@server/core/cycle-runtime/run-state";
import { settleSupervisedRun } from "@server/core/cycle-runtime/phases/running/jobs/settle-supervised-run.js";
import { booleanArg, numberArg, stringArg, type GlobalArgs } from "@server/core/game-registry/runtime-options.js";

interface TriggerWorkerError {
  workerId: string;
  error: string;
}

interface TriggerProcessResult {
  stoppedReason?: string;
  workerErrors?: TriggerWorkerError[];
  finalStatus?: {
    activeWorkers?: number;
    admittedTargets?: number;
    unhandledEvents?: number;
  };
}

interface ChildRun {
  id: string;
  ordinal: number;
  command: string[];
  startedAt: string;
  endedAt: string;
  exitCode: number;
  stdoutPath: string;
  stderrPath: string;
  resultPath: string;
  classification: "clean" | "incident" | "signal";
  reason: string;
  workerErrors: TriggerWorkerError[];
  incidentPath?: string;
}

interface RecoveryRun {
  id: string;
  command: string[];
  startedAt: string;
  endedAt: string;
  exitCode: number;
  stdoutPath: string;
  stderrPath: string;
  resultPath: string;
  reason: string;
}

export interface BabysitResult {
  runId?: string;
  mode: "babysit";
  stoppedReason: string;
  systemCommand: SystemCommand;
  systemRuns: ChildRun[];
  recoveries: RecoveryRun[];
  incidents: number;
  restarts: number;
  dryRun: boolean;
  finalStatus: Record<string, unknown>;
}

type SystemCommand = "run-loop";

function sleep(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

function shortId(): string {
  return randomUUID().slice(0, 8);
}

function timestampSlug(date = new Date()): string {
  return date.toISOString().replace(/[:.]/g, "-");
}

function jsonText(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function orchestratorRoot(): string {
  return packageRoot();
}

function packageBin(): string {
  return resolve(orchestratorRoot(), "apps/server/src/job-runner.ts");
}

function globalFlags(globals: GlobalArgs): string[] {
  const flags = [];
  if (globals.gameId) flags.push("--game", globals.gameId);
  flags.push(
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
  );
  if (globals.dryRunAgents) flags.push("--dry-run-agents");
  if (globals.agentTimeoutSeconds != null) flags.push("--agent-timeout-seconds", String(globals.agentTimeoutSeconds));
  return flags;
}

function systemCommandArg(args: Map<string, string | true>): SystemCommand {
  const command = stringArg(args, "--system-command", "run-loop");
  if (command === "run-loop") return command;
  throw new Error("--system-command must be run-loop");
}

function systemArgs(args: Map<string, string | true>): string[] {
  const out: string[] = [];
  for (const [key, value] of args.entries()) {
    out.push(key);
    if (typeof value === "string") out.push(value);
  }
  return out;
}

function parseJsonOutput(text: string): TriggerProcessResult | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed) as TriggerProcessResult;
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start < 0 || end <= start) return null;
    try {
      return JSON.parse(trimmed.slice(start, end + 1)) as TriggerProcessResult;
    } catch {
      return null;
    }
  }
}

function classifyChild(exitCode: number, parsed: TriggerProcessResult | null): Pick<ChildRun, "classification" | "reason" | "workerErrors"> {
  const workerErrors = parsed?.workerErrors ?? [];
  if (parsed?.stoppedReason === "signal") {
    return { classification: "signal", reason: "child_received_signal", workerErrors };
  }
  if (exitCode !== 0) {
    return { classification: "incident", reason: `child_exit_${exitCode}`, workerErrors };
  }
  if (parsed?.stoppedReason === "worker_error" || workerErrors.length > 0) {
    return { classification: "incident", reason: "worker_error", workerErrors };
  }
  if (Number(parsed?.finalStatus?.activeWorkers ?? 0) > 0) {
    return { classification: "incident", reason: "active_workers_after_child_exit", workerErrors };
  }
  return { classification: "clean", reason: parsed?.stoppedReason ?? "child_clean_exit", workerErrors };
}

async function currentRunId(globals: GlobalArgs, args: Map<string, string | true>): Promise<string | undefined> {
  const explicit = stringArg(args, "--run-id", "");
  if (explicit) return explicit;
  const store = openState(globals.stateDir);
  try {
    return getLatestRun(store)?.id;
  } finally {
    store.db.close();
  }
}

async function finalStatus(globals: GlobalArgs): Promise<Record<string, unknown>> {
  const store = openState(globals.stateDir);
  try {
    return statusSnapshot(store);
  } finally {
    store.db.close();
  }
}

async function runChild(globals: GlobalArgs, args: Map<string, string | true>, ordinal: number, commandName: SystemCommand): Promise<ChildRun> {
  const id = `${String(ordinal).padStart(4, "0")}-${timestampSlug()}-${shortId()}`;
  const outputDir = resolve(globals.stateDir, "guardian", "system_runs", id);
  await mkdir(outputDir, { recursive: true });
  const stdoutPath = resolve(outputDir, "stdout.txt");
  const stderrPath = resolve(outputDir, "stderr.txt");
  const resultPath = resolve(outputDir, "result.json");
  const command = ["bun", packageBin(), ...globalFlags(globals), commandName, ...systemArgs(args)];
  const startedAt = new Date().toISOString();
  const proc = Bun.spawn(command, {
    cwd: orchestratorRoot(),
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
  const endedAt = new Date().toISOString();
  await writeFile(stdoutPath, stdout);
  await writeFile(stderrPath, stderr);
  const parsed = parseJsonOutput(stdout);
  const classification = classifyChild(exitCode, parsed);
  const run = {
    id,
    ordinal,
    command,
    startedAt,
    endedAt,
    exitCode,
    stdoutPath,
    stderrPath,
    resultPath,
    ...classification,
  };
  await writeFile(
    resultPath,
    jsonText({
      ...run,
      parsedResult: parsed,
      stderr: stderr ? { path: stderrPath, bytes: stderr.length } : null,
      stdout: { path: stdoutPath, bytes: stdout.length },
    }),
  );
  return run;
}

async function writeIncident(globals: GlobalArgs, runId: string | undefined, child: ChildRun): Promise<string> {
  const incidentId = `${timestampSlug()}-${shortId()}`;
  const incidentDir = resolve(globals.stateDir, "guardian", "incidents");
  await mkdir(incidentDir, { recursive: true });
  const incidentPath = resolve(incidentDir, `${incidentId}.json`);
  await writeFile(
    incidentPath,
    jsonText({
      id: incidentId,
      runId,
      createdAt: new Date().toISOString(),
      reason: child.reason,
      systemRun: {
        id: child.id,
        command: child.command,
        exitCode: child.exitCode,
        stdoutPath: child.stdoutPath,
        stderrPath: child.stderrPath,
        resultPath: child.resultPath,
      },
      workerErrors: child.workerErrors,
    }),
  );
  return incidentPath;
}

async function runRecoveryCommand(
  globals: GlobalArgs,
  reason: string,
  runId: string,
  ordinal: number,
  extraArgs: string[],
): Promise<RecoveryRun> {
  const id = `${String(ordinal).padStart(4, "0")}-${timestampSlug()}-${shortId()}`;
  const outputDir = resolve(globals.stateDir, "guardian", "recoveries", id);
  await mkdir(outputDir, { recursive: true });
  const stdoutPath = resolve(outputDir, "stdout.txt");
  const stderrPath = resolve(outputDir, "stderr.txt");
  const resultPath = resolve(outputDir, "result.json");
  const command = ["bun", packageBin(), ...globalFlags(globals), "recover-claims", "--run-id", runId, "--reason", reason, ...extraArgs];
  const startedAt = new Date().toISOString();
  const proc = Bun.spawn(command, {
    cwd: orchestratorRoot(),
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
  const endedAt = new Date().toISOString();
  await writeFile(stdoutPath, stdout);
  await writeFile(stderrPath, stderr);
  const recovery = { id, command, startedAt, endedAt, exitCode, stdoutPath, stderrPath, resultPath, reason };
  await writeFile(
    resultPath,
    jsonText({
      ...recovery,
      parsedResult: parseJsonOutput(stdout),
      stderr: stderr ? { path: stderrPath, bytes: stderr.length } : null,
      stdout: { path: stdoutPath, bytes: stdout.length },
    }),
  );
  return recovery;
}

async function recoverAfterIncident(
  globals: GlobalArgs,
  args: Map<string, string | true>,
  runId: string | undefined,
  child: ChildRun,
  firstRecoveryOrdinal: number,
): Promise<RecoveryRun[]> {
  if (booleanArg(args, "--no-recover-claims") || !runId) return [];
  const recoveries: RecoveryRun[] = [];
  let ordinal = firstRecoveryOrdinal;
  const leaseId = stringArg(args, "--lease-id", "").trim();
  const leaseArgs = leaseId ? ["--lease-id", leaseId] : [];
  const failedWorkerIds = [...new Set(child.workerErrors.map((error) => error.workerId).filter(Boolean))];
  for (const workerId of failedWorkerIds) {
    ordinal += 1;
    recoveries.push(
      await runRecoveryCommand(globals, `babysit recovered failed worker process ${workerId}: ${child.reason}`, runId, ordinal, [
        ...leaseArgs,
        "--force",
        "--worker-id",
        workerId,
      ]),
    );
  }
  if (failedWorkerIds.length === 0) {
    const extraArgs = [...leaseArgs, ...(booleanArg(args, "--force-recover-claims") ? ["--force"] : [])];
    ordinal += 1;
    recoveries.push(await runRecoveryCommand(globals, `babysit recovery after ${child.reason}`, runId, ordinal, extraArgs));
  }
  return recoveries;
}

export async function runBabysit(globals: GlobalArgs, args: Map<string, string | true>): Promise<BabysitResult> {
  const leaseId = stringArg(args, "--lease-id", "");
  const commandName = systemCommandArg(args);
  const maxRestarts = Math.max(0, numberArg(args, "--max-restarts", 0));
  const maxSystemRuns = Math.max(0, numberArg(args, "--max-system-runs", 0));
  const restartDelayMs = Math.max(0, numberArg(args, "--restart-delay-ms", 1_000));
  const restartOnCleanExit = booleanArg(args, "--restart-on-clean-exit");
  const systemRuns: ChildRun[] = [];
  const recoveries: RecoveryRun[] = [];
  let incidents = 0;
  let restarts = 0;
  let recoveryOrdinal = 0;
  let stoppedReason = "running";
  let stopRequested = false;
  const stop = () => {
    stopRequested = true;
    stoppedReason = "signal";
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);

  try {
    while (!stopRequested) {
      const runId = await currentRunId(globals, args);
      const child = await runChild(globals, args, systemRuns.length + 1, commandName);
      systemRuns.push(child);
      if (maxSystemRuns > 0 && systemRuns.length >= maxSystemRuns && child.classification === "clean" && !restartOnCleanExit) {
        stoppedReason = "max_system_runs";
        break;
      }

      if (child.classification === "signal") {
        stoppedReason = "child_signal";
        break;
      }

      if (child.classification === "clean") {
        if (!restartOnCleanExit) {
          stoppedReason = "system_clean_exit";
          break;
        }
        if (maxSystemRuns > 0 && systemRuns.length >= maxSystemRuns) {
          stoppedReason = "max_system_runs";
          break;
        }
        await sleep(restartDelayMs);
        continue;
      }

      incidents += 1;
      child.incidentPath = await writeIncident(globals, runId, child);
      const newRecoveries = await recoverAfterIncident(globals, args, runId, child, recoveryOrdinal);
      recoveryOrdinal += newRecoveries.length;
      recoveries.push(...newRecoveries);
      if (maxRestarts > 0 && restarts >= maxRestarts) {
        stoppedReason = "max_restarts";
        break;
      }
      if (maxSystemRuns > 0 && systemRuns.length >= maxSystemRuns) {
        stoppedReason = "max_system_runs";
        break;
      }
      restarts += 1;
      await sleep(restartDelayMs);
    }
    if (stoppedReason === "running") stoppedReason = "complete";
    return {
      runId: await currentRunId(globals, args),
      mode: "babysit",
      stoppedReason,
      systemCommand: commandName,
      systemRuns,
      recoveries,
      incidents,
      restarts,
      dryRun: globals.dryRunAgents,
      finalStatus: await finalStatus(globals),
    };
  } finally {
    process.off("SIGINT", stop);
    process.off("SIGTERM", stop);
    await settleSupervisedRun({ globals, args, leaseId, stoppedReason });
  }
}

export async function babysit(globals: GlobalArgs, args: Map<string, string | true>): Promise<void> {
  console.log(jsonText(await runBabysit(globals, args)));
}
