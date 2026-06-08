import { existsSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { readRegressionReport, type MetricChange, type PrPromotionEvaluation, type RegressionReportSummary, type ReportEntry } from "../objdiff/report.js";

export type TrustedReportStatus = "ready" | "missing" | "parse_error";

export interface TrustedReportCounts {
  newMatches: number;
  brokenMatches: number;
  improvements: number;
  fuzzyRegressions: number;
  metricRegressions: number;
  metricProgressions: number;
}

export interface TrustedReport {
  status: TrustedReportStatus;
  path: string;
  source: string;
  generatedAt: string | null;
  error?: string;
  counts: TrustedReportCounts;
  measures: RegressionReportSummary | null;
  promotion: PrPromotionEvaluation | null;
  newMatches: ReportEntry[];
  brokenMatches: ReportEntry[];
  improvements: ReportEntry[];
  fuzzyRegressions: ReportEntry[];
  metricRegressions: MetricChange[];
  metricProgressions: MetricChange[];
}

function emptyCounts(): TrustedReportCounts {
  return {
    newMatches: 0,
    brokenMatches: 0,
    improvements: 0,
    fuzzyRegressions: 0,
    metricRegressions: 0,
    metricProgressions: 0,
  };
}

function emptyTrustedReport(path: string, status: Exclude<TrustedReportStatus, "ready">, error?: string): TrustedReport {
  return {
    status,
    path,
    source: "build/GALE01/report_changes.json",
    generatedAt: null,
    ...(error ? { error } : {}),
    counts: emptyCounts(),
    measures: null,
    promotion: null,
    newMatches: [],
    brokenMatches: [],
    improvements: [],
    fuzzyRegressions: [],
    metricRegressions: [],
    metricProgressions: [],
  };
}

function errorText(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

export async function loadTrustedReport(repoRoot: string, maxRows = 100): Promise<TrustedReport> {
  const path = resolve(repoRoot, "build/GALE01/report_changes.json");
  if (!existsSync(path)) return emptyTrustedReport(path, "missing");

  try {
    const report = await readRegressionReport(path, "Current local report", maxRows);
    const mtime = statSync(path).mtime.toISOString();
    return {
      status: "ready",
      path,
      source: "build/GALE01/report_changes.json",
      generatedAt: mtime,
      counts: {
        newMatches: report.newMatches.length,
        brokenMatches: report.brokenMatches.length,
        improvements: report.improvements.length,
        fuzzyRegressions: report.fuzzyRegressions.length,
        metricRegressions: report.regressions.length,
        metricProgressions: report.progressions.length,
      },
      measures: report.summary,
      promotion: report.promotion,
      newMatches: report.newMatches.slice(0, maxRows),
      brokenMatches: report.brokenMatches.slice(0, maxRows),
      improvements: report.improvements.slice(0, maxRows),
      fuzzyRegressions: report.fuzzyRegressions.slice(0, maxRows),
      metricRegressions: report.regressions.slice(0, maxRows),
      metricProgressions: report.progressions.slice(0, maxRows),
    };
  } catch (error) {
    return emptyTrustedReport(path, "parse_error", errorText(error));
  }
}
