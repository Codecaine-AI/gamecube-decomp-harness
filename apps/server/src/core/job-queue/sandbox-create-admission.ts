/**
 * Worker-sandbox create admission (scale fix S11). Daytona answers a create
 * beyond the account's concurrency quota or request rate with a refusal
 * (HTTP 429, or a "quota exceeded" error); before this module that refusal
 * failed the worker job permanently. Now creates queue instead:
 *
 * - at most `maxConcurrentCreates` create calls are in flight, spaced by
 *   `minIntervalMs`, and (optionally) at most `maxAlive` sandboxes this
 *   process created are alive at once;
 * - a quota refusal teaches a cap (the sandboxes this process holds when it
 *   was refused): later creates wait until one of ours is deleted, or until
 *   `quotaProbeMs` passes and a create may probe the quota again;
 * - a refused create retries with jittered exponential backoff (a server
 *   `retry-after` wins), bounded by `maxWaitMs` overall and, for plain rate
 *   limits, by `maxRateRetries`.
 *
 * A refusal means nothing was created, so retrying it never leaves a
 * duplicate sandbox behind (unlike a lost 5xx response, which is not retried
 * for worker sandboxes). One admission is shared process-wide: every
 * `DaytonaSandboxProvider` instance in the orchestrator creates and deletes
 * worker sandboxes against the same quota.
 */

/** In-flight worker-sandbox create calls (default 16). */
export const SANDBOX_CREATE_CONCURRENCY_ENV = "ORCH_SANDBOX_CREATE_CONCURRENCY";
/** Minimum spacing between create starts, ms (default 0). */
export const SANDBOX_CREATE_MIN_INTERVAL_ENV = "ORCH_SANDBOX_CREATE_MIN_INTERVAL_MS";
/** Cap on alive worker sandboxes this process created (default 0: no cap; Daytona's quota still teaches one). */
export const SANDBOX_MAX_ALIVE_ENV = "ORCH_SANDBOX_MAX_ALIVE";
/** How long one create may queue and retry in total before it fails, ms (default 30 min). */
export const SANDBOX_CREATE_MAX_WAIT_ENV = "ORCH_SANDBOX_CREATE_MAX_WAIT_MS";
/** First backoff after a refusal, ms (default 1000); doubles per retry. */
export const SANDBOX_CREATE_RETRY_BASE_ENV = "ORCH_SANDBOX_CREATE_RETRY_BASE_MS";
/** Backoff ceiling, ms (default 30000). */
export const SANDBOX_CREATE_RETRY_MAX_ENV = "ORCH_SANDBOX_CREATE_RETRY_MAX_MS";
/** Rate-limit (non-quota) refusals retried per create (default 8). */
export const SANDBOX_CREATE_RATE_RETRIES_ENV = "ORCH_SANDBOX_CREATE_RATE_RETRIES";
/** How long a learned quota cap holds before a create may probe again, ms (default 30000). */
export const SANDBOX_QUOTA_PROBE_ENV = "ORCH_SANDBOX_QUOTA_PROBE_MS";
/** How often a create blocked behind held allocations asks the hold reconciler to confirm them gone, ms (default 5000). */
export const SANDBOX_HOLD_PROBE_ENV = "ORCH_SANDBOX_ALLOCATION_HOLD_PROBE_MS";
/** Age after which an unconfirmed allocation hold is released and reported as an error, ms (default 30 min). */
export const SANDBOX_HOLD_MAX_AGE_ENV = "ORCH_SANDBOX_ALLOCATION_HOLD_MAX_AGE_MS";

export interface SandboxCreateAdmissionOptions {
  maxConcurrentCreates: number;
  minIntervalMs: number;
  maxAlive: number;
  maxWaitMs: number;
  retryBaseMs: number;
  retryMaxMs: number;
  maxRateRetries: number;
  quotaProbeMs: number;
  holdProbeMs: number;
  holdMaxAgeMs: number;
}

function envNumber(env: Record<string, string | undefined>, name: string, fallback: number, min: number): number {
  const raw = env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const value = Number(raw);
  return Number.isFinite(value) && value >= min ? Math.floor(value) : fallback;
}

export function sandboxCreateAdmissionOptionsFromEnv(env: Record<string, string | undefined> = process.env): SandboxCreateAdmissionOptions {
  return {
    maxConcurrentCreates: envNumber(env, SANDBOX_CREATE_CONCURRENCY_ENV, 16, 1),
    minIntervalMs: envNumber(env, SANDBOX_CREATE_MIN_INTERVAL_ENV, 0, 0),
    maxAlive: envNumber(env, SANDBOX_MAX_ALIVE_ENV, 0, 0),
    maxWaitMs: envNumber(env, SANDBOX_CREATE_MAX_WAIT_ENV, 30 * 60_000, 0),
    retryBaseMs: envNumber(env, SANDBOX_CREATE_RETRY_BASE_ENV, 1_000, 0),
    retryMaxMs: envNumber(env, SANDBOX_CREATE_RETRY_MAX_ENV, 30_000, 0),
    maxRateRetries: envNumber(env, SANDBOX_CREATE_RATE_RETRIES_ENV, 8, 0),
    quotaProbeMs: envNumber(env, SANDBOX_QUOTA_PROBE_ENV, 30_000, 0),
    holdProbeMs: envNumber(env, SANDBOX_HOLD_PROBE_ENV, 5_000, 1),
    holdMaxAgeMs: envNumber(env, SANDBOX_HOLD_MAX_AGE_ENV, 30 * 60_000, 1),
  };
}

export type CreateRefusal = { kind: "quota" | "rate"; retryAfterMs: number | null };

function errorField(error: unknown, key: string): unknown {
  return error && typeof error === "object" ? (error as Record<string, unknown>)[key] : undefined;
}

function retryAfterMs(error: unknown): number | null {
  const headers = errorField(error, "headers") ?? (errorField(errorField(error, "response"), "headers"));
  let raw: unknown;
  if (headers && typeof headers === "object") {
    const record = headers as Record<string, unknown> & { get?: (name: string) => unknown };
    raw = typeof record.get === "function" ? record.get("retry-after") : record["retry-after"] ?? record["Retry-After"];
  }
  if (raw === undefined || raw === null || raw === "") return null;
  const seconds = Number(raw);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const at = Date.parse(String(raw));
  return Number.isFinite(at) ? Math.max(0, at - Date.now()) : null;
}

/**
 * A create the provider refused before creating anything: HTTP 429, the SDK's
 * rate-limit error, or a quota message (Daytona reports an exhausted CPU or
 * sandbox quota with "quota exceeded", not always as a 429). Null otherwise.
 */
export function classifyCreateRefusal(error: unknown): CreateRefusal | null {
  const message = error instanceof Error ? error.message : String(error);
  const status = errorField(error, "statusCode") ?? errorField(error, "status") ?? errorField(errorField(error, "response"), "status");
  const name = errorField(error, "name");
  const quota = /quota (?:exceeded|exhausted|limit)|exceed(?:s|ed)? (?:the |your )?(?:\w+ )?quota/i.test(message);
  const rate = status === 429 || name === "DaytonaRateLimitError" || /\b429\b|too many requests|rate limit/i.test(message);
  if (!quota && !rate) return null;
  return { kind: quota ? "quota" : "rate", retryAfterMs: retryAfterMs(error) };
}

export class SandboxCreateTimeoutError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "SandboxCreateTimeoutError";
  }
}

export interface SandboxCreateAdmissionDeps {
  now?: () => number;
  random?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export class SandboxCreateAdmission {
  private creating = 0;
  private readonly alive = new Set<string>();
  private learnedCap: { cap: number; until: number } | null = null;
  private lastStartAt = Number.NEGATIVE_INFINITY;
  private waiters: Array<() => void> = [];
  private readonly now: () => number;
  private readonly random: () => number;
  private readonly sleep: (ms: number) => Promise<void>;
  /** Counters for operators and the load-test report. */
  readonly stats = { admitted: 0, queued: 0, quotaRefusals: 0, rateRefusals: 0, timeouts: 0, maxQueued: 0, holds: 0, holdsReleased: 0, holdsExpired: 0 };
  private queued = 0;
  /** Unconfirmed allocations of failed create attempts, by attempt label value: when each was held. */
  private readonly holds = new Map<string, number>();
  private holdReconciler: (() => Promise<unknown>) | null = null;
  private lastHoldProbe = Number.NEGATIVE_INFINITY;

  constructor(private readonly optionsSource: () => SandboxCreateAdmissionOptions, deps: SandboxCreateAdmissionDeps = {}) {
    this.now = deps.now ?? Date.now;
    this.random = deps.random ?? Math.random;
    this.sleep = deps.sleep ?? defaultSleep;
  }

  private options(): SandboxCreateAdmissionOptions {
    return this.optionsSource();
  }

  snapshot(): { creating: number; alive: number; queued: number; learnedCap: number | null; heldAllocations: number } {
    const cap = this.activeCap();
    return { creating: this.creating, alive: this.alive.size, queued: this.queued, learnedCap: cap, heldAllocations: this.holds.size };
  }

  private activeCap(): number | null {
    if (!this.learnedCap) return null;
    if (this.now() >= this.learnedCap.until) {
      this.learnedCap = null;
      return null;
    }
    return this.learnedCap.cap;
  }

  /** Ms until a create may start, 0 when it may start now, Infinity when only a delete can free a slot. */
  private waitMs(): number {
    const options = this.options();
    if (this.creating >= options.maxConcurrentCreates) return Number.POSITIVE_INFINITY;
    const held = this.alive.size + this.creating;
    if (options.maxAlive > 0 && held >= options.maxAlive) return Number.POSITIVE_INFINITY;
    const cap = this.activeCap();
    if (cap !== null && held >= cap) return Math.max(1, this.learnedCap!.until - this.now());
    const spacing = this.lastStartAt + options.minIntervalMs - this.now();
    return spacing > 0 ? spacing : 0;
  }

  private wake(): void {
    const waiters = this.waiters;
    this.waiters = [];
    for (const wake of waiters) wake();
  }

  /** Waits for a create slot; throws `SandboxCreateTimeoutError` past `deadline` (epoch ms). */
  async acquire(deadline: number): Promise<void> {
    let counted = false;
    try {
      while (true) {
        // Never accept a slot past the deadline, however free it is: a create that ran out its
        // wait (queueing, backoff, retry cleanup) must not allocate.
        if (this.now() > deadline) {
          this.stats.timeouts += 1;
          throw new SandboxCreateTimeoutError(`sandbox create admission timed out (${JSON.stringify(this.snapshot())})`);
        }
        const wait = this.waitMs();
        if (wait === 0) {
          this.creating += 1;
          this.lastStartAt = this.now();
          this.stats.admitted += 1;
          return;
        }
        const remaining = deadline - this.now();
        if (remaining <= 0) {
          this.stats.timeouts += 1;
          throw new SandboxCreateTimeoutError(`sandbox create admission timed out after queueing (${JSON.stringify(this.snapshot())})`);
        }
        if (!counted) {
          counted = true;
          this.queued += 1;
          this.stats.queued += 1;
          this.stats.maxQueued = Math.max(this.stats.maxQueued, this.queued);
        }
        // Blocked while failed creates' allocations hold slots: ask the reconciler to confirm them gone.
        if (this.holds.size > 0 && await this.probeHolds()) continue;
        let timer: ReturnType<typeof setTimeout> | undefined;
        await new Promise<void>((resolve) => {
          this.waiters.push(resolve);
          const holdWait = this.holds.size > 0 ? this.options().holdProbeMs : Number.POSITIVE_INFINITY;
          const ms = Math.min(remaining, holdWait, Number.isFinite(wait) ? wait : remaining);
          timer = setTimeout(resolve, ms);
          timer.unref?.();
        });
        if (timer) clearTimeout(timer);
      }
    } finally {
      if (counted) this.queued -= 1;
    }
  }

  /**
   * The admitted create succeeded. A tracked sandbox holds quota until
   * `deleted`; an untracked one (an ephemeral build sandbox that deletes
   * itself) only frees its create slot.
   */
  created(sandboxId: string, track = true): void {
    this.creating = Math.max(0, this.creating - 1);
    if (track) this.alive.add(sandboxId);
    this.wake();
  }

  /** The admitted create failed (refused or errored): its slot frees. */
  failed(refusal: CreateRefusal | null): void {
    this.creating = Math.max(0, this.creating - 1);
    if (refusal?.kind === "quota") {
      this.stats.quotaRefusals += 1;
      // What we held when refused is what the quota leaves us; others queue behind our deletes.
      this.learnedCap = { cap: this.alive.size + this.creating, until: this.now() + this.options().quotaProbeMs };
    } else if (refusal?.kind === "rate") {
      this.stats.rateRefusals += 1;
    }
    this.wake();
  }

  /**
   * A failed create may have allocated a sandbox (the SDK allocates before its
   * proxy lookup and start wait) that could not be confirmed deleted. It keeps
   * a quota slot, keyed by the failed attempt's `orch_create_attempt` label
   * value, until `releaseHold` confirms every allocation carrying that label gone (the
   * provider's create path and `reconcileHeldAllocations`), or until
   * `holdMaxAgeMs` passes, when it is released and reported as an error.
   */
  holdAllocation(requestId: string): void {
    if (this.holds.has(requestId)) return;
    this.holds.set(requestId, this.now());
    this.alive.add(heldSlot(requestId));
    this.stats.holds += 1;
  }

  isHeld(requestId: string): boolean {
    return this.holds.has(requestId);
  }

  /** Attempt ids whose allocations are held (oldest first). */
  heldRequestIds(): string[] {
    return [...this.holds.keys()];
  }

  /** Every allocation carrying this attempt's label is confirmed gone: its slot frees. */
  releaseHold(requestId: string): void {
    if (!this.holds.delete(requestId)) return;
    this.alive.delete(heldSlot(requestId));
    this.stats.holdsReleased += 1;
    this.wake();
  }

  /** Releases holds older than `holdMaxAgeMs`, each reported as an error; returns their request ids. */
  expireHolds(report: (message: string) => void = console.error): string[] {
    const maxAge = this.options().holdMaxAgeMs;
    const expired: string[] = [];
    for (const [requestId, heldAt] of this.holds) {
      if (this.now() - heldAt < maxAge) continue;
      expired.push(requestId);
      this.holds.delete(requestId);
      this.alive.delete(heldSlot(requestId));
      this.stats.holdsExpired += 1;
      report(`[sandbox] ALLOCATION HOLD EXPIRED: a failed create attempt (label orch_create_attempt=${requestId}) could not be confirmed deleted for ${Math.round((this.now() - heldAt) / 60_000)} min; its quota slot is released. List and delete sandboxes with that label by hand.`);
    }
    if (expired.length > 0) this.wake();
    return expired;
  }

  /** Who confirms held allocations gone while creates wait (the provider registers itself). */
  setHoldReconciler(reconciler: (() => Promise<unknown>) | null): void {
    this.holdReconciler = reconciler;
  }

  /** At most once per `holdProbeMs`: expire old holds, then run the reconciler. True when a hold was released. */
  private async probeHolds(): Promise<boolean> {
    if (this.now() - this.lastHoldProbe < this.options().holdProbeMs) return false;
    this.lastHoldProbe = this.now();
    const before = this.holds.size;
    this.expireHolds();
    if (this.holds.size > 0 && this.holdReconciler) {
      try {
        await this.holdReconciler();
      } catch (error) {
        console.warn(`[sandbox] held-allocation reconciliation failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    return this.holds.size < before;
  }

  /** A sandbox this process created was deleted (any reason): its quota slot frees. */
  deleted(sandboxId: string): void {
    if (this.alive.delete(sandboxId)) this.wake();
  }

  /** Jittered exponential backoff for the n-th (0-based) refusal; a server retry-after wins. */
  backoffMs(attempt: number, refusal: CreateRefusal): number {
    const options = this.options();
    if (refusal.retryAfterMs !== null) return refusal.retryAfterMs;
    const ceiling = Math.min(options.retryMaxMs, options.retryBaseMs * 2 ** Math.min(attempt, 20));
    return Math.round(ceiling / 2 + this.random() * (ceiling / 2));
  }

  /**
   * Runs `create` under admission: queue for a slot, create, and on a refusal
   * back off and queue again (quota refusals until `maxWaitMs`, rate limits
   * also at most `maxRateRetries` times). Any other error is rethrown as is.
   * `track: false` for sandboxes that delete themselves (not counted alive).
   */
  async run<T extends { sandboxId: string }>(
    create: () => Promise<T>,
    runOptions: {
      track?: boolean;
      /**
       * Runs after a refusal's backoff and before the next slot is requested,
       * outside a slot (e.g. confirming a held allocation gone, which may be
       * what frees the slot). A throw backs off again until the deadline.
       */
      beforeRetry?: () => Promise<void>;
    } = {},
  ): Promise<T> {
    const options = this.options();
    const started = this.now();
    const deadline = started + options.maxWaitMs;
    let refusals = 0;
    let rateRefusals = 0;
    while (true) {
      await this.acquire(deadline);
      let result: T;
      try {
        result = await create();
      } catch (error) {
        const refusal = classifyCreateRefusal(error);
        this.failed(refusal);
        if (!refusal) throw error;
        if (refusal.kind === "rate") rateRefusals += 1;
        if (refusal.kind === "rate" && rateRefusals > options.maxRateRetries) throw error;
        const delay = this.backoffMs(refusals, refusal);
        refusals += 1;
        if (this.now() + delay >= deadline) {
          this.stats.timeouts += 1;
          throw new SandboxCreateTimeoutError(
            `sandbox create still refused after ${refusals} attempt(s) over ${Math.round((this.now() - started) / 1000)}s: ${error instanceof Error ? error.message : String(error)}`,
            { cause: error },
          );
        }
        await this.sleep(delay);
        if (runOptions.beforeRetry) await this.untilDone(runOptions.beforeRetry, refusals, deadline, started);
        if (this.now() > deadline) {
          this.stats.timeouts += 1;
          throw new SandboxCreateTimeoutError(
            `sandbox create ran out its wait (${options.maxWaitMs} ms) during retry cleanup after ${refusals} refusal(s): ${error instanceof Error ? error.message : String(error)}`,
            { cause: error },
          );
        }
        continue;
      }
      this.created(result.sandboxId, runOptions.track ?? true);
      return result;
    }
  }

  /** Retries `work` with backoff until it succeeds; throws `SandboxCreateTimeoutError` past `deadline`. */
  private async untilDone(work: () => Promise<void>, refusals: number, deadline: number, started: number): Promise<void> {
    for (let attempt = refusals; ; attempt += 1) {
      try {
        await work();
        return;
      } catch (error) {
        const delay = this.backoffMs(attempt, classifyCreateRefusal(error) ?? { kind: "rate", retryAfterMs: null });
        if (this.now() + delay >= deadline) {
          this.stats.timeouts += 1;
          throw new SandboxCreateTimeoutError(
            `sandbox create could not confirm an earlier allocation deleted over ${Math.round((this.now() - started) / 1000)}s: ${error instanceof Error ? error.message : String(error)}`,
            { cause: error },
          );
        }
        await this.sleep(delay);
      }
    }
  }
}

const heldSlot = (requestId: string) => `allocation:${requestId}`;

let sharedAdmission: SandboxCreateAdmission | null = null;

/** The process-wide admission for worker-sandbox creates (options re-read from env on every use). */
export function sharedSandboxCreateAdmission(): SandboxCreateAdmission {
  sharedAdmission ??= new SandboxCreateAdmission(() => sandboxCreateAdmissionOptionsFromEnv());
  return sharedAdmission;
}
