import { PROJECT_STATE_DDL } from "./ddl.js";
import type { StorageMigration } from "./types.js";

export const projectStateMigration: StorageMigration = {
  version: 3,
  name: "project_state",
  up(db) {
    db.exec(PROJECT_STATE_DDL);
  },
};
