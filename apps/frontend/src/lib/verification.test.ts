import { describe, expect, test } from "bun:test";
import { doneWithUnverifiedLabel, unverifiedMatch, unverifiedRunTargets } from "./verification";

describe("unverified match view", () => {
  test("reads the server's verification fields into a badge label and tooltip", () => {
    const view = unverifiedMatch({
      symbol: "update",
      verification: "unverified_match",
      verification_label: "100% unverified",
      verification_match: { base: 40, candidate: 100, real_only: null },
      verification_reasons: ["no steering located", "real-only build regressed"],
    });
    expect(view).toEqual({
      label: "100% unverified",
      reason: "no steering located",
      title: "100% unverified (candidate 100%): the steering gate could not verify this code; not counted as done.\nno steering located\nreal-only build regressed",
    });
  });

  test("verified rows and games without a steering gate have no badge", () => {
    expect(unverifiedMatch({ symbol: "update" })).toBeNull();
    expect(unverifiedMatch(null)).toBeNull();
  });

  test("done count carries the unverified count only when the game reports one", () => {
    expect(unverifiedRunTargets({ unverified_run_targets: 3 })).toBe(3);
    expect(unverifiedRunTargets({ targetExactMatches: 12 })).toBeNull();
    expect(doneWithUnverifiedLabel(12, 3)).toBe("12 done · 3 100% unverified");
    expect(doneWithUnverifiedLabel(12, 0)).toBe("12 done");
    expect(doneWithUnverifiedLabel(12, null)).toBe("12 done");
  });
});
