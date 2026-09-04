import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import type { SyncMergePolicy } from "@server/core/game-registry/runtime-options.js";
import { runCommand } from "@server/infrastructure/shell/index.js";
import {
  applyScoreMergePolicy,
  policyContestedPaths,
  type PolicyMergeFileLog,
  type PolicyMergeGitRunner,
  type PolicyMergeReports,
} from "../running/epochs/policy-merge.js";

export interface SyncGitResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
}

export type SyncGitRunner = (
  cwd: string,
  args: string[],
  options?: { check?: boolean; failureHint?: string },
) => Promise<SyncGitResult>;

export interface SyncStagingPaths {
  root: string;
  cycleWorktree: string;
}

export interface SyncWorktreeInspection {
  exists: boolean;
  head: string | null;
  path: string;
  mergeInProgress: boolean;
  status: string;
  conflictingPaths: string[];
}

export interface RecursiveRepositoryState {
  path: string;
  head: string;
  expected_head: string;
  head_ref: string | null;
  local_status: string;
}

export interface RecursiveWorktreeState {
  schema_version: 1;
  root_head: string;
  recursive_status: string;
  repositories: RecursiveRepositoryState[];
}

export interface SyncMergeResult {
  status: "clean" | "auto_resolved" | "needs_operator";
  head: string;
  minorConflictsResolved: number;
  autoResolvedPaths: string[];
  conflictingPaths: string[];
  policyMergeFiles: PolicyMergeFileLog[];
}

export const defaultSyncGitRunner: SyncGitRunner = async (cwd, args, options = {}) => {
  const result = await runCommand(cwd, ["git", ...args]);
  if (options.check !== false && result.exitCode !== 0) {
    const hint = options.failureHint ?? `git ${args.join(" ")} failed`;
    throw new Error(`${hint} (${String(result.exitCode)}): ${outputTail(result.stderr || result.stdout || "no output")}`);
  }
  return { exitCode: result.exitCode, stdout: result.stdout, stderr: result.stderr };
};

function outputTail(value: string, limit = 2000): string {
  return value.length <= limit ? value : `...${value.slice(-limit)}`;
}

function safeSyncId(syncId: string): string {
  if (!/^[A-Za-z0-9._-]+$/.test(syncId)) {
    throw new Error(`Sync id is not safe for a staging path: ${syncId}`);
  }
  return syncId;
}

function isWithin(root: string, candidate: string): boolean {
  const child = relative(resolve(root), resolve(candidate));
  return child !== "" && !child.startsWith("..") && !child.startsWith("/");
}

async function checkedGit(
  runner: SyncGitRunner,
  cwd: string,
  args: string[],
  failureHint: string,
): Promise<SyncGitResult> {
  const result = await runner(cwd, args, { failureHint });
  if (result.exitCode !== 0) {
    throw new Error(`${failureHint} (${String(result.exitCode)}): ${outputTail(result.stderr || result.stdout || "no output")}`);
  }
  return result;
}

export function syncStagingPaths(stateDir: string, syncId: string): SyncStagingPaths {
  const root = resolve(stateDir, "sync_staging", safeSyncId(syncId));
  return { root, cycleWorktree: resolve(root, "cycle") };
}

export function syncPrStagingWorktreePath(stateDir: string, syncId: string, branch: string): string {
  const slug = branch.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 72) || "series";
  const suffix = createHash("sha256").update(branch).digest("hex").slice(0, 10);
  return resolve(syncStagingPaths(stateDir, syncId).root, "pr_series", `${slug}-${suffix}`);
}

export async function createDetachedSyncWorktree(input: {
  repoRoot: string;
  worktreePath: string;
  head: string;
  runGit?: SyncGitRunner;
  revalidateLease: () => void;
}): Promise<SyncWorktreeInspection> {
  const runner = input.runGit ?? defaultSyncGitRunner;
  if (existsSync(input.worktreePath)) {
    throw new Error(`Sync staging path already exists: ${input.worktreePath}`);
  }
  mkdirSync(dirname(input.worktreePath), { recursive: true });
  input.revalidateLease();
  await runner(input.repoRoot, ["worktree", "prune"], { check: false });
  input.revalidateLease();
  await checkedGit(
    runner,
    input.repoRoot,
    ["worktree", "add", "--detach", input.worktreePath, input.head],
    `Unable to create sync staging worktree at ${input.worktreePath}`,
  );
  return inspectSyncWorktree({ worktreePath: input.worktreePath, runGit: runner });
}

async function gitPathExists(runner: SyncGitRunner, worktreePath: string, name: string): Promise<boolean> {
  const result = await runner(worktreePath, ["rev-parse", "--git-path", name], { check: false });
  if (result.exitCode !== 0) return false;
  const path = result.stdout.trim();
  return Boolean(path) && existsSync(resolve(worktreePath, path));
}

async function unmergedPaths(runner: SyncGitRunner, worktreePath: string): Promise<string[]> {
  const result = await runner(worktreePath, ["diff", "--name-only", "--diff-filter=U"], { check: false });
  if (result.exitCode !== 0) {
    throw new Error(`Unable to inspect sync conflicts: ${outputTail(result.stderr || result.stdout)}`);
  }
  return [...new Set(result.stdout.split(/\r?\n/).map((path) => path.trim()).filter(Boolean))].sort();
}

function parseGitlinks(output: string): Array<{ path: string; head: string }> {
  const links: Array<{ path: string; head: string }> = [];
  for (const entry of output.split("\0")) {
    if (!entry) continue;
    const match = /^(160000) ([0-9a-f]{40,64}) 0\t(.+)$/.exec(entry);
    if (!match) continue;
    const path = match[3]!;
    if (!path || path === "." || path === ".." || path.startsWith("/") || path.split("/").includes("..")) {
      throw new Error(`Unsafe submodule path in git index: ${path}`);
    }
    links.push({ path, head: match[2]! });
  }
  return links.sort((left, right) => left.path.localeCompare(right.path));
}

async function captureRepositoryState(input: {
  runner: SyncGitRunner;
  repositoryPath: string;
  relativePath: string;
  expectedHead: string;
  seen: Set<string>;
  records: RecursiveRepositoryState[];
}): Promise<void> {
  if (input.seen.has(input.relativePath)) {
    throw new Error(`Duplicate recursive repository path: ${input.relativePath || "."}`);
  }
  input.seen.add(input.relativePath);
  if (!existsSync(resolve(input.repositoryPath, ".git"))) {
    throw new Error(`Required submodule is not initialized: ${input.relativePath || "."}`);
  }
  const [head, headRef, status, links] = await Promise.all([
    checkedGit(input.runner, input.repositoryPath, ["rev-parse", "--verify", "HEAD"], `Unable to read ${input.relativePath || "root"} HEAD`),
    input.runner(input.repositoryPath, ["symbolic-ref", "-q", "HEAD"], { check: false }),
    checkedGit(
      input.runner,
      input.repositoryPath,
      ["status", "--porcelain=v2", "-z", "--untracked-files=all", "--ignore-submodules=all"],
      `Unable to inspect ${input.relativePath || "root"} status`,
    ),
    checkedGit(
      input.runner,
      input.repositoryPath,
      ["ls-files", "--stage", "-z"],
      `Unable to inspect ${input.relativePath || "root"} gitlinks`,
    ),
  ]);
  const resolvedHead = head.stdout.trim();
  input.records.push({
    path: input.relativePath,
    head: resolvedHead,
    expected_head: input.expectedHead,
    head_ref: headRef.exitCode === 0 ? headRef.stdout.trim() || null : null,
    local_status: status.stdout,
  });
  for (const link of parseGitlinks(links.stdout)) {
    const childRelative = input.relativePath ? `${input.relativePath}/${link.path}` : link.path;
    await captureRepositoryState({
      ...input,
      repositoryPath: resolve(input.repositoryPath, link.path),
      relativePath: childRelative,
      expectedHead: link.head,
    });
  }
}

/** Captures root and initialized recursive submodules, including gitlink/checkout agreement. */
export async function captureRecursiveWorktreeState(input: {
  worktreePath: string;
  runGit?: SyncGitRunner;
}): Promise<RecursiveWorktreeState> {
  const runner = input.runGit ?? defaultSyncGitRunner;
  const inspection = await inspectSyncWorktree(input);
  if (!inspection.exists || !inspection.head) throw new Error(`Worktree is missing: ${input.worktreePath}`);
  if (inspection.mergeInProgress || inspection.conflictingPaths.length > 0) {
    throw new Error(`Worktree has an in-progress operation: ${input.worktreePath}`);
  }
  const recursiveStatus = await checkedGit(
    runner,
    input.worktreePath,
    ["status", "--porcelain=v2", "-z", "--untracked-files=all", "--ignore-submodules=none"],
    `Unable to inspect recursive worktree status at ${input.worktreePath}`,
  );
  const records: RecursiveRepositoryState[] = [];
  await captureRepositoryState({
    runner,
    repositoryPath: input.worktreePath,
    relativePath: "",
    expectedHead: inspection.head,
    seen: new Set(),
    records,
  });
  return {
    schema_version: 1,
    root_head: inspection.head,
    recursive_status: recursiveStatus.stdout,
    repositories: records.sort((left, right) => left.path.localeCompare(right.path)),
  };
}

export function assertRecursiveWorktreeClean(state: RecursiveWorktreeState, label: string): void {
  if (state.recursive_status) throw new Error(`${label} has recursive worktree changes`);
  for (const repository of state.repositories) {
    if (repository.local_status) throw new Error(`${label} has local changes in ${repository.path || "."}`);
    if (repository.head !== repository.expected_head) {
      throw new Error(
        `${label} submodule ${repository.path || "."} is at ${repository.head}, expected ${repository.expected_head}`,
      );
    }
  }
}

function comparableRecursiveState(state: RecursiveWorktreeState): unknown {
  return {
    schema_version: state.schema_version,
    root_head: state.root_head,
    recursive_status: state.recursive_status,
    repositories: state.repositories.map(({ path, head, expected_head, local_status }) => ({
      path,
      head,
      expected_head,
      local_status,
    })),
  };
}

export function recursiveWorktreeStatesEqual(left: RecursiveWorktreeState, right: RecursiveWorktreeState): boolean {
  return JSON.stringify(comparableRecursiveState(left)) === JSON.stringify(comparableRecursiveState(right));
}

export function recursiveSubmodulePointers(state: RecursiveWorktreeState): Array<{
  path: string;
  gitlink_head: string;
  checked_out_head: string;
}> {
  return state.repositories
    .filter((repository) => repository.path)
    .map((repository) => ({
      path: repository.path,
      gitlink_head: repository.expected_head,
      checked_out_head: repository.head,
    }));
}

export async function initializeSyncWorktreeSubmodules(input: {
  worktreePath: string;
  runGit?: SyncGitRunner;
}): Promise<void> {
  const runner = input.runGit ?? defaultSyncGitRunner;
  await checkedGit(
    runner,
    input.worktreePath,
    ["submodule", "update", "--init", "--recursive", "--checkout"],
    `Unable to initialize sync staging submodules at ${input.worktreePath}`,
  );
}

export async function inspectSyncWorktree(input: {
  worktreePath: string;
  runGit?: SyncGitRunner;
}): Promise<SyncWorktreeInspection> {
  const runner = input.runGit ?? defaultSyncGitRunner;
  if (!existsSync(resolve(input.worktreePath, ".git"))) {
    return {
      exists: false,
      head: null,
      path: input.worktreePath,
      mergeInProgress: false,
      status: "",
      conflictingPaths: [],
    };
  }
  const [head, status, conflicts, mergeHead] = await Promise.all([
    runner(input.worktreePath, ["rev-parse", "--verify", "HEAD"], { check: false }),
    runner(input.worktreePath, ["status", "--porcelain=v1", "--untracked-files=all"], { check: false }),
    unmergedPaths(runner, input.worktreePath),
    gitPathExists(runner, input.worktreePath, "MERGE_HEAD"),
  ]);
  if (head.exitCode !== 0 || status.exitCode !== 0) {
    throw new Error(`Unable to inspect sync worktree ${input.worktreePath}: ${outputTail(head.stderr || status.stderr)}`);
  }
  return {
    exists: true,
    head: head.stdout.trim(),
    path: input.worktreePath,
    mergeInProgress: mergeHead,
    status: status.stdout,
    conflictingPaths: conflicts,
  };
}

function listedWorktreePaths(output: string): string[] {
  return output
    .split(/\r?\n/)
    .filter((line) => line.startsWith("worktree "))
    .map((line) => line.slice("worktree ".length).trim())
    .filter(Boolean);
}

export async function discardSyncStaging(input: {
  repoRoot: string;
  stateDir: string;
  syncId: string;
  runGit?: SyncGitRunner;
  revalidateLease: () => void;
}): Promise<{ discarded: boolean; workspaceId: string }> {
  const runner = input.runGit ?? defaultSyncGitRunner;
  const paths = syncStagingPaths(input.stateDir, input.syncId);
  input.revalidateLease();
  const list = await runner(input.repoRoot, ["worktree", "list", "--porcelain"], { check: false });
  if (list.exitCode !== 0) {
    throw new Error(`Unable to list worktrees before sync discard: ${outputTail(list.stderr || list.stdout)}`);
  }
  const registered = listedWorktreePaths(list.stdout)
    .filter((path) => isWithin(paths.root, path))
    .sort((left, right) => right.length - left.length);
  for (const path of registered) {
    input.revalidateLease();
    await checkedGit(runner, input.repoRoot, ["worktree", "remove", "--force", path], `Unable to discard sync worktree ${path}`);
  }
  const discarded = existsSync(paths.root) || registered.length > 0;
  if (existsSync(paths.root)) rmSync(paths.root, { recursive: true, force: true });
  input.revalidateLease();
  await runner(input.repoRoot, ["worktree", "prune"], { check: false });
  return { discarded, workspaceId: input.syncId };
}

/** Aborts any in-progress merge and removes one staged worktree.
 *
 * Used when a staged PR-series workspace becomes moot (its series merged or
 * closed upstream while the sync was blocked). Mirrors discardSyncStaging's
 * cleanup — `git worktree remove --force` from the repo root with an rm -rf
 * fallback plus a prune — but scoped to a single workspace and tolerant of a
 * workspace that is not mid-merge or already gone. */
export async function abortAndRemoveSyncWorktree(input: {
  repoRoot: string;
  worktreePath: string;
  runGit?: SyncGitRunner;
}): Promise<void> {
  const runner = input.runGit ?? defaultSyncGitRunner;
  if (existsSync(resolve(input.worktreePath, ".git"))) {
    await runner(input.worktreePath, ["merge", "--abort"], { check: false });
  }
  const removed = await runner(
    input.repoRoot,
    ["worktree", "remove", "--force", input.worktreePath],
    { check: false },
  );
  if (removed.exitCode !== 0 && existsSync(input.worktreePath)) {
    rmSync(input.worktreePath, { recursive: true, force: true });
  }
  await runner(input.repoRoot, ["worktree", "prune"], { check: false });
}

function normalizedMechanicalText(value: string): string {
  return value.replace(/\s+/g, "");
}

export function resolveTrivialConflictMarkers(content: string): { content: string; resolved: number } | null {
  const lines = content.split(/(?<=\n)/);
  const output: string[] = [];
  let resolved = 0;
  for (let index = 0; index < lines.length;) {
    if (!lines[index]!.startsWith("<<<<<<< ")) {
      output.push(lines[index]!);
      index += 1;
      continue;
    }
    const divider = lines.findIndex((line, candidate) => candidate > index && line.startsWith("======="));
    const end = lines.findIndex((line, candidate) => candidate > divider && line.startsWith(">>>>>>> "));
    if (divider < 0 || end < 0) return null;
    const current = lines.slice(index + 1, divider).join("");
    const incoming = lines.slice(divider + 1, end).join("");
    if (normalizedMechanicalText(current) !== normalizedMechanicalText(incoming)) return null;
    // Either side is equivalent after whitespace normalization. Keep incoming
    // so the mechanical resolution agrees with the upstream merge direction.
    output.push(incoming);
    resolved += 1;
    index = end + 1;
  }
  return resolved > 0 ? { content: output.join(""), resolved } : null;
}

export function hasConflictMarkers(content: string): boolean {
  return /^(?:<<<<<<< |=======\s*$|>>>>>>> )/m.test(content);
}

async function tryResolveMechanicalConflicts(
  runner: SyncGitRunner,
  worktreePath: string,
  paths: string[],
): Promise<string[]> {
  const resolvedPaths: string[] = [];
  for (const path of paths) {
    const absolutePath = resolve(worktreePath, path);
    if (!existsSync(absolutePath)) continue;
    const resolved = resolveTrivialConflictMarkers(readFileSync(absolutePath, "utf8"));
    if (!resolved) continue;
    writeFileSync(absolutePath, resolved.content, "utf8");
    await checkedGit(runner, worktreePath, ["add", "--", path], `Unable to stage mechanical sync resolution for ${path}`);
    resolvedPaths.push(path);
  }
  return resolvedPaths;
}

function policyGitRunner(runner: SyncGitRunner): PolicyMergeGitRunner {
  return (worktreePath, args) => runner(worktreePath, args, { check: false });
}

async function changedPaths(
  runner: SyncGitRunner,
  worktreePath: string,
  fromRevision: string,
  toRevision: string,
): Promise<string[]> {
  const changed = await checkedGit(
    runner,
    worktreePath,
    ["diff", "--name-only", "-z", fromRevision, toRevision],
    `Unable to inspect sync merge changes from ${fromRevision} to ${toRevision}`,
  );
  return [...new Set(changed.stdout.split("\0").filter(Boolean))].sort();
}

async function syncHead(runner: SyncGitRunner, worktreePath: string): Promise<string> {
  return (await checkedGit(
    runner,
    worktreePath,
    ["rev-parse", "--verify", "HEAD"],
    "Unable to resolve staged sync HEAD",
  )).stdout.trim();
}

const DEFAULT_POLICY_INPUTS: PolicyMergeReports = {
  ours: {},
  upstream: {},
  scoreMode: "upstream-diff-fallback",
  upstreamReportFallbackReason: "operator sync policy reports unavailable",
};

export async function mergeSyncWorktree(input: {
  worktreePath: string;
  newBase: string;
  mergePolicy?: SyncMergePolicy;
  policyInputs?: PolicyMergeReports;
  runGit?: SyncGitRunner;
  revalidateLease: () => void;
}): Promise<SyncMergeResult> {
  const runner = input.runGit ?? defaultSyncGitRunner;
  const mergePolicy = input.mergePolicy ?? "score";
  const oursRevision = await syncHead(runner, input.worktreePath);
  const baseRevision = (await checkedGit(
    runner,
    input.worktreePath,
    ["merge-base", oursRevision, input.newBase],
    `Unable to identify the sync merge base for ${input.newBase}`,
  )).stdout.trim();
  const [upstreamChangedFiles, locallyChangedFiles] = await Promise.all([
    changedPaths(runner, input.worktreePath, baseRevision, input.newBase),
    changedPaths(runner, input.worktreePath, baseRevision, oursRevision),
  ]);
  input.revalidateLease();
  const mergeArgs = [
    "merge",
    "--no-ff",
    "--no-edit",
    "--no-commit",
    ...(mergePolicy === "theirs" ? ["-X", "theirs"] : []),
    input.newBase,
  ];
  const started = await runner(input.worktreePath, mergeArgs, { check: false });
  const mergeInProgress = await gitPathExists(runner, input.worktreePath, "MERGE_HEAD");
  if (!mergeInProgress) {
    if (started.exitCode !== 0) {
      throw new Error(`Staged merge failed without MERGE_HEAD: ${outputTail(started.stderr || started.stdout || "no output")}`);
    }
    return {
      status: "clean",
      head: await syncHead(runner, input.worktreePath),
      minorConflictsResolved: 0,
      autoResolvedPaths: [],
      conflictingPaths: [],
      policyMergeFiles: [],
    };
  }

  let minorConflictsResolved = 0;
  let autoResolvedPaths: string[] = [];
  let policyMergeFiles: PolicyMergeFileLog[] = [];
  try {
    const initialConflicts = await unmergedPaths(runner, input.worktreePath);
    autoResolvedPaths = await tryResolveMechanicalConflicts(runner, input.worktreePath, initialConflicts);
    minorConflictsResolved = autoResolvedPaths.length;

    if (mergePolicy === "score" && policyContestedPaths({ upstreamChangedFiles, locallyChangedFiles }).length > 0) {
      const applied = await applyScoreMergePolicy({
        worktreePath: input.worktreePath,
        baseRevision,
        oursRevision,
        upstreamRevision: input.newBase,
        upstreamChangedFiles,
        locallyChangedFiles,
        reports: input.policyInputs ?? DEFAULT_POLICY_INPUTS,
        runGit: policyGitRunner(runner),
      });
      policyMergeFiles = applied.files;
      if (applied.rewrittenPaths.length > 0) {
        await checkedGit(
          runner,
          input.worktreePath,
          ["add", "--", ...applied.rewrittenPaths],
          "Unable to stage score-policy sync merge results",
        );
      }
    }

    const conflictingPaths = await unmergedPaths(runner, input.worktreePath);
    if (conflictingPaths.length > 0) {
      return {
        status: "needs_operator",
        head: await syncHead(runner, input.worktreePath),
        minorConflictsResolved,
        autoResolvedPaths,
        conflictingPaths,
        policyMergeFiles,
      };
    }
    input.revalidateLease();
    await checkedGit(runner, input.worktreePath, ["commit", "--no-edit"], "Unable to commit staged sync merge");
    return {
      status: started.exitCode === 0 && minorConflictsResolved === 0 ? "clean" : "auto_resolved",
      head: await syncHead(runner, input.worktreePath),
      minorConflictsResolved,
      autoResolvedPaths,
      conflictingPaths: [],
      policyMergeFiles,
    };
  } catch (error) {
    await runner(input.worktreePath, ["merge", "--abort"], { check: false });
    throw error;
  }
}

export async function continueSyncMergeAfterOperator(input: {
  worktreePath: string;
  expectedConflictPaths: string[];
  runGit?: SyncGitRunner;
  revalidateLease: () => void;
}): Promise<SyncMergeResult> {
  const runner = input.runGit ?? defaultSyncGitRunner;
  const inspection = await inspectSyncWorktree({ worktreePath: input.worktreePath, runGit: runner });
  if (!inspection.mergeInProgress) throw new Error(`No merge is in progress at ${input.worktreePath}`);
  for (const path of input.expectedConflictPaths) {
    const absolutePath = resolve(input.worktreePath, path);
    if (existsSync(absolutePath) && hasConflictMarkers(readFileSync(absolutePath, "utf8"))) {
      throw new Error(`Conflict markers remain in ${path}`);
    }
  }
  input.revalidateLease();
  await checkedGit(
    runner,
    input.worktreePath,
    ["add", "-A", "--", ...input.expectedConflictPaths],
    "Unable to stage the operator's sync conflict resolution",
  );
  const remaining = await unmergedPaths(runner, input.worktreePath);
  if (remaining.length > 0) {
    throw new Error(`Operator resolution is incomplete; unmerged paths remain: ${remaining.join(", ")}`);
  }
  input.revalidateLease();
  await checkedGit(runner, input.worktreePath, ["commit", "--no-edit"], "Unable to commit the operator's sync merge resolution");
  return {
    status: "clean",
    head: await syncHead(runner, input.worktreePath),
    minorConflictsResolved: 0,
    autoResolvedPaths: [],
    conflictingPaths: [],
    policyMergeFiles: [],
  };
}
