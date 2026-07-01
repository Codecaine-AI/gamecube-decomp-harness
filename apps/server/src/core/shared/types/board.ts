export type CandidateRerankMode = "priority" | "opseq_hot_lane";

export interface BoardMeasures {
  fuzzy_match_percent?: number;
  matched_code_percent?: number;
  complete_code_percent?: number;
  matched_functions_percent?: number;
  total_units?: number;
  complete_units?: number;
  unmatched_targets?: number;
}

export interface BoardRankBreakdown {
  raw_finishability_priority: number;
  finishability_score: number;
  closeness_score: number;
  information_gain_score: number;
  unlock_score: number;
  context_quality_score: number;
  completion_readiness_score: number;
  information_value_score: number;
  information_priority_score: number;
  opseq_best_analog_score: number;
  opseq_best_matched_analog_score: number;
  opseq_analog_count: number;
  opseq_exact_analog_count: number;
  opseq_matched_analog_count: number;
  opseq_rerank_bonus: number;
  candidate_rerank_mode: CandidateRerankMode;
  high_accuracy_bonus: number;
  accuracy_readiness_bonus: number;
  closeness_fallback_score: number;
  risk_penalty: number;
  graph_score: number;
  total_priority: number;
  explanation: string[];
}

export interface TargetCandidate {
  unit: string;
  sourcePath: string;
  symbol: string;
  size: number;
  fuzzy: number;
  priority: number;
  reason: string;
  rank?: BoardRankBreakdown;
}

export interface BoardSnapshot {
  generatedAt: string;
  reportPath: string;
  objdiffPath: string;
  measures: BoardMeasures;
  candidates: TargetCandidate[];
}
