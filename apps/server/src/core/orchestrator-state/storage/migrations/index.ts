import type { Database } from "bun:sqlite";
import { immediateTransaction } from "../transaction.js";
import { baselineMigration } from "./001-baseline.js";
import { projectEventsMigration } from "./002-project-events.js";
import { projectStateMigration } from "./003-project-state.js";
import { projectSessionContainerMigration } from "./004-project-session-container.js";
import { runScopedRunIdMigration } from "./005-run-scoped-run-id.js";
import { runStateContractMigration } from "./006-run-state-contract.js";
import { pendingIntegrationsMigration } from "./007-pending-integrations.js";
import { runRecoveryJournalMigration } from "./008-run-recovery-journal.js";
import { pendingIntegrationAttemptsMigration } from "./009-pending-integration-attempts.js";
import { runScopedIndexNamesMigration } from "./010-run-scoped-index-names.js";
import { syncStateMigration } from "./011-sync-state.js";
import { syncPublicationMigration } from "./012-sync-publication.js";
import { syncPublicationIntentsMigration } from "./013-sync-publication-intents.js";
import { prCampaignMigration } from "./014-pr-campaign.js";
import { prBatchPublicationReservationsMigration } from "./015-pr-batch-publication-reservations.js";
import { eventConventionsMigration } from "./016-event-conventions.js";
import { backgroundKnowledgeJobsMigration } from "./017-background-knowledge-jobs.js";
import { SCHEMA_MIGRATIONS_DDL } from "./ddl.js";
import type { StorageMigration } from "./types.js";

export { rebuildTable } from "./rebuild-table.js";
export type { StorageMigration } from "./types.js";

export const storageMigrations: readonly StorageMigration[] = Object.freeze([
  baselineMigration,
  projectEventsMigration,
  projectStateMigration,
  projectSessionContainerMigration,
  runScopedRunIdMigration,
  runStateContractMigration,
  pendingIntegrationsMigration,
  runRecoveryJournalMigration,
  pendingIntegrationAttemptsMigration,
  runScopedIndexNamesMigration,
  syncStateMigration,
  syncPublicationMigration,
  syncPublicationIntentsMigration,
  prCampaignMigration,
  prBatchPublicationReservationsMigration,
  eventConventionsMigration,
  backgroundKnowledgeJobsMigration,
]);

interface AppliedMigrationRow {
  version: number;
  name: string;
}

function validateMigrations(migrations: readonly StorageMigration[]): void {
  let previousVersion = 0;
  for (const migration of migrations) {
    if (!Number.isInteger(migration.version) || migration.version <= previousVersion) {
      throw new Error(`Storage migrations must have strictly increasing positive integer versions: ${migration.version}`);
    }
    if (migration.name.length === 0) throw new Error(`Storage migration ${migration.version} has no name`);
    previousVersion = migration.version;
  }
}

export function runStorageMigrations(db: Database): void {
  validateMigrations(storageMigrations);

  immediateTransaction(db, () => {
    db.exec(SCHEMA_MIGRATIONS_DDL);

    const appliedRows = db
      .query("SELECT version, name FROM schema_migrations ORDER BY version")
      .all() as AppliedMigrationRow[];
    const knownByVersion = new Map(storageMigrations.map((migration) => [migration.version, migration]));
    const appliedVersions = new Set<number>();

    for (const row of appliedRows) {
      const known = knownByVersion.get(row.version);
      if (!known) throw new Error(`Database has unknown storage migration version ${row.version} (${row.name})`);
      if (known.name !== row.name) {
        throw new Error(
          `Storage migration ${row.version} name mismatch: database has ${row.name}, code expects ${known.name}`,
        );
      }
      appliedVersions.add(row.version);
    }

    const insertApplied = db.query(
      "INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)",
    );
    for (const migration of storageMigrations) {
      if (appliedVersions.has(migration.version)) continue;
      migration.up(db);
      insertApplied.run(migration.version, migration.name, new Date().toISOString());
    }
  });
}
