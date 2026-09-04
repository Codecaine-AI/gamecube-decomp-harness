import { globalStandardsContext } from "@server/core/knowledge";
import { existsSync } from "node:fs";
import { appendFile, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  backfillLibrarianPrompt,
} from "@server/core/agent-catalog/agents/knowledge/backfill-librarian";
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
import type { KnowledgeIndexDb } from "../index/db.js";
import { resolveKnowledgeCheckout } from "../checkout.js";
import {
  prioritizeTargets,
  type PrioritizedTargetRow,
} from "../migration/prioritize.js";
import {
  stampSubjectIndexed,
  type KnowledgeStoreHandle,
} from "../records/index.js";
import { buildPassContext, type BackfillPassContext } from "./context.js";

const DEFAULT_CONCURRENCY = 4;
const DEFAULT_TIMEOUT_MS = 900_000;


/**
 * The librarian sees standards only to recognize standard-mandated code shapes (so it never curates
 * them as patterns). Project the worker/QA-facing standards context down to what recognition needs.
 */
export function librarianStandardsView(context: Record<string, unknown>): unknown {
  const standards = Array.isArray(context.standards) ? context.standards : [];
  return {
    note: "Recognition only: id, title, and summary per accepted standard.",
    standards: standards
      .filter((entry): entry is Record<string, unknown> => typeof entry === "object" && entry !== null)
      .filter((entry) => entry.status === undefined || entry.status === "accepted")
      .map((entry) => ({ id: entry.id, title: entry.title, summary: entry.summary })),
  };
}

export interface LibrarianPassEnvelope {
  facts: unknown[];
  links: unknown[];
  entities: unknown[];
  merges: unknown[];
}

export interface BackfillPassTimings {
  startedAt: string;
  endedAt: string;
  contextMs: number;
  modelMs: number;
  applyMs: number;
  wallMs: number;
}

export interface BackfillPassArtifact {
  run_id: string;
  target: BackfillPassContext["target"];
  context: BackfillPassContext;
  proposal: LibrarianPassEnvelope;
  apply_report: ApplyReport;
  timings: BackfillPassTimings;
  model: string;
  dry_run: boolean;
}

export interface BackfillPassResult {
  target: PrioritizedTargetRow;
  context: BackfillPassContext;
  proposal: LibrarianPassEnvelope;
  applyReport: ApplyReport;
  timings: BackfillPassTimings;
  artifactPath: string;
}

export interface BackfillRunLog {
  append(entry: Record<string, unknown>): Promise<void>;
}

export interface BackfillPassDeps {
  runId: string;
  globals: GlobalArgs;
  sharedWriteGate: SharedGate;
  dryRun?: boolean;
  checkoutRoot?: string;
  headRevision?: string;
  prsRoot?: string;
  timeoutMs?: number;
  runPiAgent?: typeof runPiAgent;
  runLog?: BackfillRunLog;
  now?: () => string;
  clockMs?: () => number;
}

export interface BackfillRunOptions {
  runId: string;
  globals: GlobalArgs;
  indexDb?: Pick<KnowledgeIndexDb, "db">;
  limit?: number;
  shard?: { index: number; count: number };
  concurrency?: number;
  maxConsecutiveFailures?: number;
  minDirectScore?: number;
  dryRun?: boolean;
  stopFile?: string;
  checkoutRoot?: string;
  headRevision?: string;
  prsRoot?: string;
  timeoutMs?: number;
  runPiAgent?: typeof runPiAgent;
  now?: () => string;
  clockMs?: () => number;
}

export interface BackfillDurationSummary {
  min: number;
  max: number;
  mean: number;
  p50: number;
}

export interface BackfillSummary {
  runId: string;
  dryRun: boolean;
  shard: { index: number; count: number } | null;
  passesRun: number;
  passesApplied: number;
  itemsApplied: number;
  itemsRejected: number;
  itemsSkipped: number;
  passesFailed: number;
  targetsSkipped: number;
  aborted: boolean;
  stopped: boolean;
  wallMs: number;
  perPassMs: BackfillDurationSummary;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function targetSlug(stableKey: string): string {
  return stableKey.replace(/[^A-Za-z0-9]+/g, "-");
}

function runDirectory(stateDir: string, runId: string): string {
  return resolve(stateDir, "knowledge_v2", "backfill", runId);
}

export function createBackfillRunLog(path: string): BackfillRunLog {
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
    throw new Error("backfill librarian returned a malformed librarian_pass_v1 envelope");
  }
  return value as unknown as LibrarianPassEnvelope;
}

async function modelProposal(
  target: PrioritizedTargetRow,
  context: BackfillPassContext,
  deps: BackfillPassDeps,
  outputDir: string,
): Promise<LibrarianPassEnvelope> {
  const timeoutMs = deps.timeoutMs
    ?? (deps.globals.agentTimeoutSeconds || DEFAULT_TIMEOUT_MS / 1_000) * 1_000;
  await mkdir(outputDir, { recursive: true });
  const modelRun = (deps.runPiAgent ?? runPiAgent)({
    role: "librarian",
    catalogAgentId: "backfill-librarian",
    // The backfill pass reads and proposes; it never edits code and must cite only V2 locators.
    // The librarian profile is the allow-list for V2 research tools and the code graph.
    cwd: deps.globals.repoRoot,
    prompt: backfillLibrarianPrompt({
      task: {
        run_id: deps.runId,
        target_stable_key: target.stable_key,
        instruction: "Work the fill-out subjects in order — linked entities first, the target last — researching each across every resource before devising its facts.",
      },
      fillOutSubjects: context.fillOut,
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
      jobId: `kg2-backfill:${deps.runId}:${target.target_id}`,
      jobKind: "Backfill",
      itemId: target.target_id,
      targetId: target.target_id,
      phase: "knowledge-curation",
      workingDir: deps.globals.repoRoot,
      metadata: { targetStableKey: target.stable_key },
    }),
  });
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = Symbol("kg2-backfill-timeout");
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
    throw new Error(`backfill librarian timed out after ${timeoutMs}ms`);
  }
  if (result.failed || result.providerError || result.dryRun) {
    throw new Error(result.error ?? result.providerError ?? "backfill librarian did not produce proposal output");
  }
  const parsed = parseJsonObject(result.rawText);
  if (parsed.object === null) {
    throw new Error(parsed.error ?? "backfill librarian output was not JSON");
  }
  return validateEnvelope(parsed.object);
}

function entityLocatorsFromAppliedItems(items: ApplyItemResult[]): Set<string> {
  const locators = new Set<string>();
  const addSubject = (value: unknown): void => {
    if (record(value) && typeof value.entity_locator === "string") locators.add(value.entity_locator);
  };
  for (const result of items) {
    if (result.action !== "applied" || !record(result.item)) continue;
    if (result.itemKind === "fact") addSubject(result.item.subject);
    else if (result.itemKind === "link") {
      addSubject(result.item.from);
      addSubject(result.item.to);
    }
  }
  return locators;
}

function stampAppliedSubjects(
  store: KnowledgeStoreHandle,
  context: BackfillPassContext,
  report: ApplyReport,
  indexedAt: string,
): void {
  stampSubjectIndexed(store, { targetId: context.target.id }, indexedAt);
  const appliedLocators = entityLocatorsFromAppliedItems(report.items);
  for (const entity of context.linkedEntities) {
    if (appliedLocators.has(entity.locator)) {
      stampSubjectIndexed(store, { entityId: entity.id }, indexedAt);
    }
  }
}

export async function runPass(
  store: KnowledgeStoreHandle,
  target: PrioritizedTargetRow,
  deps: BackfillPassDeps,
): Promise<BackfillPassResult> {
  const clockMs = deps.clockMs ?? Date.now;
  const now = deps.now ?? (() => new Date().toISOString());
  const startedMs = clockMs();
  const startedAt = now();
  const directory = runDirectory(deps.globals.stateDir, deps.runId);
  const slug = targetSlug(target.stable_key);
  const artifactPath = resolve(directory, `${slug}.json`);
  const runLog = deps.runLog ?? createBackfillRunLog(resolve(directory, "run-log.jsonl"));
  let contextMs = 0;
  let modelMs = 0;
  let applyMs = 0;
  try {
    const checkout = resolveKnowledgeCheckout({
      gameId: deps.globals.gameId ?? "melee",
      stateDir: deps.globals.stateDir,
      explicitCheckoutRoot: deps.checkoutRoot,
    });
    const checkoutRoot = checkout.checkoutRoot;
    const headRevision = deps.headRevision ?? checkout.headRevision;
    const contextStarted = clockMs();
    const context = buildPassContext(store, target, {
      checkoutRoot,
      checkoutRev: headRevision,
      graphDbPath: deps.globals.graphDbPath,
    });
    contextMs = clockMs() - contextStarted;

    const modelStarted = clockMs();
    const proposal = await modelProposal(
      target,
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
      checkoutRoot,
      headRevision,
      prsRoot: deps.prsRoot,
      dryRun: deps.dryRun,
      now: () => indexedAt,
    });
    if (deps.dryRun !== true) stampAppliedSubjects(store, context, applyReport, indexedAt);
    applyMs = clockMs() - applyStarted;

    const endedAt = now();
    const timings: BackfillPassTimings = {
      startedAt,
      endedAt,
      contextMs,
      modelMs,
      applyMs,
      wallMs: clockMs() - startedMs,
    };
    const artifact: BackfillPassArtifact = {
      run_id: deps.runId,
      target: context.target,
      context: truncateArtifactStrings(context),
      proposal,
      apply_report: applyReport,
      timings,
      model: deps.globals.model,
      dry_run: deps.dryRun === true,
    };
    await mkdir(directory, { recursive: true });
    await writeFile(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
    await runLog.append({
      run_id: deps.runId,
      target_id: target.target_id,
      target_stable_key: target.stable_key,
      status: "completed",
      dry_run: deps.dryRun === true,
      apply_report: applyReport,
      timings,
      artifact_path: artifactPath,
    });
    return { target, context, proposal, applyReport, timings, artifactPath };
  } catch (error) {
    await runLog.append({
      run_id: deps.runId,
      target_id: target.target_id,
      target_stable_key: target.stable_key,
      status: "failed",
      dry_run: deps.dryRun === true,
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
    throw error;
  }
}

function validateRunOptions(options: BackfillRunOptions): void {
  if (options.runId.trim().length === 0) throw new Error("runId is required");
  const concurrency = options.concurrency ?? DEFAULT_CONCURRENCY;
  if (!Number.isSafeInteger(concurrency) || concurrency < 1) {
    throw new Error("concurrency must be a positive integer");
  }
  if (options.maxConsecutiveFailures !== undefined
    && (!Number.isSafeInteger(options.maxConsecutiveFailures) || options.maxConsecutiveFailures < 1)) {
    throw new Error("maxConsecutiveFailures must be a positive integer");
  }
  if (options.limit !== undefined && (!Number.isSafeInteger(options.limit) || options.limit < 0)) {
    throw new Error("limit must be a non-negative integer");
  }
  if (options.minDirectScore !== undefined
    && (!Number.isFinite(options.minDirectScore) || options.minDirectScore < 0)) {
    throw new Error("minDirectScore must be a non-negative number");
  }
  if (options.shard !== undefined) {
    if (!Number.isSafeInteger(options.shard.index) || options.shard.index < 0) {
      throw new Error("shard index must be a non-negative integer");
    }
    if (!Number.isSafeInteger(options.shard.count) || options.shard.count < 1) {
      throw new Error("shard count must be a positive integer");
    }
    if (options.shard.index >= options.shard.count) {
      throw new Error("shard index must be less than shard count");
    }
  }
}

function durationSummary(values: number[]): BackfillDurationSummary {
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

export async function runBackfill(
  store: KnowledgeStoreHandle,
  options: BackfillRunOptions,
): Promise<BackfillSummary> {
  validateRunOptions(options);
  const clockMs = options.clockMs ?? Date.now;
  const startedMs = clockMs();
  const checkout = resolveKnowledgeCheckout({
    gameId: options.globals.gameId ?? "melee",
    stateDir: options.globals.stateDir,
    explicitCheckoutRoot: options.checkoutRoot,
  });
  const concurrency = options.concurrency ?? DEFAULT_CONCURRENCY;
  const maxConsecutiveFailures = options.maxConsecutiveFailures ?? 5;
  const stopFile = options.stopFile
    ?? resolve(options.globals.stateDir, "knowledge_v2", "backfill", `${options.runId}.stop`);
  const allTargets = prioritizeTargets(store, options.indexDb, {
    limit: undefined,
    includeZeroMaterial: true,
  }).rows;
  const eligibleTargets = allTargets.filter((target) => target.indexed_at === null
    && (options.minDirectScore === undefined || target.direct_score >= options.minDirectScore));
  const limitedTargets = options.limit === undefined
    ? eligibleTargets
    : eligibleTargets.slice(0, options.limit);
  const shard = options.shard;
  const targets = shard === undefined
    ? limitedTargets
    : limitedTargets.filter((_, position) => position % shard.count === shard.index);
  const sharedWriteGate = createSharedGate();
  const runLog = createBackfillRunLog(resolve(runDirectory(options.globals.stateDir, options.runId), "run-log.jsonl"));

  let nextIndex = 0;
  let claimed = 0;
  let consecutiveFailures = 0;
  let aborted = false;
  let stopped = false;
  let passesRun = 0;
  let passesApplied = 0;
  let itemsApplied = 0;
  let itemsRejected = 0;
  let itemsSkipped = 0;
  let passesFailed = 0;
  const passDurations: number[] = [];

  const claim = (): PrioritizedTargetRow | undefined => {
    if (aborted || stopped || nextIndex >= targets.length) return undefined;
    if (existsSync(stopFile)) {
      stopped = true;
      return undefined;
    }
    const target = targets[nextIndex];
    nextIndex += 1;
    claimed += 1;
    return target;
  };

  const lane = async (): Promise<void> => {
    for (;;) {
      const target = claim();
      if (target === undefined) return;
      const passStarted = clockMs();
      passesRun += 1;
      try {
        const result = await runPass(store, target, {
          runId: options.runId,
          globals: options.globals,
          sharedWriteGate,
          dryRun: options.dryRun,
          checkoutRoot: checkout.checkoutRoot,
          headRevision: options.headRevision ?? checkout.headRevision,
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
        if (consecutiveFailures > maxConsecutiveFailures) aborted = true;
      } finally {
        passDurations.push(clockMs() - passStarted);
      }
    }
  };

  await Promise.all(Array.from({ length: Math.min(concurrency, Math.max(1, targets.length)) }, () => lane()));
  const summary: BackfillSummary = {
    runId: options.runId,
    dryRun: options.dryRun === true,
    shard: shard ?? null,
    passesRun,
    passesApplied,
    itemsApplied,
    itemsRejected,
    itemsSkipped,
    passesFailed,
    targetsSkipped: allTargets.length - claimed,
    aborted,
    stopped,
    wallMs: clockMs() - startedMs,
    perPassMs: durationSummary(passDurations),
  };
  console.log(JSON.stringify(summary));
  return summary;
}
