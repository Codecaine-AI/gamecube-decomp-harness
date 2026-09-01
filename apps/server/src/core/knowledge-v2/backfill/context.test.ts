import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "bun:test";
import type { PrioritizedTargetRow } from "../migration/prioritize.js";
import { writeFactWithEvidence } from "../records/index.js";
import { openKnowledgeStore, type KnowledgeStore } from "../storage/store.js";
import { buildPassContext, type BackfillPassContext } from "./context.js";

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

function targetFillOut(context: BackfillPassContext) {
  const target = context.fillOut.at(-1);
  if (target?.kind !== "target") throw new Error("expected the target last");
  return target;
}

function fixtureCheckout(source: string): string {
  const checkoutRoot = mkdtempSync(join(tmpdir(), "knowledge-v2-backfill-checkout-"));
  tempDirs.push(checkoutRoot);
  mkdirSync(join(checkoutRoot, "src"), { recursive: true });
  writeFileSync(join(checkoutRoot, "src/main.c"), source, "utf8");
  return checkoutRoot;
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
    const fillOutTarget = targetFillOut(context);
    expect(fillOutTarget.record.facts.purpose?.value).toBe("Sets the fighter state");
    expect(fillOutTarget.ledger.runs.length).toBeGreaterThan(0);
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

  test("groups target ledger runs once with ordered submissions and citable locators", () => {
    const store = openFixture();
    store.db.query(`INSERT INTO run_narrative
      (worker_run_id, summary, notable_observations, narrative, produced_by, created_at)
      VALUES ('run-main', 'Main run narrative', '[]', '{}', 'live',
        '2026-01-18T00:22:00.000Z')`).run();
    store.db.query(`INSERT INTO worker_run
      (id, target_id, goal, baseline, run_id, worker_state_id, final_outcome, error_type,
        integration, started_at, ended_at, closed_at)
      VALUES ('run-new', 'target-main', 'Try a newer shape', '{"score":85}', 'operator-new',
        'state-new', 'match', NULL, 'integrated', '2026-01-19T00:00:00.000Z',
        '2026-01-19T00:20:00.000Z', '2026-01-19T00:21:00.000Z')`).run();
    const insertSubmission = store.db.query(`INSERT INTO submission
      (id, worker_run_id, seq, description, hypothesis, score, submitted_at, runtime_ref)
      VALUES (?, 'run-new', ?, ?, ?, ?, ?, NULL)`);
    insertSubmission.run(
      "submission-new-2",
      2,
      "New second attempt",
      "Second hypothesis",
      95,
      "2026-01-19T00:15:00.000Z",
    );
    insertSubmission.run(
      "submission-new-1",
      1,
      "New first attempt",
      "First hypothesis",
      90,
      "2026-01-19T00:10:00.000Z",
    );
    store.db.query(`INSERT INTO run_narrative
      (worker_run_id, summary, notable_observations, narrative, produced_by, created_at)
      VALUES ('run-new', 'New run narrative', '[]', '{}', 'live',
        '2026-01-19T00:22:00.000Z')`).run();
    store.db.query(`INSERT INTO event
      (id, target_id, kind, cause, summary, created_at)
      VALUES ('event-new', 'target-main', 'regression', 'upstream_change', 'New fixture event',
        '2026-01-21T00:00:00.000Z')`).run();

    const ledger = targetFillOut(buildPassContext(store, prioritizedTarget(), {
      checkoutRoot: store.path,
      graphDbPath: join(store.path, "missing-graph.sqlite"),
    })).ledger;

    expect(ledger.runs.map((run) => run.id)).toEqual(["run-new", "run-main"]);
    expect(new Set(ledger.runs.map((run) => run.id)).size).toBe(ledger.runs.length);
    expect(ledger.runs.map((run) => run.summary)).toEqual([
      "New run narrative",
      "Main run narrative",
    ]);
    expect(ledger.runs[0]?.submissions.map((entry) => [entry.seq, entry.locator])).toEqual([
      [1, "attempt://run/run-new/submission/1"],
      [2, "attempt://run/run-new/submission/2"],
    ]);
    expect(ledger.runs[1]?.submissions.map((entry) => [entry.seq, entry.locator])).toEqual([
      [1, "attempt://run/run-main/submission/1"],
      [2, "attempt://run/run-main/submission/2"],
    ]);
    expect(ledger.runs[0]).not.toHaveProperty("runId");
    expect(ledger.runs[0]).not.toHaveProperty("workerStateId");
    expect(ledger.runs[0]).not.toHaveProperty("closedAt");
    expect(ledger.pull_requests[0]).toEqual({
      locator: "pr://target-pr",
      pr_ref: "melee#100",
      outcome: "improvement",
      summary: "Direct target pull request",
      merged_at: "2026-01-19T00:00:00.000Z",
    });
    expect(ledger.pull_requests.at(-1)).toEqual({
      locator: "pr://unit-pr-01",
      pr_ref: "melee#1",
      outcome: "improvement",
      summary: "Unit pull request 1",
      merged_at: "2026-01-01T00:00:00.000Z",
    });
    expect(ledger.events).toEqual([
      {
        kind: "regression",
        cause: "upstream_change",
        summary: "New fixture event",
        created_at: "2026-01-21T00:00:00.000Z",
      },
      {
        kind: "note",
        cause: null,
        summary: "Fixture note",
        created_at: "2026-01-20T00:00:00.000Z",
      },
    ]);
  });

  test("locates and emits the target source definition span", () => {
    const source = [
      "void",
      "set_state(int value)",
      "{",
      "    const char* braces = \"{ not a body }\";",
      "    /* a comment with } */",
      "    if (value) {",
      "        value++;",
      "    }",
      "}",
      "",
    ].join("\n");
    const context = buildPassContext(openFixture(), prioritizedTarget(), {
      checkoutRoot: fixtureCheckout(source),
      checkoutRev: "fixture-rev",
      graphDbPath: join(tmpdir(), "knowledge-v2-missing-graph.sqlite"),
    });

    expect(targetFillOut(context).material.source).toEqual({
      locator: "code://fixture-rev/src/main.c#L1-L9",
      text: source.trimEnd(),
      truncated: false,
    });
  });

  test("locates a source definition whose return type starts with lowercase t", () => {
    const source = [
      "t32 set_state(int value)",
      "{",
      "    return value;",
      "}",
      "",
    ].join("\n");
    const context = buildPassContext(openFixture(), prioritizedTarget(), {
      checkoutRoot: fixtureCheckout(source),
      checkoutRev: "fixture-rev",
      graphDbPath: join(tmpdir(), "knowledge-v2-missing-graph.sqlite"),
    });

    expect(targetFillOut(context).material.source).toEqual({
      locator: "code://fixture-rev/src/main.c#L1-L4",
      text: source.trimEnd(),
      truncated: false,
    });
  });

  test("reports when the target symbol is not found in the unit source", () => {
    const context = buildPassContext(openFixture(), prioritizedTarget(), {
      checkoutRoot: fixtureCheckout("void other_function(void) {}\n"),
      checkoutRev: "fixture-rev",
      graphDbPath: join(tmpdir(), "knowledge-v2-missing-graph.sqlite"),
    });

    expect(targetFillOut(context).material.source).toEqual({
      locator: null,
      reason: "symbol not found in unit source",
    });
  });

  test("skips source scanning for data targets", () => {
    const store = openFixture();
    store.db.query("UPDATE target SET kind = 'data' WHERE id = 'target-main'").run();
    const context = buildPassContext(store, { ...prioritizedTarget(), kind: "data" }, {
      checkoutRoot: join(tmpdir(), "knowledge-v2-missing-checkout"),
      graphDbPath: join(tmpdir(), "knowledge-v2-missing-graph.sqlite"),
    });

    expect(targetFillOut(context).material.source).toEqual({
      locator: null,
      reason: "section target",
    });
  });

  test("precomputes capped analogs with target match and fact status", () => {
    const graphRows = [
      { unit: "main", symbol: "set_state", score: 0.99 },
      { unit: "main", symbol: "helper", score: 0.98 },
      ...Array.from({ length: 8 }, (_, index) => ({
        unit: `peer/unit-${index}`,
        symbol: `Peer_${index}`,
        score: 0.9 - index / 100,
      })),
      { unit: null, symbol: "Malformed", score: 1 },
    ];
    let receivedQuery: unknown;
    const context = buildPassContext(openFixture(), prioritizedTarget(), {
      checkoutRoot: join(tmpdir(), "knowledge-v2-missing-checkout"),
      relatedFunctions: (query) => {
        receivedQuery = query;
        return {
          query: {},
          resolved_function_count: 1,
          functions: [{
            entity_id: "function:main:set_state",
            function: {},
            opseq_analogs: graphRows,
            callers: [
              { unit: "main", symbol: "helper" },
              { unit: "", symbol: "MalformedCaller" },
            ],
            callees: [{ unit: "main", symbol: "set_state" }],
            data_references: [],
            learnings: [],
          }],
        };
      },
    });

    expect(receivedQuery).toEqual({ unit: "main", symbol: "set_state", limit: 8 });
    const analogs = targetFillOut(context).material.analogs;
    if ("unavailable" in analogs) throw new Error("expected analog material");
    expect(analogs.opseq_analogs).toHaveLength(8);
    expect(analogs.opseq_analogs[0]).toEqual({
      stable_key: "main:set_state",
      relation: "opseq_analog",
      score: 0.99,
      match_pct: 75,
      has_facts: true,
    });
    expect(analogs.opseq_analogs[1]).toEqual({
      stable_key: "main:helper",
      relation: "opseq_analog",
      score: 0.98,
      match_pct: 25,
      has_facts: false,
    });
    expect(analogs.callers).toEqual([{
      stable_key: "main:helper",
      relation: "caller",
      score: null,
      match_pct: 25,
      has_facts: false,
    }]);
    expect(analogs.callees).toEqual([{
      stable_key: "main:set_state",
      relation: "callee",
      score: null,
      match_pct: 75,
      has_facts: true,
    }]);
  });

  test("marks analogs unavailable when the graph database is missing", () => {
    const root = mkdtempSync(join(tmpdir(), "knowledge-v2-backfill-missing-graph-"));
    tempDirs.push(root);
    const context = buildPassContext(openFixture(), prioritizedTarget(), {
      checkoutRoot: root,
      graphDbPath: join(root, "graph.sqlite"),
    });

    expect(targetFillOut(context).material.analogs).toEqual({
      unavailable: true,
      reason: "knowledge graph unavailable",
    });
  });
});
