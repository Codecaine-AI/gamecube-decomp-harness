/// <reference types="bun-types" />

import { describe, expect, test } from "bun:test";
import { traceSelectionUrl } from "./game-event-model";

describe("trace URL identity", () => {
  test("changes trace selectors without dropping unrelated URL state", () => {
    const current = "http://localhost/workspace/trace?gameId=melee&sessionId=cycle-1&traceId=trace-1&containerId=container-1&panel=detail&correlation_id=sync-9#game-event-event-9";
    const next = new URL(traceSelectionUrl(current, {
      sessionId: "cycle-2",
      traceId: "trace-2",
      containerId: "container-2",
    }), current);

    expect(Object.fromEntries(next.searchParams)).toEqual({
      gameId: "melee",
      sessionId: "cycle-2",
      traceId: "trace-2",
      containerId: "container-2",
      panel: "detail",
      correlation_id: "sync-9",
    });
    expect(next.hash).toBe("#game-event-event-9");
  });
});
