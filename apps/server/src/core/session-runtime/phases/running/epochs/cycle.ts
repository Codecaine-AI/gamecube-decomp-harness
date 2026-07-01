import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, symlinkSync } from "node:fs";
import { chmod, copyFile, mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { closenessScore } from "../board/candidates.js";
import { readRegressionReport, type RegressionReport, type ReportEntry } from "@server/core/validation/objdiff/report.js";
import { runQaScanDiff, type QaScanFinding } from "@server/core/validation/qa/scan-diff.js";
import { forceReportRun, trustedReportFromRegressionReport, type ReportRunResult } from "@server/core/validation/report";
import { addSavePoint, ensureCampaign, type SavePointRecord } from "@server/core/session-runtime/phases/pr/state";
import { recordDashboardArtifact, type StateStore } from "@server/core/orchestrator-state";
import { blockingWorkerOutputIntegrationCount } from "@server/core/session-runtime/run-state";
import { addEvent } from "@server/core/session-runtime/run-state/events.js";
import { activeLockedSourcePaths, admitPriorityTargets } from "@server/core/session-runtime/run-state/targets.js";
import { processWorkerOutputIntegrationQueue } from "@server/core/session-runtime/phases/running/integration/worker-output-queue.js";
import type { TargetCandidate } from "@server/core/shared/types/index.js";

/** Paths never staged by an epoch commit: the nested orchestrator repo and generated state. */
const EPOCH_COMMIT_EXCLUDES = ["decomp-orchestrator", ".decomp-orchestrator-state"];

export interface EpochCycleOptions {
  baseRef?: string;
  /** Shell command run in the epoch worktree before the report build; "" skips it. */
  configureCommand?: string;
  label?: string | null;
  /** Untracked build inputs symlinked from the live repo into the worktree (e.g. orig assets). */
  linkPaths?: string[];
  projectId?: string | null;
  /** Above this many regressed report rows the cycle pauses instead of admitting repairs. */
  regressionPauseThreshold?: number;
  regressionRequeueLimit?: number;
  /** Added to repair-target priority so repairs outrank every board candidate. */
  repairPriorityBase?: number;
  reportRelPath?: string;
  reportChangesRelPath?: string;
  baselineRelPath?: string;
  /** When false the cycle plans regression repair but does not admit targets. */
  requeueRegressions?: boolean;
  stateDirRelative?: string | null;
  worktreeDir: string;
  /**
   * When provided, the review_lint QA scan runs against the epoch worktree
   * after the report build (observability only — the L2 ship gate in
   * regression-check is the hard stop). Omitted = no scan.
   */
  qaScan?: { orchestratorRoot: string };
}

export interface EpochQaGateSummary {
  exitCode: number;
  status: string;
  errors: number;
  warnings: number;
  findings: QaScanFinding[];
}

export interface EpochRegressionSummary {
  brokenMatches: number;
  fuzzyRegressions: number;
  metricRegressions: number;
  regressedFunctions: number;
  regressedSections: number;
}

export interface EpochRepairResult {
  paused: boolean;
  planned: number;
  reasons: string[];
  requeued: number;
}

export interface EpochCycleResult {
  artifactDir: string;
  buildSteps: { name: string; command: string[]; exitCode: number }[];
  commitSha: string | null;
  committed: boolean;
  durationMs: number;
  label: string | null;
  lockedPathsExcluded: string[];
  matchedCodePercent: number | null;
  measures: Record<string, unknown>;
  /** QA scan verdict for this epoch's diff, or null when the scan was not requested. */
  qaGate: EpochQaGateSummary | null;
  regressions: EpochRegressionSummary;
  repair: EpochRepairResult;
  reportCopiedToRepo: boolean;
  savePointId: string | null;
  worktreeDir: string;
}

interface GitResult {
  ok: boolean;
  text: string;
}

async function git(cwd: string, args: string[]): Promise<GitResult> {
  const proc = Bun.spawn(["git", "-C", cwd, ...args], { stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, exitCode] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
  return { ok: exitCode === 0, text: exitCode === 0 ? stdout.trimEnd() : stderr.trim() };
}

function artifactTimestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function pathspecExcludes(paths: string[]): string[] {
  return paths.map((path) => `:(exclude)${path}`);
}

/**
 * Commit everything except in-flight worker files. Active-lease files stay
 * uncommitted on purpose: the epoch measures validated work only, and a
 * half-finished attempt must not poison the checkpoint build. Work excluded
 * here simply lands in the next epoch's commit.
 */
async function commitEpochSnapshot(params: {
  repoRoot: string;
  excludePaths: string[];
  stateDirRelative: string | null;
  message: string;
}): Promise<{ commitSha: string | null; committed: boolean; warning: string | null }> {
  const candidateExcludes = [...EPOCH_COMMIT_EXCLUDES, ...(params.stateDirRelative ? [params.stateDirRelative] : []), ...params.excludePaths];
  // Gitignored paths can never be staged by `add -A`, and naming one in a
  // pathspec makes git exit non-zero ("paths are ignored by .gitignore"),
  // which silently aborted every epoch commit. Exclude only non-ignored paths.
  const excludes: string[] = [];
  for (const path of candidateExcludes) {
    const ignored = await git(params.repoRoot, ["check-ignore", "-q", path]);
    if (!ignored.ok) excludes.push(path);
  }
  const add = await git(params.repoRoot, ["add", "-A", "--", ".", ...pathspecExcludes(excludes)]);
  let warning: string | null = null;
  let committed = false;
  if (!add.ok) {
    warning = `git add failed: ${add.text}`;
  } else {
    const commit = await git(params.repoRoot, ["commit", "-m", params.message]);
    if (commit.ok) committed = true;
    else if (!/nothing to commit|nothing added to commit/.test(commit.text)) warning = `git commit failed: ${commit.text}`;
  }
  const head = await git(params.repoRoot, ["rev-parse", "HEAD"]);
  return { commitSha: head.ok ? head.text : null, committed, warning };
}

/**
 * The epoch worktree is a persistent sibling checkout used for checkpoint
 * builds. It trails the live tree by one epoch, so its ninja state makes each
 * report build incremental; only the first build pays full cost.
 */
async function ensureEpochWorktree(params: { repoRoot: string; worktreeDir: string; commitSha: string; linkPaths: string[] }): Promise<void> {
  const hasGitFile = existsSync(resolve(params.worktreeDir, ".git"));
  const usable = hasGitFile ? await git(params.worktreeDir, ["rev-parse", "--is-inside-work-tree"]) : null;
  if (hasGitFile && !usable?.ok) {
    await git(params.repoRoot, ["worktree", "prune"]);
    await rm(params.worktreeDir, { recursive: true, force: true });
  }

  if (!existsSync(resolve(params.worktreeDir, ".git"))) {
    await mkdir(resolve(params.worktreeDir, ".."), { recursive: true });
    // A manually deleted worktree directory can stay registered; prune before
    // re-adding so the cycle recovers instead of failing forever. A stale .git
    // file can also point at an old checkout; in that case the generated epoch
    // worktree is discarded above and rebuilt from the current repo.
    await git(params.repoRoot, ["worktree", "prune"]);
    const added = await git(params.repoRoot, ["worktree", "add", "--detach", params.worktreeDir, params.commitSha]);
    if (!added.ok) throw new Error(`epoch worktree add failed: ${added.text}`);
  } else {
    const checkout = await git(params.worktreeDir, ["checkout", "--force", "--detach", params.commitSha]);
    if (!checkout.ok) throw new Error(`epoch worktree checkout failed: ${checkout.text}`);
  }
  for (const linkPath of params.linkPaths) {
    const source = resolve(params.repoRoot, linkPath);
    const destination = resolve(params.worktreeDir, linkPath);
    if (!existsSync(source)) continue;
    if (statSync(source).isDirectory()) {
      linkMissingTree(source, destination);
    } else if (!existsSync(destination)) {
      symlinkSync(source, destination);
    }
  }
}

function linkMissingTree(sourceDir: string, targetDir: string): number {
  let linked = 0;
  mkdirSync(targetDir, { recursive: true });
  for (const entry of readdirSync(sourceDir)) {
    const sourcePath = resolve(sourceDir, entry);
    const targetPath = resolve(targetDir, entry);
    if (statSync(sourcePath).isDirectory()) {
      linked += linkMissingTree(sourcePath, targetPath);
    } else if (!existsSync(targetPath)) {
      symlinkSync(sourcePath, targetPath);
      linked += 1;
    }
  }
  return linked;
}

async function runConfigure(worktreeDir: string, command: string): Promise<void> {
  if (!command.trim()) return;
  // Non-login shell on purpose: a login shell re-sources /etc/profile and can
  // shadow the orchestrator's PATH with stale interpreters (e.g. python 2.7).
  const proc = Bun.spawn(["/bin/sh", "-c", command], { cwd: worktreeDir, stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, exitCode] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
  if (exitCode !== 0) {
    const output = stderr || stdout || "no output";
    throw new Error(`epoch configure failed (${exitCode}): ${output.slice(-2000)}`);
  }
}

async function seedEpochWibo(worktreeDir: string, stateDir: string): Promise<boolean> {
  if (process.platform !== "darwin" && process.platform !== "linux") return false;
  const source = resolve(stateDir, "tools", "wibo");
  if (!existsSync(source)) return false;
  const destination = resolve(worktreeDir, "build", "tools", "wibo");
  await mkdir(dirname(destination), { recursive: true });
  await copyFile(source, destination);
  await chmod(destination, 0o755).catch(() => {});
  return true;
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

function configureCommandWithLocalWrapper(command: string, wrapperPath: string): string {
  if (!/\bconfigure\.py\b/.test(command)) return command;
  const pattern = /(^|\s)--wrapper(?:\s+|=)(?:"[^"]*"|'[^']*'|\S+)/;
  const replacement = `--wrapper ${shellQuote(wrapperPath)}`;
  if (pattern.test(command)) return command.replace(pattern, (_match, prefix: string) => `${prefix}${replacement}`);
  return `${command} ${replacement}`;
}

function readJsonObject(path: string): Record<string, unknown> {
  const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
  return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
}

function reportMeasures(reportPath: string): Record<string, unknown> {
  try {
    const report = readJsonObject(reportPath);
    const measures = report.measures;
    return measures && typeof measures === "object" && !Array.isArray(measures) ? (measures as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function sourcePathByUnit(reportPath: string): Map<string, string> {
  const map = new Map<string, string>();
  try {
    const report = readJsonObject(reportPath);
    for (const unitValue of Array.isArray(report.units) ? report.units : []) {
      const unit = unitValue as Record<string, unknown>;
      const name = typeof unit.name === "string" ? unit.name : "";
      const metadata = (unit.metadata ?? {}) as Record<string, unknown>;
      const sourcePath = typeof metadata.source_path === "string" ? metadata.source_path : "";
      if (name && sourcePath) map.set(name, sourcePath);
    }
  } catch {
    // Missing or malformed report: repair candidates without a source path are skipped.
  }
  return map;
}

function isSectionRow(entry: ReportEntry): boolean {
  return entry.itemName.startsWith(".");
}

export interface RegressionRepairPlan {
  paused: boolean;
  reasons: string[];
  repairCandidates: TargetCandidate[];
  summary: EpochRegressionSummary;
}

/**
 * Regressed functions become ordinary epoch targets with a priority floor that
 * outranks the whole board: repair-by-readmission instead of revert-and-bisect.
 * Section rows (data/rodata) count toward the pause decision but are not
 * admissible as function targets.
 */
export function planRegressionRepair(
  report: Pick<RegressionReport, "brokenMatches" | "fuzzyRegressions" | "regressions">,
  params: {
    pauseThreshold: number;
    repairPriorityBase: number;
    requeueLimit: number;
    sourcePaths: Map<string, string>;
  },
): RegressionRepairPlan {
  const regressed = [...report.brokenMatches, ...report.fuzzyRegressions];
  const regressedFunctions = regressed.filter((entry) => !isSectionRow(entry));
  const regressedSections = regressed.length - regressedFunctions.length;
  const summary: EpochRegressionSummary = {
    brokenMatches: report.brokenMatches.length,
    fuzzyRegressions: report.fuzzyRegressions.length,
    metricRegressions: report.regressions.length,
    regressedFunctions: regressedFunctions.length,
    regressedSections,
  };
  const reasons: string[] = [];

  if (params.pauseThreshold > 0 && regressed.length > params.pauseThreshold) {
    reasons.push(`${regressed.length} regressed rows exceed pause threshold ${params.pauseThreshold}; refusing to admit repairs or continue`);
    return { paused: true, reasons, repairCandidates: [], summary };
  }

  const ordered = [...regressedFunctions].sort((left, right) => left.bytesDelta - right.bytesDelta);
  const repairCandidates: TargetCandidate[] = [];
  for (const entry of ordered) {
    if (repairCandidates.length >= params.requeueLimit) {
      reasons.push(`repair admission limit ${params.requeueLimit} reached; ${ordered.length - repairCandidates.length} regressed functions left to next epoch`);
      break;
    }
    const sourcePath = params.sourcePaths.get(entry.unitName) ?? "";
    if (!sourcePath) {
      reasons.push(`no source path for regressed ${entry.unitName}::${entry.itemName}; skipped`);
      continue;
    }
    repairCandidates.push({
      unit: entry.unitName,
      sourcePath,
      symbol: entry.itemName,
      size: entry.size,
      fuzzy: entry.toPercent,
      priority: params.repairPriorityBase + closenessScore(entry.size, entry.toPercent),
      reason: `epoch regression repair: ${entry.fromPercent.toFixed(2)}% -> ${entry.toPercent.toFixed(2)}% (${entry.bytesDelta} bytes)`,
    });
  }
  return { paused: false, reasons, repairCandidates, summary };
}

function compactSteps(result: ReportRunResult): { name: string; command: string[]; exitCode: number }[] {
  return result.steps.map((step) => ({ name: step.name, command: step.command, exitCode: step.exitCode }));
}

function stateDirRelativeToRepo(repoRoot: string, stateDir: string): string | null {
  const rel = relative(repoRoot, stateDir);
  return rel && !rel.startsWith("..") && !isAbsolute(rel) ? rel : null;
}

function epochProgress(
  store: StateStore,
  runId: string,
  params: {
    label: string | null;
    message: string;
    phase: string;
    status: "started" | "finished" | "skipped" | "warning";
  } & Record<string, unknown>,
): void {
  const { label, message, phase, status, ...extra } = params;
  console.error(`[epoch] ${label ?? runId.slice(0, 8)} ${phase} ${status}: ${message}`);
  addEvent(store, runId, "epoch_checkpoint_progress", "epoch-cycle", {
    label,
    message,
    phase,
    status,
    ...extra,
    created_by: "epoch-cycle",
  });
}

/**
 * One epoch checkpoint: commit validated work (excluding in-flight worker
 * files), rebuild the full objdiff report in the trailing worktree, publish
 * the fresh report to the live repo for board scoring, admit regression
 * repairs, record the progress save point, and let the caller refresh target
 * availability from the now-fresh board after the boundary closes.
 */
export async function runEpochCycle(store: StateStore, runId: string, repoRoot: string, stateDir: string, options: EpochCycleOptions): Promise<EpochCycleResult> {
  // Bracket the cycle with events so observers (the dashboard) can tell an
  // in-flight checkpoint build apart from one that is merely due.
  addEvent(store, runId, "epoch_started", "epoch-cycle", { label: options.label ?? null, created_by: "epoch-cycle" });
  try {
    const result = await runEpochCycleInner(store, runId, repoRoot, stateDir, options);
    addEvent(store, runId, "epoch_finished", "epoch-cycle", {
      label: options.label ?? null,
      status: result.repair.paused ? "paused" : "success",
      matched_code_percent: result.matchedCodePercent,
      created_by: "epoch-cycle",
    });
    return result;
  } catch (error) {
    addEvent(store, runId, "epoch_finished", "epoch-cycle", {
      label: options.label ?? null,
      status: "error",
      error: (error instanceof Error ? error.message : String(error)).slice(0, 2000),
      created_by: "epoch-cycle",
    });
    throw error;
  }
}

async function runEpochCycleInner(store: StateStore, runId: string, repoRoot: string, stateDir: string, options: EpochCycleOptions): Promise<EpochCycleResult> {
  const startedAt = Date.now();
  const label = options.label ?? null;
  const reportRelPath = options.reportRelPath ?? "build/GALE01/report.json";
  const reportChangesRelPath = options.reportChangesRelPath ?? "build/GALE01/report_changes.json";
  const baselineRelPath = options.baselineRelPath ?? "build/GALE01/baseline.json";
  epochProgress(store, runId, {
    label,
    phase: "integration_drain",
    status: "started",
    message: "checking worker integration queue before checkpoint build",
  });
  const integrationDrain = await processWorkerOutputIntegrationQueue({
    dryRun: false,
    limit: 64,
    repoRoot,
    sessionId: runId,
    stateDir,
    store,
  });
  const blockingIntegrations = blockingWorkerOutputIntegrationCount(store, runId);
  if (blockingIntegrations > 0) {
    throw new Error(
      `epoch checkpoint blocked by ${blockingIntegrations} unresolved worker output integration item(s): ${JSON.stringify(integrationDrain.queueSummary)}`,
    );
  }
  epochProgress(store, runId, {
    label,
    phase: "integration_drain",
    status: "finished",
    message: "worker integration queue drained",
    queue_summary: integrationDrain.queueSummary,
  });
  const lockedPaths = [...activeLockedSourcePaths(store)].sort();
  const stateDirRelative = options.stateDirRelative !== undefined ? options.stateDirRelative : stateDirRelativeToRepo(repoRoot, stateDir);

  epochProgress(store, runId, {
    label,
    phase: "snapshot_commit",
    status: "started",
    message: `committing epoch snapshot with ${lockedPaths.length} locked path(s) excluded`,
    locked_path_count: lockedPaths.length,
  });
  const snapshot = await commitEpochSnapshot({
    repoRoot,
    excludePaths: lockedPaths,
    stateDirRelative,
    message: `epoch(${runId.slice(0, 8)}): ${label ?? artifactTimestamp()}`,
  });
  if (snapshot.warning) console.error(`[epoch] ${snapshot.warning}`);
  if (!snapshot.commitSha) throw new Error("epoch commit failed: could not resolve HEAD");
  epochProgress(store, runId, {
    label,
    phase: "snapshot_commit",
    status: "finished",
    message: snapshot.committed ? `snapshot committed at ${snapshot.commitSha.slice(0, 10)}` : `using existing HEAD ${snapshot.commitSha.slice(0, 10)}`,
    commit_sha: snapshot.commitSha,
    committed: snapshot.committed,
  });

  epochProgress(store, runId, {
    label,
    phase: "worktree_prepare",
    status: "started",
    message: `preparing epoch worktree at ${options.worktreeDir}`,
    worktree_dir: options.worktreeDir,
  });
  await ensureEpochWorktree({
    repoRoot,
    worktreeDir: options.worktreeDir,
    commitSha: snapshot.commitSha,
    linkPaths: options.linkPaths ?? ["orig"],
  });
  const hasLocalWibo = await seedEpochWibo(options.worktreeDir, stateDir);
  const configureCommand = hasLocalWibo
    ? configureCommandWithLocalWrapper(options.configureCommand ?? "python3 configure.py --require-protos", "build/tools/wibo")
    : (options.configureCommand ?? "python3 configure.py --require-protos");
  epochProgress(store, runId, {
    label,
    phase: "configure",
    status: configureCommand.trim() ? "started" : "skipped",
    message: configureCommand.trim() ? `running configure command: ${configureCommand}` : "configure command is empty",
    worktree_dir: options.worktreeDir,
  });
  await runConfigure(options.worktreeDir, configureCommand);
  if (configureCommand.trim()) {
    epochProgress(store, runId, {
      label,
      phase: "configure",
      status: "finished",
      message: "configure command finished",
      worktree_dir: options.worktreeDir,
    });
  }

  const worktreeBaselinePath = resolve(options.worktreeDir, baselineRelPath);
  epochProgress(store, runId, {
    label,
    phase: "report_build",
    status: "started",
    message: `building objdiff report in epoch worktree${existsSync(worktreeBaselinePath) ? "" : " with baseline reset"}`,
    reset_baseline: !existsSync(worktreeBaselinePath),
    worktree_dir: options.worktreeDir,
  });
  const buildResult = await forceReportRun(options.worktreeDir, { resetBaseline: !existsSync(worktreeBaselinePath) });
  epochProgress(store, runId, {
    label,
    phase: "report_build",
    status: "finished",
    message: `report build finished with ${buildResult.steps.length} step(s)`,
    step_count: buildResult.steps.length,
    failed_step_count: buildResult.steps.filter((step) => step.exitCode !== 0).length,
  });

  const worktreeReportPath = resolve(options.worktreeDir, reportRelPath);
  const worktreeChangesPath = resolve(options.worktreeDir, reportChangesRelPath);
  epochProgress(store, runId, {
    label,
    phase: "report_read",
    status: "started",
    message: "reading epoch report and regression summary",
    report_path: worktreeReportPath,
    report_changes_path: worktreeChangesPath,
  });
  const regressionReport = await readRegressionReport(worktreeChangesPath, `Epoch checkpoint for run ${runId}`, 50);
  const measures = reportMeasures(worktreeReportPath);
  const matchedCodeValue = Number(measures.matched_code_percent);
  const matchedCodePercent = Number.isFinite(matchedCodeValue) ? matchedCodeValue : null;
  epochProgress(store, runId, {
    label,
    phase: "report_read",
    status: "finished",
    message: `report read finished at matched_code ${matchedCodePercent ?? "?"}%`,
    matched_code_percent: matchedCodePercent,
    regressed_functions: regressionReport.brokenMatches.length + regressionReport.fuzzyRegressions.length,
  });

  const artifactDir = resolve(stateDir, "epochs", artifactTimestamp());
  await mkdir(artifactDir, { recursive: true });
  await copyFile(worktreeReportPath, resolve(artifactDir, "report.json"));
  await copyFile(worktreeChangesPath, resolve(artifactDir, "report_changes.json"));
  await writeFile(resolve(artifactDir, "pr_report.md"), regressionReport.markdown);

  // QA scan of this epoch's diff, recorded for observability. Any failure here
  // (including a broken scanner) must never abort the epoch cycle: the L2 ship
  // gate in regression-check is the hard stop, this is the dashboard's view.
  let qaGate: EpochQaGateSummary | null = null;
  if (options.qaScan) {
    try {
      epochProgress(store, runId, {
        label,
        phase: "qa_scan",
        status: "started",
        message: "running epoch diff QA scan",
        worktree_dir: options.worktreeDir,
      });
      const qaInvocation = await runQaScanDiff({
        repoRoot: options.worktreeDir,
        orchestratorRoot: options.qaScan.orchestratorRoot,
        stateDir,
        worktreeId: "epoch",
        baseRef: options.baseRef ?? "origin/master",
      });
      qaGate = {
        exitCode: qaInvocation.exitCode,
        status: qaInvocation.toolError !== null ? "tool_error" : (qaInvocation.result?.status ?? "unknown"),
        errors: qaInvocation.result?.counts.errors ?? 0,
        warnings: qaInvocation.result?.counts.warnings ?? 0,
        findings: qaInvocation.result?.findings ?? [],
      };
      await writeFile(
        resolve(artifactDir, "qa_scan.json"),
        qaInvocation.stdout || `${JSON.stringify({ tool_error: qaInvocation.toolError }, null, 2)}\n`,
      );
      if (qaInvocation.stderr) await writeFile(resolve(artifactDir, "qa_scan.txt"), qaInvocation.stderr);
      if (qaInvocation.toolError !== null) console.error(`[epoch] qa scan tool error: ${qaInvocation.toolError}`);
      epochProgress(store, runId, {
        label,
        phase: "qa_scan",
        status: "finished",
        message: `QA scan ${qaGate.status} (${qaGate.errors} errors, ${qaGate.warnings} warnings)`,
        qa_status: qaGate.status,
        qa_errors: qaGate.errors,
        qa_warnings: qaGate.warnings,
      });
    } catch (error) {
      console.error(`[epoch] qa scan failed: ${error instanceof Error ? error.message : String(error)}`);
      qaGate = { exitCode: -1, status: "tool_error", errors: 0, warnings: 0, findings: [] };
      epochProgress(store, runId, {
        label,
        phase: "qa_scan",
        status: "warning",
        message: `QA scan failed: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  } else {
    epochProgress(store, runId, {
      label,
      phase: "qa_scan",
      status: "skipped",
      message: "epoch diff QA scan is not configured",
    });
  }

  // Publish the fresh report so board scoring, refill, and the dashboard all
  // read this epoch's reality instead of whatever stale report preceded it.
  let reportCopiedToRepo = false;
  const repoReportPath = resolve(repoRoot, reportRelPath);
  const repoChangesPath = resolve(repoRoot, reportChangesRelPath);
  try {
    epochProgress(store, runId, {
      label,
      phase: "report_publish",
      status: "started",
      message: "publishing epoch report back to the live repo",
      report_path: repoReportPath,
    });
    await copyFile(worktreeReportPath, repoReportPath);
    await copyFile(worktreeChangesPath, repoChangesPath);
    reportCopiedToRepo = true;
    epochProgress(store, runId, {
      label,
      phase: "report_publish",
      status: "finished",
      message: "epoch report published to live repo",
      report_path: repoReportPath,
    });
  } catch (error) {
    console.error(`[epoch] failed to publish report to repo: ${error instanceof Error ? error.message : String(error)}`);
    epochProgress(store, runId, {
      label,
      phase: "report_publish",
      status: "warning",
      message: `failed to publish report to repo: ${error instanceof Error ? error.message : String(error)}`,
      report_path: repoReportPath,
    });
  }

  // Advance the baseline so the next epoch diffs epoch-over-epoch. A regression
  // is flagged (and readmitted) exactly once, then tracked through epoch targets.
  await copyFile(worktreeReportPath, worktreeBaselinePath);

  epochProgress(store, runId, {
    label,
    phase: "regression_repair",
    status: "started",
    message: "planning epoch regression repairs",
  });
  const plan = planRegressionRepair(regressionReport, {
    pauseThreshold: options.regressionPauseThreshold ?? 12,
    repairPriorityBase: options.repairPriorityBase ?? 400,
    requeueLimit: options.regressionRequeueLimit ?? 32,
    sourcePaths: sourcePathByUnit(worktreeReportPath),
  });
  let requeued = 0;
  if (!plan.paused && plan.repairCandidates.length > 0 && (options.requeueRegressions ?? true)) {
    requeued = admitPriorityTargets(store, runId, plan.repairCandidates);
  }
  const repair: EpochRepairResult = {
    paused: plan.paused,
    planned: plan.repairCandidates.length,
    reasons: plan.reasons,
    requeued,
  };
  epochProgress(store, runId, {
    label,
    phase: "regression_repair",
    status: "finished",
    message: plan.paused
      ? `repair planning paused on ${plan.summary.regressedFunctions} regressed function(s)`
      : `repair planning finished: ${plan.repairCandidates.length} planned, ${requeued} requeued`,
    paused: plan.paused,
    planned: plan.repairCandidates.length,
    requeued,
    regressions: plan.summary,
  });

  let savePoint: SavePointRecord | null = null;
  try {
    epochProgress(store, runId, {
      label,
      phase: "save_point",
      status: "started",
      message: "recording epoch save point and dashboard artifacts",
      artifact_dir: artifactDir,
    });
    const branch = await git(repoRoot, ["rev-parse", "--abbrev-ref", "HEAD"]);
    const campaign = ensureCampaign(store, {
      projectId: options.projectId ?? null,
      branch: branch.ok ? branch.text : null,
      baseRef: options.baseRef ?? "origin/master",
    });
    savePoint = addSavePoint(store, {
      campaignId: campaign.id,
      runId,
      triggerKind: "epoch",
      label,
      commitSha: snapshot.commitSha,
      branch: branch.ok ? branch.text : null,
      baseRef: options.baseRef ?? null,
      committed: snapshot.committed,
      worktreeDirty: lockedPaths.length > 0,
      matchedCodePercent,
      reportPath: resolve(artifactDir, "report.json"),
      reportChangesPath: resolve(artifactDir, "report_changes.json"),
      artifactDir,
      payload: {
        epoch: true,
        measures,
        qa_gate: qaGate,
        regressions: plan.summary,
        repair,
        locked_paths_excluded: lockedPaths,
        summary_delta: regressionReport.summary,
      },
    });
    recordDashboardArtifact(store, {
      runId,
      projectId: options.projectId ?? null,
      artifactType: "board_snapshot",
      artifactKey: "current",
      sourcePath: resolve(artifactDir, "report.json"),
      sourceLabel: "epoch_report",
      payload: {
        generatedAt: savePoint.createdAt,
        measures,
        candidates: [],
        reportPath: resolve(artifactDir, "report.json"),
        source: "epoch",
        savePointId: savePoint.id,
        savePointSha: savePoint.commitSha,
      },
      createdAt: savePoint.createdAt,
    });
    recordDashboardArtifact(store, {
      runId,
      projectId: options.projectId ?? null,
      artifactType: "trusted_report",
      artifactKey: "current",
      sourcePath: resolve(artifactDir, "report_changes.json"),
      sourceLabel: "build/GALE01/report_changes.json",
      payload: trustedReportFromRegressionReport(
        regressionReport,
        resolve(artifactDir, "report_changes.json"),
        "build/GALE01/report_changes.json",
        savePoint.createdAt,
        0,
      ) as unknown as Record<string, unknown>,
      createdAt: savePoint.createdAt,
    });
    epochProgress(store, runId, {
      label,
      phase: "save_point",
      status: "finished",
      message: `epoch save point recorded${savePoint.id ? `: ${savePoint.id}` : ""}`,
      save_point_id: savePoint.id,
      artifact_dir: artifactDir,
    });
  } catch (error) {
    console.error(`[epoch] failed to record save point: ${error instanceof Error ? error.message : String(error)}`);
    epochProgress(store, runId, {
      label,
      phase: "save_point",
      status: "warning",
      message: `failed to record save point: ${error instanceof Error ? error.message : String(error)}`,
      artifact_dir: artifactDir,
    });
  }

  const result: EpochCycleResult = {
    artifactDir,
    buildSteps: compactSteps(buildResult),
    commitSha: snapshot.commitSha,
    committed: snapshot.committed,
    durationMs: Date.now() - startedAt,
    label,
    lockedPathsExcluded: lockedPaths,
    matchedCodePercent,
    measures,
    qaGate,
    regressions: plan.summary,
    repair,
    reportCopiedToRepo,
    savePointId: savePoint?.id ?? null,
    worktreeDir: options.worktreeDir,
  };
  await writeFile(resolve(artifactDir, "summary.json"), `${JSON.stringify(result, null, 2)}\n`);
  return result;
}
