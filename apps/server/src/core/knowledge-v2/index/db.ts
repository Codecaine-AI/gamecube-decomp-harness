import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { Database } from "bun:sqlite";
import { gameKnowledgeRoot } from "../../knowledge/paths.js";
import { configureConnection } from "../storage/ddl.js";

export const KNOWLEDGE_INDEX_DB_FILENAME = "knowledge-index.sqlite";

export interface KnowledgeIndexDb {
  db: Database;
  path: string;
  close(): void;
}

export type OpenKnowledgeIndexDbOptions =
  | { knowledgeRoot: string; gameId?: never }
  | { gameId: string; knowledgeRoot?: never };

export type FtsSource = "discord" | "wiki" | "pr" | "attempt";

export const FTS_TABLE_BY_SOURCE: Record<FtsSource, string> = {
  discord: "discord_fts",
  wiki: "wiki_fts",
  pr: "pr_fts",
  attempt: "attempt_fts",
};

export function openKnowledgeIndexDb(options: OpenKnowledgeIndexDbOptions): KnowledgeIndexDb {
  const root = "knowledgeRoot" in options && options.knowledgeRoot !== undefined
    ? options.knowledgeRoot
    : gameKnowledgeRoot(options.gameId);
  mkdirSync(root, { recursive: true });
  const dbPath = resolve(root, KNOWLEDGE_INDEX_DB_FILENAME);
  const db = new Database(dbPath);
  try {
    configureConnection(db);
    ensureKnowledgeIndexSchema(db);
    return {
      db,
      path: dbPath,
      close() {
        db.close();
      },
    };
  } catch (error) {
    db.close();
    throw error;
  }
}

export function ensureKnowledgeIndexSchema(db: Database): void {
  db.run("CREATE VIRTUAL TABLE IF NOT EXISTS discord_fts USING fts5(id UNINDEXED, content)");
  db.run("CREATE VIRTUAL TABLE IF NOT EXISTS wiki_fts USING fts5(id UNINDEXED, content)");
  db.run("CREATE VIRTUAL TABLE IF NOT EXISTS pr_fts USING fts5(id UNINDEXED, title, body, discussion)");
  db.run("CREATE VIRTUAL TABLE IF NOT EXISTS attempt_fts USING fts5(id UNINDEXED, hypotheses, transcript)");
  db.run(`CREATE TABLE IF NOT EXISTS embedding_chunk (
    kind TEXT NOT NULL,
    locator TEXT NOT NULL,
    chunk_seq INTEGER NOT NULL,
    text TEXT NOT NULL,
    text_hash TEXT NOT NULL,
    model TEXT NOT NULL,
    dim INTEGER NOT NULL,
    vector BLOB NOT NULL,
    PRIMARY KEY (kind, locator, chunk_seq, model)
  )`);
  db.run("CREATE INDEX IF NOT EXISTS embedding_chunk_kind_model ON embedding_chunk(kind, model)");
}

export function clearFtsTable(db: Database, source: FtsSource): void {
  db.run(`DELETE FROM ${FTS_TABLE_BY_SOURCE[source]}`);
}

export function clearEmbeddingChunks(db: Database, kind?: "discord" | "wiki" | "pr"): void {
  if (kind === undefined) {
    db.run("DELETE FROM embedding_chunk");
    return;
  }
  db.run("DELETE FROM embedding_chunk WHERE kind = ?", [kind]);
}
