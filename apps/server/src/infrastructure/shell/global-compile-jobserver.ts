#!/usr/bin/env bun

import {
  accessSync,
  chmodSync,
  closeSync,
  constants,
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
  writeSync,
} from "node:fs";
import { basename, delimiter, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, spawnSync } from "node:child_process";

export const GLOBAL_COMPILE_SLOTS_ENV = "ORCH_GLOBAL_COMPILE_SLOTS";
export const DEFAULT_GLOBAL_COMPILE_SLOTS = 10;

const JOBSERVER_FIFO_ENV = "ORCH_GLOBAL_COMPILE_JOBSERVER_FIFO";
const JOBSERVER_STATE_ENV = "ORCH_GLOBAL_COMPILE_JOBSERVER_STATE";
const NINJA_REAL_ENV = "ORCH_GLOBAL_NINJA_REAL";
const NINJA_WRAPPER_BIN_ENV = "ORCH_GLOBAL_NINJA_WRAPPER_BIN";
const MAX_GLOBAL_COMPILE_SLOTS = 256;
const START_TIMEOUT_MS = 5_000;

export interface GlobalCompileJobserverPaths {
  binDir: string;
  fifoPath: string;
  lockPath: string;
  rootDir: string;
  statePath: string;
  wrapperPath: string;
}

interface JobserverState {
  fifoPath: string;
  pid: number;
  realNinjaPath: string;
  slots: number;
  startedAt: string;
}

export interface ConfigureGlobalCompileJobserverOptions {
  env?: NodeJS.ProcessEnv;
  localEnvPath?: string;
}

export interface ConfigureGlobalCompileJobserverResult {
  enabled: boolean;
  fifoPath?: string;
  slots?: number;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

function errorCode(error: unknown): string {
  return typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
}

export function parseGlobalCompileSlots(value: string | undefined): number | null {
  if (value === undefined) return null;
  const trimmed = value.trim();
  const parsed = Number(trimmed);
  if (!trimmed || !Number.isInteger(parsed) || parsed < 1 || parsed > MAX_GLOBAL_COMPILE_SLOTS) {
    throw new Error(`${GLOBAL_COMPILE_SLOTS_ENV} must be an integer from 1 to ${MAX_GLOBAL_COMPILE_SLOTS}; received ${JSON.stringify(value)}`);
  }
  return parsed;
}

export function ninjaSupportsFifoJobserver(version: string): boolean {
  const match = version.trim().match(/^(\d+)\.(\d+)(?:\.|$)/);
  if (!match) return false;
  const major = Number(match[1]);
  const minor = Number(match[2]);
  return major > 1 || (major === 1 && minor >= 13);
}

/**
 * Each wrapper reserves one FIFO byte for Ninja's implicit job slot. The FIFO
 * therefore starts with the full budget, rather than GNU make's usual slots-1.
 */
export function fifoTokenCount(globalSlots: number): number {
  return globalSlots;
}

export function globalCompileJobserverPaths(tempRoot = "/tmp", uid = process.getuid?.() ?? 0): GlobalCompileJobserverPaths {
  const rootDir = resolve(tempRoot, `decomp-orchestrator-compile-jobserver-${uid}`);
  const binDir = resolve(rootDir, "bin");
  return {
    binDir,
    fifoPath: resolve(rootDir, "jobs.fifo"),
    lockPath: resolve(rootDir, "start.lock"),
    rootDir,
    statePath: resolve(rootDir, "state.json"),
    wrapperPath: resolve(binDir, "ninja"),
  };
}

function pathWithWrapper(currentPath: string | undefined, binDir: string): string {
  const entries = (currentPath ?? "").split(delimiter).filter(Boolean).filter((entry) => resolve(entry) !== resolve(binDir));
  return [binDir, ...entries].join(delimiter);
}

function pathWithoutWrapper(currentPath: string | undefined, binDir: string): string {
  return (currentPath ?? "")
    .split(delimiter)
    .filter(Boolean)
    .filter((entry) => resolve(entry) !== resolve(binDir))
    .join(delimiter);
}

export function globalCompileEnvironment(params: {
  currentPath?: string;
  paths: GlobalCompileJobserverPaths;
  realNinjaPath: string;
  slots: number;
}): Record<string, string> {
  return {
    MAKEFLAGS: `--jobserver-auth=fifo:${params.paths.fifoPath}`,
    [GLOBAL_COMPILE_SLOTS_ENV]: String(params.slots),
    [JOBSERVER_FIFO_ENV]: params.paths.fifoPath,
    [JOBSERVER_STATE_ENV]: params.paths.statePath,
    [NINJA_REAL_ENV]: params.realNinjaPath,
    [NINJA_WRAPPER_BIN_ENV]: params.paths.binDir,
    PATH: pathWithWrapper(params.currentPath, params.paths.binDir),
  };
}

/** Keep serial -j1 requests; remove wider explicit -j values that make Ninja ignore MAKEFLAGS. */
export function normalizeNinjaArgsForJobserver(args: string[]): string[] {
  const normalized: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index] ?? "";
    if (arg === "-j" || arg === "--jobs") {
      const count = args[index + 1];
      if (count === "1") {
        normalized.push(arg, count);
        index += 1;
      } else if (count && /^\d+$/.test(count)) {
        index += 1;
      } else {
        normalized.push(arg);
      }
      continue;
    }
    const compact = arg.match(/^-j(\d+)$/) ?? arg.match(/^--jobs=(\d+)$/);
    if (compact) {
      if (compact[1] === "1") normalized.push(arg);
      continue;
    }
    normalized.push(arg);
  }
  return normalized;
}

function envFileValue(path: string | undefined, key: string): string | undefined {
  if (!path || !existsSync(path)) return undefined;
  for (const rawLine of readFileSync(path, "utf8").split(/\r?\n/)) {
    let line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    if (line.startsWith("export ")) line = line.slice("export ".length).trim();
    const equals = line.indexOf("=");
    if (equals <= 0 || line.slice(0, equals).trim() !== key) continue;
    let value = line.slice(equals + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    return value;
  }
  return undefined;
}

function processAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return errorCode(error) === "EPERM";
  }
}

function readJobserverState(path: string): JobserverState | null {
  try {
    const state = JSON.parse(readFileSync(path, "utf8")) as Partial<JobserverState>;
    if (
      typeof state.fifoPath !== "string" ||
      typeof state.pid !== "number" ||
      typeof state.realNinjaPath !== "string" ||
      typeof state.slots !== "number" ||
      typeof state.startedAt !== "string"
    ) return null;
    return state as JobserverState;
  } catch {
    return null;
  }
}

function fifoExists(path: string): boolean {
  try {
    return lstatSync(path).isFIFO();
  } catch {
    return false;
  }
}

function activeJobserverState(paths: GlobalCompileJobserverPaths): JobserverState | null {
  const state = readJobserverState(paths.statePath);
  if (!state || state.fifoPath !== paths.fifoPath || !processAlive(state.pid) || !fifoExists(paths.fifoPath)) return null;
  return state;
}

function assertMatchingSlots(state: JobserverState, requestedSlots: number): void {
  if (state.slots === requestedSlots) return;
  throw new Error(
    `Global compile jobserver is already running with ${state.slots} slots (pid ${state.pid}); ` +
      `${GLOBAL_COMPILE_SLOTS_ENV}=${requestedSlots} cannot replace it while builds may be active`,
  );
}

function removeStaleLock(paths: GlobalCompileJobserverPaths): void {
  try {
    const ageMs = Date.now() - statSync(paths.lockPath).mtimeMs;
    const ownerPid = Number(readFileSync(paths.lockPath, "utf8").trim());
    if (ageMs > START_TIMEOUT_MS && !processAlive(ownerPid)) rmSync(paths.lockPath, { force: true });
  } catch {
    // Another process may have removed the lock between the checks.
  }
}

function createWrapperExecutable(paths: GlobalCompileJobserverPaths): void {
  const modulePath = fileURLToPath(import.meta.url);
  mkdirSync(paths.binDir, { recursive: true, mode: 0o700 });
  chmodSync(paths.binDir, 0o700);
  const temporaryPath = `${paths.wrapperPath}.${process.pid}.tmp`;
  rmSync(temporaryPath, { force: true });
  copyFileSync(modulePath, temporaryPath);
  chmodSync(temporaryPath, 0o700);
  renameSync(temporaryPath, paths.wrapperPath);
}

function executableOnPath(command: string, pathValue: string | undefined, excludedDir: string): string | null {
  for (const entry of (pathValue ?? "").split(delimiter)) {
    if (!entry || resolve(entry) === resolve(excludedDir)) continue;
    const candidate = resolve(entry, command);
    try {
      accessSync(candidate, constants.X_OK);
      return candidate;
    } catch {
      // Keep searching PATH.
    }
  }
  return null;
}

function resolveRealNinja(env: NodeJS.ProcessEnv, paths: GlobalCompileJobserverPaths): string {
  const configured = env[NINJA_REAL_ENV];
  const ninjaPath = configured || executableOnPath("ninja", env.PATH, paths.binDir);
  if (!ninjaPath) throw new Error(`${GLOBAL_COMPILE_SLOTS_ENV} is set, but ninja was not found on PATH`);
  const version = spawnSync(ninjaPath, ["--version"], { encoding: "utf8", env }).stdout?.trim() ?? "";
  if (!ninjaSupportsFifoJobserver(version)) {
    throw new Error(`${GLOBAL_COMPILE_SLOTS_ENV} requires Ninja >=1.13 for FIFO jobserver support; found ${version || "unknown"} at ${ninjaPath}`);
  }
  return ninjaPath;
}

async function ensureJobserverDaemon(paths: GlobalCompileJobserverPaths, slots: number, realNinjaPath: string): Promise<JobserverState> {
  mkdirSync(paths.rootDir, { recursive: true, mode: 0o700 });
  chmodSync(paths.rootDir, 0o700);
  const started = Date.now();
  while (Date.now() - started < START_TIMEOUT_MS) {
    const active = activeJobserverState(paths);
    if (active) {
      assertMatchingSlots(active, slots);
      return active;
    }

    let lockFd: number | null = null;
    try {
      lockFd = openSync(paths.lockPath, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o600);
      writeSync(lockFd, String(process.pid));

      const rechecked = activeJobserverState(paths);
      if (rechecked) {
        assertMatchingSlots(rechecked, slots);
        return rechecked;
      }

      rmSync(paths.fifoPath, { force: true });
      rmSync(paths.statePath, { force: true });
      const modulePath = fileURLToPath(import.meta.url);
      const daemon = spawn(process.execPath, [modulePath, "__daemon", String(slots), realNinjaPath], {
        detached: true,
        env: { ...process.env, [GLOBAL_COMPILE_SLOTS_ENV]: String(slots) },
        stdio: "ignore",
      });
      daemon.unref();

      while (Date.now() - started < START_TIMEOUT_MS) {
        const ready = activeJobserverState(paths);
        if (ready) {
          assertMatchingSlots(ready, slots);
          return ready;
        }
        if (daemon.exitCode !== null) throw new Error(`Global compile jobserver daemon exited with code ${daemon.exitCode}`);
        await sleep(25);
      }
    } catch (error) {
      if (errorCode(error) !== "EEXIST") throw error;
      removeStaleLock(paths);
    } finally {
      if (lockFd !== null) closeSync(lockFd);
      if (lockFd !== null) rmSync(paths.lockPath, { force: true });
    }
    await sleep(25);
  }
  throw new Error(`Timed out after ${START_TIMEOUT_MS}ms starting the global compile jobserver at ${paths.fifoPath}`);
}

export async function configureGlobalCompileJobserver(
  options: ConfigureGlobalCompileJobserverOptions = {},
): Promise<ConfigureGlobalCompileJobserverResult> {
  const env = options.env ?? process.env;
  const configuredValue = env[GLOBAL_COMPILE_SLOTS_ENV] ?? envFileValue(options.localEnvPath, GLOBAL_COMPILE_SLOTS_ENV);
  const slots = parseGlobalCompileSlots(configuredValue);
  if (slots === null) return { enabled: false };
  if (process.platform !== "darwin" && process.platform !== "linux") {
    throw new Error(`${GLOBAL_COMPILE_SLOTS_ENV} FIFO jobserver support requires macOS or Linux`);
  }

  env[GLOBAL_COMPILE_SLOTS_ENV] = String(slots);
  const paths = globalCompileJobserverPaths();
  const realNinjaPath = resolveRealNinja(env, paths);
  createWrapperExecutable(paths);
  const state = await ensureJobserverDaemon(paths, slots, realNinjaPath);
  Object.assign(env, globalCompileEnvironment({ currentPath: env.PATH, paths, realNinjaPath: state.realNinjaPath, slots }));
  return { enabled: true, fifoPath: paths.fifoPath, slots };
}

function writeJobserverState(paths: GlobalCompileJobserverPaths, state: JobserverState): void {
  const temporaryPath = `${paths.statePath}.${process.pid}.tmp`;
  writeFileSync(temporaryPath, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
  renameSync(temporaryPath, paths.statePath);
}

async function runJobserverDaemon(slots: number, realNinjaPath: string): Promise<number> {
  const paths = globalCompileJobserverPaths();
  mkdirSync(paths.rootDir, { recursive: true, mode: 0o700 });
  rmSync(paths.fifoPath, { force: true });
  const mkfifo = spawnSync("mkfifo", [paths.fifoPath], { encoding: "utf8" });
  if (mkfifo.status !== 0) throw new Error(`mkfifo failed: ${(mkfifo.stderr || mkfifo.stdout || `exit ${mkfifo.status}`).trim()}`);
  chmodSync(paths.fifoPath, 0o600);
  const readFd = openSync(paths.fifoPath, constants.O_RDONLY | constants.O_NONBLOCK);
  const writeFd = openSync(paths.fifoPath, constants.O_WRONLY | constants.O_NONBLOCK);
  writeSync(writeFd, Buffer.alloc(fifoTokenCount(slots), "+"));
  writeJobserverState(paths, { fifoPath: paths.fifoPath, pid: process.pid, realNinjaPath, slots, startedAt: new Date().toISOString() });

  let stopping = false;
  const cleanup = (): void => {
    if (stopping) return;
    stopping = true;
    closeSync(readFd);
    closeSync(writeFd);
    const state = readJobserverState(paths.statePath);
    if (state?.pid === process.pid) {
      rmSync(paths.statePath, { force: true });
      rmSync(paths.fifoPath, { force: true });
    }
  };
  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"] as NodeJS.Signals[]) {
    process.on(signal, () => {
      cleanup();
      process.exit(0);
    });
  }
  process.on("exit", cleanup);
  await new Promise<void>(() => {
    setInterval(() => {}, 60_000);
  });
  return 0;
}

async function acquireWrapperToken(fifoPath: string, statePath: string): Promise<{ fd: number; token: Buffer }> {
  const fd = openSync(fifoPath, constants.O_RDWR | constants.O_NONBLOCK);
  const token = Buffer.alloc(1);
  let lastLivenessCheck = 0;
  while (true) {
    try {
      if (readSync(fd, token, 0, 1, null) === 1) return { fd, token };
    } catch (error) {
      if (!new Set(["EAGAIN", "EWOULDBLOCK"]).has(errorCode(error))) {
        closeSync(fd);
        throw error;
      }
    }
    if (Date.now() - lastLivenessCheck >= 1_000) {
      lastLivenessCheck = Date.now();
      const state = readJobserverState(statePath);
      if (!state || state.fifoPath !== fifoPath || !processAlive(state.pid)) {
        closeSync(fd);
        throw new Error(`Global compile jobserver is not running for ${fifoPath}`);
      }
    }
    await sleep(25);
  }
}

function signalExitCode(signal: NodeJS.Signals | null): number {
  const numbers: Partial<Record<NodeJS.Signals, number>> = { SIGINT: 2, SIGHUP: 1, SIGTERM: 15 };
  return signal ? 128 + (numbers[signal] ?? 1) : 1;
}

async function runNinjaWrapper(args: string[], env: NodeJS.ProcessEnv = process.env): Promise<number> {
  const paths = globalCompileJobserverPaths();
  const statePath = env[JOBSERVER_STATE_ENV] ?? paths.statePath;
  const state = readJobserverState(statePath);
  if (!state || !processAlive(state.pid) || !fifoExists(state.fifoPath)) throw new Error("Global Ninja wrapper cannot find a live jobserver");
  const realNinjaPath = env[NINJA_REAL_ENV] ?? state.realNinjaPath;
  const fifoPath = env[JOBSERVER_FIFO_ENV] ?? state.fifoPath;
  const wrapperBin = env[NINJA_WRAPPER_BIN_ENV] ?? paths.binDir;
  const reservation = await acquireWrapperToken(fifoPath, statePath);
  const childEnv = {
    ...env,
    MAKEFLAGS: `--jobserver-auth=fifo:${fifoPath}`,
    PATH: pathWithoutWrapper(env.PATH, wrapperBin),
  };
  const child = spawn(realNinjaPath, normalizeNinjaArgsForJobserver(args), { env: childEnv, stdio: "inherit" });
  const handlers = new Map<NodeJS.Signals, () => void>();
  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"] as NodeJS.Signals[]) {
    const handler = (): void => {
      child.kill(signal);
    };
    handlers.set(signal, handler);
    process.on(signal, handler);
  }
  try {
    const result = await new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolveExit, reject) => {
      child.once("error", reject);
      child.once("exit", (code, signal) => resolveExit({ code, signal }));
    });
    return result.code ?? signalExitCode(result.signal);
  } finally {
    for (const [signal, handler] of handlers) process.off(signal, handler);
    writeSync(reservation.fd, reservation.token);
    closeSync(reservation.fd);
  }
}

async function executableMain(): Promise<number> {
  if (basename(process.argv[1] ?? "") === "ninja") return runNinjaWrapper(process.argv.slice(2));
  if (process.argv[2] === "__daemon") {
    const slots = parseGlobalCompileSlots(process.argv[3]);
    if (slots === null) throw new Error("Global compile jobserver daemon requires a slot count");
    const realNinjaPath = process.argv[4];
    if (!realNinjaPath) throw new Error("Global compile jobserver daemon requires the real Ninja path");
    return runJobserverDaemon(slots, realNinjaPath);
  }
  throw new Error("global-compile-jobserver.ts is an internal Ninja wrapper/daemon entry point");
}

if (import.meta.main) {
  executableMain()
    .then((exitCode) => process.exit(exitCode))
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    });
}
