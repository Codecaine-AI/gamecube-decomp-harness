import {
  outputTail,
  type GitSyncResult,
  type JsonObject,
  type PreparingRuntimeDeps,
  type PreparingRuntimeProjectContext,
} from "../runtime-shared.js";
import type { DispatchLeaseRevalidator } from "@server/core/session-runtime/dispatch-guard";
import { ensurePrepareWorktrees } from "./worktrees.js";

export function parseBaseRef(baseRef: string): { branch: string; remote: string } {
  const slash = baseRef.indexOf("/");
  if (slash <= 0 || slash === baseRef.length - 1) return { remote: "origin", branch: "master" };
  return { remote: baseRef.slice(0, slash), branch: baseRef.slice(slash + 1) };
}

export function mergedPullRequestNumbers(logText: string): number[] {
  const numbers = new Set<number>();
  for (const match of logText.matchAll(/^Merge (?:pull request|PR) #(\d+)/gim)) {
    numbers.add(Number(match[1]));
  }
  // Squash-and-merge commits (doldecomp/melee's merge style) reference the PR
  // as a trailing "(#NNNN)" in the subject line instead of a merge commit.
  for (const match of logText.matchAll(/\(#(\d+)\)\s*$/gm)) {
    numbers.add(Number(match[1]));
  }
  return [...numbers].filter(Number.isFinite).sort((a, b) => a - b);
}

export async function syncProjectGitAndFindMergedPrs(
  deps: PreparingRuntimeDeps,
  paths: PreparingRuntimeProjectContext,
  sessionUuid = "",
  revalidateLease?: DispatchLeaseRevalidator,
): Promise<GitSyncResult> {
  const baseRef = paths.project?.baseRef ?? "origin/master";
  const { remote } = parseBaseRef(baseRef);
  const before = await deps.runGit(paths.repoRoot, ["rev-parse", "--verify", baseRef], { check: false });
  const beforeRef = before.exitCode === 0 ? before.stdout.trim() : "";
  const steps: JsonObject[] = [
    {
      name: "read_previous_base_ref",
      command: ["git", "rev-parse", "--verify", baseRef],
      exitCode: before.exitCode,
      stdout: outputTail(before.stdout, 2000),
      stderr: outputTail(before.stderr, 2000),
    },
  ];

  deps.appendLog("ui", `git fetch ${remote} started`);
  revalidateLease?.();
  const fetch = await deps.runGit(paths.repoRoot, ["fetch", "--prune", remote], { failureHint: `Unable to fetch ${remote}` });
  deps.appendLog("ui", `git fetch ${remote} complete`);
  steps.push({ name: "git_fetch", command: ["git", "fetch", "--prune", remote], exitCode: fetch.exitCode, stdout: outputTail(fetch.stdout, 2000), stderr: outputTail(fetch.stderr, 2000) });

  const after = await deps.runGit(paths.repoRoot, ["rev-parse", "--verify", baseRef], { failureHint: `Unable to read ${baseRef} after sync` });
  const afterRef = after.stdout.trim();
  const branchResult = await deps.runGit(paths.repoRoot, ["branch", "--show-current"], { check: false });
  const branch = branchResult.stdout.trim() || "(detached)";

  deps.appendLog("ui", `prepare upstream-current worktree update started: ${baseRef} @ ${afterRef.slice(0, 10)}`);
  revalidateLease?.();
  const worktrees = await ensurePrepareWorktrees(deps, paths, afterRef, sessionUuid, revalidateLease);
  deps.appendLog("ui", `prepare upstream-current worktree ready: ${worktrees.upstreamWorktreePath}`);
  if (worktrees.sessionCurrentWorktreePath) deps.appendLog("ui", `prepare session current worktree ready: ${worktrees.sessionCurrentWorktreePath}`);
  steps.push(...worktrees.steps);
  if (worktrees.linkedAssets > 0) {
    steps.push({ name: "link_orig_assets", linkedAssets: worktrees.linkedAssets });
  }

  const baseResult = {
    afterRef,
    baseRef,
    beforeRef,
    branch,
    mainWorktreePath: worktrees.mainWorktreePath,
    mergedPrs: [] as number[],
    sessionBranch: worktrees.sessionBranch,
    sessionCurrentWorktreePath: worktrees.sessionCurrentWorktreePath,
    sessionRootPath: worktrees.sessionRootPath,
    sessionWorktreePath: worktrees.sessionWorktreePath,
    steps,
    upstreamWorktreePath: worktrees.upstreamWorktreePath,
  };
  if (!beforeRef || beforeRef === afterRef) {
    return baseResult;
  }

  const range = `${beforeRef}..${afterRef}`;
  const log = await deps.runGit(paths.repoRoot, ["log", "--first-parent", "--format=%s%n%b", range], { failureHint: `Unable to inspect merged PRs in ${range}` });
  const mergedPrs = mergedPullRequestNumbers(log.stdout);
  deps.appendLog("ui", mergedPrs.length ? `merged PRs newly landed: ${mergedPrs.map((number) => `#${number}`).join(", ")}` : "no merged PR numbers found in newly pulled commits");
  steps.push({ name: "discover_merged_prs", command: ["git", "log", "--first-parent", "--format=%s%n%b", range], exitCode: log.exitCode, stdout: outputTail(log.stdout, 4000), stderr: outputTail(log.stderr, 2000), mergedPrs });
  return { ...baseResult, mergedPrs, steps };
}

export async function runGitIntakeForPrepare(
  deps: PreparingRuntimeDeps,
  paths: PreparingRuntimeProjectContext,
  sessionUuid = "",
  revalidateLease?: DispatchLeaseRevalidator,
): Promise<GitSyncResult> {
  deps.operationStep("fetch upstream");
  const gitSync = await syncProjectGitAndFindMergedPrs(deps, paths, sessionUuid, revalidateLease);
  deps.operationStepDetail(
    "fetch upstream",
    gitSync.beforeRef === gitSync.afterRef
      ? `already at ${paths.project?.baseRef ?? "origin/master"} (${gitSync.afterRef.slice(0, 10)})`
      : `${gitSync.mergedPrs.length} merged PR(s) discovered at ${gitSync.afterRef.slice(0, 10)}`,
  );
  deps.operationStep("update upstream current", gitSync.upstreamWorktreePath ?? gitSync.mainWorktreePath);
  if (gitSync.sessionCurrentWorktreePath ?? gitSync.sessionWorktreePath) {
    deps.operationStep("prepare session current", gitSync.sessionCurrentWorktreePath ?? gitSync.sessionWorktreePath);
  }
  deps.operationStep("discover merged PRs", `${gitSync.mergedPrs.length} merged PR(s)`);
  return gitSync;
}
