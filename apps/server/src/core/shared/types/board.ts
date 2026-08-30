export interface BoardMeasures {
  fuzzy_match_percent?: number;
  matched_code_percent?: number;
  complete_code_percent?: number;
  matched_functions_percent?: number;
  total_units?: number;
  complete_units?: number;
  unmatched_targets?: number;
}

export interface TargetCandidate {
  unit: string;
  sourcePath: string;
  symbol: string;
  size: number;
  fuzzy: number;
  kind: "function" | "section";
}

export interface BoardSnapshot {
  generatedAt: string;
  reportPath: string;
  objdiffPath: string;
  measures: BoardMeasures;
  candidates: TargetCandidate[];
}
