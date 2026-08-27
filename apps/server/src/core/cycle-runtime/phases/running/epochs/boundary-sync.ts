export const BOUNDARY_OVERRIDE_VERDICT = "overridden_by_upstream_requeued" as const;

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
  anchorSha: string;
  upstreamRef?: string;
  targets: BoundaryTargetState[];
  dryRun?: boolean;
  runGit?: BoundaryGitRunner;
  hooks?: BoundarySyncHooks;
}

export interface BoundarySyncResult {
  plan: BoundarySyncPlan;
  changed: boolean;
  headSha: string;
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
  const [upstreamChanged, locallyChanged] = drifted
    ? await Promise.all([
        checkedGit(runGit, input.repoRoot, ["diff", "--name-only", `${input.anchorSha}..${upstreamHeadSha}`], "upstream diff"),
        checkedGit(runGit, input.repoRoot, ["diff", "--name-only", `${input.anchorSha}..${localHeadSha}`], "local diff"),
      ])
    : ["", ""];
  const upstreamChangedFiles = lines(upstreamChanged);
  const locallyChangedFiles = lines(locallyChanged);
  const localSet = new Set(locallyChangedFiles);
  // Only overlapping local/upstream paths can displace confirmed local work.
  // `git merge -X theirs` gives upstream precedence on these paths.
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
    drifted,
    upstreamChangedFiles,
    locallyChangedFiles,
    upstreamTakenFiles,
    targetsToRequeue,
    ledgerNotes: targetsToRequeue,
    actions: drifted
      ? ["merge_upstream_theirs", "ingest_merged_prs", "append_override_notes", "requeue_displaced_targets", "rebuild_knowledge_graph", "recompute_report", "write_pr_sync_save_point", "advance_anchor", "advance_cycle_head"]
      : [],
  };
}

export async function runBoundarySync(input: BoundarySyncInput): Promise<BoundarySyncResult> {
  const runGit = input.runGit ?? defaultGit;
  const plan = await planBoundarySync({ ...input, runGit });
  if (input.dryRun || !plan.drifted) return { plan, changed: false, headSha: plan.localHeadSha };
  if (!input.hooks) throw new Error("boundary sync hooks are required outside dry-run mode");

  await checkedGit(
    runGit,
    input.repoRoot,
    ["merge", "--no-edit", "--no-ff", "-X", "theirs", plan.upstreamHeadSha],
    "upstream-precedence merge",
  );
  const headSha = await checkedGit(runGit, input.repoRoot, ["rev-parse", "HEAD"], "merged HEAD resolution");

  await input.hooks.ingestMergedUpstream({
    previousAnchorSha: plan.anchorSha,
    upstreamHeadSha: plan.upstreamHeadSha,
  });
  for (const displacement of plan.targetsToRequeue) {
    await input.hooks.appendOverrideNote(displacement);
    await input.hooks.requeueTarget(displacement);
  }
  await input.hooks.rebuildKnowledgeGraph();
  const report = await input.hooks.recomputeReport();
  await input.hooks.writePrSyncSavePoint({
    kind: "pr_sync",
    anchorSha: plan.anchorSha,
    commitSha: headSha,
    upstreamHeadSha: plan.upstreamHeadSha,
    matchedCodePercent: report.matchedCodePercent ?? null,
    matchedDataPercent: report.matchedDataPercent ?? null,
    measures: report.measures ?? {},
    sectionMeasures: report.sectionMeasures ?? {},
  });
  await input.hooks.advanceAnchor({ previousAnchorSha: plan.anchorSha, upstreamHeadSha: plan.upstreamHeadSha });
  await input.hooks.advanceCycleHead({ previousHeadSha: plan.localHeadSha, headSha });
  return { plan, changed: true, headSha };
}
