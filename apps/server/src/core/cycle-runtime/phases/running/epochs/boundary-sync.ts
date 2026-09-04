import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { buildFixerFailureOutput } from "@server/core/validation/failure-output.js";
import type { SyncMergePolicy } from "@server/core/game-registry/runtime-options.js";
import { fetchUpstreamMasterReport } from "./breakage-gate.js";
import { BUILD_FIXER_TIMEOUT_MS, runCodexBuildFixer, type BuildFixerResult } from "./build-fixer.js";
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
  epochTargetId: string | null;
  targetKey: string;
  sourcePath: string;
  unit: string | null;
  symbol: string | null;
  priorKind: "match" | "improvement" | null;
  priorScore: number | null;
  upstreamLandedSha: string;
  verdict: typeof BOUNDARY_OVERRIDE_VERDICT;
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
  advanceCycleHead(input: { previousHeadSha: string; headSha: string }): Promise<void> | void;
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
  prepareMergeReport?: () => Promise<void>;
  fetchUpstreamReport?: typeof fetchUpstreamMasterReport;
  onMergePolicyFile?: (entry: BoundaryPolicyFileLog) => void;
  runBuildFixer?: (input: { worktreeDir: string; prompt: string; timeoutMs: number }) => Promise<BuildFixerResult>;
  onBuildFixerEvent?: (
    status: "started" | "finished" | "propagated",
    result?: BuildFixerResult & { files?: string[]; commitSha?: string },
  ) => void;
}

export type BoundaryPolicyFileLog = PolicyMergeFileLog;

function boundaryBuildFixerPrompt(failure: unknown, anchorBefore: string, anchorAfter: string): string {
  const errors = buildFixerFailureOutput(failure);
  return [
    "Fix only the mechanical build break caused by the just-merged upstream range in this cycle worktree.",
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

export interface BoundarySyncResult {
  plan: BoundarySyncPlan;
  changed: boolean;
  headSha: string;
  policyMergeFiles?: BoundaryPolicyFileLog[];
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

function sourcePathForIntegration(targetKey: string, changedFiles: string[]): string | null {
  const unit = targetKey.split("::", 1)[0]?.replace(/^main\//, "") ?? "";
  const expected = normalizePath(`src/${unit}.c`);
  const normalized = changedFiles.map(normalizePath);
  if (normalized.includes(expected)) return expected;
  const unitSuffix = `/${unit}.c`;
  return normalized.find((path) => path.endsWith(unitSuffix)) ?? null;
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
    const sourcePath = sourcePathForIntegration(parsed.targetKey, changed);
    if (!sourcePath) continue;
    const enrichment = enrichmentByKey.get(parsed.targetKey);
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
  await checkedGit(runGit, input.repoRoot, ["fetch", "origin"], "fetch");
  const [localHeadSha, upstreamHeadSha] = await Promise.all([
    checkedGit(runGit, input.repoRoot, ["rev-parse", "HEAD"], "local HEAD resolution"),
    checkedGit(runGit, input.repoRoot, ["rev-parse", upstreamRef], "upstream HEAD resolution"),
  ]);
  const drifted = input.anchorSha !== upstreamHeadSha;
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
    actions: drifted
      ? [input.mergePolicy === "theirs" ? "merge_upstream_theirs" : "merge_upstream_score", "append_override_notes", "requeue_displaced_targets", "recompute_report", "knowledge_intake", "rebuild_knowledge_graph", "write_pr_sync_save_point", "advance_anchor", "advance_cycle_head"]
      : [],
  };
}

export async function runBoundarySync(input: BoundarySyncInput): Promise<BoundarySyncResult> {
  const runGit = input.runGit ?? defaultGit;
  const plan = await planBoundarySync({ ...input, runGit });
  if (input.dryRun || !plan.drifted) return { plan, changed: false, headSha: plan.localHeadSha };
  if (!input.hooks) throw new Error("boundary sync hooks are required outside dry-run mode");
  const mergePolicy = input.mergePolicy ?? "score";
  let policyMergeFiles: BoundaryPolicyFileLog[] = [];
  let upstreamAlreadyMerged = false;
  if (mergePolicy === "score") {
    const ancestor = await runGit(input.repoRoot, ["merge-base", "--is-ancestor", plan.upstreamHeadSha, plan.localHeadSha]);
    if (ancestor.exitCode !== 0 && ancestor.exitCode !== 1) {
      throw new Error(`boundary sync upstream ancestry check failed: ${output(ancestor)}`);
    }
    upstreamAlreadyMerged = ancestor.exitCode === 0;
    if (!upstreamAlreadyMerged) {
      const needsFunctionReports = policyContestedPaths(plan).some((path) => path.endsWith(".c"));
      const reports = needsFunctionReports
        ? await preparePolicyReports(input, plan.upstreamHeadSha)
        : { ours: {}, upstream: {}, scoreMode: "reports" as const, upstreamReportFallbackReason: null };
      try {
        await checkedGit(
          runGit,
          input.repoRoot,
          ["merge", "--no-edit", "--no-ff", "--no-commit", "-X", "theirs", plan.upstreamHeadSha],
          "score-policy merge preparation",
        );
        const applied = await applyScoreMergePolicy({
          worktreePath: input.repoRoot,
          baseRevision: plan.mergeBaseSha ?? plan.anchorSha,
          oursRevision: plan.localHeadSha,
          upstreamRevision: plan.upstreamHeadSha,
          upstreamChangedFiles: plan.upstreamChangedFiles,
          locallyChangedFiles: plan.locallyChangedFiles,
          reports,
          runGit,
        });
        policyMergeFiles = applied.files;
        if (applied.rewrittenPaths.length > 0) {
          await checkedGit(runGit, input.repoRoot, ["add", "--", ...applied.rewrittenPaths], "score-policy staging");
        }
        await checkedGit(runGit, input.repoRoot, ["commit", "--no-verify", "--no-edit"], "score-policy merge commit");
      } catch (error) {
        await runGit(input.repoRoot, ["merge", "--abort"]);
        throw error;
      }
    }
    for (const entry of policyMergeFiles) input.onMergePolicyFile?.(entry);
  } else {
    await checkedGit(
      runGit,
      input.repoRoot,
      ["merge", "--no-edit", "--no-ff", "-X", "theirs", plan.upstreamHeadSha],
      "upstream-precedence merge",
    );
  }
  let headSha = await checkedGit(runGit, input.repoRoot, ["rev-parse", "HEAD"], "merged HEAD resolution");
  const effectivePlan = mergePolicy === "score"
    ? upstreamAlreadyMerged
      ? { ...plan, targetsToRequeue: [], ledgerNotes: [] }
      : policyAdjustedPlan(plan, policyMergeFiles)
    : plan;

  for (const displacement of effectivePlan.targetsToRequeue) {
    await input.hooks.appendOverrideNote(displacement);
    await input.hooks.requeueTarget(displacement);
  }
  let report: Awaited<ReturnType<BoundarySyncHooks["recomputeReport"]>>;
  try {
    report = await input.hooks.recomputeReport();
  } catch (error) {
    if (input.buildFixerEnabled === false) throw error;
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
    } catch (fixerError) {
      await discardBoundaryBuildFixerDiff(runGit, input.repoRoot);
      throw fixerError;
    }
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
  await input.hooks.advanceCycleHead({ previousHeadSha: effectivePlan.localHeadSha, headSha });
  return { plan: effectivePlan, changed: true, headSha, policyMergeFiles: mergePolicy === "score" ? policyMergeFiles : undefined };
}
