import { Database } from "bun:sqlite";
import { afterEach, describe, expect, test } from "bun:test";
import { FINAL_SCHEMA_DDL } from "@server/core/orchestrator-state/storage/ddl";
import {
  MAX_EVENT_QUERY_LIMIT,
  PAYLOAD_SUMMARY_MAX_ENTRIES,
  PAYLOAD_SUMMARY_MAX_SERIALIZED_BYTES,
  PAYLOAD_SUMMARY_MAX_STRING_LENGTH,
  GameEventPayloadError,
  queryGameEvents,
  recentGameEvents,
  reconstructGameEvents,
} from "./event-query.js";

interface FixtureEvent {
  actor?: string;
  causationId?: string;
  correlationId?: string;
  eventId: string;
  eventType: string;
  payload?: Record<string, unknown>;
  payloadJson?: string;
  gameId?: string;
  subjectId: string;
  subjectKind: string;
}

const databases: Database[] = [];

function gameEventsDdl(): string {
  const table = FINAL_SCHEMA_DDL.match(/CREATE TABLE game_events \([\s\S]*?\n    \);/)?.[0];
  if (!table) throw new Error("Canonical game_events DDL is missing");
  const indexes = Array.from(
    FINAL_SCHEMA_DDL.matchAll(/CREATE INDEX game_events_[\s\S]*?;/g),
    (match) => match[0],
  );
  return [table, ...indexes].join("\n");
}

function fixtureDatabase(): Database {
  const db = new Database(":memory:");
  db.exec(gameEventsDdl());
  databases.push(db);
  return db;
}

function insertEvent(db: Database, event: FixtureEvent): number {
  const result = db.query(`
    INSERT INTO game_events (
      event_id, event_type, schema_version, game_id,
      subject_kind, subject_id, correlation_id, causation_id,
      trace_id, span_id, parent_span_id, actor, occurred_at, payload_json
    ) VALUES (?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    event.eventId,
    event.eventType,
    event.gameId ?? "melee",
    event.subjectKind,
    event.subjectId,
    event.correlationId ?? event.subjectId,
    event.causationId ?? `command-${event.eventId}`,
    `trace-${event.eventId}`,
    `span-${event.eventId}`,
    `parent-${event.eventId}`,
    event.actor ?? "operator",
    "2026-08-13T12:00:00.000Z",
    event.payloadJson ?? JSON.stringify(event.payload ?? { event_id: event.eventId }),
  );
  return Number(result.lastInsertRowid);
}

afterEach(() => {
  while (databases.length > 0) databases.pop()!.close();
});

describe("game event query", () => {
  test("paginates ascending with an exclusive cursor and inclusive sequence bounds", () => {
    const db = fixtureDatabase();
    for (let index = 1; index <= 6; index += 1) {
      insertEvent(db, {
        correlationId: index % 2 === 0 ? "correlation-even" : "correlation-odd",
        eventId: `event-${index}`,
        eventType: index < 4 ? "run.epoch_integrated" : "sync.staging_progressed",
        subjectId: index < 4 ? "run-1" : "sync-1",
        subjectKind: index < 4 ? "run" : "sync_workflow",
        payload: { ordinal: index },
      });
    }

    const first = queryGameEvents(db, { gameId: "melee", limit: 2 });
    expect(first.events.map((event) => event.sequence)).toEqual([1, 2]);
    expect(first).toMatchObject({ has_more: true, next_after_sequence: 2 });
    expect(first.events[0]).toMatchObject({
      event_id: "event-1",
      event_type: "run.epoch_integrated",
      game_id: "melee",
      payload_summary: {},
    });
    expect(first.events[0]).not.toHaveProperty("payload");

    const second = queryGameEvents(db, {
      gameId: "melee",
      afterSequence: first.next_after_sequence!,
      fromSequence: 2,
      toSequence: 4,
      limit: 2,
    });
    expect(second.events.map((event) => event.sequence)).toEqual([3, 4]);
    expect(second).toMatchObject({ has_more: false, next_after_sequence: null });

    const filtered = queryGameEvents(db, {
      gameId: "melee",
      correlationId: "correlation-even",
      eventTypePrefix: "sync.",
    });
    expect(filtered.events.map((event) => event.sequence)).toEqual([4, 6]);
  });

  test("joins workflow dispatch events into the virtual game subject exactly once", () => {
    const db = fixtureDatabase();
    insertEvent(db, { eventId: "requested", eventType: "game.dispatch_requested", subjectKind: "game", subjectId: "melee" });
    insertEvent(db, { eventId: "drain", eventType: "game.dispatch_drain_started", subjectKind: "run", subjectId: "run-1" });
    insertEvent(db, { eventId: "run-event", eventType: "run.draining", subjectKind: "run", subjectId: "run-1" });
    insertEvent(db, { eventId: "sync-blocked", eventType: "game.dispatch_blocked", subjectKind: "sync_workflow", subjectId: "sync-1" });
    insertEvent(db, { eventId: "canonical-drain", eventType: "game.dispatch_drain_started", subjectKind: "sync_workflow", subjectId: "sync-2" });
    insertEvent(db, { eventId: "cancelled", eventType: "game.dispatch_request_cancelled", subjectKind: "pr_campaign", subjectId: "campaign-1" });
    insertEvent(db, { eventId: "game-note", eventType: "game.note", subjectKind: "game", subjectId: "melee" });
    insertEvent(db, { eventId: "child", eventType: "game.dispatch_child", subjectKind: "sync_push", subjectId: "push-1" });
    insertEvent(db, { eventId: "other-game", eventType: "game.dispatch_requested", gameId: "other", subjectKind: "game", subjectId: "other" });

    const page = queryGameEvents(db, {
      gameId: "melee",
      subject: { kind: "game", id: "melee" },
    });

    expect(page.events.map((event) => event.event_id)).toEqual([
      "requested",
      "drain",
      "sync-blocked",
      "canonical-drain",
      "cancelled",
      "game-note",
    ]);
    expect(new Set(page.events.map((event) => event.event_id)).size).toBe(page.events.length);
    expect(page.events.filter((event) => event.event_id.includes("blocked") || event.event_id.includes("canonical")))
      .toEqual([
        expect.objectContaining({ event_id: "sync-blocked", subject_kind: "sync_workflow" }),
        expect.objectContaining({ event_id: "canonical-drain", subject_kind: "sync_workflow" }),
      ]);

    const exactWorkflow = queryGameEvents(db, {
      gameId: "melee",
      subject: { kind: "run", id: "run-1" },
    });
    expect(exactWorkflow.events.map((event) => event.event_id)).toEqual(["drain", "run-event"]);
  });

  test("filters canonical sync workflow subjects", () => {
    const db = fixtureDatabase();
    insertEvent(db, { eventId: "ingesting-sync", eventType: "sync.ingesting", subjectKind: "sync_workflow", subjectId: "sync-1" });
    insertEvent(db, { eventId: "canonical-sync", eventType: "sync.reconciling", subjectKind: "sync_workflow", subjectId: "sync-1" });
    insertEvent(db, { eventId: "other-sync", eventType: "sync.validating", subjectKind: "sync_workflow", subjectId: "sync-2" });
    insertEvent(db, { eventId: "run", eventType: "run.drafted", subjectKind: "run", subjectId: "sync-1" });

    const page = queryGameEvents(db, {
      gameId: "melee",
      subject: { kind: "sync_workflow", id: "sync-1" },
    });
    expect(page.events.map((event) => [event.event_id, event.subject_kind])).toEqual([
      ["ingesting-sync", "sync_workflow"],
      ["canonical-sync", "sync_workflow"],
    ]);

    expect(recentGameEvents(db, "melee").map((event) => [event.event_id, event.subject_kind])).toEqual([
      ["run", "run"],
      ["other-sync", "sync_workflow"],
      ["canonical-sync", "sync_workflow"],
      ["ingesting-sync", "sync_workflow"],
    ]);
    expect(db.query(`
      SELECT subject_kind
      FROM game_events
      WHERE event_id IN ('ingesting-sync', 'canonical-sync')
      ORDER BY sequence ASC
    `).all()).toEqual([
      { subject_kind: "sync_workflow" },
      { subject_kind: "sync_workflow" },
    ]);
  });

  test("returns the newest 20 in descending order from the shared query layer", () => {
    const db = fixtureDatabase();
    for (let index = 1; index <= 25; index += 1) {
      insertEvent(db, {
        eventId: `event-${index}`,
        eventType: "run.epoch_integrated",
        subjectId: "run-1",
        subjectKind: "run",
      });
    }

    expect(recentGameEvents(db, "melee").map((event) => event.sequence)).toEqual(
      Array.from({ length: 20 }, (_, index) => 25 - index),
    );
  });

  test("rejects invalid query ranges instead of clamping them", () => {
    const db = fixtureDatabase();
    expect(() => queryGameEvents(db, { gameId: "melee", limit: 201 })).toThrow("between 1 and 200");
    expect(() => queryGameEvents(db, { gameId: "melee", afterSequence: -1 })).toThrow("non-negative");
    expect(() => queryGameEvents(db, { gameId: "melee", fromSequence: 8, toSequence: 7 })).toThrow(
      "less than or equal",
    );
    expect(() => queryGameEvents(db, {
      gameId: "melee",
      subject: { kind: "arbitrary" as never, id: "subject-1" },
    })).toThrow("registered game event subject kind");
    expect(() => queryGameEvents(db, {
      gameId: "melee",
      subject: { kind: "sync" as never, id: "sync-1" },
    })).toThrow("registered game event subject kind");
  });

  test("fails loudly for corrupt or non-object payload_json", () => {
    const db = fixtureDatabase();
    for (const [index, payloadJson] of ["not-json", "null", "[]", "\"text\""] .entries()) {
      insertEvent(db, {
        eventId: `corrupt-${index}`,
        eventType: "run.epoch_integrated",
        payloadJson,
        subjectId: "run-1",
        subjectKind: "run",
      });
    }

    for (let afterSequence = 0; afterSequence < 4; afterSequence += 1) {
      expect(() => queryGameEvents(db, {
        gameId: "melee",
        afterSequence,
        limit: 1,
      })).toThrow(GameEventPayloadError);
      try {
        queryGameEvents(db, { gameId: "melee", afterSequence, limit: 1 });
      } catch (error) {
        expect(error).toMatchObject({
          code: "GAME_EVENT_PAYLOAD_INVALID",
          message: "Stored game event payload is invalid",
        });
      }
    }
  });

  test("allowlists, recursively redacts, and caps payload summaries", () => {
    const db = fixtureDatabase();
    insertEvent(db, {
      eventId: "sensitive",
      eventType: "sync.staging_progressed",
      payload: {
        status: "reconciling",
        workflow_id: "sync-1",
        unregistered_note: "must not appear",
        reason: "failed at /Users/alice/private/game/file.c",
        message: "x".repeat(PAYLOAD_SUMMARY_MAX_STRING_LENGTH * 3),
        details: {
          token: "ghp_abcdefghijklmnopqrstuvwxyz123456",
          stateDir: "/tmp/private-state",
          status: "blocked",
          details: { details: { details: { details: { status: "too-deep" } } } },
        },
        items: Array.from(
          { length: PAYLOAD_SUMMARY_MAX_ENTRIES * 2 },
          (_, index) => ({ operation_id: `operation-${index}`, status: "pending" }),
        ),
      },
      subjectId: "sync-1",
      subjectKind: "sync_workflow",
    });

    const event = queryGameEvents(db, { gameId: "melee" }).events[0]!;
    const serialized = JSON.stringify(event.payload_summary);
    expect(event).not.toHaveProperty("payload");
    expect(event.payload_summary).toMatchObject({
      status: "reconciling",
      workflow_id: "sync-1",
      reason: "[REDACTED_PATH]",
      details: {
        token: "[REDACTED]",
        stateDir: "[REDACTED_PATH]",
        status: "blocked",
      },
      _truncated: true,
    });
    expect(event.payload_summary).not.toHaveProperty("unregistered_note");
    expect(String(event.payload_summary.message).length).toBeLessThanOrEqual(
      PAYLOAD_SUMMARY_MAX_STRING_LENGTH,
    );
    expect(new TextEncoder().encode(serialized).byteLength).toBeLessThanOrEqual(
      PAYLOAD_SUMMARY_MAX_SERIALIZED_BYTES,
    );
    expect(serialized).not.toContain("abcdefghijklmnopqrstuvwxyz123456");
    expect(serialized).not.toContain("/Users/alice");
  });
});

describe("game event reconstruction", () => {
  test("reconstructs canonical sync lifecycle events and causes", () => {
    const db = fixtureDatabase();
    insertEvent(db, {
      eventId: "sync-cause",
      eventType: "sync.ingesting",
      correlationId: "previous-sync-correlation",
      subjectKind: "sync_workflow",
      subjectId: "sync-1",
    });
    insertEvent(db, {
      causationId: "sync-cause",
      correlationId: "sync-correlation",
      eventId: "sync-event",
      eventType: "sync.reconciling",
      subjectKind: "sync_workflow",
      subjectId: "sync-1",
    });
    insertEvent(db, {
      causationId: "sync-event",
      correlationId: "sync-correlation",
      eventId: "canonical-event",
      eventType: "sync.validating",
      subjectKind: "sync_workflow",
      subjectId: "sync-1",
    });

    const reconstruction = reconstructGameEvents(db, "melee", "sync-correlation");

    expect(reconstruction.events.map((event) => [event.event_id, event.subject_kind])).toEqual([
      ["sync-event", "sync_workflow"],
      ["canonical-event", "sync_workflow"],
    ]);
    expect(reconstruction.events[0]?.caused_by).toMatchObject({
      kind: "event",
      event_id: "sync-cause",
      subject_kind: "sync_workflow",
    });
    expect(reconstruction.events[1]?.caused_by).toMatchObject({
      kind: "event",
      event_id: "sync-event",
      subject_kind: "sync_workflow",
    });
  });

  test("resolves run drain through sync publish to campaign activation across correlations", () => {
    const db = fixtureDatabase();
    insertEvent(db, { eventId: "run-drain", eventType: "game.dispatch_drain_started", correlationId: "run-1", causationId: "command-sync-start", subjectKind: "run", subjectId: "run-1" });
    insertEvent(db, { eventId: "run-release", eventType: "game.dispatch_released", correlationId: "run-1", causationId: "run-drain", subjectKind: "game", subjectId: "melee" });
    insertEvent(db, { eventId: "sync-acquire", eventType: "game.dispatch_acquired", correlationId: "sync-1", causationId: "run-release", subjectKind: "game", subjectId: "melee" });
    insertEvent(db, { eventId: "sync-published", eventType: "sync.boundary_published", correlationId: "sync-1", causationId: "sync-acquire", subjectKind: "sync_workflow", subjectId: "sync-1" });
    insertEvent(db, { eventId: "sync-release", eventType: "game.dispatch_released", correlationId: "sync-1", causationId: "sync-published", subjectKind: "game", subjectId: "melee" });
    insertEvent(db, { eventId: "campaign-acquire", eventType: "game.dispatch_acquired", correlationId: "campaign-1", causationId: "sync-release", subjectKind: "game", subjectId: "melee" });
    insertEvent(db, { eventId: "campaign-active", eventType: "pr.campaign_working", correlationId: "campaign-1", causationId: "campaign-acquire", subjectKind: "pr_campaign", subjectId: "campaign-1" });
    insertEvent(db, { eventId: "other-game-cause", eventType: "run.drafted", gameId: "other", subjectKind: "run", subjectId: "other-run" });
    insertEvent(db, { eventId: "campaign-command", eventType: "pr.series_prepared", correlationId: "campaign-1", causationId: "other-game-cause", subjectKind: "pr_series", subjectId: "series-1" });

    const run = reconstructGameEvents(db, "melee", "run-1");
    const sync = reconstructGameEvents(db, "melee", "sync-1");
    const campaign = reconstructGameEvents(db, "melee", "campaign-1");

    expect(run.events.map((event) => event.event_id)).toEqual(["run-drain", "run-release"]);
    expect(run.events[0]?.caused_by).toEqual({ kind: "command", command_id: "command-sync-start" });
    expect(sync.events.map((event) => event.event_id)).toEqual(["sync-acquire", "sync-published", "sync-release"]);
    expect(sync.events[0]?.caused_by).toMatchObject({
      kind: "event",
      event_id: "run-release",
      correlation_id: "run-1",
    });
    expect(campaign.events.map((event) => event.event_id)).toEqual([
      "campaign-acquire",
      "campaign-active",
      "campaign-command",
    ]);
    expect(campaign.events[0]?.caused_by).toMatchObject({
      kind: "event",
      event_id: "sync-release",
      correlation_id: "sync-1",
    });
    expect(campaign.events[1]?.caused_by).toMatchObject({ kind: "event", event_id: "campaign-acquire" });
    expect(campaign.events[2]?.caused_by).toEqual({ kind: "command", command_id: "other-game-cause" });
    expect(campaign.kernel_traces).toEqual([]);
  });

  test("bounds reconstruction and returns an advancing continuation cursor", () => {
    const db = fixtureDatabase();
    for (let index = 1; index <= MAX_EVENT_QUERY_LIMIT + 5; index += 1) {
      insertEvent(db, {
        causationId: index === 1 ? "command-start" : `bounded-${index - 1}`,
        correlationId: "bounded-correlation",
        eventId: `bounded-${index}`,
        eventType: "run.epoch_integrated",
        payload: { status: "active", sequence: index },
        subjectId: "run-1",
        subjectKind: "run",
      });
    }

    const first = reconstructGameEvents(
      db,
      "melee",
      "bounded-correlation",
      { limit: MAX_EVENT_QUERY_LIMIT },
    );
    expect(first.events).toHaveLength(MAX_EVENT_QUERY_LIMIT);
    expect(first).toMatchObject({
      has_more: true,
      next_after_sequence: MAX_EVENT_QUERY_LIMIT,
    });
    expect(first.events[1]?.caused_by).toMatchObject({
      kind: "event",
      event_id: "bounded-1",
    });

    const second = reconstructGameEvents(db, "melee", "bounded-correlation", {
      afterSequence: first.next_after_sequence!,
      limit: MAX_EVENT_QUERY_LIMIT,
    });
    expect(second.events.map((event) => event.event_id)).toEqual([
      "bounded-201",
      "bounded-202",
      "bounded-203",
      "bounded-204",
      "bounded-205",
    ]);
    expect(second.events[0]?.caused_by).toMatchObject({
      kind: "event",
      event_id: "bounded-200",
    });
    expect(second).toMatchObject({ has_more: false, next_after_sequence: null });
    expect(() => reconstructGameEvents(db, "melee", "bounded-correlation", {
      limit: MAX_EVENT_QUERY_LIMIT + 1,
    })).toThrow("between 1 and 200");
  });
});
