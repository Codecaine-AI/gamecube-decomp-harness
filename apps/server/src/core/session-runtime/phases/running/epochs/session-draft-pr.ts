import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { recordDashboardArtifact, type StateStore } from "@server/core/orchestrator-state";

export const SESSION_DRAFT_PR_ARTIFACT_TYPE = "session_draft_pr";
export const SESSION_DRAFT_PR_ARTIFACT_KEY = "current";
export const SESSION_DRAFT_PR_BRANCH_PREFIX = "orchestrator/session/";
export const DEFAULT_SESSION_DRAFT_PR_TITLE = "Work in Progress Session Run.";
export const DEFAULT_SESSION_DRAFT_PR_BODY =
  "This is an active decomp orchestrator session. Changes here have not been final-QA'd or broken down for review. Please take from this what you want; it still needs to be split into reviewable pieces.\n";

export interface SessionDraftPrCommandResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
}

export type SessionDraftPrCommandRunner = (cwd: string, command: string[]) => Promise<SessionDraftPrCommandResult>;

export interface SessionDraftPrPublishInput {
  baseRef?: string | null;
  body?: string;
  commitSha?: string | null;
  epochLabel?: string | null;
  matchedCodePercent?: number | null;
  projectId?: string | null;
  qaGate?: Record<string, unknown> | null;
  regressions?: Record<string, unknown> | null;
  repoRoot: string;
  runId: string;
  savePointId?: string | null;
  stateDir: string;
  store: StateStore;
  title?: string;
}

export interface SessionDraftPrPublishDeps {
  runCommand?: SessionDraftPrCommandRunner;
}

export interface SessionDraftPrPublishResult {
  baseBranch: string;
  baseRef: string;
  bodyPath?: string | null;
  branch?: string | null;
  commitSha?: string | null;
  created: boolean;
  draft?: boolean | null;
  epochLabel?: string | null;
  error?: string | null;
  forkOwner?: string | null;
  matchedCodePercent?: number | null;
  prNumber?: number | null;
  projectId?: string | null;
  qaGate?: Record<string, unknown> | null;
  reason?: string | null;
  regressions?: Record<string, unknown> | null;
  repoSlug?: string | null;
  runId: string;
  savePointId?: string | null;
  sessionUuid?: string | null;
  status: "created" | "failed" | "skipped" | "updated";
  title: string;
  url?: string | null;
}

interface GithubPull {
  draft: boolean | null;
  number: number | null;
  state: string;
  url: string | null;
}

function outputTail(text: string, maxLength = 1500): string {
  if (text.length <= maxLength) return text;
  return text.slice(text.length - maxLength);
}

function parseJson(value: string, label: string): unknown {
  try {
    return JSON.parse(value);
  } catch (error) {
    throw new Error(`${label} returned invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function stringValue(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function numberValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function parseGithubRepoSlug(remoteUrl: string): string {
  const match = remoteUrl.trim().match(/github\.com[:/]([^/]+\/[^/.]+)(?:\.git)?$/);
  return match ? match[1] : "";
}

function parseGithubOwner(remoteUrl: string): string {
  const match = remoteUrl.trim().match(/github\.com[:/]([^/]+)\//);
  return match ? match[1] : "";
}

function normalizeBaseBranch(baseRef: string): string {
  const trimmed = baseRef.trim() || "origin/master";
  const withoutHeads = trimmed.replace(/^refs\/heads\//, "");
  const remoteMatch = withoutHeads.match(/^refs\/remotes\/[^/]+\/(.+)$/);
  if (remoteMatch) return remoteMatch[1];
  const commonRemoteMatch = withoutHeads.match(/^(?:origin|upstream)\/(.+)$/);
  return commonRemoteMatch ? commonRemoteMatch[1] : withoutHeads;
}

function sessionUuidFromBranch(branch: string): string {
  return branch.startsWith(SESSION_DRAFT_PR_BRANCH_PREFIX) ? branch.slice(SESSION_DRAFT_PR_BRANCH_PREFIX.length) : "";
}

async function defaultRunCommand(cwd: string, command: string[]): Promise<SessionDraftPrCommandResult> {
  const proc = Bun.spawn(command, { cwd, stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, exitCode] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
  return { exitCode, stdout, stderr };
}

async function runChecked(
  runCommand: SessionDraftPrCommandRunner,
  cwd: string,
  command: string[],
  label: string,
): Promise<SessionDraftPrCommandResult> {
  const result = await runCommand(cwd, command);
  if (result.exitCode !== 0) {
    throw new Error(`${label} failed (${result.exitCode ?? "signal"}): ${outputTail(result.stderr || result.stdout || "no output")}`);
  }
  return result;
}

async function findOpenPullRequest(
  runCommand: SessionDraftPrCommandRunner,
  repoRoot: string,
  repoSlug: string,
  forkOwner: string,
  branch: string,
): Promise<GithubPull | null> {
  const head = encodeURIComponent(`${forkOwner}:${branch}`);
  const endpoint = `repos/${repoSlug}/pulls?head=${head}&state=open`;
  const result = await runChecked(runCommand, repoRoot, ["gh", "api", endpoint], "gh api pull lookup");
  const parsed = parseJson(result.stdout, "gh api pull lookup");
  if (!Array.isArray(parsed)) throw new Error("gh api pull lookup returned a non-array payload");
  const first = parsed.map(asObject)[0];
  if (!first) return null;
  return {
    draft: typeof first.draft === "boolean" ? first.draft : null,
    number: numberValue(first.number),
    state: stringValue(first.state),
    url: stringValue(first.html_url, stringValue(first.url)) || null,
  };
}

async function writeDefaultPrBody(stateDir: string, runId: string, body: string): Promise<string> {
  const dir = resolve(stateDir, "session_draft_pr", runId);
  await mkdir(dir, { recursive: true });
  const bodyPath = resolve(dir, "draft_body.md");
  await writeFile(bodyPath, body.endsWith("\n") ? body : `${body}\n`, "utf8");
  return bodyPath;
}

function recordPublication(input: SessionDraftPrPublishInput, result: SessionDraftPrPublishResult): SessionDraftPrPublishResult {
  recordDashboardArtifact(input.store, {
    runId: input.runId,
    projectId: input.projectId ?? null,
    sessionUuid: result.sessionUuid ?? null,
    artifactType: SESSION_DRAFT_PR_ARTIFACT_TYPE,
    artifactKey: SESSION_DRAFT_PR_ARTIFACT_KEY,
    sourcePath: result.bodyPath ?? null,
    sourceLabel: result.status,
    payload: result as unknown as Record<string, unknown>,
  });
  return result;
}

async function publishSessionDraftPrInner(
  input: SessionDraftPrPublishInput,
  deps: Required<SessionDraftPrPublishDeps>,
): Promise<SessionDraftPrPublishResult> {
  const runCommand = deps.runCommand;
  const baseRef = input.baseRef?.trim() || "origin/master";
  const baseBranch = normalizeBaseBranch(baseRef);
  const title = input.title?.trim() || DEFAULT_SESSION_DRAFT_PR_TITLE;

  const branchResult = await runChecked(runCommand, input.repoRoot, ["git", "rev-parse", "--abbrev-ref", "HEAD"], "read current branch");
  const branch = branchResult.stdout.trim();
  const sessionUuid = sessionUuidFromBranch(branch);
  if (!sessionUuid) {
    return {
      baseBranch,
      baseRef,
      branch,
      created: false,
      reason: "not_session_branch",
      runId: input.runId,
      status: "skipped",
      title,
    };
  }

  const headSha = input.commitSha?.trim()
    || (await runChecked(runCommand, input.repoRoot, ["git", "rev-parse", "HEAD"], "read session HEAD")).stdout.trim();
  const diff = await runCommand(input.repoRoot, ["git", "diff", "--quiet", `${baseRef}...HEAD`]);
  if (diff.exitCode === 0) {
    return recordPublication(input, {
      baseBranch,
      baseRef,
      branch,
      commitSha: headSha,
      created: false,
      epochLabel: input.epochLabel ?? null,
      matchedCodePercent: input.matchedCodePercent ?? null,
      projectId: input.projectId ?? null,
      qaGate: input.qaGate ?? null,
      reason: "no_diff_from_base",
      regressions: input.regressions ?? null,
      runId: input.runId,
      savePointId: input.savePointId ?? null,
      sessionUuid,
      status: "skipped",
      title,
    });
  }
  if (diff.exitCode !== 1) {
    throw new Error(`git diff against ${baseRef} failed (${diff.exitCode ?? "signal"}): ${outputTail(diff.stderr || diff.stdout || "no output")}`);
  }

  const originUrl = (await runChecked(runCommand, input.repoRoot, ["git", "remote", "get-url", "origin"], "read origin remote")).stdout.trim();
  const forkUrl = (await runChecked(runCommand, input.repoRoot, ["git", "remote", "get-url", "fork"], "read fork remote")).stdout.trim();
  const repoSlug = parseGithubRepoSlug(originUrl);
  const forkOwner = parseGithubOwner(forkUrl);
  if (!repoSlug) throw new Error(`origin remote is not a GitHub repository URL: ${originUrl}`);
  if (!forkOwner) throw new Error(`fork remote is not a GitHub repository URL: ${forkUrl}`);

  await runChecked(runCommand, input.repoRoot, ["git", "push", "--force-with-lease", "-u", "fork", `HEAD:${branch}`], "push session branch");
  let pull = await findOpenPullRequest(runCommand, input.repoRoot, repoSlug, forkOwner, branch);
  let bodyPath: string | null = null;
  let created = false;
  if (!pull) {
    bodyPath = await writeDefaultPrBody(input.stateDir, input.runId, input.body ?? DEFAULT_SESSION_DRAFT_PR_BODY);
    const create = await runChecked(
      runCommand,
      input.repoRoot,
      ["gh", "pr", "create", "--repo", repoSlug, "--head", `${forkOwner}:${branch}`, "--base", baseBranch, "--draft", "--title", title, "--body-file", bodyPath],
      "gh pr create",
    );
    const url = create.stdout.trim().split("\n").filter(Boolean).at(-1) ?? "";
    const number = numberValue(url.match(/\/pull\/(\d+)/)?.[1]);
    pull = { draft: true, number, state: "open", url: url || null };
    created = true;
  }

  return recordPublication(input, {
    baseBranch,
    baseRef,
    bodyPath,
    branch,
    commitSha: headSha,
    created,
    draft: pull.draft,
    epochLabel: input.epochLabel ?? null,
    forkOwner,
    matchedCodePercent: input.matchedCodePercent ?? null,
    prNumber: pull.number,
    projectId: input.projectId ?? null,
    qaGate: input.qaGate ?? null,
    regressions: input.regressions ?? null,
    repoSlug,
    runId: input.runId,
    savePointId: input.savePointId ?? null,
    sessionUuid,
    status: created ? "created" : "updated",
    title,
    url: pull.url,
  });
}

export async function publishSessionDraftPr(
  input: SessionDraftPrPublishInput,
  deps: SessionDraftPrPublishDeps = {},
): Promise<SessionDraftPrPublishResult> {
  const fullDeps: Required<SessionDraftPrPublishDeps> = {
    runCommand: deps.runCommand ?? defaultRunCommand,
  };
  try {
    return await publishSessionDraftPrInner(input, fullDeps);
  } catch (error) {
    const baseRef = input.baseRef?.trim() || "origin/master";
    const result: SessionDraftPrPublishResult = {
      baseBranch: normalizeBaseBranch(baseRef),
      baseRef,
      commitSha: input.commitSha ?? null,
      created: false,
      epochLabel: input.epochLabel ?? null,
      error: error instanceof Error ? error.message : String(error),
      matchedCodePercent: input.matchedCodePercent ?? null,
      projectId: input.projectId ?? null,
      qaGate: input.qaGate ?? null,
      regressions: input.regressions ?? null,
      runId: input.runId,
      savePointId: input.savePointId ?? null,
      status: "failed",
      title: input.title?.trim() || DEFAULT_SESSION_DRAFT_PR_TITLE,
    };
    return recordPublication(input, result);
  }
}
