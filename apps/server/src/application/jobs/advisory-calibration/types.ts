// Record shapes of the advisory calibration dataset (plan §6.9). Every file
// under `analysis/advisory-adjudication/` (or a `--dir`) holds one of these:
// `candidates.jsonl` and `synthetic.jsonl` hold items, `notes.jsonl` the
// worker notes, `extractions.jsonl` the extracted justifications,
// `proposals.jsonl` the model label proposals, `labels.jsonl` the human
// labels, `split.json` the grouped split, `runs/<model>/<iso>.jsonl` the
// scored probabilities, and `reports/<iso>.{json,md}` the calibration reports.

export type HumanLabel = "justified" | "unjustified";
/** A review keypress: `j`, `u` or `s`. A skip never counts as a label. */
export type ReviewLabel = HumanLabel | "skip";
export type ProposedLabel = "justified" | "unjustified" | "unclear";
export type SplitSide = "selection" | "heldout";
export type ItemSource = "history" | "shadow" | "synthetic";
export type CalibrationEngine = "live" | "replay" | "fake";
export const CALIBRATION_ENGINES: readonly CalibrationEngine[] = ["live", "replay", "fake"];

export interface CodeFacts {
  exact: boolean;
  old_score: number | null;
  new_score: number | null;
}

/** The scanner finding an item is about (a `detail.llm_review` warning or info finding). */
export interface CalibrationFinding {
  rule_id: string;
  severity: "warning" | "info";
  standard_id: string | null;
  file: string;
  line: number;
  excerpt: string;
  message: string;
  detail: Record<string, unknown>;
}

/**
 * One evaluation item: one advisory of one checkpoint (identity: the `af2`
 * fingerprint plus the checkpoint), or one synthetic justification written
 * for a real item's hunk.
 */
export interface CalibrationItem {
  schema: "advisory_calibration_item_v1";
  /** `adv-<hex>` (real) or `syn-<hex>` (synthetic). */
  id: string;
  source: ItemSource;
  synthetic: boolean;
  fingerprint: string;
  /** null when no checkpoint row matched the attempt. */
  checkpoint_id: string | null;
  run_id: string;
  worker_state_id: string;
  attempt_index: number;
  target_key: string;
  finding: CalibrationFinding;
  /** The complete flagged line from the attempt patch (the excerpt is truncated at 240 characters). */
  full_line: string;
  /** The bounded patch hunk around the flagged line, or null when the patch has none. */
  hunk: string | null;
  /** Key into `notes.jsonl`; null when no note was found. */
  note_key: string | null;
  code_facts: CodeFacts;
  /** sha256(target_key + "\n" + rule_id + "\n" + normalizeCode(full_line)): the evidence group before merging. */
  group_key: string;
  /** Synthetic only: the real item whose hunk the justification was written for. */
  source_item_id?: string;
  /** Synthetic only: the quality SynthesizeJustification was asked for. */
  quality?: "good" | "bad";
  /** Synthetic only: the generated justification. Real items take theirs from `extractions.jsonl`. */
  justification?: string;
  /** Synthetic only: why the generated justification is good or bad (for the reviewer). */
  rationale?: string;
  /** Offline fixtures only: the probability `--engine fake` answers for this item. */
  fixture_p?: number;
}

/** One worker note, shared by every item of its checkpoint. */
export interface NoteRecord {
  key: string;
  checkpoint_id: string | null;
  worker_state_id: string;
  attempt_index: number;
  /** `agent_output`: the worker's final message file; `agent_note`: the parsed note stored on the checkpoint. */
  source: "agent_output" | "agent_note";
  /** sha256 of the sanitized text. */
  sha256: string;
  text: string;
}

export interface ExtractionRecord {
  id: string;
  justification: string | null;
  evidence: string[];
  kept: boolean;
  structured_field_used: boolean;
  source: "extract" | "shadow" | "fixture";
  model?: string;
  run_id?: string;
  extracted_at: string;
}

export interface ProposalRecord {
  id: string;
  label: ProposedLabel;
  rationale: string;
  model: string;
  run_id?: string;
  proposed_at: string;
}

export interface LabelRecord {
  id: string;
  label: ReviewLabel;
  labeler: "human";
  reviewer: string;
  proposed_label: ProposedLabel | null;
  /** proposed_label === label; null without a proposal or for a skip. */
  agreed: boolean | null;
  synthetic: boolean;
  /** The item's split group when it was labelled; null before the first split. */
  group: string | null;
  labeled_at: string;
}

export interface SplitFile {
  schema: "advisory_calibration_split_v1";
  /** Fixed at the first split so the assignment is stable as labels and items grow. */
  salt: string;
  heldout_percent: number;
  /** Side of every base group (`group_key`) ever assigned: the record that keeps sides stable. */
  base_groups: Record<string, SplitSide>;
  /** Item id → merged group id. */
  items: Record<string, string>;
  /** Merged group id → side. */
  components: Record<string, SplitSide>;
  /** Merged groups whose base groups had been assigned to both sides; forced to selection. */
  conflicts: string[];
}

/** One scored item of `runs/<model>/<iso>.jsonl`. */
export interface ProbabilityRow {
  id: string;
  /** null when the decision abstained for an engine error or refusal. */
  probability: number | null;
  served_model: string | null;
  abstain_reason?: string;
}
