import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  insertEvent,
  insertPullRequestEntries,
  insertWorkerRun,
  knowledgeRecord,
  openKnowledgeStore,
  targetLedger,
  unitView,
  writeFactWithEvidence,
  type KnowledgeStore,
} from "./index.js";

const tempDirs: string[] = [];
const stores: KnowledgeStore[] = [];

afterEach(() => {
  for (const store of stores.splice(0)) store.close();
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function openFixture(): KnowledgeStore {
  const dir = mkdtempSync(join(tmpdir(), "knowledge-v2-views-"));
  tempDirs.push(dir);
  const store = openKnowledgeStore({ knowledgeRoot: dir });
  stores.push(store);

  const insertUnit = store.db.query(`INSERT INTO entity
    (id, kind, locator, identity_status)
    VALUES (?, 'translation_unit', ?, 'active')`);
  insertUnit.run("unit-a", "src/a.c");
  insertUnit.run("unit-b", "src/b.c");

  const insertTarget = store.db.query(`INSERT INTO target
    (id, kind, unit, unit_entity_id, symbol, stable_key, address, identity_status, report_revision)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'rev-1')`);
  insertTarget.run("fn-a1", "function", "unit-a", "unit-a", "FuncA1", "unit-a:FuncA1", "0x80001000", "current");
  insertTarget.run("fn-a2", "function", "unit-a", "unit-a", "FuncA2", "unit-a:FuncA2", "0x80001020", "current");
  insertTarget.run("data-a", "data", "unit-a", "unit-a", ".data", "unit-a:.data", "0x80300000", "current");
  insertTarget.run("fn-a-old", "function", "unit-a", "unit-a", "FuncOld", "unit-a:FuncOld", "0x80001040", "retired");
  insertTarget.run("fn-b1", "function", "unit-b", "unit-b", "FuncB1", "unit-b:FuncB1", "0x80002000", "current");
  insertTarget.run("fn-b2", "function", "unit-b", "unit-b", "FuncB2", "unit-b:FuncB2", "0x80002020", "current");

  const insertStatus = store.db.query(`INSERT INTO target_status
    (target_id, match_pct, linked, size, content_hash, report_revision, updated_at)
    VALUES (?, ?, 1, ?, NULL, 'rev-1', '2026-01-01T00:00:00.000Z')`);
  insertStatus.run("fn-a1", 50, 100);
  insertStatus.run("fn-a2", 100, 300);
  insertStatus.run("fn-b1", 25, null);
  insertStatus.run("fn-b2", 75, 0);

  store.db.query(`INSERT INTO entity (id, kind, locator, identity_status)
    VALUES ('concept-1', 'game_concept', 'concept://shield', 'active')`).run();
  writeFactWithEvidence(store, {
    id: "fact-1", targetId: "fn-a1", type: "purpose", value: "Updates shield state",
    rationale: "Observed writes", confidence: 0.9, updatedAt: "2026-01-02T00:00:00.000Z",
  }, [{
    id: "evidence-1", kind: "code", locator: "code://rev-1/src/a.c#L10-L20",
    digest: "sha256:abc", why: "Contains the state writes", capturedAt: "2026-01-02T00:00:00.000Z",
  }]);
  store.db.query(`INSERT INTO link
    (id, from_target_id, to_entity_id, role, why, kind, locator, digest)
    VALUES ('link-out', 'fn-a1', 'concept-1', 'implements', 'Updates shields', 'wiki', 'wiki://shield', NULL)`).run();
  store.db.query(`INSERT INTO link
    (id, from_entity_id, to_target_id, role, why, kind, locator, digest)
    VALUES ('link-in', 'concept-1', 'fn-a1', 'described_by', 'Names the function', 'pr', 'pr://42', NULL)`).run();

  insertWorkerRun(store, {
    id: "run-1", targetId: "fn-a1", goal: "Improve match", baseline: '{"score":50}',
    finalOutcome: "improvement", integration: "integrated",
    startedAt: "2026-01-03T00:00:00.000Z", closedAt: "2026-01-03T00:30:00.000Z",
  }, [{ id: "submission-1", seq: 1, description: "Changed branch", score: 70, submittedAt: "2026-01-03T00:20:00.000Z" }]);
  insertPullRequestEntries(store, [{
    id: "pr-1", targetId: "fn-a1", prRef: "pr://42", summary: "Merged improvement",
    outcome: "improvement", mergedAt: "2026-01-04T00:00:00.000Z",
  }, {
    id: "pr-unit", entityId: "unit-a", prRef: "pr://40", summary: "Touched the translation unit",
    outcome: "no_change", mergedAt: "2026-01-04T12:00:00.000Z",
  }]);
  insertEvent(store, {
    id: "event-1", targetId: "fn-a1", kind: "regression", cause: "upstream_change",
    summary: "Match dropped", createdAt: "2026-01-05T00:00:00.000Z",
  }, [{ refKind: "pr", refId: "42" }, { refKind: "worker_run", refId: "run-1" }]);

  return store;
}

describe("knowledge-v2 derived views", () => {
  test("groups current targets by translation-unit entity and size-weights match percentages", () => {
    const rows = unitView(openFixture());

    expect(rows.map((row) => [row.unit.locator, row.targets.length, row.matchPct])).toEqual([
      ["src/a.c", 3, 87.5],
      ["src/b.c", 2, 50],
    ]);
    expect(rows[0]?.targets.map((target) => [target.id, target.kind])).toEqual([
      ["fn-a1", "function"],
      ["fn-a2", "function"],
      ["data-a", "data"],
    ]);
  });

  test("falls back to a simple match average when member sizes are unusable", () => {
    const row = unitView(openFixture()).find((candidate) => candidate.unit.id === "unit-b");

    expect(row?.targets.map((target) => target.status?.size)).toEqual([null, 0]);
    expect(row?.matchPct).toBe(50);
  });

  test("returns keyed facts with evidence and both link directions", () => {
    const record = knowledgeRecord(openFixture(), { targetId: "fn-a1" });

    expect(record.subject).toMatchObject({ subjectKind: "target", id: "fn-a1", symbol: "FuncA1" });
    expect(record.facts.purpose).toMatchObject({
      id: "fact-1",
      value: "Updates shield state",
      evidence: [{ id: "evidence-1", kind: "code", digest: "sha256:abc" }],
    });
    expect(record.links.map((link) => [link.id, link.direction, link.other.id])).toEqual([
      ["link-in", "incoming", "concept-1"],
      ["link-out", "outgoing", "concept-1"],
    ]);
  });

  test("returns direct and unit-attributed PRs with labels in the newest-first ledger", () => {
    const ledger = targetLedger(openFixture(), "fn-a1");

    expect(ledger.map((entry) => [entry.type, entry.id, entry.isRegression])).toEqual([
      ["event", "event-1", true],
      ["pull_request", "pr-unit", false],
      ["pull_request", "pr-1", false],
      ["submission", "submission-1", false],
    ]);
    expect(ledger[0]).toMatchObject({
      kind: "regression",
      cause: "upstream_change",
      refs: [{ refKind: "pr", refId: "42" }, { refKind: "worker_run", refId: "run-1" }],
    });
    expect(ledger.filter((entry) => entry.type === "pull_request").map((entry) => [entry.id, entry.attribution])).toEqual([
      ["pr-unit", "unit"],
      ["pr-1", "target"],
    ]);
    expect(ledger[3]).toMatchObject({ workerRun: { id: "run-1", baseline: { score: 50 } } });
  });
});
