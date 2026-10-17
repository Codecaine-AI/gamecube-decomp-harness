import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "bun:test";
import { buildRegressionReport } from "@server/core/validation/objdiff/report.js";
import { UNKNOWN_COMPLETION_INDEX } from "./candidates.js";
import { withUnitKeys } from "@server/core/harness-runtime/run-state/unit-key.js";
import {
  completionIndexAt,
  withholdUnverifiedMeasures,
  withholdUnverifiedRegression,
  withholdUnverifiedReport,
  withholdUnverifiedStoredMeasures,
} from "./unverified-measures.js";

const cleanup: string[] = [];
afterEach(() => {
  for (const path of cleanup.splice(0)) rmSync(path, { recursive: true, force: true });
});

function writeReport(report: unknown): string {
  const dir = mkdtempSync(join(tmpdir(), "unverified-measures-"));
  cleanup.push(dir);
  const path = join(dir, "report.json");
  writeFileSync(path, JSON.stringify(report));
  return path;
}

/** Unit `a`: `done` (16 bytes) and `f` (24 bytes), both 100%; unit `b`: `g` (60 bytes) at 50%. */
function report(measures: Record<string, unknown>, unitA: Record<string, unknown> = {}) {
  return {
    measures,
    units: [
      {
        name: "a",
        functions: [{ name: "done", size: "16", fuzzy_match_percent: 100 }, { name: "f", size: "24", fuzzy_match_percent: 100 }],
        ...unitA,
      },
      { name: "b", functions: [{ name: "g", size: "60", fuzzy_match_percent: 50 }] },
    ],
  };
}

const full = { total_code: "100", matched_code: "40", matched_code_percent: 40, fuzzy_match_percent: 70, total_functions: 3, matched_functions: 2, matched_functions_percent: 66.66667 };
const f = new Set(["a::f"]);

describe("withholdUnverifiedMeasures", () => {
  test.each([
    {
      name: "percent-only measures without a denominator are unknown, never the raw credit",
      measures: { matched_code_percent: 40, matched_functions_percent: 66.66667, fuzzy_match_percent: 70 },
      expected: { matched_code_percent: null, matched_functions_percent: null, fuzzy_match_percent: null, unverified_functions: 1, unverified_code: 24, unverified_code_percent: null },
    },
    {
      name: "a percent with its total but no count loses the withheld share",
      measures: { total_code: "100", matched_code_percent: 40, fuzzy_match_percent: 70 },
      expected: { matched_code_percent: 16, fuzzy_match_percent: 46, unverified_code_percent: 24 },
    },
    {
      name: "an index outside the report's scope withholds nothing but still marks the figure",
      measures: full,
      unverified: new Set(["elsewhere::h"]),
      expected: { ...full, unverified_functions: 0, unverified_code: 0, unverified_targets: 0 },
    },
  ])("$name", ({ measures, unverified, expected }) => {
    expect(withholdUnverifiedMeasures(report(measures), unverified ?? f)).toMatchObject(expected);
  });

  test("a complete unit holding a not-yet-exact unverified function is not complete, in the game and the unit", () => {
    const unitMeasures = { total_code: "40", complete_code: "40", complete_units: 1, total_units: 1 };
    const raw = report(
      { ...full, total_units: 2, complete_units: 1, complete_code: "40", complete_code_percent: 40 },
      { functions: [{ name: "done", size: "16", fuzzy_match_percent: 100 }, { name: "f", size: "24", fuzzy_match_percent: 99.5 }], measures: unitMeasures },
    );
    const withheld = withholdUnverifiedReport(raw, f);
    expect(withheld.measures).toMatchObject({ complete_units: 0, complete_code: 0, complete_code_percent: 0, unverified_complete_units: 1, matched_code: "40", unverified_functions: 0, unverified_targets: 1 });
    expect(withheld.units.get("a")).toMatchObject({ complete_units: 0, complete_code: 0 });
  });

  test("a complete unit with unknown bytes leaves the game's complete code unknown", () => {
    const raw = report(
      { ...full, complete_units: 1, complete_code_percent: 40 },
      { metadata: { complete: true } },
    );
    expect(withholdUnverifiedMeasures(raw, f)).toMatchObject({ complete_units: 0, complete_code_percent: null });
  });

  test("without an index or with an empty one the report's measures come back unmarked", () => {
    expect(withholdUnverifiedMeasures(report(full), undefined)).toEqual(full);
    expect(withholdUnverifiedMeasures(report(full), new Set())).toEqual(full);
  });
});

describe("withholdUnverifiedStoredMeasures", () => {
  test("re-derives from the raw archived report: a newly unverified function is withheld once, an adjusted figure never twice", () => {
    const path = writeReport(report(full));
    // Saved when nothing in the report was unverified (a row elsewhere was active).
    const savedBefore = withholdUnverifiedMeasures(report(full), new Set(["elsewhere::h"]));
    expect(withholdUnverifiedStoredMeasures(savedBefore, path, f)).toMatchObject({ matched_code: 16, matched_functions: 1, unverified_functions: 1 });
    // Saved already withholding `f`: re-deriving under the same rows gives the same figure.
    const savedWithheld = withholdUnverifiedMeasures(report(full), f);
    expect(withholdUnverifiedStoredMeasures(savedWithheld, path, f)).toMatchObject({ matched_code: 16, matched_code_percent: 16, matched_functions: 1 });
  });

  test("once every row is cleared the raw report is the figure, with no stale withheld count", () => {
    const path = writeReport(report(full));
    const stored = withholdUnverifiedStoredMeasures(withholdUnverifiedMeasures(report(full), f), path, new Map());
    expect(stored).toMatchObject({ matched_code: "40", matched_code_percent: 40 });
    expect(Object.keys(stored).filter((key) => key.startsWith("unverified_"))).toEqual([]);
  });

  test("a missing report with active rows leaves completion unknown rather than raw", () => {
    const stored = withholdUnverifiedStoredMeasures({ ...full, total_units: 2 }, join(tmpdir(), "missing-report.json"), f);
    expect(stored).toMatchObject({ matched_code_percent: null, matched_functions: null, fuzzy_match_percent: null, total_units: 2, unverified_unbounded: true });
    // Melee: no index, stored figures as they are.
    expect(withholdUnverifiedStoredMeasures(full, null, undefined)).toBe(full);
  });
});

describe("withholdUnverifiedRegression", () => {
  const changes = (from: number, to: number) => ({
    // `f` (24 bytes) is the only exact function before.
    from: { total_code: "100", matched_code: "24", matched_code_percent: 24 },
    to: { total_code: "100", matched_code: "40", matched_code_percent: 40 },
    units: [{
      name: "a",
      functions: [
        { name: "done", from: { fuzzy_match_percent: 50, size: "16" }, to: { fuzzy_match_percent: 100, size: "16" } },
        { name: "f", from: { fuzzy_match_percent: from, size: "24" }, to: { fuzzy_match_percent: to, size: "24" } },
      ],
    }],
  });

  test("an unverified function exact on both sides is no transition, yet `to` withholds it and nothing renders it as a match", () => {
    const raw = buildRegressionReport(changes(100, 100), "Epoch checkpoint", 50);
    const view = withholdUnverifiedRegression(raw, f, { toMeasures: withholdUnverifiedMeasures(report(full), f) });
    expect(view.newMatches.map((entry) => entry.itemName)).toEqual(["done"]);
    expect(view.summary).toMatchObject({ matchedCodePercentTo: 16, matchedCodeBytesTo: 16, matchedCodeBytesDelta: 16, matchedCodeBytesFrom: 0 });
    expect(view.markdown).toContain("**Matched code**: 16.00%");
    expect(view.markdown).toContain("**100% but unverified**: 1 function(s), 24 bytes");
  });

  test.each([
    { name: "null", toMeasures: { total_code: "100", matched_code: null, matched_code_percent: null } },
    { name: "missing", toMeasures: { total_code: "100" } },
  ])("explicit $name adjusted totals stay unknown when an unverified function is exact on both sides", ({ toMeasures }) => {
    const raw = buildRegressionReport(changes(100, 100), "Epoch checkpoint", 50);
    const view = withholdUnverifiedRegression(raw, f, { toMeasures });
    expect(view.newMatches.map((entry) => entry.itemName)).toEqual(["done"]);
    expect(Number.isNaN(view.summary.matchedCodeBytesFrom)).toBe(true);
    expect(Number.isNaN(view.summary.matchedCodeBytesTo)).toBe(true);
    expect(JSON.parse(JSON.stringify(view.summary))).toMatchObject({
      matchedCodeBytesFrom: null,
      matchedCodeBytesTo: null,
      matchedCodePercentFrom: null,
      matchedCodePercentTo: null,
      // The independently bounded transition is the verified `done`, not held `f`.
      matchedCodeBytesDelta: 16,
      matchedCodePercentDelta: 16,
    });
  });

  test("an unverified function leaving 100% was never done: not a broken match, and its bytes are not lost progress", () => {
    const raw = buildRegressionReport(changes(100, 80), "Epoch checkpoint", 50);
    const view = withholdUnverifiedRegression(raw, f);
    expect(view.brokenMatches).toEqual([]);
    expect(view.fuzzyRegressions.map((entry) => [entry.itemName, (entry as { verification?: string }).verification])).toEqual([["f", "unverified_match"]]);
    expect(view.summary.matchedCodeBytesDelta).toBe(raw.summary.matchedCodeBytesDelta + 24);
    expect(view.promotion.evidence.brokenMatches).toBe(0);
  });

  test("Melee (no index) keeps the report byte for byte", () => {
    const raw = buildRegressionReport(changes(50, 100), "Epoch checkpoint", 50);
    expect(withholdUnverifiedRegression(raw, undefined)).toBe(raw);
    expect(withholdUnverifiedRegression(raw, new Set())).toBe(raw);
  });
});

describe("unknown completion index", () => {
  const unknown = {
    fuzzy_match_percent: null,
    matched_code: null,
    matched_code_percent: null,
    matched_functions: null,
    matched_functions_percent: null,
    unverified_unbounded: true,
  };

  test("the report's game and unit measures are unknown, never the raw credit", () => {
    const unitMeasures = { total_code: "40", matched_code: "40", complete_units: 1, total_units: 1 };
    const withheld = withholdUnverifiedReport(report(full, { measures: unitMeasures }), UNKNOWN_COMPLETION_INDEX);
    expect(withheld.measures).toMatchObject({ ...unknown, total_code: "100", total_functions: 3 });
    expect(withheld.units.get("a")).toEqual({ total_code: "40", total_units: 1, matched_code: null, complete_units: null, unverified_unbounded: true });
    expect(withheld.units.has("b")).toBe(false);
  });

  test("stored measures are unknown even with a readable report, and stale withheld figures are dropped", () => {
    const path = writeReport(report(full));
    const saved = withholdUnverifiedMeasures(report(full), f);
    const stored = withholdUnverifiedStoredMeasures(saved, path, UNKNOWN_COMPLETION_INDEX);
    expect(stored).toMatchObject({ ...unknown, total_code: "100", unverified_functions: null, unverified_code: null });
    expect(withholdUnverifiedStoredMeasures(full, null, UNKNOWN_COMPLETION_INDEX)).toMatchObject(unknown);
  });
});

describe("completionIndexAt", () => {
  test("a plain index applies to every revision, a revision-aware source is asked for the revision, no source is raw", () => {
    expect(completionIndexAt(f, "abc")).toBe(f);
    const asked: (string | null | undefined)[] = [];
    const held = new Set(["a::held"]);
    const source = { unknown: false, at: (rev: string | null | undefined) => (asked.push(rev), held) };
    expect(completionIndexAt(source, "abc")).toBe(held);
    expect(completionIndexAt(source, null)).toBe(held);
    expect(asked).toEqual(["abc", null]);
    expect(completionIndexAt(undefined, "abc")).toBeUndefined();
  });
});

describe("module-prefixed report units (SMS)", () => {
  // objdiff names the unit `mario/a`; the steering hold names it `a`.
  const prefixed = () => {
    const raw = report({ ...full, total_units: 2, complete_units: 1, complete_code: "40", complete_code_percent: 40 }, { measures: { total_code: "40", complete_code: "40", complete_units: 1, total_units: 1 } });
    raw.units[0]!.name = "mario/a";
    return raw;
  };

  test("a held function loses its matched, fuzzy and complete-unit credit under a tagged short-unit index", () => {
    const withheld = withholdUnverifiedReport(prefixed(), withUnitKeys(new Set(["a::f"]), "sms"));
    expect(withheld.measures).toMatchObject({ matched_code: 16, matched_functions: 1, fuzzy_match_percent: 46, complete_units: 0, unverified_functions: 1, unverified_targets: 1 });
    expect(withheld.units.get("mario/a")).toMatchObject({ complete_units: 0, unverified_functions: 1 });

    const changes = {
      from: { total_code: "100", matched_code: "0", matched_code_percent: 0 },
      to: { total_code: "100", matched_code: "24", matched_code_percent: 24 },
      units: [{ name: "mario/a", functions: [{ name: "f", from: { fuzzy_match_percent: 50, size: "24" }, to: { fuzzy_match_percent: 100, size: "24" } }] }],
    };
    const view = withholdUnverifiedRegression(buildRegressionReport(changes, "Epoch", 50), withUnitKeys(new Set(["a::f"]), "sms"));
    expect(view.newMatches).toEqual([]);
    expect(view.summary.matchedCodeBytesDelta).toBe(0);
  });

  test("Melee (no module prefixes) withholds nothing for a differently spelled unit", () => {
    expect(withholdUnverifiedReport(prefixed(), withUnitKeys(new Set(["a::f"]), "melee")).measures).toMatchObject({ matched_code: "40", unverified_targets: 0 });
  });
});
