import { BACKGROUND_KNOWLEDGE_JOBS_DDL } from "./ddl.js";
import type { StorageMigration } from "./types.js";

export const backgroundKnowledgeJobsMigration: StorageMigration = {
  version: 17,
  name: "background_knowledge_jobs",
  up(db) {
    db.exec(BACKGROUND_KNOWLEDGE_JOBS_DDL);
  },
};
