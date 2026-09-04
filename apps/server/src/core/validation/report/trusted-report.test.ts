import { describe, expect, test } from "bun:test";
import { buildRegressionReport } from "@server/core/validation/objdiff/report.js";
import { trustedReportFromRegressionReport } from "./trusted-report.js";

describe("trustedReportFromRegressionReport", () => {
  test("surfaces moved unit rows and their count", () => {
    const regression = buildRegressionReport({
      from: {},
      to: {},
      units: [
        {
          name: "old/unit",
          from: { fuzzy_match_percent: 100 },
          functions: [
            { name: "fn", from: { fuzzy_match_percent: 100, size: "16" }, metadata: { virtual_address: "2148000000" } },
          ],
        },
        {
          name: "new/unit",
          to: { fuzzy_match_percent: 100 },
          functions: [
            { name: "fn", to: { fuzzy_match_percent: 100, size: "16" }, metadata: { virtual_address: "2148000000" } },
          ],
        },
      ],
    }, "test", 0);

    const trusted = trustedReportFromRegressionReport(regression, "/tmp/report_changes.json", "test", null);
    expect(trusted.counts.movedUnits).toBe(1);
    expect(trusted.movedUnits).toEqual([{ from: "old/unit", to: "new/unit" }]);
  });
});
