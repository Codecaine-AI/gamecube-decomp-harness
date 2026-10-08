// llm_review advisory adjudication (plan §6.5), shared by the shadow lane
// (out of band, M9-D) and enforce (inline at L1, M9-C):
//   1. kernel.call ExtractCheckpointKnowledge maps every advisory (warning
//      and info) to the justification the note gives for keeping it;
//   2. kernel.gate "llm-review-advisories": per warning, a step
//      `justification:<id>` (pass iff one was extracted) and, only then, a
//      decide `JudgeAdvisory:<id>` asking JUSTIFIED_QUESTION at the
//      configured bars; info advisories are noted, never decided;
//   3. enforce with escalateLowConfidence only: JudgeAdvisoryWithRationale
//      for low-confidence abstains;
//   4. the fold, recorded as the step check "fold-advisory-verdicts" of the
//      acknowledged gate "advisory-verdict" (a step write is only logged).
// Every node nests under the worker's kernel run and carries a requestId
// derived from `requestIdPrefix`, so a retry replays instead of re-paying.
//
// adjudicateAdvisories never throws and is signal-bounded: the signal reaches
// every node, and if something ignores it the result is still returned, fail
// closed, `abortGraceMs` after the abort (the late result is discarded).
// Every ambiguity fails closed: only a pass decided by the calibrated model on
// a readable flagged line, with every node persisted and the signal never
// fired, accepts a warning.
import { createHash } from "node:crypto";

import type { DecisionOutcome, GateCheckResult, GateCheckSpec, GateResult, GateStepOutcome } from "@agent-kernel/kernel/model-nodes";
import type { AdvisoryCase, AdvisoryFindingRef, AdvisoryJudgement, CheckpointKnowledge } from "@server/generated/baml_client";
import {
  advisoryFingerprint,
  fullFlaggedLineFromPatch,
  isAdvisoryFinding,
} from "@server/core/validation/qa/advisory-fingerprint.js";
import type { QaScanFinding } from "@server/core/validation/qa/scan-diff.js";
import type { WorkerNodeKernel } from "@server/infrastructure/kernel/nodes/node-kernel.js";

import {
  shippedAdvisoryAdjudicationConfig,
  thresholdsFor,
  type AdvisoryAdjudicationConfig,
  type AdvisoryThresholds,
} from "./config.js";
import {
  callFailureKind,
  failureCode,
  isCallError,
  isGateError,
  isTerminalFailure,
  sanitizeAdjudicationError,
  sanitizeDowngradeReason,
} from "./errors.js";
import { applyJudgement, foldVerdicts, type AdvisoryJudgeOutcome, type FoldResult } from "./fold.js";
import { extractHunk } from "./hunks.js";
import { JUSTIFIED_QUESTION_ID, justifiedQuestions } from "./question.js";
import { advisoryDetail, boundHunk, boundJustification, buildAdvisoryState, type AdvisoryState } from "./state.js";
import type {
  AdjudicatedAdvisory,
  AdvisoryAbstainReason,
  AdvisoryAdjudication,
  LlmReviewCandidate,
} from "./types.js";

export * from "./budget.js";
export * from "./candidate.js";
export * from "./config.js";
export * from "./errors.js";
export * from "./fold.js";
export * from "./hunks.js";
export * from "./mode.js";
export * from "./question.js";
export * from "./state.js";
export type * from "./types.js";

/** The node-kernel surface adjudication uses (`getNodeKernel` returns it). */
export type AdjudicationKernel = WorkerNodeKernel;

export const EXTRACTION_FUNCTION = "ExtractCheckpointKnowledge";
export const JUDGE_FUNCTION = "JudgeAdvisoryWithRationale";
export const ADVISORY_GATE_NAME = "llm-review-advisories";
/** The acknowledged gate that records the fold; its one step check is FOLD_STEP_NAME. */
export const ADVISORY_VERDICT_GATE_NAME = "advisory-verdict";
export const FOLD_STEP_NAME = "fold-advisory-verdicts";
export const DEFAULT_ABORT_GRACE_MS = 2_000;
/** Longer notes keep their head and tail (kept_advisories sits near the end). */
export const MAX_EXTRACTION_NOTE_CHARS = 60_000;
const NOTE_HEAD_CHARS = 12_000;
const MAX_FINDING_MESSAGE_CHARS = 1_000;
const MAX_EVIDENCE_ITEMS = 20;
const MAX_EVIDENCE_CHARS = 500;
const MAX_RATIONALE_CHARS = 2_000;

export function justificationCheckName(advisoryId: string): string {
  return `justification:${advisoryId}`;
}

export function judgeDecisionName(advisoryId: string): string {
  return `JudgeAdvisory:${advisoryId}`;
}

/** Request ids of the nodes one adjudication writes, for replay and tests. */
export const adjudicationRequestIds = {
  extract: (prefix: string) => `${prefix}:extract`,
  gate: (prefix: string) => `${prefix}:gate`,
  decision: (prefix: string, advisoryId: string) => `${prefix}:judge:${advisoryId}`,
  escalation: (prefix: string, advisoryId: string) => `${prefix}:escalate:${advisoryId}`,
  fold: (prefix: string) => `${prefix}:fold`,
};

export interface AdjudicateAdvisoriesParams {
  /** Null when the node kernel is unavailable: fail closed (retryable). */
  kernel: AdjudicationKernel | null;
  candidate: LlmReviewCandidate;
  /** The raw final note; null when its file is missing (evidence-missing). */
  noteText: string | null;
  /** The attempt's qa_diff.patch; null when its file is missing (evidence-missing). */
  patchText: string | null;
  /** Enforce: the budgeted signal. Shadow: the lane's signal. */
  signal?: AbortSignal;
  /** `checkpoint:<checkpointId>` (shadow) or `attempt:<workerStateId>:<attemptIndex>` (enforce). */
  requestIdPrefix: string;
  /** Default: the shipped config.json. */
  config?: AdvisoryAdjudicationConfig;
  /** Enforce: the inline budget, recorded as `budget_ms`. */
  budgetMs?: number;
  /** How long after the signal fires an unresponsive adjudication is abandoned. Default 2,000 ms. */
  abortGraceMs?: number;
  /** Digests of the source files as read (default: sha256 of `noteText` / `patchText`). */
  sources?: Partial<AdvisoryAdjudication["sources"]>;
}

// ── shared record building ────────────────────────────────────────────────────

interface AdvisoryItem {
  /** Stable id within the candidate: "A1", "A2", … in candidate order. */
  id: string;
  finding: QaScanFinding;
  severity: "warning" | "info";
  fingerprint: string | null;
  hunk: string | null;
  hunkSha256: string | null;
}

interface Extracted {
  justification: string | null;
  evidence: string[];
}

interface RecordContext {
  candidate: LlmReviewCandidate;
  config: AdvisoryAdjudicationConfig | null;
  thresholds: AdvisoryThresholds | null;
  startedAtMs: number;
  budgetMs?: number;
  sources: AdvisoryAdjudication["sources"];
}

function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

function abortKind(signal: AbortSignal | undefined): "timeout" | "aborted" {
  const reason: unknown = signal?.reason;
  return reason instanceof Error && reason.name === "TimeoutError" ? "timeout" : "aborted";
}

function isSeverity(value: string): value is "warning" | "info" {
  return value === "warning" || value === "info";
}

function candidateItems(candidate: LlmReviewCandidate, patchText: string | null): AdvisoryItem[] {
  return candidate.advisories.map(({ fingerprint: candidateFingerprint, finding }, index) => {
    const severity = isSeverity(finding.severity) ? finding.severity : "warning";
    if (patchText === null) {
      return { id: `A${index + 1}`, finding, severity, fingerprint: candidateFingerprint, hunk: null, hunkSha256: null };
    }
    const fullLine = fullFlaggedLineFromPatch(patchText, finding.file, finding.line, finding.excerpt);
    const computed = fullLine === null ? null : advisoryFingerprint(finding, fullLine);
    // The patch is the evidence: a fingerprint it does not reproduce is unreadable, never trusted.
    const fingerprint = computed !== null && (candidateFingerprint === null || candidateFingerprint === computed) ? computed : null;
    const hunk = boundHunk(extractHunk(patchText, finding.file, finding.line));
    return { id: `A${index + 1}`, finding, severity, fingerprint, hunk, hunkSha256: hunk === null ? null : sha256(hunk) };
  });
}

function baseAdvisory(item: AdvisoryItem, extracted: Extracted | undefined): AdjudicatedAdvisory {
  return {
    fingerprint: item.fingerprint,
    rule_id: item.finding.rule_id,
    standard_id: item.finding.standard_id ?? null,
    severity: item.severity,
    file: item.finding.file,
    line: item.finding.line,
    excerpt: item.finding.excerpt,
    hunk: item.hunk,
    hunk_sha256: item.hunkSha256,
    justification: extracted?.justification ?? null,
    evidence: extracted?.evidence ?? [],
    result: item.severity === "info" ? "noted" : "abstain",
  };
}

function undecided(advisory: AdjudicatedAdvisory, reason: AdvisoryAbstainReason): AdjudicatedAdvisory {
  if (advisory.severity === "info") return advisory;
  const { fail_reason: _fail, ...rest } = advisory;
  return { ...rest, result: "abstain", abstain_reason: reason };
}

function buildRecord(
  ctx: RecordContext,
  advisories: AdjudicatedAdvisory[],
  fields: {
    extraction?: AdvisoryAdjudication["extraction"];
    gateSpanId?: string;
    served?: string;
    error?: string;
    retryable?: boolean;
    fold?: FoldResult;
  } = {},
): AdvisoryAdjudication {
  const { candidate, config, thresholds } = ctx;
  const fold = fields.fold ?? foldVerdicts(advisories);
  const requested = candidate.requested_mode === "enforce" || candidate.requested_mode === "shadow" ? candidate.requested_mode : candidate.mode;
  return {
    schema: "llm_review_adjudication_v1",
    requested_mode: requested,
    mode: candidate.mode,
    ...(candidate.downgraded_reason !== undefined && { downgraded_reason: sanitizeDowngradeReason(candidate.downgraded_reason) }),
    verdict: fold.verdict,
    applied: candidate.mode === "enforce",
    advisories,
    accepted_fingerprints: fold.acceptedFingerprints,
    extraction: fields.extraction ?? { status: "skipped" },
    ...(fields.gateSpanId !== undefined && { gate_span_id: fields.gateSpanId }),
    sources: ctx.sources,
    model: { requested: config?.model ?? "", ...(fields.served !== undefined && { served: fields.served }) },
    thresholds: thresholds
      ? { passAt: thresholds.passAt, failAt: thresholds.failAt, qualification: thresholds.qualification }
      : { passAt: 1, failAt: 0, qualification: "none" },
    ...(ctx.budgetMs !== undefined && { budget_ms: ctx.budgetMs }),
    duration_ms: Math.max(0, Date.now() - ctx.startedAtMs),
    ...(fields.error !== undefined && { error: sanitizeAdjudicationError(fields.error)! }),
    ...(fields.retryable === true && { retryable: true }),
  };
}

/** Every warning undecided for `reason`, info advisories noted; no node call was (or will be) made. */
function unavailableRecord(
  ctx: RecordContext,
  items: AdvisoryItem[],
  reason: AdvisoryAbstainReason,
  fields: Parameters<typeof buildRecord>[2] & { extracted?: Map<string, Extracted> },
): AdvisoryAdjudication {
  const advisories = items.map((item) => undecided(baseAdvisory(item, fields.extracted?.get(item.id)), reason));
  return buildRecord(ctx, advisories, fields);
}

function defaultSources(params: Pick<AdjudicateAdvisoriesParams, "noteText" | "patchText" | "sources">): AdvisoryAdjudication["sources"] {
  return {
    note_sha256: params.sources?.note_sha256 !== undefined ? params.sources.note_sha256 : params.noteText === null ? null : sha256(params.noteText),
    patch_sha256:
      params.sources?.patch_sha256 !== undefined ? params.sources.patch_sha256 : params.patchText === null ? null : sha256(params.patchText),
  };
}

function loadConfig(config: AdvisoryAdjudicationConfig | undefined): { config: AdvisoryAdjudicationConfig | null; error?: unknown } {
  if (config) return { config };
  try {
    return { config: shippedAdvisoryAdjudicationConfig() };
  } catch (error) {
    return { config: null, error };
  }
}

export interface FailClosedAdjudicationParams {
  candidate: LlmReviewCandidate;
  /** e.g. "insufficient-time" (enforce budget below inline.minMs; no node call). */
  reason: AdvisoryAbstainReason;
  /** Default `reviewer-unavailable: <reason>`. */
  error?: string;
  config?: AdvisoryAdjudicationConfig;
  budgetMs?: number;
  sources?: Partial<AdvisoryAdjudication["sources"]>;
  retryable?: boolean;
}

/**
 * A fail-closed adjudication with no node call: every warning undecided for
 * `reason` (verdict error). The enforce caller uses it when the budget is
 * insufficient. Never throws.
 */
export function failClosedAdjudication(params: FailClosedAdjudicationParams): AdvisoryAdjudication {
  const loaded = loadConfig(params.config);
  const ctx: RecordContext = {
    candidate: params.candidate,
    config: loaded.config,
    thresholds: loaded.config ? thresholdsFor(loaded.config) : null,
    startedAtMs: Date.now(),
    ...(params.budgetMs !== undefined && { budgetMs: params.budgetMs }),
    sources: { note_sha256: params.sources?.note_sha256 ?? null, patch_sha256: params.sources?.patch_sha256 ?? null },
  };
  return unavailableRecord(ctx, candidateItems(params.candidate, null), params.reason, {
    error: sanitizeAdjudicationError(params.error ?? `reviewer-unavailable: ${params.reason}`)!,
    ...(params.retryable === true && { retryable: true }),
  });
}

// ── the abort guard ───────────────────────────────────────────────────────────

const ABANDONED: unique symbol = Symbol("adjudication-abandoned");

/** `work`, or ABANDONED once `graceMs` have passed since `signal` fired without `work` settling. */
function settleWithin<T>(work: Promise<T>, signal: AbortSignal | undefined, graceMs: number): Promise<T | typeof ABANDONED> {
  if (!signal) return work;
  return new Promise<T | typeof ABANDONED>((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onAbort = () => {
      timer = setTimeout(() => resolve(ABANDONED), Math.max(0, graceMs));
    };
    const cleanup = () => {
      if (timer !== undefined) clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
    };
    if (signal.aborted) onAbort();
    else signal.addEventListener("abort", onAbort, { once: true });
    work.then(
      (value) => {
        cleanup();
        resolve(value);
      },
      (error: unknown) => {
        cleanup();
        reject(error);
      },
    );
  });
}

// ── the adjudication ──────────────────────────────────────────────────────────

interface Progress {
  items: AdvisoryItem[];
  extracted: Map<string, Extracted>;
  extraction: AdvisoryAdjudication["extraction"];
  extractionStarted: boolean;
  gateSpanId?: string;
}

function boundNote(note: string): string {
  if (note.length <= MAX_EXTRACTION_NOTE_CHARS) return note;
  const tail = MAX_EXTRACTION_NOTE_CHARS - NOTE_HEAD_CHARS;
  const omitted = note.length - MAX_EXTRACTION_NOTE_CHARS;
  return `${note.slice(0, NOTE_HEAD_CHARS)}\n… [${omitted} characters omitted] …\n${note.slice(note.length - tail)}`;
}

function findingRef(item: AdvisoryItem): AdvisoryFindingRef {
  return {
    id: item.id,
    rule_id: item.finding.rule_id,
    severity: item.severity,
    file: item.finding.file,
    line: item.finding.line,
    excerpt: item.finding.excerpt,
    message: truncate(item.finding.message, MAX_FINDING_MESSAGE_CHARS),
  };
}

function extractedJustifications(items: AdvisoryItem[], knowledge: CheckpointKnowledge): Map<string, Extracted> {
  const ids = new Set(items.map((item) => item.id));
  const out = new Map<string, Extracted>();
  const entries = Array.isArray(knowledge?.advisories) ? knowledge.advisories : [];
  for (const entry of entries) {
    if (typeof entry?.finding_id !== "string" || !ids.has(entry.finding_id)) continue;
    const justification = boundJustification(typeof entry.justification === "string" ? entry.justification : null);
    const evidence = (Array.isArray(entry.evidence) ? entry.evidence : [])
      .filter((e): e is string => typeof e === "string" && e.trim().length > 0)
      .slice(0, MAX_EVIDENCE_ITEMS)
      .map((e) => truncate(e.trim(), MAX_EVIDENCE_CHARS));
    const prior = out.get(entry.finding_id);
    // One entry per finding is the contract; a later duplicate only fills a missing justification.
    if (!prior || (prior.justification === null && justification !== null)) out.set(entry.finding_id, { justification, evidence });
  }
  return out;
}

function advisoryState(item: AdvisoryItem, extracted: Extracted | undefined, candidate: LlmReviewCandidate): AdvisoryState {
  return buildAdvisoryState({
    finding: item.finding,
    hunk: item.hunk,
    justification: extracted?.justification ?? null,
    facts: candidate.code_facts,
  });
}

function questionOf(check: GateCheckResult | undefined) {
  return check?.questions?.find((q) => q.questionId === JUSTIFIED_QUESTION_ID);
}

/** One warning's result from its two gate checks. */
function resolveWarning(
  base: AdjudicatedAdvisory,
  step: GateCheckResult | undefined,
  decide: GateCheckResult | undefined,
  gate: GateResult,
  thresholds: AdvisoryThresholds,
): AdjudicatedAdvisory {
  const notReached: AdvisoryAbstainReason = gate.aborted ? "aborted" : "skipped";
  if (!step || step.result === "skipped") return undecided(base, notReached);
  if (step.result !== "pass") return { ...base, result: "fail", fail_reason: "justification-missing" };
  if (!decide || decide.result === "skipped") return undecided(base, notReached);
  if (decide.error !== undefined) return undecided(base, "kernel-error");
  const question = questionOf(decide);
  if (!question) return undecided(base, "engine-error");
  const decided: AdjudicatedAdvisory = {
    ...base,
    ...(question.probability !== undefined && { probability: question.probability }),
    decision: {
      run_id: question.runId,
      thresholds: {
        passAt: question.thresholdApplied.passAt ?? thresholds.passAt,
        failAt: question.thresholdApplied.failAt ?? thresholds.failAt,
      },
    },
  };
  if (question.result === "pass") return { ...decided, result: "pass" };
  if (question.result === "fail") return { ...decided, result: "fail", fail_reason: "judged-unjustified" };
  if (question.abstainReason === "low-confidence" || question.abstainReason === "refusal") {
    return { ...decided, result: "abstain", abstain_reason: question.abstainReason };
  }
  return { ...decided, result: "abstain", abstain_reason: gate.aborted ? "aborted" : "engine-error" };
}

/** An answered decision (its run is `done`), so a decide with the same requestId replays it. */
function answered(advisory: AdjudicatedAdvisory): boolean {
  if (!advisory.decision) return false;
  if (advisory.result === "pass") return true;
  if (advisory.result === "fail") return advisory.fail_reason === "judged-unjustified";
  return advisory.result === "abstain" && (advisory.abstain_reason === "low-confidence" || advisory.abstain_reason === "refusal");
}

function judgementValid(judgement: AdvisoryJudgement): boolean {
  const confidence = judgement?.confidence;
  if (!confidence || typeof confidence.value !== "number" || !Number.isFinite(confidence.value)) return false;
  if (confidence.value < 0 || confidence.value > 1) return false;
  return Object.values(confidence.checks ?? {}).every((check) => check?.status === "succeeded");
}

async function runAdjudication(
  params: AdjudicateAdvisoriesParams,
  ctx: RecordContext & { config: AdvisoryAdjudicationConfig; thresholds: AdvisoryThresholds },
  progress: Progress,
): Promise<AdvisoryAdjudication> {
  const { candidate, noteText, patchText, signal, requestIdPrefix: prefix } = params;
  const { config, thresholds } = ctx;
  const kernel = params.kernel!;
  const parentRunId = candidate.kernel!.run_id;
  const items = progress.items;
  const warnings = items.filter((item) => item.severity === "warning");
  let retryable = false;
  let error: string | undefined;

  // 1. Extraction.
  progress.extractionStarted = true;
  let extractionRunId: string | undefined;
  try {
    const knowledge = await kernel.call(EXTRACTION_FUNCTION, [boundNote(noteText!), items.map(findingRef)], {
      parentRunId,
      trigger: "post-run",
      requestId: adjudicationRequestIds.extract(prefix),
      ...(signal !== undefined && { signal }),
      onNodeStarted: (ids) => {
        extractionRunId = ids.runId;
      },
    });
    progress.extracted = extractedJustifications(items, knowledge);
    progress.extraction = {
      status: "ok",
      ...(extractionRunId !== undefined && { run_id: extractionRunId }),
      structured_field_used: knowledge?.structured_field_used === true,
    };
  } catch (failure) {
    const kind = callFailureKind(failure);
    const runId = extractionRunId ?? (isCallError(failure) ? failure.runId : undefined);
    progress.extraction = { status: "error", ...(runId !== undefined && { run_id: runId }), error_kind: kind };
    const advisories = items.map((item) => undecided(baseAdvisory(item, undefined), "extraction-error"));
    return finish(kernel, ctx, advisories, {
      extraction: progress.extraction,
      error: kind === "aborted" ? `reviewer-unavailable: ${abortKind(signal)}` : `reviewer-unavailable: extraction-${kind}`,
      retryable: !isCallError(failure) && !isTerminalFailure(failure),
      parentRunId,
      prefix,
      signal,
    });
  }

  const extracted = progress.extracted;
  let advisories = items.map((item) => baseAdvisory(item, extracted.get(item.id)));
  if (signal?.aborted) {
    advisories = advisories.map((a) => undecided(a, "aborted"));
    return finish(kernel, ctx, advisories, {
      extraction: progress.extraction,
      error: `reviewer-unavailable: ${abortKind(signal)}`,
      parentRunId,
      prefix,
      signal,
    });
  }

  // 2. The gate: one justification step per warning, then a decision only when a justification exists.
  const questions = justifiedQuestions(thresholds);
  const states = new Map<string, AdvisoryState>();
  const checks: GateCheckSpec[] = [];
  for (const item of warnings) {
    const justification = extracted.get(item.id)?.justification ?? null;
    checks.push({
      kind: "step",
      name: justificationCheckName(item.id),
      attributes: { rule_id: item.finding.rule_id, file: item.finding.file, line: item.finding.line, fingerprint: item.fingerprint },
      run: () => (justification !== null ? { result: "pass", value: justification.length } : { result: "fail", reason: "justification-missing" }),
    });
    if (justification === null) continue;
    const state = advisoryState(item, extracted.get(item.id), candidate);
    states.set(item.id, state);
    checks.push({
      kind: "decide",
      name: judgeDecisionName(item.id),
      state,
      questions,
      model: config.model,
      requestId: adjudicationRequestIds.decision(prefix, item.id),
    });
  }

  let gate: GateResult | null = null;
  try {
    gate = await kernel.gate(ADVISORY_GATE_NAME, { parentRunId, requestId: adjudicationRequestIds.gate(prefix), ...(signal !== undefined && { signal }) }, checks);
  } catch (failure) {
    retryable = !isTerminalFailure(failure);
    error = failureCode(failure);
    // A decide check rejected: gate_end holds the recorded result. Any other failure (including an
    // unpersisted gate_end) yields no verdict the caller may use.
    if (isGateError(failure)) gate = failure.gateResult;
  }
  if (gate) progress.gateSpanId = gate.spanId;

  if (!gate) {
    advisories = advisories.map((a) => undecided(a, "kernel-error"));
  } else {
    const byName = new Map(gate.checks.map((check) => [check.name, check]));
    advisories = items.map((item, index) => {
      const base = advisories[index]!;
      if (item.severity === "info") return base;
      return resolveWarning(base, byName.get(justificationCheckName(item.id)), byName.get(judgeDecisionName(item.id)), gate!, thresholds);
    });
  }
  // A cancelled gate never accepts, even for decisions that finished before the signal fired.
  if (gate?.aborted || signal?.aborted) {
    advisories = invalidateAcceptance(advisories, "aborted");
    error ??= `reviewer-unavailable: ${abortKind(signal)}`;
  }

  // Decision provenance: replay each answered decision (a done run: no engine request, no write) for
  // the engine, served model and confidence source the gate result does not carry. A pass counts only
  // when it was served by the model the thresholds were calibrated for.
  let served: string | undefined;
  for (const [index, item] of items.entries()) {
    if (signal?.aborted) break;
    const advisory = advisories[index]!;
    const state = states.get(item.id);
    if (!state || !advisory.decision || !answered(advisory)) continue;
    let outcome: DecisionOutcome<typeof questions> | null = null;
    try {
      outcome = await kernel.decide(judgeDecisionName(item.id), state, {
        questions,
        model: config.model,
        parentRunId,
        requestId: adjudicationRequestIds.decision(prefix, item.id),
        // A replay never reaches the engine; should this ever not be one, nothing is sent either.
        signal: AbortSignal.abort(),
      });
    } catch {
      outcome = null;
    }
    const replayed = outcome !== null && outcome.replayed && outcome.ids.runId === advisory.decision.run_id;
    if (replayed) {
      served ??= outcome!.model;
      advisories[index] = {
        ...advisory,
        decision: {
          ...advisory.decision,
          engine: outcome!.engine,
          served_model: outcome!.model,
          confidence_source: outcome!.confidenceSource,
        },
      };
    }
    if (advisory.result === "pass" && (!replayed || outcome!.model !== config.model)) {
      advisories[index] = undecided(advisories[index]!, "served-model-unverified");
    }
  }

  // A pass or a judged decision needs the flagged line's fingerprint; without it nothing can be accepted.
  advisories = advisories.map((advisory) => {
    if (advisory.severity !== "warning" || advisory.fingerprint !== null) return advisory;
    const { abstain_reason: _abstain, ...rest } = advisory;
    return { ...rest, result: "fail", fail_reason: "evidence-unreadable" };
  });

  // 3. Escalation (enforce only, off by default): the judge sees low-confidence abstains.
  if (candidate.mode === "enforce" && config.escalateLowConfidence && !signal?.aborted && gate !== null) {
    for (const [index, item] of items.entries()) {
      const advisory = advisories[index]!;
      if (advisory.result !== "abstain" || advisory.abstain_reason !== "low-confidence" || signal?.aborted) continue;
      const judged = await escalate(kernel, item, advisory, { candidate, parentRunId, prefix, signal });
      if (judged.retryable) retryable = true;
      advisories[index] = applyJudgement(advisory, judged.outcome, { judgeCanAccept: config.judgeCanAccept });
    }
  }

  return finish(kernel, ctx, advisories, {
    extraction: progress.extraction,
    ...(progress.gateSpanId !== undefined && { gateSpanId: progress.gateSpanId }),
    ...(served !== undefined && { served }),
    ...(error !== undefined && { error }),
    retryable,
    parentRunId,
    prefix,
    signal,
  });
}

/** Every accepted warning back to undecided for `reason`; rejections and info advisories stay as they are. */
function invalidateAcceptance(advisories: AdjudicatedAdvisory[], reason: AdvisoryAbstainReason): AdjudicatedAdvisory[] {
  return advisories.map((advisory) => (advisory.severity === "warning" && advisory.result === "pass" ? undecided(advisory, reason) : advisory));
}

/**
 * The last word on every record: a fired signal, an error, or an
 * infrastructure failure never coexists with an acceptance, whatever
 * finished in between (fail closed, §6.6, §6.7).
 */
function sealRecord(record: AdvisoryAdjudication, signal: AbortSignal | undefined): AdvisoryAdjudication {
  const cancelled = signal?.aborted === true;
  if (!cancelled && record.error === undefined && record.retryable !== true) return record;
  const advisories = invalidateAcceptance(record.advisories, cancelled ? "aborted" : "kernel-error");
  const fold = foldVerdicts(advisories);
  return {
    ...record,
    advisories,
    verdict: fold.verdict,
    accepted_fingerprints: fold.acceptedFingerprints,
    error: record.error ?? (cancelled ? `reviewer-unavailable: ${abortKind(signal)}` : "reviewer-unavailable: kernel-error"),
  };
}

async function escalate(
  kernel: AdjudicationKernel,
  item: AdvisoryItem,
  advisory: AdjudicatedAdvisory,
  opts: { candidate: LlmReviewCandidate; parentRunId: string; prefix: string; signal: AbortSignal | undefined },
): Promise<{ outcome: AdvisoryJudgeOutcome; retryable: boolean }> {
  const detail = advisoryDetail(item.finding.detail);
  const facts = opts.candidate.code_facts;
  const advisoryCase: AdvisoryCase = {
    finding: findingRef(item),
    detail: detail === null ? null : JSON.stringify(detail),
    hunk: item.hunk,
    justification: advisory.justification,
    code_facts: { exact: facts.exact === true, old_score: facts.old_score, new_score: facts.new_score },
  };
  let runId: string | undefined;
  try {
    const judgement = await kernel.call(JUDGE_FUNCTION, [advisoryCase], {
      parentRunId: opts.parentRunId,
      trigger: "judge",
      requestId: adjudicationRequestIds.escalation(opts.prefix, item.id),
      ...(opts.signal !== undefined && { signal: opts.signal }),
      onNodeStarted: (ids) => {
        runId = ids.runId;
      },
    });
    return {
      outcome: {
        verdict: typeof judgement?.verdict === "string" ? judgement.verdict : "error",
        rationale: truncate(typeof judgement?.rationale === "string" ? judgement.rationale : "", MAX_RATIONALE_CHARS),
        valid: judgementValid(judgement),
        ...(runId !== undefined && { run_id: runId }),
      },
      retryable: false,
    };
  } catch (failure) {
    const failedRunId = runId ?? (isCallError(failure) ? failure.runId : undefined);
    return {
      outcome: {
        verdict: `error:${callFailureKind(failure)}`,
        rationale: "",
        valid: false,
        ...(failedRunId !== undefined && { run_id: failedRunId }),
      },
      retryable: !isCallError(failure) && !isTerminalFailure(failure),
    };
  }
}

function foldCheckOutcome(fold: FoldResult): Exclude<GateStepOutcome, boolean> {
  const value = fold.verdict;
  const reason = `${fold.acceptedFingerprints.length} accepted, ${fold.repairReasons.length} not accepted`;
  if (fold.verdict === "pass") return { result: "pass", value, reason };
  if (fold.verdict === "fail") return { result: "fail", value, reason };
  return { result: "abstain", value, reason };
}

/**
 * Records the fold and builds the record. The fold is the step check of an
 * acknowledged gate (`advisory-verdict`): kernel.step only logs a failed
 * write, and an acceptance must never rest on an unpersisted verdict. A fold
 * that was not recorded, a gate that disagrees with it, or a signal that
 * fired before or during it accepts nothing (retryable for write failures).
 */
async function finish(
  kernel: AdjudicationKernel,
  ctx: RecordContext,
  input: AdjudicatedAdvisory[],
  fields: {
    extraction: AdvisoryAdjudication["extraction"];
    gateSpanId?: string;
    served?: string;
    error?: string;
    retryable?: boolean;
    parentRunId: string;
    prefix: string;
    signal: AbortSignal | undefined;
  },
): Promise<AdvisoryAdjudication> {
  const { signal } = fields;
  let advisories = input;
  let error = fields.error;
  let retryable = fields.retryable === true;
  if (error !== undefined || retryable) advisories = invalidateAcceptance(advisories, "kernel-error");
  if (signal?.aborted) {
    advisories = invalidateAcceptance(advisories, "aborted");
    error ??= `reviewer-unavailable: ${abortKind(signal)}`;
  }

  const fold = foldVerdicts(advisories);
  const warnings = advisories.filter((a) => a.severity === "warning").length;
  let recorded: GateResult | null = null;
  try {
    recorded = await kernel.gate(
      ADVISORY_VERDICT_GATE_NAME,
      { parentRunId: fields.parentRunId, requestId: adjudicationRequestIds.fold(fields.prefix), ...(signal !== undefined && { signal }) },
      [
        {
          kind: "step",
          name: FOLD_STEP_NAME,
          attributes: { advisories: advisories.length, warnings, mode: ctx.candidate.mode },
          run: (span) => {
            span.setAttributes({
              verdict: fold.verdict,
              accepted: fold.acceptedFingerprints.length,
              rejected: fold.repairReasons.length,
            });
            return foldCheckOutcome(fold);
          },
        },
      ],
    );
  } catch (failure) {
    error ??= failureCode(failure);
    retryable ||= !isTerminalFailure(failure);
  }
  const expected = foldCheckOutcome(fold).result;
  if (recorded === null || recorded.aborted || recorded.verdict !== expected) {
    advisories = invalidateAcceptance(advisories, recorded?.aborted || signal?.aborted ? "aborted" : "kernel-error");
    if (recorded !== null && !recorded.aborted && recorded.verdict !== expected) {
      error ??= `reviewer-unavailable: verdict-not-recorded`;
      retryable = true;
    }
  }
  if (signal?.aborted) {
    advisories = invalidateAcceptance(advisories, "aborted");
    error ??= `reviewer-unavailable: ${abortKind(signal)}`;
  }

  return buildRecord(ctx, advisories, {
    extraction: fields.extraction,
    ...(fields.gateSpanId !== undefined && { gateSpanId: fields.gateSpanId }),
    ...(fields.served !== undefined && { served: fields.served }),
    ...(error !== undefined && { error }),
    ...(retryable && { retryable: true }),
  });
}

/**
 * Adjudicates a checkpoint's kept llm_review advisories. Never throws: every
 * failure is a fail-closed record (verdict "error", or "fail" when a warning
 * was rejected), with `retryable` set for infrastructure failures.
 */
export async function adjudicateAdvisories(params: AdjudicateAdvisoriesParams): Promise<AdvisoryAdjudication> {
  const startedAtMs = Date.now();
  let ctx: RecordContext | null = null;
  let progress: Progress | null = null;
  try {
    const { candidate } = params;
    const loaded = loadConfig(params.config);
    ctx = {
      candidate,
      config: loaded.config,
      thresholds: loaded.config ? thresholdsFor(loaded.config) : null,
      startedAtMs,
      ...(params.budgetMs !== undefined && { budgetMs: params.budgetMs }),
      sources: defaultSources(params),
    };
    progress = {
      items: candidateItems(candidate, params.patchText),
      extracted: new Map(),
      extraction: { status: "skipped" },
      extractionStarted: false,
    };
    const items = progress.items;

    // Fail-closed preconditions: no node call is made.
    if (!ctx.config) return unavailableRecord(ctx, items, "exception", { error: failureCode(loaded.error) });
    if (!ctx.thresholds) return unavailableRecord(ctx, items, "no-thresholds", { error: "reviewer-unavailable: no-thresholds" });
    if (!candidate.eligible) {
      return unavailableRecord(ctx, items, "ineligible", { error: `ineligible: ${candidate.ineligible_reason ?? "unknown"}` });
    }
    if (items.length === 0 || !items.some((item) => item.severity === "warning")) {
      return unavailableRecord(ctx, items, "ineligible", { error: "ineligible: no-advisory-warnings" });
    }
    if (candidate.advisories.some(({ finding }) => !isAdvisoryFinding(finding))) {
      return unavailableRecord(ctx, items, "ineligible", { error: "ineligible: not-advisory-only" });
    }
    if (!candidate.kernel?.run_id) return unavailableRecord(ctx, items, "no-kernel-run", { error: "reviewer-unavailable: no-kernel-run" });
    if (!params.kernel) {
      return unavailableRecord(ctx, items, "no-node-kernel", { error: "reviewer-unavailable: no-node-kernel", retryable: true });
    }
    if (params.noteText === null) return unavailableRecord(ctx, items, "evidence-missing", { error: "evidence-missing: note" });
    if (params.patchText === null) return unavailableRecord(ctx, items, "evidence-missing", { error: "evidence-missing: patch" });
    if (params.signal?.aborted) {
      return unavailableRecord(ctx, items, "aborted", { error: `reviewer-unavailable: ${abortKind(params.signal)}` });
    }

    const work = runAdjudication(params, { ...ctx, config: ctx.config, thresholds: ctx.thresholds }, progress);
    const settled = await settleWithin(work, params.signal, params.abortGraceMs ?? DEFAULT_ABORT_GRACE_MS);
    if (settled !== ABANDONED) return sealRecord(settled, params.signal);
    // Something ignored the signal: discard whatever it yields later and fail closed now.
    const extraction: AdvisoryAdjudication["extraction"] =
      progress.extraction.status === "skipped" && progress.extractionStarted
        ? { status: "error", error_kind: "aborted" }
        : progress.extraction;
    return unavailableRecord(ctx, items, "aborted", {
      extracted: progress.extracted,
      extraction,
      ...(progress.gateSpanId !== undefined && { gateSpanId: progress.gateSpanId }),
      error: `reviewer-unavailable: ${abortKind(params.signal)}`,
    });
  } catch (failure) {
    const fallbackCtx: RecordContext = ctx ?? {
      candidate: params.candidate,
      config: null,
      thresholds: null,
      startedAtMs,
      sources: { note_sha256: null, patch_sha256: null },
    };
    try {
      return unavailableRecord(fallbackCtx, progress?.items ?? [], "exception", {
        ...(progress && { extraction: progress.extraction }),
        error: failureCode(failure),
        retryable: true,
      });
    } catch {
      // The candidate itself is malformed: the minimal record still fails closed.
      return {
        schema: "llm_review_adjudication_v1",
        requested_mode: params.candidate?.mode === "enforce" ? "enforce" : "shadow",
        mode: params.candidate?.mode === "enforce" ? "enforce" : "shadow",
        verdict: "error",
        applied: params.candidate?.mode === "enforce",
        advisories: [],
        accepted_fingerprints: [],
        extraction: { status: "skipped" },
        sources: { note_sha256: null, patch_sha256: null },
        model: { requested: "" },
        thresholds: { passAt: 1, failAt: 0, qualification: "none" },
        duration_ms: Math.max(0, Date.now() - startedAtMs),
        error: failureCode(failure),
        retryable: true,
      };
    }
  }
}
