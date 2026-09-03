import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { Database } from "bun:sqlite";
import { DEFAULT_GAME_ID } from "@server/core/game-registry";
import { ensureParentDir } from "./graph/util.js";
import { gameKnowledgeRoot } from "./paths.js";

export type LearningOrigin = "human_extracted" | "ai_inferred";
export type LearningScope = "symbol" | "file" | "area" | "general";
export type LearningStatus = "proposed" | "corroborated" | "refuted" | "stale" | "graduated";

export interface LearningEvidence {
  type: "wiki_section" | "call_edge" | "pr_comment" | "attempt" | string;
  ref: string;
}

export interface LearningSubject {
  scope: LearningScope;
  symbol?: string;
  file?: string;
  area?: string;
  content_hash?: string;
}

export interface LearningRecord {
  id: string;
  origin: LearningOrigin;
  subject: LearningSubject;
  statement: string;
  evidence: LearningEvidence[];
  confidence: number;
  produced_by?: string;
  status?: LearningStatus;
  created_at?: string;
}

export interface AppendLearningsResult {
  output_path: string;
  records_written: number;
  appended_records: number;
}

export interface LedgerSearchIndexResult {
  db_path: string;
  indexed: number;
}

export interface LedgerSearchHit {
  id: string;
  statement: string;
}

export interface LedgerLearningHit {
  id: string;
  statement: string;
  subject?: LearningSubject;
  scope?: LearningScope;
  origin?: LearningOrigin;
  status?: LearningStatus;
  confidence?: number;
}

export interface LedgerLearningSearchResult {
  status: "ok" | "index_missing";
  note?: string;
  results: LedgerLearningHit[];
}

export function defaultLedgerPath(gameId = DEFAULT_GAME_ID): string {
  // ORCH_GAME_KNOWLEDGE_ROOT overrides this root; --state-dir does not, so disposable runs must set the env to avoid the production ledger.
  return resolve(gameKnowledgeRoot(gameId), "ledger", "learnings.jsonl");
}

export function defaultLedgerSearchDbPath(gameId = DEFAULT_GAME_ID): string {
  return resolve(gameKnowledgeRoot(gameId), "ledger", "learnings-fts.sqlite");
}

export function appendLearnings(outputPath: string, records: LearningRecord[]): AppendLearningsResult {
  const resolvedOutputPath = resolve(outputPath);
  const now = new Date().toISOString();
  const existing = readLearnings(resolvedOutputPath);
  const next = dedupeRecords([...existing, ...records].map((record) => withDefaults(record, now))).sort((left, right) =>
    left.id.localeCompare(right.id),
  );

  ensureParentDir(resolvedOutputPath);
  writeFileSync(resolvedOutputPath, next.length ? `${next.map((record) => JSON.stringify(record)).join("\n")}\n` : "", "utf8");

  return {
    output_path: resolvedOutputPath,
    records_written: next.length,
    appended_records: records.length,
  };
}

export function readLearnings(ledgerPath: string): LearningRecord[] {
  const resolvedLedgerPath = resolve(ledgerPath);
  if (!existsSync(resolvedLedgerPath)) return [];

  const records: LearningRecord[] = [];
  for (const line of readFileSync(resolvedLedgerPath, "utf8").split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const value = JSON.parse(line) as unknown;
      if (isLearningRecord(value)) records.push(value);
    } catch {
      // A damaged row must not prevent valid ledger records from being read.
    }
  }
  return records;
}

export function buildLedgerSearchIndex(dbPath: string, ledgerPath = defaultLedgerPath()): LedgerSearchIndexResult {
  const resolvedDbPath = resolve(dbPath);
  ensureParentDir(resolvedDbPath);
  const records = readLearnings(ledgerPath);
  const db = new Database(resolvedDbPath);

  try {
    db.run("DROP TABLE IF EXISTS learnings_fts");
    db.run("CREATE VIRTUAL TABLE learnings_fts USING fts5(id UNINDEXED, statement, subject, evidence)");

    const insert = db.prepare("INSERT INTO learnings_fts (id, statement, subject, evidence) VALUES (?, ?, ?, ?)");
    const insertRecords = db.transaction((rows: LearningRecord[]) => {
      for (const record of rows) {
        const subject = [record.subject.scope, record.subject.symbol, record.subject.file, record.subject.area].filter(Boolean).join(" ");
        const evidence = record.evidence.map((item) => `${item.type}:${item.ref}`).join(" ");
        insert.run(record.id, record.statement, subject, evidence);
      }
    });
    insertRecords(records);
  } finally {
    db.close();
  }

  return {
    db_path: resolvedDbPath,
    indexed: records.length,
  };
}

export function searchLedgerIndex(dbPath: string, query: string, limit = 20): LedgerSearchHit[] {
  const db = new Database(resolve(dbPath), { readonly: true });
  try {
    return db
      .query<LedgerSearchHit, [string, number]>(
        "SELECT id, statement FROM learnings_fts WHERE learnings_fts MATCH ? ORDER BY rank LIMIT ?",
      )
      .all(query, limit);
  } finally {
    db.close();
  }
}

export function searchLedgerLearnings(options: {
  query: string;
  scope?: LearningScope;
  limit?: number;
  gameId?: string;
  dbPath?: string;
  ledgerPath?: string;
}): LedgerLearningSearchResult {
  const gameId = options.gameId ?? DEFAULT_GAME_ID;
  const dbPath = resolve(options.dbPath ?? defaultLedgerSearchDbPath(gameId));
  const ledgerPath = resolve(options.ledgerPath ?? defaultLedgerPath(gameId));
  if (!existsSync(dbPath)) {
    return {
      status: "index_missing",
      note: `Ledger FTS index is not built yet at ${dbPath}; run buildLedgerSearchIndex to create it.`,
      results: [],
    };
  }

  let db: Database | undefined;
  try {
    db = new Database(dbPath, { readonly: true });
    const matchQuery = db.query<LedgerSearchHit, [string]>(
      "SELECT id, statement FROM learnings_fts WHERE learnings_fts MATCH ? ORDER BY rank",
    );
    let hits: LedgerSearchHit[];
    try {
      hits = matchQuery.all(options.query);
    } catch {
      // Raw queries with paths/units ("main/melee/gm/gm_16A2") are FTS5 syntax
      // errors; retry as an OR of quoted terms instead of failing the search.
      const terms = options.query.split(/\s+/).filter((term) => term && term.toUpperCase() !== "OR");
      if (terms.length === 0) throw new Error("empty ledger search query");
      hits = matchQuery.all(terms.map((term) => `"${term.replaceAll('"', '""')}"`).join(" OR "));
    }
    const recordsById = new Map(readLearnings(ledgerPath).map((record) => [record.id, record]));
    const requestedLimit = options.limit ?? 20;
    const limit = Number.isFinite(requestedLimit) ? Math.max(0, Math.trunc(requestedLimit)) : 20;

    return {
      status: "ok",
      results: hits
        .map((hit): LedgerLearningHit => {
          const record = recordsById.get(hit.id);
          if (!record) return hit;
          return {
            ...hit,
            subject: record.subject,
            scope: record.subject.scope,
            origin: record.origin,
            status: record.status,
            confidence: record.confidence,
          };
        })
        .filter((hit) => !options.scope || hit.scope === options.scope)
        .slice(0, limit),
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return {
      status: "ok",
      note: `Ledger FTS query could not be completed: ${reason}`,
      results: [],
    };
  } finally {
    db?.close();
  }
}

function withDefaults(record: LearningRecord, now: string): LearningRecord {
  return {
    ...record,
    status: record.status ?? "proposed",
    created_at: record.created_at ?? now,
  };
}

function dedupeRecords(records: LearningRecord[]): LearningRecord[] {
  const byId = new Map<string, LearningRecord>();
  for (const record of records) byId.set(record.id, record);
  return [...byId.values()];
}

function isLearningRecord(value: unknown): value is LearningRecord {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  if (typeof record.id !== "string" || typeof record.statement !== "string" || typeof record.confidence !== "number") return false;
  if (record.origin !== "human_extracted" && record.origin !== "ai_inferred") return false;
  if (!record.subject || typeof record.subject !== "object" || Array.isArray(record.subject)) return false;
  const scope = (record.subject as Record<string, unknown>).scope;
  if (scope !== "symbol" && scope !== "file" && scope !== "area" && scope !== "general") return false;
  if (!Array.isArray(record.evidence)) return false;
  return record.evidence.every(
    (item) =>
      Boolean(item) &&
      typeof item === "object" &&
      !Array.isArray(item) &&
      typeof (item as Record<string, unknown>).type === "string" &&
      typeof (item as Record<string, unknown>).ref === "string",
  );
}
