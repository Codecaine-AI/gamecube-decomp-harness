import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { hostname } from "node:os";
import { resolve } from "node:path";
import { booleanArg, stringArg, type GlobalArgs } from "@server/core/game-registry/runtime-options.js";
import { packageRoot } from "@server/core/knowledge";
import { openState } from "@server/core/harness-runtime/run-state";
import type { StateStore } from "@server/core/orchestrator-state";
import {
  claimSteeringExplainJobs,
  failSteeringExplainJob,
  finishSteeringExplainJob,
  releaseSteeringExplainJob,
  retrySteeringExplainJob,
  type SteeringExplainJob,
} from "@server/core/harness-runtime/run-state/steering-explain.js";
import { steeringObservation } from "@server/core/harness-runtime/run-state/steering.js";
import { steeringGateActive } from "@server/core/tools/steering-gate.js";
import { executeBuildTask, REMOTE_STEERING_INPUTS } from "@server/core/validation/build/execution.js";
import { SANDBOX_STEERING_EXPLAIN_SCRIPT, STEERING_EXPLAIN_TOOLPACK_PATH } from "@server/core/validation/steering/steering-check.js";
import { runCommand, type CommandResult } from "@server/infrastructure/shell";
import type { SteeringBuildTaskExecutor } from "./steering-gate.js";

/**
 * `steering-explain` (worker-compiler-loop plan 3.4.1, D2): the compiler
 * delta for a non-pass steering observation, computed off the worker path.
 * Each claimed job (`run-state/steering-explain.ts`) runs in two steps of
 * `steering_explain.py`:
 *
 * - `prepare` (host, pure JSON): reads the gate's host artifacts the job
 *   names (`{edits, mwcc, decision}` or a backfill `{check}` report) and the
 *   observation's probe, and writes the compact sandbox input. It may
 *   already know the delta is `unavailable` (reconstruction impossible);
 *   that is published as is.
 * - `run` (a `steering` build task in a Daytona build sandbox, like
 *   `buildSandboxSteeringRunner`): rebuilds candidate and S* with the stock
 *   compiler, checks the fidelity record's hashes, and only then traces.
 *
 * Only `ok` and `unavailable` are published: the job row keeps the delta and,
 * for a `gate` job, the observation's probe gets `compiler_delta`. An
 * `ablation` never touches the probe. A result with neither
 * `summary_lines` nor `unavailable` is malformed and retried, never shown as
 * an empty delta. Failures (a thrown task, a non-zero exit, bad JSON) retry
 * up to `maxAttempts`; a `retryable: false` error fails the job at once, and
 * a failed gate job leaves `{unavailable: "explain job failed: ..."}` on the
 * probe.
 *
 * Provenance: the queued fidelity record binds the job to the gate run that
 * recorded the observation. `prepare` gets its `input_hash` as
 * `--expect-fidelity-hash` (it reports `unavailable` when the artifacts no
 * longer carry it), and the job also refuses a prepared input whose
 * `fidelity_input_hash` differs: a replaced report never publishes under the
 * original observation.
 *
 * Runners claim one job at a time under a lease (`timeoutMs` + 5 min) and an
 * owner id; a dead runner's job is reclaimed when its lease expires, and a
 * runner that lost its lease publishes nothing.
 */
export const STEERING_EXPLAIN_TIMEOUT_MS = 15 * 60_000;
export const STEERING_EXPLAIN_MAX_ATTEMPTS = 3;
export const STEERING_EXPLAIN_RESULT_SCHEMA = "steering-explain-result-v1";
const STEERING_EXPLAIN_DEFAULT_LIMIT = 10;
/** The delta of a job queued without the observation's fidelity record (a gate from before the record). */
export const STEERING_EXPLAIN_NO_FIDELITY = "reconstruction: no fidelity record";
const NO_FIDELITY = STEERING_EXPLAIN_NO_FIDELITY;
/** Lease headroom past the task timeout (prepare, upload, publishing). */
const STEERING_EXPLAIN_LEASE_SLACK_MS = 5 * 60_000;
/** Seconds of the task timeout kept back from `run --timeout-seconds` (verification, ninja, the report). */
const STEERING_EXPLAIN_REPORT_SLACK_SECONDS = 180;

/** The tool hash lives in a leaf module the worker's observation hook imports. */
export { STEERING_EXPLAIN_TOOL_FILES, steeringExplainToolFiles, steeringExplainToolHash } from "@server/core/harness-runtime/run-state/steering-explain-tool-hash.js";

export interface SteeringExplainSummary {
  claimed: number;
  /** Published measured deltas. */
  done: number;
  /** Published `{unavailable}` deltas. */
  unavailable: number;
  retried: number;
  failed: number;
  /** Jobs whose lease another runner took over before this one finished: nothing was published. */
  lost: number;
}

/** `steering_explain.py <args>` on the host; `args` start with the subcommand (`prepare`). */
export type SteeringExplainPrepare = (args: string[]) => Promise<CommandResult>;

export function hostSteeringExplainPrepare(script: string, cwd: string, timeoutMs: number): SteeringExplainPrepare {
  return (args) => runCommand(cwd, ["python3", script, ...args], { timeoutMs });
}

type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/** stdout's JSON object: the whole text, else its last non-empty line. */
function stdoutJson(stdout: string): JsonObject | null {
  const text = stdout.trim();
  for (const candidate of [text, text.split("\n").map((line) => line.trim()).filter(Boolean).at(-1) ?? ""]) {
    try {
      const parsed = JSON.parse(candidate) as unknown;
      if (isObject(parsed)) return parsed;
    } catch {
      // try the next form
    }
  }
  return null;
}

/** A publishable delta: a measured one (`summary_lines` array) or `{unavailable: string}`. */
function publishableDelta(value: unknown): JsonObject | null {
  if (!isObject(value)) return null;
  if (typeof value.unavailable === "string") return value;
  return Array.isArray(value.summary_lines) ? value : null;
}

/** The queued fidelity record's `input_hash`: the gate run the observation came from. */
function expectedFidelityHash(job: SteeringExplainJob): string | null {
  return typeof job.fidelity.input_hash === "string" && job.fidelity.input_hash ? job.fidelity.input_hash : null;
}

function prepareArgs(job: SteeringExplainJob, probePath: string | null, out: string): string[] | string {
  const inputs = job.inputs;
  const source = typeof inputs.check === "string"
    ? ["--check", inputs.check]
    : typeof inputs.edits === "string" && typeof inputs.mwcc === "string" && typeof inputs.decision === "string"
      ? ["--edits", inputs.edits, "--mwcc", inputs.mwcc, "--decision", inputs.decision]
      : null;
  if (!source) return "explain job names no gate artifacts (check, or edits/mwcc/decision)";
  return [
    "prepare", ...source,
    "--unit", job.unit, "--function", job.symbol, "--observation-id", String(job.observationId),
    ...(probePath ? ["--probe", probePath] : []),
    ...(job.variant ? ["--variant", job.variant] : []),
    "--label", job.label,
    "--expect-fidelity-hash", expectedFidelityHash(job)!,
    "--out", out,
  ];
}

type JobOutcome =
  | { kind: "published"; delta: JsonObject; probe: JsonObject | null }
  | { kind: "retry"; error: string }
  | { kind: "fail"; error: string };

/** `work`, or a rejection as soon as `signal` aborts (the abandoned `work` settling later is ignored). */
function untilAborted<T>(work: Promise<T>, signal: AbortSignal | undefined): Promise<T> {
  if (!signal) return work;
  return new Promise<T>((resolveWork, rejectWork) => {
    const onAbort = () => { work.catch(() => undefined); rejectWork(new Error("aborted at shutdown")); };
    if (signal.aborted) return onAbort();
    signal.addEventListener("abort", onAbort, { once: true });
    work.then(resolveWork, rejectWork).finally(() => signal.removeEventListener("abort", onAbort));
  });
}

async function explainOne(params: {
  store: StateStore;
  job: SteeringExplainJob;
  repoRoot: string;
  workDir: string;
  timeoutMs: number;
  execute: SteeringBuildTaskExecutor;
  prepare: SteeringExplainPrepare;
  signal?: AbortSignal;
}): Promise<JobOutcome> {
  const { job } = params;
  const expected = expectedFidelityHash(job);
  // Without the observation's fidelity record nothing binds the job to the artifacts it names (a later
  // gate may have replaced them), and nothing could be rebuilt anyway: publish that, never prepare.
  if (!expected) return { kind: "published", delta: { unavailable: NO_FIDELITY }, probe: null };
  if (job.label === "gate" && job.inputHash !== expected) {
    return { kind: "fail", error: "queued input hash does not match its fidelity record" };
  }
  const observation = steeringObservation(params.store, job.observationId);
  if (!observation) return { kind: "fail", error: `observation ${job.observationId} not found` };
  const out = resolve(params.workDir, `explain-${job.id}.json`);
  let probePath: string | null = null;
  if (observation.probe) {
    probePath = resolve(params.workDir, `explain-${job.id}.probe.json`);
    writeFileSync(probePath, `${JSON.stringify(observation.probe)}\n`);
  }
  const args = prepareArgs(job, probePath, out);
  if (typeof args === "string") return { kind: "fail", error: args };

  let prepared: CommandResult;
  try {
    prepared = await params.prepare(args);
  } catch (error) {
    return { kind: "retry", error: `prepare: ${error instanceof Error ? error.message : String(error)}` };
  }
  const plan = stdoutJson(prepared.stdout);
  if (plan?.status === "unavailable") {
    const delta = publishableDelta(plan.compiler_delta);
    if (delta && typeof delta.unavailable === "string") return { kind: "published", delta, probe: null };
    return { kind: "retry", error: "prepare: unavailable without compiler_delta.unavailable" };
  }
  if (plan?.status !== "ok" || prepared.exitCode !== 0 || !existsSync(out)) {
    const why = typeof plan?.error === "string" ? plan.error : plan ? `status ${String(plan.status)}` : "no JSON on stdout";
    return { kind: "retry", error: `prepare exited ${prepared.exitCode}: ${why}${prepared.stderr.trim() ? `; ${prepared.stderr.trim().slice(-400)}` : ""}` };
  }
  const preparedHash = typeof plan.fidelity_input_hash === "string" ? plan.fidelity_input_hash : preparedFidelityHash(out);
  if (preparedHash !== expected) {
    return { kind: "fail", error: `provenance: the prepared input is for fidelity ${preparedHash ?? "(none)"}, the observation recorded ${expected}` };
  }

  const remote = `${REMOTE_STEERING_INPUTS}/call/explain-${job.id}.json`;
  let ran: Partial<CommandResult> | undefined;
  try {
    // Aborted (run-loop shutdown): stop waiting at once; the build task deletes its sandbox.
    ran = await untilAborted(params.execute<Partial<CommandResult>>(params.repoRoot, {
      kind: "steering",
      input: {
        // The tool's own deadline (compare_sources) ends before the task's, leaving time to report.
        command: ["python3", SANDBOX_STEERING_EXPLAIN_SCRIPT, "run", "--input", remote, "--json",
          "--timeout-seconds", String(Math.max(60, Math.floor(params.timeoutMs / 1000) - STEERING_EXPLAIN_REPORT_SLACK_SECONDS))],
        options: { timeoutMs: params.timeoutMs },
        timeoutMs: params.timeoutMs,
        uploads: { [remote]: out },
      },
    }, params.signal ? { signal: params.signal } : {}), params.signal);
  } catch (error) {
    return { kind: "retry", error: `run: ${error instanceof Error ? error.message : String(error)}` };
  }
  const exitCode = typeof ran?.exitCode === "number" ? ran.exitCode : 1;
  const result = stdoutJson(ran?.stdout ?? "");
  const wellFormed = result && result.schema === STEERING_EXPLAIN_RESULT_SCHEMA
    && (result.observation_id === undefined || Number(result.observation_id) === job.observationId);
  if (wellFormed && result.status === "error") {
    const error = `run: ${typeof result.error === "string" ? result.error : "error"}`;
    return result.retryable === false ? { kind: "fail", error } : { kind: "retry", error };
  }
  if (!wellFormed || exitCode !== 0) {
    const stderr = (ran?.stderr ?? "").trim();
    return { kind: "retry", error: `run exited ${exitCode}: ${wellFormed ? "" : "no steering-explain-result-v1 on stdout"}${stderr ? `; ${stderr.slice(-400)}` : ""}` };
  }
  if (result.status !== "ok" && result.status !== "unavailable") return { kind: "retry", error: `run: unknown status ${String(result.status)}` };
  const delta = publishableDelta(result.compiler_delta);
  if (!delta || (result.status === "unavailable" && typeof delta.unavailable !== "string")) {
    return { kind: "retry", error: "run: malformed compiler_delta (neither summary_lines nor unavailable)" };
  }
  return { kind: "published", delta, probe: isObject(result.probe) ? result.probe : null };
}

/** `fidelity_input_hash` of the prepared sandbox input (when `prepare` did not print it). */
function preparedFidelityHash(out: string): string | null {
  try {
    const input = JSON.parse(readFileSync(out, "utf8")) as unknown;
    return isObject(input) && typeof input.fidelity_input_hash === "string" ? input.fidelity_input_hash : null;
  } catch {
    return null;
  }
}

/** The probe a published gate delta leaves on the observation. */
function publishedProbe(job: SteeringExplainJob, existing: JsonObject | null, outcome: { delta: JsonObject; probe: JsonObject | null }): JsonObject {
  if (outcome.probe) return "compiler_delta" in outcome.probe ? outcome.probe : { ...outcome.probe, compiler_delta: outcome.delta };
  if (existing) return { ...existing, compiler_delta: outcome.delta };
  return { function: job.symbol, symbol: job.symbol, unit: job.unit, compiler_delta: outcome.delta };
}

/** Claims and runs queued explain jobs of a game; never throws for one job's failure. */
export async function runSteeringExplainJobs(params: {
  store: StateStore;
  gameId: string;
  /** Host checkout the build sandbox syncs from. */
  repoRoot: string;
  limit?: number;
  maxAttempts?: number;
  observationId?: number;
  execute?: SteeringBuildTaskExecutor;
  prepare?: SteeringExplainPrepare;
  timeoutMs?: number;
  /** Host directory for `prepare`'s outputs and probe copies. */
  workDir: string;
  /** Host `steering_explain.py` for the default `prepare`. */
  script?: string;
  /** Claim owner; default `host:pid:uuid`. */
  owner?: string;
  /** Clock for claim leases. */
  now?: () => Date;
  /**
   * Shutdown (the run loop's consumer): an aborted runner claims nothing more, stops waiting on its
   * build task, and writes nothing; its claim is released by the consumer. `closed` (the store is about
   * to close) likewise stops every write. A completion arriving after either is dropped, logged once.
   */
  signal?: AbortSignal;
  closed?: () => boolean;
  /** Called right after a claim and after the job's own writes; the consumer tracks claims to release. */
  onClaimed?: (job: SteeringExplainJob, owner: string) => void;
  onSettled?: (job: SteeringExplainJob) => void;
  log?: (message: string) => void;
}): Promise<SteeringExplainSummary> {
  const maxAttempts = params.maxAttempts ?? STEERING_EXPLAIN_MAX_ATTEMPTS;
  const timeoutMs = params.timeoutMs ?? STEERING_EXPLAIN_TIMEOUT_MS;
  const execute = params.execute ?? executeBuildTask;
  const prepare = params.prepare ?? hostSteeringExplainPrepare(
    params.script ?? resolve(packageRoot(), "toolpacks/gamecube-decomp", STEERING_EXPLAIN_TOOLPACK_PATH),
    params.workDir, // prepare reads only the named artifacts (absolute paths); it never needs the checkout
    timeoutMs,
  );
  mkdirSync(params.workDir, { recursive: true });
  const owner = params.owner ?? `${hostname()}:${process.pid}:${randomUUID()}`;
  const clock = params.now ?? (() => new Date());
  const leaseMs = timeoutMs + STEERING_EXPLAIN_LEASE_SLACK_MS;
  const limit = params.limit ?? STEERING_EXPLAIN_DEFAULT_LIMIT;
  const handled: number[] = [];
  const summary: SteeringExplainSummary = { claimed: 0, done: 0, unavailable: 0, retried: 0, failed: 0, lost: 0 };
  const halted = () => Boolean(params.signal?.aborted || params.closed?.());
  // One job per claim: a runner that dies strands at most one lease.
  while (summary.claimed < limit && !halted()) {
    const [job] = claimSteeringExplainJobs(params.store, {
      gameId: params.gameId,
      limit: 1,
      maxAttempts,
      owner,
      leaseMs,
      now: clock(),
      excludeIds: handled,
      ...(params.observationId != null ? { observationId: params.observationId } : {}),
    });
    if (!job) break;
    handled.push(job.id);
    summary.claimed += 1;
    params.onClaimed?.(job, owner);
    let outcome: JobOutcome;
    try {
      outcome = await explainOne({ store: params.store, job, repoRoot: params.repoRoot, workDir: params.workDir, timeoutMs, execute, prepare, signal: params.signal });
    } catch (error) {
      outcome = { kind: "retry", error: error instanceof Error ? error.message : String(error) };
    }
    if (halted()) {
      // Shutdown overtook the job: the consumer released (or will release) its claim; the store may be closed.
      (params.log ?? ((message: string) => console.error(message)))(`[steering-explain] job ${job.id} ended after shutdown (${outcome.kind}); nothing written`);
      break;
    }
    if (outcome.kind === "published") {
      const published = outcome;
      const finished = finishSteeringExplainJob(params.store, job.id, {
        compilerDelta: published.delta,
        owner,
        probe: (existing) => publishedProbe(job, existing, published),
      });
      if (!finished) summary.lost += 1;
      else if (typeof published.delta.unavailable === "string") summary.unavailable += 1;
      else summary.done += 1;
    } else if (outcome.kind === "fail") {
      if (failSteeringExplainJob(params.store, job.id, { error: outcome.error, owner })) summary.failed += 1;
      else summary.lost += 1;
    } else {
      const status = retrySteeringExplainJob(params.store, job.id, { error: outcome.error, maxAttempts, owner });
      if (status === "failed") summary.failed += 1;
      else if (status === "queued") summary.retried += 1;
      else summary.lost += 1;
    }
    params.onSettled?.(job);
  }
  return summary;
}

/** `ORCH_STEERING_EXPLAIN_CONCURRENCY`: explain jobs the run loop runs at once (default 2; 0 disables). */
export const STEERING_EXPLAIN_CONCURRENCY_ENV = "ORCH_STEERING_EXPLAIN_CONCURRENCY";
const STEERING_EXPLAIN_DEFAULT_CONCURRENCY = 2;
const STEERING_EXPLAIN_DEFAULT_INTERVAL_MS = 30_000;

export function steeringExplainConcurrency(env: Record<string, string | undefined> = process.env): number {
  const raw = env[STEERING_EXPLAIN_CONCURRENCY_ENV]?.trim();
  if (!raw) return STEERING_EXPLAIN_DEFAULT_CONCURRENCY;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 0) throw new Error(`${STEERING_EXPLAIN_CONCURRENCY_ENV} must be a non-negative integer, got ${raw}`);
  return parsed;
}

export interface SteeringExplainConsumerHandle {
  /** Claims for free slots now (the timer does this every interval). */
  tick(): void;
  /** No new claims; in-flight jobs keep running. */
  stop(): void;
  /**
   * Waits for in-flight jobs. When `timeoutMs` runs out first it aborts them (their build tasks stop
   * waiting and delete their sandboxes) and, before resolving false, releases every claim still held
   * (`releaseSteeringExplainJob`: queued again, or failed at its last attempt).
   */
  drain(timeoutMs?: number): Promise<boolean>;
  /** Final: no store access from here on; a completion arriving later is dropped (logged once). */
  close(): void;
  /** Jobs running now. */
  inFlight(): number;
  /** False when the consumer never ran (gate off, dry run, concurrency 0). */
  readonly enabled: boolean;
}

/** What one consumer slot's run gets: the consumer's abort signal and closed flag, and its claim tracking. */
export interface SteeringExplainRunContext {
  signal: AbortSignal;
  closed: () => boolean;
  onClaimed: (job: SteeringExplainJob, owner: string) => void;
  onSettled: (job: SteeringExplainJob) => void;
  log: (message: string) => void;
}

export interface SteeringExplainConsumerParams {
  store: StateStore;
  gameId: string | null | undefined;
  /** The game's `matching.steeringGate`: only an active gate runs explain jobs. */
  steeringGate: string | null | undefined;
  repoRoot: string;
  workDir: string;
  /** Dry runs never start build sandboxes. */
  dryRun?: boolean;
  /** Default `steeringExplainConcurrency()`. */
  concurrency?: number;
  intervalMs?: number;
  timeoutMs?: number;
  maxAttempts?: number;
  execute?: SteeringBuildTaskExecutor;
  prepare?: SteeringExplainPrepare;
  /** One job (`runSteeringExplainJobs` with limit 1); tests inject a fake. */
  runOnce?: (context: SteeringExplainRunContext) => Promise<SteeringExplainSummary>;
  log?: (message: string) => void;
}

/** The error a claim released at shutdown keeps. */
export const STEERING_EXPLAIN_CANCELLED = "cancelled at shutdown";

const DISABLED_CONSUMER: SteeringExplainConsumerHandle = {
  tick() {}, stop() {}, drain: async () => true, close() {}, inFlight: () => 0, enabled: false,
};

/**
 * The run loop's background drain of explain jobs (plan 3.4.1): every
 * interval it starts one `runSteeringExplainJobs` (limit 1) per free slot,
 * never more than `concurrency` at once. Each job runs as a `steering` build
 * task in a build sandbox, under a lease. Shutdown is `stop`, `drain`, then
 * `close`: a drain that runs out of time aborts the jobs and releases their
 * claims while the store is still open, and after `close` nothing touches
 * the store. Off for games without an active steering gate, dry runs and
 * concurrency 0. It is not worker work: the loop's boundaries and iteration
 * counts never wait on it.
 */
export function startSteeringExplainConsumer(params: SteeringExplainConsumerParams): SteeringExplainConsumerHandle {
  const concurrency = params.concurrency ?? steeringExplainConcurrency();
  if (!params.gameId || !steeringGateActive(params.steeringGate) || params.dryRun || concurrency <= 0) return DISABLED_CONSUMER;
  const gameId = params.gameId;
  const maxAttempts = params.maxAttempts ?? STEERING_EXPLAIN_MAX_ATTEMPTS;
  const baseLog = params.log ?? ((message: string) => console.error(message));
  const logged = new Set<string>();
  /** Each kind of message once: shutdown paths can repeat per job. */
  const logOnce = (kind: string, message: string) => {
    if (logged.has(kind)) return;
    logged.add(kind);
    baseLog(message);
  };
  const controller = new AbortController();
  let stopped = false;
  let closed = false;
  /** Claims held by this consumer's runs: job id -> (job, owner). */
  const claims = new Map<number, { job: SteeringExplainJob; owner: string }>();
  const context: SteeringExplainRunContext = {
    signal: controller.signal,
    closed: () => closed,
    onClaimed: (job, owner) => { claims.set(job.id, { job, owner }); },
    onSettled: (job) => { claims.delete(job.id); },
    log: (message) => logOnce("late", message),
  };
  const runOnce = params.runOnce ?? ((ctx: SteeringExplainRunContext) => runSteeringExplainJobs({
    store: params.store, gameId, repoRoot: params.repoRoot, workDir: params.workDir, limit: 1, maxAttempts,
    ...(params.execute ? { execute: params.execute } : {}),
    ...(params.prepare ? { prepare: params.prepare } : {}),
    ...(params.timeoutMs ? { timeoutMs: params.timeoutMs } : {}),
    signal: ctx.signal, closed: ctx.closed, onClaimed: ctx.onClaimed, onSettled: ctx.onSettled, log: ctx.log,
  }));
  const running = new Set<Promise<void>>();
  const tick = () => {
    while (!stopped && !closed && running.size < concurrency) {
      // A slot whose run finds the queue empty frees itself at once.
      const task: Promise<void> = runOnce(context)
        .then(() => undefined)
        .catch((error) => {
          if (controller.signal.aborted || closed) return;
          logOnce("error", `[steering-explain] background job failed: ${error instanceof Error ? error.message : String(error)}`);
        })
        .finally(() => running.delete(task));
      running.add(task);
    }
  };
  const stop = () => {
    stopped = true;
    clearInterval(timer);
  };
  /** Aborts every run and hands each still-held claim back, synchronously (the store is still open). */
  const cancel = () => {
    controller.abort();
    if (closed) return;
    for (const { job, owner } of claims.values()) {
      try {
        releaseSteeringExplainJob(params.store, job.id, { owner, error: STEERING_EXPLAIN_CANCELLED, maxAttempts });
      } catch (error) {
        logOnce("release", `[steering-explain] releasing job ${job.id} at shutdown failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    claims.clear();
  };
  const timer = setInterval(tick, params.intervalMs ?? STEERING_EXPLAIN_DEFAULT_INTERVAL_MS);
  (timer as { unref?: () => void }).unref?.();
  return {
    tick,
    stop,
    async drain(timeoutMs = 30_000) {
      stop();
      if (running.size > 0) {
        let timedOut = false;
        let clear: ReturnType<typeof setTimeout> | undefined;
        const deadline = new Promise<void>((resolveDeadline) => { clear = setTimeout(() => { timedOut = true; resolveDeadline(); }, timeoutMs); });
        await Promise.race([Promise.allSettled([...running]), deadline]);
        if (clear) clearTimeout(clear);
        if (timedOut) {
          cancel();
          return false;
        }
      }
      // Every run ended; a claim its run never settled (it threw) is handed back too.
      if (claims.size > 0) cancel();
      return true;
    },
    close() {
      stop();
      if (claims.size > 0) cancel();
      controller.abort();
      closed = true;
    },
    inFlight: () => running.size,
    enabled: true,
  };
}

function positiveInteger(value: string, flag: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`steering-explain ${flag} needs a positive integer, got ${value}`);
  return parsed;
}

/** CLI: `steering-explain [--limit N] [--observation ID] [--max-attempts N] [--timeout-ms MS] [--repo DIR] [--script PATH] [--force]`. */
export async function steeringExplainJob(globals: GlobalArgs, args: Map<string, string | true>): Promise<void> {
  const game = globals.game;
  const gameId = game?.gameId ?? globals.gameId ?? "";
  if (!gameId) throw new Error("steering-explain needs a game (--game)");
  const mode = game?.matching?.steeringGate ?? "off";
  if (!steeringGateActive(mode) && !booleanArg(args, "--force")) {
    throw new Error(`steering-explain only applies to games with matching.steeringGate shadow or enforce; ${gameId} is ${mode} (pass --force to run anyway)`);
  }
  const flag = (name: string) => stringArg(args, name, "").trim();
  const script = resolve(stringArg(args, "--script", resolve(packageRoot(), "toolpacks/gamecube-decomp", STEERING_EXPLAIN_TOOLPACK_PATH)));
  if (!existsSync(script)) throw new Error(`steering_explain.py not found at ${script}`);
  const store = openState(globals.stateDir);
  try {
    const summary = await runSteeringExplainJobs({
      store,
      gameId,
      repoRoot: resolve(stringArg(args, "--repo", globals.repoRoot)),
      script,
      workDir: resolve(globals.stateDir, "steering-explain", "work"),
      ...(flag("--limit") ? { limit: positiveInteger(flag("--limit"), "--limit") } : {}),
      ...(flag("--observation") ? { observationId: positiveInteger(flag("--observation"), "--observation") } : {}),
      ...(flag("--max-attempts") ? { maxAttempts: positiveInteger(flag("--max-attempts"), "--max-attempts") } : {}),
      ...(flag("--timeout-ms") ? { timeoutMs: positiveInteger(flag("--timeout-ms"), "--timeout-ms") } : {}),
    });
    console.log(JSON.stringify({ game_id: gameId, ...summary }, null, 2));
  } finally {
    store.db.close();
  }
}
