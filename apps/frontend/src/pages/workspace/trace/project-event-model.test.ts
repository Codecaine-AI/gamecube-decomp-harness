/// <reference types="bun-types" />

import { describe, expect, test } from "bun:test";
import type {
  ProjectEventDto,
  ProjectEventKernelTraceProjection,
  ProjectEventReconstructionPage,
  ReconstructedProjectEvent,
} from "@/lib/api-types";
import {
  chooseProjectEventCorrelation,
  isSafeLocalTraceHref,
  isSelectedProjectEvent,
  kernelTraceSelectionUrl,
  mergeProjectEventPages,
  mergeProjectEventReconstructionPages,
  projectEventAnchorAvailability,
  projectEventAnchorId,
  projectEventReconstructionSelection,
  projectEventSelectionUrl,
  projectEventTimeline,
  projectEventUrlSelection,
  projectEventWorkflowOptions,
  selectedProjectEventCorrelation,
  selectedProjectEventIdFromHash,
  traceSelectionUrl,
} from "./project-event-model";

function event(
  sequence: number,
  correlation_id: string,
  overrides: Partial<ProjectEventDto> = {},
): ProjectEventDto {
  return {
    event_id: `event-${sequence}`,
    sequence,
    event_type: "run.epoch_integrated",
    schema_version: 1,
    project_id: "melee",
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
  source: ProjectEventDto,
  caused_by: ReconstructedProjectEvent["caused_by"],
): ReconstructedProjectEvent {
  return { ...source, caused_by };
}

describe("project event workflow selection", () => {
  test("groups correlations from the event list and selects the newest workflow by default", () => {
    const options = projectEventWorkflowOptions([
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
    expect(chooseProjectEventCorrelation(options, "run-1")).toBe("run-1");
    expect(chooseProjectEventCorrelation(options, "missing")).toBe("sync-1");
    expect(chooseProjectEventCorrelation([], "run-1")).toBeNull();
  });

  test("offers only run, sync, campaign, and session workflows inferred from accepted evidence", () => {
    const options = projectEventWorkflowOptions([
      event(1, "command-only", {
        event_type: "knowledge.revision_advanced",
        subject_kind: "project_knowledge",
        subject_id: "melee",
      }),
      event(6, "unregistered-campaign", {
        event_type: "pr.campaign_opened",
        subject_kind: "campaign" as never,
        subject_id: "not-a-server-subject-kind",
      }),
      event(2, "campaign-1", {
        event_type: "pr.series_prepared",
        subject_kind: "pr_series",
        subject_id: "series-1",
      }),
      event(3, "campaign-1", {
        event_type: "pr.campaign_opened",
        subject_kind: "pr_campaign",
        subject_id: "campaign-1",
      }),
      event(4, "session-1", {
        event_type: "session.opened",
        subject_kind: "session",
        subject_id: "session-1",
      }),
      event(5, "sync-dispatch", {
        event_type: "project.dispatch_requested",
        subject_kind: "project",
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
      { workflow_kind: "session", workflow_id: "session-1", correlation_id: "session-1", event_count: 1 },
      { workflow_kind: "campaign", workflow_id: "campaign-1", correlation_id: "campaign-1", event_count: 2 },
    ]);
  });

  test("rejects a correlation with conflicting workflow identities", () => {
    expect(projectEventWorkflowOptions([
      event(1, "conflict", { subject_kind: "run", subject_id: "run-1" }),
      event(2, "conflict", { subject_kind: "sync_workflow", subject_id: "sync-1" }),
    ])).toEqual([]);
  });

  test("does not double-count an event repeated by list and reconstruction DTOs", () => {
    const repeated = event(1, "run-1");
    expect(projectEventWorkflowOptions([repeated, repeated])).toEqual([{
      workflow_kind: "run",
      workflow_id: "run-1",
      correlation_id: "run-1",
      event_count: 1,
      first_sequence: 1,
      last_sequence: 1,
    }]);
  });

  test("reads only the snake_case correlation selector", () => {
    expect(selectedProjectEventCorrelation("?correlation_id=sync-1&correlationId=wrong")).toBe("sync-1");
    expect(selectedProjectEventCorrelation("?correlationId=wrong")).toBeNull();
  });
});

describe("project event hash selection", () => {
  test("parses a canonical anchor together with its reconstruction correlation", () => {
    const hash = `#${projectEventAnchorId("event/9")}`;

    expect(selectedProjectEventIdFromHash(hash)).toBe("event/9");
    expect(projectEventUrlSelection("?projectId=melee&correlation_id=sync-9", hash)).toEqual({
      correlationId: "sync-9",
      eventId: "event/9",
    });
  });

  test("rejects empty, malformed, non-canonical, and unsafe project-event hashes", () => {
    const invalidHashes = [
      "",
      "#event-1",
      "#project-event-",
      "#project-event-event%",
      "#project-event-event%2f9",
      "#project-event-event%252F9",
      "#project-event-%2Fevent-9",
      "#project-event-event%209",
      "#project-event-event-9?panel=detail",
      "#project-event-%E2%98%83",
    ];

    for (const hash of invalidHashes) {
      expect(selectedProjectEventIdFromHash(hash)).toBeNull();
    }
    expect(projectEventUrlSelection("?correlation_id=run-1", "#project-event-event%"))
      .toEqual({ correlationId: "run-1", eventId: null });
  });

  test("matches accessible pressed state only for the exact correlation and event identity", () => {
    const selection = { correlationId: "run-1", eventId: "event-2" };

    expect(isSelectedProjectEvent(event(2, "run-1"), selection)).toBeTrue();
    expect(isSelectedProjectEvent(event(2, "run-2"), selection)).toBeFalse();
    expect(isSelectedProjectEvent(event(3, "run-1"), selection)).toBeFalse();
    expect(isSelectedProjectEvent(event(2, "run-1"), { ...selection, eventId: null })).toBeFalse();
  });
});

describe("project event continuation merging", () => {
  test("deduplicates list pages by event id and restores ascending sequence order", () => {
    const first = event(3, "run-1", { payload_summary: { status: "first" } });
    const repeated = event(3, "run-1", { payload_summary: { status: "repeated" } });

    const merged = mergeProjectEventPages(
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
    const first: ProjectEventReconstructionPage = {
      project_id: "melee",
      correlation_id: "run-1",
      events: [reconstructed(event(2, "run-1"), cause), reconstructed(event(1, "run-1"), cause)],
      has_more: true,
      next_after_sequence: 2,
      kernel_traces: [trace],
    };
    const next: ProjectEventReconstructionPage = {
      project_id: "melee",
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

    const merged = mergeProjectEventReconstructionPages(first, next);

    expect(merged.events.map((item) => item.sequence)).toEqual([1, 2, 3, 4]);
    expect(merged.kernel_traces.map((item) => item.kernel_event_id)).toEqual([
      "kernel-event-1",
      "kernel-event-4",
    ]);
    expect(merged).toMatchObject({ has_more: false, next_after_sequence: null });
  });

  test("rejects reconstruction pages from a different identity", () => {
    const page: ProjectEventReconstructionPage = {
      project_id: "melee",
      correlation_id: "run-1",
      events: [],
      has_more: false,
      next_after_sequence: null,
      kernel_traces: [],
    };

    expect(() => mergeProjectEventReconstructionPages(page, {
      ...page,
      correlation_id: "sync-1",
    })).toThrow("different projects or correlations");
  });

  test("guides explicit continuation until a selected event is loaded", () => {
    const cause = { kind: "command" as const, command_id: "command" };
    const selection = { correlationId: "run-1", eventId: "event-3" };
    const first: ProjectEventReconstructionPage = {
      project_id: "melee",
      correlation_id: "run-1",
      events: [reconstructed(event(1, "run-1"), cause)],
      has_more: true,
      next_after_sequence: 1,
      kernel_traces: [],
    };

    expect(projectEventAnchorAvailability(selection, null)).toBe("awaiting-reconstruction");
    expect(projectEventAnchorAvailability(selection, { ...first, correlation_id: "run-2" }))
      .toBe("awaiting-reconstruction");
    expect(projectEventAnchorAvailability(selection, first)).toBe("continuation-available");

    const second: ProjectEventReconstructionPage = {
      ...first,
      events: [
        reconstructed(event(2, "run-1"), cause),
        reconstructed(event(3, "run-1"), cause),
      ],
      has_more: false,
      next_after_sequence: null,
    };
    const loaded = mergeProjectEventReconstructionPages(first, second);

    expect(projectEventAnchorAvailability(selection, loaded)).toBe("loaded");
    expect(projectEventAnchorAvailability(
      { correlationId: "run-1", eventId: "missing" },
      loaded,
    )).toBe("missing");
    expect(projectEventAnchorAvailability(
      { correlationId: "run-1", eventId: null },
      loaded,
    )).toBe("unselected");
  });
});

describe("project event lifecycle projection", () => {
  test("maps a clicked timeline event to its reconstruction correlation and detail anchor", () => {
    expect(projectEventReconstructionSelection(event(9, "campaign-9", {
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
      event_type: "project.dispatch_released",
      correlation_id: "run-1",
      subject_kind: "project" as const,
      subject_id: "melee",
    };
    const commandCause = { kind: "command" as const, command_id: "command-sync-start" };
    const response: ProjectEventReconstructionPage = {
      project_id: "melee",
      correlation_id: "sync-1",
      events: [
        reconstructed(event(7, "sync-1", {
          event_type: "sync.boundary_published",
          actor: "operator",
          subject_kind: "sync_workflow",
          subject_id: "sync-1",
        }), causeEvent),
        reconstructed(event(4, "sync-1", {
          event_type: "project.dispatch_acquired",
          subject_kind: "project",
          subject_id: "melee",
        }), commandCause),
      ],
      has_more: false,
      next_after_sequence: null,
      kernel_traces: [],
    };

    expect(projectEventTimeline(response)).toEqual([
      {
        event_id: "event-4",
        sequence: 4,
        event_type: "project.dispatch_acquired",
        correlation_id: "sync-1",
        subject_kind: "project",
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
    const href = "/workspace/trace?projectId=melee&sessionId=session-1&traceId=trace-6&containerId=container-6";
    const kernelTrace: ProjectEventKernelTraceProjection = {
      event_id: "event-6",
      href,
      app_session_id: "session-1",
      container_id: "container-6",
      kernel_event_id: "kernel-event-6a",
    };
    const secondKernelTrace: ProjectEventKernelTraceProjection = {
      event_id: "event-6",
      href: "/workspace/trace?projectId=melee&traceId=trace-6b&containerId=container-6b",
      app_session_id: "session-1",
      container_id: "container-6b",
      kernel_event_id: "kernel-event-6b",
    };
    const response: ProjectEventReconstructionPage = {
      project_id: "melee",
      correlation_id: "run-1",
      events: [
        reconstructed(event(5, "run-1"), { kind: "command", command_id: "command-5" }),
        reconstructed(event(6, "run-1"), { kind: "command", command_id: "command-6" }),
      ],
      has_more: false,
      next_after_sequence: null,
      kernel_traces: [kernelTrace, secondKernelTrace],
    };

    const timeline = projectEventTimeline(response);
    expect(timeline[0]?.kernel_traces).toEqual([]);
    expect(timeline[1]?.kernel_traces).toEqual([kernelTrace, secondKernelTrace]);
    expect(timeline[1]?.kernel_traces.map((trace) => trace.href)).toEqual([
      href,
      secondKernelTrace.href,
    ]);
  });
});

describe("trace URL identity", () => {
  test("changes event and trace selectors without dropping project/session/trace/container identity", () => {
    const current = "http://localhost/workspace/trace?projectId=melee&sessionId=session-1&traceId=trace-1&containerId=container-1&panel=detail";
    const eventUrl = projectEventSelectionUrl(current, "sync-9", "event-9");
    const eventParams = new URL(eventUrl, current).searchParams;

    expect(Object.fromEntries(eventParams)).toEqual({
      projectId: "melee",
      sessionId: "session-1",
      traceId: "trace-1",
      containerId: "container-1",
      panel: "detail",
      correlation_id: "sync-9",
    });
    expect(new URL(eventUrl, current).hash).toBe("#project-event-event-9");

    const traceUrl = traceSelectionUrl(eventUrl, {
      sessionId: "session-2",
      traceId: "trace-2",
      containerId: "container-2",
    });
    const traceParams = new URL(traceUrl, current).searchParams;
    expect(Object.fromEntries(traceParams)).toEqual({
      projectId: "melee",
      sessionId: "session-2",
      traceId: "trace-2",
      containerId: "container-2",
      panel: "detail",
      correlation_id: "sync-9",
    });
  });

  test("clears only project-event identity when a requested correlation is unavailable", () => {
    const current = "http://localhost/workspace/trace?projectId=melee&sessionId=session-1&traceId=trace-1&containerId=container-1&correlation_id=old#project-event-event-old";
    const next = new URL(projectEventSelectionUrl(current, null, null), current);

    expect(next.searchParams.get("projectId")).toBe("melee");
    expect(next.searchParams.get("sessionId")).toBe("session-1");
    expect(next.searchParams.get("traceId")).toBe("trace-1");
    expect(next.searchParams.get("containerId")).toBe("container-1");
    expect(next.searchParams.has("correlation_id")).toBeFalse();
    expect(next.hash).toBe("");
  });

  test("uses the server href for trace identity while retaining event context", () => {
    const current = "http://localhost/workspace/trace?projectId=melee&sessionId=session-1&traceId=old-trace&containerId=old-container&correlation_id=old#project-event-event-old";
    const serverHref = "/workspace/trace?traceId=linked-trace&containerId=linked-container&kernelPanel=event";
    const selection = kernelTraceSelectionUrl(serverHref, current, {
      projectId: "melee",
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
      projectId: "melee",
      sessionId: "session-2",
      correlation_id: "sync-9",
    });
    expect(next.hash).toBe(`#${projectEventAnchorId("event/9")}`);
  });

  test("does not invent missing trace identity or replace identity already in a local server href", () => {
    const current = "http://localhost/workspace/trace?projectId=old&sessionId=old-session&traceId=old-trace&containerId=old-container";
    const serverHref = "/workspace/trace?projectId=server-project&sessionId=server-session&kernelPanel=event";
    const selection = kernelTraceSelectionUrl(serverHref, current, {
      projectId: "melee",
      sessionId: "session-2",
      correlationId: "run-2",
      eventId: "event-2",
    });
    expect(selection).not.toBeNull();
    const next = new URL(selection!, current);

    expect(next.origin).toBe("http://localhost");
    expect(next.searchParams.get("projectId")).toBe("server-project");
    expect(next.searchParams.get("sessionId")).toBe("server-session");
    expect(next.searchParams.has("traceId")).toBeFalse();
    expect(next.searchParams.has("containerId")).toBeFalse();
    expect(next.searchParams.get("correlation_id")).toBe("run-2");
    expect(next.hash).toBe("#project-event-event-2");
  });

  test("rejects unsafe, off-origin, credentialed, and non-trace server hrefs", () => {
    const current = "https://localhost/workspace/trace?projectId=melee";
    const context = {
      projectId: "melee",
      sessionId: "session-1",
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
