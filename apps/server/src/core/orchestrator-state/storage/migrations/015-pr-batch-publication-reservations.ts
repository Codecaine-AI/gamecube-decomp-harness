import { PR_BATCH_PUBLICATION_RESERVATIONS_DDL } from "./ddl.js";
import type { StorageMigration } from "./types.js";

export const prBatchPublicationReservationsMigration: StorageMigration = {
  version: 15,
  name: "pr_batch_publication_reservations",
  up(db) {
    db.exec(PR_BATCH_PUBLICATION_RESERVATIONS_DDL);
  },
};
