import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { completeUnitNames, linkCompleteUnitsFromReport, linkCompleteUnitsInConfigure } from "./link-complete-units.js";

describe("link complete units", () => {
  test("rewrites complete Linkable and NonMatching units and leaves other entries untouched", () => {
    const report = { units: [
      { name: "main/melee/gr/grmaterial", matched_code_percent: 100, matched_data_percent: 100, fuzzy_match_percent: 100 },
      { name: "melee/ft/ftdata", measures: { matched_code_percent: 100, matched_data_percent: 100 } },
      { name: "melee/mn/menu", matched_code_percent: 99.9, matched_data_percent: 100 },
      { name: "main/melee/auto", matched_code_percent: 100, matched_data_percent: 100, metadata: { auto_generated: true } },
      { name: "main/melee/already", matched_code_percent: 100, matched_data_percent: 100, metadata: { complete: true } },
    ] };
    const configure = [
      'Object(Linkable, "melee/gr/grmaterial.c"),',
      'Object(NonMatching, "src/melee/ft/ftdata.c"),',
      'Object(Linkable, "melee/mn/menu.c"),',
    ].join("\n");
    const complete = completeUnitNames(report);
    const result = linkCompleteUnitsInConfigure(configure, complete);
    expect(result.flippedUnits).toEqual(["melee/ft/ftdata", "melee/gr/grmaterial"]);
    expect(result.configure).toContain('Object(Matching, "melee/gr/grmaterial.c")');
    expect(result.configure).toContain('Object(Matching, "src/melee/ft/ftdata.c")');
    expect(result.configure).toContain('Object(Linkable, "melee/mn/menu.c")');
    expect(complete).not.toContain("melee/auto");
    expect(complete).not.toContain("melee/already");
  });

  test("file pass writes configure.py and reports missing units", async () => {
    const dir = mkdtempSync(resolve(tmpdir(), "link-complete-"));
    const configurePath = resolve(dir, "configure.py");
    const reportPath = resolve(dir, "report.json");
    writeFileSync(configurePath, 'Object(Linkable, "melee/gr/grmaterial.c")\n');
    writeFileSync(reportPath, JSON.stringify({ units: [
      { name: "main/melee/gr/grmaterial", matched_code_percent: 100, matched_data_percent: 100, metadata: { source_path: "src/melee/gr/grmaterial.c" } },
      { name: "melee/no/entry", matched_code_percent: 100, matched_data_percent: 100 },
    ] }));
    const result = await linkCompleteUnitsFromReport({ configurePath, reportPath });
    expect(result.flippedUnits).toEqual(["melee/gr/grmaterial"]);
    expect(result.missingUnits).toEqual(["melee/no/entry"]);
    expect(readFileSync(configurePath, "utf8")).toContain("Object(Matching");
  });

  test("restores configure.py when the final DOL check fails", async () => {
    const dir = mkdtempSync(resolve(tmpdir(), "link-complete-revert-"));
    const configurePath = resolve(dir, "configure.py");
    const reportPath = resolve(dir, "report.json");
    const original = 'Object(Linkable, "melee/gm/gmresult.c")\n';
    writeFileSync(configurePath, original);
    writeFileSync(reportPath, JSON.stringify({ units: [
      { name: "main/melee/gm/gmresult", matched_code_percent: 100, matched_data_percent: 100, fuzzy_match_percent: 100 },
    ] }));

    const result = await linkCompleteUnitsFromReport({
      configurePath,
      reportPath,
      verify: async () => ({ exitCode: 1, output: "build/GALE01/ok sha1 check FAILED" }),
    });

    expect(result.status).toBe("reverted");
    expect(result.flippedUnits).toEqual(["melee/gm/gmresult"]);
    expect(result.check?.output).toContain("sha1 check FAILED");
    expect(readFileSync(configurePath, "utf8")).toBe(original);
  });

  test("keeps configure.py when the final DOL check passes", async () => {
    const dir = mkdtempSync(resolve(tmpdir(), "link-complete-keep-"));
    const configurePath = resolve(dir, "configure.py");
    const reportPath = resolve(dir, "report.json");
    writeFileSync(configurePath, 'Object(Linkable, "melee/gm/gmresult.c")\n');
    writeFileSync(reportPath, JSON.stringify({ units: [
      { name: "main/melee/gm/gmresult", matched_code_percent: 100, matched_data_percent: 100, fuzzy_match_percent: 100 },
    ] }));

    const result = await linkCompleteUnitsFromReport({
      configurePath,
      reportPath,
      verify: async () => ({ exitCode: 0, output: "build/GALE01/ok" }),
    });

    expect(result.status).toBe("kept");
    expect(readFileSync(configurePath, "utf8")).toContain("Object(Matching");
  });

  test("an off flag can skip without touching configure.py", async () => {
    const configure = 'Object(Linkable, "melee/gr/grmaterial.c")\n';
    const run = async (enabled: boolean): Promise<string> => enabled
      ? linkCompleteUnitsInConfigure(configure, ["melee/gr/grmaterial"]).configure
      : configure;
    expect(await run(false)).toBe(configure);
  });
});
