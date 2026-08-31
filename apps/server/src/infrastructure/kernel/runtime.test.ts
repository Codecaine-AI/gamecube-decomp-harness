import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TraceSource, type TraceEvent } from "@agent-kernel/protocol";
import type { NewContainer } from "@agent-kernel/db";

import { openState } from "@server/core/orchestrator-state";
import {
  createCycle,
  getCycleById,
  mergeCycleKernelTrace,
  transitionCycle,
} from "@server/core/cycle/store.js";
import type { GameRuntimeContext } from "@server/core/game-registry";
import type { MeleeKernelRuntime } from "./bridge/runtime.js";
import { createMeleeTraceWriter } from "./bridge/trace-writer.js";
import {
  meleeRootContainerId,
  meleeSyncWorkflowContainerId,
  meleeWorkerContainerId,
} from "./bridge/session-mapping.js";
import {
  createDashboardKernelRuntimeService,
  KernelTraceCursorPersistenceError,
  persistCycleKernelTraceLinkage,
  resolveWorkflowTraceLinkage,
} from "./runtime.js";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { force: true, recursive: true });
  }
});

describe("dashboard kernel trace linkage persistence", () => {
  test("reads a worker trace directly from its deterministic container", async () => {
    const requestedIds: string[] = [];
    const kernelRuntime = {
      config: { kernelId: "test-kernel", piSessionsDir: "/tmp/pi-sessions" },
      readRows: async (containerId: string) => {
        requestedIds.push(containerId);
        return {
          agentRuns: [],
          containers: [],
          events: [],
          piSessions: [],
          rootContainer: {
            id: containerId,
            kind: "worker",
            label: "Worker",
            metadata: {},
            status: "running",
          },
        };
      },
      close: async () => {},
    } as unknown as MeleeKernelRuntime;
    const service = createDashboardKernelRuntimeService({
      createKernelRuntime: async () => kernelRuntime,
      env: { ORCH_AGENT_KERNEL_DB_PATH: "/tmp/kernel-runtime-test.sqlite" },
      json: (data, init) => Response.json(data, init),
      latestRunId: () => "",
      packageRoot: "/repo",
      port: 8787,
    });
    const identity = {
      claimId: "claim-1",
      epochId: "epoch-7",
      gameId: "melee",
      runId: "run-1",
      sessionId: "cycle-1",
    };

    const detail = await service.workerTrace(identity);

    expect(requestedIds).toEqual([meleeWorkerContainerId(identity)]);
    expect(detail?.container?.id).toBe(requestedIds[0]);
    await service.closeForTests();
  });

  test("records kernel identity and the last game-event cursor", () => {
    const stateDir = mkdtempSync(join(tmpdir(), "kernel-runtime-"));
    tempDirs.push(stateDir);
    const store = openState(stateDir);
    const created = createCycle(store.db, {
      actor: "operator",
      id: "cycle:cycle-runtime",
      gameId: "melee",
      cycleUuid: "cycle-runtime",
    });
    mergeCycleKernelTrace(store.db, created.id, {
      collector: { retained: true },
    });
    store.db.close();

    persistCycleKernelTraceLinkage(
      stateDir,
      "melee",
      "cycle-runtime",
      {
        activeContainerId: "container-active",
        appSessionId: "app-cycle-runtime",
        rootContainerId: "container-root",
        traceUrl: "/trace?containerId=container-active",
        gameEventId: created.caused_by_event_id!,
        kernelEventId: "kernel-event-runtime",
        correlationId: "cycle-runtime",
        causedByEventId: null,
        linkedAt: "2026-08-13T13:00:00.000Z",
      },
    );

    const reopened = openState(stateDir);
    try {
      expect(getCycleById(reopened.db, created.id)?.kernel_trace_json).toMatchObject({
        app_session_id: "app-cycle-runtime",
        root_container_id: "container-root",
        active_container_id: "container-active",
        trace_url: "/trace?containerId=container-active",
        collector: { retained: true },
        last_linkage_cursor: {
          game_event_id: created.caused_by_event_id,
          kernel_event_id: "kernel-event-runtime",
          correlation_id: "cycle-runtime",
          caused_by_event_id: null,
          linked_at: "2026-08-13T13:00:00.000Z",
        },
      });
    } finally {
      reopened.db.close();
    }
  });

  test("requires exact, game-scoped linkage and preserves event causation", () => {
    const stateDir = mkdtempSync(join(tmpdir(), "kernel-runtime-scope-"));
    tempDirs.push(stateDir);
    const store = openState(stateDir);
    const created = createCycle(store.db, {
      actor: "operator",
      id: "cycle:session-scope",
      gameId: "melee",
      cycleUuid: "session-scope",
    });
    const other = createCycle(store.db, {
      actor: "operator",
      id: "cycle:session-other-game",
      gameId: "other-game",
      cycleUuid: "session-other-game",
    });
    const transitioned = transitionCycle(store.db, created.id, {
      actor: "runner",
      causationId: created.caused_by_event_id!,
      commandId: "command-session-running",
      correlationId: created.cycle_uuid,
      eventType: "cycle.running_started",
      expectedRevision: created.revision,
      patch: { phase: "running" },
    });
    const crossGameCause = transitionCycle(store.db, other.id, {
      actor: "runner",
      causationId: created.caused_by_event_id!,
      commandId: "command-cross-game-cause",
      correlationId: other.cycle_uuid,
      eventType: "cycle.running_started",
      expectedRevision: other.revision,
      patch: { phase: "running" },
    });
    store.db.close();

    const baseInput = {
      kind: "session" as const,
      operation: "cycle.running",
      correlationId: created.cycle_uuid,
      gameEventId: created.caused_by_event_id!,
      causedByEventId: null,
    };
    expect(resolveWorkflowTraceLinkage(stateDir, "melee", baseInput)).toEqual({
      correlationId: created.cycle_uuid,
      gameEventId: created.caused_by_event_id!,
      causedByEventId: null,
    });
    expect(
      resolveWorkflowTraceLinkage(stateDir, "melee", {
        ...baseInput,
        gameEventId: transitioned.caused_by_event_id!,
        causedByEventId: created.caused_by_event_id,
      }),
    ).toEqual({
      correlationId: created.cycle_uuid,
      gameEventId: transitioned.caused_by_event_id!,
      causedByEventId: created.caused_by_event_id,
    });

    expect(() =>
      resolveWorkflowTraceLinkage(stateDir, "melee", {
        ...baseInput,
        gameEventId: other.caused_by_event_id!,
        correlationId: other.cycle_uuid,
      }),
    ).toThrow(`was not found in game melee`);
    expect(() =>
      resolveWorkflowTraceLinkage(stateDir, "melee", {
        ...baseInput,
        gameEventId: undefined,
      }),
    ).toThrow("gameEventId must be a nonblank string");
    expect(() =>
      resolveWorkflowTraceLinkage(stateDir, "melee", {
        ...baseInput,
        correlationId: "unrelated-correlation",
      }),
    ).toThrow("does not match game event");
    expect(() =>
      resolveWorkflowTraceLinkage(stateDir, "melee", {
        ...baseInput,
        causedByEventId: created.caused_by_event_id,
      }),
    ).toThrow("does not match persisted causation");
    expect(() =>
      resolveWorkflowTraceLinkage(stateDir, "other-game", {
        ...baseInput,
        correlationId: other.cycle_uuid,
        gameEventId: crossGameCause.caused_by_event_id!,
      }),
    ).toThrow("has cross-game causation");
  });

  test("files a sync milestone on its explicit workflow node", async () => {
    const stateDir = mkdtempSync(join(tmpdir(), "kernel-runtime-sync-workflow-"));
    tempDirs.push(stateDir);
    const store = openState(stateDir);
    const created = createCycle(store.db, {
      actor: "operator",
      id: "cycle:sync-workflow",
      gameId: "melee",
      cycleUuid: "cycle-sync-workflow",
    });
    const milestone = transitionCycle(store.db, created.id, {
      actor: "runner",
      causationId: created.caused_by_event_id!,
      commandId: "command-sync-workflow",
      correlationId: created.cycle_uuid,
      eventType: "cycle.running_started",
      expectedRevision: created.revision,
      patch: {},
    });
    store.db.close();

    const lineages: NewContainer[][] = [];
    const kernelRuntime = {
      config: {
        kernelId: "test-kernel",
        piSessionsDir: "/tmp/pi-sessions",
      },
      traceWriter: createMeleeTraceWriter({ insertBatch: async (events) => events.length }),
      upsertSpawnContainers: async (context: { containerLineage?: NewContainer[] }) => {
        lineages.push(context.containerLineage ?? []);
      },
      close: async () => {},
    } as unknown as MeleeKernelRuntime;
    const service = createDashboardKernelRuntimeService({
      createKernelRuntime: async () => kernelRuntime,
      env: { ORCH_AGENT_KERNEL_DB_PATH: "/tmp/kernel-runtime-test.sqlite" },
      json: (data, init) => Response.json(data, init),
      latestRunId: () => "",
      packageRoot: "/repo",
      persistCycleKernelTraceLinkage: () => {},
      port: 8787,
    });
    const paths: GameRuntimeContext = {
      graphDbPath: "/repo/graph.db",
      game: null,
      repoRoot: "/repo",
      stateDir,
      usePathOverrides: true,
    };
    const ref = { gameId: "melee", sessionId: created.cycle_uuid };

    const result = await service.submitWorkflowEvent(paths, {
      kind: "sync-intake",
      operation: "sync.ingest",
      status: "started",
      sessionId: created.cycle_uuid,
      correlationId: created.cycle_uuid,
      gameEventId: milestone.caused_by_event_id!,
      causedByEventId: created.caused_by_event_id!,
      metadata: { syncId: "sync-aaaaaaaa-bbbb", milestone: "ingest" },
    });

    expect(result?.containerId).toBe(
      meleeSyncWorkflowContainerId(ref, "sync-aaaaaaaa-bbbb"),
    );
    expect(lineages[0]?.map((container) => container.id)).toEqual([
      meleeRootContainerId(ref),
      meleeSyncWorkflowContainerId(ref, "sync-aaaaaaaa-bbbb"),
    ]);
    await service.closeForTests();
  });

  test("throws cursor failures and retries the same kernel event id", async () => {
    const stateDir = mkdtempSync(join(tmpdir(), "kernel-runtime-retry-"));
    tempDirs.push(stateDir);
    const store = openState(stateDir);
    const created = createCycle(store.db, {
      actor: "operator",
      id: "cycle:session-retry",
      gameId: "melee",
      cycleUuid: "session-retry",
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
    const service = createDashboardKernelRuntimeService({
      createKernelRuntime: async () => kernelRuntime,
      env: { ORCH_AGENT_KERNEL_DB_PATH: "/tmp/kernel-runtime-test.sqlite" },
      json: (data, init) => Response.json(data, init),
      latestRunId: () => "",
      packageRoot: "/repo",
      persistCycleKernelTraceLinkage: () => {
        throw new Error("simulated cursor write failure");
      },
      port: 8787,
    });
    const paths: GameRuntimeContext = {
      graphDbPath: "/repo/graph.db",
      game: null,
      repoRoot: "/repo",
      stateDir,
      usePathOverrides: true,
    };
    const input = {
      kind: "session" as const,
      operation: "cycle.opened",
      status: "completed" as const,
      sessionId: created.cycle_uuid,
      correlationId: created.cycle_uuid,
      gameEventId: created.caused_by_event_id!,
      causedByEventId: null,
      metadata: {
        gameId: "spoofed-game",
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
        gameId: "melee",
        sessionId: created.cycle_uuid,
        correlation_id: created.cycle_uuid,
        game_event_id: created.caused_by_event_id,
        caused_by_event_id: null,
      },
    });
    await service.closeForTests();
  });
});
