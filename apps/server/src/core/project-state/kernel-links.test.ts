import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import * as kernelSchema from "@agent-kernel/db/schema";
import { PROJECT_EVENTS_DDL } from "@server/core/orchestrator-state/storage/ddl";
import { drizzle } from "drizzle-orm/postgres-js";

import {
  buildProjectKernelTraceQuery,
  enrichProjectEventReconstruction,
  enrichProjectEventReconstructionFromKernelReader,
  indexKernelTraceLinkages,
  KernelTraceReadError,
  kernelTraceLinkagesFromObservations,
  readKernelTraceLinkagesFromConfiguredReader,
  readProjectKernelAppSessionIds,
  resolveProjectEventTraceLinkage,
  safeKernelTraceHref,
  type KernelTraceEventObservation,
  type KernelTraceLinkage,
} from "./kernel-links.js";

const reconstruction = {
  project_id: "melee",
  correlation_id: "session-1",
  events: [
    { event_id: "event-1", event_type: "session.opened" },
    { event_id: "event-2", event_type: "session.preparing" },
  ],
  kernel_traces: [],
};

function linkage(
  kernelEventId: string,
  containerId = "container-1",
  projectEventId = "event-1",
): KernelTraceLinkage {
  return {
    project_event_id: projectEventId,
    app_session_id: "project-session:session-1",
    container_id: containerId,
    kernel_event_id: kernelEventId,
    trace_url: `/workspace/trace?containerId=${encodeURIComponent(containerId)}`,
  };
}

describe("kernel trace project-event projection", () => {
  test("projects an empty reconstruction kernel_traces array when telemetry is missing", () => {
    expect(
      enrichProjectEventReconstruction(
        reconstruction,
        indexKernelTraceLinkages([]),
      ).kernel_traces,
    ).toEqual([]);
  });

  test("projects one E2-compatible deep link and renames trace_url to href", () => {
    expect(
      enrichProjectEventReconstruction(
        reconstruction,
        indexKernelTraceLinkages([linkage("kernel-event-1")]),
      ).kernel_traces,
    ).toEqual([
      {
        event_id: "event-1",
        kernel_event_id: "kernel-event-1",
        app_session_id: "project-session:session-1",
        container_id: "container-1",
        href: "/workspace/trace?containerId=container-1",
      },
    ]);
  });

  test("retains multiple links in reconstruction event order", () => {
    expect(
      enrichProjectEventReconstruction(
        reconstruction,
        indexKernelTraceLinkages([
          linkage("kernel-event-3", "container-3", "event-2"),
          linkage("kernel-event-1"),
          linkage("kernel-event-2", "container-2"),
        ]),
      ).kernel_traces.map((link) => [link.event_id, link.kernel_event_id]),
    ).toEqual([
      ["event-1", "kernel-event-1"],
      ["event-1", "kernel-event-2"],
      ["event-2", "kernel-event-3"],
    ]);
  });

  test("maps only kernel observations linked to requested project events", () => {
    const observation = (
      kernelEventId: string,
      projectEventId: string | null,
    ): KernelTraceEventObservation => ({
      app_session_id: "project-session:session-1",
      container_id: `container-${kernelEventId}`,
      event_data: projectEventId === null
        ? { projectId: "melee" }
        : { projectId: "melee", project_event_id: projectEventId },
      kernel_event_id: kernelEventId,
      trace_url: `/workspace/trace?containerId=container-${kernelEventId}`,
    });

    expect(
      kernelTraceLinkagesFromObservations(
        [
          observation("kernel-event-1", "event-1"),
          observation("kernel-event-2", "event-2"),
          observation("kernel-event-unrelated", "event-9"),
          observation("kernel-event-unlinked", null),
        ],
        "melee",
        ["event-1", "event-2"],
      ).map((link) => [link.project_event_id, link.kernel_event_id]),
    ).toEqual([
      ["event-1", "kernel-event-1"],
      ["event-2", "kernel-event-2"],
    ]);
  });

  test("rejects a cross-project collision with the same requested event id", () => {
    const observation = (eventData: Record<string, unknown>): KernelTraceEventObservation => ({
      app_session_id: "project-session:session-1",
      container_id: "container-1",
      event_data: { ...eventData, project_event_id: "event-1" },
      kernel_event_id: `kernel-${JSON.stringify(eventData)}`,
      trace_url: "/workspace/trace?projectId=melee&containerId=container-1",
    });

    const links = kernelTraceLinkagesFromObservations(
      [
        observation({}),
        observation({ projectId: "other" }),
        observation({ projectId: "melee", project_id: "other" }),
        observation({ projectId: "melee" }),
        observation({ projectId: "melee", project_id: "melee" }),
      ],
      "melee",
      ["event-1"],
    );
    expect(links).toHaveLength(2);
    expect(links.map((link) => link.kernel_event_id)).toEqual([
      'kernel-{"projectId":"melee"}',
      'kernel-{"projectId":"melee","project_id":"melee"}',
    ]);
  });

  test("builds an indexed production query scoped by session, project, and event ids", () => {
    const db = drizzle.mock({ schema: kernelSchema });
    const query = buildProjectKernelTraceQuery(
      db,
      "melee",
      ["event-1", "event-2"],
      ["11111111-1111-5111-8111-111111111111"],
    );

    const built = query.toSQL();
    expect(built.sql).toContain('"trace_events"."app_session_id" in ($1)');
    expect(built.sql).toContain(`"trace_events"."event_data"->>'projectId' = $2`);
    expect(built.sql).toContain(`"trace_events"."event_data"->>'project_event_id' in ($3, $4)`);
    expect(built.sql).toContain(
      'order by "trace_events"."timestamp", "trace_events"."id"',
    );
    expect(built.params.slice(0, 4)).toEqual([
      "11111111-1111-5111-8111-111111111111",
      "melee",
      "event-1",
      "event-2",
    ]);
  });

  test("reads normalized app-session UUIDs from only the requested project", () => {
    const db = new Database(":memory:");
    db.exec(`
      CREATE TABLE project_sessions (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        kernel_trace_json TEXT NOT NULL
      )
    `);
    const insert = db.query(
      "INSERT INTO project_sessions (id, project_id, kernel_trace_json) VALUES (?, ?, ?)",
    );
    insert.run("melee-1", "melee", JSON.stringify({
      app_session_id: " 11111111-1111-5111-8111-11111111111A ",
    }));
    insert.run("melee-duplicate", "melee", JSON.stringify({
      app_session_id: "11111111-1111-5111-8111-11111111111a",
    }));
    insert.run("melee-invalid", "melee", JSON.stringify({
      app_session_id: "project-session:not-a-postgres-uuid",
    }));
    insert.run("melee-malformed", "melee", "not-json");
    insert.run("other-1", "other", JSON.stringify({
      app_session_id: "22222222-2222-5222-8222-222222222222",
    }));

    try {
      expect(readProjectKernelAppSessionIds(db, "melee")).toEqual([
        "11111111-1111-5111-8111-11111111111a",
      ]);
    } finally {
      db.close();
    }
  });

  test("returns no telemetry without a configured reader or indexed session scope", async () => {
    let initializations = 0;
    const initialize = async () => {
      initializations += 1;
      return {};
    };

    expect(await readKernelTraceLinkagesFromConfiguredReader(
      null,
      ["11111111-1111-5111-8111-111111111111"],
      ["event-1"],
      initialize,
      async () => [linkage("kernel-event-1")],
    )).toEqual([]);
    expect(await readKernelTraceLinkagesFromConfiguredReader(
      "postgres://configured",
      [],
      ["event-1"],
      initialize,
      async () => [linkage("kernel-event-1")],
    )).toEqual([]);
    expect(initializations).toBe(0);
  });

  test.each([
    {
      label: "runtime initialization returns null",
      initialize: async () => null,
      read: async () => [linkage("kernel-event-1")],
    },
    {
      label: "configured reader rejects",
      initialize: async () => ({}),
      read: async () => {
        throw new Error("postgres unavailable");
      },
    },
    {
      label: "configured reader returns malformed data",
      initialize: async () => ({}),
      read: async () => ({ invalid: true }) as unknown as KernelTraceLinkage[],
    },
    {
      label: "linkage mapper rejects an unsafe href",
      initialize: async () => ({}),
      read: async () => kernelTraceLinkagesFromObservations([{
        app_session_id: "11111111-1111-5111-8111-111111111111",
        container_id: "container-1",
        event_data: { projectId: "melee", project_event_id: "event-1" },
        kernel_event_id: "kernel-event-1",
        trace_url: "https://evil.example/workspace/trace",
      }], "melee", ["event-1"]),
    },
  ])("propagates a stable typed read failure when $label", async ({ initialize, read }) => {
    const promise = readKernelTraceLinkagesFromConfiguredReader(
      "postgres://configured",
      ["11111111-1111-5111-8111-111111111111"],
      ["event-1"],
      initialize,
      read,
    );
    await expect(promise).rejects.toBeInstanceOf(KernelTraceReadError);
    await expect(promise).rejects.toThrow("Kernel trace linkage read failed");
  });

  test.each([
    "https://evil.example/workspace/trace",
    "//evil.example/workspace/trace",
    "/trace?containerId=1",
    "/workspace/trace/../admin",
    "/workspace/trace?next=../admin",
    "/workspace/trace?next=%252e%252e%252fadmin",
    "/workspace/trace?value=%0d%0aLocation%3Aevil",
    "/workspace/trace?value=%zz",
    "/workspace\\trace?containerId=1",
  ])("rejects unsafe kernel href %s", (href) => {
    expect(() => safeKernelTraceHref(href)).toThrow(
      "safe relative /workspace/trace link",
    );
    expect(() => indexKernelTraceLinkages([{ ...linkage("kernel-event-1"), trace_url: href }])).toThrow(
      "safe relative /workspace/trace link",
    );
  });

  test("accepts and canonicalizes a server-shaped relative workspace trace href", () => {
    expect(safeKernelTraceHref(
      "/workspace/trace?projectId=melee&traceId=session%2F1&containerId=container-1",
    )).toBe(
      "/workspace/trace?projectId=melee&traceId=session%2F1&containerId=container-1",
    );
  });

  test("injects the kernel reader without coupling reconstruction to kernel infrastructure", async () => {
    const calls: string[][] = [];
    const enriched = await enrichProjectEventReconstructionFromKernelReader(
      reconstruction,
      async (projectEventIds) => {
        calls.push([...projectEventIds]);
        return [linkage("kernel-event-2", "container-2", "event-2")];
      },
    );

    expect(calls).toEqual([["event-1", "event-2"]]);
    expect(enriched.kernel_traces).toEqual([{
      event_id: "event-2",
      app_session_id: "project-session:session-1",
      container_id: "container-2",
      kernel_event_id: "kernel-event-2",
      href: "/workspace/trace?containerId=container-2",
    }]);
  });

  test("scopes SQLite event and cause resolution by project id", () => {
    const db = new Database(":memory:");
    db.exec(PROJECT_EVENTS_DDL);
    const insert = (
      eventId: string,
      projectId: string,
      causationId: string,
    ) => db.query(`
      INSERT INTO project_events (
        event_id, event_type, schema_version, project_id,
        subject_kind, subject_id, correlation_id, causation_id,
        trace_id, span_id, parent_span_id, actor, occurred_at, payload_json
      ) VALUES (?, 'run.epoch_integrated', 1, ?, 'run', 'run-1', 'run-1', ?,
        'trace-1', 'span-1', 'parent-1', 'runner', '2026-08-13T12:00:00.000Z', '{}')
    `).run(eventId, projectId, causationId);

    try {
      insert("other-cause", "other", "command-other");
      insert("melee-event", "melee", "other-cause");
      expect(resolveProjectEventTraceLinkage(db, "melee", "melee-event")).toEqual({
        correlationId: "run-1",
        projectEventId: "melee-event",
        causedByEventId: null,
      });
      expect(() => resolveProjectEventTraceLinkage(db, "other", "melee-event")).toThrow(
        "Project event not found",
      );

      insert("melee-cause", "melee", "command-melee");
      insert("melee-child", "melee", "melee-cause");
      expect(resolveProjectEventTraceLinkage(db, "melee", "melee-child").causedByEventId)
        .toBe("melee-cause");
    } finally {
      db.close();
    }
  });
});
