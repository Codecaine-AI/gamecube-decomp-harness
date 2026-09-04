import { globalStandardsContext } from "@server/core/knowledge";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { appendFile, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { librarianV2Prompt } from "@server/core/agent-catalog/agents/knowledge/librarian-v2";
import type { GlobalArgs } from "@server/core/game-registry/runtime-options.js";
import { runMeleeKernelPiAgent as runPiAgent } from "@server/infrastructure/agent-runtime/kernel-pi-runner";
import { parseJsonObject } from "@server/infrastructure/agent-runtime/runtime";
import { createMeleeKernelSpawnContext } from "@server/infrastructure/kernel/bridge/spawn-context";
import {
  applyLibrarianPass,
  createSharedGate,
  type ApplyItemResult,
  type ApplyReport,
  type SharedGate,
} from "../apply/index.js";
import { librarianStandardsView, type LibrarianPassEnvelope } from "../backfill/runner.js";
import {
  flagCodeDrift,
  type DriftReport,
  type FlagCodeDriftOptions,
} from "../drift/flagger.js";
import {
  claimIndexTask,
  completeIndexTask,
  enqueueIndexTask,
  releaseIndexTask,
  stampSubjectIndexed,
  type KnowledgeStoreHandle,
  type SubjectRef,
} from "../records/index.js";
import { immediateTransaction } from "../storage/transaction.js";
import {
  buildTaskContext,
  parseSlicePayload,
  splitSlicePayload,
  type LibrarianPathway,
  type LibrarianTaskContext,
  type LibrarianTaskRow,
} from "./context.js";

const DEFAULT_CONCURRENCY = 4;
const DEFAULT_TIMEOUT_MS = 900_000;
const MAX_CONSECUTIVE_FAILURES = 5;
const CLAIM_CANDIDATE_BATCH = 64;
const PR_IMPORTED_CHILD_SIZE = 24;
const DRIFT_RECHECK_CHILD_SIZE = 12;

export const LIBRARIAN_PATHWAYS: readonly LibrarianPathway[] = [
  "run_closed",
  "regression",
  "pr_imported",
  "archival_ingest",
  "drift_recheck",
];

/**
 * Claim order: per-target pathways first (a worker may be waiting on them), then imported PRs,
 * then archival slices, then drift rechecks. FIFO within a pathway.
 */
const PATHWAY_RANK: Record<LibrarianPathway, number> = {
  run_closed: 0,
  regression: 0,
  pr_imported: 1,
  archival_ingest: 2,
  drift_recheck: 3,
};

export interface LibrarianPassTimings {
  startedAt: string;
  endedAt: string;
  contextMs: number;
  modelMs: number;
  applyMs: number;
  wallMs: number;
}

export interface LibrarianPassArtifact {
  run_id: string;
  task: LibrarianTaskRow;
  context: LibrarianTaskContext;
  proposal: LibrarianPassEnvelope;
  apply_report: ApplyReport;
  timings: LibrarianPassTimings;
  model: string;
  dry_run: boolean;
  drift_gate: LibrarianDriftGateResult;
  validation_gate: LibrarianValidationGateResult;
  validation_rejections?: LibrarianValidationRejection[];
  retry_proposal?: LibrarianPassEnvelope;
  follow_ups_enqueued?: string[];
  follow_ups_projected?: string[];
  remaining_drift?: LibrarianRemainingDrift[];
  drift_attempts?: number;
  warning?: string;
}

export type LibrarianDriftGateResult = "skipped" | "clean" | "released" | "warned";
export type LibrarianValidationGateResult = "clean" | "retried" | "warned";

export type LibrarianValidationRejection =
  | Pick<Extract<ApplyItemResult, { action: "rejected" }>, "index" | "itemKind" | "item" | "reason" | "message">
  | ApplyReport["envelope_rejections"][number];

export type LibrarianRemainingDrift = (
  | { target_id: string }
  | { entity_id: string }
) & {
  drifted: number;
  unresolvable: number;
};

export interface LibrarianPassResult {
  task: LibrarianTaskRow;
  context: LibrarianTaskContext;
  proposal: LibrarianPassEnvelope;
  applyReport: ApplyReport;
  timings: LibrarianPassTimings;
  artifactPath: string;
  stamped: { targetIds: string[]; entityIds: string[] };
  driftGate: LibrarianDriftGateResult;
  validationGate: LibrarianValidationGateResult;
  followUpsEnqueued: string[];
}

export interface LibrarianRunLog {
  append(entry: Record<string, unknown>): Promise<void>;
}

export interface LibrarianPassDeps {
  runId: string;
  globals: GlobalArgs;
  sharedWriteGate: SharedGate;
  dryRun?: boolean;
  checkoutRoot?: string;
  prsRoot?: string;
  timeoutMs?: number;
  runPiAgent?: typeof runPiAgent;
  flagCodeDrift?: (
    store: KnowledgeStoreHandle,
    options: FlagCodeDriftOptions,
  ) => DriftReport;
  runLog?: LibrarianRunLog;
  now?: () => string;
  clockMs?: () => number;
}

export interface LibrarianRunOptions {
  runId: string;
  globals: GlobalArgs;
  limit?: number;
  concurrency?: number;
  pathway?: LibrarianPathway;
  taskId?: string;
  exclude?: Iterable<string>;
  signal?: AbortSignal;
  shouldClaim?: () => boolean;
  quiet?: boolean;
  dryRun?: boolean;
  stopFile?: string;
  checkoutRoot?: string;
  prsRoot?: string;
  timeoutMs?: number;
  runPiAgent?: typeof runPiAgent;
  flagCodeDrift?: LibrarianPassDeps["flagCodeDrift"];
  now?: () => string;
  clockMs?: () => number;
}

export interface LibrarianDurationSummary {
  min: number;
  max: number;
  mean: number;
  p50: number;
}

export interface LibrarianSummary {
  runId: string;
  dryRun: boolean;
  pathway: LibrarianPathway | null;
  passesRun: number;
  passesApplied: number;
  itemsApplied: number;
  itemsRejected: number;
  itemsSkipped: number;
  passesFailed: number;
  passesAbandoned?: number;
  failedTaskIds: string[];
  tasksSplit: number;
  childrenEnqueued: number;
  driftGates?: Record<LibrarianDriftGateResult, number>;
  validationGates?: Record<LibrarianValidationGateResult, number>;
  followUpsEnqueued?: number;
  tasksRemaining: number;
  aborted: boolean;
  stopped: boolean;
  paused: boolean;
  wallMs: number;
  perPassMs: LibrarianDurationSummary;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function taskSlug(taskId: string): string {
  return taskId.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

export function librarianRunDirectory(stateDir: string, runId: string): string {
  return resolve(stateDir, "knowledge_v2", "librarian", runId);
}

export function librarianStopFile(stateDir: string, runId: string): string {
  return resolve(stateDir, "knowledge_v2", "librarian", `${runId}.stop`);
}

export function createLibrarianRunLog(path: string): LibrarianRunLog {
  let tail: Promise<void> = Promise.resolve();
  return {
    append(entry): Promise<void> {
      const line = `${JSON.stringify(entry)}\n`;
      const result = tail.then(async () => {
        await mkdir(resolve(path, ".."), { recursive: true });
        await appendFile(path, line, "utf8");
      });
      tail = result.catch(() => undefined);
      return result;
    },
  };
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function plainRecord(value: unknown): value is Record<string, unknown> {
  if (!record(value)) return false;
  const prototype = Object.getPrototypeOf(value) as unknown;
  return prototype === Object.prototype || prototype === null;
}

function truncateArtifactStrings<T>(value: T): T {
  if (typeof value === "string") {
    if (value.length <= 20_000) return value;
    return `${value.slice(0, 20_000)}[truncated, original ${value.length} chars]` as T;
  }
  if (Array.isArray(value)) {
    return value.map((item) => truncateArtifactStrings(item)) as T;
  }
  if (plainRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, truncateArtifactStrings(item)]),
    ) as T;
  }
  return value;
}

function validateEnvelope(value: Record<string, unknown>): LibrarianPassEnvelope {
  if (!Array.isArray(value.facts)
    || !Array.isArray(value.links)
    || !Array.isArray(value.entities)
    || !Array.isArray(value.merges)) {
    throw new Error("librarian-v2 returned a malformed librarian_pass_v1 envelope");
  }
  return value as unknown as LibrarianPassEnvelope;
}

function contextFailure(context: LibrarianTaskContext): string | null {
  if (context.touched.length > 0) return null;
  if (record(context.object) && typeof context.object.error === "string") return context.object.error;
  return null;
}

async function modelProposal(
  task: LibrarianTaskRow,
  context: LibrarianTaskContext,
  deps: LibrarianPassDeps,
  outputDir: string,
  retry?: { previous_proposal: LibrarianPassEnvelope; rejections: LibrarianValidationRejection[] },
): Promise<LibrarianPassEnvelope> {
  const timeoutMs = deps.timeoutMs
    ?? (deps.globals.agentTimeoutSeconds || DEFAULT_TIMEOUT_MS / 1_000) * 1_000;
  await mkdir(outputDir, { recursive: true });
  const modelRun = (deps.runPiAgent ?? runPiAgent)({
    role: "librarian",
    catalogAgentId: "librarian-v2",
    // The consumer pass reads and proposes; it never edits code and must cite only V2 locators.
    // The librarian profile is the allow-list for V2 research tools and the code graph.
    cwd: deps.globals.repoRoot,
    prompt: librarianV2Prompt({
      task: {
        run_id: deps.runId,
        ...context.task,
        ...(context.omitted === undefined ? {} : { omitted: context.omitted }),
      },
      object: context.object,
      touchedSubjects: context.touched,
      supportingSubjects: context.supporting,
      decompStandards: librarianStandardsView(globalStandardsContext()),
      headRevision: context.head_revision,
      ...(retry === undefined ? {} : { retry }),
      repoRoot: deps.globals.repoRoot,
      stateDir: deps.globals.stateDir,
      game: deps.globals.game,
    }),
    outputDir,
    dryRun: deps.globals.dryRunAgents,
    provider: deps.globals.provider,
    model: deps.globals.model,
    thinkingLevel: deps.globals.thinkingLevel,
    timeoutMs,
    toolContext: {
      repoRoot: deps.globals.repoRoot,
      stateDir: deps.globals.stateDir,
      game: deps.globals.game,
    },
    kernelContext: createMeleeKernelSpawnContext({
      kind: "knowledge-curation",
      gameId: deps.globals.game?.gameId ?? deps.globals.gameId,
      sessionId: deps.runId,
      runId: deps.runId,
      jobId: `kg2-librarian:${deps.runId}:${task.id}`,
      jobKind: "Librarian",
      itemId: task.id,
      phase: "knowledge-curation",
      workingDir: deps.globals.repoRoot,
      metadata: { taskId: task.id, pathway: task.pathway },
    }),
  });
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = Symbol("kg2-librarian-timeout");
  const result = await Promise.race([
    modelRun,
    new Promise<typeof deadline>((resolveDeadline) => {
      timer = setTimeout(() => resolveDeadline(deadline), timeoutMs);
    }),
  ]).finally(() => {
    if (timer !== undefined) clearTimeout(timer);
  });
  if (result === deadline) {
    void modelRun.catch(() => undefined);
    throw new Error(`librarian-v2 timed out after ${timeoutMs}ms`);
  }
  if (result.failed || result.providerError || result.dryRun) {
    throw new Error(result.error ?? result.providerError ?? "librarian-v2 did not produce proposal output");
  }
  const parsed = parseJsonObject(result.rawText);
  if (parsed.object === null) {
    throw new Error(parsed.error ?? "librarian-v2 output was not JSON");
  }
  return validateEnvelope(parsed.object);
}

function validationRejections(report: ApplyReport): LibrarianValidationRejection[] {
  const rejectedItems: LibrarianValidationRejection[] = [
    ...report.items,
    ...report.follow_ups,
  ].flatMap((item) => item.action === "rejected" ? [{
    index: item.index,
    itemKind: item.itemKind,
    item: item.item,
    reason: item.reason,
    message: item.message,
  }] : []);
  return [...rejectedItems, ...report.envelope_rejections];
}

function renamedSubjects(context: LibrarianTaskContext): string[] {
  return context.touched.flatMap((subject) =>
    subject.kind === "target" && subject.renamed_from.length > 0
      ? [subject.target_stable_key]
      : []);
}

function driftedFacts(context: LibrarianTaskContext) {
  return context.touched.flatMap((subject) => {
    const subjectKey = subject.kind === "target"
      ? subject.target_stable_key
      : subject.entity_locator;
    return subject.drift?.evidence.flatMap((entry) =>
      entry.status === "drifted" || entry.status === "unresolvable"
        ? [{ subject: subjectKey, type: entry.fact_type }]
        : []) ?? [];
  });
}

function hasPendingDriftRecheck(store: KnowledgeStoreHandle, subject: SubjectRef): boolean {
  const key = subject.targetId !== undefined ? "target_id" : "entity_id";
  const value = subject.targetId ?? subject.entityId;
  return store.db.query<{ found: number }, [string]>(`
    SELECT 1 AS found
    FROM index_task
    WHERE pathway = 'drift_recheck'
      AND done_at IS NULL
      AND CASE WHEN json_valid(payload)
        THEN COALESCE(
          json_extract(payload, '$.${key}'),
          json_extract(payload, '$.task_payload.${key}')
        )
      END = ?
    LIMIT 1
  `).get(value) !== null;
}

function enqueueFollowUps(
  store: KnowledgeStoreHandle,
  task: LibrarianTaskRow,
  report: ApplyReport,
  enqueuedAt: string,
  dryRun: boolean,
): string[] {
  const taskIds: string[] = [];
  for (const result of report.follow_ups) {
    if (result.action !== "applied" || result.subject === undefined || !record(result.item)) continue;
    const subject: SubjectRef = "targetId" in result.subject
      ? { targetId: result.subject.targetId }
      : { entityId: result.subject.entityId };
    const why = String(result.item.why ?? "");
    const enqueued = immediateTransaction(store.db, () => {
      if (hasPendingDriftRecheck(store, subject)) return false;
      const id = `task:drift_recheck:${randomUUID()}`;
      taskIds.push(id);
      if (!dryRun) {
        enqueueIndexTask(store, {
          id,
          pathway: "drift_recheck",
          payload: JSON.stringify({
            ...(subject.targetId !== undefined
              ? { target_id: subject.targetId }
              : { entity_id: subject.entityId }),
            reason: `follow_up: ${why}`,
            requested_by_task: task.id,
          }),
          enqueuedAt,
        });
      }
      return true;
    });
    if (!enqueued) taskIds.pop();
  }
  return taskIds;
}

function subjectLocatorsFromAppliedItems(items: ApplyItemResult[]): {
  entityLocators: Set<string>;
  targetStableKeys: Set<string>;
} {
  const entityLocators = new Set<string>();
  const targetStableKeys = new Set<string>();
  const addSubject = (value: unknown): void => {
    if (!record(value)) return;
    if (typeof value.entity_locator === "string") entityLocators.add(value.entity_locator);
    if (typeof value.target_stable_key === "string") targetStableKeys.add(value.target_stable_key);
  };
  for (const result of items) {
    if (result.action !== "applied" || !record(result.item)) continue;
    if (result.itemKind === "fact") addSubject(result.item.subject);
    else if (result.itemKind === "link") {
      addSubject(result.item.from);
      addSubject(result.item.to);
    }
  }
  return { entityLocators, targetStableKeys };
}

/**
 * Every touched target was judged by the pass and is stamped (the backfill convention); a touched
 * entity is stamped only when the pass actually wrote a fact or link on it.
 */
function stampTouchedSubjects(
  store: KnowledgeStoreHandle,
  context: LibrarianTaskContext,
  report: ApplyReport,
  indexedAt: string,
): { targetIds: string[]; entityIds: string[] } {
  const applied = subjectLocatorsFromAppliedItems(report.items);
  const targetIds: string[] = [];
  const entityIds: string[] = [];
  const entityByLocator = store.db.query<{ id: string }, [string]>(`
    SELECT id FROM entity WHERE locator = ? AND merged_into_id IS NULL ORDER BY id
  `);
  for (const subject of context.touched) {
    if (subject.kind === "target") {
      stampSubjectIndexed(store, { targetId: subject.detail.id }, indexedAt);
      targetIds.push(subject.detail.id);
      continue;
    }
    if (!applied.entityLocators.has(subject.entity_locator)) continue;
    for (const { id } of entityByLocator.all(subject.entity_locator)) {
      stampSubjectIndexed(store, { entityId: id }, indexedAt);
      entityIds.push(id);
    }
  }
  return { targetIds, entityIds };
}

function touchedSubjectRef(subject: LibrarianTaskContext["touched"][number]): SubjectRef {
  if (subject.kind === "target") return { targetId: subject.detail.id };
  const identity = subject.record.subject;
  if (identity?.subjectKind !== "entity") {
    throw new Error(`Touched entity record is missing its identity: ${subject.entity_locator}`);
  }
  return { entityId: identity.id };
}

function remainingDriftAfterPass(
  store: KnowledgeStoreHandle,
  context: LibrarianTaskContext,
  checkoutRoot: string,
  driftFlagger: NonNullable<LibrarianPassDeps["flagCodeDrift"]>,
): LibrarianRemainingDrift[] {
  return context.touched.flatMap((subject) => {
    const subjectRef = touchedSubjectRef(subject);
    const report = driftFlagger(store, { subject: subjectRef, checkoutRoot });
    if (report.drifted_count + report.unresolvable_count === 0) return [];
    return [{
      ...(subjectRef.targetId !== undefined
        ? { target_id: subjectRef.targetId }
        : { entity_id: subjectRef.entityId }),
      drifted: report.drifted_count,
      unresolvable: report.unresolvable_count,
    }];
  });
}

interface RetryPayloadState {
  taskPayload: unknown;
  driftAttempts: number;
  failureCount: number;
  lastError?: string;
}

function retryPayloadState(payload: string): RetryPayloadState {
  let parsed: unknown;
  try {
    parsed = JSON.parse(payload) as unknown;
  } catch {
    return { taskPayload: payload, driftAttempts: 0, failureCount: 0 };
  }
  if (record(parsed) && Object.hasOwn(parsed, "task_payload")) {
    return {
      taskPayload: parsed.task_payload,
      driftAttempts: Number.isSafeInteger(parsed.drift_attempts)
        && (parsed.drift_attempts as number) >= 0
        ? parsed.drift_attempts as number
        : 0,
      failureCount: Number.isSafeInteger(parsed.failure_count)
        && (parsed.failure_count as number) >= 0
        ? parsed.failure_count as number
        : 0,
      ...(typeof parsed.last_error === "string" ? { lastError: parsed.last_error } : {}),
    };
  }
  return { taskPayload: parsed, driftAttempts: 0, failureCount: 0 };
}

function retryPayload(state: RetryPayloadState): string {
  return JSON.stringify({
    task_payload: state.taskPayload,
    ...(state.driftAttempts > 0 ? { drift_attempts: state.driftAttempts } : {}),
    ...(state.failureCount > 0 ? { failure_count: state.failureCount } : {}),
    ...(state.lastError === undefined ? {} : { last_error: state.lastError }),
  });
}

function persistDriftAttempt(
  store: KnowledgeStoreHandle,
  task: LibrarianTaskRow,
): number {
  const state = retryPayloadState(task.payload);
  const driftAttempts = state.driftAttempts + 1;
  store.db.query(`UPDATE index_task
    SET payload = ?
    WHERE id = ? AND started_at IS NOT NULL AND done_at IS NULL`).run(
    retryPayload({ ...state, driftAttempts }),
    task.id,
  );
  return driftAttempts;
}

function persistFinalDriftGate(
  store: KnowledgeStoreHandle,
  task: LibrarianTaskRow,
  driftGate: "warned" | "clean" | "skipped",
): void {
  const current = store.db.query<{ payload: string }, [string]>(
    "SELECT payload FROM index_task WHERE id = ?",
  ).get(task.id)?.payload ?? task.payload;
  const state = retryPayloadState(current);
  store.db.query(`UPDATE index_task
    SET payload = ?
    WHERE id = ? AND started_at IS NOT NULL AND done_at IS NULL`).run(
    JSON.stringify({
      task_payload: state.taskPayload,
      ...(state.driftAttempts > 0 ? { drift_attempts: state.driftAttempts } : {}),
      ...(state.failureCount > 0 ? { failure_count: state.failureCount } : {}),
      ...(state.lastError === undefined ? {} : { last_error: state.lastError }),
      drift_gate: driftGate,
    }),
    task.id,
  );
}

function persistTaskFailure(
  store: KnowledgeStoreHandle,
  task: LibrarianTaskRow,
  error: string,
): number {
  const current = store.db.query<{ payload: string }, [string]>(
    "SELECT payload FROM index_task WHERE id = ?",
  ).get(task.id)?.payload ?? task.payload;
  const state = retryPayloadState(current);
  const failureCount = state.failureCount + 1;
  store.db.query(`UPDATE index_task
    SET payload = ?
    WHERE id = ? AND started_at IS NOT NULL AND done_at IS NULL`).run(
    retryPayload({ ...state, failureCount, lastError: error }),
    task.id,
  );
  return failureCount;
}

export async function runLibrarianPass(
  store: KnowledgeStoreHandle,
  task: LibrarianTaskRow,
  deps: LibrarianPassDeps,
): Promise<LibrarianPassResult> {
  const clockMs = deps.clockMs ?? Date.now;
  const now = deps.now ?? (() => new Date().toISOString());
  const startedMs = clockMs();
  const startedAt = now();
  const directory = librarianRunDirectory(deps.globals.stateDir, deps.runId);
  const slug = taskSlug(task.id);
  const artifactPath = resolve(directory, `${slug}.json`);
  const runLog = deps.runLog ?? createLibrarianRunLog(resolve(directory, "run-log.jsonl"));
  const dryRun = deps.dryRun === true;
  let contextMs = 0;
  let modelMs = 0;
  let applyMs = 0;
  try {
    const contextStarted = clockMs();
    const context = buildTaskContext(store, task, {
      checkoutRoot: deps.checkoutRoot ?? deps.globals.repoRoot,
      graphDbPath: deps.globals.graphDbPath,
      ...(deps.prsRoot === undefined ? {} : { prsRoot: deps.prsRoot }),
    });
    contextMs = clockMs() - contextStarted;
    const failure = contextFailure(context);
    if (failure !== null) throw new Error(`context assembly failed: ${failure}`);
    let requiredCitation: { kind: "pr"; prNumber: string } | undefined;
    if (task.pathway === "pr_imported") {
      if (!record(context.object)
        || typeof context.object.pr_number !== "number"
        || !Number.isSafeInteger(context.object.pr_number)) {
        throw new Error("pr_imported context is missing a valid pr_number");
      }
      requiredCitation = { kind: "pr", prNumber: String(context.object.pr_number) };
    }

    const modelStarted = clockMs();
    const firstProposal = await modelProposal(
      task,
      context,
      deps,
      resolve(directory, "agent-output", slug),
    );
    modelMs = clockMs() - modelStarted;

    const indexedAt = now();
    const baseApplyOptions = {
      scope: context.scope,
      sharedWriteGate: deps.sharedWriteGate,
      checkoutRoot: deps.checkoutRoot ?? deps.globals.repoRoot,
      prsRoot: deps.prsRoot,
      headRevision: context.head_revision,
      renamedSubjects: renamedSubjects(context),
      driftedFacts: driftedFacts(context),
      now: () => indexedAt,
      ...(requiredCitation === undefined ? {} : { requiredCitation }),
    };
    let validationStarted = clockMs();
    const validationReport = await applyLibrarianPass(store, firstProposal, {
      ...baseApplyOptions,
      dryRun: true,
    });
    applyMs += clockMs() - validationStarted;
    const firstRejections = validationRejections(validationReport);
    let proposal = firstProposal;
    let retryProposal: LibrarianPassEnvelope | undefined;
    if (firstRejections.length > 0) {
      const retryStarted = clockMs();
      retryProposal = await modelProposal(
        task,
        context,
        deps,
        resolve(directory, "agent-output", slug, "retry"),
        { previous_proposal: firstProposal, rejections: firstRejections },
      );
      modelMs += clockMs() - retryStarted;
      proposal = retryProposal;
    }

    const applyStarted = clockMs();
    const applyReport = await applyLibrarianPass(store, proposal, {
      ...baseApplyOptions,
      dryRun,
    });
    applyMs += clockMs() - applyStarted;
    const remainingValidationRejections = validationRejections(applyReport);
    const validationGate: LibrarianValidationGateResult = firstRejections.length === 0
      ? "clean"
      : remainingValidationRejections.length === 0 ? "retried" : "warned";
    if (validationGate === "warned") {
      console.warn(
        `kg2-librarian: task ${task.id} still has validation rejections after retry: ${remainingValidationRejections.map(({ reason }) => reason).join(", ")}`,
      );
    }
    const followUpTaskIds = enqueueFollowUps(store, task, applyReport, indexedAt, dryRun);
    let stamped = { targetIds: [] as string[], entityIds: [] as string[] };
    let remainingDrift: LibrarianRemainingDrift[] | undefined;
    let driftAttempts: number | undefined;
    let warning: string | undefined;
    let driftGate: LibrarianDriftGateResult = "skipped";
    let claim: "released" | "completed";
    if (dryRun) {
      releaseIndexTask(store, task.id);
      claim = "released";
    } else if (!context.drift_gate) {
      stamped = stampTouchedSubjects(store, context, applyReport, indexedAt);
      persistFinalDriftGate(store, task, "skipped");
      completeIndexTask(store, task.id, indexedAt);
      claim = "completed";
    } else {
      remainingDrift = remainingDriftAfterPass(
        store,
        context,
        deps.checkoutRoot ?? deps.globals.repoRoot,
        deps.flagCodeDrift ?? flagCodeDrift,
      );
      if (remainingDrift.length > 0) {
        driftAttempts = persistDriftAttempt(store, task);
      }
      if (remainingDrift.length > 0 && driftAttempts === 1) {
        releaseIndexTask(store, task.id);
        claim = "released";
        driftGate = "released";
      } else {
        stamped = stampTouchedSubjects(store, context, applyReport, indexedAt);
        claim = "completed";
        if (remainingDrift.length > 0) {
          warning = "drift left unresolved after retry";
          driftGate = "warned";
          console.warn(warning);
        } else {
          driftGate = "clean";
        }
        persistFinalDriftGate(store, task, driftGate);
        completeIndexTask(store, task.id, indexedAt);
      }
    }
    const endedAt = now();
    const timings: LibrarianPassTimings = {
      startedAt,
      endedAt,
      contextMs,
      modelMs,
      applyMs,
      wallMs: clockMs() - startedMs,
    };
    const artifact: LibrarianPassArtifact = {
      run_id: deps.runId,
      task,
      context: truncateArtifactStrings(context),
      proposal,
      apply_report: applyReport,
      timings,
      model: deps.globals.model,
      dry_run: dryRun,
      drift_gate: driftGate,
      validation_gate: validationGate,
      ...(firstRejections.length === 0 ? {} : { validation_rejections: firstRejections }),
      ...(retryProposal === undefined ? {} : { retry_proposal: retryProposal }),
      ...(dryRun
        ? { follow_ups_projected: followUpTaskIds }
        : { follow_ups_enqueued: followUpTaskIds }),
      ...(remainingDrift === undefined || remainingDrift.length === 0
        ? {}
        : { remaining_drift: remainingDrift }),
      ...(driftAttempts === undefined ? {} : { drift_attempts: driftAttempts }),
      ...(warning === undefined ? {} : { warning }),
    };
    await mkdir(directory, { recursive: true });
    await writeFile(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
    await runLog.append({
      run_id: deps.runId,
      task_id: task.id,
      pathway: task.pathway,
      status: claim === "released" && remainingDrift !== undefined && remainingDrift.length > 0
        ? "drift_remaining"
        : "completed",
      dry_run: dryRun,
      drift_gate: driftGate,
      validation_gate: validationGate,
      ...(firstRejections.length === 0 ? {} : { validation_rejections: firstRejections }),
      ...(retryProposal === undefined ? {} : { retry_proposal: retryProposal }),
      ...(dryRun
        ? { follow_ups_projected: followUpTaskIds }
        : { follow_ups_enqueued: followUpTaskIds }),
      claim,
      stamped,
      apply_report: applyReport,
      ...(remainingDrift === undefined || remainingDrift.length === 0
        ? {}
        : { remaining_drift: remainingDrift }),
      ...(driftAttempts === undefined ? {} : { drift_attempts: driftAttempts }),
      ...(warning === undefined ? {} : { warning }),
      timings,
      artifact_path: artifactPath,
    });
    return {
      task,
      context,
      proposal,
      applyReport,
      timings,
      artifactPath,
      stamped,
      driftGate,
      validationGate,
      followUpsEnqueued: dryRun ? [] : followUpTaskIds,
    };
  } catch (error) {
    const message = errorMessage(error);
    const failureCount = dryRun ? retryPayloadState(task.payload).failureCount : persistTaskFailure(store, task, message);
    await runLog.append({
      run_id: deps.runId,
      task_id: task.id,
      pathway: task.pathway,
      status: "failed",
      dry_run: dryRun,
      claim: "released",
      error: message,
      failure_count: failureCount,
      timings: {
        startedAt,
        endedAt: now(),
        contextMs,
        modelMs,
        applyMs,
        wallMs: clockMs() - startedMs,
      },
    });
    releaseIndexTask(store, task.id);
    throw error;
  }
}

interface ClaimResult {
  task: LibrarianTaskRow;
  split?: {
    children: string[];
    enqueued: boolean;
    childPayloads: string[];
    reason?: "split_after_failures";
  };
  abandoned?: { failureCount: number; lastError: string; warning: string };
}

function queuedCandidates(
  store: KnowledgeStoreHandle,
  pathway: LibrarianPathway | undefined,
  taskId: string | undefined,
  exclude: ReadonlySet<string>,
): LibrarianTaskRow[] {
  const excluded = [...exclude];
  const placeholders = excluded.map(() => "?").join(", ");
  const conditions = [
    "started_at IS NULL",
    "done_at IS NULL",
    ...(pathway === undefined ? [] : ["pathway = ?"]),
    ...(taskId === undefined ? [] : ["id = ?"]),
    ...(excluded.length === 0 ? [] : [`id NOT IN (${placeholders})`]),
  ];
  return store.db.query<LibrarianTaskRow, Array<string | number>>(`
    SELECT id, pathway, payload, enqueued_at, started_at, done_at
    FROM index_task
    WHERE ${conditions.join(" AND ")}
    ORDER BY
      CASE pathway
        WHEN 'run_closed' THEN ${PATHWAY_RANK.run_closed}
        WHEN 'regression' THEN ${PATHWAY_RANK.regression}
        WHEN 'pr_imported' THEN ${PATHWAY_RANK.pr_imported}
        WHEN 'archival_ingest' THEN ${PATHWAY_RANK.archival_ingest}
        WHEN 'drift_recheck' THEN ${PATHWAY_RANK.drift_recheck}
        ELSE 9
      END,
      enqueued_at,
      id
    LIMIT ?
  `).all(
    ...(pathway === undefined ? [] : [pathway]),
    ...(taskId === undefined ? [] : [taskId]),
    ...excluded,
    CLAIM_CANDIDATE_BATCH,
  );
}

export function countQueuedTasks(
  store: KnowledgeStoreHandle,
  pathway?: LibrarianPathway,
): number {
  const row = pathway === undefined
    ? store.db.query<{ count: number }, []>(
      "SELECT COUNT(*) AS count FROM index_task WHERE started_at IS NULL AND done_at IS NULL",
    ).get()
    : store.db.query<{ count: number }, [string]>(
      "SELECT COUNT(*) AS count FROM index_task WHERE started_at IS NULL AND done_at IS NULL AND pathway = ?",
    ).get(pathway);
  return row?.count ?? 0;
}

function finishTaskSplit(
  store: KnowledgeStoreHandle,
  task: LibrarianTaskRow,
  childPayloads: string[],
  doneAt: string,
  dryRun: boolean,
): ClaimResult["split"] {
  const width = String(childPayloads.length).length;
  const childIds = childPayloads.map((_, index) =>
    `${task.id}/${String(index + 1).padStart(width, "0")}`);
  if (dryRun) {
    releaseIndexTask(store, task.id);
    return { children: childIds, enqueued: false, childPayloads };
  }
  immediateTransaction(store.db, () => {
    childPayloads.forEach((payload, index) => {
      enqueueIndexTask(store, {
        id: childIds[index]!,
        pathway: task.pathway,
        payload,
        enqueuedAt: task.enqueued_at,
      });
    });
    completeIndexTask(store, task.id, doneAt);
  });
  return { children: childIds, enqueued: true, childPayloads };
}

function importedPrRowIds(payload: string): string[] | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(payload) as unknown;
  } catch {
    return null;
  }
  const value = record(parsed) && "task_payload" in parsed ? parsed.task_payload : parsed;
  if (!Array.isArray(value) || value.some((id) => typeof id !== "string")) return null;
  return value as string[];
}

function importedPrUnitSlug(id: string): { slug: string; target: boolean } | null {
  const marker = id.indexOf("--");
  if (marker < 0) return null;
  const suffix = id.slice(marker + 2);
  if (!suffix.startsWith("fn--")) return { slug: suffix, target: false };
  return { slug: suffix.slice(4).replace(/--[^-]+$/, ""), target: true };
}

function groupImportedPrRows(ids: string[]): string[][] {
  const unitSlugs = ids.flatMap((id) => {
    const parsed = importedPrUnitSlug(id);
    return parsed !== null && !parsed.target ? [parsed.slug] : [];
  }).sort((a, b) => b.length - a.length);
  const groups = new Map<string, string[]>();
  ids.forEach((id) => {
    const parsed = importedPrUnitSlug(id);
    const matchedUnit = parsed?.target === true
      ? unitSlugs.find((unit) => parsed.slug === unit || parsed.slug.startsWith(`${unit}-`))
      : parsed?.slug;
    const key = matchedUnit ?? id;
    const group = groups.get(key) ?? [];
    group.push(id);
    groups.set(key, group);
  });
  return [...groups.values()];
}

function packImportedPrRows(ids: string[]): string[][] {
  const chunks: string[][] = [];
  let chunk: string[] = [];
  for (const group of groupImportedPrRows(ids)) {
    if (group.length > PR_IMPORTED_CHILD_SIZE) {
      if (chunk.length > 0) chunks.push(chunk);
      chunk = [];
      for (let offset = 0; offset < group.length; offset += PR_IMPORTED_CHILD_SIZE) {
        chunks.push(group.slice(offset, offset + PR_IMPORTED_CHILD_SIZE));
      }
      continue;
    }
    if (chunk.length > 0 && chunk.length + group.length > PR_IMPORTED_CHILD_SIZE) {
      chunks.push(chunk);
      chunk = [];
    }
    chunk.push(...group);
  }
  if (chunk.length > 0) chunks.push(chunk);
  return chunks;
}

function batchedDriftPayload(payload: string): Record<string, unknown> | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(payload) as unknown;
  } catch {
    return null;
  }
  const value = record(parsed) && "task_payload" in parsed ? parsed.task_payload : parsed;
  if (!record(value)
    || typeof value.unit !== "string"
    || typeof value.unit_entity_id !== "string"
    || !Array.isArray(value.subjects)) {
    return null;
  }
  return value;
}

function archivalFailureHalves(
  store: KnowledgeStoreHandle,
  payload: string,
): unknown[] | null {
  const state = retryPayloadState(payload);
  const slice = parseSlicePayload(JSON.stringify(state.taskPayload));
  if (slice === null) return null;
  if (slice.source === "wiki") {
    if (slice.pages.length <= 1) return null;
    const middle = Math.ceil(slice.pages.length / 2);
    return [slice.pages.slice(0, middle), slice.pages.slice(middle)].map((pages) => ({ source: "wiki", pages }));
  }
  const ids = store.db.query<{ id: string }, [string, string]>(`
    SELECT id FROM discord_message
    WHERE CAST(id AS INTEGER) BETWEEN CAST(? AS INTEGER) AND CAST(? AS INTEGER)
    ORDER BY CAST(id AS INTEGER), id
  `).all(slice.from_id, slice.to_id).map(({ id }) => id);
  if (ids.length <= 1) return null;
  const middle = Math.ceil(ids.length / 2);
  return [ids.slice(0, middle), ids.slice(middle)].map((chunk) => ({
    source: "discord",
    channel_id: slice.channel_id,
    from_id: chunk[0]!,
    to_id: chunk.at(-1)!,
    count: chunk.length,
  }));
}

function splitAfterFailures(
  store: KnowledgeStoreHandle,
  task: LibrarianTaskRow,
  doneAt: string,
  dryRun: boolean,
): ClaimResult["split"] | null {
  const state = retryPayloadState(task.payload);
  if (state.failureCount < 2) return null;
  let halves: unknown[] | null = null;
  if (task.pathway === "drift_recheck") {
    const payload = batchedDriftPayload(task.payload);
    const subjects = payload?.subjects;
    if (payload !== null && Array.isArray(subjects) && subjects.length > 1) {
      const middle = Math.ceil(subjects.length / 2);
      halves = [subjects.slice(0, middle), subjects.slice(middle)].map((childSubjects) => ({
        ...payload,
        subjects: childSubjects,
      }));
    }
  } else if (task.pathway === "pr_imported") {
    const ids = importedPrRowIds(task.payload);
    if (ids !== null && ids.length > 1) {
      const middle = Math.ceil(ids.length / 2);
      halves = [ids.slice(0, middle), ids.slice(middle)];
    }
  } else if (task.pathway === "archival_ingest") {
    halves = archivalFailureHalves(store, task.payload);
  }
  if (halves === null) return null;
  const childPayloads = halves.map((taskPayload, index) => JSON.stringify({
    task_payload: taskPayload,
    failure_count: 0,
    split_from: task.id,
    split_index: index + 1,
    split_total: halves.length,
  }));
  const split = finishTaskSplit(store, task, childPayloads, doneAt, dryRun);
  if (split === undefined) throw new Error("failed to split librarian task after failures");
  return {
    ...split,
    reason: "split_after_failures",
  };
}

/** Split oversized archival, imported-PR, and batched drift tasks before any model pass. */
function splitOversizedTask(
  store: KnowledgeStoreHandle,
  task: LibrarianTaskRow,
  doneAt: string,
  dryRun: boolean,
): ClaimResult["split"] | null {
  if (task.pathway === "archival_ingest") {
    const slice = parseSlicePayload(JSON.stringify(retryPayloadState(task.payload).taskPayload));
    if (slice === null) return null;
    const children = splitSlicePayload(store, slice);
    return children.length === 0 ? null : finishTaskSplit(store, task, children, doneAt, dryRun);
  }
  if (task.pathway === "drift_recheck") {
    const payload = batchedDriftPayload(task.payload);
    const subjects = payload?.subjects;
    if (payload === null || !Array.isArray(subjects) || subjects.length <= DRIFT_RECHECK_CHILD_SIZE) return null;
    const chunks = Array.from(
      { length: Math.ceil(subjects.length / DRIFT_RECHECK_CHILD_SIZE) },
      (_, index) => subjects.slice(
        index * DRIFT_RECHECK_CHILD_SIZE,
        (index + 1) * DRIFT_RECHECK_CHILD_SIZE,
      ),
    );
    const childPayloads = chunks.map((childSubjects, index) => JSON.stringify({
      unit: payload.unit,
      unit_entity_id: payload.unit_entity_id,
      reason: payload.reason,
      subjects: childSubjects,
      split_from: task.id,
      split_index: index + 1,
      split_total: chunks.length,
    }));
    return finishTaskSplit(store, task, childPayloads, doneAt, dryRun);
  }
  if (task.pathway !== "pr_imported") return null;
  const ids = importedPrRowIds(task.payload);
  if (ids === null || ids.length <= PR_IMPORTED_CHILD_SIZE) return null;
  const chunks = packImportedPrRows(ids);
  const childPayloads = chunks.map((taskPayload, index) => JSON.stringify({
    task_payload: taskPayload,
    split_from: task.id,
    split_index: index + 1,
    split_total: chunks.length,
  }));
  return finishTaskSplit(store, task, childPayloads, doneAt, dryRun);
}

/**
 * Claim the next queued task in priority order. Returns the task to run, or a split record when the
 * claimed task was oversized. Real claims enqueue its children and complete it; dry-run claims
 * return the projected children and release it.
 */
export function claimNextLibrarianTask(
  store: KnowledgeStoreHandle,
  options: {
    pathway?: LibrarianPathway;
    taskId?: string;
    exclude?: ReadonlySet<string>;
    dryRun?: boolean;
    now?: () => string;
  } = {},
): ClaimResult | undefined {
  const now = options.now ?? (() => new Date().toISOString());
  const exclude = new Set(options.exclude ?? []);
  for (;;) {
    const candidates = queuedCandidates(store, options.pathway, options.taskId, exclude);
    if (candidates.length === 0) return undefined;
    for (const candidate of candidates) {
      const claimedAt = now();
      if (!claimIndexTask(store, candidate.id, claimedAt)) {
        exclude.add(candidate.id);
        continue;
      }
      const task: LibrarianTaskRow = { ...candidate, started_at: claimedAt };
      const failureState = retryPayloadState(task.payload);
      if (failureState.failureCount >= 2) {
        const failureSplit = splitAfterFailures(store, task, claimedAt, options.dryRun === true);
        if (failureSplit !== null) return { task, split: failureSplit };
        const lastError = failureState.lastError ?? "unknown error";
        const warning = `abandoned after ${failureState.failureCount} failures: ${lastError}`;
        if (options.dryRun === true) {
          releaseIndexTask(store, task.id);
        } else {
          completeIndexTask(store, task.id, claimedAt);
        }
        return {
          task,
          abandoned: { failureCount: failureState.failureCount, lastError, warning },
        };
      }
      const split = splitOversizedTask(store, task, claimedAt, options.dryRun === true);
      if (split === null) return { task };
      return { task, split };
    }
  }
}

function validateRunOptions(options: LibrarianRunOptions): void {
  if (options.runId.trim().length === 0) throw new Error("runId is required");
  const concurrency = options.concurrency ?? DEFAULT_CONCURRENCY;
  if (!Number.isSafeInteger(concurrency) || concurrency < 1) {
    throw new Error("concurrency must be a positive integer");
  }
  if (options.limit !== undefined && (!Number.isSafeInteger(options.limit) || options.limit < 0)) {
    throw new Error("limit must be a non-negative integer");
  }
  if (options.pathway !== undefined && !LIBRARIAN_PATHWAYS.includes(options.pathway)) {
    throw new Error(`unknown pathway: ${String(options.pathway)}`);
  }
}

function durationSummary(values: number[]): LibrarianDurationSummary {
  if (values.length === 0) return { min: 0, max: 0, mean: 0, p50: 0 };
  const sorted = [...values].sort((a, b) => a - b);
  const total = sorted.reduce((sum, value) => sum + value, 0);
  return {
    min: sorted[0]!,
    max: sorted.at(-1)!,
    mean: total / sorted.length,
    p50: sorted[Math.floor((sorted.length - 1) / 2)]!,
  };
}

export async function runLibrarianConsumer(
  store: KnowledgeStoreHandle,
  options: LibrarianRunOptions,
): Promise<LibrarianSummary> {
  validateRunOptions(options);
  const clockMs = options.clockMs ?? Date.now;
  const now = options.now ?? (() => new Date().toISOString());
  const startedMs = clockMs();
  const concurrency = options.concurrency ?? DEFAULT_CONCURRENCY;
  const dryRun = options.dryRun === true;
  const stopFile = options.stopFile ?? librarianStopFile(options.globals.stateDir, options.runId);
  const sharedWriteGate = createSharedGate();
  const runLog = createLibrarianRunLog(
    resolve(librarianRunDirectory(options.globals.stateDir, options.runId), "run-log.jsonl"),
  );

  // Tasks this run already touched: a released claim (dry run, failure) must not be re-claimed here.
  const seen = new Set(options.exclude ?? []);
  let claimedPasses = 0;
  let consecutiveFailures = 0;
  let aborted = false;
  let stopped = false;
  let paused = false;
  let selectedTaskClaimed = false;
  let selectorNotePrinted = false;
  let passesRun = 0;
  let passesApplied = 0;
  let itemsApplied = 0;
  let itemsRejected = 0;
  let itemsSkipped = 0;
  let passesFailed = 0;
  let passesAbandoned = 0;
  const failedTaskIds: string[] = [];
  let tasksSplit = 0;
  let childrenEnqueued = 0;
  const driftGates: Record<LibrarianDriftGateResult, number> = {
    skipped: 0,
    clean: 0,
    released: 0,
    warned: 0,
  };
  const validationGates: Record<LibrarianValidationGateResult, number> = {
    clean: 0,
    retried: 0,
    warned: 0,
  };
  let followUpsEnqueued = 0;
  const passDurations: number[] = [];

  const claim = async (): Promise<LibrarianTaskRow | undefined> => {
    for (;;) {
      if (aborted || stopped) return undefined;
      if (options.limit !== undefined && claimedPasses >= options.limit) return undefined;
      if (existsSync(stopFile)) {
        stopped = true;
        return undefined;
      }
      if (options.signal?.aborted === true) {
        stopped = true;
        return undefined;
      }
      if (options.shouldClaim !== undefined && !options.shouldClaim()) {
        paused = true;
        return undefined;
      }
      const claimed = claimNextLibrarianTask(store, {
        pathway: options.pathway,
        taskId: options.taskId,
        exclude: seen,
        dryRun,
        now,
      });
      if (claimed === undefined) {
        if (options.taskId !== undefined
          && !seen.has(options.taskId)
          && !selectedTaskClaimed
          && !selectorNotePrinted
          && !options.quiet) {
          selectorNotePrinted = true;
          console.error(`kg2-librarian: task ${options.taskId} is not queued (missing, claimed, or done)`);
        }
        return undefined;
      }
      selectedTaskClaimed = true;
      seen.add(claimed.task.id);
      if (claimed.abandoned !== undefined) {
        passesAbandoned += 1;
        const artifactPath = resolve(
          librarianRunDirectory(options.globals.stateDir, options.runId),
          `${taskSlug(claimed.task.id)}.json`,
        );
        const artifact = {
          run_id: options.runId,
          task: claimed.task,
          status: "abandoned",
          dry_run: dryRun,
          failure_count: claimed.abandoned.failureCount,
          last_error: claimed.abandoned.lastError,
          warning: claimed.abandoned.warning,
        };
        await mkdir(resolve(artifactPath, ".."), { recursive: true });
        await writeFile(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
        await runLog.append({
          run_id: options.runId,
          task_id: claimed.task.id,
          pathway: claimed.task.pathway,
          status: "abandoned",
          dry_run: dryRun,
          claim: dryRun ? "released" : "completed",
          failure_count: claimed.abandoned.failureCount,
          last_error: claimed.abandoned.lastError,
          warning: claimed.abandoned.warning,
          artifact_path: artifactPath,
        });
        continue;
      }
      if (claimed.split !== undefined) {
        tasksSplit += 1;
        if (claimed.split.enqueued) childrenEnqueued += claimed.split.children.length;
        const childCounts = claimed.split.childPayloads.map((payload) => {
          const parsed: unknown = JSON.parse(payload);
          if (!record(parsed)) return 0;
          if (Array.isArray(parsed.task_payload)) return parsed.task_payload.length;
          if (Array.isArray(parsed.subjects)) return parsed.subjects.length;
          if (parsed.source === "discord" && typeof parsed.count === "number") return parsed.count;
          if (parsed.source === "wiki" && Array.isArray(parsed.pages)) return parsed.pages.length;
          return 0;
        });
        await runLog.append({
          run_id: options.runId,
          task_id: claimed.task.id,
          pathway: claimed.task.pathway,
          status: "split",
          dry_run: dryRun,
          claim: claimed.split.enqueued ? "completed" : "released",
          note: claimed.split.reason === "split_after_failures"
            ? "split_after_failures"
            : claimed.task.pathway === "pr_imported"
            ? claimed.split.enqueued
              ? `oversized imported PR task split into ${claimed.split.children.length} child tasks; parent completed without a model pass`
              : `dry run: oversized imported PR task would split into ${claimed.split.children.length} child tasks; nothing enqueued, parent released`
            : claimed.task.pathway === "drift_recheck"
              ? claimed.split.enqueued
                ? `oversized batched drift task split into ${claimed.split.children.length} child tasks; parent completed without a model pass`
                : `dry run: oversized batched drift task would split into ${claimed.split.children.length} child tasks; nothing enqueued, parent released`
            : claimed.split.enqueued
              ? `oversized archival slice re-chunked into ${claimed.split.children.length} child tasks; parent completed without a model pass`
              : `dry run: oversized archival slice would be re-chunked into ${claimed.split.children.length} child tasks; nothing enqueued, parent released`,
          children: claimed.split.children,
          child_counts: childCounts,
        });
        continue;
      }
      claimedPasses += 1;
      return claimed.task;
    }
  };

  const lane = async (): Promise<void> => {
    for (;;) {
      const task = await claim();
      if (task === undefined) return;
      const passStarted = clockMs();
      passesRun += 1;
      try {
        const result = await runLibrarianPass(store, task, {
          runId: options.runId,
          globals: options.globals,
          sharedWriteGate,
          dryRun,
          checkoutRoot: options.checkoutRoot,
          prsRoot: options.prsRoot,
          timeoutMs: options.timeoutMs,
          runPiAgent: options.runPiAgent,
          flagCodeDrift: options.flagCodeDrift,
          runLog,
          now: options.now,
          clockMs: options.clockMs,
        });
        consecutiveFailures = 0;
        const counts = result.applyReport.counts;
        passesApplied += 1;
        itemsApplied += counts.applied;
        itemsRejected += counts.rejected;
        itemsSkipped += counts.skipped;
        driftGates[result.driftGate] += 1;
        validationGates[result.validationGate] += 1;
        followUpsEnqueued += result.followUpsEnqueued.length;
      } catch {
        passesFailed += 1;
        failedTaskIds.push(task.id);
        consecutiveFailures += 1;
        if (consecutiveFailures > MAX_CONSECUTIVE_FAILURES) aborted = true;
      } finally {
        passDurations.push(clockMs() - passStarted);
      }
    }
  };

  await Promise.all(Array.from({ length: concurrency }, () => lane()));
  const summary: LibrarianSummary = {
    runId: options.runId,
    dryRun,
    pathway: options.pathway ?? null,
    passesRun,
    passesApplied,
    itemsApplied,
    itemsRejected,
    itemsSkipped,
    passesFailed,
    passesAbandoned,
    failedTaskIds,
    tasksSplit,
    childrenEnqueued,
    driftGates,
    validationGates,
    followUpsEnqueued,
    tasksRemaining: countQueuedTasks(store, options.pathway),
    aborted,
    stopped,
    paused,
    wallMs: clockMs() - startedMs,
    perPassMs: durationSummary(passDurations),
  };
  if (!options.quiet) console.log(JSON.stringify(summary));
  return summary;
}
