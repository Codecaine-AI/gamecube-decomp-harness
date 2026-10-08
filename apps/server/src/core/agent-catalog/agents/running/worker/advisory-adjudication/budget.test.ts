import { describe, expect, test } from "bun:test";

import { makeCandidate, testConfig } from "./__fixtures__/adjudication.js";
import { inlineBudget } from "./budget.js";
import { foldVerdicts } from "./fold.js";
import { failClosedAdjudication } from "./index.js";

const config = testConfig("fake-decide/fake-jev"); // inline { maxMs 75_000, reserveMs 120_000, minMs 20_000 }
const NOW = 1_800_000_000_000;

describe("inlineBudget", () => {
  test("is inline.maxMs when the claim deadline is far away", () => {
    expect(inlineBudget({ claimDeadlineMs: NOW + 600_000, nowMs: NOW, config })).toEqual({ ok: true, ms: 75_000 });
  });

  test("never reaches into the reserve before the claim deadline", () => {
    expect(inlineBudget({ claimDeadlineMs: NOW + 150_000, nowMs: NOW, config })).toEqual({ ok: true, ms: 30_000 });
    // Exactly inline.minMs left is still enough.
    expect(inlineBudget({ claimDeadlineMs: NOW + 140_000, nowMs: NOW, config })).toEqual({ ok: true, ms: 20_000 });
  });

  test("insufficient time below inline.minMs, inside the reserve, or past the deadline", () => {
    for (const deadline of [NOW + 139_999, NOW + 120_000, NOW + 60_000, NOW - 1_000]) {
      expect(inlineBudget({ claimDeadlineMs: deadline, nowMs: NOW, config })).toEqual({ ok: false, reason: "insufficient-time" });
    }
  });

  test("a NaN, infinite or missing deadline uses inline.maxMs", () => {
    for (const claimDeadlineMs of [null, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(inlineBudget({ claimDeadlineMs, nowMs: NOW, config })).toEqual({ ok: true, ms: 75_000 });
    }
  });

  test("a non-finite clock fails closed", () => {
    expect(inlineBudget({ claimDeadlineMs: NOW + 600_000, nowMs: Number.NaN, config })).toEqual({ ok: false, reason: "insufficient-time" });
  });

  test("insufficient time fails closed without calling the kernel", () => {
    const budget = inlineBudget({ claimDeadlineMs: NOW + 125_000, nowMs: NOW, config });
    expect(budget.ok).toBe(false);
    // The enforce caller's record when the budget is short: no kernel is passed, so none can be called.
    const result = failClosedAdjudication({ candidate: makeCandidate({ mode: "enforce" }), reason: "insufficient-time", config });
    expect(result).toMatchObject({ verdict: "error", applied: true, accepted_fingerprints: [], extraction: { status: "skipped" } });
    expect(foldVerdicts(result.advisories).repairReasons).toEqual([
      expect.stringMatching(/type_erasing_cast at src\/melee\/gm\/gmtoulib\.c:1863 .*: insufficient time$/),
      expect.stringMatching(/type_erasing_cast at src\/melee\/gm\/gmtoulib\.c:1864 .*: insufficient time$/),
    ]);
  });
});
