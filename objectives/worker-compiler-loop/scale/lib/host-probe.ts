/**
 * Host-side observation for one harness process (orchestrator or worker child):
 *
 * - `installHostSpawnProbe`: every host subprocess (`Bun.spawn`,
 *   `Bun.spawnSync`, `node:child_process`) is recorded with its step, wall
 *   time, exit code and CPU. A python3 `steering_check.py reduce` on the host
 *   is a placement failure; `git` from provisioning or integration is
 *   orchestration. Install it before importing harness modules.
 * - `instrumentSqliteLocks`: time spent in `BEGIN IMMEDIATE` (SQLite's busy
 *   handler waits there with busy_timeout = 30 s), per store.
 * - `sampleProcessTree`: RSS and CPU of a set of pids via `ps`.
 */
import * as childProcess from "node:child_process";
import { classifyCommand } from "./commands.js";
import type { EventSink } from "./events.js";

let installed = false;

export function installHostSpawnProbe(sink: EventSink): void {
  if (installed) return;
  installed = true;
  const record = (argv: string[], started: number, exitCode: number | null, cpuMs: number | null) => {
    if (argv[0] === "ps") return; // the sampler itself
    sink.emit({ kind: "host_spawn", step: classifyCommand(argv), ms: performance.now() - started, exitCode, argv: argv.slice(0, 6).map((a) => a.slice(0, 160)), cpuMs });
  };
  const originalSpawn = Bun.spawn.bind(Bun);
  const originalSpawnSync = Bun.spawnSync.bind(Bun);
  (Bun as unknown as { spawn: unknown }).spawn = ((...args: unknown[]) => {
    const first = args[0];
    const argv = Array.isArray(first) ? first.map(String) : Array.isArray((first as { cmd?: unknown })?.cmd) ? ((first as { cmd: unknown[] }).cmd).map(String) : [String(first)];
    const started = performance.now();
    const proc = (originalSpawn as (...a: unknown[]) => ReturnType<typeof Bun.spawn>)(...args);
    void proc.exited.then((code) => {
      let cpuMs: number | null = null;
      try {
        const usage = proc.resourceUsage?.();
        if (usage) cpuMs = Number(usage.cpuTime.user + usage.cpuTime.system) / 1000;
      } catch {}
      record(argv, started, code, cpuMs);
    }, () => record(argv, started, null, null));
    return proc;
  }) as typeof Bun.spawn;
  (Bun as unknown as { spawnSync: unknown }).spawnSync = ((...args: unknown[]) => {
    const first = args[0];
    const argv = Array.isArray(first) ? first.map(String) : Array.isArray((first as { cmd?: unknown })?.cmd) ? ((first as { cmd: unknown[] }).cmd).map(String) : [String(first)];
    const started = performance.now();
    const result = (originalSpawnSync as (...a: unknown[]) => ReturnType<typeof Bun.spawnSync>)(...args);
    let cpuMs: number | null = null;
    try {
      const usage = (result as { resourceUsage?: { cpuTime: { user: number | bigint; system: number | bigint } } }).resourceUsage;
      if (usage) cpuMs = Number(usage.cpuTime.user) / 1000 + Number(usage.cpuTime.system) / 1000;
    } catch {}
    record(argv, started, result.exitCode, cpuMs);
    return result;
  }) as typeof Bun.spawnSync;
  const cp = childProcess as unknown as Record<string, unknown>;
  for (const name of ["spawn", "execFile", "spawnSync", "execFileSync"]) {
    const original = cp[name] as ((...a: unknown[]) => unknown) | undefined;
    if (typeof original !== "function") continue;
    try {
      cp[name] = (...args: unknown[]) => {
        const argv = [String(args[0]), ...(Array.isArray(args[1]) ? (args[1] as unknown[]).map(String) : [])];
        const started = performance.now();
        const value = original.apply(childProcess, args);
        if (name.endsWith("Sync")) record(argv, started, (value as { status?: number })?.status ?? null, null);
        else (value as { on?: (event: string, cb: (code: number) => void) => void }).on?.("exit", (code) => record(argv, started, code, null));
        return value;
      };
    } catch {
      // Frozen module namespace: Bun.spawn coverage still holds.
    }
  }
}

interface LockableDb { exec(sql: string, ...rest: unknown[]): unknown; run?(sql: string, ...rest: unknown[]): unknown }

/**
 * Records the wait of every `BEGIN IMMEDIATE` on `target`: a database handle,
 * or `Database.prototype` to cover every connection the process opens.
 */
export function instrumentSqliteLocks(target: LockableDb, sink: EventSink, slowMs = 5): void {
  for (const name of ["exec", "run"] as const) {
    const original = target[name];
    if (typeof original !== "function") continue;
    target[name] = function (this: unknown, sql: string, ...rest: unknown[]) {
      if (typeof sql !== "string" || !/^\s*BEGIN\s+IMMEDIATE/i.test(sql)) return original.call(this, sql, ...rest);
      const started = performance.now();
      try {
        const value = original.call(this, sql, ...rest);
        const ms = performance.now() - started;
        if (ms >= slowMs) sink.emit({ kind: "sqlite_lock", ms, busyError: false });
        return value;
      } catch (error) {
        sink.emit({ kind: "sqlite_lock", ms: performance.now() - started, busyError: /locked|BUSY/i.test(String(error)) });
        throw error;
      }
    } as LockableDb["exec"];
  }
}

export interface ProcSample { pid: number; ppid: number; rssKb: number; cpuSeconds: number; command: string }

function cpuSeconds(time: string): number {
  // ps TIME: [[dd-]hh:]mm:ss.ss
  const [days, rest] = time.includes("-") ? time.split("-") as [string, string] : ["0", time];
  const parts = rest.split(":").map(Number);
  let seconds = 0;
  for (const part of parts) seconds = seconds * 60 + part;
  return Number(days) * 86_400 + seconds;
}

/** One `ps` snapshot of every process. */
export function psSnapshot(): ProcSample[] {
  const result = Bun.spawnSync(["ps", "-axo", "pid=,ppid=,rss=,time=,command="], { stdout: "pipe", stderr: "ignore" });
  const out: ProcSample[] = [];
  for (const line of result.stdout.toString().split("\n")) {
    const match = /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(\S+)\s+(.*)$/.exec(line);
    if (!match) continue;
    out.push({ pid: Number(match[1]), ppid: Number(match[2]), rssKb: Number(match[3]), cpuSeconds: cpuSeconds(match[4]!), command: match[5]! });
  }
  return out;
}

/** The pids of `root` and every descendant in a snapshot. */
export function descendants(snapshot: ProcSample[], root: number): ProcSample[] {
  const children = new Map<number, ProcSample[]>();
  for (const sample of snapshot) {
    const list = children.get(sample.ppid) ?? [];
    list.push(sample);
    children.set(sample.ppid, list);
  }
  const out: ProcSample[] = [];
  const self = snapshot.find((s) => s.pid === root);
  if (self) out.push(self);
  const stack = [root];
  while (stack.length) {
    for (const child of children.get(stack.pop()!) ?? []) { out.push(child); stack.push(child.pid); }
  }
  return out;
}
