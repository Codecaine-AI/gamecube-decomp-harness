import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, test } from "bun:test";
import { loadBoardSnapshot, normalizeCandidateRerankMode, type BoardRankFeature } from "./snapshot.js";

function writeJson(path: string, value: unknown): void {
  mkdirSync(resolve(path, ".."), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

describe("loadBoardSnapshot", () => {
  test("normalizes model candidate rerank modes", () => {
    expect(normalizeCandidateRerankMode("model_win_95")).toBe("model_win_95");
    expect(normalizeCandidateRerankMode("model-win95")).toBe("model_win_95");
    expect(normalizeCandidateRerankMode("model_win_90")).toBe("model_win_90");
    expect(normalizeCandidateRerankMode("Model Match Focus")).toBe("model_match_focus");
    expect(normalizeCandidateRerankMode("opseq_hot_lane")).toBe("opseq_hot_lane");
    expect(normalizeCandidateRerankMode("unknown")).toBe("priority");
  });

  test("uses the session report as source of truth when objdiff is missing", () => {
    const root = mkdtempSync(join(tmpdir(), "board-current-report-"));
    try {
      const projectRoot = resolve(root, "projects/melee");
      const upstreamRoot = resolve(projectRoot, "worktrees/upstream-current");
      const sessionCurrentRoot = resolve(projectRoot, "worktrees/sessions/session-uuid/current");

      writeJson(resolve(sessionCurrentRoot, "build/GALE01/report.json"), {
        measures: {
          matched_code_percent: 77.52909,
          complete_code_percent: 77.52909,
          matched_functions_percent: 71.25,
        },
        units: [
          {
            name: "melee/gm/gm_1832.c",
            metadata: { source_path: "src/melee/gm/gm_1832.c" },
            functions: [
              { name: "retiredByCurrentReport", size: 512, fuzzy_match_percent: 100 },
              { name: "stillNeedsWork", size: 256, fuzzy_match_percent: 99.25 },
            ],
          },
        ],
      });
      writeJson(resolve(upstreamRoot, "build/GALE01/report.json"), {
        measures: {
          matched_code_percent: 76.066864,
          complete_code_percent: 76.066864,
          matched_functions_percent: 70.5,
        },
        units: [
          {
            name: "melee/gm/gm_1832.c",
            metadata: { source_path: "src/melee/gm/gm_1832.c" },
            functions: [{ name: "retiredByCurrentReport", size: 512, fuzzy_match_percent: 98.93321 }],
          },
        ],
      });
      writeJson(resolve(upstreamRoot, "objdiff.json"), {
        units: [
          {
            name: "melee/gm/gm_1832.c",
            metadata: { source_path: "src/melee/gm/gm_1832.c" },
          },
        ],
      });

      const snapshot = loadBoardSnapshot(sessionCurrentRoot, 12);

      expect(snapshot.reportPath).toBe(resolve(sessionCurrentRoot, "build/GALE01/report.json"));
      expect(snapshot.measures.matched_code_percent).toBe(77.52909);
      expect(snapshot.candidates.map((candidate) => candidate.symbol)).toEqual(["stillNeedsWork"]);
      expect(snapshot.candidates[0]?.sourcePath).toBe("src/melee/gm/gm_1832.c");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("loads the upstream-current baseline for session worktrees without local reports", () => {
    const root = mkdtempSync(join(tmpdir(), "board-session-baseline-"));
    try {
      const projectRoot = resolve(root, "projects/melee");
      const upstreamRoot = resolve(projectRoot, "worktrees/upstream-current");
      const sessionCurrentRoot = resolve(projectRoot, "worktrees/sessions/session-uuid/current");
      mkdirSync(sessionCurrentRoot, { recursive: true });

      writeJson(resolve(upstreamRoot, "build/GALE01/report.json"), {
        measures: {
          matched_code_percent: 76.066864,
          complete_code_percent: 76.066864,
          matched_functions_percent: 70.5,
        },
        units: [
          {
            name: "melee/mp/mplib.c",
            metadata: { source_path: "src/melee/mp/mplib.c" },
            functions: [{ name: "mpCheckFloor", size: 128, fuzzy_match_percent: 99.677 }],
          },
        ],
      });
      writeJson(resolve(upstreamRoot, "objdiff.json"), {
        units: [
          {
            name: "melee/mp/mplib.c",
            metadata: { source_path: "src/melee/mp/mplib.c" },
          },
        ],
      });

      const snapshot = loadBoardSnapshot(sessionCurrentRoot, 12);

      expect(snapshot.reportPath).toBe(resolve(upstreamRoot, "build/GALE01/report.json"));
      expect(snapshot.measures.matched_code_percent).toBe(76.066864);
      expect(snapshot.candidates[0]?.symbol).toBe("mpCheckFloor");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("counts unmatched targets from the code graph fallback", () => {
    const root = mkdtempSync(join(tmpdir(), "board-codegraph-"));
    try {
      const repoRoot = resolve(root, "repo");
      const functionsIndex = resolve(root, "functions.jsonl");
      writeFileSync(
        functionsIndex,
        [
          { unit: "a.o", sourcePath: "src/a.c", symbol: "matched", size: 100, fuzzy: 100 },
          { unit: "b.o", sourcePath: "src/b.c", symbol: "near", size: 80, fuzzy: 99.5 },
          { unit: "c.o", sourcePath: "src/c.c", symbol: "far", size: 20, fuzzy: 50 },
        ].map((row) => JSON.stringify(row)).join("\n"),
      );

      const snapshot = loadBoardSnapshot(repoRoot, 12, { codeGraphFunctionsIndexPath: functionsIndex });

      expect(snapshot.measures.unmatched_targets).toBe(2);
      expect(snapshot.candidates.map((candidate) => candidate.symbol).sort()).toEqual(["far", "near"]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("can rerank matched opseq analogs from deeper in the candidate window", () => {
    const root = mkdtempSync(join(tmpdir(), "board-opseq-rerank-"));
    try {
      const repoRoot = resolve(root, "repo");
      const functionsIndex = resolve(root, "functions.jsonl");
      writeFileSync(
        functionsIndex,
        [
          { unit: "cold.o", sourcePath: "src/cold.c", symbol: "coldHighFuzzy", size: 80, fuzzy: 99.8 },
          { unit: "hot.o", sourcePath: "src/hot.c", symbol: "hotOpseq", size: 80, fuzzy: 90 },
        ].map((row) => JSON.stringify(row)).join("\n"),
      );

      const snapshot = loadBoardSnapshot(repoRoot, 2, {
        candidateRerank: "opseq_hot_lane",
        codeGraphFunctionsIndexPath: functionsIndex,
        rankFeatureProvider: (candidate) =>
          featureFor(candidate.sourcePath, {
            opseq_best_analog_score: candidate.symbol === "hotOpseq" ? 0.97 : 0,
            opseq_best_matched_analog_score: candidate.symbol === "hotOpseq" ? 0.97 : 0,
            opseq_analog_count: candidate.symbol === "hotOpseq" ? 1 : 0,
            opseq_exact_analog_count: candidate.symbol === "hotOpseq" ? 1 : 0,
            opseq_matched_analog_count: candidate.symbol === "hotOpseq" ? 1 : 0,
          }),
      });

      expect(snapshot.candidates[0]?.symbol).toBe("hotOpseq");
      expect(snapshot.candidates[0]?.rank?.candidate_rerank_mode).toBe("opseq_hot_lane");
      expect(snapshot.candidates[0]?.rank?.opseq_best_matched_analog_score).toBe(0.97);
      expect(Number(snapshot.candidates[0]?.rank?.opseq_rerank_bonus ?? 0)).toBeGreaterThan(0);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("reranks candidates by model win score without changing priority values", () => {
    const root = mkdtempSync(join(tmpdir(), "board-model-win-rerank-"));
    try {
      const { repoRoot, functionsIndex } = writeModelFixture(root);
      const prioritySnapshot = loadBoardSnapshot(repoRoot, 3, {
        candidateRerank: "priority",
        codeGraphFunctionsIndexPath: functionsIndex,
      });
      const modelSnapshot = loadBoardSnapshot(repoRoot, 3, {
        candidateRerank: "model_win_95",
        codeGraphFunctionsIndexPath: functionsIndex,
        predictorScorer: () => ({
          "a.o::priorityFirst": { p_win: 0.1, p_match: 0.9 },
          "b.o::priorityMiddle": { p_win: 0.9, p_match: 0.1 },
          "c.o::priorityLast": { p_win: 0.5, p_match: 0.5 },
        }),
      });

      expect(modelSnapshot.candidates.map((candidate) => candidate.symbol)).toEqual(["priorityMiddle", "priorityLast", "priorityFirst"]);
      expect(modelSnapshot.candidates.map((candidate) => candidate.rank?.p_win)).toEqual([0.9, 0.5, 0.1]);
      expect(modelSnapshot.candidates[0]?.rank?.candidate_rerank_mode).toBe("model_win_95");
      expect(modelSnapshot.modelScoring).toEqual({
        mode: "model_win_95",
        applied: true,
        score_key: "p_win",
        scored_count: 3,
        missing_count: 0,
      });
      expect(priorityBySymbol(modelSnapshot)).toEqual(priorityBySymbol(prioritySnapshot));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("reranks match-focus candidates by p_match", () => {
    const root = mkdtempSync(join(tmpdir(), "board-model-match-rerank-"));
    try {
      const { repoRoot, functionsIndex } = writeModelFixture(root);
      const snapshot = loadBoardSnapshot(repoRoot, 3, {
        candidateRerank: "model_match_focus",
        codeGraphFunctionsIndexPath: functionsIndex,
        predictorScorer: () => ({
          "a.o::priorityFirst": { p_win: 0.9, p_match: 0.1 },
          "b.o::priorityMiddle": { p_win: 0.1, p_match: 0.9 },
          "c.o::priorityLast": { p_win: 0.5, p_match: 0.5 },
        }),
      });

      expect(snapshot.candidates.map((candidate) => candidate.symbol)).toEqual(["priorityMiddle", "priorityLast", "priorityFirst"]);
      expect(snapshot.candidates.map((candidate) => candidate.rank?.p_match)).toEqual([0.9, 0.5, 0.1]);
      expect(snapshot.modelScoring?.score_key).toBe("p_match");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("falls back to priority order when model scoring fails", () => {
    const root = mkdtempSync(join(tmpdir(), "board-model-fail-safe-"));
    try {
      const { repoRoot, functionsIndex } = writeModelFixture(root);
      const prioritySnapshot = loadBoardSnapshot(repoRoot, 3, {
        candidateRerank: "priority",
        codeGraphFunctionsIndexPath: functionsIndex,
      });
      const nullSnapshot = loadBoardSnapshot(repoRoot, 3, {
        candidateRerank: "model_win_90",
        codeGraphFunctionsIndexPath: functionsIndex,
        predictorScorer: () => null,
      });
      const throwingSnapshot = loadBoardSnapshot(repoRoot, 3, {
        candidateRerank: "model_win_90",
        codeGraphFunctionsIndexPath: functionsIndex,
        predictorScorer: () => {
          throw new Error("predictor unavailable");
        },
      });

      const priorityOrder = prioritySnapshot.candidates.map((candidate) => candidate.symbol);
      expect(nullSnapshot.candidates.map((candidate) => candidate.symbol)).toEqual(priorityOrder);
      expect(throwingSnapshot.candidates.map((candidate) => candidate.symbol)).toEqual(priorityOrder);
      expect(nullSnapshot.modelScoring?.applied).toBe(false);
      expect(nullSnapshot.modelScoring?.warning).toBeTruthy();
      expect(throwingSnapshot.modelScoring?.applied).toBe(false);
      expect(throwingSnapshot.modelScoring?.warning).toContain("predictor unavailable");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

function writeModelFixture(root: string): { repoRoot: string; functionsIndex: string } {
  const repoRoot = resolve(root, "repo");
  const functionsIndex = resolve(root, "functions.jsonl");
  writeFileSync(
    functionsIndex,
    [
      { unit: "a.o", sourcePath: "src/a.c", symbol: "priorityFirst", size: 120, fuzzy: 99.9 },
      { unit: "b.o", sourcePath: "src/b.c", symbol: "priorityMiddle", size: 80, fuzzy: 95 },
      { unit: "c.o", sourcePath: "src/c.c", symbol: "priorityLast", size: 40, fuzzy: 70 },
    ].map((row) => JSON.stringify(row)).join("\n"),
  );
  return { repoRoot, functionsIndex };
}

function priorityBySymbol(snapshot: ReturnType<typeof loadBoardSnapshot>): Record<string, number> {
  return Object.fromEntries(snapshot.candidates.map((candidate) => [candidate.symbol, candidate.priority]));
}

function featureFor(sourcePath: string, overrides: Partial<BoardRankFeature> = {}): BoardRankFeature {
  return {
    target: { source_path: sourcePath },
    source_path: sourcePath,
    editability: "editable",
    graph_degree: 0,
    function_graph_degree: 0,
    fresh_edges_since_last_attempt: 0,
    relevant_pr_count: 0,
    review_risk_count: 0,
    duplicate_reference_count: 0,
    opseq_best_analog_score: 0,
    opseq_best_matched_analog_score: 0,
    opseq_analog_count: 0,
    opseq_exact_analog_count: 0,
    opseq_matched_analog_count: 0,
    linked_unlock_potential: 0,
    connected_incomplete_function_count: 0,
    connected_matched_reference_count: 0,
    resource_evidence_count: 0,
    path_fact_count: 0,
    historical_lesson_count: 0,
    curated_signal_count: 0,
    proposal_fact_count: 0,
    stale_fact_count: 0,
    information_gain_score: 0,
    unlock_score: 0,
    context_quality_score: 0,
    completion_readiness_score: 0,
    information_value_score: 0,
    risk_penalty: 0,
    priority_bonus: 0,
    explanation: [],
    ...overrides,
  };
}
