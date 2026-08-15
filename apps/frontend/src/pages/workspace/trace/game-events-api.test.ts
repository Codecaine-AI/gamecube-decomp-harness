/// <reference types="bun-types" />

import { afterEach, describe, expect, test } from "bun:test";
import {
  GAME_EVENT_PAGE_SIZE,
  GAME_EVENT_RECONSTRUCTION_PAGE_SIZE,
  fetchGameEventReconstruction,
  fetchGameEvents,
} from "@/lib/api";
import type {
  GameEventDto,
  GameEventReconstructionPage,
  ReconstructedGameEvent,
} from "@/lib/api-types";
import {
  mergeGameEventReconstructionPages,
  gameEventAnchorAvailability,
  gameEventReconstructionSelection,
  gameEventSelectionUrl,
  gameEventUrlSelection,
} from "./game-event-model";

const originalFetch = globalThis.fetch;
const form = {
  gameId: "melee",
  usePathOverrides: true,
  repoRoot: "/private/checkout",
  stateDir: "/private/state",
  graphDbPath: "/private/graph.sqlite",
};
const forbiddenEventQueryParams = [
  "repoRoot",
  "stateDir",
  "graphDbPath",
  "usePathOverrides",
  "raw",
  "rawPayload",
  "include_payload",
];

function event(sequence: number): GameEventDto {
  return {
    event_id: `event-${sequence}`,
    sequence,
    event_type: "run.epoch_integrated",
    schema_version: 1,
    game_id: "melee",
    subject_kind: "run",
    subject_id: "run-1",
    correlation_id: "run-1",
    causation_id: `command-${sequence}`,
    trace_id: `trace-${sequence}`,
    span_id: `span-${sequence}`,
    parent_span_id: null,
    actor: "runner",
    occurred_at: `2026-08-13T12:00:0${sequence}.000Z`,
    payload_summary: {
      sequence,
      stateDir: "[REDACTED_PATH]",
      token: "[REDACTED]",
    },
  };
}

function reconstructedEvent(sequence: number): ReconstructedGameEvent {
  return {
    ...event(sequence),
    caused_by: { kind: "command", command_id: `command-${sequence}` },
  };
}

function reconstructionPage(
  events: ReconstructedGameEvent[],
  hasMore: boolean,
  nextAfterSequence: number | null,
  correlationId = "run-1",
): GameEventReconstructionPage {
  return {
    game_id: "melee",
    correlation_id: correlationId,
    events,
    has_more: hasMore,
    next_after_sequence: nextAfterSequence,
    kernel_traces: [],
  };
}

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    headers: { "content-type": "application/json" },
  });
}

function expectCanonicalGameQuery(request: URL): void {
  expect(request.searchParams.get("gameId")).toBe("melee");
  for (const name of forbiddenEventQueryParams) {
    expect(request.searchParams.has(name)).toBeFalse();
  }
}

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("game event API client", () => {
  test("loads one bounded redacted event page and continues only after an explicit call", async () => {
    const requests: URL[] = [];
    const pages = [
      { events: [event(1), event(2)], has_more: true, next_after_sequence: 2 },
      { events: [event(5)], has_more: false, next_after_sequence: null },
    ];
    globalThis.fetch = (async (input: Parameters<typeof fetch>[0]) => {
      requests.push(new URL(String(input), "http://localhost"));
      return jsonResponse(pages.shift());
    }) as unknown as typeof fetch;

    const firstPage = await fetchGameEvents(form);
    expect(firstPage.events.map((item) => item.sequence)).toEqual([1, 2]);
    expect(firstPage.events[0]?.payload_summary).toMatchObject({
      stateDir: "[REDACTED_PATH]",
      token: "[REDACTED]",
    });
    expect(firstPage.events[0]).not.toHaveProperty("payload");
    expect(requests).toHaveLength(1);

    const secondPage = await fetchGameEvents(form, {
      afterSequence: firstPage.next_after_sequence,
    });
    expect(secondPage.events.map((item) => item.sequence)).toEqual([5]);
    expect(requests).toHaveLength(2);
    expect(requests.map((request) => request.pathname)).toEqual(["/api/events", "/api/events"]);
    expect(requests[0]?.searchParams.get("limit")).toBe(String(GAME_EVENT_PAGE_SIZE));
    expect(requests[0]?.searchParams.has("after_sequence")).toBeFalse();
    expect(requests[1]?.searchParams.get("after_sequence")).toBe("2");
    for (const request of requests) expectCanonicalGameQuery(request);
  });

  test("loads reconstruction in bounded pages only after explicit continuation", async () => {
    const requests: URL[] = [];
    const pages = [
      reconstructionPage([reconstructedEvent(1), reconstructedEvent(2)], true, 2),
      reconstructionPage([reconstructedEvent(3)], false, null),
    ];
    globalThis.fetch = (async (input: Parameters<typeof fetch>[0]) => {
      requests.push(new URL(String(input), "http://localhost"));
      return jsonResponse(pages.shift());
    }) as unknown as typeof fetch;

    const firstPage = await fetchGameEventReconstruction(form, "run-1");
    expect(firstPage.events.map((item) => item.sequence)).toEqual([1, 2]);
    expect(firstPage).toMatchObject({ has_more: true, next_after_sequence: 2 });
    expect(gameEventAnchorAvailability(
      { correlationId: "run-1", eventId: "event-3" },
      firstPage,
    )).toBe("continuation-available");
    expect(requests).toHaveLength(1);

    const secondPage = await fetchGameEventReconstruction(form, "run-1", {
      afterSequence: firstPage.next_after_sequence,
    });
    expect(secondPage.events.map((item) => item.sequence)).toEqual([3]);
    expect(gameEventAnchorAvailability(
      { correlationId: "run-1", eventId: "event-3" },
      mergeGameEventReconstructionPages(firstPage, secondPage),
    )).toBe("loaded");
    expect(requests).toHaveLength(2);
    expect(requests[0]?.pathname).toBe("/api/events/reconstruct");
    expect(requests[0]?.searchParams.get("correlation_id")).toBe("run-1");
    expect(requests[0]?.searchParams.get("limit")).toBe(
      String(GAME_EVENT_RECONSTRUCTION_PAGE_SIZE),
    );
    expect(requests[0]?.searchParams.has("after_sequence")).toBeFalse();
    expect(requests[1]?.searchParams.get("after_sequence")).toBe("2");
    for (const request of requests) expectCanonicalGameQuery(request);
  });

  test("rejects invalid response cursors for list and reconstruction pages", async () => {
    let response: unknown = {
      events: [event(3)],
      has_more: true,
      next_after_sequence: 2,
    };
    globalThis.fetch = (async () => jsonResponse(response)) as unknown as typeof fetch;

    await expect(fetchGameEvents(form, { afterSequence: 2 })).rejects.toThrow(
      "did not provide an advancing next_after_sequence",
    );

    response = reconstructionPage([reconstructedEvent(4)], true, 3);
    await expect(fetchGameEventReconstruction(form, "run-1", {
      afterSequence: 3,
    })).rejects.toThrow("did not provide an advancing next_after_sequence");

    response = { events: [], has_more: false, next_after_sequence: 4 };
    await expect(fetchGameEvents(form)).rejects.toThrow("returned a cursor without more events");
  });

  test("rejects invalid requests before fetching", async () => {
    let requests = 0;
    globalThis.fetch = (async () => {
      requests += 1;
      return jsonResponse({ events: [], has_more: false, next_after_sequence: null });
    }) as unknown as typeof fetch;

    await expect(fetchGameEvents(form, { limit: 201 })).rejects.toThrow(
      "Game event page limit must be an integer between 1 and 200",
    );
    await expect(fetchGameEvents(form, { afterSequence: -1 })).rejects.toThrow(
      "Game event afterSequence must be a non-negative safe integer",
    );
    await expect(fetchGameEvents({ gameId: " " })).rejects.toThrow("require a gameId");
    await expect(fetchGameEventReconstruction(form, " ")).rejects.toThrow(
      "requires a correlationId",
    );
    expect(requests).toBe(0);
  });

  test("rejects a reconstruction page with mismatched canonical identity", async () => {
    globalThis.fetch = (async () => jsonResponse({
      ...reconstructionPage([], false, null),
      game_id: "other-game",
    })) as unknown as typeof fetch;

    await expect(fetchGameEventReconstruction(form, "run-1")).rejects.toThrow(
      "mismatched game or correlation identity",
    );
  });

  test("uses the correlation selected by a loaded-event click for reconstruction", async () => {
    const requests: URL[] = [];
    globalThis.fetch = (async (input: Parameters<typeof fetch>[0]) => {
      requests.push(new URL(String(input), "http://localhost"));
      return jsonResponse(reconstructionPage([], false, null, "campaign / 3"));
    }) as unknown as typeof fetch;

    const clickedEvent = event(3);
    clickedEvent.event_id = "campaign-event-3";
    clickedEvent.correlation_id = "campaign / 3";
    const selection = gameEventReconstructionSelection(clickedEvent);
    const target = gameEventSelectionUrl(
      "http://localhost/workspace/trace?gameId=melee&correlation_id=run-1",
      selection.correlationId,
      selection.eventId,
    );
    const targetUrl = new URL(target, "http://localhost");
    const clickedSelection = gameEventUrlSelection(
      targetUrl.search,
      targetUrl.hash,
    );
    expect(clickedSelection).toEqual({
      correlationId: "campaign / 3",
      eventId: "campaign-event-3",
    });
    await fetchGameEventReconstruction(form, clickedSelection.correlationId!);

    expect(requests[0]?.pathname).toBe("/api/events/reconstruct");
    expect(requests[0]?.searchParams.get("correlation_id")).toBe("campaign / 3");
    expect(requests[0]?.searchParams.get("limit")).toBe(
      String(GAME_EVENT_RECONSTRUCTION_PAGE_SIZE),
    );
    expect(targetUrl.hash).toBe("#game-event-campaign-event-3");
    expectCanonicalGameQuery(requests[0]!);
  });
});
