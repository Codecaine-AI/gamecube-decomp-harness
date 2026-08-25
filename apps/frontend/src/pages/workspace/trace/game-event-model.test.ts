/// <reference types="bun-types" />

import { describe, expect, test } from "bun:test";
import type {
  GameEventDto,
  GameEventKernelTraceProjection,
  GameEventReconstructionPage,
  ReconstructedGameEvent,
} from "@/lib/api-types";
import {
  chooseGameEventCorrelation,
  isSafeLocalTraceHref,
  isSelectedGameEvent,
  kernelTraceSelectionUrl,
  mergeGameEventPages,
  mergeGameEventReconstructionPages,
  gameEventAnchorAvailability,
  gameEventAnchorId,
  gameEventReconstructionSelection,
  gameEventSelectionUrl,
  gameEventTimeline,
  gameEventUrlSelection,
  gameEventWorkflowOptions,
  selectedGameEventCorrelation,
  selectedGameEventIdFromHash,
  traceSelectionUrl,
} from "./game-event-model";

function event(
  sequence: number,
  correlation_id: string,
  overrides: Partial<GameEventDto> = {},
): GameEventDto {
  return {
    event_id: `event-${sequence}`,
    sequence,
    event_type: "run.epoch_integrated",
    schema_version: 1,
    game_id: "melee",
    subject_kind: "run",
    subject_id: "run-1",
    correlation_id,
    causation_id: `command-${sequence}`,
    trace_id: `trace-${sequence}`,
    span_id: `span-${sequence}`,
    parent_span_id: null,
    actor: "runner",
    occurred_at: `2026-08-13T12:00:0${sequence}.000Z`,
    payload_summary: { accepted_sequence: sequence },
    ...overrides,
  };
}

function reconstructed(
  source: GameEventDto,
  caused_by: ReconstructedGameEvent["caused_by"],
): ReconstructedGameEvent {
  return { ...source, caused_by };
}

describe("game event workflow selection", () => {
  test("groups correlations from the event list and selects the newest workflow by default", () => {
    const options = gameEventWorkflowOptions([
      event(8, "sync-1", { event_type: "sync.published", subject_kind: "sync_workflow", subject_id: "sync-1" }),
      event(2, "run-1"),
      event(5, "sync-1", { event_type: "sync.requested", subject_kind: "sync_workflow", subject_id: "sync-1" }),
      event(3, "run-1"),
    ]);

    expect(options).toEqual([
      {
        workflow_kind: "sync",
        workflow_id: "sync-1",
        correlation_id: "sync-1",
        event_count: 2,
        first_sequence: 5,
        last_sequence: 8,
      },
      {
        workflow_kind: "run",
        workflow_id: "run-1",
        correlation_id: "run-1",
        event_count: 2,
        first_sequence: 2,
        last_sequence: 3,
      },
    ]);
    expect(chooseGameEventCorrelation(options, "run-1")).toBe("run-1");
    expect(chooseGameEventCorrelation(options, "missing")).toBe("sync-1");
    expect(chooseGameEventCorrelation([], "run-1")).toBeNull();
  });

  test("offers only run, sync, and cycle workflows inferred from accepted evidence", () => {
    const options = gameEventWorkflowOptions([
      event(1, "command-only", {
        event_type: "knowledge.revision_advanced",
        subject_kind: "game_knowledge",
        subject_id: "melee",
      }),
      event(6, "unregistered-campaign", {
        event_type: "pr.campaign_opened",
        subject_kind: "campaign" as never,
        subject_id: "not-a-server-subject-kind",
      }),
      event(4, "cycle-1", {
        event_type: "cycle.opened",
        subject_kind: "cycle",
        subject_id: "cycle-1",
      }),
      event(5, "sync-dispatch", {
        event_type: "game.dispatch_requested",
        subject_kind: "game",
        subject_id: "melee",
        payload_summary: { requested_kind: "sync", workflow_id: "sync-dispatch" },
      }),
    ]);

    expect(options.map(({ workflow_kind, workflow_id, correlation_id, event_count }) => ({
      workflow_kind,
      workflow_id,
      correlation_id,
      event_count,
    }))).toEqual([
      { workflow_kind: "sync", workflow_id: "sync-dispatch", correlation_id: "sync-dispatch", event_count: 1 },
      { workflow_kind: "cycle", workflow_id: "cycle-1", correlation_id: "cycle-1", event_count: 1 },
    ]);
  });

  test("rejects a correlation with conflicting workflow identities", () => {
    expect(gameEventWorkflowOptions([
      event(1, "conflict", { subject_kind: "run", subject_id: "run-1" }),
      event(2, "conflict", { subject_kind: "sync_workflow", subject_id: "sync-1" }),
    ])).toEqual([]);
  });

  test("does not double-count an event repeated by list and reconstruction DTOs", () => {
    const repeated = event(1, "run-1");
    expect(gameEventWorkflowOptions([repeated, repeated])).toEqual([{
      workflow_kind: "run",
      workflow_id: "run-1",
      correlation_id: "run-1",
      event_count: 1,
      first_sequence: 1,
      last_sequence: 1,
    }]);
  });

  test("reads only the snake_case correlation selector", () => {
    expect(selectedGameEventCorrelation("?correlation_id=sync-1&correlationId=wrong")).toBe("sync-1");
    expect(selectedGameEventCorrelation("?correlationId=wrong")).toBeNull();
  });
});

describe("game event hash selection", () => {
  test("parses a canonical anchor together with its reconstruction correlation", () => {
    const hash = `#${gameEventAnchorId("event/9")}`;

    expect(selectedGameEventIdFromHash(hash)).toBe("event/9");
    expect(gameEventUrlSelection("?gameId=melee&correlation_id=sync-9", hash)).toEqual({
      correlationId: "sync-9",
      eventId: "event/9",
    });
  });

  test("rejects empty, malformed, non-canonical, and unsafe game-event hashes", () => {
    const invalidHashes = [
      "",
      "#event-1",
      "#game-event-",
      "#game-event-event%",
      "#game-event-event%2f9",
      "#game-event-event%252F9",
      "#game-event-%2Fevent-9",
      "#game-event-event%209",
      "#game-event-event-9?panel=detail",
      "#game-event-%E2%98%83",
    ];

    for (const hash of invalidHashes) {
      expect(selectedGameEventIdFromHash(hash)).toBeNull();
    }
    expect(gameEventUrlSelection("?correlation_id=run-1", "#game-event-event%"))
      .toEqual({ correlationId: "run-1", eventId: null });
  });

  test("matches accessible pressed state only for the exact correlation and event identity", () => {
    const selection = { correlationId: "run-1", eventId: "event-2" };

    expect(isSelectedGameEvent(event(2, "run-1"), selection)).toBeTrue();
    expect(isSelectedGameEvent(event(2, "run-2"), selection)).toBeFalse();
    expect(isSelectedGameEvent(event(3, "run-1"), selection)).toBeFalse();
    expect(isSelectedGameEvent(event(2, "run-1"), { ...selection, eventId: null })).toBeFalse();
  });
});

describe("game event continuation merging", () => {
  test("deduplicates list pages by event id and restores ascending sequence order", () => {
    const first = event(3, "run-1", { payload_summary: { status: "first" } });
    const repeated = event(3, "run-1", { payload_summary: { status: "repeated" } });

    const merged = mergeGameEventPages(
      [first, event(1, "run-1")],
      [event(4, "run-1"), repeated, event(2, "run-1")],
    );

    expect(merged.map((item) => item.sequence)).toEqual([1, 2, 3, 4]);
    expect(merged.find((item) => item.event_id === first.event_id)?.payload_summary).toEqual({
      status: "first",
    });
  });

  test("merges reconstruction events and kernel links while taking continuation metadata", () => {
    const cause = { kind: "command" as const, command_id: "command" };
    const trace = {
      event_id: "event-2",
      app_session_id: "app-session-1",
      container_id: "container-1",
      kernel_event_id: "kernel-event-1",
      href: "/workspace/trace?traceId=trace-1&containerId=container-1",
    };
    const first: GameEventReconstructionPage = {
      game_id: "melee",
      correlation_id: "run-1",
      events: [reconstructed(event(2, "run-1"), cause), reconstructed(event(1, "run-1"), cause)],
      has_more: true,
      next_after_sequence: 2,
      kernel_traces: [trace],
    };
    const next: GameEventReconstructionPage = {
      game_id: "melee",
      correlation_id: "run-1",
      events: [reconstructed(event(4, "run-1"), cause), reconstructed(event(2, "run-1"), cause), reconstructed(event(3, "run-1"), cause)],
      has_more: false,
      next_after_sequence: null,
      kernel_traces: [
        trace,
        {
          ...trace,
          event_id: "event-4",
          kernel_event_id: "kernel-event-4",
        },
      ],
    };

    const merged = mergeGameEventReconstructionPages(first, next);

    expect(merged.events.map((item) => item.sequence)).toEqual([1, 2, 3, 4]);
    expect(merged.kernel_traces.map((item) => item.kernel_event_id)).toEqual([
      "kernel-event-1",
      "kernel-event-4",
    ]);
    expect(merged).toMatchObject({ has_more: false, next_after_sequence: null });
  });

  test("rejects reconstruction pages from a different identity", () => {
    const page: GameEventReconstructionPage = {
      game_id: "melee",
      correlation_id: "run-1",
      events: [],
      has_more: false,
      next_after_sequence: null,
      kernel_traces: [],
    };

    expect(() => mergeGameEventReconstructionPages(page, {
      ...page,
      correlation_id: "sync-1",
    })).toThrow("different games or correlations");
  });

  test("guides explicit continuation until a selected event is loaded", () => {
    const cause = { kind: "command" as const, command_id: "command" };
    const selection = { correlationId: "run-1", eventId: "event-3" };
    const first: GameEventReconstructionPage = {
      game_id: "melee",
      correlation_id: "run-1",
      events: [reconstructed(event(1, "run-1"), cause)],
      has_more: true,
      next_after_sequence: 1,
      kernel_traces: [],
    };

    expect(gameEventAnchorAvailability(selection, null)).toBe("awaiting-reconstruction");
    expect(gameEventAnchorAvailability(selection, { ...first, correlation_id: "run-2" }))
      .toBe("awaiting-reconstruction");
    expect(gameEventAnchorAvailability(selection, first)).toBe("continuation-available");

    const second: GameEventReconstructionPage = {
      ...first,
      events: [
        reconstructed(event(2, "run-1"), cause),
        reconstructed(event(3, "run-1"), cause),
      ],
      has_more: false,
      next_after_sequence: null,
    };
    const loaded = mergeGameEventReconstructionPages(first, second);

    expect(gameEventAnchorAvailability(selection, loaded)).toBe("loaded");
    expect(gameEventAnchorAvailability(
      { correlationId: "run-1", eventId: "missing" },
      loaded,
    )).toBe("missing");
    expect(gameEventAnchorAvailability(
      { correlationId: "run-1", eventId: null },
      loaded,
    )).toBe("unselected");
  });
});

describe("game event lifecycle projection", () => {
  test("maps a clicked timeline event to its reconstruction correlation and detail anchor", () => {
    expect(gameEventReconstructionSelection(event(9, "campaign-9", {
      event_id: "campaign-event-9",
    }))).toEqual({
      correlationId: "campaign-9",
      eventId: "campaign-event-9",
    });
  });

  test("orders and maps accepted events with explicit event and command causes", () => {
    const causeEvent = {
      kind: "event" as const,
      event_id: "event-1",
      sequence: 1,
      event_type: "game.dispatch_released",
      correlation_id: "run-1",
      subject_kind: "game" as const,
      subject_id: "melee",
    };
    const commandCause = { kind: "command" as const, command_id: "command-sync-start" };
    const response: GameEventReconstructionPage = {
      game_id: "melee",
      correlation_id: "sync-1",
      events: [
        reconstructed(event(7, "sync-1", {
          event_type: "sync.boundary_published",
          actor: "operator",
          subject_kind: "sync_workflow",
          subject_id: "sync-1",
        }), causeEvent),
        reconstructed(event(4, "sync-1", {
          event_type: "game.dispatch_acquired",
          subject_kind: "game",
          subject_id: "melee",
        }), commandCause),
      ],
      has_more: false,
      next_after_sequence: null,
      kernel_traces: [],
    };

    expect(gameEventTimeline(response)).toEqual([
      {
        event_id: "event-4",
        sequence: 4,
        event_type: "game.dispatch_acquired",
        correlation_id: "sync-1",
        subject_kind: "game",
        subject_id: "melee",
        actor: "runner",
        occurred_at: "2026-08-13T12:00:04.000Z",
        payload_summary: { accepted_sequence: 4 },
        caused_by: commandCause,
        kernel_traces: [],
      },
      {
        event_id: "event-7",
        sequence: 7,
        event_type: "sync.boundary_published",
        correlation_id: "sync-1",
        subject_kind: "sync_workflow",
        subject_id: "sync-1",
        actor: "operator",
        occurred_at: "2026-08-13T12:00:07.000Z",
        payload_summary: { accepted_sequence: 7 },
        caused_by: causeEvent,
        kernel_traces: [],
      },
    ]);
  });

  test("supports zero, one, or many kernel links and retains each server href unchanged", () => {
    const href = "/workspace/trace?gameId=melee&sessionId=session-1&traceId=trace-6&containerId=container-6";
    const kernelTrace: GameEventKernelTraceProjection = {
      event_id: "event-6",
      href,
      app_session_id: "cycle-1",
      container_id: "container-6",
      kernel_event_id: "kernel-event-6a",
    };
    const secondKernelTrace: GameEventKernelTraceProjection = {
      event_id: "event-6",
      href: "/workspace/trace?gameId=melee&traceId=trace-6b&containerId=container-6b",
      app_session_id: "cycle-1",
      container_id: "container-6b",
      kernel_event_id: "kernel-event-6b",
    };
    const response: GameEventReconstructionPage = {
      game_id: "melee",
      correlation_id: "run-1",
      events: [
        reconstructed(event(5, "run-1"), { kind: "command", command_id: "command-5" }),
        reconstructed(event(6, "run-1"), { kind: "command", command_id: "command-6" }),
      ],
      has_more: false,
      next_after_sequence: null,
      kernel_traces: [kernelTrace, secondKernelTrace],
    };

    const timeline = gameEventTimeline(response);
    expect(timeline[0]?.kernel_traces).toEqual([]);
    expect(timeline[1]?.kernel_traces).toEqual([kernelTrace, secondKernelTrace]);
    expect(timeline[1]?.kernel_traces.map((trace) => trace.href)).toEqual([
      href,
      secondKernelTrace.href,
    ]);
  });
});

describe("trace URL identity", () => {
  test("changes event and trace selectors without dropping game/cycle/trace/container identity", () => {
    const current = "http://localhost/workspace/trace?gameId=melee&sessionId=cycle-1&traceId=trace-1&containerId=container-1&panel=detail";
    const eventUrl = gameEventSelectionUrl(current, "sync-9", "event-9");
    const eventParams = new URL(eventUrl, current).searchParams;

    expect(Object.fromEntries(eventParams)).toEqual({
      gameId: "melee",
      sessionId: "cycle-1",
      traceId: "trace-1",
      containerId: "container-1",
      panel: "detail",
      correlation_id: "sync-9",
    });
    expect(new URL(eventUrl, current).hash).toBe("#game-event-event-9");

    const traceUrl = traceSelectionUrl(eventUrl, {
      sessionId: "cycle-2",
      traceId: "trace-2",
      containerId: "container-2",
    });
    const traceParams = new URL(traceUrl, current).searchParams;
    expect(Object.fromEntries(traceParams)).toEqual({
      gameId: "melee",
      sessionId: "cycle-2",
      traceId: "trace-2",
      containerId: "container-2",
      panel: "detail",
      correlation_id: "sync-9",
    });
  });

  test("clears only game-event identity when a requested correlation is unavailable", () => {
    const current = "http://localhost/workspace/trace?gameId=melee&sessionId=cycle-1&traceId=trace-1&containerId=container-1&correlation_id=old#game-event-event-old";
    const next = new URL(gameEventSelectionUrl(current, null, null), current);

    expect(next.searchParams.get("gameId")).toBe("melee");
    expect(next.searchParams.get("sessionId")).toBe("cycle-1");
    expect(next.searchParams.get("traceId")).toBe("trace-1");
    expect(next.searchParams.get("containerId")).toBe("container-1");
    expect(next.searchParams.has("correlation_id")).toBeFalse();
    expect(next.hash).toBe("");
  });

  test("uses the server href for trace identity while retaining event context", () => {
    const current = "http://localhost/workspace/trace?gameId=melee&sessionId=session-1&traceId=old-trace&containerId=old-container&correlation_id=old#game-event-event-old";
    const serverHref = "/workspace/trace?traceId=linked-trace&containerId=linked-container&kernelPanel=event";
    const selection = kernelTraceSelectionUrl(serverHref, current, {
      gameId: "melee",
      sessionId: "session-2",
      correlationId: "sync-9",
      eventId: "event/9",
    });
    expect(selection).not.toBeNull();
    const next = new URL(selection!, current);

    expect(Object.fromEntries(next.searchParams)).toEqual({
      traceId: "linked-trace",
      containerId: "linked-container",
      kernelPanel: "event",
      gameId: "melee",
      sessionId: "session-2",
      correlation_id: "sync-9",
    });
    expect(next.hash).toBe(`#${gameEventAnchorId("event/9")}`);
  });

  test("does not invent missing trace identity or replace identity already in a local server href", () => {
    const current = "http://localhost/workspace/trace?gameId=old&sessionId=old-session&traceId=old-trace&containerId=old-container";
    const serverHref = "/workspace/trace?gameId=server-game&sessionId=server-session&kernelPanel=event";
    const selection = kernelTraceSelectionUrl(serverHref, current, {
      gameId: "melee",
      sessionId: "session-2",
      correlationId: "run-2",
      eventId: "event-2",
    });
    expect(selection).not.toBeNull();
    const next = new URL(selection!, current);

    expect(next.origin).toBe("http://localhost");
    expect(next.searchParams.get("gameId")).toBe("server-game");
    expect(next.searchParams.get("sessionId")).toBe("server-session");
    expect(next.searchParams.has("traceId")).toBeFalse();
    expect(next.searchParams.has("containerId")).toBeFalse();
    expect(next.searchParams.get("correlation_id")).toBe("run-2");
    expect(next.hash).toBe("#game-event-event-2");
  });

  test("rejects unsafe, off-origin, credentialed, and non-trace server hrefs", () => {
    const current = "https://localhost/workspace/trace?gameId=melee";
    const context = {
      gameId: "melee",
      sessionId: "cycle-1",
      correlationId: "run-1",
      eventId: "event-1",
    };
    const unsafe = [
      "https://localhost/workspace/trace?traceId=absolute",
      "https://kernel.example/workspace/trace?traceId=external",
      "//kernel.example/workspace/trace?traceId=external",
      "javascript:alert(1)",
      "data:text/html,unsafe",
      "https://user:password@localhost/workspace/trace?traceId=credentialed",
      "/api/events?traceId=wrong-path",
      "/workspace/trace\\?traceId=backslash",
      "/workspace/trace%0a?traceId=newline",
      "/workspace/trace?next=%252e%252e%252fprivate",
      "/workspace/trace?bad=%zz",
      "   ",
    ];

    for (const href of unsafe) {
      expect(kernelTraceSelectionUrl(href, current, context)).toBeNull();
      expect(isSafeLocalTraceHref(href, current)).toBeFalse();
    }
    expect(isSafeLocalTraceHref("/workspace/trace?traceId=local", current)).toBeTrue();
  });
});
