import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TraceSource, type TraceEvent } from "@agent-kernel/protocol";

import { openState } from "@server/core/orchestrator-state";
import {
  createProjectSession,
  getProjectSessionById,
  mergeProjectSessionKernelTrace,
  transitionProjectSession,
} from "@server/core/project-session/store.js";
import type { ProjectRuntimeContext } from "@server/core/project-registry";
import type { MeleeKernelRuntime } from "./bridge/runtime.js";
import { createMeleeTraceWriter } from "./bridge/trace-writer.js";
import {
  createDashboardKernelRuntimeService,
  KernelTraceCursorPersistenceError,
  persistProjectSessionKernelTraceLinkage,
  resolveWorkflowTraceLinkage,
} from "./runtime.js";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { force: true, recursive: true });
  }
});

describe("dashboard kernel trace linkage persistence", () => {
  test("records kernel identity and the last project-event cursor", () => {
    const stateDir = mkdtempSync(join(tmpdir(), "kernel-runtime-"));
    tempDirs.push(stateDir);
    const store = openState(stateDir);
    const created = createProjectSession(store.db, {
      actor: "operator",
      id: "project-session:session-runtime",
      projectId: "melee",
      sessionUuid: "session-runtime",
    });
    mergeProjectSessionKernelTrace(store.db, created.id, {
      collector: { retained: true },
    });
    store.db.close();

    persistProjectSessionKernelTraceLinkage(
      stateDir,
      "melee",
      "session-runtime",
      {
        activeContainerId: "container-active",
        appSessionId: "app-session-runtime",
        rootContainerId: "container-root",
        traceUrl: "/trace?containerId=container-active",
        projectEventId: created.caused_by_event_id!,
        kernelEventId: "kernel-event-runtime",
        correlationId: "session-runtime",
        causedByEventId: null,
        linkedAt: "2026-08-13T13:00:00.000Z",
      },
    );

    const reopened = openState(stateDir);
    try {
      expect(getProjectSessionById(reopened.db, created.id)?.kernel_trace_json).toMatchObject({
        app_session_id: "app-session-runtime",
        root_container_id: "container-root",
        active_container_id: "container-active",
        trace_url: "/trace?containerId=container-active",
        collector: { retained: true },
        last_linkage_cursor: {
          project_event_id: created.caused_by_event_id,
          kernel_event_id: "kernel-event-runtime",
          correlation_id: "session-runtime",
          caused_by_event_id: null,
          linked_at: "2026-08-13T13:00:00.000Z",
        },
      });
    } finally {
      reopened.db.close();
    }
  });

  test("requires exact, project-scoped linkage and preserves event causation", () => {
    const stateDir = mkdtempSync(join(tmpdir(), "kernel-runtime-scope-"));
    tempDirs.push(stateDir);
    const store = openState(stateDir);
    const created = createProjectSession(store.db, {
      actor: "operator",
      id: "project-session:session-scope",
      projectId: "melee",
      sessionUuid: "session-scope",
    });
    const other = createProjectSession(store.db, {
      actor: "operator",
      id: "project-session:session-other-project",
      projectId: "other-project",
      sessionUuid: "session-other-project",
    });
    const transitioned = transitionProjectSession(store.db, created.id, {
      actor: "runner",
      causationId: created.caused_by_event_id!,
      commandId: "command-session-running",
      correlationId: created.session_uuid,
      eventType: "session.running_started",
      expectedRevision: created.revision,
      patch: { phase: "running" },
    });
    const crossProjectCause = transitionProjectSession(store.db, other.id, {
      actor: "runner",
      causationId: created.caused_by_event_id!,
      commandId: "command-cross-project-cause",
      correlationId: other.session_uuid,
      eventType: "session.running_started",
      expectedRevision: other.revision,
      patch: { phase: "running" },
    });
    store.db.close();

    const baseInput = {
      kind: "session" as const,
      operation: "session.running",
      correlationId: created.session_uuid,
      projectEventId: created.caused_by_event_id!,
      causedByEventId: null,
    };
    expect(resolveWorkflowTraceLinkage(stateDir, "melee", baseInput)).toEqual({
      correlationId: created.session_uuid,
      projectEventId: created.caused_by_event_id!,
      causedByEventId: null,
    });
    expect(
      resolveWorkflowTraceLinkage(stateDir, "melee", {
        ...baseInput,
        projectEventId: transitioned.caused_by_event_id!,
        causedByEventId: created.caused_by_event_id,
      }),
    ).toEqual({
      correlationId: created.session_uuid,
      projectEventId: transitioned.caused_by_event_id!,
      causedByEventId: created.caused_by_event_id,
    });

    expect(() =>
      resolveWorkflowTraceLinkage(stateDir, "melee", {
        ...baseInput,
        projectEventId: other.caused_by_event_id!,
        correlationId: other.session_uuid,
      }),
    ).toThrow(`was not found in project melee`);
    expect(() =>
      resolveWorkflowTraceLinkage(stateDir, "melee", {
        ...baseInput,
        projectEventId: undefined,
      }),
    ).toThrow("projectEventId must be a nonblank string");
    expect(() =>
      resolveWorkflowTraceLinkage(stateDir, "melee", {
        ...baseInput,
        correlationId: "unrelated-correlation",
      }),
    ).toThrow("does not match project event");
    expect(() =>
      resolveWorkflowTraceLinkage(stateDir, "melee", {
        ...baseInput,
        causedByEventId: created.caused_by_event_id,
      }),
    ).toThrow("does not match persisted causation");
    expect(() =>
      resolveWorkflowTraceLinkage(stateDir, "other-project", {
        ...baseInput,
        correlationId: other.session_uuid,
        projectEventId: crossProjectCause.caused_by_event_id!,
      }),
    ).toThrow("has cross-project causation");
  });

  test("throws cursor failures and retries the same kernel event id", async () => {
    const stateDir = mkdtempSync(join(tmpdir(), "kernel-runtime-retry-"));
    tempDirs.push(stateDir);
    const store = openState(stateDir);
    const created = createProjectSession(store.db, {
      actor: "operator",
      id: "project-session:session-retry",
      projectId: "melee",
      sessionUuid: "session-retry",
    });
    store.db.close();

    const submissionAttempts: TraceEvent[] = [];
    const persistedKernelEvents = new Map<string, TraceEvent>();
    const traceWriter = createMeleeTraceWriter({
      insertBatch: async (events) => {
        for (const event of events) {
          submissionAttempts.push(event);
          if (!persistedKernelEvents.has(event.eventId)) {
            persistedKernelEvents.set(event.eventId, event);
          }
        }
        return events.length;
      },
      now: () => "2026-08-13T14:00:00.000Z",
    });
    const kernelRuntime = {
      config: {
        kernelId: "test-kernel",
        piSessionsDir: "/tmp/pi-sessions",
      },
      traceWriter,
      upsertSpawnContainers: async () => {},
      close: async () => {},
    } as unknown as MeleeKernelRuntime;
    const logs: string[] = [];
    const service = createDashboardKernelRuntimeService({
      appendLog: (_stream, text) => logs.push(text),
      createKernelRuntime: async () => kernelRuntime,
      defaultStateDir: stateDir,
      env: { ORCH_AGENT_KERNEL_DATABASE_URL: "postgres://kernel.invalid/test" },
      json: (data, init) => Response.json(data, init),
      latestRunId: () => "",
      packageRoot: "/repo",
      persistProjectSessionKernelTraceLinkage: () => {
        throw new Error("simulated cursor write failure");
      },
      port: 8787,
    });
    const paths: ProjectRuntimeContext = {
      graphDbPath: "/repo/graph.db",
      project: null,
      repoRoot: "/repo",
      stateDir,
      usePathOverrides: true,
    };
    const input = {
      kind: "session" as const,
      operation: "session.opened",
      status: "completed" as const,
      sessionId: created.session_uuid,
      correlationId: created.session_uuid,
      projectEventId: created.caused_by_event_id!,
      causedByEventId: null,
      metadata: {
        projectId: "spoofed-project",
        correlation_id: "spoofed-correlation",
      },
    };

    for (let attempt = 0; attempt < 2; attempt += 1) {
      await expect(service.submitWorkflowEvent(paths, input)).rejects.toBeInstanceOf(
        KernelTraceCursorPersistenceError,
      );
    }

    expect(submissionAttempts).toHaveLength(2);
    expect(submissionAttempts[0]?.eventId).toBe(submissionAttempts[1]?.eventId);
    expect(persistedKernelEvents.size).toBe(1);
    expect(persistedKernelEvents.values().next().value).toMatchObject({
      source: TraceSource.APP,
      eventData: {
        projectId: "melee",
        sessionId: created.session_uuid,
        correlation_id: created.session_uuid,
        project_event_id: created.caused_by_event_id,
        caused_by_event_id: null,
      },
    });
    expect(logs.filter((line) => line.includes("cursor persistence failed"))).toHaveLength(2);
    await service.closeForTests();
  });
});
