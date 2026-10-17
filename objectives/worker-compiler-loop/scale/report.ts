#!/usr/bin/env bun
/**
 * Aggregates a load-test work dir (events/*.jsonl + run.json) into
 * report.json and report.md. Runs at the end of load-test.ts; can be rerun:
 *
 *   bun objectives/worker-compiler-loop/scale/report.ts <work-dir> [<report-dir>]
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { REQUIRED_ATTEMPT_STEPS, hostCommandIsOrchestration } from "./lib/commands.js";

type Event = Record<string, any> & { t: number; role: string; kind: string };

export function percentile(values: number[], p: number): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index]!;
}

const round = (value: number | null, digits = 1) => (value === null ? null : Number(value.toFixed(digits)));
const stats = (values: number[]) => ({ n: values.length, p50: round(percentile(values, 50)), p95: round(percentile(values, 95)), max: round(values.length ? Math.max(...values) : null) });

/** Validation steps that must never run on the host (plan 3.6). */
const SANDBOX_ONLY = new Set<string>([...REQUIRED_ATTEMPT_STEPS, "unused_stub_test", "real_code_evidence", "m2c", "format_check", "steering_placement_probe"]);

/** Every scale event the run's processes wrote under `<workDir>/events`, oldest first. */
export function loadEvents(workDir: string): Event[] {
  const dir = resolve(workDir, "events");
  if (!existsSync(dir)) return [];
  const events: Event[] = [];
  for (const file of readdirSync(dir)) {
    if (!file.endsWith(".jsonl")) continue;
    for (const line of readFileSync(resolve(dir, file), "utf8").split("\n")) {
      if (!line.trim()) continue;
      try { events.push(JSON.parse(line)); } catch {}
    }
  }
  return events.sort((a, b) => a.t - b.t);
}

function group<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    const list = out.get(k) ?? [];
    list.push(item);
    out.set(k, list);
  }
  return out;
}

/**
 * Native capture coverage (readiness item 6): per operation, tool calls and
 * successful measurements, and the failures by reason (`measurement:<op>`
 * failures that worker-child.ts records for unavailable, malformed or failed results).
 */
export function nativeMeasurementSummary(events: Array<{ kind: string; phase?: string; ok?: boolean; failureKind?: string; detail?: unknown }>): Record<string, { calls: number; ok: number; failed: number; by_reason: Record<string, number> }> {
  const out: Record<string, { calls: number; ok: number; failed: number; by_reason: Record<string, number> }> = {};
  for (const operation of ["native_decisions", "compare_sources"]) {
    const calls = events.filter((e) => e.kind === "phase" && e.phase === `tool:${operation}`);
    const by_reason: Record<string, number> = {};
    for (const failure of events.filter((e) => e.kind === "failure" && e.failureKind === `measurement:${operation}`)) {
      const reason = String(failure.detail ?? "").split(":")[0] || "unknown";
      by_reason[reason] = (by_reason[reason] ?? 0) + 1;
    }
    out[operation] = { calls: calls.length, ok: calls.filter((e) => e.ok).length, failed: calls.filter((e) => !e.ok).length, by_reason };
  }
  return out;
}

function summarizeWindow(events: Event[]) {
  const execs = events.filter((e) => e.kind === "exec");
  const hostSpawns = events.filter((e) => e.kind === "host_spawn");
  const api = events.filter((e) => e.kind === "api");
  const sandboxes = events.filter((e) => e.kind === "sandbox");
  const attempts = events.filter((e) => e.kind === "attempt");
  const phases = events.filter((e) => e.kind === "phase");
  const locks = events.filter((e) => e.kind === "sqlite_lock");
  const failures = events.filter((e) => e.kind === "failure");
  const samples = events.filter((e) => e.kind === "proc_sample");
  const integration = events.filter((e) => e.kind === "integration");

  // Step latency and placement.
  const steps: Record<string, unknown> = {};
  for (const [step, list] of group(execs, (e) => e.step)) {
    steps[step] = { placement: "sandbox", ...stats(list.map((e) => e.ms)), nonzero_exit: list.filter((e) => e.exitCode !== 0).length };
  }
  const placementFailures: Array<Record<string, unknown>> = [];
  const hostCompute: Record<string, unknown> = {};
  for (const [key, list] of group(hostSpawns, (e) => `${e.role}:${e.step}`)) {
    const [role, step] = key.split(":") as [string, string];
    const orchestration = hostCommandIsOrchestration(list[0]!.argv ?? []);
    const entry = { role, step, ...stats(list.map((e) => e.ms)), cpu_ms_total: round(list.reduce((sum, e) => sum + (e.cpuMs ?? 0), 0)), example: (list[0]!.argv ?? []).slice(0, 4).join(" ") };
    hostCompute[key] = entry;
    if (SANDBOX_ONLY.has(step) || (!orchestration && role === "worker")) placementFailures.push({ ...entry, reason: SANDBOX_ONLY.has(step) ? "validation step ran on the host" : "worker child spawned a non-orchestration host process" });
  }

  // Required-step coverage per attempt sandbox.
  const bySandbox = group(execs.filter((e) => e.role === "worker"), (e) => e.sandboxId);
  const missing: Record<string, number> = {};
  for (const list of bySandbox.values()) {
    const seen = new Set(list.map((e) => e.step));
    for (const step of REQUIRED_ATTEMPT_STEPS) if (!seen.has(step)) missing[step] = (missing[step] ?? 0) + 1;
  }

  // Daytona API.
  const apiOps: Record<string, unknown> = {};
  for (const [op, list] of group(api, (e) => e.op)) {
    apiOps[op] = { calls: list.length, errors: list.filter((e) => !e.ok).length, http_429: list.filter((e) => e.status === 429).length, ...stats(list.map((e) => e.ms)) };
  }
  const creates = sandboxes.filter((e) => e.action === "create");
  const deletes = sandboxes.filter((e) => e.action === "delete");

  // Host memory per worker child: peak RSS per pid.
  const peakByPid = new Map<number, { role: string; rssKb: number; cpuSeconds: number }>();
  for (const sample of samples) {
    const prior = peakByPid.get(sample.pid);
    if (!prior || sample.rssKb > prior.rssKb || sample.cpuSeconds > prior.cpuSeconds) {
      peakByPid.set(sample.pid, { role: sample.role, rssKb: Math.max(prior?.rssKb ?? 0, sample.rssKb), cpuSeconds: Math.max(prior?.cpuSeconds ?? 0, sample.cpuSeconds) });
    }
  }
  const workerPeaks = [...peakByPid.values()].filter((v) => v.role === "worker");
  const orchestratorPeak = [...peakByPid.values()].find((v) => v.role === "orchestrator");
  // One sampler tick per second: dedupe by pid within a second, so two ticks landing in one second never double count.
  const bySecond = new Map<number, Map<number, { role: string; rssKb: number }>>();
  for (const sample of samples) {
    if (sample.role === "fake_daytona") continue;
    const second = Math.floor(sample.t / 1000);
    const pids = bySecond.get(second) ?? new Map();
    pids.set(sample.pid, { role: sample.role, rssKb: Math.max(pids.get(sample.pid)?.rssKb ?? 0, sample.rssKb) });
    bySecond.set(second, pids);
  }
  const totalBySecond = new Map<number, number>();
  const workersBySecond = new Map<number, number>();
  for (const [second, pids] of bySecond) {
    let total = 0;
    let workers = 0;
    for (const value of pids.values()) { total += value.rssKb; if (value.role === "worker") workers += 1; }
    totalBySecond.set(second, total);
    workersBySecond.set(second, workers);
  }

  // Attempts.
  const attemptKinds: Record<string, unknown> = {};
  for (const [kind, list] of group(attempts, (e) => e.targetKind)) {
    attemptKinds[kind] = { attempts: list.length, ok: list.filter((e) => e.ok).length, verdicts: Object.fromEntries([...group(list, (e) => String(e.verdict ?? "none"))].map(([k, v]) => [k, v.length])), ...stats(list.map((e) => e.ms / 1000)) };
  }
  const seeds = Object.fromEntries([...group(phases.filter((e) => e.phase === "provision" && e.ok), (e) => String(e.seed ?? "unknown"))].map(([k, v]) => [k, v.length]));
  const phaseStats: Record<string, unknown> = {};
  for (const [phase, list] of group(phases, (e) => e.phase)) phaseStats[phase] = { ...stats(list.map((e) => e.ms)), failed: list.filter((e) => !e.ok).length };

  const failuresByKind: Record<string, { count: number; examples: string[] }> = {};
  for (const failure of failures) {
    const entry = failuresByKind[failure.failureKind] ??= { count: 0, examples: [] };
    entry.count += 1;
    if (entry.examples.length < 3 && !entry.examples.includes(String(failure.detail).slice(0, 240))) entry.examples.push(String(failure.detail).slice(0, 240));
  }
  for (const attempt of attempts.filter((e) => !e.ok)) {
    const entry = failuresByKind[`attempt:${attempt.targetKind}`] ??= { count: 0, examples: [] };
    entry.count += 1;
    if (entry.examples.length < 3) entry.examples.push(String(attempt.failure ?? "").slice(0, 240));
  }

  const drainMs = integration.reduce((sum, e) => sum + e.ms, 0);
  const processed = integration.reduce((sum, e) => sum + e.processed, 0);
  const spanSeconds = events.length ? (events.at(-1)!.t - events[0]!.t) / 1000 : 0;
  return {
    span_seconds: round(spanSeconds),
    attempts: { total: attempts.length, ok: attempts.filter((e) => e.ok).length, by_kind: attemptKinds, latency_seconds: stats(attempts.map((e) => e.ms / 1000)) },
    phases: phaseStats,
    provision_seed_kinds: seeds,
    steps,
    required_step_coverage: { attempts_with_sandbox_execs: bySandbox.size, missing_by_step: missing },
    placement_failures: placementFailures,
    host_compute: hostCompute,
    daytona_api: { ops: apiOps, total_calls: api.length, errors: api.filter((e) => !e.ok).length, http_429: api.filter((e) => e.status === 429).length, calls_per_attempt: attempts.length ? round(api.length / attempts.length) : null },
    sandboxes: {
      created: creates.filter((e) => e.ok).length, create_failures: creates.filter((e) => !e.ok).length, deleted: deletes.filter((e) => e.ok).length,
      create_ms: stats(creates.filter((e) => e.ok).map((e) => e.ms)), delete_ms: stats(deletes.filter((e) => e.ok).map((e) => e.ms)),
      by_purpose: Object.fromEntries([...group(creates.filter((e) => e.ok), (e) => e.purpose)].map(([k, v]) => [k, v.length])),
      build_sandboxes: creates.filter((e) => e.ok && e.purpose === "build").length,
      build_sandboxes_per_attempt: attempts.length ? round(creates.filter((e) => e.ok && e.purpose === "build").length / attempts.length, 3) : null,
    },
    host: {
      worker_children: workerPeaks.length,
      worker_peak_rss_mb: stats(workerPeaks.map((v) => v.rssKb / 1024)),
      worker_cpu_seconds: stats(workerPeaks.map((v) => v.cpuSeconds)),
      orchestrator_peak_rss_mb: orchestratorPeak ? round(orchestratorPeak.rssKb / 1024) : null,
      orchestrator_cpu_seconds: orchestratorPeak ? round(orchestratorPeak.cpuSeconds) : null,
      peak_total_rss_gb: round(Math.max(0, ...totalBySecond.values()) / 1024 / 1024, 2),
      peak_concurrent_worker_children: Math.max(0, ...workersBySecond.values()),
    },
    sqlite: {
      waits_over_5ms: locks.length, busy_errors: locks.filter((e) => e.busyError).length,
      wait_ms: stats(locks.map((e) => e.ms)),
      by_role: Object.fromEntries([...group(locks, (e) => e.role)].map(([k, v]) => [k, { ...stats(v.map((e) => e.ms)), total_ms: round(v.reduce((s, e) => s + e.ms, 0)) }])),
    },
    integration: { drains: integration.length, processed, drain_ms_total: round(drainMs), per_item_ms: processed ? round(drainMs / processed) : null, items_per_minute: drainMs ? round(processed / (drainMs / 60_000)) : null },
    failures_by_kind: failuresByKind,
    native_measurements: nativeMeasurementSummary(events as never),
  };
}

export function buildReport(workDir: string) {
  const run = existsSync(resolve(workDir, "run.json")) ? JSON.parse(readFileSync(resolve(workDir, "run.json"), "utf8")) : {};
  const events = loadEvents(workDir);
  const controls = events.filter((e) => e.kind === "control");
  const windows: Array<{ concurrency: number; start: number; end: number }> = [];
  for (const start of controls.filter((e) => e.action === "step_start")) {
    const concurrency = start.detail?.concurrency;
    const end = controls.find((e) => e.action === "step_end" && e.detail?.concurrency === concurrency && e.t >= start.t);
    windows.push({ concurrency, start: start.t, end: end?.t ?? events.at(-1)?.t ?? start.t });
  }
  const steps = windows.map((window) => ({
    concurrency: window.concurrency,
    summary: (run.steps ?? []).find((s: any) => s.concurrency === window.concurrency) ?? null,
    ...summarizeWindow(events.filter((e) => e.t >= window.start && e.t <= window.end)),
  }));
  return {
    run_id: run.run_id, mode: run.mode, started_at: run.started_at, ended_at: run.ended_at,
    guard: run.guard, fixtures: run.fixtures, host_peak: run.host,
    kill_switch: controls.filter((e) => e.action === "kill_switch").map((e) => e.detail),
    create_admission: controls.filter((e) => e.action === "create_admission").map((e) => e.detail),
    guard_events: controls.filter((e) => e.action === "guard_tripped" || e.action === "create_refused").slice(0, 20).map((e) => ({ action: e.action, ...e.detail })),
    fake_daytona: run.fake_daytona ? { peak_alive: run.fake_daytona.peak_alive, created: run.fake_daytona.created, alive_at_end: run.fake_daytona.alive, sandbox_minutes: run.fake_daytona.sandbox_minutes, counters: run.fake_daytona.counters } : null,
    steps,
    overall: summarizeWindow(events),
  };
}

function table(headers: string[], rows: Array<Array<unknown>>): string {
  const cell = (v: unknown) => (v === null || v === undefined ? "" : typeof v === "object" ? JSON.stringify(v) : String(v)).replaceAll("|", "\\|");
  return [`| ${headers.join(" | ")} |`, `| ${headers.map(() => "---").join(" | ")} |`, ...rows.map((r) => `| ${r.map(cell).join(" | ")} |`)].join("\n");
}

export function renderMarkdown(report: ReturnType<typeof buildReport>): string {
  const out: string[] = [];
  out.push(`# Load test ${report.run_id}`, "", `- Mode: ${report.mode}`, `- Window: ${report.started_at} to ${report.ended_at}`);
  out.push(`- Cost guard: ${JSON.stringify(report.guard)}`);
  out.push(`- Kill switch: ${JSON.stringify(report.kill_switch)}`);
  if (report.fake_daytona) out.push(`- Fake Daytona: peak alive ${report.fake_daytona.peak_alive}, created ${report.fake_daytona.created}, alive at end ${report.fake_daytona.alive_at_end}`);
  out.push("", "## Ramp", "");
  out.push(table(["concurrency", "attempts ok/total", "wall s", "attempt p50/p95 s", "provision p50/p95 ms", "API calls", "API calls/attempt", "429", "build sandboxes", "placement failures", "toolpack re-syncs", "worker RSS p50/max MB", "peak total RSS GB", "sqlite waits >5ms (max ms)", "integration items/min"],
    report.steps.map((s) => [
      s.concurrency, `${s.attempts.ok}/${s.attempts.total}`, s.summary?.wall_seconds ?? s.span_seconds,
      `${s.attempts.latency_seconds.p50}/${s.attempts.latency_seconds.p95}`,
      `${(s.phases as any).provision?.p50 ?? ""}/${(s.phases as any).provision?.p95 ?? ""}`,
      s.daytona_api.total_calls, s.daytona_api.calls_per_attempt, s.daytona_api.http_429, s.sandboxes.build_sandboxes, s.placement_failures.length, (s.steps as any).toolpack_sync?.n ?? 0,
      `${s.host.worker_peak_rss_mb.p50}/${s.host.worker_peak_rss_mb.max}`, s.host.peak_total_rss_gb,
      `${s.sqlite.waits_over_5ms} (${s.sqlite.wait_ms.max ?? 0})`, s.integration.items_per_minute,
    ])));
  for (const step of report.steps) {
    out.push("", `## Step ${step.concurrency}`, "");
    if (step.summary) out.push(`Jobs ${JSON.stringify(step.summary.jobs)}; integration outcomes ${JSON.stringify(step.summary.integration_outcomes)}; kinds ${JSON.stringify(step.summary.kinds)}.`, "");
    out.push("### Step latency and placement", "", table(["step", "placement", "n", "p50 ms", "p95 ms", "max ms", "non-zero exit"],
      Object.entries(step.steps).sort(([a], [b]) => a.localeCompare(b)).map(([name, v]: [string, any]) => [name, v.placement, v.n, v.p50, v.p95, v.max, v.nonzero_exit])));
    out.push("", `Required-step coverage: ${step.required_step_coverage.attempts_with_sandbox_execs} attempt sandboxes; missing ${JSON.stringify(step.required_step_coverage.missing_by_step)}.`);
    out.push("", "### Host processes spawned (placement evidence)", "", table(["role:step", "n", "p50 ms", "p95 ms", "cpu ms total", "example"],
      Object.entries(step.host_compute).map(([k, v]: [string, any]) => [k, v.n, v.p50, v.p95, v.cpu_ms_total, v.example])));
    if (step.placement_failures.length) out.push("", `Placement failures: ${JSON.stringify(step.placement_failures)}`);
    out.push("", "### Daytona API", "", table(["op", "calls", "errors", "429", "p50 ms", "p95 ms"],
      Object.entries(step.daytona_api.ops).map(([op, v]: [string, any]) => [op, v.calls, v.errors, v.http_429, v.p50, v.p95])));
    out.push("", `Sandboxes: ${JSON.stringify(step.sandboxes)}`);
    const admission = report.create_admission.find((entry: any) => entry.concurrency === step.concurrency);
    if (admission) out.push("", `Create admission (cumulative in this process): ${JSON.stringify(admission)}`);
    out.push("", "### Attempts", "", table(["kind", "attempts", "ok", "verdicts", "p50 s", "p95 s"],
      Object.entries(step.attempts.by_kind).map(([k, v]: [string, any]) => [k, v.attempts, v.ok, v.verdicts, v.p50, v.p95])));
    out.push("", "### Phases", "", table(["phase", "n", "p50 ms", "p95 ms", "max ms", "failed"], Object.entries(step.phases).map(([k, v]: [string, any]) => [k, v.n, v.p50, v.p95, v.max, v.failed])));
    out.push("", `Provision seed kinds (thin = ^baked bundle, full = whole history): ${JSON.stringify(step.provision_seed_kinds)}`);
    out.push("", `Native measurements (ok = nested status ok with its schema): ${JSON.stringify(step.native_measurements)}`);
    out.push("", `Host: ${JSON.stringify(step.host)}`, "", `SQLite: ${JSON.stringify(step.sqlite)}`, "", `Integration: ${JSON.stringify(step.integration)}`);
    out.push("", "### Failures by kind", "", Object.keys(step.failures_by_kind).length ? table(["kind", "count", "examples"], Object.entries(step.failures_by_kind).map(([k, v]) => [k, v.count, v.examples.join(" / ")])) : "None.");
  }
  return `${out.join("\n")}\n`;
}

export function writeReport(workDir: string, reportDir: string): { json: string; markdown: string } {
  const report = buildReport(workDir);
  mkdirSync(reportDir, { recursive: true });
  const json = resolve(reportDir, "report.json");
  const markdown = resolve(reportDir, "report.md");
  writeFileSync(json, `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(markdown, renderMarkdown(report));
  return { json, markdown };
}

if (import.meta.main) {
  const [workDir, reportDir] = process.argv.slice(2);
  if (!workDir) throw new Error("usage: report.ts <work-dir> [<report-dir>]");
  console.log(writeReport(workDir, reportDir ?? workDir));
}
