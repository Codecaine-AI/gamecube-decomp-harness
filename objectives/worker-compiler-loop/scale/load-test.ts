#!/usr/bin/env bun
/**
 * Sandbox-side load test (plan 3.6 "Scale readiness", slice S10).
 *
 * Drives the harness's own run machinery without LLM calls: the real job
 * queue (`startJobConsumer` + `workerJobDescriptor` + `workerKernelOps`),
 * real provisioning (`provisionSandboxWorkspace`: thin bundle, toolpack and
 * QA stamps), real worker children (`worker-child.ts`: the full
 * `runWorkerCycleFromTask` with a canned edit instead of the LLM turn),
 * real settlement deletion and the real integration queue
 * (`processWorkerOutputIntegrationQueue`) on a scratch clone.
 *
 * Never touches the live state DB or the live checkout: every ramp step gets
 * a fresh orchestrator.sqlite under the work dir, and the claim base is a
 * synthetic commit in a scratch clone (fixtures.ts).
 *
 * Dry-run (default): Daytona is fake-daytona-server.ts.
 * Live: `--live --confirm-live <run-id> --run-id <run-id>` plus explicit
 * `--max-alive`, `--max-sandbox-minutes` and `--sandbox-validation-evidence`;
 * anything missing is refused before a client exists.
 *
 *   bun objectives/worker-compiler-loop/scale/load-test.ts [--ramp 10,50,100,200]
 *   bun objectives/worker-compiler-loop/scale/load-test.ts --kill <run-id> --live --confirm-live <run-id>
 *
 * See LIVE-RUNBOOK.md for the live sequence.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, resolve } from "node:path";
import { Database } from "bun:sqlite";
import { fileEventSink, errorText, type EventSink } from "./lib/events.js";
import { installHostSpawnProbe, instrumentSqliteLocks, psSnapshot, descendants } from "./lib/host-probe.js";
import { CostGuard, startControlServer, type GuardLimits } from "./lib/guard.js";
import { httpFakeClient, instrumentClient, liveSdkClient, SCALE_RUN_LABEL, type ClientShape } from "./lib/daytona.js";
import { loadOrBuildFixtures, git } from "./fixtures.js";
import { loadEvents, nativeMeasurementSummary } from "./report.js";

export const SCALE_DIR = import.meta.dir;
export const HARNESS_ROOT = resolve(SCALE_DIR, "../../..");
const DEFAULT_SMS_CHECKOUT = "/Users/Ford/workspace/codebases/harnesses/gamecube-decomp-harness/games/sms/workspace/checkout";
const BACKFILL_REPORT = resolve(HARNESS_ROOT, "objectives/sms-real-codegen/backfill/backfill-report-runs-v2.json");

// ---- options ------------------------------------------------------------------

export interface LoadTestOptions {
  runId: string;
  live: boolean;
  confirmLive: string | null;
  kill: string | null;
  ramp: number[];
  maxAlive: number | null;
  maxSandboxMinutes: number | null;
  attemptTimeoutSeconds: number;
  stepTimeoutSeconds: number;
  maxHostRssGb: number;
  allowBuildSandboxes: boolean;
  timeScale: number;
  fakeQuota: number;
  fakeRateLimitRps: number;
  fakeInject429: number;
  /** Dry-run: fraction of native decisions captures the fake answers `unavailable`. */
  fakeNativeUnavailable: number;
  killAfterSeconds: number | null;
  profile: string;
  smsCheckout: string;
  workDir: string;
  reportDir: string;
  sandboxValidationEvidence: string | null;
  /** Dry-run: bake the targets' trusted bases into the fake image's .git (S11 item 4); off reproduces the S10 image. */
  bakeExtraRevs: boolean;
}

function newRunId(): string {
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..*/, "").replace("T", "-");
  return `scale-${stamp}-${Math.random().toString(36).slice(2, 6)}`;
}

const KNOWN_OPTIONS = new Set(["--run-id", "--live", "--confirm-live", "--kill", "--ramp", "--max-alive", "--max-sandbox-minutes", "--attempt-timeout-s", "--step-timeout-s", "--max-host-rss-gb", "--allow-build-sandboxes", "--time-scale", "--fake-quota", "--fake-rate-limit-rps", "--fake-inject-429", "--fake-native-unavailable", "--kill-after-s", "--profile", "--sms-checkout", "--work-dir", "--report-dir", "--sandbox-validation-evidence", "--no-bake-extra-revs"]);

export function parseOptions(argv: string[]): LoadTestOptions {
  for (const arg of argv) if (arg.startsWith("--") && !KNOWN_OPTIONS.has(arg)) throw new Error(`unknown option ${arg}`);
  const value = (name: string): string | undefined => {
    const i = argv.indexOf(name);
    if (i < 0) return undefined;
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) throw new Error(`${name} needs a value`);
    return next;
  };
  const flag = (name: string) => argv.includes(name);
  const num = (name: string, fallback: number) => {
    const raw = value(name);
    if (raw === undefined) return fallback;
    const n = Number(raw);
    if (!Number.isFinite(n)) throw new Error(`${name} must be a number`);
    return n;
  };
  const optionalNum = (name: string) => (value(name) === undefined ? null : num(name, 0));
  const kill = value("--kill") ?? null;
  const runId = value("--run-id") ?? kill ?? newRunId();
  if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{2,80}$/.test(runId)) throw new Error(`invalid run id ${runId}`);
  const ramp = (value("--ramp") ?? "10,50,100,200").split(",").map((part) => Number(part.trim()));
  if (!ramp.length || ramp.some((n) => !Number.isInteger(n) || n < 1 || n > 1000)) throw new Error("--ramp must list positive integers, e.g. 10,50,100,200");
  return {
    runId,
    live: flag("--live"),
    confirmLive: value("--confirm-live") ?? null,
    kill,
    ramp,
    maxAlive: optionalNum("--max-alive"),
    maxSandboxMinutes: optionalNum("--max-sandbox-minutes"),
    attemptTimeoutSeconds: num("--attempt-timeout-s", 1800),
    stepTimeoutSeconds: num("--step-timeout-s", 3600),
    maxHostRssGb: num("--max-host-rss-gb", 64),
    allowBuildSandboxes: flag("--allow-build-sandboxes"),
    timeScale: num("--time-scale", 0.02),
    fakeQuota: num("--fake-quota", 250),
    fakeRateLimitRps: num("--fake-rate-limit-rps", 0),
    fakeInject429: num("--fake-inject-429", 0),
    fakeNativeUnavailable: num("--fake-native-unavailable", 0),
    killAfterSeconds: optionalNum("--kill-after-s"),
    profile: value("--profile") ?? "1-core",
    smsCheckout: value("--sms-checkout") ?? DEFAULT_SMS_CHECKOUT,
    workDir: value("--work-dir") ?? resolve(tmpdir(), "scale-load-test", runId),
    reportDir: value("--report-dir") ?? resolve(SCALE_DIR, "results", runId),
    sandboxValidationEvidence: value("--sandbox-validation-evidence") ?? null,
    bakeExtraRevs: !flag("--no-bake-extra-revs"),
  };
}

const HEX40 = /^[0-9a-f]{40}$/;
const HEX64 = /^[0-9a-f]{64}$/;
const VALIDATION_OPERATION = /^sandbox-validation-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** The sandbox the evidence must have validated: the configured profile's snapshot and baked rev. */
export interface ExpectedSandbox { snapshot_name: string; snapshot_baked_rev: string }

/** The dry run's stand-in for validateHarnessSandbox evidence; marked synthetic, never accepted live. */
export function syntheticAdmissionEvidence(configurationRevision: string, sandbox: ExpectedSandbox): Record<string, unknown> {
  return { status: "passed", game_id: "sms", configuration_revision: configurationRevision, sandbox, synthetic: "dry-run load test" };
}

/**
 * A live run's sandbox admission evidence: the parsed `--sandbox-validation-evidence`
 * file must be what `validateHarnessSandbox` (harness-state/sandbox-validation.ts)
 * writes for a passed validation of this snapshot and baked rev:
 * - no `synthetic` marker (the dry run's stand-in);
 * - its operation id (`sandbox-validation-<uuid>`), which is also the evidence
 *   file's directory, and its start/completion timestamps;
 * - the validated head and configuration revision, the sandbox it built in;
 * - the report comparison: host and sandbox report digests, a clean sandbox
 *   build, and `report_comparison: "projection_equal"` with the projection digest.
 * Anything else (null, false, 0, "", an array, another status, snapshot or
 * baked rev, a missing field) is refused; a live run never falls back to synthetic evidence.
 */
export function liveAdmissionEvidence(parsed: unknown, expected: ExpectedSandbox, path: string): Record<string, unknown> {
  const record = (value: unknown) => value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
  const evidence = record(parsed);
  const sandbox = record(evidence?.sandbox);
  const build = record(evidence?.build);
  const time = (value: unknown) => typeof value === "string" && Number.isFinite(Date.parse(value));
  const operation = typeof evidence?.operation === "string" ? evidence.operation : "";
  const problems = !evidence ? ["not an evidence object"] : [
    "synthetic" in evidence ? "synthetic (dry-run) evidence" : null,
    evidence.status !== "passed" ? `status ${JSON.stringify(evidence.status)}` : null,
    evidence.game_id !== "sms" ? `game ${JSON.stringify(evidence.game_id)}` : null,
    !VALIDATION_OPERATION.test(operation) ? "no validateHarnessSandbox operation id" : null,
    VALIDATION_OPERATION.test(operation) && basename(dirname(resolve(path))) !== operation ? `file is not under its operation directory ${operation}` : null,
    !time(evidence.started_at) || !time(evidence.completed_at) ? "no validation timestamps" : null,
    typeof evidence.head !== "string" || !HEX40.test(evidence.head) ? "no validated head" : null,
    typeof evidence.configuration_revision !== "string" || !evidence.configuration_revision ? "no configuration revision" : null,
    !expected.snapshot_name || sandbox?.snapshot_name !== expected.snapshot_name ? `snapshot ${JSON.stringify(sandbox?.snapshot_name)} is not ${expected.snapshot_name || "(none configured)"}` : null,
    !expected.snapshot_baked_rev || sandbox?.snapshot_baked_rev !== expected.snapshot_baked_rev ? `baked rev ${JSON.stringify(sandbox?.snapshot_baked_rev)} is not ${expected.snapshot_baked_rev || "(none configured)"}` : null,
    typeof evidence.sandbox_id !== "string" || !evidence.sandbox_id ? "no validation sandbox id" : null,
    build?.exitCode !== 0 ? "no clean sandbox report build" : null,
    typeof evidence.host_report_sha256 !== "string" || !HEX64.test(evidence.host_report_sha256) ? "no host report digest" : null,
    typeof evidence.sandbox_report_sha256 !== "string" || !HEX64.test(evidence.sandbox_report_sha256) ? "no sandbox report digest" : null,
    evidence.report_comparison !== "projection_equal" || typeof evidence.report_projection_sha256 !== "string" || !HEX64.test(evidence.report_projection_sha256) ? "no report comparison result" : null,
  ].filter((problem): problem is string => problem !== null);
  if (problems.length > 0) {
    throw new Error(`sandbox validation evidence ${path} is not a passed validation of ${expected.snapshot_name || "(no snapshot)"}: ${problems.join("; ")}`);
  }
  return evidence!;
}

/**
 * The live gate. Returns the refusal reason, or null when the options may
 * touch real Daytona. Dry-run options always pass (they never build a live client).
 */
export function liveRefusal(
  options: Pick<LoadTestOptions, "live" | "confirmLive" | "runId" | "maxAlive" | "maxSandboxMinutes" | "sandboxValidationEvidence" | "kill" | "ramp">,
  env: Record<string, string | undefined> = process.env,
): string | null {
  if (!options.live) return null;
  if (!options.confirmLive) return "--live requires --confirm-live <run-id>";
  // The kill switch deletes the --kill target: the confirmation must name it, and no other run id may stand in for it.
  if (options.kill && options.runId !== options.kill) return `--run-id ${options.runId} differs from the kill target ${options.kill}; omit --run-id or repeat the kill target`;
  if (options.kill && options.confirmLive !== options.kill) return `--confirm-live ${options.confirmLive} does not match the kill target ${options.kill}`;
  if (options.confirmLive !== options.runId) return `--confirm-live ${options.confirmLive} does not match the run id ${options.runId}`;
  if (!env.DAYTONA_API_KEY?.trim()) return "--live requires DAYTONA_API_KEY in the environment";
  if (options.kill) return null;
  if (options.maxAlive === null) return "--live requires an explicit --max-alive";
  if (options.maxSandboxMinutes === null) return "--live requires an explicit --max-sandbox-minutes";
  if (options.maxAlive < Math.max(...options.ramp)) return `--max-alive ${options.maxAlive} is below the ramp peak ${Math.max(...options.ramp)}`;
  if (!options.sandboxValidationEvidence) return "--live requires --sandbox-validation-evidence <evidence.json> from a passed validateHarnessSandbox run";
  return null;
}

// ---- outcome ------------------------------------------------------------------

/** What `runStep` reports that decides whether the step passed. */
export interface StepOutcome {
  concurrency: number;
  targets: number;
  timed_out: boolean;
  guard_tripped: string | null;
  /** Worker job counts by status. */
  jobs: Record<string, number>;
  /** Native measurements per operation (report.ts nativeMeasurementSummary); every succeeded attempt needs one ok per operation. */
  native_measurements?: Record<string, { calls: number; ok: number; failed: number; by_reason?: Record<string, number> }>;
  /** Integration drains or outcome queries that threw. */
  integration_failures?: number;
}

/** The native measurements every worker attempt must produce (readiness item 6). */
const REQUIRED_MEASUREMENTS = ["native_decisions", "compare_sources"] as const;

/**
 * Why a ramp step failed, empty when it passed: it timed out, the cost guard
 * tripped, not every target's worker job succeeded (failed, cancelled, or
 * never finished), a required native measurement failed or is missing for a
 * succeeded attempt, or integration infrastructure failed. Gate verdicts
 * (pass, steering_located, rejected) are job successes and never count here.
 */
export function stepFailures(step: StepOutcome): string[] {
  const failures: string[] = [];
  if (step.timed_out) failures.push("step timed out");
  if (step.guard_tripped) failures.push(`guard tripped: ${step.guard_tripped}`);
  const succeeded = step.jobs.succeeded ?? 0;
  const unsuccessful = Object.entries(step.jobs).filter(([status, n]) => status !== "succeeded" && n > 0);
  if (unsuccessful.length > 0) failures.push(`worker jobs not succeeded: ${unsuccessful.map(([status, n]) => `${status} ${n}`).join(", ")}`);
  if (succeeded + unsuccessful.reduce((sum, [, n]) => sum + n, 0) < step.targets) failures.push(`only ${succeeded} of ${step.targets} targets ran to success`);
  // A worker job succeeds even when its native capture was unavailable or malformed; the measurement still failed.
  if (step.native_measurements) {
    for (const operation of REQUIRED_MEASUREMENTS) {
      const measured = step.native_measurements[operation] ?? { calls: 0, ok: 0, failed: 0 };
      if (measured.failed > 0) {
        const reasons = Object.entries(measured.by_reason ?? {}).map(([reason, n]) => `${reason} ${n}`).join(", ");
        failures.push(`${operation} measurement failed ${measured.failed} time(s)${reasons ? ` (${reasons})` : ""}`);
      }
      if (measured.ok < succeeded) failures.push(`${operation} measured ${measured.ok} of ${succeeded} succeeded attempts`);
    }
  }
  if ((step.integration_failures ?? 0) > 0) failures.push(`integration failed ${step.integration_failures} time(s)`);
  return failures;
}

/** The command's exit code: non-zero when any step or the run itself failed. */
export function runExitCode(failures: string[]): number {
  for (const failure of failures) console.error(`[scale] FAILED: ${failure}`);
  return failures.length > 0 ? 1 : 0;
}

// ---- kill switch ------------------------------------------------------------------

export interface KillSwitchProvider {
  listByLabels(labels: Record<string, string>): Promise<Array<{ sandboxId: string }>>;
  delete(id: string, reason: "reconciliation"): Promise<void>;
}

/** Deletes every sandbox labelled with this run id; returns what it found and what is left. */
export async function killSwitch(provider: KillSwitchProvider, runId: string, sink: EventSink, concurrency = 16): Promise<{ found: number; deleted: number; errors: string[]; remaining: number }> {
  const started = performance.now();
  const found = await provider.listByLabels({ [SCALE_RUN_LABEL]: runId });
  const errors: string[] = [];
  let deleted = 0;
  const queue = [...found];
  await Promise.all(Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
    for (let next = queue.shift(); next; next = queue.shift()) {
      try {
        await provider.delete(next.sandboxId, "reconciliation");
        deleted += 1;
      } catch (error) {
        errors.push(`${next.sandboxId}: ${errorText(error)}`);
      }
    }
  }));
  const remaining = (await provider.listByLabels({ [SCALE_RUN_LABEL]: runId })).length;
  sink.emit({ kind: "control", action: "kill_switch", detail: { run_id: runId, found: found.length, deleted, errors: errors.slice(0, 10), remaining, ms: performance.now() - started } });
  return { found: found.length, deleted, errors, remaining };
}

// ---- process sampling --------------------------------------------------------------

export function roleOf(command: string, selfPid: number, pid: number): string {
  if (pid === selfPid) return "orchestrator";
  if (command.includes("worker-child.ts")) return "worker";
  if (command.includes("fake-daytona-server.ts")) return "fake_daytona";
  if (/(^|\/)git\b/.test(command)) return "host_git";
  if (/python3?\b/.test(command)) return "host_python";
  return "host_other";
}

function startSampler(sink: EventSink, guard: CostGuard, maxHostRssGb: number, fakePid: number | null) {
  let peakTotal = 0;
  let peakWorkers = 0;
  const timer = setInterval(() => {
    try {
      const snapshot = psSnapshot();
      let total = 0;
      let workers = 0;
      for (const sample of descendants(snapshot, process.pid)) {
        const role = roleOf(sample.command, process.pid, sample.pid);
        if (role === "fake_daytona") continue;
        total += sample.rssKb;
        if (role === "worker") workers += 1;
        sink.emit({ kind: "proc_sample", pid: sample.pid, role, rssKb: sample.rssKb, cpuSeconds: sample.cpuSeconds });
      }
      const fake = fakePid ? snapshot.find((s) => s.pid === fakePid) : undefined;
      if (fake) sink.emit({ kind: "proc_sample", pid: fake.pid, role: "fake_daytona", rssKb: fake.rssKb, cpuSeconds: fake.cpuSeconds });
      peakTotal = Math.max(peakTotal, total);
      peakWorkers = Math.max(peakWorkers, workers);
      if (total / 1024 / 1024 > maxHostRssGb) guard.trip(`host RSS ${(total / 1024 / 1024).toFixed(1)} GiB above --max-host-rss-gb ${maxHostRssGb}`);
      guard.check();
    } catch (error) {
      console.error(`[scale] sampler: ${errorText(error)}`);
    }
  }, 1_000);
  return { stop: () => clearInterval(timer), peak: () => ({ totalRssKb: peakTotal, workers: peakWorkers }) };
}

// ---- fake Daytona process -------------------------------------------------------------

async function startFakeDaytona(options: LoadTestOptions, seedRoot: string, targetsFile: string, eventsDir: string) {
  const portFile = resolve(options.workDir, "fake-daytona.port");
  const statsFile = resolve(options.workDir, "fake-daytona.stats.json");
  rmSync(portFile, { force: true });
  const proc = Bun.spawn([
    "bun", resolve(SCALE_DIR, "fake-daytona-server.ts"), "--port-file", portFile, "--stats-file", statsFile, "--seed-root", seedRoot,
    "--workspace-root", "/work/sms", "--targets", targetsFile, "--time-scale", String(options.timeScale), "--quota", String(options.fakeQuota),
    "--rate-limit-rps", String(options.fakeRateLimitRps), "--inject-429", String(options.fakeInject429), "--native-unavailable", String(options.fakeNativeUnavailable),
  ], { cwd: HARNESS_ROOT, env: { ...process.env, SCALE_EVENTS_DIR: eventsDir }, stdout: "inherit", stderr: "inherit" });
  for (let i = 0; i < 200 && !existsSync(portFile); i += 1) await Bun.sleep(50);
  if (!existsSync(portFile)) {
    proc.kill(9);
    throw new Error("fake Daytona did not start");
  }
  const url = `http://127.0.0.1:${readFileSync(portFile, "utf8").trim()}`;
  return { url, pid: proc.pid, statsFile, stop: async () => { proc.kill("SIGTERM"); await proc.exited; } };
}

// ---- main ------------------------------------------------------------------------

export async function main(argv = process.argv.slice(2)): Promise<number> {
  const options = parseOptions(argv);
  // The harness reads DAYTONA_API_KEY from the Codecaine env file (job-runner.ts); load it only for a confirmed live run.
  if (options.live && options.confirmLive === options.runId && !process.env.DAYTONA_API_KEY) {
    const { loadCodecaineEnv } = await import("@server/infrastructure/env/codecaine-env");
    loadCodecaineEnv();
  }
  const refusal = liveRefusal(options);
  if (refusal) {
    console.error(`[scale] refused: ${refusal}`);
    return 2;
  }
  if (options.kill && !options.live) {
    console.error("[scale] --kill needs --live --confirm-live <run-id>: a dry run's sandboxes live in its own fake Daytona and die with it");
    return 2;
  }
  mkdirSync(options.workDir, { recursive: true });
  const eventsDir = options.workDir;
  process.env.SCALE_EVENTS_DIR = eventsDir;
  if (!options.live) delete process.env.DAYTONA_API_KEY;
  const sink = fileEventSink(eventsDir, "orchestrator", { runId: options.runId });
  installHostSpawnProbe(sink);
  instrumentSqliteLocks(Database.prototype as never, sink);
  // Harness warnings (consumer tick failures, settlement teardown failures) count as failures too.
  const warn = console.warn.bind(console);
  console.warn = (...parts: unknown[]) => {
    const text = parts.map((part) => (part instanceof Error ? part.message : String(part))).join(" ");
    if (/fail|error/i.test(text)) sink.emit({ kind: "failure", failureKind: `orchestrator_warning:${text.replace(/[0-9a-f-]{8,}/g, "<id>").slice(0, 60)}`, detail: text.slice(0, 500) });
    warn(...parts);
  };

  // Harness modules load after the spawn probe so their host subprocesses are observed.
  const sandboxModule = await import("@server/core/job-queue/sandbox.js");
  const admissionModule = await import("@server/core/job-queue/sandbox-create-admission.js");
  const provisioning = await import("@server/core/job-queue/provisioning.js");
  const executorModule = await import("@server/core/job-queue/executor.js");
  const consumerModule = await import("@server/core/job-queue/consumer.js");
  const workerJob = await import("@server/core/harness-runtime/phases/running/workers/worker-job.js");
  const runState = await import("@server/core/harness-runtime/run-state/index.js");
  const unverified = await import("@server/core/harness-runtime/run-state/unverified-matches.js");
  const harnessState = await import("@server/core/harness-state/state.js");
  const lease = await import("@server/core/harness-state/lease.js");
  const store = await import("@server/core/orchestrator-state/index.js");
  const resolver = await import("@server/core/game-registry/resolver.js");
  const configRevision = await import("@server/core/game-registry/config-revision.js");
  const provenance = await import("@server/core/game-registry/sandbox-provenance.js");
  const integration = await import("@server/core/harness-runtime/phases/running/integration/worker-output-queue.js");
  const editScope = await import("@server/core/validation/edit-scope/edit-scope.js");
  const ordering = await import("@server/core/tools/ordering.js");

  // Every Daytona call in this process goes through the instrumented client and the cost guard.
  const limits: GuardLimits = {
    maxAlive: options.maxAlive ?? Math.max(...options.ramp) + 10,
    maxSandboxMinutes: options.maxSandboxMinutes ?? 100_000,
    allowBuildSandboxes: options.allowBuildSandboxes,
  };
  const guard = new CostGuard(limits, sink);
  const control = startControlServer(guard);
  const makeProvider = (base: () => Promise<ClientShape>) => {
    const client = base().then((value) => instrumentClient(value, { sink, scaleRunId: options.runId, admission: guard, defaultPurpose: "worker" }));
    (sandboxModule.DaytonaSandboxProvider.prototype as unknown as { client: () => Promise<unknown> }).client = () => client;
    return new sandboxModule.DaytonaSandboxProvider({ readApiKey: () => "scale" });
  };

  if (options.kill) {
    const result = await killSwitch(makeProvider(() => liveSdkClient(process.env.DAYTONA_API_KEY!)), options.kill, sink);
    console.log(JSON.stringify(result, null, 2));
    control.stop();
    return result.remaining === 0 && result.errors.length === 0 ? 0 : 1;
  }

  // ---- fixtures and scratch checkout ----
  const peak = Math.max(...options.ramp);
  const cacheDir = resolve(tmpdir(), "scale-load-test", "cache");
  mkdirSync(cacheDir, { recursive: true });
  const scratch = resolve(cacheDir, "sms-scratch");
  console.error(`[scale] ${options.runId}: preparing the scratch clone and ${peak} canned targets`);
  const fixtures = loadOrBuildFixtures({ smsCheckout: options.smsCheckout, scratch, cacheFile: resolve(cacheDir, "fixtures.json"), count: peak, backfillReportPath: BACKFILL_REPORT });
  if (fixtures.targets.length < peak) console.error(`[scale] only ${fixtures.targets.length} distinct-file targets for a peak of ${peak}`);
  // Host-side inputs the worker's board snapshot reads (cheap reads the plan keeps on the host).
  for (const rel of ["build/GMSJ01/report.json", "objdiff.json", "build.ninja", "orig/GMSJ01/files/mario.MAP"]) {
    mkdirSync(resolve(scratch, rel, ".."), { recursive: true });
    copyFileSync(resolve(options.smsCheckout, rel), resolve(scratch, rel));
  }
  // The integration scope check (host edit_scope.py) reads the original target objects; link them read-only.
  const objLink = resolve(scratch, "build/GMSJ01/obj");
  if (!existsSync(objLink)) symlinkSync(resolve(options.smsCheckout, "build/GMSJ01/obj"), objLink);
  const targetsFile = resolve(options.workDir, "targets.json");
  writeFileSync(targetsFile, JSON.stringify(fixtures.targets, null, 2));

  // Function index the worker context reads (what the code_graph index provides live).
  const knowledgeRoot = resolve(options.workDir, "knowledge");
  const functionsIndex = resolve(knowledgeRoot, "sources", "code_graph", "indexes", "functions.jsonl");
  mkdirSync(resolve(functionsIndex, ".."), { recursive: true });
  writeFileSync(functionsIndex, `${fixtures.targets.map((t) => JSON.stringify({ unit: t.unit, kind: "function", symbol: t.symbol, sourcePath: t.sourcePath, size: t.size, fuzzy: t.baseScore })).join("\n")}\n`);
  process.env.ORCH_GAME_KNOWLEDGE_ROOT = knowledgeRoot;

  let fake: Awaited<ReturnType<typeof startFakeDaytona>> | null = null;
  let provider: InstanceType<typeof sandboxModule.DaytonaSandboxProvider>;
  if (options.live) {
    provider = makeProvider(() => liveSdkClient(process.env.DAYTONA_API_KEY!));
  } else {
    fake = await startFakeDaytona(options, scratch, targetsFile, eventsDir);
    const url = fake.url;
    provider = makeProvider(async () => httpFakeClient(url));
  }
  const childEnv = {
    SCALE_EVENTS_DIR: eventsDir, SCALE_TARGETS_FILE: targetsFile, SCALE_RUN_ID: options.runId, SCALE_CONTROL_URL: control.url,
    SCALE_MODE: options.live ? "live" : "fake", SCALE_FAKE_URL: fake?.url ?? "", ORCH_GAME_KNOWLEDGE_ROOT: knowledgeRoot,
  };

  const sampler = startSampler(sink, guard, options.maxHostRssGb, fake?.pid ?? null);
  // The kill switch runs when the guard trips and again at the end of the run:
  // creates already in flight at the trip finish later and need the second sweep.
  let killing: Promise<unknown> = Promise.resolve();
  const runKill = (why: string) => {
    killing = killing.then(async () => {
      console.error(`[scale] kill switch: ${why}`);
      const result = await killSwitch(provider, options.runId, sink);
      console.error(`[scale] kill switch deleted ${result.deleted}/${result.found}, remaining ${result.remaining}`);
      return result;
    }).catch((error) => console.error(`[scale] kill switch failed: ${errorText(error)}`));
    return killing;
  };
  guard.whenTripped((reason) => { void runKill(`cost guard tripped: ${reason}`); });
  const killTimer = options.killAfterSeconds !== null ? setTimeout(() => guard.trip(`--kill-after-s ${options.killAfterSeconds}`), options.killAfterSeconds * 1000) : null;
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, () => { guard.trip(`received ${signal}`); setTimeout(() => process.exit(130), 120_000).unref(); });
  }

  const baseGame = resolver.resolveGame({ gameId: "sms", orchestratorRoot: HARNESS_ROOT, explicitOverrides: { repoRoot: scratch } as never });
  const sandboxProvenance = provenance.captureSandboxProvenance(baseGame, options.profile);
  const stepSummaries: Array<Record<string, unknown>> = [];
  const startedAt = new Date().toISOString();

  // Sandbox admission evidence: live reuses a passed validateHarnessSandbox result; dry-run writes a synthetic one.
  const liveEvidence = options.live
    ? liveAdmissionEvidence(JSON.parse(readFileSync(options.sandboxValidationEvidence!, "utf8")), sandboxProvenance, options.sandboxValidationEvidence!)
    : null;
  /** Each step's state DB gets its own copy, bound to that step's configuration revision; only a dry run writes synthetic evidence. */
  const writeAdmissionEvidence = (path: string, configurationRevision: string) => {
    if (options.live && !liveEvidence) throw new Error("live run without validated sandbox evidence");
    writeFileSync(path, JSON.stringify(options.live
      ? { ...liveEvidence, configuration_revision: configurationRevision, source_evidence: options.sandboxValidationEvidence }
      : syntheticAdmissionEvidence(configurationRevision, sandboxProvenance), null, 2));
  };
  console.error(`[scale] work dir ${options.workDir}`);

  const runFailures: string[] = [];
  try {
    for (const concurrency of options.ramp) {
      if (guard.tripped) break;
      // Dry-run: re-bake the fake snapshot before each step, so a toolpack edited
      // since the last step does not make every provision re-sync (the live image
      // is fixed; see the toolpack_sync row of the report for drift).
      if (fake) await bakeFakeImage(fake.url);
      const summary = await runStep(concurrency);
      stepSummaries.push(summary);
      // A failed step ends the ramp: the next, larger step would only spend more on the same failure.
      const failures = stepFailures(summary as unknown as StepOutcome);
      if (failures.length > 0) {
        runFailures.push(...failures.map((failure) => `step ${concurrency}: ${failure}`));
        console.error(`[scale] step ${concurrency} failed (${failures.join("; ")}); the ramp stops here`);
        break;
      }
    }
  } catch (error) {
    runFailures.push(`run error: ${errorText(error)}`);
    throw error;
  } finally {
    if (killTimer) clearTimeout(killTimer);
    await killing;
    await runKill(guard.tripped ? `final sweep after guard trip (${guard.tripped})` : "end of run");
    sampler.stop();
    if (fake) await fake.stop();
    const fakeStats = fake && existsSync(fake.statsFile) ? JSON.parse(readFileSync(fake.statsFile, "utf8")) : null;
    control.stop();
    writeFileSync(resolve(options.workDir, "run.json"), `${JSON.stringify({
      run_id: options.runId, mode: options.live ? "live" : "dry-run (fake Daytona)", started_at: startedAt, ended_at: new Date().toISOString(),
      options, guard: guard.summary(), steps: stepSummaries, failures: runFailures, fake_daytona: fakeStats,
      fixtures: { base_rev: fixtures.baseRev, head_rev: fixtures.headRev, shortfalls: fixtures.shortfalls, kinds: countKinds(fixtures.targets.map((t) => t.kind)) },
      host: { peak_rss_kb: sampler.peak().totalRssKb, peak_worker_processes: sampler.peak().workers },
    }, null, 2)}\n`);
    const { writeReport } = await import("./report.js");
    const written = writeReport(options.workDir, options.reportDir);
    console.error(`[scale] report: ${written.markdown}`);
  }
  if (guard.tripped && !runFailures.some((failure) => failure.includes("guard tripped"))) runFailures.push(`guard tripped: ${guard.tripped}`);
  if (guard.alive() !== 0) runFailures.push(`${guard.alive()} sandboxes still alive after the kill switch`);
  return runExitCode(runFailures);

  /** Dry-run "image bake": one provisioned sandbox's stamps become the fake snapshot's files. */
  async function bakeFakeImage(url: string): Promise<void> {
    const bakeStore = store.openState(resolve(options.workDir, "bake-state"));
    try {
      const provisioned = await provisioning.provisionSandboxWorkspace({
        provider, sourceRepoRoot: scratch, baseRev: fixtures.baseRev, snapshotBakedRev: sandboxProvenance.snapshot_baked_rev,
        workspaceRoot: sandboxProvenance.workspace_root, snapshot: sandboxProvenance.snapshot_name,
        resources: { cpu: sandboxProvenance.resource_class.cpu, memoryGiB: sandboxProvenance.resource_class.memory_gib, diskGiB: sandboxProvenance.resource_class.disk_gib },
        ttlSeconds: 600, labels: { game_id: "sms", run_id: "bake", claim_id: "bake", job_id: "bake", job_lease_id: "bake", dispatch_lease_id: "bake", worker_state_id: "bake", trace_id: "bake" },
        reportArtifactSources: [], event: { store: bakeStore, context: { gameId: "sms", correlationId: "bake", causationId: "bake", traceId: "bake", jobId: "bake", claimId: "bake", workerStateId: "bake" } as never },
      });
      const response = await fetch(`${url}/admin/bake`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({
        id: provisioned.sandboxId,
        paths: ["/opt/toolpacks/gamecube-decomp/.ready", provisioning.SANDBOX_QA_STAMP_PATH],
        // The trusted bases current unverified rows use (what extra-baked-revs.ts lists for a real image).
        revs: options.bakeExtraRevs ? [...new Set(fixtures.targets.map((t) => t.trustedBaseRev).filter((rev): rev is string => Boolean(rev)))] : [],
      }) });
      if (!response.ok) throw new Error(`fake image bake failed: ${await response.text()}`);
      await provider.delete(provisioned.sandboxId, "settlement");
    } finally {
      bakeStore.db.close();
    }
    sink.emit({ kind: "control", action: "image_baked" });
  }

  /** One ramp step: a fresh state DB, run and epoch with `concurrency` targets, drained to completion. */
  async function runStep(concurrency: number): Promise<Record<string, unknown>> {
    const stepTargets = fixtures.targets.slice(0, concurrency);
    git(scratch, ["checkout", "--quiet", "--force", "--detach", fixtures.baseRev]);
    const stepDir = resolve(options.workDir, `step-${concurrency}`);
    rmSync(stepDir, { recursive: true, force: true });
    const stateDir = resolve(stepDir, "state");
    const db = store.openState(stateDir);
    const stepSink = fileEventSink(eventsDir, `orchestrator-step${concurrency}`, { runId: options.runId, step: concurrency });
    stepSink.emit({ kind: "control", action: "step_start", detail: { concurrency, targets: stepTargets.length } });
    const stepStarted = performance.now();
    const stepStartedAt = Date.now();
    /** Integration infrastructure failures (a drain or the outcome query threw): the step fails on any. */
    let integrationFailures = 0;
    const game = resolver.resolveGame({ gameId: "sms", orchestratorRoot: HARNESS_ROOT, explicitOverrides: { repoRoot: scratch, stateDir } as never });
    const configuration = configRevision.gameConfigurationRevision(game);
    const evidencePath = resolve(stepDir, "sandbox-validation-evidence.json");
    writeAdmissionEvidence(evidencePath, configuration);

    // Harness, run and epoch in the shape a live SMS run has once Sync and sandbox validation passed.
    const harness = harnessState.initializeHarnessState(db.db, { gameId: "sms", worktree: scratch, configurationRevision: configuration, commandId: `${options.runId}-init` });
    harnessState.transitionHarnessState(db.db, {
      gameId: "sms", expectedRevision: harness.identity.revision, commandId: `${options.runId}-ready`,
      patch: { source: { head: fixtures.baseRev, upstream_revision: fixtures.baseRev }, readiness: { build: "ready", evidence: "ready", sources: "ready", sandbox: "ready" }, execution: { desired: "run", workflow: "none", status: "idle" } },
      boundary: { eventId: `${options.runId}-sandbox-validated`, kind: "sandbox_validated", outcome: "sandbox_validated", evidence: { path: evidencePath, profile: sandboxProvenance.profile, snapshot: sandboxProvenance.snapshot_name, sandbox: sandboxProvenance, configuration_revision: configuration } },
    } as never);
    const run = runState.createRun(db, "matched_code_percent", 100, concurrency, { gameId: "sms", stateDir, repoRoot: scratch } as never, { baseRevision: fixtures.baseRev });
    for (const target of stepTargets) {
      if (target.kind !== "unverified_repair") continue;
      unverified.recordUnverifiedMatch(db, {
        gameId: "sms", unit: target.unit, symbol: target.symbol, analyzedRev: fixtures.baseRev, baseRev: target.trustedBaseRev ?? null,
        sourcePath: target.sourcePath, match: { base: 100, candidate: 100, real_only: target.afterScore }, reasons: ["load test: recorded unverified"],
        report: { unit: target.unit, name: target.symbol, decision: "unresolved", provenance: target.provenance },
      });
    }
    lease.initializeDispatchState(db, { gameId: "sms", traceId: `trace-${options.runId}` });
    const dispatch = lease.requestDispatch(db, { kind: "run", workflowId: run.id, reason: "scale load test", commandId: `${options.runId}-dispatch-${concurrency}`, correlationId: run.id, actor: "operator", gameId: "sms" });
    if (dispatch.queued) throw new Error("dispatch lease is busy");
    runState.updateRunStatus(db, run.id, "active", "operator");
    const epoch = runState.startSchedulerEpoch(db, run.id, { workerPoolSize: concurrency });
    runState.admitEpochTargets(db, {
      epochId: epoch.id, runId: run.id, workerPoolSize: concurrency,
      candidates: stepTargets.map((t) => ({ kind: "function", unit: t.unit, symbol: t.symbol, sourcePath: t.sourcePath, size: t.size, fuzzy: t.baseScore })) as never,
    });

    const globals = { repoRoot: scratch, stateDir, gameId: "sms", game, dryRunAgents: false, provider: "scale-load-test", model: "canned-edit", thinkingLevel: "medium", sandboxProfile: options.profile };
    const ctx = {
      store: db, globals, runId: run.id, dispatchLeaseId: dispatch.leaseId, baseRev: fixtures.baseRev,
      ttlSeconds: options.attemptTimeoutSeconds, sandboxSleep: false, sandboxSleepDebounceMs: 250, concurrencyLimit: concurrency,
      thinkingLevel: "medium", postReturnCheckCommand: "", workerConfigureCommand: "", graphDbPath: resolve(stateDir, "graph.db"),
      writeSetFlags: { writeSetWidening: "off" }, advisoryAdjudication: "off", workerIdPrefix: "scale",
    } as never;

    // The real LocalProcessExecutor, launching worker-child.ts in place of job-runner.ts worker-task.
    const local = new executorModule.LocalProcessExecutor();
    const childPath = resolve(SCALE_DIR, "worker-child.ts");
    const executor = {
      submit: (task: { command: string[]; env: Record<string, string> }) => {
        const command = task.command.map((part) => (part.endsWith("apps/server/src/job-runner.ts") ? childPath : part));
        const env: Record<string, string> = { ...task.env, ...childEnv };
        if (!options.live) delete env.DAYTONA_API_KEY;
        return local.submit({ ...task, command, env } as never);
      },
      poll: (handle: never) => local.poll(handle),
      collect: (handle: never) => local.collect(handle),
      cancel: (handle: never) => local.cancel(handle),
    };
    const deletions = new Set<Promise<void>>();
    const timedProvision = async (params: Parameters<typeof provisioning.provisionSandboxWorkspace>[0]) => {
      const started = performance.now();
      try {
        const result = await provisioning.provisionSandboxWorkspace(params);
        stepSink.emit({ kind: "phase", phase: "provision", ms: performance.now() - started, ok: true, workerId: params.labels.worker_state_id, seed: result.seed?.kind ?? null } as never);
        return result;
      } catch (error) {
        stepSink.emit({ kind: "phase", phase: "provision", ms: performance.now() - started, ok: false, workerId: params.labels.worker_state_id, error: errorText(error).slice(0, 300) });
        stepSink.emit({ kind: "failure", failureKind: "provision", detail: errorText(error).slice(0, 500), workerId: params.labels.worker_state_id });
        throw error;
      }
    };
    let integrationPending = false;
    const descriptor = workerJob.workerJobDescriptor(ctx, {
      sandboxProvider: provider, executor: executor as never, provisionSandbox: timedProvision as never,
      trackSandboxDeletion: (deletion: Promise<void>) => { deletions.add(deletion); void deletion.finally(() => deletions.delete(deletion)); },
    });
    const consumer = consumerModule.startJobConsumer(db, descriptor, workerJob.workerKernelOps(ctx), {
      intervalMs: 500, actor: "runner", runId: run.id,
      shouldClaim: () => !guard.tripped,
      onJobSettled: (job, settle) => {
        integrationPending = true;
        if (settle.status === "failed") stepSink.emit({ kind: "failure", failureKind: "worker_job", detail: (settle.error ?? "").slice(0, 800), workerId: String(job.payload.worker_state_id ?? "") });
      },
    });
    const integrationOrdering = { ordering: editScope.editScopePolicyFromGame({ ordering: ordering.gameOrdering(game) }) };
    let integrationProcessed = 0;
    const drain = async () => {
      const started = performance.now();
      const result = await integration.processWorkerOutputIntegrationQueue({ dryRun: false, leaseId: dispatch.leaseId, ...integrationOrdering, repoRoot: scratch, runId: run.id, stateDir, store: db } as never);
      const results = result.processed as Array<{ status?: string }>;
      integrationProcessed += results.length;
      if (results.length > 0) {
        stepSink.emit({ kind: "integration", ms: performance.now() - started, processed: results.length, applied: results.filter((r) => r.status === "applied").length, failed: results.filter((r) => r.status === "failed" || r.status === "conflict").length, statuses: countKinds(results.map((r) => String(r.status))) } as never);
      }
    };
    const heartbeat = setInterval(() => { try { lease.heartbeatDispatch(db, { leaseId: dispatch.leaseId, gameId: "sms" }); } catch {} }, 30_000);
    const reap = setInterval(() => { void workerJob.reapWorkerJobs(db, ctx, { sandboxProvider: provider }).catch(() => undefined); }, 15_000);
    const workerJobs = () => db.db.query("SELECT status, COUNT(*) AS n FROM jobs WHERE kind = 'worker' AND run_id = ? GROUP BY status").all(run.id) as Array<{ status: string; n: number }>;
    const deadline = Date.now() + options.stepTimeoutSeconds * 1000;
    let timedOut = false;
    try {
      while (true) {
        if (integrationPending) {
          integrationPending = false;
          await drain().catch((error) => {
            integrationFailures += 1;
            stepSink.emit({ kind: "failure", failureKind: "integration_drain", detail: errorText(error).slice(0, 500) });
          });
        }
        const rows = workerJobs();
        const total = rows.reduce((sum, row) => sum + row.n, 0);
        const terminal = rows.filter((row) => ["succeeded", "failed", "cancelled"].includes(row.status)).reduce((sum, row) => sum + row.n, 0);
        if (total >= stepTargets.length && terminal >= total && consumer.inFlight() === 0) break;
        if (guard.tripped) break;
        if (Date.now() > deadline) {
          timedOut = true;
          stepSink.emit({ kind: "failure", failureKind: "step_timeout", detail: `step ${concurrency} exceeded ${options.stepTimeoutSeconds}s` });
          break;
        }
        await Bun.sleep(250);
      }
      if (timedOut || guard.tripped) await consumer.cancelAll();
      await consumer.stop();
      await Promise.allSettled([...deletions]);
      await drain().catch((error) => {
        integrationFailures += 1;
        stepSink.emit({ kind: "failure", failureKind: "integration_drain", detail: errorText(error).slice(0, 500) });
      });
    } finally {
      clearInterval(heartbeat);
      clearInterval(reap);
    }
    const jobs = workerJobs();
    let integrationOutcomes: Record<string, number> = {};
    try {
      integrationOutcomes = Object.fromEntries((db.db.query("SELECT status, COUNT(*) AS n FROM integration_outcomes WHERE run_id = ? GROUP BY status").all(run.id) as Array<{ status: string; n: number }>).map((row) => [row.status, row.n]));
    } catch (error) {
      integrationOutcomes = { unreadable: 1 };
      integrationFailures += 1;
      stepSink.emit({ kind: "failure", failureKind: "integration_outcomes_query", detail: errorText(error) });
    }
    // Native measurements this step's workers recorded (worker-child.ts; steps run one at a time).
    const measurements = nativeMeasurementSummary(loadEvents(options.workDir).filter((event) => event.t >= stepStartedAt) as never);
    const summary = {
      concurrency, targets: stepTargets.length, kinds: countKinds(stepTargets.map((t) => t.kind)),
      wall_seconds: Number(((performance.now() - stepStarted) / 1000).toFixed(2)), timed_out: timedOut, guard_tripped: guard.tripped,
      jobs: Object.fromEntries(jobs.map((row) => [row.status, row.n])), integration_outcomes: integrationOutcomes, integration_processed: integrationProcessed,
      alive_after: guard.alive(), state_db: resolve(stateDir, "orchestrator.sqlite"),
      native_measurements: measurements, integration_failures: integrationFailures,
    };
    stepSink.emit({ kind: "control", action: "create_admission", detail: { concurrency, ...admissionModule.sharedSandboxCreateAdmission().stats } });
    stepSink.emit({ kind: "control", action: "step_end", detail: summary });
    console.error(`[scale] step ${concurrency}: jobs ${JSON.stringify(summary.jobs)} in ${summary.wall_seconds}s; integration ${JSON.stringify(integrationOutcomes)}`);
    try { lease.releaseDispatch(db, { gameId: "sms", leaseId: dispatch.leaseId, commandId: `${options.runId}-release-${concurrency}`, correlationId: run.id, actor: "operator" } as never); } catch {}
    db.db.close();
    return summary;
  }
}

function countKinds(kinds: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const kind of kinds) out[kind] = (out[kind] ?? 0) + 1;
  return out;
}

if (import.meta.main) {
  main().then((code) => process.exit(code), (error) => {
    console.error(`[scale] ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
    process.exit(1);
  });
}
