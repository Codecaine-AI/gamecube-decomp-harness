import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, test } from "bun:test";
import { loadBoardSnapshot, loadExactTargetKeys } from "./snapshot.js";

function writeJson(path: string, value: unknown): void {
  mkdirSync(resolve(path, ".."), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

describe("loadBoardSnapshot", () => {
  test("emits an unmatched data section when code is exact", () => {
    const root = mkdtempSync(join(tmpdir(), "board-section-candidate-"));
    try {
      writeJson(resolve(root, "build/GALE01/report.json"), {
        measures: { matched_code_percent: 100, complete_code_percent: 100 },
        units: [
          {
            name: "melee/data/example.c",
            metadata: { source_path: "src/melee/data/example.c" },
            functions: [{ name: "exactFunction", size: 64, fuzzy_match_percent: 100 }],
            sections: [
              { name: ".text", size: 64, fuzzy_match_percent: 100 },
              { name: ".sdata2", size: 12, fuzzy_match_percent: 89 },
            ],
          },
        ],
      });

      const snapshot = loadBoardSnapshot(root);

      expect(snapshot.candidates).toEqual([
        {
          unit: "melee/data/example.c",
          sourcePath: "src/melee/data/example.c",
          symbol: ".sdata2",
          size: 12,
          fuzzy: 89,
          kind: "section",
        },
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("emits no candidates when code and data are exact", () => {
    const root = mkdtempSync(join(tmpdir(), "board-exact-unit-"));
    try {
      writeJson(resolve(root, "build/GALE01/report.json"), {
        measures: { matched_code_percent: 100, complete_code_percent: 100 },
        units: [
          {
            name: "melee/data/exact.c",
            metadata: { source_path: "src/melee/data/exact.c" },
            functions: [{ name: "exactFunction", size: 64, fuzzy_match_percent: 100 }],
            sections: [
              { name: ".text", size: 64, fuzzy_match_percent: 100 },
              { name: ".sdata2", size: 12, fuzzy_match_percent: 99.999995 },
            ],
          },
        ],
      });

      expect(loadBoardSnapshot(root).candidates).toEqual([]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

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
      expect(snapshot.candidates.map((candidate) => candidate.symbol)).toEqual(["near", "far", "middle"]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("keeps report enumeration order without ranking", () => {
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

      const snapshot = loadBoardSnapshot(repoRoot, { codeGraphFunctionsIndexPath: functionsIndex });

      expect(snapshot.candidates.map((candidate) => candidate.symbol)).toEqual(["coldHighFuzzy", "hotOpseq"]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("loadExactTargetKeys", () => {
  test("includes exact sections and excludes unmatched sections", () => {
    const root = mkdtempSync(join(tmpdir(), "board-exact-section-keys-"));
    try {
      writeJson(resolve(root, "build/GALE01/report.json"), {
        units: [
          {
            name: "melee/data/example.c",
            functions: [],
            sections: [
              { name: ".sdata2", size: 12, fuzzy_match_percent: 99.999995 },
              { name: ".bss", size: 32, fuzzy_match_percent: 99.99 },
            ],
          },
        ],
      });

      const exactKeys = loadExactTargetKeys(root);

      expect(exactKeys.has("melee/data/example.c::.sdata2")).toBe(true);
      expect(exactKeys.has("melee/data/example.c::.bss")).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
