import { PROJECT_EVENTS_DDL } from "./ddl.js";
import type { StorageMigration } from "./types.js";

export const projectEventsMigration: StorageMigration = {
  version: 2,
  name: "project_events",
  up(db) {
    db.exec(PROJECT_EVENTS_DDL);
  },
};
