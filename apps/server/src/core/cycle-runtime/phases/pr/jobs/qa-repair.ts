import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { lstat, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { createMeleeKernelSpawnContext } from "@server/infrastructure/kernel/bridge/spawn-context";
import { runMeleeKernelPiAgent as runPiAgent, type MeleeKernelPiRunOptions } from "@server/infrastructure/agent-runtime/kernel-pi-runner";
import { qaRepairPrompt, validateQaRepairAgentResult } from "@server/core/agent-catalog/agents/pr/qa-repair";
import { artifactTimestamp, parseJsonObject } from "@server/infrastructure/agent-runtime/runtime";
import {
  buildQaRepairQueue,
  candidateProofsFromCheckpoint,
  forceBlockedNeedsCrossFile,
  qaRepairShipStatus,
  renderQaRepairReport,
  summarizeQaRepairQueue,
  validateQaRepairOutcome,
  type QaRepairAttempt,
  type QaRepairQueue,
  type QaRepairQueueItem,
  type QaRepairSummary,
  type QaRepairValidationResult,
} from "@server/core/validation/qa/repair-lane";
import { parseQaScanResult, runQaScanDiff, type QaScanResult } from "@server/core/validation/qa";
import {
  buildObjectForSource,
  captureUnitMatchSnapshot,
  compareUnitMatchSnapshots,
  objdiffUnitPresence,
  type ObjdiffUnitPresence,
  type RepairCheckResult,
  type UnitMatchSnapshot,
} from "@server/core/validation/qa/repair-checks";
import { runCommand } from "@server/infrastructure/shell";
import { addPiSession } from "@server/core/cycle-runtime/run-state";
import { getLatestRun, openState } from "@server/core/cycle-runtime/run-state";
import type { PiRunResult } from "@server/core/shared/types";
import { latestCheckpointSummary } from "@server/core/cycle-runtime/phases/pr/checkpoint";
import { packageRoot } from "@server/core/knowledge";
import { booleanArg, numberArg, gameMetadata, stringArg, type GlobalArgs } from "@server/core/game-registry/runtime-options.js";

export type QaRepairAgentRunner = (options: MeleeKernelPiRunOptions) => Promise<PiRunResult>;
export type QaRepairValidationKind = "score" | "build" | "regression";
export type QaRepairValidationCommands = Partial<Record<QaRepairValidationKind, string>>;

export interface QaRepairAgentOverrides {
  provider?: string;
  model?: string;
  thinkingLevel?: string;
}

export interface ProcessSingleItemParams {
  globals: GlobalArgs;
  runId: string;
  item: QaRepairQueueItem;
  queueSummary: QaRepairSummary;
  outputDir: string;
  baseRef: string | null;
  validationCommands: QaRepairValidationCommands;
  runner: QaRepairAgentRunner;
  agentOverrides?: QaRepairAgentOverrides;
  enforcedChecks?: boolean;
  repairChecks?: QaRepairEnforcedCheckRunners;
}

export interface ProcessedQaRepairItem {
  item: QaRepairQueueItem;
}

export interface ProcessQueueItemParams extends Omit<ProcessSingleItemParams, "queueSummary"> {
  queue: QaRepairQueue;
}

export interface QaRepairArtifacts {
  queuePath: string;
  summaryPath: string;
  reportPath: string;
  shipStatusPath: string;
}

export interface RunQaRepairOptions {
  enforcedChecks?: boolean;
  repairChecks?: QaRepairEnforcedCheckRunners;
}

export interface QaRepairEnforcedCheckRunners {
  buildObjectForSource?: typeof buildObjectForSource;
  captureUnitMatchSnapshot?: typeof captureUnitMatchSnapshot;
  compareUnitMatchSnapshots?: typeof compareUnitMatchSnapshots;
  objdiffUnitPresence?: typeof objdiffUnitPresence;
  waitForSnapshotRetry?: (delayMs: number) => Promise<void>;
}

export type QaRepairEnforcedCheckStatus = "passed" | "failed" | "unavailable" | "not_run" | "skipped";

export interface QaRepairEnforcedValidation {
  enabled: boolean;
  build_check: QaRepairEnforcedCheckStatus;
  match_check: QaRepairEnforcedCheckStatus;
  match_note?: string;
  check_result?: RepairCheckResult;
  reverted: boolean;
  restored_build?: { ok: boolean; log: string };
  restore_error?: string;
}

export type QaRepairAttemptWithEnforcedChecks = QaRepairAttempt & {
  validation: QaRepairEnforcedValidation;
  header_edit_reverted?: boolean;
  header_edit_paths?: string[];
  header_revert_failures?: string[];
};

export interface QaRepairHeaderStatusEntry {
  status: string;
  mtimeMs: number | null;
  size: number | null;
  contentHash: string | null;
}

export interface QaRepairHeaderStatusSnapshot {
  available: boolean;
  entries: Record<string, QaRepairHeaderStatusEntry>;
  error?: string;
}

export interface QaRepairHeaderRevertResult {
  /** Header edits allowed by the queue item's authorized write set and left intact. */
  authorizedPaths?: string[];
  /** Unauthorized header edits detected during this repair attempt. */
  changedPaths: string[];
  revertedPaths: string[];
  failedPaths: string[];
  error?: string;
}

interface QaRepairCommandValidation {
  kind: QaRepairValidationKind;
  status: "passed" | "failed" | "skipped";
  command?: string;
  exitCode?: number;
  stdoutPath?: string;
  stderrPath?: string;
  summaryPath?: string;
  preTargetScore?: number | null;
  postTargetScore?: number | null;
  scoreImpact?: "same_match" | "lower_score" | "unknown" | null;
  reason?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8")) as unknown;
}

function resolvePath(path: string): string {
  return isAbsolute(path) ? path : resolve(path);
}

function stringList(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

function numberField(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function scoreImpactField(value: unknown): "same_match" | "lower_score" | "unknown" | null {
  return value === "same_match" || value === "lower_score" || value === "unknown" ? value : null;
}

async function runProcess(repoRoot: string, command: string[]): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  return new Promise((resolveProcess) => {
    const child = spawn(command[0] ?? "", command.slice(1), { cwd: repoRoot });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
    child.on("error", (error) => {
      resolveProcess({ exitCode: -1, stdout: Buffer.concat(stdout).toString("utf8"), stderr: `${Buffer.concat(stderr).toString("utf8")}${error.message}` });
    });
    child.on("close", (code) => {
      resolveProcess({ exitCode: code ?? -1, stdout: Buffer.concat(stdout).toString("utf8"), stderr: Buffer.concat(stderr).toString("utf8") });
    });
  });
}

function normalizeRepoPath(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\.\/+/, "");
}

function pathWithinRepo(repoRoot: string, path: string): string | null {
  const absolutePath = resolve(repoRoot, path);
  const repoRelativePath = relative(resolve(repoRoot), absolutePath);
  if (!repoRelativePath || repoRelativePath.startsWith("..") || isAbsolute(repoRelativePath)) return null;
  return absolutePath;
}

function isHeaderPath(path: string): boolean {
  return normalizeRepoPath(path).toLowerCase().endsWith(".h");
}

function parseHeaderPorcelain(output: string): Map<string, string> {
  const result = new Map<string, string>();
  const records = output.split("\0");
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    if (!record || record.length < 4) continue;
    const status = record.slice(0, 2);
    const path = normalizeRepoPath(record.slice(3));
    if (isHeaderPath(path)) result.set(path, status);
    if (status.includes("R") || status.includes("C")) {
      const originalPath = normalizeRepoPath(records[index + 1] ?? "");
      index += 1;
      if (isHeaderPath(originalPath)) result.set(originalPath, `${status}:source`);
    }
  }
  return result;
}

async function headerStatusEntry(repoRoot: string, path: string, status: string): Promise<QaRepairHeaderStatusEntry> {
  const absolutePath = pathWithinRepo(repoRoot, path);
  if (!absolutePath) return { status, mtimeMs: null, size: null, contentHash: null };
  try {
    const [fileStat, content] = await Promise.all([lstat(absolutePath), readFile(absolutePath)]);
    return {
      status,
      mtimeMs: fileStat.mtimeMs,
      size: fileStat.size,
      contentHash: createHash("sha256").update(content).digest("hex"),
    };
  } catch {
    return { status, mtimeMs: null, size: null, contentHash: null };
  }
}

/** Captures only dirty headers so unrelated clean files do not enter rollback scope. */
export async function captureModifiedHeaderSnapshot(repoRoot: string): Promise<QaRepairHeaderStatusSnapshot> {
  const status = await runCommand(repoRoot, ["git", "status", "--porcelain=v1", "-z", "--untracked-files=all", "--", "*.h"]);
  if (status.exitCode !== 0) {
    return {
      available: false,
      entries: {},
      error: status.stderr.trim() || `git status exited ${status.exitCode}`,
    };
  }
  const parsed = parseHeaderPorcelain(status.stdout);
  const entries = Object.fromEntries(
    await Promise.all([...parsed].map(async ([path, porcelainStatus]) => [path, await headerStatusEntry(repoRoot, path, porcelainStatus)] as const)),
  );
  return { available: true, entries };
}

function headerEntryChanged(before: QaRepairHeaderStatusEntry | undefined, after: QaRepairHeaderStatusEntry | undefined): boolean {
  if (!before || !after) return before !== after;
  return (
    before.status !== after.status ||
    before.mtimeMs !== after.mtimeMs ||
    before.size !== after.size ||
    before.contentHash !== after.contentHash
  );
}

/** Restores only unauthorized headers whose state changed during this repair attempt. */
export async function revertModifiedHeadersSince(
  repoRoot: string,
  before: QaRepairHeaderStatusSnapshot,
  authorizedHeaderPaths: Iterable<string> = [],
): Promise<QaRepairHeaderRevertResult> {
  if (!before.available) return { changedPaths: [], revertedPaths: [], failedPaths: [], error: before.error ?? "pre-run header status unavailable" };
  const after = await captureModifiedHeaderSnapshot(repoRoot);
  if (!after.available) return { changedPaths: [], revertedPaths: [], failedPaths: [], error: after.error ?? "post-run header status unavailable" };

  const paths = new Set([...Object.keys(before.entries), ...Object.keys(after.entries)]);
  const changed = [...paths].filter((path) => headerEntryChanged(before.entries[path], after.entries[path])).sort();
  const authorized = new Set([...authorizedHeaderPaths].map(normalizeRepoPath));
  const authorizedPaths = changed.filter((path) => authorized.has(path));
  const changedPaths = changed.filter((path) => !authorized.has(path));
  const revertedPaths: string[] = [];
  const failedPaths: string[] = [];
  for (const path of changedPaths) {
    const checkout = await runCommand(repoRoot, ["git", "checkout", "HEAD", "--", path]);
    if (checkout.exitCode === 0) {
      revertedPaths.push(path);
      continue;
    }

    // A newly-created header has no HEAD entry for checkout. Remove only that
    // scoped path (and any staging for it) so the same HEAD-state invariant holds.
    const trackedAtHead = await runCommand(repoRoot, ["git", "cat-file", "-e", `HEAD:${path}`]);
    const absolutePath = pathWithinRepo(repoRoot, path);
    if (trackedAtHead.exitCode !== 0 && absolutePath) {
      const reset = await runCommand(repoRoot, ["git", "reset", "-q", "HEAD", "--", path]);
      try {
        await rm(absolutePath, { force: true });
        if (reset.exitCode === 0) {
          revertedPaths.push(path);
          continue;
        }
      } catch {
        // Record the path below; the caller will keep the item in needs_rework.
      }
    }
    failedPaths.push(path);
  }
  return { authorizedPaths, changedPaths, revertedPaths, failedPaths };
}

function candidateListFromFile(path: string): string[] {
  if (!path) return [];
  const raw = readFileSync(resolvePath(path), "utf8");
  if (path.endsWith(".json")) {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) return parsed.filter((item): item is string => typeof item === "string");
    if (isRecord(parsed) && Array.isArray(parsed.files)) return parsed.files.filter((item): item is string => typeof item === "string");
    throw new Error(`--candidate-list ${path} must be a JSON array, or an object with files[]`);
  }
  return raw
    .split(/\r\n|\r|\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));
}

export function scanResultFromJson(raw: unknown, sourcePath: string): QaScanResult {
  if (!isRecord(raw)) throw new Error(`${sourcePath} is not a JSON object`);
  const parsed = parseQaScanResult(JSON.stringify(raw));
  if (!parsed) throw new Error(`${sourcePath} is not a review_lint scan_diff JSON result`);
  return parsed;
}

function latestRunId(stateDir: string): string {
  const store = openState(stateDir);
  try {
    return getLatestRun(store)?.id ?? "manual";
  } finally {
    store.db.close();
  }
}

function latestCheckpointPath(stateDir: string, runId: string): string {
  if (!runId || runId === "manual") return "";
  const store = openState(stateDir);
  try {
    return String(latestCheckpointSummary(store, runId)?.summaryPath ?? "");
  } finally {
    store.db.close();
  }
}

function renderQaRepairValidationCommand(
  template: string,
  params: {
    repoRoot: string;
    stateDir: string;
    outputDir: string;
    runId: string;
    item: QaRepairQueueItem;
    baseRef: string | null;
  },
): string {
  const replacements: Record<string, string> = {
    repo_root: shellQuote(params.repoRoot),
    state_dir: shellQuote(params.stateDir),
    output_dir: shellQuote(params.outputDir),
    run_id: shellQuote(params.runId),
    item_id: shellQuote(params.item.id),
    source_path: shellQuote(params.item.source_path),
    base_ref: shellQuote(params.baseRef ?? ""),
  };
  return template.replace(/\{([a-z_]+)\}/g, (match, key: string) => replacements[key] ?? match);
}

function parseScoreValidation(stdout: string): Pick<QaRepairCommandValidation, "preTargetScore" | "postTargetScore" | "scoreImpact"> {
  try {
    const parsed = JSON.parse(stdout) as Record<string, unknown>;
    const preTargetScore = numberField(parsed.preTargetScore ?? parsed.pre_target_score ?? parsed.before_score ?? parsed.pre_score);
    const postTargetScore = numberField(parsed.postTargetScore ?? parsed.post_target_score ?? parsed.after_score ?? parsed.post_score);
    const scoreImpact = scoreImpactField(parsed.scoreImpact ?? parsed.score_impact);
    return { preTargetScore, postTargetScore, scoreImpact };
  } catch {
    return {};
  }
}

async function runQaRepairValidationCommand(params: {
  kind: QaRepairValidationKind;
  template: string;
  globals: GlobalArgs;
  runId: string;
  item: QaRepairQueueItem;
  itemDir: string;
  baseRef: string | null;
}): Promise<QaRepairCommandValidation> {
  const command = renderQaRepairValidationCommand(params.template, {
    repoRoot: params.globals.repoRoot,
    stateDir: params.globals.stateDir,
    outputDir: params.itemDir,
    runId: params.runId,
    item: params.item,
    baseRef: params.baseRef,
  });
  const result = await runProcess(params.globals.repoRoot, ["/bin/sh", "-lc", command]);
  const stdoutPath = resolve(params.itemDir, `${params.kind}_check.stdout.txt`);
  const stderrPath = resolve(params.itemDir, `${params.kind}_check.stderr.txt`);
  const summaryPath = resolve(params.itemDir, `${params.kind}_check.summary.json`);
  await writeFile(stdoutPath, result.stdout);
  await writeFile(stderrPath, result.stderr);
  const score = params.kind === "score" ? parseScoreValidation(result.stdout) : {};
  const validation: QaRepairCommandValidation = {
    kind: params.kind,
    status: result.exitCode === 0 ? "passed" : "failed",
    command,
    exitCode: result.exitCode,
    stdoutPath,
    stderrPath,
    summaryPath,
    ...score,
  };
  await writeFile(summaryPath, `${JSON.stringify(validation, null, 2)}\n`);
  return validation;
}

async function runQaRepairValidationCommands(params: {
  commands: QaRepairValidationCommands;
  globals: GlobalArgs;
  runId: string;
  item: QaRepairQueueItem;
  itemDir: string;
  baseRef: string | null;
}): Promise<QaRepairCommandValidation[]> {
  const validations: QaRepairCommandValidation[] = [];
  for (const kind of ["score", "build", "regression"] as const) {
    const template = params.commands[kind];
    if (!template) {
      validations.push({ kind, status: "skipped", reason: `no --${kind}-check-command configured` });
      continue;
    }
    validations.push(await runQaRepairValidationCommand({ kind, template, globals: params.globals, runId: params.runId, item: params.item, itemDir: params.itemDir, baseRef: params.baseRef }));
  }
  return validations;
}

function commandValidationByKind(validations: QaRepairCommandValidation[], kind: QaRepairValidationKind): QaRepairCommandValidation | undefined {
  return validations.find((validation) => validation.kind === kind);
}

function commandPassed(validation: QaRepairCommandValidation | undefined): boolean | null {
  if (!validation || validation.status === "skipped") return null;
  return validation.status === "passed";
}

function validationArtifactPaths(validations: QaRepairCommandValidation[]): Record<string, string | null> {
  const artifacts: Record<string, string | null> = {};
  for (const validation of validations) {
    artifacts[`${validation.kind}_check`] = validation.summaryPath ?? null;
  }
  return artifacts;
}

function validationSummaryPath(validations: QaRepairCommandValidation[], kind: QaRepairValidationKind): string | undefined {
  return commandValidationByKind(validations, kind)?.summaryPath;
}

async function headSha(repoRoot: string): Promise<string | null> {
  const result = await runCommand(repoRoot, ["git", "rev-parse", "HEAD"]);
  return result.exitCode === 0 ? result.stdout.trim() : null;
}

function recordQaRepairCycle(globals: GlobalArgs, runId: string, result: PiRunResult): void {
  if (!runId || runId === "manual") return;
  const store = openState(globals.stateDir);
  try {
    addPiSession({
      store,
      runId,
      role: "qa-repair",
      sessionId: result.sessionId,
      sessionFile: result.sessionFile,
      provider: globals.provider,
      model: globals.model,
      thinkingLevel: globals.thinkingLevel,
      status: result.failed ? "failed" : result.dryRun ? "dry_run" : "succeeded",
      outputPath: result.outputPath,
    });
  } finally {
    store.db.close();
  }
}

export async function writeArtifacts(queue: QaRepairQueue, outputDir: string): Promise<QaRepairArtifacts> {
  await mkdir(outputDir, { recursive: true });
  const queuePath = resolve(outputDir, "queue.json");
  const summaryPath = resolve(outputDir, "summary.json");
  const reportPath = resolve(outputDir, "report.md");
  const shipStatusPath = resolve(outputDir, "ship_status.json");
  const summary = summarizeQaRepairQueue(queue, {
    artifact_dir: outputDir,
    queue_path: queuePath,
    summary_path: summaryPath,
    report_path: reportPath,
    ship_status_path: shipStatusPath,
  });
  const shipStatus = qaRepairShipStatus(queue);
  await writeFile(queuePath, `${JSON.stringify(queue, null, 2)}\n`);
  await writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`);
  await writeFile(reportPath, renderQaRepairReport(queue, summary));
  await writeFile(shipStatusPath, `${JSON.stringify(shipStatus, null, 2)}\n`);
  return { queuePath, summaryPath, reportPath, shipStatusPath };
}

function appendAttempt(item: QaRepairQueueItem, attempt: QaRepairAttempt): QaRepairQueueItem {
  return {
    ...item,
    attempts: [...item.attempts, attempt],
  };
}

function applyValidation(item: QaRepairQueueItem, result: QaRepairValidationResult, attempt: QaRepairAttempt): QaRepairQueueItem {
  const { required_cross_file_paths: _previousRequiredPaths, ...itemWithoutRequiredPaths } = item;
  return {
    ...itemWithoutRequiredPaths,
    status: result.status,
    routing_reason: result.reasons.join("; "),
    ...(result.required_cross_file_paths ? { required_cross_file_paths: result.required_cross_file_paths } : {}),
    attempts: [...item.attempts, attempt],
  };
}

function itemOutputDir(outputDir: string, item: QaRepairQueueItem): string {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(item.id)) {
    throw new Error(`QA repair item id is not a safe artifact directory name: ${item.id}`);
  }
  return resolve(outputDir, item.id);
}

async function writeScanInvocation(outputDir: string, name: string, invocation: Awaited<ReturnType<typeof runQaScanDiff>>): Promise<string> {
  const jsonPath = resolve(outputDir, `${name}.json`);
  const textPath = resolve(outputDir, `${name}.txt`);
  await writeFile(
    jsonPath,
    `${JSON.stringify({ command: invocation.command, exitCode: invocation.exitCode, toolError: invocation.toolError, result: invocation.result }, null, 2)}\n`,
  );
  if (invocation.stderr) await writeFile(textPath, invocation.stderr);
  return jsonPath;
}

function failedBuildCheck(log: string): RepairCheckResult {
  const buildLog = log.split(/\r?\n/).slice(-80).join("\n").slice(-8192);
  return {
    ok: false,
    buildOk: false,
    ...(buildLog ? { buildLog } : {}),
    exactRegressions: [],
    sectionRegressions: [],
  };
}

function passedBuildCheck(): RepairCheckResult {
  return { ok: true, buildOk: true, exactRegressions: [], sectionRegressions: [] };
}

const MATCH_SNAPSHOT_RETRY_DELAY_MS = 10_000;

async function waitForSnapshotRetry(delayMs: number): Promise<void> {
  await new Promise<void>((resolveDelay) => setTimeout(resolveDelay, delayMs));
}

async function captureMatchSnapshotWithRetry(opts: {
  repoRoot: string;
  sourcePath: string;
  capture: typeof captureUnitMatchSnapshot;
  wait: (delayMs: number) => Promise<void>;
}): Promise<UnitMatchSnapshot | null> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const snapshot = await opts.capture({ repoRoot: opts.repoRoot, sourcePath: opts.sourcePath });
      if (snapshot) return snapshot;
    } catch {
      // Snapshot capture failures are represented as null and retried once.
    }
    if (attempt === 0) await opts.wait(MATCH_SNAPSHOT_RETRY_DELAY_MS);
  }
  return null;
}

function forceNeedsRework(
  validation: QaRepairValidationResult,
  item: QaRepairQueueItem,
  reasons: string[],
): QaRepairValidationResult {
  return {
    ...validation,
    status: "needs_rework",
    reasons: [...new Set([...reasons, ...validation.reasons])],
    remainingFindings: [...item.findings, ...(item.repair_warnings ? item.warnings : [])],
  };
}

function attemptWithEnforcedChecks(
  attempt: QaRepairAttempt,
  validation: QaRepairEnforcedValidation,
  headerResult: QaRepairHeaderRevertResult,
): QaRepairAttemptWithEnforcedChecks {
  const headerEditDetected = headerResult.changedPaths.length > 0;
  return {
    ...attempt,
    validation,
    ...(headerEditDetected ? { header_edit_reverted: headerResult.failedPaths.length === 0, header_edit_paths: headerResult.changedPaths } : {}),
    ...(headerResult.failedPaths.length > 0 ? { header_revert_failures: headerResult.failedPaths } : {}),
  };
}

export async function processSingleItem(params: ProcessSingleItemParams): Promise<ProcessedQaRepairItem> {
  const itemDir = itemOutputDir(params.outputDir, params.item);
  await mkdir(itemDir, { recursive: true });
  const startedAt = new Date().toISOString();
  const checksEnabled = params.enforcedChecks !== false && !params.globals.dryRunAgents;
  const repairChecks: Required<QaRepairEnforcedCheckRunners> = {
    buildObjectForSource: params.repairChecks?.buildObjectForSource ?? buildObjectForSource,
    captureUnitMatchSnapshot: params.repairChecks?.captureUnitMatchSnapshot ?? captureUnitMatchSnapshot,
    compareUnitMatchSnapshots: params.repairChecks?.compareUnitMatchSnapshots ?? compareUnitMatchSnapshots,
    objdiffUnitPresence: params.repairChecks?.objdiffUnitPresence ?? objdiffUnitPresence,
    waitForSnapshotRetry: params.repairChecks?.waitForSnapshotRetry ?? waitForSnapshotRetry,
  };
  const sourceFilePath = pathWithinRepo(params.globals.repoRoot, params.item.source_path);
  let preContent: string | null = null;
  let preSnapshot: UnitMatchSnapshot | null = null;
  let unitPresence: ObjdiffUnitPresence = "unavailable";
  let preContentError: string | undefined;
  let headerSnapshot: QaRepairHeaderStatusSnapshot = { available: false, entries: {}, error: "enforced checks disabled" };
  if (checksEnabled) {
    if (!sourceFilePath) {
      preContentError = `source path escapes repository: ${params.item.source_path}`;
    } else {
      try {
        preContent = await readFile(sourceFilePath, "utf8");
      } catch (error) {
        preContentError = error instanceof Error ? error.message : String(error);
      }
    }
    try {
      unitPresence = await repairChecks.objdiffUnitPresence({
        repoRoot: params.globals.repoRoot,
        sourcePath: params.item.source_path,
      });
    } catch {
      unitPresence = "unavailable";
    }
    if (unitPresence !== "absent") {
      preSnapshot = await captureMatchSnapshotWithRetry({
        repoRoot: params.globals.repoRoot,
        sourcePath: params.item.source_path,
        capture: repairChecks.captureUnitMatchSnapshot,
        wait: repairChecks.waitForSnapshotRetry,
      });
    }
    headerSnapshot = await captureModifiedHeaderSnapshot(params.globals.repoRoot);
  }
  const enforcedValidation: QaRepairEnforcedValidation = {
    enabled: checksEnabled,
    build_check: checksEnabled ? "not_run" : "skipped",
    match_check: checksEnabled ? (unitPresence === "absent" ? "skipped" : preSnapshot ? "not_run" : "unavailable") : "skipped",
    ...(checksEnabled && unitPresence === "absent"
      ? { match_note: "objdiff unit absent; match verification skipped" }
      : {}),
    reverted: false,
    ...(preContentError ? { restore_error: preContentError } : {}),
  };
  const run = await params.runner({
    role: "qa-repair",
    cwd: params.globals.repoRoot,
    prompt: qaRepairPrompt({
      item: params.item,
      queueSummary: params.queueSummary,
      repoRoot: params.globals.repoRoot,
      stateDir: params.globals.stateDir,
      game: gameMetadata(params.globals),
    }),
    outputDir: itemDir,
    dryRun: params.globals.dryRunAgents,
    provider: params.agentOverrides?.provider ?? params.globals.provider,
    model: params.agentOverrides?.model ?? params.globals.model,
    thinkingLevel: params.agentOverrides?.thinkingLevel ?? params.globals.thinkingLevel,
    timeoutMs: params.globals.agentTimeoutSeconds ? params.globals.agentTimeoutSeconds * 1000 : undefined,
    toolContext: {
      repoRoot: params.globals.repoRoot,
      stateDir: params.globals.stateDir,
      game: params.globals.game,
    },
    kernelContext: createMeleeKernelSpawnContext({
      kind: "pr-repair",
      gameId: params.globals.game?.gameId ?? params.globals.gameId,
      sessionId: params.runId || "qa-repair",
      runId: params.runId || "qa-repair",
      prId: params.runId || "manual",
      repairId: params.item.id,
      phase: "repair",
      workingDir: params.globals.repoRoot,
      metadata: {
        itemId: params.item.id,
        sourcePath: params.item.source_path,
        lane: params.item.lane,
        findings: params.item.findings.length,
        repairWarnings: params.item.repair_warnings,
      },
    }),
  });
  recordQaRepairCycle(params.globals, params.runId, run);
  const authorizedHeaderPaths = (params.item.authorized_write_set ?? [])
    .filter((entry) => entry.category === "owning-header" && isHeaderPath(entry.path))
    .map((entry) => normalizeRepoPath(entry.path));
  const headerResult = checksEnabled
    ? await revertModifiedHeadersSince(params.globals.repoRoot, headerSnapshot, authorizedHeaderPaths)
    : { changedPaths: [], revertedPaths: [], failedPaths: [] };
  const headerCheckFailed = headerResult.changedPaths.length > 0;
  const headerRevertBroken = headerResult.failedPaths.length > 0;
  let targetRestored = false;
  const restoreTarget = async (): Promise<void> => {
    if (targetRestored) return;
    if (!sourceFilePath || preContent === null) {
      enforcedValidation.restore_error = enforcedValidation.restore_error ?? "pre-repair source content unavailable";
      return;
    }
    try {
      await writeFile(sourceFilePath, preContent);
      targetRestored = true;
      enforcedValidation.reverted = true;
      delete enforcedValidation.restore_error;
    } catch (error) {
      enforcedValidation.restore_error = error instanceof Error ? error.message : String(error);
    }
  };
  if (headerRevertBroken) await restoreTarget();
  const baseAttempt: QaRepairAttempt = {
    id: run.sessionId,
    status: run.dryRun ? "dry_run" : "agent_failed",
    createdAt: startedAt,
    outputDir: itemDir,
    systemPromptPath: run.systemPromptPath,
    userPromptPath: run.userPromptPath,
    agentOutputPath: run.outputPath,
  };
  const headerFailureReasons = headerCheckFailed
    ? [
        `qa-repair agent modified header files outside its authorized write set: ${headerResult.changedPaths.join(", ")}`,
        ...(headerResult.failedPaths.length > 0 ? [`failed to restore header files: ${headerResult.failedPaths.join(", ")}`] : []),
      ]
    : [];
  const preMatchFailureReasons = checksEnabled && unitPresence !== "absent" && !preSnapshot
    ? ["match verification unavailable"]
    : [];
  const earlyEnforcedFailureReasons = [...headerFailureReasons, ...preMatchFailureReasons];
  const runEnforcedBuild = async (): Promise<{ ok: boolean; log: string }> => {
    try {
      return await repairChecks.buildObjectForSource({ repoRoot: params.globals.repoRoot, sourcePath: params.item.source_path });
    } catch (error) {
      return { ok: false, log: error instanceof Error ? error.message : String(error) };
    }
  };
  const confirmRestoredBuild = async (): Promise<void> => {
    if (!checksEnabled || !targetRestored || enforcedValidation.restored_build) return;
    enforcedValidation.restored_build = await runEnforcedBuild();
  };
  if (run.dryRun) {
    const attempt = attemptWithEnforcedChecks(
      { ...baseAttempt, summary: "dry-run agents wrote prompt artifacts; no validation ran" },
      enforcedValidation,
      headerResult,
    );
    if (headerCheckFailed) {
      await restoreTarget();
      await confirmRestoredBuild();
      const validation = forceNeedsRework(
        validateQaRepairOutcome({
          item: params.item,
          postScan: null,
          blockedReason: "dry-run agents wrote prompt artifacts; no validation ran",
          validationArtifacts: { agent_output: run.outputPath },
        }),
        params.item,
        earlyEnforcedFailureReasons,
      );
      return { item: applyValidation(params.item, validation, attempt) };
    }
    return {
      item: appendAttempt(params.item, attempt),
    };
  }
  if (run.failed || run.providerError) {
    let validation = validateQaRepairOutcome({
      item: params.item,
      postScan: null,
      blockedReason: `qa-repair agent failed: ${run.error ?? run.providerError ?? "unknown failure"}`,
      validationArtifacts: { agent_output: run.outputPath },
    });
    if (earlyEnforcedFailureReasons.length > 0) {
      await restoreTarget();
      await confirmRestoredBuild();
      validation = forceNeedsRework(validation, params.item, earlyEnforcedFailureReasons);
    }
    return {
      item: applyValidation(
        params.item,
        validation,
        attemptWithEnforcedChecks(
          { ...baseAttempt, status: "agent_failed", error: validation.reasons.join("; ") },
          enforcedValidation,
          headerResult,
        ),
      ),
    };
  }

  const parsed = parseJsonObject(run.rawText);
  if (!parsed.object) {
    let validation = validateQaRepairOutcome({
      item: params.item,
      postScan: null,
      blockedReason: `qa-repair output was not parseable JSON: ${parsed.error ?? "unknown parse error"}`,
      validationArtifacts: { agent_output: run.outputPath },
    });
    if (earlyEnforcedFailureReasons.length > 0) {
      await restoreTarget();
      await confirmRestoredBuild();
      validation = forceNeedsRework(validation, params.item, earlyEnforcedFailureReasons);
    }
    return {
      item: applyValidation(
        params.item,
        validation,
        attemptWithEnforcedChecks(
          { ...baseAttempt, status: "invalid_output", error: validation.reasons.join("; ") },
          enforcedValidation,
          headerResult,
        ),
      ),
    };
  }
  const validated = validateQaRepairAgentResult(parsed.object);
  const parsedOutputPath = resolve(itemDir, "agent_result.json");
  await writeFile(parsedOutputPath, `${JSON.stringify({ parsed: parsed.object, validation_errors: validated.errors }, null, 2)}\n`);
  if (!validated.result) {
    let validation = validateQaRepairOutcome({
      item: params.item,
      postScan: null,
      blockedReason: `qa-repair output failed schema validation: ${validated.errors.join("; ")}`,
      validationArtifacts: { agent_output: run.outputPath, parsed_output: parsedOutputPath },
    });
    if (earlyEnforcedFailureReasons.length > 0) {
      await restoreTarget();
      await confirmRestoredBuild();
      validation = forceNeedsRework(validation, params.item, earlyEnforcedFailureReasons);
    }
    return {
      item: applyValidation(
        params.item,
        validation,
        attemptWithEnforcedChecks(
          { ...baseAttempt, status: "invalid_output", parsedOutputPath, error: validation.reasons.join("; ") },
          enforcedValidation,
          headerResult,
        ),
      ),
    };
  }

  const postScan = await runQaScanDiff({
    repoRoot: params.globals.repoRoot,
    orchestratorRoot: packageRoot(),
    game: params.globals.game,
    stateDir: params.globals.stateDir,
    ...(params.baseRef ? { baseRef: params.baseRef } : {}),
    files: [params.item.source_path],
    includeWorktree: true,
    surface: "pr_gate",
  });
  const postScanPath = await writeScanInvocation(itemDir, "post_scan", postScan);
  const independentFailureReasons = [...preMatchFailureReasons];
  if (checksEnabled) {
    const buildResult = await runEnforcedBuild();
    enforcedValidation.build_check = buildResult.ok ? "passed" : "failed";
    let checkResult = buildResult.ok ? passedBuildCheck() : failedBuildCheck(buildResult.log);

    if (unitPresence === "absent") {
      enforcedValidation.match_check = "skipped";
    } else if (preSnapshot) {
      const postSnapshot = await captureMatchSnapshotWithRetry({
        repoRoot: params.globals.repoRoot,
        sourcePath: params.item.source_path,
        capture: repairChecks.captureUnitMatchSnapshot,
        wait: repairChecks.waitForSnapshotRetry,
      });
      if (postSnapshot) {
        try {
          const comparison = repairChecks.compareUnitMatchSnapshots(preSnapshot, postSnapshot);
          checkResult = buildResult.ok
            ? comparison
            : {
                ...comparison,
                ok: false,
                buildOk: false,
                ...(checkResult.buildLog ? { buildLog: checkResult.buildLog } : {}),
              };
          enforcedValidation.match_check =
              comparison.exactRegressions.length > 0 || comparison.sectionRegressions.length > 0 ? "failed" : "passed";
        } catch {
          enforcedValidation.match_check = "unavailable";
          independentFailureReasons.push("match verification unavailable");
        }
      } else {
        enforcedValidation.match_check = "unavailable";
        independentFailureReasons.push("match verification unavailable");
      }
    } else {
      enforcedValidation.match_check = "unavailable";
    }
    if (enforcedValidation.match_check === "unavailable") checkResult = { ...checkResult, ok: false };
    enforcedValidation.check_result = checkResult;

    if (!buildResult.ok) independentFailureReasons.push("enforced per-source object build failed");
    for (const regression of checkResult.exactRegressions) {
      independentFailureReasons.push(`exact function regressed: ${regression.name} (${regression.before} -> ${regression.after})`);
    }
    for (const regression of checkResult.sectionRegressions) {
      independentFailureReasons.push(`matched section regressed: ${regression.name} (${regression.before} -> ${regression.after})`);
    }

    if ((headerRevertBroken || !headerCheckFailed) && [...headerFailureReasons, ...independentFailureReasons].length > 0) {
      await restoreTarget();
      if (headerRevertBroken && targetRestored) enforcedValidation.restored_build = buildResult;
      await confirmRestoredBuild();
    }
  }
  const commandValidations = await runQaRepairValidationCommands({
    commands: params.validationCommands,
    globals: params.globals,
    runId: params.runId,
    item: params.item,
    itemDir,
    baseRef: params.baseRef,
  });
  const scoreValidation = commandValidationByKind(commandValidations, "score");
  let validation = validateQaRepairOutcome({
    item: params.item,
    postScan: postScan.result,
    postScanToolError: postScan.toolError,
    scorePassed: commandPassed(scoreValidation),
    scoreImpact: scoreValidation?.scoreImpact ?? validated.result.score_impact,
    preTargetScore: scoreValidation?.preTargetScore,
    postTargetScore: scoreValidation?.postTargetScore,
    buildPassed: commandPassed(commandValidationByKind(commandValidations, "build")),
    regressionPassed: commandPassed(commandValidationByKind(commandValidations, "regression")),
    falsePositive: validated.result.outcome === "false_positive",
    blockedReason: validated.result.outcome === "blocked" ? validated.result.summary : undefined,
    validationArtifacts: {
      agent_output: run.outputPath,
      parsed_output: parsedOutputPath,
      post_scan: postScanPath,
      ...validationArtifactPaths(commandValidations),
    },
  });
  if (headerRevertBroken) {
    validation = forceNeedsRework(validation, params.item, [...headerFailureReasons, ...independentFailureReasons]);
  } else if (headerCheckFailed) {
    if (
      independentFailureReasons.length === 0 &&
      (validation.status === "clean_same_match" || validation.status === "clean_lower_score")
    ) {
      validation = {
        ...validation,
        reasons: [
          ...validation.reasons,
          `unauthorized header edit(s) reverted: ${headerResult.changedPaths.join(", ")}; target repair validated independently`,
        ],
      };
    } else {
      await restoreTarget();
      await confirmRestoredBuild();
      validation = forceBlockedNeedsCrossFile(
        validation,
        params.item,
        headerResult.changedPaths,
        [...headerFailureReasons, ...independentFailureReasons],
      );
    }
  } else if (independentFailureReasons.length > 0) {
    validation = forceNeedsRework(validation, params.item, independentFailureReasons);
  }
  const validationPath = resolve(itemDir, "validation.json");
  await writeFile(
    validationPath,
    `${JSON.stringify({ ...validation, enforced_checks: enforcedValidation, header_scope: headerResult }, null, 2)}\n`,
  );
  return {
    item: applyValidation(
      params.item,
      validation,
      attemptWithEnforcedChecks(
        {
          ...baseAttempt,
          status: validation.status === "clean_same_match" || validation.status === "clean_lower_score" ? "validated" : "validation_failed",
          parsedOutputPath,
          postScanPath,
          scoreCheckPath: validationSummaryPath(commandValidations, "score"),
          buildCheckPath: validationSummaryPath(commandValidations, "build"),
          regressionCheckPath: validationSummaryPath(commandValidations, "regression"),
          validationPath,
          summary: validation.reasons.join("; "),
        },
        enforcedValidation,
        headerResult,
      ),
    ),
  };
}

export function mergeProcessedItem(queue: QaRepairQueue, processed: ProcessedQaRepairItem): QaRepairQueue {
  return {
    ...queue,
    items: queue.items.map((item) => (item.id === processed.item.id ? processed.item : item)),
  };
}

export async function processQueueItem(params: ProcessQueueItemParams): Promise<QaRepairQueue> {
  const processed = await processSingleItem({
    globals: params.globals,
    runId: params.runId,
    item: params.item,
    queueSummary: summarizeQaRepairQueue(params.queue),
    outputDir: params.outputDir,
    baseRef: params.baseRef,
    validationCommands: params.validationCommands,
    runner: params.runner,
    ...(params.agentOverrides ? { agentOverrides: params.agentOverrides } : {}),
    ...(params.enforcedChecks !== undefined ? { enforcedChecks: params.enforcedChecks } : {}),
    ...(params.repairChecks ? { repairChecks: params.repairChecks } : {}),
  });
  return mergeProcessedItem(params.queue, processed);
}

export async function runQaRepair(
  globals: GlobalArgs,
  args: Map<string, string | true>,
  runner: QaRepairAgentRunner = runPiAgent,
  options: RunQaRepairOptions = {},
): Promise<{ queue: QaRepairQueue; artifacts: { queuePath: string; summaryPath: string; reportPath: string; shipStatusPath: string }; outputDir: string }> {
  const runId = stringArg(args, "--run-id", "") || latestRunId(globals.stateDir);
  const baseRef = stringArg(args, "--base-ref", globals.game?.baseRef ?? "origin/master");
  const explicitOutputDir = stringArg(args, "--output-dir", "");
  const outputDir = explicitOutputDir ? resolvePath(explicitOutputDir) : resolve(globals.stateDir, "qa_repairs", runId, artifactTimestamp());
  await mkdir(outputDir, { recursive: true });

  const checkpointArg = stringArg(args, "--checkpoint", "");
  const checkpointPath = checkpointArg === "none" ? "" : checkpointArg ? resolvePath(checkpointArg) : latestCheckpointPath(globals.stateDir, runId);
  const checkpoint = checkpointPath && existsSync(checkpointPath) ? readJson(checkpointPath) : null;
  const checkpointCandidates = candidateProofsFromCheckpoint(checkpoint, {
    includeImprovementCandidates: !booleanArg(args, "--match-only"),
  }).map((proof) => proof.sourcePath);
  const explicitCandidates = [
    ...stringList(stringArg(args, "--candidate-files", "")),
    ...candidateListFromFile(stringArg(args, "--candidate-list", "")),
  ];
  const candidateFiles = [...new Set([...checkpointCandidates, ...explicitCandidates])];

  const scanJsonPath = stringArg(args, "--scan-json", "");
  const validationCommands: QaRepairValidationCommands = {
    score: stringArg(args, "--score-check-command", ""),
    build: stringArg(args, "--build-check-command", ""),
    regression: stringArg(args, "--regression-check-command", ""),
  };
  let scanResult: QaScanResult;
  if (scanJsonPath) {
    scanResult = scanResultFromJson(readJson(resolvePath(scanJsonPath)), scanJsonPath);
  } else {
    const invocation = await runQaScanDiff({
      repoRoot: globals.repoRoot,
      orchestratorRoot: packageRoot(),
      game: globals.game,
      stateDir: globals.stateDir,
      baseRef,
      files: candidateFiles.length > 0 ? candidateFiles : undefined,
      includeWorktree: true,
      gate: false,
      surface: "pr_gate",
    });
    await writeScanInvocation(outputDir, "pre_scan", invocation);
    if (!invocation.result || invocation.toolError) {
      throw new Error(`QA repair scan failed: ${invocation.toolError ?? "missing scanner result"}`);
    }
    scanResult = invocation.result;
  }

  let queue = buildQaRepairQueue({
    runId,
    repoRoot: globals.repoRoot,
    baseRef,
    headSha: await headSha(globals.repoRoot),
    scanResult,
    checkpoint,
    candidateFiles,
    includeImprovementCandidates: !booleanArg(args, "--match-only"),
    includeAllScanFilesWhenNoCandidates: booleanArg(args, "--all-scan-files") || candidateFiles.length === 0,
    repairWarnings: booleanArg(args, "--repair-warnings"),
    createdAt: new Date().toISOString(),
    dryRun: globals.dryRunAgents || !booleanArg(args, "--run-agents"),
  });

  if (booleanArg(args, "--run-agents")) {
    const itemId = stringArg(args, "--item-id", "");
    const maxItems = Math.max(0, Math.floor(numberArg(args, "--max-items", queue.items.length)));
    const selected = queue.items
      .filter((item) => !itemId || item.id === itemId)
      .slice(0, maxItems);
    if (itemId && selected.length === 0) throw new Error(`No QA repair queue item with id ${itemId}`);
    for (const item of selected) {
      queue = await processQueueItem({
        globals,
        runId,
        queue,
        item,
        outputDir,
        baseRef,
        validationCommands,
        runner,
        ...(options.enforcedChecks !== undefined ? { enforcedChecks: options.enforcedChecks } : {}),
        ...(options.repairChecks ? { repairChecks: options.repairChecks } : {}),
      });
      await writeArtifacts(queue, outputDir);
    }
  }

  const artifacts = await writeArtifacts(queue, outputDir);
  return { queue, artifacts, outputDir };
}

export async function qaRepair(globals: GlobalArgs, args: Map<string, string | true>): Promise<void> {
  const result = await runQaRepair(globals, args);
  const summary = summarizeQaRepairQueue(result.queue, {
    artifact_dir: result.outputDir,
    queue_path: result.artifacts.queuePath,
    summary_path: result.artifacts.summaryPath,
    report_path: result.artifacts.reportPath,
    ship_status_path: result.artifacts.shipStatusPath,
  });
  console.log(JSON.stringify(summary, null, 2));
}
