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
  claimIndexTask,
  completeIndexTask,
  enqueueIndexTask,
  releaseIndexTask,
  stampSubjectIndexed,
  type KnowledgeStoreHandle,
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
}

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
  dryRun?: boolean;
  stopFile?: string;
  checkoutRoot?: string;
  prsRoot?: string;
  timeoutMs?: number;
  runPiAgent?: typeof runPiAgent;
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
  tasksSplit: number;
  childrenEnqueued: number;
  tasksRemaining: number;
  aborted: boolean;
  stopped: boolean;
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
    });
    let stamped = { targetIds: [] as string[], entityIds: [] as string[] };
    if (dryRun) {
      releaseIndexTask(store, task.id);
    } else {
      stamped = stampTouchedSubjects(store, context, applyReport, indexedAt);
      completeIndexTask(store, task.id, indexedAt);
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
    };
    await mkdir(directory, { recursive: true });
    await writeFile(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
    await runLog.append({
      run_id: deps.runId,
      task_id: task.id,
      pathway: task.pathway,
      status: "completed",
      dry_run: dryRun,
      claim: dryRun ? "released" : "completed",
      stamped,
      apply_report: applyReport,
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
  split?: { children: string[] };
}

function queuedCandidates(
  store: KnowledgeStoreHandle,
  pathway: LibrarianPathway | undefined,
  exclude: ReadonlySet<string>,
): LibrarianTaskRow[] {
  const excluded = [...exclude];
  const placeholders = excluded.map(() => "?").join(", ");
  const conditions = [
    "started_at IS NULL",
    "done_at IS NULL",
    ...(pathway === undefined ? [] : ["pathway = ?"]),
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
  `).all(...(pathway === undefined ? [] : [pathway]), ...excluded, CLAIM_CANDIDATE_BATCH);
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
 * Split an oversized archival slice into bounded children that inherit the parent's queue position
 * (same enqueued_at, ids ordered after the parent), and complete the parent in the same transaction.
 */
function splitOversizedSlice(
  store: KnowledgeStoreHandle,
  task: LibrarianTaskRow,
  doneAt: string,
): string[] | null {
  if (task.pathway !== "archival_ingest") return null;
  const slice = parseSlicePayload(task.payload);
  if (slice === null) return null;
  const children = splitSlicePayload(store, slice);
  if (children.length === 0) return null;
  const width = String(children.length).length;
  const childIds = children.map((_, index) =>
    `${task.id}/${String(index + 1).padStart(width, "0")}`);
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
  return childIds;
}

/**
 * Claim the next queued task in priority order. Returns the task to run, or a split record when the
 * claimed task was an oversized archival slice that has been re-chunked and completed instead.
 */
export function claimNextLibrarianTask(
  store: KnowledgeStoreHandle,
  options: {
    pathway?: LibrarianPathway;
    exclude?: ReadonlySet<string>;
    dryRun?: boolean;
    now?: () => string;
  } = {},
): ClaimResult | undefined {
  const now = options.now ?? (() => new Date().toISOString());
  const exclude = new Set(options.exclude ?? []);
  for (;;) {
    const candidates = queuedCandidates(store, options.pathway, exclude);
    if (candidates.length === 0) return undefined;
    for (const candidate of candidates) {
      const claimedAt = now();
      if (!claimIndexTask(store, candidate.id, claimedAt)) {
        exclude.add(candidate.id);
        continue;
      }
      const task: LibrarianTaskRow = { ...candidate, started_at: claimedAt };
      if (options.dryRun === true) return { task };
      const children = splitOversizedSlice(store, task, claimedAt);
      if (children === null) return { task };
      return { task, split: { children } };
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
  const seen = new Set<string>();
  let claimedPasses = 0;
  let consecutiveFailures = 0;
  let aborted = false;
  let stopped = false;
  let passesRun = 0;
  let passesApplied = 0;
  let itemsApplied = 0;
  let itemsRejected = 0;
  let itemsSkipped = 0;
  let passesFailed = 0;
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
      const claimed = claimNextLibrarianTask(store, {
        pathway: options.pathway,
        exclude: seen,
        dryRun,
        now,
      });
      if (claimed === undefined) return undefined;
      seen.add(claimed.task.id);
      if (claimed.split !== undefined) {
        tasksSplit += 1;
        childrenEnqueued += claimed.split.children.length;
        await runLog.append({
          run_id: options.runId,
          task_id: claimed.task.id,
          pathway: claimed.task.pathway,
          status: "split",
          dry_run: dryRun,
          note: `oversized archival slice re-chunked into ${claimed.split.children.length} child tasks; parent completed without a model pass`,
          children: claimed.split.children,
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
    tasksSplit,
    childrenEnqueued,
    tasksRemaining: countQueuedTasks(store, options.pathway),
    aborted,
    stopped,
    wallMs: clockMs() - startedMs,
    perPassMs: durationSummary(passDurations),
  };
  console.log(JSON.stringify(summary));
  return summary;
}
