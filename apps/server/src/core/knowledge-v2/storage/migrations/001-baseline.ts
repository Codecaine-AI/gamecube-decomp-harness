import { FULL_SCHEMA_DDL } from "../ddl.js";
import type { KnowledgeStorageMigration } from "./types.js";

export const baselineMigration: KnowledgeStorageMigration = {
  version: 1,
  name: "baseline",
  up(db) {
    db.exec(FULL_SCHEMA_DDL);
  },
};
