import { existsSync, mkdirSync, readdirSync, statSync, symlinkSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  outputTail,
  type JsonObject,
  type PreparingRuntimeDeps,
  type PreparingRuntimeProjectContext,
} from "../runtime-shared.js";
import type { DispatchLeaseRevalidator } from "@server/core/session-runtime/dispatch-guard";

export interface PrepareWorktreePaths {
  mainWorktreePath: string;
  upstreamWorktreePath: string;
  sessionBranch?: string;
  sessionCurrentWorktreePath?: string;
  sessionRootPath?: string;
  sessionWorktreePath?: string;
  worktreesRoot: string;
}

export interface PrepareWorktreeResult extends PrepareWorktreePaths {
  linkedAssets: number;
  steps: JsonObject[];
}

interface GitWorktreeEntry {
  branch: string;
  head: string;
  path: string;
  prunable: boolean;
}

function projectDir(paths: PreparingRuntimeProjectContext): string {
  return paths.project?.projectDir ?? dirname(paths.repoRoot);
}

function safeSessionBranch(sessionUuid: string): string {
  return `orchestrator/session/${sessionUuid.replace(/[^A-Za-z0-9_.-]+/g, "-")}`;
}

export function prepareWorktreePaths(paths: PreparingRuntimeProjectContext, sessionUuid = ""): PrepareWorktreePaths {
  const worktreesRoot = resolve(projectDir(paths), "worktrees");
  const upstreamWorktreePath = resolve(worktreesRoot, "upstream-current");
  if (!sessionUuid) {
    return {
      mainWorktreePath: upstreamWorktreePath,
      upstreamWorktreePath,
      worktreesRoot,
    };
  }
  const sessionRootPath = resolve(worktreesRoot, "sessions", sessionUuid);
  const sessionCurrentWorktreePath = resolve(sessionRootPath, "current");
  return {
    mainWorktreePath: upstreamWorktreePath,
    sessionBranch: safeSessionBranch(sessionUuid),
    sessionCurrentWorktreePath,
    sessionRootPath,
    sessionWorktreePath: sessionCurrentWorktreePath,
    upstreamWorktreePath,
    worktreesRoot,
  };
}

function linkMissingFiles(sourceDir: string, targetDir: string): number {
  let linked = 0;
  mkdirSync(targetDir, { recursive: true });
  for (const entry of readdirSync(sourceDir)) {
    const sourcePath = resolve(sourceDir, entry);
    const targetPath = resolve(targetDir, entry);
    if (statSync(sourcePath).isDirectory()) {
      linked += linkMissingFiles(sourcePath, targetPath);
    } else if (!existsSync(targetPath)) {
      symlinkSync(sourcePath, targetPath);
      linked += 1;
    }
  }
  return linked;
}

function linkGameAssets(repoRoot: string, worktreePath: string): number {
  const origSource = resolve(repoRoot, "orig");
  if (!existsSync(origSource)) return 0;
  return linkMissingFiles(origSource, resolve(worktreePath, "orig"));
}

function parseGitWorktreeList(output: string): GitWorktreeEntry[] {
  const entries: GitWorktreeEntry[] = [];
  let current: Partial<GitWorktreeEntry> = {};
  const pushCurrent = () => {
    if (current.path) {
      entries.push({
        branch: current.branch ?? "",
        head: current.head ?? "",
        path: current.path,
        prunable: current.prunable ?? false,
      });
    }
    current = {};
  };

  for (const line of output.split(/\r?\n/)) {
    if (!line.trim()) {
      pushCurrent();
      continue;
    }
    const space = line.indexOf(" ");
    const key = space === -1 ? line : line.slice(0, space);
    const value = space === -1 ? "" : line.slice(space + 1);
    if (key === "worktree") current.path = value;
    else if (key === "HEAD") current.head = value;
    else if (key === "branch") current.branch = value;
    else if (key === "prunable") current.prunable = true;
  }
  pushCurrent();
  return entries;
}

async function listedWorktreeForBranch(
  deps: PreparingRuntimeDeps,
  paths: PreparingRuntimeProjectContext,
  branch: string,
  steps: JsonObject[],
  revalidateLease?: DispatchLeaseRevalidator,
): Promise<GitWorktreeEntry | null> {
  revalidateLease?.();
  await deps.runGit(paths.repoRoot, ["worktree", "prune"], { check: false });
  const list = await deps.runGit(paths.repoRoot, ["worktree", "list", "--porcelain"], { check: false });
  steps.push({
    name: "list_worktrees",
    command: ["git", "worktree", "list", "--porcelain"],
    exitCode: list.exitCode,
    stdout: outputTail(list.stdout, 4000),
    stderr: outputTail(list.stderr, 2000),
  });
  if (list.exitCode !== 0) {
    throw new Error(`Unable to inspect existing worktrees: ${outputTail(list.stderr || list.stdout, 2000)}`);
  }
  const ref = `refs/heads/${branch}`;
  return parseGitWorktreeList(list.stdout).find((entry) => entry.branch === ref && !entry.prunable) ?? null;
}

async function branchExists(
  deps: PreparingRuntimeDeps,
  paths: PreparingRuntimeProjectContext,
  branch: string,
  steps: JsonObject[],
): Promise<boolean> {
  const verify = await deps.runGit(paths.repoRoot, ["show-ref", "--verify", "--quiet", `refs/heads/${branch}`], { check: false });
  steps.push({
    name: "verify_session_branch",
    command: ["git", "show-ref", "--verify", "--quiet", `refs/heads/${branch}`],
    exitCode: verify.exitCode,
    stdout: outputTail(verify.stdout, 2000),
    stderr: outputTail(verify.stderr, 2000),
  });
  if (verify.exitCode === 0) return true;
  if (verify.exitCode === 1) return false;
  throw new Error(`Unable to inspect session branch ${branch}: ${outputTail(verify.stderr || verify.stdout, 2000)}`);
}

async function assertExistingBranchCanFastForward(
  deps: PreparingRuntimeDeps,
  paths: PreparingRuntimeProjectContext,
  branch: string,
  sha: string,
  steps: JsonObject[],
): Promise<void> {
  const head = await deps.runGit(paths.repoRoot, ["rev-parse", "--verify", branch], { check: false });
  steps.push({
    name: "read_existing_session_branch_head",
    command: ["git", "rev-parse", "--verify", branch],
    exitCode: head.exitCode,
    stdout: outputTail(head.stdout, 2000),
    stderr: outputTail(head.stderr, 2000),
  });
  if (head.exitCode !== 0) {
    throw new Error(`Unable to inspect existing session branch ${branch}: ${outputTail(head.stderr || head.stdout, 2000)}`);
  }
  const currentSha = head.stdout.trim();
  if (currentSha === sha) return;

  const ancestor = await deps.runGit(paths.repoRoot, ["merge-base", "--is-ancestor", currentSha, sha], { check: false });
  steps.push({
    name: "existing_session_branch_ff_check",
    command: ["git", "merge-base", "--is-ancestor", currentSha, sha],
    exitCode: ancestor.exitCode,
    stdout: outputTail(ancestor.stdout, 2000),
    stderr: outputTail(ancestor.stderr, 2000),
  });
  if (ancestor.exitCode !== 0) {
    throw new Error(`Existing session branch ${branch} at ${currentSha.slice(0, 10)} cannot fast-forward to requested baseline ${sha.slice(0, 10)}.`);
  }
}

async function assertCleanExistingWorktree(
  deps: PreparingRuntimeDeps,
  worktreePath: string,
  label: string,
): Promise<void> {
  if (!existsSync(resolve(worktreePath, ".git"))) return;
  const status = await deps.runGit(worktreePath, ["status", "--porcelain"], { check: false });
  if (status.exitCode !== 0) {
    throw new Error(`Unable to inspect ${label} worktree at ${worktreePath}: ${outputTail(status.stderr || status.stdout, 1500)}`);
  }
  if (status.stdout.trim()) {
    throw new Error(`${label} worktree has local changes at ${worktreePath}. Commit, move, or remove that worktree before syncing the session baseline.`);
  }
}

async function ensureWorktreeAtSessionSha(
  deps: PreparingRuntimeDeps,
  worktreePath: string,
  branch: string,
  sha: string,
  steps: JsonObject[],
  stepPrefix: string,
  revalidateLease?: DispatchLeaseRevalidator,
): Promise<void> {
  await assertCleanExistingWorktree(deps, worktreePath, "session current");
  const head = await deps.runGit(worktreePath, ["rev-parse", "--verify", "HEAD"], { check: false });
  steps.push({
    name: `${stepPrefix}_session_worktree_head`,
    command: ["git", "rev-parse", "--verify", "HEAD"],
    cwd: worktreePath,
    exitCode: head.exitCode,
    stdout: outputTail(head.stdout, 2000),
    stderr: outputTail(head.stderr, 2000),
  });
  if (head.exitCode !== 0) {
    throw new Error(`Unable to inspect session current worktree at ${worktreePath}: ${outputTail(head.stderr || head.stdout, 2000)}`);
  }
  const currentSha = head.stdout.trim();
  if (currentSha === sha) return;

  const ancestor = await deps.runGit(worktreePath, ["merge-base", "--is-ancestor", currentSha, sha], { check: false });
  steps.push({
    name: `${stepPrefix}_session_branch_ff_check`,
    command: ["git", "merge-base", "--is-ancestor", currentSha, sha],
    cwd: worktreePath,
    exitCode: ancestor.exitCode,
    stdout: outputTail(ancestor.stdout, 2000),
    stderr: outputTail(ancestor.stderr, 2000),
  });
  if (ancestor.exitCode !== 0) {
    throw new Error(`Session branch ${branch} is checked out at ${worktreePath} but ${currentSha.slice(0, 10)} cannot fast-forward to requested baseline ${sha.slice(0, 10)}.`);
  }

  revalidateLease?.();
  const merge = await deps.runGit(worktreePath, ["merge", "--ff-only", sha], { check: false });
  steps.push({
    name: `${stepPrefix}_fast_forward_session_branch`,
    command: ["git", "merge", "--ff-only", sha],
    cwd: worktreePath,
    exitCode: merge.exitCode,
    stdout: outputTail(merge.stdout, 2000),
    stderr: outputTail(merge.stderr, 2000),
  });
  if (merge.exitCode !== 0) {
    throw new Error(`Unable to fast-forward session branch ${branch} to ${sha.slice(0, 10)}: ${outputTail(merge.stderr || merge.stdout, 2000)}`);
  }
}

async function ensureDetachedWorktree(
  deps: PreparingRuntimeDeps,
  paths: PreparingRuntimeProjectContext,
  worktreePath: string,
  sha: string,
  label: string,
  revalidateLease?: DispatchLeaseRevalidator,
): Promise<{ linkedAssets: number; steps: JsonObject[] }> {
  const steps: JsonObject[] = [];
  mkdirSync(dirname(worktreePath), { recursive: true });
  if (!existsSync(resolve(worktreePath, ".git"))) {
    if (existsSync(worktreePath)) {
      throw new Error(`${label} worktree path exists but is not a Git worktree: ${worktreePath}`);
    }
    revalidateLease?.();
    await deps.runGit(paths.repoRoot, ["worktree", "prune"], { check: false });
    revalidateLease?.();
    const add = await deps.runGit(paths.repoRoot, ["worktree", "add", "--detach", worktreePath, sha], { check: false });
    steps.push({
      name: `add_${label}_worktree`,
      command: ["git", "worktree", "add", "--detach", worktreePath, sha],
      exitCode: add.exitCode,
      stdout: outputTail(add.stdout, 2000),
      stderr: outputTail(add.stderr, 2000),
    });
    if (add.exitCode !== 0) {
      throw new Error(`Unable to create ${label} worktree (${add.exitCode ?? "signal"}): ${outputTail(add.stderr || add.stdout, 2000)}`);
    }
  } else {
    await assertCleanExistingWorktree(deps, worktreePath, label);
    revalidateLease?.();
    const checkout = await deps.runGit(worktreePath, ["checkout", "--detach", sha], { check: false });
    steps.push({
      name: `checkout_${label}_worktree`,
      command: ["git", "checkout", "--detach", sha],
      cwd: worktreePath,
      exitCode: checkout.exitCode,
      stdout: outputTail(checkout.stdout, 2000),
      stderr: outputTail(checkout.stderr, 2000),
    });
    if (checkout.exitCode !== 0) {
      throw new Error(`Unable to update ${label} worktree (${checkout.exitCode ?? "signal"}): ${outputTail(checkout.stderr || checkout.stdout, 2000)}`);
    }
  }
  return { linkedAssets: linkGameAssets(paths.repoRoot, worktreePath), steps };
}

async function ensureSessionWorktree(
  deps: PreparingRuntimeDeps,
  paths: PreparingRuntimeProjectContext,
  worktreePath: string,
  branch: string,
  sha: string,
  revalidateLease?: DispatchLeaseRevalidator,
): Promise<{ linkedAssets: number; steps: JsonObject[]; worktreePath: string }> {
  const steps: JsonObject[] = [];
  mkdirSync(dirname(worktreePath), { recursive: true });
  if (existsSync(resolve(worktreePath, ".git"))) {
    await ensureWorktreeAtSessionSha(deps, worktreePath, branch, sha, steps, "reuse", revalidateLease);
    steps.push({
      name: "reuse_session_worktree",
      worktreePath,
    });
    return { linkedAssets: linkGameAssets(paths.repoRoot, worktreePath), steps, worktreePath };
  }

  if (!existsSync(resolve(worktreePath, ".git"))) {
    if (existsSync(worktreePath)) {
      throw new Error(`Session current worktree path exists but is not a Git worktree: ${worktreePath}`);
    }
    const existing = await listedWorktreeForBranch(deps, paths, branch, steps, revalidateLease);
    if (existing?.path) {
      if (!existsSync(resolve(existing.path, ".git"))) {
        throw new Error(`Session branch ${branch} is already registered at ${existing.path}, but that path is not a usable Git worktree.`);
      }
      await ensureWorktreeAtSessionSha(deps, existing.path, branch, sha, steps, "reuse_existing", revalidateLease);
      steps.push({
        name: "reuse_existing_session_branch_worktree",
        branch,
        worktreePath: existing.path,
      });
      return { linkedAssets: linkGameAssets(paths.repoRoot, existing.path), steps, worktreePath: existing.path };
    }

    const branchAlreadyExists = await branchExists(deps, paths, branch, steps);
    if (branchAlreadyExists) {
      await assertExistingBranchCanFastForward(deps, paths, branch, sha, steps);
    }
    const addArgs = branchAlreadyExists
      ? ["worktree", "add", worktreePath, branch]
      : ["worktree", "add", "-b", branch, worktreePath, sha];
    revalidateLease?.();
    const add = await deps.runGit(paths.repoRoot, addArgs, { check: false });
    steps.push({
      name: "add_session_worktree",
      command: ["git", ...addArgs],
      exitCode: add.exitCode,
      stdout: outputTail(add.stdout, 2000),
      stderr: outputTail(add.stderr, 2000),
    });
    if (add.exitCode !== 0) {
      throw new Error(`Unable to create session worktree (${add.exitCode ?? "signal"}): ${outputTail(add.stderr || add.stdout, 2000)}`);
    }
    await ensureWorktreeAtSessionSha(deps, worktreePath, branch, sha, steps, branchAlreadyExists ? "attached_existing" : "created", revalidateLease);
  }
  return { linkedAssets: linkGameAssets(paths.repoRoot, worktreePath), steps, worktreePath };
}

export async function ensurePrepareWorktrees(
  deps: PreparingRuntimeDeps,
  paths: PreparingRuntimeProjectContext,
  baseSha: string,
  sessionUuid = "",
  revalidateLease?: DispatchLeaseRevalidator,
): Promise<PrepareWorktreeResult> {
  const locations = prepareWorktreePaths(paths, sessionUuid);
  const main = await ensureDetachedWorktree(deps, paths, locations.upstreamWorktreePath, baseSha, "upstream_current", revalidateLease);
  const steps = [...main.steps];
  let linkedAssets = main.linkedAssets;
  if (locations.sessionCurrentWorktreePath && locations.sessionBranch) {
    const session = await ensureSessionWorktree(deps, paths, locations.sessionCurrentWorktreePath, locations.sessionBranch, baseSha, revalidateLease);
    steps.push(...session.steps);
    linkedAssets += session.linkedAssets;
    locations.sessionCurrentWorktreePath = session.worktreePath;
    locations.sessionWorktreePath = session.worktreePath;
  }
  return { ...locations, linkedAssets, steps };
}
