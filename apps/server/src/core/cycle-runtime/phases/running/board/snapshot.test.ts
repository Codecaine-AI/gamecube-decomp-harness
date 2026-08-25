import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, test } from "bun:test";
import { loadBoardSnapshot, type BoardRankFeature } from "./snapshot.js";

function writeJson(path: string, value: unknown): void {
  mkdirSync(resolve(path, ".."), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

describe("loadBoardSnapshot", () => {
  test("uses the cycle report as source of truth when objdiff is missing", () => {
    const root = mkdtempSync(join(tmpdir(), "board-current-report-"));
    try {
      const gameRoot = resolve(root, "games/melee");
      const upstreamRoot = resolve(gameRoot, "worktrees/upstream-current");
      const cycleCurrentRoot = resolve(gameRoot, "worktrees/cycles/cycle-uuid/current");

      writeJson(resolve(cycleCurrentRoot, "build/GALE01/report.json"), {
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

      const snapshot = loadBoardSnapshot(cycleCurrentRoot);

      expect(snapshot.reportPath).toBe(resolve(cycleCurrentRoot, "build/GALE01/report.json"));
      expect(snapshot.measures.matched_code_percent).toBe(77.52909);
      expect(snapshot.candidates.map((candidate) => candidate.symbol)).toEqual(["stillNeedsWork"]);
      expect(snapshot.candidates[0]?.sourcePath).toBe("src/melee/gm/gm_1832.c");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("loads the upstream-current baseline for cycle worktrees without local reports", () => {
    const root = mkdtempSync(join(tmpdir(), "board-cycle-baseline-"));
    try {
      const gameRoot = resolve(root, "games/melee");
      const upstreamRoot = resolve(gameRoot, "worktrees/upstream-current");
      const cycleCurrentRoot = resolve(gameRoot, "worktrees/cycles/cycle-uuid/current");
      mkdirSync(cycleCurrentRoot, { recursive: true });

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

      const snapshot = loadBoardSnapshot(cycleCurrentRoot);

      expect(snapshot.reportPath).toBe(resolve(upstreamRoot, "build/GALE01/report.json"));
      expect(snapshot.measures.matched_code_percent).toBe(76.066864);
      expect(snapshot.candidates[0]?.symbol).toBe("mpCheckFloor");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("returns all unmatched targets from the code graph fallback", () => {
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
          { unit: "d.o", sourcePath: "src/d.c", symbol: "middle", size: 40, fuzzy: 80 },
        ].map((row) => JSON.stringify(row)).join("\n"),
      );

      const snapshot = loadBoardSnapshot(repoRoot, { codeGraphFunctionsIndexPath: functionsIndex });

      expect(snapshot.measures.unmatched_targets).toBe(3);
      expect(snapshot.candidates.map((candidate) => candidate.symbol).sort()).toEqual(["far", "middle", "near"]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("includes the matched opseq analog bonus in candidate ranking", () => {
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

      const snapshot = loadBoardSnapshot(repoRoot, {
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
      expect(snapshot.candidates[0]?.rank?.opseq_best_matched_analog_score).toBe(0.97);
      expect(Number(snapshot.candidates[0]?.rank?.opseq_rerank_bonus ?? 0)).toBeGreaterThan(0);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

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
