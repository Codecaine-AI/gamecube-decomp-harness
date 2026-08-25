import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { packageRoot } from "@server/core/knowledge";
import type { WorkerCycleResult } from "@server/core/cycle-runtime/phases/running/workers/worker-cycle.js";
import type { GlobalArgs, WriteSetIntegrationFlags } from "@server/core/game-registry/runtime-options.js";
import {
  isHostToolPlatform,
  requiredStateToolArtifactError,
  resolveStateToolArtifact,
  resolveToolPlatform,
} from "@server/core/tools/platform.js";
import type { TaskHandle, TaskOutcome, TaskSpec, TaskStatus, WorkerExecutor } from "./types.js";

function orchestratorRoot(): string {
  return packageRoot();
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

export function defaultConfigureCommand(globals: Pick<GlobalArgs, "repoRoot" | "stateDir">): string {
  const toolPlatform = resolveToolPlatform();
  const localWibo = resolve(globals.repoRoot, "build", "tools", "wibo");
  if (isHostToolPlatform(toolPlatform) && existsSync(localWibo)) {
    return "python3 configure.py --require-protos --wrapper build/tools/wibo";
  }
  const wibo = resolveStateToolArtifact({ stateDir: globals.stateDir, name: "wibo", platform: toolPlatform });
  if (wibo) {
    return `python3 configure.py --require-protos --wrapper ${shellQuote(wibo)}`;
  }
  if (!isHostToolPlatform(toolPlatform)) {
    throw requiredStateToolArtifactError({ stateDir: globals.stateDir, name: "wibo", platform: toolPlatform });
  }
  return "python3 configure.py --require-protos";
}

export function workerProcessEnv(globals: Pick<GlobalArgs, "stateDir">): Record<string, string | undefined> {
  const env: Record<string, string | undefined> = { ...Bun.env };
  const toolPlatform = resolveToolPlatform();
  const wibo = resolveStateToolArtifact({ stateDir: globals.stateDir, name: "wibo", platform: toolPlatform });
  if (wibo) {
    env.MWCC_WIBO = wibo;
  } else if (!isHostToolPlatform(toolPlatform)) {
    throw requiredStateToolArtifactError({ stateDir: globals.stateDir, name: "wibo", platform: toolPlatform });
  }
  return env;
}

export function workerCommand(
  globals: GlobalArgs,
  params: {
    runId: string;
    workerId: string;
    baseRev: string;
    ttlSeconds: number;
    thinkingLevel: string;
    postReturnCheckCommand: string;
    workerConfigureCommand: string;
    graphDbPath: string;
    leaseId: string;
    writeSetFlags: WriteSetIntegrationFlags;
  },
): string[] {
  const bin = resolve(orchestratorRoot(), "apps/server/src/job-runner.ts");
  const command = [
    "bun", bin, "--repo-root", globals.repoRoot, "--state-dir", globals.stateDir,
    "--provider", globals.provider, "--model", globals.model, "--thinking-level", params.thinkingLevel,
  ];
  if (globals.gameId) command.splice(2, 0, "--game", globals.gameId);
  if (globals.dryRunAgents) command.push("--dry-run-agents");
  if (globals.agentTimeoutSeconds != null) command.push("--agent-timeout-seconds", String(globals.agentTimeoutSeconds));
  command.push("worker", "--run-id", params.runId, "--worker-id", params.workerId, "--base-rev", params.baseRev);
  if (params.postReturnCheckCommand) command.push("--post-return-check-command", params.postReturnCheckCommand);
  if (params.workerConfigureCommand) command.push("--worker-configure-command", params.workerConfigureCommand);
  if (!params.leaseId.trim()) throw new Error("workerCommand requires a dispatch lease id");
  command.push("--lease-id", params.leaseId);
  command.push("--graph-db", params.graphDbPath);
  if (params.writeSetFlags.writeSetWidening !== "off") command.push("--write-set-widening", params.writeSetFlags.writeSetWidening);
  return command;
}

export async function runWorkerProcess(
  globals: GlobalArgs,
  params: {
    runId: string;
    workerId: string;
    baseRev: string;
    ttlSeconds: number;
    thinkingLevel: string;
    postReturnCheckCommand: string;
    workerConfigureCommand: string;
    graphDbPath: string;
    leaseId: string;
    writeSetFlags: WriteSetIntegrationFlags;
  },
  procRegistry?: Set<{ kill: (signal?: number) => void; exited: Promise<number> }>,
): Promise<WorkerCycleResult> {
  const command = workerCommand(globals, params);
  let timedOut = false;
  const proc = Bun.spawn(command, { cwd: orchestratorRoot(), env: workerProcessEnv(globals), stdout: "pipe", stderr: "pipe" });
  procRegistry?.add(proc);
  void proc.exited.finally(() => procRegistry?.delete(proc));
  const timeoutMs = Math.max(60_000, Math.floor(params.ttlSeconds * 1000));
  const timeout = setTimeout(() => { timedOut = true; proc.kill(9); }, timeoutMs);
  const stdoutPromise = new Response(proc.stdout).text();
  const stderrPromise = new Response(proc.stderr).text();
  const [stdout, stderr, exitCode] = await Promise.all([stdoutPromise, stderrPromise, proc.exited]).finally(() => clearTimeout(timeout));
  if (timedOut) throw new Error(`Worker process timed out after ${Math.round(timeoutMs / 1000)}s: ${command.join(" ")}\n${stderr || stdout}`);
  if (exitCode !== 0) throw new Error(`Worker process failed (${exitCode}): ${command.join(" ")}\n${stderr || stdout}`);
  try {
    return JSON.parse(stdout) as WorkerCycleResult;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Worker process returned non-JSON output: ${detail}\n${stdout}\n${stderr}`);
  }
}

interface LocalEntry {
  proc: ReturnType<typeof Bun.spawn>;
  stdout: Promise<string>;
  stderr: Promise<string>;
  startedAt: string;
  timedOut: boolean;
  cancelled: boolean;
  deadPid: boolean;
  timer: ReturnType<typeof setTimeout> | null;
}

interface LocalProcessExecutorOptions {
  isPidAlive?: (pid: number) => boolean;
  deadProcessCollectDeadlineMs?: number;
}

function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error && typeof error === "object" && "code" in error) {
      if (error.code === "ESRCH") return false;
      if (error.code === "EPERM") return true;
    }
    throw error;
  }
}

export class LocalProcessExecutor implements WorkerExecutor {
  readonly #entries = new Map<string, LocalEntry>();
  readonly #isPidAlive: (pid: number) => boolean;
  readonly #deadProcessCollectDeadlineMs: number;

  constructor(options: LocalProcessExecutorOptions = {}) {
    this.#isPidAlive = options.isPidAlive ?? isPidAlive;
    this.#deadProcessCollectDeadlineMs = options.deadProcessCollectDeadlineMs ?? 100;
  }

  async submit(task: TaskSpec): Promise<TaskHandle> {
    const handleId = randomUUID();
    const startedAt = new Date().toISOString();
    const proc = Bun.spawn(task.command, { cwd: task.cwd, env: task.env, stdout: "pipe", stderr: "pipe" });
    const entry: LocalEntry = {
      proc,
      stdout: new Response(proc.stdout).text(),
      stderr: new Response(proc.stderr).text(),
      startedAt,
      timedOut: false,
      cancelled: false,
      deadPid: false,
      timer: null,
    };
    if (task.timeoutMs != null) {
      entry.timer = setTimeout(() => { entry.timedOut = true; proc.kill(9); }, task.timeoutMs);
    }
    this.#entries.set(handleId, entry);
    return { executorId: "local-process", handleId, pid: proc.pid, startedAt };
  }

  async poll(handle: TaskHandle): Promise<TaskStatus> {
    const entry = this.#entry(handle);
    if (entry.proc.exitCode != null) return { state: "exited" };
    if (!this.#isPidAlive(entry.proc.pid)) {
      entry.deadPid = true;
      return { state: "exited" };
    }
    return { state: "running" };
  }

  async collect(handle: TaskHandle): Promise<TaskOutcome> {
    const entry = this.#entry(handle);
    try {
      const collected = Promise.all([entry.stdout, entry.stderr, entry.proc.exited] as const);
      const [stdout, stderr, exitCode] = entry.deadPid
        ? await Promise.race([
            collected,
            new Promise<[string, string, number]>((resolve) => {
              setTimeout(() => resolve(["", "Process disappeared before its exit status could be collected", 1]), this.#deadProcessCollectDeadlineMs);
            }),
          ])
        : await collected;
      return {
        exitCode,
        signal: entry.timedOut || entry.cancelled ? "SIGKILL" : null,
        stdout,
        stderr,
        timedOut: entry.timedOut,
        startedAt: entry.startedAt,
        endedAt: new Date().toISOString(),
      };
    } finally {
      if (entry.timer) clearTimeout(entry.timer);
      entry.timer = null;
      this.#entries.delete(handle.handleId);
    }
  }

  async cancel(handle: TaskHandle): Promise<void> {
    const entry = this.#entry(handle);
    entry.cancelled = true;
    if (entry.timer) clearTimeout(entry.timer);
    entry.timer = null;
    entry.proc.kill(9);
    this.#entries.delete(handle.handleId);
  }

  #entry(handle: TaskHandle): LocalEntry {
    if (handle.executorId !== "local-process") throw new Error(`Unknown executor: ${handle.executorId}`);
    const entry = this.#entries.get(handle.handleId);
    if (!entry) throw new Error(`Unknown local process handle: ${handle.handleId}`);
    return entry;
  }
}
