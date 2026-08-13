import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import {
  type FreshRunStep,
  type JsonObject,
  type PreparingRuntimeDeps,
  type PreparingRuntimeProjectContext,
} from "../runtime-shared.js";

export type PrepareIntakeItemStatus = "pending" | "running" | "complete" | "failed";
export type PrepareIntakeStepStatus = "pending" | "running" | "complete" | "skipped" | "failed";

export interface PrepareIntakeItemState extends JsonObject {
  pr: number;
  status: PrepareIntakeItemStatus;
  retryable: boolean;
  postmortemStatus: PrepareIntakeStepStatus;
  knowledgeStatus: PrepareIntakeStepStatus;
  postmortemPath?: string;
  knowledgeOutputPath?: string;
  startedAt?: string;
  completedAt?: string;
  failedAt?: string;
  error?: string;
}

export interface PrepareIntakeCounts extends JsonObject {
  pending: number;
  running: number;
  complete: number;
  failed: number;
  retryable: number;
  total: number;
}

export interface RunPrIndexForPrepareOptions {
  intakePrs?: number[];
  concurrency?: number;
  onItemsChange?: (items: PrepareIntakeItemState[], counts: PrepareIntakeCounts) => Promise<void> | void;
}

function readJsonObject(path: string): JsonObject {
  if (!existsSync(path)) return {};
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as JsonObject) : {};
  } catch {
    return {};
  }
}

function numberFromPrDir(entry: string): number {
  const match = /^pr-(\d+)$/.exec(entry);
  return match ? Number(match[1]) : NaN;
}

function existingPath(paths: string[]): string {
  return paths.find((path) => existsSync(path)) ?? "";
}

function hasCompleteRawSlice(dataRoot: string, number: number): boolean {
  const prRoot = resolve(dataRoot, "prs", `pr-${number}`);
  const rawRoot = resolve(prRoot, "raw");
  const rawFilesPresent = ["pr.json", "issue_comments.json", "review_comments.json", "reviews.json"].every((file) =>
    Boolean(existingPath([resolve(rawRoot, file), resolve(prRoot, file), resolve(dataRoot, "raw", `${number}_${file}`)])),
  );
  const diffPresent = Boolean(existingPath([resolve(rawRoot, "diff.diff"), resolve(prRoot, "diff.diff"), resolve(dataRoot, "diffs", `${number}.diff`)]));
  return rawFilesPresent && diffPresent;
}

function prIsMerged(dataRoot: string, number: number, fallback = false): boolean {
  const prRoot = resolve(dataRoot, "prs", `pr-${number}`);
  const pr = readJsonObject(existingPath([resolve(prRoot, "raw", "pr.json"), resolve(prRoot, "pr.json"), resolve(dataRoot, "raw", `${number}_pr.json`)]));
  if (!Object.keys(pr).length) return fallback;
  const state = String(pr.state ?? "").toUpperCase();
  return Boolean(pr.merged_at ?? pr.mergedAt) || state === "MERGED";
}

function postmortemPath(dataRoot: string, number: number): string {
  const prRoot = resolve(dataRoot, "prs", `pr-${number}`);
  return existingPath([resolve(prRoot, "postmortem", "postmortem.json"), resolve(prRoot, "postmortem.json")]);
}

function hasValidationIssues(postmortem: JsonObject): boolean {
  return Array.isArray(postmortem.validation_issues) && postmortem.validation_issues.length > 0;
}

export function scanPrIndexDebtForPrepare(
  deps: Pick<PreparingRuntimeDeps, "sourceRoot">,
  paths: PreparingRuntimeProjectContext,
  gitDiscoveredMergedPrs: number[] = [],
): JsonObject {
  const checkedAt = new Date().toISOString();
  const dataRoot = resolve(deps.sourceRoot("past_prs"), "data");
  const prsRoot = resolve(dataRoot, "prs");
  const gitDiscovered = [...new Set(gitDiscoveredMergedPrs.map((value) => Number(value)).filter((value) => Number.isInteger(value) && value > 0))].sort((a, b) => b - a);

  try {
    if (!existsSync(prsRoot)) {
      return {
        status: "unavailable",
        checkedAt,
        dataRoot,
        projectId: paths.project?.projectId ?? "",
        reason: "past PR data root is missing",
      };
    }

    const localNumbers = readdirSync(prsRoot)
      .map(numberFromPrDir)
      .filter((value) => Number.isInteger(value) && value > 0);
    const localNumberSet = new Set(localNumbers);
    const numbers = new Set([...localNumbers, ...gitDiscovered]);
    const gitDiscoveredSet = new Set(gitDiscovered);

    let rawSlicePrs = 0;
    let knownMergedPrs = 0;
    let agentIndexedPrs = 0;
    let agentIndexedMergedPrs = 0;
    let pendingAgentPrs = 0;
    let pendingMergedAgentPrs = 0;
    let missingRawPrs = 0;
    let missingPostmortemPrs = 0;
    let stalePostmortemPrs = 0;
    let validationIssuePrs = 0;
    const pendingSamplePrs: number[] = [];
    const pendingMergedSamplePrs: number[] = [];
    const pendingPrs: number[] = [];
    const pendingMergedPrs: number[] = [];
    const missingRawPrList: number[] = [];
    const missingPostmortemPrList: number[] = [];
    const stalePostmortemPrList: number[] = [];
    const validationIssuePrList: number[] = [];

    for (const number of [...numbers].sort((a, b) => b - a)) {
      const merged = prIsMerged(dataRoot, number, gitDiscoveredSet.has(number));
      if (merged) knownMergedPrs += 1;
      if (hasCompleteRawSlice(dataRoot, number)) {
        rawSlicePrs += 1;
      } else {
        missingRawPrs += 1;
        missingRawPrList.push(number);
      }

      const currentPostmortemPath = postmortemPath(dataRoot, number);
      const postmortem = currentPostmortemPath ? readJsonObject(currentPostmortemPath) : {};
      const hasPostmortem = Boolean(currentPostmortemPath && Object.keys(postmortem).length);
      const validationIssues = hasPostmortem && hasValidationIssues(postmortem);
      const agentCompleted = hasPostmortem && postmortem.agent_status === "agent_completed" && !validationIssues;

      if (agentCompleted) {
        agentIndexedPrs += 1;
        if (merged) agentIndexedMergedPrs += 1;
        continue;
      }

      pendingAgentPrs += 1;
      if (merged) pendingMergedAgentPrs += 1;
      pendingPrs.push(number);
      if (merged) pendingMergedPrs.push(number);
      if (!hasPostmortem) {
        missingPostmortemPrs += 1;
        missingPostmortemPrList.push(number);
      } else if (validationIssues) {
        validationIssuePrs += 1;
        validationIssuePrList.push(number);
      } else {
        stalePostmortemPrs += 1;
        stalePostmortemPrList.push(number);
      }
      if (pendingSamplePrs.length < 12) pendingSamplePrs.push(number);
      if (merged && pendingMergedSamplePrs.length < 12) pendingMergedSamplePrs.push(number);
    }

    return {
      status: "available",
      checkedAt,
      dataRoot,
      projectId: paths.project?.projectId ?? "",
      knownPrs: numbers.size,
      localPrs: localNumberSet.size,
      knownMergedPrs,
      rawSlicePrs,
      agentIndexedPrs,
      agentIndexedMergedPrs,
      pendingAgentPrs,
      pendingMergedAgentPrs,
      missingRawPrs,
      missingPostmortemPrs,
      stalePostmortemPrs,
      validationIssuePrs,
      gitDiscoveredPrs: gitDiscovered,
      pendingPrs,
      pendingMergedPrs,
      missingRawPrsList: missingRawPrList,
      missingPostmortemPrsList: missingPostmortemPrList,
      stalePostmortemPrsList: stalePostmortemPrList,
      validationIssuePrsList: validationIssuePrList,
      pendingSamplePrs,
      pendingMergedSamplePrs,
    };
  } catch (error) {
    return {
      status: "error",
      checkedAt,
      dataRoot,
      projectId: paths.project?.projectId ?? "",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function numberArray(value: unknown): number[] {
  return Array.isArray(value)
    ? value.map((item) => Number(item)).filter((item) => Number.isInteger(item) && item > 0)
    : [];
}

export function pendingPrsFromDebt(prIndexDebt: JsonObject, fallbackPrs: number[] = []): number[] {
  const pendingPrs = numberArray(prIndexDebt.pendingPrs);
  const fallback = pendingPrs.length > 0 ? pendingPrs : numberArray(prIndexDebt.pendingSamplePrs);
  return [...new Set([...fallback, ...fallbackPrs])].sort((a, b) => b - a);
}

export function prepareIntakeCounts(items: PrepareIntakeItemState[]): PrepareIntakeCounts {
  return {
    pending: items.filter((item) => item.status === "pending").length,
    running: items.filter((item) => item.status === "running").length,
    complete: items.filter((item) => item.status === "complete").length,
    failed: items.filter((item) => item.status === "failed").length,
    retryable: items.filter((item) => item.status === "failed" && item.retryable).length,
    total: items.length,
  };
}

export async function runPrIndexForPrepare(
  deps: PreparingRuntimeDeps,
  paths: PreparingRuntimeProjectContext,
  mergedPrs: number[],
  dryRunAgents: boolean,
  runId = "",
  options: RunPrIndexForPrepareOptions = {},
): Promise<{ metadata: JsonObject; steps: FreshRunStep[]; items: PrepareIntakeItemState[]; counts: PrepareIntakeCounts; failed: boolean }> {
  void deps;
  void paths;
  void mergedPrs;
  void dryRunAgents;
  void runId;
  void options;
  throw new Error(
    "Preparation PR intake is disabled. Use the operator sync.start workflow so merged-PR postmortems and knowledge publication run under the sync lease.",
  );
}
