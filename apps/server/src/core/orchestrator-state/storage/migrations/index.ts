import { Database } from "bun:sqlite";
import { immediateTransaction } from "../transaction.js";
import { baselineMigration } from "./001-baseline.js";
import { SCHEMA_MIGRATIONS_DDL } from "./ddl.js";
import type { StorageMigration } from "./types.js";

export type { StorageMigration } from "./types.js";

export const storageMigrations: readonly StorageMigration[] = Object.freeze([baselineMigration]);

interface AppliedMigrationRow {
  version: number;
  name: string;
}

interface SchemaObjectRow {
  type: string;
  name: string;
  tbl_name: string;
  sql: string;
}

function tableExists(db: Database, table: string): boolean {
  return Boolean(db.query("SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = ?").get(table));
}

function ensureBookkeepingTable(db: Database): void {
  if (!tableExists(db, "schema_migrations")) db.exec(SCHEMA_MIGRATIONS_DDL);
}

function columnExists(db: Database, table: string, column: string): boolean {
  if (!tableExists(db, table)) return false;
  const quoted = `"${table.replaceAll('"', '""')}"`;
  return (db.query(`PRAGMA table_info(${quoted})`).all() as Array<{ name: string }>).some(
    (row) => row.name === column,
  );
}

function hasBaselineSentinels(db: Database): boolean {
  return (
    tableExists(db, "game_events") &&
    tableExists(db, "harness_state") &&
    tableExists(db, "cycles") &&
    tableExists(db, "game_upstream_anchors") &&
    columnExists(db, "dispatch_handoff_snapshots", "terminal_game_revision")
  );
}

function schemaObjects(db: Database): SchemaObjectRow[] {
  return db
    .query(`
      SELECT type, name, tbl_name, sql
      FROM sqlite_schema
      WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%'
      ORDER BY
        CASE type WHEN 'table' THEN 0 WHEN 'index' THEN 1 WHEN 'trigger' THEN 2 WHEN 'view' THEN 3 ELSE 4 END,
        name
    `)
    .all() as SchemaObjectRow[];
}

function schemaMatchesBaseline(db: Database): boolean {
  const expected = new Database(":memory:");
  try {
    expected.exec(SCHEMA_MIGRATIONS_DDL);
    baselineMigration.up(expected);
    return JSON.stringify(schemaObjects(db)) === JSON.stringify(schemaObjects(expected));
  } finally {
    expected.close();
  }
}

function applicationObjectCount(db: Database): number {
  const row = db
    .query(`
      SELECT count(*) AS count
      FROM sqlite_schema
      WHERE sql IS NOT NULL
        AND name NOT LIKE 'sqlite_%'
        AND name != 'schema_migrations'
    `)
    .get() as { count: number };
  return Number(row.count);
}

function resetBaselineBookkeeping(db: Database): void {
  db.exec("DELETE FROM schema_migrations");
  db.query("INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)").run(
    baselineMigration.version,
    baselineMigration.name,
    new Date().toISOString(),
  );
}

export function runStorageMigrations(db: Database): void {
  immediateTransaction(db, () => {
    ensureBookkeepingTable(db);

    const applied = db
      .query("SELECT version, name FROM schema_migrations ORDER BY version")
      .all() as AppliedMigrationRow[];
    if (
      applied.length === 1 &&
      applied[0]?.version === baselineMigration.version &&
      applied[0]?.name === baselineMigration.name &&
      hasBaselineSentinels(db)
    ) {
      return;
    }

    if (applicationObjectCount(db) === 0) {
      baselineMigration.up(db);
      resetBaselineBookkeeping(db);
      return;
    }

    if (!schemaMatchesBaseline(db)) {
      throw new Error(
        `Storage schema is not the squashed baseline (bookkeeping: ${JSON.stringify(applied)}). ` +
          "No compat migration path exists: recreate the state directory, or align the schema with the squashed baseline manually. Live orchestrator databases are product state - recreating one is an operator decision.",
      );
    }

    if (
      applied.length !== 1 ||
      applied[0]?.version !== baselineMigration.version ||
      applied[0]?.name !== baselineMigration.name
    ) {
      resetBaselineBookkeeping(db);
    }
  });
}
