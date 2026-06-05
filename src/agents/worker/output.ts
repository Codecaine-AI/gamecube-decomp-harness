import type { WorkerReportType } from "../../types/index.js";
import { parseJsonObject } from "../runtime/index.js";

export function parseWorkerAgentReport(rawText: string): { report: Record<string, unknown> | null; error?: string } {
  const parsed = parseJsonObject(rawText);
  return { report: parsed.object, error: parsed.error };
}

export function isWorkerReportType(value: unknown): value is WorkerReportType {
  return value === "stalled_no_useful_guess" || value === "progress" || value === "needs_fact" || value === "score_candidate";
}
