import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openState } from "@server/core/orchestrator-state";
import { listGameEvents } from "@server/core/harness-state/events.js";
import { withDispatchLease } from "./dispatch-guard.js";

const directories: string[] = [];

afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe("dispatch guard action identity", () => {
  test("reuses one command root actor and workflow correlation across acquire and release", async () => {
    const stateDir = mkdtempSync(join(tmpdir(), "dispatch-guard-action-"));
    directories.push(stateDir);
    const fixtureStore = openState(stateDir);
    try {
      fixtureStore.db.query(`
        INSERT INTO cycles (
          id, game_id, cycle_uuid, status, phase,
          head_revision, created_at, updated_at
        ) VALUES (?, ?, ?, 'active', 'preparing', ?, ?, ?)
      `).run(
        "cycle:cycle-melee",
        "melee",
        "cycle-melee",
        "cycle-head",
        "2026-08-13T12:00:00.000Z",
        "2026-08-13T12:00:00.000Z",
      );
      fixtureStore.db.query(`
        INSERT INTO sync_state (
          sync_id, game_id, cycle_uuid, revision, status, trace_id,
          caused_by_event_id, created_at, updated_at
        ) VALUES (?, ?, ?, 0, 'requested', ?, ?, ?, ?)
      `).run(
        "sync-1",
        "melee",
        "cycle-melee",
        "trace-sync-1",
        "event-sync-1-requested",
        "2026-08-13T12:00:00.000Z",
        "2026-08-13T12:00:00.000Z",
      );
    } finally {
      fixtureStore.db.close();
    }
    const result = await withDispatchLease(
      { game: { gameId: "melee" }, stateDir },
      {
        actor: "runner",
        commandId: "command-sync-mutate",
        kind: "sync",
        reason: "mutate the sync staging checkout",
        spanId: "span-11111111-1111-4111-8111-111111111111",
        workflowId: "sync-1",
      },
      async (_leaseId, revalidate) => {
        expect(revalidate()).toMatchObject({ kind: "sync", workflow_id: "sync-1", status: "active" });
        return "completed";
      },
    );
    expect(result).toBe("completed");

    const store = openState(stateDir);
    try {
      const events = listGameEvents(store.db, { gameId: "melee" })
        .filter((event) => event.eventType.startsWith("game.dispatch_"));
      expect(events.map((event) => event.eventType)).toEqual([
        "game.dispatch_requested",
        "game.dispatch_acquired",
        "game.dispatch_released",
      ]);
      expect(events.every((event) => event.actor === "runner")).toBe(true);
      expect(events.every((event) => event.correlationId === "sync-1")).toBe(true);
      expect(new Set(events.map((event) => event.parentSpanId)).size).toBe(1);
      expect(events[0]?.parentSpanId).toBe("span-11111111-1111-4111-8111-111111111111");
      expect(events[0]?.causationId).toBe("command-sync-mutate");
      expect(events[1]?.causationId).toBe(events[0]?.eventId);
      expect(events[2]?.causationId).toBe("command-sync-mutate");
    } finally {
      store.db.close();
    }
  });
});
