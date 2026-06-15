#!/usr/bin/env bun
import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";

interface UnitReport {
  name?: string;
  measures?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  functions?: Array<{ name?: string; fuzzy_match_percent?: unknown; size?: unknown }>;
}

interface ReportJson {
  units?: UnitReport[];
}

interface Options {
  repoRoot: string;
  sourcePath: string;
  baselineReport: string;
  currentReport: string;
}

function usage(): string {
  return [
    "Usage:",
    "  bun scripts/qa-repair-score-check.ts --repo-root path --source-path src/foo.c --baseline-report path [--current-report path]",
    "",
    "Outputs qa-repair score hook JSON with preTargetScore, postTargetScore, and scoreImpact.",
  ].join("\n");
}

function argValue(argv: string[], index: number): string {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`Missing value for ${argv[index]}`);
  return value;
}

function resolvePath(path: string): string {
  return isAbsolute(path) ? path : resolve(process.cwd(), path);
}

function parseArgs(argv: string[]): Options {
  let repoRoot = "";
  let sourcePath = "";
  let baselineReport = "";
  let currentReport = "";
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      console.log(usage());
      process.exit(0);
    }
    if (arg === "--repo-root") {
      repoRoot = resolvePath(argValue(argv, i));
      i += 1;
    } else if (arg === "--source-path") {
      sourcePath = argValue(argv, i).replace(/\\/g, "/").replace(/^\.\/+/, "");
      i += 1;
    } else if (arg === "--baseline-report") {
      baselineReport = resolvePath(argValue(argv, i));
      i += 1;
    } else if (arg === "--current-report") {
      currentReport = resolvePath(argValue(argv, i));
      i += 1;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (!repoRoot) throw new Error("--repo-root is required");
  if (!sourcePath) throw new Error("--source-path is required");
  if (!baselineReport) throw new Error("--baseline-report is required");
  if (!currentReport) currentReport = resolve(repoRoot, "build/GALE01/report.json");
  return { repoRoot, sourcePath, baselineReport, currentReport };
}

function readJson<T>(path: string): T {
  if (!existsSync(path)) throw new Error(`File not found: ${path}`);
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function numberValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\.\/+/, "").replace(/^\/+/, "");
}

function findUnit(report: ReportJson, sourcePath: string): UnitReport | null {
  const normalized = normalizePath(sourcePath);
  for (const unit of report.units ?? []) {
    const unitPath = normalizePath(stringValue(unit.metadata?.source_path));
    if (unitPath === normalized || unitPath.endsWith(`/${normalized}`) || normalized.endsWith(`/${unitPath}`)) return unit;
  }
  return null;
}

function unitScore(unit: UnitReport): number | null {
  return numberValue(unit.measures?.fuzzy_match_percent);
}

function functionScores(unit: UnitReport | null): Record<string, number> {
  const scores: Record<string, number> = {};
  for (const fn of unit?.functions ?? []) {
    const name = stringValue(fn.name);
    const score = numberValue(fn.fuzzy_match_percent);
    if (name && score !== null) scores[name] = score;
  }
  return scores;
}

function changedFunctions(before: UnitReport | null, after: UnitReport | null): Array<{ name: string; before: number | null; after: number | null }> {
  const beforeScores = functionScores(before);
  const afterScores = functionScores(after);
  const names = new Set([...Object.keys(beforeScores), ...Object.keys(afterScores)]);
  return [...names]
    .map((name) => ({ name, before: beforeScores[name] ?? null, after: afterScores[name] ?? null }))
    .filter((row) => row.before !== row.after)
    .sort((left, right) => left.name.localeCompare(right.name));
}

function main(): void {
  const options = parseArgs(process.argv.slice(2));
  const baseline = readJson<ReportJson>(options.baselineReport);
  const current = readJson<ReportJson>(options.currentReport);
  const before = findUnit(baseline, options.sourcePath);
  const after = findUnit(current, options.sourcePath);
  const preTargetScore = before ? unitScore(before) : null;
  const postTargetScore = after ? unitScore(after) : null;
  const scoreImpact =
    preTargetScore === null || postTargetScore === null
      ? "unknown"
      : postTargetScore + 0.000001 < preTargetScore
        ? "lower_score"
        : "same_match";
  const payload = {
    sourcePath: options.sourcePath,
    unitName: after?.name ?? before?.name ?? null,
    preTargetScore,
    postTargetScore,
    scoreImpact,
    score_impact: scoreImpact,
    changedFunctions: changedFunctions(before, after),
    baselineReport: options.baselineReport,
    currentReport: options.currentReport,
  };
  console.log(JSON.stringify(payload, null, 2));
  if (!before || !after) process.exitCode = 2;
  else if (scoreImpact === "lower_score") process.exitCode = 1;
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
}
