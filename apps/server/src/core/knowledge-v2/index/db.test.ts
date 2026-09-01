import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  clearEmbeddingChunks,
  clearFtsTable,
  KNOWLEDGE_INDEX_DB_FILENAME,
  openKnowledgeIndexDb,
  type KnowledgeIndexDb,
} from "./index.js";

const tempDirs: string[] = [];
const indexDbs: KnowledgeIndexDb[] = [];

afterEach(() => {
  for (const indexDb of indexDbs.splice(0)) indexDb.close();
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function createTempRoot(name: string): string {
  const dir = mkdtempSync(join(tmpdir(), `knowledge-v2-index-${name}-`));
  tempDirs.push(dir);
  return dir;
}

function openIndex(knowledgeRoot: string): KnowledgeIndexDb {
  const indexDb = openKnowledgeIndexDb({ knowledgeRoot });
  indexDbs.push(indexDb);
  return indexDb;
}

function closeIndex(indexDb: KnowledgeIndexDb): void {
  indexDb.close();
  indexDbs.splice(indexDbs.indexOf(indexDb), 1);
}

describe("knowledge index database", () => {
  test("creates the index file with WAL journaling", () => {
    const root = createTempRoot("open");
    const indexDb = openIndex(root);

    expect(indexDb.path).toBe(join(root, KNOWLEDGE_INDEX_DB_FILENAME));
    expect(existsSync(indexDb.path)).toBe(true);
    expect(indexDb.db.query("PRAGMA journal_mode").get()).toEqual({ journal_mode: "wal" });
  });

  test("reopens idempotently with every index table", () => {
    const root = createTempRoot("reopen");
    const first = openIndex(root);
    closeIndex(first);

    const reopened = openIndex(root);
    const tables = reopened.db.query<{ name: string }, []>(`
      SELECT name
      FROM sqlite_master
      WHERE type = 'table'
        AND name IN ('discord_fts', 'wiki_fts', 'pr_fts', 'attempt_fts', 'embedding_chunk')
      ORDER BY name
    `).all();

    expect(tables).toEqual([
      { name: "attempt_fts" },
      { name: "discord_fts" },
      { name: "embedding_chunk" },
      { name: "pr_fts" },
      { name: "wiki_fts" },
    ]);
  });

  test("clears FTS rows and embedding chunks", () => {
    const indexDb = openIndex(createTempRoot("clear"));
    indexDb.db.query("INSERT INTO discord_fts (id, content) VALUES (?, ?)").run("message-1", "needle");
    indexDb.db.query(`INSERT INTO embedding_chunk
      (kind, locator, chunk_seq, text, text_hash, model, dim, vector)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .run("discord", "discord://message/1", 0, "first", "hash-1", "test-model", 1, new Uint8Array([1]));
    indexDb.db.query(`INSERT INTO embedding_chunk
      (kind, locator, chunk_seq, text, text_hash, model, dim, vector)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .run("wiki", "wiki://section/1", 0, "second", "hash-2", "test-model", 1, new Uint8Array([2]));

    clearFtsTable(indexDb.db, "discord");
    clearEmbeddingChunks(indexDb.db, "discord");

    expect(indexDb.db.query("SELECT count(*) AS count FROM discord_fts").get()).toEqual({ count: 0 });
    expect(indexDb.db.query("SELECT kind FROM embedding_chunk").all()).toEqual([{ kind: "wiki" }]);

    clearEmbeddingChunks(indexDb.db);
    expect(indexDb.db.query("SELECT count(*) AS count FROM embedding_chunk").get()).toEqual({ count: 0 });
  });
});
