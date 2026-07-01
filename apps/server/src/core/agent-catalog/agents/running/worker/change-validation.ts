import { existsSync, statSync } from "node:fs";
import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, resolve } from "node:path";
import { runQaScanDiff, type QaScanFinding, type QaScanInvocation, type RunQaScanDiffOptions } from "@server/core/validation/qa";
import { runCommand, type CommandResult } from "@server/infrastructure/shell";
import { packageRoot } from "@server/core/knowledge";
import type { WorkerRunnerValidation } from "./runner-validation.js";

const SCORE_EPSILON = 0.000001;
const EXACT_SCORE = 99.99999;
const DEFAULT_WORKER_NINJA_CONCURRENCY = 12;
const WORKER_NINJA_SLOT_STALE_MS = 60 * 60 * 1000;
const WORKER_NINJA_SLOT_MISSING_OWNER_STALE_MS = 30 * 1000;

export interface WorkerUnitScore {
  name: string;
  score: number;
  size?: number;
}

export interface WorkerUnitScoreSnapshot {
  schemaVersion: 1;
  capturedAt: string;
  unit: string;
  symbol: string;
  sourcePath: string;
  objectTarget: string | null;
  metrics: WorkerUnitScore[];
  functions: WorkerUnitScore[];
  sections: WorkerUnitScore[];
  targetScore: number | null;
}

export interface WorkerValidationCommandResult extends CommandResult {
  command: string[];
  stdoutPath: string;
  stderrPath: string;
}

export interface WorkerChangeBaseline {
  status: "available" | "build_failed" | "snapshot_unavailable";
  reasons: string[];
  snapshot: WorkerUnitScoreSnapshot | null;
  snapshotPath?: string;
  diffPath?: string;
  objectTarget?: string | null;
  objectBuild?: WorkerValidationCommandResult;
  unitDiff?: WorkerValidationCommandResult;
  /** Directory holding pre-attempt copies of the target source files (repo-relative layout). */
  sourceSnapshotDir?: string;
  /** Repo-relative paths that were actually copied into sourceSnapshotDir. */
  sourceSnapshotPaths?: string[];
}

/** Injectable scan_diff runner so tests (and callers) can fake the QA scanner. */
export type QaScanRunner = (options: RunQaScanDiffOptions) => Promise<QaScanInvocation>;

export interface WorkerQaLint {
  status: "clean" | "warnings" | "violations" | "tool_unavailable" | "skipped";
  /** scan_diff.py exit code; null when the scanner was never invoked. */
  exitCode: number | null;
  findings: QaScanFinding[];
  /** Path to the attempt's qa_diff.patch handed to the scanner; null when no scan ran. */
  scanPath: string | null;
  /** Scanner/diff infrastructure failure detail; L1 fails open but records it. */
  toolError: string | null;
}

export type WorkerChangeValidation = WorkerRunnerValidation & { qaLint: WorkerQaLint | null };

interface ObjdiffSideRows {
  functions: WorkerUnitScore[];
  sections: WorkerUnitScore[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function stringValue(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function numberValue(value: unknown, fallback = NaN): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function scoreFromRow(row: Record<string, unknown>): number {
  return numberValue(row.match_percent, numberValue(row.fuzzy_match_percent, NaN));
}

function objectTargetFromSourcePath(sourcePath: string): string | null {
  if (!sourcePath) return null;
  const withoutExtension = sourcePath.replace(/\.[^./\\]+$/, "");
  if (withoutExtension === sourcePath) return null;
  return `build/GALE01/${withoutExtension}.o`;
}

function scoredSideRows(side: unknown): ObjdiffSideRows {
  const record = isRecord(side) ? side : {};
  const sections: WorkerUnitScore[] = [];
  const functions: WorkerUnitScore[] = [];

  for (const sectionValue of arrayValue(record.sections)) {
    const section = isRecord(sectionValue) ? sectionValue : {};
    const name = stringValue(section.name);
    const score = scoreFromRow(section);
    if (!name || !Number.isFinite(score)) continue;
    sections.push({
      name,
      score,
      size: finiteOptionalNumber(section.size),
    });
  }

  for (const symbolValue of arrayValue(record.symbols)) {
    const symbol = isRecord(symbolValue) ? symbolValue : {};
    const name = stringValue(symbol.name);
    const score = scoreFromRow(symbol);
    if (!name || !Number.isFinite(score) || !Array.isArray(symbol.instructions)) continue;
    functions.push({
      name,
      score,
      size: finiteOptionalNumber(symbol.size),
    });
  }

  return { functions, sections };
}

function finiteOptionalNumber(value: unknown): number | undefined {
  const parsed = numberValue(value, NaN);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function scoreCount(rows: ObjdiffSideRows): number {
  return rows.functions.length + rows.sections.length;
}

function chooseObjdiffRows(report: Record<string, unknown>): ObjdiffSideRows {
  const left = scoredSideRows(report.left);
  const right = scoredSideRows(report.right);
  return scoreCount(right) > scoreCount(left) ? right : left;
}

function weightedPercent(rows: WorkerUnitScore[], exactOnly = false): number | null {
  let totalSize = 0;
  let matchedSize = 0;
  for (const row of rows) {
    const size = row.size ?? 0;
    if (size <= 0) continue;
    totalSize += size;
    matchedSize += exactOnly ? (row.score >= EXACT_SCORE ? size : 0) : (size * row.score) / 100;
  }
  if (totalSize <= 0) return null;
  return Number(((matchedSize / totalSize) * 100).toFixed(6));
}

function percent(part: number, whole: number): number | null {
  if (whole <= 0) return null;
  return Number(((part / whole) * 100).toFixed(6));
}

function unitMetrics(rows: ObjdiffSideRows): WorkerUnitScore[] {
  const metrics: WorkerUnitScore[] = [];
  const textSection = rows.sections.find((section) => section.name === ".text");
  const fuzzy = textSection?.score ?? weightedPercent(rows.functions);
  if (fuzzy !== null && fuzzy !== undefined && Number.isFinite(fuzzy)) {
    metrics.push({ name: "fuzzy_match_percent", score: fuzzy, size: textSection?.size });
  }

  const functionBytes = rows.functions.reduce((sum, row) => sum + (row.size ?? 0), 0);
  const matchedFunctionBytes = rows.functions.reduce((sum, row) => sum + (row.score >= EXACT_SCORE ? row.size ?? 0 : 0), 0);
  const matchedCodePercent = percent(matchedFunctionBytes, functionBytes);
  if (matchedCodePercent !== null) {
    metrics.push({ name: "matched_code_percent", score: matchedCodePercent, size: functionBytes });
  }

  const dataSections = rows.sections.filter((section) => section.name !== ".text");
  const dataBytes = dataSections.reduce((sum, row) => sum + (row.size ?? 0), 0);
  const matchedDataPercent = weightedPercent(dataSections, true);
  if (matchedDataPercent !== null) {
    metrics.push({ name: "matched_data_percent", score: matchedDataPercent, size: dataBytes });
  }

  if (rows.functions.length > 0) {
    const matchedFunctions = rows.functions.filter((row) => row.score >= EXACT_SCORE).length;
    metrics.push({ name: "matched_functions_percent", score: Number(((matchedFunctions / rows.functions.length) * 100).toFixed(6)), size: rows.functions.length });
  }

  return metrics;
}

function snapshotFromObjdiffReport(params: {
  report: Record<string, unknown>;
  unit: string;
  symbol: string;
  sourcePath: string;
  objectTarget: string | null;
}): WorkerUnitScoreSnapshot | null {
  const rows = chooseObjdiffRows(params.report);
  if (rows.functions.length === 0 && rows.sections.length === 0) return null;
  const target = rows.functions.find((row) => row.name === params.symbol);
  return {
    schemaVersion: 1,
    capturedAt: new Date().toISOString(),
    unit: params.unit,
    symbol: params.symbol,
    sourcePath: params.sourcePath,
    objectTarget: params.objectTarget,
    metrics: unitMetrics(rows),
    functions: rows.functions,
    sections: rows.sections,
    targetScore: target?.score ?? null,
  };
}

async function runValidationCommand(repoRoot: string, command: string[], stdoutPath: string, stderrPath: string): Promise<WorkerValidationCommandResult> {
  let result: CommandResult;
  try {
    result = command[0] === "ninja"
      ? await withWorkerNinjaSlot(repoRoot, () => runCommand(repoRoot, command))
      : await runCommand(repoRoot, command);
  } catch (error) {
    const message = error instanceof Error ? error.stack ?? error.message : String(error);
    result = { exitCode: 127, stdout: "", stderr: message };
  }
  await writeFile(stdoutPath, result.stdout);
  await writeFile(stderrPath, result.stderr);
  return { ...result, command, stdoutPath, stderrPath };
}

function workerNinjaConcurrency(): number {
  const parsed = Number(process.env.ORCH_WORKER_COMPILE_CONCURRENCY ?? process.env.ORCH_WORKER_NINJA_CONCURRENCY);
  if (!Number.isFinite(parsed)) return DEFAULT_WORKER_NINJA_CONCURRENCY;
  return Math.max(1, Math.min(64, Math.floor(parsed)));
}

function workerNinjaQueueDir(repoRoot: string): string {
  const worktreeDir = dirname(repoRoot);
  const workersDir = dirname(worktreeDir);
  if (basename(workersDir) === "workers") return resolve(dirname(workersDir), ".worker-ninja-slots");
  return resolve(dirname(worktreeDir), ".worker-ninja-slots");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

async function workerNinjaSlotIsStale(slotDir: string): Promise<boolean> {
  const ageMs = (() => {
    try {
      return Date.now() - statSync(slotDir).mtimeMs;
    } catch {
      return WORKER_NINJA_SLOT_STALE_MS + 1;
    }
  })();

  try {
    const owner = JSON.parse(await readFile(resolve(slotDir, "owner.json"), "utf8")) as { pid?: unknown };
    const pid = typeof owner.pid === "number" ? owner.pid : 0;
    if (pid > 0) {
      try {
        process.kill(pid, 0);
        return ageMs > WORKER_NINJA_SLOT_STALE_MS;
      } catch {
        return true;
      }
    }
  } catch {
    return ageMs > WORKER_NINJA_SLOT_MISSING_OWNER_STALE_MS;
  }

  return ageMs > WORKER_NINJA_SLOT_STALE_MS;
}

async function acquireWorkerNinjaSlot(repoRoot: string): Promise<() => Promise<void>> {
  const queueDir = workerNinjaQueueDir(repoRoot);
  const limit = workerNinjaConcurrency();
  await mkdir(queueDir, { recursive: true });
  for (;;) {
    for (let index = 0; index < limit; index += 1) {
      const slotDir = resolve(queueDir, `slot-${index}`);
      try {
        await mkdir(slotDir);
        await writeFile(
          resolve(slotDir, "owner.json"),
          JSON.stringify({ pid: process.pid, repoRoot, acquiredAt: new Date().toISOString() }, null, 2),
        );
        return async () => {
          await rm(slotDir, { recursive: true, force: true });
        };
      } catch (error) {
        if ((error as { code?: string }).code !== "EEXIST") throw error;
        if (await workerNinjaSlotIsStale(slotDir)) {
          await rm(slotDir, { recursive: true, force: true });
          continue;
        }
      }
    }
    await sleep(250 + Math.floor(Math.random() * 500));
  }
}

async function withWorkerNinjaSlot<T>(repoRoot: string, run: () => Promise<T>): Promise<T> {
  const release = await acquireWorkerNinjaSlot(repoRoot);
  try {
    return await run();
  } finally {
    await release();
  }
}

function isSafeRepoRelativePath(path: string): boolean {
  return Boolean(path) && !isAbsolute(path) && !path.split(/[\\/]/).includes("..");
}

async function snapshotPreWorkerSources(params: { repoRoot: string; outputDir: string; paths: string[] }): Promise<{ dir: string; copied: string[] }> {
  const dir = resolve(params.outputDir, "pre_worker_source");
  const copied: string[] = [];
  for (const relPath of new Set(params.paths)) {
    if (!isSafeRepoRelativePath(relPath)) continue;
    const source = resolve(params.repoRoot, relPath);
    if (!existsSync(source)) continue;
    const destination = resolve(dir, relPath);
    try {
      await mkdir(dirname(destination), { recursive: true });
      await copyFile(source, destination);
      copied.push(relPath);
    } catch {
      // A failed copy only degrades the QA lint scan to "skipped" later;
      // baseline capture must never fail on it.
    }
  }
  return { dir, copied };
}

export async function captureWorkerChangeBaseline(params: {
  repoRoot: string;
  outputDir: string;
  target: Record<string, unknown>;
  dryRun?: boolean;
  /** Additional repo-relative paths to snapshot for the L1 QA lint diff. */
  extraPaths?: string[];
}): Promise<WorkerChangeBaseline> {
  await mkdir(params.outputDir, { recursive: true });
  const unit = stringValue(params.target.unit);
  const symbol = stringValue(params.target.symbol);
  const sourcePath = stringValue(params.target.source_path);
  const objectTarget = objectTargetFromSourcePath(sourcePath);
  const reasons: string[] = [];

  if (params.dryRun) {
    return {
      status: "snapshot_unavailable",
      reasons: ["dry-run agents do not execute pre-worker same-unit baseline validation"],
      snapshot: null,
      objectTarget,
    };
  }

  const sourceSnapshot = await snapshotPreWorkerSources({
    repoRoot: params.repoRoot,
    outputDir: params.outputDir,
    paths: [sourcePath, ...(params.extraPaths ?? [])],
  });
  const sourceSnapshotDir = sourceSnapshot.dir;
  const sourceSnapshotPaths = sourceSnapshot.copied;

  if (!unit) reasons.push("target unit is missing");
  if (!symbol) reasons.push("target symbol is missing");
  if (!sourcePath) reasons.push("target source_path is missing");
  if (!objectTarget) reasons.push("could not derive object target from target source_path");
  if (reasons.length > 0 || !objectTarget) {
    return { status: "snapshot_unavailable", reasons, snapshot: null, objectTarget, sourceSnapshotDir, sourceSnapshotPaths };
  }

  const objectBuild = await runValidationCommand(
    params.repoRoot,
    ["ninja", objectTarget],
    resolve(params.outputDir, "pre_worker_object_build.stdout.txt"),
    resolve(params.outputDir, "pre_worker_object_build.stderr.txt"),
  );
  if (objectBuild.exitCode !== 0) {
    return {
      status: "build_failed",
      reasons: [`pre-worker object build exited ${objectBuild.exitCode}`],
      snapshot: null,
      objectTarget,
      objectBuild,
      sourceSnapshotDir,
      sourceSnapshotPaths,
    };
  }

  const diffPath = resolve(params.outputDir, "pre_worker_unit_diff.json");
  const unitDiff = await runValidationCommand(
    params.repoRoot,
    ["build/tools/objdiff-cli", "diff", "-p", ".", "-u", unit, "--format", "json-pretty", "-o", diffPath],
    resolve(params.outputDir, "pre_worker_unit_diff.stdout.txt"),
    resolve(params.outputDir, "pre_worker_unit_diff.stderr.txt"),
  );
  if (unitDiff.exitCode !== 0 || !existsSync(diffPath)) {
    return {
      status: "snapshot_unavailable",
      reasons: [`pre-worker unit diff exited ${unitDiff.exitCode}`],
      snapshot: null,
      diffPath,
      objectTarget,
      objectBuild,
      unitDiff,
      sourceSnapshotDir,
      sourceSnapshotPaths,
    };
  }

  let snapshot: WorkerUnitScoreSnapshot | null = null;
  try {
    const report = JSON.parse(await readFile(diffPath, "utf8")) as unknown;
    snapshot = isRecord(report) ? snapshotFromObjdiffReport({ report, unit, symbol, sourcePath, objectTarget }) : null;
  } catch (error) {
    reasons.push(`could not parse pre-worker unit diff: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!snapshot) {
    return {
      status: "snapshot_unavailable",
      reasons: reasons.length > 0 ? reasons : ["pre-worker unit diff did not contain usable same-unit scores"],
      snapshot: null,
      diffPath,
      objectTarget,
      objectBuild,
      unitDiff,
      sourceSnapshotDir,
      sourceSnapshotPaths,
    };
  }

  const snapshotPath = resolve(params.outputDir, "pre_worker_unit_snapshot.json");
  await writeFile(snapshotPath, JSON.stringify(snapshot, null, 2));
  return {
    status: "available",
    reasons: [],
    snapshot,
    snapshotPath,
    diffPath,
    objectTarget,
    objectBuild,
    unitDiff,
    sourceSnapshotDir,
    sourceSnapshotPaths,
  };
}

function scoreMap(rows: WorkerUnitScore[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const row of rows) map.set(row.name, row.score);
  return map;
}

function compareRows(params: {
  kind: "unit" | "function" | "section";
  unit: string;
  beforeRows: WorkerUnitScore[];
  afterRows: WorkerUnitScore[];
  regressions: NonNullable<WorkerRunnerValidation["regressions"]>;
  improvements: NonNullable<WorkerRunnerValidation["improvements"]>;
  reasons: string[];
}): void {
  const before = scoreMap(params.beforeRows);
  const after = scoreMap(params.afterRows);
  for (const [item, beforeScore] of before) {
    const afterScore = after.get(item) ?? 0;
    if (afterScore + SCORE_EPSILON < beforeScore) {
      params.regressions.push({ kind: params.kind, unit: params.unit, item, before: beforeScore, after: afterScore });
      if (beforeScore >= EXACT_SCORE && afterScore < EXACT_SCORE) {
        params.reasons.push(`already-exact ${params.kind} regressed: ${item} ${beforeScore} -> ${afterScore}`);
      }
    } else if (afterScore > beforeScore + SCORE_EPSILON) {
      params.improvements.push({ kind: params.kind, unit: params.unit, item, before: beforeScore, after: afterScore });
    }
  }
}

export function compareWorkerUnitSnapshots(params: {
  before: WorkerUnitScoreSnapshot;
  after: WorkerUnitScoreSnapshot;
  claimedExact: boolean;
  summaryPath?: string;
  reportPath?: string;
  baselinePath?: string;
}): WorkerRunnerValidation {
  const regressions: NonNullable<WorkerRunnerValidation["regressions"]> = [];
  const improvements: NonNullable<WorkerRunnerValidation["improvements"]> = [];
  const reasons: string[] = [];
  const beforeTarget = params.before.targetScore;
  const afterTarget = params.after.targetScore;
  const targetHasScores = beforeTarget !== null && afterTarget !== null;
  const targetImproved = targetHasScores && afterTarget > beforeTarget + SCORE_EPSILON;
  const targetReachedExact = targetHasScores && beforeTarget < EXACT_SCORE && afterTarget >= EXACT_SCORE;
  const targetIsExact = targetHasScores && afterTarget >= EXACT_SCORE;
  const targetRegressed = targetHasScores && afterTarget + SCORE_EPSILON < beforeTarget;
  // The runner owns the durable outcome: a measured official improvement is
  // accepted progress even when the model over-claimed exact. The over-claim
  // is surfaced in reasons and target.exact stays truthful, so the recorded
  // result downgrades to "improved" instead of discarding real score movement.
  //
  // If the pre-worker worktree is already exact, treat an exact post-worker
  // target as accepted too. This happens when the admission board is stale but
  // the session worktree already contains the exact source.
  const targetAccepted = targetImproved || targetReachedExact || targetIsExact;

  compareRows({ kind: "unit", unit: params.before.unit, beforeRows: params.before.metrics, afterRows: params.after.metrics, regressions, improvements, reasons });
  compareRows({ kind: "function", unit: params.before.unit, beforeRows: params.before.functions, afterRows: params.after.functions, regressions, improvements, reasons });
  compareRows({ kind: "section", unit: params.before.unit, beforeRows: params.before.sections, afterRows: params.after.sections, regressions, improvements, reasons });

  let status: WorkerRunnerValidation["status"] = "passed";
  if (!targetHasScores) {
    status = "no_official_score_change";
    reasons.push(`target symbol score unavailable in ${beforeTarget === null ? "baseline" : "current"} same-unit snapshot`);
  } else if (targetRegressed) {
    status = "target_regressed";
    reasons.push(`target ${params.before.symbol} regressed from ${beforeTarget} to ${afterTarget}`);
  } else if (regressions.length > 0) {
    status = "same_unit_regression";
    reasons.push(`${regressions.length} same-unit score regression(s) detected`);
  } else if (!targetAccepted) {
    status = "no_official_score_change";
    reasons.push(
      params.claimedExact
        ? `target ${params.before.symbol} did not reach exact in runner-owned same-unit validation`
        : `target ${params.before.symbol} did not improve in runner-owned same-unit validation`,
    );
  } else if (params.claimedExact && targetHasScores && afterTarget < EXACT_SCORE) {
    reasons.push(
      `target ${params.before.symbol} improved from ${beforeTarget} to ${afterTarget} but did not reach exact as claimed; runner records improved progress`,
    );
  }

  return {
    status,
    reasons,
    target: {
      unit: params.before.unit,
      symbol: params.before.symbol,
      before: beforeTarget,
      after: afterTarget,
      improved: Boolean(targetImproved),
      exact: Boolean(targetIsExact),
    },
    regressions,
    improvements,
    summaryPath: params.summaryPath,
    reportPath: params.reportPath,
    baselinePath: params.baselinePath,
  };
}

/**
 * Rewrite a `git diff --no-index <preCopy> <current>` header so scan_diff.py
 * sees the repo-relative path (`a/src/melee/... b/src/melee/...`) instead of
 * the absolute snapshot/worktree paths. Returns "" when the diff has no hunks
 * (identical or binary files).
 */
export function rewriteNoIndexDiffPaths(diffText: string, repoRelativePath: string): string {
  const lines = diffText.split("\n");
  const hunkStart = lines.findIndex((line) => line.startsWith("@@"));
  if (hunkStart === -1) return "";
  while (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  return [
    `diff --git a/${repoRelativePath} b/${repoRelativePath}`,
    `--- a/${repoRelativePath}`,
    `+++ b/${repoRelativePath}`,
    ...lines.slice(hunkStart),
  ].join("\n");
}

export function qaLintFromInvocation(invocation: QaScanInvocation, scanPath: string | null): WorkerQaLint {
  const findings = invocation.result?.findings ?? [];
  if (invocation.toolError !== null) {
    // L1 fails open on scanner infrastructure failure (L2 fails closed): a
    // broken environment must not mass-reject worker attempts, but the failure
    // is recorded so operators can see the gate was blind.
    return { status: "tool_unavailable", exitCode: invocation.exitCode, findings, scanPath, toolError: invocation.toolError };
  }
  const hasErrorFindings = findings.some((finding) => finding.severity === "error");
  if (invocation.exitCode === 1 || hasErrorFindings) {
    return { status: "violations", exitCode: invocation.exitCode, findings, scanPath, toolError: null };
  }
  if (invocation.exitCode === 2) {
    return { status: "warnings", exitCode: invocation.exitCode, findings, scanPath, toolError: null };
  }
  return { status: "clean", exitCode: invocation.exitCode, findings, scanPath, toolError: null };
}

export const QA_LINT_REPAIR_INSTRUCTION =
  "Remove every QA lint finding; a lower match % without it is the correct outcome. Do not re-add maintainer-rejected patterns.";

function qaLintRequiresRepair(qaLint: WorkerQaLint | null | undefined): qaLint is WorkerQaLint {
  return qaLint?.status === "violations" || qaLint?.status === "warnings";
}

/** Worker-facing repair feedback: one verbatim reason per finding plus the standing instruction. */
function qaLintFindingRepairDetail(finding: QaScanFinding): string {
  const detail = isRecord(finding.detail) ? finding.detail : {};
  const parts: string[] = [];
  const repairHint = stringValue(detail.repair_hint);
  if (repairHint) parts.push(`repair_hint: ${repairHint}`);

  const dataOrderingRepair = isRecord(detail.data_ordering_repair) ? detail.data_ordering_repair : null;
  if (dataOrderingRepair) {
    const kind = stringValue(dataOrderingRepair.kind);
    const when = stringValue(dataOrderingRepair.when);
    const tool = stringValue(dataOrderingRepair.tool);
    const command = stringValue(dataOrderingRepair.command);
    const repairParts = [
      kind ? `kind=${kind}` : "",
      when ? `when=${when}` : "",
      tool ? `tool=${tool}` : "",
      command ? `command=${command}` : "",
    ].filter(Boolean);
    if (repairParts.length > 0) parts.push(`data_ordering_repair: ${repairParts.join("; ")}`);
  }

  const suggestedTool = detail.suggested_tool;
  if (typeof suggestedTool === "string" && suggestedTool.trim()) {
    parts.push(`suggested_tool: ${suggestedTool.trim()}`);
  } else if (isRecord(suggestedTool)) {
    const tool = stringValue(suggestedTool.tool ?? suggestedTool.id);
    const command = stringValue(suggestedTool.command);
    const suggestedParts = [tool ? `tool=${tool}` : "", command ? `command=${command}` : ""].filter(Boolean);
    if (suggestedParts.length > 0) parts.push(`suggested_tool: ${suggestedParts.join("; ")}`);
  }

  return parts.length > 0 ? ` repair: ${parts.join(" | ")}` : "";
}

export function qaLintRepairReasons(qaLint: WorkerQaLint | null | undefined): string[] {
  if (!qaLintRequiresRepair(qaLint)) return [];
  const reasons = qaLint.findings.map(
    (finding) =>
      `qa_lint_finding: ${finding.severity} ${finding.rule_id} at ${finding.file}:${finding.line} — ${finding.message} [standard: ${finding.standard_id ?? "unknown"}] excerpt: ${finding.excerpt}${qaLintFindingRepairDetail(finding)}`,
  );
  if (reasons.length === 0) {
    reasons.push(`qa_lint_finding: scan_diff gate failed (exit ${qaLint.exitCode ?? "unknown"}) without parseable findings`);
  }
  reasons.push(QA_LINT_REPAIR_INSTRUCTION);
  return reasons;
}

/**
 * Fold the L1 QA lint outcome into the runner validation verdict. A
 * score-improving attempt that re-adds or leaves a maintainer-rejected pattern
 * is the exact failure mode L1 exists to stop. Even warning-level findings are
 * repair targets during automated work; the right next step is to remove them
 * or prove a false positive, not ship them as incidental score progress.
 * tool_unavailable and clean never change the score verdict.
 */
export function applyQaLintToValidation(validation: WorkerRunnerValidation, qaLint: WorkerQaLint | null): WorkerChangeValidation {
  if (!qaLintRequiresRepair(qaLint)) return { ...validation, qaLint };
  return {
    ...validation,
    status: validation.status === "passed" ? "failed" : validation.status,
    reasons: [
      ...validation.reasons,
      `qa lint found ${qaLint.findings.length} QA finding(s) requiring repair (gate exit ${qaLint.exitCode ?? "unknown"})`,
    ],
    qaLint,
  };
}

async function runWorkerQaLintScan(params: {
  repoRoot: string;
  outputDir: string;
  attemptIndex: number;
  baseline: WorkerChangeBaseline;
  orchestratorRoot: string;
  qaScanRunner: QaScanRunner;
}): Promise<WorkerQaLint> {
  const unavailable = (toolError: string): WorkerQaLint => ({ status: "tool_unavailable", exitCode: null, findings: [], scanPath: null, toolError });
  const snapshotDir = params.baseline.sourceSnapshotDir;
  const snapshotPaths = params.baseline.sourceSnapshotPaths ?? [];
  if (!snapshotDir || snapshotPaths.length === 0) {
    return { status: "skipped", exitCode: null, findings: [], scanPath: null, toolError: "pre-worker source snapshot is unavailable" };
  }

  const sections: string[] = [];
  // Scratch file for git's raw per-file output: --output is used instead of a
  // stdout pipe because piped git stdout has proven unreliable under bun test.
  const rawDiffPath = resolve(params.outputDir, `attempt-${params.attemptIndex}.qa_diff.raw.patch`);
  for (const relPath of snapshotPaths) {
    const preWorkerCopy = resolve(snapshotDir, relPath);
    const currentPath = resolve(params.repoRoot, relPath);
    // A file the worker deleted (or a copy that vanished) has no post-edit
    // content to scan; the score validation owns judging that situation.
    if (!existsSync(preWorkerCopy) || !existsSync(currentPath)) continue;
    let diff: CommandResult;
    try {
      diff = await runCommand(params.repoRoot, ["git", "diff", "--no-index", `--output=${rawDiffPath}`, preWorkerCopy, currentPath]);
    } catch (error) {
      return unavailable(`git diff --no-index failed for ${relPath}: ${error instanceof Error ? error.message : String(error)}`);
    }
    // git diff --no-index exits 0 (identical) or 1 (differences); anything else is a tool failure.
    if (diff.exitCode !== 0 && diff.exitCode !== 1) {
      return unavailable(`git diff --no-index exited ${diff.exitCode} for ${relPath}: ${diff.stderr.trim().slice(0, 400)}`);
    }
    let rawDiff = "";
    try {
      rawDiff = await readFile(rawDiffPath, "utf8");
    } catch {
      rawDiff = "";
    }
    const section = rewriteNoIndexDiffPaths(rawDiff, relPath);
    if (section) sections.push(section);
  }
  if (sections.length === 0) {
    return { status: "clean", exitCode: null, findings: [], scanPath: null, toolError: null };
  }

  const scanPath = resolve(params.outputDir, `attempt-${params.attemptIndex}.qa_diff.patch`);
  await writeFile(scanPath, `${sections.join("\n")}\n`);
  const invocation = await params.qaScanRunner({
    repoRoot: params.repoRoot,
    orchestratorRoot: params.orchestratorRoot,
    diffFile: scanPath,
  });
  return qaLintFromInvocation(invocation, scanPath);
}

export async function validateWorkerChange(params: {
  repoRoot: string;
  outputDir: string;
  attemptIndex: number;
  baseline: WorkerChangeBaseline;
  target: Record<string, unknown>;
  dryRun: boolean;
  shouldRun: boolean;
  claimedExact: boolean;
  /** Orchestrator root containing the GameCube toolpack; defaults to the orchestrator repo root. */
  orchestratorRoot?: string;
  /** Injectable scan_diff runner; defaults to runQaScanDiff. */
  qaScanRunner?: QaScanRunner;
}): Promise<WorkerChangeValidation> {
  await mkdir(params.outputDir, { recursive: true });
  const summaryPath = resolve(params.outputDir, `attempt-${params.attemptIndex}.runner_validation.summary.json`);
  const skipped = (reason: string): WorkerChangeValidation => ({ status: "skipped", reasons: [reason], summaryPath, qaLint: null });

  if (params.dryRun) return skipped("dry-run agents do not execute runner-owned worker-change validation");
  if (!params.shouldRun) return skipped("runner checkpoint validation was not requested");

  // The QA lint scan runs even when the score comparison below cannot (build
  // failure, missing snapshot): QA findings must be reported regardless of
  // whether the attempt's score evidence is usable.
  const qaLint = await runWorkerQaLintScan({
    repoRoot: params.repoRoot,
    outputDir: params.outputDir,
    attemptIndex: params.attemptIndex,
    baseline: params.baseline,
    orchestratorRoot: params.orchestratorRoot ?? packageRoot(),
    qaScanRunner: params.qaScanRunner ?? runQaScanDiff,
  });
  const scoreValidation = await validateWorkerScoreChange(params, summaryPath);
  const validation = applyQaLintToValidation(scoreValidation, qaLint);
  await writeFile(summaryPath, JSON.stringify(validation, null, 2));
  return validation;
}

async function validateWorkerScoreChange(
  params: {
    repoRoot: string;
    outputDir: string;
    attemptIndex: number;
    baseline: WorkerChangeBaseline;
    target: Record<string, unknown>;
    claimedExact: boolean;
  },
  summaryPath: string,
): Promise<WorkerRunnerValidation> {
  if (!params.baseline.snapshot) {
    return {
      status: "snapshot_unavailable",
      reasons: params.baseline.reasons.length > 0 ? params.baseline.reasons : ["pre-worker same-unit baseline snapshot is unavailable"],
      summaryPath,
      baselinePath: params.baseline.snapshotPath,
      reportPath: params.baseline.diffPath,
    };
  }

  const unit = stringValue(params.target.unit);
  const symbol = stringValue(params.target.symbol);
  const sourcePath = stringValue(params.target.source_path);
  const objectTarget = params.baseline.objectTarget ?? objectTargetFromSourcePath(sourcePath);
  if (!unit || !symbol || !sourcePath || !objectTarget) {
    return {
      status: "snapshot_unavailable",
      reasons: ["target metadata is incomplete for runner-owned worker-change validation"],
      summaryPath,
      baselinePath: params.baseline.snapshotPath,
    };
  }

  const objectBuild = await runValidationCommand(
    params.repoRoot,
    ["ninja", objectTarget],
    resolve(params.outputDir, `attempt-${params.attemptIndex}.object_build.stdout.txt`),
    resolve(params.outputDir, `attempt-${params.attemptIndex}.object_build.stderr.txt`),
  );
  if (objectBuild.exitCode !== 0) {
    return {
      status: "build_failed",
      reasons: [`post-worker object build exited ${objectBuild.exitCode}`],
      summaryPath,
      baselinePath: params.baseline.snapshotPath,
      command: objectBuild.command.join(" "),
      exitCode: objectBuild.exitCode,
      stdoutPath: objectBuild.stdoutPath,
      stderrPath: objectBuild.stderrPath,
    };
  }

  const diffPath = resolve(params.outputDir, `attempt-${params.attemptIndex}.unit_diff.json`);
  const unitDiff = await runValidationCommand(
    params.repoRoot,
    ["build/tools/objdiff-cli", "diff", "-p", ".", "-u", unit, "--format", "json-pretty", "-o", diffPath],
    resolve(params.outputDir, `attempt-${params.attemptIndex}.unit_diff.stdout.txt`),
    resolve(params.outputDir, `attempt-${params.attemptIndex}.unit_diff.stderr.txt`),
  );
  if (unitDiff.exitCode !== 0 || !existsSync(diffPath)) {
    return {
      status: "snapshot_unavailable",
      reasons: [`post-worker unit diff exited ${unitDiff.exitCode}`],
      summaryPath,
      baselinePath: params.baseline.snapshotPath,
      reportPath: diffPath,
      command: unitDiff.command.join(" "),
      exitCode: unitDiff.exitCode,
      stdoutPath: unitDiff.stdoutPath,
      stderrPath: unitDiff.stderrPath,
    };
  }

  let after: WorkerUnitScoreSnapshot | null = null;
  try {
    const report = JSON.parse(await readFile(diffPath, "utf8")) as unknown;
    after = isRecord(report) ? snapshotFromObjdiffReport({ report, unit, symbol, sourcePath, objectTarget }) : null;
  } catch {
    after = null;
  }
  if (!after) {
    return {
      status: "snapshot_unavailable",
      reasons: ["post-worker unit diff did not contain usable same-unit scores"],
      summaryPath,
      baselinePath: params.baseline.snapshotPath,
      reportPath: diffPath,
    };
  }

  const snapshotPath = resolve(params.outputDir, `attempt-${params.attemptIndex}.unit_snapshot.json`);
  await writeFile(snapshotPath, JSON.stringify(after, null, 2));
  const validation = compareWorkerUnitSnapshots({
    before: params.baseline.snapshot,
    after,
    claimedExact: params.claimedExact,
    summaryPath,
    reportPath: snapshotPath,
    baselinePath: params.baseline.snapshotPath,
  });
  validation.command = `${objectBuild.command.join(" ")} && ${unitDiff.command.join(" ")}`;
  validation.exitCode = 0;
  validation.stdoutPath = objectBuild.stdoutPath;
  validation.stderrPath = unitDiff.stderrPath;
  validation.diffPath = diffPath;
  validation.objectTarget = objectTarget;
  return validation;
}
