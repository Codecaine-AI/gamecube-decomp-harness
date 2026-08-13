import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { runCommand } from "@server/infrastructure/shell/index.js";

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
  sessionWorktree: string;
}

export interface SyncWorktreeInspection {
  exists: boolean;
  head: string | null;
  path: string;
  rebaseInProgress: boolean;
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

export interface SyncRebaseResult {
  status: "clean" | "auto_resolved" | "needs_operator";
  head: string;
  commitsTotal: number;
  commitsApplied: number;
  minorConflictsResolved: number;
  autoResolvedPaths: string[];
  conflictingPaths: string[];
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
  return { root, sessionWorktree: resolve(root, "session") };
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
  if (inspection.rebaseInProgress || inspection.conflictingPaths.length > 0) {
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
      rebaseInProgress: false,
      status: "",
      conflictingPaths: [],
    };
  }
  const [head, status, conflicts, rebaseMerge, rebaseApply] = await Promise.all([
    runner(input.worktreePath, ["rev-parse", "--verify", "HEAD"], { check: false }),
    runner(input.worktreePath, ["status", "--porcelain=v1", "--untracked-files=all"], { check: false }),
    unmergedPaths(runner, input.worktreePath),
    gitPathExists(runner, input.worktreePath, "rebase-merge"),
    gitPathExists(runner, input.worktreePath, "rebase-apply"),
  ]);
  if (head.exitCode !== 0 || status.exitCode !== 0) {
    throw new Error(`Unable to inspect sync worktree ${input.worktreePath}: ${outputTail(head.stderr || status.stderr)}`);
  }
  return {
    exists: true,
    head: head.stdout.trim(),
    path: input.worktreePath,
    rebaseInProgress: rebaseMerge || rebaseApply,
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
    // During rebase, the incoming side is the session commit being replayed.
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

async function rebaseCommitCounts(
  runner: SyncGitRunner,
  worktreePath: string,
  newBase: string,
  total: number,
): Promise<{ applied: number; head: string }> {
  const [head, applied] = await Promise.all([
    checkedGit(runner, worktreePath, ["rev-parse", "--verify", "HEAD"], "Unable to resolve staged sync HEAD"),
    runner(worktreePath, ["rev-list", "--count", `${newBase}..HEAD`], { check: false }),
  ]);
  const count = applied.exitCode === 0 ? Number.parseInt(applied.stdout.trim(), 10) : 0;
  return { applied: Math.min(total, Number.isFinite(count) ? count : 0), head: head.stdout.trim() };
}

async function advanceRebase(input: {
  runner: SyncGitRunner;
  worktreePath: string;
  newBase: string;
  total: number;
  initialResult: SyncGitResult;
  revalidateLease: () => void;
}): Promise<SyncRebaseResult> {
  let command = input.initialResult;
  let minorConflictsResolved = 0;
  const autoResolvedPaths: string[] = [];
  for (let attempts = 0; attempts < input.total + 100; attempts += 1) {
    if (command.exitCode === 0) {
      const counts = await rebaseCommitCounts(input.runner, input.worktreePath, input.newBase, input.total);
      return {
        status: minorConflictsResolved > 0 ? "auto_resolved" : "clean",
        head: counts.head,
        commitsTotal: input.total,
        commitsApplied: input.total,
        minorConflictsResolved,
        autoResolvedPaths,
        conflictingPaths: [],
      };
    }
    const conflicts = await unmergedPaths(input.runner, input.worktreePath);
    if (conflicts.length === 0) {
      throw new Error(`Staged rebase failed without unmerged paths: ${outputTail(command.stderr || command.stdout || "no output")}`);
    }
    const resolved = await tryResolveMechanicalConflicts(input.runner, input.worktreePath, conflicts);
    minorConflictsResolved += resolved.length;
    autoResolvedPaths.push(...resolved);
    const remaining = await unmergedPaths(input.runner, input.worktreePath);
    if (remaining.length > 0) {
      const counts = await rebaseCommitCounts(input.runner, input.worktreePath, input.newBase, input.total);
      return {
        status: "needs_operator",
        head: counts.head,
        commitsTotal: input.total,
        commitsApplied: counts.applied,
        minorConflictsResolved,
        autoResolvedPaths,
        conflictingPaths: remaining,
      };
    }
    input.revalidateLease();
    const staged = await input.runner(input.worktreePath, ["diff", "--cached", "--quiet"], { check: false });
    const nextArgs = staged.exitCode === 0 ? ["rebase", "--skip"] : ["-c", "core.editor=true", "rebase", "--continue"];
    command = await input.runner(input.worktreePath, nextArgs, { check: false });
  }
  throw new Error(`Staged rebase exceeded its bounded continuation count (${input.total + 100})`);
}

export async function rebaseSyncWorktree(input: {
  worktreePath: string;
  oldBase: string;
  newBase: string;
  runGit?: SyncGitRunner;
  revalidateLease: () => void;
}): Promise<SyncRebaseResult> {
  const runner = input.runGit ?? defaultSyncGitRunner;
  const count = await checkedGit(
    runner,
    input.worktreePath,
    ["rev-list", "--count", `${input.oldBase}..HEAD`],
    `Unable to count staged commits after ${input.oldBase}`,
  );
  const total = Number.parseInt(count.stdout.trim(), 10);
  if (!Number.isFinite(total)) throw new Error(`Invalid staged commit count: ${count.stdout.trim()}`);
  input.revalidateLease();
  const start = await runner(input.worktreePath, ["rebase", "--onto", input.newBase, input.oldBase], { check: false });
  return advanceRebase({
    runner,
    worktreePath: input.worktreePath,
    newBase: input.newBase,
    total,
    initialResult: start,
    revalidateLease: input.revalidateLease,
  });
}

export async function continueSyncRebaseAfterOperator(input: {
  worktreePath: string;
  expectedConflictPaths: string[];
  newBase: string;
  commitsTotal: number;
  runGit?: SyncGitRunner;
  revalidateLease: () => void;
}): Promise<SyncRebaseResult> {
  const runner = input.runGit ?? defaultSyncGitRunner;
  const inspection = await inspectSyncWorktree({ worktreePath: input.worktreePath, runGit: runner });
  if (!inspection.rebaseInProgress) throw new Error(`No rebase is in progress at ${input.worktreePath}`);
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
  const staged = await runner(input.worktreePath, ["diff", "--cached", "--quiet"], { check: false });
  const args = staged.exitCode === 0 ? ["rebase", "--skip"] : ["-c", "core.editor=true", "rebase", "--continue"];
  const continued = await runner(input.worktreePath, args, { check: false });
  return advanceRebase({
    runner,
    worktreePath: input.worktreePath,
    newBase: input.newBase,
    total: input.commitsTotal,
    initialResult: continued,
    revalidateLease: input.revalidateLease,
  });
}
