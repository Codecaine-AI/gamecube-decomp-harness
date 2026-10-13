import { expect, test } from "bun:test";
import type { StackCheckRunner } from "@server/core/validation/stack/stack-check.js";
import { classifyStackOnlyFunctions } from "./stack-classify.js";

test("backfill classifies each open function of a unit from one compiled-vs-target comparison", async () => {
  const calls: string[][] = [];
  const runner: StackCheckRunner = async (args) => {
    calls.push(args);
    if (args[1] === "build/GMSJ01/src/M3DUtil/MActor.o") {
      return {
        exitCode: 0,
        stderr: "",
        stdout: JSON.stringify({
          functions: [
            { name: "frameOnly", class: "stack_only", frame_a: 48, frame_b: 56 },
            { name: "code", class: "code", frame_a: 32, frame_b: 32 },
          ],
          data: "identical",
        }),
      };
    }
    return { exitCode: 1, stdout: "", stderr: "missing object" };
  };

  const result = await classifyStackOnlyFunctions({
    report: {
      units: [
        { name: "mario/M3DUtil/MActor", functions: [
          { name: "frameOnly", size: 64, fuzzy_match_percent: 97.5 },
          { name: "code", size: 64, fuzzy_match_percent: 80 },
          { name: "done", size: 64, fuzzy_match_percent: 100 },
        ] },
        { name: "mario/M3DUtil/Unbuilt", functions: [{ name: "x", size: 8, fuzzy_match_percent: 10 }] },
        { name: "mario/M3DUtil/Exact", functions: [{ name: "y", size: 8, fuzzy_match_percent: 100 }] },
      ],
    },
    objdiff: { units: [{ name: "mario/M3DUtil/MActor", base_path: "build/GMSJ01/src/M3DUtil/MActor.o", target_path: "build/GMSJ01/obj/M3DUtil/MActor.o" }] },
    runner,
    validation: { reportPath: "build/GMSJ01/report.json" },
  });

  expect(result.functions).toEqual([
    { unit: "mario/M3DUtil/MActor", symbol: "frameOnly", fuzzy: 97.5, class: "stack_only", frameCompiled: 48, frameTarget: 56 },
    { unit: "mario/M3DUtil/MActor", symbol: "code", fuzzy: 80, class: "code", frameCompiled: 32, frameTarget: 32 },
  ]);
  // An exact unit is never compared; an unbuilt one is reported, not fatal.
  expect(calls).toHaveLength(2);
  expect(calls[1]).toEqual(["objects", "build/GMSJ01/src/M3DUtil/Unbuilt.o", "build/GMSJ01/obj/M3DUtil/Unbuilt.o", "--json"]);
  expect(result.errors).toEqual([{ unit: "mario/M3DUtil/Unbuilt", error: expect.stringContaining("missing object") }]);
});
