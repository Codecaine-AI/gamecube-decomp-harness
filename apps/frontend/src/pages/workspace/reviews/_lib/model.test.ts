import { describe, expect, test } from "bun:test";
import { calleeLabel, decisionBody, siteLabel } from "./model";

describe("evidence review model", () => {
  test("site labels show a line range, or one line when the site is a single line", () => {
    expect(siteLabel({ site_file: "src/Foo.cpp", site_lines: [12, 18] })).toBe("src/Foo.cpp:12-18");
    expect(siteLabel({ site_file: "src/Foo.cpp", site_lines: [7, 7] })).toBe("src/Foo.cpp:7");
  });

  test("callee label prefers the readable name and keeps the mangled symbol", () => {
    expect(calleeLabel({ callee: "getX", callee_symbol: "getX__4TFooFv" })).toBe("getX (getX__4TFooFv)");
    expect(calleeLabel({ callee: null, callee_symbol: "getX__4TFooFv" })).toBe("getX__4TFooFv");
    expect(calleeLabel({ callee: null, callee_symbol: null })).toBe("-");
  });

  test("a decision is only sendable with a non-blank note, which is trimmed", () => {
    expect(decisionBody("sms", { id: "r1", revision: 4 }, "approved", "   ")).toBeNull();
    expect(decisionBody("", { id: "r1", revision: 4 }, "approved", "ok")).toBeNull();
    // The decision carries the revision the operator saw, so a request changed since is refused.
    expect(decisionBody("sms", { id: "r1", revision: 4 }, "rejected", "  not identical  ")).toEqual({ gameId: "sms", id: "r1", revision: 4, decision: "rejected", note: "not identical" });
  });
});
