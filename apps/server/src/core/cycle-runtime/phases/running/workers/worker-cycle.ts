import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { delimiter, isAbsolute, relative, resolve } from "node:path";
import { createMeleeKernelSpawnContext } from "@server/infrastructure/kernel/bridge/spawn-context";
import {
  appendWorkerActivityEvent,
  captureWorkerChangeBaseline,
  lintWorkerReviewDiff,
  parseWorkerCheckpointNote,
  targetPacketTarget,
  validateWorkerChange,
  workerPrompt,
  WORKER_CANONICAL_TOOL_PATHS,
  workerPacket,
  type WorkerPromptContextBudget,
  type WorkerChangeBaseline,
  type WorkerReviewLint,
  type WorkerRunnerValidation,
} from "@server/core/agent-catalog/agents/running/worker";
import {
  extendWorkerChangeBaselineSourceSnapshot,
  qaLintRepairReasons,
  validateWidenedChange,
  type WorkerChangeValidation,
} from "@server/core/agent-catalog/agents/running/worker/change-validation";
import type { WorkerMicroGateFlags } from "@server/core/agent-catalog/agents/running/worker/micro-gates";
import { defaultWorkerToolProfile } from "@server/core/tools";
import {
  fileGraphCard,
  graphDbExists,
  loadKnowledgeBoardSnapshot,
  openKnowledgeGraph,
  resourceGraphDbPath,
} from "@server/core/knowledge";
import {
  captureWorkspaceGitDiff,
  runCommand,
  sandboxWorkspaceExec,
  type WorkspaceExec,
} from "@server/infrastructure/shell";
import { addPiSession } from "@server/core/cycle-runtime/run-state";
import { canonicalCycleSessionId } from "@server/core/cycle/session.js";
import {
  addEvent,
  appendWorkerSessionId,
  bestCheckpointForWorkerState,
  closeWorkerState,
  enqueueWorkerOutputIntegration,
  getRun,
  openState,
  recordWorkerCheckpoint,
  updateWorkerStateBaselineScore,
  workerCheckpointsForWorkerState,
  type ClaimedTarget,
  type StateStore,
  type WorkerCheckpointRecord,
} from "@server/core/cycle-runtime/run-state";
import { epochTargetToClaim, normalizeWriteSetEntries, widenClaimWriteSet } from "@server/core/cycle-runtime/run-state/worker-state.js";
import {
  categorizePath,
  type WideningDecision,
  type WideningRequest,
  type WriteSetCategory,
  type WriteSetEntry,
} from "@server/core/cycle-runtime/run-state/write-set-categories.js";
import {
  createWriteSetWidening,
  decideWidening,
  draftWideningRequestFromOutOfWriteSet,
  parseWideningRequest,
  recordWriteSetWideningDecision,
  recordWriteSetWideningValidation,
} from "@server/core/cycle-runtime/run-state/write-set-widening.js";
import type { WorkerOutputIntegrationApplyResult } from "@server/core/cycle-runtime/phases/running/integration/worker-output-queue.js";
import type { PiRunResult } from "@server/core/shared/types";
import type { MeleeKernelPiRunOptions } from "@server/infrastructure/agent-runtime/kernel-pi-runner.js";
import {
  gameMetadata,
  stringArg,
  writeSetIntegrationFlags,
  type GlobalArgs,
  type WriteSetWideningMode,
} from "@server/core/game-registry/runtime-options.js";
import { assertSchedulableRun } from "@server/core/cycle-runtime/phases/running/jobs/shared.js";
import { verifyClaimToken } from "@server/core/job-queue/kernel.js";
import type { ClaimToken } from "@server/core/job-queue/types.js";
import {
  DaytonaSandboxProvider,
  type SandboxHandle,
  type SandboxProvider,
} from "@server/core/job-queue/sandbox.js";
import {
  wrapSandboxHandleWithSleep,
  type SandboxSleepStats,
} from "@server/core/job-queue/sandbox-sleep.js";
import {
  createSandboxFileToolDefinitions,
  sandboxBashOperations,
} from "@server/infrastructure/agent-runtime/sandbox-agent-tools.js";

export interface WorkerCycleResult {
  runId: string;
  claimId: string;
  workerStateId: string;
  epochTargetId: string;
  target: string;
  writeSet: string[];
  workerOutput?: string;
  workerSystemPrompt?: string;
  workerUserPrompt?: string;
  workerStatePath: string;
  lifecycleStatus: string;
  bestCheckpointId: string | null;
  bestScore: number | null;
  exact: boolean;
  wakeEvent: string;
  dryRun: boolean;
  sandboxSleep: SandboxSleepStats & { enabled: boolean; debounceMs: number };
  failed?: boolean;
  providerFailure?: boolean;
  errorKind?: string;
  error?: string;
  workerOutputIntegration?: {
    itemId: string;
    processed: WorkerOutputIntegrationApplyResult[];
  };
}

interface WorkerAttemptEvaluation {
  result: PiRunResult;
  agentNote: Record<string, unknown> | null;
  parsedError?: string;
  runnerValidation: WorkerChangeValidation;
  repairReasons: string[];
  continuationDecision: WorkerContinuationDecision;
  writeSetDiffChanged: boolean;
  outOfWriteSetChanges: OutOfWriteSetChange[];
  postAttemptDiffPath: string;
  repairFeedbackPath?: string;
}

interface WorkerErrorClassification {
  kind: string;
  summary: string;
  reasons: string[];
}

type PostReturnCheckValidation = WorkerRunnerValidation & { status: "passed" | "failed" | "skipped" };

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

function recordString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function finiteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function stringValuesFromObject(value: unknown): string[] {
  if (!value || typeof value !== "object") return [];
  if (Array.isArray(value)) return value.flatMap(stringValuesFromObject);
  const record = value as Record<string, unknown>;
  const values: string[] = [];
  for (const [key, item] of Object.entries(record)) {
    if (typeof item === "string") values.push(`${key}: ${item}`);
    else if (item && typeof item === "object") values.push(...stringValuesFromObject(item));
  }
  return values;
}

function textLooksLikeToolError(value: unknown): boolean {
  const text = typeof value === "string" ? value : stringValuesFromObject(value).join("\n");
  if (!text.trim()) return false;
  const toolTerm = /\b(tool|command|api|build tool|compiler runner|validation harness|post-return|checkdiff|objdiff|wibo|weebo|wine|mwcc|stderr|parse error|timeout|timed out|missing executable|harness)\b/i;
  const failureTerm = /\b(fail(?:ed|ing|ure)?|missing|blocked|unavailable|error|exited|cannot|can't|unable|not found)\b/i;
  return toolTerm.test(text) && failureTerm.test(text);
}

function blockerIsExplicitlyNonBlocking(record: Record<string, unknown>): boolean {
  const kind = recordString(record.kind || record.type || record.status || record.reason);
  const text = [kind, ...stringValuesFromObject(record)].join("\n");
  return /(?:non[_ -]?blocking|optional|did not block|does not block|not block normal|regular .* sufficient|usable .* evidence|rerunning .* succeeded)/i.test(text);
}

// fatal: the agent explicitly declared a tool failure (note status or a structured
// blocker kind) — trustworthy enough to drain the pool via --exit-on-worker-error.
// advisory: a regex hunch over free text. Worth classifying as tool_error for triage,
// but a hunch must never have pool-drain authority.
export function agentNoteSignalsToolError(agentNote: Record<string, unknown> | null): { fatal: string[]; advisory: string[] } {
  if (!agentNote) return { fatal: [], advisory: [] };
  const fatal: string[] = [];
  const advisory: string[] = [];
  const noteStatus = recordString(agentNote.status);
  if (noteStatus === "tool_error") fatal.push("agent note status is tool_error");
  const blockers = Array.isArray(agentNote.blockers) ? agentNote.blockers : [];
  for (const blocker of blockers) {
    const record = blocker && typeof blocker === "object" && !Array.isArray(blocker) ? (blocker as Record<string, unknown>) : {};
    if (blockerIsExplicitlyNonBlocking(record)) continue;
    const kind = recordString(record.kind || record.type || record.status || record.reason);
    if (/(?:tool|command|api|build|validation|compiler|runner|parse|timeout).*error|error.*(?:tool|command|api|build|validation|compiler|runner|parse|timeout)/i.test(kind)) {
      fatal.push(`agent blocker marks tool error: ${kind}`);
      continue;
    }
    if (textLooksLikeToolError(record)) advisory.push(`agent blocker looks like a tool error: ${stringValuesFromObject(record).join("; ").slice(0, 240)}`);
  }
  if (noteStatus === "validation_ready" && textLooksLikeToolError(agentNote.summary)) {
    advisory.push("agent validation note text looks like a tool/build/validation failure");
  }
  return { fatal, advisory };
}

function runnerValidationFailureReasons(validation: WorkerRunnerValidation): string[] {
  if (validation.status === "passed" || validation.status === "skipped") {
    if (validation.postReturnCheck?.status !== "failed") return [];
    return validation.postReturnCheck.reasons.length > 0
      ? validation.postReturnCheck.reasons.map((reason) => `post-return check: ${reason}`)
      : ["post-return check failed"];
  }
  const reasons = validation.reasons.length > 0 ? [...validation.reasons] : [`runner validation status: ${validation.status}`];
  if (validation.postReturnCheck?.status === "failed") {
    reasons.push(...validation.postReturnCheck.reasons.map((reason) => `post-return check: ${reason}`));
  }
  return reasons;
}

export function classifyWorkerError(params: {
  result: PiRunResult;
  parsedError?: string;
  agentNote: Record<string, unknown> | null;
  runnerValidation: WorkerChangeValidation;
}): WorkerErrorClassification | null {
  if (params.result.providerError) {
    return {
      kind: "provider_error",
      summary: `LLM provider failed before the worker produced a validation note: ${params.result.providerError}`,
      reasons: [params.result.providerError, ...(params.parsedError ? [params.parsedError] : [])],
    };
  }
  if (params.result.failed) {
    const message = params.result.error ?? "unknown Pi cycle error";
    return {
      kind: "worker_session_failed",
      summary: `Worker Pi cycle failed before producing a validation note: ${message}`,
      reasons: [message],
    };
  }
  const agentToolErrors = agentNoteSignalsToolError(params.agentNote);
  if (agentToolErrors.fatal.length > 0) {
    return {
      kind: "agent_noted_tool_error",
      summary: `Worker note describes a tool/build/validation failure: ${agentToolErrors.fatal.join("; ")}`,
      reasons: agentToolErrors.fatal,
    };
  }
  if (agentToolErrors.advisory.length > 0) {
    return {
      kind: "agent_noted_tool_error_advisory",
      summary: `Worker note text resembles a tool/build/validation failure (heuristic): ${agentToolErrors.advisory.join("; ")}`,
      reasons: agentToolErrors.advisory,
    };
  }
  const validationReasons = runnerValidationFailureReasons(params.runnerValidation);
  // L1 QA lint rejection: the attempt re-added or left a QA finding.
  // The runner_validation_ prefix keeps this a rework kind for repair/continue
  // feedback and never turns the worker lifecycle into an infrastructure error.
  if (params.runnerValidation.qaLint?.status === "violations" || params.runnerValidation.qaLint?.status === "warnings") {
    const qaReasons = qaLintRepairReasons(params.runnerValidation.qaLint);
    return {
      kind: "runner_validation_qa_lint_failed",
      summary: `QA lint rejected the attempt: ${params.runnerValidation.qaLint.findings.length} QA finding(s) requiring repair`,
      reasons: [...validationReasons, ...qaReasons.filter((reason) => !validationReasons.includes(reason))],
    };
  }
  if (validationReasons.length > 0) {
    return {
      kind: `runner_validation_${params.runnerValidation.status}`,
      summary: `Runner validation failed: ${validationReasons.join("; ")}`,
      reasons: validationReasons,
    };
  }
  return null;
}

export function isReworkErrorKind(kind: string): boolean {
  return /^(?:runner_validation_|worker_integration_)/.test(kind);
}

// Out-of-write-set change evidence. The banked patch is a write-set-scoped
// `git diff`, so any other edit silently vanishes at patch capture; these
// records make that visible to the worker (repair reason), to QA (snapshot
// extension), and to telemetry (checkpoint metadata) sizing a future
// write-set-widening design.
export type OutOfWriteSetCategory = Exclude<WriteSetCategory, "target-source">;

export interface OutOfWriteSetChange {
  path: string;
  category: OutOfWriteSetCategory;
}

export function classifyOutOfWriteSetPath(path: string): OutOfWriteSetCategory {
  const category = categorizePath(path, "");
  return category === "target-source" ? "other" : category;
}

// Tracked paths the worker modified outside the claim write set. Paths already
// modified before the first attempt (seeded report artifacts) are excluded so
// the list names only worker-authored drift; an out-of-set edit from an earlier
// repair attempt stays flagged until the worker reverts it.
export function collectOutOfWriteSetChanges(params: {
  changedPaths: string[];
  preAttemptChangedPaths: string[];
  writeSet: string[];
}): OutOfWriteSetChange[] {
  const preAttempt = new Set(params.preAttemptChangedPaths);
  const writeSet = new Set(params.writeSet);
  const changes: OutOfWriteSetChange[] = [];
  for (const path of new Set(params.changedPaths)) {
    if (!path || writeSet.has(path) || preAttempt.has(path)) continue;
    changes.push({ path, category: classifyOutOfWriteSetPath(path) });
  }
  return changes;
}

export function outOfWriteSetCategoryCounts(changes: OutOfWriteSetChange[]): Record<OutOfWriteSetCategory, number> {
  const counts: Record<OutOfWriteSetCategory, number> = { "owning-header": 0, "config-metadata": 0, "foreign-source": 0, other: 0 };
  for (const change of changes) counts[change.category] += 1;
  return counts;
}

export function outOfWriteSetRepairReason(changes: OutOfWriteSetChange[]): string | null {
  if (changes.length === 0) return null;
  const listed = changes.map((change) => `${change.path} (${change.category})`).join(", ");
  return (
    `out_of_write_set_edit: you edited ${listed}, but the banked patch is captured only from your claim write set — those edits are silently dropped at patch capture and will not ship. ` +
    `If the match depends on them, an in-file workaround is not the honest outcome: state "exact requires cross-file edit to <path>" in your note's blockers so the runner can close the target truthfully. ` +
    `Otherwise revert the out-of-write-set edit so the shipped patch matches what you validated.`
  );
}

export interface ParsedWorkerWideningRequest {
  request: WideningRequest | null;
  error?: string;
}

export function parseWorkerWideningRequest(note: Record<string, unknown> | null): ParsedWorkerWideningRequest {
  const value = note?.widening_request;
  if (value == null) return { request: null };
  const request = parseWideningRequest(value);
  return request
    ? { request }
    : { request: null, error: "widening_request does not match write_set_widening_request_v1" };
}

export function shouldApplyWideningDecision(mode: WriteSetWideningMode, decision: WideningDecision): boolean {
  if (decision.status !== "approved") return false;
  if (mode === "config") return decision.validationTier === 2;
  if (mode === "header") return decision.validationTier === 2 || decision.validationTier === 3;
  return false;
}

export function shouldExposeWideningDecisionToWorker(mode: WriteSetWideningMode): boolean {
  return mode === "config" || mode === "header";
}

function wideningDecisionRepairReason(decision: WideningDecision): string | null {
  if (decision.status === "approved") return null;
  const prefix = decision.status === "routed_cross_module" ? "widening_routed_cross_module" : "widening_denied";
  return `${prefix}: ${decision.reason}`;
}

function safeRepoRelativePath(repoRoot: string, path: string): string | null {
  if (!path || isAbsolute(path)) return null;
  const resolved = resolve(repoRoot, path);
  const relativePath = relative(repoRoot, resolved);
  return relativePath && !relativePath.startsWith("..") && !isAbsolute(relativePath) ? resolved : null;
}

export async function headerDeclaresEvidenceSymbol(
  repoRoot: string,
  request: WideningRequest,
  sandboxHandle: SandboxHandle,
): Promise<boolean | undefined> {
  if (request.rung !== 3 || request.paths.length !== 1) return undefined;
  const headerPath = safeRepoRelativePath(repoRoot, request.paths[0] ?? "");
  if (!headerPath) return false;
  try {
    const contents = await sandboxHandle.readFile(headerPath);
    const symbol = request.evidence.mismatched_declaration.symbol;
    const escaped = symbol.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`\\b${escaped}\\b`).test(contents);
  } catch {
    return false;
  }
}

// All repair feedback for one attempt: the shared return-gate reasons, any
// out-of-write-set edit warning, plus the L1 QA lint findings, formatted
// verbatim for the worker's next iteration.
export function workerAttemptRepairReasons(params: {
  runnerValidation: WorkerChangeValidation;
  reviewLint?: WorkerReviewLint;
  outOfWriteSetChanges?: OutOfWriteSetChange[];
  wideningReasons?: string[];
}): string[] {
  const reasons: string[] = [];
  if (params.runnerValidation.status !== "passed" && params.runnerValidation.status !== "skipped") {
    reasons.push(...params.runnerValidation.reasons.map((reason) => `runner validation: ${reason}`));
  }
  if (params.reviewLint?.status === "failed") {
    reasons.push(...params.reviewLint.reasons.map((reason) => `review lint: ${reason}`));
  }
  const outOfWriteSetReason = outOfWriteSetRepairReason(params.outOfWriteSetChanges ?? []);
  if (outOfWriteSetReason) reasons.push(outOfWriteSetReason);
  reasons.push(...(params.wideningReasons ?? []));
  reasons.push(...qaLintRepairReasons(params.runnerValidation.qaLint));
  return reasons;
}

export function shouldRequestWorkerRepairAfterAttempt(params: {
  repairReasons: string[];
  dryRun: boolean;
  claimDeadlineMs?: number | null;
  nowMs?: number;
}): boolean {
  if (params.repairReasons.length === 0 || params.dryRun) return false;
  if (params.claimDeadlineMs != null && Number.isFinite(params.claimDeadlineMs) && params.claimDeadlineMs <= (params.nowMs ?? Date.now())) return false;
  return true;
}

export const WORKER_PI_SESSION_RETRY_POLICY = {
  mode: "worker_pi_transient_cycle_retry_v1",
  maxTransientRetries: 1,
} as const;

export const WORKER_PI_CONTEXT_RETRY_POLICY = {
  mode: "worker_pi_context_budget_retry_v1",
  budgets: ["full", "compact", "minimal"] as const satisfies readonly WorkerPromptContextBudget[],
} as const;

const WORKER_PI_SESSION_NON_RETRYABLE_PATTERNS = [
  /context[_ -]?length[_ -]?exceeded/i,
  /input exceeds? the context window/i,
  /maximum context length/i,
  /prompt is too long/i,
  /too many input tokens/i,
  /token limit/i,
] as const;

const WORKER_PI_SESSION_RETRYABLE_PATTERNS = [
  /stream[_ -]?incomplete/i,
  /upstream websocket closed/i,
  /websocket closed before response\.completed/i,
  /no close frame received or sent/i,
  /\b(?:ECONNRESET|ECONNABORTED|ETIMEDOUT|EPIPE|UND_ERR_SOCKET)\b/i,
  /socket hang up/i,
  /(?:connection|stream|socket|websocket)\s+(?:reset|closed|aborted|terminated)/i,
  /fetch failed/i,
  /network error/i,
  /temporarily unavailable/i,
  /upstream[_ ]unavailable/i,
  /request to upstream timed out/i,
  /stream[_ ]idle[_ ]timeout/i,
  /\b50[234]\b/,
] as const;

export interface WorkerPiContextRetryDecision {
  policy: typeof WORKER_PI_CONTEXT_RETRY_POLICY.mode;
  shouldRetry: boolean;
  retryable: boolean;
  exhausted: boolean;
  stoppedByDeadline: boolean;
  reason: string;
  contextRetryIndex: number;
  currentBudget: WorkerPromptContextBudget;
  nextRetryIndex: number | null;
  nextBudget: WorkerPromptContextBudget | null;
  budgets: readonly WorkerPromptContextBudget[];
}

export interface WorkerPiSessionRetryDecision {
  policy: typeof WORKER_PI_SESSION_RETRY_POLICY.mode;
  shouldRetry: boolean;
  retryable: boolean;
  exhausted: boolean;
  stoppedByDeadline: boolean;
  reason: string;
  transientRetryCount: number;
  nextRetryIndex: number | null;
  maxTransientRetries: number;
}

function workerPiSessionFailureText(result: Pick<PiRunResult, "failed" | "providerError" | "error">): string {
  return [result.providerError, result.error].filter((value): value is string => typeof value === "string" && value.trim().length > 0).join("\n");
}

export function isWorkerSessionTimeoutFailure(result: Pick<PiRunResult, "failed" | "providerError" | "error">): boolean {
  if (!result.failed || result.providerError) return false;
  return /\bPi session timed out after\b|\btimed out\b/i.test(workerPiSessionFailureText(result));
}

export function shouldRunRunnerValidationForWorkerSession(result: Pick<PiRunResult, "failed" | "providerError" | "error">): boolean {
  if (!result.failed && !result.providerError) return true;
  return isWorkerSessionTimeoutFailure(result);
}

export function isWorkerPiContextLengthFailure(result: Pick<PiRunResult, "failed" | "providerError" | "error">): boolean {
  if (!result.failed && !result.providerError) return false;
  const text = workerPiSessionFailureText(result);
  if (!text) return false;
  return WORKER_PI_SESSION_NON_RETRYABLE_PATTERNS.some((pattern) => pattern.test(text));
}

export function isRetryableWorkerPiSessionFailure(result: Pick<PiRunResult, "failed" | "providerError" | "error">): boolean {
  if (!result.failed && !result.providerError) return false;
  const text = workerPiSessionFailureText(result);
  if (!text) return false;
  if (isWorkerPiContextLengthFailure(result)) return false;
  return WORKER_PI_SESSION_RETRYABLE_PATTERNS.some((pattern) => pattern.test(text));
}

function workerPromptContextBudget(index: number): WorkerPromptContextBudget {
  const budgets = WORKER_PI_CONTEXT_RETRY_POLICY.budgets;
  return budgets[Math.min(Math.max(0, Math.trunc(index)), budgets.length - 1)] ?? "minimal";
}

export function workerPiContextRetryDecision(params: {
  result: Pick<PiRunResult, "failed" | "providerError" | "error">;
  contextRetryIndex: number;
  dryRun: boolean;
  claimDeadlineMs?: number | null;
  nowMs?: number;
}): WorkerPiContextRetryDecision {
  const contextRetryIndex = Math.max(0, Math.trunc(params.contextRetryIndex));
  const currentBudget = workerPromptContextBudget(contextRetryIndex);
  const retryable = isWorkerPiContextLengthFailure(params.result);
  const nextRetryIndex = contextRetryIndex + 1;
  const nextBudget = WORKER_PI_CONTEXT_RETRY_POLICY.budgets[nextRetryIndex] ?? null;
  const exhausted = nextBudget === null;
  const stoppedByDeadline =
    params.claimDeadlineMs != null &&
    Number.isFinite(params.claimDeadlineMs) &&
    params.claimDeadlineMs <= (params.nowMs ?? Date.now());
  const base = {
    policy: WORKER_PI_CONTEXT_RETRY_POLICY.mode,
    retryable,
    exhausted,
    stoppedByDeadline,
    contextRetryIndex,
    currentBudget,
    nextRetryIndex: nextBudget ? nextRetryIndex : null,
    nextBudget,
    budgets: WORKER_PI_CONTEXT_RETRY_POLICY.budgets,
  };
  if (!retryable) return { ...base, shouldRetry: false, reason: "non_context_length_failure" };
  if (params.dryRun) return { ...base, shouldRetry: false, reason: "dry_run" };
  if (stoppedByDeadline) return { ...base, shouldRetry: false, reason: "claim_deadline" };
  if (exhausted) return { ...base, shouldRetry: false, reason: "context_budget_exhausted" };
  return { ...base, shouldRetry: true, reason: "context_length_retry_with_smaller_prompt" };
}

export function workerPiSessionRetryDecision(params: {
  result: Pick<PiRunResult, "failed" | "providerError" | "error">;
  transientRetryCount: number;
  dryRun: boolean;
  claimDeadlineMs?: number | null;
  nowMs?: number;
}): WorkerPiSessionRetryDecision {
  const transientRetryCount = Math.max(0, Math.trunc(params.transientRetryCount));
  const retryable = isRetryableWorkerPiSessionFailure(params.result);
  const exhausted = transientRetryCount >= WORKER_PI_SESSION_RETRY_POLICY.maxTransientRetries;
  const stoppedByDeadline =
    params.claimDeadlineMs != null &&
    Number.isFinite(params.claimDeadlineMs) &&
    params.claimDeadlineMs <= (params.nowMs ?? Date.now());
  const base = {
    policy: WORKER_PI_SESSION_RETRY_POLICY.mode,
    retryable,
    exhausted,
    stoppedByDeadline,
    transientRetryCount,
    nextRetryIndex: null,
    maxTransientRetries: WORKER_PI_SESSION_RETRY_POLICY.maxTransientRetries,
  };
  if (!retryable) return { ...base, shouldRetry: false, reason: "non_retryable_failure" };
  if (params.dryRun) return { ...base, shouldRetry: false, reason: "dry_run" };
  if (stoppedByDeadline) return { ...base, shouldRetry: false, reason: "claim_deadline" };
  if (exhausted) return { ...base, shouldRetry: false, reason: "transient_retry_budget_exhausted" };
  return {
    ...base,
    shouldRetry: true,
    reason: "transient_transport_failure",
    nextRetryIndex: transientRetryCount + 1,
  };
}

export const WORKER_ATTEMPT_TAIL_POLICY = {
  mode: "bounded_attempt_tail_v2",
  maxColdAttempts: 5,
  followUpAttemptsAfterBest: 0,
  followUpAttemptsAfterGateFailedExact: 3,
} as const;

export const REPAIR_REQUEST_DIFF_INLINE_LIMIT = 30_000;
export const REPAIR_REQUEST_OUTPUT_TAIL_LIMIT = 10_000;
export const REPAIR_REQUEST_PATHS_NOTE =
  "The *_path fields are host-side audit references and are NOT readable from the worker sandbox; use the inlined previous_return_gate / previous_post_attempt_diff / previous_agent_output_tail fields instead.";

export async function buildRepairRequestInlineArtifacts(params: {
  agentOutputPath: string;
  returnGatePath: string;
  postAttemptDiffPath: string;
}): Promise<Record<string, unknown>> {
  const artifacts: Record<string, unknown> = {};

  try {
    artifacts.previous_return_gate = JSON.parse(await readFile(params.returnGatePath, "utf8"));
  } catch {}

  try {
    const diff = await readFile(params.postAttemptDiffPath, "utf8");
    artifacts.previous_post_attempt_diff =
      diff.length > REPAIR_REQUEST_DIFF_INLINE_LIMIT
        ? `${diff.slice(0, REPAIR_REQUEST_DIFF_INLINE_LIMIT)}\n[truncated: showing first ${REPAIR_REQUEST_DIFF_INLINE_LIMIT} of ${diff.length} characters]`
        : diff;
  } catch {}

  try {
    const output = await readFile(params.agentOutputPath, "utf8");
    artifacts.previous_agent_output_tail =
      output.length > REPAIR_REQUEST_OUTPUT_TAIL_LIMIT
        ? `[truncated: showing last ${REPAIR_REQUEST_OUTPUT_TAIL_LIMIT} of ${output.length} characters]\n${output.slice(-REPAIR_REQUEST_OUTPUT_TAIL_LIMIT)}`
        : output;
  } catch {}

  return artifacts;
}

export interface WorkerContinuationDecision {
  policy: typeof WORKER_ATTEMPT_TAIL_POLICY.mode;
  shouldContinue: boolean;
  exhausted: boolean;
  stopReason: string | null;
  continueReason: string | null;
  attemptIndex: number;
  humanAttempt: number;
  maxColdAttempts: number;
  followUpAttemptsAfterBest: number;
  followUpAttemptsAfterGateFailedExact: number;
  latestBestAttemptIndex: number | null;
  latestBestScore: number | null;
  failedGateExactAttemptIndex: number | null;
  followUpsSinceBest: number | null;
  followUpsSinceFailedGateExact: number | null;
  stoppedByDeadline: boolean;
  unresolvedRepairReasons: boolean;
  latestReasons: string[];
}

type WorkerContinuationCheckpoint = Pick<WorkerCheckpointRecord, "attemptIndex" | "exactMatch" | "hardGatesPassed" | "selectable" | "newScore">;

function orderedContinuationCheckpoints(checkpoints: WorkerContinuationCheckpoint[], attemptIndex: number): WorkerContinuationCheckpoint[] {
  return checkpoints
    .filter((checkpoint) => Number.isFinite(checkpoint.attemptIndex) && checkpoint.attemptIndex <= attemptIndex)
    .slice()
    .sort((left, right) => left.attemptIndex - right.attemptIndex);
}

function latestBestSelectableCheckpoint(checkpoints: WorkerContinuationCheckpoint[]): { attemptIndex: number | null; score: number | null } {
  let bestAttemptIndex: number | null = null;
  let bestScore: number | null = null;
  for (const checkpoint of checkpoints) {
    if (!checkpoint.selectable) continue;
    if (checkpoint.newScore == null || !Number.isFinite(checkpoint.newScore)) continue;
    if (bestScore == null || checkpoint.newScore > bestScore) {
      bestScore = checkpoint.newScore;
      bestAttemptIndex = checkpoint.attemptIndex;
    }
  }
  return { attemptIndex: bestAttemptIndex, score: bestScore };
}

function firstFailedGateExactAfterBest(checkpoints: WorkerContinuationCheckpoint[], bestAttemptIndex: number | null): number | null {
  const afterAttemptIndex = bestAttemptIndex ?? -1;
  const checkpoint = checkpoints.find((item) => item.attemptIndex > afterAttemptIndex && item.exactMatch && !item.hardGatesPassed);
  return checkpoint?.attemptIndex ?? null;
}

export function workerContinuationDecision(params: {
  attemptIndex: number;
  checkpoints: WorkerContinuationCheckpoint[];
  repairReasons: string[];
  dryRun: boolean;
  claimDeadlineMs?: number | null;
  nowMs?: number;
}): WorkerContinuationDecision {
  const attemptIndex = Math.max(0, Math.trunc(params.attemptIndex));
  const checkpoints = orderedContinuationCheckpoints(params.checkpoints, attemptIndex);
  const acceptedExact = checkpoints.some((checkpoint) => checkpoint.selectable && checkpoint.exactMatch && checkpoint.hardGatesPassed);
  const best = latestBestSelectableCheckpoint(checkpoints);
  const failedGateExactAttemptIndex = firstFailedGateExactAfterBest(checkpoints, best.attemptIndex);
  const stoppedByDeadline =
    params.repairReasons.length > 0 &&
    params.claimDeadlineMs != null &&
    Number.isFinite(params.claimDeadlineMs) &&
    params.claimDeadlineMs <= (params.nowMs ?? Date.now());
  const base = {
    policy: WORKER_ATTEMPT_TAIL_POLICY.mode,
    attemptIndex,
    humanAttempt: attemptIndex + 1,
    maxColdAttempts: WORKER_ATTEMPT_TAIL_POLICY.maxColdAttempts,
    followUpAttemptsAfterBest: WORKER_ATTEMPT_TAIL_POLICY.followUpAttemptsAfterBest,
    followUpAttemptsAfterGateFailedExact: WORKER_ATTEMPT_TAIL_POLICY.followUpAttemptsAfterGateFailedExact,
    latestBestAttemptIndex: best.attemptIndex,
    latestBestScore: best.score,
    failedGateExactAttemptIndex,
    followUpsSinceBest: best.attemptIndex == null ? null : attemptIndex - best.attemptIndex,
    followUpsSinceFailedGateExact: failedGateExactAttemptIndex == null ? null : attemptIndex - failedGateExactAttemptIndex,
    stoppedByDeadline,
    unresolvedRepairReasons: params.repairReasons.length > 0,
    latestReasons: params.repairReasons,
  };

  const stop = (stopReason: string, exhausted: boolean): WorkerContinuationDecision => ({
    ...base,
    shouldContinue: false,
    exhausted,
    stopReason,
    continueReason: null,
  });
  const resume = (continueReason: string): WorkerContinuationDecision => ({
    ...base,
    shouldContinue: true,
    exhausted: false,
    stopReason: null,
    continueReason,
  });

  if (acceptedExact) return stop("accepted_exact", false);
  if (!shouldRequestWorkerRepairAfterAttempt(params)) {
    if (params.dryRun) return stop("dry_run", false);
    if (stoppedByDeadline) return stop("claim_deadline", false);
    if (best.attemptIndex != null) return stop("improvement_banked", false);
    return stop("accepted_or_no_repair_reasons", false);
  }

  if (failedGateExactAttemptIndex != null) {
    const followUps = attemptIndex - failedGateExactAttemptIndex;
    if (followUps >= WORKER_ATTEMPT_TAIL_POLICY.followUpAttemptsAfterGateFailedExact) {
      return stop("gate_failed_exact_followup_budget_exhausted", true);
    }
    return resume("gate_failed_exact_repair");
  }

  if (best.attemptIndex != null) {
    return stop("improvement_banked", false);
  }

  if (attemptIndex + 1 >= WORKER_ATTEMPT_TAIL_POLICY.maxColdAttempts) {
    return stop("cold_attempt_budget_exhausted", true);
  }
  return resume("cold_attempt_budget_available");
}

function terminalWorkerSessionErrorDecision(params: {
  attemptIndex: number;
  stopReason: string;
  reasons: string[];
  claimDeadlineMs?: number | null;
  nowMs?: number;
}): WorkerContinuationDecision {
  const attemptIndex = Math.max(0, Math.trunc(params.attemptIndex));
  return {
    policy: WORKER_ATTEMPT_TAIL_POLICY.mode,
    shouldContinue: false,
    exhausted: false,
    stopReason: params.stopReason,
    continueReason: null,
    attemptIndex,
    humanAttempt: attemptIndex + 1,
    maxColdAttempts: WORKER_ATTEMPT_TAIL_POLICY.maxColdAttempts,
    followUpAttemptsAfterBest: WORKER_ATTEMPT_TAIL_POLICY.followUpAttemptsAfterBest,
    followUpAttemptsAfterGateFailedExact: WORKER_ATTEMPT_TAIL_POLICY.followUpAttemptsAfterGateFailedExact,
    latestBestAttemptIndex: null,
    latestBestScore: null,
    failedGateExactAttemptIndex: null,
    followUpsSinceBest: null,
    followUpsSinceFailedGateExact: null,
    stoppedByDeadline:
      params.claimDeadlineMs != null &&
      Number.isFinite(params.claimDeadlineMs) &&
      params.claimDeadlineMs <= (params.nowMs ?? Date.now()),
    unresolvedRepairReasons: false,
    latestReasons: params.reasons,
  };
}

function renderPostReturnCheckCommand(
  template: string,
	  params: {
	    repoRoot: string;
	    stateDir: string;
	    workerLogDir: string;
	    claimId: string;
	    writeSet: string[];
	    target: Record<string, unknown>;
	  },
): string {
  const replacements: Record<string, string> = {
	    repo_root: shellQuote(params.repoRoot),
	    state_dir: shellQuote(params.stateDir),
	    worker_log_dir: shellQuote(params.workerLogDir),
	    claim_id: shellQuote(params.claimId),
    source_path: shellQuote(String(params.target.source_path ?? "")),
    unit: shellQuote(String(params.target.unit ?? "")),
    symbol: shellQuote(String(params.target.symbol ?? "")),
    write_set: params.writeSet.map(shellQuote).join(" "),
  };
  return template.replace(/\{([a-z_]+)\}/g, (match, key: string) => replacements[key] ?? match);
}

async function captureWriteSetDiff(workspaceExec: WorkspaceExec, writeSet: string[], outputPath: string): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const result = await captureWorkspaceGitDiff(workspaceExec, writeSet, outputPath);
  if (result.stderr) await writeFile(`${outputPath}.stderr.txt`, result.stderr);
  return result;
}

// Full-worktree changed-path list (tracked files, matching the `git diff`
// patch-capture view). Compared against the write set, this is what exposes
// edits that patch capture would silently drop.
async function captureWorktreeChangedPaths(workspaceExec: WorkspaceExec, outputPath: string): Promise<string[]> {
  const result = await workspaceExec.exec(["git", "diff", "--name-only"]);
  await writeFile(outputPath, result.stdout);
  if (result.stderr) await writeFile(`${outputPath}.stderr.txt`, result.stderr);
  return result.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

async function runPostReturnCheck(params: {
  commandTemplate: string;
  dryRun: boolean;
	  repoRoot: string;
	  stateDir: string;
	  workerLogDir: string;
	  claimId: string;
  writeSet: string[];
  target: Record<string, unknown>;
  outputDir: string;
  attemptIndex: number;
  shouldRun: boolean;
  workspaceExec: WorkspaceExec;
}): Promise<PostReturnCheckValidation> {
  if (!params.commandTemplate) {
    return { status: "skipped", reasons: ["no --post-return-check-command configured"] };
  }
  if (params.dryRun) {
    return { status: "skipped", reasons: ["dry-run agents do not execute post-return check commands"] };
  }
  if (!params.shouldRun) {
    return { status: "skipped", reasons: ["runner validation did not pass"] };
  }

  const command = renderPostReturnCheckCommand(params.commandTemplate, params);
  const validationDir = resolve(params.outputDir, "runner_validation");
  await mkdir(validationDir, { recursive: true });
  const stdoutPath = resolve(validationDir, `attempt-${params.attemptIndex}.post_return.stdout.txt`);
  const stderrPath = resolve(validationDir, `attempt-${params.attemptIndex}.post_return.stderr.txt`);
  const summaryPath = resolve(validationDir, `attempt-${params.attemptIndex}.post_return.summary.json`);
  const result = await params.workspaceExec.exec(
    ["/bin/sh", "-lc", command],
    { compile: true },
  );
  await writeFile(stdoutPath, result.stdout);
  await writeFile(stderrPath, result.stderr);
  const validation: WorkerRunnerValidation = {
    status: result.exitCode === 0 ? "passed" : "failed",
    reasons: result.exitCode === 0 ? [] : [`post-return check command exited ${result.exitCode}`],
    command,
    exitCode: result.exitCode,
    summaryPath,
    stdoutPath,
    stderrPath,
  };
  await writeFile(summaryPath, JSON.stringify(validation, null, 2));
  return validation as PostReturnCheckValidation;
}

function compactPostReturnCheck(validation: PostReturnCheckValidation): NonNullable<WorkerRunnerValidation["postReturnCheck"]> {
  return {
    status: validation.status,
    reasons: validation.reasons,
    command: validation.command,
    exitCode: validation.exitCode,
    summaryPath: validation.summaryPath,
    stdoutPath: validation.stdoutPath,
    stderrPath: validation.stderrPath,
  };
}

function outputTail(text: string, maxChars = 2000): string {
  return text.length <= maxChars ? text : text.slice(-maxChars);
}

export function resolveBaseRev(repoRoot: string, requested: string): string {
  const candidate = requested.trim() && requested.trim() !== "unknown" ? requested.trim() : "HEAD";
  const resolved = Bun.spawnSync(["git", "-C", repoRoot, "rev-parse", "--verify", `${candidate}^{commit}`], {
    stdout: "pipe",
    stderr: "pipe",
  });
  if (resolved.exitCode === 0) return resolved.stdout.toString().trim();

  const fallback = Bun.spawnSync(["git", "-C", repoRoot, "rev-parse", "--verify", "HEAD^{commit}"], {
    stdout: "pipe",
    stderr: "pipe",
  });
  if (fallback.exitCode !== 0) {
    throw new Error(`Unable to resolve base revision ${requested || "HEAD"}: ${fallback.stderr.toString().trim()}`);
  }
  return fallback.stdout.toString().trim();
}

function envKeyForToolPath(id: string): string {
  return `ORCH_WORKER_TOOL_${id.replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "").toUpperCase()}`;
}

function uniquePathEntries(entries: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const entry of entries) {
    if (!entry || seen.has(entry)) continue;
    seen.add(entry);
    result.push(entry);
  }
  return result;
}

export function workerAgentToolEnvironment(params: { workerRepoRoot: string }): Record<string, string> {
  const remoteToolPaths = [
    resolve(params.workerRepoRoot, "build/binutils"),
    resolve(params.workerRepoRoot, "build/tools"),
  ];
  const pathEntries = uniquePathEntries([
    ...remoteToolPaths,
    "/usr/local/sbin",
    "/usr/local/bin",
    "/usr/sbin",
    "/usr/bin",
    "/sbin",
    "/bin",
  ]);
  const env: Record<string, string> = {
    PATH: pathEntries.join(delimiter),
    ORCH_REAL_FIND: "/usr/bin/find",
    ORCH_WORKER_CANONICAL_TOOL_PATHS: JSON.stringify(WORKER_CANONICAL_TOOL_PATHS),
  };
  for (const tool of WORKER_CANONICAL_TOOL_PATHS) {
    env[envKeyForToolPath(tool.id)] = tool.relativePath;
  }
  return env;
}

export const MWCC_DEBUG_COMPILER_PROBE_COMMAND = [
  "bash",
  "-lc",
  "find build/compilers -mindepth 3 -maxdepth 3 -type f -name mwcceppc_debug.exe -print -quit 2>/dev/null | grep -q .",
] as const;
export const MWCC_DEBUG_COMPILER_PROBE_TIMEOUT_MS = 10_000;

/** Probe the worker sandbox once for the instrumented compiler used by live MWCC-debug tools. */
export async function probeMwccDebugCompilerProvisioned(
  sandboxHandle: SandboxHandle,
  workerRepoRoot: string,
): Promise<boolean> {
  try {
    const result = await sandboxHandle.exec([...MWCC_DEBUG_COMPILER_PROBE_COMMAND], {
      cwd: workerRepoRoot,
      timeoutMs: MWCC_DEBUG_COMPILER_PROBE_TIMEOUT_MS,
    });
    return result.exitCode === 0;
  } catch {
    return false;
  }
}

export const WORKER_CANONICAL_TOOL_PATH_PROBE_TIMEOUT_MS = 10_000;

export async function probeExistingWorkerCanonicalToolPaths(
  sandboxHandle: SandboxHandle,
  workerRepoRoot: string,
): Promise<Set<string>> {
  const relativePaths = WORKER_CANONICAL_TOOL_PATHS.map((tool) => tool.relativePath);
  const candidates = new Set<string>(relativePaths);
  const result = await sandboxHandle.exec(
    [
      "bash",
      "-lc",
      'for path in "$@"; do if test -e "$path"; then printf \'%s\\n\' "$path"; fi; done',
      "--",
      ...relativePaths,
    ],
    {
      cwd: workerRepoRoot,
      timeoutMs: WORKER_CANONICAL_TOOL_PATH_PROBE_TIMEOUT_MS,
    },
  );
  if (result.exitCode !== 0) {
    throw new Error(
      `Unable to probe canonical worker tool paths in ${workerRepoRoot}` +
      (result.stderr.trim() ? `: ${result.stderr.trim()}` : ""),
    );
  }
  return new Set(
    result.stdout
      .split(/\r?\n/)
      .filter((relativePath) => candidates.has(relativePath)),
  );
}

async function integrateWorkerDiff(params: {
  integrationRepoRoot: string;
  outputDir: string;
  patchPath: string;
  shouldApply: boolean;
}): Promise<{
  attempted: boolean;
  applied: boolean;
  patchPath: string | null;
  reasons: string[];
  checkStdoutPath?: string;
  checkStderrPath?: string;
  applyStdoutPath?: string;
  applyStderrPath?: string;
}> {
  if (!params.shouldApply) return { attempted: false, applied: false, patchPath: null, reasons: [] };
  const patchText = existsSync(params.patchPath) ? await readFile(params.patchPath, "utf8") : "";
  if (!patchText.trim()) {
    return { attempted: true, applied: true, patchPath: params.patchPath, reasons: ["worker diff was empty"] };
  }

  const checkStdoutPath = resolve(params.outputDir, "integration_git_apply_check.stdout.txt");
  const checkStderrPath = resolve(params.outputDir, "integration_git_apply_check.stderr.txt");
  const check = await runCommand(params.integrationRepoRoot, ["git", "apply", "--check", params.patchPath]);
  await writeFile(checkStdoutPath, check.stdout);
  await writeFile(checkStderrPath, check.stderr);
  if (check.exitCode !== 0) {
    return {
      attempted: true,
      applied: false,
      patchPath: params.patchPath,
      reasons: [`git apply --check exited ${check.exitCode}: ${outputTail(check.stderr || check.stdout, 1000)}`],
      checkStdoutPath,
      checkStderrPath,
    };
  }

  const applyStdoutPath = resolve(params.outputDir, "integration_git_apply.stdout.txt");
  const applyStderrPath = resolve(params.outputDir, "integration_git_apply.stderr.txt");
  const apply = await runCommand(params.integrationRepoRoot, ["git", "apply", params.patchPath]);
  await writeFile(applyStdoutPath, apply.stdout);
  await writeFile(applyStderrPath, apply.stderr);
  return {
    attempted: true,
    applied: apply.exitCode === 0,
    patchPath: params.patchPath,
    reasons: apply.exitCode === 0 ? [] : [`git apply exited ${apply.exitCode}: ${outputTail(apply.stderr || apply.stdout, 1000)}`],
    checkStdoutPath,
    checkStderrPath,
    applyStdoutPath,
    applyStderrPath,
  };
}

function mergeRunnerValidation(changeValidation: WorkerChangeValidation, postReturnCheck: PostReturnCheckValidation): WorkerChangeValidation {
  const postReturnCheckSummary = compactPostReturnCheck(postReturnCheck);
  if (changeValidation.status !== "passed") {
    return { ...changeValidation, postReturnCheck: postReturnCheckSummary };
  }
  if (postReturnCheck.status === "failed") {
    return {
      ...changeValidation,
      status: "failed",
      reasons: [...changeValidation.reasons, ...postReturnCheck.reasons],
      postReturnCheck: postReturnCheckSummary,
    };
  }
  return { ...changeValidation, postReturnCheck: postReturnCheckSummary };
}

function runnerValidationCompiled(validation: WorkerRunnerValidation): boolean {
  if (validation.status === "build_failed") return false;
  if (validation.status === "passed" || validation.status === "failed") return Boolean(validation.target) || validation.exitCode === 0;
  if (validation.status === "no_official_score_change" || validation.status === "target_regressed" || validation.status === "same_unit_regression") return true;
  // snapshot_unavailable after a successful object build still carries the unit
  // diff command; pre-build failures carry no command at all.
  return typeof validation.command === "string" && validation.command.includes("objdiff");
}

function clampSummary(text: string, maxChars = 400): string {
  const trimmed = text.trim();
  return trimmed.length <= maxChars ? trimmed : `${trimmed.slice(0, maxChars)}…`;
}

interface WorkerTaskFileBase {
  version: 1;
  run_id: string;
  worker_id: string;
  job_id: string;
  claim_token: ClaimToken;
  target_claim_id: string;
  worker_state_id: string;
  base_rev: string;
  artifact_dir: string;
  ttl_seconds: number;
  sandbox_sleep: boolean;
  sandbox_sleep_debounce_ms: number;
  thinking_level: string;
  post_return_check_command: string;
  worker_configure_command: string;
  graph_db_path: string;
  write_set_flags: ReturnType<typeof writeSetIntegrationFlags>;
}

interface WorkerTaskFile extends WorkerTaskFileBase {
  execution_class: "sandbox";
  sandbox_id: string;
  workspace_root: string;
}

function requiredTaskString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`Worker task is missing required string ${field}`);
  return value;
}

export async function readWorkerTaskFile(args: Map<string, string | true>): Promise<WorkerTaskFile> {
  const taskFile = stringArg(args, "--task-file", "").trim();
  if (!taskFile) throw new Error("worker-task requires --task-file");
  let value: unknown;
  try {
    value = JSON.parse(await readFile(taskFile, "utf8"));
  } catch (error) {
    throw new Error(`Unable to read worker task file ${taskFile}: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Worker task file must contain a JSON object");
  const row = value as Record<string, unknown>;
  if (row.version !== 1) throw new Error(`Unsupported worker task version: ${String(row.version)}`);
  const rawToken = row.claim_token;
  if (!rawToken || typeof rawToken !== "object" || Array.isArray(rawToken)) throw new Error("Worker task is missing claim_token");
  const tokenRow = rawToken as Record<string, unknown>;
  const claimToken: ClaimToken = {
    jobId: requiredTaskString(tokenRow.jobId, "claim_token.jobId"),
    kind: requiredTaskString(tokenRow.kind, "claim_token.kind") as ClaimToken["kind"],
    leaseId: requiredTaskString(tokenRow.leaseId, "claim_token.leaseId"),
  };
  if (claimToken.kind !== "worker") throw new Error(`Worker task claim_token has invalid kind: ${claimToken.kind}`);
  const executionClass = requiredTaskString(row.execution_class, "execution_class");
  if (executionClass !== "sandbox") {
    throw new Error(`Worker task has invalid execution_class: ${executionClass}`);
  }
  if (typeof row.ttl_seconds !== "number" || !Number.isFinite(row.ttl_seconds) || row.ttl_seconds <= 0) {
    throw new Error("Worker task requires a positive ttl_seconds");
  }
  if (typeof row.sandbox_sleep !== "boolean") {
    throw new Error("Worker task requires boolean sandbox_sleep");
  }
  if (
    typeof row.sandbox_sleep_debounce_ms !== "number"
    || !Number.isFinite(row.sandbox_sleep_debounce_ms)
    || row.sandbox_sleep_debounce_ms < 0
  ) {
    throw new Error("Worker task requires a non-negative sandbox_sleep_debounce_ms");
  }
  if (!row.write_set_flags || typeof row.write_set_flags !== "object" || Array.isArray(row.write_set_flags)) {
    throw new Error("Worker task is missing write_set_flags");
  }
  if (typeof row.post_return_check_command !== "string" || typeof row.worker_configure_command !== "string") {
    throw new Error("Worker task command fields must be strings");
  }
  const common: WorkerTaskFileBase = {
    version: 1,
    run_id: requiredTaskString(row.run_id, "run_id"),
    worker_id: requiredTaskString(row.worker_id, "worker_id"),
    job_id: requiredTaskString(row.job_id, "job_id"),
    claim_token: claimToken,
    target_claim_id: requiredTaskString(row.target_claim_id, "target_claim_id"),
    worker_state_id: requiredTaskString(row.worker_state_id, "worker_state_id"),
    base_rev: requiredTaskString(row.base_rev, "base_rev"),
    artifact_dir: requiredTaskString(row.artifact_dir, "artifact_dir"),
    ttl_seconds: row.ttl_seconds,
    sandbox_sleep: row.sandbox_sleep,
    sandbox_sleep_debounce_ms: row.sandbox_sleep_debounce_ms,
    thinking_level: requiredTaskString(row.thinking_level, "thinking_level"),
    post_return_check_command: row.post_return_check_command,
    worker_configure_command: row.worker_configure_command,
    graph_db_path: requiredTaskString(row.graph_db_path, "graph_db_path"),
    write_set_flags: row.write_set_flags as ReturnType<typeof writeSetIntegrationFlags>,
  };
  return {
    ...common,
    execution_class: "sandbox",
    sandbox_id: requiredTaskString(row.sandbox_id, "sandbox_id"),
    workspace_root: requiredTaskString(row.workspace_root, "workspace_root"),
  };
}

export function reconstructClaimedWorkerTask(store: StateStore, task: WorkerTaskFile): ClaimedTarget & { worktreePath: string } {
  const row = store.db.query(`
    SELECT epoch_targets.*, target_claims.worker_id AS claim_worker_id,
      target_claims.ttl AS claim_ttl, target_claims.write_set_json,
      target_claims.write_set_entries_json,
      worker_state.id AS joined_worker_state_id
    FROM target_claims
    JOIN epoch_targets ON epoch_targets.id = target_claims.epoch_target_id
    JOIN worker_state ON worker_state.target_claim_id = target_claims.id
    WHERE target_claims.id = ? AND target_claims.status = 'active' AND worker_state.id = ?
  `).get(task.target_claim_id, task.worker_state_id) as Record<string, unknown> | null;
  if (!row) throw new Error(`Active target claim not found for worker task: ${task.target_claim_id}`);
  if (String(row.claim_worker_id) !== task.worker_id) throw new Error(`Worker task worker_id does not match target claim ${task.target_claim_id}`);
  const entries = normalizeWriteSetEntries(row.write_set_entries_json, row.write_set_json);
  return {
    ...epochTargetToClaim(row, {
      claimId: task.target_claim_id,
      workerStateId: task.worker_state_id,
      workerId: task.worker_id,
      ttl: String(row.claim_ttl),
    }),
    writeSet: entries.map((entry) => entry.path),
    writeSetEntries: entries,
    worktreePath: task.workspace_root,
  };
}

export interface WorkerTaskRuntimeDeps {
  sandboxProvider?: SandboxProvider;
  runAgent?: (options: MeleeKernelPiRunOptions) => Promise<PiRunResult>;
}

function disabledSandboxSleepStats(): SandboxSleepStats {
  return {
    stopCount: 0,
    startCount: 0,
    stoppedMs: 0,
    stopFailures: 0,
    startFailures: 0,
    lastTransitionAt: Date.now(),
  };
}

export async function runWorkerCycleFromTask(
  globals: GlobalArgs,
  args: Map<string, string | true>,
  deps: WorkerTaskRuntimeDeps = {},
): Promise<WorkerCycleResult> {
  const task = await readWorkerTaskFile(args);
  const store = openState(globals.stateDir);
  try {
    if (task.claim_token.jobId !== task.job_id) throw new Error("Worker task job_id does not match claim_token.jobId");
    verifyClaimToken(store, task.claim_token);
    const run = getRun(store, task.run_id);
    if (!run) throw new Error(`Run not found: ${task.run_id}`);
    assertSchedulableRun(run, "worker-task");
    const cycleGameId = run.gameId ?? globals.game?.gameId ?? globals.gameId;
    const sessionId = canonicalCycleSessionId({
      db: store.db,
      gameId: cycleGameId,
      cycleUuid: run.cycleUuid,
      fallback: task.run_id,
    });
    const claimed = reconstructClaimedWorkerTask(store, task);
    const provider = deps.sandboxProvider ?? new DaytonaSandboxProvider();
    const rawSandboxHandle = await provider.get(task.sandbox_id);
    if (!rawSandboxHandle) throw new Error(`Worker task sandbox does not exist: ${task.sandbox_id}`);
    const sleepController = task.sandbox_sleep
      ? wrapSandboxHandleWithSleep(rawSandboxHandle, {
          debounceMs: task.sandbox_sleep_debounce_ms,
          log: (message) => console.error(`[sandbox-sleep] worker ${task.worker_id}: ${message}`),
        })
      : null;
    const sandboxHandle: SandboxHandle = sleepController ?? rawSandboxHandle;
    let finalizeSleepPromise: Promise<SandboxSleepStats> | null = null;
    const finalizeSandboxSleep = (): Promise<SandboxSleepStats> => {
      finalizeSleepPromise ??= (async () => {
        await sleepController?.close();
        const stats = sleepController?.stats() ?? disabledSandboxSleepStats();
        await mkdir(task.artifact_dir, { recursive: true });
        await writeFile(resolve(task.artifact_dir, "sandbox_sleep_stats.json"), `${JSON.stringify(stats, null, 2)}\n`);
        console.error(
          `[sandbox-sleep] worker ${task.worker_id}: enabled=${task.sandbox_sleep} `
          + `stops=${stats.stopCount} starts=${stats.startCount} stopped_ms=${stats.stoppedMs} `
          + `stop_failures=${stats.stopFailures} start_failures=${stats.startFailures}`,
        );
        return stats;
      })();
      return finalizeSleepPromise;
    };
    let taskFailed = false;
    try {
      const workspaceCheck = await sandboxHandle.exec(["test", "-d", "."], {
        cwd: task.workspace_root,
        timeoutMs: 30_000,
      });
      if (workspaceCheck.exitCode !== 0) {
        throw new Error(
          `Worker task sandbox workspace does not exist: ${task.workspace_root}` +
          (workspaceCheck.stderr.trim() ? `: ${workspaceCheck.stderr.trim()}` : ""),
        );
      }
      const workerRepoRoot = task.workspace_root;
      const workspaceExec = sandboxWorkspaceExec(sandboxHandle, workerRepoRoot);
      return await executeClaimedWorker({
        store,
        globals,
        run,
        runId: task.run_id,
        sessionId,
        claimed,
        workerRepoRoot,
        workspaceExec,
        sandboxHandle,
        runAgent: deps.runAgent,
        outputDir: task.artifact_dir,
        baseRev: task.base_rev,
        ttlSeconds: task.ttl_seconds,
        thinkingLevel: task.thinking_level,
        postReturnCheckCommand: task.post_return_check_command,
        graphDbPath: task.graph_db_path,
        writeSetFlags: task.write_set_flags,
        token: task.claim_token,
        sandboxSleepEnabled: task.sandbox_sleep,
        sandboxSleepDebounceMs: task.sandbox_sleep_debounce_ms,
        finalizeSandboxSleep,
      });
    } catch (error) {
      taskFailed = true;
      throw error;
    } finally {
      try {
        await finalizeSandboxSleep();
      } catch (error) {
        if (!taskFailed) throw error;
        console.error(
          `[sandbox-sleep] worker ${task.worker_id}: close failed after worker error: `
          + (error instanceof Error ? error.message : String(error)),
        );
      }
    }
  } finally {
    store.db.close();
  }
}

async function executeClaimedWorker(params: {
  store: StateStore;
  globals: GlobalArgs;
  run: NonNullable<ReturnType<typeof getRun>>;
  runId: string;
  sessionId: string;
  claimed: ClaimedTarget & { worktreePath: string };
  workerRepoRoot: string;
  workspaceExec: WorkspaceExec;
  sandboxHandle: SandboxHandle;
  runAgent?: (options: MeleeKernelPiRunOptions) => Promise<PiRunResult>;
  outputDir: string;
  baseRev: string;
  ttlSeconds: number;
  thinkingLevel: string;
  postReturnCheckCommand: string;
  graphDbPath: string;
  writeSetFlags: ReturnType<typeof writeSetIntegrationFlags>;
  token: ClaimToken;
  sandboxSleepEnabled: boolean;
  sandboxSleepDebounceMs: number;
  finalizeSandboxSleep: () => Promise<SandboxSleepStats>;
}): Promise<WorkerCycleResult> {
    const { store, globals, run, runId, sessionId, claimed, workerRepoRoot, workspaceExec,
      sandboxHandle, runAgent, outputDir, baseRev, ttlSeconds, thinkingLevel, postReturnCheckCommand,
      graphDbPath, writeSetFlags, token, sandboxSleepEnabled, sandboxSleepDebounceMs,
      finalizeSandboxSleep } = params;
    const writeSetWideningMode = writeSetFlags.writeSetWidening;
    let currentWriteSet = [...claimed.writeSet];
    let currentEntries = [...claimed.writeSetEntries];
    const wideningIds: string[] = [];
    const game = gameMetadata(globals, { graphDbPath, repoRoot: workerRepoRoot });
    const snapshot = loadKnowledgeBoardSnapshot(globals.repoRoot, { graphDbPath });
    const target = targetPacketTarget(claimed.target);
    const knowledgeContext = buildWorkerKnowledgeContext(String(target.source_path ?? ""), graphDbPath);
    const initialBoardPath = resolve(globals.stateDir, "runs", runId, "snapshots", "initial_board.json");
    const reportDir = resolve(outputDir, "state");
    await mkdir(reportDir, { recursive: true });
    const validationDir = resolve(outputDir, "runner_validation");
    await mkdir(validationDir, { recursive: true });
    const runnerCwd = resolve(outputDir, "host-cwd");
    await mkdir(runnerCwd, { recursive: true });
    const workerAgentEnv = workerAgentToolEnvironment({ workerRepoRoot });
    const mwccDebugProvisioned = await probeMwccDebugCompilerProvisioned(sandboxHandle, workerRepoRoot);
    const existingCanonicalToolPaths = await probeExistingWorkerCanonicalToolPaths(sandboxHandle, workerRepoRoot);
    const summaryPath = resolve(reportDir, "worker_state.json");
    const factsPath = resolve(reportDir, "facts.json");
    let preAttemptDiffPath = resolve(validationDir, "pre_worker_write_set.diff");
    let preAttemptDiff = await captureWriteSetDiff(workspaceExec, currentWriteSet, preAttemptDiffPath);
    const preAttemptChangedPaths = await captureWorktreeChangedPaths(workspaceExec, resolve(validationDir, "pre_worker_changed_paths.txt"));
    const microGateFlags: WorkerMicroGateFlags = {
      sectionParity: globals.game?.validation?.workerSectionParityGate ?? true,
      undefinedSymbols: globals.game?.validation?.workerUndefinedSymbolGate ?? true,
      bannedIdioms: globals.game?.validation?.workerBannedIdiomGate ?? true,
    };
    const workerChangeBaseline: WorkerChangeBaseline = await captureWorkerChangeBaseline({
      repoRoot: workerRepoRoot,
      outputDir: validationDir,
      target,
      dryRun: globals.dryRunAgents,
      // Tracked paths already modified outside the write set (e.g. seeded
      // report artifacts) join the QA snapshot so any worker edit to them is
      // visible to the L1 QA lint diff.
      extraPaths: preAttemptChangedPaths.filter((path) => !currentWriteSet.includes(path)),
      captureUndefinedSymbols: microGateFlags.undefinedSymbols,
      workspaceExec,
    });
    const measuredBaselineScore = finiteNumber(workerChangeBaseline.snapshot?.targetScore);
    if (measuredBaselineScore !== null) {
      updateWorkerStateBaselineScore(store, claimed.workerStateId, measuredBaselineScore, token);
      target.fuzzy_match_percent = measuredBaselineScore;
    }
    const packet = workerPacket({
      run,
      claim: claimed,
      target,
      baselineMeasures: snapshot.measures,
      knowledgeContext,
    });
    await writeFile(resolve(validationDir, "pre_worker_baseline.summary.json"), JSON.stringify(workerChangeBaseline, null, 2));
    const targetUnit = String(target.unit ?? "");
    const targetSymbol = String(target.symbol ?? "");
    appendWorkerActivityEvent(outputDir, {
      claim_id: claimed.claimId,
      phase: "setup",
      event_type: "claim_started",
      unit: targetUnit,
      symbol: targetSymbol,
      summary: `worker ${claimed.workerId} claimed ${targetSymbol} (${targetUnit}); baseline ${workerChangeBaseline.status}${
        measuredBaselineScore !== null ? ` ${measuredBaselineScore.toFixed(5)}` : ""
      }`,
      baseline: {
        status: workerChangeBaseline.status,
        score: measuredBaselineScore,
      },
      artifact_path: workerChangeBaseline.snapshotPath,
    });
    let repairRequest: Record<string, unknown> | null = null;
    let finalEvaluation: WorkerAttemptEvaluation | null = null;
    let attemptIndex = 0;
    let transientCycleRetryCount = 0;
    let contextRetryIndex = 0;
    const claimDeadlineMs = Date.parse(claimed.ttl);
    while (true) {
      const currentPacket = {
        ...packet,
        target_claim: {
          ...((packet.target_claim as Record<string, unknown> | undefined) ?? {}),
          write_set: currentWriteSet,
        },
      };
      const attemptPacket = repairRequest
        ? {
            ...currentPacket,
            repair_request: repairRequest,
          }
        : currentPacket;
      const cycleRetryIndex = transientCycleRetryCount;
      const contextBudget = workerPromptContextBudget(contextRetryIndex);
      appendWorkerActivityEvent(outputDir, {
        claim_id: claimed.claimId,
        attempt_index: attemptIndex,
        cycle_retry_index: cycleRetryIndex,
        context_retry_index: contextRetryIndex,
        context_budget: contextBudget,
        phase: repairRequest ? "repair" : "attempt",
        event_type: "worker_session_started",
        unit: targetUnit,
        symbol: targetSymbol,
        summary: repairRequest
          ? clampSummary(
              `${cycleRetryIndex > 0 ? `repair worker cycle ${attemptIndex} retry ${cycleRetryIndex}/${WORKER_PI_SESSION_RETRY_POLICY.maxTransientRetries}` : `repair worker cycle ${attemptIndex}`} in flight with ${contextBudget} context: ${(repairRequest.reasons as string[]).join("; ")}`,
            )
          : cycleRetryIndex > 0
            ? `worker cycle ${attemptIndex} retry ${cycleRetryIndex}/${WORKER_PI_SESSION_RETRY_POLICY.maxTransientRetries} started with ${contextBudget} context`
            : `worker cycle ${attemptIndex} started with ${contextBudget} context`,
      });
      let result: PiRunResult;
      try {
        const runWorkerAgent = runAgent ?? (await import("@server/infrastructure/agent-runtime/kernel-pi-runner")).runMeleeKernelPiAgent;
        let targetSourceText: string | null;
        const targetSourcePath = safeRepoRelativePath(workerRepoRoot, String(target.source_path ?? ""));
        if (!targetSourcePath) {
          targetSourceText = null;
        } else {
          try {
            targetSourceText = await sandboxHandle.readFile(targetSourcePath);
          } catch {
            targetSourceText = null;
          }
        }
        result = await runWorkerAgent({
          role: "worker",
          cwd: runnerCwd,
          prompt: workerPrompt({
            packet: attemptPacket,
            repoRoot: workerRepoRoot,
            stateDir: globals.stateDir,
            game,
            initialBoardPath,
            workerLogDir: outputDir,
            contextBudget,
            targetSourceText,
            existingCanonicalToolPaths,
          }),
          outputDir,
          dryRun: globals.dryRunAgents,
          provider: globals.provider,
          model: globals.model,
          thinkingLevel,
          timeoutMs: globals.agentTimeoutSeconds ? globals.agentTimeoutSeconds * 1000 : undefined,
          env: workerAgentEnv,
          // Whole-file writes conflict with the preserve-dirty-work rule and were
          // used in 0% of confirmed exacts (-51pt lift); edit/bash cover the need.
          excludeBuiltinTools: ["write", "read", "edit", "grep", "glob", "bash"],
          bashOperations: sandboxBashOperations(sandboxHandle, workerRepoRoot),
          bashEnvironment: workerAgentEnv,
          customTools: [...createSandboxFileToolDefinitions(sandboxHandle, workerRepoRoot)],
          toolContext: {
            cwd: workerRepoRoot,
            repoRoot: workerRepoRoot,
            stateDir: globals.stateDir,
            game,
            worktreeId: claimed.claimId,
            packet: attemptPacket,
            initialBoardPath,
            workerLogDir: outputDir,
            claimId: claimed.claimId,
            attemptIndex,
            sandboxHandle,
            mwccDebugProvisioned,
          },
          kernelContext: createMeleeKernelSpawnContext({
            kind: "worker",
            gameId: game?.gameId ?? globals.gameId,
            // The cycle-derived session id, not the run id: a worker belongs to
            // the cycle its run belongs to, and the two differ.
            sessionId,
            runId,
            epochId: claimed.epochId,
            claimId: claimed.claimId,
            targetId: claimed.targetId,
            phase: "worker",
            workingDir: runnerCwd,
            metadata: {
              workerId: claimed.workerId,
              attemptIndex,
              cycleRetryIndex,
              contextRetryIndex,
              contextBudget,
              attemptPhase: repairRequest ? "repair" : "attempt",
              targetUnit,
              targetSymbol,
              sourcePath: String(target.source_path ?? ""),
              integrationRepoRoot: globals.repoRoot,
              workerRepoRoot,
            },
          }),
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const launchFailureSuffix = [
          contextRetryIndex > 0 ? `.context-${contextRetryIndex}` : "",
          cycleRetryIndex > 0 ? `.retry-${cycleRetryIndex}` : "",
        ].join("");
        result = {
          sessionId: `worker-launch-failed-${randomUUID()}`,
          outputPath: resolve(outputDir, `worker_launch_failed_${attemptIndex}${launchFailureSuffix}.txt`),
          systemPromptPath: resolve(outputDir, `worker_launch_failed_${attemptIndex}${launchFailureSuffix}.system.md`),
          userPromptPath: resolve(outputDir, `worker_launch_failed_${attemptIndex}${launchFailureSuffix}.user.md`),
          rawText: `[worker launch failed]\n${message}\n`,
          dryRun: globals.dryRunAgents,
          failed: true,
          error: message,
        };
        await writeFile(result.outputPath, result.rawText);
        await writeFile(result.systemPromptPath, "");
        await writeFile(result.userPromptPath, "");
      }

      addPiSession({
        store,
        runId,
        claimId: claimed.claimId,
        role: "worker",
        sessionId: result.sessionId,
        sessionFile: result.sessionFile,
        provider: globals.provider,
        model: globals.model,
        thinkingLevel,
        status: result.failed || result.providerError ? "failed" : result.dryRun ? "dry_run" : "succeeded",
        outputPath: result.outputPath,
      });
      appendWorkerSessionId(store, claimed.workerStateId, result.sessionId, token);
      appendWorkerActivityEvent(outputDir, {
        claim_id: claimed.claimId,
        session_id: result.sessionId,
        attempt_index: attemptIndex,
        cycle_retry_index: cycleRetryIndex,
        context_retry_index: contextRetryIndex,
        context_budget: contextBudget,
        phase: repairRequest ? "repair" : "attempt",
        event_type: "pi_session_finished",
        unit: targetUnit,
        symbol: targetSymbol,
        summary: result.providerError
          ? clampSummary(`Pi provider error: ${result.providerError}`)
          : result.failed
            ? clampSummary(`Pi cycle failed: ${result.error ?? "unknown error"}`)
            : "Pi cycle returned; evaluating worker note",
        artifact_path: result.outputPath,
      });

      const parsedAgentNote =
        result.dryRun || result.failed || result.providerError
          ? { note: null as Record<string, unknown> | null, error: result.error ?? result.providerError }
          : parseWorkerCheckpointNote(result.rawText);
      const agentNote = parsedAgentNote.note;
      const workerSessionTimedOut = isWorkerSessionTimeoutFailure(result);
      const postAttemptDiffPath = resolve(validationDir, `attempt-${attemptIndex}.write_set.diff`);
      const postAttemptDiff = await captureWriteSetDiff(workspaceExec, currentWriteSet, postAttemptDiffPath);
      const writeSetDiffChanged = postAttemptDiff.stdout !== preAttemptDiff.stdout;
      const reviewLint = lintWorkerReviewDiff(postAttemptDiff.stdout);
      const attemptChangedPathsPath = resolve(validationDir, `attempt-${attemptIndex}.changed_paths.txt`);
      const attemptChangedPaths = await captureWorktreeChangedPaths(workspaceExec, attemptChangedPathsPath);
      // Edits outside the write set are dropped from the banked patch, but must
      // not stay invisible: extend the QA baseline snapshot so worker-level
      // Python QA diffs them, and surface them below as a repair reason plus
      // structured checkpoint evidence.
      const outOfWriteSetChanges = collectOutOfWriteSetChanges({
        changedPaths: attemptChangedPaths,
        preAttemptChangedPaths,
        writeSet: currentWriteSet,
      });
      if (outOfWriteSetChanges.length > 0) {
        await extendWorkerChangeBaselineSourceSnapshot({
          repoRoot: workerRepoRoot,
          baseline: workerChangeBaseline,
          extraPaths: outOfWriteSetChanges.map((change) => change.path),
          workspaceExec,
        });
      }

      let wideningDecision: WideningDecision | null = null;
      let wideningDraftRequest: WideningRequest | null = null;
      const wideningReasons: string[] = [];
      let wideningRoutedCrossModule = false;
      if (writeSetWideningMode !== "off") {
        const parsedWidening = parseWorkerWideningRequest(agentNote);
        if (parsedWidening.error) {
          if (writeSetWideningMode !== "shadow") wideningReasons.push(`widening_denied: ${parsedWidening.error}`);
        } else if (parsedWidening.request) {
          const request = parsedWidening.request;
          const wideningId = randomUUID();
          createWriteSetWidening(store, {
            id: wideningId,
            runId,
            epochId: claimed.epochId,
            targetClaimId: claimed.claimId,
            workerStateId: claimed.workerStateId,
            attemptIndex,
            request,
          });
          wideningDecision = decideWidening({
            request,
            sourcePath: String(target.source_path ?? ""),
            wideningId,
            allowOwningHeader: writeSetWideningMode === "shadow" || writeSetWideningMode === "header",
            headerDeclaresEvidenceSymbol: await headerDeclaresEvidenceSymbol(workerRepoRoot, request, sandboxHandle),
          });
          recordWriteSetWideningDecision(store, wideningId, wideningDecision);

          if (shouldApplyWideningDecision(writeSetWideningMode, wideningDecision)) {
            const newPaths = wideningDecision.approvedPaths.filter((path) => !currentWriteSet.includes(path));
            if (newPaths.length > 0) {
              const entries: WriteSetEntry[] = newPaths.map((path) => ({
                path,
                category: request.category,
                rung: request.rung,
                addedBy: "widening",
                wideningId,
              }));
              const widened = widenClaimWriteSet(store, claimed.claimId, entries, token);
              currentWriteSet = widened.writeSet;
              currentEntries = widened.entries;
              wideningIds.push(wideningId);

              // The validation module's scope-following widening hook lands in
              // parallel. Until it is importable, extend the source snapshot so
              // QA sees the newly authorized paths; do not run a full build here.
              await extendWorkerChangeBaselineSourceSnapshot({
                repoRoot: workerRepoRoot,
                baseline: workerChangeBaseline,
                extraPaths: newPaths,
                workspaceExec,
              });
              preAttemptDiffPath = resolve(validationDir, `attempt-${attemptIndex}.pre_widening_write_set.diff`);
              preAttemptDiff = await captureWriteSetDiff(workspaceExec, currentWriteSet, preAttemptDiffPath);

              const continuationReason = `write_set_widened: approved ${newPaths.join(", ")} at rung ${request.rung}; scoped validation tier ${wideningDecision.validationTier} applies`;
              const repairFeedbackPath = resolve(validationDir, `attempt-${attemptIndex}.widening_continuation.json`);
              repairRequest = {
                attempt: attemptIndex + 1,
                previous_agent_output_path: result.outputPath,
                previous_post_attempt_diff_path: postAttemptDiffPath,
                reasons: [continuationReason],
                widening_decision: wideningDecision,
                write_set: currentWriteSet,
                instruction:
                  `Your approved write set now includes ${newPaths.join(", ")} under category ${request.category}. ` +
                  `Make the canonical fix, remove any local shim used to work around it, and return a validation-ready handoff. ` +
                  `The runner will apply scope-following tier ${wideningDecision.validationTier} checks; no per-attempt full build is permitted.`,
              };
              await writeFile(repairFeedbackPath, JSON.stringify(repairRequest, null, 2));
              addEvent(store, runId, "write_set_widened" as Parameters<typeof addEvent>[2], "worker", {
                worker_state_id: claimed.workerStateId,
                target_claim_id: claimed.claimId,
                widening_id: wideningId,
                paths: newPaths,
                category: request.category,
                rung: request.rung,
              });
              appendWorkerActivityEvent(outputDir, {
                claim_id: claimed.claimId,
                session_id: result.sessionId,
                attempt_index: attemptIndex,
                phase: "repair_request",
                event_type: "write_set_widened",
                unit: targetUnit,
                symbol: targetSymbol,
                summary: continuationReason,
                artifact_path: repairFeedbackPath,
              });
              attemptIndex += 1;
              transientCycleRetryCount = 0;
              continue;
            }
          } else if (writeSetWideningMode !== "shadow") {
            const reason = wideningDecisionRepairReason(wideningDecision);
            if (reason) wideningReasons.push(reason);
            if (wideningDecision.status === "routed_cross_module") {
              wideningRoutedCrossModule = true;
              addEvent(store, runId, "widening_routed_cross_module" as Parameters<typeof addEvent>[2], "worker", {
                worker_state_id: claimed.workerStateId,
                target_claim_id: claimed.claimId,
                widening_id: wideningId,
                request,
                decision: wideningDecision,
              });
            }
          }
        }
        if (
          (writeSetWideningMode === "config" || writeSetWideningMode === "header") &&
          agentNote?.widening_request == null &&
          outOfWriteSetChanges.length > 0
        ) {
          wideningDraftRequest = draftWideningRequestFromOutOfWriteSet(
            outOfWriteSetChanges,
            String(target.source_path ?? ""),
          );
          if (wideningDraftRequest) {
            wideningReasons.push(
              "widening_request_required: justify the surfaced cross-file edit by completing the attached widening_request draft, or revert it",
            );
          }
        }
      }

      if (!shouldRunRunnerValidationForWorkerSession(result)) {
        const contextRetryDecision = workerPiContextRetryDecision({
          result,
          contextRetryIndex,
          dryRun: globals.dryRunAgents,
          claimDeadlineMs: Number.isFinite(claimDeadlineMs) ? claimDeadlineMs : null,
        });
        if (contextRetryDecision.shouldRetry) {
          const nextRetryIndex = contextRetryDecision.nextRetryIndex ?? contextRetryIndex + 1;
          const nextBudget = contextRetryDecision.nextBudget ?? workerPromptContextBudget(nextRetryIndex);
          const retrySummaryPath = resolve(validationDir, `attempt-${attemptIndex}.worker_context_retry-${nextRetryIndex}.summary.json`);
          const retryReason = result.providerError ?? result.error ?? "unknown context-window failure";
          await writeFile(
            retrySummaryPath,
            JSON.stringify(
              {
                attempt_index: attemptIndex,
                cycle_retry_index: cycleRetryIndex,
                context_retry_index: contextRetryIndex,
                next_context_retry_index: nextRetryIndex,
                context_budget: contextBudget,
                next_context_budget: nextBudget,
                previous_session_id: result.sessionId,
                previous_agent_output_path: result.outputPath,
                failure: {
                  provider_error: result.providerError ?? null,
                  error: result.error ?? null,
                },
                retry_policy: contextRetryDecision,
                write_set_diff: {
                  baseline_path: preAttemptDiffPath,
                  post_attempt_path: postAttemptDiffPath,
                  changed_from_pre_worker: writeSetDiffChanged,
                },
              },
              null,
              2,
            ),
          );
          appendWorkerActivityEvent(outputDir, {
            claim_id: claimed.claimId,
            session_id: result.sessionId,
            attempt_index: attemptIndex,
            cycle_retry_index: cycleRetryIndex,
            context_retry_index: contextRetryIndex,
            next_context_retry_index: nextRetryIndex,
            context_budget: contextBudget,
            next_context_budget: nextBudget,
            phase: "agent_retry",
            event_type: "worker_context_retry_requested",
            unit: targetUnit,
            symbol: targetSymbol,
            summary: clampSummary(`context window rejected ${contextBudget} prompt; retrying with ${nextBudget} context: ${retryReason}`),
            artifact_path: retrySummaryPath,
          });
          contextRetryIndex = nextRetryIndex;
          transientCycleRetryCount = 0;
          continue;
        }
        const retryDecision = workerPiSessionRetryDecision({
          result,
          transientRetryCount: transientCycleRetryCount,
          dryRun: globals.dryRunAgents,
          claimDeadlineMs: Number.isFinite(claimDeadlineMs) ? claimDeadlineMs : null,
        });
        if (retryDecision.shouldRetry) {
          const nextRetryIndex = retryDecision.nextRetryIndex ?? transientCycleRetryCount + 1;
          const retrySummaryPath = resolve(validationDir, `attempt-${attemptIndex}.worker_session_retry-${nextRetryIndex}.summary.json`);
          const retryReason = result.providerError ?? result.error ?? "unknown Pi cycle failure";
          await writeFile(
            retrySummaryPath,
            JSON.stringify(
              {
                attempt_index: attemptIndex,
                cycle_retry_index: cycleRetryIndex,
                next_cycle_retry_index: nextRetryIndex,
                previous_session_id: result.sessionId,
                previous_agent_output_path: result.outputPath,
                failure: {
                  provider_error: result.providerError ?? null,
                  error: result.error ?? null,
                },
                retry_policy: retryDecision,
                write_set_diff: {
                  baseline_path: preAttemptDiffPath,
                  post_attempt_path: postAttemptDiffPath,
                  changed_from_pre_worker: writeSetDiffChanged,
                },
              },
              null,
              2,
            ),
          );
          appendWorkerActivityEvent(outputDir, {
            claim_id: claimed.claimId,
            session_id: result.sessionId,
            attempt_index: attemptIndex,
            cycle_retry_index: cycleRetryIndex,
            context_retry_index: contextRetryIndex,
            context_budget: contextBudget,
            next_cycle_retry_index: nextRetryIndex,
            phase: "agent_retry",
            event_type: "worker_session_retry_requested",
            unit: targetUnit,
            symbol: targetSymbol,
            summary: clampSummary(
              `transient Pi cycle failure; retry ${nextRetryIndex}/${WORKER_PI_SESSION_RETRY_POLICY.maxTransientRetries}: ${retryReason}`,
            ),
            artifact_path: retrySummaryPath,
          });
          transientCycleRetryCount = nextRetryIndex;
          continue;
        }
        const reason = result.providerError
          ? `LLM provider failed before producing a validation-ready worker response: ${result.providerError}`
          : `Worker Pi cycle failed before producing a validation-ready worker response: ${result.error ?? "unknown error"}`;
        const errorValidationPath = resolve(validationDir, `attempt-${attemptIndex}.worker_session_error.summary.json`);
        const runnerValidation: WorkerChangeValidation = {
          status: "skipped",
          reasons: [reason],
          summaryPath: errorValidationPath,
          qaLint: null,
        };
        await writeFile(errorValidationPath, JSON.stringify(runnerValidation, null, 2));
        appendWorkerActivityEvent(outputDir, {
          claim_id: claimed.claimId,
          session_id: result.sessionId,
          attempt_index: attemptIndex,
          cycle_retry_index: cycleRetryIndex,
          context_retry_index: contextRetryIndex,
          context_budget: contextBudget,
          phase: "agent_error",
          event_type: result.providerError ? "provider_error" : "worker_session_failed",
          unit: targetUnit,
          symbol: targetSymbol,
          summary: clampSummary(reason),
          artifact_path: result.outputPath,
        });
        finalEvaluation = {
          result,
          agentNote,
          parsedError: parsedAgentNote.error,
          runnerValidation,
          repairReasons: [],
          continuationDecision: terminalWorkerSessionErrorDecision({
            attemptIndex,
            stopReason: result.providerError ? "provider_error" : "worker_session_failed",
            reasons: [reason],
            claimDeadlineMs: Number.isFinite(claimDeadlineMs) ? claimDeadlineMs : null,
          }),
          writeSetDiffChanged,
          outOfWriteSetChanges,
          postAttemptDiffPath,
        };
        break;
      }

      const shouldRunRunnerValidation = shouldRunRunnerValidationForWorkerSession(result);
      const targetChangeValidation = await validateWorkerChange({
        repoRoot: workerRepoRoot,
        hostRepoRoot: globals.repoRoot,
        outputDir: validationDir,
        attemptIndex,
        baseline: workerChangeBaseline,
        target,
        dryRun: globals.dryRunAgents,
        shouldRun: shouldRunRunnerValidation,
        claimedExact: true,
        microGateFlags,
        postAttemptDiffText: postAttemptDiff.stdout,
        workspaceExec,
      });
      const changeValidation = currentEntries.some((entry) => entry.addedBy === "widening")
        ? await validateWidenedChange({
            validation: targetChangeValidation,
            repoRoot: workerRepoRoot,
            outputDir: validationDir,
            attemptIndex,
            targetSourcePath: String(target.source_path ?? ""),
            writeSetEntries: currentEntries,
            baseRev,
            runStateDir: resolve(globals.stateDir, "runs", runId),
            workspaceExec,
          })
        : targetChangeValidation;
      if (changeValidation.scopedChecks?.status !== undefined && changeValidation.scopedChecks.status !== "skipped") {
        const status = changeValidation.scopedChecks.status === "passed" ? "validated" : "validation_failed";
        for (const wideningId of wideningIds) {
          recordWriteSetWideningValidation(store, wideningId, {
            status,
            evidence: { ...changeValidation.scopedChecks },
          });
        }
      }
      const postReturnCheck = await runPostReturnCheck({
        commandTemplate: postReturnCheckCommand,
        dryRun: globals.dryRunAgents,
        repoRoot: workerRepoRoot,
        stateDir: globals.stateDir,
        workerLogDir: outputDir,
        claimId: claimed.claimId,
        writeSet: currentWriteSet,
        target,
        outputDir,
        attemptIndex,
        shouldRun: shouldRunRunnerValidation && changeValidation.status === "passed",
        workspaceExec,
      });
      const runnerValidation = mergeRunnerValidation(changeValidation, postReturnCheck);
      if (runnerValidation.summaryPath) await writeFile(runnerValidation.summaryPath, JSON.stringify(runnerValidation, null, 2));
      recordWorkerCheckpoint(store, {
        authority: token,
        workerStateId: claimed.workerStateId,
        runId,
        epochId: claimed.epochId,
        epochTargetId: claimed.epochTargetId,
        targetClaimId: claimed.claimId,
        attemptIndex,
        oldScore: runnerValidation.target?.before ?? null,
        newScore: runnerValidation.target?.after ?? null,
        exactMatch: Boolean(runnerValidation.target?.exact),
        hardGatesPassed: runnerValidation.status === "passed" && reviewLint.status !== "failed",
        buildStatus: runnerValidationCompiled(runnerValidation) ? "compiled" : "not_compiled",
        qaStatus: runnerValidation.qaLint?.status ?? null,
        objdiffStatus: runnerValidation.target ? "available" : null,
        validationStatus: runnerValidation.status,
        artifactPath: runnerValidation.summaryPath ?? null,
        patchPath: postAttemptDiffPath,
        diffPath: postAttemptDiffPath,
        writeSet: currentWriteSet,
        failureReasons: runnerValidation.reasons,
        metadata: {
          agent_output_path: result.outputPath,
          agent_note: agentNote,
          agent_note_parse_error: parsedAgentNote.error ?? null,
          review_lint: reviewLint,
          post_return_check: runnerValidation.postReturnCheck ?? null,
          micro_gates: runnerValidation.microGates ?? null,
          worker_session_timed_out: workerSessionTimedOut,
          write_set_diff_changed: writeSetDiffChanged,
          write_set_entries: currentEntries,
          widening_ids: wideningIds,
          widening_decision: wideningDecision,
          widening_request_draft: wideningDraftRequest,
          widened_validation: runnerValidation.scopedChecks ?? null,
          // Structured evidence of edits the banked patch drops; the category
          // counts feed the future write-set-widening design.
          out_of_write_set_changes: {
            paths: outOfWriteSetChanges,
            count: outOfWriteSetChanges.length,
            categories: outOfWriteSetCategoryCounts(outOfWriteSetChanges),
          },
        },
      });
      appendWorkerActivityEvent(outputDir, {
        claim_id: claimed.claimId,
        session_id: result.sessionId,
        attempt_index: attemptIndex,
        cycle_retry_index: cycleRetryIndex,
        context_retry_index: contextRetryIndex,
        context_budget: contextBudget,
        phase: repairRequest ? "repair_validation" : "validation",
        event_type: "worker_note",
        unit: targetUnit,
        symbol: targetSymbol,
        summary: parsedAgentNote.error
          ? clampSummary(`worker note parse issue: ${parsedAgentNote.error}`)
          : `worker note status: ${recordString(agentNote?.status) || "missing"}`,
      });
      appendWorkerActivityEvent(outputDir, {
        claim_id: claimed.claimId,
        session_id: result.sessionId,
        attempt_index: attemptIndex,
        cycle_retry_index: cycleRetryIndex,
        context_retry_index: contextRetryIndex,
        context_budget: contextBudget,
        phase: repairRequest ? "repair_validation" : "validation",
        event_type: runnerValidation.status === "passed" ? "runner_validation_passed" : runnerValidation.status === "skipped" ? "runner_validation_skipped" : "runner_validation_rejected",
        unit: targetUnit,
        symbol: targetSymbol,
        summary: clampSummary(
          `runner validation ${runnerValidation.status}${runnerValidation.reasons.length > 0 ? `: ${runnerValidation.reasons.join("; ")}` : ""}${
            reviewLint.status === "failed" ? `; review lint failed (checkpoint not selectable)${reviewLint.reasons.length > 0 ? `: ${reviewLint.reasons.join("; ")}` : ""}` : ""
          }`,
        ),
        score: runnerValidation.target
          ? { before: runnerValidation.target.before, after: runnerValidation.target.after, exact: runnerValidation.target.exact }
          : undefined,
        artifact_path: runnerValidation.summaryPath,
      });
      const repairReasons = workerAttemptRepairReasons({ runnerValidation, reviewLint, outOfWriteSetChanges, wideningReasons });
      const policyContinuationDecision = workerContinuationDecision({
        attemptIndex,
        checkpoints: workerCheckpointsForWorkerState(store, claimed.workerStateId),
        repairReasons,
        dryRun: result.dryRun,
        claimDeadlineMs: Number.isFinite(claimDeadlineMs) ? claimDeadlineMs : null,
      });
      const continuationDecision: WorkerContinuationDecision = wideningRoutedCrossModule
        ? {
            ...policyContinuationDecision,
            shouldContinue: false,
            exhausted: false,
            stopReason: "widening_routed_cross_module",
            continueReason: null,
          }
        : policyContinuationDecision;
      const attemptGatePath = resolve(validationDir, `attempt-${attemptIndex}.return_gate.json`);
      const evaluation: WorkerAttemptEvaluation = {
        result,
        agentNote,
        parsedError: parsedAgentNote.error,
        runnerValidation,
        repairReasons,
        continuationDecision,
        writeSetDiffChanged,
        outOfWriteSetChanges,
        postAttemptDiffPath,
      };
      await writeFile(
        attemptGatePath,
        JSON.stringify(
          {
            attempt_index: attemptIndex,
            repair_policy: {
              mode: WORKER_ATTEMPT_TAIL_POLICY.mode,
              claim_ttl: claimed.ttl,
              max_cold_attempts: WORKER_ATTEMPT_TAIL_POLICY.maxColdAttempts,
              follow_up_attempts_after_best: WORKER_ATTEMPT_TAIL_POLICY.followUpAttemptsAfterBest,
              follow_up_attempts_after_gate_failed_exact: WORKER_ATTEMPT_TAIL_POLICY.followUpAttemptsAfterGateFailedExact,
              decision: continuationDecision,
            },
            agent_output_path: result.outputPath,
            context_budget: contextBudget,
            context_retry_index: contextRetryIndex,
            agent_note_parse_error: parsedAgentNote.error ?? null,
            agent_note_status: recordString(agentNote?.status) || null,
            runner_validation: runnerValidation,
            review_lint: reviewLint,
            widening: {
              mode: writeSetWideningMode,
              decision: wideningDecision,
              request_draft: wideningDraftRequest,
            },
            write_set_diff: {
              baseline_path: preAttemptDiffPath,
              post_attempt_path: postAttemptDiffPath,
              changed_from_pre_worker: writeSetDiffChanged,
              changed_paths_path: attemptChangedPathsPath,
              out_of_write_set_changes: outOfWriteSetChanges,
              out_of_write_set_categories: outOfWriteSetCategoryCounts(outOfWriteSetChanges),
            },
            repair_reasons: repairReasons,
          },
          null,
          2,
        ),
      );

      finalEvaluation = evaluation;
      if (!continuationDecision.shouldContinue) break;

      const repairFeedbackPath = resolve(validationDir, `attempt-${attemptIndex}.repair_request.json`);
      const repairInstruction =
        continuationDecision.continueReason === "gate_failed_exact_repair"
          ? "The runner measured an exact target score, but hard gates failed, so this is a bounded gate-repair continuation. Hard gates win over match %: this return can never be accepted while any gate failure remains, and the runner will accept a lower gate-clean score. First try to keep the match with a compliant idiom inside your claimed write set (game assert/report macros, established inline helpers — not banned pragmas, .c externs, or open-coded asserts). If the canonical fix is a cross-file edit — a declaration in the owning header, a symbols.txt/splits.txt change — you cannot ship it: edits outside your write set are silently dropped at patch capture, so do not shim around it locally; state that in your note's blockers instead. If the exact match fundamentally requires a banned pattern, remove the pattern and return your best gate-clean version; that lower score is the successful outcome, not a failure. Never resubmit an unchanged diff — if no gate-clean improvement is possible, state that in your note's blockers (e.g. 'exact requires banned pattern X' or 'exact requires cross-file edit to <path>') so the runner can close the target. Preserve pre-existing dirty work, return a compact validation-ready JSON note, and do not use whole-file destructive reset/restore/checkout/clean commands."
          : "The runner checkpointed the current worktree under the bounded attempt-tail policy, but the checkpoint is not yet acceptable. Fix the runner-listed validation/review-lint issues; a validated, gate-clean improvement will be banked immediately and the worker closed. Keep retained useful edits, preserve pre-existing dirty work, and return a compact validation-ready JSON note when you want the runner to checkpoint again. Do not use whole-file destructive reset/restore/checkout/clean commands.";
      repairRequest = {
        attempt: attemptIndex + 1,
        previous_agent_output_path: result.outputPath,
        previous_return_gate_path: attemptGatePath,
        previous_post_attempt_diff_path: postAttemptDiffPath,
        paths_note: REPAIR_REQUEST_PATHS_NOTE,
        ...(await buildRepairRequestInlineArtifacts({
          agentOutputPath: result.outputPath,
          returnGatePath: attemptGatePath,
          postAttemptDiffPath,
        })),
        reasons: repairReasons,
        continuation_policy: continuationDecision,
        ...(shouldExposeWideningDecisionToWorker(writeSetWideningMode)
          ? { widening_decision: wideningDecision, widening_request: wideningDraftRequest }
          : {}),
        instruction: repairInstruction,
      };
      evaluation.repairFeedbackPath = repairFeedbackPath;
      await writeFile(repairFeedbackPath, JSON.stringify(repairRequest, null, 2));
      appendWorkerActivityEvent(outputDir, {
        claim_id: claimed.claimId,
        session_id: result.sessionId,
        attempt_index: attemptIndex,
        cycle_retry_index: cycleRetryIndex,
        context_retry_index: contextRetryIndex,
        context_budget: contextBudget,
        phase: "repair_request",
        event_type: "repair_requested",
        unit: targetUnit,
        symbol: targetSymbol,
        summary: clampSummary(`runner rejected the return; repair attempt ${attemptIndex + 1} requested: ${repairReasons.join("; ")}`),
        artifact_path: repairFeedbackPath,
      });
      attemptIndex += 1;
      transientCycleRetryCount = 0;
    }

    if (!finalEvaluation) throw new Error("Worker loop ended without an attempt evaluation");

    const result = finalEvaluation.result;
    const agentNote = finalEvaluation.agentNote;
    const agentFacts = Array.isArray(agentNote?.facts) ? agentNote.facts : [];
    const agentBlockers = Array.isArray(agentNote?.blockers) ? agentNote.blockers : [];
    const bestCheckpoint = bestCheckpointForWorkerState(store, claimed.workerStateId);
    const infraError =
      result.providerError
        ? {
            kind: "provider_error",
            summary: `LLM provider failed before the runner could continue the worker: ${result.providerError}`,
            reasons: [result.providerError],
          }
        : result.failed && !isWorkerSessionTimeoutFailure(result)
          ? {
              kind: "worker_session_failed",
              summary: `Worker Pi cycle failed before producing a validation-ready state: ${result.error ?? "unknown error"}`,
              reasons: [result.error ?? "unknown worker cycle failure"],
            }
          : null;
    const agentToolErrors = agentNoteSignalsToolError(agentNote);
    const errorClassification =
      infraError ??
      (agentToolErrors.fatal.length > 0
        ? {
            kind: "agent_noted_tool_error",
            summary: `Worker note describes a tool/build/validation failure: ${agentToolErrors.fatal.join("; ")}`,
            reasons: agentToolErrors.fatal,
          }
        : null);
    const lifecycleStatus = errorClassification ? "error" : bestCheckpoint?.exactMatch ? "exact" : "timeout";
    const summaryText =
      errorClassification?.summary ??
      (bestCheckpoint?.exactMatch
        ? `Runner selected exact checkpoint ${bestCheckpoint.id}.`
        : bestCheckpoint
          ? finalEvaluation.continuationDecision.stopReason === "improvement_banked"
            ? `Runner banked improvement checkpoint ${bestCheckpoint.id} (${bestCheckpoint.newScore ?? "unknown"}) and closed the worker.`
            : `Runner timeout selected best prior checkpoint ${bestCheckpoint.id} (${bestCheckpoint.newScore ?? "unknown"}).`
          : "Runner timeout selected baseline because no checkpoint passed hard gates and improved over baseline.");
    const sandboxSleepStats = await finalizeSandboxSleep();
    const sandboxSleepSummary = {
      enabled: sandboxSleepEnabled,
      debounceMs: sandboxSleepDebounceMs,
      ...sandboxSleepStats,
    };
    const workerStateSummary = {
      run_id: runId,
      epoch_id: claimed.epochId,
      epoch_target_id: claimed.epochTargetId,
      target_claim_id: claimed.claimId,
      worker_state_id: claimed.workerStateId,
      worker_id: claimed.workerId,
      target,
      write_set: currentWriteSet,
      write_set_entries: currentEntries,
      widening_ids: wideningIds,
      baseline: {
        kind: "worker_baseline",
        status: workerChangeBaseline.status,
        score: measuredBaselineScore,
        summary_path: resolve(validationDir, "pre_worker_baseline.summary.json"),
        artifact_path: workerChangeBaseline.snapshotPath ?? null,
      },
      worker_worktree_path: workerRepoRoot,
      lifecycle_status: lifecycleStatus,
      selected_checkpoint_id: bestCheckpoint?.id ?? null,
      selected_score: bestCheckpoint?.newScore ?? null,
      exact: Boolean(bestCheckpoint?.exactMatch),
      agent_output_path: result.outputPath,
      agent_note: agentNote,
      agent_note_parse_error: finalEvaluation.parsedError ?? null,
      facts: agentFacts,
      blockers: agentBlockers,
      error: errorClassification,
      sandbox_sleep: {
        enabled: sandboxSleepEnabled,
        debounce_ms: sandboxSleepDebounceMs,
        ...sandboxSleepStats,
      },
      latest_runner_validation: finalEvaluation.runnerValidation,
      continuation_attempts: {
        policy: WORKER_ATTEMPT_TAIL_POLICY.mode,
        configured: {
          max_cold_attempts: WORKER_ATTEMPT_TAIL_POLICY.maxColdAttempts,
          follow_up_attempts_after_best: WORKER_ATTEMPT_TAIL_POLICY.followUpAttemptsAfterBest,
          follow_up_attempts_after_gate_failed_exact: WORKER_ATTEMPT_TAIL_POLICY.followUpAttemptsAfterGateFailedExact,
        },
        claim_ttl: claimed.ttl,
        decision: finalEvaluation.continuationDecision,
        stopped_by_deadline: finalEvaluation.continuationDecision.stoppedByDeadline,
        exhausted: finalEvaluation.continuationDecision.exhausted,
        stop_reason: finalEvaluation.continuationDecision.stopReason,
        unresolved_repair_reasons: finalEvaluation.repairReasons.length > 0,
        latest_reasons: finalEvaluation.repairReasons,
        out_of_write_set_changes: finalEvaluation.outOfWriteSetChanges,
        latest_write_set_diff_path: finalEvaluation.postAttemptDiffPath,
        repair_feedback_path: finalEvaluation.repairFeedbackPath ?? null,
      },
      created_at: new Date().toISOString(),
    };
    await writeFile(summaryPath, JSON.stringify(workerStateSummary, null, 2));
    await writeFile(factsPath, JSON.stringify(agentFacts, null, 2));
    if (errorClassification || agentBlockers.length > 0 || finalEvaluation.repairReasons.length > 0) {
      await writeFile(
        resolve(reportDir, "blocker.json"),
        JSON.stringify(
          {
            reason: errorClassification?.kind ?? lifecycleStatus,
            note: summaryText,
            runner_validation: finalEvaluation.runnerValidation,
            continuation_attempts: workerStateSummary.continuation_attempts,
            error: errorClassification,
            blockers: agentBlockers,
          },
          null,
          2,
        ),
      );
    }

    closeWorkerState(store, {
        authority: token,
      workerStateId: claimed.workerStateId,
      lifecycleStatus,
      timeoutSummary: lifecycleStatus === "timeout" ? summaryText : null,
      errorSummary: lifecycleStatus === "error" ? summaryText : null,
      summary: workerStateSummary,
    });
    const wakeEvent = addEvent(store, runId, lifecycleStatus === "error" ? "worker_error" : "worker_finished", "worker", {
      worker_state_id: claimed.workerStateId,
      target_claim_id: claimed.claimId,
      epoch_target_id: claimed.epochTargetId,
      worker_id: claimed.workerId,
      lifecycle_status: lifecycleStatus,
      selected_checkpoint_id: bestCheckpoint?.id ?? null,
      exact: Boolean(bestCheckpoint?.exactMatch),
      summary_path: summaryPath,
    });
    let workerOutputIntegration: WorkerCycleResult["workerOutputIntegration"] | undefined;
    if (bestCheckpoint) {
      const item = enqueueWorkerOutputIntegration(store, {
        runId,
        epochId: claimed.epochId,
        epochTargetId: claimed.epochTargetId,
        targetClaimId: claimed.claimId,
        workerStateId: claimed.workerStateId,
        workerCheckpointId: bestCheckpoint.id,
        targetKey: `${targetUnit}::${targetSymbol}`,
        patchPath: bestCheckpoint.patchPath,
        diffPath: bestCheckpoint.diffPath,
        writeSet: bestCheckpoint.writeSet.length > 0 ? bestCheckpoint.writeSet : currentWriteSet,
        metadata: {
          lifecycle_status: lifecycleStatus,
          exact: Boolean(bestCheckpoint.exactMatch),
          worker_state_summary_path: summaryPath,
          worker_worktree_path: workerRepoRoot,
          widening_ids: wideningIds,
          target,
        },
      });
      workerOutputIntegration = { itemId: item.id, processed: [] };
    }
    appendWorkerActivityEvent(outputDir, {
      claim_id: claimed.claimId,
      session_id: result.sessionId,
      phase: "worker_state",
      event_type: "worker_state_closed",
      unit: targetUnit,
      symbol: targetSymbol,
      summary: clampSummary(summaryText),
      score: finalEvaluation.runnerValidation.target
        ? {
            before: finalEvaluation.runnerValidation.target.before,
            after: finalEvaluation.runnerValidation.target.after,
            exact: finalEvaluation.runnerValidation.target.exact,
          }
        : undefined,
      artifact_path: summaryPath,
    });
    return {
      runId,
      claimId: claimed.claimId,
      workerStateId: claimed.workerStateId,
      epochTargetId: claimed.epochTargetId,
      target: claimed.targetId,
      writeSet: currentWriteSet,
      workerOutput: result.outputPath,
      workerSystemPrompt: result.systemPromptPath,
      workerUserPrompt: result.userPromptPath,
      workerStatePath: summaryPath,
      lifecycleStatus,
      bestCheckpointId: bestCheckpoint?.id ?? null,
      bestScore: bestCheckpoint?.newScore ?? null,
      exact: Boolean(bestCheckpoint?.exactMatch),
      wakeEvent,
      dryRun: result.dryRun,
      sandboxSleep: sandboxSleepSummary,
      failed: lifecycleStatus === "error" && errorClassification?.kind !== "provider_error",
      providerFailure: errorClassification?.kind === "provider_error",
      errorKind: errorClassification?.kind,
      error: errorClassification?.summary,
      workerOutputIntegration,
    };
}

export function buildWorkerKnowledgeContext(sourcePath: string, graphDb = resourceGraphDbPath()): Record<string, unknown> {
  const lookupTools = [...defaultWorkerToolProfile];
  if (!sourcePath) {
    return {
      status: "missing_source_path",
      graph_db: graphDb,
      lookup_tools: lookupTools,
    };
  }
  if (!graphDbExists(graphDb)) {
    return {
      status: "graph_missing",
      graph_db: graphDb,
      lookup_tools: lookupTools,
    };
  }
  const store = openKnowledgeGraph(graphDb);
  try {
    return {
      status: "ready",
      graph_db: graphDb,
      generated_at: new Date().toISOString(),
      file_card: fileGraphCard(store, sourcePath),
      lookup_tools: lookupTools,
    };
  } catch (error) {
    return {
      status: "failed",
      graph_db: graphDb,
      reason: error instanceof Error ? error.message : String(error),
      lookup_tools: lookupTools,
    };
  } finally {
    store.db.close();
  }
}

export async function workerTask(globals: GlobalArgs, args: Map<string, string | true>): Promise<void> {
  console.log(JSON.stringify(await runWorkerCycleFromTask(globals, args), null, 2));
}
