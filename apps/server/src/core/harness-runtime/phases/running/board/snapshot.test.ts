import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, test } from "bun:test";
import { EXACT_SCORE } from "@server/core/validation/objdiff/constants.js";
import { loadBoardSnapshot, loadExactTargetKeys, loadStackOnlyTargetKeys } from "./snapshot.js";
import { withUnitKeys } from "@server/core/harness-runtime/run-state/unit-key.js";
import { candidateFromReportFunction } from "./candidates.js";

function writeJson(path: string, value: unknown): void {
  mkdirSync(resolve(path, ".."), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

describe("loadBoardSnapshot", () => {
  test("uses the selected game report and excludes its vendor functions and sections", () => {
    const root = mkdtempSync(join(tmpdir(), "board-sms-"));
    try {
      const unit = (name: string, source: string) => ({ name, metadata: { source_path: source }, functions: [{ name: "open", size: 32, fuzzy_match_percent: 50 }, { name: "exact", size: 16, fuzzy_match_percent: 100 }], sections: [{ name: ".data", size: 8, fuzzy_match_percent: 50 }] });
      writeJson(resolve(root, "build/GALE01/report.json"), { units: [unit("melee", "src/melee.c")] });
      writeJson(resolve(root, "build/GMSJ01/report.json"), { units: [unit("sms", "src/GC2D/a.cpp"), unit("vendor", "src/JSystem/a.cpp")] });
      const options = { reportPath: "build/GMSJ01/report.json", targetExcludePrefixes: ["src/JSystem"] };
      expect(loadBoardSnapshot(root, options).candidates.map(c => [c.unit, c.symbol])).toEqual([["sms", "open"], ["sms", ".data"]]);
      expect(loadExactTargetKeys(root, options).has("sms::exact")).toBe(true);
      expect(loadExactTargetKeys(root, options).has("melee::exact")).toBe(false);
      expect(loadBoardSnapshot(root).candidates[0]?.unit).toBe("melee");
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
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

  test("uses match percent for section discovery and excludes scores at or above exact", () => {
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
              { name: ".bss", size: 12, match_percent: EXACT_SCORE, fuzzy_match_percent: 0 },
              { name: ".data", size: 12, match_percent: 100, fuzzy_match_percent: 0 },
              { name: ".sdata2", size: 12, match_percent: EXACT_SCORE - 0.000001, fuzzy_match_percent: 100 },
            ],
          },
        ],
      });

      expect(loadBoardSnapshot(root).candidates).toEqual([
        {
          unit: "melee/data/exact.c",
          sourcePath: "src/melee/data/exact.c",
          symbol: ".sdata2",
          size: 12,
          fuzzy: EXACT_SCORE - 0.000001,
          kind: "section",
        },
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("uses the harness report as source of truth when objdiff is missing", () => {
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

  test("never borrows an upstream report when the harness report is absent", () => {
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

      expect(() => loadBoardSnapshot(cycleCurrentRoot)).toThrow("Missing board snapshot inputs");
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

describe("unverified_match targets", () => {
  const report = {
    units: [{
      name: "sms/a",
      metadata: { source_path: "src/a.cpp" },
      functions: [
        { name: "open", size: 32, fuzzy_match_percent: 50 },
        { name: "exact", size: 16, fuzzy_match_percent: 100 },
        { name: "unverified", size: 24, fuzzy_match_percent: 100 },
        { name: "frame", size: 20, fuzzy_match_percent: 99.5 },
      ],
      sections: [],
    }],
    // objdiff serializes byte counts as strings.
    measures: { total_functions: 4, matched_functions: 2, matched_functions_percent: 50, total_code: "92", matched_code: "40", matched_code_percent: 43.47826, fuzzy_match_percent: 80 },
  };
  const options = { reportPath: "build/GMSJ01/report.json" };

  test("a 100% but unverified function is a flagged candidate ahead of untouched ones, never exact, never stack-only done", () => {
    const root = mkdtempSync(join(tmpdir(), "board-unverified-"));
    try {
      writeJson(resolve(root, "build/GMSJ01/report.json"), report);
      const unverified = new Set(["sms/a::unverified", "sms/a::frame"]);
      const stackOnly = new Map([["sms/a::frame", 99.5]]);
      const snapshot = loadBoardSnapshot(root, { ...options, unverified, stackOnly });
      expect(snapshot.candidates.map((c) => [c.symbol, c.verification ?? null])).toEqual([
        ["unverified", "unverified_match"], ["frame", "unverified_match"], ["open", null],
      ]);
      expect(loadExactTargetKeys(root, { ...options, unverified }).has("sms/a::unverified")).toBe(false);
      expect(loadExactTargetKeys(root, { ...options, unverified }).has("sms/a::exact")).toBe(true);
      expect(loadStackOnlyTargetKeys(root, { ...options, stackOnly, unverified }).has("sms/a::frame")).toBe(false);
      // Not done: the exact unverified function leaves the matched counts, and both unverified functions'
      // fuzzy credit ((24*100 + 20*99.5) / 92) leaves the score; the separate "100% but unverified" figure reports it.
      expect(snapshot.measures).toMatchObject({
        matched_functions: 1, matched_functions_percent: 25, matched_code: 16, matched_code_percent: 17.3913, fuzzy_match_percent: 32.28261,
        unverified_functions: 1, unverified_code: 24, unverified_code_percent: 26.08696, unverified_targets: 2,
      });
      // Without the index (Melee, or no rows) nothing changes.
      expect(loadBoardSnapshot(root, options).measures).toEqual(report.measures);
      expect(loadBoardSnapshot(root, options).candidates.map((c) => c.symbol)).toEqual(["open", "frame"]);
      expect(loadBoardSnapshot(root, options).candidates.some((c) => "verification" in c)).toBe(false);
      expect(loadExactTargetKeys(root, options).has("sms/a::unverified")).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("the code graph fallback counts an exact unverified function as unmatched and keeps it a candidate", () => {
    const root = mkdtempSync(join(tmpdir(), "board-unverified-codegraph-"));
    try {
      const functionsIndex = resolve(root, "functions.jsonl");
      writeFileSync(functionsIndex, [
        { unit: "sms/a", sourcePath: "src/a.cpp", symbol: "exact", size: 60, fuzzy: 100 },
        { unit: "sms/a", sourcePath: "src/a.cpp", symbol: "unverified", size: 40, fuzzy: 100 },
      ].map((row) => JSON.stringify(row)).join("\n"));
      const snapshot = loadBoardSnapshot(resolve(root, "repo"), { codeGraphFunctionsIndexPath: functionsIndex, unverified: new Set(["sms/a::unverified"]) });
      expect(snapshot.candidates.map((c) => [c.symbol, c.verification])).toEqual([["unverified", "unverified_match"]]);
      expect(snapshot.measures).toMatchObject({ matched_functions_percent: 50, matched_code_percent: 60, unmatched_targets: 1, unverified_functions: 1, unverified_code: 40, unverified_code_percent: 40 });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("an unverified target whose compiler delta is a single change ranks first among the unverified", () => {
    const root = mkdtempSync(join(tmpdir(), "board-unverified-single-"));
    try {
      writeJson(resolve(root, "build/GMSJ01/report.json"), report);
      const unverified = new Set(["sms/a::unverified", "sms/a::frame"]);
      const order = (singleChange?: ReadonlySet<string>) => loadBoardSnapshot(root, { ...options, unverified, ...(singleChange ? { unverifiedSingleChange: singleChange } : {}) })
        .candidates.map((c) => c.symbol);
      expect(order()).toEqual(["unverified", "frame", "open"]);
      expect(order(new Set(["sms/a::frame"]))).toEqual(["frame", "unverified", "open"]);
      // A key that is not unverified changes nothing.
      expect(order(new Set(["sms/a::open"]))).toEqual(["unverified", "frame", "open"]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("module-prefixed report units (SMS)", () => {
  // objdiff names the unit with its module; steering rows (and so the index) without it.
  const report = {
    units: [{
      name: "mario/Animal/AnimalBase",
      metadata: { source_path: "src/Animal/AnimalBase.cpp" },
      functions: [
        { name: "open", size: 32, fuzzy_match_percent: 50 },
        { name: "held", size: 24, fuzzy_match_percent: 100 },
        { name: "single", size: 20, fuzzy_match_percent: 90 },
      ],
      sections: [],
    }],
    measures: { total_functions: 3, matched_functions: 1, total_code: "76", matched_code: "24", matched_code_percent: 31.57895 },
  };
  const options = { reportPath: "build/GMSJ01/report.json" };
  const shortKeys = () => new Set(["Animal/AnimalBase::held", "Animal/AnimalBase::single"]);

  test("a tagged short-unit index keeps the held 100% repair target, withholds its credit and ranks the single change first", () => {
    const root = mkdtempSync(join(tmpdir(), "board-prefixed-"));
    try {
      writeJson(resolve(root, "build/GMSJ01/report.json"), report);
      const unverified = withUnitKeys(shortKeys(), "sms");
      expect(candidateFromReportFunction({ unitName: "mario/Animal/AnimalBase", sourcePath: "", fn: report.units[0]!.functions[1]!, unverified }))
        .toMatchObject({ symbol: "held", verification: "unverified_match" });
      const snapshot = loadBoardSnapshot(root, { ...options, unverified });
      expect(snapshot.candidates.map((c) => [c.symbol, c.verification ?? null])).toEqual([["held", "unverified_match"], ["single", "unverified_match"], ["open", null]]);
      expect(snapshot.measures).toMatchObject({ matched_functions: 0, matched_code: 0, unverified_functions: 1, unverified_targets: 2 });
      expect(loadExactTargetKeys(root, { ...options, unverified }).has("mario/Animal/AnimalBase::held")).toBe(false);
      // The single-change keys are steering keys too: an untagged set borrows the index's normalisation.
      const order = loadBoardSnapshot(root, { ...options, unverified, unverifiedSingleChange: new Set(["Animal/AnimalBase::single"]) });
      expect(order.candidates.map((c) => c.symbol)).toEqual(["single", "held", "open"]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("Melee (no module prefixes): the same short keys never match a longer unit", () => {
    const root = mkdtempSync(join(tmpdir(), "board-prefixed-melee-"));
    try {
      writeJson(resolve(root, "build/GMSJ01/report.json"), report);
      const unverified = withUnitKeys(shortKeys(), "melee");
      expect(loadBoardSnapshot(root, { ...options, unverified }).candidates.map((c) => c.symbol)).toEqual(["open", "single"]);
      expect(loadExactTargetKeys(root, { ...options, unverified }).has("mario/Animal/AnimalBase::held")).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
