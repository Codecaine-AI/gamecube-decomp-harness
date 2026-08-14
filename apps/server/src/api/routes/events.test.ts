import { describe, expect, test } from "bun:test";
import type { ProjectRuntimeContext } from "@server/core/project-registry";
import type {
  ProjectEventQueryInput,
  ProjectEventQueryPage,
  ProjectEventReconstruction,
  ProjectEventReconstructionPageOptions,
} from "@server/core/project-state/event-query";
import { handleEventsApiRoute, type EventsApiRouteDeps } from "./events.js";

interface Calls {
  queries: Array<{ input: ProjectEventQueryInput; stateDir: string }>;
  reconstructions: Array<{
    correlationId: string;
    options: ProjectEventReconstructionPageOptions;
    projectId: string;
    stateDir: string;
  }>;
  requestPaths: number;
}

function routeDeps(options: {
  kernelTraces?: ProjectEventReconstruction["kernel_traces"];
  projectId?: string | null;
  queryError?: Error;
  reconstructionError?: Error;
  requestError?: Error;
} = {}): { calls: Calls; deps: EventsApiRouteDeps } {
  const calls: Calls = { queries: [], reconstructions: [], requestPaths: 0 };
  const page: ProjectEventQueryPage = { events: [], has_more: false, next_after_sequence: null };
  const reconstruction: ProjectEventReconstruction = {
    project_id: options.projectId ?? "melee",
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
      projectContext: {
        requestPaths: () => {
          calls.requestPaths += 1;
          if (options.requestError) throw options.requestError;
          return {
            project: options.projectId === null
              ? null
              : ({
                  projectId: options.projectId ?? "melee",
                  stateDir: "/tmp/state",
                } as ProjectRuntimeContext["project"]),
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
      reconstructEvents: async (stateDir, projectId, correlationId, pageOptions) => {
        if (options.reconstructionError) throw options.reconstructionError;
        calls.reconstructions.push({
          correlationId,
          options: pageOptions,
          projectId,
          stateDir,
        });
        return { ...reconstruction, project_id: projectId, correlation_id: correlationId };
      },
    },
  };
}

describe("events API routes", () => {
  test("parses list filters, defaults the limit, and preserves snake_case output", async () => {
    const { calls, deps } = routeDeps();
    const url = new URL(
      "http://localhost/api/events?correlation_id=sync-1&subject_kind=project&subject_id=melee" +
      "&event_type_prefix=project.dispatch&from_sequence=10&to_sequence=40&after_sequence=12",
    );
    const response = await handleEventsApiRoute(new Request(url), url, deps);

    expect(response?.status).toBe(200);
    expect(calls.requestPaths).toBe(1);
    expect(calls.queries).toEqual([{
      stateDir: "/tmp/state",
      input: {
        projectId: "melee",
        correlationId: "sync-1",
        subject: { kind: "project", id: "melee" },
        eventTypePrefix: "project.dispatch",
        fromSequence: 10,
        toSequence: 40,
        afterSequence: 12,
        limit: 50,
      },
    }]);
    expect(await response?.json()).toEqual({ events: [], has_more: false, next_after_sequence: null });
  });

  const kernelTrace = {
    event_id: "event-1",
    kernel_event_id: "kernel-event-1",
    app_session_id: "app-session-1",
    container_id: "container-1",
    href: "/workspace/trace?projectId=melee&traceId=app-session-1&containerId=container-1",
  };
  const secondKernelTrace = {
    event_id: "event-1",
    kernel_event_id: "kernel-event-2",
    app_session_id: "app-session-1",
    container_id: "container-2",
    href: "/workspace/trace?projectId=melee&traceId=app-session-1&containerId=container-2",
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
      projectId: "melee",
      stateDir: "/tmp/state",
    }]);
    const body = await response?.json();
    expect(body).toEqual({
      project_id: "melee",
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
    ["/api/events?subject_kind=arbitrary&subject_id=run-1", "registered project event subject kind"],
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

  test("rejects path/raw overrides before project resolution", async () => {
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
        error: "Project path and raw payload overrides are not supported",
      });
      expect(calls.requestPaths).toBe(0);
      expect(calls.queries).toEqual([]);
    }
  });

  test("sanitizes context and read failures", async () => {
    const unresolved = routeDeps({
      requestError: new Error("Unknown project at /Users/alice/private/project.json"),
    });
    const getUrl = new URL("http://localhost/api/events");
    const unresolvedResponse = await handleEventsApiRoute(new Request(getUrl), getUrl, unresolved.deps);
    expect(unresolvedResponse?.status).toBe(400);
    expect(await unresolvedResponse?.json()).toEqual({ error: "Invalid project context" });

    const queryFailure = routeDeps({
      queryError: new Error("SQLITE_SCHEMA project_events /private/state/orchestrator.sqlite"),
    });
    const queryResponse = await handleEventsApiRoute(new Request(getUrl), getUrl, queryFailure.deps);
    expect(queryResponse?.status).toBe(500);
    expect(await queryResponse?.json()).toEqual({ error: "Project event read failed" });

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
    expect(await reconstructionResponse?.json()).toEqual({ error: "Project event read failed" });
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
