import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { sharedSandboxCreateAdmission, type SandboxCreateAdmission } from "./sandbox-create-admission.js";

export interface SandboxExecResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export interface SandboxResourceClass {
  cpu: number;
  memoryGiB: number;
  diskGiB: number;
}

export interface SandboxCreateParams {
  snapshot: string;
  labels: Record<string, string>;
  resources: SandboxResourceClass;
  ttlMinutes: number;
  /** Build sandboxes expire on inactivity and delete upon stopping. */
  ephemeral?: boolean;
}

export interface SandboxHandle {
  readonly sandboxId: string;
  stop(): Promise<void>;
  start(): Promise<void>;
  exec(
    command: string[],
    opts: { cwd?: string; env?: Record<string, string>; timeoutMs: number },
  ): Promise<SandboxExecResult>;
  uploadFile(localPath: string, remotePath: string): Promise<void>;
  downloadFile(remotePath: string, localPath: string): Promise<void>;
  readFile(remotePath: string): Promise<string>;
  writeFile(remotePath: string, content: string): Promise<void>;
}

export type SandboxDeleteReason = "settlement" | "reap" | "reconciliation" | "provision_failure" | "retry_reprovision";

export interface SandboxProvider {
  create(params: SandboxCreateParams): Promise<SandboxHandle>;
  /** Confirms failed creates' held allocations gone (providers with create admission); never throws. */
  reconcileHeldAllocations?(): Promise<{ released: string[]; held: string[]; expired: string[] }>;
  get(sandboxId: string): Promise<SandboxHandle | null>;
  listByLabels(
    labels: Record<string, string>,
  ): Promise<Array<{ sandboxId: string; labels: Record<string, string> }>>;
  delete(sandboxId: string, reason: SandboxDeleteReason): Promise<void>;
}

interface DaytonaExecResponse {
  exitCode?: number;
  stdout?: string;
  stderr?: string;
}

interface DaytonaFileSystem {
  uploadFile(source: string | Buffer, remotePath: string): Promise<void>;
  downloadFile(remotePath: string): Promise<Buffer>;
  downloadFile(remotePath: string, localPath: string): Promise<void>;
}

interface DaytonaProcess {
  createSession(sessionId: string): Promise<void>;
  executeSessionCommand(
    sessionId: string,
    request: { command: string; runAsync: false; suppressInputEcho: true },
    timeoutSeconds: number,
  ): Promise<DaytonaExecResponse>;
  deleteSession(sessionId: string): Promise<void>;
}

interface DaytonaSandbox {
  id: string;
  labels?: Record<string, string>;
  process: DaytonaProcess;
  fs: DaytonaFileSystem;
  stop(timeoutSeconds?: number): Promise<void>;
  start(timeoutSeconds?: number): Promise<void>;
  delete?(timeoutSeconds?: number, wait?: boolean): Promise<void>;
}

interface DaytonaClient {
  create(params: {
    snapshot: string;
    labels: Record<string, string>;
    autoStopInterval: number;
    autoDeleteInterval?: number;
    ttlMinutes: number;
  }, options?: { timeout?: number }): Promise<DaytonaSandbox>;
  get(sandboxId: string): Promise<DaytonaSandbox>;
  list(query: { labels: Record<string, string> }): unknown;
  delete?(sandbox: DaytonaSandbox, timeoutSeconds?: number, wait?: boolean): Promise<void>;
}

export type DaytonaClientFactory = (
  config: { apiKey: string },
) => DaytonaClient | Promise<DaytonaClient>;

export interface DaytonaSandboxProviderOptions {
  clientFactory?: DaytonaClientFactory;
  readApiKey?: () => string | undefined;
  /** Waits between retries of idempotent sandbox calls after a transient gateway failure. */
  transientRetryDelaysMs?: readonly number[];
  /**
   * Queues creates beyond the provider's quota or rate limit and retries their
   * refusals (sandbox-create-admission.ts). Defaults to the process-wide
   * admission; null disables it (a refusal then fails the create).
   */
  createAdmission?: SandboxCreateAdmission | null;
}

const DEFAULT_TRANSIENT_RETRY_DELAYS_MS = [2_000, 5_000] as const;
// The SDK waits 60s for a new sandbox to start; under load Daytona regularly takes
// longer, and the timed-out sandbox is left behind to fail on its own.
const CREATE_START_TIMEOUT_SECONDS = 180;
// The gateway sometimes answers with its raw HTML error page instead of a JSON error.
// A create that outlives CREATE_START_TIMEOUT_SECONDS is a Daytona capacity stall; a fresh
// ephemeral create usually lands on a healthier runner.
const TRANSIENT_DAYTONA_FAILURE = /status code 50[234]\b|\b50[234] (?:Bad Gateway|Service Temporarily Unavailable|Service Unavailable|Gateway Time-out|Gateway Timeout)\b|socket hang up|ECONNRESET|ETIMEDOUT|EAI_AGAIN|fetch failed|Failed to create and start sandbox within \d+ seconds/i;

export function isTransientDaytonaFailure(error: unknown): boolean {
  return TRANSIENT_DAYTONA_FAILURE.test(error instanceof Error ? error.message : String(error));
}

/**
 * Retries an idempotent Daytona call through gateway blips (502/503/504,
 * dropped sockets). Command execution is not routed here: re-running a
 * command whose response was lost could apply it twice.
 */
async function retryTransient<T>(delaysMs: readonly number[], operation: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      const delayMs = delaysMs[attempt];
      if (delayMs === undefined || !isTransientDaytonaFailure(error)) throw error;
      await new Promise((resolveDelay) => setTimeout(resolveDelay, delayMs));
    }
  }
}

function shellQuote(value: string): string {
  if (value.includes("\0")) throw new Error("sandbox command arguments must not contain NUL bytes");
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

function shellCommand(
  command: string[],
  opts: { cwd?: string; env?: Record<string, string> },
): string {
  if (!command.length) throw new Error("sandbox exec requires a non-empty command");
  const env = Object.entries(opts.env ?? {}).map(([key, value]) => shellQuote(`${key}=${value}`));
  const invocation = [env.length ? "env" : "", ...env, ...command.map(shellQuote)].filter(Boolean).join(" ");
  return opts.cwd ? `cd ${shellQuote(opts.cwd)} && ${invocation}` : invocation;
}

/** Sandbox path a command claims (atomically, with `mkdir`) before it runs (see `isolatedShellCommand`). */
function execClaimPath(commandId: string): string {
  return `/tmp/orch-exec-${commandId}`;
}

/** Exit code and stderr marker of a command whose id another delivery already claimed: it did not run. */
const EXEC_CLAIM_LOST_EXIT = 75;
const execClaimLostMarker = (commandId: string) => `orch-exec-claimed ${commandId}`;

/**
 * `shellCommand` for a reused session: a subshell, so a `cd` never changes the
 * session's directory for the next command, and stdin from /dev/null, so a
 * command never reads the session's input stream. Its first act claims the
 * command id with `mkdir` (atomic: exactly one delivery of the same id can
 * create the directory); a delivery that loses the claim exits without
 * running. A replay reuses the id, so the original and its replay, in any
 * order or overlap, run the command at most once.
 */
function isolatedShellCommand(
  command: string[],
  opts: { cwd?: string; env?: Record<string, string> },
  commandId: string,
): string {
  const lost = `{ echo ${shellQuote(execClaimLostMarker(commandId))} >&2; exit ${EXEC_CLAIM_LOST_EXIT}; }`;
  return `(mkdir ${shellQuote(execClaimPath(commandId))} 2>/dev/null || ${lost}; ${shellCommand(command, opts)}) </dev/null`;
}

/** One reused Daytona session per sandbox handle (default on); "0" or "false" restores a session per command. */
export const DAYTONA_SESSION_REUSE_ENV = "ORCH_DAYTONA_SESSION_REUSE";
/** Idle sessions a handle keeps for reuse; concurrent commands beyond it get sessions deleted after use. */
const MAX_IDLE_SESSIONS = 4;
const SESSION_MISSING = /session\b[^\n]*\b(?:not found|does not exist|expired|ended|closed)|no such session/i;

function sessionReuseEnabled(): boolean {
  const value = process.env[DAYTONA_SESSION_REUSE_ENV]?.trim().toLowerCase();
  return value !== "0" && value !== "false" && value !== "off";
}

/** A reused session that is gone (sandbox restarted, session expired): the command never ran in it. */
function isSessionMissing(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return isNotFound(error) || SESSION_MISSING.test(message);
}

function timeoutSeconds(timeoutMs: number): number {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new Error("sandbox exec timeoutMs must be a positive finite number");
  }
  return Math.max(1, Math.ceil(timeoutMs / 1_000));
}

function isNotFound(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as {
    name?: unknown;
    status?: unknown;
    statusCode?: unknown;
    response?: { status?: unknown };
  };
  return candidate.name === "DaytonaNotFoundError"
    || candidate.status === 404
    || candidate.statusCode === 404
    || candidate.response?.status === 404;
}

async function defaultDaytonaClientFactory(config: { apiKey: string }): Promise<DaytonaClient> {
  const moduleName = "@daytonaio/sdk";
  const sdk = await import(moduleName) as { Daytona: new (value: { apiKey: string }) => DaytonaClient };
  return new sdk.Daytona(config);
}

class DaytonaSandboxHandle implements SandboxHandle {
  readonly sandboxId: string;
  /** Sessions free for the next command (reuse cuts a command from 3 API calls to 1). */
  private idleSessions: string[] = [];

  constructor(
    private readonly sandbox: DaytonaSandbox,
    private readonly retryDelaysMs: readonly number[] = DEFAULT_TRANSIENT_RETRY_DELAYS_MS,
  ) {
    this.sandboxId = sandbox.id;
  }

  private retry<T>(operation: () => Promise<T>): Promise<T> {
    return retryTransient(this.retryDelaysMs, operation);
  }

  async stop(): Promise<void> {
    // A stopped sandbox loses its sessions.
    this.idleSessions = [];
    await this.sandbox.stop(60);
  }

  async start(): Promise<void> {
    this.idleSessions = [];
    await this.sandbox.start(60);
  }

  private async takeSession(): Promise<{ id: string; reused: boolean }> {
    const idle = this.idleSessions.pop();
    if (idle) return { id: idle, reused: true };
    const id = `orch-exec-${randomUUID()}`;
    await this.retry(() => this.sandbox.process.createSession(id));
    return { id, reused: false };
  }

  private releaseSession(sessionId: string): void {
    if (this.idleSessions.length < MAX_IDLE_SESSIONS) this.idleSessions.push(sessionId);
    else this.discardSession(sessionId);
  }

  /** Best effort and not awaited: a session that failed or timed out may still be running its command. */
  private discardSession(sessionId: string): void {
    void this.retry(() => this.sandbox.process.deleteSession(sessionId)).catch(() => undefined);
  }

  async exec(
    command: string[],
    opts: { cwd?: string; env?: Record<string, string>; timeoutMs: number },
  ): Promise<SandboxExecResult> {
    if (!sessionReuseEnabled()) return this.execInFreshSession(command, opts);
    const commandId = randomUUID();
    const request = { command: isolatedShellCommand(command, opts, commandId), runAsync: false as const, suppressInputEcho: true as const };
    for (let attempt = 0; ; attempt += 1) {
      const session = await this.takeSession();
      let result: DaytonaExecResponse;
      try {
        result = await this.sandbox.process.executeSessionCommand(session.id, request, timeoutSeconds(opts.timeoutMs));
      } catch (error) {
        this.discardSession(session.id);
        // Only a reused session that vanished is retried (once, on a fresh session), with the
        // same command id: the id claim lets at most one delivery run, even if the original was
        // accepted and starts late. Any other failure may have run it, so it is not re-run.
        if (session.reused && attempt === 0 && isSessionMissing(error)) continue;
        if (attempt > 0) throw new Error(`Daytona sandbox ${this.sandboxId}: the command's session ended and its replay failed; it may have run once: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
        throw error;
      }
      if (attempt > 0 && result.exitCode === EXEC_CLAIM_LOST_EXIT && (result.stderr ?? "").includes(execClaimLostMarker(commandId))) {
        // The original delivery claimed the id: it ran (or is running) in the closed session, result unknown.
        this.releaseSession(session.id);
        throw new Error(`Daytona sandbox ${this.sandboxId}: the session ended after the command started; not re-run (it may have completed)`);
      }
      if (typeof result.exitCode !== "number") {
        this.discardSession(session.id);
        throw new Error(`Daytona sandbox ${this.sandboxId} returned no exit code`);
      }
      this.releaseSession(session.id);
      return {
        exitCode: result.exitCode,
        stdout: result.stdout ?? "",
        stderr: result.stderr ?? "",
      };
    }
  }

  /** One session per command (create, run, delete): `ORCH_DAYTONA_SESSION_REUSE=0`. */
  private async execInFreshSession(
    command: string[],
    opts: { cwd?: string; env?: Record<string, string>; timeoutMs: number },
  ): Promise<SandboxExecResult> {
    const sessionId = `orch-exec-${randomUUID()}`;
    await this.retry(() => this.sandbox.process.createSession(sessionId));
    let operationFailed = true;
    try {
      const result = await this.sandbox.process.executeSessionCommand(
        sessionId,
        {
          command: shellCommand(command, opts),
          runAsync: false,
          suppressInputEcho: true,
        },
        timeoutSeconds(opts.timeoutMs),
      );
      if (typeof result.exitCode !== "number") {
        throw new Error(`Daytona sandbox ${this.sandboxId} returned no exit code`);
      }
      operationFailed = false;
      return {
        exitCode: result.exitCode,
        stdout: result.stdout ?? "",
        stderr: result.stderr ?? "",
      };
    } finally {
      const cleanup = this.retry(() => this.sandbox.process.deleteSession(sessionId));
      if (operationFailed) await cleanup.catch(() => undefined);
      else await cleanup;
    }
  }

  async uploadFile(localPath: string, remotePath: string): Promise<void> {
    await this.retry(() => this.sandbox.fs.uploadFile(localPath, remotePath));
  }

  async downloadFile(remotePath: string, localPath: string): Promise<void> {
    await this.retry(() => this.sandbox.fs.downloadFile(remotePath, localPath));
  }

  async readFile(remotePath: string): Promise<string> {
    return (await this.retry(() => this.sandbox.fs.downloadFile(remotePath))).toString("utf8");
  }

  async writeFile(remotePath: string, content: string): Promise<void> {
    await this.retry(() => this.sandbox.fs.uploadFile(Buffer.from(content, "utf8"), remotePath));
  }
}

function handle(sandbox: DaytonaSandbox, retryDelaysMs?: readonly number[]): SandboxHandle {
  return new DaytonaSandboxHandle(sandbox, retryDelaysMs);
}

async function collectSandboxes(value: unknown): Promise<DaytonaSandbox[]> {
  const resolved = await value;
  if (resolved && typeof resolved === "object" && Symbol.asyncIterator in resolved) {
    const sandboxes: DaytonaSandbox[] = [];
    for await (const sandbox of resolved as AsyncIterable<DaytonaSandbox>) sandboxes.push(sandbox);
    return sandboxes;
  }
  if (Array.isArray(resolved)) return resolved as DaytonaSandbox[];
  if (resolved && typeof resolved === "object") {
    const record = resolved as { items?: unknown; sandboxes?: unknown };
    const items = record.items ?? record.sandboxes;
    if (Array.isArray(items)) return items as DaytonaSandbox[];
  }
  throw new Error("Daytona list returned an unsupported response");
}

/** Label carrying one logical create's id on every attempt (provenance; see `DaytonaSandboxProvider.create`). */
export const SANDBOX_CREATE_REQUEST_LABEL = "orch_create_request";
/** Label carrying one allocation attempt's own id: cleanup and quota holds are keyed by it alone. */
export const SANDBOX_CREATE_ATTEMPT_LABEL = "orch_create_attempt";

export class DaytonaSandboxProvider implements SandboxProvider {
  private readonly clientFactory: DaytonaClientFactory;
  private readonly readApiKey: () => string | undefined;
  private readonly retryDelaysMs: readonly number[];
  private readonly createAdmission: SandboxCreateAdmission | null;
  private clientPromise?: Promise<DaytonaClient>;

  constructor(options: DaytonaSandboxProviderOptions = {}) {
    this.clientFactory = options.clientFactory ?? defaultDaytonaClientFactory;
    this.readApiKey = options.readApiKey ?? (() => process.env.DAYTONA_API_KEY);
    this.retryDelaysMs = options.transientRetryDelaysMs ?? DEFAULT_TRANSIENT_RETRY_DELAYS_MS;
    this.createAdmission = options.createAdmission === undefined ? sharedSandboxCreateAdmission() : options.createAdmission;
    // Creates blocked behind held allocations ask the most recent provider to confirm them gone.
    this.createAdmission?.setHoldReconciler(() => this.reconcileHeldAllocations());
  }

  private client(): Promise<DaytonaClient> {
    if (this.clientPromise) return this.clientPromise;
    const apiKey = this.readApiKey()?.trim();
    if (!apiKey) {
      throw new Error("DAYTONA_API_KEY is required to use DaytonaSandboxProvider");
    }
    this.clientPromise = Promise.resolve(this.clientFactory({ apiKey }));
    return this.clientPromise;
  }

  async create(params: SandboxCreateParams): Promise<SandboxHandle> {
    const client = await this.client();
    // The SDK allocates the sandbox before its proxy lookup and start wait, so
    // a refusal (429) or startup failure can arrive after an allocation. Every
    // allocation attempt carries its own immutable `orch_create_attempt` label
    // (beside the create's `orch_create_request`), and a failed attempt's
    // cleanup and quota hold are keyed by that attempt label alone: whoever
    // cleans up late (a stalled reconciler) can only ever delete that failed
    // attempt's sandbox, never a later attempt that succeeded.
    const requestId = randomUUID();
    /** Failed attempts whose allocations are not yet confirmed deleted. */
    const failedAttempts = new Set<string>();
    // Only ephemeral (build) sandboxes retry creation on a transient error: a duplicate left by a
    // lost response stops on inactivity and deletes itself. Worker sandboxes have their own
    // reprovision and reconciliation path.
    const createOnce = async () => {
      const attemptId = randomUUID();
      try {
        return await client.create({
          snapshot: params.snapshot,
          labels: { ...params.labels, [SANDBOX_CREATE_REQUEST_LABEL]: requestId, [SANDBOX_CREATE_ATTEMPT_LABEL]: attemptId },
          // Daytona API: "Cannot specify Sandbox resources when using a snapshot".
          autoStopInterval: params.ephemeral ? params.ttlMinutes : 0,
          ...(params.ephemeral ? { autoDeleteInterval: 0 } : {}),
          ttlMinutes: params.ttlMinutes,
        }, { timeout: CREATE_START_TIMEOUT_SECONDS });
      } catch (error) {
        failedAttempts.add(attemptId);
        throw error;
      }
    };
    const createChecked = () => params.ephemeral ? retryTransient(this.retryDelaysMs, createOnce) : createOnce();
    const admission = this.createAdmission;
    // A failed attempt's allocation is deleted while the attempt still holds its admission slot.
    // If that cleanup fails, the allocation keeps a quota slot in the shared admission (keyed by
    // its attempt label) until a later cleanup, this create's retry or `reconcileHeldAllocations`,
    // confirms it gone; a concurrent create never doubles up on it.
    const confirmFailedAttemptsGone = async () => {
      for (const attemptId of [...failedAttempts]) {
        await this.deleteAllocations(client, { [SANDBOX_CREATE_ATTEMPT_LABEL]: attemptId });
        failedAttempts.delete(attemptId);
        admission?.releaseHold(attemptId);
      }
    };
    const holdUnconfirmed = (cleanup: unknown, when: string) => {
      for (const attemptId of failedAttempts) {
        if (admission && !params.ephemeral) admission.holdAllocation(attemptId);
        console.warn(`[sandbox] ${when}: could not confirm its allocation deleted; it keeps a quota slot until reconciliation confirms it (label ${SANDBOX_CREATE_ATTEMPT_LABEL}=${attemptId}): ${cleanup instanceof Error ? cleanup.message : String(cleanup)}`);
      }
    };
    // Earlier failed creates' holds are confirmed gone (or expired) before this one queues.
    if (admission?.heldRequestIds().length) await this.reconcileHeldAllocations().catch(() => undefined);
    try {
      // Refusals (quota, rate limit) are queued and retried; ephemeral build
      // sandboxes delete themselves and are not counted against the alive cap.
      const sandbox = admission
        ? (await admission.run(async () => {
            try {
              const created = await createChecked();
              return { sandboxId: created.id, created };
            } catch (error) {
              await confirmFailedAttemptsGone().catch((cleanup: unknown) => holdUnconfirmed(cleanup, "a refused create"));
              throw error;
            }
          }, {
            track: !params.ephemeral,
            beforeRetry: async () => { if ([...failedAttempts].some((attemptId) => admission.isHeld(attemptId))) await confirmFailedAttemptsGone(); },
          })).created
        : await createChecked();
      // Transiently failed attempts an ephemeral create retried past: best effort, by their own labels.
      if (failedAttempts.size > 0) void confirmFailedAttemptsGone().catch(() => undefined);
      return handle(sandbox, this.retryDelaysMs);
    } catch (error) {
      // Nothing is returned, so nothing this request allocated may stay alive.
      await confirmFailedAttemptsGone().catch((cleanup: unknown) => holdUnconfirmed(cleanup, "a failed create"));
      throw error;
    }
  }

  /**
   * Confirms the held allocations of failed creates gone: per held attempt
   * label, list, delete what is listed, and release the hold once nothing is
   * left. An attempt label names exactly one failed allocation attempt, so a
   * stalled run of this can never delete a later attempt that succeeded. Holds past their max age are released and reported. The run
   * loop's sandbox reconciliation and every create call this; it never throws.
   */
  async reconcileHeldAllocations(): Promise<{ released: string[]; held: string[]; expired: string[] }> {
    const admission = this.createAdmission;
    const out = { released: [] as string[], held: [] as string[], expired: [] as string[] };
    if (!admission) return out;
    let client: DaytonaClient | null = null;
    try {
      client = await this.client();
    } catch {}
    for (const attemptId of admission.heldRequestIds()) {
      try {
        if (!client) throw new Error("no Daytona client");
        await this.deleteAllocations(client, { [SANDBOX_CREATE_ATTEMPT_LABEL]: attemptId });
        admission.releaseHold(attemptId);
        out.released.push(attemptId);
      } catch (error) {
        out.held.push(attemptId);
        console.warn(`[sandbox] held allocation ${SANDBOX_CREATE_ATTEMPT_LABEL}=${attemptId} still unconfirmed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    out.expired = admission.expireHolds();
    out.held = out.held.filter((attemptId) => !out.expired.includes(attemptId));
    return out;
  }

  /** Deletes every sandbox carrying `attemptLabels` (the allocation of one failed attempt). */
  private async deleteAllocations(client: DaytonaClient, attemptLabels: Record<string, string>): Promise<void> {
    const allocated = await collectSandboxes(client.list({ labels: { ...attemptLabels } }));
    for (const sandbox of allocated) {
      console.warn(`[sandbox] deleting ${sandbox.id}: allocated by a create that was refused or failed after allocation`);
      if (sandbox.delete) await sandbox.delete(60, true);
      else if (client.delete) await client.delete(sandbox, 60, true);
      else throw new Error("Daytona SDK does not expose sandbox deletion");
    }
  }

  async get(sandboxId: string): Promise<SandboxHandle | null> {
    try {
      const client = await this.client();
      return handle(await retryTransient(this.retryDelaysMs, () => client.get(sandboxId)), this.retryDelaysMs);
    } catch (error) {
      if (isNotFound(error)) return null;
      throw error;
    }
  }

  async listByLabels(
    labels: Record<string, string>,
  ): Promise<Array<{ sandboxId: string; labels: Record<string, string> }>> {
    const sandboxes = await collectSandboxes((await this.client()).list({ labels: { ...labels } }));
    return sandboxes.map((sandbox) => ({
      sandboxId: sandbox.id,
      labels: { ...(sandbox.labels ?? {}) },
    }));
  }

  async delete(sandboxId: string, _reason: SandboxDeleteReason): Promise<void> {
    let sandbox: DaytonaSandbox;
    try {
      sandbox = await (await this.client()).get(sandboxId);
    } catch (error) {
      if (isNotFound(error)) {
        this.createAdmission?.deleted(sandboxId);
        return;
      }
      throw error;
    }
    if (sandbox.delete) await sandbox.delete(60, true);
    else {
      const client = await this.client();
      if (!client.delete) throw new Error("Daytona SDK does not expose sandbox deletion");
      await client.delete(sandbox, 60, true);
    }
    this.createAdmission?.deleted(sandboxId);
  }
}

export interface FakeSandboxExecCall {
  sandboxId: string;
  command: string[];
  opts: { cwd?: string; env?: Record<string, string>; timeoutMs: number };
}

export interface FakeSandboxRecord {
  sandboxId: string;
  labels: Record<string, string>;
  params: SandboxCreateParams;
}

export type FakeSandboxRuntimeState = "started" | "stopped";

export type FakeSandboxOperation =
  | "stop"
  | "start"
  | "exec"
  | "uploadFile"
  | "downloadFile"
  | "readFile"
  | "writeFile";

export interface FakeSandboxOperationCall {
  sandboxId: string;
  operation: FakeSandboxOperation;
}

export interface FakeSandboxDeletion extends FakeSandboxRecord {
  reason: SandboxDeleteReason;
}

type FakeExecScript =
  | SandboxExecResult
  | Error
  | ((call: FakeSandboxExecCall) => SandboxExecResult | Promise<SandboxExecResult>);

type FakeTransitionScript = Error | (() => void | Promise<void>);

interface FakeSandboxState extends FakeSandboxRecord {
  files: Map<string, Buffer>;
  deleted: boolean;
  state: FakeSandboxRuntimeState;
}

function cloneCreateParams(params: SandboxCreateParams): SandboxCreateParams {
  return {
    snapshot: params.snapshot,
    labels: { ...params.labels },
    resources: { ...params.resources },
    ttlMinutes: params.ttlMinutes,
  };
}

export class FakeSandboxProvider implements SandboxProvider {
  readonly createdSandboxes: FakeSandboxRecord[] = [];
  readonly deletedSandboxes: FakeSandboxDeletion[] = [];
  readonly execCalls: FakeSandboxExecCall[] = [];
  readonly uploadCalls: Array<{ sandboxId: string; localPath: string; remotePath: string }> = [];
  readonly downloadCalls: Array<{ sandboxId: string; remotePath: string; localPath: string }> = [];
  readonly stopCalls: Array<{ sandboxId: string }> = [];
  readonly startCalls: Array<{ sandboxId: string }> = [];
  readonly operationCalls: FakeSandboxOperationCall[] = [];
  private readonly sandboxes = new Map<string, FakeSandboxState>();
  private readonly execScripts: FakeExecScript[] = [];
  private readonly stopScripts: FakeTransitionScript[] = [];
  private readonly startScripts: FakeTransitionScript[] = [];
  private nextSandboxId = 1;

  scriptExec(...scripts: FakeExecScript[]): this {
    this.execScripts.push(...scripts);
    return this;
  }

  scriptStop(...scripts: FakeTransitionScript[]): this {
    this.stopScripts.push(...scripts);
    return this;
  }

  scriptStart(...scripts: FakeTransitionScript[]): this {
    this.startScripts.push(...scripts);
    return this;
  }

  sandboxState(sandboxId: string): FakeSandboxRuntimeState | null {
    const state = this.sandboxes.get(sandboxId);
    return state && !state.deleted ? state.state : null;
  }

  async create(params: SandboxCreateParams): Promise<SandboxHandle> {
    const sandboxId = `sandbox-${this.nextSandboxId++}`;
    const saved = cloneCreateParams(params);
    const state: FakeSandboxState = {
      sandboxId,
      labels: { ...saved.labels },
      params: saved,
      files: new Map(),
      deleted: false,
      state: "started",
    };
    this.sandboxes.set(sandboxId, state);
    this.createdSandboxes.push({ sandboxId, labels: { ...state.labels }, params: cloneCreateParams(saved) });
    return this.fakeHandle(state);
  }

  async get(sandboxId: string): Promise<SandboxHandle | null> {
    const state = this.sandboxes.get(sandboxId);
    return state && !state.deleted ? this.fakeHandle(state) : null;
  }

  async listByLabels(
    labels: Record<string, string>,
  ): Promise<Array<{ sandboxId: string; labels: Record<string, string> }>> {
    return [...this.sandboxes.values()]
      .filter((sandbox) => !sandbox.deleted)
      .filter((sandbox) => Object.entries(labels).every(([key, value]) => sandbox.labels[key] === value))
      .map((sandbox) => ({ sandboxId: sandbox.sandboxId, labels: { ...sandbox.labels } }));
  }

  async delete(sandboxId: string, reason: SandboxDeleteReason): Promise<void> {
    const state = this.sandboxes.get(sandboxId);
    if (!state || state.deleted) return;
    state.deleted = true;
    this.deletedSandboxes.push({
      sandboxId,
      labels: { ...state.labels },
      params: cloneCreateParams(state.params),
      reason,
    });
  }

  private assertLive(state: FakeSandboxState): void {
    if (state.deleted) throw new Error(`sandbox ${state.sandboxId} is deleted`);
  }

  private assertStarted(state: FakeSandboxState): void {
    this.assertLive(state);
    if (state.state === "stopped") {
      throw new Error(`sandbox ${state.sandboxId} is stopped`);
    }
  }

  private async runTransitionScript(script: FakeTransitionScript | undefined): Promise<void> {
    if (!script) return;
    if (script instanceof Error) throw script;
    await script();
  }

  private fakeHandle(state: FakeSandboxState): SandboxHandle {
    return {
      sandboxId: state.sandboxId,
      stop: async () => {
        this.assertLive(state);
        this.stopCalls.push({ sandboxId: state.sandboxId });
        this.operationCalls.push({ sandboxId: state.sandboxId, operation: "stop" });
        await this.runTransitionScript(this.stopScripts.shift());
        this.assertLive(state);
        state.state = "stopped";
      },
      start: async () => {
        this.assertLive(state);
        this.startCalls.push({ sandboxId: state.sandboxId });
        this.operationCalls.push({ sandboxId: state.sandboxId, operation: "start" });
        await this.runTransitionScript(this.startScripts.shift());
        this.assertLive(state);
        state.state = "started";
      },
      exec: async (command, opts) => {
        this.assertStarted(state);
        this.operationCalls.push({ sandboxId: state.sandboxId, operation: "exec" });
        const call: FakeSandboxExecCall = {
          sandboxId: state.sandboxId,
          command: [...command],
          opts: { ...opts, env: opts.env ? { ...opts.env } : undefined },
        };
        this.execCalls.push(call);
        const script = this.execScripts.shift() ?? { exitCode: 0, stdout: "", stderr: "" };
        if (script instanceof Error) throw script;
        const result = typeof script === "function" ? await script(call) : script;
        return { ...result };
      },
      uploadFile: async (localPath, remotePath) => {
        this.assertStarted(state);
        this.operationCalls.push({ sandboxId: state.sandboxId, operation: "uploadFile" });
        this.uploadCalls.push({ sandboxId: state.sandboxId, localPath, remotePath });
        state.files.set(remotePath, await readFile(localPath));
      },
      downloadFile: async (remotePath, localPath) => {
        this.assertStarted(state);
        this.operationCalls.push({ sandboxId: state.sandboxId, operation: "downloadFile" });
        this.downloadCalls.push({ sandboxId: state.sandboxId, remotePath, localPath });
        const content = state.files.get(remotePath);
        if (!content) throw new Error(`sandbox file not found: ${remotePath}`);
        await writeFile(localPath, content);
      },
      readFile: async (remotePath) => {
        this.assertStarted(state);
        this.operationCalls.push({ sandboxId: state.sandboxId, operation: "readFile" });
        const content = state.files.get(remotePath);
        if (!content) throw new Error(`sandbox file not found: ${remotePath}`);
        return content.toString("utf8");
      },
      writeFile: async (remotePath, content) => {
        this.assertStarted(state);
        this.operationCalls.push({ sandboxId: state.sandboxId, operation: "writeFile" });
        state.files.set(remotePath, Buffer.from(content, "utf8"));
      },
    };
  }
}
