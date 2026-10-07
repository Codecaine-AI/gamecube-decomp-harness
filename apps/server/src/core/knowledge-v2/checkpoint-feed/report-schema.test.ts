import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

import { improvingReport, metrics, REAL_REPORT_PATH, SYMBOL, UNIT } from "./__fixtures__/feed-fixture.js";
import { validateReportChanges, type ReportUnit, type ValidatedReportChanges } from "./report-schema.js";

function validated(value: unknown): ValidatedReportChanges {
  const result = validateReportChanges(value);
  if (!result.ok) throw new Error(`expected a valid report, got: ${result.issues.join("; ")}`);
  return result.report;
}

function issuesOf(value: unknown): string[] {
  const result = validateReportChanges(value);
  expect(result.ok).toBe(false);
  return result.ok ? [] : result.issues;
}

/** The fixture report with its single unit row edited in place. */
function reportWithUnit(edit: (unit: Record<string, unknown>) => void): Record<string, unknown> {
  const report = improvingReport();
  edit((report.units as Record<string, unknown>[])[0]!);
  return report;
}

function functionRow(unit: Record<string, unknown>): Record<string, unknown> {
  return (unit.functions as Record<string, unknown>[])[0]!;
}

function sectionRow(unit: Record<string, unknown>): Record<string, unknown> {
  return (unit.sections as Record<string, unknown>[])[0]!;
}

describe("validateReportChanges: the committed Objdiff report", () => {
  test("validates with string byte counts, keeping bytes as bigint and percents as numbers", () => {
    const raw = JSON.parse(readFileSync(REAL_REPORT_PATH, "utf8")) as { units: Array<{ name: string; from: Record<string, unknown> }> };
    const rawUnit = raw.units.find((unit) => unit.name === "mario/System/MarNameRefGen")!;
    // Real Objdiff output carries byte counts as strings; that is what this report must accept.
    expect(rawUnit.from.matched_code).toBe("12344");

    const report = validated(raw);
    expect(report.units).toHaveLength(raw.units.length);
    const unit = report.units.find((entry) => entry.name === "mario/System/MarNameRefGen")!;
    expect(unit.from!.bytes.matched_code).toBe(12344n);
    expect(unit.to!.bytes.matched_code).toBe(13108n);
    expect(unit.from!.bytes.matched_data).toBe(408n);
    expect(unit.from!.percents.fuzzy_match_percent).toBe(92.3863);
    expect(typeof unit.to!.percents.matched_code_percent).toBe("number");
    expect(unit.sections.map((section) => section.name)).toEqual([".bss", ".ctors", ".text"]);
    const bss = unit.sections[0]!;
    expect(bss.from).toEqual({ percents: {}, bytes: { size: 184n } });
    expect(bss.to).toEqual({ percents: { fuzzy_match_percent: 100 }, bytes: { size: 184n } });
    expect(unit.functions.map((fn) => fn.name)).toEqual(["__sinit_MarNameRefGen_cpp"]);
  });
});

describe("validateReportChanges: evidence-invalid reports name the offending path", () => {
  const cases: Array<{ name: string; report: () => unknown; path: string }> = [
    { name: "an empty object (no units)", report: () => ({}), path: "report.units is missing" },
    { name: "null", report: () => null, path: "report is null" },
    { name: "units as an object", report: () => ({ units: { [UNIT]: {} } }), path: "report.units is an object" },
    { name: "units as a string", report: () => ({ units: UNIT }), path: `report.units is "${UNIT}"` },
    { name: "an empty units array", report: () => ({ units: [] }), path: "report.units is empty" },
    {
      name: "a unit row without a name",
      report: () => reportWithUnit((unit) => { delete unit.name; }),
      path: "units[0].name is missing",
    },
    {
      name: "a function row without a name",
      report: () => reportWithUnit((unit) => { delete functionRow(unit).name; }),
      path: "units[0].functions[0].name is missing",
    },
    {
      name: "a section that is not an object",
      report: () => reportWithUnit((unit) => { unit.sections = [".text"]; }),
      path: "units[0].sections[0] is \".text\", not an object",
    },
    {
      name: "a non-numeric percentage",
      report: () => reportWithUnit((unit) => { (functionRow(unit).to as Record<string, unknown>).fuzzy_match_percent = "abc"; }),
      path: "units[0].functions[0].to.fuzzy_match_percent",
    },
    {
      name: "a percentage above 100",
      report: () => reportWithUnit((unit) => { (functionRow(unit).to as Record<string, unknown>).fuzzy_match_percent = 101; }),
      path: "units[0].functions[0].to.fuzzy_match_percent",
    },
    {
      name: "a negative percentage",
      report: () => reportWithUnit((unit) => { (unit.from as Record<string, unknown>).matched_code_percent = -1; }),
      path: "units[0].from.matched_code_percent",
    },
    {
      name: "a fractional decimal string as matched_code",
      report: () => reportWithUnit((unit) => { (unit.from as Record<string, unknown>).matched_code = "12.5"; }),
      path: "units[0].from.matched_code",
    },
    {
      name: "a negative decimal string as size",
      report: () => reportWithUnit((unit) => { (sectionRow(unit).to as Record<string, unknown>).size = "-4"; }),
      path: "units[0].sections[0].to.size",
    },
    {
      name: "a fractional JSON number as a byte count",
      report: () => reportWithUnit((unit) => { (unit.to as Record<string, unknown>).matched_data = 1.5; }),
      path: "units[0].to.matched_data",
    },
    {
      name: "a negative JSON number as a byte count",
      report: () => reportWithUnit((unit) => { (unit.to as Record<string, unknown>).matched_data = -3; }),
      path: "units[0].to.matched_data",
    },
    {
      name: "a JSON number byte count beyond the safe-integer range",
      report: () => JSON.parse(JSON.stringify(reportWithUnit((unit) => { (unit.to as Record<string, unknown>).matched_code = 2 ** 60; }))),
      path: "units[0].to.matched_code",
    },
    {
      name: "functions present but not an array",
      report: () => reportWithUnit((unit) => { unit.functions = { [SYMBOL]: metrics(100, 64, 64) }; }),
      path: "units[0].functions is an object, not an array",
    },
    {
      name: "a null `to` side",
      report: () => reportWithUnit((unit) => { functionRow(unit).to = null; }),
      path: "units[0].functions[0].to is null, not an object",
    },
    {
      name: "a root-level `from` with a bad field",
      report: () => {
        const report = improvingReport();
        (report.from as Record<string, unknown>).matched_code = "1e3";
        return report;
      },
      path: "report.from.matched_code",
    },
  ];

  for (const { name, report, path } of cases) {
    test(name, () => {
      expect(issuesOf(report())).toEqual([expect.stringContaining(path)]);
    });
  }
});

describe("validateReportChanges: accepted variants", () => {
  function onlyUnit(report: unknown): ReportUnit {
    const units = validated(report).units;
    expect(units).toHaveLength(1);
    return units[0]!;
  }

  test("a percentage given as a numeric string", () => {
    const unit = onlyUnit(reportWithUnit((unit) => { (functionRow(unit).to as Record<string, unknown>).fuzzy_match_percent = "99.5"; }));
    expect(unit.functions[0]!.to!.percents.fuzzy_match_percent).toBe(99.5);
  });

  test("byte counts as safe-integer JSON numbers", () => {
    const unit = onlyUnit(reportWithUnit((unit) => {
      unit.from = { matched_code: 200, matched_data: 0, size: 400 };
      unit.to = { matched_code: 240, matched_data: 0, size: 400 };
    }));
    expect(unit.from!.bytes).toEqual({ matched_code: 200n, matched_data: 0n, size: 400n });
    expect(unit.to!.bytes.matched_code).toBe(240n);
  });

  test("a canonical decimal string beyond 2^53 is kept exactly as a bigint", () => {
    const unit = onlyUnit(reportWithUnit((unit) => { (unit.to as Record<string, unknown>).matched_code = "9007199254740993"; }));
    expect(unit.to!.bytes.matched_code).toBe(9007199254740993n);
    expect(unit.to!.bytes.matched_code! - BigInt(Number.MAX_SAFE_INTEGER)).toBe(2n);
  });

  test("unknown fields are ignored", () => {
    const unit = onlyUnit(reportWithUnit((unit) => {
      (unit.from as Record<string, unknown>).total_code = "abc";
      (unit.to as Record<string, unknown>).total_functions = "many";
      unit.metadata = { complete: false, source_path: "src/melee/lb/lbsnap.c", progress_categories: ["game"] };
      sectionRow(unit).metadata = { virtual_address: "2148468204" };
    }));
    expect(unit.from).toEqual({ percents: { fuzzy_match_percent: 80, matched_code_percent: 50 }, bytes: { matched_code: 200n, size: 400n } });
  });

  test("rows missing `from` or `to` give null sides", () => {
    const unit = onlyUnit(reportWithUnit((unit) => {
      delete functionRow(unit).from;
      delete sectionRow(unit).to;
    }));
    expect(unit.functions[0]).toEqual({ name: SYMBOL, from: null, to: { percents: { fuzzy_match_percent: 100 }, bytes: { size: 64n } } });
    expect(unit.sections[0]).toEqual({ name: ".text", from: { percents: { fuzzy_match_percent: 80 }, bytes: { size: 400n } }, to: null });
  });
});
