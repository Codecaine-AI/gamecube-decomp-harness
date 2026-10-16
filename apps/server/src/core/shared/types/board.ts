export interface BoardMeasures {
  /** Completion figures are null when steering evidence cannot bound them. */
  fuzzy_match_percent?: number | null;
  matched_code_percent?: number | null;
  complete_code_percent?: number | null;
  matched_functions_percent?: number | null;
  total_units?: number;
  complete_units?: number | null;
  unmatched_targets?: number | null;
  /**
   * Steering-gated games with active `unverified_match` rows: the separate
   * "100% unverified" figure, withheld from every count above. Presence marks
   * the measures as adjusted (see board/unverified-measures.ts). A figure that
   * cannot be bounded without a denominator is null in the JSON (unknown).
   */
  unverified_functions?: number | null;
  unverified_code?: number | null;
  unverified_code_percent?: number | null;
  unverified_targets?: number | null;
  unverified_fuzzy_percent?: number | null;
  unverified_complete_units?: number | null;
  unverified_unbounded?: boolean;
}

/** A class a function's target code constructs (or uses the vtable/RTTI of) whose owner unit is not decompiled. */
export interface ReadinessClassRef {
  class: string;
  owner_unit: string | null;
  kind: string;
}

export type ReadinessFunctionState = "ready" | "deferred" | "blocked";

/** Class readiness of one target at the epoch-start revision (`readiness.py index`). */
export interface TargetReadiness {
  state: ReadinessFunctionState;
  unmet: ReadinessClassRef[];
  unresolved: ReadinessClassRef[];
}

export interface TargetCandidate {
  unit: string;
  sourcePath: string;
  symbol: string;
  size: number;
  fuzzy: number;
  kind: "function" | "section";
  /** Set only when ordering is active and the target has not-ready or unresolved classes. */
  readiness?: TargetReadiness;
  /**
   * `unverified_match`: the steering backfill could not certify the function's
   * code (often already 100%). Claimable, never done; admitted ahead of untouched targets.
   */
  verification?: "unverified_match";
}

/** Why a candidate is held out: its classes are not ready, readiness could not be loaded, or the loaded index does not list it. */
export type BlockedCandidateReason = "not_ready" | "readiness_unavailable" | "not_in_index";

export interface BlockedCandidate {
  key: string;
  unit: string;
  symbol: string;
  sourcePath: string;
  size: number;
  fuzzy: number;
  reason: BlockedCandidateReason;
  unmet: ReadinessClassRef[];
}

export interface BoardReadinessSummary {
  mode: "shadow" | "enforce";
  /** Identity of the readiness index the board used; null when it was unavailable. */
  identity: Record<string, unknown> | null;
  rev: string | null;
  /** Loader failure (`readiness_unavailable`); gated functions are blocked in enforce. */
  unavailable: string | null;
}

export interface BoardSnapshot {
  generatedAt: string;
  reportPath: string;
  objdiffPath: string;
  measures: BoardMeasures;
  candidates: TargetCandidate[];
  /** Enforce: order-gated candidates with unmet classes (or readiness unavailable); never admitted. */
  blocked?: BlockedCandidate[];
  /** Enforce: `unit::symbol` keys admitted after every ready candidate. */
  deferred?: string[];
  /** Shadow: what enforce would block; nothing is held back. */
  wouldBlock?: BlockedCandidate[];
  /** Shadow: what enforce would defer; order is unchanged. */
  wouldDefer?: string[];
  readiness?: BoardReadinessSummary;
}
