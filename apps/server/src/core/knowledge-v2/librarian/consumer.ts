import { globalStandardsContext } from "@server/core/knowledge";
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
  remaining_drift?: LibrarianRemainingDrift[];
  drift_attempts?: number;
  warning?: string;
}

export type LibrarianDriftGateResult = "skipped" | "clean" | "released" | "warned";

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
  failedTaskIds: string[];
  tasksSplit: number;
  childrenEnqueued: number;
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
): Promise<LibrarianPassEnvelope> {
  const timeoutMs = deps.timeoutMs
    ?? (deps.globals.agentTimeoutSeconds || DEFAULT_TIMEOUT_MS / 1_000) * 1_000;
  await mkdir(outputDir, { recursive: true });
  const modelRun = (deps.runPiAgent ?? runPiAgent)({
    role: "librarian",
    catalogAgentId: "librarian-v2",
    // The consumer pass reads and proposes; it never edits code and must cite only V2 locators.
    // Same trim as the backfill pass: legacy search tools return uncitable material, standards are
    // injected in context, and lint has nothing to lint.
    toolProfile: {
      disable: [
        "ledger_search",
        "past_prs_search",
        "review_lint_scan",
      ],
    },
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

function retryPayloadState(payload: string): { taskPayload: unknown; driftAttempts: number } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(payload) as unknown;
  } catch {
    return { taskPayload: payload, driftAttempts: 0 };
  }
  if (record(parsed) && Object.hasOwn(parsed, "task_payload")) {
    return {
      taskPayload: parsed.task_payload,
      driftAttempts: Number.isSafeInteger(parsed.drift_attempts)
        && (parsed.drift_attempts as number) >= 0
        ? parsed.drift_attempts as number
        : 0,
    };
  }
  return { taskPayload: parsed, driftAttempts: 0 };
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
    JSON.stringify({ task_payload: state.taskPayload, drift_attempts: driftAttempts }),
    task.id,
  );
  return driftAttempts;
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
    const proposal = await modelProposal(
      task,
      context,
      deps,
      resolve(directory, "agent-output", slug),
    );
    modelMs = clockMs() - modelStarted;

    const applyStarted = clockMs();
    const indexedAt = now();
    const applyReport = await applyLibrarianPass(store, proposal, {
      scope: context.scope,
      sharedWriteGate: deps.sharedWriteGate,
      checkoutRoot: deps.checkoutRoot ?? deps.globals.repoRoot,
      prsRoot: deps.prsRoot,
      dryRun,
      now: () => indexedAt,
      ...(requiredCitation === undefined ? {} : { requiredCitation }),
    });
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
        completeIndexTask(store, task.id, indexedAt);
        claim = "completed";
        if (remainingDrift.length > 0) {
          warning = "drift left unresolved after retry";
          driftGate = "warned";
          console.warn(warning);
        } else {
          driftGate = "clean";
        }
      }
    }
    applyMs = clockMs() - applyStarted;

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
    return { task, context, proposal, applyReport, timings, artifactPath, stamped };
  } catch (error) {
    await runLog.append({
      run_id: deps.runId,
      task_id: task.id,
      pathway: task.pathway,
      status: "failed",
      dry_run: dryRun,
      claim: "released",
      error: errorMessage(error),
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
  split?: { children: string[]; enqueued: boolean; childPayloads: string[] };
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

/**
 * Split an oversized archival slice into bounded children that inherit the parent's queue position.
 * Real claims enqueue the children and complete the parent. Dry-run claims only compute the split
 * and release the parent.
 */
function splitOversizedSlice(
  store: KnowledgeStoreHandle,
  task: LibrarianTaskRow,
  doneAt: string,
  dryRun: boolean,
): ClaimResult["split"] | null {
  if (task.pathway !== "archival_ingest") return null;
  const slice = parseSlicePayload(task.payload);
  if (slice === null) return null;
  const children = splitSlicePayload(store, slice);
  if (children.length === 0) return null;
  const width = String(children.length).length;
  const childIds = children.map((_, index) =>
    `${task.id}/${String(index + 1).padStart(width, "0")}`);
  const childPayloads = [...children];
  if (dryRun) {
    releaseIndexTask(store, task.id);
    return { children: childIds, enqueued: false, childPayloads };
  }
  immediateTransaction(store.db, () => {
    children.forEach((payload, index) => {
      enqueueIndexTask(store, {
        id: childIds[index]!,
        pathway: "archival_ingest",
        payload,
        enqueuedAt: task.enqueued_at,
      });
    });
    completeIndexTask(store, task.id, doneAt);
  });
  return { children: childIds, enqueued: true, childPayloads };
}

/**
 * Claim the next queued task in priority order. Returns the task to run, or a split record when the
 * claimed task was an oversized archival slice. Real claims enqueue its children and complete it;
 * dry-run claims return the projected children and release it.
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
      const split = splitOversizedSlice(store, task, claimedAt, options.dryRun === true);
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
  const failedTaskIds: string[] = [];
  let tasksSplit = 0;
  let childrenEnqueued = 0;
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
      if (claimed.split !== undefined) {
        tasksSplit += 1;
        if (claimed.split.enqueued) childrenEnqueued += claimed.split.children.length;
        const childCounts = claimed.split.childPayloads.map((payload) => {
          const parsed: unknown = JSON.parse(payload);
          if (!record(parsed)) return 0;
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
          note: claimed.split.enqueued
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
    failedTaskIds,
    tasksSplit,
    childrenEnqueued,
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
