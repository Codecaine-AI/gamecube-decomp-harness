import type { KnowledgeStorageMigration } from "./types.js";

export const workerRunIntegrationDetailMigration: KnowledgeStorageMigration = {
  version: 4,
  name: "worker-run-integration-detail",
  up(db) {
    const columns = db.query<{ name: string }, []>("PRAGMA table_info('worker_run')").all();
    if (columns.some(({ name }) => name === "integration_detail")) return;
    db.exec("ALTER TABLE worker_run ADD COLUMN integration_detail TEXT");
  },
};
