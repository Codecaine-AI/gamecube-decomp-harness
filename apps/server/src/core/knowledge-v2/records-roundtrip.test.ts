import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  advanceWatermark,
  claimIndexTask,
  completeIndexTask,
  enqueueIndexTask,
  formatLocator,
  insertDiscordMessages,
  insertEvent,
  insertPullRequestEntries,
  insertWikiSections,
  insertWorkerRun,
  updateWorkerRunIntegration,
  openKnowledgeStore,
  parseLocator,
  stampSubjectIndexed,
  type KnowledgeStore,
  type Locator,
} from "./index.js";
import { getRunNarrative, insertRunNarrative } from "./records/index.js";

const tempDirs: string[] = [];
const stores: KnowledgeStore[] = [];

afterEach(() => {
  for (const store of stores.splice(0)) store.close();
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function openStore(name: string): KnowledgeStore {
  const dir = mkdtempSync(join(tmpdir(), `knowledge-v2-${name}-`));
  tempDirs.push(dir);
  const store = openKnowledgeStore({ knowledgeRoot: dir });
  stores.push(store);
  return store;
}

function insertTranslationUnit(store: KnowledgeStore, id = "translation-unit-1"): void {
  store.db.query(`INSERT INTO entity
    (id, kind, locator, identity_status)
    VALUES (?, 'translation_unit', ?, 'active')`).run(id, `src/${id}.c`);
}

function insertFunction(store: KnowledgeStore, id = "function-1"): void {
  store.db.query(`INSERT INTO target
    (id, kind, unit, unit_entity_id, symbol, stable_key, address, identity_status, report_revision)
    VALUES (?, 'function', 'unit-1', 'translation-unit-1', ?, ?, '0x80001000', 'current', 'rev-1')`)
    .run(id, id, `unit-1:${id}`);
}

describe("knowledge locators", () => {
  test("formats and parses all five kinds, including optional segments", () => {
    const locators: Locator[] = [
      { kind: "discord", messageId: "123456" },
      { kind: "pr", pullRequestId: "42", commentNumber: 7 },
      { kind: "wiki", sectionId: "combat-mechanics" },
      { kind: "attempt", runId: "run-9", submissionSequence: 2, transcriptSpan: "120-180" },
      { kind: "code", revision: "abc123", path: "src/melee/fighter.c", startLine: 10, endLine: 24 },
    ];

    for (const locator of locators) {
      const formatted = formatLocator(locator);
      expect(parseLocator(formatted)).toEqual(locator);
      expect(parseLocator(formatted, locator.kind)).toEqual(locator);
    }

    expect(parseLocator("pr://42")).toEqual({ kind: "pr", pullRequestId: "42", commentNumber: undefined });
    expect(parseLocator("attempt://run/run-9")).toEqual({
      kind: "attempt",
      runId: "run-9",
      submissionSequence: undefined,
      transcriptSpan: undefined,
    });
    expect(parseLocator("attempt://run/run-9/transcript/120-180")).toEqual({
      kind: "attempt",
      runId: "run-9",
      submissionSequence: undefined,
      transcriptSpan: "120-180",
    });
  });

  test("rejects malformed strings and kind mismatches", () => {
    for (const malformed of [
      "discord://message/",
      "pr://42/comment/-1",
      "wiki://section/extra",
      "attempt://run/r/submission/01",
      "code://rev/src/a.c#L0-L2",
      "https://example.test/42",
    ]) {
      expect(() => parseLocator(malformed)).toThrow();
    }
    expect(() => parseLocator("pr://42", "discord")).toThrow();
    expect(() => parseLocator("code://rev/src/a.c#L1-L2", "attempt")).toThrow();
  });
});

describe("record helpers", () => {
  test("reads an inserted run narrative and returns null when missing", () => {
    const store = openStore("run-narrative-reader");
    insertTranslationUnit(store);
    insertFunction(store);
    insertWorkerRun(store, {
      id: "worker-narrative", targetId: "function-1", goal: "Match function", baseline: "{}",
      finalOutcome: "match", startedAt: "2026-01-01T00:00:00.000Z", closedAt: "2026-01-01T00:10:00.000Z",
    }, []);
    insertRunNarrative(store, {
      workerRunId: "worker-narrative",
      summary: "The function matched.",
      notableObservations: [{ observation: "The branch order mattered." }],
      narrative: { result: "match", attempts: 2 },
      producedBy: "backfill",
      createdAt: "2026-01-01T00:11:00.000Z",
    });

    expect(getRunNarrative(store, "worker-narrative")).toEqual({
      workerRunId: "worker-narrative",
      summary: "The function matched.",
      notableObservations: [{ observation: "The branch order mattered." }],
      narrative: { result: "match", attempts: 2 },
      producedBy: "backfill",
      createdAt: "2026-01-01T00:11:00.000Z",
    });
    expect(getRunNarrative(store, "missing-worker")).toBeNull();
  });

  test("round-trips a worker run with submissions and an event with refs", () => {
    const store = openStore("worker-event");
    insertTranslationUnit(store);
    insertFunction(store);

    insertWorkerRun(store, {
      id: "worker-1", targetId: "function-1", goal: "Match function", baseline: JSON.stringify({ score: 71 }),
      runId: "runtime-1", workerStateId: "state-1", finalOutcome: "improvement", integration: "integrated",
      integrationDetail: {
        status: "applied", disposition: "applied", conflict_paths: [], failure_reasons: [], resolved_at: null,
      },
      startedAt: "2026-01-01T00:00:00.000Z", endedAt: "2026-01-01T00:10:00.000Z", closedAt: "2026-01-01T00:11:00.000Z",
    }, [
      { id: "submission-1", seq: 1, description: "First try", hypothesis: "Swap branch", score: 75, submittedAt: "2026-01-01T00:05:00.000Z", runtimeRef: "attempt://run/runtime-1/submission/1" },
      { id: "submission-2", seq: 2, description: "Second try", score: 80, submittedAt: "2026-01-01T00:09:00.000Z" },
    ]);
    insertRunNarrative(store, {
      workerRunId: "worker-1",
      summary: "Reversing the branch improved the match.",
      notableObservations: [{ observation: "The branch controls the epilogue.", reusable_when: "Matching related functions" }],
      narrative: { run: { summary: "Reversing the branch improved the match." } },
      producedBy: "live",
      createdAt: "2026-01-01T00:12:00.000Z",
    });
    insertEvent(store, {
      id: "event-1", targetId: "function-1", kind: "regression", cause: "upstream_change",
      summary: "Score dropped", createdAt: "2026-01-02T00:00:00.000Z",
    }, [
      { refKind: "worker_run", refId: "worker-1" },
      { refKind: "commit", refId: "abc123" },
    ]);

    expect(store.db.query("SELECT * FROM worker_run WHERE id = 'worker-1'").get()).toMatchObject({
      id: "worker-1", target_id: "function-1", goal: "Match function", baseline: '{"score":71}',
      final_outcome: "improvement", integration: "integrated",
      integration_detail: '{"status":"applied","disposition":"applied","conflict_paths":[],"failure_reasons":[],"resolved_at":null}',
    });
    expect(updateWorkerRunIntegration(store, "worker-1", "conflicted", {
      status: "resolved", disposition: "conflicted", conflict_paths: ["src/main.c"], failure_reasons: ["apply failed"],
      resolved_at: "2026-01-01T00:12:30.000Z",
    })).toBe(true);
    expect(store.db.query("SELECT integration, integration_detail FROM worker_run WHERE id = 'worker-1'").get()).toEqual({
      integration: "conflicted",
      integration_detail: '{"status":"resolved","disposition":"conflicted","conflict_paths":["src/main.c"],"failure_reasons":["apply failed"],"resolved_at":"2026-01-01T00:12:30.000Z"}',
    });
    expect(updateWorkerRunIntegration(store, "missing-worker", null, null)).toBe(false);
    expect(store.db.query("SELECT id, worker_run_id, seq, hypothesis, score, runtime_ref FROM submission ORDER BY seq").all()).toEqual([
      { id: "submission-1", worker_run_id: "worker-1", seq: 1, hypothesis: "Swap branch", score: 75, runtime_ref: "attempt://run/runtime-1/submission/1" },
      { id: "submission-2", worker_run_id: "worker-1", seq: 2, hypothesis: null, score: 80, runtime_ref: null },
    ]);
    expect(store.db.query("SELECT worker_run_id, summary, produced_by, created_at FROM run_narrative").get()).toEqual({
      worker_run_id: "worker-1",
      summary: "Reversing the branch improved the match.",
      produced_by: "live",
      created_at: "2026-01-01T00:12:00.000Z",
    });
    expect(() => insertRunNarrative(store, {
      workerRunId: "worker-1",
      summary: "Replacement",
      notableObservations: [],
      narrative: {},
      producedBy: "backfill",
    })).toThrow();
    expect(store.db.query("SELECT id, kind, cause, summary, created_at FROM event").get()).toEqual({
      id: "event-1", kind: "regression", cause: "upstream_change", summary: "Score dropped", created_at: "2026-01-02T00:00:00.000Z",
    });
    expect(store.db.query("SELECT ref_kind, ref_id FROM event_ref ORDER BY ref_kind").all()).toEqual([
      { ref_kind: "commit", ref_id: "abc123" },
      { ref_kind: "worker_run", ref_id: "worker-1" },
    ]);
  });

  test("inserts importer records that remain readable", () => {
    const store = openStore("importers");
    insertTranslationUnit(store);
    insertFunction(store);
    insertDiscordMessages(store, [{
      id: "discord-1", channel: "decomp", author: "ford", postedAt: "2026-02-01T00:00:00.000Z",
      content: "Useful note", threadId: "thread-1", ingestedAt: "2026-02-02T00:00:00.000Z",
    }]);
    insertWikiSections(store, [{
      id: "wiki-1", page: "Melee", section: "Physics", mirrorRevision: "r3", content: "Physics notes",
      ingestedAt: "2026-02-02T00:00:00.000Z",
    }]);
    insertPullRequestEntries(store, [{
      id: "pr-1", targetId: "function-1", prRef: "pr://42", summary: "Improved match", outcome: "improvement",
      mergedAt: "2026-02-03T00:00:00.000Z",
    }, {
      id: "pr-2", entityId: "translation-unit-1", prRef: "pr://43", summary: "Touched unit", outcome: "no_change",
      mergedAt: "2026-02-03T00:00:00.000Z",
    }]);

    expect(store.db.query("SELECT id, channel, author, content, thread_id FROM discord_message").get()).toEqual({
      id: "discord-1", channel: "decomp", author: "ford", content: "Useful note", thread_id: "thread-1",
    });
    expect(store.db.query("SELECT id, page, section, mirror_revision, content FROM wiki_section").get()).toEqual({
      id: "wiki-1", page: "Melee", section: "Physics", mirror_revision: "r3", content: "Physics notes",
    });
    expect(store.db.query("SELECT id, target_id, entity_id, pr_ref, summary, outcome FROM pull_request ORDER BY id").all()).toEqual([
      { id: "pr-1", target_id: "function-1", entity_id: null, pr_ref: "pr://42", summary: "Improved match", outcome: "improvement" },
      { id: "pr-2", target_id: null, entity_id: "translation-unit-1", pr_ref: "pr://43", summary: "Touched unit", outcome: "no_change" },
    ]);
  });

  test("advances watermark and completes the index-task lifecycle", () => {
    const store = openStore("indexing");
    insertTranslationUnit(store);
    insertFunction(store);
    store.db.query(`INSERT INTO entity (id, kind, locator, identity_status)
      VALUES ('entity-1', 'game_concept', 'concept://shield', 'active')`).run();

    advanceWatermark(store, "pr", "41");
    advanceWatermark(store, "pr", "42");
    expect(store.db.query("SELECT source, position FROM source_watermark").get()).toEqual({ source: "pr", position: "42" });

    enqueueIndexTask(store, { id: "task-1", pathway: "pr_imported", payload: "pr://42", enqueuedAt: "2026-03-01T00:00:00.000Z" });
    expect(claimIndexTask(store, "task-1", "2026-03-01T00:01:00.000Z")).toBe(true);
    expect(claimIndexTask(store, "task-1", "2026-03-01T00:02:00.000Z")).toBe(false);
    expect(completeIndexTask(store, "task-1", "2026-03-01T00:03:00.000Z")).toBe(true);
    expect(completeIndexTask(store, "task-1", "2026-03-01T00:04:00.000Z")).toBe(false);
    expect(store.db.query("SELECT started_at, done_at FROM index_task WHERE id = 'task-1'").get()).toEqual({
      started_at: "2026-03-01T00:01:00.000Z", done_at: "2026-03-01T00:03:00.000Z",
    });

    stampSubjectIndexed(store, { targetId: "function-1" }, "2026-03-01T01:00:00.000Z");
    stampSubjectIndexed(store, { targetId: "function-1" }, "2026-03-01T02:00:00.000Z");
    stampSubjectIndexed(store, { entityId: "entity-1" }, "2026-03-01T03:00:00.000Z");
    expect(store.db.query("SELECT target_id, entity_id, indexed_at FROM subject_index_state ORDER BY entity_id").all()).toEqual([
      { target_id: "function-1", entity_id: null, indexed_at: "2026-03-01T02:00:00.000Z" },
      { target_id: null, entity_id: "entity-1", indexed_at: "2026-03-01T03:00:00.000Z" },
    ]);
  });
});
