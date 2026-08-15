import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { openState } from "@server/core/orchestrator-state";
import { listGameEvents } from "@server/core/harness-state/events.js";
import {
  createCycle,
  getCycleById,
  mergeCycleKernelTrace,
} from "./store.js";

const tempDirs: string[] = [];

function stateDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "kernel-trace-state-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { force: true, recursive: true });
  }
});

describe("cycle kernel trace telemetry", () => {
  test("merges metadata without a lifecycle transition", () => {
    const store = openState(stateDir());
    try {
      const created = createCycle(store.db, {
        actor: "operator",
        id: "cycle:cycle-1",
        gameId: "melee",
        cycleUuid: "cycle-1",
      });
      const eventCount = listGameEvents(store.db).length;

      mergeCycleKernelTrace(store.db, created.id, {
        app_session_id: "app-cycle-1",
        active_container_id: "container-1",
        producer: {
          name: "dashboard",
          attributes: { retained: true },
        },
      });
      const saved = mergeCycleKernelTrace(store.db, created.id, {
        producer: { attributes: { version: 2 } },
      });

      expect(saved.kernel_trace_json).toMatchObject({
        cycle_uuid: "cycle-1",
        app_session_id: "app-cycle-1",
        active_container_id: "container-1",
        producer: {
          name: "dashboard",
          attributes: { retained: true, version: 2 },
        },
      });
      expect(saved.revision).toBe(created.revision);
      expect(saved.caused_by_event_id).toBe(created.caused_by_event_id);
      expect(listGameEvents(store.db)).toHaveLength(eventCount);
    } finally {
      store.db.close();
    }
  });

  test("serializes cursor and metadata merges from independent handles", () => {
    const dir = stateDir();
    const first = openState(dir);
    const second = openState(dir);
    try {
      const created = createCycle(first.db, {
        actor: "operator",
        id: "cycle:cycle-concurrent",
        gameId: "melee",
        cycleUuid: "cycle-concurrent",
      });

      mergeCycleKernelTrace(first.db, created.id, {
        collector: { source: "metadata-writer", attempts: 1 },
      });
      mergeCycleKernelTrace(second.db, created.id, {
        app_session_id: "app-cycle-concurrent",
        active_container_id: "container-concurrent",
        last_linkage_cursor: {
          game_event_id: created.caused_by_event_id!,
          kernel_event_id: "kernel-event-1",
          correlation_id: created.cycle_uuid,
          caused_by_event_id: null,
          linked_at: "2026-08-13T12:00:00.000Z",
        },
      });
      mergeCycleKernelTrace(first.db, created.id, {
        collector: { attempts: 2 },
      });

      expect(getCycleById(second.db, created.id)?.kernel_trace_json).toMatchObject({
        app_session_id: "app-cycle-concurrent",
        active_container_id: "container-concurrent",
        collector: { source: "metadata-writer", attempts: 2 },
        last_linkage_cursor: {
          game_event_id: created.caused_by_event_id,
          kernel_event_id: "kernel-event-1",
          correlation_id: "cycle-concurrent",
          caused_by_event_id: null,
        },
      });
    } finally {
      second.db.close();
      first.db.close();
    }
  });
});
