import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";

type JsonObject = Record<string, unknown>;

function asObject(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonObject) : {};
}

function stringValue(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function readJsonObject(path: string): JsonObject {
  try {
    if (!path || !existsSync(path)) return {};
    return asObject(JSON.parse(readFileSync(path, "utf8")));
  } catch {
    return {};
  }
}

export function latestChildDirectory(root: string): string {
  if (!existsSync(root)) return "";
  try {
    const dirs = readdirSync(root)
      .map((file) => resolve(root, file))
      .filter((path) => {
        try {
          return statSync(path).isDirectory();
        } catch {
          return false;
        }
      })
      .sort((left, right) => left.localeCompare(right));
    return dirs.length > 0 ? dirs[dirs.length - 1] ?? "" : "";
  } catch {
    return "";
  }
}

export function latestRegressionCheckSummary(stateDir: string, runId: string): JsonObject | null {
  const artifactDir = latestChildDirectory(resolve(stateDir, "regression_checks", runId));
  if (!artifactDir) return null;
  const summaryPath = resolve(artifactDir, "summary.json");
  const summary = readJsonObject(summaryPath);
  if (!summary.status) return null;
  return {
    ...summary,
    artifactDir,
    summaryPath,
  };
}

export function latestPrSplitPlanSummary(stateDir: string, runId: string): JsonObject | null {
  const artifactDir = latestChildDirectory(resolve(stateDir, "pr_handoff", runId, "split_plans"));
  if (!artifactDir) return null;
  const summaryPath = resolve(artifactDir, "summary.json");
  const summary = readJsonObject(summaryPath);
  if (!summary.status) return null;
  return {
    ...summary,
    artifactDir,
    summaryPath,
  };
}

export function latestQaRepairSummary(stateDir: string, runId: string): JsonObject | null {
  const artifactDir = latestChildDirectory(resolve(stateDir, "qa_repairs", runId));
  if (!artifactDir) return null;
  const summaryPath = resolve(artifactDir, "summary.json");
  const summary = readJsonObject(summaryPath);
  if (!summary.schema_version) return null;
  return {
    ...summary,
    artifactDir,
    summaryPath,
    queuePath: stringValue(summary.queue_path, resolve(artifactDir, "queue.json")),
    reportPath: stringValue(summary.report_path, resolve(artifactDir, "report.md")),
    shipStatusPath: stringValue(summary.ship_status_path, resolve(artifactDir, "ship_status.json")),
  };
}
