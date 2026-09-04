import { Database } from "bun:sqlite";
import { immediateTransaction } from "../transaction.js";
import { baselineMigration } from "./001-baseline.js";
import { dropLegacyEpochColumnsMigration } from "./002-drop-legacy-epoch-columns.js";
import { addEpochBoundaryRetryMigration } from "./003-add-epoch-boundary-retry.js";
import { addTargetInfraFailureCountMigration } from "./004-add-target-infra-failure-count.js";
import { dropLegacySyncKnowledgeTablesMigration } from "./005-drop-legacy-sync-knowledge-tables.js";
import { SCHEMA_MIGRATIONS_DDL } from "./ddl.js";
import type { StorageMigration } from "./types.js";

export type { StorageMigration } from "./types.js";

export const storageMigrations: readonly StorageMigration[] = Object.freeze([
  baselineMigration,
  dropLegacyEpochColumnsMigration,
  addEpochBoundaryRetryMigration,
  addTargetInfraFailureCountMigration,
  dropLegacySyncKnowledgeTablesMigration,
]);

interface AppliedMigrationRow {
  version: number;
  name: string;
}

export type MigrationBookkeepingStatus = "behind" | "exact" | "ahead" | "divergent";

export function classifyMigrationBookkeeping(
  applied: readonly AppliedMigrationRow[],
  known: readonly Pick<StorageMigration, "version" | "name">[],
): MigrationBookkeepingStatus {
  const sharedLength = Math.min(applied.length, known.length);
  for (let index = 0; index < sharedLength; index += 1) {
    if (
      applied[index]?.version !== known[index]?.version ||
      applied[index]?.name !== known[index]?.name
    ) {
      return "divergent";
    }
  }
  if (applied.length < known.length) return "behind";
  if (applied.length > known.length) return "ahead";
  return "exact";
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

function readAppliedMigrations(db: Database): AppliedMigrationRow[] {
  return db
    .query("SELECT version, name FROM schema_migrations ORDER BY version")
    .all() as AppliedMigrationRow[];
}

function aheadWarning(applied: AppliedMigrationRow[]): string {
  return `schema is ahead of this process: applied through v${applied.at(-1)?.version}, this build knows v${storageMigrations.at(-1)?.version}`;
}

export function verifyStorageSchema(db: Database): void {
  const knownVersion = storageMigrations.at(-1)?.version ?? 0;
  if (!tableExists(db, "schema_migrations")) {
    throw new Error(
      `schema is behind this process: no migration bookkeeping exists, this build requires v${knownVersion}`,
    );
  }

  const applied = readAppliedMigrations(db);
  const status = classifyMigrationBookkeeping(applied, storageMigrations);
  if (status === "behind") {
    throw new Error(
      `schema is behind this process: applied through v${applied.at(-1)?.version ?? 0}, this build requires v${knownVersion}`,
    );
  }

  if (status === "divergent") {
    throw new Error(
      `Storage migration bookkeeping diverges from this build: ${JSON.stringify(applied)}.`,
    );
  }
  if (!hasBaselineSentinels(db)) {
    throw new Error("Storage schema is missing required baseline sentinels.");
  }
  if (status === "ahead") console.warn(aheadWarning(applied));
}

function resetBaselineBookkeeping(db: Database): void {
  db.exec("DELETE FROM schema_migrations");
  db.query("INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)").run(
    baselineMigration.version,
    baselineMigration.name,
    new Date().toISOString(),
  );
}

function applyPendingMigrations(db: Database): void {
  const appliedVersions = new Set(
    (db.query("SELECT version FROM schema_migrations").all() as Array<{ version: number }>).map(
      ({ version }) => version,
    ),
  );
  for (const migration of storageMigrations) {
    if (appliedVersions.has(migration.version)) continue;
    migration.up(db);
    db.query("INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)").run(
      migration.version,
      migration.name,
      new Date().toISOString(),
    );
  }
}

export function runStorageMigrations(db: Database): void {
  immediateTransaction(db, () => {
    ensureBookkeepingTable(db);

    const applied = readAppliedMigrations(db);
    if (applied.length > 0) {
      const bookkeepingStatus = classifyMigrationBookkeeping(applied, storageMigrations);
      const hasSentinels = hasBaselineSentinels(db);
      if (bookkeepingStatus === "ahead") {
        if (!hasSentinels) {
          throw new Error(
            `Storage schema is not the squashed baseline (bookkeeping: ${JSON.stringify(applied)}). Missing baseline sentinels.`,
          );
        }
        console.warn(aheadWarning(applied));
        return;
      }
      if ((bookkeepingStatus === "behind" || bookkeepingStatus === "exact") && hasSentinels) {
        applyPendingMigrations(db);
        return;
      }
      if (bookkeepingStatus === "divergent" || !hasSentinels) {
        throw new Error(
          `Storage schema is not the squashed baseline (bookkeeping: ${JSON.stringify(applied)}). ` +
            "Migration bookkeeping diverges from this build or baseline sentinels are missing.",
        );
      }
    }

    if (applicationObjectCount(db) === 0) {
      baselineMigration.up(db);
      resetBaselineBookkeeping(db);
      applyPendingMigrations(db);
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
    applyPendingMigrations(db);
  });
}
