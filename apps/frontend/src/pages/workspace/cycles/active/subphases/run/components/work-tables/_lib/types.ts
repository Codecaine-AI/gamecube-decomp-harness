import type { Dashboard } from "@/lib/format";

export type ImprovedMode = "confirmed" | "tentative";
export type ImprovedResultMode = "matches" | "improvements";
export type WorkMode = "active" | "epoch";

export interface WorkTablesProps {
  dashboard: Dashboard | null;
  improvedMode: ImprovedMode;
  improvedPage: number;
  setImprovedMode: (mode: ImprovedMode) => void;
  setImprovedPage: (page: number | ((page: number) => number)) => void;
  setWorkMode: (mode: WorkMode) => void;
  workMode: WorkMode;
}
