import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { reportBoundaryDisplacements, reportRecoveryTargets } from "./boundary-recovery.js";
import { buildFixerFailureOutput } from "@server/core/validation/failure-output.js";
import type { SyncMergePolicy } from "@server/core/game-registry/runtime-options.js";
import type { GameSyncMergePolicy } from "@server/core/game-registry/resolver.js";
import { EXACT_SCORE } from "@server/core/validation/objdiff/constants.js";
import {
  applyCertifiedMergePolicy,
  certifiedDecisionsTsv,
  NO_SYNC_CERTIFICATION,
  UNCERTIFIED_DISPLACED_REASON,
  type CertifiedFunctionDecision,
  type SyncCertificationLookup,
} from "./certified-merge.js";
import { fetchUpstreamMasterReport } from "./breakage-gate.js";
import { BUILD_FIXER_TIMEOUT_MS, runCodexBuildFixer, type BuildFixerResult } from "./build-fixer.js";
import { executeBuildTask } from "@server/core/validation/build/execution.js";
import {
  clangFormatVersionMismatch,
  formattableSourcePaths,
  type ClangFormatApplyResult,
  type GameFormattingConfig,
} from "@server/core/validation/format/clang-format.js";
import {
  symbolCheckSourcePaths,
  symbolValidationReasons,
  type GameSymbolCheckConfig,
  type SymbolCheckResult,
} from "@server/core/validation/symbols/symbol-check.js";
import { computeUpstreamDrift, type UpstreamDrift } from "@server/core/harness-state/upstream-drift.js";
import {
  applyScoreMergePolicy,
  policyContestedPaths,
  type PolicyMergeFileLog,
  type PolicyMergeReports,
} from "./policy-merge.js";

export const BOUNDARY_OVERRIDE_VERDICT = "overridden_by_upstream_requeued" as const;
const BUILD_FIXER_PATHSPEC = [".", ":(exclude)build", ":(exclude,glob)**/build/**"];

export interface BoundaryTargetState {
  epochTargetId?: string;
  targetKey: string;
  sourcePath: string;
  unit?: string | null;
  symbol?: string | null;
  priorKind: "match" | "improvement" | null;
  priorScore: number | null;
}

export interface BoundaryDisplacement {
  priorHeadSha?: string;
  resultingHeadSha?: string;
  afterScore?: number | null;
  epochTargetId: string | null;
  targetKey: string;
  sourcePath: string;
  unit: string | null;
  symbol: string | null;
  priorKind: "match" | "improvement" | null;
  priorScore: number | null;
  upstreamLandedSha: string;
  verdict: typeof BOUNDARY_OVERRIDE_VERDICT;
  /** Why upstream displaced it, when the merge rule says (`UNCERTIFIED_DISPLACED_REASON`). */
  reason?: string;
}

export interface BoundarySyncPlan {
  schemaVersion: 1;
  dryRun: boolean;
  anchorSha: string;
  localHeadSha: string;
  upstreamHeadSha: string;
  mergeBaseSha?: string;
  drifted: boolean;
  upstreamChangedFiles: string[];
  locallyChangedFiles: string[];
  upstreamTakenFiles: string[];
  targetsToRequeue: BoundaryDisplacement[];
  ledgerNotes: BoundaryDisplacement[];
  actions: string[];
  /** How far the fetched upstream head is ahead of the accepted anchor, with the oldest and newest subjects. */
  upstreamDrift?: UpstreamDrift;
}

export interface BoundaryGitResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export type BoundaryGitRunner = (repoRoot: string, args: string[]) => Promise<BoundaryGitResult>;

export interface BoundarySyncHooks {
  /** Reuses merged-PR indexing without operator-sync publication gates. */
  ingestMergedUpstream(input: { previousAnchorSha: string; upstreamHeadSha: string }): Promise<void>;
  appendOverrideNote(displacement: BoundaryDisplacement): Promise<void> | void;
  requeueTarget(displacement: BoundaryDisplacement): Promise<void> | void;
  rebuildKnowledgeGraph(): Promise<void>;
  recomputeReport(): Promise<{
    matchedCodePercent?: number | null;
    matchedDataPercent?: number | null;
    measures?: Record<string, unknown>;
    sectionMeasures?: Record<string, unknown>;
  }>;
  writePrSyncSavePoint(input: {
    kind: "pr_sync";
    anchorSha: string;
    commitSha: string;
    upstreamHeadSha: string;
    matchedCodePercent: number | null;
    matchedDataPercent?: number | null;
    measures: Record<string, unknown>;
    sectionMeasures?: Record<string, unknown>;
  }): Promise<void> | void;
  advanceAnchor(input: { previousAnchorSha: string; upstreamHeadSha: string }): Promise<void> | void;
  advanceHarnessHead(input: { previousHeadSha: string; headSha: string }): Promise<void> | void;
}

export interface BoundarySyncInput {
  repoRoot: string;
  stateDir?: string;
  anchorSha: string;
  upstreamRef?: string;
  reportRelPath?: string;
  targets: BoundaryTargetState[];
  dryRun?: boolean;
  runGit?: BoundaryGitRunner;
  hooks?: BoundarySyncHooks;
  buildFixerEnabled?: boolean;
  mergePolicy?: SyncMergePolicy;
  /**
   * The game's conflict rule under the `score` merge policy
   * (`matching.syncMergePolicy`, active steering gate only): `certified`
   * resolves conflicting functions by gate certification (`certified-merge.ts`).
   */
  conflictRule?: GameSyncMergePolicy;
  /** Certification of our functions pinned to the pre-merge ours revision; unset certifies nothing. */
  loadCertification?: (oursRevision: string) => Promise<SyncCertificationLookup>;
  prepareMergeReport?: () => Promise<void>;
  fetchUpstreamReport?: typeof fetchUpstreamMasterReport;
  onMergePolicyFile?: (entry: BoundaryPolicyFileLog) => void;
  runBuildFixer?: (input: { worktreeDir: string; prompt: string; timeoutMs: number }) => Promise<BuildFixerResult>;
  onBuildFixerEvent?: (
    status: "started" | "finished" | "propagated",
    result?: BuildFixerResult & { files?: string[]; commitSha?: string },
  ) => void;
  /** Game clang-format policy; unset skips the boundary format step. */
  formatting?: GameFormattingConfig | null;
  /** Runs `clang-format -i` in a game sandbox and returns the resulting diff; defaults to the Daytona format-apply task. */
  runFormatApply?: (input: { repoRoot: string; files: string[] }) => Promise<ClangFormatApplyResult>;
  onFormatEvent?: (status: "started" | "finished" | "propagated", detail: BoundaryFormatEventDetail) => void;
  /** Game map-symbol validator; unset skips the boundary symbol check. */
  symbolCheck?: GameSymbolCheckConfig | null;
  /** Game build version for the baseline configure (`--version`); defaults to the report path's version. */
  buildVersion?: string;
  /** Runs the checkout's CI symbol driver in a game sandbox; defaults to the Daytona symbol-check task. */
  runSymbolCheck?: (input: { repoRoot: string; files: string[]; baselineRevision: string }) => Promise<SymbolCheckResult>;
  onSymbolCheckEvent?: (status: "started" | "finished", detail: BoundarySymbolCheckEventDetail) => void;
  /** Observed after the upstream fetch, before any merge; the caller records the notice and timeline entry. */
  onUpstreamDrift?: (drift: UpstreamDrift) => Promise<void> | void;
}

export interface BoundarySymbolCheckEventDetail {
  files: string[];
  baselineRevision: string;
  result?: SymbolCheckResult;
  reasons?: string[];
}

export interface BoundaryFormatEventDetail {
  files: string[];
  version?: string | null;
  changedFiles?: string[];
  commitSha?: string;
}

export type BoundaryPolicyFileLog = PolicyMergeFileLog;

function boundaryBuildFixerPrompt(failure: unknown, anchorBefore: string, anchorAfter: string): string {
  const errors = buildFixerFailureOutput(failure);
  return [
    "Fix only the mechanical build break caused by the just-merged upstream range in this harness worktree.",
    `The merged upstream commit range is ${anchorBefore}..${anchorAfter}.`,
    `For any function upstream matched or renamed in that range, replace our version with upstream's exactly using git show ${anchorAfter}:<path>. Upstream is gospel for those functions.`,
    "Limit edits to the failing translation units and symbols. Do not perform new decompilation work, improve matching, refactor unrelated code, or broaden the diff.",
    "Edit only. Do not build or commit.",
    "Failing translation units and compiler excerpts:",
    errors,
  ].join("\n\n");
}

async function boundaryBuildFixerFiles(runGit: BoundaryGitRunner, repoRoot: string): Promise<string[]> {
  const untracked = await checkedGit(runGit, repoRoot, ["ls-files", "--others", "--exclude-standard", "-z", "--", ...BUILD_FIXER_PATHSPEC], "build-fixer untracked file capture");
  const untrackedFiles = untracked.split("\0").filter(Boolean).sort();
  if (untrackedFiles.length > 0) {
    throw new Error(`boundary sync build-fixer created untracked file(s) that cannot be committed: ${untrackedFiles.join(", ")}`);
  }
  const changed = await checkedGit(runGit, repoRoot, ["diff", "--name-only", "-z", "HEAD", "--", ...BUILD_FIXER_PATHSPEC], "build-fixer file capture");
  const files = changed.split("\0").filter(Boolean).sort();
  if (files.length === 0) throw new Error("boundary sync build-fixer produced no tracked diff");
  return files;
}

async function commitBoundaryBuildFixerDiff(runGit: BoundaryGitRunner, repoRoot: string, files: string[]): Promise<string> {
  await checkedGit(runGit, repoRoot, ["add", "--", ...files], "build-fixer staging");
  await checkedGit(runGit, repoRoot, ["commit", "--no-verify", "-m", `boundary sync build-fixer: ${files.join(", ")}`, "--", ...files], "build-fixer commit");
  return checkedGit(runGit, repoRoot, ["rev-parse", "HEAD"], "build-fixer HEAD resolution");
}

async function discardBoundaryBuildFixerDiff(runGit: BoundaryGitRunner, repoRoot: string): Promise<void> {
  await checkedGit(runGit, repoRoot, ["reset", "--hard", "HEAD"], "build-fixer tracked cleanup");
  const untracked = await checkedGit(runGit, repoRoot, ["ls-files", "--others", "--exclude-standard", "-z", "--", ...BUILD_FIXER_PATHSPEC], "build-fixer untracked cleanup scan");
  const untrackedFiles = untracked.split("\0").filter(Boolean).sort();
  if (untrackedFiles.length > 0) {
    await checkedGit(runGit, repoRoot, ["clean", "-fd", "--", ...untrackedFiles], "build-fixer untracked cleanup");
  }
}

async function prepareBoundaryBuildFixerDiff(runGit: BoundaryGitRunner, repoRoot: string): Promise<void> {
  const status = await checkedGit(runGit, repoRoot, ["status", "--porcelain", "--untracked-files=all", "--", ...BUILD_FIXER_PATHSPEC], "build-fixer baseline check");
  if (status.trim()) throw new Error(`boundary sync build-fixer requires a clean worktree before editing: ${status}`);
}

async function defaultFormatApply(input: { repoRoot: string; files: string[] }): Promise<ClangFormatApplyResult> {
  return executeBuildTask<ClangFormatApplyResult>(input.repoRoot, { kind: "format-apply", input: { paths: input.files } });
}

/**
 * Formats every source changed since the accepted upstream anchor with the
 * sandbox's pinned clang-format and commits the result, so the head the
 * boundary accepts already passes upstream's lint CI. Formatting is
 * whitespace-only, so the report recomputed above still describes this tree.
 */
async function formatBoundaryHead(input: BoundarySyncInput, runGit: BoundaryGitRunner, anchorSha: string): Promise<string | null> {
  const pinned = input.formatting?.clangFormatVersion?.trim();
  if (!pinned) return null;
  const changed = await checkedGit(runGit, input.repoRoot, ["diff", "--name-only", "--diff-filter=ACMR", `${anchorSha}..HEAD`], "clang-format file capture");
  const files = formattableSourcePaths(lines(changed));
  if (files.length === 0) return null;
  await prepareBoundaryBuildFixerDiff(runGit, input.repoRoot);
  input.onFormatEvent?.("started", { files });
  const applied = await (input.runFormatApply ?? defaultFormatApply)({ repoRoot: input.repoRoot, files });
  if (applied.status === "tool_unavailable") {
    throw new Error(`boundary sync clang-format failed: ${applied.toolError ?? "tool unavailable in the sandbox"}`);
  }
  const mismatch = clangFormatVersionMismatch(applied.version, pinned);
  if (mismatch) throw new Error(`boundary sync clang-format refused: ${mismatch}`);
  input.onFormatEvent?.("finished", { files, version: applied.version, changedFiles: applied.changedFiles });
  if (!applied.diff.trim()) return null;
  const temp = await mkdtemp(resolve(tmpdir(), "boundary-format-"));
  try {
    const patchPath = resolve(temp, "clang-format.patch");
    await writeFile(patchPath, applied.diff.endsWith("\n") ? applied.diff : `${applied.diff}\n`);
    await checkedGit(runGit, input.repoRoot, ["apply", "--check", patchPath], "clang-format patch check");
    await checkedGit(runGit, input.repoRoot, ["apply", patchPath], "clang-format patch apply");
  } catch (error) {
    await runGit(input.repoRoot, ["checkout", "--", ...files]);
    throw error;
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
  const changedFiles = lines(await checkedGit(runGit, input.repoRoot, ["diff", "--name-only", "HEAD", "--", ...files], "clang-format changed file capture"));
  if (changedFiles.length === 0) return null;
  await checkedGit(runGit, input.repoRoot, ["add", "--", ...changedFiles], "clang-format staging");
  await checkedGit(runGit, input.repoRoot, ["commit", "--no-verify", "-m", `boundary sync clang-format: ${changedFiles.length} file(s)`, "--", ...changedFiles], "clang-format commit");
  const headSha = await checkedGit(runGit, input.repoRoot, ["rev-parse", "HEAD"], "clang-format HEAD resolution");
  input.onFormatEvent?.("propagated", { files, version: applied.version, changedFiles, commitSha: headSha });
  return headSha;
}

async function defaultSymbolCheck(input: { repoRoot: string; files: string[]; baselineRevision: string }, config: GameSymbolCheckConfig, version: string): Promise<SymbolCheckResult> {
  return executeBuildTask<SymbolCheckResult>(input.repoRoot, { kind: "symbol-check", input: { paths: input.files, baselineRevision: input.baselineRevision, script: config.script, map: config.map, version } });
}

/**
 * Upstream CI rejects a changed C++ unit whose map-symbol errors are not
 * already present at the merge base, so the boundary refuses to accept a head
 * that would fail there. The baseline is the just-merged upstream head (what a
 * PR's base would be); nothing is auto-fixed, the reasons block acceptance.
 */
async function checkBoundarySymbols(input: BoundarySyncInput, runGit: BoundaryGitRunner, upstreamHeadSha: string): Promise<void> {
  const config = input.symbolCheck;
  if (!config?.script?.trim() || !config.map?.trim()) return;
  const changed = await checkedGit(runGit, input.repoRoot, ["diff", "--name-only", "--diff-filter=ACMR", `${upstreamHeadSha}..HEAD`, "--", "*.cpp"], "symbol-check file capture");
  const files = symbolCheckSourcePaths(lines(changed));
  if (files.length === 0) return;
  input.onSymbolCheckEvent?.("started", { files, baselineRevision: upstreamHeadSha });
  const version = input.buildVersion ?? reportVersion(input.reportRelPath ?? "build/GALE01/report.json");
  const result = await (input.runSymbolCheck ?? ((request) => defaultSymbolCheck(request, config, version)))({ repoRoot: input.repoRoot, files, baselineRevision: upstreamHeadSha });
  if (result.status === "tool_unavailable") {
    input.onSymbolCheckEvent?.("finished", { files, baselineRevision: upstreamHeadSha, result, reasons: [result.toolError ?? "symbol check unavailable"] });
    throw new Error(`boundary sync symbol check could not run: ${result.toolError ?? "tool unavailable in the sandbox"}`);
  }
  const reasons = symbolValidationReasons(result);
  input.onSymbolCheckEvent?.("finished", { files, baselineRevision: upstreamHeadSha, result, reasons });
  if (reasons.length > 0) {
    throw new Error(`boundary sync refused: ${result.units.filter((unit) => unit.status === "failed").length} changed unit(s) report new map-symbol validation errors against upstream ${upstreamHeadSha.slice(0, 10)}: ${reasons.join("; ")}`);
  }
}

export interface BoundarySyncResult {
  plan: BoundarySyncPlan;
  /** Whether this invocation changed source HEAD; evidence can complete with false. */
  changed: boolean;
  headSha: string;
  policyMergeFiles?: BoundaryPolicyFileLog[];
  /** The certified rule's per-function decisions (`conflictRule: "certified"`). */
  functionDecisions?: CertifiedFunctionDecision[];
  /** Where the decision record (`function-decisions.tsv`) was written; null without a state dir. */
  decisionRecordPath?: string | null;
}

async function defaultGit(repoRoot: string, args: string[]): Promise<BoundaryGitResult> {
  const proc = Bun.spawn(["git", "-C", repoRoot, ...args], { stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { exitCode, stdout, stderr };
}

function output(result: BoundaryGitResult): string {
  return (result.stderr || result.stdout || "no output").trim();
}

async function checkedGit(runGit: BoundaryGitRunner, repoRoot: string, args: string[], operation: string): Promise<string> {
  const result = await runGit(repoRoot, args);
  if (result.exitCode !== 0) throw new Error(`boundary sync ${operation} failed: ${output(result)}`);
  return result.stdout.trim();
}

function lines(value: string): string[] {
  return [...new Set(value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean))].sort();
}

async function readJsonFile(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, "utf8"));
}

function reportVersion(reportRelPath: string): string {
  const parts = normalizePath(reportRelPath).split("/").filter(Boolean);
  const reportIndex = parts.lastIndexOf("report.json");
  return reportIndex > 0 ? parts[reportIndex - 1]! : parts[1] || "GALE01";
}

async function preparePolicyReports(input: BoundarySyncInput, upstreamHeadSha: string): Promise<PolicyMergeReports> {
  const reportRelPath = input.reportRelPath ?? "build/GALE01/report.json";
  await input.prepareMergeReport?.();
  const oursPath = resolve(input.repoRoot, reportRelPath);
  let ours: unknown;
  try {
    ours = await readJsonFile(oursPath);
  } catch (error) {
    throw new Error(`boundary sync score merge could not read our pre-merge report ${oursPath}: ${error instanceof Error ? error.message : String(error)}`);
  }

  if (!input.stateDir) {
    return {
      ours,
      upstream: {},
      scoreMode: "upstream-diff-fallback",
      upstreamReportFallbackReason: "stateDir unavailable for upstream report lookup",
    };
  }
  const fetched = await (input.fetchUpstreamReport ?? fetchUpstreamMasterReport)({
    repoRoot: input.repoRoot,
    stateDir: input.stateDir,
    anchorSha: upstreamHeadSha,
    version: reportVersion(reportRelPath),
  });
  if ("reason" in fetched) {
    return {
      ours,
      upstream: {},
      scoreMode: "upstream-diff-fallback",
      upstreamReportFallbackReason: fetched.reason,
    };
  }
  try {
    return {
      ours,
      upstream: await readJsonFile(fetched.path),
      scoreMode: "reports",
      upstreamReportFallbackReason: null,
    };
  } catch (error) {
    return {
      ours,
      upstream: {},
      scoreMode: "upstream-diff-fallback",
      upstreamReportFallbackReason: `could not parse upstream report ${fetched.path}: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

function policyAdjustedPlan(plan: BoundarySyncPlan, files: BoundaryPolicyFileLog[]): BoundarySyncPlan {
  const byPath = new Map(files.map((entry) => [normalizePath(entry.path), entry]));
  const targetsToRequeue = plan.targetsToRequeue.filter((target) => {
    const entry = byPath.get(normalizePath(target.sourcePath));
    if (!entry?.result) return true;
    if (entry.result.fallback?.side === "ours" || entry.result.strategy === "ours_whole") return false;
    const functionName = target.symbol ?? target.targetKey.split("::", 2)[1] ?? null;
    if (!functionName) return true;
    const decision = entry.result.decisions.find((candidate) => candidate.functionName === functionName);
    return decision ? decision.contested && decision.side !== "ours" : true;
  });
  return { ...plan, targetsToRequeue, ledgerNotes: targetsToRequeue };
}

const CERTIFIED_SOURCE_FILE = /\.(?:c|cc|cpp|cxx|C)$/;

/** The certified rule's displacement filter: a target stays queued unless its function kept ours. */
function certifiedAdjustedPlan(plan: BoundarySyncPlan, decisions: CertifiedFunctionDecision[]): BoundarySyncPlan {
  const results = new Map<string, CertifiedFunctionDecision["result"]>();
  for (const decision of decisions) {
    for (const symbol of decision.symbols) results.set(`${normalizePath(decision.path)}\0${symbol.symbol}`, decision.result);
  }
  const targetsToRequeue = plan.targetsToRequeue.filter((target) => {
    const symbol = target.symbol ?? target.targetKey.split("::", 2)[1] ?? null;
    const result = symbol ? results.get(`${normalizePath(target.sourcePath)}\0${symbol}`) : undefined;
    return result === undefined || result !== "ours";
  });
  return { ...plan, targetsToRequeue, ledgerNotes: targetsToRequeue };
}

/**
 * Rule 3 of the certified merge: every symbol whose uncertified ours scored
 * higher but went to upstream is an open target. Marks a displacement the
 * report already found, and adds the ones it did not (no recovery journal).
 */
export function withCertifiedDisplacements(
  displacements: BoundaryDisplacement[],
  decisions: CertifiedFunctionDecision[],
  heads: { priorHeadSha: string; resultingHeadSha: string; upstreamHeadSha: string },
): BoundaryDisplacement[] {
  const byKey = new Map(displacements.map((item) => [item.targetKey, item]));
  for (const decision of decisions) {
    if (!decision.displaced) continue;
    for (const symbol of decision.symbols) {
      if (symbol.certification.status === "certified" || symbol.oursScore === null || symbol.upstreamScore === null || symbol.oursScore <= symbol.upstreamScore) continue;
      const targetKey = `${symbol.unit}::${symbol.symbol}`;
      const existing = byKey.get(targetKey);
      byKey.set(targetKey, existing ? { ...existing, reason: UNCERTIFIED_DISPLACED_REASON } : {
        epochTargetId: null,
        targetKey,
        sourcePath: normalizePath(decision.path),
        unit: symbol.unit,
        symbol: symbol.symbol,
        priorKind: symbol.oursScore >= EXACT_SCORE ? "match" : "improvement",
        priorScore: symbol.oursScore,
        afterScore: symbol.upstreamScore,
        ...heads,
        upstreamLandedSha: heads.upstreamHeadSha,
        verdict: BOUNDARY_OVERRIDE_VERDICT,
        reason: UNCERTIFIED_DISPLACED_REASON,
      });
    }
  }
  return [...byKey.values()].sort((left, right) => left.targetKey.localeCompare(right.targetKey));
}

async function readMergedReport(input: BoundarySyncInput): Promise<unknown> {
  if (!input.reportRelPath) return undefined;
  try {
    return await readJsonFile(resolve(input.repoRoot, input.reportRelPath));
  } catch {
    return undefined;
  }
}

/**
 * The sync's auditable decision record: `function-decisions.tsv` (one row per
 * function and report symbol, `merged` filled once the report is recomputed)
 * and `function-decisions.json`, under
 * `<stateDir>/boundary_sync/<ours>-<upstream>/`.
 */
function decisionRecordPaths(input: BoundarySyncInput, plan: BoundarySyncPlan): { dir: string; tsv: string; json: string } | null {
  if (!input.stateDir) return null;
  const dir = resolve(input.stateDir, "boundary_sync", `${plan.localHeadSha}-${plan.upstreamHeadSha}`);
  return { dir, tsv: resolve(dir, "function-decisions.tsv"), json: resolve(dir, "function-decisions.json") };
}

/** The decisions of the record written at the merge, or null when none was. */
async function readDecisionRecord(input: BoundarySyncInput, plan: BoundarySyncPlan): Promise<CertifiedFunctionDecision[] | null> {
  const paths = decisionRecordPaths(input, plan);
  if (!paths) return null;
  try {
    const record = await readJsonFile(paths.json) as { local_head?: unknown; upstream_head?: unknown; decisions?: unknown };
    if (record.local_head !== plan.localHeadSha || record.upstream_head !== plan.upstreamHeadSha || !Array.isArray(record.decisions)) return null;
    return record.decisions as CertifiedFunctionDecision[];
  } catch {
    return null;
  }
}

async function writeDecisionRecord(
  input: BoundarySyncInput,
  plan: BoundarySyncPlan,
  decisions: CertifiedFunctionDecision[],
  mergedReport?: unknown,
  postMerge?: { build_fixer: { files: string[]; commit: string } | null },
): Promise<string | null> {
  const paths = decisionRecordPaths(input, plan);
  if (!paths || decisions.length === 0) return null;
  const dir = paths.dir;
  await mkdir(dir, { recursive: true });
  const tsvPath = paths.tsv;
  const jsonPath = paths.json;
  const json = {
    schema: "boundary-sync-function-decisions-v1",
    rule: "certified",
    local_head: plan.localHeadSha,
    upstream_head: plan.upstreamHeadSha,
    merge_base: plan.mergeBaseSha ?? null,
    merged_scores: mergedReport !== undefined,
    // Ours-only edits outside the conflicts keep git's merge; when that tree
    // did not build, the build fixer's commit (else null) is recorded here.
    post_merge: postMerge ?? null,
    decisions,
  };
  await writeFile(`${tsvPath}.tmp`, certifiedDecisionsTsv(decisions, mergedReport));
  await rename(`${tsvPath}.tmp`, tsvPath);
  await writeFile(`${jsonPath}.tmp`, `${JSON.stringify(json, null, 2)}\n`);
  await rename(`${jsonPath}.tmp`, jsonPath);
  return tsvPath;
}

function normalizePath(path: string): string {
  return path.replace(/^\.\//, "").replace(/\\/g, "/");
}

const WORKER_INTEGRATION_SUBJECT = /^worker-integration\(job-[^)]+\):\s+(.+?)\s+\[checkpoint\s+([^\]]+)\](?:\s+\(conflict resolved\))?$/;

/** Shared parser for the branch-scoped worker-integration history. */
export function parseWorkerIntegrationSubject(subject: string): { targetKey: string; checkpointPrefix: string } | null {
  const match = WORKER_INTEGRATION_SUBJECT.exec(subject);
  return match?.[1] && match[2]
    ? { targetKey: match[1], checkpointPrefix: match[2] }
    : null;
}

function sourcePathForIntegration(targetKey: string, changedFiles: string[], enrichment?: BoundaryTargetState): string {
  const normalized = changedFiles.map(normalizePath);
  // A header-only integration can improve its primary translation unit too.
  if (enrichment?.sourcePath) return normalizePath(enrichment.sourcePath);
  const unit = targetKey.split("::", 1)[0] ?? "";
  // Report/enrichment metadata is authoritative. Older branch-only recovery may
  // infer a unique source suffix, independent of language or module prefix.
  const variants = [unit, unit.replace(/^[^/]+\//, "")];
  const matches = normalized.filter((path) => /\.(?:c|cc|cpp|cxx|C)$/.test(path) && variants.some((name) =>
    path.replace(/\.(?:c|cc|cpp|cxx|C)$/, "").endsWith(`/${name}`)));
  if (matches.length === 1) return matches[0]!;
  throw new Error(`Boundary recovery cannot resolve source for ${targetKey}; changed files: ${normalized.join(", ")}`);
}

async function discoverBranchTargets(input: {
  runGit: BoundaryGitRunner;
  repoRoot: string;
  anchorSha: string;
  localHeadSha: string;
  enrichments: BoundaryTargetState[];
}): Promise<BoundaryTargetState[]> {
  const history = await checkedGit(
    input.runGit,
    input.repoRoot,
    ["log", "--format=%H%x09%s", `${input.anchorSha}..${input.localHeadSha}`],
    "worker integration history",
  );
  const enrichmentByKey = new Map(input.enrichments.map((target) => [target.targetKey, target]));
  const discovered = new Map<string, BoundaryTargetState>();
  for (const row of history.split(/\r?\n/).filter(Boolean)) {
    const tab = row.indexOf("\t");
    if (tab < 0) continue;
    const commitSha = row.slice(0, tab);
    const parsed = parseWorkerIntegrationSubject(row.slice(tab + 1));
    if (!parsed || discovered.has(parsed.targetKey)) continue;
    const changed = lines(await checkedGit(
      input.runGit,
      input.repoRoot,
      ["show", "--format=", "--name-only", commitSha],
      `changed files for worker integration ${commitSha}`,
    ));
    const enrichment = enrichmentByKey.get(parsed.targetKey);
    const sourcePath = sourcePathForIntegration(parsed.targetKey, changed, enrichment);
    const [unit, symbol] = parsed.targetKey.split("::", 2);
    discovered.set(parsed.targetKey, {
      epochTargetId: enrichment?.epochTargetId,
      targetKey: parsed.targetKey,
      sourcePath,
      unit: enrichment?.unit ?? unit ?? null,
      symbol: enrichment?.symbol ?? symbol ?? null,
      priorKind: enrichment?.priorKind ?? null,
      priorScore: enrichment?.priorScore ?? null,
    });
  }
  return [...discovered.values()];
}

export function detectBoundaryDisplacements(input: {
  upstreamTakenFiles: string[];
  targets: BoundaryTargetState[];
  upstreamHeadSha: string;
}): BoundaryDisplacement[] {
  const taken = new Set(input.upstreamTakenFiles.map(normalizePath));
  return input.targets
    .filter((target) => taken.has(normalizePath(target.sourcePath)))
    .map((target) => ({
      epochTargetId: target.epochTargetId ?? null,
      targetKey: target.targetKey,
      sourcePath: normalizePath(target.sourcePath),
      unit: target.unit ?? null,
      symbol: target.symbol ?? null,
      priorKind: target.priorKind,
      priorScore: target.priorScore,
      upstreamLandedSha: input.upstreamHeadSha,
      verdict: BOUNDARY_OVERRIDE_VERDICT,
    }))
    .sort((left, right) => left.targetKey.localeCompare(right.targetKey));
}

/**
 * Fetches the remote and computes the complete reconciliation plan. It does
 * not change the checked-out branch, state store, ledger, reports, or anchor.
 */
export async function planBoundarySync(input: Omit<BoundarySyncInput, "hooks">): Promise<BoundarySyncPlan> {
  const runGit = input.runGit ?? defaultGit;
  const upstreamRef = input.upstreamRef ?? "origin/master";
  // Fetch the remote the upstream ref lives on (SMS tracks `upstream/main`, Melee `origin/master`).
  const remote = upstreamRef.includes("/") ? upstreamRef.slice(0, upstreamRef.indexOf("/")) : "origin";
  await checkedGit(runGit, input.repoRoot, ["fetch", remote], "fetch");
  const [localHeadSha, upstreamHeadSha] = await Promise.all([
    checkedGit(runGit, input.repoRoot, ["rev-parse", "HEAD"], "local HEAD resolution"),
    checkedGit(runGit, input.repoRoot, ["rev-parse", upstreamRef], "upstream HEAD resolution"),
  ]);
  const drifted = input.anchorSha !== upstreamHeadSha;
  const upstreamDrift = await computeUpstreamDrift({
    repoRoot: input.repoRoot, upstreamRef, acceptedUpstream: input.anchorSha, upstreamHead: upstreamHeadSha,
    runGit: async (root, args) => runGit(root, args),
  });
  const mergeBaseSha = drifted
    ? await checkedGit(runGit, input.repoRoot, ["merge-base", localHeadSha, upstreamHeadSha], "merge-base resolution")
    : localHeadSha;
  const [upstreamChanged, locallyChanged] = drifted
    ? await Promise.all([
        checkedGit(runGit, input.repoRoot, ["diff", "--name-only", `${mergeBaseSha}..${upstreamHeadSha}`], "upstream diff"),
        checkedGit(runGit, input.repoRoot, ["diff", "--name-only", `${mergeBaseSha}..${localHeadSha}`], "local diff"),
      ])
    : ["", ""];
  const upstreamChangedFiles = lines(upstreamChanged);
  const locallyChangedFiles = lines(locallyChanged);
  const localSet = new Set(locallyChangedFiles);
  // Only overlapping local/upstream paths can displace confirmed local work.
  // The selected merge policy decides which functions actually remain ours.
  const upstreamTakenFiles = upstreamChangedFiles.filter((path) => localSet.has(path));
  const branchTargets = await discoverBranchTargets({
    runGit,
    repoRoot: input.repoRoot,
    anchorSha: input.anchorSha,
    localHeadSha,
    enrichments: input.targets,
  });
  const targetsToRequeue = detectBoundaryDisplacements({
    upstreamTakenFiles,
    targets: branchTargets,
    upstreamHeadSha,
  });
  return {
    schemaVersion: 1,
    dryRun: input.dryRun === true,
    anchorSha: input.anchorSha,
    localHeadSha,
    upstreamHeadSha,
    mergeBaseSha,
    drifted,
    upstreamChangedFiles,
    locallyChangedFiles,
    upstreamTakenFiles,
    targetsToRequeue,
    ledgerNotes: targetsToRequeue,
    upstreamDrift: upstreamDrift ?? undefined,
    actions: drifted
      ? [input.mergePolicy === "theirs" ? "merge_upstream_theirs" : input.conflictRule === "certified" ? "merge_upstream_certified" : "merge_upstream_score", "recompute_report", "append_override_notes", "requeue_displaced_targets", "knowledge_intake", "rebuild_knowledge_graph", "write_pr_sync_save_point", "advance_anchor", "advance_harness_head"]
      : ["recompute_report", "knowledge_intake", "rebuild_knowledge_graph", "write_pr_sync_save_point", "advance_anchor", "advance_harness_head"],
  };
}

export async function runBoundarySync(input: BoundarySyncInput): Promise<BoundarySyncResult> {
  const runGit = input.runGit ?? defaultGit;
  // Keep the pre-merge report across process exits and post-merge failures. A
  // retry must not measure its "before" state from the already-merged checkout.
  const recoveryDir = input.stateDir && input.reportRelPath ? resolve(input.stateDir, "boundary_recovery") : null;
  const pendingPath = recoveryDir ? resolve(recoveryDir, "pending.json") : null;
  // `functionDecisions`: the certified rule's decisions, saved with the merge so a retry keeps them.
  // `buildFixer`: the fixer's commit, saved as soon as it lands so a retry still records it.
  let journal: {
    repoRoot: string; plan: BoundarySyncPlan; before: unknown;
    functionDecisions?: CertifiedFunctionDecision[]; buildFixer?: { files: string[]; commit: string };
  } | null = null;
  if (pendingPath && !input.dryRun) {
    try { journal = JSON.parse(await readFile(pendingPath, "utf8")); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    if (journal && (journal.repoRoot !== resolve(input.repoRoot) ||
        ![journal.plan.anchorSha, journal.plan.upstreamHeadSha].includes(input.anchorSha))) {
      throw new Error("Boundary recovery journal does not match accepted source; reconcile it before Sync");
    }
  }
  const plan = journal?.plan ?? await planBoundarySync({ ...input, runGit });
  if (plan.upstreamDrift) await input.onUpstreamDrift?.(plan.upstreamDrift);
  if (input.dryRun) return { plan, changed: false, headSha: plan.localHeadSha };
  if (!input.hooks) throw new Error("boundary sync hooks are required outside dry-run mode");
  const mergePolicy = input.mergePolicy ?? "score";
  let policyMergeFiles: BoundaryPolicyFileLog[] = [];
  let upstreamAlreadyMerged = !plan.drifted;
  if (plan.drifted) {
    const ancestor = await runGit(input.repoRoot, ["merge-base", "--is-ancestor", plan.upstreamHeadSha, "HEAD"]);
    if (ancestor.exitCode !== 0 && ancestor.exitCode !== 1) {
      throw new Error(`boundary sync upstream ancestry check failed: ${output(ancestor)}`);
    }
    upstreamAlreadyMerged = ancestor.exitCode === 0;
  }
  if (pendingPath && plan.drifted && !journal) {
    if (upstreamAlreadyMerged) throw new Error("Upstream is already merged without pre-merge recovery evidence; backfill from the saved epoch report before Sync");
    const before = await readJsonFile(resolve(input.repoRoot, input.reportRelPath!));
    reportRecoveryTargets(before); // Validate before any source mutation.
    journal = { repoRoot: resolve(input.repoRoot), plan, before };
    await mkdir(recoveryDir!, { recursive: true });
    await writeFile(`${pendingPath}.tmp`, JSON.stringify(journal));
    await rename(`${pendingPath}.tmp`, pendingPath);
  }
  if (journal) {
    await checkedGit(runGit, input.repoRoot, ["merge-base", "--is-ancestor", plan.localHeadSha, "HEAD"], "saved recovery source ancestry");
  }
  // The certified rule replaces the score rule for conflicting functions (`matching.syncMergePolicy`).
  const certifiedRule = mergePolicy === "score" && input.conflictRule === "certified";
  let functionDecisions: CertifiedFunctionDecision[] = [];
  let decisionRecordPath: string | null = null;
  if (mergePolicy === "score") {
    if (!upstreamAlreadyMerged) {
      const contested = policyContestedPaths(plan);
      const needsFunctionReports = certifiedRule
        ? contested.some((path) => CERTIFIED_SOURCE_FILE.test(path))
        : contested.some((path) => path.endsWith(".c"));
      const reports = needsFunctionReports
        ? await preparePolicyReports(input, plan.upstreamHeadSha)
        : { ours: {}, upstream: {}, scoreMode: "reports" as const, upstreamReportFallbackReason: null };
      // Certification describes our pre-merge head: read it before HEAD moves.
      const certification = certifiedRule ? (input.loadCertification ? await input.loadCertification(plan.localHeadSha) : NO_SYNC_CERTIFICATION) : null;
      try {
        await checkedGit(
          runGit,
          input.repoRoot,
          ["merge", "--no-edit", "--no-ff", "--no-commit", "-X", "theirs", plan.upstreamHeadSha],
          certifiedRule ? "certified-policy merge preparation" : "score-policy merge preparation",
        );
        const policyInput = {
          worktreePath: input.repoRoot,
          baseRevision: plan.mergeBaseSha ?? plan.anchorSha,
          oursRevision: plan.localHeadSha,
          upstreamRevision: plan.upstreamHeadSha,
          upstreamChangedFiles: plan.upstreamChangedFiles,
          locallyChangedFiles: plan.locallyChangedFiles,
          reports,
          runGit,
        };
        const certified = certification ? await applyCertifiedMergePolicy({ ...policyInput, certification }) : null;
        const applied = certified ?? await applyScoreMergePolicy(policyInput);
        policyMergeFiles = applied.files;
        functionDecisions = certified?.decisions ?? [];
        if (applied.rewrittenPaths.length > 0) {
          await checkedGit(runGit, input.repoRoot, ["add", "--", ...applied.rewrittenPaths], "score-policy staging");
        }
        await checkedGit(runGit, input.repoRoot, ["commit", "--no-verify", "--no-edit"], "score-policy merge commit");
      } catch (error) {
        await runGit(input.repoRoot, ["merge", "--abort"]);
        throw error;
      }
      // Persist the decisions with the merge, before any post-merge step can fail.
      if (certifiedRule && journal && pendingPath) {
        journal = { ...journal, functionDecisions };
        await writeFile(`${pendingPath}.tmp`, JSON.stringify(journal));
        await rename(`${pendingPath}.tmp`, pendingPath);
      }
      decisionRecordPath = await writeDecisionRecord(input, plan, functionDecisions);
    } else if (certifiedRule) {
      // A retry after the merge: the decisions come back from the journal (else the record written at the merge).
      const saved = journal?.functionDecisions ?? await readDecisionRecord(input, plan);
      if (saved) {
        functionDecisions = saved;
        decisionRecordPath = decisionRecordPaths(input, plan)?.tsv ?? null;
      }
    }
    for (const entry of policyMergeFiles) input.onMergePolicyFile?.(entry);
  } else if (!upstreamAlreadyMerged) {
    await checkedGit(
      runGit,
      input.repoRoot,
      ["merge", "--no-edit", "--no-ff", "-X", "theirs", plan.upstreamHeadSha],
      "upstream-precedence merge",
    );
  }
  let headSha = await checkedGit(runGit, input.repoRoot, ["rev-parse", "HEAD"], "merged HEAD resolution");
  let effectivePlan = upstreamAlreadyMerged
    ? { ...plan, targetsToRequeue: [], ledgerNotes: [] }
    : mergePolicy === "score"
      ? certifiedRule ? certifiedAdjustedPlan(plan, functionDecisions) : policyAdjustedPlan(plan, policyMergeFiles)
      : plan;

  let report: Awaited<ReturnType<BoundarySyncHooks["recomputeReport"]>>;
  // The merged tree the rule produced needed the build fixer (recorded with the decisions).
  let buildFixer: { files: string[]; commit: string } | null = journal?.buildFixer ?? null;
  try {
    report = await input.hooks.recomputeReport();
  } catch (error) {
    // An unchanged upstream cannot justify source edits during evidence refresh.
    if (!plan.drifted || input.buildFixerEnabled === false) throw error;
    await prepareBoundaryBuildFixerDiff(runGit, input.repoRoot);
    input.onBuildFixerEvent?.("started");
    try {
      const fixer = await (input.runBuildFixer ?? ((fixerInput) => runCodexBuildFixer(fixerInput)))({
        worktreeDir: input.repoRoot,
        prompt: boundaryBuildFixerPrompt(error, effectivePlan.anchorSha, effectivePlan.upstreamHeadSha),
        timeoutMs: BUILD_FIXER_TIMEOUT_MS,
      });
      input.onBuildFixerEvent?.("finished", fixer);
      if (fixer.timedOut || fixer.exitCode !== 0) throw error;
      const fixerFiles = await boundaryBuildFixerFiles(runGit, input.repoRoot);
      report = await input.hooks.recomputeReport();
      headSha = await commitBoundaryBuildFixerDiff(runGit, input.repoRoot, fixerFiles);
      input.onBuildFixerEvent?.("propagated", { ...fixer, files: fixerFiles, commitSha: headSha });
      buildFixer = { files: fixerFiles, commit: headSha };
      if (journal && pendingPath) {
        journal = { ...journal, buildFixer };
        await writeFile(`${pendingPath}.tmp`, JSON.stringify(journal));
        await rename(`${pendingPath}.tmp`, pendingPath);
      }
    } catch (fixerError) {
      await discardBoundaryBuildFixerDiff(runGit, input.repoRoot);
      throw fixerError;
    }
  }
  // Format after the build-fixer so the accepted head is CI-clean; the
  // committed tree differs from the measured one only by whitespace.
  const formattedHead = await formatBoundaryHead(input, runGit, effectivePlan.anchorSha);
  if (formattedHead) headSha = formattedHead;
  // Map-symbol validation against the merged upstream: new errors block acceptance.
  await checkBoundarySymbols(input, runGit, effectivePlan.upstreamHeadSha);
  if (journal) {
    const displacements = reportBoundaryDisplacements({
      before: journal.before,
      after: await readJsonFile(resolve(input.repoRoot, input.reportRelPath!)),
      priorHeadSha: plan.localHeadSha, resultingHeadSha: headSha, upstreamHeadSha: plan.upstreamHeadSha,
    });
    effectivePlan = { ...plan, targetsToRequeue: displacements, ledgerNotes: displacements };
  }
  if (functionDecisions.length > 0) {
    // Uncertified ours that upstream displaced are open targets, requeued like any displacement.
    const displaced = withCertifiedDisplacements(effectivePlan.targetsToRequeue, functionDecisions, {
      priorHeadSha: plan.localHeadSha, resultingHeadSha: headSha, upstreamHeadSha: plan.upstreamHeadSha,
    });
    effectivePlan = { ...effectivePlan, targetsToRequeue: displaced, ledgerNotes: displaced };
    decisionRecordPath = await writeDecisionRecord(input, plan, functionDecisions, await readMergedReport(input), { build_fixer: buildFixer }) ?? decisionRecordPath;
  }
  for (const displacement of effectivePlan.targetsToRequeue) {
    await input.hooks.appendOverrideNote(displacement);
    await input.hooks.requeueTarget(displacement);
  }
  await input.hooks.ingestMergedUpstream({
    previousAnchorSha: effectivePlan.anchorSha,
    upstreamHeadSha: effectivePlan.upstreamHeadSha,
  });
  await input.hooks.rebuildKnowledgeGraph();
  await input.hooks.writePrSyncSavePoint({
    kind: "pr_sync",
    anchorSha: effectivePlan.anchorSha,
    commitSha: headSha,
    upstreamHeadSha: effectivePlan.upstreamHeadSha,
    matchedCodePercent: report.matchedCodePercent ?? null,
    matchedDataPercent: report.matchedDataPercent ?? null,
    measures: report.measures ?? {},
    sectionMeasures: report.sectionMeasures ?? {},
  });
  await input.hooks.advanceAnchor({ previousAnchorSha: effectivePlan.anchorSha, upstreamHeadSha: effectivePlan.upstreamHeadSha });
  await input.hooks.advanceHarnessHead({ previousHeadSha: effectivePlan.localHeadSha, headSha });
  if (journal && pendingPath) {
    await rename(pendingPath, resolve(recoveryDir!, `${plan.localHeadSha}-${plan.upstreamHeadSha}.json`));
  }
  return {
    plan: effectivePlan,
    changed: headSha !== plan.localHeadSha,
    headSha,
    policyMergeFiles: mergePolicy === "score" ? policyMergeFiles : undefined,
    ...(certifiedRule ? { functionDecisions, decisionRecordPath } : {}),
  };
}
