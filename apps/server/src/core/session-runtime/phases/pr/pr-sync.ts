import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { openState } from "@server/core/orchestrator-state";
import {
  observePrSeriesRemote,
  type ObservePrSeriesRemoteInput,
  type ObservePrSeriesRemoteResult,
} from "@server/core/session-runtime/phases/pr/campaign";
import type { JsonObject, PrRecordContext } from "@server/core/session-runtime/phases/pr/pr-records";

export interface CliResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
}

export interface PrSyncProjectContext {
  project: { baseRef?: string } | null;
  repoRoot: string;
  stateDir: string;
}

export interface PrSyncRecordsService {
  deriveReviewSubState: (prev: JsonObject, githubStatus: string, reviewDecision: string, comments: number) => JsonObject;
  normalizePrRecord: (record: JsonObject, context?: PrRecordContext) => JsonObject;
  normalizePrRecordsPayload: (payload: JsonObject, context?: PrRecordContext) => JsonObject;
  prRecordContext: (stateDir: string, runId?: string) => PrRecordContext;
  readPrRecords: (stateDir: string) => JsonObject;
  writePrRecords: (stateDir: string, payload: JsonObject) => JsonObject;
}

export interface PrSyncServiceDeps<Context extends PrSyncProjectContext> {
  appendLog: (stream: "stdout" | "stderr" | "ui", text: string) => void;
  latestPrSplitPlanSummary: (stateDir: string, runId: string) => JsonObject | null;
  latestRunId: (stateDir: string) => string;
  outputTail: (textValue: string, maxLength?: number) => string;
  records: PrSyncRecordsService;
  resolveDashboardProject: (input: JsonObject, options?: { useDefaultProject?: boolean }) => Context;
  runCli: (command: string[], cwd?: string) => Promise<CliResult>;
  runGitQuiet?: (repoRoot: string, args: string[]) => CliResult;
  observeCampaignPr?: (stateDir: string, input: ObservePrSeriesRemoteInput) => ObservePrSeriesRemoteResult;
}

function asObject(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonObject) : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function stringValue(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function numberValue(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function stringArray(value: unknown): string[] {
  return asArray(value).map((entry) => stringValue(entry)).filter(Boolean);
}

function sameStringSet(left: string[], right: string[]): boolean {
  const normalize = (values: string[]) => [...new Set(values)].sort();
  const leftValues = normalize(left);
  const rightValues = normalize(right);
  return leftValues.length === rightValues.length && leftValues.every((value, index) => value === rightValues[index]);
}

export function quietGit(repoRoot: string, args: string[]): CliResult {
  const result = spawnSync("git", ["-C", repoRoot, ...args], { encoding: "utf8" });
  return {
    exitCode: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

export function upstreamRepoSlug(repoRoot: string, runGitQuiet: (repoRoot: string, args: string[]) => CliResult = quietGit): string {
  const result = runGitQuiet(repoRoot, ["remote", "get-url", "origin"]);
  if (result.exitCode !== 0) return "";
  const match = result.stdout.trim().match(/github\.com[:/]([^/]+\/[^/.]+)/);
  return match ? match[1] : "";
}

/** PR lifecycle status from GitHub fields; `planned` when no PR exists yet. */
export function prStatusFromGithub(pr: JsonObject): string {
  const state = stringValue(pr.state).toUpperCase();
  if (state === "MERGED") return "merged";
  if (state === "CLOSED") return "closed";
  if (pr.isDraft === true) return "draft";
  if (stringValue(pr.reviewDecision) === "CHANGES_REQUESTED") return "changes_requested";
  return "open";
}

export function ciVerdict(rollup: unknown): string {
  const checks = asArray(rollup).map(asObject);
  if (checks.length === 0) return "";
  const states = checks.map((check) => stringValue(check.conclusion, stringValue(check.state)).toUpperCase());
  if (states.some((state) => state === "FAILURE" || state === "ERROR" || state === "TIMED_OUT")) return "failing";
  if (states.some((state) => state === "" || state === "PENDING" || state === "IN_PROGRESS" || state === "QUEUED" || state === "EXPECTED")) return "pending";
  return "passing";
}

export function splitSeriesMatch(branch: string): RegExpMatchArray | null {
  return branch.match(/^codex\/split-(\d{2})-(.+)$/);
}

export function isLocalBranchPrRecord(record: JsonObject): boolean {
  const branch = stringValue(record.branch);
  return Boolean(splitSeriesMatch(branch)) || stringValue(asObject(record.sourcePlan).source) === "local_branch_discovery";
}

export function splitSeriesOrdinal(branch: string): number {
  const match = splitSeriesMatch(branch);
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
}

export function humanizeBranchSlug(slug: string): string {
  return slug
    .split("-")
    .filter(Boolean)
    .map((part) => (part.length <= 2 ? part.toUpperCase() : `${part.charAt(0).toUpperCase()}${part.slice(1)}`))
    .join(" ");
}

export function splitSeriesTitle(branch: string, total: number): string {
  const match = splitSeriesMatch(branch);
  if (!match) return branch;
  const ordinal = Number(match[1]);
  return `${ordinal}/${total}: ${humanizeBranchSlug(match[2])}`;
}

export function splitSeriesSort(left: JsonObject, right: JsonObject): number {
  const leftBranch = stringValue(left.branch);
  const rightBranch = stringValue(right.branch);
  const leftOrdinal = splitSeriesOrdinal(leftBranch);
  const rightOrdinal = splitSeriesOrdinal(rightBranch);
  if (leftOrdinal !== rightOrdinal) return leftOrdinal - rightOrdinal;
  return leftBranch.localeCompare(rightBranch);
}

export function branchWorktreePaths(repoRoot: string, runGitQuiet: (repoRoot: string, args: string[]) => CliResult = quietGit): Map<string, string> {
  const result = runGitQuiet(repoRoot, ["worktree", "list", "--porcelain"]);
  const paths = new Map<string, string>();
  if (result.exitCode !== 0) return paths;
  let currentPath = "";
  for (const line of result.stdout.split("\n")) {
    if (line.startsWith("worktree ")) {
      currentPath = line.slice("worktree ".length).trim();
    } else if (line.startsWith("branch refs/heads/") && currentPath) {
      paths.set(line.slice("branch refs/heads/".length).trim(), currentPath);
    }
  }
  return paths;
}

export function branchExists(repoRoot: string, branch: string, runGitQuiet: (repoRoot: string, args: string[]) => CliResult = quietGit): boolean {
  return Boolean(branch) && runGitQuiet(repoRoot, ["rev-parse", "--verify", branch]).exitCode === 0;
}

export function localBranchDiffBase(repoRoot: string, baseRef: string, branch: string, runGitQuiet: (repoRoot: string, args: string[]) => CliResult = quietGit): string {
  const mergeBase = runGitQuiet(repoRoot, ["merge-base", baseRef, branch]).stdout.trim();
  return mergeBase || baseRef;
}

export function createPrSyncService<Context extends PrSyncProjectContext>(deps: PrSyncServiceDeps<Context>) {
  const runGitQuiet = deps.runGitQuiet ?? quietGit;
  const {
    deriveReviewSubState,
    normalizePrRecord,
    normalizePrRecordsPayload,
    prRecordContext,
    readPrRecords,
    writePrRecords,
  } = deps.records;
  const observeCampaignPr = deps.observeCampaignPr ?? ((stateDir, input) => {
    const store = openState(stateDir);
    try {
      return observePrSeriesRemote(store, input);
    } finally {
      store.db.close();
    }
  });

  function activeRunIdFromBody(body: JsonObject, stateDir: string): string {
    const runId = stringValue(body.runId) || deps.latestRunId(stateDir);
    if (!runId) throw new Error("No run found. Run init-run first.");
    return runId;
  }

  function mergePrRecord(base: JsonObject, update: JsonObject, context: PrRecordContext = {}): JsonObject {
    return normalizePrRecord(
      {
        ...base,
        ...update,
        sourcePlan: {
          ...asObject(base.sourcePlan),
          ...asObject(update.sourcePlan),
        },
        local: {
          ...asObject(base.local),
          ...asObject(update.local),
        },
        validation: {
          ...asObject(base.validation),
          ...asObject(update.validation),
        },
        batch: {
          ...asObject(base.batch),
          ...asObject(update.batch),
        },
        github: {
          ...asObject(base.github),
          ...asObject(update.github),
        },
      },
      context,
    );
  }

  function setPrRecord(recordsByBranch: Map<string, JsonObject>, branch: string, update: JsonObject, context: PrRecordContext = {}): JsonObject {
    const merged = mergePrRecord(recordsByBranch.get(branch) ?? {}, update, context);
    recordsByBranch.set(branch, merged);
    return merged;
  }

  function localSplitSeriesRecords(repoRoot: string, baseRef: string, baseSha: string, context: PrRecordContext): JsonObject[] {
    const refs = runGitQuiet(repoRoot, ["for-each-ref", "refs/heads/codex/split-*", "--format=%(refname:short)%09%(objectname)%09%(upstream:short)"]);
    if (refs.exitCode !== 0) return [];
    const worktrees = branchWorktreePaths(repoRoot, runGitQuiet);
    const branches = refs.stdout
      .split("\n")
      .map((line) => {
        const [branch = "", commitSha = "", upstream = ""] = line.split("\t");
        return { branch: branch.trim(), commitSha: commitSha.trim(), upstream: upstream.trim() };
      })
      .filter((item) => splitSeriesMatch(item.branch))
      .sort((left, right) => splitSeriesOrdinal(left.branch) - splitSeriesOrdinal(right.branch));
    const total = branches.reduce((max, item) => Math.max(max, splitSeriesOrdinal(item.branch)), 0);
    return branches.map((item) => {
      const diffBase = localBranchDiffBase(repoRoot, baseRef, item.branch, runGitQuiet);
      const files = runGitQuiet(repoRoot, ["diff", "--name-only", `${diffBase}..${item.branch}`]).stdout
        .split("\n")
        .map((file) => file.trim())
        .filter(Boolean);
      const worktreePath = worktrees.get(item.branch) ?? "";
      const worktreeReady = Boolean(worktreePath) && existsSync(resolve(worktreePath, ".git"));
      return normalizePrRecord(
        {
          sliceId: item.branch.replace(/^codex\/split-/, "split-"),
          displayName: splitSeriesTitle(item.branch, total),
          branch: item.branch,
          title: splitSeriesTitle(item.branch, total),
          scope: "split-series",
          files,
          status: "planned",
          baseSha,
          sourcePlan: {
            source: "local_branch_discovery",
            baseRef,
            diffBase,
            discoveredAt: new Date().toISOString(),
          },
          local: {
            status: worktreeReady ? "ready" : "local_only",
            branch: item.branch,
            worktreePath: worktreeReady ? worktreePath : "",
            commitSha: item.commitSha,
            preparedAt: "",
            error: "",
          },
          validation: {
            status: "not_run",
          },
          batch: {
            state: "unbatched",
            ordinal: splitSeriesOrdinal(item.branch),
          },
        },
        context,
      );
    });
  }

  function shouldKeepUnplannedPrRecord(record: JsonObject, repoRoot: string): boolean {
    const branch = stringValue(record.branch);
    const local = asObject(record.local);
    const sourcePlan = asObject(record.sourcePlan);
    if (record.prNumber) return true;
    if (splitSeriesMatch(branch) && branchExists(repoRoot, branch, runGitQuiet)) return true;
    if (stringValue(sourcePlan.source) === "local_branch_discovery" && branchExists(repoRoot, branch, runGitQuiet)) return true;
    return ["ready", "blocked", "dirty", "local_only"].includes(stringValue(local.status));
  }

  async function hydratePrRecordFromGithub(record: JsonObject, pr: JsonObject, repoSlug: string, repoRoot: string, stateDir?: string): Promise<JsonObject> {
    const prNumber = numberValue(pr.number, NaN);
    if (!Number.isFinite(prNumber)) return record;
    const update: JsonObject = {
      prNumber,
      url: stringValue(pr.url),
      author: stringValue(asObject(pr.author).login),
      status: prStatusFromGithub(pr),
      updatedAt: stringValue(pr.updatedAt),
      github: {
        status: prStatusFromGithub(pr),
        prNumber,
        url: stringValue(pr.url),
        author: stringValue(asObject(pr.author).login),
        updatedAt: stringValue(pr.updatedAt),
      },
    };
    const view = await deps.runCli(["gh", "pr", "view", String(prNumber), "--repo", repoSlug, "--json", "comments,statusCheckRollup,files"], repoRoot);
    let comments = numberValue(record.comments, 0);
    let feedback: ObservePrSeriesRemoteInput["feedback"] = [];
    if (view.exitCode === 0) {
      const detail = asObject(JSON.parse(view.stdout || "{}"));
      comments = asArray(detail.comments).length;
      feedback = asArray(detail.comments).map(asObject).flatMap((comment) => {
        const sourceId = stringValue(comment.id) || stringValue(comment.databaseId) || stringValue(comment.url);
        const summary = stringValue(comment.body).trim();
        return sourceId && summary ? [{ sourceKind: "issue_comment", sourceId, summary }] : [];
      });
      const ci = ciVerdict(detail.statusCheckRollup);
      update.comments = comments;
      update.ci = ci;
      const supportFiles = new Set(stringArray(record.supportFiles));
      update.files = asArray(detail.files)
        .map((file) => stringValue(asObject(file).path))
        .filter((path) => Boolean(path) && !supportFiles.has(path));
      update.github = {
        ...asObject(update.github),
        ci,
        comments,
      };
    }
    const githubStatus = stringValue(update.status);
    const reviewDecision = stringValue(pr.reviewDecision);
    update.review = deriveReviewSubState(asObject(record.review), githubStatus, reviewDecision, comments);
    if (stateDir) {
      observeCampaignPr(stateDir, {
        branch: stringValue(record.branch, stringValue(pr.headRefName)),
        commandId: `pr-sync:${prNumber}:${stringValue(pr.updatedAt, "observed")}`,
        feedback,
        mergedUpstreamRevision: stringValue(asObject(pr.mergeCommit).oid),
        occurredAt: stringValue(pr.updatedAt) || undefined,
        reviewDecision,
        state: stringValue(pr.state),
        upstreamPrNumber: prNumber,
      });
    }
    return mergePrRecord(record, update);
  }

  /**
   * Seed records from the latest (ship-filtered) split plan's match slices,
   * keep previously tracked records that already map to a PR, then hydrate
   * status/comments/CI from GitHub. gh failures degrade to seeded records with
   * a warning instead of failing the sync; the board should never go blank
   * because GitHub was unreachable.
   */
  async function syncPrRecords(body: JsonObject): Promise<JsonObject> {
    const paths = deps.resolveDashboardProject(body, { useDefaultProject: true });
    const { repoRoot, stateDir } = paths;
    const runId = activeRunIdFromBody(body, stateDir);
    const context = prRecordContext(stateDir, runId);
    const plan = deps.latestPrSplitPlanSummary(stateDir, runId);
    const previous = asArray(normalizePrRecordsPayload(readPrRecords(stateDir)).records).map(asObject);
    const previousByBranch = new Map(previous.map((record) => [stringValue(record.branch), record]));
    const baseRef = paths.project?.baseRef ?? "origin/master";
    const baseSha = stringValue(context.baseSha) || runGitQuiet(repoRoot, ["rev-parse", "--verify", baseRef]).stdout.trim();

    const recordsByBranch = new Map<string, JsonObject>();
    for (const slice of asArray(plan?.slices).map(asObject)) {
      if (slice.lane !== "match") continue;
      const branch = stringValue(slice.branchName);
      if (!branch) continue;
      const prior = previousByBranch.get(branch) ?? {};
      previousByBranch.delete(branch);
      const files = stringArray(slice.pathspecs);
      const supportFiles = stringArray(slice.supportPathspecs);
      const manifestChanged =
        Object.keys(prior).length > 0 &&
        (!sameStringSet(stringArray(prior.files), files) || !sameStringSet(stringArray(prior.supportFiles), supportFiles));
      const { supportFiles: _priorSupportFiles, ...priorWithoutSupportFiles } = prior;
      setPrRecord(
        recordsByBranch,
        branch,
        {
          ...priorWithoutSupportFiles,
          sliceId: stringValue(slice.id),
          displayName: stringValue(slice.displayName, stringValue(slice.id)),
          branch,
          title: stringValue(slice.title),
          scope: stringValue(slice.scope),
          files,
          ...(supportFiles.length > 0 ? { supportFiles } : {}),
          ...(manifestChanged && !prior.prNumber
            ? {
                local: {
                  ...asObject(prior.local),
                  status: "not_prepared",
                  error: "PR manifest changed during re-plan; rebuild and reverify this local slice.",
                },
                validation: {
                  ...asObject(prior.validation),
                  status: "not_run",
                  error: "PR manifest changed during re-plan.",
                },
              }
            : {}),
          status: stringValue(prior.status, "planned"),
        },
        context,
      );
    }

    for (const localRecord of localSplitSeriesRecords(repoRoot, baseRef, baseSha, context)) {
      const branch = stringValue(localRecord.branch);
      if (!branch) continue;
      const prior = previousByBranch.get(branch) ?? {};
      previousByBranch.delete(branch);
      setPrRecord(
        recordsByBranch,
        branch,
        {
          ...localRecord,
          ...prior,
          sourcePlan: {
            ...asObject(localRecord.sourcePlan),
            ...asObject(prior.sourcePlan),
          },
          local: {
            ...asObject(prior.local),
            ...asObject(localRecord.local),
          },
          validation: {
            ...asObject(localRecord.validation),
            ...asObject(prior.validation),
          },
          batch: {
            ...asObject(localRecord.batch),
            ...asObject(prior.batch),
          },
          files: asArray(prior.files).length > 0 ? asArray(prior.files) : asArray(localRecord.files),
          status: stringValue(prior.status, stringValue(localRecord.status, "planned")),
        },
        context,
      );
    }

    // A record whose slice vanished from the plan stays tracked once it has a
    // PR or points at local operator work. Merged work drops out of later plans,
    // and local split branches can exist without GitHub PRs yet; neither should
    // disappear from the board just because the active split-plan artifact moved.
    for (const leftover of previousByBranch.values()) {
      if (shouldKeepUnplannedPrRecord(leftover, repoRoot)) {
        const branch = stringValue(leftover.branch);
        if (branch) setPrRecord(recordsByBranch, branch, normalizePrRecord(leftover, context), context);
      }
    }

    const repoSlug = upstreamRepoSlug(repoRoot, runGitQuiet);
    let upstreamOpen: number | null = null;
    let warning = "";
    if (repoSlug) {
      const list = await deps.runCli(
        ["gh", "pr", "list", "--repo", repoSlug, "--state", "all", "--limit", "100", "--json", "number,title,state,isDraft,url,headRefName,author,reviewDecision,updatedAt,mergeCommit"],
        repoRoot,
      );
      if (list.exitCode === 0) {
        const pulls = (JSON.parse(list.stdout || "[]") as unknown[]).map(asObject);
        const byHead = new Map(pulls.map((pr) => [stringValue(pr.headRefName), pr]));
        const importHeads = new Set<string>();
        for (const pr of pulls) {
          const head = stringValue(pr.headRefName);
          if (!splitSeriesMatch(head)) continue;
          importHeads.add(head);
          if (!recordsByBranch.has(head)) {
            setPrRecord(
              recordsByBranch,
              head,
              {
                sliceId: head.replace(/^codex\/split-/, "split-"),
                displayName: splitSeriesTitle(head, 14),
                branch: head,
                title: stringValue(pr.title, splitSeriesTitle(head, 14)),
                scope: "split-series",
                status: prStatusFromGithub(pr),
                sourcePlan: {
                  source: "github_import",
                  importedAt: new Date().toISOString(),
                },
                local: {
                  status: "remote_only",
                  branch: head,
                },
              },
              context,
            );
          }
        }

        for (const branch of importHeads) {
          const record = recordsByBranch.get(branch);
          const pr = byHead.get(branch);
          if (!record || !pr) continue;
          recordsByBranch.set(branch, await hydratePrRecordFromGithub(record, pr, repoSlug, repoRoot, stateDir));
        }

        for (const [branch, record] of [...recordsByBranch.entries()]) {
          if (importHeads.has(branch)) continue;
          const pr = byHead.get(branch);
          if (!pr) continue;
          recordsByBranch.set(branch, await hydratePrRecordFromGithub(record, pr, repoSlug, repoRoot, stateDir));
        }

        const trackedHeads = new Set([...recordsByBranch.values()].map((record) => stringValue(record.branch)));
        upstreamOpen = pulls.filter((pr) => stringValue(pr.state).toUpperCase() === "OPEN" && !trackedHeads.has(stringValue(pr.headRefName))).length;
      } else {
        warning = `gh pr list failed (${list.exitCode}): ${deps.outputTail(list.stderr, 300)}`;
      }
    } else {
      warning = "Could not derive the upstream repo from the origin remote.";
    }

    const records = [...recordsByBranch.values()].map((record) => normalizePrRecord(record)).sort(splitSeriesSort);
    const payload = writePrRecords(stateDir, { records, upstreamOpen, repo: repoSlug, syncedAt: new Date().toISOString(), ...(warning ? { warning } : {}) });
    deps.appendLog("ui", `PR sync: ${records.length} tracked record(s)${Number.isFinite(Number(upstreamOpen)) ? `, ${upstreamOpen} other open upstream` : ""}${warning ? ` - ${warning}` : ""}`);
    return payload;
  }

  return {
    branchExists: (repoRoot: string, branch: string) => branchExists(repoRoot, branch, runGitQuiet),
    branchWorktreePaths: (repoRoot: string) => branchWorktreePaths(repoRoot, runGitQuiet),
    hydratePrRecordFromGithub,
    isLocalBranchPrRecord,
    localBranchDiffBase: (repoRoot: string, baseRef: string, branch: string) => localBranchDiffBase(repoRoot, baseRef, branch, runGitQuiet),
    localSplitSeriesRecords,
    mergePrRecord,
    setPrRecord,
    shouldKeepUnplannedPrRecord,
    syncPrRecords,
  };
}
