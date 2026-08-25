import { Database } from "bun:sqlite";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
} from "node:fs";
import { dirname, extname, resolve } from "node:path";

import { librarianPrompt } from "@server/core/agent-catalog/agents/knowledge/librarian";
import { shortHash, stableJson } from "@server/core/knowledge/graph/util";
import { mapLimit } from "@server/core/knowledge/jobs/kg.js";
import {
  learningRecord,
  loadWorkerCondenseInput,
  recordLibrarianSession,
  validateLibrarianReport,
  type LibrarianReportValidation,
} from "@server/core/knowledge/jobs/librarian.js";
import {
  appendLearnings,
  defaultLedgerPath,
  type LearningRecord,
} from "@server/core/knowledge/ledger.js";
import { sourceDataRoot } from "@server/core/knowledge/paths.js";
import {
  booleanArg,
  numberArg,
  stringArg,
  type GlobalArgs,
} from "@server/core/game-registry/runtime-options.js";
import { knowledgeCycleSessionId } from "./cycle-session.js";
import { openState, type StateStore } from "@server/core/cycle-runtime/run-state";
import { runMeleeKernelPiAgent as runPiAgent } from "@server/infrastructure/agent-runtime/kernel-pi-runner";
import { parseJsonObject } from "@server/infrastructure/agent-runtime/runtime";
import { createMeleeKernelSpawnContext } from "@server/infrastructure/kernel/bridge/spawn-context";

export type BackfillSource = "worker_history" | "past_prs" | "discord";

export interface WorkerHistoryDescriptor {
  target_key: string;
  worker_state_ids: string[];
}

export interface PastPrDescriptor {
  pr: number;
  dir: string;
  diff_bytes: number;
}

export interface PastPrsDescriptor {
  prs: PastPrDescriptor[];
}

export interface DiscordDescriptor {
  channel_id: string;
  file: string;
  month: string;
  start_line: number;
  end_line: number;
  message_count: number;
}

export interface PlannedBatch {
  batch_id: string;
  source: BackfillSource;
  descriptor: WorkerHistoryDescriptor | PastPrsDescriptor | DiscordDescriptor;
}

export interface BackfillManifestRow {
  batch_id: string;
  source: BackfillSource;
  status: "pending" | "done" | "failed";
  attempts: number;
  updated_at: string;
  output_counts: { learnings: number; validation_errors: number } | null;
  descriptor: PlannedBatch["descriptor"];
  /** Failure reason (parse/session error or validation summary); null when done. */
  error?: string | null;
}

interface WorkerPlannerRow {
  id: string;
  target_key: string | null;
  checkpoint_count: number;
}

interface PastPrIndexRow {
  pr: number;
  summary: string;
}

interface PastPrPlan {
  batches: PlannedBatch[];
  indexRows: Map<number, PastPrIndexRow>;
  invalidIndexRows: number;
}

interface SourcePlan {
  batches: PlannedBatch[];
  extras: Record<string, unknown>;
  pastPrIndexRows?: Map<number, PastPrIndexRow>;
}

type PiAgentResult = Awaited<ReturnType<typeof runPiAgent>>;

interface BatchOutcome {
  batch: PlannedBatch;
  failed: boolean;
  records: LearningRecord[];
  validationErrors: string[];
  parseError: string | null;
  result: PiAgentResult | null;
  outputCounts: BackfillManifestRow["output_counts"];
}

const PAST_PR_DIFF_LIMIT_BYTES = 200 * 1024;
const DEFAULT_DISCORD_MESSAGES_PER_BATCH = 400;

function plannedBatch(source: BackfillSource, descriptor: PlannedBatch["descriptor"]): PlannedBatch {
  return {
    batch_id: shortHash(stableJson(descriptor)),
    source,
    descriptor,
  };
}

export function planWorkerHistoryBatches(db: Database): PlannedBatch[] {
  const rows = db
    .query(
      `
        SELECT ws.id, ws.target_key, COUNT(wc.id) AS checkpoint_count
        FROM worker_state ws
        JOIN worker_checkpoints wc ON wc.worker_state_id = ws.id
        GROUP BY ws.id, ws.target_key
      `,
    )
    .all() as WorkerPlannerRow[];
  const workersByTarget = new Map<string, string[]>();

  for (const row of rows) {
    if (typeof row.target_key !== "string" || !row.target_key.trim()) continue;
    const workerIds = workersByTarget.get(row.target_key) ?? [];
    workerIds.push(String(row.id));
    workersByTarget.set(row.target_key, workerIds);
  }

  return [...workersByTarget.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([targetKey, workerStateIds]) =>
      plannedBatch("worker_history", {
        target_key: targetKey,
        worker_state_ids: workerStateIds.sort((left, right) => left.localeCompare(right)),
      }),
    );
}

function readPastPrIndex(indexPath: string): {
  rows: PastPrIndexRow[];
  invalidIndexRows: number;
} {
  const rows: PastPrIndexRow[] = [];
  let invalidIndexRows = 0;

  for (const line of readFileSync(resolve(indexPath), "utf8").split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const parsed = JSON.parse(line) as Record<string, unknown>;
      if (!parsed || typeof parsed !== "object" || !Number.isFinite(parsed.pr)) {
        invalidIndexRows += 1;
        continue;
      }
      rows.push({
        pr: Number(parsed.pr),
        summary: typeof parsed.summary === "string" ? parsed.summary : "",
      });
    } catch {
      invalidIndexRows += 1;
    }
  }

  return { rows, invalidIndexRows };
}

function detailedPastPrPlan(options: { indexPath: string; prsRoot: string }): PastPrPlan {
  const prsRoot = resolve(options.prsRoot);
  const { rows, invalidIndexRows } = readPastPrIndex(options.indexPath);
  const batches: PlannedBatch[] = [];
  const indexRows = new Map<number, PastPrIndexRow>();
  let smallPrs: PastPrDescriptor[] = [];

  const flushSmallPrs = (): void => {
    if (smallPrs.length === 0) return;
    batches.push(plannedBatch("past_prs", { prs: smallPrs }));
    smallPrs = [];
  };

  for (const row of rows) {
    indexRows.set(row.pr, row);
    const dir = resolve(prsRoot, `pr-${row.pr}`);
    const diffPath = resolve(dir, "raw", "diff.diff");
    const diffBytes = existsSync(diffPath) ? statSync(diffPath).size : 0;
    const descriptor = { pr: row.pr, dir, diff_bytes: diffBytes };

    if (diffBytes > PAST_PR_DIFF_LIMIT_BYTES) {
      flushSmallPrs();
      batches.push(plannedBatch("past_prs", { prs: [descriptor] }));
      continue;
    }

    smallPrs.push(descriptor);
    if (smallPrs.length === 3) flushSmallPrs();
  }
  flushSmallPrs();

  return { batches, indexRows, invalidIndexRows };
}

export function planPastPrsBatches(options: { indexPath: string; prsRoot: string }): PlannedBatch[] {
  return detailedPastPrPlan(options).batches;
}

function jsonlLines(path: string): string[] {
  const contents = readFileSync(path, "utf8");
  if (!contents) return [];
  const lines = contents.split(/\r?\n/);
  if (lines.at(-1) === "") lines.pop();
  return lines;
}

export function planDiscordBatches(options: {
  rawRoot: string;
  maxMessagesPerBatch?: number;
}): PlannedBatch[] {
  const rawRoot = resolve(options.rawRoot);
  const maxMessagesPerBatch = Math.max(
    1,
    Math.floor(options.maxMessagesPerBatch ?? DEFAULT_DISCORD_MESSAGES_PER_BATCH),
  );
  const batches: PlannedBatch[] = [];
  const channelDirs = readdirSync(rawRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .sort((left, right) => left.name.localeCompare(right.name));

  for (const channelDir of channelDirs) {
    const channelRoot = resolve(rawRoot, channelDir.name);
    const monthFiles = readdirSync(channelRoot, { withFileTypes: true })
      .filter((entry) => entry.isFile() && extname(entry.name) === ".jsonl")
      .sort((left, right) => left.name.localeCompare(right.name));

    for (const monthFile of monthFiles) {
      const file = resolve(channelRoot, monthFile.name);
      const messageCount = jsonlLines(file).length;
      for (let startLine = 0; startLine < messageCount; startLine += maxMessagesPerBatch) {
        const endLine = Math.min(startLine + maxMessagesPerBatch, messageCount);
        batches.push(
          plannedBatch("discord", {
            channel_id: channelDir.name,
            file,
            month: monthFile.name.slice(0, -extname(monthFile.name).length),
            start_line: startLine,
            end_line: endLine,
            message_count: endLine - startLine,
          }),
        );
      }
    }
  }

  return batches;
}

function isBackfillSource(value: unknown): value is BackfillSource {
  return value === "worker_history" || value === "past_prs" || value === "discord";
}

function isManifestRow(value: unknown): value is BackfillManifestRow {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const row = value as Partial<BackfillManifestRow>;
  return (
    typeof row.batch_id === "string" &&
    isBackfillSource(row.source) &&
    (row.status === "pending" || row.status === "done" || row.status === "failed") &&
    typeof row.attempts === "number" &&
    typeof row.updated_at === "string" &&
    Boolean(row.descriptor) &&
    typeof row.descriptor === "object"
  );
}

export function loadBackfillManifest(manifestPath: string): Map<string, BackfillManifestRow> {
  const manifest = new Map<string, BackfillManifestRow>();
  if (!existsSync(manifestPath)) return manifest;

  for (const line of readFileSync(manifestPath, "utf8").split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const row = JSON.parse(line) as unknown;
      if (isManifestRow(row)) manifest.set(row.batch_id, row);
    } catch {
      // A damaged manifest row does not hide valid rows that follow it.
    }
  }
  return manifest;
}

export function pendingPlannedBatches(
  batches: PlannedBatch[],
  manifest: ReadonlyMap<string, BackfillManifestRow>,
): PlannedBatch[] {
  return batches.filter((batch) => manifest.get(batch.batch_id)?.status !== "done");
}

function appendManifestRows(manifestPath: string, rows: BackfillManifestRow[]): void {
  if (rows.length === 0) return;
  mkdirSync(dirname(manifestPath), { recursive: true });
  appendFileSync(manifestPath, `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`, "utf8");
}

function orchestratorDatabasePath(stateDir: string): string {
  const path = resolve(stateDir, "orchestrator.sqlite");
  if (!existsSync(path)) {
    throw new Error(`Orchestrator sqlite database not found: ${path}`);
  }
  return path;
}

function openReadonlyOrchestratorDatabase(stateDir: string): { db: Database; path: string } {
  const path = orchestratorDatabasePath(stateDir);
  return { db: new Database(path, { readonly: true }), path };
}

function planSource(source: BackfillSource, globals: GlobalArgs, workerDb: Database | null): SourcePlan {
  if (source === "worker_history") {
    if (!workerDb) throw new Error("worker_history planning requires the read-only orchestrator database");
    const batches = planWorkerHistoryBatches(workerDb);
    return {
      batches,
      extras: {
        target_count: batches.length,
        worker_count: batches.reduce((sum, batch) => {
          const descriptor = batch.descriptor as WorkerHistoryDescriptor;
          return sum + descriptor.worker_state_ids.length;
        }, 0),
        orchestrator_db_path: orchestratorDatabasePath(globals.stateDir),
      },
    };
  }

  if (source === "past_prs") {
    const dataRoot = sourceDataRoot("past_prs");
    const indexPath = resolve(dataRoot, "library", "index.jsonl");
    const prsRoot = resolve(dataRoot, "prs");
    const plan = detailedPastPrPlan({ indexPath, prsRoot });
    return {
      batches: plan.batches,
      pastPrIndexRows: plan.indexRows,
      extras: {
        index_path: indexPath,
        prs_root: prsRoot,
        index_rows: plan.indexRows.size,
        invalid_index_rows: plan.invalidIndexRows,
        pr_count: plan.batches.reduce((sum, batch) => {
          const descriptor = batch.descriptor as PastPrsDescriptor;
          return sum + descriptor.prs.length;
        }, 0),
      },
    };
  }

  const rawRoot = resolve(sourceDataRoot("discord_raw"), "raw");
  const batches = planDiscordBatches({ rawRoot });
  return {
    batches,
    extras: {
      raw_root: rawRoot,
      channel_count: new Set(
        batches.map((batch) => (batch.descriptor as DiscordDescriptor).channel_id),
      ).size,
      file_count: new Set(
        batches.map((batch) => (batch.descriptor as DiscordDescriptor).file),
      ).size,
      message_count: batches.reduce(
        (sum, batch) => sum + (batch.descriptor as DiscordDescriptor).message_count,
        0,
      ),
    },
  };
}

function readJsonOrNull(path: string): unknown | null {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as unknown;
  } catch {
    return null;
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function diffExcerpt(path: string): string {
  if (!existsSync(path)) return "";
  const diff = readFileSync(path);
  if (diff.byteLength <= PAST_PR_DIFF_LIMIT_BYTES) return diff.toString("utf8");

  let excerpt = diff.subarray(0, PAST_PR_DIFF_LIMIT_BYTES).toString("utf8");
  const lastLineBreak = excerpt.lastIndexOf("\n");
  excerpt = lastLineBreak >= 0 ? excerpt.slice(0, lastLineBreak + 1) : "";
  return `${excerpt}[truncated: diff exceeded ${PAST_PR_DIFF_LIMIT_BYTES} bytes]`;
}

function workerHistoryPayload(batch: PlannedBatch, db: Database): Record<string, unknown> {
  const descriptor = batch.descriptor as WorkerHistoryDescriptor;
  return {
    batch_id: batch.batch_id,
    kind: "worker_history_backfill",
    target_key: descriptor.target_key,
    workers: descriptor.worker_state_ids.map((workerStateId) =>
      loadWorkerCondenseInput(db, workerStateId),
    ),
  };
}

function pastPrsPayload(
  batch: PlannedBatch,
  indexRows: ReadonlyMap<number, PastPrIndexRow>,
): Record<string, unknown> {
  const descriptor = batch.descriptor as PastPrsDescriptor;
  return {
    batch_id: batch.batch_id,
    kind: "past_prs_backfill",
    prs: descriptor.prs.map((entry) => {
      const postmortem = readJsonOrNull(resolve(entry.dir, "postmortem", "postmortem.json"));
      return {
        kind: "pr",
        pr: entry.pr,
        postmortem: isPlainObject(postmortem)
          ? { kind: "postmortem", ...postmortem }
          : postmortem,
        summary: indexRows.get(entry.pr)?.summary ?? "",
        diff_excerpt: diffExcerpt(resolve(entry.dir, "raw", "diff.diff")),
      };
    }),
  };
}

function discordPayload(batch: PlannedBatch): Record<string, unknown> {
  const descriptor = batch.descriptor as DiscordDescriptor;
  const messages = jsonlLines(descriptor.file)
    .slice(descriptor.start_line, descriptor.end_line)
    .map((line, index) => {
      try {
        const message = JSON.parse(line) as unknown;
        return isPlainObject(message)
          ? { kind: "discord_message", ...message }
          : { kind: "discord_message", value: message };
      } catch (error) {
        const lineNumber = descriptor.start_line + index + 1;
        throw new Error(
          `Invalid Discord JSONL at ${descriptor.file}:${lineNumber}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    });
  return {
    batch_id: batch.batch_id,
    kind: "discord_backfill",
    channel_id: descriptor.channel_id,
    month: descriptor.month,
    messages,
  };
}

function buildBatchPayload(
  batch: PlannedBatch,
  workerDb: Database | null,
  pastPrIndexRows: ReadonlyMap<number, PastPrIndexRow> | undefined,
): Record<string, unknown> {
  if (batch.source === "worker_history") {
    if (!workerDb) throw new Error("worker_history payload loading requires the read-only orchestrator database");
    return workerHistoryPayload(batch, workerDb);
  }
  if (batch.source === "past_prs") {
    return pastPrsPayload(batch, pastPrIndexRows ?? new Map());
  }
  return discordPayload(batch);
}

async function executeBatch(options: {
  batch: PlannedBatch;
  globals: GlobalArgs;
  outputDir: string;
  runId: string;
  workerDb: Database | null;
  pastPrIndexRows?: ReadonlyMap<number, PastPrIndexRow>;
}): Promise<BatchOutcome> {
  const { batch, globals, outputDir, runId, workerDb, pastPrIndexRows } = options;
  try {
    const librarianBatch = buildBatchPayload(batch, workerDb, pastPrIndexRows);
    const result = await runPiAgent({
      role: "librarian",
      cwd: globals.repoRoot,
      prompt: librarianPrompt({
        librarianBatch,
        repoRoot: globals.repoRoot,
        stateDir: globals.stateDir,
        game: globals.game,
      }),
      outputDir,
      dryRun: globals.dryRunAgents,
      provider: globals.provider,
      model: globals.model,
      thinkingLevel: globals.thinkingLevel,
      timeoutMs: globals.agentTimeoutSeconds ? globals.agentTimeoutSeconds * 1000 : undefined,
      toolContext: {
        repoRoot: globals.repoRoot,
        stateDir: globals.stateDir,
        game: globals.game,
      },
      kernelContext: createMeleeKernelSpawnContext({
        kind: "knowledge-curation",
        gameId: globals.game?.gameId ?? globals.gameId,
        sessionId: knowledgeCycleSessionId({ globals, fallback: runId || batch.batch_id }),
        runId: runId || batch.batch_id,
        jobId: batch.batch_id,
        jobKind: "Backfill",
        phase: "knowledge-curation",
        workingDir: globals.repoRoot,
        metadata: { source: batch.source, batchId: batch.batch_id },
      }),
    });

    if (result.dryRun) {
      return {
        batch,
        failed: false,
        records: [],
        validationErrors: [],
        parseError: null,
        result,
        outputCounts: null,
      };
    }

    const parsed = result.failed
      ? { object: null, error: result.error ?? "agent failed" }
      : parseJsonObject(result.rawText);
    const validation = parsed.object
      ? validateLibrarianReport(parsed.object)
      : { ok: false, errors: [], learnings: [] } satisfies LibrarianReportValidation;
    const records = validation.learnings.map((learning) =>
      learningRecord(
        learning,
        `librarian backfill ${batch.source} batch:${batch.batch_id}`,
      ),
    );
    const parseError = parsed.error ?? null;
    return {
      batch,
      failed: Boolean(result.failed || parseError),
      records,
      validationErrors: validation.errors,
      parseError,
      result,
      outputCounts: {
        learnings: records.length,
        validation_errors: validation.errors.length,
      },
    };
  } catch (error) {
    return {
      batch,
      failed: true,
      records: [],
      validationErrors: [],
      parseError: error instanceof Error ? error.message : String(error),
      result: null,
      outputCounts: null,
    };
  }
}

function sourceArg(args: Map<string, string | true>): BackfillSource {
  const source = stringArg(args, "--source", "").trim();
  if (!source) {
    throw new Error(
      "kg-librarian-backfill requires --source <worker_history|past_prs|discord>",
    );
  }
  if (!isBackfillSource(source)) {
    throw new Error(
      `kg-librarian-backfill --source must be worker_history, past_prs, or discord; received: ${source}`,
    );
  }
  return source;
}

export async function kgLibrarianBackfill(
  globals: GlobalArgs,
  args: Map<string, string | true>,
): Promise<void> {
  const source = sourceArg(args);
  const jobs = Math.max(1, Math.floor(numberArg(args, "--jobs", 8)));
  const limit = Math.floor(numberArg(args, "--limit", 0));
  const planOnly = booleanArg(args, "--plan");
  const manifestDir = resolve(
    stringArg(
      args,
      "--manifest-dir",
      resolve(globals.stateDir, "knowledge_librarian", "backfill"),
    ),
  );
  const manifestPath = resolve(manifestDir, source, "manifest.jsonl");
  const runId = stringArg(args, "--run-id", "").trim();
  const ledgerPath = stringArg(
    args,
    "--ledger-path",
    defaultLedgerPath(globals.game?.gameId ?? "melee"),
  );
  let workerDb: Database | null = null;
  let recordStore: StateStore | null = null;

  try {
    if (source === "worker_history") {
      workerDb = openReadonlyOrchestratorDatabase(globals.stateDir).db;
    }
    const sourcePlan = planSource(source, globals, workerDb);
    const manifest = loadBackfillManifest(manifestPath);
    const pending = pendingPlannedBatches(sourcePlan.batches, manifest);
    const selected = limit > 0 ? pending.slice(0, limit) : pending;
    const doneCount = sourcePlan.batches.length - pending.length;

    if (planOnly) {
      console.log(
        JSON.stringify({
          command: "kg-librarian-backfill",
          plan: true,
          source,
          batch_count: sourcePlan.batches.length,
          done_count: doneCount,
          pending_count: pending.length,
          selected_pending_count: selected.length,
          manifest_path: manifestPath,
          ...sourcePlan.extras,
        }),
      );
      return;
    }

    const outputDir = resolve(
      manifestDir,
      source,
      "runs",
      new Date().toISOString().replace(/[:.]/g, "-"),
    );
    mkdirSync(outputDir, { recursive: true });
    if (runId && !globals.dryRunAgents) recordStore = openState(globals.stateDir);

    let executed = 0;
    let done = 0;
    let failed = 0;
    let learningsAppended = 0;
    const waveSize = jobs * 4;

    for (let start = 0; start < selected.length; start += waveSize) {
      const waveBatches = selected.slice(start, start + waveSize);
      const outcomes = await mapLimit(
        waveBatches,
        Math.min(jobs, waveBatches.length || 1),
        async (batch) =>
          executeBatch({
            batch,
            globals,
            outputDir,
            runId,
            workerDb,
            pastPrIndexRows: sourcePlan.pastPrIndexRows,
          }),
      );
      executed += outcomes.length;

      if (globals.dryRunAgents) {
        for (const outcome of outcomes) {
          console.log(
            JSON.stringify({
              command: "kg-librarian-backfill",
              source,
              batch_id: outcome.batch.batch_id,
              dry_run: true,
              failed: outcome.failed,
              error: outcome.parseError,
              output_path: outcome.result?.outputPath ?? null,
              system_prompt_path: outcome.result?.systemPromptPath ?? null,
              user_prompt_path: outcome.result?.userPromptPath ?? null,
            }),
          );
        }
        failed += outcomes.filter((outcome) => outcome.failed).length;
        continue;
      }

      const waveRecords = outcomes.flatMap((outcome) => outcome.records);
      const appendResult = appendLearnings(ledgerPath, waveRecords);
      learningsAppended += appendResult.appended_records;

      const updatedAt = new Date().toISOString();
      const manifestRows = outcomes.map((outcome): BackfillManifestRow => ({
        batch_id: outcome.batch.batch_id,
        source: outcome.batch.source,
        status: outcome.failed ? "failed" : "done",
        attempts: (manifest.get(outcome.batch.batch_id)?.attempts ?? 0) + 1,
        updated_at: updatedAt,
        output_counts: outcome.outputCounts,
        descriptor: outcome.batch.descriptor,
        error: outcome.failed
          ? outcome.parseError ??
            (outcome.validationErrors.length > 0
              ? `validation: ${outcome.validationErrors.slice(0, 3).join("; ")}`
              : "unknown failure")
          : null,
      }));
      appendManifestRows(manifestPath, manifestRows);
      for (const row of manifestRows) manifest.set(row.batch_id, row);

      if (recordStore) {
        for (const outcome of outcomes) {
          if (outcome.result) recordLibrarianSession(recordStore, globals, runId, outcome.result);
        }
      }

      done += outcomes.filter((outcome) => !outcome.failed).length;
      failed += outcomes.filter((outcome) => outcome.failed).length;
    }

    console.log(
      JSON.stringify({
        command: "kg-librarian-backfill",
        source,
        dry_run: globals.dryRunAgents,
        plan: false,
        batch_count: sourcePlan.batches.length,
        executed,
        done,
        failed,
        learnings_appended: learningsAppended,
        manifest_path: manifestPath,
        output_dir: outputDir,
      }),
    );
  } finally {
    recordStore?.db.close();
    workerDb?.close();
  }
}
