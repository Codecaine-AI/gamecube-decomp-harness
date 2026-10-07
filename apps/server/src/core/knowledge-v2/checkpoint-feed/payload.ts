// The extraction input and the `checkpoint_confirmed_v1` payload (plan §6.8).
// The payload is what `buildCheckpointConfirmedContext` (librarian/context.ts)
// reads: it names the checkpoint, its worker run and the submission whose
// `runtime_ref` is the checkpoint, and carries keyed, typed facts. Fact keys
// are `kind|unit|function|sha256(normalized subject or name)`, so the same
// fact from two extractions dedupes.
import type {
  AdvisoryFindingRef,
  ConfirmedCheckpointInput,
  ConfirmedCheckpointKnowledge,
} from "@server/generated/baml_client/types";
import { advisoryFingerprint, fullFlaggedLineFromPatch, normalizeAdvisoryPath } from "@server/core/validation/qa/advisory-fingerprint.js";
import type { QaScanFinding } from "@server/core/validation/qa/scan-diff.js";

import { CHECKPOINT_CONFIRMED_SCHEMA } from "../librarian/context.js";
import { sha256Hex, type ConfirmationSource, type ConfirmedCheckpoint } from "./confirmed-good.js";
import { boundedHunks, boundedNote, type CheckpointSources, type SourceDigests } from "./sources.js";

export const CHECKPOINT_CONFIRMED_PATHWAY = "checkpoint_confirmed" as const;

/** Most evidence strings kept per fact or advisory, and the longest kept string. */
const MAX_EVIDENCE = 8;
const MAX_EVIDENCE_CHARS = 500;
const MAX_TEXT_CHARS = 2_000;

/** `index_task.id` for a checkpoint: one task per checkpoint, ever. */
export function checkpointConfirmedTaskId(checkpointId: string): string {
  return `task:${CHECKPOINT_CONFIRMED_PATHWAY}:${checkpointId}`;
}

/** One `llm_review` finding as handed to the extraction, with its stable identity. */
export interface AdvisoryRef {
  ref: AdvisoryFindingRef;
  finding: QaScanFinding;
  /** af2 fingerprint; null when the complete flagged line cannot be read. */
  fingerprint: string | null;
  /** The attempt-time adjudication of the same finding, when one was recorded. */
  prior: Record<string, unknown> | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function priorAdvisories(adjudication: Record<string, unknown> | null): Record<string, unknown>[] {
  const advisories = adjudication?.advisories;
  return Array.isArray(advisories) ? advisories.filter(isRecord) : [];
}

/** The recorded adjudication of a finding: by fingerprint when both have one, else by rule, file and line. */
function matchPrior(
  finding: QaScanFinding,
  fingerprint: string | null,
  prior: readonly Record<string, unknown>[],
): Record<string, unknown> | null {
  if (fingerprint !== null) {
    const byFingerprint = prior.find((advisory) => advisory.fingerprint === fingerprint);
    if (byFingerprint) return byFingerprint;
  }
  // Two fingerprints that differ name different code on that line: never matched by location.
  const file = normalizeAdvisoryPath(finding.file);
  return prior.find((advisory) => (fingerprint === null || typeof advisory.fingerprint !== "string")
    && advisory.rule_id === finding.rule_id
    && typeof advisory.file === "string" && normalizeAdvisoryPath(advisory.file) === file
    && advisory.line === finding.line) ?? null;
}

export function advisoryRefs(sources: CheckpointSources): AdvisoryRef[] {
  const prior = priorAdvisories(sources.adjudication);
  return sources.advisories.map((finding, index) => {
    const fullLine = fullFlaggedLineFromPatch(sources.patchText, finding.file, finding.line, finding.excerpt);
    const computed = fullLine === null ? null : advisoryFingerprint(finding, fullLine);
    const matched = matchPrior(finding, computed, prior);
    const recorded = typeof matched?.fingerprint === "string" ? matched.fingerprint : null;
    return {
      ref: {
        id: `advisory-${index + 1}`,
        rule_id: finding.rule_id,
        severity: finding.severity === "info" ? "info" : "warning",
        file: finding.file,
        line: finding.line,
        excerpt: finding.excerpt,
        message: finding.message,
      },
      finding,
      fingerprint: computed ?? recorded,
      prior: matched,
    };
  });
}

/** A compact view of the attempt-time adjudication for the prompt: verdicts and justifications, no hunks. */
export function compactPriorAdjudication(adjudication: Record<string, unknown> | null): string | null {
  if (adjudication === null) return null;
  return JSON.stringify({
    verdict: adjudication.verdict ?? null,
    mode: adjudication.mode ?? null,
    advisories: priorAdvisories(adjudication).map((advisory) => ({
      fingerprint: advisory.fingerprint ?? null,
      rule_id: advisory.rule_id ?? null,
      severity: advisory.severity ?? null,
      file: advisory.file ?? null,
      line: advisory.line ?? null,
      result: advisory.result ?? null,
      justification: advisory.justification ?? null,
      evidence: Array.isArray(advisory.evidence) ? advisory.evidence : [],
    })),
  });
}

export interface ExtractionInput {
  input: ConfirmedCheckpointInput;
  refs: AdvisoryRef[];
  noteTruncated: boolean;
  hunksTruncated: boolean;
}

export function extractionInput(checkpoint: ConfirmedCheckpoint, sources: CheckpointSources): ExtractionInput {
  const note = boundedNote(sources.noteText);
  const hunks = boundedHunks(sources.patchText, checkpoint.target.sourcePath);
  const refs = advisoryRefs(sources);
  const prior = compactPriorAdjudication(sources.adjudication);
  return {
    input: {
      unit: checkpoint.target.unit,
      function_name: checkpoint.target.function,
      target_key: checkpoint.target.key,
      old_score: checkpoint.scores.old,
      new_score: checkpoint.scores.new,
      exact: checkpoint.scores.exact,
      note,
      hunks: hunks.hunks,
      advisories: refs.map((ref) => ref.ref),
      ...(prior !== null ? { prior_adjudication: prior } : {}),
    },
    refs,
    noteTruncated: note !== sources.noteText,
    hunksTruncated: hunks.truncated,
  };
}

// ── facts ─────────────────────────────────────────────────────────────────────

export type CheckpointFactKind = "tactic" | "codegen_quirk" | "type_fact" | "idiom";

export interface CheckpointFact {
  key: string;
  kind: CheckpointFactKind;
  subject: string;
  statement: string;
  applies_when?: string;
  produced_match?: boolean;
  evidence: string[];
}

function clean(value: unknown, max = MAX_TEXT_CHARS): string {
  if (typeof value !== "string") return "";
  const text = value.trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function cleanEvidence(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const evidence: string[] = [];
  for (const entry of value) {
    const text = clean(entry, MAX_EVIDENCE_CHARS);
    if (text && !evidence.includes(text)) evidence.push(text);
    if (evidence.length >= MAX_EVIDENCE) break;
  }
  return evidence;
}

/** Lowercase, trimmed, whitespace collapsed: the form a fact key hashes. */
export function normalizeFactSubject(subject: string): string {
  return subject.trim().replace(/\s+/g, " ").toLowerCase();
}

export function factKey(kind: CheckpointFactKind, unit: string, fn: string, subject: string): string {
  return `${kind}|${unit}|${fn}|${sha256Hex(normalizeFactSubject(subject))}`;
}

/**
 * Keyed facts from an extraction. Items without a subject or without
 * evidence are dropped (the prompt requires evidence for every item); facts
 * that share a key are merged, their evidence combined.
 */
export function checkpointFacts(
  knowledge: ConfirmedCheckpointKnowledge,
  target: { unit: string; function: string },
): { facts: CheckpointFact[]; dropped: number } {
  const candidates: Array<Omit<CheckpointFact, "key">> = [
    ...(knowledge.tactics ?? []).map((tactic) => ({
      kind: "tactic" as const,
      subject: clean(tactic.name),
      statement: clean(tactic.description),
      applies_when: clean(tactic.applies_when),
      evidence: cleanEvidence(tactic.evidence),
    })),
    ...(knowledge.codegen_quirks ?? []).map((quirk) => ({
      kind: "codegen_quirk" as const,
      subject: clean(quirk.compiler_behavior),
      statement: clean(quirk.compiler_behavior),
      applies_when: clean(quirk.source_shape),
      evidence: cleanEvidence(quirk.evidence),
    })),
    ...(knowledge.type_facts ?? []).map((fact) => ({
      kind: "type_fact" as const,
      subject: clean(fact.subject),
      statement: clean(fact.fact),
      evidence: cleanEvidence(fact.evidence),
    })),
    ...(knowledge.idioms ?? []).map((idiom) => ({
      kind: "idiom" as const,
      subject: clean(idiom.pattern),
      statement: clean(idiom.pattern),
      produced_match: idiom.produced_match === true,
      evidence: cleanEvidence(idiom.evidence),
    })),
  ];
  const byKey = new Map<string, CheckpointFact>();
  let dropped = 0;
  for (const candidate of candidates) {
    if (!candidate.subject || !candidate.statement || candidate.evidence.length === 0) {
      dropped += 1;
      continue;
    }
    const key = factKey(candidate.kind, target.unit, target.function, candidate.subject);
    const existing = byKey.get(key);
    if (existing) {
      existing.evidence = cleanEvidence([...existing.evidence, ...candidate.evidence]);
      continue;
    }
    const fact: CheckpointFact = { key, kind: candidate.kind, subject: candidate.subject, statement: candidate.statement, evidence: candidate.evidence };
    if (candidate.applies_when) fact.applies_when = candidate.applies_when;
    if (candidate.produced_match !== undefined) fact.produced_match = candidate.produced_match;
    byKey.set(key, fact);
  }
  return { facts: [...byKey.values()], dropped };
}

// ── kept advisories ───────────────────────────────────────────────────────────

export interface PayloadKeptAdvisory {
  fingerprint: string | null;
  rule_id: string;
  severity: "warning" | "info";
  file: string;
  line: number;
  justification: string | null;
  evidence: string[];
  /** From the attempt-time adjudication, when one was recorded; null otherwise. */
  verdict: string | null;
  probability: number | null;
  confidence_source: string | null;
  engine: string | null;
  model: string | null;
}

function priorDecision(prior: Record<string, unknown> | null): Record<string, unknown> {
  return isRecord(prior?.decision) ? prior.decision : {};
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

/** The advisories the note keeps on purpose, one per finding, info included. */
export function keptAdvisories(knowledge: ConfirmedCheckpointKnowledge, refs: readonly AdvisoryRef[]): PayloadKeptAdvisory[] {
  const byId = new Map(refs.map((ref) => [ref.ref.id, ref]));
  const seen = new Set<string>();
  const kept: PayloadKeptAdvisory[] = [];
  for (const entry of knowledge.kept_advisories ?? []) {
    const ref = byId.get(entry.finding_id);
    if (!ref || seen.has(entry.finding_id) || entry.kept !== true) continue;
    seen.add(entry.finding_id);
    const decision = priorDecision(ref.prior);
    const probability = ref.prior?.probability;
    kept.push({
      fingerprint: ref.fingerprint,
      rule_id: ref.ref.rule_id,
      severity: ref.ref.severity,
      file: normalizeAdvisoryPath(ref.ref.file),
      line: ref.ref.line,
      justification: clean(entry.justification) || null,
      evidence: cleanEvidence(entry.evidence),
      verdict: stringOrNull(ref.prior?.result),
      probability: typeof probability === "number" && Number.isFinite(probability) ? probability : null,
      confidence_source: stringOrNull(decision.confidence_source),
      engine: stringOrNull(decision.engine),
      model: stringOrNull(decision.served_model),
    });
  }
  return kept;
}

// ── the payload ───────────────────────────────────────────────────────────────

export interface CheckpointConfirmedPayload {
  schema: typeof CHECKPOINT_CONFIRMED_SCHEMA;
  checkpoint_id: string;
  /** `run:<worker_state_id>`, the knowledge store's worker run. */
  worker_run_id: string;
  submission_id: string;
  submission_seq: number;
  epoch_id: string;
  integration_id: string;
  integrated_rev: string;
  save_point_commit: string;
  confirmation: ConfirmationSource;
  target: { key: string; knowledge_key: string; unit: string; function: string };
  facts: CheckpointFact[];
  kept_advisories: PayloadKeptAdvisory[];
  sources: SourceDigests;
  extraction: {
    kernel_run_id: string | null;
    /** `kernel.call` returns the value only; the served model is in the call's trace (call_end). */
    served_model: string | null;
    requested_model: string;
  };
}

export interface PayloadInput {
  checkpoint: ConfirmedCheckpoint;
  submission: { id: string; workerRunId: string; seq: number };
  knowledge: ConfirmedCheckpointKnowledge;
  refs: readonly AdvisoryRef[];
  digests: SourceDigests;
  extraction: { kernelRunId: string | null; requestedModel: string };
}

export function checkpointConfirmedPayload(params: PayloadInput): { payload: CheckpointConfirmedPayload; droppedFacts: number } {
  const { checkpoint } = params;
  const { facts, dropped } = checkpointFacts(params.knowledge, checkpoint.target);
  return {
    droppedFacts: dropped,
    payload: {
      schema: CHECKPOINT_CONFIRMED_SCHEMA,
      checkpoint_id: checkpoint.checkpointId,
      worker_run_id: params.submission.workerRunId,
      submission_id: params.submission.id,
      submission_seq: params.submission.seq,
      epoch_id: checkpoint.epochId,
      integration_id: checkpoint.integrationId,
      integrated_rev: checkpoint.integratedRev,
      save_point_commit: checkpoint.savePointCommit,
      confirmation: checkpoint.confirmation,
      target: {
        key: checkpoint.target.key,
        knowledge_key: `${checkpoint.target.unit}:${checkpoint.target.function}`,
        unit: checkpoint.target.unit,
        function: checkpoint.target.function,
      },
      facts,
      kept_advisories: keptAdvisories(params.knowledge, params.refs),
      sources: params.digests,
      extraction: {
        kernel_run_id: params.extraction.kernelRunId,
        served_model: null,
        requested_model: params.extraction.requestedModel,
      },
    },
  };
}
