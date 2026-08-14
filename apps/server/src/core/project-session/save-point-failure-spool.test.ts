import { afterEach, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { openState, type StateStore } from "@server/core/orchestrator-state";
import { eventsForSubject } from "@server/core/project-state/events.js";
import { createProjectSession, getProjectSessionByUuid } from "./store.js";
import {
  listSavePointFailureSpool,
  replaySavePointFailureSpool,
  spoolSavePointFailure,
} from "./save-point-failure-spool.js";

const stateDirs: string[] = [];
const stores: StateStore[] = [];

function createFixture(): StateStore {
  const stateDir = mkdtempSync(join(tmpdir(), "save-point-failure-spool-"));
  stateDirs.push(stateDir);
  const store = openState(stateDir);
  stores.push(store);
  createProjectSession(store.db, {
    actor: "operator",
    baseSha: "initial-head",
    commandId: "command-session-open",
    id: "project-session:session-spool-1",
    now: "2026-08-13T10:00:00.000Z",
    openingSyncId: "sync-open-1",
    projectId: "melee",
    sessionUuid: "session-spool-1",
    traceId: "trace-session-spool-1",
    worktreeIdentity: "test-worktree",
  });
  return store;
}

function closeStore(store: StateStore): void {
  const index = stores.indexOf(store);
  if (index >= 0) stores.splice(index, 1);
  store.db.close();
}

function writeRawSpoolFile(stateDir: string, name: string, contents: string): string {
  const spoolDir = join(stateDir, "save_point_failures");
  mkdirSync(spoolDir, { recursive: true });
  const path = join(spoolDir, name);
  writeFileSync(path, contents);
  return path;
}

function expectPathSpecificError(action: () => unknown, path: string, kind: RegExp): void {
  let thrown: unknown;
  try {
    action();
  } catch (error) {
    thrown = error;
  }
  expect(thrown).toBeInstanceOf(Error);
  expect((thrown as Error).message).toContain(path);
  expect((thrown as Error).message).toMatch(kind);
}

function expectedReplayKey(sessionUuid: string, anchoredCommit: string, triggerKind: string): string {
  const digest = createHash("sha256")
    .update(`${sessionUuid}\0${anchoredCommit}\0${triggerKind}`)
    .digest("hex")
    .slice(0, 24);
  return `save-point-${digest}`;
}

afterEach(() => {
  for (const store of stores.splice(0)) store.db.close();
  for (const stateDir of stateDirs.splice(0)) rmSync(stateDir, { recursive: true, force: true });
});

describe("save-point failure spool replay", () => {
  test.each([
    ["malformed JSON", "{not-json", /Malformed.*JSON/],
    ["invalid schema", JSON.stringify({ version: 2 }), /Invalid SavePointFailureSpoolRecord schema/],
  ] as const)("list fails loudly for %s and retains the obligation", (_case, contents, kind) => {
    const stateDir = mkdtempSync(join(tmpdir(), "save-point-failure-spool-list-"));
    stateDirs.push(stateDir);
    const path = writeRawSpoolFile(stateDir, "corrupt-obligation.json", contents);

    expectPathSpecificError(() => listSavePointFailureSpool(stateDir), path, kind);
    expect(existsSync(path)).toBe(true);
    expect(readFileSync(path, "utf8")).toBe(contents);
  });

  test.each([
    ["malformed JSON", "{not-json", /Malformed.*JSON/],
    ["invalid schema", JSON.stringify({ version: 2 }), /Invalid SavePointFailureSpoolRecord schema/],
  ] as const)("replay fails atomically for %s and retains the obligation", (_case, contents, kind) => {
    const store = createFixture();
    spoolSavePointFailure(store.stateDir, {
      actor: "runner",
      causation_id: null,
      command_id: "command-before-corruption",
      correlation_id: "session-spool-1",
      message: "valid obligation must not replay first",
      occurred_at: "2026-08-13T10:00:30.000Z",
      project_id: "melee",
      session_uuid: "session-spool-1",
      source_id: "run-before-corruption",
      source_kind: "run",
      span_id: null,
      trigger_kind: "epoch",
    });
    const path = writeRawSpoolFile(store.stateDir, "zz-corrupt-obligation.json", contents);

    expectPathSpecificError(() => replaySavePointFailureSpool(store.db, store.stateDir), path, kind);
    expect(existsSync(path)).toBe(true);
    expect(readFileSync(path, "utf8")).toBe(contents);
    expect(eventsForSubject(store.db, "session", "session-spool-1")
      .filter((event) => event.eventType === "session.save_point_failed")).toHaveLength(0);
  });

  test("emits the exact closed payload while retaining operational diagnostics", () => {
    const store = createFixture();
    const rootSpanId = "span-11111111-1111-4111-8111-111111111111";
    const spooled = spoolSavePointFailure(store.stateDir, {
      actor: "guardian",
      causation_id: "event-save-point-attempt-1",
      command_id: "command-save-point-attempt-1",
      correlation_id: "session-spool-1",
      message: "artifact manifest was not durably written",
      occurred_at: "2026-08-13T10:01:00.000Z",
      project_id: "melee",
      session_uuid: "session-spool-1",
      source_id: "manifest-attempt-7",
      source_kind: "artifact_manifest",
      span_id: rootSpanId,
      trigger_kind: "epoch_boundary",
    });
    store.db
      .query("UPDATE project_sessions SET head_revision = ? WHERE session_uuid = ?")
      .run("canonical-head-at-replay", "session-spool-1");

    expect(replaySavePointFailureSpool(store.db, store.stateDir)).toBe(1);

    const failure = eventsForSubject(store.db, "session", "session-spool-1")
      .find((event) => event.eventType === "session.save_point_failed");
    if (!failure) throw new Error("Expected replayed session.save_point_failed event");
    const replayKey = expectedReplayKey(
      "session-spool-1",
      "canonical-head-at-replay",
      "epoch_boundary",
    );
    expect(failure.payload).toEqual({
      anchored_commit: "canonical-head-at-replay",
      blocker_code: "save_point_failed",
      failed_or_missing_artifact_classes: ["artifact_manifest"],
      replay_key: replayKey,
      replayed_from_spool: true,
      staleness_flag_raised: true,
      trigger_kind: "epoch_boundary",
    });
    expect(Object.keys(failure.payload).sort()).toEqual([
      "anchored_commit",
      "blocker_code",
      "failed_or_missing_artifact_classes",
      "replay_key",
      "replayed_from_spool",
      "staleness_flag_raised",
      "trigger_kind",
    ]);
    expect(failure).toMatchObject({
      actor: "guardian",
      causationId: "event-save-point-attempt-1",
      correlationId: "session-spool-1",
      parentSpanId: rootSpanId,
      projectId: "melee",
      schemaVersion: 1,
      subjectId: "session-spool-1",
      subjectKind: "session",
      traceId: "trace-session-spool-1",
    });
    expect(failure.spanId).toMatch(/^span-[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i);
    expect(failure.spanId).not.toBe(rootSpanId);

    const spoolRecord = listSavePointFailureSpool(store.stateDir)[0];
    expect(spoolRecord).toMatchObject({
      message: "artifact manifest was not durably written",
      replay_event_id: failure.eventId,
      replayed_at: expect.any(String),
      source_id: "manifest-attempt-7",
      source_kind: "artifact_manifest",
      spool_id: spooled.record.spool_id,
    });
    expect(getProjectSessionByUuid(store.db, "session-spool-1")).toMatchObject({
      blockers_json: [{
        code: "save_point_failed",
        message: "artifact manifest was not durably written",
        recoverable: true,
        severity: "error",
        source_id: "manifest-attempt-7",
        source_kind: "artifact_manifest",
      }],
      revision: 1,
      save_point_stale: true,
    });
    for (const diagnosticKey of ["message", "source_id", "source_kind", "spool_id"]) {
      expect(diagnosticKey in failure.payload).toBe(false);
    }
  });

  test("dedupes duplicate spool identities across concurrent and repeated opens", async () => {
    const store = createFixture();
    const duplicate = {
      actor: "runner" as const,
      causation_id: null,
      command_id: "command-save-point-failed",
      correlation_id: "session-spool-1",
      message: "save-point write failed",
      occurred_at: "2026-08-13T10:02:00.000Z",
      project_id: "melee",
      session_uuid: "session-spool-1",
      source_id: "run-1",
      source_kind: "run",
      span_id: null,
      trigger_kind: "epoch",
    };
    const first = spoolSavePointFailure(store.stateDir, duplicate);
    const second = spoolSavePointFailure(store.stateDir, duplicate);
    expect(first.record.spool_id).not.toBe(second.record.spool_id);
    closeStore(store);

    const openStateModule = pathToFileURL(join(import.meta.dir, "../orchestrator-state/index.ts")).href;
    const openInChild = () => Bun.spawn({
      cmd: [
        process.execPath,
        "-e",
        'const { openState } = await import(process.env.SPOOL_OPEN_STATE_MODULE); const store = openState(process.env.SPOOL_STATE_DIR); store.db.close();',
      ],
      cwd: process.cwd(),
      env: {
        ...process.env,
        SPOOL_OPEN_STATE_MODULE: openStateModule,
        SPOOL_STATE_DIR: store.stateDir,
      },
      stdout: "pipe",
      stderr: "pipe",
    });
    const results = await Promise.all([openInChild(), openInChild()].map(async (child) => {
      const [exitCode, stderr] = await Promise.all([
        child.exited,
        new Response(child.stderr).text(),
      ]);
      return { exitCode, stderr };
    }));
    expect(results).toEqual([
      { exitCode: 0, stderr: "" },
      { exitCode: 0, stderr: "" },
    ]);

    const replayed = openState(store.stateDir);
    stores.push(replayed);
    const failureEvents = eventsForSubject(replayed.db, "session", "session-spool-1")
      .filter((event) => event.eventType === "session.save_point_failed");
    expect(failureEvents).toHaveLength(1);
    const failureEventId = failureEvents[0]!.eventId;
    const spoolRecords = listSavePointFailureSpool(store.stateDir);
    expect(spoolRecords).toHaveLength(2);
    expect(new Set(spoolRecords.map((record) => record.spool_id)).size).toBe(2);
    expect(spoolRecords.every((record) => record.replay_event_id === failureEventId)).toBe(true);
    expect(spoolRecords.every((record) => typeof record.replayed_at === "string")).toBe(true);
    expect(getProjectSessionByUuid(replayed.db, "session-spool-1")).toMatchObject({
      blockers_json: [expect.objectContaining({ source_id: "run-1", source_kind: "run" })],
      revision: 1,
      save_point_stale: true,
    });

    closeStore(replayed);
    const reopened = openState(store.stateDir);
    stores.push(reopened);
    expect(eventsForSubject(reopened.db, "session", "session-spool-1")
      .filter((event) => event.eventType === "session.save_point_failed")).toHaveLength(1);
    expect(getProjectSessionByUuid(reopened.db, "session-spool-1")?.revision).toBe(1);
  });
});
