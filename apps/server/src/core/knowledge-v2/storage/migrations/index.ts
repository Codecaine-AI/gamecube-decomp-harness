import type { Database } from "bun:sqlite";
import { immediateTransaction } from "../transaction.js";
import { baselineMigration } from "./001-baseline.js";
import { runNarrativeMigration } from "./002-run-narrative.js";
import { evidenceFactIdIndexMigration } from "./003-evidence-fact-id-index.js";
import { SCHEMA_MIGRATIONS_DDL } from "./ddl.js";
import type { KnowledgeStorageMigration } from "./types.js";

export type { KnowledgeStorageMigration } from "./types.js";

export const knowledgeStorageMigrations: readonly KnowledgeStorageMigration[] = Object.freeze([
  baselineMigration,
  runNarrativeMigration,
  evidenceFactIdIndexMigration,
]);

interface AppliedMigrationRow {
  version: number;
  name: string;
}

function readAppliedMigrations(db: Database): AppliedMigrationRow[] {
  return db
    .query("SELECT version, name FROM schema_migrations ORDER BY version")
    .all() as AppliedMigrationRow[];
}

function validateAppliedMigrations(applied: readonly AppliedMigrationRow[]): void {
  for (let index = 0; index < applied.length; index += 1) {
    const row = applied[index];
    const expected = knowledgeStorageMigrations[index];
    if (!row || !expected || row.version !== expected.version || row.name !== expected.name) {
      throw new Error(
        `Knowledge storage migration bookkeeping diverges from this build: ${JSON.stringify(applied)}.`,
      );
    }
  }
}

export function runKnowledgeStorageMigrations(db: Database): void {
  immediateTransaction(db, () => {
    db.exec(SCHEMA_MIGRATIONS_DDL);
    const applied = readAppliedMigrations(db);
    validateAppliedMigrations(applied);
    const appliedVersions = new Set(applied.map(({ version }) => version));
    const insertMigration = db.query(
      "INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)",
    );
    for (const migration of knowledgeStorageMigrations) {
      if (appliedVersions.has(migration.version)) continue;
      migration.up(db);
      insertMigration.run(migration.version, migration.name, new Date().toISOString());
    }
  });
}
