import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

export type JsonObject = Record<string, unknown>;

export interface CliResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
}

export interface ManagedProcessProject {
  graphDbPath?: string;
  id?: string;
  projectId?: string;
  repoRoot?: string;
  stateDir?: string;
}

export interface ManagedProcess {
  child: ChildProcess;
  command: string[];
  endedAt?: string;
  envOverrides?: JsonObject;
  exitCode?: number | null;
  graphDbPath?: string;
  name: string;
  pid: number;
  pidFilePath: string;
  project?: JsonObject | null;
  repoRoot?: string;
  signal?: NodeJS.Signals | null;
  startedAt: string;
  state: "draining" | "running" | "stopping" | "exited";
  stateDir?: string;
}

export interface ProcessLogLine {
  at: string;
  stream: "stdout" | "stderr" | "ui";
  text: string;
}

export interface ProcessStatusInput {
  freshRunActive: boolean;
  operation: JsonObject | null;
  project: ManagedProcessProject | null;
  projectSyncActive: boolean;
  stateDir: string;
}

export interface StartManagedInput {
  command: string[];
  env?: Record<string, string>;
  name: string;
  project: ManagedProcessProject | null;
  stateDir: string;
}

export interface StopManagedInput {
  name: string;
  project: ManagedProcessProject | null;
  recoverClaims?: boolean;
  recoveryCommand?: string[] | null;
  runCommand: (command: string[]) => Promise<CliResult>;
  stateDir: string;
}

export interface DrainManagedInput {
  name: string;
  project: ManagedProcessProject | null;
  stateDir: string;
}

export interface ManagedProcessControllerDeps {
  mirrorProcessState: (params: {
    command?: string[];
    createIfMissing?: boolean;
    endedAt?: string | null;
    graphDbPath?: string | null;
    name?: string | null;
    pid?: number | null;
    processFilePath?: string | null;
    project: ManagedProcessProject | JsonObject | null | undefined;
    repoRoot?: string | null;
    startedAt?: string | null;
    state?: string | null;
    stateDir: string;
  }) => void;
  packageRoot: string;
  projectToSummary: (project: ManagedProcessProject) => JsonObject;
}

function asObject(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonObject) : {};
}

function stringValue(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function intValue(value: unknown, fallback: number, min = 0): number {
  const parsed = Math.trunc(typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : fallback);
  return Math.max(min, Number.isFinite(parsed) ? parsed : fallback);
}

function readJsonObject(path: string): JsonObject {
  try {
    if (!path || !existsSync(path)) return {};
    return asObject(JSON.parse(readFileSync(path, "utf8")));
  } catch {
    return {};
  }
}

function processGroupAlive(pid: number): boolean {
  if (!pid) return false;
  try {
    process.kill(-pid, 0);
    return true;
  } catch {
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  }
}

function directChildPids(pid: number): number[] {
  if (!pid) return [];
  const result = spawnSync("pgrep", ["-P", String(pid)], { encoding: "utf8" });
  if (result.status !== 0) return [];
  return result.stdout
    .split(/\s+/)
    .map((value) => Number(value))
    .filter((value) => Number.isInteger(value) && value > 0);
}

function waitForProcessGroupExit(pid: number, timeoutMs: number): Promise<boolean> {
  const started = Date.now();
  return new Promise((resolveWait) => {
    const tick = (): void => {
      if (!processGroupAlive(pid)) return resolveWait(true);
      if (Date.now() - started >= timeoutMs) return resolveWait(false);
      setTimeout(tick, 200);
    };
    tick();
  });
}

function waitForExit(proc: ManagedProcess, timeoutMs: number): Promise<boolean> {
  if (proc.state === "exited") return Promise.resolve(true);
  return new Promise((resolveWait) => {
    const timeout = setTimeout(() => resolveWait(false), timeoutMs);
    proc.child.once("exit", () => {
      clearTimeout(timeout);
      resolveWait(true);
    });
  });
}

function savedCommand(saved: JsonObject | undefined): string[] {
  return Array.isArray(saved?.command) ? saved.command.map((item) => String(item)) : [];
}

export class ManagedProcessController {
  private managed: ManagedProcess | null = null;
  private readonly processLogs: ProcessLogLine[] = [];

  constructor(private readonly deps: ManagedProcessControllerDeps) {}

  appendLog(stream: ProcessLogLine["stream"], text: string): void {
    for (const raw of text.split(/\r?\n/)) {
      if (!raw.trim()) continue;
      this.processLogs.push({ at: new Date().toISOString(), stream, text: raw });
    }
    if (this.processLogs.length > 500) this.processLogs.splice(0, this.processLogs.length - 500);
  }

  pidFilePath(stateDir: string, name: string): string {
    return resolve(stateDir, "ui-processes", `${name}.json`);
  }

  writeProcessFile(proc: ManagedProcess): void {
    mkdirSync(dirname(proc.pidFilePath), { recursive: true });
    writeFileSync(
      proc.pidFilePath,
      JSON.stringify(
        {
          name: proc.name,
          pid: proc.pid,
          processGroup: proc.pid ? -proc.pid : null,
          killCommand: proc.pid ? `kill -TERM -${proc.pid}` : null,
          state: proc.state,
          startedAt: proc.startedAt,
          endedAt: proc.endedAt ?? null,
          exitCode: proc.exitCode ?? null,
          signal: proc.signal ?? null,
          command: proc.command,
          envOverrides: proc.envOverrides ?? {},
          project: proc.project ?? null,
          projectId: stringValue(proc.project?.id),
          repoRoot: proc.repoRoot ?? null,
          stateDir: proc.stateDir ?? null,
          graphDbPath: proc.graphDbPath ?? null,
        },
        null,
        2,
      ),
      "utf8",
    );
  }

  updateSavedProcessFile(stateDir: string, name: string, updates: JsonObject): string {
    const path = this.pidFilePath(stateDir, name);
    const current = readJsonObject(path);
    const pid = intValue(updates.pid ?? current.pid, 0, 0);
    const record = {
      ...current,
      ...updates,
      name,
      pid,
      processGroup: pid ? -pid : null,
      killCommand: pid ? `kill -TERM -${pid}` : null,
    };
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify(record, null, 2), "utf8");
    return path;
  }

  savedProcessRecords(stateDir: string): JsonObject[] {
    const dir = resolve(stateDir, "ui-processes");
    try {
      if (!existsSync(dir)) return [];
      return Array.from(new Bun.Glob("*.json").scanSync({ cwd: dir }))
        .map((file) => {
          const path = resolve(dir, file);
          const record = readJsonObject(path);
          const pid = intValue(record.pid, 0, 0);
          return {
            ...record,
            path,
            alive: pid > 0 && processGroupAlive(pid),
          } as JsonObject;
        })
        .sort((a, b) => stringValue(b.startedAt).localeCompare(stringValue(a.startedAt)));
    } catch {
      return [];
    }
  }

  status(input: ProcessStatusInput): JsonObject {
    const { freshRunActive, operation, project, projectSyncActive, stateDir } = input;
    const knownProcesses = this.savedProcessRecords(stateDir);
    const activeSaved = knownProcesses.find((record) => {
      if (record.alive !== true) return false;
      if (!project) return true;
      const savedProject = asObject(record.project);
      const savedProjectId = stringValue(record.projectId, stringValue(savedProject.id, stringValue(savedProject.projectId)));
      const projectId = stringValue(project.projectId, stringValue(project.id));
      return !projectId || savedProjectId === projectId || stringValue(record.name) === "melee-live";
    });
    const managedRunning = this.managed?.state === "running" || this.managed?.state === "stopping" || this.managed?.state === "draining";
    const savedPid = intValue(activeSaved?.pid, 0, 0);
    const activeProcess = this.managed ?? activeSaved ?? null;
    const activeState = this.managed?.state ?? stringValue(activeSaved?.state, activeSaved ? "running" : "idle");
    const activeCommand = this.managed?.command ?? savedCommand(activeSaved);
    const activeRepoRoot = this.managed?.repoRoot ?? stringValue(activeSaved?.repoRoot, project?.repoRoot ?? "");
    const activeGraphDbPath = this.managed?.graphDbPath ?? stringValue(activeSaved?.graphDbPath, project?.graphDbPath ?? "");
    return {
      project: project ? this.deps.projectToSummary(project) : null,
      running: Boolean(managedRunning || activeSaved),
      state: activeState,
      name: stringValue(activeProcess?.name, "") || null,
      pid: this.managed?.pid ?? (savedPid || null),
      processGroup: this.managed?.pid ? -this.managed.pid : savedPid ? -savedPid : null,
      killCommand: this.managed?.pid ? `kill -TERM -${this.managed.pid}` : savedPid ? `kill -TERM -${savedPid}` : null,
      pidFilePath: this.managed?.pidFilePath ?? stringValue(activeSaved?.path) ?? null,
      startedAt: stringValue(activeProcess?.startedAt) || null,
      endedAt: activeProcess?.endedAt ?? null,
      exitCode: activeProcess?.exitCode ?? null,
      signal: activeProcess?.signal ?? null,
      command: activeCommand,
      envOverrides: this.managed?.envOverrides ?? asObject(activeSaved?.envOverrides),
      repoRoot: activeRepoRoot || null,
      stateDir: this.managed?.stateDir ?? stringValue(activeSaved?.stateDir, stateDir),
      graphDbPath: activeGraphDbPath || null,
      logs: this.processLogs.slice(-220),
      knownProcesses,
      freshRunActive,
      projectSyncActive,
      operation,
    };
  }

  hasActiveProcess(stateDir: string): { active: boolean; name: string } {
    const activeManaged = this.managed?.state === "running" || this.managed?.state === "stopping" || this.managed?.state === "draining";
    const activeSaved = this.savedProcessRecords(stateDir).find((record) => record.alive === true);
    return {
      active: Boolean(activeManaged || activeSaved),
      name: stringValue(activeSaved?.name, this.managed?.name ?? "managed process"),
    };
  }

  spawn(input: StartManagedInput): ManagedProcess {
    const { command, env, name, project, stateDir } = input;
    const envOverrides = env && Object.keys(env).length > 0 ? env : undefined;
    const child = spawn(command[0] ?? "bun", command.slice(1), {
      cwd: this.deps.packageRoot,
      detached: true,
      env: { ...process.env, ...(envOverrides ?? {}) },
      argv0: `orch-${name}`,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const pid = child.pid ?? 0;
    const proc: ManagedProcess = {
      child,
      command,
      envOverrides,
      graphDbPath: project?.graphDbPath,
      name,
      pid,
      pidFilePath: this.pidFilePath(stateDir, name),
      project: project ? this.deps.projectToSummary(project) : null,
      repoRoot: project?.repoRoot,
      startedAt: new Date().toISOString(),
      state: "running",
      stateDir,
    };
    this.managed = proc;
    this.writeProcessFile(proc);
    this.deps.mirrorProcessState({
      command: proc.command,
      createIfMissing: true,
      graphDbPath: proc.graphDbPath,
      name: proc.name,
      pid: proc.pid,
      processFilePath: proc.pidFilePath,
      project,
      repoRoot: proc.repoRoot,
      startedAt: proc.startedAt,
      state: proc.state,
      stateDir,
    });
    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");
    child.stdout?.on("data", (chunk) => this.appendLog("stdout", String(chunk)));
    child.stderr?.on("data", (chunk) => this.appendLog("stderr", String(chunk)));
    child.on("exit", (code, signal) => {
      proc.state = "exited";
      proc.exitCode = code;
      proc.signal = signal;
      proc.endedAt = new Date().toISOString();
      this.writeProcessFile(proc);
      this.deps.mirrorProcessState({
        command: proc.command,
        endedAt: proc.endedAt,
        graphDbPath: proc.graphDbPath,
        name: proc.name,
        pid: proc.pid,
        processFilePath: proc.pidFilePath,
        project: proc.project,
        repoRoot: proc.repoRoot,
        startedAt: proc.startedAt,
        state: proc.state,
        stateDir,
      });
      this.appendLog("ui", `process exited code=${code ?? "null"} signal=${signal ?? "null"}`);
    });
    this.appendLog("ui", `started ${name} pid=${pid}: ${command.join(" ")}`);
    return proc;
  }

  async stop(input: StopManagedInput): Promise<JsonObject> {
    const { name, project, recoveryCommand, runCommand, stateDir } = input;
    let stopped = false;

    if (this.managed && this.managed.state !== "exited") {
      this.managed.state = "stopping";
      this.writeProcessFile(this.managed);
      this.deps.mirrorProcessState({
        command: this.managed.command,
        graphDbPath: this.managed.graphDbPath,
        name: this.managed.name,
        pid: this.managed.pid,
        processFilePath: this.managed.pidFilePath,
        project: this.managed.project,
        repoRoot: this.managed.repoRoot,
        startedAt: this.managed.startedAt,
        state: this.managed.state,
        stateDir,
      });
      this.appendLog("ui", "stop requested");
      if (this.managed.pid) {
        try {
          process.kill(-this.managed.pid, "SIGTERM");
        } catch (error) {
          this.appendLog("stderr", `SIGTERM failed: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
      const graceful = await waitForExit(this.managed, 5000);
      if (!graceful && this.managed.pid) {
        try {
          process.kill(-this.managed.pid, "SIGKILL");
          this.appendLog("ui", "sent SIGKILL to process group");
        } catch (error) {
          this.appendLog("stderr", `SIGKILL failed: ${error instanceof Error ? error.message : String(error)}`);
        }
        await waitForExit(this.managed, 2000);
      }
      stopped = true;
    } else {
      const saved = this.savedProcessRecords(stateDir).find((record) => stringValue(record.name) === name);
      const pid = intValue(saved?.pid, 0, 0);
      if (!pid || saved?.alive !== true) return { stopped: false, reason: "not_running", process: this.status({ freshRunActive: false, operation: null, project, projectSyncActive: false, stateDir }) };
      this.updateSavedProcessFile(stateDir, name, { state: "stopping", pid });
      this.deps.mirrorProcessState({
        command: savedCommand(saved),
        graphDbPath: stringValue(saved?.graphDbPath, project?.graphDbPath ?? ""),
        name,
        pid,
        processFilePath: this.pidFilePath(stateDir, name),
        project,
        repoRoot: stringValue(saved?.repoRoot, project?.repoRoot ?? ""),
        startedAt: stringValue(saved?.startedAt),
        state: "stopping",
        stateDir,
      });
      this.appendLog("ui", `stop requested for saved process ${name} pid=${pid}`);
      try {
        process.kill(-pid, "SIGTERM");
      } catch (error) {
        this.appendLog("stderr", `SIGTERM failed: ${error instanceof Error ? error.message : String(error)}`);
      }
      let exited = await waitForProcessGroupExit(pid, 5000);
      let signal = "SIGTERM";
      if (!exited) {
        try {
          process.kill(-pid, "SIGKILL");
          this.appendLog("ui", `sent SIGKILL to saved process group ${pid}`);
        } catch (error) {
          this.appendLog("stderr", `SIGKILL failed: ${error instanceof Error ? error.message : String(error)}`);
        }
        signal = "SIGKILL";
        exited = await waitForProcessGroupExit(pid, 2000);
      }
      const endedAt = exited ? new Date().toISOString() : null;
      this.updateSavedProcessFile(stateDir, name, { state: exited ? "exited" : "stopping", endedAt, signal });
      this.deps.mirrorProcessState({
        command: savedCommand(saved),
        endedAt,
        graphDbPath: stringValue(saved?.graphDbPath, project?.graphDbPath ?? ""),
        name,
        pid,
        processFilePath: this.pidFilePath(stateDir, name),
        project,
        repoRoot: stringValue(saved?.repoRoot, project?.repoRoot ?? ""),
        startedAt: stringValue(saved?.startedAt),
        state: exited ? "exited" : "stopping",
        stateDir,
      });
      stopped = true;
    }

    let recovery: JsonObject | null = null;
    if (recoveryCommand && input.recoverClaims !== false) {
      const result = await runCommand(recoveryCommand);
      recovery = { command: recoveryCommand, ...result };
      this.appendLog("ui", `recover-claims exit=${result.exitCode}`);
    }
    return { stopped, recovery, process: this.status({ freshRunActive: false, operation: null, project, projectSyncActive: false, stateDir }) };
  }

  async drain(input: DrainManagedInput): Promise<JsonObject> {
    const { name, project, stateDir } = input;
    const saved = this.savedProcessRecords(stateDir).find((record) => stringValue(record.name) === name);
    const pid = this.managed && this.managed.state !== "exited" ? this.managed.pid : intValue(saved?.pid, 0, 0);
    if (!pid || !processGroupAlive(pid)) return { draining: false, reason: "not_running", process: this.status({ freshRunActive: false, operation: null, project, projectSyncActive: false, stateDir }) };

    const children = directChildPids(pid);
    if (this.managed && this.managed.pid === pid && this.managed.state !== "exited") {
      this.managed.state = "draining";
      this.writeProcessFile(this.managed);
      this.deps.mirrorProcessState({
        command: this.managed.command,
        graphDbPath: this.managed.graphDbPath,
        name: this.managed.name,
        pid: this.managed.pid,
        processFilePath: this.managed.pidFilePath,
        project: this.managed.project,
        repoRoot: this.managed.repoRoot,
        startedAt: this.managed.startedAt,
        state: this.managed.state,
        stateDir,
      });
    } else {
      this.updateSavedProcessFile(stateDir, name, { state: "draining", pid, drainRequestedAt: new Date().toISOString() });
      this.deps.mirrorProcessState({
        command: savedCommand(saved),
        graphDbPath: stringValue(saved?.graphDbPath, project?.graphDbPath ?? ""),
        name,
        pid,
        processFilePath: this.pidFilePath(stateDir, name),
        project,
        repoRoot: stringValue(saved?.repoRoot, project?.repoRoot ?? ""),
        startedAt: stringValue(saved?.startedAt),
        state: "draining",
        stateDir,
      });
    }

    this.appendLog("ui", `drain requested for ${name} pid=${pid}`);
    const signaled: number[] = [];
    const drainSignal: NodeJS.Signals = "SIGUSR1";
    if (children.length > 0) {
      for (const childPid of children) {
        try {
          process.kill(childPid, drainSignal);
          signaled.push(childPid);
        } catch (error) {
          this.appendLog("stderr", `drain signal failed for child ${childPid}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    } else {
      try {
        process.kill(pid, drainSignal);
        signaled.push(pid);
      } catch (error) {
        this.appendLog("stderr", `drain signal failed for process ${pid}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    this.appendLog("ui", `sent drain signal to ${signaled.length} process${signaled.length === 1 ? "" : "es"}; supervisor remains active until workers finish`);
    return { draining: signaled.length > 0, signaled, process: this.status({ freshRunActive: false, operation: null, project, projectSyncActive: false, stateDir }) };
  }
}

export function createManagedProcessController(deps: ManagedProcessControllerDeps): ManagedProcessController {
  return new ManagedProcessController(deps);
}
