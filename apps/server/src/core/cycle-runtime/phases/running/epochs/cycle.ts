import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, symlinkSync } from "node:fs";
import { chmod, copyFile, mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { closenessScore } from "../board/candidates.js";
import { readRegressionReport, type RegressionReport, type ReportEntry } from "@server/core/validation/objdiff/report.js";
import { runQaScanDiff, type QaScanFinding } from "@server/core/validation/qa/scan-diff.js";
import { runPreCommitAutofix as runPreCommitAutofixDefault, type PreCommitAutofixResult } from "@server/core/validation/ci-parity/index.js";
import { forceReportRun, trustedReportFromRegressionReport, type ReportRunResult } from "@server/core/validation/report";
import { sectionMeasuresFromReport, type SectionMeasure } from "@server/core/validation/objdiff/section-measures.js";
import { ORCHESTRATOR_SCRATCH_EXCLUDES } from "@server/core/cycle-runtime/phases/pr/boundary-commit.js";
import { addSavePoint, ensureCampaign, type SavePointRecord } from "@server/core/cycle-runtime/phases/pr/state";
import {
  epochIntegrationCommitMessage,
  preparePendingIntegration,
  recordPendingIntegrationFailure,
  type DeferredSavePointEvidence,
} from "@server/core/cycle";
import type { BoundarySavePointResult } from "@server/core/cycle-runtime/phases/pr/save-points-runtime.js";
import { recordDashboardArtifact, type StateStore } from "@server/core/orchestrator-state";
import { blockingWorkerOutputIntegrationCount } from "@server/core/cycle-runtime/run-state";
import { addEvent } from "@server/core/cycle-runtime/run-state/events.js";
import { activeLockedSourcePaths } from "@server/core/cycle-runtime/run-state/targets.js";
import { processWorkerOutputIntegrationQueue } from "@server/core/cycle-runtime/phases/running/integration/worker-output-queue.js";
import { requireLease } from "@server/core/harness-state";
import { activeCycleSessionId } from "@server/core/cycle/session.js";
import { getDefaultMeleeKernelRuntime } from "@server/infrastructure/kernel/bridge/runtime.js";
import { submitMeleeWorkflowTraceEvent } from "@server/infrastructure/kernel/bridge/workflow-trace.js";
import type { TargetCandidate } from "@server/core/shared/types/index.js";
import {
  isHostToolPlatform,
  requiredStateToolArtifactError,
  resolveStateToolArtifact,
  resolveToolPlatform,
  type ToolPlatform,
} from "@server/core/tools/platform.js";
import { installMwccCacheShim } from "@server/core/tools/mwcc-cache.js";
import {
  isCleanGlobalRegression,
  runConfirmationPass,
  type ConfirmationCandidate,
  type ConfirmationPassResult,
} from "./confirmation-pass.js";
import { completeUnitNames, linkCompleteUnitsInConfigure } from "./link-complete-units.js";

/** Paths never staged by an epoch commit: the nested orchestrator repo and generated state. */
const EPOCH_COMMIT_EXCLUDES = ["decomp-orchestrator", ".decomp-orchestrator-state", ...ORCHESTRATOR_SCRATCH_EXCLUDES];

export interface EpochCycleOptions {
  baseRef?: string;
  /** Shell command run in the epoch worktree before the report build; "" skips it. */
  configureCommand?: string;
  /** Explicit opt-in for the boundary confirmation pass; default off. */
  confirmationPass?: boolean;
  /** Durable scheduler epoch identity for cycle timeline evidence. */
  epochId?: string;
  label?: string | null;
  /** Current dispatch fencing token for every checkout mutation. */
  leaseId: string;
  /** Untracked build inputs symlinked from the live repo into the worktree (e.g. orig assets). */
  linkPaths?: string[];
  gameId?: string | null;
  /** Format the cycle worktree before its snapshot commit. Default on. */
  preCommitAutofixEnabled?: boolean;
  /** Promote units complete in the last published report before snapshotting. Default on. */
  linkCompleteUnitsEnabled?: boolean;
  runPreCommitAutofix?: (input: { worktreeDir: string; cacheDir: string }) => Promise<PreCommitAutofixResult>;
  /** One mechanical build-fixer attempt after the initial report build fails. Default on. */
  boundaryBuildFixerEnabled?: boolean;
  runBoundaryBuildFixer?: (input: BoundaryBuildFixerInput) => Promise<BoundaryBuildFixerResult>;
  deferBoundaryFindings?: (input: BoundaryDeferredFinding[]) => Promise<void> | void;
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
  toolPlatform?: ToolPlatform;
  worktreeDir: string;
  /**
   * When provided, the review_lint QA scan runs against the epoch worktree
   * after the report build (observability only — the L2 ship gate in
   * regression-check is the hard stop). Omitted = no scan.
   */
  qaScan?: { orchestratorRoot: string; addressNamedStaticDataAllowlist?: import("@server/core/game-registry").AddressNamedStaticDataAllowlistEntry[] };
}

export interface BoundaryBuildFixerInput {
  worktreeDir: string;
  failure: string;
  timeoutMs: number;
}

export interface BoundaryBuildFixerResult {
  exitCode: number | null;
  timedOut: boolean;
  output: string;
}

export interface BoundaryDeferredFinding {
  reason: "boundary_regression_deferred" | "boundary_qa_deferred";
  unit?: string;
  symbol?: string;
  sourcePath?: string;
  detail: string;
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
  confirmation?: ConfirmationPassResult;
  durationMs: number;
  label: string | null;
  lockedPathsExcluded: string[];
  matchedCodePercent: number | null;
  matchedDataPercent: number | null;
  measures: Record<string, unknown>;
  sectionMeasures: Record<string, SectionMeasure>;
  /** QA scan verdict for this epoch's diff, or null when the scan was not requested. */
  qaGate: EpochQaGateSummary | null;
  regressions: EpochRegressionSummary;
  repair: EpochRepairResult;
  reportCopiedToRepo: boolean;
  savePoint: BoundarySavePointResult;
  savePointEvidence: DeferredSavePointEvidence;
  savePointId: string | null;
  scoreDelta: number;
  worktreeDir: string;
}

interface GitResult {
  ok: boolean;
  text: string;
}

async function git(cwd: string, args: string[]): Promise<GitResult> {
  const proc = Bun.spawn(["git", "-C", cwd, ...args], { stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, exitCode] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
  return { ok: exitCode === 0, text: exitCode === 0 ? stdout.trimEnd() : [stderr.trim(), stdout.trim()].filter(Boolean).join("\n") };
}

function artifactTimestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function pathspecExcludes(paths: string[]): string[] {
  return paths.map((path) => `:(exclude)${path}`);
}

/**
 * Commit residual changes except in-flight worker files. Accepted worker
 * output is committed per-accept by the integration queue, so this snapshot
 * usually finds nothing and no-ops with the current head. Active-lease files
 * stay uncommitted on purpose: the epoch measures validated work only, and a
 * half-finished attempt must not poison the checkpoint build. Work excluded
 * here simply lands in a later commit.
 */
export async function commitEpochSnapshot(params: {
  store: StateStore;
  runId: string;
  epochId: string;
  repoRoot: string;
  excludePaths: string[];
  stateDirRelative: string | null;
  message: string;
  revalidateLease: () => void;
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
  params.revalidateLease();
  const scratchCleanup = await git(params.repoRoot, [
    "rm",
    "-r",
    "-q",
    "--cached",
    "--ignore-unmatch",
    "--",
    ...ORCHESTRATOR_SCRATCH_EXCLUDES,
  ]);
  if (!scratchCleanup.ok) {
    console.error(`[epoch] failed to remove orchestrator scratch from the index: ${scratchCleanup.text}`);
  }
  const add = await git(params.repoRoot, ["add", "-A", "--", ".", ...pathspecExcludes(excludes)]);
  if (!add.ok) {
    throw new Error(`epoch integration git add failed: ${add.text}`);
  }
  // Per-accept integration commits make the boundary snapshot residual. When
  // nothing is staged the boundary skips the no-op commit and continues with
  // the current head (report build, save point, and epoch worktree still run).
  const staged = await git(params.repoRoot, ["diff", "--cached", "--quiet"]);
  if (staged.ok) {
    const head = await git(params.repoRoot, ["rev-parse", "HEAD"]);
    if (!head.ok || !head.text.trim()) {
      throw new Error(`epoch integration head resolution failed: ${head.text}`);
    }
    return { commitSha: head.text, committed: false, warning: null };
  }
  const branch = await git(params.repoRoot, ["symbolic-ref", "--short", "HEAD"]);
  if (!branch.ok || !branch.text.trim()) {
    throw new Error(`epoch integration branch resolution failed: ${branch.text || "detached HEAD"}`);
  }
  const parent = await git(params.repoRoot, ["rev-parse", "HEAD"]);
  if (!parent.ok || !parent.text.trim()) {
    throw new Error(`epoch integration parent resolution failed: ${parent.text}`);
  }
  const pending = preparePendingIntegration(params.store, {
    runId: params.runId,
    epochId: params.epochId,
    branch: branch.text,
    parentSha: parent.text,
  });
  // Snapshot commits are internal checkpoints, and target-repo pre-commit
  // hooks must not abort them. --allow-empty guards a stage/commit race; the
  // truly-empty case already returned above with the current head.
  let commit: GitResult;
  try {
    params.revalidateLease();
    commit = await git(params.repoRoot, [
      "commit",
      "--allow-empty",
      "--no-verify",
      "-m",
      epochIntegrationCommitMessage(params.message, params.epochId),
    ]);
  } catch (error) {
    recordPendingIntegrationFailure(params.store, {
      runId: params.runId,
      epochId: params.epochId,
      attempt: pending.attempt,
      reason: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
  if (!commit.ok) {
    const error = new Error(`epoch integration git commit failed: ${commit.text}`);
    recordPendingIntegrationFailure(params.store, {
      runId: params.runId,
      epochId: params.epochId,
      attempt: pending.attempt,
      reason: error.message,
    });
    throw error;
  }
  const head = await git(params.repoRoot, ["rev-parse", "HEAD"]);
  return { commitSha: head.ok ? head.text : null, committed: true, warning: null };
}

/**
 * The epoch worktree is a persistent sibling checkout used for checkpoint
 * builds. It trails the live tree by one epoch, so its ninja state makes each
 * report build incremental; only the first build pays full cost.
 */
async function ensureEpochWorktree(params: { repoRoot: string; worktreeDir: string; commitSha: string; linkPaths: string[]; revalidateLease: () => void }): Promise<void> {
  const hasGitFile = existsSync(resolve(params.worktreeDir, ".git"));
  const usable = hasGitFile ? await git(params.worktreeDir, ["rev-parse", "--is-inside-work-tree"]) : null;
  if (hasGitFile && !usable?.ok) {
    params.revalidateLease();
    await git(params.repoRoot, ["worktree", "prune"]);
    params.revalidateLease();
    await rm(params.worktreeDir, { recursive: true, force: true });
  }

  if (!existsSync(resolve(params.worktreeDir, ".git"))) {
    params.revalidateLease();
    await mkdir(resolve(params.worktreeDir, ".."), { recursive: true });
    // A manually deleted worktree directory can stay registered; prune before
    // re-adding so the cycle recovers instead of failing forever. A stale .git
    // file can also point at an old checkout; in that case the generated epoch
    // worktree is discarded above and rebuilt from the current repo.
    params.revalidateLease();
    await git(params.repoRoot, ["worktree", "prune"]);
    params.revalidateLease();
    const added = await git(params.repoRoot, ["worktree", "add", "--detach", params.worktreeDir, params.commitSha]);
    if (!added.ok) throw new Error(`epoch worktree add failed: ${added.text}`);
  } else {
    params.revalidateLease();
    const checkout = await git(params.worktreeDir, ["checkout", "--force", "--detach", params.commitSha]);
    if (!checkout.ok) throw new Error(`epoch worktree checkout failed: ${checkout.text}`);
  }
  for (const linkPath of params.linkPaths) {
    const source = resolve(params.repoRoot, linkPath);
    const destination = resolve(params.worktreeDir, linkPath);
    if (!existsSync(source)) continue;
    params.revalidateLease();
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

async function seedEpochWibo(worktreeDir: string, stateDir: string, toolPlatform: ToolPlatform): Promise<boolean> {
  const source = resolveStateToolArtifact({ stateDir, name: "wibo", platform: toolPlatform });
  if (!source) {
    if (!isHostToolPlatform(toolPlatform)) {
      throw requiredStateToolArtifactError({ stateDir, name: "wibo", platform: toolPlatform });
    }
    return false;
  }
  const destination = resolve(worktreeDir, "build", "tools", "wibo");
  if (!isHostToolPlatform(toolPlatform)) await rm(destination, { recursive: true, force: true });
  await mkdir(dirname(destination), { recursive: true });
  await copyFile(source, destination);
  await chmod(destination, 0o755).catch(() => {});
  installMwccCacheShim(worktreeDir);
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

function regressionSourcePaths(report: RegressionReport, reportPath: string): string[] {
  const sources = sourcePathByUnit(reportPath);
  return [
    ...report.brokenMatches,
    ...report.fuzzyRegressions,
  ]
    .map((entry) => sources.get(entry.unitName))
    .filter((path): path is string => Boolean(path));
}

async function restoreProbePatches(worktreeDir: string, removed: ConfirmationCandidate[], revalidateLease: () => void): Promise<void> {
  for (const candidate of [...removed].reverse()) {
    if (!candidate.patchPath) continue;
    revalidateLease();
    const restored = await git(worktreeDir, ["apply", candidate.patchPath]);
    if (!restored.ok) throw new Error(`confirmation probe could not restore ${candidate.integrationId}: ${restored.text}`);
  }
}

async function probeWithoutCandidates(params: {
  candidates: ConfirmationCandidate[];
  reportPath: string;
  reportChangesPath: string;
  runId: string;
  toolPlatform: ToolPlatform;
  worktreeDir: string;
  revalidateLease: () => void;
}): Promise<boolean> {
  const ordered = [...params.candidates].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  const removed: ConfirmationCandidate[] = [];
  try {
    for (const candidate of ordered) {
      if (!candidate.patchPath || !existsSync(candidate.patchPath)) return false;
      const check = await git(params.worktreeDir, ["apply", "--reverse", "--check", candidate.patchPath]);
      if (!check.ok) return false;
      params.revalidateLease();
      const reverse = await git(params.worktreeDir, ["apply", "--reverse", candidate.patchPath]);
      if (!reverse.ok) return false;
      removed.push(candidate);
    }
    // Report reuse is keyed by HEAD. Removing the generated report forces the
    // probe to observe these uncommitted reverse-applies as well.
    await rm(params.reportPath, { force: true });
    await forceReportRun(params.worktreeDir, { resetBaseline: false, toolPlatform: params.toolPlatform });
    const report = await readRegressionReport(params.reportChangesPath, `Confirmation probe for run ${params.runId}`, 50);
    return isCleanGlobalRegression(report);
  } finally {
    await restoreProbePatches(params.worktreeDir, removed, params.revalidateLease);
  }
}

async function revertConfirmationCandidate(repoRoot: string, candidate: ConfirmationCandidate, revalidateLease: () => void): Promise<{ ok: boolean; revision?: string | null; error?: string }> {
  if (!candidate.patchPath || !existsSync(candidate.patchPath)) {
    return { ok: false, error: `patch is missing: ${candidate.patchPath ?? "(none)"}` };
  }
  const paths = [...new Set(candidate.writeSet.filter(Boolean))];
  if (paths.length === 0) return { ok: false, error: "candidate write set is empty" };
  const check = await git(repoRoot, ["apply", "--reverse", "--check", candidate.patchPath]);
  if (!check.ok) return { ok: false, error: `reverse apply check failed: ${check.text}` };
  revalidateLease();
  const reverse = await git(repoRoot, ["apply", "--reverse", candidate.patchPath]);
  if (!reverse.ok) return { ok: false, error: `reverse apply failed: ${reverse.text}` };
  revalidateLease();
  const stage = await git(repoRoot, ["add", "--", ...paths]);
  if (!stage.ok) {
    revalidateLease();
    await git(repoRoot, ["apply", candidate.patchPath]);
    revalidateLease();
    await git(repoRoot, ["add", "--", ...paths]);
    return { ok: false, error: `revert staging failed: ${stage.text}` };
  }
  revalidateLease();
  const commit = await git(repoRoot, [
    "commit",
    "--no-verify",
    "-m",
    `confirmation: revert regressed integration ${candidate.integrationId.slice(0, 8)}`,
    "--",
    ...paths,
  ]);
  if (!commit.ok) {
    revalidateLease();
    await git(repoRoot, ["apply", candidate.patchPath]);
    revalidateLease();
    await git(repoRoot, ["add", "--", ...paths]);
    return { ok: false, error: `revert commit failed: ${commit.text}` };
  }
  const head = await git(repoRoot, ["rev-parse", "HEAD"]);
  return { ok: true, revision: head.ok ? head.text : null };
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

export function boundaryDeferredFindings(
  plan: RegressionRepairPlan,
  qaGate: EpochQaGateSummary | null,
): BoundaryDeferredFinding[] {
  const findings: BoundaryDeferredFinding[] = plan.repairCandidates.map((candidate) => ({
    reason: "boundary_regression_deferred",
    unit: candidate.unit,
    symbol: candidate.symbol,
    sourcePath: candidate.sourcePath,
    detail: candidate.reason,
  }));
  for (const finding of qaGate?.findings ?? []) {
    findings.push({
      reason: "boundary_qa_deferred",
      sourcePath: finding.file,
      detail: JSON.stringify(finding),
    });
  }
  return findings;
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

  const paused = params.pauseThreshold > 0 && regressed.length > params.pauseThreshold;
  if (paused) {
    reasons.push(`${regressed.length} regressed rows exceed pause threshold ${params.pauseThreshold}; refusing to admit repairs or continue`);
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
  return { paused, reasons, repairCandidates, summary };
}

function compactSteps(result: ReportRunResult): { name: string; command: string[]; exitCode: number }[] {
  return result.steps.map((step) => ({ name: step.name, command: step.command, exitCode: step.exitCode }));
}

const BOUNDARY_BUILD_FIXER_TIMEOUT_MS = 5 * 60_000;

export async function runCodexBoundaryBuildFixer(input: BoundaryBuildFixerInput): Promise<BoundaryBuildFixerResult> {
  const prompt = [
    "Fix only the mechanical build break described below in this epoch worktree.",
    "Limit edits to the named failing translation units and symbols. Typical allowed fixes are naming conflicts, signature drift, and residual shims.",
    "Do not perform new decompilation work, improve matching, refactor unrelated code, or broaden the diff. Make the smallest change that can make the existing report build green.",
    "Build failure:",
    input.failure.slice(0, 12_000),
  ].join("\n\n");
  const proc = Bun.spawn([
    "codex", "exec", "-m", "gpt-5.6-sol", "-c", 'model_reasoning_effort="low"',
    "--enable", "fast_mode", "-s", "workspace-write", prompt,
  ], { cwd: input.worktreeDir, stdout: "pipe", stderr: "pipe" });
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<"timeout">((resolveTimeout) => {
    timer = setTimeout(() => resolveTimeout("timeout"), input.timeoutMs);
  });
  const timedOut = await Promise.race([proc.exited.then(() => false), timeout]) === "timeout";
  if (timedOut) proc.kill();
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited,
  ]);
  if (timer) clearTimeout(timer);
  return {
    exitCode: timedOut ? null : exitCode,
    timedOut,
    output: [stdout.trim(), stderr.trim()].filter(Boolean).join("\n").slice(-12_000),
  };
}

export async function runReportBuildWithFixer<T>(input: {
  enabled: boolean;
  runReport: () => Promise<T>;
  runFixer: (failure: unknown) => Promise<BoundaryBuildFixerResult>;
  onFixerEvent?: (status: "started" | "finished", result?: BoundaryBuildFixerResult) => void;
  onFixerRetrySucceeded?: (result: BoundaryBuildFixerResult) => Promise<void>;
  onFixerRetryFailed?: (result: BoundaryBuildFixerResult) => Promise<void>;
}): Promise<T> {
  try {
    return await input.runReport();
  } catch (error) {
    if (!input.enabled) throw error;
    input.onFixerEvent?.("started");
    const result = await input.runFixer(error);
    input.onFixerEvent?.("finished", result);
    try {
      const retry = await input.runReport();
      if (!result.timedOut && result.exitCode === 0) await input.onFixerRetrySucceeded?.(result);
      return retry;
    } catch (retryError) {
      await input.onFixerRetryFailed?.(result);
      throw retryError;
    }
  }
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
    status: "started" | "finished" | "skipped" | "warning" | "propagated" | "failed";
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

export async function propagateBoundaryBuildFixer(input: {
  store: StateStore;
  runId: string;
  repoRoot: string;
  worktreeDir: string;
  artifactDir: string;
  label: string | null;
  revalidateLease: () => void;
}): Promise<{ commitSha: string; files: string[]; patchPath: string }> {
  const diffPathspec = [".", ":(exclude)build", ":(exclude,glob)**/build/**"];
  const [diff, changedFiles] = await Promise.all([
    git(input.worktreeDir, ["diff", "--binary", "HEAD", "--", ...diffPathspec]),
    git(input.worktreeDir, ["diff", "--name-only", "-z", "HEAD", "--", ...diffPathspec]),
  ]);
  if (!diff.ok) throw new Error(`boundary build-fixer diff capture failed: ${diff.text}`);
  if (!changedFiles.ok) throw new Error(`boundary build-fixer file capture failed: ${changedFiles.text}`);
  const files = changedFiles.text.split("\0").filter(Boolean).sort();
  await mkdir(input.artifactDir, { recursive: true });
  const patchPath = resolve(input.artifactDir, "boundary-build-fixer.patch");
  await writeFile(patchPath, diff.text ? `${diff.text}\n` : "");

  const fail = (message: string): never => {
    epochProgress(input.store, input.runId, {
      label: input.label,
      phase: "report_build_fixer",
      status: "failed",
      message,
      files,
      artifact_path: patchPath,
    });
    throw new Error(`${message}; fixer diff retained at ${patchPath}`);
  };
  if (files.length === 0 || !diff.text.trim()) fail("boundary build-fixer produced no tracked diff to propagate");

  const existingChanges = await git(input.repoRoot, ["diff", "--quiet", "HEAD", "--", ...files]);
  if (!existingChanges.ok) fail("boundary build-fixer files already have cycle-worktree changes");
  input.revalidateLease();
  const check = await git(input.repoRoot, ["apply", "--3way", "--check", patchPath]);
  if (!check.ok) fail(`boundary build-fixer patch does not apply cleanly: ${check.text}`);
  input.revalidateLease();
  const apply = await git(input.repoRoot, ["apply", "--3way", patchPath]);
  const restoreCycleFiles = async (): Promise<void> => {
    await git(input.repoRoot, ["reset", "--", ...files]);
    await git(input.repoRoot, ["checkout", "--", ...files]);
  };
  if (!apply.ok) {
    await restoreCycleFiles();
    fail(`boundary build-fixer patch does not apply cleanly: ${apply.text}`);
  }
  input.revalidateLease();
  const stage = await git(input.repoRoot, ["add", "--", ...files]);
  if (!stage.ok) {
    await restoreCycleFiles();
    fail(`boundary build-fixer staging failed: ${stage.text}`);
  }
  input.revalidateLease();
  const commit = await git(input.repoRoot, [
    "commit", "--no-verify", "-m", `boundary build-fixer: ${files.join(", ")}`, "--", ...files,
  ]);
  if (!commit.ok) {
    await restoreCycleFiles();
    fail(`boundary build-fixer commit failed: ${commit.text}`);
  }
  const head = await git(input.repoRoot, ["rev-parse", "HEAD"]);
  if (!head.ok || !head.text.trim()) fail(`boundary build-fixer head resolution failed: ${head.text}`);
  input.revalidateLease();
  const resync = await git(input.worktreeDir, ["checkout", "--force", "--detach", head.text]);
  if (!resync.ok) fail(`boundary build-fixer epoch worktree resync failed: ${resync.text}`);
  epochProgress(input.store, input.runId, {
    label: input.label,
    phase: "report_build_fixer",
    status: "propagated",
    message: `propagated ${files.length} build-fixer file(s) at ${head.text.slice(0, 10)}`,
    files,
    commit_sha: head.text,
    artifact_path: patchPath,
  });
  return { commitSha: head.text, files, patchPath };
}

export async function discardBoundaryBuildFixer(worktreeDir: string, revalidateLease: () => void): Promise<void> {
  revalidateLease();
  const reset = await git(worktreeDir, ["reset", "--hard", "HEAD"]);
  if (!reset.ok) throw new Error(`boundary build-fixer cleanup failed after report retry: ${reset.text}`);
}

export async function runPreCommitAutofixStep(input: {
  store: StateStore;
  runId: string;
  repoRoot: string;
  stateDir: string;
  label: string | null;
  enabled: boolean;
  runPreCommitAutofix?: EpochCycleOptions["runPreCommitAutofix"];
}): Promise<PreCommitAutofixResult | null> {
  if (!input.enabled) {
    epochProgress(input.store, input.runId, { label: input.label, phase: "precommit_autofix", status: "skipped", message: "pre-commit autofix disabled", reformatted_file_count: 0 });
    return null;
  }
  epochProgress(input.store, input.runId, { label: input.label, phase: "precommit_autofix", status: "started", message: "running pre-commit autofix in cycle worktree" });
  const autofix = await (input.runPreCommitAutofix ?? runPreCommitAutofixDefault)({ worktreeDir: input.repoRoot, cacheDir: resolve(input.stateDir, "pre-commit-cache") });
  if (autofix.status === "skipped") {
    console.error(`[epoch] pre-commit autofix skipped: ${autofix.warnings.join("; ")}`);
    epochProgress(input.store, input.runId, { label: input.label, phase: "precommit_autofix", status: "skipped", message: autofix.warnings[0] ?? "pre-commit unavailable", reformatted_file_count: 0 });
    return autofix;
  }
  for (const warning of autofix.warnings) console.error(`[epoch] pre-commit autofix warning: ${warning}`);
  epochProgress(input.store, input.runId, {
    label: input.label, phase: "precommit_autofix", status: "finished",
    message: `pre-commit autofix reformatted ${autofix.reformattedFiles.length} file(s)`,
    reformatted_file_count: autofix.reformattedFiles.length, reformatted_files: autofix.reformattedFiles.slice(0, 100),
    warning_count: autofix.warnings.length, warnings: autofix.warnings.slice(0, 20),
  });
  return autofix;
}

async function submitEpochWorkflowEvent(input: {
  store: StateStore;
  gameId?: string | null;
  runId: string;
  epochId?: string;
  gameEventId: string;
  status: "started" | "completed" | "failed";
  detail?: string;
}): Promise<void> {
  try {
    const gameId = input.gameId?.trim();
    const epochId = input.epochId?.trim();
    if (!gameId || !epochId) return;
    const sessionId = activeCycleSessionId(input.store.db, gameId);
    if (!sessionId) return;
    const runtime = await getDefaultMeleeKernelRuntime();
    if (!runtime) return;
    await submitMeleeWorkflowTraceEvent({
      runtime,
      kind: "epoch",
      gameId,
      sessionId,
      correlationId: input.runId,
      gameEventId: input.gameEventId,
      causedByEventId: null,
      operation: `epoch.${input.status}`,
      status: input.status,
      detail: input.detail,
      metadata: { runId: input.runId, epochId },
    });
  } catch (error) {
    console.warn(
      `Epoch trace emission failed for ${input.epochId ?? "unknown"} (${input.status}): ${error instanceof Error ? error.message : String(error)}`,
    );
  }
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
  const startedEventId = addEvent(store, runId, "epoch_started", "epoch-cycle", { label: options.label ?? null, created_by: "epoch-cycle" });
  await submitEpochWorkflowEvent({
    store,
    gameId: options.gameId,
    runId,
    epochId: options.epochId,
    gameEventId: startedEventId,
    status: "started",
  });
  try {
    const result = await runEpochCycleInner(store, runId, repoRoot, stateDir, options);
    const finishedEventId = addEvent(store, runId, "epoch_finished", "epoch-cycle", {
      label: options.label ?? null,
      status: result.repair.paused ? "paused" : "success",
      matched_code_percent: result.matchedCodePercent,
      created_by: "epoch-cycle",
    });
    await submitEpochWorkflowEvent({
      store,
      gameId: options.gameId,
      runId,
      epochId: options.epochId,
      gameEventId: finishedEventId,
      status: "completed",
      detail: result.repair.paused ? "epoch paused for regression repair" : undefined,
    });
    return result;
  } catch (error) {
    const finishedEventId = addEvent(store, runId, "epoch_finished", "epoch-cycle", {
      label: options.label ?? null,
      status: "error",
      error: (error instanceof Error ? error.message : String(error)).slice(0, 2000),
      created_by: "epoch-cycle",
    });
    await submitEpochWorkflowEvent({
      store,
      gameId: options.gameId,
      runId,
      epochId: options.epochId,
      gameEventId: finishedEventId,
      status: "failed",
      detail: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

async function runEpochCycleInner(store: StateStore, runId: string, repoRoot: string, stateDir: string, options: EpochCycleOptions): Promise<EpochCycleResult> {
  const startedAt = Date.now();
  const revalidateLease = (): void => {
    requireLease(store, options.leaseId, options.gameId ?? undefined);
  };
  revalidateLease();
  const label = options.label ?? null;
  const reportRelPath = options.reportRelPath ?? "build/GALE01/report.json";
  const reportChangesRelPath = options.reportChangesRelPath ?? "build/GALE01/report_changes.json";
  const baselineRelPath = options.baselineRelPath ?? "build/GALE01/baseline.json";
  const toolPlatform = resolveToolPlatform({ targetPlatform: options.toolPlatform });
  const confirmationEnabled = options.confirmationPass ?? false;
  epochProgress(store, runId, {
    label,
    phase: "integration_drain",
    status: "started",
    message: "checking worker integration queue before checkpoint build",
  });
  const integrationDrain = await processWorkerOutputIntegrationQueue({
    dryRun: false,
    leaseId: options.leaseId,
    limit: 64,
    repoRoot,
    runId,
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
  const epochId = options.epochId?.trim();
  if (!epochId) throw new Error("epochId is required for a recoverable epoch integration commit");

  const previousCompleteUnits = new Set<string>();
  const publishedReportPath = resolve(repoRoot, reportRelPath);
  const configurePath = resolve(repoRoot, "configure.py");
  if (options.linkCompleteUnitsEnabled === false) {
    epochProgress(store, runId, {
      label, phase: "link_complete_units", status: "skipped",
      message: "complete-unit linking disabled", flipped_units: [],
    });
  } else if (!existsSync(publishedReportPath) || !existsSync(configurePath)) {
    epochProgress(store, runId, {
      label, phase: "link_complete_units", status: "skipped",
      message: !existsSync(publishedReportPath) ? "no published report available" : "configure.py not found",
      flipped_units: [],
    });
  } else {
    const priorReport = JSON.parse(readFileSync(publishedReportPath, "utf8")) as unknown;
    const configure = readFileSync(configurePath, "utf8");
    const linked = linkCompleteUnitsInConfigure(configure, completeUnitNames(priorReport));
    for (const unit of linked.completeUnits) previousCompleteUnits.add(unit);
    epochProgress(store, runId, {
      label, phase: "link_complete_units", status: "started",
      message: "linking units complete in the previous published report",
      complete_units: linked.completeUnits, flipped_units: linked.flippedUnits,
    });
    if (linked.configure !== configure) await writeFile(configurePath, linked.configure);
    epochProgress(store, runId, {
      label, phase: "link_complete_units", status: "finished",
      message: `linked ${linked.flippedUnits.length} complete unit(s) before snapshot`,
      complete_units: linked.completeUnits, flipped_units: linked.flippedUnits, missing_units: linked.missingUnits,
    });
  }

  await runPreCommitAutofixStep({
    store, runId, repoRoot, stateDir, label,
    enabled: options.preCommitAutofixEnabled !== false,
    runPreCommitAutofix: options.runPreCommitAutofix,
  });

  epochProgress(store, runId, {
    label,
    phase: "snapshot_commit",
    status: "started",
    message: `committing epoch snapshot with ${lockedPaths.length} locked path(s) excluded`,
    locked_path_count: lockedPaths.length,
  });
  let snapshot = await commitEpochSnapshot({
    store,
    runId,
    epochId,
    repoRoot,
    excludePaths: lockedPaths,
    stateDirRelative,
    message: `epoch(${runId.slice(0, 8)}): ${label ?? artifactTimestamp()}`,
    revalidateLease,
  });
  if (snapshot.warning) {
    console.error(`[epoch] ${snapshot.warning}`);
    epochProgress(store, runId, {
      label,
      phase: "snapshot_commit",
      status: "warning",
      message: `epoch snapshot commit failed: ${snapshot.warning.slice(0, 500)}`,
    });
  }
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
    revalidateLease,
  });
  revalidateLease();
  epochProgress(store, runId, {
    label,
    phase: "worktree_prepare",
    status: "finished",
    message: "epoch worktree prepared",
    worktree_dir: options.worktreeDir,
  });
  const hasLocalWibo = await seedEpochWibo(options.worktreeDir, stateDir, toolPlatform);
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
  revalidateLease();
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
  const artifactDir = resolve(stateDir, "epochs", artifactTimestamp());
  epochProgress(store, runId, {
    label,
    phase: "report_build",
    status: "started",
    message: `building objdiff report in epoch worktree${existsSync(worktreeBaselinePath) ? "" : " with baseline reset"}`,
    reset_baseline: !existsSync(worktreeBaselinePath),
    worktree_dir: options.worktreeDir,
  });
  revalidateLease();
  const runReport = () => forceReportRun(options.worktreeDir, {
    resetBaseline: !existsSync(worktreeBaselinePath),
    toolPlatform,
  });
  let buildResult = await runReportBuildWithFixer({
    enabled: options.boundaryBuildFixerEnabled ?? true,
    runReport,
    runFixer: (failure) => (options.runBoundaryBuildFixer ?? runCodexBoundaryBuildFixer)({
      worktreeDir: options.worktreeDir,
      failure: failure instanceof Error ? failure.message : String(failure),
      timeoutMs: BOUNDARY_BUILD_FIXER_TIMEOUT_MS,
    }),
    onFixerEvent: (status, fixer) => epochProgress(store, runId, {
      label,
      phase: "report_build_fixer",
      status,
      message: status === "started"
        ? "starting one bounded codex attempt for a mechanical report build break"
        : fixer?.timedOut
          ? "bounded codex build-fixer timed out; retrying report build once"
          : `bounded codex build-fixer exited ${fixer?.exitCode ?? "unknown"}; retrying report build once`,
      outcome: fixer ? (fixer.timedOut ? "timeout" : fixer.exitCode === 0 ? "completed" : "failed") : undefined,
      exit_code: fixer?.exitCode,
      timed_out: fixer?.timedOut,
      output: fixer?.output,
      worktree_dir: options.worktreeDir,
    }),
    onFixerRetrySucceeded: async () => {
      const propagated = await propagateBoundaryBuildFixer({
        store, runId, repoRoot, worktreeDir: options.worktreeDir, artifactDir, label, revalidateLease,
      });
      snapshot = { ...snapshot, commitSha: propagated.commitSha, committed: true };
    },
    onFixerRetryFailed: async () => discardBoundaryBuildFixer(options.worktreeDir, revalidateLease),
  });
  epochProgress(store, runId, {
    label,
    phase: "report_build",
    status: "finished",
    message: buildResult.reusedReport
      ? `report reused; report changes finished with ${buildResult.steps.length} step(s)`
      : `report build finished with ${buildResult.steps.length} step(s)`,
    step_count: buildResult.steps.length,
    failed_step_count: buildResult.steps.filter((step) => step.exitCode !== 0).length,
    report_reused: buildResult.reusedReport === true,
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
  let regressionReport = await readRegressionReport(worktreeChangesPath, `Epoch checkpoint for run ${runId}`, 50);
  let measures = reportMeasures(worktreeReportPath);
  let matchedCodeValue = Number(measures.matched_code_percent);
  let matchedCodePercent = Number.isFinite(matchedCodeValue) ? matchedCodeValue : null;
  epochProgress(store, runId, {
    label,
    phase: "report_read",
    status: "finished",
    message: `report read finished at matched_code ${matchedCodePercent ?? "?"}%`,
    matched_code_percent: matchedCodePercent,
    regressed_functions: regressionReport.brokenMatches.length + regressionReport.fuzzyRegressions.length,
  });
  if (options.linkCompleteUnitsEnabled !== false) {
    const freshReport = JSON.parse(await Bun.file(worktreeReportPath).text()) as unknown;
    const newlyCompleteUnits = completeUnitNames(freshReport).filter((unit) => !previousCompleteUnits.has(unit));
    if (newlyCompleteUnits.length > 0) {
      console.warn(`[epoch] ${newlyCompleteUnits.length} unit(s) became complete after snapshot and will link at the next boundary: ${newlyCompleteUnits.join(", ")}`);
      epochProgress(store, runId, {
        label, phase: "link_complete_units", status: "warning",
        message: `${newlyCompleteUnits.length} newly complete unit(s) will link at the next boundary`,
        flipped_units: [], newly_complete_units: newlyCompleteUnits,
      });
    }
  }

  let confirmation: ConfirmationPassResult | undefined;
  if (confirmationEnabled && !buildResult.resetBaseline) {
    epochProgress(store, runId, {
      label,
      phase: "confirmation_pass",
      status: "started",
      message: "confirming tentative worker integrations against the epoch global comparison",
      report_changes_path: worktreeChangesPath,
    });
    const runPass = () =>
      runConfirmationPass({
        enabled: true,
        store,
        runId,
        global: {
          clean: isCleanGlobalRegression(regressionReport),
          buildId: snapshot.commitSha ?? `epoch:${label ?? runId}`,
          reportPath: worktreeChangesPath,
          regressionPaths: regressionSourcePaths(regressionReport, worktreeReportPath),
        },
        deps: {
          probeWithout: (candidates) =>
            probeWithoutCandidates({
              candidates,
              reportPath: worktreeReportPath,
              reportChangesPath: worktreeChangesPath,
              runId,
              toolPlatform,
              worktreeDir: options.worktreeDir,
              revalidateLease,
            }),
          revertLive: (candidate) => revertConfirmationCandidate(repoRoot, candidate, revalidateLease),
        },
      });

    confirmation = await runPass();
    if (confirmation.requiresBoundaryRecheck) {
      const blamed = confirmation;
      const revertedHead = await git(repoRoot, ["rev-parse", "HEAD"]);
      if (!revertedHead.ok || !revertedHead.text) throw new Error(`confirmation recheck could not resolve live HEAD: ${revertedHead.text}`);
      snapshot = { ...snapshot, commitSha: revertedHead.text, committed: true };
      await ensureEpochWorktree({
        repoRoot,
        worktreeDir: options.worktreeDir,
        commitSha: revertedHead.text,
        linkPaths: options.linkPaths ?? ["orig"],
        revalidateLease,
      });
      revalidateLease();
      await rm(worktreeReportPath, { force: true });
      revalidateLease();
      const recheckBuild = await forceReportRun(options.worktreeDir, { resetBaseline: false, toolPlatform });
      buildResult = { ...recheckBuild, steps: [...buildResult.steps, ...recheckBuild.steps] };
      regressionReport = await readRegressionReport(worktreeChangesPath, `Epoch confirmation recheck for run ${runId}`, 50);
      measures = reportMeasures(worktreeReportPath);
      matchedCodeValue = Number(measures.matched_code_percent);
      matchedCodePercent = Number.isFinite(matchedCodeValue) ? matchedCodeValue : null;
      const rechecked = await runPass();
      confirmation = {
        ...rechecked,
        status: rechecked.status === "confirmed" || rechecked.status === "no_tentatives" ? "regressed" : rechecked.status,
        confirmedIds: [...new Set([...blamed.confirmedIds, ...rechecked.confirmedIds])],
        regressedId: blamed.regressedId,
        probes: blamed.probes,
        requiresBoundaryRecheck: false,
        reasons: [...blamed.reasons, ...rechecked.reasons],
      };
    } else if (confirmation.probes.length > 0) {
      // Probes restore source files, but their generated report reflects the
      // last removal. Rebuild the original snapshot before publishing it.
      revalidateLease();
      await rm(worktreeReportPath, { force: true });
      revalidateLease();
      const restoredBuild = await forceReportRun(options.worktreeDir, { resetBaseline: false, toolPlatform });
      buildResult = { ...restoredBuild, steps: [...buildResult.steps, ...restoredBuild.steps] };
      regressionReport = await readRegressionReport(worktreeChangesPath, `Epoch checkpoint restored after confirmation probes for run ${runId}`, 50);
      measures = reportMeasures(worktreeReportPath);
      matchedCodeValue = Number(measures.matched_code_percent);
      matchedCodePercent = Number.isFinite(matchedCodeValue) ? matchedCodeValue : null;
    }
    epochProgress(store, runId, {
      label,
      phase: "confirmation_pass",
      status: confirmation.status === "unattributed" ? "warning" : "finished",
      message: `confirmation pass ${confirmation.status}`,
      confirmation,
    });
  } else if (confirmationEnabled) {
    epochProgress(store, runId, {
      label,
      phase: "confirmation_pass",
      status: "skipped",
      message: "confirmation pass waits for a pre-existing rolling baseline",
    });
  }

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
        addressNamedStaticDataAllowlist: options.qaScan.addressNamedStaticDataAllowlist,
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
    revalidateLease();
    await copyFile(worktreeReportPath, repoReportPath);
    revalidateLease();
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
  revalidateLease();
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
  const deferredFindings = boundaryDeferredFindings(plan, qaGate);
  if (deferredFindings.length > 0) await options.deferBoundaryFindings?.(deferredFindings);
  const requeued = 0;
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
      : `boundary findings deferred: ${plan.repairCandidates.length} regression target(s), no boundary repair admission`,
    paused: plan.paused,
    planned: plan.repairCandidates.length,
    requeued,
    regressions: plan.summary,
  });

  let savePoint: SavePointRecord | null = null;
  let savePointResult: BoundarySavePointResult = { ok: false, savePointId: null, blockerRaised: false };
  let savePointEvidence: DeferredSavePointEvidence;
  const integrationCommit = snapshot.commitSha;
  if (!integrationCommit) throw new Error("epoch integration commit is missing before save-point evidence");
  const matchedDataValue = Number(measures.matched_data_percent);
  const matchedDataPercent = Number.isFinite(matchedDataValue) ? matchedDataValue : null;
  const sectionMeasures = sectionMeasuresFromReport(worktreeReportPath);
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
      gameId: options.gameId ?? null,
      branch: branch.ok ? branch.text : null,
      baseRef: options.baseRef ?? "origin/master",
    });
    savePoint = addSavePoint(store, {
      id: options.epochId ? `epoch-save-point-${options.epochId}` : undefined,
      campaignId: campaign.id,
      runId,
      triggerKind: "epoch_finish",
      label,
      commitSha: integrationCommit,
      branch: branch.ok ? branch.text : null,
      baseRef: options.baseRef ?? null,
      committed: snapshot.committed,
      worktreeDirty: lockedPaths.length > 0,
      matchedCodePercent,
      reportPath: resolve(artifactDir, "report.json"),
      reportChangesPath: resolve(artifactDir, "report_changes.json"),
      artifactDir,
      payload: {
        commit_reason: snapshot.committed ? null : snapshot.warning ? "commit_failed" : "nothing_to_commit",
        epoch: true,
        matched_data_percent: matchedDataPercent,
        measures,
        section_measures: sectionMeasures,
        qa_gate: qaGate,
        regressions: plan.summary,
        repair,
        locked_paths_excluded: lockedPaths,
        summary_delta: regressionReport.summary,
      },
    });
    recordDashboardArtifact(store, {
      runId,
      gameId: options.gameId ?? null,
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
      gameId: options.gameId ?? null,
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
    savePointEvidence = {
      status: "recorded",
      savePointId: savePoint.id,
      commitSha: integrationCommit,
      triggerKind: "epoch_finish",
      headlineScore: matchedCodePercent,
      artifactPaths: [
        resolve(artifactDir, "report.json"),
        resolve(artifactDir, "report_changes.json"),
      ],
      payload: {
        committed: snapshot.committed,
        commit_reason: snapshot.committed ? null : snapshot.warning ? "commit_failed" : "nothing_to_commit",
        epoch_id: options.epochId ?? null,
        matched_data_percent: matchedDataPercent,
        run_id: runId,
      },
    };
    savePointResult = { ok: true, savePointId: savePoint.id, blockerRaised: false };
    epochProgress(store, runId, {
      label,
      phase: "save_point",
      status: "finished",
      message: `epoch save point recorded${savePoint.id ? `: ${savePoint.id}` : ""}`,
      save_point_id: savePoint.id,
      artifact_dir: artifactDir,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[epoch] failed to record save point: ${message}`);
    savePointEvidence = {
      status: "failed",
      triggerKind: "epoch_finish",
      sourceKind: "epoch",
      sourceId: options.epochId ?? label ?? runId,
      message,
    };
    // Persistence occurs after the head-advancing epoch transition. The
    // scheduler/manual caller records this failure to SQLite or the spool.
    savePointResult = { ok: false, savePointId: null, blockerRaised: true };
    epochProgress(store, runId, {
      label,
      phase: "save_point",
      status: "warning",
      message: `failed to record save point: ${message}`,
      artifact_dir: artifactDir,
    });
  }

  const result: EpochCycleResult = {
    artifactDir,
    buildSteps: compactSteps(buildResult),
    commitSha: snapshot.commitSha,
    committed: snapshot.committed,
    ...(confirmation ? { confirmation } : {}),
    durationMs: Date.now() - startedAt,
    label,
    lockedPathsExcluded: lockedPaths,
    matchedCodePercent,
    matchedDataPercent,
    measures,
    sectionMeasures,
    qaGate,
    regressions: plan.summary,
    repair,
    reportCopiedToRepo,
    savePoint: savePointResult,
    savePointEvidence,
    savePointId: savePointResult.savePointId,
    scoreDelta: regressionReport.summary.matchedCodePercentDelta,
    worktreeDir: options.worktreeDir,
  };
  await writeFile(resolve(artifactDir, "summary.json"), `${JSON.stringify(result, null, 2)}\n`);
  return result;
}
