// The offline stand-in for ExtractCheckpointKnowledge (`--engine fake`): a
// deterministic reading of the note's structured fields, no model. It looks
// for a `kept_advisories` entry per finding (rule, file, line within 3), then
// for the legacy note fields that cover every finding at once
// (`review_justification`, `tactic_justification`, `review_advisories`), and
// copies evidence from the note's `validation` strings. Prose-only notes yield
// no justification, which is the safe direction for a stand-in.
import type { AdvisoryFindingRef, CheckpointKnowledge } from "@server/generated/baml_client/types";

const LEGACY_FIELDS = ["review_justification", "tactic_justification", "review_advisories"] as const;
const LINE_SLACK = 3;
const EVIDENCE = /objdiff|checkdiff|match|PASS|FAIL|%/;

function parseNote(note: string): Record<string, unknown> | null {
  const candidates = [note.trim()];
  const start = note.indexOf("{");
  const end = note.lastIndexOf("}");
  if (start >= 0 && end > start) candidates.push(note.slice(start, end + 1));
  for (const text of candidates) {
    try {
      const parsed = JSON.parse(text) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
    } catch {
      // not JSON; try the next candidate
    }
  }
  return null;
}

function text(value: unknown): string | null {
  if (typeof value === "string") return value.trim() || null;
  if (Array.isArray(value)) {
    const parts = value.map(text).filter((part): part is string => part !== null);
    return parts.length > 0 ? parts.join(" ") : null;
  }
  return null;
}

function evidenceOf(note: Record<string, unknown>): string[] {
  const validation = note.validation;
  if (!validation || typeof validation !== "object") return [];
  return Object.values(validation as Record<string, unknown>)
    .filter((value): value is string => typeof value === "string" && EVIDENCE.test(value))
    .map((value) => value.trim());
}

interface KeptEntry {
  rule_id?: unknown;
  file?: unknown;
  line?: unknown;
  justification?: unknown;
}

function matchesEntry(finding: AdvisoryFindingRef, entry: KeptEntry): boolean {
  if (entry.rule_id !== undefined && entry.rule_id !== finding.rule_id) return false;
  if (typeof entry.file === "string" && !finding.file.endsWith(entry.file.replace(/^\.\//, ""))) return false;
  return typeof entry.line === "number" && Math.abs(entry.line - finding.line) <= LINE_SLACK;
}

export function fakeExtractCheckpointKnowledge(note: string, findings: readonly AdvisoryFindingRef[]): CheckpointKnowledge {
  const parsed = parseNote(note);
  const kept = Array.isArray(parsed?.kept_advisories) ? (parsed!.kept_advisories as KeptEntry[]) : [];
  const legacy = parsed ? LEGACY_FIELDS.map((field) => text(parsed[field])).find((value) => value !== null) ?? null : null;
  const evidence = parsed ? evidenceOf(parsed) : [];
  let structuredFieldUsed = false;
  const advisories = findings.map((finding) => {
    const entry = kept.find((candidate) => candidate && typeof candidate === "object" && matchesEntry(finding, candidate));
    const structured = entry ? text(entry.justification) : null;
    if (structured) structuredFieldUsed = true;
    const justification = structured ?? legacy;
    return { finding_id: finding.id, kept: justification !== null, justification, evidence: justification ? evidence : [] };
  });
  return { advisories, structured_field_used: structuredFieldUsed };
}
