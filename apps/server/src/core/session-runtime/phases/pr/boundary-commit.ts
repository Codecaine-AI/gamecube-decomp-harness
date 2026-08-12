import { relative } from "node:path";
import type { CliResult } from "@server/infrastructure/shell/ui-command-runner";
import type { DispatchLeaseRevalidator } from "@server/core/session-runtime/dispatch-guard";

export const COMMIT_EXCLUDES = ["decomp-orchestrator", ".decomp-orchestrator-state"] as const;

export type BoundaryGitRunner = (
  repoRoot: string,
  args: string[],
  options?: { check?: boolean; failureHint?: string },
) => Promise<CliResult>;

export interface BoundaryCommitResult {
  committed: boolean;
  dirtyPathsBefore: string[];
  headRevision: string;
}

function statusPath(line: string): string {
  const path = line.slice(3).trim().replace(/^"|"$/g, "");
  const renameTarget = path.includes(" -> ") ? path.slice(path.lastIndexOf(" -> ") + 4) : path;
  return renameTarget.replace(/^"|"$/g, "");
}

function excludedPath(path: string, excludes: readonly string[]): boolean {
  return excludes.some((excluded) => path === excluded || path.startsWith(`${excluded}/`));
}

export function boundaryCommitExcludes(repoRoot: string, stateDir: string): string[] {
  const stateDirRelative = relative(repoRoot, stateDir);
  return [
    ...COMMIT_EXCLUDES,
    ...(stateDirRelative && !stateDirRelative.startsWith("..") ? [stateDirRelative] : []),
  ];
}

async function checkedGit(
  runGit: BoundaryGitRunner,
  repoRoot: string,
  args: string[],
  failureHint: string,
): Promise<CliResult> {
  const result = await runGit(repoRoot, args, { check: false, failureHint });
  if (result.exitCode !== 0) {
    throw new Error(`${failureHint} (${result.exitCode ?? "signal"}): ${(result.stderr || result.stdout || "no output").trim()}`);
  }
  return result;
}

export async function boundaryDirtyPaths(
  runGit: BoundaryGitRunner,
  repoRoot: string,
  stateDir: string,
): Promise<string[]> {
  const result = await checkedGit(
    runGit,
    repoRoot,
    ["status", "--short", "--ignore-submodules=all"],
    "boundary git status failed",
  );
  const excludes = boundaryCommitExcludes(repoRoot, stateDir);
  return result.stdout
    .split("\n")
    .filter(Boolean)
    .map(statusPath)
    .filter((path) => !excludedPath(path, excludes));
}

/**
 * Creates the commit owned by a workflow boundary. Save-point capture is a
 * separate evidence-only step and must run only after this succeeds.
 */
export async function commitBoundaryWorktree(input: {
  message: string;
  repoRoot: string;
  revalidateLease?: DispatchLeaseRevalidator;
  runGit: BoundaryGitRunner;
  stateDir: string;
}): Promise<BoundaryCommitResult> {
  const dirtyPathsBefore = await boundaryDirtyPaths(input.runGit, input.repoRoot, input.stateDir);
  if (dirtyPathsBefore.length > 0) {
    const excludes = boundaryCommitExcludes(input.repoRoot, input.stateDir);
    input.revalidateLease?.();
    await checkedGit(
      input.runGit,
      input.repoRoot,
      ["add", "-A", "--", ".", ...excludes.map((path) => `:(exclude)${path}`)],
      "boundary git add failed",
    );
    input.revalidateLease?.();
    await checkedGit(
      input.runGit,
      input.repoRoot,
      ["commit", "-m", input.message],
      "boundary git commit failed",
    );
  }
  const head = await checkedGit(
    input.runGit,
    input.repoRoot,
    ["rev-parse", "HEAD"],
    "boundary HEAD resolution failed",
  );
  const headRevision = head.stdout.trim();
  if (!headRevision) throw new Error("boundary HEAD resolution returned an empty revision");
  return { committed: dirtyPathsBefore.length > 0, dirtyPathsBefore, headRevision };
}
