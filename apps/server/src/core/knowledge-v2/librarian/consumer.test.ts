import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, spyOn, test } from "bun:test";

import type { GlobalArgs } from "@server/core/game-registry/runtime-options.js";
import { createSharedGate } from "../apply/index.js";
import type { LibrarianPassEnvelope } from "../backfill/runner.js";
import type { DriftReport } from "../drift/flagger.js";
import { enqueueIndexTask, writeFactWithEvidence } from "../records/index.js";
import { openKnowledgeStore, type KnowledgeStore } from "../storage/store.js";
import { parseLibrarianArgs } from "./cli.js";
import {
  claimNextLibrarianTask,
  runLibrarianConsumer,
  runLibrarianPass,
  type LibrarianPassArtifact,
  type LibrarianRunOptions,
} from "./consumer.js";
import type { LibrarianPathway, LibrarianTaskRow } from "./context.js";

const FIXED_NOW = "2026-08-31T12:00:00.000Z";
const fixtures: Array<{ root: string; store: KnowledgeStore }> = [];

type FakeRunPiAgent = NonNullable<LibrarianRunOptions["runPiAgent"]>;
type CountedTable = "entity" | "fact" | "evidence" | "link" | "subject_index_state" | "index_task";

interface ConsumerFixture {
  root: string;
  stateDir: string;
  store: KnowledgeStore;
  globals: GlobalArgs;
}

interface TaskState {
  started_at: string | null;
  done_at: string | null;
  enqueued_at: string;
}

function fixture(name: string, targetCount = 2): ConsumerFixture {
  const root = mkdtempSync(join(tmpdir(), `knowledge-v2-librarian-consumer-${name}-`));
  const stateDir = join(root, "state");
  const store = openKnowledgeStore({ knowledgeRoot: join(root, "knowledge") });
  fixtures.push({ root, store });

  store.db.query(`INSERT INTO entity
    (id, kind, locator, parent_entity_id, identity_status, merged_into_id)
    VALUES ('unit-main', 'translation_unit', 'src/main.c', NULL, 'active', NULL)`).run();

  const insertTarget = store.db.query(`INSERT INTO target
    (id, kind, unit, unit_entity_id, symbol, stable_key, address, identity_status, report_revision)
    VALUES (?, 'function', 'unit', 'unit-main', ?, ?, ?, 'current', 'fixture-rev')`);
  const insertStatus = store.db.query(`INSERT INTO target_status
    (target_id, match_pct, linked, size, content_hash, report_revision, updated_at)
    VALUES (?, ?, 1, 64, ?, 'fixture-rev', '2026-08-30T00:00:00.000Z')`);
  const insertPr = store.db.query(`INSERT INTO pull_request
    (id, target_id, entity_id, pr_ref, summary, outcome, merged_at)
    VALUES (?, ?, NULL, ?, ?, 'improvement', ?)`);
  const insertRun = store.db.query(`INSERT INTO worker_run
    (id, target_id, goal, baseline, run_id, worker_state_id, final_outcome, error_type,
      integration, started_at, ended_at, closed_at)
    VALUES (?, ?, 'Improve the target', '{}', ?, NULL, 'improvement', NULL, 'integrated',
      '2026-08-29T00:00:00.000Z', '2026-08-29T00:05:00.000Z', '2026-08-29T00:06:00.000Z')`);
  const insertSubmission = store.db.query(`INSERT INTO submission
    (id, worker_run_id, seq, description, hypothesis, score, submitted_at, runtime_ref)
    VALUES (?, ?, 1, 'Fixture attempt', 'Reorder expressions', 50,
      '2026-08-29T00:03:00.000Z', NULL)`);

  for (let index = 1; index <= targetCount; index += 1) {
    const targetId = `target-${index}`;
    insertTarget.run(targetId, `func_${index}`, `unit:func_${index}`, `0x${(0x80000000 + index * 0x10).toString(16)}`);
    insertStatus.run(targetId, 100 - index, `sha256:target-${index}`);
    insertPr.run(`pr-${index}`, targetId, `melee#${100 + index}`, `Fixture pull request ${index}`, `2026-08-${String(20 + index).padStart(2, "0")}T00:00:00.000Z`);
    insertRun.run(`attempt-${index}`, targetId, `operator-${index}`);
    insertSubmission.run(`submission-${index}`, `attempt-${index}`);
  }

  return {
    root,
    stateDir,
    store,
    globals: {
      repoRoot: root,
      stateDir,
      gameId: "melee",
      dryRunAgents: false,
      provider: "fixture-provider",
      model: "fixture-model",
      thinkingLevel: "medium",
    },
  };
}

function enqueueRunClosed(f: ConsumerFixture, index: number, enqueuedAt = FIXED_NOW): string {
  const id = `task:run_closed:${index}`;
  enqueueIndexTask(f.store, { id, pathway: "run_closed", payload: `attempt://run/attempt-${index}`, enqueuedAt });
  return id;
}

function insertDiscordMessages(store: KnowledgeStore, count: number): { from: string; to: string } {
  const insert = store.db.query(`INSERT INTO discord_message
    (id, channel, author, posted_at, content, thread_id, ingested_at)
    VALUES (?, 'chan', 'author', ?, ?, NULL, '2026-08-30T00:00:00.000Z')`);
  const base = 1_000_000n;
  for (let index = 0; index < count; index += 1) {
    insert.run(String(base + BigInt(index)), `2026-08-01T00:${String(index % 60).padStart(2, "0")}:00.000Z`, `message ${index}`);
  }
  return { from: String(base), to: String(base + BigInt(count - 1)) };
}

function modelResult(value: unknown): ReturnType<FakeRunPiAgent> {
  return Promise.resolve({
    sessionId: "fake-session",
    sessionDir: "/tmp/fake-session",
    outputPath: "/tmp/fake-output",
    systemPromptPath: "/tmp/fake-system",
    userPromptPath: "/tmp/fake-user",
    rawText: typeof value === "string" ? value : JSON.stringify(value),
    dryRun: false,
    failed: false,
  });
}

function runGit(repoRoot: string, ...args: string[]): string {
  const result = Bun.spawnSync(["git", "-C", repoRoot, ...args], {
    stdout: "pipe",
    stderr: "pipe",
  });
  if (result.exitCode !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${result.stderr.toString()}`);
  }
  return result.stdout.toString().trim();
}

function requestedTaskId(options: Parameters<FakeRunPiAgent>[0]): string {
  const taskId = options.kernelContext?.metadata?.taskId;
  if (typeof taskId !== "string") throw new Error("fake agent call has no task id");
  return taskId;
}

function fact(targetIndex: number): Record<string, unknown> {
  return {
    subject: { target_stable_key: `unit:func_${targetIndex}` },
    type: "purpose",
    op: "write",
    value: `Consumer purpose for target ${targetIndex}`,
    rationale: "The fixture PR and attempt both describe this target.",
    confidence: 0.9,
    evidence: [
      { kind: "pr", locator: `pr://pr-${targetIndex}`, why: "The merged PR records the target change." },
      { kind: "attempt", locator: `attempt://run/attempt-${targetIndex}/submission/1`, why: "The worker submission records the attempt." },
    ],
  };
}

function proposal(targetIndex: number): LibrarianPassEnvelope {
  return { facts: [fact(targetIndex)], links: [], entities: [], merges: [] };
}

const emptyProposal: LibrarianPassEnvelope = { facts: [], links: [], entities: [], merges: [] };

function rowCount(store: KnowledgeStore, table: CountedTable): number {
  return store.db.query<{ count: number }, []>(`SELECT COUNT(*) AS count FROM ${table}`).get()!.count;
}

function taskState(store: KnowledgeStore, id: string): TaskState {
  const row = store.db.query<TaskState, [string]>(
    "SELECT started_at, done_at, enqueued_at FROM index_task WHERE id = ?",
  ).get(id);
  if (!row) throw new Error(`task not found: ${id}`);
  return row;
}

function indexedAt(store: KnowledgeStore, targetId: string): string | null {
  return store.db.query<{ indexed_at: string }, [string]>(
    "SELECT indexed_at FROM subject_index_state WHERE target_id = ?",
  ).get(targetId)?.indexed_at ?? null;
}

function logEntries(f: ConsumerFixture, runId: string): Array<Record<string, unknown>> {
  const path = join(f.stateDir, "knowledge_v2", "librarian", runId, "run-log.jsonl");
  return readFileSync(path, "utf8").trim().split("\n").map((line) => JSON.parse(line) as Record<string, unknown>);
}

function taskRow(store: KnowledgeStore, id: string): LibrarianTaskRow {
  const row = store.db.query<LibrarianTaskRow, [string]>(
    "SELECT id, pathway, payload, enqueued_at, started_at, done_at FROM index_task WHERE id = ?",
  ).get(id);
  if (!row) throw new Error(`task not found: ${id}`);
  return row;
}

function driftReport(
  subject: DriftReport["subject"],
  counts: { drifted: number; unresolvable: number },
): DriftReport {
  return {
    subject,
    head_revision: "fixture-head",
    evidence: [],
    drifted_count: counts.drifted,
    unresolvable_count: counts.unresolvable,
  };
}

afterEach(() => {
  for (const item of fixtures.splice(0)) {
    item.store.close();
    rmSync(item.root, { recursive: true, force: true });
  }
});

describe("claimNextLibrarianTask", () => {
  test("claims run_closed and regression first, then pr_imported, archival_ingest, drift_recheck, FIFO within pathway", () => {
    const f = fixture("priority");
    const enqueue = (id: string, pathway: LibrarianPathway, enqueuedAt: string): void =>
      enqueueIndexTask(f.store, { id, pathway, payload: `payload-${id}`, enqueuedAt });
    enqueue("drift", "drift_recheck", "2026-08-01T00:00:00.000Z");
    enqueue("archival", "archival_ingest", "2026-08-02T00:00:00.000Z");
    enqueue("pr-b", "pr_imported", "2026-08-03T00:00:00.000Z");
    enqueue("pr-a", "pr_imported", "2026-08-03T00:00:00.000Z");
    enqueue("regression", "regression", "2026-08-04T00:00:00.000Z");
    enqueue("run-late", "run_closed", "2026-08-06T00:00:00.000Z");
    enqueue("run-early", "run_closed", "2026-08-05T00:00:00.000Z");

    const order: string[] = [];
    for (;;) {
      const claimed = claimNextLibrarianTask(f.store, { now: () => FIXED_NOW });
      if (claimed === undefined) break;
      expect(claimed.split).toBeUndefined();
      expect(claimed.task.started_at).toBe(FIXED_NOW);
      order.push(claimed.task.id);
    }
    expect(order).toEqual(["regression", "run-early", "run-late", "pr-a", "pr-b", "archival", "drift"]);
    for (const id of order) expect(taskState(f.store, id)).toMatchObject({ started_at: FIXED_NOW, done_at: null });
  });

  test("honors the pathway filter and the exclude set", () => {
    const f = fixture("filter");
    enqueueIndexTask(f.store, { id: "run-1", pathway: "run_closed", payload: "x", enqueuedAt: FIXED_NOW });
    enqueueIndexTask(f.store, { id: "pr-1", pathway: "pr_imported", payload: "x", enqueuedAt: FIXED_NOW });
    enqueueIndexTask(f.store, { id: "pr-2", pathway: "pr_imported", payload: "x", enqueuedAt: FIXED_NOW });

    const first = claimNextLibrarianTask(f.store, { pathway: "pr_imported", exclude: new Set(["pr-1"]) });
    expect(first?.task.id).toBe("pr-2");
    expect(claimNextLibrarianTask(f.store, { pathway: "pr_imported", exclude: new Set(["pr-1"]) })).toBeUndefined();
    expect(taskState(f.store, "run-1").started_at).toBeNull();
    expect(taskState(f.store, "pr-1").started_at).toBeNull();
  });

  test("claims only the selected queued task", () => {
    const f = fixture("task-selector");
    enqueueIndexTask(f.store, { id: "run-1", pathway: "run_closed", payload: "x", enqueuedAt: FIXED_NOW });
    enqueueIndexTask(f.store, { id: "pr-1", pathway: "pr_imported", payload: "x", enqueuedAt: FIXED_NOW });

    expect(claimNextLibrarianTask(f.store, { taskId: "pr-1" })?.task.id).toBe("pr-1");
    expect(claimNextLibrarianTask(f.store, { taskId: "pr-1" })).toBeUndefined();
    expect(taskState(f.store, "run-1").started_at).toBeNull();
  });

  test("splits an oversized Discord slice into 40/40/20 children and completes the parent", () => {
    const f = fixture("split");
    const range = insertDiscordMessages(f.store, 100);
    const payload = JSON.stringify({ source: "discord", channel_id: "chan", from_id: range.from, to_id: range.to, count: 100 });
    enqueueIndexTask(f.store, { id: "task:archival_ingest:big", pathway: "archival_ingest", payload, enqueuedAt: "2026-08-01T00:00:00.000Z" });

    const claimed = claimNextLibrarianTask(f.store, { now: () => FIXED_NOW });
    expect(claimed?.task.id).toBe("task:archival_ingest:big");
    expect(claimed?.split?.children).toEqual([
      "task:archival_ingest:big/1",
      "task:archival_ingest:big/2",
      "task:archival_ingest:big/3",
    ]);
    expect(claimed?.split?.enqueued).toBeTrue();
    expect(claimed?.split?.childPayloads.map((value) => (JSON.parse(value) as { count: number }).count)).toEqual([40, 40, 20]);
    expect(taskState(f.store, "task:archival_ingest:big")).toMatchObject({ started_at: FIXED_NOW, done_at: FIXED_NOW });
    const counts = claimed!.split!.children.map((id) => {
      const state = taskState(f.store, id);
      expect(state).toEqual({ started_at: null, done_at: null, enqueued_at: "2026-08-01T00:00:00.000Z" });
      return (JSON.parse(taskRow(f.store, id).payload) as { count: number }).count;
    });
    expect(counts).toEqual([40, 40, 20]);

    // The children are the next claims, in order.
    expect(claimNextLibrarianTask(f.store)?.task.id).toBe("task:archival_ingest:big/1");
  });

  test("computes a dry-run split without enqueueing children and releases the parent", () => {
    const f = fixture("split-dry");
    const range = insertDiscordMessages(f.store, 41);
    const payload = JSON.stringify({ source: "discord", channel_id: "chan", from_id: range.from, to_id: range.to, count: 41 });
    enqueueIndexTask(f.store, { id: "big", pathway: "archival_ingest", payload, enqueuedAt: FIXED_NOW });
    const claimed = claimNextLibrarianTask(f.store, { dryRun: true });
    expect(claimed?.split?.children).toEqual(["big/1", "big/2"]);
    expect(claimed?.split?.enqueued).toBeFalse();
    expect(claimed?.split?.childPayloads.map((value) => (JSON.parse(value) as { count: number }).count)).toEqual([40, 1]);
    expect(rowCount(f.store, "index_task")).toBe(1);
    expect(taskState(f.store, "big")).toMatchObject({ started_at: null, done_at: null });
  });

  test("splits 60 imported PR rows into grouped children and completes the parent with a split note", async () => {
    const f = fixture("pr-split");
    const parentId = "task:pr_imported:big";
    const enqueuedAt = "2026-08-01T00:00:00.000Z";
    const ids = Array.from({ length: 20 }, (_, unitIndex) => {
      const unit = `main-test-unit-${String(unitIndex).padStart(2, "0")}`;
      return [
        `pr-3178--${unit}`,
        `pr-3178--fn--${unit}-first--aaaa${unitIndex}`,
        `pr-3178--fn--${unit}-second--bbbb${unitIndex}`,
      ];
    }).flat();
    enqueueIndexTask(f.store, {
      id: parentId,
      pathway: "pr_imported",
      payload: JSON.stringify({ task_payload: ids }),
      enqueuedAt,
    });

    const summary = await runLibrarianConsumer(f.store, {
      runId: "pr-split-run",
      globals: f.globals,
      taskId: parentId,
      concurrency: 1,
      runPiAgent: () => { throw new Error("split parent must not run a model pass"); },
      now: () => FIXED_NOW,
    });

    expect(summary).toMatchObject({ passesRun: 0, tasksSplit: 1, childrenEnqueued: 3 });
    expect(taskState(f.store, parentId)).toMatchObject({ started_at: FIXED_NOW, done_at: FIXED_NOW });
    expect(logEntries(f, "pr-split-run")).toEqual([
      expect.objectContaining({
        task_id: parentId,
        status: "split",
        claim: "completed",
        note: "oversized imported PR task split into 3 child tasks; parent completed without a model pass",
        child_counts: [24, 24, 12],
      }),
    ]);

    const children = [1, 2, 3].map((index) => `${parentId}/${index}`);
    const childPayloads = children.map((id) => {
      expect(taskState(f.store, id)).toEqual({ started_at: null, done_at: null, enqueued_at: enqueuedAt });
      return JSON.parse(taskRow(f.store, id).payload) as {
        task_payload: string[];
        split_from: string;
        split_index: number;
        split_total: number;
      };
    });
    expect(childPayloads.map((payload) => payload.task_payload.length)).toEqual([24, 24, 12]);
    expect(childPayloads.map(({ split_from, split_index, split_total }) => ({ split_from, split_index, split_total }))).toEqual([
      { split_from: parentId, split_index: 1, split_total: 3 },
      { split_from: parentId, split_index: 2, split_total: 3 },
      { split_from: parentId, split_index: 3, split_total: 3 },
    ]);
    expect(childPayloads.flatMap((payload) => payload.task_payload)).toEqual(ids);
    for (const unitRows of Array.from({ length: 20 }, (_, index) => ids.slice(index * 3, index * 3 + 3))) {
      expect(childPayloads.filter((payload) => unitRows.every((id) => payload.task_payload.includes(id)))).toHaveLength(1);
    }
    expect(children.map(() => claimNextLibrarianTask(f.store)?.task.id)).toEqual(children);
  });

  test("does not split an imported PR task with exactly 24 rows", () => {
    const f = fixture("pr-split-boundary");
    const ids = Array.from({ length: 24 }, (_, index) => `pr-3178--unit-${index}`);
    enqueueIndexTask(f.store, {
      id: "task:pr_imported:boundary",
      pathway: "pr_imported",
      payload: JSON.stringify({ task_payload: ids }),
      enqueuedAt: FIXED_NOW,
    });

    const claimed = claimNextLibrarianTask(f.store, { now: () => FIXED_NOW });
    expect(claimed?.split).toBeUndefined();
    expect(taskState(f.store, "task:pr_imported:boundary")).toMatchObject({ started_at: FIXED_NOW, done_at: null });
  });

  test("projects an imported PR split during dry run without enqueueing children", () => {
    const f = fixture("pr-split-dry");
    const ids = Array.from({ length: 60 }, (_, index) => `pr-3304--unit-${String(index).padStart(2, "0")}`);
    enqueueIndexTask(f.store, {
      id: "task:pr_imported:dry",
      pathway: "pr_imported",
      payload: JSON.stringify({ task_payload: ids }),
      enqueuedAt: FIXED_NOW,
    });

    const claimed = claimNextLibrarianTask(f.store, { dryRun: true, now: () => FIXED_NOW });
    expect(claimed?.split?.children).toEqual([
      "task:pr_imported:dry/1",
      "task:pr_imported:dry/2",
      "task:pr_imported:dry/3",
    ]);
    expect(claimed?.split?.enqueued).toBeFalse();
    expect(claimed?.split?.childPayloads.map((payload) =>
      (JSON.parse(payload) as { task_payload: string[] }).task_payload.length)).toEqual([24, 24, 12]);
    expect(rowCount(f.store, "index_task")).toBe(1);
    expect(taskState(f.store, "task:pr_imported:dry")).toMatchObject({ started_at: null, done_at: null });
  });

  test("splits 30 batched drift subjects into 12/12/6 children with unit fields preserved", () => {
    const f = fixture("drift-split", 30);
    const parentId = "task:drift_recheck:unit-main";
    const enqueuedAt = "2026-08-01T00:00:00.000Z";
    const subjects = Array.from({ length: 30 }, (_, index) => ({
      target_id: `target-${index + 1}`,
      drifted: index + 1,
      unresolvable: 0,
    }));
    enqueueIndexTask(f.store, {
      id: parentId,
      pathway: "drift_recheck",
      payload: JSON.stringify({
        unit: "unit",
        unit_entity_id: "unit-main",
        reason: "drift",
        subjects,
      }),
      enqueuedAt,
    });

    const claimed = claimNextLibrarianTask(f.store, { now: () => FIXED_NOW });
    const children = [1, 2, 3].map((index) => `${parentId}/${index}`);
    expect(claimed?.split?.children).toEqual(children);
    expect(claimed?.split?.enqueued).toBeTrue();
    expect(taskState(f.store, parentId)).toMatchObject({ started_at: FIXED_NOW, done_at: FIXED_NOW });
    const payloads = children.map((id) => JSON.parse(taskRow(f.store, id).payload) as {
      unit: string;
      unit_entity_id: string;
      reason: string;
      subjects: typeof subjects;
      split_from: string;
      split_index: number;
      split_total: number;
    });
    expect(payloads.map((payload) => payload.subjects.length)).toEqual([12, 12, 6]);
    expect(payloads.map(({ unit, unit_entity_id, reason, split_from, split_index, split_total }) => ({
      unit, unit_entity_id, reason, split_from, split_index, split_total,
    }))).toEqual([
      { unit: "unit", unit_entity_id: "unit-main", reason: "drift", split_from: parentId, split_index: 1, split_total: 3 },
      { unit: "unit", unit_entity_id: "unit-main", reason: "drift", split_from: parentId, split_index: 2, split_total: 3 },
      { unit: "unit", unit_entity_id: "unit-main", reason: "drift", split_from: parentId, split_index: 3, split_total: 3 },
    ]);
    expect(payloads.flatMap((payload) => payload.subjects)).toEqual(subjects);
    expect(children.map(() => claimNextLibrarianTask(f.store)?.task.id)).toEqual(children);
  });

  test("does not split a batched drift task with exactly 12 subjects", () => {
    const f = fixture("drift-split-boundary", 12);
    enqueueIndexTask(f.store, {
      id: "task:drift_recheck:boundary",
      pathway: "drift_recheck",
      payload: JSON.stringify({
        unit: "unit",
        unit_entity_id: "unit-main",
        reason: "drift",
        subjects: Array.from({ length: 12 }, (_, index) => ({ target_id: `target-${index + 1}` })),
      }),
      enqueuedAt: FIXED_NOW,
    });

    expect(claimNextLibrarianTask(f.store, { now: () => FIXED_NOW })?.split).toBeUndefined();
  });

  test("does not split a single-subject drift follow-up", () => {
    const f = fixture("drift-single");
    enqueueIndexTask(f.store, {
      id: "task:drift_recheck:single",
      pathway: "drift_recheck",
      payload: JSON.stringify({ target_id: "target-1", reason: "follow_up" }),
      enqueuedAt: FIXED_NOW,
    });

    expect(claimNextLibrarianTask(f.store, { now: () => FIXED_NOW })?.split).toBeUndefined();
  });

  test("projects a batched drift split during dry run without enqueueing children", () => {
    const f = fixture("drift-split-dry", 13);
    const parentId = "task:drift_recheck:dry";
    enqueueIndexTask(f.store, {
      id: parentId,
      pathway: "drift_recheck",
      payload: JSON.stringify({
        unit: "unit",
        unit_entity_id: "unit-main",
        reason: "drift",
        subjects: Array.from({ length: 13 }, (_, index) => ({ target_id: `target-${index + 1}` })),
      }),
      enqueuedAt: FIXED_NOW,
    });

    const claimed = claimNextLibrarianTask(f.store, { dryRun: true, now: () => FIXED_NOW });
    expect(claimed?.split?.children).toEqual([`${parentId}/1`, `${parentId}/2`]);
    expect(claimed?.split?.enqueued).toBeFalse();
    expect(claimed?.split?.childPayloads.map((payload) =>
      (JSON.parse(payload) as { subjects: unknown[] }).subjects.length)).toEqual([12, 1]);
    expect(rowCount(f.store, "index_task")).toBe(1);
    expect(taskState(f.store, parentId)).toMatchObject({ started_at: null, done_at: null });
  });
});

describe("runLibrarianPass", () => {
  test("skips drift gating for archival ingest even when its touched subject has drift", async () => {
    const f = fixture("archival-drift-skip", 1);
    f.store.db.query(`INSERT INTO discord_message
      (id, channel, author, posted_at, content, thread_id, ingested_at)
      VALUES ('1000', 'chan', 'author', '2026-08-01T00:00:00.000Z',
        'unit:func_1 should keep this behavior', NULL, '2026-08-30T00:00:00.000Z')`).run();
    const id = "task:archival_ingest:drift-skip";
    enqueueIndexTask(f.store, {
      id,
      pathway: "archival_ingest",
      payload: JSON.stringify({ source: "discord", channel_id: "chan", from_id: "1000", to_id: "1000", count: 1 }),
      enqueuedAt: FIXED_NOW,
    });
    const claimed = claimNextLibrarianTask(f.store, { now: () => FIXED_NOW })!.task;
    let flaggerCalls = 0;

    const result = await runLibrarianPass(f.store, claimed, {
      runId: "archival-drift-skip-run",
      globals: f.globals,
      sharedWriteGate: createSharedGate(),
      runPiAgent: () => modelResult(emptyProposal),
      flagCodeDrift: (_store, options) => {
        flaggerCalls += 1;
        return driftReport(options.subject, { drifted: 1, unresolvable: 0 });
      },
      now: () => FIXED_NOW,
    });

    expect(result.context.touched).toHaveLength(1);
    expect(flaggerCalls).toBe(0);
    expect(taskState(f.store, id)).toMatchObject({ started_at: FIXED_NOW, done_at: FIXED_NOW });
    expect(taskRow(f.store, id).payload).not.toContain("drift_attempts");
    expect(JSON.parse(readFileSync(result.artifactPath, "utf8"))).toMatchObject({ drift_gate: "skipped" });
    expect(logEntries(f, "archival-drift-skip-run")).toEqual([
      expect.objectContaining({ task_id: id, claim: "completed", drift_gate: "skipped" }),
    ]);
  });

  test("keeps drift gating enabled for imported PRs", async () => {
    const f = fixture("pr-drift-gate", 1);
    const prsRoot = join(f.root, "prs");
    const extracted = join(prsRoot, "pr-101", "extracted");
    mkdirSync(extracted, { recursive: true });
    writeFileSync(join(extracted, "text_corpus.jsonl"), `${JSON.stringify({
      kind: "review_comment",
      author: "reviewer",
      created_at: "2026-08-21T00:00:00.000Z",
      body: "func_1 keeps the reviewed behavior.",
    })}\n`);
    f.store.db.query(`INSERT INTO pull_request
      (id, target_id, entity_id, pr_ref, summary, outcome, merged_at)
      VALUES ('pr-101--target-1', 'target-1', NULL, 'melee#101',
        'Fixture row for target 1', 'improvement', '2026-08-21T00:00:00.000Z')`).run();
    const id = "task:pr_imported:drift-gate";
    enqueueIndexTask(f.store, {
      id,
      pathway: "pr_imported",
      payload: JSON.stringify(["pr-101--target-1"]),
      enqueuedAt: FIXED_NOW,
    });
    const claimed = claimNextLibrarianTask(f.store, { now: () => FIXED_NOW })!.task;
    let flaggerCalls = 0;

    const result = await runLibrarianPass(f.store, claimed, {
      runId: "pr-drift-gate-run",
      globals: f.globals,
      prsRoot,
      sharedWriteGate: createSharedGate(),
      runPiAgent: () => modelResult(emptyProposal),
      flagCodeDrift: (_store, options) => {
        flaggerCalls += 1;
        return driftReport(options.subject, { drifted: 1, unresolvable: 0 });
      },
      now: () => FIXED_NOW,
    });

    expect(flaggerCalls).toBeGreaterThan(0);
    expect(taskState(f.store, id)).toMatchObject({ started_at: null, done_at: null });
    expect(JSON.parse(readFileSync(result.artifactPath, "utf8"))).toMatchObject({
      drift_gate: "released",
      drift_attempts: 1,
    });
  });

  test("keeps drift rechecks gated", async () => {
    const f = fixture("drift-recheck-gate", 1);
    const id = "task:drift_recheck:target-1";
    enqueueIndexTask(f.store, { id, pathway: "drift_recheck", payload: "target-1", enqueuedAt: FIXED_NOW });
    const claimed = claimNextLibrarianTask(f.store, { now: () => FIXED_NOW })!.task;
    let flaggerCalls = 0;

    const result = await runLibrarianPass(f.store, claimed, {
      runId: "drift-recheck-gate-run",
      globals: f.globals,
      sharedWriteGate: createSharedGate(),
      runPiAgent: () => modelResult(emptyProposal),
      flagCodeDrift: (_store, options) => {
        flaggerCalls += 1;
        return driftReport(options.subject, { drifted: 1, unresolvable: 0 });
      },
      now: () => FIXED_NOW,
    });

    expect(flaggerCalls).toBe(1);
    expect(taskState(f.store, id)).toMatchObject({ started_at: null, done_at: null });
    expect(JSON.parse(readFileSync(result.artifactPath, "utf8"))).toMatchObject({
      drift_gate: "released",
      drift_attempts: 1,
    });
  });

  test("releases the first unresolved drift pass, then completes the retry with a warning", async () => {
    const f = fixture("drift-retry", 1);
    const id = enqueueRunClosed(f, 1);
    const flagCodeDrift = (_store: unknown, options: { subject: DriftReport["subject"] }): DriftReport =>
      driftReport(options.subject, options.subject.targetId === "target-1"
        ? { drifted: 1, unresolvable: 0 }
        : { drifted: 0, unresolvable: 0 });

    const firstTask = claimNextLibrarianTask(f.store, { now: () => FIXED_NOW })!.task;
    const first = await runLibrarianPass(f.store, firstTask, {
      runId: "drift-retry-run",
      globals: f.globals,
      sharedWriteGate: createSharedGate(),
      runPiAgent: () => modelResult(emptyProposal),
      flagCodeDrift,
      now: () => FIXED_NOW,
    });

    expect(taskState(f.store, id)).toMatchObject({ started_at: null, done_at: null });
    expect(JSON.parse(taskRow(f.store, id).payload)).toEqual({
      task_payload: "attempt://run/attempt-1",
      drift_attempts: 1,
    });
    expect(indexedAt(f.store, "target-1")).toBeNull();
    expect(JSON.parse(readFileSync(first.artifactPath, "utf8"))).toMatchObject({
      drift_gate: "released",
      drift_attempts: 1,
      remaining_drift: [{ target_id: "target-1", drifted: 1, unresolvable: 0 }],
    });

    const warn = spyOn(console, "warn").mockImplementation(() => undefined);
    const retryTask = claimNextLibrarianTask(f.store, { now: () => FIXED_NOW })!.task;
    const retry = await runLibrarianPass(f.store, retryTask, {
      runId: "drift-retry-run",
      globals: f.globals,
      sharedWriteGate: createSharedGate(),
      runPiAgent: () => modelResult(emptyProposal),
      flagCodeDrift,
      now: () => FIXED_NOW,
    });

    expect(taskState(f.store, id)).toMatchObject({ started_at: FIXED_NOW, done_at: FIXED_NOW });
    expect(JSON.parse(taskRow(f.store, id).payload)).toEqual({
      task_payload: "attempt://run/attempt-1",
      drift_attempts: 2,
      drift_gate: "warned",
    });
    expect(indexedAt(f.store, "target-1")).toBe(FIXED_NOW);
    expect(warn).toHaveBeenCalledWith("drift left unresolved after retry");
    warn.mockRestore();
    expect(JSON.parse(readFileSync(retry.artifactPath, "utf8"))).toMatchObject({
      drift_gate: "warned",
      drift_attempts: 2,
      warning: "drift left unresolved after retry",
      remaining_drift: [{ target_id: "target-1", drifted: 1, unresolvable: 0 }],
    });
    expect(logEntries(f, "drift-retry-run")).toEqual([
      expect.objectContaining({
        task_id: id,
        status: "drift_remaining",
        claim: "released",
        drift_attempts: 1,
        remaining_drift: [{ target_id: "target-1", drifted: 1, unresolvable: 0 }],
      }),
      expect.objectContaining({
        task_id: id,
        status: "completed",
        claim: "completed",
        drift_attempts: 2,
        warning: "drift left unresolved after retry",
      }),
    ]);
  });

  test("completes a clean pass after checking every touched target and entity", async () => {
    const f = fixture("drift-clean", 1);
    const id = enqueueRunClosed(f, 1);
    const claimed = claimNextLibrarianTask(f.store, { now: () => FIXED_NOW })!.task;
    const checked: DriftReport["subject"][] = [];

    const result = await runLibrarianPass(f.store, claimed, {
      runId: "drift-clean-run",
      globals: f.globals,
      sharedWriteGate: createSharedGate(),
      runPiAgent: () => modelResult(emptyProposal),
      flagCodeDrift: (_store, options) => {
        checked.push(options.subject);
        return driftReport(options.subject, { drifted: 0, unresolvable: 0 });
      },
      now: () => FIXED_NOW,
    });

    expect(checked).toEqual([{ entityId: "unit-main" }, { targetId: "target-1" }]);
    expect(taskState(f.store, id)).toMatchObject({ started_at: FIXED_NOW, done_at: FIXED_NOW });
    expect(JSON.parse(readFileSync(result.artifactPath, "utf8"))).not.toHaveProperty("remaining_drift");
    expect(JSON.parse(readFileSync(result.artifactPath, "utf8"))).toMatchObject({ drift_gate: "clean" });
    expect(logEntries(f, "drift-clean-run")).toEqual([
      expect.objectContaining({ task_id: id, status: "completed", claim: "completed" }),
    ]);
  });

  test("applies the proposal, stamps the touched target, completes the task, and writes the artifact", async () => {
    const f = fixture("happy", 1);
    const id = enqueueRunClosed(f, 1);
    const claimed = claimNextLibrarianTask(f.store, { now: () => FIXED_NOW });
    let clock = 0;
    let promptTouched: unknown;

    const result = await runLibrarianPass(f.store, claimed!.task, {
      runId: "happy-run",
      globals: f.globals,
      sharedWriteGate: createSharedGate(),
      runPiAgent: (options) => {
        expect(options.catalogAgentId).toBe("librarian-v2");
        expect(options.role).toBe("librarian");
        expect(options.toolProfile?.disable).toBeUndefined();
        promptTouched = options.prompt.kernelContext?.renderedContext;
        return modelResult(proposal(1));
      },
      now: () => FIXED_NOW,
      clockMs: () => clock++,
    });

    expect(typeof promptTouched).toBe("string");
    expect(promptTouched as string).toContain("unit:func_1");
    expect(result.applyReport.counts).toEqual({ applied: 1, rejected: 0, skipped: 0 });
    expect(result.stamped).toEqual({ targetIds: ["target-1"], entityIds: [] });
    expect(f.store.db.query("SELECT target_id, type, value FROM fact").get()).toEqual({
      target_id: "target-1",
      type: "purpose",
      value: "Consumer purpose for target 1",
    });
    expect(rowCount(f.store, "evidence")).toBe(2);
    expect(indexedAt(f.store, "target-1")).toBe(FIXED_NOW);
    expect(taskState(f.store, id)).toMatchObject({ started_at: FIXED_NOW, done_at: FIXED_NOW });

    const artifact = JSON.parse(readFileSync(result.artifactPath, "utf8")) as LibrarianPassArtifact;
    expect(result.artifactPath).toBe(join(f.stateDir, "knowledge_v2", "librarian", "happy-run", "task-run-closed-1.json"));
    expect(artifact).toMatchObject({
      run_id: "happy-run",
      task: { id, pathway: "run_closed" },
      proposal: proposal(1),
      dry_run: false,
      apply_report: { counts: { applied: 1, rejected: 0, skipped: 0 } },
    });
    expect(artifact.context.touched.map((subject) => subject.kind)).toEqual(["entity", "target"]);
    expect(logEntries(f, "happy-run")).toEqual([
      expect.objectContaining({ task_id: id, status: "completed", claim: "completed" }),
    ]);
  });

  test("retries an out-of-scope proposal once with the rejection context and applies the correction", async () => {
    const f = fixture("validation-retry", 2);
    const id = enqueueRunClosed(f, 1);
    const claimed = claimNextLibrarianTask(f.store, { now: () => FIXED_NOW })!.task;
    const calls: Parameters<FakeRunPiAgent>[0][] = [];

    const result = await runLibrarianPass(f.store, claimed, {
      runId: "validation-retry-run",
      globals: f.globals,
      sharedWriteGate: createSharedGate(),
      runPiAgent: (options) => {
        calls.push(options);
        return modelResult(calls.length === 1 ? proposal(2) : proposal(1));
      },
      now: () => FIXED_NOW,
    });

    expect(calls).toHaveLength(2);
    const retryContext = calls[1]!.prompt.kernelContext?.renderedContext ?? "";
    expect(retryContext).toContain("<retry>");
    expect(retryContext).toContain("out_of_scope");
    expect(retryContext).toContain("not a touched subject");
    expect(result.applyReport.counts).toEqual({ applied: 1, rejected: 0, skipped: 0 });
    expect(f.store.db.query("SELECT target_id, value FROM fact").all()).toEqual([
      { target_id: "target-1", value: "Consumer purpose for target 1" },
    ]);
    expect(JSON.parse(readFileSync(result.artifactPath, "utf8"))).toMatchObject({
      validation_gate: "retried",
      validation_rejections: [expect.objectContaining({
        index: 0,
        itemKind: "fact",
        reason: "out_of_scope",
        message: expect.stringContaining("not a touched subject"),
      })],
      retry_proposal: proposal(1),
    });
    expect(logEntries(f, "validation-retry-run")).toEqual([
      expect.objectContaining({ task_id: id, validation_gate: "retried" }),
    ]);
  });

  test("warns but completes when the retried proposal is still rejected", async () => {
    const f = fixture("validation-warned", 2);
    const id = enqueueRunClosed(f, 1);
    const claimed = claimNextLibrarianTask(f.store, { now: () => FIXED_NOW })!.task;
    const warn = spyOn(console, "warn").mockImplementation(() => undefined);
    let calls = 0;

    const result = await runLibrarianPass(f.store, claimed, {
      runId: "validation-warned-run",
      globals: f.globals,
      sharedWriteGate: createSharedGate(),
      runPiAgent: () => {
        calls += 1;
        return modelResult(proposal(2));
      },
      now: () => FIXED_NOW,
    });

    expect(calls).toBe(2);
    expect(result.applyReport.counts).toEqual({ applied: 0, rejected: 1, skipped: 0 });
    expect(rowCount(f.store, "fact")).toBe(0);
    expect(taskState(f.store, id)).toMatchObject({ done_at: FIXED_NOW });
    expect(warn.mock.calls.flat().join(" ")).toContain(id);
    expect(warn.mock.calls.flat().join(" ")).toContain("out_of_scope");
    warn.mockRestore();
    expect(JSON.parse(readFileSync(result.artifactPath, "utf8"))).toMatchObject({
      validation_gate: "warned",
      retry_proposal: proposal(2),
    });
  });

  test("does not retry a proposal that passes validation", async () => {
    const f = fixture("validation-clean", 1);
    enqueueRunClosed(f, 1);
    const claimed = claimNextLibrarianTask(f.store, { now: () => FIXED_NOW })!.task;
    let calls = 0;

    const result = await runLibrarianPass(f.store, claimed, {
      runId: "validation-clean-run",
      globals: f.globals,
      sharedWriteGate: createSharedGate(),
      runPiAgent: () => {
        calls += 1;
        return modelResult(proposal(1));
      },
      now: () => FIXED_NOW,
    });

    expect(calls).toBe(1);
    expect(JSON.parse(readFileSync(result.artifactPath, "utf8"))).toMatchObject({
      validation_gate: "clean",
    });
  });

  test("retries an unknown envelope key and applies the corrected envelope", async () => {
    const f = fixture("validation-envelope", 1);
    enqueueRunClosed(f, 1);
    const claimed = claimNextLibrarianTask(f.store, { now: () => FIXED_NOW })!.task;
    let calls = 0;

    const result = await runLibrarianPass(f.store, claimed, {
      runId: "validation-envelope-run",
      globals: f.globals,
      sharedWriteGate: createSharedGate(),
      runPiAgent: (options) => {
        calls += 1;
        if (calls === 2) {
          expect(options.prompt.kernelContext?.renderedContext).toContain("unknown_envelope_key");
          expect(options.prompt.kernelContext?.renderedContext).toContain("fact_writes");
        }
        return modelResult(calls === 1
          ? { ...proposal(1), fact_writes: [fact(1)] }
          : proposal(1));
      },
      now: () => FIXED_NOW,
    });

    expect(calls).toBe(2);
    expect(result.applyReport.counts).toEqual({ applied: 1, rejected: 0, skipped: 0 });
    expect(rowCount(f.store, "fact")).toBe(1);
    expect(JSON.parse(readFileSync(result.artifactPath, "utf8"))).toMatchObject({
      validation_gate: "retried",
      validation_rejections: expect.arrayContaining([expect.objectContaining({
        reason: "unknown_envelope_key",
        message: expect.stringContaining("fact_writes"),
      })]),
    });
  });

  test("enqueues accepted follow-ups once per subject and reports the created task ids", async () => {
    const f = fixture("follow-up-enqueue", 3);
    const id = enqueueRunClosed(f, 1);
    enqueueIndexTask(f.store, {
      id: "task:drift_recheck:pending-target-2",
      pathway: "drift_recheck",
      payload: JSON.stringify({ target_id: "target-2", reason: "existing" }),
      enqueuedAt: FIXED_NOW,
    });
    const claimed = claimNextLibrarianTask(f.store, { taskId: id, now: () => FIXED_NOW })!.task;
    const withFollowUps = {
      ...emptyProposal,
      follow_ups: [
        { subject: { target_stable_key: "unit:func_2" }, why: "Inspect the sibling." },
        { subject: { target_stable_key: "unit:func_3" }, why: "Inspect the other sibling." },
      ],
    } as unknown as LibrarianPassEnvelope;

    const result = await runLibrarianPass(f.store, claimed, {
      runId: "follow-up-enqueue-run",
      globals: f.globals,
      sharedWriteGate: createSharedGate(),
      runPiAgent: () => modelResult(withFollowUps),
      now: () => FIXED_NOW,
    });

    const pending = f.store.db.query<{ id: string; payload: string }, []>(`
      SELECT id, payload FROM index_task
      WHERE pathway = 'drift_recheck' AND done_at IS NULL
      ORDER BY id
    `).all();
    expect(pending).toHaveLength(2);
    expect(pending.find((task) => task.id === "task:drift_recheck:pending-target-2")).toBeDefined();
    const created = pending.filter((task) => task.id !== "task:drift_recheck:pending-target-2");
    expect(created).toHaveLength(1);
    expect(JSON.parse(created[0]!.payload)).toEqual({
      target_id: "target-3",
      reason: "follow_up: Inspect the other sibling.",
      requested_by_task: id,
    });
    expect(JSON.parse(readFileSync(result.artifactPath, "utf8"))).toMatchObject({
      follow_ups_enqueued: [created[0]!.id],
    });
    expect(logEntries(f, "follow-up-enqueue-run")).toEqual([
      expect.objectContaining({ follow_ups_enqueued: [created[0]!.id] }),
    ]);
  });

  test("requires the triggering PR citation for pr_imported facts", async () => {
    const f = fixture("pr-citation", 1);
    const prsRoot = join(f.root, "prs");
    const extracted = join(prsRoot, "pr-101", "extracted");
    mkdirSync(extracted, { recursive: true });
    writeFileSync(join(extracted, "text_corpus.jsonl"), `${JSON.stringify({
      kind: "review_comment",
      author: "reviewer",
      created_at: "2026-08-21T00:00:00.000Z",
      body: "The fixture_func_1 name reflects the reviewed command behavior.",
    })}\n`);
    writeFileSync(join(f.root, "sample.c"), "fixture implementation\n");
    runGit(f.root, "init");
    runGit(f.root, "config", "user.email", "consumer-test@example.com");
    runGit(f.root, "config", "user.name", "Consumer Test");
    runGit(f.root, "add", "sample.c");
    runGit(f.root, "commit", "-m", "fixture");
    const revision = runGit(f.root, "rev-parse", "HEAD");
    f.store.db.query(`INSERT INTO pull_request
      (id, target_id, entity_id, pr_ref, summary, outcome, merged_at)
      VALUES ('pr-101--target-1', 'target-1', NULL, 'melee#101',
        'Fixture CI row for target 1', 'improvement', '2026-08-21T00:00:00.000Z')`).run();
    const payload = JSON.stringify(["pr-101--target-1"]);
    const codeOnlyFact = {
      ...fact(1),
      evidence: [{
        kind: "code",
        locator: `code://${revision}/sample.c#L1-L1`,
        why: "The source shows the implementation.",
      }],
    };

    enqueueIndexTask(f.store, {
      id: "task:pr_imported:code-only",
      pathway: "pr_imported",
      payload,
      enqueuedAt: FIXED_NOW,
    });
    const codeOnlyTask = claimNextLibrarianTask(f.store, { now: () => FIXED_NOW })!.task;
    const rejected = await runLibrarianPass(f.store, codeOnlyTask, {
      runId: "pr-code-only-run",
      globals: f.globals,
      sharedWriteGate: createSharedGate(),
      prsRoot,
      runPiAgent: () => modelResult({ facts: [codeOnlyFact], links: [], entities: [], merges: [] }),
      now: () => FIXED_NOW,
    });

    expect(rejected.context.object).toMatchObject({ pr_number: 101 });
    expect(rejected.applyReport.counts).toEqual({ applied: 0, rejected: 1, skipped: 0 });
    expect(rejected.applyReport.items).toEqual([
      expect.objectContaining({ itemKind: "fact", action: "rejected", reason: "missing_pr_citation" }),
    ]);
    expect(JSON.parse(readFileSync(rejected.artifactPath, "utf8"))).toMatchObject({
      apply_report: {
        counts: { applied: 0, rejected: 1, skipped: 0 },
        items: [expect.objectContaining({ reason: "missing_pr_citation" })],
      },
    });

    enqueueIndexTask(f.store, {
      id: "task:pr_imported:matching-pr",
      pathway: "pr_imported",
      payload,
      enqueuedAt: FIXED_NOW,
    });
    const matchingTask = claimNextLibrarianTask(f.store, { now: () => FIXED_NOW })!.task;
    const applied = await runLibrarianPass(f.store, matchingTask, {
      runId: "pr-matching-citation-run",
      globals: f.globals,
      sharedWriteGate: createSharedGate(),
      prsRoot,
      runPiAgent: () => modelResult({
        facts: [{
          ...codeOnlyFact,
          evidence: [...codeOnlyFact.evidence, {
            kind: "pr",
            locator: "pr://101/comment/0",
            why: "The reviewer explains the fixture_func_1 naming decision.",
          }],
        }],
        links: [],
        entities: [],
        merges: [],
      }),
      now: () => FIXED_NOW,
    });

    expect(applied.applyReport.counts).toEqual({ applied: 1, rejected: 0, skipped: 0 });
    expect(rowCount(f.store, "fact")).toBe(1);
  });

  test("accepts a head code citation for a drifted pr_imported fact", async () => {
    const f = fixture("pr-drifted-code-citation", 1);
    const prsRoot = join(f.root, "prs");
    const extracted = join(prsRoot, "pr-101", "extracted");
    mkdirSync(extracted, { recursive: true });
    writeFileSync(join(extracted, "text_corpus.jsonl"), `${JSON.stringify({
      kind: "review_comment",
      author: "reviewer",
      created_at: "2026-08-21T00:00:00.000Z",
      body: "This discussion does not name the touched target.",
    })}\n`);
    writeFileSync(join(f.root, "sample.c"), "fixture implementation\n");
    runGit(f.root, "init");
    runGit(f.root, "config", "user.email", "consumer-test@example.com");
    runGit(f.root, "config", "user.name", "Consumer Test");
    runGit(f.root, "add", "sample.c");
    runGit(f.root, "commit", "-m", "fixture");
    const revision = runGit(f.root, "rev-parse", "--short", "HEAD");
    writeFactWithEvidence(f.store, {
      id: "fact-drifted-purpose",
      targetId: "target-1",
      type: "purpose",
      value: "Stale purpose",
      rationale: "Fixture drift input.",
      confidence: 0.7,
    }, [{
      id: "evidence-drifted-purpose",
      kind: "code",
      locator: `code://${revision}/sample.c#L1-L1`,
      digest: "sha256:stale",
      why: "Stale source evidence.",
    }]);
    f.store.db.query(`INSERT INTO pull_request
      (id, target_id, entity_id, pr_ref, summary, outcome, merged_at)
      VALUES ('pr-101--target-1', 'target-1', NULL, 'melee#101',
        'Fixture row for target 1', 'improvement', '2026-08-21T00:00:00.000Z')`).run();
    const id = "task:pr_imported:drifted-code-citation";
    enqueueIndexTask(f.store, {
      id,
      pathway: "pr_imported",
      payload: JSON.stringify(["pr-101--target-1"]),
      enqueuedAt: FIXED_NOW,
    });
    const claimed = claimNextLibrarianTask(f.store, { now: () => FIXED_NOW })!.task;

    const result = await runLibrarianPass(f.store, claimed, {
      runId: "pr-drifted-code-citation-run",
      globals: f.globals,
      sharedWriteGate: createSharedGate(),
      prsRoot,
      runPiAgent: () => modelResult({
        facts: [{
          ...fact(1),
          evidence: [{
            kind: "code",
            locator: `code://${revision}/sample.c#L1-L1`,
            why: "The head source re-cites the drifted purpose.",
          }],
        }],
        links: [],
        entities: [],
        merges: [],
      }),
      now: () => FIXED_NOW,
    });

    expect(result.context.touched).toContainEqual(expect.objectContaining({
      kind: "target",
      target_stable_key: "unit:func_1",
      drift: expect.objectContaining({
        evidence: [expect.objectContaining({ fact_type: "purpose", status: "drifted" })],
      }),
    }));
    expect(result.applyReport.counts).toEqual({ applied: 1, rejected: 0, skipped: 0 });
    expect(result.driftGate).toBe("clean");
    expect(taskState(f.store, id)).toMatchObject({ started_at: FIXED_NOW, done_at: FIXED_NOW });
  });

  test("rejects a malformed envelope, releases the claim, and writes nothing", async () => {
    const f = fixture("malformed", 1);
    const id = enqueueRunClosed(f, 1);
    const claimed = claimNextLibrarianTask(f.store, { now: () => FIXED_NOW });

    await expect(runLibrarianPass(f.store, claimed!.task, {
      runId: "malformed-run",
      globals: f.globals,
      sharedWriteGate: createSharedGate(),
      runPiAgent: () => modelResult({ facts: "nope" }),
      now: () => FIXED_NOW,
    })).rejects.toThrow("malformed librarian_pass_v1 envelope");

    expect(taskState(f.store, id)).toMatchObject({ started_at: null, done_at: null });
    expect(rowCount(f.store, "fact")).toBe(0);
    expect(rowCount(f.store, "subject_index_state")).toBe(0);
    expect(logEntries(f, "malformed-run")).toEqual([
      expect.objectContaining({ task_id: id, status: "failed", claim: "released" }),
    ]);
  });

  test("fails a task whose context cannot be assembled without calling the model", async () => {
    const f = fixture("no-context", 1);
    enqueueIndexTask(f.store, { id: "dangling", pathway: "run_closed", payload: "attempt://run/missing", enqueuedAt: FIXED_NOW });
    const claimed = claimNextLibrarianTask(f.store);
    let calls = 0;
    await expect(runLibrarianPass(f.store, claimed!.task, {
      runId: "no-context-run",
      globals: f.globals,
      sharedWriteGate: createSharedGate(),
      runPiAgent: () => {
        calls += 1;
        return modelResult(emptyProposal);
      },
    })).rejects.toThrow("context assembly failed: Worker run not found: missing");
    expect(calls).toBe(0);
    expect(taskState(f.store, "dangling").started_at).toBeNull();
  });
});

describe("runLibrarianConsumer", () => {
  test("splits a batched drift task on the third claim after two model failures", async () => {
    const f = fixture("failure-split", 4);
    const id = "task:drift_recheck:failure-split";
    const subjects = Array.from({ length: 4 }, (_, index) => ({
      target_id: `target-${index + 1}`,
      drifted: 1,
      unresolvable: 0,
    }));
    enqueueIndexTask(f.store, {
      id,
      pathway: "drift_recheck",
      payload: JSON.stringify({ unit: "unit", unit_entity_id: "unit-main", reason: "drift", subjects }),
      enqueuedAt: "2026-08-01T00:00:00.000Z",
    });
    let modelCalls = 0;

    for (let failure = 1; failure <= 2; failure += 1) {
      const claimed = claimNextLibrarianTask(f.store, { now: () => FIXED_NOW })!.task;
      await expect(runLibrarianPass(f.store, claimed, {
        runId: `failure-split-${failure}`,
        globals: f.globals,
        sharedWriteGate: createSharedGate(),
        runPiAgent: async () => {
          modelCalls += 1;
          throw new Error(`upstream unavailable ${failure}`);
        },
        now: () => FIXED_NOW,
      })).rejects.toThrow(`upstream unavailable ${failure}`);
      expect(JSON.parse(taskRow(f.store, id).payload)).toMatchObject({
        failure_count: failure,
        last_error: `upstream unavailable ${failure}`,
      });
    }

    const claimed = claimNextLibrarianTask(f.store, { now: () => FIXED_NOW });
    expect(modelCalls).toBe(2);
    expect(claimed?.split?.children).toEqual([`${id}/1`, `${id}/2`]);
    expect(taskState(f.store, id)).toMatchObject({ started_at: FIXED_NOW, done_at: FIXED_NOW });
    const children = [`${id}/1`, `${id}/2`].map((childId) => taskRow(f.store, childId));
    expect(children.map((child) => child.enqueued_at)).toEqual([
      "2026-08-01T00:00:00.000Z",
      "2026-08-01T00:00:00.000Z",
    ]);
    expect(children.map((child) => JSON.parse(child.payload))).toEqual([
      expect.objectContaining({
        task_payload: expect.objectContaining({ subjects: subjects.slice(0, 2) }),
        failure_count: 0,
      }),
      expect.objectContaining({
        task_payload: expect.objectContaining({ subjects: subjects.slice(2) }),
        failure_count: 0,
      }),
    ]);
  });

  test("abandons a single-subject task on the third claim and counts it in the summary", async () => {
    const f = fixture("failure-abandon", 1);
    const id = "task:drift_recheck:failure-abandon";
    enqueueIndexTask(f.store, {
      id,
      pathway: "drift_recheck",
      payload: JSON.stringify({
        unit: "unit",
        unit_entity_id: "unit-main",
        reason: "drift",
        subjects: [{ target_id: "target-1", drifted: 1, unresolvable: 0 }],
      }),
      enqueuedAt: FIXED_NOW,
    });

    for (let failure = 1; failure <= 2; failure += 1) {
      const claimed = claimNextLibrarianTask(f.store, { now: () => FIXED_NOW })!.task;
      await expect(runLibrarianPass(f.store, claimed, {
        runId: `failure-abandon-${failure}`,
        globals: f.globals,
        sharedWriteGate: createSharedGate(),
        runPiAgent: async () => { throw new Error(`context limit ${failure}`); },
        now: () => FIXED_NOW,
      })).rejects.toThrow(`context limit ${failure}`);
    }

    let modelCalls = 0;
    const summary = await runLibrarianConsumer(f.store, {
      runId: "failure-abandon-third",
      globals: f.globals,
      concurrency: 1,
      runPiAgent: () => {
        modelCalls += 1;
        return modelResult(emptyProposal);
      },
      now: () => FIXED_NOW,
    });

    const warning = "abandoned after 2 failures: context limit 2";
    expect(modelCalls).toBe(0);
    expect(summary).toMatchObject({ passesRun: 0, passesAbandoned: 1, tasksRemaining: 0 });
    expect(taskState(f.store, id)).toMatchObject({ started_at: FIXED_NOW, done_at: FIXED_NOW });
    expect(rowCount(f.store, "subject_index_state")).toBe(0);
    expect(logEntries(f, "failure-abandon-third")).toEqual([
      expect.objectContaining({ task_id: id, status: "abandoned", warning }),
    ]);
    const artifactPath = join(
      f.stateDir,
      "knowledge_v2",
      "librarian",
      "failure-abandon-third",
      "task-drift-recheck-failure-abandon.json",
    );
    expect(JSON.parse(readFileSync(artifactPath, "utf8"))).toMatchObject({
      task: expect.objectContaining({ id }),
      status: "abandoned",
      warning,
    });
  });

  test("drains the queue in order, splitting the oversized slice, and reports the summary", async () => {
    const f = fixture("drain", 2);
    const range = insertDiscordMessages(f.store, 50);
    enqueueIndexTask(f.store, {
      id: "task:archival_ingest:big",
      pathway: "archival_ingest",
      payload: JSON.stringify({ source: "discord", channel_id: "chan", from_id: range.from, to_id: range.to, count: 50 }),
      enqueuedAt: "2026-08-01T00:00:00.000Z",
    });
    enqueueRunClosed(f, 2, "2026-08-02T00:00:00.000Z");
    enqueueRunClosed(f, 1, "2026-08-01T00:00:00.000Z");
    const calls: string[] = [];
    const fakeAgent: FakeRunPiAgent = (options) => {
      const taskId = requestedTaskId(options);
      calls.push(taskId);
      const match = /^task:run_closed:(\d+)$/.exec(taskId);
      return modelResult(match ? proposal(Number(match[1])) : emptyProposal);
    };

    const summary = await runLibrarianConsumer(f.store, {
      runId: "drain-run",
      globals: f.globals,
      concurrency: 1,
      runPiAgent: fakeAgent,
      now: () => FIXED_NOW,
    });

    expect(calls).toEqual([
      "task:run_closed:1",
      "task:run_closed:2",
      "task:archival_ingest:big/1",
      "task:archival_ingest:big/2",
    ]);
    expect(summary).toMatchObject({
      passesRun: 4,
      passesApplied: 4,
      itemsApplied: 2,
      passesFailed: 0,
      passesAbandoned: 0,
      tasksSplit: 1,
      childrenEnqueued: 2,
      tasksRemaining: 0,
      aborted: false,
      stopped: false,
    });
    expect(indexedAt(f.store, "target-1")).toBe(FIXED_NOW);
    expect(indexedAt(f.store, "target-2")).toBe(FIXED_NOW);
    expect(f.store.db.query<{ n: number }, []>("SELECT COUNT(*) AS n FROM index_task WHERE done_at IS NULL").get()!.n).toBe(0);
    const statuses = logEntries(f, "drain-run").map((entry) => [entry.task_id, entry.status]);
    expect(statuses).toEqual([
      ["task:run_closed:1", "completed"],
      ["task:run_closed:2", "completed"],
      ["task:archival_ingest:big", "split"],
      ["task:archival_ingest:big/1", "completed"],
      ["task:archival_ingest:big/2", "completed"],
    ]);
  });

  test("dry run validates, writes the artifact, releases the claim, and writes nothing to the store", async () => {
    const f = fixture("dry-run", 1);
    const id = enqueueRunClosed(f, 1);
    const tables: CountedTable[] = ["entity", "fact", "evidence", "link", "subject_index_state", "index_task"];
    const before = Object.fromEntries(tables.map((table) => [table, rowCount(f.store, table)]));
    const dataVersionBefore = f.store.db.query<{ data_version: number }, []>("PRAGMA data_version").get();

    let calls = 0;
    const summary = await runLibrarianConsumer(f.store, {
      runId: "dry-run",
      globals: f.globals,
      concurrency: 1,
      dryRun: true,
      runPiAgent: () => {
        calls += 1;
        return modelResult(calls === 1 ? proposal(2) : proposal(1));
      },
      now: () => FIXED_NOW,
    });

    expect(calls).toBe(2);
    expect(summary).toMatchObject({ dryRun: true, passesRun: 1, passesApplied: 1, itemsApplied: 1, passesFailed: 0, tasksRemaining: 1 });
    expect(Object.fromEntries(tables.map((table) => [table, rowCount(f.store, table)]))).toEqual(before);
    expect(f.store.db.query<{ data_version: number }, []>("PRAGMA data_version").get()).toEqual(dataVersionBefore);
    expect(taskState(f.store, id)).toMatchObject({ started_at: null, done_at: null });
    expect(indexedAt(f.store, "target-1")).toBeNull();
    const artifactPath = join(f.stateDir, "knowledge_v2", "librarian", "dry-run", "task-run-closed-1.json");
    expect(existsSync(artifactPath)).toBeTrue();
    expect(JSON.parse(readFileSync(artifactPath, "utf8"))).toMatchObject({
      dry_run: true,
      validation_gate: "retried",
      retry_proposal: proposal(1),
      follow_ups_projected: [],
      apply_report: { dryRun: true, counts: { applied: 1, rejected: 0, skipped: 0 } },
    });
    expect(logEntries(f, "dry-run")).toEqual([
      expect.objectContaining({ task_id: id, status: "completed", dry_run: true, claim: "released" }),
    ]);
  });

  test("dry-run drain logs a virtual split and continues to the next queued task", async () => {
    const f = fixture("dry-split-drain", 1);
    const range = insertDiscordMessages(f.store, 41);
    enqueueIndexTask(f.store, {
      id: "task:archival_ingest:big",
      pathway: "archival_ingest",
      payload: JSON.stringify({ source: "discord", channel_id: "chan", from_id: range.from, to_id: range.to, count: 41 }),
      enqueuedAt: "2026-08-01T00:00:00.000Z",
    });
    enqueueIndexTask(f.store, {
      id: "task:archival_ingest:small",
      pathway: "archival_ingest",
      payload: JSON.stringify({ source: "discord", channel_id: "chan", from_id: range.to, to_id: range.to, count: 1 }),
      enqueuedAt: "2026-08-02T00:00:00.000Z",
    });
    const before = rowCount(f.store, "index_task");
    const calls: string[] = [];

    const summary = await runLibrarianConsumer(f.store, {
      runId: "dry-split-drain-run",
      globals: f.globals,
      concurrency: 1,
      dryRun: true,
      runPiAgent: (options) => {
        calls.push(requestedTaskId(options));
        return modelResult(emptyProposal);
      },
      now: () => FIXED_NOW,
    });

    expect(calls).toEqual(["task:archival_ingest:small"]);
    expect(rowCount(f.store, "index_task")).toBe(before);
    expect(taskState(f.store, "task:archival_ingest:big")).toMatchObject({ started_at: null, done_at: null });
    expect(summary).toMatchObject({ passesRun: 1, tasksSplit: 1, childrenEnqueued: 0, tasksRemaining: 2 });
    expect(logEntries(f, "dry-split-drain-run")).toEqual([
      expect.objectContaining({
        task_id: "task:archival_ingest:big",
        status: "split",
        dry_run: true,
        claim: "released",
        children: ["task:archival_ingest:big/1", "task:archival_ingest:big/2"],
        child_counts: [40, 1],
        note: "dry run: oversized archival slice would be re-chunked into 2 child tasks; nothing enqueued, parent released",
      }),
      expect.objectContaining({ task_id: "task:archival_ingest:small", status: "completed", dry_run: true }),
    ]);
  });

  test("task selector runs only the requested queued task", async () => {
    const f = fixture("consumer-task", 2);
    enqueueRunClosed(f, 1);
    enqueueRunClosed(f, 2);
    const calls: string[] = [];
    const summary = await runLibrarianConsumer(f.store, {
      runId: "consumer-task-run",
      globals: f.globals,
      concurrency: 1,
      taskId: "task:run_closed:2",
      quiet: true,
      runPiAgent: (options) => {
        calls.push(requestedTaskId(options));
        return modelResult(proposal(2));
      },
      now: () => FIXED_NOW,
    });
    expect(calls).toEqual(["task:run_closed:2"]);
    expect(summary).toMatchObject({ passesRun: 1, tasksRemaining: 1 });
    expect(taskState(f.store, "task:run_closed:1").started_at).toBeNull();
  });

  test("task selector reports an unavailable task unless quiet", async () => {
    const f = fixture("consumer-task-missing", 1);
    const error = spyOn(console, "error").mockImplementation(() => undefined);
    const summary = await runLibrarianConsumer(f.store, {
      runId: "consumer-task-missing-run",
      globals: f.globals,
      taskId: "missing",
      quiet: false,
    });
    expect(summary.passesRun).toBe(0);
    expect(error).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenCalledWith("kg2-librarian: task missing is not queued (missing, claimed, or done)");
    error.mockClear();
    await runLibrarianConsumer(f.store, {
      runId: "consumer-task-missing-quiet-run",
      globals: f.globals,
      taskId: "missing",
      quiet: true,
    });
    expect(error).not.toHaveBeenCalled();
    error.mockRestore();
  });

  test("quiet suppresses the JSON summary", async () => {
    const f = fixture("quiet");
    const log = spyOn(console, "log").mockImplementation(() => undefined);
    await runLibrarianConsumer(f.store, { runId: "quiet-run", globals: f.globals, quiet: true });
    expect(log).not.toHaveBeenCalled();
    log.mockRestore();
  });

  test("exclude seeds the seen set", async () => {
    const f = fixture("exclude", 2);
    enqueueRunClosed(f, 1);
    enqueueRunClosed(f, 2);
    const calls: string[] = [];
    await runLibrarianConsumer(f.store, {
      runId: "exclude-run",
      globals: f.globals,
      concurrency: 1,
      exclude: ["task:run_closed:1"],
      quiet: true,
      runPiAgent: (options) => {
        calls.push(requestedTaskId(options));
        return modelResult(proposal(2));
      },
    });
    expect(calls).toEqual(["task:run_closed:2"]);
    expect(taskState(f.store, "task:run_closed:1").started_at).toBeNull();
  });

  test("abort signal stops claims after the in-flight pass", async () => {
    const f = fixture("signal", 2);
    enqueueRunClosed(f, 1);
    enqueueRunClosed(f, 2);
    const controller = new AbortController();
    const summary = await runLibrarianConsumer(f.store, {
      runId: "signal-run",
      globals: f.globals,
      concurrency: 1,
      signal: controller.signal,
      quiet: true,
      runPiAgent: (options) => {
        controller.abort();
        return modelResult(proposal(Number(requestedTaskId(options).split(":").at(-1))));
      },
    });
    expect(summary).toMatchObject({ passesRun: 1, stopped: true, paused: false, tasksRemaining: 1 });
    expect(taskState(f.store, "task:run_closed:2").started_at).toBeNull();
  });

  test("shouldClaim pauses before claiming another task", async () => {
    const f = fixture("pause", 2);
    enqueueRunClosed(f, 1);
    enqueueRunClosed(f, 2);
    let allowed = true;
    const summary = await runLibrarianConsumer(f.store, {
      runId: "pause-run",
      globals: f.globals,
      concurrency: 1,
      shouldClaim: () => allowed,
      quiet: true,
      runPiAgent: (options) => {
        allowed = false;
        return modelResult(proposal(Number(requestedTaskId(options).split(":").at(-1))));
      },
    });
    expect(summary).toMatchObject({ passesRun: 1, stopped: false, paused: true, tasksRemaining: 1 });
    expect(taskState(f.store, "task:run_closed:2").started_at).toBeNull();
  });

  test("limit caps the number of model passes", async () => {
    const f = fixture("limit", 2);
    enqueueRunClosed(f, 1);
    enqueueRunClosed(f, 2);
    let calls = 0;
    const summary = await runLibrarianConsumer(f.store, {
      runId: "limit-run",
      globals: f.globals,
      concurrency: 2,
      limit: 1,
      runPiAgent: (options) => {
        calls += 1;
        return modelResult(proposal(Number(requestedTaskId(options).split(":").at(-1))));
      },
      now: () => FIXED_NOW,
    });
    expect(calls).toBe(1);
    expect(summary).toMatchObject({ passesRun: 1, tasksRemaining: 1 });
  });

  test("stop file: finishes the in-flight pass and claims nothing after the stop appears", async () => {
    const f = fixture("stop", 3);
    const stopFile = join(f.root, "operator.stop");
    for (let index = 1; index <= 3; index += 1) enqueueRunClosed(f, index);
    let calls = 0;
    const fakeAgent: FakeRunPiAgent = async (options) => {
      calls += 1;
      writeFileSync(stopFile, "stop\n");
      return modelResult(proposal(Number(requestedTaskId(options).split(":").at(-1))));
    };

    const summary = await runLibrarianConsumer(f.store, {
      runId: "stop-run",
      globals: f.globals,
      concurrency: 1,
      stopFile,
      runPiAgent: fakeAgent,
      now: () => FIXED_NOW,
    });

    expect(calls).toBe(1);
    expect(summary).toMatchObject({ passesRun: 1, passesApplied: 1, stopped: true, aborted: false, tasksRemaining: 2 });
    expect(taskState(f.store, "task:run_closed:2").started_at).toBeNull();
  });

  test("a stop file present before the run claims nothing", async () => {
    const f = fixture("stop-early", 1);
    enqueueRunClosed(f, 1);
    const stopFile = join(f.root, "operator.stop");
    writeFileSync(stopFile, "stop\n");
    const summary = await runLibrarianConsumer(f.store, {
      runId: "stop-early-run",
      globals: f.globals,
      stopFile,
      runPiAgent: () => {
        throw new Error("must not be called");
      },
    });
    expect(summary).toMatchObject({ passesRun: 0, stopped: true, tasksRemaining: 1 });
  });

  test("logs one model failure, releases that claim, then continues", async () => {
    const f = fixture("failure-continue", 2);
    enqueueRunClosed(f, 1, "2026-08-01T00:00:00.000Z");
    enqueueRunClosed(f, 2, "2026-08-02T00:00:00.000Z");
    const fakeAgent: FakeRunPiAgent = (options) => {
      if (requestedTaskId(options) === "task:run_closed:1") return Promise.reject(new Error("fixture model offline"));
      return modelResult(proposal(2));
    };

    const summary = await runLibrarianConsumer(f.store, {
      runId: "failure-continue-run",
      globals: f.globals,
      concurrency: 1,
      runPiAgent: fakeAgent,
      now: () => FIXED_NOW,
    });

    expect(summary).toMatchObject({
      passesRun: 2,
      passesApplied: 1,
      passesFailed: 1,
      failedTaskIds: ["task:run_closed:1"],
      aborted: false,
      tasksRemaining: 1,
    });
    expect(taskState(f.store, "task:run_closed:1")).toMatchObject({ started_at: null, done_at: null });
    expect(taskState(f.store, "task:run_closed:2")).toMatchObject({ started_at: FIXED_NOW, done_at: FIXED_NOW });
    expect(indexedAt(f.store, "target-1")).toBeNull();
    expect(indexedAt(f.store, "target-2")).toBe(FIXED_NOW);
    expect(logEntries(f, "failure-continue-run")).toEqual([
      expect.objectContaining({ task_id: "task:run_closed:1", status: "failed", error: "fixture model offline" }),
      expect.objectContaining({ task_id: "task:run_closed:2", status: "completed" }),
    ]);
  });

  test("aborts after six consecutive failures and leaves every claim released", async () => {
    const f = fixture("failure-abort", 8);
    for (let index = 1; index <= 8; index += 1) enqueueRunClosed(f, index);
    let calls = 0;
    const summary = await runLibrarianConsumer(f.store, {
      runId: "failure-abort-run",
      globals: f.globals,
      concurrency: 1,
      runPiAgent: async () => {
        calls += 1;
        throw new Error(`fixture failure ${calls}`);
      },
      now: () => FIXED_NOW,
    });

    expect(calls).toBe(6);
    expect(summary).toMatchObject({
      passesRun: 6,
      passesApplied: 0,
      passesFailed: 6,
      failedTaskIds: Array.from({ length: 6 }, (_, index) => `task:run_closed:${index + 1}`),
      aborted: true,
      stopped: false,
      tasksRemaining: 8,
    });
    expect(rowCount(f.store, "subject_index_state")).toBe(0);
    expect(f.store.db.query<{ n: number }, []>("SELECT COUNT(*) AS n FROM index_task WHERE started_at IS NOT NULL").get()!.n).toBe(0);
    expect(logEntries(f, "failure-abort-run")).toHaveLength(6);
  });
});

describe("parseLibrarianArgs", () => {
  test("parses every flag", () => {
    const parsed = parseLibrarianArgs(new Map<string, string | true>([
      ["--run-id", "pilot-lv2-01"],
      ["--limit", "1"],
      ["--concurrency", "2"],
      ["--dry-run", true],
      ["--pathway", "pr_imported"],
      ["--task", "pr-123"],
      ["--json", true],
    ]));
    expect(parsed).toEqual({
      runId: "pilot-lv2-01",
      stop: false,
      status: false,
      json: true,
      dryRun: true,
      limit: 1,
      concurrency: 2,
      pathway: "pr_imported",
      taskId: "pr-123",
      knowledgeRoot: undefined,
    });
  });

  test("defaults concurrency to 4 and rejects bad values", () => {
    expect(parseLibrarianArgs(new Map([["--run-id", "r"]]))).toMatchObject({ concurrency: 4, limit: undefined, pathway: undefined });
    expect(() => parseLibrarianArgs(new Map())).toThrow("--run-id requires a value");
    expect(() => parseLibrarianArgs(new Map([["--run-id", "r"], ["--pathway", "bogus"]]))).toThrow("--pathway must be one of");
    expect(() => parseLibrarianArgs(new Map([["--run-id", "r"], ["--limit", "-1"]]))).toThrow("--limit requires a non-negative integer");
    expect(() => parseLibrarianArgs(new Map([["--run-id", "r"], ["--concurrency", "0"]]))).toThrow("--concurrency requires a positive integer");
    expect(() => parseLibrarianArgs(new Map<string, string | true>([["--run-id", "r"], ["--task", true]]))).toThrow("--task requires a value");
    expect(() => parseLibrarianArgs(new Map([["--run-id", "r"], ["--task", "   "]]))).toThrow("--task requires a value");
  });
});
