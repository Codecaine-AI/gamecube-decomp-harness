import { FINAL_SCHEMA_DDL } from "./final-schema.js";
import type { StorageMigration } from "./types.js";

export const baselineMigration: StorageMigration = {
  version: 1,
  name: "baseline",
  up(db) {
    db.exec(FINAL_SCHEMA_DDL);
  },
};
