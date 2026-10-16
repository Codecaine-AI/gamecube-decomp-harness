import { describe, expect, test } from "bun:test";
import { heldGroupIds, matchFunction, steeringGroupIds, unverifiedTolerance } from "./steering-unverified.js";

/** Mirrors `held_group_ids` / `steering_group_ids` cases in toolpacks/.../tools/test_steering_check.py. */
function report(functions: Array<Record<string, unknown>>, groups: Array<Record<string, unknown>>) {
  return { reduce: { groups }, decision: { functions } };
}

const steer = { unit: "u", name: "f__1TFv", demangled: "T::f(void)", decision: "steering_located", groups: ["g1"] };
const unresolved = { unit: "u", name: "g__1TFv", demangled: "T::g(void)", decision: "unresolved", groups: ["g2"] };

describe("held groups (apply never rewrites an unresolved function)", () => {
  test("a removable group in an unresolved function's groups is held; a steering one is not", () => {
    const held = heldGroupIds(report([steer, unresolved], [
      { id: "g1", status: "removable", units: ["u"] },
      { id: "g2", status: "removable", units: ["u"] },
    ]));
    expect([...held]).toEqual(["g2"]);
  });

  test("held by line location: demangled/qualified names match, other units do not, unit-less groups do", () => {
    const row = { ...unresolved, groups: [] };
    const held = heldGroupIds(report([row], [
      { id: "same", status: "removable", units: ["u"], functions: ["T::g"] },
      { id: "other-unit", status: "removable", units: ["u2"], functions: ["T::g"] },
      { id: "no-units", status: "removable", functions: ["T::g"] },
      { id: "cosmetic", status: "removable", cosmetic: true, units: ["u"], functions: ["T::g"] },
      { id: "real", status: "real", units: ["u"], functions: ["T::g"] },
    ]));
    expect([...held].sort()).toEqual(["no-units", "same"]);
  });

  test("a group touching both a steering and an unresolved function is held; nothing is held without unresolved functions", () => {
    const both = { id: "g", status: "removable", units: ["u"] };
    expect([...heldGroupIds(report([{ ...steer, groups: ["g"] }, { ...unresolved, groups: ["g"] }], [both]))]).toEqual(["g"]);
    expect([...heldGroupIds(report([{ ...steer, groups: ["g"] }], [both]))]).toEqual([]);
  });

  test("apply reverts only removable groups a steering function lists: not held, unclaimed, pass-only, promoted or unmeasured ones", () => {
    const pass = { unit: "u", name: "h", decision: "pass", groups: ["g3"] };
    const raw = {
      ...report([{ ...steer, groups: ["g1", "g2", "g4", "g5"] }, { ...unresolved, groups: ["g2"] }, pass], [
        { id: "g1", status: "removable", units: ["u"], edit_ids: ["e1"] },
        { id: "g2", status: "removable", units: ["u"], edit_ids: ["e2"] },
        { id: "g3", status: "removable", units: ["u"], edit_ids: ["e3"] },
        { id: "g4", status: "removable", units: ["u"], edit_ids: ["e4"] },
        { id: "g5", status: "removable", units: ["u"], edit_ids: ["e5"] },
        { id: "g6", status: "removable", units: ["u"], edit_ids: ["e6"] },
      ]),
      mwcc: { revert_edits: ["e1", "e2", "e3", "e4", "e6"] },
    };
    (raw.decision as Record<string, unknown>).group_statuses = { g4: "real" };
    // g2 is shared with an unresolved function (held whole), g3 only a passing function lists, g4 decide made real,
    // g5 the measured S* never reverted, g6 no function claims.
    expect([...steeringGroupIds(raw)]).toEqual(["g1"]);
  });

  test("matchFunction follows steering_check.py _match_function", () => {
    expect(matchFunction(["T::g(void)"], ["T::g"])).toBe(true);
    expect(matchFunction(["NS::T::g(int)"], ["T::g"])).toBe(true);
    expect(matchFunction(["T::gg(void)"], ["T::g"])).toBe(false);
  });
});

describe("tolerance (what only unverified functions explain)", () => {
  const raw = report([unresolved, { unit: "v", name: "h", decision: "pass", groups: [] }], [{ id: "g2", status: "unresolved", units: ["u"] }]);
  const tolerance = unverifiedTolerance(raw);
  const issue = (category: string, extra: Record<string, unknown> = {}) => ({ category, units: [], groups: [], files: [], detail: "", ...extra });

  test("tolerates the unresolved functions, their groups, an all-unresolved unit's oracle failure and order sensitivity", () => {
    expect(tolerance.tolerates(issue("unresolved_functions"))).toBe(true);
    expect(tolerance.tolerates(issue("unresolved_groups", { groups: ["g2"] }))).toBe(true);
    expect(tolerance.tolerates(issue("unit_oracle_failed", { units: ["u"] }))).toBe(true);
    expect(tolerance.tolerates(issue("global", { detail: "order sensitive: forward and reverse reductions differ on g2" }))).toBe(true);
  });

  test("never tolerates tool errors, budgets, map gaps, foreign groups or a unit with a passing function", () => {
    for (const category of ["tool", "tool_error", "uncovered_unit", "unused_map_gap", "header_cap", "steering_functions", "reduce_unstructured"]) {
      expect(tolerance.tolerates(issue(category, { units: ["u"] }))).toBe(false);
    }
    expect(tolerance.tolerates(issue("global", { detail: "budget of 120s exceeded" }))).toBe(false);
    expect(tolerance.tolerates(issue("unresolved_groups", { groups: ["g2", "elsewhere"] }))).toBe(false);
    expect(tolerance.tolerates(issue("unit_oracle_failed", { units: ["v"] }))).toBe(false);
    expect(unverifiedTolerance(report([], [])).tolerates(issue("unresolved_functions"))).toBe(false);
  });
});
