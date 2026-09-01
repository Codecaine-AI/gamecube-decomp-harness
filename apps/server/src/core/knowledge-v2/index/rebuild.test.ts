import { afterEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  insertDiscordMessages,
  insertPullRequestEntries,
  insertWikiSections,
  insertWorkerRun,
} from "../records/index.js";
import {
  createKnowledgeStoreOrm,
  openKnowledgeStore,
  type KnowledgeStore,
} from "../storage/store.js";
import { openKnowledgeIndexDb, type KnowledgeIndexDb } from "./db.js";
import { createFakeEmbeddingProvider } from "./embeddings/provider.js";
import { createEmptyPrArchive } from "./pr-archive.js";
import { rebuildSearchIndexes } from "./rebuild.js";

const tempDirs = new Set<string>();
const stores = new Set<KnowledgeStore>();
const indexDbs = new Set<KnowledgeIndexDb>();
const observerDbs = new Set<Database>();

afterEach(() => {
  for (const indexDb of indexDbs) indexDb.close();
  for (const store of stores) store.close();
  for (const db of observerDbs) db.close();
  indexDbs.clear();
  stores.clear();
  observerDbs.clear();
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
  tempDirs.clear();
});

function openFixture(name: string): {
  root: string;
  store: KnowledgeStore;
  indexDb: KnowledgeIndexDb;
} {
  const root = mkdtempSync(join(tmpdir(), `knowledge-v2-rebuild-${name}-`));
  tempDirs.add(root);
  const store = openKnowledgeStore({ knowledgeRoot: root });
  const indexDb = openKnowledgeIndexDb({ knowledgeRoot: root });
  stores.add(store);
  indexDbs.add(indexDb);
  return { root, store, indexDb };
}

function closeStore(store: KnowledgeStore): void {
  store.close();
  stores.delete(store);
}

function openReadonlyStore(path: string): KnowledgeStore {
  const db = new Database(path, { readonly: true });
  const store: KnowledgeStore = {
    db,
    orm: createKnowledgeStoreOrm(db),
    path,
    close() {
      db.close();
    },
  };
  stores.add(store);
  return store;
}

function insertUnitFixture(store: KnowledgeStore): void {
  store.db.query(`INSERT INTO entity
    (id, kind, locator, identity_status)
    VALUES ('unit-1', 'translation_unit', 'src/unit-1.c', 'active')`).run();
  store.db.query(`INSERT INTO target
    (id, kind, unit, unit_entity_id, symbol, stable_key, address, identity_status, report_revision)
    VALUES ('target-1', 'function', 'unit-1', 'unit-1', 'fixture_fn',
      'unit-1:fixture_fn', '0x80000000', 'current', 'rev-1')`).run();
}

function populateAllSources(store: KnowledgeStore): void {
  insertUnitFixture(store);
  insertDiscordMessages(store, [{
    id: "discord-1",
    channel: "dev",
    author: "author",
    postedAt: "2026-01-01T00:00:00.000Z",
    content: "discord fixture text",
  }]);
  insertWikiSections(store, [{
    id: "wiki-1",
    page: "Melee",
    section: "Physics",
    mirrorRevision: "r1",
    content: "wiki fixture text",
    ingestedAt: "2026-01-01T00:00:00.000Z",
  }]);
  insertPullRequestEntries(store, [{
    id: "pr-1",
    entityId: "unit-1",
    prRef: "42",
    summary: "PR fixture text",
    outcome: "improvement",
    mergedAt: "2026-01-01T00:00:00.000Z",
  }]);
  insertWorkerRun(store, {
    id: "worker-1",
    targetId: "target-1",
    goal: "Match the fixture",
    baseline: "{}",
    finalOutcome: "improvement",
    startedAt: "2026-01-01T00:00:00.000Z",
    closedAt: "2026-01-01T00:01:00.000Z",
  }, [{
    id: "submission-1",
    seq: 1,
    description: "attempt fixture text",
    hypothesis: "swap the branch",
    score: 1,
    submittedAt: "2026-01-01T00:00:30.000Z",
  }]);
}

function indexCounts(indexDb: KnowledgeIndexDb): Record<string, number> {
  const count = (table: string): number => {
    const row = indexDb.db.query(`SELECT count(*) AS count FROM ${table}`).get() as { count: number };
    return row.count;
  };
  return {
    discord: count("discord_fts"),
    wiki: count("wiki_fts"),
    pr: count("pr_fts"),
    attempt: count("attempt_fts"),
    embeddings: count("embedding_chunk"),
  };
}

function dataVersion(db: Database): number {
  const row = db.query<{ data_version: number }, []>("PRAGMA data_version").get();
  if (!row) throw new Error("PRAGMA data_version returned no row");
  return row.data_version;
}

describe("rebuildSearchIndexes", () => {
  test("rebuilds every FTS source and embedding kind without duplicates", async () => {
    const { store, indexDb } = openFixture("all");
    populateAllSources(store);
    const provider = createFakeEmbeddingProvider();
    const options = {
      fts: true,
      embeddings: true,
      provider,
      prArchive: createEmptyPrArchive(),
    };

    const first = await rebuildSearchIndexes(store, indexDb, options);
    const firstCounts = indexCounts(indexDb);
    const second = await rebuildSearchIndexes(store, indexDb, options);

    expect(first.fts).toEqual({ discord: 1, wiki: 1, pr: 1, attempt: 1 });
    expect(first.embeddings).toMatchObject({ embedded: 3, skipped: 0 });
    expect(firstCounts).toEqual({ discord: 1, wiki: 1, pr: 1, attempt: 1, embeddings: 3 });
    expect(second.fts).toEqual(first.fts);
    expect(second.embeddings).toMatchObject({ embedded: 3, skipped: 0 });
    expect(indexCounts(indexDb)).toEqual(firstCounts);
  });

  test("does not write to the canonical database", async () => {
    const { store, indexDb } = openFixture("readonly");
    populateAllSources(store);
    const canonicalPath = store.path;
    closeStore(store);

    const observer = new Database(canonicalPath, { readonly: true });
    observerDbs.add(observer);
    const before = dataVersion(observer);
    const readonlyStore = openReadonlyStore(canonicalPath);

    await rebuildSearchIndexes(readonlyStore, indexDb, {
      fts: true,
      embeddings: true,
      provider: createFakeEmbeddingProvider(),
      prArchive: createEmptyPrArchive(),
    });

    expect(dataVersion(observer)).toBe(before);
  });

  test("limits FTS and embeddings to the requested sources", async () => {
    const { store, indexDb } = openFixture("source-filter");
    populateAllSources(store);

    const result = await rebuildSearchIndexes(store, indexDb, {
      fts: true,
      embeddings: true,
      sources: ["discord"],
      provider: createFakeEmbeddingProvider(),
      prArchive: createEmptyPrArchive(),
    });

    expect(result.fts).toEqual({ discord: 1 });
    expect(indexCounts(indexDb)).toEqual({
      discord: 1,
      wiki: 0,
      pr: 0,
      attempt: 0,
      embeddings: 1,
    });
    expect(indexDb.db.query("SELECT DISTINCT kind FROM embedding_chunk ORDER BY kind").all()).toEqual([
      { kind: "discord" },
    ]);
  });

  test("rejects embedding rebuilds without a provider", async () => {
    const { store, indexDb } = openFixture("missing-provider");

    await expect(rebuildSearchIndexes(store, indexDb, {
      fts: false,
      embeddings: true,
    })).rejects.toThrow(/embedding provider/i);
  });
});
