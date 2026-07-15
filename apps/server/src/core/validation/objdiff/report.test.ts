import { describe, expect, test } from "bun:test";
import { buildRegressionReport } from "./report.js";

interface FnRowSpec {
  name: string;
  from?: number;
  to?: number;
  fromSize?: number;
  toSize?: number;
  address?: string;
}

function fnRow(spec: FnRowSpec): Record<string, unknown> {
  const row: Record<string, unknown> = { name: spec.name };
  if (spec.from !== undefined) {
    row.from = { fuzzy_match_percent: spec.from, ...(spec.fromSize !== undefined ? { size: String(spec.fromSize) } : {}) };
  }
  if (spec.to !== undefined) {
    row.to = { fuzzy_match_percent: spec.to, ...(spec.toSize !== undefined ? { size: String(spec.toSize) } : {}) };
  }
  if (spec.address !== undefined) {
    row.metadata = { virtual_address: spec.address };
  }
  return row;
}

function changesReport(functions: Record<string, unknown>[]): Record<string, unknown> {
  return {
    from: { fuzzy_match_percent: 50, matched_code_percent: 50, matched_code: 1000, matched_data_percent: 50, matched_data: 1000 },
    to: { fuzzy_match_percent: 50, matched_code_percent: 50, matched_code: 1000, matched_data_percent: 50, matched_data: 1000 },
    units: [
      {
        name: "main/melee/cm/camera",
        metadata: { source_path: "src/melee/cm/camera.c" },
        functions,
      },
    ],
  };
}

function build(functions: Record<string, unknown>[]) {
  return buildRegressionReport(changesReport(functions), "test", 0);
}

describe("buildRegressionReport rename pairing", () => {
  test("pure rename at 100% pairs by address and is not counted as a regression", () => {
    const report = build([
      fnRow({ name: "fn_8002F488", from: 100, fromSize: 76, address: "2147677320" }),
      fnRow({ name: "Camera_SetBounds", to: 100, toSize: 76, address: "2147677320" }),
    ]);
    expect(report.brokenMatches).toEqual([]);
    expect(report.fuzzyRegressions).toEqual([]);
    expect(report.newMatches).toEqual([]);
    expect(report.regressions).toEqual([]);
    expect(report.renames).toEqual([
      {
        unitName: "main/melee/cm/camera",
        fromName: "fn_8002F488",
        toName: "Camera_SetBounds",
        address: "2147677320",
        size: 76,
        fromPercent: 100,
        toPercent: 100,
        pairedBy: "address",
      },
    ]);
    expect(report.markdown).toContain("1 renamed functions (paired, not regressions)");
    expect(report.markdown).toContain("`fn_8002F488` | `Camera_SetBounds`");
  });

  test("rename with a percent drop counts the drop once, under the new name", () => {
    const report = build([
      fnRow({ name: "fn_8002F488", from: 100, fromSize: 76, address: "2147677320" }),
      fnRow({ name: "Camera_SetBounds", to: 98.5, toSize: 76, address: "2147677320" }),
    ]);
    expect(report.brokenMatches).toHaveLength(1);
    expect(report.brokenMatches[0]).toMatchObject({
      itemName: "Camera_SetBounds",
      fromPercent: 100,
      toPercent: 98.5,
    });
    expect(report.fuzzyRegressions).toEqual([]);
    expect(report.regressions).toHaveLength(1);
    expect(report.regressions[0]).toMatchObject({ name: "Camera_SetBounds", from: 100, to: 98.5 });
    expect(report.renames).toHaveLength(1);
  });

  test("a genuinely deleted function still counts as a broken match", () => {
    const report = build([
      fnRow({ name: "Camera_Gone", from: 100, fromSize: 64, address: "2147677000" }),
      fnRow({ name: "Camera_New", to: 100, toSize: 128, address: "2147678000" }),
    ]);
    expect(report.brokenMatches).toHaveLength(1);
    expect(report.brokenMatches[0]).toMatchObject({ itemName: "Camera_Gone", fromPercent: 100, toPercent: 0 });
    expect(report.newMatches).toHaveLength(1);
    expect(report.newMatches[0]).toMatchObject({ itemName: "Camera_New" });
    expect(report.renames).toEqual([]);
  });

  test("address pairing wins even when sizes differ", () => {
    const report = build([
      fnRow({ name: "fn_old", from: 100, fromSize: 76, address: "2147677320" }),
      fnRow({ name: "fn_new", to: 100, toSize: 80, address: "2147677320" }),
    ]);
    expect(report.brokenMatches).toEqual([]);
    expect(report.fuzzyRegressions).toEqual([]);
    expect(report.renames).toHaveLength(1);
    expect(report.renames[0]).toMatchObject({ fromName: "fn_old", toName: "fn_new", pairedBy: "address" });
  });

  test("fallback pairing without addresses matches by size and non-regressing percent", () => {
    const report = build([
      fnRow({ name: "fn_old", from: 87.5, fromSize: 120 }),
      fnRow({ name: "Camera_Renamed", to: 91.25, toSize: 120 }),
    ]);
    expect(report.fuzzyRegressions).toEqual([]);
    expect(report.brokenMatches).toEqual([]);
    expect(report.renames).toHaveLength(1);
    expect(report.renames[0]).toMatchObject({ fromName: "fn_old", toName: "Camera_Renamed", pairedBy: "size" });
    expect(report.improvements).toHaveLength(1);
    expect(report.improvements[0]).toMatchObject({ itemName: "Camera_Renamed", fromPercent: 87.5, toPercent: 91.25 });
  });

  test("fallback pairing refuses a percent drop, so the removal still counts", () => {
    const report = build([
      fnRow({ name: "fn_old", from: 100, fromSize: 120 }),
      fnRow({ name: "Camera_Renamed", to: 95, toSize: 120 }),
    ]);
    expect(report.renames).toEqual([]);
    expect(report.brokenMatches).toHaveLength(1);
    expect(report.brokenMatches[0]).toMatchObject({ itemName: "fn_old", fromPercent: 100, toPercent: 0 });
  });

  test("ambiguous fallback candidates pair greedily on identical size and percent", () => {
    const report = build([
      fnRow({ name: "fn_a", from: 100, fromSize: 76 }),
      fnRow({ name: "fn_b", from: 90, fromSize: 76 }),
      fnRow({ name: "Camera_First", to: 100, toSize: 76 }),
      fnRow({ name: "Camera_Second", to: 100, toSize: 76 }),
    ]);
    // fn_a is ambiguous (two 100% candidates) and takes the first identical
    // size+percent match; fn_b then has a single non-regressing candidate left.
    expect(report.renames).toHaveLength(2);
    expect(report.renames[0]).toMatchObject({ fromName: "fn_a", toName: "Camera_First", pairedBy: "size" });
    expect(report.renames[1]).toMatchObject({ fromName: "fn_b", toName: "Camera_Second", pairedBy: "size" });
    expect(report.brokenMatches).toEqual([]);
    expect(report.fuzzyRegressions).toEqual([]);
    expect(report.newMatches).toHaveLength(1);
    expect(report.newMatches[0]).toMatchObject({ itemName: "Camera_Second", fromPercent: 90, toPercent: 100 });
  });

  test("unresolvable ambiguity fails closed and keeps removals as regressions", () => {
    const report = build([
      fnRow({ name: "fn_a", from: 90, fromSize: 76 }),
      fnRow({ name: "fn_b", from: 90, fromSize: 76 }),
      fnRow({ name: "Camera_First", to: 100, toSize: 76 }),
      fnRow({ name: "Camera_Second", to: 100, toSize: 76 }),
      fnRow({ name: "Camera_Third", to: 100, toSize: 76 }),
    ]);
    // Multiple candidates and none at the identical 90% percent: no pairing.
    expect(report.renames).toEqual([]);
    expect(report.fuzzyRegressions).toHaveLength(2);
    expect(report.newMatches).toHaveLength(3);
  });

  test("a removed row with an address that no added row shares is not size-paired", () => {
    const report = build([
      fnRow({ name: "fn_gone", from: 100, fromSize: 76, address: "2147677320" }),
      fnRow({ name: "Camera_Elsewhere", to: 100, toSize: 76, address: "2147999999" }),
    ]);
    expect(report.renames).toEqual([]);
    expect(report.brokenMatches).toHaveLength(1);
    expect(report.brokenMatches[0]).toMatchObject({ itemName: "fn_gone" });
  });

  test("rows changed in place are untouched by pairing", () => {
    const report = build([
      fnRow({ name: "Camera_80029CF8", from: 98.94, to: 99.26, fromSize: 968, toSize: 968, address: "2147654904" }),
      fnRow({ name: "Camera_8002A768", from: 100, to: 99.99, fromSize: 2048, toSize: 2048, address: "2147657576" }),
    ]);
    expect(report.renames).toEqual([]);
    expect(report.improvements).toHaveLength(1);
    expect(report.improvements[0]).toMatchObject({ itemName: "Camera_80029CF8" });
    expect(report.brokenMatches).toHaveLength(1);
    expect(report.brokenMatches[0]).toMatchObject({ itemName: "Camera_8002A768" });
  });

  test("mass rename wave produces zero regressed rows when every pair holds its percent", () => {
    const removed = ["Camera_8002F474", "fn_8002F488", "Camera_8002F4D4", "Camera_8002F73C", "Camera_8002F8F4"];
    const added = [
      "Camera_SetModeToStandard",
      "Camera_SetBounds",
      "Camera_SetUpPauseCamera",
      "Camera_SetUpPauseCameraWithDefaultZoom",
      "Camera_SetModeToFixed",
    ];
    const rows = removed.flatMap((name, index) => [
      fnRow({ name, from: 100, fromSize: 20 + index * 8, address: String(2147677300 + index * 40) }),
      fnRow({ name: added[index]!, to: 100, toSize: 20 + index * 8, address: String(2147677300 + index * 40) }),
    ]);
    const report = build(rows);
    expect(report.brokenMatches).toEqual([]);
    expect(report.fuzzyRegressions).toEqual([]);
    expect(report.regressions).toEqual([]);
    expect(report.renames).toHaveLength(5);
    expect(report.renames.map((rename) => rename.toName).sort()).toEqual([...added].sort());
  });
});
