import { SYNC_STATE_DDL } from "./ddl.js";
import type { StorageMigration } from "./types.js";

export const syncStateMigration: StorageMigration = {
  version: 11,
  name: "sync_state",
  up(db) {
    // Both statements converge after a partially applied migration where the
    // table or index was committed before the schema_migrations row.
    db.exec(SYNC_STATE_DDL);
  },
};
