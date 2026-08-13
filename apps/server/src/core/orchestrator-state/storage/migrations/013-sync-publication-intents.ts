import { SYNC_PUBLICATION_INTENTS_DDL } from "./ddl.js";
import type { StorageMigration } from "./types.js";

export const syncPublicationIntentsMigration: StorageMigration = {
  version: 13,
  name: "sync_publication_intents",
  up(db) {
    // Converges if table/index creation committed before the migration row.
    db.exec(SYNC_PUBLICATION_INTENTS_DDL);
  },
};
