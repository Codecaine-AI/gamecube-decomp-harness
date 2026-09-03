import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve, sep } from "node:path";
import { immediateTransaction, openState, type StateStore } from "@server/core/orchestrator-state";
import { getActiveCycle, getCycleByUuid } from "@server/core/cycle/store.js";
import {
  getHarnessState,
  initializeHarnessState,
  requestDispatch,
  requireLease,
  type Blocker,
} from "@server/core/harness-state";
import type { JsonValue } from "@server/core/harness-state/events.js";
import { getRun } from "@server/core/cycle-runtime/run-state";
import { runDispatchLeaseStaleness } from "@server/core/cycle-runtime/phases/running/run-control.js";
import { fetchUpstreamAndFindMergedPrs } from "@server/core/cycle-runtime/phases/preparing/subphases/git-intake.js";
import { prepareWorktreePaths } from "@server/core/cycle-runtime/phases/preparing/subphases/worktrees.js";
import { sourceDataRoot } from "@server/core/knowledge/paths.js";
import type { ResolvedGame } from "@server/core/game-registry";
import type { CliResult } from "@server/infrastructure/shell/ui-command-runner";
import { uiLog } from "@server/infrastructure/logging/ui-log";
import { activateAcquiredSync } from "./activation.js";
import { createSyncTraceEmitter, type SubmitSyncWorkflowEvent } from "./trace.js";
import { refreshDiscordMirror } from "./discord.js";
import { appendSyncDiscordEvent } from "./state.js";
import {
  cancelSync,
  getSyncBlockedOriginStatus,
  getNonTerminalSyncForGame,
  getSyncState,
  listSyncKnowledgeJobs,
  markSyncRecoveryRequired,
  publishSync,
  reconcileInterruptedSyncPublication,
  reconcileSync,
  recordSyncRequested,
  recoverConfirmedOrphanSyncIngest,
  recoverSync,
  resolveSyncConflict,
  refreshSyncUpstreamObservation,
  syncActionSpanId,
  validateSync,
  completeSyncKnowledgeIngest,
  continueSyncPublication,
  type SyncEngineContext,
  type SyncKnowledgeProcessors,
  type SyncStagingProgress,
  type SyncState,
  type SyncValidationResult,
} from "./index.js";

export type SyncActionId =
  | "sync.start"
  | "sync.resolve_conflict"
  | "sync.publish"
  | "sync.cancel"
  | "sync.recover";

export interface SyncActionProjection {
  action_id: SyncActionId;
  subject_kind: "sync";
  subject_id: string;
  enabled: boolean;
  blocked_by: Blocker[];
  expected_transition: string;
  confirmation_required: boolean;
}

export interface SyncRuntimeGameContext {
  graphDbPath: string;
  game: ResolvedGame | null;
  repoRoot: string;
  stateDir: string;
}

export interface SyncRuntimeDeps {
  kernelEnabled?: () => Promise<boolean>;
  hasActiveProcess?: (stateDir: string) => { active: boolean };
  now?: () => Date | number | string;
  packageRoot: string;
  resolveDashboardGame: (
    input: Record<string, unknown>,
    options: { useDefaultGame?: boolean },
  ) => SyncRuntimeGameContext;
  runCli: (command: string[], cwd?: string) => Promise<CliResult>;
  runGit: (
    repoRoot: string,
    args: string[],
    options?: { check?: boolean; failureHint?: string },
  ) => Promise<CliResult>;
  serverJobPath: string;
  stopManaged: (body: Record<string, unknown>) => Promise<Record<string, unknown>>;
  /**
   * Optional kernel workflow-trace writer. Absent in tests and CLI contexts,
   * where sync behaves exactly as it did before the trace existed.
   */
  submitWorkflowEvent?: SubmitSyncWorkflowEvent<SyncRuntimeGameContext>;
  /** Injectable backoff delay for retries; defaults to setTimeout. */
  sleep?: (ms: number) => Promise<void>;
  sourceRoot: (sourceId: string) => string;
  refreshDiscordMirror?: typeof refreshDiscordMirror;
  withOperation?: <T>(name: string, label: string, stepNames: string[], fn: () => Promise<T>) => Promise<T>;
  processors?: (input: {
    body: Record<string, unknown>;
    paths: SyncRuntimeGameContext;
    sync: SyncState;
  }) => SyncKnowledgeProcessors;
  validate?: (
    worktreePath: string,
    context: SyncEngineContext,
    staging: SyncStagingProgress,
  ) => Promise<SyncValidationResult>;
}

export interface SyncStartDecision {
  queued: boolean;
  run_stopping: boolean;
  lease_id: string | null;
  sync: SyncState;
}

export class SyncActionBlockedError extends Error {
  readonly action: SyncActionProjection;

  constructor(action: SyncActionProjection) {
    super(`${action.action_id} is blocked: ${action.blocked_by.map((blocker) => blocker.message).join("; ")}`);
    this.name = "SyncActionBlockedError";
    this.action = action;
  }
}

export class SyncWorkflowBlockedError extends Error {
  readonly sync: SyncState;

  constructor(sync: SyncState, cause: unknown) {
    super(
      `Sync ${sync.sync_id} stopped in ${sync.status}: ${cause instanceof Error ? cause.message : String(cause)}`,
      { cause },
    );
    this.name = "SyncWorkflowBlockedError";
    this.sync = sync;
  }
}

function text(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? [...new Set(value.map((item) => text(item)).filter(Boolean))]
    : [];
}

type DiscordPullState = Map<string, { lastMessageId: string | null; messagesWritten: number }>;

function readDiscordPullState(): DiscordPullState | null {
  try {
    const stateRoot = resolve(sourceDataRoot("discord_raw"), "state");
    const result: DiscordPullState = new Map();
    for (const name of readdirSync(stateRoot).filter((entry) => entry.endsWith(".json")).sort()) {
      const parsed = JSON.parse(readFileSync(resolve(stateRoot, name), "utf8")) as Record<string, unknown>;
      const messagesWritten = parsed.messages_written_last_pull;
      const lastMessageId = parsed.last_message_id;
      if (typeof messagesWritten !== "number" || !Number.isFinite(messagesWritten)) return null;
      if (lastMessageId !== null && typeof lastMessageId !== "string") return null;
      result.set(name, { lastMessageId, messagesWritten: Math.max(0, Math.floor(messagesWritten)) });
    }
    return result;
  } catch {
    return null;
  }
}

function discordMessagesPulled(before: DiscordPullState | null, after: DiscordPullState | null): number | null {
  if (!before || !after) return null;
  let total = 0;
  for (const [channel, current] of after) {
    if (before.get(channel)?.lastMessageId !== current.lastMessageId) total += current.messagesWritten;
  }
  return total;
}

function blocker(code: string, message: string, sourceKind: string, sourceId: string, recoverable = true): Blocker {
  return { code, message, source_kind: sourceKind, source_id: sourceId, recoverable };
}

function dedupeBlockers(blockers: Blocker[]): Blocker[] {
  const seen = new Set<string>();
  return blockers.filter((entry) => {
    const key = `${entry.code}\0${entry.source_kind}\0${entry.source_id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function actionResult(
  actionId: SyncActionId,
  subjectId: string,
  blockedBy: Blocker[],
  expectedTransition: string,
  confirmationRequired: boolean,
): SyncActionProjection {
  const blockers = dedupeBlockers(blockedBy);
  return {
    action_id: actionId,
    subject_kind: "sync",
    subject_id: subjectId,
    enabled: blockers.length === 0,
    blocked_by: blockers,
    expected_transition: expectedTransition,
    confirmation_required: confirmationRequired,
  };
}

function currentSync(store: StateStore, gameId: string, explicitSyncId?: string): SyncState | null {
  if (explicitSyncId) return getSyncState(store, explicitSyncId);
  return getNonTerminalSyncForGame(store, gameId);
}

function ownsSyncLease(store: StateStore, gameId: string, sync: SyncState | null): boolean {
  const lease = getHarnessState(store, gameId)?.active_workflow;
  return Boolean(sync && lease?.kind === "sync" && lease.workflow_id === sync.sync_id);
}

function hasValidationEvidence(store: StateStore, sync: SyncState): boolean {
  void store;
  return sync.validation_evidence !== null;
}

export function gameSyncAction(
  store: StateStore,
  gameId: string,
  actionId: SyncActionId,
  explicitSyncId?: string,
  options: {
    hasActiveProcess?: (stateDir: string) => { active: boolean };
    now?: Date | number | string;
    stateDir?: string;
  } = {},
): SyncActionProjection {
  const sync = currentSync(store, gameId, explicitSyncId);
  const subjectId = sync?.sync_id ?? explicitSyncId ?? `sync:new:${gameId}`;
  const state = getHarnessState(store, gameId);
  const lease = state?.active_workflow ?? null;
  const cycle = getActiveCycle(store.db, gameId);
  const missingSync = sync
    ? []
    : [blocker("sync_not_found", "No non-terminal sync exists.", "game", gameId)];
  const missingCycle = cycle
    ? []
    : [blocker("cycle_not_active", "No active game cycle exists.", "game", gameId)];
  const ownLease = ownsSyncLease(store, gameId, sync);
  const leaseRequired = ownLease
    ? []
    : [blocker("sync_does_not_own_dispatch_lease", "The sync does not own the dispatch lease.", "sync", subjectId)];
  const observedUpstream = sync?.staging?.observed_upstream;
  const validatedUpstream = sync?.staging?.validated_upstream;
  const staleValidatedCandidate = Boolean(
    sync?.status === "validated" &&
    observedUpstream &&
    validatedUpstream &&
    observedUpstream !== validatedUpstream,
  );

  if (actionId === "sync.start") {
    const blockers: Blocker[] = [...missingCycle];
    if (sync && sync.status !== "requested") {
      blockers.push(...sync.blockers);
      blockers.push(blocker(
        sync.status === "blocked" ? "sync_staging_awaits_decision" : "sync_already_started",
        sync.status === "blocked"
          ? `Sync ${sync.sync_id} has staging awaiting an operator decision.`
          : `Sync ${sync.sync_id} is already ${sync.status}.`,
        "sync",
        sync.sync_id,
      ));
    }
    if (lease) {
      const sameSync = sync && lease.kind === "sync" && lease.workflow_id === sync.sync_id && lease.status === "active";
      const activeRun = lease.kind === "run" && lease.status === "active" &&
        (!lease.requested_handoff || (
          sync && lease.requested_handoff.target_kind === "sync" &&
          lease.requested_handoff.target_workflow_id === sync.sync_id
        ));
      if (!sameSync && !activeRun) {
        blockers.push(blocker(
          "dispatch_lease_held",
          `${lease.kind} workflow ${lease.workflow_id} holds the dispatch lease and cannot hand off to this sync.`,
          lease.kind,
          lease.workflow_id,
        ));
      }
    }
    const afterStop = lease?.kind === "run";
    return actionResult(
      actionId,
      subjectId,
      blockers,
      afterStop ? "requested → ingesting after run stops" : "requested → ingesting",
      false,
    );
  }

  if (actionId === "sync.resolve_conflict") {
    const blockers = [...missingSync, ...leaseRequired];
    if (sync && (sync.status !== "blocked" || !sync.blockers.some((entry) => entry.code === "conflict_needs_operator"))) {
      blockers.push(...sync.blockers);
      blockers.push(blocker(
        "sync_not_waiting_on_conflict",
        `Sync ${sync.sync_id} is not blocked on an operator conflict.`,
        "sync",
        sync.sync_id,
      ));
    }
    return actionResult(actionId, subjectId, blockers, "blocked → reconciling", false);
  }

  if (actionId === "sync.publish") {
    const blockers = [...missingSync, ...leaseRequired];
    if (sync && observedUpstream && validatedUpstream && observedUpstream !== validatedUpstream) {
      blockers.push(blocker(
        "upstream_moved_after_validation",
        `Validated ${validatedUpstream}, but upstream is now ${observedUpstream}.`,
        "sync",
        sync.sync_id,
      ));
    }
    if (sync && sync.status !== "validated") {
      blockers.push(...sync.blockers);
      blockers.push(blocker("sync_not_validated", `Sync ${sync.sync_id} is ${sync.status}; publish requires validated.`, "sync", sync.sync_id));
    } else if (sync && !hasValidationEvidence(store, sync)) {
      blockers.push(blocker("missing_validation_evidence", "Validated sync evidence is missing.", "sync", sync.sync_id));
    }
    return actionResult(actionId, subjectId, blockers, "validated → publishing → published", true);
  }

  if (actionId === "sync.cancel") {
    const blockers = [...missingSync];
    if (sync) {
      const origin = sync.status === "blocked" ? getSyncBlockedOriginStatus(store.db, sync) : null;
      if (sync.status === "publishing" || origin === "publishing" || sync.status === "published" || sync.status === "cancelled") {
        blockers.push(blocker("sync_publish_committing", "Sync cannot be cancelled after publication has started.", "sync", sync.sync_id, false));
      } else if (sync.status !== "requested" && !ownLease) {
        blockers.push(...leaseRequired);
      }
    }
    return actionResult(actionId, subjectId, blockers, `${sync?.status ?? "requested"} → cancelled`, true);
  }

  const blockers = [...missingSync, ...leaseRequired];
  // A stale validated candidate with durable staging can be revalidated in
  // place through sync.recover (rebase staging onto the new tip, re-run the
  // incremental validation); only a stale candidate without staging still
  // forces a cancel.
  const staleBlockedRevalidatable = Boolean(
    sync?.status === "blocked" &&
    sync.blockers.some((entry) => entry.code === "upstream_moved_after_validation") &&
    sync.staging?.workspace_path,
  );
  const staleRecoveryRequiresNewSync = !staleBlockedRevalidatable && Boolean(
    sync && (
      staleValidatedCandidate ||
      sync.blockers.some((entry) => entry.code === "upstream_moved_after_validation")
    ),
  );
  if (sync && staleRecoveryRequiresNewSync) {
    blockers.push(...sync.blockers);
    blockers.push(blocker(
      "sync_cancel_required",
      "The validated candidate is stale. Cancel it and start a new sync so knowledge and source intake use the same upstream.",
      "sync",
      sync.sync_id,
    ));
    return actionResult(
      actionId,
      subjectId,
      blockers,
      "stale candidate → cancel → new sync",
      true,
    );
  }
  const processingOrphan = sync?.status === "ingesting" &&
    listSyncKnowledgeJobs(store.db, sync.sync_id).some((job) => job.status === "processing");
  if (processingOrphan) {
    const staleness = runDispatchLeaseStaleness({
      hasActiveProcess: options.hasActiveProcess,
      lease,
      now: options.now,
      stateDir: options.stateDir ?? store.stateDir,
    });
    if (staleness === "process_liveness_unknown") {
      blockers.push(blocker(
        "process_liveness_unknown",
        "The managed process liveness could not be determined.",
        "sync",
        sync.sync_id,
      ));
    } else if (staleness !== "stale") {
      blockers.push(blocker(
        "dispatch_lease_not_stale",
        "The sync dispatch lease is not stale or its managed process is still active.",
        "sync",
        sync.sync_id,
      ));
    }
    return actionResult(
      actionId,
      subjectId,
      blockers,
      "orphaned ingesting → ingesting with processing jobs requeued",
      true,
    );
  }
  if (sync && (
    (sync.status !== "blocked" && sync.status !== "publishing") ||
    sync.blockers.some((entry) => entry.code === "conflict_needs_operator")
  )) {
    blockers.push(...sync.blockers);
    blockers.push(blocker(
      sync.blockers.some((entry) => entry.code === "conflict_needs_operator")
        ? "sync_conflict_requires_resolution"
        : "sync_recovery_not_required",
      sync.blockers.some((entry) => entry.code === "conflict_needs_operator")
        ? "Use sync.resolve_conflict for staged reconciliation conflicts."
        : `Sync ${sync.sync_id} is not awaiting crash recovery.`,
      "sync",
      sync.sync_id,
    ));
  }
  return actionResult(
    actionId,
    subjectId,
    blockers,
    sync?.status === "publishing"
      ? "publishing → blocked recovery point or published"
      : "blocked → last durable stage or cancelled",
    true,
  );
}

function requiredGameId(paths: SyncRuntimeGameContext, body: Record<string, unknown>): string {
  const gameId = paths.game?.gameId ?? text(body.gameId, text(body.game_id));
  if (!gameId) throw new Error("Sync action requires a game id");
  return gameId;
}

function durableCycleWorktreePath(
  paths: SyncRuntimeGameContext,
  store: StateStore,
  sync: SyncState,
): string {
  const cycle = getCycleByUuid(store.db, sync.cycle_uuid);
  if (!cycle) throw new Error(`Game cycle not found for sync ${sync.sync_id}: ${sync.cycle_uuid}`);
  if (cycle.game_id !== sync.game_id) {
    throw new Error(
      `Sync ${sync.sync_id} belongs to ${sync.game_id}, but cycle ${sync.cycle_uuid} belongs to ${cycle.game_id}`,
    );
  }
  const preparation = cycle.preparing_state_json.sync;
  const persisted = preparation && typeof preparation === "object"
    ? text(
        preparation.cycleCurrentWorktreePath,
        text(preparation.cycleWorktreePath),
      )
    : "";
  if (persisted) return resolve(persisted);
  const derived = prepareWorktreePaths(paths, sync.cycle_uuid).cycleCurrentWorktreePath;
  if (!derived) throw new Error(`Unable to derive the worktree for game cycle ${sync.cycle_uuid}`);
  return derived;
}

function syncLeaseContext(
  paths: SyncRuntimeGameContext,
  store: StateStore,
  sync: SyncState,
  deps: SyncRuntimeDeps,
): SyncEngineContext {
  const lease = getHarnessState(store, sync.game_id)?.active_workflow;
  if (!lease || lease.kind !== "sync" || lease.workflow_id !== sync.sync_id) {
    throw new Error(`Sync ${sync.sync_id} does not own the dispatch lease`);
  }
  return {
    store,
    stateDir: paths.stateDir,
    repoRoot: paths.repoRoot,
    cycleWorktreePath: durableCycleWorktreePath(paths, store, sync),
    game: paths.game ? { baseRef: paths.game.baseRef, reportRelPath: paths.game.validation?.reportPath } : null,
    leaseId: lease.lease_id,
    runGit: deps.runGit,
  };
}

function requestedSyncContext(
  paths: SyncRuntimeGameContext,
  store: StateStore,
  sync: SyncState,
  deps: SyncRuntimeDeps,
): SyncEngineContext {
  if (sync.status !== "requested") return syncLeaseContext(paths, store, sync, deps);
  return {
    store,
    stateDir: paths.stateDir,
    repoRoot: paths.repoRoot,
    cycleWorktreePath: durableCycleWorktreePath(paths, store, sync),
    game: paths.game ? { baseRef: paths.game.baseRef, reportRelPath: paths.game.validation?.reportPath } : null,
    leaseId: "requested-sync-has-no-lease",
    runGit: deps.runGit,
  };
}

function syncActionOptions(paths: SyncRuntimeGameContext, deps: SyncRuntimeDeps) {
  return {
    hasActiveProcess: deps.hasActiveProcess,
    now: deps.now?.(),
    stateDir: paths.stateDir,
  };
}

function parseCliOutput(result: CliResult): Record<string, unknown> {
  const value = result.stdout.trim();
  if (!value) return {};
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : { output: parsed };
  } catch {
    return { output: value };
  }
}

const FAILURE_TAIL_CHARS = 200;
const FAILURE_EARLIER_OUTPUT_CHARS = 3800;

function failureOutput(result: CliResult): string {
  return (result.stderr || result.stdout || "").trim() || "no output";
}

/** Leads with the tail of the output (the actual error), then earlier context.
 * Kernel-runtime init failures echo kilobytes of migration SQL before the real
 * error line; a plain slice buried the error under that SQL. */
function commandFailure(name: string, result: CliResult): void {
  if (result.exitCode === 0) return;
  const output = failureOutput(result);
  const tail = output.slice(-FAILURE_TAIL_CHARS);
  const earlier = output.slice(0, output.length - tail.length).slice(-FAILURE_EARLIER_OUTPUT_CHARS);
  const suffix = earlier ? `\n--- earlier output (truncated) ---\n${earlier}` : "";
  throw new Error(`${name} failed (${String(result.exitCode)}): ${tail}${suffix}`);
}

const SYNC_CLI_MAX_ATTEMPTS = 3;
const SYNC_CLI_BACKOFF_BASE_MS = 1500;

function cliExitFailure(result: CliResult): string | null {
  return result.exitCode === 0 ? null : `exit ${String(result.exitCode)}`;
}

/** Runs a per-PR sync subprocess, retrying transient failures.
 *
 * Both per-PR subprocesses flake transiently on 1 PR of hundreds and block
 * the whole sync: the intake job's kernel runtime bootstrap used to collide
 * on the idempotent schema migration, and the fetch step's pi postmortem
 * agent can exit 0 without producing postmortem.json. Both commands are
 * idempotent per PR (curated.jsonl appends dedupe by record id; the fetch
 * skips already-complete raw data and existing postmortems), so retrying is
 * safe. `commandForAttempt` lets a retry adjust flags; `failureFor` lets a
 * caller treat a zero-exit result with missing outputs as a failure.
 * Exported for tests. */
export async function runSyncCliWithRetry(
  deps: Pick<SyncRuntimeDeps, "packageRoot" | "runCli" | "sleep">,
  label: string,
  commandForAttempt: (attempt: number) => string[],
  failureFor: (result: CliResult) => string | null = cliExitFailure,
): Promise<CliResult> {
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((resolveSleep) => setTimeout(resolveSleep, ms)));
  let result = await deps.runCli(commandForAttempt(1), deps.packageRoot);
  let failure = failureFor(result);
  for (let attempt = 2; failure && attempt <= SYNC_CLI_MAX_ATTEMPTS; attempt += 1) {
    const delayMs = Math.round(SYNC_CLI_BACKOFF_BASE_MS * (attempt - 1) * (1 + Math.random()));
    uiLog(
      "stderr",
      `${label} attempt ${attempt - 1}/${SYNC_CLI_MAX_ATTEMPTS} failed (${failure}); retrying in ${delayMs}ms: ${failureOutput(result).slice(-FAILURE_TAIL_CHARS)}`,
    );
    await sleep(delayMs);
    result = await deps.runCli(commandForAttempt(attempt), deps.packageRoot);
    failure = failureFor(result);
  }
  return result;
}

const SYNC_INGEST_CONCURRENCY_DEFAULT = 16;

/**
 * Pool size for per-PR knowledge ingest (fetch dump + intake subprocess per
 * merged PR). Per-PR learnings are independent, so the pool has no ordering
 * requirement. Configured with ORCH_SYNC_INGEST_CONCURRENCY (>= 1); wiring a
 * games/<id>/game.json knob would require game-registry resolver changes
 * outside the sync surface, so the env var is the single knob. Exported for
 * tests.
 */
export function syncIngestConcurrency(
  env: Record<string, string | undefined> = process.env,
  override?: unknown,
): number {
  const requested = Number(override);
  if (Number.isInteger(requested) && requested >= 1) return requested;
  const parsed = Number.parseInt(env.ORCH_SYNC_INGEST_CONCURRENCY ?? "", 10);
  return Number.isInteger(parsed) && parsed >= 1 ? parsed : SYNC_INGEST_CONCURRENCY_DEFAULT;
}

let ghTokenEnvReady: Promise<void> | null = null;

const GH_TOKEN_RESOLUTION_TIMEOUT_MS = 15_000;

/**
 * Resolves the gh auth token once per server process and exports it as
 * GH_TOKEN so every child process (the per-PR fetch script and anything it
 * spawns) authenticates from env instead of hammering the macOS keyring —
 * parallel gh invocations hit keyring timeouts even at low concurrency.
 * Soft-fails: if gh is missing, exits non-zero, or hangs past the timeout,
 * the env is left unchanged and children fall back to gh's own auth path.
 * Deliberately avoids deps.runCli, which streams child stdout (the token)
 * into the sync log.
 */
function ensureGhTokenEnv(): Promise<void> {
  if (process.env.GH_TOKEN || process.env.GITHUB_TOKEN) return Promise.resolve();
  ghTokenEnvReady ??= new Promise<void>((resolveReady) => {
    let child: ReturnType<typeof spawn>;
    try {
      child = spawn("gh", ["auth", "token"], { stdio: ["ignore", "pipe", "ignore"] });
    } catch {
      resolveReady();
      return;
    }
    const chunks: string[] = [];
    child.stdout?.setEncoding("utf8");
    child.stdout?.on("data", (chunk) => chunks.push(String(chunk)));
    const timer = setTimeout(() => child.kill("SIGKILL"), GH_TOKEN_RESOLUTION_TIMEOUT_MS);
    timer.unref?.();
    child.on("error", () => {
      clearTimeout(timer);
      resolveReady();
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      const token = chunks.join("").trim();
      if (code === 0 && token) {
        process.env.GH_TOKEN = token;
      } else {
        uiLog("stderr", "gh auth token resolution failed; per-PR fetches fall back to gh keyring auth");
      }
      resolveReady();
    });
  });
  return ghTokenEnvReady;
}

function within(root: string, path: string): boolean {
  const normalizedRoot = resolve(root);
  const normalizedPath = resolve(path);
  return normalizedPath === normalizedRoot || normalizedPath.startsWith(`${normalizedRoot}${sep}`);
}

function defaultProcessors(
  deps: SyncRuntimeDeps,
  paths: SyncRuntimeGameContext,
  body: Record<string, unknown>,
  sync: SyncState,
): SyncKnowledgeProcessors {
  const dryRunAgents = body.dryRunAgents === true;
  return {
    async processMergedPr({ artifactDirectory, job }) {
      const number = Number(job.sourceId.replace(/^pr-/, ""));
      if (!Number.isInteger(number) || number <= 0) throw new Error(`Invalid merged PR id: ${job.sourceId}`);
      await ensureGhTokenEnv();
      const dataRoot = resolve(artifactDirectory, "data");
      const kernelEnabled = !dryRunAgents && await deps.kernelEnabled?.().catch(() => false);
      const fetchCommand = (postmortemScope: "fetched" | "all") => [
        "python3",
        resolve(deps.sourceRoot("past_prs"), "commands/fetch_recent_pr_dump.py"),
        "--dump-root",
        dataRoot,
        "--postmortem-mode",
        kernelEnabled ? "pi" : "scaffold",
        "--postmortem-scope",
        postmortemScope,
        "--postmortem-jobs",
        "1",
        "--fetch-jobs",
        "1",
        "--orchestrator-state-dir",
        paths.stateDir,
        "--orchestrator-run-id",
        sync.sync_id,
        "--orchestrator-project-id",
        sync.game_id,
        "--orchestrator-prepare-intake",
        "--pr",
        String(number),
      ];
      const postmortem = resolve(dataRoot, "prs", `pr-${number}`, "postmortem", "postmortem.json");
      const fetched = await runSyncCliWithRetry(
        deps,
        `Merged PR #${number} staged fetch`,
        // Retries widen the postmortem scope to "all": the raw PR data from a
        // prior attempt makes the script report "nothing to fetch", and with
        // scope "fetched" that skips postmortem generation entirely, so a
        // missing postmortem.json would never regenerate. Scope "all" selects
        // from the per-PR dump index and only rebuilds missing postmortems.
        (attempt) => fetchCommand(attempt === 1 ? "fetched" : "all"),
        // The postmortem agent can flake with a zero exit; treat a missing
        // postmortem.json as a retryable failure too.
        (result) => cliExitFailure(result) ?? (existsSync(postmortem) ? null : "postmortem.json was not produced"),
      );
      commandFailure(`Merged PR #${number} staged fetch`, fetched);
      if (!existsSync(postmortem)) throw new Error(`Merged PR #${number} staged postmortem was not produced`);
      return {
        pr: number,
        postmortem_path: postmortem,
        postmortem: JSON.parse(readFileSync(postmortem, "utf8")) as JsonValue,
      };
    },
    async processCorpus({ job }): Promise<JsonValue> {
      const stagedRoot = resolve(paths.stateDir, "staged_corpora");
      const candidates = [
        resolve(stagedRoot, `${job.sourceId}.json`),
        resolve(stagedRoot, `${job.sourceId}.jsonl`),
        resolve(stagedRoot, job.sourceId),
      ].filter((candidate) => within(stagedRoot, candidate));
      const source = candidates.find((candidate) => existsSync(candidate));
      if (!source) throw new Error(`Staged corpus batch ${job.sourceId} was not found below ${stagedRoot}`);
      const content = readFileSync(source, "utf8");
      let parsed: JsonValue;
      try {
        parsed = JSON.parse(content) as JsonValue;
      } catch {
        return { corpus_batch_id: job.sourceId, source_path: source, content };
      }
      return { corpus_batch_id: job.sourceId, source_path: source, content: parsed };
    },
  };
}

export function createSyncRuntime(deps: SyncRuntimeDeps) {
  const emitSyncMilestone = createSyncTraceEmitter<SyncRuntimeGameContext>({
    submitWorkflowEvent: deps.submitWorkflowEvent,
  });

  /** Files whichever terminal-ish milestone the sync actually landed on. */
  async function emitSettledMilestone(
    paths: SyncRuntimeGameContext,
    sync: SyncState,
    detail?: string,
  ): Promise<void> {
    if (sync.status === "blocked") {
      await emitSyncMilestone(paths, sync, "blocked", {
        detail: detail ?? (sync.blockers.map((entry) => entry.message).join("; ") || null),
        metadata: { blockerCodes: sync.blockers.map((entry) => entry.code) },
      });
    }
  }

  async function observe(body: Record<string, unknown>): Promise<SyncState> {
    const paths = deps.resolveDashboardGame(body, { useDefaultGame: true });
    const gameId = requiredGameId(paths, body);
    const store = openState(paths.stateDir);
    try {
      const cycle = getActiveCycle(store.db, gameId);
      if (!cycle) throw new Error(`No active game cycle exists for ${gameId}`);
      const existing = getNonTerminalSyncForGame(store, gameId);
      const commandId = text(body.commandId, text(body.command_id)) || `command-sync-observe-${randomUUID()}`;
      const actionSpanId = syncActionSpanId(commandId);
      if (existing?.status === "validated") {
        return (await refreshSyncUpstreamObservation({
          context: syncLeaseContext(paths, store, existing, deps),
          syncId: existing.sync_id,
          expectedRevision: existing.revision,
          commandId,
        })).sync;
      }
      if (existing && existing.status !== "requested") return existing;
      const anchor = store.db
        .query("SELECT upstream_revision FROM game_upstream_anchors WHERE game_id = ?")
        .get(gameId) as { upstream_revision: string } | null;
      const upstreamFrom = anchor?.upstream_revision ?? cycle.base_sha ?? cycle.head_revision;
      if (!upstreamFrom) throw new Error(`Game cycle ${cycle.cycle_uuid} has no upstream anchor`);
      const discovery = await fetchUpstreamAndFindMergedPrs(
        { runGit: deps.runGit },
        { game: paths.game, repoRoot: paths.repoRoot },
        undefined,
        { upstreamFrom },
      );
      const syncId = text(body.syncId, text(body.sync_id)) || existing?.sync_id || `sync-${randomUUID()}`;
      const observationSourceIdentity = discovery.baseRef;
      if (!observationSourceIdentity?.trim()) throw new Error("Upstream discovery returned no baseRef identity");
      const actor = body.actor === "external_observer" ? "external_observer" : "operator";
      const bodyCorpusBatchIds = strings(body.corpusBatchIds ?? body.corpus_batch_ids);
      let sync = recordSyncRequested(store, {
        gameId,
        cycleUuid: cycle.cycle_uuid,
        syncId,
        actor,
        commandId,
        correlationId: syncId,
        spanId: actionSpanId,
        observationSourceIdentity,
        intake: {
          upstream_from: upstreamFrom,
          upstream_to: discovery.afterRef,
          merged_pr_ids: discovery.mergedPrs.map(String),
          corpus_batch_ids: bodyCorpusBatchIds,
          knowledge_only: upstreamFrom === discovery.afterRef,
        },
      });
      appendSyncDiscordEvent(store, {
        syncId,
        eventType: "sync.discord_refresh_requested",
        payload: {},
        actor: actor === "external_observer" ? "runner" : actor,
        commandId,
        spanId: actionSpanId,
      });
      const discordBefore = readDiscordPullState();
      const refreshStartedAt = Date.now();
      const mirror = await (deps.refreshDiscordMirror ?? refreshDiscordMirror)({});
      const durationMs = Math.max(0, Date.now() - refreshStartedAt);
      const messagesPulled = discordMessagesPulled(discordBefore, readDiscordPullState());
      uiLog(mirror.ok ? "stdout" : "stderr", mirror.detail);
      appendSyncDiscordEvent(store, {
        syncId,
        eventType: "sync.discord_refresh_completed",
        payload: {
          ok: mirror.ok,
          detail: mirror.detail,
          duration_ms: durationMs,
          messages_pulled: messagesPulled,
        },
        actor: actor === "external_observer" ? "runner" : actor,
        commandId,
        spanId: actionSpanId,
      });
      await emitSyncMilestone(paths, sync, "discord_refresh", {
        detail: mirror.detail,
        metadata: { ok: mirror.ok, detail: mirror.detail, messages_pulled: messagesPulled, duration_ms: durationMs },
      });
      const corpusBatchIds = [...new Set(bodyCorpusBatchIds)]
        .sort((left, right) => left.localeCompare(right));
      sync = recordSyncRequested(store, {
        gameId,
        cycleUuid: cycle.cycle_uuid,
        syncId,
        actor,
        commandId,
        correlationId: syncId,
        spanId: actionSpanId,
        observationSourceIdentity,
        intake: {
          upstream_from: upstreamFrom,
          upstream_to: discovery.afterRef,
          merged_pr_ids: discovery.mergedPrs.map(String),
          corpus_batch_ids: corpusBatchIds,
          knowledge_only: upstreamFrom === discovery.afterRef,
        },
      });
      return sync;
    } finally {
      store.db.close();
    }
  }

  /** Production observation-path hook used by the dashboard refresh loop. */
  async function refreshObservation(body: Record<string, unknown>): Promise<SyncState | null> {
    const paths = deps.resolveDashboardGame(body, { useDefaultGame: true });
    const gameId = requiredGameId(paths, body);
    const store = openState(paths.stateDir);
    try {
      const sync = getNonTerminalSyncForGame(store, gameId);
      if (!sync || sync.status !== "validated") return sync;
      const observedUpstream = text(body.observedUpstream, text(body.observed_upstream));
      if (
        observedUpstream &&
        observedUpstream === (sync.staging?.validated_upstream ?? sync.intake.upstream_to)
      ) {
        return sync;
      }
      return (await refreshSyncUpstreamObservation({
        context: syncLeaseContext(paths, store, sync, deps),
        syncId: sync.sync_id,
        expectedRevision: sync.revision,
        commandId: text(body.commandId, text(body.command_id)) || `command-sync-refresh-observation-${randomUUID()}`,
      })).sync;
    } finally {
      store.db.close();
    }
  }

  async function advance(
    paths: SyncRuntimeGameContext,
    body: Record<string, unknown>,
    syncId: string,
  ): Promise<SyncState> {
    const store = openState(paths.stateDir);
    const commandId = text(body.commandId, text(body.command_id)) || `command-sync-advance-${randomUUID()}`;
    try {
      let sync = getSyncState(store, syncId);
      if (!sync) throw new Error(`Sync not found: ${syncId}`);
      if (sync.status !== "ingesting") return sync;
      await emitSyncMilestone(paths, sync, "ingest", {
        detail: `staging ${String(sync.intake.merged_pr_ids.length)} merged PR(s) and ${String(sync.intake.corpus_batch_ids.length)} corpus batch(es)`,
        metadata: {
          mergedPrIds: sync.intake.merged_pr_ids,
          corpusBatchIds: sync.intake.corpus_batch_ids,
          knowledgeOnly: sync.intake.knowledge_only,
        },
      });
      const context = syncLeaseContext(paths, store, sync, deps);
      context.actor = body.actor === "operator" ? "operator" : "runner";
      const revalidateOwnership = (): void => {
        const lease = requireLease(store, context.leaseId, sync!.game_id);
        if (lease.kind !== "sync" || lease.workflow_id !== sync!.sync_id) {
          throw new Error(`Dispatch lease ${lease.lease_id} no longer belongs to sync ${sync!.sync_id}`);
        }
      };
      try {
        const knowledge = await completeSyncKnowledgeIngest({
          store,
          stateDir: paths.stateDir,
          syncId: sync.sync_id,
          expectedRevision: sync.revision,
          commandId,
          actor: context.actor,
          processors: deps.processors?.({ body, paths, sync }) ?? defaultProcessors(deps, paths, body, sync),
          revalidateOwnership,
          concurrency: syncIngestConcurrency(process.env, body.syncIngestConcurrency),
        });
        sync = knowledge.sync;
        if (sync.intake.knowledge_only || sync.status !== "ingesting") {
          if (sync.status === "validated") await emitSyncMilestone(paths, sync, "validated");
          await emitSettledMilestone(paths, sync);
          return sync;
        }
        sync = await reconcileSync({
          context,
          syncId: sync.sync_id,
          expectedRevision: sync.revision,
          commandId,
        });
        await emitSyncMilestone(paths, sync, "reconciling");
        if (sync.status !== "validating") {
          await emitSettledMilestone(paths, sync);
          return sync;
        }
        const validated = await validateSync(context, {
          syncId: sync.sync_id,
          expectedRevision: sync.revision,
          commandId,
          validate: deps.validate,
        });
        if (validated.status === "validated") await emitSyncMilestone(paths, validated, "validated");
        await emitSettledMilestone(paths, validated);
        return validated;
      } catch (error) {
        let current = getSyncState(store, sync.sync_id) ?? sync;
        if (["ingesting", "reconciling", "validating", "validated"].includes(current.status)) {
          try {
            const recoveryContext = syncLeaseContext(paths, store, current, deps);
            recoveryContext.actor = context.actor;
            current = markSyncRecoveryRequired({
              context: recoveryContext,
              syncId: current.sync_id,
              expectedRevision: current.revision,
              commandId,
              reason: error instanceof Error ? error.message : String(error),
            });
          } catch (markError) {
            throw new Error(
              `Sync phase failed and recovery blocker could not be recorded: ${markError instanceof Error ? markError.message : String(markError)}`,
              { cause: error },
            );
          }
        }
        await emitSettledMilestone(
          paths,
          current,
          error instanceof Error ? error.message : String(error),
        );
        throw new SyncWorkflowBlockedError(current, error);
      }
    } finally {
      store.db.close();
    }
  }

  async function start(body: Record<string, unknown>): Promise<SyncStartDecision> {
    const paths = deps.resolveDashboardGame(body, { useDefaultGame: true });
    const gameId = requiredGameId(paths, body);
    const commandId = text(body.commandId, text(body.command_id)) || `command-sync-start-${randomUUID()}`;
    const actionSpanId = syncActionSpanId(commandId);
    const actionBody = { ...body, actor: "operator", commandId };
    let store = openState(paths.stateDir);
    let sync = currentSync(store, gameId, text(body.syncId, text(body.sync_id)) || undefined);
    let action = gameSyncAction(store, gameId, "sync.start", sync?.sync_id, syncActionOptions(paths, deps));
    store.db.close();
    if (!action.enabled) throw new SyncActionBlockedError(action);
    if (!sync) {
      sync = deps.withOperation
        ? await deps.withOperation("sync-pull", "Pulling things down", ["Discovering intake"], () => observe(actionBody))
        : await observe(actionBody);
    }

    store = openState(paths.stateDir);
    let decision: SyncStartDecision;
    let stopRunId: string | null = null;
    try {
      action = gameSyncAction(store, gameId, "sync.start", sync.sync_id, syncActionOptions(paths, deps));
      if (!action.enabled) throw new SyncActionBlockedError(action);
      decision = immediateTransaction(store.db, () => {
        initializeHarnessState(store, { gameId, traceId: `trace-game-${gameId}` });
        const harnessState = getHarnessState(store, gameId);
        const existingLease = harnessState?.active_workflow;
        if (existingLease?.kind === "sync" && existingLease.workflow_id === sync!.sync_id) {
          const activated = activateAcquiredSync({
            actor: "operator",
            store,
            gameId,
            syncId: sync!.sync_id,
            leaseId: existingLease.lease_id,
            commandId,
            correlationId: sync!.sync_id,
            causationId: harnessState?.caused_by_event_id ?? commandId,
            spanId: actionSpanId,
          });
          return { queued: false, run_stopping: false, lease_id: existingLease.lease_id, sync: activated };
        }
        const dispatch = requestDispatch(store, {
          actor: "operator",
          commandId,
          correlationId: sync!.sync_id,
          kind: "sync",
          gameId,
          reason: text(body.reason, "operator started sync"),
          workflowId: sync!.sync_id,
          spanId: actionSpanId,
          handoffOnQueue: true,
        });
        if (!dispatch.queued) {
          const activated = activateAcquiredSync({
            actor: "operator",
            store,
            gameId,
            syncId: sync!.sync_id,
            leaseId: dispatch.leaseId,
            commandId,
            correlationId: sync!.sync_id,
            causationId: dispatch.acquiredEventId,
            spanId: actionSpanId,
          });
          return { queued: false, run_stopping: false, lease_id: dispatch.leaseId, sync: activated };
        }
        const holder = dispatch.blockedBy;
        if (holder.kind !== "run") {
          throw new Error(`Only an active run can hand off dispatch authority to sync; found ${holder.kind}:${holder.workflow_id}`);
        }
        if (holder.status !== "active") {
          throw new Error(`Run ${holder.workflow_id} cannot hand off to sync while ${holder.status}`);
        }
        if (!getRun(store, holder.workflow_id)) throw new Error(`Run not found: ${holder.workflow_id}`);
        stopRunId = holder.workflow_id;
        return { queued: true, run_stopping: true, lease_id: null, sync: getSyncState(store, sync!.sync_id)! };
      });
    } finally {
      store.db.close();
    }
    if (!decision.queued) {
      await emitSyncMilestone(paths, decision.sync, "activation", {
        detail: `operator started sync ${decision.sync.sync_id}`,
        metadata: { leaseId: decision.lease_id },
      });
    }
    if (stopRunId) {
      await deps.stopManaged({
        ...body,
        commandId,
        reason: text(body.reason, "operator started sync"),
        recoverClaims: false,
        runId: stopRunId,
      });
    }
    if (!decision.queued) decision.sync = await advance(paths, actionBody, decision.sync.sync_id);
    return decision;
  }

  async function resolveConflict(body: Record<string, unknown>): Promise<SyncState> {
    const paths = deps.resolveDashboardGame(body, { useDefaultGame: true });
    const gameId = requiredGameId(paths, body);
    const store = openState(paths.stateDir);
    try {
      const sync = currentSync(store, gameId, text(body.syncId, text(body.sync_id)) || undefined);
      const action = gameSyncAction(store, gameId, "sync.resolve_conflict", sync?.sync_id, syncActionOptions(paths, deps));
      if (!action.enabled) throw new SyncActionBlockedError(action);
      const commandId = text(body.commandId, text(body.command_id)) || `command-sync-resolve-${randomUUID()}`;
      const context = syncLeaseContext(paths, store, sync!, deps);
      context.actor = "operator";
      let next = await resolveSyncConflict({
        context,
        syncId: sync!.sync_id,
        expectedRevision: sync!.revision,
        commandId,
      });
      await emitSyncMilestone(paths, next, "reconciling", { detail: "operator resolved staged conflicts" });
      if (next.status === "validating") {
        context.actor = "operator";
        next = await validateSync(context, {
          syncId: next.sync_id,
          expectedRevision: next.revision,
          commandId,
          validate: deps.validate,
        });
        if (next.status === "validated") await emitSyncMilestone(paths, next, "validated");
      }
      await emitSettledMilestone(paths, next);
      return next;
    } finally {
      store.db.close();
    }
  }

  async function publish(body: Record<string, unknown>): Promise<{ sync: SyncState; save_point: unknown | null }> {
    const paths = deps.resolveDashboardGame(body, { useDefaultGame: true });
    const gameId = requiredGameId(paths, body);
    const store = openState(paths.stateDir);
    try {
      const sync = currentSync(store, gameId, text(body.syncId, text(body.sync_id)) || undefined);
      const action = gameSyncAction(store, gameId, "sync.publish", sync?.sync_id, syncActionOptions(paths, deps));
      if (!action.enabled) throw new SyncActionBlockedError(action);
      const context = syncLeaseContext(paths, store, sync!, deps);
      const published = await publishSync({
        context,
        syncId: sync!.sync_id,
        expectedRevision: sync!.revision,
        commandId: text(body.commandId, text(body.command_id)) || `command-sync-publish-${randomUUID()}`,
        confirmed: body.confirmed === true,
      });
      // publishSync crosses validated -> publishing -> published inside one
      // call, so both milestones are read back from the durable events it
      // appended rather than from an intermediate return value. A sync still
      // resting at validated never entered publishing, and must not borrow an
      // earlier attempt's event.
      if (published.status !== "validated") {
        await emitSyncMilestone(paths, published, "publishing", {
          detail: "operator confirmed publication",
        });
      }
      if (published.status === "published") {
        await emitSyncMilestone(paths, published, "published", {
          detail: published.publication?.new_head ?? null,
          metadata: {
            priorHead: published.publication?.prior_head ?? null,
            newHead: published.publication?.new_head ?? null,
            knowledgeRevision: published.publication?.knowledge_revision ?? null,
          },
        });
      }
      await emitSettledMilestone(paths, published);
      const savePoint = published.status === "published" && published.publication?.remote_application_id
        ? store.db.query(
            `SELECT id, commit_sha, payload_json FROM save_points
             WHERE trigger_kind = 'sync'
               AND json_extract(payload_json, '$.remote_application_id') = ?
             ORDER BY created_at DESC LIMIT 1`,
          ).get(published.publication.remote_application_id) ?? null
        : null;
      return { sync: published, save_point: savePoint };
    } finally {
      store.db.close();
    }
  }

  async function cancel(body: Record<string, unknown>): Promise<SyncState> {
    if (body.confirmed !== true) throw new Error("sync.cancel requires explicit confirmation");
    const paths = deps.resolveDashboardGame(body, { useDefaultGame: true });
    const gameId = requiredGameId(paths, body);
    const store = openState(paths.stateDir);
    try {
      const sync = currentSync(store, gameId, text(body.syncId, text(body.sync_id)) || undefined);
      const action = gameSyncAction(store, gameId, "sync.cancel", sync?.sync_id, syncActionOptions(paths, deps));
      if (!action.enabled) throw new SyncActionBlockedError(action);
      const context = requestedSyncContext(paths, store, sync!, deps);
      const cancelled = await cancelSync({
        context,
        syncId: sync!.sync_id,
        expectedRevision: sync!.revision,
        commandId: text(body.commandId, text(body.command_id)) || `command-sync-cancel-${randomUUID()}`,
      });
      await emitSyncMilestone(paths, cancelled, "cancelled", {
        detail: text(body.reason, "operator cancelled sync"),
      });
      return cancelled;
    } finally {
      store.db.close();
    }
  }

  async function recover(body: Record<string, unknown>): Promise<SyncState> {
    if (body.confirmed !== true) throw new Error("sync.recover requires explicit confirmation");
    const paths = deps.resolveDashboardGame(body, { useDefaultGame: true });
    const gameId = requiredGameId(paths, body);
    const store = openState(paths.stateDir);
    let recovered: SyncState;
    const commandId = text(body.commandId, text(body.command_id)) || `command-sync-recover-${randomUUID()}`;
    try {
      let sync = currentSync(store, gameId, text(body.syncId, text(body.sync_id)) || undefined);
      let action = gameSyncAction(store, gameId, "sync.recover", sync?.sync_id, syncActionOptions(paths, deps));
      if (!action.enabled) throw new SyncActionBlockedError(action);
      const choice = body.choice === "discard"
        ? "discard"
        : body.choice === "resume"
          ? "resume"
          : null;
      if (!choice) throw new Error("sync.recover requires choice 'resume' or 'discard'");
      if (sync?.status === "publishing") {
        if (choice !== "resume") throw new Error("Publishing recovery requires choice 'resume'");
        sync = await reconcileInterruptedSyncPublication({
          context: syncLeaseContext(paths, store, sync, deps),
          syncId: sync.sync_id,
          commandId,
          actor: "operator",
        });
        if (sync.status === "published") {
          await emitSyncMilestone(paths, sync, "published", {
            detail: "interrupted publication reconciled forward",
          });
          return sync;
        }
        action = gameSyncAction(store, gameId, "sync.recover", sync.sync_id, syncActionOptions(paths, deps));
        if (!action.enabled) throw new SyncActionBlockedError(action);
      }
      const recoveryReason = text(body.recoveryReason, text(body.recovery_reason, "operator recovered sync"));
      if (sync!.status === "ingesting") {
        if (choice !== "resume") throw new Error("Confirmed orphan ingest recovery requires choice 'resume'");
        recovered = recoverConfirmedOrphanSyncIngest({
          context: syncLeaseContext(paths, store, sync!, deps),
          syncId: sync!.sync_id,
          expectedRevision: sync!.revision,
          commandId,
          recoveryReason,
          hasActiveProcess: deps.hasActiveProcess,
          now: deps.now?.(),
        });
      } else {
        recovered = await recoverSync({
          context: syncLeaseContext(paths, store, sync!, deps),
          syncId: sync!.sync_id,
          expectedRevision: sync!.revision,
          commandId,
          choice,
          recoveryReason,
        });
      }
      await emitSyncMilestone(paths, recovered, "recovered", {
        detail: recoveryReason,
        metadata: { choice, resumeStatus: recovered.status },
      });
      if (recovered.status === "cancelled") {
        await emitSyncMilestone(paths, recovered, "cancelled", { detail: recoveryReason });
        return recovered;
      }
    } finally {
      store.db.close();
    }
    if (recovered!.status === "ingesting") return advance(paths, { ...body, actor: "operator", commandId }, recovered!.sync_id);
    if (recovered!.status === "reconciling") {
      const resumedStore = openState(paths.stateDir);
      try {
        const context = syncLeaseContext(paths, resumedStore, recovered!, deps);
        context.actor = "operator";
        recovered = await reconcileSync({
          context,
          syncId: recovered!.sync_id,
          expectedRevision: recovered!.revision,
          commandId,
        });
      } finally {
        resumedStore.db.close();
      }
      await emitSyncMilestone(paths, recovered!, "reconciling", { detail: "resumed after recovery" });
    }
    if (recovered!.status === "validating") {
      const resumedStore = openState(paths.stateDir);
      try {
        const context = syncLeaseContext(paths, resumedStore, recovered!, deps);
        context.actor = "operator";
        recovered = await validateSync(context, {
          syncId: recovered!.sync_id,
          expectedRevision: recovered!.revision,
          commandId,
          validate: deps.validate,
        });
      } finally {
        resumedStore.db.close();
      }
      if (recovered!.status === "validated") await emitSyncMilestone(paths, recovered!, "validated");
    }
    if (recovered!.status === "publishing") {
      const resumedStore = openState(paths.stateDir);
      try {
        recovered = await continueSyncPublication({
          context: syncLeaseContext(paths, resumedStore, recovered!, deps),
          syncId: recovered!.sync_id,
          expectedRevision: recovered!.revision,
          commandId,
          actor: "operator",
        });
      } finally {
        resumedStore.db.close();
      }
      await emitSyncMilestone(paths, recovered!, "publishing", { detail: "resumed after recovery" });
      if (recovered!.status === "published") {
        await emitSyncMilestone(paths, recovered!, "published", {
          detail: recovered!.publication?.new_head ?? null,
        });
      }
    }
    await emitSettledMilestone(paths, recovered!);
    return recovered!;
  }

  function action(body: Record<string, unknown>, actionId: SyncActionId): SyncActionProjection {
    const paths = deps.resolveDashboardGame(body, { useDefaultGame: true });
    const gameId = requiredGameId(paths, body);
    const store = openState(paths.stateDir);
    try {
      return gameSyncAction(
        store,
        gameId,
        actionId,
        text(body.syncId, text(body.sync_id)) || undefined,
        syncActionOptions(paths, deps),
      );
    } finally {
      store.db.close();
    }
  }

  async function reconcileStartup(body: Record<string, unknown> = {}): Promise<SyncState | null> {
    const paths = deps.resolveDashboardGame(body, { useDefaultGame: true });
    const gameId = paths.game?.gameId ?? text(body.gameId, text(body.game_id));
    if (!gameId) return null;
    const store = openState(paths.stateDir);
    try {
      const sync = getNonTerminalSyncForGame(store, gameId);
      if (!sync || sync.status !== "publishing") return sync;
      const reconciled = await reconcileInterruptedSyncPublication({
        context: syncLeaseContext(paths, store, sync, deps),
        syncId: sync.sync_id,
        commandId: `command-sync-startup-reconcile-${randomUUID()}`,
      });
      if (reconciled.status === "published") {
        await emitSyncMilestone(paths, reconciled, "published", {
          detail: "interrupted publication reconciled at startup",
        });
      }
      await emitSettledMilestone(paths, reconciled);
      return reconciled;
    } finally {
      store.db.close();
    }
  }

  return {
    action,
    advance,
    cancel,
    observe,
    publish,
    reconcileStartup,
    recover,
    refreshObservation,
    resolveConflict,
    start,
  };
}
