import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "bun:test";
import type { PrioritizedTargetRow } from "../migration/prioritize.js";
import { writeFactWithEvidence } from "../records/index.js";
import { openKnowledgeStore, type KnowledgeStore } from "../storage/store.js";
import { buildPassContext } from "./context.js";

const tempDirs: string[] = [];
const stores: KnowledgeStore[] = [];

afterEach(() => {
  for (const store of stores.splice(0)) store.close();
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function openFixture(): KnowledgeStore {
  const knowledgeRoot = mkdtempSync(join(tmpdir(), "knowledge-v2-backfill-context-"));
  tempDirs.push(knowledgeRoot);
  const store = openKnowledgeStore({ knowledgeRoot });
  stores.push(store);

  const insertEntity = store.db.query(`INSERT INTO entity
    (id, kind, locator, parent_entity_id, identity_status, merged_into_id)
    VALUES (?, ?, ?, ?, 'active', NULL)`);
  insertEntity.run("unit-main", "translation_unit", "src/main.c", null);
  insertEntity.run("unit-other", "translation_unit", "src/other.c", null);
  insertEntity.run("struct-fighter", "struct", "struct://Fighter", null);
  insertEntity.run("field-state", "struct_field", "struct-field://Fighter/state", "struct-fighter");
  insertEntity.run("parameter-state", "parameter", "parameter://set_state/state", null);
  insertEntity.run("struct-unlinked", "struct", "struct://Unlinked", null);
  insertEntity.run("concept-state", "game_concept", "concept://state", null);

  const insertTarget = store.db.query(`INSERT INTO target
    (id, kind, unit, unit_entity_id, symbol, stable_key, address, identity_status, report_revision)
    VALUES (?, 'function', ?, ?, ?, ?, ?, 'current', 'fixture-rev')`);
  insertTarget.run(
    "target-main",
    "main",
    "unit-main",
    "set_state",
    "main:set_state",
    "0x80001000",
  );
  insertTarget.run(
    "target-sibling",
    "main",
    "unit-main",
    "helper",
    "main:helper",
    "0x80001020",
  );
  insertTarget.run(
    "target-other",
    "other",
    "unit-other",
    "unrelated",
    "other:unrelated",
    "0x80002000",
  );

  const insertStatus = store.db.query(`INSERT INTO target_status
    (target_id, match_pct, linked, size, content_hash, report_revision, updated_at)
    VALUES (?, ?, ?, ?, ?, 'fixture-rev', '2026-01-20T00:00:00.000Z')`);
  insertStatus.run("target-main", 75, 1, 100, "sha256:main");
  insertStatus.run("target-sibling", 25, 0, 300, "sha256:sibling");
  insertStatus.run("target-other", 100, 1, 50, "sha256:other");

  const insertLink = store.db.query(`INSERT INTO link
    (id, from_target_id, from_entity_id, to_target_id, to_entity_id,
      role, why, kind, locator, digest)
    VALUES (?, ?, ?, ?, ?, 'related', 'fixture relationship', 'wiki', ?, NULL)`);
  insertLink.run("link-struct", "target-main", null, null, "struct-fighter", "wiki://struct");
  insertLink.run("link-struct-again", "target-main", null, null, "struct-fighter", "wiki://struct-again");
  insertLink.run("link-field", "target-main", null, null, "field-state", "wiki://field");
  insertLink.run("link-parameter-in", null, "parameter-state", "target-main", null, "wiki://parameter");
  insertLink.run("link-concept", "target-main", null, null, "concept-state", "wiki://concept");
  insertLink.run("link-unrelated", "target-other", null, null, "struct-unlinked", "wiki://unrelated");

  store.db.query(`INSERT INTO worker_run
    (id, target_id, goal, baseline, run_id, worker_state_id, final_outcome, error_type,
      integration, started_at, ended_at, closed_at)
    VALUES ('run-main', 'target-main', 'Improve set_state', '{"score":75}', 'operator-run', NULL,
      'improvement', NULL, 'integrated', '2026-01-18T00:00:00.000Z',
      '2026-01-18T00:20:00.000Z', '2026-01-18T00:21:00.000Z')`).run();
  const insertSubmission = store.db.query(`INSERT INTO submission
    (id, worker_run_id, seq, description, hypothesis, score, submitted_at, runtime_ref)
    VALUES (?, 'run-main', ?, ?, ?, ?, ?, NULL)`);
  insertSubmission.run("submission-1", 1, "First attempt", "Branch order", 80, "2026-01-18T00:10:00.000Z");
  insertSubmission.run("submission-2", 2, "Second attempt", "Register choice", 85, "2026-01-18T00:15:00.000Z");

  store.db.query(`INSERT INTO worker_run
    (id, target_id, goal, baseline, run_id, worker_state_id, final_outcome, error_type,
      integration, started_at, ended_at, closed_at)
    VALUES ('run-other', 'target-other', 'Unrelated', '{}', NULL, NULL,
      'no_change', NULL, NULL, '2026-01-18T00:00:00.000Z', NULL,
      '2026-01-18T00:21:00.000Z')`).run();
  store.db.query(`INSERT INTO submission
    (id, worker_run_id, seq, description, hypothesis, score, submitted_at, runtime_ref)
    VALUES ('submission-other', 'run-other', 1, 'Unrelated', NULL, 0,
      '2026-01-18T00:15:00.000Z', NULL)`).run();

  const insertPr = store.db.query(`INSERT INTO pull_request
    (id, target_id, entity_id, pr_ref, summary, outcome, merged_at)
    VALUES (?, ?, ?, ?, ?, 'improvement', ?)`);
  for (let index = 1; index <= 17; index += 1) {
    const suffix = String(index).padStart(2, "0");
    insertPr.run(
      `unit-pr-${suffix}`,
      null,
      "unit-main",
      `melee#${index}`,
      `Unit pull request ${index}`,
      `2026-01-${suffix}T00:00:00.000Z`,
    );
  }
  insertPr.run(
    "target-pr",
    "target-main",
    null,
    "melee#100",
    "Direct target pull request",
    "2026-01-19T00:00:00.000Z",
  );
  insertPr.run(
    "other-pr",
    "target-other",
    null,
    "melee#200",
    "Unrelated target pull request",
    "2026-01-19T00:00:00.000Z",
  );

  store.db.query(`INSERT INTO event
    (id, target_id, kind, cause, summary, created_at)
    VALUES ('event-main', 'target-main', 'note', NULL, 'Fixture note',
      '2026-01-20T00:00:00.000Z')`).run();

  writeFactWithEvidence(store, {
    id: "fact-target",
    targetId: "target-main",
    type: "purpose",
    value: "Sets the fighter state",
    rationale: "Fixture target fact",
    confidence: 0.9,
    updatedAt: "2026-01-20T00:00:00.000Z",
  }, []);
  writeFactWithEvidence(store, {
    id: "fact-unit",
    entityId: "unit-main",
    type: "game_mapping",
    value: "Contains state functions",
    rationale: "Fixture unit fact",
    confidence: 0.8,
    updatedAt: "2026-01-20T00:00:00.000Z",
  }, []);
  writeFactWithEvidence(store, {
    id: "fact-struct",
    entityId: "struct-fighter",
    type: "inferred_type",
    value: "Fighter runtime state",
    rationale: "Fixture struct fact",
    confidence: 0.7,
    updatedAt: "2026-01-20T00:00:00.000Z",
  }, []);

  return store;
}

function prioritizedTarget(): PrioritizedTargetRow {
  return {
    target_id: "target-main",
    stable_key: "main:set_state",
    kind: "function",
    unit: "main",
    symbol: "set_state",
    match_pct: 75,
    fully_matched: false,
    linked: true,
    named_symbol: true,
    unit_named_ratio: 0.5,
    unit_randomized_count: 1,
    attempts_runs: 1,
    attempts_submissions: 2,
    prs: 1,
    unit_prs: 17,
    discord: 0,
    unit_discord: 0,
    wiki: 0,
    events: 1,
    direct_score: 11,
    inherited_score: 17,
    score: 28,
    indexed_at: null,
    never_indexed: true,
  };
}

describe("buildPassContext", () => {
  test("includes the full target, status, and unbounded target ledger", () => {
    const context = buildPassContext(openFixture(), prioritizedTarget());

    expect(context.target).toEqual({
      id: "target-main",
      kind: "function",
      unit: "main",
      unit_entity_id: "unit-main",
      symbol: "set_state",
      stable_key: "main:set_state",
      address: "0x80001000",
      identity_status: "current",
      report_revision: "fixture-rev",
      target_status: {
        target_id: "target-main",
        match_pct: 75,
        linked: true,
        size: 100,
        content_hash: "sha256:main",
        report_revision: "fixture-rev",
        updated_at: "2026-01-20T00:00:00.000Z",
      },
      match_pct: 75,
      linked: true,
      named_symbol: true,
      unit_named_ratio: 0.5,
    });
    expect(context.ledger.filter((entry) => entry.type === "submission").map((entry) => entry.id)).toEqual([
      "submission-2",
      "submission-1",
    ]);
    expect(context.ledger.filter((entry) => entry.type === "pull_request")).toHaveLength(18);
    expect(context.ledger.some((entry) => entry.id === "other-pr" || entry.id === "submission-other")).toBeFalse();
    expect(context.ledger.find((entry) => entry.id === "submission-1")).toMatchObject({
      workerRun: { id: "run-main", baseline: { score: 75 } },
    });
  });

  test("caps unit pull requests at the newest 15 while reporting the total", () => {
    const { unitContext } = buildPassContext(openFixture(), prioritizedTarget());

    expect(unitContext).toMatchObject({
      status: "ok",
      unit: {
        locator: "src/main.c",
        identity_status: "active",
        match_pct: 37.5,
      },
      total_pr_count: 17,
      count: 15,
      truncated: true,
    });
    expect(unitContext.members).toEqual([
      { stable_key: "main:set_state", kind: "function", match_pct: 75, named: true },
      { stable_key: "main:helper", kind: "function", match_pct: 25, named: true },
    ]);
    expect(unitContext.pull_requests.map((row) => [row.id, row.locator])).toEqual(
      Array.from({ length: 15 }, (_, index) => {
        const suffix = String(17 - index).padStart(2, "0");
        return [`unit-pr-${suffix}`, `pr://unit-pr-${suffix}`];
      }),
    );
  });

  test("collects linked mechanical records and builds the same apply scope", () => {
    const context = buildPassContext(openFixture(), prioritizedTarget());

    expect(context.linkedEntities.map((entity) => [entity.id, entity.kind])).toEqual([
      ["unit-main", "translation_unit"],
      ["parameter-state", "parameter"],
      ["field-state", "struct_field"],
      ["struct-fighter", "struct"],
    ]);
    expect(context.fillOut.map((subject) => [
      subject.order,
      subject.kind,
      subject.kind === "entity" ? subject.entity_locator : subject.target_stable_key,
    ])).toEqual([
      [1, "entity", "src/main.c"],
      [2, "entity", "parameter://set_state/state"],
      [3, "entity", "struct-field://Fighter/state"],
      [4, "entity", "struct://Fighter"],
      [5, "target", "main:set_state"],
    ]);
    const fillOutTarget = context.fillOut.at(-1);
    if (fillOutTarget?.kind !== "target") throw new Error("expected the target last");
    expect(fillOutTarget.record.facts.purpose?.value).toBe("Sets the fighter state");
    expect(fillOutTarget.ledger.length).toBeGreaterThan(0);
    const unitEntry = context.fillOut[0];
    if (unitEntry?.kind !== "entity") throw new Error("expected the unit entity first");
    expect(unitEntry.material?.unit.locator).toBe("src/main.c");
    expect(Object.values(unitEntry.record.facts).map((fact) => fact?.id)).toEqual(["fact-unit"]);
    expect(context.supporting.map((subject) => [subject.kind, subject.entity_locator])).toEqual([
      ["game_concept", "concept://state"],
    ]);
    expect(context.supporting[0]?.record.links.map((link) => link.id)).toEqual(["link-concept"]);
    expect(context.scope).toEqual({
      targetStableKeys: ["main:set_state"],
      entityLocators: [
        "src/main.c",
        "parameter://set_state/state",
        "struct-field://Fighter/state",
        "struct://Fighter",
      ],
    });
  });
});
