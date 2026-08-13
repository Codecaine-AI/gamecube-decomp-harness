import type { StorageMigration } from "./types.js";
import { PENDING_INTEGRATIONS_DDL } from "./ddl.js";

export const pendingIntegrationsMigration: StorageMigration = {
  version: 7,
  name: "pending_integrations",
  up(db) {
    // CREATE IF NOT EXISTS makes a partially applied migration converge when
    // the table was committed before its schema_migrations row.
    db.exec(PENDING_INTEGRATIONS_DDL);
  },
};
