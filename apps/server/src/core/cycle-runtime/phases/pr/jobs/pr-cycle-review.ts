/**
 * Cycle-level review, repair, and ledger pipeline for the live checkout.
 *
 * This runs before PR splitting and intentionally leaves validated agent edits
 * in the working tree. Shared queue artifacts are written serially even though
 * file reviews and file-scoped repairs run in bounded parallel pools.
 */
import { existsSync, readFileSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validateQaRepairAgentResult, type QaRepairAgentResult } from "@server/core/agent-catalog/agents/pr/qa-repair";
import { packageRoot } from "@server/core/knowledge";
import { booleanArg, numberArg, stringArg, type GlobalArgs } from "@server/core/game-registry/runtime-options.js";
import { getLatestRun, openState } from "@server/core/cycle-runtime/run-state";
import type { PiPromptBundle } from "@server/core/shared/types";
import { runMeleeKernelPiAgent as runPiAgent } from "@server/infrastructure/agent-runtime/kernel-pi-runner";
import { artifactTimestamp } from "@server/infrastructure/agent-runtime/runtime";
import { createMeleeKernelSpawnContext } from "@server/infrastructure/kernel/bridge/spawn-context";
import { runCommand, type CommandResult } from "@server/infrastructure/shell";
import { runQaScanDiff, type QaScanFinding, type QaScanInvocation, type QaScanResult, type RunQaScanDiffOptions } from "@server/core/validation/qa";
import { withNinjaLock } from "@server/core/validation/qa/repair-checks.js";
import {
  buildQaRepairQueue,
  candidateProofsFromCheckpoint,
  summarizeQaRepairQueue,
  type QaRepairQueue,
  type QaRepairQueueItem,
} from "@server/core/validation/qa/repair-lane";
import { stableHash, type CommentableFinding } from "../github-comments.js";
import { latestCheckpointSummary } from "@server/core/cycle-runtime/phases/pr/checkpoint";
import {
  mergeRepairScanFindings,
  preshipFindingRecordsFromOutcomes,
  type PreshipFindingRecord,
} from "./preship-findings.js";
import {
  reviewOneSlice,
  type PreshipAgentRunner,
  type PreshipPlan,
  type PreshipPlanSlice,
  type PreshipReviewRunOptions,
  type PreshipSliceOutcome,
} from "./pr-preship-review.js";
import {
  mergeProcessedItem,
  processSingleItem,
  writeArtifacts,
  type ProcessSingleItemParams,
  type ProcessedQaRepairItem,
  type QaRepairAgentRunner,
} from "./qa-repair.js";
import {
  REVIEW_LEDGER_SCHEMA_VERSION,
  computeLedgerEntryTier,
  type LedgerEntryTier,
  type LedgerMatchContext,
} from "../review-ledger.js";

const LEDGER_SCHEMA_VERSION = REVIEW_LEDGER_SCHEMA_VERSION;

type CommonLedgerFinding = Pick<
  CommentableFinding,
  "severity" | "file" | "line" | "ruleId" | "standardId" | "message" | "suggestedFix"
>;

export interface CycleReviewLedgerEntry extends Omit<CommonLedgerFinding, "severity" | "file" | "line"> {
  source: "review_lint" | "llm_qa";
  severity: "error" | "warning";
  file: string;
  line: number;
  disposition: "unresolved" | "left_with_evidence" | "false_positive";
  evidence: string | null;
  tier?: LedgerEntryTier;
  match_context?: LedgerMatchContext | null;
}

export interface CycleReviewLedger {
  schema_version: typeof LEDGER_SCHEMA_VERSION;
  run_id: string;
  created_at: string;
  head_sha: string;
  worktree_dirty: boolean;
  base_ref: string;
  entries: CycleReviewLedgerEntry[];
  summary: {
    files_scanned: number;
    files_repaired: number;
    entries: number;
    by_severity: { error: number; warning: number };
    reverted_headers: number;
  };
}

export interface CycleReviewRunOptions {
  globals: GlobalArgs;
  runId: string;
  outputDir: string;
  baseRef: string;
  candidateFiles: string[];
  checkpoint?: unknown;
  concurrency: number;
  runAgents: boolean;
  skipLlmQa: boolean;
  skipConfirm: boolean;
  skipRepair: boolean;
  skipBatchGates: boolean;
  batchGateSize: number;
  maxItems: number;
  repairWarnings: boolean;
  reviewProvider: string;
  reviewModel: string;
  reviewThinking: string;
  confirmProvider: string;
  confirmModel: string;
  confirmThinking: string;
  confirmTimeoutSeconds: number;
  repairProvider: string;
  repairModel: string;
  repairThinking: string;
  scoreCheckCommand?: string;
  buildCheckCommand?: string;
  regressionCheckCommand?: string;
}

type ScanDiffRunner = (options: RunQaScanDiffOptions) => Promise<QaScanInvocation>;
type SliceReviewRunner = (
  slice: PreshipPlanSlice,
  options: PreshipReviewRunOptions,
  runner: PreshipAgentRunner,
) => Promise<PreshipSliceOutcome>;
type RepairItemRunner = (params: ProcessSingleItemParams) => Promise<ProcessedQaRepairItem>;
type CommandRunner = (cwd: string, command: string[]) => Promise<CommandResult>;
type ObjectPathForSource = (sourcePath: string) => string;

export interface CycleReviewDeps {
  scanDiff?: ScanDiffRunner;
  reviewSlice?: SliceReviewRunner;
  processRepairItem?: RepairItemRunner;
  commandRunner?: CommandRunner;
  batchBuildRunner?: CommandRunner;
  sleep?: (ms: number) => Promise<void>;
  preshipAgentRunner?: PreshipAgentRunner;
  confirmAgentRunner?: PreshipAgentRunner;
  qaRepairAgentRunner?: QaRepairAgentRunner;
  objectPathForSource?: ObjectPathForSource;
  now?: () => Date;
  orchestratorRoot?: string;
}

export interface CycleReviewResult {
  queue: QaRepairQueue;
  ledger: CycleReviewLedger;
  mergedScan: QaScanResult;
  outputDir: string;
  llmOutcomes: PreshipSliceOutcome[];
  exitCode: number;
}

interface RepairDispositionRecord {
  file: string;
  ruleId: string;
  line: number | null;
  disposition: "left_with_evidence" | "false_positive";
  evidence: string;
}

interface RepairEvidence {
  dispositions: RepairDispositionRecord[];
  editedFiles: Set<string>;
}

interface LlmReviewBatch {
  outcomes: PreshipSliceOutcome[];
  findings: PreshipFindingRecord[];
  errorCount: number;
}

interface RefutedConfirmFinding {
  finding: PreshipFindingRecord;
  reason: string;
}

interface ConfirmVerdictRecord {
  slug: string;
  finding: PreshipFindingRecord;
  confirmed: boolean;
  reason: string;
  failClosed: boolean;
  verdictPath: string;
}

interface ConfirmBatch {
  confirmed: PreshipFindingRecord[];
  refuted: RefutedConfirmFinding[];
  records: ConfirmVerdictRecord[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\.\/+/, "").replace(/^\/+/, "");
}

function isHeaderPath(path: string): boolean {
  return normalizePath(path).toLowerCase().endsWith(".h");
}

function scanWithFindings(scan: QaScanResult, findings: QaScanFinding[]): QaScanResult {
  const errors = findings.filter((finding) => finding.severity === "error").length;
  const warnings = findings.filter((finding) => finding.severity === "warning").length;
  return {
    ...scan,
    findings,
    counts: { errors, warnings },
    status: errors > 0 ? "failed" : warnings > 0 ? "warned" : "passed",
  };
}

function resolveInputPath(path: string): string {
  return isAbsolute(path) ? resolve(path) : resolve(path);
}

function stringList(value: string): string[] {
  return value
    .split(",")
    .map((item) => normalizePath(item.trim()))
    .filter(Boolean);
}

function candidateListFromFile(path: string): string[] {
  if (!path) return [];
  const raw = readFileSync(resolveInputPath(path), "utf8");
  if (path.endsWith(".json")) {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) return parsed.filter((item): item is string => typeof item === "string").map(normalizePath);
    if (isRecord(parsed) && Array.isArray(parsed.files)) {
      return parsed.files.filter((item): item is string => typeof item === "string").map(normalizePath);
    }
    throw new Error(`--candidate-list ${path} must be a JSON array, or an object with files[]`);
  }
  return raw
    .split(/\r\n|\r|\n/)
    .map((line) => normalizePath(line.trim()))
    .filter((line) => line && !line.startsWith("#"));
}

function latestRunId(stateDir: string): string {
  const store = openState(stateDir);
  try {
    return getLatestRun(store)?.id ?? "manual";
  } finally {
    store.db.close();
  }
}

function latestCheckpointPath(stateDir: string, runId: string): string {
  if (!runId || runId === "manual") return "";
  const store = openState(stateDir);
  try {
    return String(latestCheckpointSummary(store, runId)?.summaryPath ?? "");
  } finally {
    store.db.close();
  }
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8")) as unknown;
}

async function external(deps: CycleReviewDeps, cwd: string, command: string[]): Promise<CommandResult> {
  return (deps.commandRunner ?? runCommand)(cwd, command);
}

async function gitHeadSha(options: CycleReviewRunOptions, deps: CycleReviewDeps): Promise<string> {
  const result = await external(deps, options.globals.repoRoot, ["git", "rev-parse", "HEAD"]);
  if (result.exitCode !== 0 || !result.stdout.trim()) {
    throw new Error(`git rev-parse HEAD failed (${result.exitCode}): ${result.stderr.trim() || result.stdout.trim()}`);
  }
  return result.stdout.trim();
}

async function worktreeDirty(options: CycleReviewRunOptions, deps: CycleReviewDeps): Promise<boolean> {
  const result = await external(deps, options.globals.repoRoot, ["git", "status", "--porcelain"]);
  if (result.exitCode !== 0) {
    throw new Error(`git status --porcelain failed (${result.exitCode}): ${result.stderr.trim() || result.stdout.trim()}`);
  }
  return Boolean(result.stdout.trim());
}

async function changedFiles(options: CycleReviewRunOptions, deps: CycleReviewDeps, candidates: string[]): Promise<string[]> {
  const command = ["git", "diff", "--name-only", options.baseRef, "--"];
  if (candidates.length > 0) command.push(...candidates);
  const result = await external(deps, options.globals.repoRoot, command);
  if (result.exitCode !== 0) {
    throw new Error(`git diff --name-only ${options.baseRef} failed (${result.exitCode}): ${result.stderr.trim() || result.stdout.trim()}`);
  }
  return [...new Set(result.stdout.split(/\r?\n/).map((line) => normalizePath(line.trim())).filter(Boolean))];
}

async function writeScanArtifacts(
  invocation: QaScanInvocation,
  outputDir: string,
  prefix = "qa_scan",
): Promise<{ invocationPath: string; resultPath: string | null }> {
  const invocationPath = resolve(outputDir, `${prefix}_invocation.json`);
  const resultPath = invocation.result ? resolve(outputDir, `${prefix}.json`) : null;
  await writeFile(
    invocationPath,
    `${JSON.stringify(
      {
        command: invocation.command,
        exitCode: invocation.exitCode,
        toolError: invocation.toolError,
        stdout: invocation.stdout,
        stderr: invocation.stderr,
        result: invocation.result,
      },
      null,
      2,
    )}\n`,
  );
  if (resultPath && invocation.result) await writeFile(resultPath, `${JSON.stringify(invocation.result, null, 2)}\n`);
  return { invocationPath, resultPath };
}

async function lintScan(
  options: CycleReviewRunOptions,
  deps: CycleReviewDeps,
  files: string[],
  prefix = "qa_scan",
): Promise<QaScanResult> {
  const invocation = await (deps.scanDiff ?? runQaScanDiff)({
    repoRoot: options.globals.repoRoot,
    orchestratorRoot: deps.orchestratorRoot ?? packageRoot(),
    game: options.globals.game,
    stateDir: options.globals.stateDir,
    baseRef: options.baseRef,
    files: files.length > 0 ? files : undefined,
    includeWorktree: true,
    gate: false,
    surface: "pr_gate",
  });
  await writeScanArtifacts(invocation, options.outputDir, prefix);
  if (invocation.toolError || !invocation.result) {
    throw new Error(`pr-cycle-review scan failed: ${invocation.toolError ?? "missing scanner result"}`);
  }
  return invocation.result;
}

function fileSlug(file: string): string {
  const readable = normalizePath(file)
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase() || "file";
  return `${readable}-${stableHash(normalizePath(file)).slice(0, 8)}`;
}

async function mapPool<T, R>(items: T[], concurrency: number, worker: (item: T, index: number) => Promise<R>): Promise<R[]> {
  if (items.length === 0) return [];
  const results = new Array<R>(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(items.length, Math.max(1, Math.floor(concurrency))) }, async () => {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      results[index] = await worker(items[index]!, index);
    }
  });
  await Promise.all(workers);
  return results;
}

function findingRuleId(finding: PreshipFindingRecord): string {
  const standard = (finding.standardId ?? "review")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase() || "review";
  return `preship_reject_${standard}`;
}

function confirmFindingSlug(finding: PreshipFindingRecord, ordinal: number): string {
  const readable = normalizePath(finding.file)
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
    .slice(-72) || "finding";
  const identity = JSON.stringify({
    file: normalizePath(finding.file),
    line: finding.line,
    standardId: finding.standardId,
    rationale: finding.rationale,
  });
  return `${readable}-${finding.line ?? "unknown"}-${stableHash(identity).slice(0, 10)}-${String(ordinal + 1).padStart(3, "0")}`;
}

/** Extract the new-side line and up to 40 neighboring diff rows from its unified hunk. */
function diffHunkAroundLine(diff: string, targetLine: number | null, radius = 40): string | null {
  if (targetLine === null || !Number.isInteger(targetLine) || targetLine < 1) return null;
  const lines = diff.split(/\r?\n/);
  let newLine: number | null = null;
  let hunkStart = -1;
  let targetIndex = -1;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!;
    const header = /^@@\s+-\d+(?:,\d+)?\s+\+(\d+)(?:,\d+)?\s+@@/.exec(line);
    if (header) {
      newLine = Number(header[1]);
      hunkStart = index;
      continue;
    }
    if (newLine === null || hunkStart < 0) continue;
    if (line.startsWith("diff --git ")) {
      newLine = null;
      hunkStart = -1;
      continue;
    }
    if (line.startsWith("-")) continue;
    if (line.startsWith("\\ No newline at end of file")) continue;
    if (newLine === targetLine) {
      targetIndex = index;
      break;
    }
    newLine += 1;
  }
  if (targetIndex < 0 || hunkStart < 0) return null;
  let hunkEnd = lines.length;
  for (let index = targetIndex + 1; index < lines.length; index += 1) {
    if (lines[index]!.startsWith("@@ ") || lines[index]!.startsWith("diff --git ")) {
      hunkEnd = index;
      break;
    }
  }
  const start = Math.max(hunkStart, targetIndex - radius);
  const selected = lines.slice(start, Math.min(hunkEnd, targetIndex + radius + 1));
  if (start > hunkStart) selected.unshift(lines[hunkStart]!);
  return selected.join("\n").trimEnd();
}

function confirmPrompt(finding: PreshipFindingRecord, diffHunk: string): PiPromptBundle {
  const templatePath = fileURLToPath(import.meta.url);
  return {
    systemPrompt: "You are an adversarial confirmation reviewer. Preserve only maintainer-rejection findings that are directly supported by the cited standard and the visible changed lines.",
    userPrompt: [
      "Finding:",
      JSON.stringify(
        {
          file: finding.file,
          line: finding.line,
          standard_id: finding.standardId,
          rationale: finding.rationale,
        },
        null,
        2,
      ),
      "",
      "Relevant slice diff hunk:",
      "```diff",
      diffHunk,
      "```",
      "",
      "You are a skeptical second reviewer. Decide whether this finding is a defensible maintainer rejection grounded in the cited standard and visible in the diff. Refute it if the evidence is weak, the line is pre-existing code, or the standard is misapplied. Return exactly one JSON object {\"confirmed\": boolean, \"reason\": string}.",
    ].join("\n"),
    systemTemplatePath: templatePath,
    userTemplatePath: templatePath,
  };
}

function parseConfirmVerdict(rawText: string): { confirmed: boolean; reason: string } {
  const parsed = JSON.parse(rawText.trim()) as unknown;
  if (!isRecord(parsed)) throw new Error("confirmation output is not a JSON object");
  const keys = Object.keys(parsed).sort();
  if (keys.length !== 2 || keys[0] !== "confirmed" || keys[1] !== "reason") {
    throw new Error("confirmation output must contain exactly confirmed and reason");
  }
  if (typeof parsed.confirmed !== "boolean" || typeof parsed.reason !== "string") {
    throw new Error("confirmation output has invalid confirmed/reason types");
  }
  return { confirmed: parsed.confirmed, reason: parsed.reason };
}

async function writeConfirmVerdict(params: {
  confirmDir: string;
  slug: string;
  finding: PreshipFindingRecord;
  confirmed: boolean;
  reason: string;
  failClosed: boolean;
  diffPath: string;
}): Promise<ConfirmVerdictRecord> {
  const verdictPath = resolve(params.confirmDir, "verdict.json");
  await writeFile(
    verdictPath,
    `${JSON.stringify(
      {
        schema_version: "pr_cycle_review_confirm_verdict_v1",
        confirmed: params.confirmed,
        reason: params.reason,
        fail_closed: params.failClosed,
        finding: params.finding,
        diff_path: params.diffPath,
      },
      null,
      2,
    )}\n`,
  );
  return {
    slug: params.slug,
    finding: params.finding,
    confirmed: params.confirmed,
    reason: params.reason,
    failClosed: params.failClosed,
    verdictPath,
  };
}

async function confirmOneFinding(params: {
  finding: PreshipFindingRecord;
  options: CycleReviewRunOptions;
  deps: CycleReviewDeps;
  confirmRoot: string;
  slug: string;
}): Promise<ConfirmVerdictRecord> {
  const slug = params.slug;
  const confirmDir = resolve(params.confirmRoot, slug);
  const diffPath = resolve(dirname(params.finding.reviewPath), "slice.diff");
  await mkdir(confirmDir, { recursive: true });
  let diff: string;
  try {
    diff = await readFile(diffPath, "utf8");
  } catch (error) {
    return writeConfirmVerdict({
      confirmDir,
      slug,
      finding: params.finding,
      confirmed: true,
      reason: `Fail-closed: could not read slice diff: ${error instanceof Error ? error.message : String(error)}`,
      failClosed: true,
      diffPath,
    });
  }
  const diffHunk = diffHunkAroundLine(diff, params.finding.line);
  if (!diffHunk) {
    return writeConfirmVerdict({
      confirmDir,
      slug,
      finding: params.finding,
      confirmed: true,
      reason: `Fail-closed: finding line ${params.finding.line ?? "unknown"} was not present in the saved slice diff.`,
      failClosed: true,
      diffPath,
    });
  }

  const runner = params.deps.confirmAgentRunner ?? params.deps.preshipAgentRunner ?? runPiAgent;
  try {
    const result = await runner({
      role: "pr-reviewer",
      cwd: params.options.globals.repoRoot,
      prompt: confirmPrompt(params.finding, diffHunk),
      outputDir: confirmDir,
      dryRun: false,
      provider: params.options.confirmProvider,
      model: params.options.confirmModel,
      thinkingLevel: params.options.confirmThinking,
      timeoutMs: params.options.confirmTimeoutSeconds * 1000,
      toolProfile: { replace: [] },
      toolContext: {
        stateDir: params.options.globals.stateDir,
        game: params.options.globals.game,
      },
      kernelContext: createMeleeKernelSpawnContext({
        kind: "pr-review",
        gameId: params.options.globals.game?.gameId ?? params.options.globals.gameId,
        sessionId: params.options.runId,
        runId: params.options.runId,
        prId: params.options.runId,
        reviewId: `confirm-${slug}-${params.finding.line ?? "unknown"}`,
        phase: "pr-review",
        workingDir: params.options.globals.repoRoot,
        metadata: {
          file: params.finding.file,
          line: params.finding.line,
          standardId: params.finding.standardId,
          sliceId: params.finding.sliceId,
        },
      }),
    });
    if (result.failed || result.providerError) {
      throw new Error(result.error ?? result.providerError ?? "confirmation agent failed");
    }
    const verdict = parseConfirmVerdict(result.rawText);
    return writeConfirmVerdict({
      confirmDir,
      slug,
      finding: params.finding,
      confirmed: verdict.confirmed,
      reason: verdict.reason,
      failClosed: false,
      diffPath,
    });
  } catch (error) {
    return writeConfirmVerdict({
      confirmDir,
      slug,
      finding: params.finding,
      confirmed: true,
      reason: `Fail-closed: ${error instanceof Error ? error.message : String(error)}`,
      failClosed: true,
      diffPath,
    });
  }
}

function incrementConfirmCount(
  counts: Record<string, { confirmed: number; refuted: number }>,
  key: string,
  confirmed: boolean,
): void {
  const row = counts[key] ?? { confirmed: 0, refuted: 0 };
  row[confirmed ? "confirmed" : "refuted"] += 1;
  counts[key] = row;
}

async function runConfirmBatch(params: {
  options: CycleReviewRunOptions;
  deps: CycleReviewDeps;
  findings: PreshipFindingRecord[];
}): Promise<ConfirmBatch> {
  const rejects = params.findings.filter((finding) => finding.verdict === "reject");
  const confirmRoot = resolve(params.options.outputDir, "confirm");
  await mkdir(confirmRoot, { recursive: true });
  const records = await mapPool(rejects, params.options.concurrency, (finding, index) =>
    confirmOneFinding({
      finding,
      options: params.options,
      deps: params.deps,
      confirmRoot,
      slug: confirmFindingSlug(finding, index),
    }),
  );
  const byRule: Record<string, { confirmed: number; refuted: number }> = {};
  const byStandard: Record<string, { confirmed: number; refuted: number }> = {};
  for (const record of records) {
    incrementConfirmCount(byRule, findingRuleId(record.finding), record.confirmed);
    incrementConfirmCount(byStandard, record.finding.standardId ?? "(none)", record.confirmed);
  }
  const confirmed = records.filter((record) => record.confirmed).map((record) => record.finding);
  const refuted = records
    .filter((record) => !record.confirmed)
    .map((record) => ({ finding: record.finding, reason: record.reason }));
  await writeFile(
    resolve(params.options.outputDir, "confirm_summary.json"),
    `${JSON.stringify(
      {
        schema_version: "pr_cycle_review_confirm_summary_v1",
        total: records.length,
        confirmed: confirmed.length,
        refuted: refuted.length,
        by_rule: byRule,
        by_standard: byStandard,
      },
      null,
      2,
    )}\n`,
  );
  return { confirmed, refuted, records };
}

async function runLlmReviewBatch(params: {
  options: CycleReviewRunOptions;
  deps: CycleReviewDeps;
  files: string[];
  reviewRootDir: string;
}): Promise<LlmReviewBatch> {
  const slices = params.files.map((file) => ({
    id: fileSlug(file),
    lane: "match",
    pathspecs: [file],
    title: file,
  }));
  const plan: PreshipPlan = {
    repoRoot: params.options.globals.repoRoot,
    baseRef: params.options.baseRef,
    headRef: "HEAD",
    slices,
  };
  const reviewOptions: PreshipReviewRunOptions = {
    plan,
    selection: { kind: "all" },
    baseRef: params.options.baseRef,
    headRef: "HEAD",
    includeWorktree: true,
    runId: params.options.runId,
    stateDir: params.options.globals.stateDir,
    reviewRootDir: params.reviewRootDir,
    orchestratorRoot: params.deps.orchestratorRoot ?? packageRoot(),
    dryRun: false,
    provider: params.options.reviewProvider,
    model: params.options.reviewModel,
    thinkingLevel: params.options.reviewThinking,
    timeoutMs: params.options.globals.agentTimeoutSeconds ? params.options.globals.agentTimeoutSeconds * 1000 : undefined,
    gameId: params.options.globals.gameId,
    game: params.options.globals.game,
    proposedRuleStorePath: null,
  };
  const reviewSlice = params.deps.reviewSlice ?? reviewOneSlice;
  const agentRunner = params.deps.preshipAgentRunner ?? runPiAgent;
  const outcomes = await mapPool(slices, params.options.concurrency, async (slice) => {
    try {
      return await reviewSlice(slice, reviewOptions, agentRunner);
    } catch (error) {
      return {
        id: slice.id,
        verdict: "error" as const,
        rejectFindings: 0,
        warnFindings: 0,
        reviewPath: null,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });
  return {
    outcomes,
    findings: await preshipFindingRecordsFromOutcomes(outcomes),
    errorCount: outcomes.filter((outcome) => outcome.verdict === "error").length,
  };
}

async function parsedRepairResult(item: QaRepairQueueItem): Promise<QaRepairAgentResult | null> {
  for (const attempt of [...item.attempts].reverse()) {
    if (!attempt.parsedOutputPath) continue;
    try {
      const raw = JSON.parse(await readFile(attempt.parsedOutputPath, "utf8")) as unknown;
      const payload = isRecord(raw) && "parsed" in raw ? raw.parsed : raw;
      const validated = validateQaRepairAgentResult(payload);
      if (validated.result) return validated.result;
    } catch {
      // Invalid/missing agent result artifacts have already affected item status.
    }
  }
  return null;
}

async function collectRepairEvidence(queue: QaRepairQueue): Promise<RepairEvidence> {
  const dispositions: RepairDispositionRecord[] = [];
  const editedFiles = new Set<string>();
  for (const item of queue.items) {
    const result = await parsedRepairResult(item);
    if (!result) continue;
    if (result.edits.length > 0) editedFiles.add(normalizePath(item.source_path));
    for (const row of result.finding_dispositions) {
      if (row.disposition !== "left_with_evidence" && row.disposition !== "false_positive") continue;
      dispositions.push({
        file: normalizePath(item.source_path),
        ruleId: row.rule_id,
        line: row.line,
        disposition: row.disposition,
        evidence: row.evidence,
      });
    }
  }
  return { dispositions, editedFiles };
}

function blockedProcessedItem(item: QaRepairQueueItem, outputDir: string, now: Date, error: unknown): ProcessedQaRepairItem {
  const message = error instanceof Error ? error.message : String(error);
  return {
    item: {
      ...item,
      status: "blocked",
      routing_reason: `pr-cycle-review repair threw: ${message}`,
      attempts: [
        ...item.attempts,
        {
          id: `driver-error-${item.id}`,
          status: "agent_failed",
          createdAt: now.toISOString(),
          outputDir: resolve(outputDir, item.id),
          error: message,
        },
      ],
    },
  };
}

async function repairObjectPathForSource(deps: CycleReviewDeps): Promise<ObjectPathForSource> {
  if (deps.objectPathForSource) return deps.objectPathForSource;
  // This module is owned by the parallel enforced-checks task. Keep the import
  // lazy so this driver can type-check independently while that task lands.
  const moduleId = "@server/core/validation/qa/repair-checks.js";
  const module = await import(moduleId) as { objectPathForSource?: ObjectPathForSource };
  if (typeof module.objectPathForSource !== "function") {
    throw new Error(`${moduleId} does not export objectPathForSource`);
  }
  return module.objectPathForSource;
}

function failedObjectTargets(result: CommandResult): string[] {
  const targets = new Set<string>();
  for (const line of `${result.stdout}\n${result.stderr}`.split(/\r?\n/)) {
    if (!/^\s*FAILED:\s+/.test(line)) continue;
    for (const match of line.matchAll(/build\/GALE01\/[^\s"']+?\.o\b/g)) {
      targets.add(normalizePath(match[0]));
    }
  }
  return [...targets];
}

function hasManifestDirtySignature(result: CommandResult): boolean {
  return `${result.stdout}\n${result.stderr}`.toLowerCase().includes("still dirty after");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

async function runBatchBuildGate(params: {
  options: CycleReviewRunOptions;
  deps: CycleReviewDeps;
  queue: QaRepairQueue;
  completedItems: QaRepairQueueItem[];
  gateIndex: number;
}): Promise<QaRepairQueue> {
  const gateDir = resolve(params.options.outputDir, "batch_gates", `gate-${String(params.gateIndex).padStart(3, "0")}`);
  await mkdir(gateDir, { recursive: true });
  const objectPath = await repairObjectPathForSource(params.deps);
  const completedByObject = new Map(
    params.completedItems.map((item) => [normalizePath(objectPath(normalizePath(item.source_path))), item]),
  );
  const build = params.deps.batchBuildRunner ?? params.deps.commandRunner ?? runCommand;
  const delay = params.deps.sleep ?? sleep;
  let queue = params.queue;
  for (let iteration = 1; iteration <= 10; iteration += 1) {
    const prefix = `iteration-${String(iteration).padStart(2, "0")}`;
    const runBuild = async (artifactPrefix: string): Promise<CommandResult> => {
      let result: CommandResult;
      try {
        result = await withNinjaLock(params.options.globals.repoRoot, () =>
          build(params.options.globals.repoRoot, ["ninja", "changes_all"]),
        );
      } catch (error) {
        throw new Error(`Batch gate ${params.gateIndex} crashed: ${error instanceof Error ? error.message : String(error)}`);
      }
      await writeFile(resolve(gateDir, `${artifactPrefix}.stdout.txt`), result.stdout);
      await writeFile(resolve(gateDir, `${artifactPrefix}.stderr.txt`), result.stderr);
      await writeFile(
        resolve(gateDir, `${artifactPrefix}.json`),
        `${JSON.stringify({ command: ["ninja", "changes_all"], exitCode: result.exitCode }, null, 2)}\n`,
      );
      return result;
    };

    let result = await runBuild(prefix);
    if (result.exitCode !== 0 && hasManifestDirtySignature(result)) {
      await delay(5_000);
      result = await runBuild(`${prefix}-manifest-retry`);
    }
    if (result.exitCode === 0) return queue;

    const targets = failedObjectTargets(result);
    if (targets.length === 0) {
      throw new Error(
        `Batch gate ${params.gateIndex} failed with exit ${result.exitCode}, but no FAILED: build/GALE01/<source>.o target was reported; aborting because the failure cannot be attributed to a completed repair item.`,
      );
    }
    const failedItems = new Map<string, QaRepairQueueItem>();
    const foreignTargets: string[] = [];
    for (const target of targets) {
      const item = completedByObject.get(normalizePath(target));
      if (!item) foreignTargets.push(target);
      else failedItems.set(normalizePath(item.source_path), item);
    }
    if (foreignTargets.length > 0) {
      throw new Error(
        `Batch gate ${params.gateIndex} failed outside the completed repair set (${foreignTargets.join(", ")}); aborting because something else is wrong.`,
      );
    }

    for (const sourcePath of failedItems.keys()) {
      const checkout = await external(params.deps, params.options.globals.repoRoot, ["git", "checkout", "HEAD", "--", sourcePath]);
      if (checkout.exitCode !== 0) {
        throw new Error(
          `Batch gate ${params.gateIndex} could not revert ${sourcePath}: ${checkout.stderr.trim() || checkout.stdout.trim()}`,
        );
      }
      console.error(`[pr-cycle-review] BATCH GATE REVERT: ${sourcePath} (batch_gate_build_failure)`);
    }
    const failedSources = new Set(failedItems.keys());
    queue = {
      ...queue,
      items: queue.items.map((item) =>
        failedSources.has(normalizePath(item.source_path))
          ? { ...item, status: "needs_rework" as const, routing_reason: "batch_gate_build_failure" }
          : item,
      ),
    };
    await writeArtifacts(queue, params.options.outputDir);
  }
  throw new Error(`Batch gate ${params.gateIndex} did not pass after 10 iterations.`);
}

function decodePorcelainPath(path: string): string {
  const trimmed = path.trim();
  if (!trimmed.startsWith("\"") || !trimmed.endsWith("\"")) return trimmed;
  try {
    return JSON.parse(trimmed) as string;
  } catch {
    return trimmed.slice(1, -1);
  }
}

function modifiedHeaderPaths(porcelain: string): string[] {
  const headers = new Set<string>();
  for (const line of porcelain.split(/\r?\n/)) {
    if (line.length < 4 || line.startsWith("?? ") || line.startsWith("!! ")) continue;
    const rawPath = line.slice(3);
    const path = decodePorcelainPath(rawPath.includes(" -> ") ? rawPath.split(" -> ").at(-1)! : rawPath);
    if (isHeaderPath(path)) headers.add(normalizePath(path));
  }
  return [...headers].sort();
}

async function revertModifiedHeaders(options: CycleReviewRunOptions, deps: CycleReviewDeps): Promise<number> {
  const status = await external(deps, options.globals.repoRoot, ["git", "status", "--porcelain"]);
  if (status.exitCode !== 0) {
    throw new Error(`Header guard git status failed (${status.exitCode}): ${status.stderr.trim() || status.stdout.trim()}`);
  }
  const headers = modifiedHeaderPaths(status.stdout);
  for (const header of headers) {
    const checkout = await external(deps, options.globals.repoRoot, ["git", "checkout", "HEAD", "--", header]);
    if (checkout.exitCode !== 0) {
      throw new Error(`Header guard could not revert ${header}: ${checkout.stderr.trim() || checkout.stdout.trim()}`);
    }
    console.error(`[pr-cycle-review] HEADER POLICY REVERTED MODIFIED HEADER: ${header}`);
  }
  return headers.length;
}

async function repairQueue(
  options: CycleReviewRunOptions,
  deps: CycleReviewDeps,
  initialQueue: QaRepairQueue,
): Promise<QaRepairQueue> {
  let queue = initialQueue;
  const queueSummary = summarizeQaRepairQueue(queue);
  const selected = queue.items.slice(0, Math.max(0, Math.floor(options.maxItems)));
  const processItem = deps.processRepairItem ?? processSingleItem;
  const runner = deps.qaRepairAgentRunner ?? runPiAgent;
  const enforcedCheckOptions: any = { enforcedChecks: true };
  let writer = Promise.resolve();
  const mergeAndWrite = (processed: ProcessedQaRepairItem): Promise<void> => {
    writer = writer.then(async () => {
      queue = mergeProcessedItem(queue, processed);
      await writeArtifacts(queue, options.outputDir);
    });
    return writer;
  };

  const processBatchItem = async (item: QaRepairQueueItem): Promise<ProcessedQaRepairItem> => {
    let processed: ProcessedQaRepairItem;
    try {
      processed = await processItem({
        globals: options.globals,
        runId: options.runId,
        item,
        queueSummary,
        outputDir: options.outputDir,
        baseRef: options.baseRef,
        validationCommands: {
          score: options.scoreCheckCommand ?? "",
          build: options.buildCheckCommand ?? "",
        },
        runner,
        agentOverrides: {
          provider: options.repairProvider,
          model: options.repairModel,
          thinkingLevel: options.repairThinking,
        },
        ...enforcedCheckOptions,
      });
    } catch (error) {
      processed = blockedProcessedItem(item, options.outputDir, deps.now?.() ?? new Date(), error);
    }
    await mergeAndWrite(processed);
    return processed;
  };

  const batchSize = options.skipBatchGates
    ? Math.max(1, selected.length)
    : Math.max(1, Math.floor(options.batchGateSize));
  const completedItems: QaRepairQueueItem[] = [];
  const inFlight = new Set<Promise<void>>();
  const concurrency = Math.max(1, Math.floor(options.concurrency));
  let nextItem = 0;
  let completedSinceGate = 0;
  let gateIndex = 0;
  let repairFailure: { error: unknown } | null = null;

  const dispatch = (item: QaRepairQueueItem): void => {
    let task!: Promise<void>;
    task = processBatchItem(item)
      .then(() => {
        completedItems.push(item);
        completedSinceGate += 1;
      })
      .catch((error) => {
        repairFailure ??= { error };
      })
      .finally(() => {
        inFlight.delete(task);
      });
    inFlight.add(task);
  };

  const quiesceRepairs = async (): Promise<void> => {
    await Promise.all([...inFlight]);
    try {
      await writer;
    } catch (error) {
      repairFailure ??= { error };
    }
    if (repairFailure) throw repairFailure.error;
  };

  const runQuiescedGate = async (): Promise<void> => {
    await quiesceRepairs();
    if (!options.skipBatchGates && completedSinceGate > 0) {
      gateIndex += 1;
      queue = await runBatchBuildGate({ options, deps, queue, completedItems, gateIndex });
      completedSinceGate = 0;
    }
  };

  while (nextItem < selected.length || inFlight.size > 0) {
    while (
      nextItem < selected.length
      && inFlight.size < concurrency
      && (options.skipBatchGates || completedSinceGate < batchSize)
    ) {
      dispatch(selected[nextItem]!);
      nextItem += 1;
    }
    if (inFlight.size === 0) break;
    await Promise.race([...inFlight]);
    if (repairFailure) await quiesceRepairs();
    if (!options.skipBatchGates && completedSinceGate >= batchSize) {
      await runQuiescedGate();
    }
  }

  if (!options.skipBatchGates && completedSinceGate > 0) await runQuiescedGate();
  else await quiesceRepairs();
  return queue;
}

async function runRegressionGate(params: {
  options: CycleReviewRunOptions;
  deps: CycleReviewDeps;
  queue: QaRepairQueue;
  editedFiles: Set<string>;
}): Promise<{ queue: QaRepairQueue; failed: boolean; infrastructureError: boolean; note: string | null }> {
  const command = params.options.regressionCheckCommand;
  if (!command) return { queue: params.queue, failed: false, infrastructureError: false, note: null };
  const summaryPath = resolve(params.options.outputDir, "regression_check.summary.json");
  const stdoutPath = resolve(params.options.outputDir, "regression_check.stdout.txt");
  const stderrPath = resolve(params.options.outputDir, "regression_check.stderr.txt");
  let result: CommandResult;
  try {
    result = await external(params.deps, params.options.globals.repoRoot, ["/bin/sh", "-lc", command]);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await writeFile(summaryPath, `${JSON.stringify({ status: "error", command, error: message }, null, 2)}\n`);
    return { queue: params.queue, failed: false, infrastructureError: true, note: `Regression command crashed: ${message}` };
  }
  await writeFile(stdoutPath, result.stdout);
  await writeFile(stderrPath, result.stderr);
  if (result.exitCode < 0) {
    await writeFile(summaryPath, `${JSON.stringify({ status: "error", command, exitCode: result.exitCode, stdoutPath, stderrPath }, null, 2)}\n`);
    return {
      queue: params.queue,
      failed: false,
      infrastructureError: true,
      note: `Regression command crashed with exit ${result.exitCode}.`,
    };
  }
  if (result.exitCode === 0) {
    await writeFile(summaryPath, `${JSON.stringify({ status: "passed", command, exitCode: 0, stdoutPath, stderrPath }, null, 2)}\n`);
    return { queue: params.queue, failed: false, infrastructureError: false, note: null };
  }

  const note = `Regression gate failed with exit ${result.exitCode}; conservative v1 policy marked every clean edited item needs_rework.`;
  const queue = {
    ...params.queue,
    items: params.queue.items.map((item) => {
      const edited = params.editedFiles.has(normalizePath(item.source_path));
      const clean = item.status === "clean_same_match" || item.status === "clean_lower_score";
      return edited && clean ? { ...item, status: "needs_rework" as const, routing_reason: note } : item;
    }),
  };
  await writeFile(
    summaryPath,
    `${JSON.stringify({ status: "failed", command, exitCode: result.exitCode, stdoutPath, stderrPath, policy: note }, null, 2)}\n`,
  );
  console.error(`[pr-cycle-review] ${note}`);
  return { queue, failed: true, infrastructureError: false, note };
}

function sourceForFinding(finding: QaScanFinding): CycleReviewLedgerEntry["source"] {
  return finding.detail?.source === "preship" ? "llm_qa" : "review_lint";
}

function unresolvedLedgerEntry(finding: QaScanFinding): CycleReviewLedgerEntry {
  return {
    source: sourceForFinding(finding),
    severity: finding.severity,
    file: normalizePath(finding.file),
    line: finding.line,
    ruleId: finding.rule_id,
    standardId: finding.standard_id,
    message: finding.message,
    suggestedFix: null,
    disposition: "unresolved",
    evidence: null,
  };
}

function refutedLedgerEntry(refuted: RefutedConfirmFinding): CycleReviewLedgerEntry {
  return {
    source: "llm_qa",
    severity: "warning",
    file: normalizePath(refuted.finding.file),
    line: refuted.finding.line ?? 1,
    ruleId: findingRuleId(refuted.finding),
    standardId: refuted.finding.standardId,
    message: `${refuted.finding.rationale} Confirmation refuted this rejection: ${refuted.reason}`,
    suggestedFix: refuted.finding.suggestedFix,
    disposition: "unresolved",
    evidence: null,
  };
}

function dispositionKey(file: string, ruleId: string): string {
  return `${normalizePath(file)}\0${ruleId}`;
}

interface FunctionSpan {
  name: string;
  startLine: number;
  endLine: number;
}

interface ReportFunctionMatch {
  fuzzyPercent: number | null;
  exact: boolean | null;
}

function structuralSourceLine(line: string, state: { blockComment: boolean }): string {
  let output = "";
  let quote: '"' | "'" | null = null;
  let escaped = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]!;
    const next = line[index + 1] ?? "";
    if (state.blockComment) {
      if (char === "*" && next === "/") {
        state.blockComment = false;
        output += "  ";
        index += 1;
      } else {
        output += " ";
      }
      continue;
    }
    if (quote) {
      output += " ";
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === quote) quote = null;
      continue;
    }
    if (char === "/" && next === "*") {
      state.blockComment = true;
      output += "  ";
      index += 1;
      continue;
    }
    if (char === "/" && next === "/") {
      output += " ".repeat(line.length - index);
      break;
    }
    if (char === '"' || char === "'") {
      quote = char;
      output += " ";
      continue;
    }
    output += char;
  }
  return output;
}

/** A deliberately light C parser: top-level brace spans plus the last call-shaped identifier in the definition header. */
function sourceFunctionSpans(source: string): FunctionSpan[] {
  const spans: FunctionSpan[] = [];
  const commentState = { blockComment: false };
  let depth = 0;
  let signature = "";
  let signatureStartLine = 1;
  let active: Omit<FunctionSpan, "endLine"> | null = null;
  const controlNames = new Set(["if", "for", "while", "switch"]);
  const lines = source.split(/\r?\n/);

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const lineNumber = lineIndex + 1;
    const structural = structuralSourceLine(lines[lineIndex]!, commentState);
    if (depth === 0 && structural.trimStart().startsWith("#")) {
      signature = "";
      signatureStartLine = lineNumber + 1;
      continue;
    }
    if (depth === 0 && !signature.trim()) signatureStartLine = lineNumber;

    for (const char of structural) {
      if (depth === 0) {
        if (char === ";" || char === "}") {
          signature = "";
          signatureStartLine = lineNumber;
          continue;
        }
        if (char === "{") {
          const names = [...signature.matchAll(/([A-Za-z_]\w*)\s*\(/g)];
          const name = names.at(-1)?.[1] ?? "";
          const looksLikeInitializer = signature.slice(0, names.at(-1)?.index ?? signature.length).includes("=");
          if (name && !controlNames.has(name) && !looksLikeInitializer) {
            active = { name, startLine: signatureStartLine };
          }
          signature = "";
          depth = 1;
          continue;
        }
        signature += char;
        continue;
      }

      if (char === "{") depth += 1;
      else if (char === "}") {
        depth -= 1;
        if (depth === 0) {
          if (active) spans.push({ ...active, endLine: lineNumber });
          active = null;
          signature = "";
          signatureStartLine = lineNumber;
        }
      }
    }
    if (depth === 0 && signature) signature += "\n";
  }
  return spans;
}

function numberOrNull(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return null;
}

function reportFunctionMatches(raw: unknown): Map<string, Map<string, ReportFunctionMatch>> {
  const matches = new Map<string, Map<string, ReportFunctionMatch>>();
  const units = isRecord(raw) && Array.isArray(raw.units) ? raw.units : [];
  for (const rawUnit of units) {
    if (!isRecord(rawUnit)) continue;
    const metadata = isRecord(rawUnit.metadata) ? rawUnit.metadata : {};
    const sourcePath = normalizePath(typeof metadata.source_path === "string" ? metadata.source_path : "");
    if (!sourcePath || !Array.isArray(rawUnit.functions)) continue;
    const functions = matches.get(sourcePath) ?? new Map<string, ReportFunctionMatch>();
    for (const rawFunction of rawUnit.functions) {
      if (!isRecord(rawFunction) || typeof rawFunction.name !== "string" || !rawFunction.name) continue;
      const fuzzyPercent = numberOrNull(rawFunction.fuzzy_match_percent);
      functions.set(rawFunction.name, {
        fuzzyPercent,
        exact: fuzzyPercent === null ? null : fuzzyPercent >= 100,
      });
    }
    matches.set(sourcePath, functions);
  }
  return matches;
}

function repairRevertedByFile(queue: QaRepairQueue): Map<string, string> {
  const reasons = new Map<string, string>();
  for (const item of queue.items) {
    if (item.status !== "needs_rework" && item.status !== "blocked") continue;
    const lastAttempt = item.attempts.at(-1);
    const rawAttempt: Record<string, unknown> = isRecord(lastAttempt) ? lastAttempt : {};
    const reason = [rawAttempt.reason, item.routing_reason, rawAttempt.error, rawAttempt.summary]
      .find((value): value is string => typeof value === "string" && Boolean(value.trim()));
    if (reason) reasons.set(normalizePath(item.source_path), reason.trim());
  }
  return reasons;
}

async function enrichCycleReviewLedger(
  options: CycleReviewRunOptions,
  deps: CycleReviewDeps,
  ledger: CycleReviewLedger,
  queue: QaRepairQueue,
): Promise<CycleReviewLedger> {
  const files = [...new Set(ledger.entries.map((entry) => normalizePath(entry.file)).filter(Boolean))];
  const sourceByFile = new Map<string, string>();
  await Promise.all(files.map(async (file) => {
    try {
      const result = await external(deps, options.globals.repoRoot, ["git", "show", `${ledger.head_sha}:${file}`]);
      if (result.exitCode === 0) sourceByFile.set(file, result.stdout);
    } catch {
      // Match context is advisory; a missing historical blob must not prevent ledger creation.
    }
  }));

  const reportPath = resolve(
    options.globals.repoRoot,
    options.globals.game?.validation.reportPath || "build/GALE01/report.json",
  );
  let functionMatches = new Map<string, Map<string, ReportFunctionMatch>>();
  try {
    functionMatches = reportFunctionMatches(JSON.parse(await readFile(reportPath, "utf8")) as unknown);
  } catch {
    // Builds without a report still get function/revert context with null match values.
  }
  const revertedByFile = repairRevertedByFile(queue);

  return {
    ...ledger,
    entries: ledger.entries.map((entry) => {
      const file = normalizePath(entry.file);
      const span = sourceByFile.get(file)
        ? sourceFunctionSpans(sourceByFile.get(file)!).find((candidate) => entry.line >= candidate.startLine && entry.line <= candidate.endLine)
        : null;
      const match = span ? functionMatches.get(file)?.get(span.name) : null;
      return {
        ...entry,
        tier: computeLedgerEntryTier(entry),
        match_context: {
          function: span?.name ?? null,
          fuzzy_percent: match?.fuzzyPercent ?? null,
          exact: match?.exact ?? null,
          repair_reverted: revertedByFile.get(file) ?? null,
        },
      };
    }),
  };
}

/** Build ledger entries from the final findings plus evidence-backed retained findings. */
export function buildCycleReviewLedger(params: {
  runId: string;
  createdAt: string;
  headSha: string;
  worktreeDirty: boolean;
  baseRef: string;
  finalScan: QaScanResult;
  queue: QaRepairQueue;
  repairEvidence: RepairEvidence;
  filesScanned: number;
  carriedEntries: CycleReviewLedgerEntry[];
  revertedHeaders: number;
}): CycleReviewLedger {
  const dispositionByKey = new Map(params.repairEvidence.dispositions.map((row) => [dispositionKey(row.file, row.ruleId), row]));
  const finalKeys = new Set<string>();
  const entries: CycleReviewLedgerEntry[] = params.finalScan.findings.map((finding) => {
    const key = dispositionKey(finding.file, finding.rule_id);
    finalKeys.add(key);
    const disposition = dispositionByKey.get(key);
    return {
      source: sourceForFinding(finding),
      severity: finding.severity,
      file: normalizePath(finding.file),
      line: finding.line,
      ruleId: finding.rule_id,
      standardId: finding.standard_id,
      message: finding.message,
      suggestedFix: null,
      disposition: disposition?.disposition ?? "unresolved",
      evidence: disposition?.evidence ?? null,
    };
  });

  for (const disposition of params.repairEvidence.dispositions) {
    const key = dispositionKey(disposition.file, disposition.ruleId);
    if (finalKeys.has(key)) continue;
    const original = params.queue.all_findings.find(
      (finding) => dispositionKey(finding.file, finding.rule_id) === key,
    );
    if (!original) continue;
    entries.push({
      source: sourceForFinding(original),
      severity: original.severity,
      file: normalizePath(original.file),
      line: disposition.line ?? original.line,
      ruleId: original.rule_id,
      standardId: original.standard_id,
      message: original.message,
      suggestedFix: null,
      disposition: disposition.disposition,
      evidence: disposition.evidence,
    });
  }

  const entryIdentity = (entry: CycleReviewLedgerEntry): string =>
    `${entry.source}\0${entry.severity}\0${normalizePath(entry.file ?? "")}\0${entry.line ?? ""}\0${entry.ruleId ?? ""}\0${entry.message}`;
  const entryIdentities = new Set(entries.map(entryIdentity));
  for (const carried of params.carriedEntries) {
    const identity = entryIdentity(carried);
    if (entryIdentities.has(identity)) continue;
    entries.push(carried);
    entryIdentities.add(identity);
  }

  entries.sort((left, right) => {
    const fileOrder = String(left.file ?? "").localeCompare(String(right.file ?? ""));
    if (fileOrder !== 0) return fileOrder;
    const lineOrder = (left.line ?? 0) - (right.line ?? 0);
    return lineOrder !== 0 ? lineOrder : String(left.ruleId ?? "").localeCompare(String(right.ruleId ?? ""));
  });
  const bySeverity = {
    error: entries.filter((entry) => entry.severity === "error").length,
    warning: entries.filter((entry) => entry.severity === "warning").length,
  };
  return {
    schema_version: LEDGER_SCHEMA_VERSION,
    run_id: params.runId,
    created_at: params.createdAt,
    head_sha: params.headSha,
    worktree_dirty: params.worktreeDirty,
    base_ref: params.baseRef,
    entries: entries.map((entry) => ({
      ...entry,
      tier: computeLedgerEntryTier(entry),
      match_context: entry.match_context ?? null,
    })),
    summary: {
      files_scanned: params.filesScanned,
      files_repaired: params.repairEvidence.editedFiles.size,
      entries: entries.length,
      by_severity: bySeverity,
      reverted_headers: params.revertedHeaders,
    },
  };
}

function renderLedgerMarkdown(ledger: CycleReviewLedger, regressionNote: string | null): string {
  const lines = [
    "# PR cycle review ledger",
    "",
    `Run: \`${ledger.run_id}\``,
    `Base: \`${ledger.base_ref}\``,
    `HEAD: \`${ledger.head_sha}\``,
    `Worktree dirty: ${ledger.worktree_dirty ? "yes" : "no"}`,
    "",
    `Entries: ${ledger.summary.entries} (${ledger.summary.by_severity.error} error, ${ledger.summary.by_severity.warning} warning)`,
  ];
  if (regressionNote) lines.push("", `> ${regressionNote}`);
  const grouped = new Map<string, CycleReviewLedgerEntry[]>();
  for (const entry of ledger.entries) {
    const file = entry.file ?? "(no file)";
    const group = grouped.get(file) ?? [];
    group.push(entry);
    grouped.set(file, group);
  }
  for (const [file, entries] of grouped) {
    lines.push("", `## ${file}`, "");
    for (const entry of entries) {
      const location = entry.line === null ? "" : `:${entry.line}`;
      lines.push(`- **${entry.severity}** \`${entry.ruleId ?? "review"}\`${location} — ${entry.message}`);
      lines.push(`  - Disposition: ${entry.disposition}`);
      if (entry.evidence) lines.push(`  - Evidence: ${entry.evidence}`);
    }
  }
  if (ledger.entries.length === 0) lines.push("", "No findings.");
  lines.push("");
  return lines.join("\n");
}

async function writeLedger(
  options: CycleReviewRunOptions,
  ledger: CycleReviewLedger,
  regressionNote: string | null,
): Promise<void> {
  const latestDir = resolve(options.globals.stateDir, "pr_cycle_review", options.runId);
  await mkdir(latestDir, { recursive: true });
  const json = `${JSON.stringify(ledger, null, 2)}\n`;
  await writeFile(resolve(options.outputDir, "ledger.json"), json);
  await writeFile(resolve(options.outputDir, "ledger.md"), renderLedgerMarkdown(ledger, regressionNote));
  await writeFile(resolve(latestDir, "ledger.json"), json);
}

function mergedFinalScan(lint: QaScanResult, llmFindings: PreshipFindingRecord[]): QaScanResult {
  return mergeRepairScanFindings(lint, llmFindings, true);
}

/** Run the parsed cycle review pipeline. No git commit is created. */
export async function runCycleReview(
  options: CycleReviewRunOptions,
  deps: CycleReviewDeps = {},
): Promise<CycleReviewResult> {
  await mkdir(options.outputDir, { recursive: true });
  const dry = !options.runAgents || options.globals.dryRunAgents;
  const scanCandidates = [...new Set(options.candidateFiles.map(normalizePath).filter(Boolean))];
  const initialScan = await lintScan(options, deps, scanCandidates);
  const headSha = await gitHeadSha(options, deps);
  let reviewFiles: string[] = [];
  let initialLlm: LlmReviewBatch = { outcomes: [], findings: [], errorCount: 0 };

  if (!dry && !options.skipLlmQa) {
    reviewFiles = await changedFiles(options, deps, scanCandidates);
    initialLlm = await runLlmReviewBatch({
      options,
      deps,
      files: reviewFiles,
      reviewRootDir: resolve(options.outputDir, "llm_qa"),
    });
    await writeFile(resolve(options.outputDir, "llm_qa_outcomes.json"), `${JSON.stringify(initialLlm.outcomes, null, 2)}\n`);
  }
  let refutedFindings: RefutedConfirmFinding[] = [];
  let initialLlmFindings = initialLlm.findings;
  if (!dry && !options.skipLlmQa && !options.skipConfirm) {
    const confirmation = await runConfirmBatch({ options, deps, findings: initialLlm.findings });
    refutedFindings = confirmation.refuted;
    initialLlmFindings = [
      ...initialLlm.findings.filter((finding) => finding.verdict !== "reject"),
      ...confirmation.confirmed,
    ];
  }
  const mergedScan = mergeRepairScanFindings(initialScan, initialLlmFindings, true);
  await writeFile(resolve(options.outputDir, "merged_scan.json"), `${JSON.stringify(mergedScan, null, 2)}\n`);

  const carriedEntries = [
    ...mergedScan.findings.filter((finding) => isHeaderPath(finding.file)).map(unresolvedLedgerEntry),
    ...refutedFindings.map(refutedLedgerEntry),
  ];

  const queueCandidates = (scanCandidates.length > 0 ? scanCandidates : reviewFiles).filter((file) => !isHeaderPath(file));
  const queueScan = scanWithFindings(
    mergedScan,
    mergedScan.findings.filter((finding) => !isHeaderPath(finding.file)),
  );
  let queue = buildQaRepairQueue({
    runId: options.runId,
    repoRoot: options.globals.repoRoot,
    baseRef: options.baseRef,
    headSha,
    scanResult: queueScan,
    checkpoint: options.checkpoint,
    candidateFiles: queueCandidates,
    includeImprovementCandidates: true,
    includeAllScanFilesWhenNoCandidates: queueCandidates.length === 0,
    repairWarnings: options.repairWarnings,
    createdAt: (deps.now?.() ?? new Date()).toISOString(),
    dryRun: dry,
  });
  await writeArtifacts(queue, options.outputDir);

  if (dry) {
    const evidence: RepairEvidence = { dispositions: [], editedFiles: new Set() };
    let ledger = buildCycleReviewLedger({
      runId: options.runId,
      createdAt: (deps.now?.() ?? new Date()).toISOString(),
      headSha,
      worktreeDirty: await worktreeDirty(options, deps),
      baseRef: options.baseRef,
      finalScan: initialScan,
      queue,
      repairEvidence: evidence,
      filesScanned: scanCandidates.length || new Set(initialScan.findings.map((finding) => normalizePath(finding.file))).size,
      carriedEntries,
      revertedHeaders: 0,
    });
    ledger = await enrichCycleReviewLedger(options, deps, ledger, queue);
    await writeLedger(options, ledger, null);
    return { queue, ledger, mergedScan, outputDir: options.outputDir, llmOutcomes: [], exitCode: 0 };
  }

  let revertedHeaders = 0;
  if (!options.skipRepair) {
    if (queue.items.length > 0) queue = await repairQueue(options, deps, queue);
    revertedHeaders = await revertModifiedHeaders(options, deps);
  }
  let evidence = await collectRepairEvidence(queue);
  let regressionNote: string | null = null;
  let infrastructureFailure = false;
  if (queue.items.length > 0 && !options.skipRepair && options.regressionCheckCommand) {
    const regression = await runRegressionGate({ options, deps, queue, editedFiles: evidence.editedFiles });
    queue = regression.queue;
    regressionNote = regression.note;
    infrastructureFailure = regression.infrastructureError;
    await writeArtifacts(queue, options.outputDir);
  }

  const finalLint = await lintScan(options, deps, scanCandidates, "final_qa_scan");
  const initialLlmFiles = new Set(initialLlm.findings.map((finding) => normalizePath(finding.file)).filter(Boolean));
  const finalLlmCandidates = [...new Set([...evidence.editedFiles, ...initialLlmFiles])];
  const finalReviewFiles = options.skipLlmQa || finalLlmCandidates.length === 0
    ? []
    : await changedFiles(options, deps, finalLlmCandidates);
  const finalLlm = options.skipLlmQa
    ? { outcomes: [], findings: [], errorCount: 0 }
    : await runLlmReviewBatch({
        options,
        deps,
        files: finalReviewFiles,
        reviewRootDir: resolve(options.outputDir, "final_llm_qa"),
      });
  if (!options.skipLlmQa) {
    await writeFile(resolve(options.outputDir, "final_llm_qa_outcomes.json"), `${JSON.stringify(finalLlm.outcomes, null, 2)}\n`);
  }
  const finalScan = mergedFinalScan(finalLint, finalLlm.findings);
  await writeFile(resolve(options.outputDir, "final_merged_scan.json"), `${JSON.stringify(finalScan, null, 2)}\n`);
  evidence = await collectRepairEvidence(queue);
  const filesScanned = scanCandidates.length || reviewFiles.length || new Set(finalScan.findings.map((finding) => normalizePath(finding.file))).size;
  let ledger = buildCycleReviewLedger({
    runId: options.runId,
    createdAt: (deps.now?.() ?? new Date()).toISOString(),
    headSha,
    worktreeDirty: await worktreeDirty(options, deps),
    baseRef: options.baseRef,
    finalScan,
    queue,
    repairEvidence: evidence,
    filesScanned,
    carriedEntries,
    revertedHeaders,
  });
  ledger = await enrichCycleReviewLedger(options, deps, ledger, queue);
  await writeLedger(options, ledger, regressionNote);
  const llmOutcomes = [...initialLlm.outcomes, ...finalLlm.outcomes];
  const llmFailure = initialLlm.errorCount > 0 || finalLlm.errorCount > 0;
  return {
    queue,
    ledger,
    mergedScan,
    outputDir: options.outputDir,
    llmOutcomes,
    exitCode: llmFailure || infrastructureFailure ? 1 : 0,
  };
}

export function confirmTimeoutSecondsArg(args: Map<string, string | true>): number {
  return numberArg(args, "--confirm-timeout-seconds", 180);
}

export async function prCycleReview(globals: GlobalArgs, args: Map<string, string | true>): Promise<void> {
  const runId = stringArg(args, "--run-id", "") || latestRunId(globals.stateDir);
  const baseRef = stringArg(args, "--base-ref", globals.game?.baseRef ?? "origin/master");
  const checkpointArg = stringArg(args, "--checkpoint", "");
  const checkpointPath = checkpointArg === "none" ? "" : checkpointArg ? resolveInputPath(checkpointArg) : latestCheckpointPath(globals.stateDir, runId);
  const checkpoint = checkpointPath && existsSync(checkpointPath) ? readJson(checkpointPath) : null;
  const checkpointCandidates = candidateProofsFromCheckpoint(checkpoint, { includeImprovementCandidates: true }).map((proof) => proof.sourcePath);
  const candidateFiles = [
    ...checkpointCandidates,
    ...stringList(stringArg(args, "--candidate-files", "")),
    ...candidateListFromFile(stringArg(args, "--candidate-list", "")),
  ];
  const explicitOutputDir = stringArg(args, "--output-dir", "");
  const outputDir = explicitOutputDir
    ? resolveInputPath(explicitOutputDir)
    : resolve(globals.stateDir, "pr_cycle_review", runId, artifactTimestamp());
  const reviewProvider = stringArg(args, "--review-provider", "codex-lb");
  const reviewModel = stringArg(args, "--review-model", "gpt-5.6-sol");
  const reviewThinking = stringArg(args, "--review-thinking", "low");
  const result = await runCycleReview({
    globals,
    runId,
    outputDir,
    baseRef,
    candidateFiles: [...new Set(candidateFiles.map(normalizePath).filter(Boolean))],
    checkpoint,
    concurrency: Math.max(1, Math.floor(numberArg(args, "--concurrency", 6))),
    runAgents: booleanArg(args, "--run-agents"),
    skipLlmQa: booleanArg(args, "--skip-llm-qa"),
    skipConfirm: booleanArg(args, "--skip-confirm"),
    skipRepair: booleanArg(args, "--skip-repair"),
    skipBatchGates: booleanArg(args, "--skip-batch-gates"),
    batchGateSize: Math.max(1, Math.floor(numberArg(args, "--batch-gate-size", 15))),
    maxItems: Math.max(0, Math.floor(numberArg(args, "--max-items", Number.MAX_SAFE_INTEGER))),
    repairWarnings: booleanArg(args, "--repair-warnings"),
    reviewProvider,
    reviewModel,
    reviewThinking,
    confirmProvider: stringArg(args, "--confirm-provider", reviewProvider),
    confirmModel: stringArg(args, "--confirm-model", reviewModel),
    confirmThinking: stringArg(args, "--confirm-thinking", reviewThinking),
    confirmTimeoutSeconds: confirmTimeoutSecondsArg(args),
    repairProvider: stringArg(args, "--repair-provider", "codex-lb"),
    repairModel: stringArg(args, "--repair-model", "gpt-5.6-sol"),
    repairThinking: stringArg(args, "--repair-thinking", "xhigh"),
    scoreCheckCommand: stringArg(args, "--score-check-command", ""),
    buildCheckCommand: stringArg(args, "--build-check-command", ""),
    regressionCheckCommand: stringArg(args, "--regression-check-command", ""),
  });
  console.log(JSON.stringify({ outputDir: result.outputDir, exitCode: result.exitCode, summary: result.ledger.summary }, null, 2));
  if (result.exitCode !== 0) process.exitCode = result.exitCode;
}
