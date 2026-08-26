import { describe, expect, test } from "bun:test";
import type { GameRuntimeContext } from "@server/core/game-registry";
import type {
  GameEventCorrelationSummary,
  GameEventDescendingQueryInput,
  GameEventDescendingQueryPage,
  GameEventQueryInput,
  GameEventQueryPage,
  GameEventReconstruction,
  GameEventReconstructionPageOptions,
} from "@server/core/harness-state/event-query";
import { handleEventsApiRoute, type EventsApiRouteDeps } from "./events.js";

interface Calls {
  correlations: Array<{ gameId: string; stateDir: string }>;
  descendingQueries: Array<{ input: GameEventDescendingQueryInput; stateDir: string }>;
  queries: Array<{ input: GameEventQueryInput; stateDir: string }>;
  reconstructions: Array<{
    correlationId: string;
    options: GameEventReconstructionPageOptions;
    gameId: string;
    stateDir: string;
  }>;
  requestPaths: number;
}

function routeDeps(options: {
  kernelTraces?: GameEventReconstruction["kernel_traces"];
  gameId?: string | null;
  queryError?: Error;
  descendingQueryError?: Error;
  correlationsError?: Error;
  reconstructionError?: Error;
  requestError?: Error;
} = {}): { calls: Calls; deps: EventsApiRouteDeps } {
  const calls: Calls = {
    correlations: [],
    descendingQueries: [],
    queries: [],
    reconstructions: [],
    requestPaths: 0,
  };
  const page: GameEventQueryPage = { events: [], has_more: false, next_after_sequence: null };
  const descendingPage: GameEventDescendingQueryPage = {
    events: [],
    has_more: true,
    next_before_sequence: 101,
  };
  const correlations: GameEventCorrelationSummary[] = [{
    correlation_id: "sync-1",
    event_count: 12,
    first_sequence: 101,
    last_sequence: 140,
    latest_occurred_at: "2026-08-25T12:00:00.000Z",
    workflow: { kind: "sync", id: "sync-1" },
  }];
  const reconstruction: GameEventReconstruction = {
    game_id: options.gameId ?? "melee",
    correlation_id: "sync-1",
    events: [],
    has_more: false,
    next_after_sequence: null,
    kernel_traces: options.kernelTraces ?? [],
  };
  return {
    calls,
    deps: {
      json: (data, init) => Response.json(data, init),
      gameContext: {
        requestPaths: () => {
          calls.requestPaths += 1;
          if (options.requestError) throw options.requestError;
          return {
            game: options.gameId === null
              ? null
              : ({
                  gameId: options.gameId ?? "melee",
                  stateDir: "/tmp/state",
                } as GameRuntimeContext["game"]),
            repoRoot: "/tmp/repo",
            stateDir: "/tmp/state",
            graphDbPath: "/tmp/graph.sqlite",
            usePathOverrides: false,
          };
        },
      },
      queryEvents: (stateDir, input) => {
        if (options.queryError) throw options.queryError;
        calls.queries.push({ input, stateDir });
        return page;
      },
      queryEventsDescending: (stateDir, input) => {
        if (options.descendingQueryError) throw options.descendingQueryError;
        calls.descendingQueries.push({ input, stateDir });
        return descendingPage;
      },
      listCorrelations: (stateDir, gameId) => {
        if (options.correlationsError) throw options.correlationsError;
        calls.correlations.push({ gameId, stateDir });
        return correlations;
      },
      reconstructEvents: async (stateDir, gameId, correlationId, pageOptions) => {
        if (options.reconstructionError) throw options.reconstructionError;
        calls.reconstructions.push({
          correlationId,
          options: pageOptions,
          gameId,
          stateDir,
        });
        return { ...reconstruction, game_id: gameId, correlation_id: correlationId };
      },
    },
  };
}

describe("events API routes", () => {
  test("parses list filters, defaults the limit, and preserves snake_case output", async () => {
    const { calls, deps } = routeDeps();
    const url = new URL(
      "http://localhost/api/events?correlation_id=sync-1&subject_kind=game&subject_id=melee" +
      "&event_type_prefix=game.dispatch&from_sequence=10&to_sequence=40&after_sequence=12",
    );
    const response = await handleEventsApiRoute(new Request(url), url, deps);

    expect(response?.status).toBe(200);
    expect(calls.requestPaths).toBe(1);
    expect(calls.queries).toEqual([{
      stateDir: "/tmp/state",
      input: {
        gameId: "melee",
        correlationId: "sync-1",
        subject: { kind: "game", id: "melee" },
        eventTypePrefix: "game.dispatch",
        fromSequence: 10,
        toSequence: 40,
        afterSequence: 12,
        limit: 50,
      },
    }]);
    expect(await response?.json()).toEqual({ events: [], has_more: false, next_after_sequence: null });
  });

  test("delegates descending list requests with an exclusive cursor", async () => {
    const { calls, deps } = routeDeps();
    const url = new URL(
      "http://localhost/api/events?order=desc&before_sequence=101&limit=25&correlation_id=sync-1",
    );
    const response = await handleEventsApiRoute(new Request(url), url, deps);

    expect(response?.status).toBe(200);
    expect(calls.descendingQueries).toEqual([{
      stateDir: "/tmp/state",
      input: {
        gameId: "melee",
        correlationId: "sync-1",
        subject: undefined,
        eventTypePrefix: undefined,
        beforeSequence: 101,
        limit: 25,
      },
    }]);
    expect(calls.queries).toEqual([]);
    expect(await response?.json()).toEqual({
      events: [],
      has_more: true,
      next_before_sequence: 101,
    });
  });

  test.each([
    ["order=bogus", 'order must be "asc" or "desc"'],
    ["order=desc&after_sequence=5", "after_sequence cannot be used with order=desc"],
    ["before_sequence=5", "before_sequence requires order=desc"],
    ["order=desc&from_sequence=1", "from_sequence cannot be used with order=desc"],
  ])("rejects incompatible list ordering parameters: %s", async (query, error) => {
    const { calls, deps } = routeDeps();
    const url = new URL(`http://localhost/api/events?${query}`);
    const response = await handleEventsApiRoute(new Request(url), url, deps);

    expect(response?.status).toBe(400);
    expect(await response?.json()).toEqual({ error });
    expect(calls.queries).toEqual([]);
    expect(calls.descendingQueries).toEqual([]);
  });

  test("lists correlations for the resolved game", async () => {
    const { calls, deps } = routeDeps();
    const url = new URL("http://localhost/api/events/correlations?gameId=melee");
    const response = await handleEventsApiRoute(new Request(url), url, deps);

    expect(response?.status).toBe(200);
    expect(calls.correlations).toEqual([{ gameId: "melee", stateDir: "/tmp/state" }]);
    expect(await response?.json()).toEqual({
      game_id: "melee",
      correlations: [{
        correlation_id: "sync-1",
        event_count: 12,
        first_sequence: 101,
        last_sequence: 140,
        latest_occurred_at: "2026-08-25T12:00:00.000Z",
        workflow: { kind: "sync", id: "sync-1" },
      }],
    });
  });

  test("rejects correlation path overrides before game resolution", async () => {
    const { calls, deps } = routeDeps();
    const url = new URL(
      "http://localhost/api/events/correlations?gameId=melee&stateDir=/tmp/private",
    );
    const response = await handleEventsApiRoute(new Request(url), url, deps);

    expect(response?.status).toBe(400);
    expect(await response?.json()).toEqual({
      error: "Game path and raw payload overrides are not supported",
    });
    expect(calls.requestPaths).toBe(0);
    expect(calls.correlations).toEqual([]);
  });

  test("sanitizes correlation read failures", async () => {
    const { deps } = routeDeps({
      correlationsError: new Error("SQLITE_SCHEMA /private/orchestrator.sqlite"),
    });
    const url = new URL("http://localhost/api/events/correlations?gameId=melee");
    const response = await handleEventsApiRoute(new Request(url), url, deps);

    expect(response?.status).toBe(500);
    expect(await response?.json()).toEqual({ error: "Game event read failed" });
  });

  test("returns Allow: GET for POST correlation requests", async () => {
    const { calls, deps } = routeDeps();
    const url = new URL("http://localhost/api/events/correlations?gameId=melee");
    const response = await handleEventsApiRoute(
      new Request(url, { method: "POST" }),
      url,
      deps,
    );

    expect(response?.status).toBe(405);
    expect(response?.headers.get("Allow")).toBe("GET");
    expect(await response?.json()).toEqual({ error: "method not allowed" });
    expect(calls.requestPaths).toBe(0);
  });

  test("ignores unknown event API subpaths", async () => {
    const { deps } = routeDeps();
    const url = new URL("http://localhost/api/events/unknown");
    expect(await handleEventsApiRoute(new Request(url), url, deps)).toBeNull();
  });

  const kernelTrace = {
    event_id: "event-1",
    kernel_event_id: "kernel-event-1",
    app_session_id: "app-session-1",
    container_id: "container-1",
    href: "/workspace/trace?gameId=melee&traceId=app-session-1&containerId=container-1",
  };
  const secondKernelTrace = {
    event_id: "event-1",
    kernel_event_id: "kernel-event-2",
    app_session_id: "app-session-1",
    container_id: "container-2",
    href: "/workspace/trace?gameId=melee&traceId=app-session-1&containerId=container-2",
  };

  test.each([
    ["zero", []],
    ["one", [kernelTrace]],
    ["many", [kernelTrace, secondKernelTrace]],
  ] as const)("reconstructs one required correlation with %s kernel trace cardinality", async (_label, kernelTraces) => {
    const { calls, deps } = routeDeps({ kernelTraces: [...kernelTraces] });
    const url = new URL(
      "http://localhost/api/events/reconstruct?correlation_id=campaign-1&after_sequence=40&limit=25",
    );
    const response = await handleEventsApiRoute(new Request(url), url, deps);

    expect(calls.reconstructions).toEqual([{
      correlationId: "campaign-1",
      options: { afterSequence: 40, limit: 25 },
      gameId: "melee",
      stateDir: "/tmp/state",
    }]);
    const body = await response?.json();
    expect(body).toEqual({
      game_id: "melee",
      correlation_id: "campaign-1",
      events: [],
      has_more: false,
      next_after_sequence: null,
      kernel_traces: [...kernelTraces],
    });
    expect(body.kernel_traces).toHaveLength(kernelTraces.length);
    expect(body.kernel_traces.every((trace: Record<string, unknown>) => (
      typeof trace.href === "string" && !("trace_url" in trace)
    ))).toBe(true);
  });

  test.each([
    ["/api/events?subject_kind=run", "subject_kind and subject_id must be provided together"],
    ["/api/events?subject_kind=&subject_id=run-1", "subject_kind must be a nonblank string"],
    ["/api/events?subject_kind=arbitrary&subject_id=run-1", "registered game event subject kind"],
    ["/api/events?correlation_id=", "correlation_id must be a nonblank string"],
    ["/api/events?event_type_prefix=", "event_type_prefix must be a nonblank string"],
    ["/api/events?limit=0", "limit must be an integer between 1 and 200"],
    ["/api/events?limit=201", "limit must be an integer between 1 and 200"],
    ["/api/events?limit=1.5", "limit must be an integer between 1 and 200"],
    ["/api/events?after_sequence=-1", "after_sequence must be an integer"],
    ["/api/events?from_sequence=9&to_sequence=8", "from_sequence must be less than or equal"],
    ["/api/events/reconstruct", "correlation_id is required"],
    ["/api/events/reconstruct?correlation_id=", "correlation_id must be a nonblank string"],
    ["/api/events/reconstruct?correlation_id=sync-1&limit=201", "limit must be an integer between 1 and 200"],
  ])("returns 400 for %s", async (path, error) => {
    const { calls, deps } = routeDeps();
    const url = new URL(`http://localhost${path}`);
    const response = await handleEventsApiRoute(new Request(url), url, deps);

    expect(response?.status).toBe(400);
    expect((await response?.json()).error).toContain(error);
    expect(calls.queries).toEqual([]);
    expect(calls.reconstructions).toEqual([]);
  });

  test("rejects path/raw overrides before game resolution", async () => {
    for (const query of [
      "stateDir=../../private",
      "repo_root=/Users/alice/private",
      "path=/tmp/state",
      "raw=true",
      "graphDbPath=/tmp/graph.sqlite",
      "usePathOverrides=false",
      "include_payload=true",
    ]) {
      const { calls, deps } = routeDeps();
      const url = new URL(`http://localhost/api/events?${query}`);
      const response = await handleEventsApiRoute(new Request(url), url, deps);
      expect(response?.status).toBe(400);
      expect(await response?.json()).toEqual({
        error: "Game path and raw payload overrides are not supported",
      });
      expect(calls.requestPaths).toBe(0);
      expect(calls.queries).toEqual([]);
    }
  });

  test("sanitizes context and read failures", async () => {
    const unresolved = routeDeps({
      requestError: new Error("Unknown game at /Users/alice/private/game.json"),
    });
    const getUrl = new URL("http://localhost/api/events");
    const unresolvedResponse = await handleEventsApiRoute(new Request(getUrl), getUrl, unresolved.deps);
    expect(unresolvedResponse?.status).toBe(400);
    expect(await unresolvedResponse?.json()).toEqual({ error: "Invalid game context" });

    const queryFailure = routeDeps({
      queryError: new Error("SQLITE_SCHEMA game_events /private/state/orchestrator.sqlite"),
    });
    const queryResponse = await handleEventsApiRoute(new Request(getUrl), getUrl, queryFailure.deps);
    expect(queryResponse?.status).toBe(500);
    expect(await queryResponse?.json()).toEqual({ error: "Game event read failed" });

    const reconstructionFailure = routeDeps({
      reconstructionError: new Error("password=secret postgres schema trace_events"),
    });
    const reconstructUrl = new URL(
      "http://localhost/api/events/reconstruct?correlation_id=sync-1",
    );
    const reconstructionResponse = await handleEventsApiRoute(
      new Request(reconstructUrl),
      reconstructUrl,
      reconstructionFailure.deps,
    );
    expect(reconstructionResponse?.status).toBe(500);
    expect(await reconstructionResponse?.json()).toEqual({ error: "Game event read failed" });
  });

  test("returns Allow: GET for non-GET methods", async () => {
    const getUrl = new URL("http://localhost/api/events");
    const { deps } = routeDeps();
    const postResponse = await handleEventsApiRoute(
      new Request(getUrl, { method: "POST" }),
      getUrl,
      deps,
    );
    expect(postResponse?.status).toBe(405);
    expect(postResponse?.headers.get("Allow")).toBe("GET");
    expect(await postResponse?.json()).toEqual({ error: "method not allowed" });
    expect(await handleEventsApiRoute(new Request("http://localhost/api/other"), new URL("http://localhost/api/other"), deps)).toBeNull();
  });
});
