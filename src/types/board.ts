export interface BoardMeasures {
  fuzzy_match_percent?: number;
  matched_code_percent?: number;
  complete_code_percent?: number;
  matched_functions_percent?: number;
  total_units?: number;
  complete_units?: number;
}

export interface TargetCandidate {
  unit: string;
  sourcePath: string;
  symbol: string;
  size: number;
  fuzzy: number;
  priority: number;
  reason: string;
}

export interface BoardSnapshot {
  generatedAt: string;
  reportPath: string;
  objdiffPath: string;
  measures: BoardMeasures;
  candidates: TargetCandidate[];
}
