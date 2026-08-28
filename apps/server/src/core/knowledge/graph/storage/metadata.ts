import type { KnowledgeGraphStore } from "./store.js";

export interface ReportProvenance {
  path: string;
  mtimeMs: number;
  sha256: string;
  revision: string | null;
  matchedCodePercent: number | null;
}

const REPORT_PROVENANCE_KEY = "board_report_provenance";

export function writeReportProvenance(store: KnowledgeGraphStore, provenance: ReportProvenance): void {
  store.db.query(`
    INSERT INTO knowledge_graph_metadata (key, value_json, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at
  `).run(REPORT_PROVENANCE_KEY, JSON.stringify(provenance), new Date().toISOString());
}

export function readReportProvenance(store: KnowledgeGraphStore): ReportProvenance | null {
  const row = store.db.query("SELECT value_json FROM knowledge_graph_metadata WHERE key = ?")
    .get(REPORT_PROVENANCE_KEY) as { value_json: string } | null;
  if (!row) return null;
  return JSON.parse(row.value_json) as ReportProvenance;
}
