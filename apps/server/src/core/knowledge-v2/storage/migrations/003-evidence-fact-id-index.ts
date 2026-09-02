import type { KnowledgeStorageMigration } from "./types.js";

export const evidenceFactIdIndexMigration: KnowledgeStorageMigration = {
  version: 3,
  name: "evidence-fact-id-index",
  up(db) {
    db.exec("CREATE INDEX IF NOT EXISTS evidence_fact_id ON evidence(fact_id)");
  },
};
