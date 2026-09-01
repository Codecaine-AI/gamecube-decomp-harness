import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { KnowledgeStoreHandle } from "../records/index.js";
import {
  advanceWatermark,
  enqueueIndexTask,
  getWatermark,
  insertPullRequestEntries,
  type PullRequestEntryInput,
} from "../records/index.js";
import { immediateTransaction } from "../storage/transaction.js";
import { shortHash, slugify, taskId } from "./common.js";
import type { LaneOptions, PrImportResult } from "./types.js";

export interface PrImportOptions extends LaneOptions {
  prsRoot: string;
  reattribute?: boolean;
}

export interface BotReportRow {
  unit: string;
  function: string;
  bytes: string;
  bytesValue: number;
  before: string;
  after: string;
  beforePct: number;
  afterPct: number;
  sectionLabel: string;
}

interface CountsFile {
  number: number;
  title: string;
  state: string;
  mergedAt: string | null;
}

interface ChangedFile {
  file: string;
  added: number;
  deleted: number;
  hunks: number;
}

interface UnitEntity {
  id: string;
  unit: string;
  stable_key: string;
}

interface WorkTarget {
  id: string;
  stable_key: string;
}

interface TextCorpusEntry {
  kind: string;
  author: string;
  created_at: string;
  body: string;
}

function readJsonLines<T>(path: string): T[] {
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf8")
    .split(/\r?\n/)
    .filter((line) => line.trim() !== "")
    .map((line) => JSON.parse(line) as T);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function stripOptionalBackticks(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith("`") && trimmed.endsWith("`") && trimmed.length >= 2) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

export function findBotReportBody(comments: unknown): string | null {
  if (!Array.isArray(comments)) return null;

  const reports: Array<{ body: string; createdAt: string | null; index: number }> = [];
  comments.forEach((comment, index) => {
    if (!isRecord(comment) || !isRecord(comment.user)) return;
    const login = comment.user.login;
    const body = comment.body;
    if (typeof login !== "string" || !login.includes("decomp-dev")) return;
    if (typeof body !== "string" || !body.trimStart().startsWith("### Report for")) return;
    reports.push({
      body,
      createdAt: typeof comment.created_at === "string" ? comment.created_at : null,
      index,
    });
  });

  if (reports.every(({ createdAt }) => createdAt !== null)) {
    reports.sort((a, b) => (a.createdAt ?? "").localeCompare(b.createdAt ?? "") || a.index - b.index);
  }
  return reports.at(-1)?.body ?? null;
}

export function parseBotReportComment(body: string): BotReportRow[] {
  const rows = new Map<string, BotReportRow>();
  const detailsPattern = /<details\b[^>]*>([\s\S]*?)<\/details\s*>/gi;

  for (const detailsMatch of body.matchAll(detailsPattern)) {
    const details = detailsMatch[1] ?? "";
    const summaryMatch = /<summary\b[^>]*>([\s\S]*?)<\/summary\s*>/i.exec(details);
    const sectionLabel = summaryMatch?.[1].trim() ?? "";
    let inFunctionTable = false;

    for (const line of details.split(/\r?\n/)) {
      const rowMatch = /^\s*\|(.+)\|\s*$/.exec(line);
      if (rowMatch === null) {
        inFunctionTable = false;
        continue;
      }
      const cells = rowMatch[1].split("|").map(stripOptionalBackticks);
      if (cells.length !== 5) continue;

      const isUnitHeader = cells[0].toLowerCase() === "unit";
      if (isUnitHeader) {
        const symbolHeader = cells[1].toLowerCase();
        if (symbolHeader === "function" || symbolHeader === "item") inFunctionTable = true;
        continue;
      }
      if (!inFunctionTable) continue;
      if (cells.every((cell) => cell === "" || /^[-:]+$/.test(cell))) continue;

      const [unit, symbol, bytes, beforeCell, afterCell] = cells;
      const before = beforeCell.replace(/%$/, "");
      const after = afterCell.replace(/%$/, "");
      if (before === "" || after === "") continue;
      const beforePct = Number(before);
      const afterPct = Number(after);
      if (!Number.isFinite(beforePct) || !Number.isFinite(afterPct)) continue;
      const parsedBytes = Number(bytes.replace(/^\+/, ""));
      const row: BotReportRow = {
        unit,
        function: symbol,
        bytes,
        bytesValue: Number.isFinite(parsedBytes) ? parsedBytes : 0,
        before,
        after,
        beforePct,
        afterPct,
        sectionLabel,
      };
      const key = `${unit}\u0000${symbol}`;
      rows.delete(key);
      rows.set(key, row);
    }
  }

  return [...rows.values()];
}

function findPrDirectories(prsRoot: string): Array<{ number: number; path: string }> {
  if (!existsSync(prsRoot)) return [];
  return readdirSync(prsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^pr-\d+$/.test(entry.name))
    .map((entry) => ({ number: Number(entry.name.slice(3)), path: join(prsRoot, entry.name) }))
    .sort((a, b) => a.number - b.number);
}

export function importPrs(store: KnowledgeStoreHandle, options: PrImportOptions): PrImportResult {
  const storedWatermark = getWatermark(store, "pr");
  const watermarkNumber = storedWatermark === null ? -1 : Number(storedWatermark);
  const directories = findPrDirectories(options.prsRoot).filter(
    ({ number }) => options.reattribute === true || number > watermarkNumber,
  );
  const existingIds = new Set(
    store.db.query<{ id: string }, []>("SELECT id FROM pull_request").all().map(({ id }) => id),
  );
  const entityForPath = store.db.query<UnitEntity, [string]>(`SELECT e.id, MIN(t.unit) AS unit,
      MIN(t.unit) AS stable_key
    FROM entity e
    JOIN target t ON t.unit_entity_id = e.id
    WHERE e.kind = 'translation_unit' AND e.locator = ? AND t.identity_status = 'current'
    GROUP BY e.id`);
  const targetForStableKey = store.db.query<WorkTarget, ["function" | "data", string]>(`SELECT id, stable_key
    FROM target WHERE kind = ? AND stable_key = ? AND identity_status = 'current'`);
  const entries: PullRequestEntryInput[] = [];
  const taskPayloads: string[] = [];
  const targetRowsSkippedUnresolvedSample: Array<{ unit: string; symbol: string }> = [];
  const unresolvedSampleKeys = new Set<string>();
  let skipped = 0;
  let prsImported = 0;
  let prsArchiveSkipped = 0;
  let prsWithBotReport = 0;
  let targetRowsInserted = 0;
  let targetRowsSkippedUnresolved = 0;
  let highestProcessed = watermarkNumber;

  for (const directory of directories) {
    const countsPath = join(directory.path, "counts.json");
    if (!existsSync(countsPath)) continue;
    const counts = JSON.parse(readFileSync(countsPath, "utf8")) as CountsFile;
    highestProcessed = Math.max(highestProcessed, directory.number);
    const issueCommentsPath = join(directory.path, "raw", "issue_comments.json");
    const issueComments: unknown = existsSync(issueCommentsPath)
      ? JSON.parse(readFileSync(issueCommentsPath, "utf8"))
      : null;
    const botReportBody = findBotReportBody(issueComments);
    if (botReportBody !== null) prsWithBotReport += 1;
    if (counts.state !== "MERGED" || typeof counts.mergedAt !== "string" || counts.mergedAt.length === 0) {
      skipped += 1;
      continue;
    }

    const filesByEntity = new Map<string, { entity: UnitEntity; files: ChangedFile[] }>();
    for (const file of readJsonLines<ChangedFile>(join(directory.path, "extracted", "changed_files.jsonl"))) {
      const entity = entityForPath.get(file.file);
      if (entity === null) continue;
      const group = filesByEntity.get(entity.id) ?? { entity, files: [] };
      group.files.push(file);
      filesByEntity.set(entity.id, group);
    }

    const targetRows: Array<{ row: BotReportRow; target: WorkTarget }> = [];
    for (const row of botReportBody === null ? [] : parseBotReportComment(botReportBody)) {
      const kind = row.function.startsWith(".") ? "data" : "function";
      const target = targetForStableKey.get(kind, `${row.unit}:${row.function}`);
      if (target !== null) {
        targetRows.push({ row, target });
        continue;
      }

      targetRowsSkippedUnresolved += 1;
      const sampleKey = `${row.unit}\u0000${row.function}`;
      if (targetRowsSkippedUnresolvedSample.length < 10 && !unresolvedSampleKeys.has(sampleKey)) {
        unresolvedSampleKeys.add(sampleKey);
        targetRowsSkippedUnresolvedSample.push({ unit: row.unit, symbol: row.function });
      }
    }

    if (filesByEntity.size === 0 && targetRows.length === 0) {
      prsArchiveSkipped += 1;
      continue;
    }

    const prEntries: PullRequestEntryInput[] = [];
    for (const { entity, files } of filesByEntity.values()) {
      const id = `pr-${counts.number}--${slugify(entity.stable_key)}`;
      if (existingIds.has(id)) {
        skipped += 1;
        continue;
      }
      const touched = files
        .map((file) => `${file.file} (+${file.added}/−${file.deleted}, ${file.hunks} hunks)`)
        .join("; ");
      const entry: PullRequestEntryInput = {
        id,
        entityId: entity.id,
        prRef: `melee#${counts.number}`,
        mergedAt: counts.mergedAt,
        outcome: "no_change",
        summary: `[mechanical] PR #${counts.number} '${counts.title}' touched ${touched}; narrative pending librarian pass`,
      };
      existingIds.add(id);
      entries.push(entry);
      prEntries.push(entry);
    }
    for (const { row, target } of targetRows) {
      const id = `pr-${counts.number}--fn--${slugify(target.stable_key)}--${shortHash(target.stable_key)}`;
      if (existingIds.has(id)) {
        skipped += 1;
        continue;
      }

      let outcome: PullRequestEntryInput["outcome"] = "no_change";
      if (row.afterPct >= 100) outcome = "match";
      else if (row.afterPct > row.beforePct) outcome = "improvement";
      // Regressions and broken matches map to "no_change"; the true direction survives in the summary text
      // (both the before -> after percentages and the verbatim CI section label).
      const entry: PullRequestEntryInput = {
        id,
        targetId: target.id,
        prRef: `melee#${counts.number}`,
        mergedAt: counts.mergedAt,
        outcome,
        summary: `[ci] PR #${counts.number} '${counts.title}' — ${row.unit}:${row.function} ${row.before}% -> ${row.after}% (${row.bytes} bytes), reported by decomp-dev CI as '${row.sectionLabel}'; narrative pending librarian pass`,
      };
      existingIds.add(id);
      entries.push(entry);
      prEntries.push(entry);
      targetRowsInserted += 1;
    }
    if (prEntries.length > 0) {
      prsImported += 1;
      taskPayloads.push(JSON.stringify(prEntries.map(({ id }) => id)));
    }
  }

  const watermark = highestProcessed > watermarkNumber ? String(highestProcessed) : storedWatermark;
  if (!options.dryRun) {
    immediateTransaction(store.db, () => {
      if (entries.length > 0) insertPullRequestEntries(store, entries);
      for (const payload of taskPayloads) {
        enqueueIndexTask(store, {
          id: taskId("pr_imported", payload),
          pathway: "pr_imported",
          payload,
          enqueuedAt: options.now?.(),
        });
      }
      // This records the highest processed PR, including archive-skipped and non-merged PRs,
      // so those archive entries are not scanned again on every run.
      if (watermark !== null && watermark !== storedWatermark) advanceWatermark(store, "pr", watermark);
    });
  }

  return {
    inserted: entries.length,
    skipped,
    tasksEnqueued: taskPayloads.length,
    prsImported,
    prsArchiveSkipped,
    prsWithBotReport,
    targetRowsInserted,
    targetRowsSkippedUnresolved,
    targetRowsSkippedUnresolvedSample,
    watermark,
  };
}

export interface ResolvedPrComment {
  locator: string;
  kind: string;
  author: string;
  createdAt: string;
  body: string;
}

export function resolvePrComment(prsRoot: string, prNumber: number, n: number): ResolvedPrComment | null {
  if (!Number.isInteger(n) || n < 0) return null;
  const directory = findPrDirectories(prsRoot).find((candidate) => candidate.number === prNumber);
  if (directory === undefined) return null;
  const entries = readJsonLines<TextCorpusEntry>(join(directory.path, "extracted", "text_corpus.jsonl"));
  const body = entries.filter(({ kind }) => kind === "pr_body");
  const remainder = entries
    .map((entry, index) => ({ entry, index }))
    .filter(({ entry }) => entry.kind !== "pr_body")
    .sort((a, b) => a.entry.created_at.localeCompare(b.entry.created_at) || a.index - b.index)
    .map(({ entry }) => entry);
  const entry = [...body, ...remainder][n];
  if (entry === undefined) return null;
  return {
    locator: `pr://${prNumber}/comment/${n}`,
    kind: entry.kind,
    author: entry.author,
    createdAt: entry.created_at,
    body: entry.body,
  };
}
