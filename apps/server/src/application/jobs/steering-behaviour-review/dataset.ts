// The hunk dataset (`objectives/sms-real-codegen/data/sms-behaviour-change.jsonl`,
// built by `objectives/sms-real-codegen/validation/build_behaviour_dataset.py`):
// one JSON object per line, `{id, file, function, removed, added, label}` plus
// optional provenance and an optional `ir_gate` verdict for the same hunk.
import { readFileSync } from "node:fs";

export const BEHAVIOUR_LABELS = ["steering", "real"] as const;
export type BehaviourLabel = (typeof BEHAVIOUR_LABELS)[number];

export interface BehaviourHunk {
  id: string;
  file: string;
  function: string;
  removed: string;
  added: string;
  label: BehaviourLabel;
  pr?: number | string;
  source?: string;
  /** The IR gate's label for this hunk, when a gate artifact covered it. */
  ir_gate?: BehaviourLabel;
}

function isLabel(value: unknown): value is BehaviourLabel {
  return typeof value === "string" && (BEHAVIOUR_LABELS as readonly string[]).includes(value);
}

/**
 * The gate label from an `ir_gate` field: a label string, or an object whose
 * `label` (or `verdict`) is one. Anything else counts as absent.
 */
function irGateLabel(raw: unknown): BehaviourLabel | undefined {
  if (isLabel(raw)) return raw;
  if (raw !== null && typeof raw === "object") {
    const record = raw as Record<string, unknown>;
    if (isLabel(record.label)) return record.label;
    if (isLabel(record.verdict)) return record.verdict;
  }
  return undefined;
}

export function parseBehaviourDataset(text: string, source = "dataset"): BehaviourHunk[] {
  const rows: BehaviourHunk[] = [];
  const seen = new Set<string>();
  for (const [index, line] of text.split("\n").entries()) {
    if (line.trim() === "") continue;
    const where = `${source}:${index + 1}`;
    let raw: unknown;
    try {
      raw = JSON.parse(line);
    } catch {
      throw new Error(`steering-behaviour-review: ${where} is not JSON`);
    }
    if (raw === null || typeof raw !== "object" || Array.isArray(raw)) throw new Error(`steering-behaviour-review: ${where} is not an object`);
    const row = raw as Record<string, unknown>;
    for (const key of ["id", "file", "function", "removed", "added"] as const) {
      if (typeof row[key] !== "string") throw new Error(`steering-behaviour-review: ${where}.${key} must be a string`);
    }
    if (!isLabel(row.label)) throw new Error(`steering-behaviour-review: ${where}.label must be "steering" or "real"`);
    const id = row.id as string;
    if (seen.has(id)) throw new Error(`steering-behaviour-review: ${where} repeats id ${id}`);
    seen.add(id);
    const gate = irGateLabel(row.ir_gate);
    rows.push({
      id,
      file: row.file as string,
      function: row.function as string,
      removed: row.removed as string,
      added: row.added as string,
      label: row.label,
      ...((typeof row.pr === "number" || typeof row.pr === "string") && { pr: row.pr }),
      ...(typeof row.source === "string" && { source: row.source }),
      ...(gate !== undefined && { ir_gate: gate }),
    });
  }
  return rows;
}

export function readBehaviourDataset(path: string): BehaviourHunk[] {
  return parseBehaviourDataset(readFileSync(path, "utf8"), path);
}
