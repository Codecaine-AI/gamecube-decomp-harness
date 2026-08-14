import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { openState } from "@server/core/orchestrator-state";
import { listProjectEvents } from "@server/core/project-state/events.js";
import {
  createProjectSession,
  getProjectSessionById,
  mergeProjectSessionKernelTrace,
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

describe("project-session kernel trace telemetry", () => {
  test("merges metadata without a lifecycle transition", () => {
    const store = openState(stateDir());
    try {
      const created = createProjectSession(store.db, {
        actor: "operator",
        id: "project-session:session-1",
        projectId: "melee",
        sessionUuid: "session-1",
      });
      const eventCount = listProjectEvents(store.db).length;

      mergeProjectSessionKernelTrace(store.db, created.id, {
        app_session_id: "app-session-1",
        active_container_id: "container-1",
        producer: {
          name: "dashboard",
          attributes: { retained: true },
        },
      });
      const saved = mergeProjectSessionKernelTrace(store.db, created.id, {
        producer: { attributes: { version: 2 } },
      });

      expect(saved.kernel_trace_json).toMatchObject({
        session_uuid: "session-1",
        app_session_id: "app-session-1",
        active_container_id: "container-1",
        producer: {
          name: "dashboard",
          attributes: { retained: true, version: 2 },
        },
      });
      expect(saved.revision).toBe(created.revision);
      expect(saved.caused_by_event_id).toBe(created.caused_by_event_id);
      expect(listProjectEvents(store.db)).toHaveLength(eventCount);
    } finally {
      store.db.close();
    }
  });

  test("serializes cursor and metadata merges from independent handles", () => {
    const dir = stateDir();
    const first = openState(dir);
    const second = openState(dir);
    try {
      const created = createProjectSession(first.db, {
        actor: "operator",
        id: "project-session:session-concurrent",
        projectId: "melee",
        sessionUuid: "session-concurrent",
      });

      mergeProjectSessionKernelTrace(first.db, created.id, {
        collector: { source: "metadata-writer", attempts: 1 },
      });
      mergeProjectSessionKernelTrace(second.db, created.id, {
        app_session_id: "app-session-concurrent",
        active_container_id: "container-concurrent",
        last_linkage_cursor: {
          project_event_id: created.caused_by_event_id!,
          kernel_event_id: "kernel-event-1",
          correlation_id: created.session_uuid,
          caused_by_event_id: null,
          linked_at: "2026-08-13T12:00:00.000Z",
        },
      });
      mergeProjectSessionKernelTrace(first.db, created.id, {
        collector: { attempts: 2 },
      });

      expect(getProjectSessionById(second.db, created.id)?.kernel_trace_json).toMatchObject({
        app_session_id: "app-session-concurrent",
        active_container_id: "container-concurrent",
        collector: { source: "metadata-writer", attempts: 2 },
        last_linkage_cursor: {
          project_event_id: created.caused_by_event_id,
          kernel_event_id: "kernel-event-1",
          correlation_id: "session-concurrent",
          caused_by_event_id: null,
        },
      });
    } finally {
      second.db.close();
      first.db.close();
    }
  });
});
