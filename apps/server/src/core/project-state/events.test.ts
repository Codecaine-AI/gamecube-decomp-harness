import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { StateStore } from "@server/core/orchestrator-state";
import { immediateTransaction, openState } from "@server/core/orchestrator-state";
import {
  appendProjectEvent,
  eventsForSubject,
  latestSequence,
  listProjectEvents,
  type ProjectEventEnvelope,
} from "./events.js";

const tempDirs: string[] = [];

function openTestStore(): StateStore {
  const dir = mkdtempSync(join(tmpdir(), "project-events-"));
  tempDirs.push(dir);
  return openState(dir);
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { force: true, recursive: true });
});

describe("project event log", () => {
  test("rejects blank envelope identifiers and supplied occurrence times", () => {
    const store = openTestStore();
    const envelope: ProjectEventEnvelope = {
      eventType: "test.accepted",
      projectId: "melee",
      subjectKind: "run",
      subjectId: "run-1",
      correlationId: "workflow-run-1",
      causationId: "command-run-1",
      traceId: "trace-run-1",
      spanId: "span-run-1",
      actor: "runner",
      occurredAt: "2026-08-12T16:00:00.000Z",
    };
    const requiredFields = [
      "eventType",
      "projectId",
      "subjectKind",
      "subjectId",
      "correlationId",
      "causationId",
      "traceId",
      "spanId",
      "occurredAt",
    ] as const;

    try {
      for (const field of requiredFields) {
        expect(() =>
          immediateTransaction(store.db, () =>
            appendProjectEvent(store.db, {
              ...envelope,
              [field]: "   ",
            }),
          ),
        ).toThrow(`Project event ${field} must be a nonblank string`);
      }
      expect(listProjectEvents(store.db)).toEqual([]);
    } finally {
      store.db.close();
    }
  });

  test("appends typed event envelopes in monotonic order", () => {
    const store = openTestStore();
    try {
      const appended = immediateTransaction(store.db, () => [
        appendProjectEvent(store.db, {
          eventType: "project.dispatch_requested",
          projectId: "melee",
          subjectKind: "project",
          subjectId: "melee",
          correlationId: "workflow-sync-22",
          causationId: "command-sync-22",
          traceId: "trace-project-melee",
          spanId: "span-request",
          actor: "operator",
          occurredAt: "2026-08-12T16:00:00.000Z",
          payload: { kind: "sync", nested: { requested: true }, revisions: [1, 2] },
        }),
        appendProjectEvent(store.db, {
          eventType: "project.dispatch_acquired",
          schemaVersion: 2,
          projectId: "melee",
          subjectKind: "project",
          subjectId: "melee",
          correlationId: "workflow-sync-22",
          causationId: "event-prior",
          traceId: "trace-project-melee",
          spanId: "span-acquire",
          actor: "runner",
          occurredAt: "2026-08-12T16:00:01.000Z",
        }),
      ]);

      expect(appended[0]?.eventId).toMatch(/^event-[0-9a-f-]{36}$/);
      expect(appended[1]?.sequence).toBe((appended[0]?.sequence ?? 0) + 1);
      expect(latestSequence(store.db)).toBe(appended[1]?.sequence);

      const events = listProjectEvents(store.db);
      expect(events).toHaveLength(2);
      expect(events[0]).toMatchObject({
        eventId: appended[0]?.eventId,
        sequence: appended[0]?.sequence,
        eventType: "project.dispatch_requested",
        schemaVersion: 1,
        projectId: "melee",
        subjectKind: "project",
        subjectId: "melee",
        correlationId: "workflow-sync-22",
        causationId: "command-sync-22",
        traceId: "trace-project-melee",
        spanId: "span-request",
        actor: "operator",
        occurredAt: "2026-08-12T16:00:00.000Z",
        payload: { kind: "sync", nested: { requested: true }, revisions: [1, 2] },
      });
      expect(events[1]?.schemaVersion).toBe(2);
      expect(events[1]?.payload).toEqual({});
    } finally {
      store.db.close();
    }
  });

  test("filters the ordered stream by project, cursor, and subject", () => {
    const store = openTestStore();
    try {
      const sequences = immediateTransaction(store.db, () =>
        [
          { projectId: "melee", subjectKind: "run", subjectId: "run-a" },
          { projectId: "melee", subjectKind: "sync", subjectId: "sync-a" },
          { projectId: "melee", subjectKind: "run", subjectId: "run-a" },
          { projectId: "other", subjectKind: "run", subjectId: "run-a" },
        ].map((subject, index) =>
          appendProjectEvent(store.db, {
            eventType: `test.event_${index}`,
            ...subject,
            correlationId: "correlation",
            causationId: `command-${index}`,
            traceId: "trace",
            spanId: `span-${index}`,
            actor: "agent",
            occurredAt: `2026-08-12T16:00:0${index}.000Z`,
          }).sequence,
        ),
      );

      expect(
        listProjectEvents(store.db, { projectId: "melee", afterSequence: sequences[0], limit: 1 }).map(
          (event) => event.sequence,
        ),
      ).toEqual([sequences[1]]);
      expect(
        eventsForSubject(store.db, "run", "run-a", { projectId: "melee" }).map((event) => event.sequence),
      ).toEqual([sequences[0], sequences[2]]);
      expect(latestSequence(store.db, "melee")).toBe(sequences[2]);
      expect(latestSequence(store.db, "missing")).toBe(0);
    } finally {
      store.db.close();
    }
  });

  test("rolls an appended event back with its caller-owned transaction", () => {
    const store = openTestStore();
    try {
      expect(() =>
        immediateTransaction(store.db, () => {
          appendProjectEvent(store.db, {
            eventType: "project.dispatch_requested",
            projectId: "melee",
            subjectKind: "project",
            subjectId: "melee",
            correlationId: "workflow-run",
            causationId: "command-run",
            traceId: "trace",
            spanId: "span",
            actor: "operator",
          });
          throw new Error("reject transition");
        }),
      ).toThrow("reject transition");

      expect(latestSequence(store.db)).toBe(0);
      expect(listProjectEvents(store.db)).toEqual([]);
    } finally {
      store.db.close();
    }
  });

  test("treats malformed or non-object payload storage as an empty object", () => {
    const store = openTestStore();
    try {
      store.db
        .query(
          `
            INSERT INTO project_events (
              event_id, event_type, project_id, subject_kind, subject_id,
              correlation_id, causation_id, trace_id, span_id, actor,
              occurred_at, payload_json
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `,
        )
        .run(
          "event-malformed",
          "test.malformed",
          "melee",
          "project",
          "melee",
          "correlation",
          "causation",
          "trace",
          "span",
          "external_observer",
          "2026-08-12T16:00:00.000Z",
          "not-json",
        );

      expect(listProjectEvents(store.db)[0]?.payload).toEqual({});
    } finally {
      store.db.close();
    }
  });
});
