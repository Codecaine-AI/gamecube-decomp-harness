import type { StorageMigration } from "./types.js";
import { RUN_RECOVERY_JOURNAL_DDL } from "./ddl.js";

export const runRecoveryJournalMigration: StorageMigration = {
  version: 8,
  name: "run_recovery_journal",
  up(db) {
    db.exec(RUN_RECOVERY_JOURNAL_DDL);
  },
};
