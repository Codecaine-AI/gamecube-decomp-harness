// Error vocabulary of adjudication records (plan §4.7). Exception messages can
// carry prompts, notes or credentials (a BAML error embeds the prompt), so a
// record, a queue row, or a log line built from an adjudication only ever
// holds one of the fixed codes below: kernel error codes, call failure kinds,
// abort kinds and the adjudication's own reasons. Anything else is
// `unexpected-error`. Kernel errors are matched by name and code, never by
// importing the kernel's classes, so the worker path loads no kernel module.
import type { GateResult } from "@agent-kernel/kernel/model-nodes";

import type { AdvisoryAbstainReason, LlmReviewIneligibleReason } from "./types.js";

export const UNEXPECTED_ERROR = "unexpected-error";

/** `KernelNodeError.code` values. */
export const KERNEL_NODE_ERROR_CODES = [
  "no-db",
  "no-container",
  "unknown-parent-run",
  "no-engine",
  "unknown-function",
  "invalid-request",
  "row-write-failed",
  "in-flight-elsewhere",
] as const;

/** `CallFailure.kind` values. */
export const CALL_FAILURE_KINDS = ["parse", "http", "timeout", "aborted", "finish_reason", "route", "other"] as const;

const ABSTAIN_REASONS: readonly AdvisoryAbstainReason[] = [
  "low-confidence",
  "refusal",
  "engine-error",
  "kernel-error",
  "aborted",
  "skipped",
  "served-model-unverified",
  "extraction-error",
  "insufficient-time",
  "no-kernel-run",
  "no-node-kernel",
  "evidence-missing",
  "ineligible",
  "no-thresholds",
  "exception",
];

const INELIGIBLE_REASONS: readonly (LlmReviewIneligibleReason | "no-advisory-warnings" | "unknown")[] = [
  "not-advisory-only",
  "pre-qa-failed",
  "review-lint-failed",
  "out-of-write-set",
  "no-kernel-run",
  "no-advisory-warnings",
  "unknown",
];

const NODE_CODES: ReadonlySet<string> = new Set(KERNEL_NODE_ERROR_CODES);
const CALL_KINDS: ReadonlySet<string> = new Set(CALL_FAILURE_KINDS);

/** Every string an adjudication record's `error` may hold. */
const ERROR_CODES: ReadonlySet<string> = new Set([
  UNEXPECTED_ERROR,
  "config-invalid",
  "evidence-missing: note",
  "evidence-missing: patch",
  ...INELIGIBLE_REASONS.map((reason) => `ineligible: ${reason}`),
  ...KERNEL_NODE_ERROR_CODES.map((code) => `kernel-error: ${code}`),
  ...[
    "timeout",
    "aborted",
    "kernel-error",
    "verdict-not-recorded",
    ...ABSTAIN_REASONS,
    ...[...CALL_FAILURE_KINDS, ...KERNEL_NODE_ERROR_CODES, UNEXPECTED_ERROR].map((kind) => `extraction-${kind}`),
  ].map((kind) => `reviewer-unavailable: ${kind}`),
]);

/** True for a string in the fixed error vocabulary. */
export function isAdjudicationErrorCode(text: unknown): text is string {
  return typeof text === "string" && ERROR_CODES.has(text);
}

/** `text` when it is a fixed error code, else `unexpected-error`; undefined stays undefined. */
export function sanitizeAdjudicationError(text: string | undefined): string | undefined {
  if (text === undefined) return undefined;
  return isAdjudicationErrorCode(text) ? text : UNEXPECTED_ERROR;
}

/** A record with its `error` re-checked against the vocabulary (a guard where records are persisted). */
export function sanitizeAdjudicationRecord<T extends { error?: string }>(record: T): T;
export function sanitizeAdjudicationRecord<T extends { error?: string }>(record: T | null): T | null;
export function sanitizeAdjudicationRecord<T extends { error?: string }>(record: T | null): T | null {
  if (record === null || record.error === undefined || isAdjudicationErrorCode(record.error)) return record;
  return { ...record, error: UNEXPECTED_ERROR };
}

/** Why enforce ran as shadow (mode.ts reasons, plus the worker's unreadable-config case). */
const DOWNGRADE_REASONS: ReadonlySet<string> = new Set([
  "no-thresholds",
  "not-enforcement-qualified",
  "qualification-evidence-insufficient",
  "invalid-config",
]);

/** A candidate's downgrade reason as recorded: a known reason, else "unknown". */
export function sanitizeDowngradeReason(reason: string): string {
  return DOWNGRADE_REASONS.has(reason) ? reason : "unknown";
}

interface NodeErrorLike {
  name: "KernelNodeError";
  code: string;
  gateResult?: GateResult;
}

export function isNodeError(error: unknown): error is NodeErrorLike {
  return error instanceof Error && error.name === "KernelNodeError" && typeof (error as { code?: unknown }).code === "string";
}

export function isCallError(error: unknown): error is Error & { runId: string; failure: { kind: string } } {
  return (
    error instanceof Error &&
    error.name === "KernelCallError" &&
    typeof (error as { failure?: { kind?: unknown } }).failure?.kind === "string"
  );
}

export function isGateError(error: unknown): error is Error & { gateResult: GateResult; cause: unknown } {
  return error instanceof Error && error.name === "KernelGateError" && typeof (error as { gateResult?: unknown }).gateResult === "object";
}

function nodeCode(error: unknown): string | null {
  return isNodeError(error) && NODE_CODES.has(error.code) ? error.code : null;
}

/** A thrown node failure as a fixed code: `kernel-error: <code>`, `config-invalid`, or `unexpected-error`. */
export function failureCode(error: unknown): string {
  const code = nodeCode(error) ?? (isGateError(error) ? nodeCode(error.cause) : null);
  if (code !== null) return `kernel-error: ${code}`;
  if (error instanceof Error && error.name === "KernelDecideValidationError") return "kernel-error: invalid-request";
  if (error instanceof Error && error.name === "AdvisoryConfigError") return "config-invalid";
  return UNEXPECTED_ERROR;
}

/** A failed call's kind: the CallFailure kind, else the KernelNodeError code, else `unexpected-error`. */
export function callFailureKind(error: unknown): string {
  if (isCallError(error)) return CALL_KINDS.has(error.failure.kind) ? error.failure.kind : UNEXPECTED_ERROR;
  return nodeCode(error) ?? UNEXPECTED_ERROR;
}

/**
 * A failure that retrying cannot fix: the requestId already names a
 * different request (`invalid-request`, e.g. the note or patch changed under
 * a replayed checkpoint), or a request that fails validation. The shadow
 * lane records these instead of retrying the same mismatch forever.
 */
export function isTerminalFailure(error: unknown): boolean {
  const code = nodeCode(error) ?? (isGateError(error) ? nodeCode(error.cause) : null);
  if (code === "invalid-request") return true;
  return error instanceof Error && error.name === "KernelDecideValidationError";
}
