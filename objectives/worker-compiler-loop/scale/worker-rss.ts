#!/usr/bin/env bun
/**
 * Per-session memory of real LLM worker children (readiness-checklist item 15).
 *
 * Samples, every `--interval-s`, every live worker child the harness spawned
 * and the process tree under it. Production sandbox workers run
 * `job-runner.ts ... worker-task --task-file <artifact>/task_spec.json`
 * (`buildWorkerTask` in workers/worker-job.ts); the worker and run identity
 * come from that task file. The older direct form `job-runner.ts ... worker
 * --worker-id <id>` (job-queue/executor.ts) is recognised too. Read-only: one `ps`
 * per tick, no state DB, no Daytona. Stop it with Ctrl-C or `--minutes`.
 *
 *   bun objectives/worker-compiler-loop/scale/worker-rss.ts --minutes 35 --interval-s 15 --out objectives/worker-compiler-loop/scale/results/<rid>
 *
 * Writes `<out>/worker-rss-samples.jsonl` (one line per worker per tick) and
 * `<out>/worker-rss.json` + `worker-rss.md` (per-session summary).
 */
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { totalmem } from "node:os";
import { resolve } from "node:path";
import { descendants, psSnapshot, type ProcSample } from "./lib/host-probe.js";
import { percentile } from "./report.js";

export interface WorkerRssSample {
  /** ms since the sampler started */
  t: number;
  pid: number;
  workerId: string;
  runId: string | null;
  /** the worker child alone */
  rssKb: number;
  /** the worker child and every descendant (tool subprocesses) */
  treeRssKb: number;
  processes: number;
}

function argValue(argv: string[], name: string): string | null {
  const index = argv.indexOf(name);
  return index >= 0 && index + 1 < argv.length ? argv[index + 1]! : null;
}

export interface WorkerSession { workerId: string; runId: string | null }

/** Reads a worker-task file's identity; null when it is unreadable (the worker may have just exited). */
export type TaskFileReader = (path: string) => WorkerSession | null;

const taskIdentityMemo = new Map<string, WorkerSession | null>();

export const readTaskFileIdentity: TaskFileReader = (path) => {
  if (taskIdentityMemo.has(path)) return taskIdentityMemo.get(path)!;
  let identity: WorkerSession | null = null;
  try {
    const spec = JSON.parse(readFileSync(path, "utf8")) as { worker_id?: unknown; run_id?: unknown };
    if (typeof spec.worker_id === "string" && spec.worker_id) identity = { workerId: spec.worker_id, runId: typeof spec.run_id === "string" ? spec.run_id : null };
  } catch {
    return null; // not memoized: a later tick may read it
  }
  taskIdentityMemo.set(path, identity);
  return identity;
};

/**
 * A harness worker child: `bun .../job-runner.ts ... worker-task --task-file <path>`
 * (production) or `... worker ... --worker-id <id>`. A worker-task whose task
 * file cannot be read is still a session, named by its task file.
 */
export function workerSessionOf(command: string, readTask: TaskFileReader = readTaskFileIdentity): WorkerSession | null {
  if (!command.includes("job-runner.ts")) return null;
  const argv = command.split(/\s+/);
  if (argv.includes("worker-task")) {
    const taskFile = argValue(argv, "--task-file");
    if (!taskFile) return null;
    return readTask(taskFile) ?? { workerId: `task:${taskFile}`, runId: null };
  }
  if (!argv.includes("worker")) return null;
  const workerId = argValue(argv, "--worker-id");
  return workerId ? { workerId, runId: argValue(argv, "--run-id") } : null;
}

/** One tick: a sample per live worker child. */
export function sampleWorkers(snapshot: ProcSample[], t: number, readTask: TaskFileReader = readTaskFileIdentity): WorkerRssSample[] {
  const out: WorkerRssSample[] = [];
  for (const proc of snapshot) {
    const session = workerSessionOf(proc.command, readTask);
    if (!session) continue;
    const tree = descendants(snapshot, proc.pid);
    out.push({ t, pid: proc.pid, ...session, rssKb: proc.rssKb, treeRssKb: tree.reduce((sum, p) => sum + p.rssKb, 0), processes: tree.length });
  }
  return out;
}

export interface WorkerSessionSummary {
  pid: number;
  workerId: string;
  runId: string | null;
  samples: number;
  minutes: number;
  firstMb: number;
  p50Mb: number;
  maxMb: number;
  lastMb: number;
  /** (last - first) / minutes over the tree RSS; null under 5 minutes of samples */
  growthMbPerMin: number | null;
}

export interface WorkerRssSummary {
  sessions: WorkerSessionSummary[];
  peakConcurrentSessions: number;
  peakTotalMb: number;
  sessionMaxMb: { p50: number | null; p95: number | null; max: number | null };
  /** p95 of per-session max x 200 */
  projected200Gb: number | null;
  hostRamGb: number;
}

const mb = (kb: number) => Math.round(kb / 102.4) / 10;

/** Per session (pid; a pid reused by a new worker id is a new session). */
export function summarizeWorkerRss(samples: WorkerRssSample[], hostRamBytes = totalmem()): WorkerRssSummary {
  const bySession = new Map<string, WorkerRssSample[]>();
  const byTick = new Map<number, number[]>();
  for (const sample of samples) {
    const key = `${sample.pid}\0${sample.workerId}`;
    bySession.set(key, [...(bySession.get(key) ?? []), sample]);
    byTick.set(sample.t, [...(byTick.get(sample.t) ?? []), sample.treeRssKb]);
  }
  const sessions = [...bySession.values()].map((list): WorkerSessionSummary => {
    const sorted = [...list].sort((a, b) => a.t - b.t);
    const first = sorted[0]!;
    const last = sorted.at(-1)!;
    const minutes = (last.t - first.t) / 60_000;
    const tree = sorted.map((s) => s.treeRssKb);
    return {
      pid: first.pid,
      workerId: first.workerId,
      runId: first.runId,
      samples: sorted.length,
      minutes: Math.round(minutes * 10) / 10,
      firstMb: mb(first.treeRssKb),
      p50Mb: mb(percentile(tree, 50) ?? 0),
      maxMb: mb(Math.max(...tree)),
      lastMb: mb(last.treeRssKb),
      growthMbPerMin: minutes >= 5 ? Math.round(((mb(last.treeRssKb) - mb(first.treeRssKb)) / minutes) * 10) / 10 : null,
    };
  }).sort((a, b) => b.maxMb - a.maxMb);
  const maxes = sessions.map((s) => s.maxMb);
  const p95 = percentile(maxes, 95);
  return {
    sessions,
    peakConcurrentSessions: Math.max(0, ...[...byTick.values()].map((v) => v.length)),
    peakTotalMb: mb(Math.max(0, ...[...byTick.values()].map((v) => v.reduce((a, b) => a + b, 0)))),
    sessionMaxMb: { p50: percentile(maxes, 50), p95, max: maxes.length ? Math.max(...maxes) : null },
    projected200Gb: p95 === null ? null : Math.round((p95 * 200) / 102.4) / 10,
    hostRamGb: Math.round(hostRamBytes / 1024 ** 3),
  };
}

export function renderWorkerRss(summary: WorkerRssSummary): string {
  const lines = [
    "# Worker child RSS (readiness item 15)",
    "",
    `- Sessions: ${summary.sessions.length}; peak concurrent ${summary.peakConcurrentSessions}; peak total ${summary.peakTotalMb} MB`,
    `- Per-session max MB: p50 ${summary.sessionMaxMb.p50}, p95 ${summary.sessionMaxMb.p95}, max ${summary.sessionMaxMb.max}`,
    `- Projected at 200 workers (p95 session max x 200): ${summary.projected200Gb} GB; host RAM ${summary.hostRamGb} GB (70% = ${Math.round(summary.hostRamGb * 0.7)} GB)`,
    "",
    "| worker | pid | samples | minutes | first MB | p50 MB | max MB | last MB | growth MB/min |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    ...summary.sessions.map((s) => `| ${s.workerId} | ${s.pid} | ${s.samples} | ${s.minutes} | ${s.firstMb} | ${s.p50Mb} | ${s.maxMb} | ${s.lastMb} | ${s.growthMbPerMin ?? "n/a"} |`),
    "",
  ];
  return lines.join("\n");
}

async function main(argv: string[]): Promise<void> {
  const outDir = resolve(argValue(argv, "--out") ?? `worker-rss-${Date.now()}`);
  const intervalMs = Number(argValue(argv, "--interval-s") ?? "15") * 1000;
  const minutes = Number(argValue(argv, "--minutes") ?? "35");
  if (!(intervalMs >= 1000) || !(minutes > 0)) throw new Error("--interval-s must be >= 1 and --minutes > 0");
  mkdirSync(outDir, { recursive: true });
  const samplesPath = resolve(outDir, "worker-rss-samples.jsonl");
  const samples: WorkerRssSample[] = [];
  const started = Date.now();
  const finish = () => {
    const summary = summarizeWorkerRss(samples);
    writeFileSync(resolve(outDir, "worker-rss.json"), `${JSON.stringify(summary, null, 2)}\n`);
    writeFileSync(resolve(outDir, "worker-rss.md"), renderWorkerRss(summary));
    console.log(renderWorkerRss(summary));
    process.exit(0);
  };
  process.on("SIGINT", finish);
  process.on("SIGTERM", finish);
  while (Date.now() - started < minutes * 60_000) {
    const tick = sampleWorkers(psSnapshot(), Date.now() - started);
    for (const sample of tick) appendFileSync(samplesPath, `${JSON.stringify(sample)}\n`);
    samples.push(...tick);
    console.log(`[worker-rss] ${new Date().toISOString()} ${tick.length} workers, ${tick.map((s) => `${s.workerId.slice(0, 8)}=${mb(s.treeRssKb)}MB`).join(" ")}`);
    await Bun.sleep(intervalMs);
  }
  finish();
}

if (import.meta.main) await main(process.argv.slice(2));
