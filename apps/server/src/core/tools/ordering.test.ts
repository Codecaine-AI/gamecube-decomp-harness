import { describe, expect, test } from "bun:test";
import { resolve } from "node:path";
import { packageRoot } from "@server/core/knowledge";
import {
  gameOrdering,
  orderingActive,
  orderingEnforced,
  orderingGatedPath,
  orderingToolEnv,
  ORDERING_MODE_ENV,
  ORDERING_POLICY_ENV,
} from "./ordering.js";

describe("ordering helpers", () => {
  test("modes: shadow and enforce are active, only enforce is enforced", () => {
    expect([orderingActive("off"), orderingActive("shadow"), orderingActive("enforce"), orderingActive(undefined)]).toEqual([false, true, true, false]);
    expect([orderingEnforced("shadow"), orderingEnforced("enforce")]).toEqual([false, true]);
  });

  test("gameOrdering resolves run metadata like the steering gate and returns null without a block", () => {
    const root = packageRoot();
    expect(gameOrdering({ gameId: "melee", descriptorPath: resolve(root, "games/melee/game.json") })).toBeNull();
    expect(gameOrdering({ gameId: "sms", descriptorPath: resolve(root, "games/sms/game.json") })?.mode).toBe("enforce");
    expect(gameOrdering(null)).toBeNull();
  });

  test("tool env is empty unless ordering is active", () => {
    expect(orderingToolEnv(null)).toEqual({});
    expect(orderingToolEnv({ mode: "off", gatedPaths: ["a"] })).toEqual({});
    expect(orderingToolEnv({ mode: "enforce", gatedPaths: ["src/System/MarNameRefGen*.cpp"] })).toEqual({
      [ORDERING_MODE_ENV]: "enforce",
      [ORDERING_POLICY_ENV]: JSON.stringify({ gatedPaths: ["src/System/MarNameRefGen*.cpp"] }),
    });
  });

  test("gated paths use Python fnmatch semantics", () => {
    const gated = ["src/System/MarNameRefGen*.cpp"];
    expect(orderingGatedPath("src/System/MarNameRefGen_Enemy.cpp", gated)).toBe(true);
    expect(orderingGatedPath("./src/System/MarNameRefGen.cpp", gated)).toBe(true);
    expect(orderingGatedPath("src/System/MarNameRefGen_Enemy.hpp", gated)).toBe(false);
    expect(orderingGatedPath("src/Map/MapObj.cpp", gated)).toBe(false);
    // `*` crosses `/` like fnmatch; `?` and character classes work; regex metacharacters are literal.
    expect(orderingGatedPath("src/a/b/c.cpp", ["src/*.cpp"])).toBe(true);
    expect(orderingGatedPath("src/x1.c", ["src/x[0-9].c"])).toBe(true);
    expect(orderingGatedPath("src/xa.c", ["src/x[!a].c"])).toBe(false);
    expect(orderingGatedPath("src/a+b.c", ["src/a+b.c"])).toBe(true);
    expect(orderingGatedPath("src/aab.c", ["src/a+b.c"])).toBe(false);
  });
});
