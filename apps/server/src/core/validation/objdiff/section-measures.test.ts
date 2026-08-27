import { describe, expect, test } from "bun:test";
import { sectionMeasuresFromReportJson } from "./section-measures.js";

describe("section measures", () => {
  test("aggregates section rows with size-weighted percentages", () => {
    expect(sectionMeasuresFromReportJson({
      units: [
        { sections: [
          { name: ".data", size: 10, fuzzy_match_percent: 100 },
          { name: ".text", size: 3, fuzzy_match_percent: 50 },
        ] },
        { sections: [
          { name: ".data", size: 30, fuzzy_match_percent: 50 },
          { name: ".text", size: 1, fuzzy_match_percent: 100 },
          { name: ".data", size: 0, fuzzy_match_percent: 100 },
        ] },
      ],
    })).toEqual({
      ".data": { sizeBytes: 40, fuzzyMatchPercent: 62.5, exactRows: 2, totalRows: 3 },
      ".text": { sizeBytes: 4, fuzzyMatchPercent: 62.5, exactRows: 1, totalRows: 2 },
    });
  });

  test("returns an empty result for malformed input", () => {
    expect(sectionMeasuresFromReportJson(null)).toEqual({});
    expect(sectionMeasuresFromReportJson({ units: "invalid" })).toEqual({});
  });
});
