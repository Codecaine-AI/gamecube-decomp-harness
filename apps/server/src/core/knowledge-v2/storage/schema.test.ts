import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getTableName } from "drizzle-orm";
import { getTableConfig, type SQLiteTable } from "drizzle-orm/sqlite-core";
import { knowledgeV2Schema } from "./schema.js";
import { openKnowledgeStore, type KnowledgeStore } from "./store.js";

const tempDirs: string[] = [];
const stores: KnowledgeStore[] = [];

afterEach(() => {
  for (const store of stores.splice(0)) store.close();
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function openTempStore(): KnowledgeStore {
  const knowledgeRoot = mkdtempSync(join(tmpdir(), "knowledge-v2-schema-"));
  tempDirs.push(knowledgeRoot);
  const store = openKnowledgeStore({ knowledgeRoot });
  stores.push(store);
  return store;
}

describe("knowledge-v2 drizzle schema", () => {
  test("creates the merged-entity lookup index when opening a store", () => {
    const store = openTempStore();

    const indexes = store.db
      .query<{ name: string }, []>("PRAGMA index_list('entity')")
      .all()
      .map(({ name }) => name);

    expect(indexes).toContain("entity_merged_into_id");
  });

  test("matches every table, column, and named index in a fresh store", () => {
    const store = openTempStore();
    const drizzleTables = Object.values(knowledgeV2Schema) as SQLiteTable[];
    const actualTables = store.db
      .query<{ name: string }, []>(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
      )
      .all()
      .map(({ name }) => name);
    const declaredTables = drizzleTables.map(getTableName).sort();

    expect(actualTables).toEqual(declaredTables);

    for (const table of drizzleTables) {
      const config = getTableConfig(table);
      const actualColumns = store.db
        .query<{ name: string }, []>(`PRAGMA table_info('${config.name}')`)
        .all()
        .map(({ name }) => name)
        .sort();
      const declaredColumns = config.columns.map(({ name }) => name).sort();
      const actualIndexes = store.db
        .query<{ name: string }, []>(`PRAGMA index_list('${config.name}')`)
        .all()
        .map(({ name }) => name);

      expect(actualColumns, `${config.name} columns`).toEqual(declaredColumns);
      for (const declaredIndex of config.indexes) {
        expect(actualIndexes, `${config.name} index ${declaredIndex.config.name}`).toContain(
          declaredIndex.config.name,
        );
      }
    }
  });
});
