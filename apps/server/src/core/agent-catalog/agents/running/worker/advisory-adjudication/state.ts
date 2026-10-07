// The decision state for one advisory (plan §6.5): anchored on code facts
// (the finding, the patch hunk, the objdiff outcome) plus the justification
// extracted from the note, never on the worker transcript. Every field is
// bounded, so the state stays far below the classifier's token budget
// (32k tokens for typesafe/*) whatever the attempt wrote.
import type { QaScanFinding } from "@server/core/validation/qa/scan-diff.js";

import type { LlmReviewCodeFacts } from "./types.js";

export const MAX_STATE_HUNK_LINES = 120;
export const MAX_STATE_HUNK_CHARS = 16_000;
export const MAX_STATE_JUSTIFICATION_CHARS = 4_000;
export const MAX_STATE_RULE_MESSAGE_CHARS = 1_000;
export const MAX_STATE_FLAGGED_CODE_CHARS = 400;
export const MAX_STATE_DETAIL_VALUE_CHARS = 200;
export const MAX_STATE_DETAIL_KEYS = 20;

export type AdvisoryDetail = Record<string, string | number | boolean | null>;

export type AdvisoryState = {
  /** The rule id, as in the calibration states (R3). */
  finding: string;
  rule_message: string;
  /** Rule-specific scanner context (e.g. the cast), primitives only, minus `llm_review`; null when none. */
  detail: AdvisoryDetail | null;
  file: string;
  line: number;
  /** The flagged line as the scanner reported it (≤ 240 characters). */
  flagged_code: string;
  /** At most 120 lines and 16,000 characters. */
  hunk: string | null;
  /** At most 4,000 characters; null when the note gives none. */
  justification: string | null;
  code_facts: LlmReviewCodeFacts;
};

function truncateChars(text: string, max: number): string {
  if (text.length <= max) return text;
  const marker = ` … [${text.length - max} more characters]`;
  return `${text.slice(0, Math.max(0, max - marker.length))}${marker}`;
}

/** Room kept under the character cap for the closing marker line. */
const HUNK_MARKER_RESERVE = 40;

/**
 * The hunk cut at whole lines to at most 120 lines and 16,000 characters,
 * ending in one marker line that counts the lines cut. A single line longer
 * than the cap is itself cut.
 */
export function boundHunk(hunk: string | null): string | null {
  if (hunk === null) return null;
  const lines = hunk.split("\n");
  if (lines.length <= MAX_STATE_HUNK_LINES && hunk.length <= MAX_STATE_HUNK_CHARS) return hunk;
  const budget = MAX_STATE_HUNK_CHARS - HUNK_MARKER_RESERVE;
  const kept: string[] = [];
  let chars = 0;
  for (const line of lines) {
    const cost = (kept.length > 0 ? 1 : 0) + line.length;
    if (kept.length >= MAX_STATE_HUNK_LINES - 1 || chars + cost > budget) break;
    kept.push(line);
    chars += cost;
  }
  if (kept.length === 0) kept.push(truncateChars(lines[0]!, budget));
  const cut = lines.length - kept.length;
  return cut > 0 ? [...kept, `… [${cut} more lines]`].join("\n") : kept.join("\n");
}

/** Trimmed and cut to 4,000 characters; null for an absent or blank justification. */
export function boundJustification(text: string | null | undefined): string | null {
  const trimmed = text?.trim() ?? "";
  return trimmed.length === 0 ? null : truncateChars(trimmed, MAX_STATE_JUSTIFICATION_CHARS);
}

/** `detail` minus `llm_review`, keys sorted, primitive values only (long strings cut); null when nothing remains. */
export function advisoryDetail(detail: Record<string, unknown> | undefined): AdvisoryDetail | null {
  if (!detail) return null;
  const out: AdvisoryDetail = {};
  for (const key of Object.keys(detail).sort()) {
    if (key === "llm_review" || Object.keys(out).length >= MAX_STATE_DETAIL_KEYS) continue;
    const value = detail[key];
    if (typeof value === "string") out[key] = truncateChars(value, MAX_STATE_DETAIL_VALUE_CHARS);
    else if (value === null || typeof value === "boolean") out[key] = value;
    else if (typeof value === "number" && Number.isFinite(value)) out[key] = value;
  }
  return Object.keys(out).length > 0 ? out : null;
}

function finiteOrNull(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function buildAdvisoryState({
  finding,
  hunk,
  justification,
  facts,
}: {
  finding: QaScanFinding;
  hunk: string | null;
  justification: string | null;
  facts: LlmReviewCodeFacts;
}): AdvisoryState {
  return {
    finding: finding.rule_id,
    rule_message: truncateChars(finding.message, MAX_STATE_RULE_MESSAGE_CHARS),
    detail: advisoryDetail(finding.detail),
    file: finding.file,
    line: finding.line,
    flagged_code: truncateChars(finding.excerpt, MAX_STATE_FLAGGED_CODE_CHARS),
    hunk: boundHunk(hunk),
    justification: boundJustification(justification),
    code_facts: { exact: facts.exact === true, old_score: finiteOrNull(facts.old_score), new_score: finiteOrNull(facts.new_score) },
  };
}
