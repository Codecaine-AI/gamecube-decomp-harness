import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadCompilerCapabilities, parseCompilerCapabilities, tracePointAvailabilityLines } from "./compiler-capabilities.js";

const dir = mkdtempSync(join(tmpdir(), "compiler-capabilities-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("compiler capabilities", () => {
  test("a missing, malformed or foreign file loads as null and renders the unprovisioned line", () => {
    expect(loadCompilerCapabilities(join(dir, "absent.json"))).toBeNull();
    const malformed = join(dir, "malformed.json");
    writeFileSync(malformed, "{not json");
    expect(loadCompilerCapabilities(malformed)).toBeNull();
    expect(parseCompilerCapabilities({ schema: "other", versions: {} })).toBeNull();
    expect(tracePointAvailabilityLines(null)).toEqual([
      "No traced compiler is provisioned: every native trace point is unavailable; native captures and source comparisons report unavailable.",
    ]);
  });

  test("a build.sh file renders what each version lacks, newest first", () => {
    const path = join(dir, "CAPABILITIES.json");
    writeFileSync(path, JSON.stringify({
      schema: "mwcc-native-capabilities-v1",
      pin: "92f893f",
      versions: {
        "1.1p1": { stock_sha1: "a", traced_sha1: "b", points: ["interference", "coloring", "coalescing", "inlining", "cse"] },
        "1.2.5": { points: ["vreg_identity", "interference", "coloring", "coalescing", "inlining", "cse", "frame", "scheduling"] },
        "1.2.5n": { points: ["vreg_identity", "interference", "coloring", "coalescing", "inlining", "cse", 7] },
      },
    }));
    const capabilities = loadCompilerCapabilities(path);
    expect(capabilities?.pin).toBe("92f893f");
    expect(capabilities?.versions["1.2.5n"]?.points).not.toContain(7);
    expect(tracePointAvailabilityLines(capabilities)).toEqual([
      "GC/1.2.5: all",
      "GC/1.2.5n: all except frame or scheduling",
      "GC/1.1p1: all except vreg identity, frame or scheduling",
    ]);
    expect(tracePointAvailabilityLines({ schema: "mwcc-native-capabilities-v1", pin: null, versions: { "1.2.5": { points: [] } } })).toEqual(["GC/1.2.5: none"]);
  });
});
