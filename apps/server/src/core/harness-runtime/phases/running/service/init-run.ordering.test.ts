import { describe, expect, test } from "bun:test";
import type { GlobalArgs } from "@server/core/game-registry/runtime-options.js";
import { runOrderingSnapshot } from "./init-run.js";

type Game = NonNullable<GlobalArgs["game"]>;
const game = (extra: Record<string, unknown>) => ({ gameId: "g", matching: { steeringGate: "shadow" }, ...extra }) as unknown as Game;

describe("run configuration snapshot: ordering", () => {
  test("a game with an ordering block stores its mode; games without one (Melee) store nothing", () => {
    expect(runOrderingSnapshot({ game: game({ ordering: { mode: "enforce", gatedPaths: ["src/System/MarNameRefGen*.cpp"] } }) })).toEqual({ ordering_mode: "enforce" });
    expect(runOrderingSnapshot({ game: game({ ordering: { mode: "shadow", gatedPaths: [] } }) })).toEqual({ ordering_mode: "shadow" });
    expect(runOrderingSnapshot({ game: game({}) })).toEqual({});
    expect(runOrderingSnapshot({ game: undefined })).toEqual({});
  });
});
