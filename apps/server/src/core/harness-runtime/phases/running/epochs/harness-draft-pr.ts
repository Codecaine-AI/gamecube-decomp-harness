import { getHarnessState } from "@server/core/harness-state/state.js";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { recordDashboardArtifact, type StateStore } from "@server/core/orchestrator-state";
import { packageRoot } from "@server/core/knowledge/paths.js";
import { branchSteeringHolds, type SteeringPrHold } from "@server/core/harness-runtime/phases/pr/checkpoint/steering-holds.js";
import { gameSteeringGate } from "@server/core/tools/steering-gate.js";
import {
  hostEditScopeRunner,
  hostEditScopeScriptPath,
  orderingActive,
  orderingEnforced,
  prScopeSummary,
  runPrScopeCheck,
  type EditScopeOrderingPolicy,
  type EditScopeRunner,
  type OrderingMode,
  type PrScopeSummary,
} from "@server/core/validation/edit-scope/edit-scope.js";

export const HARNESS_DRAFT_PR_ARTIFACT_TYPE = "harness_draft_pr";
export const HARNESS_DRAFT_PR_ARTIFACT_KEY = "current";
export const DEFAULT_HARNESS_DRAFT_PR_TITLE = "GameCube Decomp Harness Session";
export const DEFAULT_HARNESS_DRAFT_PR_BODY = `Work in Progress AI Decomp Session

Please use this to improve upon other matches and whatnot for your work.

**Note for users and AI agents:** Please mention this PR when pulling from it so there is a canonical record and maintainers know that any work came from this PR and are careful so slop code does not get merged in.`;

export interface HarnessDraftPrCommandResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
}

export type HarnessDraftPrCommandRunner = (cwd: string, command: string[]) => Promise<HarnessDraftPrCommandResult>;

export interface HarnessDraftPrPublishInput {
  baseRef?: string | null;
  body?: string;
  commitSha?: string | null;
  epochOrdinal?: number | null;
  epochLabel?: string | null;
  matchedCodePercent?: number | null;
  gameId?: string | null;
  /**
   * The game's order-and-scope policy. Absent, null or `off` publishes exactly
   * as before; `shadow` records the PR scope check; `enforce` refuses to push
   * a rejected range (`scope_refused`).
   */
  ordering?: EditScopeOrderingPolicy | null;
  qaGate?: Record<string, unknown> | null;
  regressions?: Record<string, unknown> | null;
  repoRoot: string;
  runId: string;
  savePointId?: string | null;
  stateDir: string;
  /**
   * The game's `matching.steeringGate`; omitted, the game's current
   * configuration. Shadow or enforce: the body lists every function the branch
   * may not present as a match (steering-holds.ts `branchSteeringHolds`).
   */
  steeringGate?: string | null;
  store: StateStore;
  title?: string;
  /**
   * `--unused-checks FILE` for the PR scope check: the integrated certificates
   * on the branch, re-validated at the published head (`preparePrUnusedChecks`).
   */
  unusedChecksPath?: string | null;
  /** Certificates dropped as stale at the published head; recorded as scope warnings. */
  unusedChecksStale?: string[] | null;
}

export interface HarnessDraftPrPublishDeps {
  runCommand?: HarnessDraftPrCommandRunner;
  /** Runs `edit_scope.py pr`; defaults to the host toolpack copy. */
  editScopeRunner?: EditScopeRunner;
}

/** The PR scope check bound to the exact SHA it covered (and that was, or would have been, pushed). */
export interface HarnessDraftPrScopeCheck extends PrScopeSummary {
  mode: OrderingMode;
  headSha: string;
  unusedChecksPath: string | null;
  baseRef: string;
  artifactPath: string | null;
  durationMs: number;
}

export interface HarnessDraftPrPublishResult {
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
  gameId?: string | null;
  qaGate?: Record<string, unknown> | null;
  reason?: string | null;
  regressions?: Record<string, unknown> | null;
  repoSlug?: string | null;
  runId: string;
  savePointId?: string | null;
  harnessId?: string | null;
  /** Present when the game's ordering is shadow or enforce. */
  scopeCheck?: HarnessDraftPrScopeCheck | null;
  /** Steering-gated games: functions at the published head the PR body marks as not verified matches. */
  steeringHolds?: Array<Pick<SteeringPrHold, "unit" | "symbol" | "reason">> | null;
  /**
   * `scope_refused`: enforce mode, the PR scope check rejected the range or
   * could not run. Nothing was pushed and GitHub was not touched; the range is
   * unpublished and a later boundary retries it.
   */
  status: "created" | "failed" | "scope_refused" | "skipped" | "updated";
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

function draftPrBody(): string {
  return DEFAULT_HARNESS_DRAFT_PR_BODY;
}

const MAX_LISTED_STEERING_HOLDS = 200;

/**
 * The body section for functions at 100% that are not verified matches. It is
 * rebuilt from the current holds on every publish, so a function cleared since
 * leaves the list and one held since joins it.
 */
function steeringHoldsBodySection(holds: readonly SteeringPrHold[]): string {
  if (holds.length === 0) return "";
  const listed = holds.slice(0, MAX_LISTED_STEERING_HOLDS).map((hold) =>
    `- \`${hold.unit}::${hold.symbol}\` (${hold.reason === "unverified_match" ? "100% unverified" : "rolled back by the steering gate, not re-certified"})`);
  const more = holds.length > listed.length ? [`- ... and ${holds.length - listed.length} more`] : [];
  return [
    "## Not verified matches",
    "",
    `${holds.length} function(s) on this branch may read as 100% but are not verified matches: the steering gate has not certified them. Do not take them as matches.`,
    "",
    ...listed,
    ...more,
  ].join("\n");
}

async function defaultRunCommand(cwd: string, command: string[]): Promise<HarnessDraftPrCommandResult> {
  const proc = Bun.spawn(command, { cwd, stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, exitCode] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
  return { exitCode, stdout, stderr };
}

async function runChecked(
  runCommand: HarnessDraftPrCommandRunner,
  cwd: string,
  command: string[],
  label: string,
): Promise<HarnessDraftPrCommandResult> {
  const result = await runCommand(cwd, command);
  if (result.exitCode !== 0) {
    throw new Error(`${label} failed (${result.exitCode ?? "signal"}): ${outputTail(result.stderr || result.stdout || "no output")}`);
  }
  return result;
}

async function findOpenPullRequest(
  runCommand: HarnessDraftPrCommandRunner,
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
  const dir = resolve(stateDir, "harness_draft_pr", runId);
  await mkdir(dir, { recursive: true });
  const bodyPath = resolve(dir, "draft_body.md");
  await writeFile(bodyPath, body.endsWith("\n") ? body : `${body}\n`, "utf8");
  return bodyPath;
}

function recordPublication(input: HarnessDraftPrPublishInput, result: HarnessDraftPrPublishResult): HarnessDraftPrPublishResult {
  recordDashboardArtifact(input.store, {
    runId: input.runId,
    gameId: input.gameId ?? null,
    artifactType: HARNESS_DRAFT_PR_ARTIFACT_TYPE,
    artifactKey: HARNESS_DRAFT_PR_ARTIFACT_KEY,
    sourcePath: result.bodyPath ?? null,
    sourceLabel: result.status,
    payload: result as unknown as Record<string, unknown>,
  });
  return result;
}

async function publishHarnessDraftPrInner(
  input: HarnessDraftPrPublishInput,
  deps: HarnessDraftPrPublishDeps & { runCommand: HarnessDraftPrCommandRunner },
): Promise<HarnessDraftPrPublishResult> {
  const runCommand = deps.runCommand;
  const baseRef = input.baseRef?.trim() || "origin/master";
  const baseBranch = normalizeBaseBranch(baseRef);
  // Ordering off keeps the historical publish byte-for-byte (diff and push of
  // HEAD). Active ordering resolves the head once and checks, diffs and pushes
  // that exact commit, so a HEAD that moves mid-publish cannot slip through.
  const ordering = input.ordering && orderingActive(input.ordering.mode) ? input.ordering : null;

  const branchResult = await runChecked(runCommand, input.repoRoot, ["git", "rev-parse", "--abbrev-ref", "HEAD"], "read current branch");
  const branch = branchResult.stdout.trim();
  if (!input.gameId) throw new Error("Draft PR publication requires a selected game");
  const harness = getHarnessState(input.store.db, input.gameId);
  if (!harness || harness.history.run_id !== input.runId || resolve(harness.source.worktree) !== resolve(input.repoRoot)) throw new Error("Draft PR publication requires the owning harness worktree and run");
  if (!branch || branch === "HEAD") throw new Error("Draft PR publication requires an attached harness branch");
  const harnessId = harness.identity.harness_id;
  const title = input.title?.trim() || `${DEFAULT_HARNESS_DRAFT_PR_TITLE} ${harnessId.slice(0, 8)}`;
  const headSha = ordering
    ? (await runChecked(runCommand, input.repoRoot, ["git", "rev-parse", "--verify", `${input.commitSha?.trim() || "HEAD"}^{commit}`], "resolve publication head")).stdout.trim()
    : input.commitSha?.trim()
      || (await runChecked(runCommand, input.repoRoot, ["git", "rev-parse", "HEAD"], "read harness HEAD")).stdout.trim();
  if (ordering && !/^[0-9a-f]{40,64}$/.test(headSha)) throw new Error(`publication head did not resolve to a commit SHA: ${headSha || "empty"}`);
  const diff = await runCommand(input.repoRoot, ["git", "diff", "--quiet", `${baseRef}...${ordering ? headSha : "HEAD"}`]);
  if (diff.exitCode === 0) {
    return recordPublication(input, {
      baseBranch,
      baseRef,
      branch,
      commitSha: headSha,
      created: false,
      epochLabel: input.epochLabel ?? null,
      matchedCodePercent: input.matchedCodePercent ?? null,
      gameId: input.gameId ?? null,
      qaGate: input.qaGate ?? null,
      reason: "no_diff_from_base",
      regressions: input.regressions ?? null,
      runId: input.runId,
      savePointId: input.savePointId ?? null,
      harnessId,
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

  let scopeCheck: HarnessDraftPrScopeCheck | null = null;
  if (ordering) {
    // Immediately before the push: the check is bound to `headSha`, and only
    // `headSha` is pushed.
    const runner = deps.editScopeRunner ?? hostEditScopeRunner(hostEditScopeScriptPath(packageRoot()), input.repoRoot, ordering);
    const check = await runPrScopeCheck({
      runner,
      repo: input.repoRoot,
      base: baseRef,
      head: headSha,
      policy: ordering,
      unusedChecksPath: input.unusedChecksPath ?? null,
      artifactPath: resolve(input.stateDir, "harness_draft_pr", input.runId, `pr_scope_${headSha}.json`),
    });
    const summary = prScopeSummary(check);
    scopeCheck = {
      mode: ordering.mode, headSha, baseRef, unusedChecksPath: input.unusedChecksPath ?? null,
      artifactPath: check.artifactPath ?? null, durationMs: check.durationMs,
      ...summary, warnings: [...summary.warnings, ...(input.unusedChecksStale ?? [])],
    };
    if (orderingEnforced(ordering.mode) && scopeCheck.problem) {
      return recordPublication(input, {
        baseBranch,
        baseRef,
        branch,
        commitSha: headSha,
        created: false,
        epochLabel: input.epochLabel ?? null,
        forkOwner,
        matchedCodePercent: input.matchedCodePercent ?? null,
        gameId: input.gameId ?? null,
        qaGate: input.qaGate ?? null,
        reason: scopeCheck.problem,
        regressions: input.regressions ?? null,
        repoSlug,
        runId: input.runId,
        savePointId: input.savePointId ?? null,
        harnessId,
        scopeCheck,
        status: "scope_refused",
        title,
      });
    }
  }

  await runChecked(
    runCommand,
    input.repoRoot,
    ordering
      ? ["git", "push", "--force-with-lease", "fork", `${headSha}:refs/heads/${branch}`]
      : ["git", "push", "--force-with-lease", "-u", "fork", `HEAD:${branch}`],
    "push cycle branch",
  );
  let pull = await findOpenPullRequest(runCommand, input.repoRoot, repoSlug, forkOwner, branch);
  const holds = await branchSteeringHolds(
    input.store,
    { gameId: input.gameId, steeringGate: input.steeringGate !== undefined ? input.steeringGate : gameSteeringGate({ gameId: input.gameId }) },
    async (rev) => (await runCommand(input.repoRoot, ["git", "merge-base", "--is-ancestor", rev, headSha])).exitCode === 0,
  );
  const holdsSection = steeringHoldsBodySection(holds);
  const body = input.body ?? draftPrBody();
  const bodyPath = await writeDefaultPrBody(input.stateDir, input.runId, holdsSection ? `${body.trimEnd()}\n\n${holdsSection}` : body);
  let created = false;
  if (!pull) {
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
  } else {
    await runChecked(
      runCommand,
      input.repoRoot,
      ["gh", "pr", "edit", String(pull.number ?? pull.url ?? ""), "--repo", repoSlug, "--title", title, "--body-file", bodyPath],
      "gh pr edit",
    );
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
    gameId: input.gameId ?? null,
    qaGate: input.qaGate ?? null,
    regressions: input.regressions ?? null,
    repoSlug,
    runId: input.runId,
    savePointId: input.savePointId ?? null,
    harnessId,
    ...(scopeCheck ? { scopeCheck } : {}),
    ...(holds.length > 0 ? { steeringHolds: holds.map(({ unit, symbol, reason }) => ({ unit, symbol, reason })) } : {}),
    status: created ? "created" : "updated",
    title,
    url: pull.url,
  });
}

export async function publishHarnessDraftPr(
  input: HarnessDraftPrPublishInput,
  deps: HarnessDraftPrPublishDeps = {},
): Promise<HarnessDraftPrPublishResult> {
  const fullDeps = { ...deps, runCommand: deps.runCommand ?? defaultRunCommand };
  try {
    return await publishHarnessDraftPrInner(input, fullDeps);
  } catch (error) {
    const baseRef = input.baseRef?.trim() || "origin/master";
    const result: HarnessDraftPrPublishResult = {
      baseBranch: normalizeBaseBranch(baseRef),
      baseRef,
      commitSha: input.commitSha ?? null,
      created: false,
      epochLabel: input.epochLabel ?? null,
      error: error instanceof Error ? error.message : String(error),
      matchedCodePercent: input.matchedCodePercent ?? null,
      gameId: input.gameId ?? null,
      qaGate: input.qaGate ?? null,
      regressions: input.regressions ?? null,
      runId: input.runId,
      savePointId: input.savePointId ?? null,
      status: "failed",
      title: input.title?.trim() || DEFAULT_HARNESS_DRAFT_PR_TITLE,
    };
    return recordPublication(input, result);
  }
}
