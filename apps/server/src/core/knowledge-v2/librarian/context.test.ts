import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "bun:test";

import { resolvePrComment } from "../ingest/prs.js";
import { writeFactWithEvidence } from "../records/index.js";
import { openKnowledgeStore, type KnowledgeStore } from "../storage/store.js";
import {
  buildTaskContext,
  splitSlicePayload,
  type LibrarianPathway,
  type LibrarianTaskContext,
  type LibrarianTaskRow,
} from "./context.js";

const tempDirs: string[] = [];
const stores: KnowledgeStore[] = [];

afterEach(() => {
  for (const store of stores.splice(0)) store.close();
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function openFixture(): KnowledgeStore {
  const knowledgeRoot = mkdtempSync(join(tmpdir(), "knowledge-v2-librarian-context-"));
  tempDirs.push(knowledgeRoot);
  const store = openKnowledgeStore({ knowledgeRoot });
  stores.push(store);

  const insertEntity = store.db.query(`INSERT INTO entity
    (id, kind, locator, parent_entity_id, identity_status, merged_into_id)
    VALUES (?, ?, ?, ?, 'active', NULL)`);
  insertEntity.run("unit-main", "translation_unit", "src/main.c", null);
  insertEntity.run("unit-other", "translation_unit", "src/other.c", null);
  insertEntity.run("struct-fighter", "struct", "struct://Fighter", null);
  insertEntity.run("parameter-state", "parameter", "parameter://ftCo/state", null);
  insertEntity.run("concept-guard", "game_concept", "concept://guard", null);

  const insertTarget = store.db.query(`INSERT INTO target
    (id, kind, unit, unit_entity_id, symbol, stable_key, address, identity_status,
      report_revision)
    VALUES (?, 'function', ?, ?, ?, ?, ?, 'current', 'fixture-rev')`);
  insertTarget.run(
    "target-main",
    "main/melee/ft/ftcommon",
    "unit-main",
    "ftCo_800BFFD0",
    "main/melee/ft/ftcommon:ftCo_800BFFD0",
    "0x800BFFD0",
  );
  insertTarget.run(
    "target-single",
    "main/other",
    "unit-other",
    "RareOnly_80001020",
    "main/other:RareOnly_80001020",
    "0x80001020",
  );

  const insertStatus = store.db.query(`INSERT INTO target_status
    (target_id, match_pct, linked, size, content_hash, report_revision, updated_at)
    VALUES (?, ?, ?, ?, ?, 'fixture-rev', '2026-01-20T00:00:00.000Z')`);
  insertStatus.run("target-main", 51.85, 1, 200, "sha256:main");
  insertStatus.run("target-single", 10, 0, 50, "sha256:single");

  const insertLink = store.db.query(`INSERT INTO link
    (id, from_target_id, from_entity_id, to_target_id, to_entity_id,
      role, why, kind, locator, digest)
    VALUES (?, ?, ?, ?, ?, 'related', 'fixture relationship', 'wiki', ?, NULL)`);
  insertLink.run(
    "link-struct",
    "target-main",
    null,
    null,
    "struct-fighter",
    "wiki://fixture-struct",
  );
  insertLink.run(
    "link-parameter",
    null,
    "parameter-state",
    "target-main",
    null,
    "wiki://fixture-parameter",
  );
  insertLink.run(
    "link-concept",
    "target-main",
    null,
    null,
    "concept-guard",
    "wiki://fixture-concept",
  );

  store.db.query(`INSERT INTO worker_run
    (id, target_id, goal, baseline, run_id, worker_state_id, final_outcome, error_type,
      integration, started_at, ended_at, closed_at)
    VALUES ('run-main', 'target-main', 'Improve guard', '{"score":51.85}', 'operator-7',
      NULL, 'improvement', NULL, 'integrated', '2026-01-18T00:00:00.000Z',
      '2026-01-18T00:20:00.000Z', '2026-01-18T00:21:00.000Z')`).run();
  const insertSubmission = store.db.query(`INSERT INTO submission
    (id, worker_run_id, seq, description, hypothesis, score, submitted_at, runtime_ref)
    VALUES (?, 'run-main', ?, ?, ?, ?, ?, NULL)`);
  insertSubmission.run(
    "submission-2",
    2,
    "Second attempt",
    "Register choice",
    55,
    "2026-01-18T00:15:00.000Z",
  );
  insertSubmission.run(
    "submission-1",
    1,
    "First attempt",
    "Branch order",
    53,
    "2026-01-18T00:10:00.000Z",
  );
  store.db.query(`INSERT INTO run_narrative
    (worker_run_id, summary, notable_observations, narrative, produced_by, created_at)
    VALUES ('run-main', 'Stored database narrative', '["register pressure"]',
      '{"result":"two bytes"}', 'live', '2026-01-18T00:22:00.000Z')`).run();

  store.db.query(`INSERT INTO pull_request
    (id, target_id, entity_id, pr_ref, summary, outcome, merged_at)
    VALUES ('pr-regression-ref', 'target-main', NULL, 'melee#77',
      'Regression reference PR', 'no_change', '2026-01-19T00:00:00.000Z')`).run();
  store.db.query(`INSERT INTO event
    (id, target_id, kind, cause, summary, created_at)
    VALUES ('event-regression-old', 'target-main', 'regression', 'merge_conflict',
      'Older regression', '2026-01-19T00:00:00.000Z')`).run();
  store.db.query(`INSERT INTO event
    (id, target_id, kind, cause, summary, created_at)
    VALUES ('event-regression-new', 'target-main', 'regression', 'upstream_change',
      'Newest regression', '2026-01-21T00:00:00.000Z')`).run();
  const insertEventRef = store.db.query(`INSERT INTO event_ref
    (event_id, ref_kind, ref_id) VALUES ('event-regression-new', ?, ?)`);
  insertEventRef.run("worker_run", "run-main");
  insertEventRef.run("pr", "77");
  insertEventRef.run("commit", "deadbeef");

  return store;
}

function task(pathway: LibrarianPathway, payload: string): LibrarianTaskRow {
  return {
    id: `task-${pathway}`,
    pathway,
    payload,
    enqueued_at: "2026-01-22T00:00:00.000Z",
    started_at: null,
    done_at: null,
  };
}

function fixtureOptions(store: KnowledgeStore, prsRoot?: string) {
  return {
    checkoutRoot: store.path,
    graphDbPath: join(store.path, "missing-graph.sqlite"),
    ...(prsRoot === undefined ? {} : { prsRoot }),
  };
}

function assertOrderingAndScope(context: LibrarianTaskContext): void {
  expect(context.head_revision).toBeString();
  expect(context.head_revision.length).toBeGreaterThan(0);
  expect(context.touched.map(({ order }) => order)).toEqual(
    context.touched.map((_, index) => index + 1),
  );
  const firstTarget = context.touched.findIndex(({ kind }) => kind === "target");
  if (firstTarget >= 0) {
    expect(context.touched.slice(0, firstTarget).every(({ kind }) => kind === "entity")).toBeTrue();
    expect(context.touched.slice(firstTarget).every(({ kind }) => kind === "target")).toBeTrue();
  }
  expect(context.scope).toEqual({
    targetStableKeys: context.touched.flatMap((subject) =>
      subject.kind === "target" ? [subject.target_stable_key] : []),
    entityLocators: context.touched.flatMap((subject) =>
      subject.kind === "entity" ? [subject.entity_locator] : []),
  });
}

function writePrArchive(): string {
  const root = mkdtempSync(join(tmpdir(), "knowledge-v2-librarian-prs-"));
  tempDirs.push(root);
  const prsRoot = join(root, "prs");
  const extracted = join(prsRoot, "pr-1533", "extracted");
  mkdirSync(extracted, { recursive: true });
  const longDiffHunk = `discarded-prefix-${"x".repeat(1600)}commented-line-at-end`;
  const rows = [
    {
      pr: 1533,
      title: "Fixture guard work",
      kind: "pr_body",
      author: "author",
      created_at: "2026-01-03T00:00:00.000Z",
      path: null,
      body: "Archived PR body",
    },
    {
      pr: 1533,
      title: "Fixture guard work",
      kind: "review_comment",
      author: "late",
      created_at: "2026-01-02T00:00:00.000Z",
      path: "src/main.c",
      line: "42",
      diff_hunk: longDiffHunk,
      body: "Late review",
    },
    {
      pr: 1533,
      title: "Fixture guard work",
      kind: "issue_comment",
      author: "early",
      created_at: "2026-01-01T00:00:00.000Z",
      path: null,
      body: "Early discussion",
    },
  ];
  writeFileSync(
    join(extracted, "text_corpus.jsonl"),
    rows.map((row) => JSON.stringify(row)).join("\n"),
  );
  return prsRoot;
}

function codeDigest(span: string): string {
  return `sha256:${createHash("sha256").update(span).digest("hex").slice(0, 16)}`;
}

function writeDriftCheckout(): { root: string; originalRevision: string; headRevision: string } {
  const root = mkdtempSync(join(tmpdir(), "knowledge-v2-librarian-drift-checkout-"));
  tempDirs.push(root);
  execFileSync("git", ["init", "-q", root]);
  execFileSync("git", ["-C", root, "config", "user.email", "fixture@example.com"]);
  execFileSync("git", ["-C", root, "config", "user.name", "Fixture"]);
  mkdirSync(join(root, "src"), { recursive: true });
  writeFileSync(join(root, "src/main.c"), "stable line\nold line\n");
  execFileSync("git", ["-C", root, "add", "src/main.c"]);
  execFileSync("git", ["-C", root, "commit", "-qm", "original"]);
  const originalRevision = execFileSync(
    "git",
    ["-C", root, "rev-parse", "HEAD"],
    { encoding: "utf8" },
  ).trim();
  writeFileSync(join(root, "src/main.c"), "stable line\nnew line\n");
  execFileSync("git", ["-C", root, "add", "src/main.c"]);
  execFileSync("git", ["-C", root, "commit", "-qm", "head"]);
  const headRevision = execFileSync(
    "git",
    ["-C", root, "rev-parse", "HEAD"],
    { encoding: "utf8" },
  ).trim();
  return { root, originalRevision, headRevision };
}

function insertPrCapFixture(store: KnowledgeStore): string[] {
  const insertTarget = store.db.query(`INSERT INTO target
    (id, kind, unit, unit_entity_id, symbol, stable_key, address, identity_status,
      report_revision)
    VALUES (?, 'function', 'cap/unit', 'unit-main', ?, ?, ?, 'current', 'fixture-rev')`);
  const insertStatus = store.db.query(`INSERT INTO target_status
    (target_id, match_pct, linked, size, content_hash, report_revision, updated_at)
    VALUES (?, 25, 0, 100, NULL, 'fixture-rev', '2026-01-20T00:00:00.000Z')`);
  const insertPr = store.db.query(`INSERT INTO pull_request
    (id, target_id, entity_id, pr_ref, summary, outcome, merged_at)
    VALUES (?, ?, NULL, 'melee#1533', ?, 'improvement', '2026-01-21T00:00:00.000Z')`);
  const ids: string[] = [];

  store.db.query(`INSERT INTO pull_request
    (id, target_id, entity_id, pr_ref, summary, outcome, merged_at)
    VALUES ('pr-1533--unit-main', NULL, 'unit-main', 'melee#1533',
      '[mechanical] PR #1533 touched src/main.c', 'no_change',
      '2026-01-21T00:00:00.000Z')`).run();
  ids.push("pr-1533--unit-main");

  for (let index = 1; index <= 13; index += 1) {
    const suffix = String(index).padStart(2, "0");
    const targetId = `target-cap-${suffix}`;
    const stableKey = `cap/unit:Cap${suffix}`;
    insertTarget.run(
      targetId,
      `Cap${suffix}`,
      stableKey,
      `0x${(0x80100000 + index * 0x10).toString(16)}`,
    );
    insertStatus.run(targetId);
    const prId = `pr-1533--cap-${suffix}`;
    const metric = index === 1
      ? "50.91% -> 51.85% (+2 bytes)"
      : `50.00% -> ${(50 + index).toFixed(2)}% (+${index} bytes)`;
    insertPr.run(
      prId,
      targetId,
      `[ci] PR #1533 'Fixture guard work' — ${stableKey} ${metric}, reported by decomp-dev CI as 'fixture'; narrative pending librarian pass`,
    );
    ids.push(prId);
  }
  return ids;
}

describe("buildTaskContext", () => {
  test("assembles a closed run from the database narrative and keeps entities before the target", () => {
    const store = openFixture();
    const context = buildTaskContext(
      store,
      task("run_closed", "attempt://run/run-main"),
      fixtureOptions(store),
    );
    const object = context.object as {
      worker_run: { baseline: unknown; integration: string | null };
      submissions: Array<{ seq: number; locator: string }>;
      narrative: unknown;
      integration: string | null;
    };

    expect(object.worker_run.baseline).toEqual({ score: 51.85 });
    expect(object.worker_run.integration).toBe("integrated");
    expect(object.submissions.map(({ seq, locator }) => [seq, locator])).toEqual([
      [1, "attempt://run/run-main/submission/1"],
      [2, "attempt://run/run-main/submission/2"],
    ]);
    expect(object.narrative).toEqual({
      summary: "Stored database narrative",
      notable_observations: ["register pressure"],
      narrative: { result: "two bytes" },
    });
    expect(object.integration).toBe("integrated");
    expect(context.touched.map((subject) =>
      subject.kind === "entity" ? subject.entity_locator : subject.target_stable_key)).toEqual([
      "src/main.c",
      "parameter://ftCo/state",
      "struct://Fighter",
      "main/melee/ft/ftcommon:ftCo_800BFFD0",
    ]);
    expect(context.supporting.map(({ entity_locator }) => entity_locator)).toEqual([
      "concept://guard",
    ]);
    assertOrderingAndScope(context);
  });

  test("reports a missing run narrative without reading another source", () => {
    const store = openFixture();
    store.db.query("DELETE FROM run_narrative WHERE worker_run_id = 'run-main'").run();

    const context = buildTaskContext(
      store,
      task("run_closed", JSON.stringify({ worker_run_id: "run-main" })),
      fixtureOptions(store),
    );

    expect(context.object).toMatchObject({
      narrative: null,
      narrative_unavailable: { reason: "run narrative not found" },
    });
    assertOrderingAndScope(context);
  });

  test("unwraps retry envelopes for raw and structured pathway payloads", () => {
    const store = openFixture();
    const prsRoot = writePrArchive();
    store.db.query(`INSERT INTO pull_request
      (id, target_id, entity_id, pr_ref, summary, outcome, merged_at)
      VALUES ('pr-retry-target', 'target-main', NULL, 'melee#1533',
        'Retry envelope fixture', 'improvement', '2026-01-21T00:00:00.000Z')`).run();

    const runContext = buildTaskContext(
      store,
      task("run_closed", JSON.stringify({ task_payload: "run-main", drift_attempts: 1 })),
      fixtureOptions(store),
    );
    const prContext = buildTaskContext(
      store,
      task("pr_imported", JSON.stringify({
        task_payload: ["pr-retry-target"],
        drift_attempts: 1,
      })),
      fixtureOptions(store, prsRoot),
    );

    expect(runContext.object).toHaveProperty("worker_run.id", "run-main");
    expect(prContext.object).toHaveProperty("pr_ref", "melee#1533");
  });

  test("adds rename history to the closed run target", () => {
    const store = openFixture();
    store.db.query(`INSERT INTO target
      (id, kind, unit, unit_entity_id, symbol, stable_key, address, identity_status,
        report_revision, moved_to_id)
      VALUES ('target-main-old', 'function', 'main/melee/ft/ftcommon', 'unit-main',
        'ftCo_Old', 'main/melee/ft/ftcommon:ftCo_Old', '0x800BFFD0', 'moved',
        'fixture-rev', 'target-main')`).run();

    const context = buildTaskContext(
      store,
      task("run_closed", "run-main"),
      fixtureOptions(store),
    );
    const target = context.touched.find((subject) => subject.kind === "target");

    expect(target).toMatchObject({
      target_stable_key: "main/melee/ft/ftcommon:ftCo_800BFFD0",
      renamed_from: ["main/melee/ft/ftcommon:ftCo_Old"],
    });
  });

  test("adds compact code-drift reports to every closed run subject", () => {
    const store = openFixture();
    const checkout = writeDriftCheckout();
    writeFactWithEvidence(store, {
      id: "fact-run-target-drift",
      targetId: "target-main",
      type: "purpose",
      value: "Target fixture",
      rationale: "Closed run target drift fixture",
      confidence: 0.8,
    }, [{
      id: "evidence-run-target-unchanged",
      kind: "code",
      locator: `code://${checkout.originalRevision}/src/main.c#L1-L1`,
      digest: codeDigest("stable line"),
      why: "Stable line",
    }, {
      id: "evidence-run-target-drifted",
      kind: "code",
      locator: `code://${checkout.originalRevision}/src/main.c#L2-L2`,
      digest: codeDigest("old line"),
      why: "Changed line",
    }]);
    writeFactWithEvidence(store, {
      id: "fact-run-unit-drift",
      entityId: "unit-main",
      type: "purpose",
      value: "Unit fixture",
      rationale: "Closed run unit drift fixture",
      confidence: 0.7,
    }, [{
      id: "evidence-run-unit-drifted",
      kind: "code",
      locator: `code://${checkout.originalRevision}/src/main.c#L2-L2`,
      digest: codeDigest("old line"),
      why: "Changed line",
    }]);

    const context = buildTaskContext(
      store,
      task("run_closed", "run-main"),
      {
        ...fixtureOptions(store),
        checkoutRoot: checkout.root,
        checkoutRev: checkout.headRevision,
      },
    );

    expect(context.touched.every((subject) => subject.drift !== undefined)).toBeTrue();
    const unit = context.touched.find((subject) =>
      subject.kind === "entity" && subject.entity_locator === "src/main.c");
    const target = context.touched.find((subject) => subject.kind === "target");
    expect(unit).toMatchObject({
      drift: {
        drifted_count: 1,
        unresolvable_count: 0,
        evidence: [{ evidence_id: "evidence-run-unit-drifted", status: "drifted" }],
      },
    });
    expect(target).toMatchObject({
      drift: {
        drifted_count: 1,
        unresolvable_count: 0,
        evidence: [{ evidence_id: "evidence-run-target-drifted", status: "drifted" }],
      },
    });
    expect((target as unknown as { drift: { evidence: unknown[] } }).drift.evidence).toHaveLength(1);
  });

  test("splits PR rows, parses CI metrics, preserves discussion order, and caps targets", () => {
    const store = openFixture();
    const prsRoot = writePrArchive();
    const ids = insertPrCapFixture(store);
    const context = buildTaskContext(
      store,
      task("pr_imported", JSON.stringify(ids)),
      fixtureOptions(store, prsRoot),
    );
    const object = context.object as {
      pr_ref: string;
      pr_number: number;
      title: string | null;
      body: string | null;
      discussion: Array<{
        locator: string;
        body: string;
        path?: string;
        line?: string;
        diff_hunk?: string;
      }>;
      ci_rows: Array<Record<string, unknown>>;
      unit_rows: Array<Record<string, unknown>>;
    };

    expect(object).toMatchObject({
      pr_ref: "melee#1533",
      pr_number: 1533,
      title: "Fixture guard work",
      body: "Archived PR body",
    });
    expect(context.task.instruction).toContain(
      "Each discussion record carries its path, line, and attached diff hunk; cite the comment that names or is attached to the subject (pr://<n>/comment/<i>), never a CI or unit row, and propose nothing for subjects the discussion never touches.",
    );
    expect(object.ci_rows).toHaveLength(13);
    expect(object.unit_rows).toEqual([{
      locator: "pr://pr-1533--unit-main",
      entity_locator: "src/main.c",
      summary: "[mechanical] PR #1533 touched src/main.c",
      outcome: "no_change",
    }]);
    expect(object.ci_rows[0]).toMatchObject({
      locator: "pr://pr-1533--cap-01",
      target_stable_key: "cap/unit:Cap01",
      before_pct: 50.91,
      after_pct: 51.85,
      delta_pct: 0.94,
      bytes: 2,
    });
    expect(object.discussion.map(({ locator }) => locator)).toEqual([
      "pr://1533/comment/0",
      "pr://1533/comment/1",
      "pr://1533/comment/2",
    ]);
    expect(object.discussion.map(({ body }) => body)).toEqual([
      resolvePrComment(prsRoot, 1533, 0)!.body,
      resolvePrComment(prsRoot, 1533, 1)!.body,
      resolvePrComment(prsRoot, 1533, 2)!.body,
    ]);
    const review = object.discussion[2]!;
    const sourceDiffHunk = resolvePrComment(prsRoot, 1533, 2)!.diffHunk!;
    expect(review).toMatchObject({
      path: "src/main.c",
      line: "42",
      diff_hunk: `…${sourceDiffHunk.slice(-1500)}`,
    });
    expect(review.diff_hunk).toHaveLength(1501);
    expect(object.discussion[0]).not.toHaveProperty("path");
    expect(object.discussion[0]).not.toHaveProperty("line");
    expect(object.discussion[0]).not.toHaveProperty("diff_hunk");

    const touchedTargets = context.touched.filter((subject) => subject.kind === "target");
    expect(touchedTargets).toHaveLength(12);
    expect(touchedTargets.every((subject) => subject.material !== undefined)).toBeTrue();
    expect(touchedTargets.every((subject) => Array.isArray(subject.renamed_from))).toBeTrue();
    expect(touchedTargets.map(({ target_stable_key }) => target_stable_key)).toEqual(
      Array.from({ length: 12 }, (_, index) => {
        const suffix = String(13 - index).padStart(2, "0");
        return `cap/unit:Cap${suffix}`;
      }),
    );
    expect(context.omitted).toEqual({
      reason: "pr_target_cap",
      stable_keys: ["cap/unit:Cap01"],
    });
    expect(context.scope.targetStableKeys).not.toContain("cap/unit:Cap01");
    assertOrderingAndScope(context);
  });

  test("adds compact code-drift reports to every imported PR subject", () => {
    const store = openFixture();
    const prsRoot = writePrArchive();
    const checkout = writeDriftCheckout();
    store.db.query(`INSERT INTO pull_request
      (id, target_id, entity_id, pr_ref, summary, outcome, merged_at)
      VALUES ('pr-drift-target', 'target-main', NULL, 'melee#1533',
        'Target drift fixture', 'improvement', '2026-01-21T00:00:00.000Z')`).run();
    store.db.query(`INSERT INTO pull_request
      (id, target_id, entity_id, pr_ref, summary, outcome, merged_at)
      VALUES ('pr-drift-unit', NULL, 'unit-main', 'melee#1533',
        'Unit drift fixture', 'no_change', '2026-01-21T00:00:00.000Z')`).run();
    writeFactWithEvidence(store, {
      id: "fact-pr-target-drift",
      targetId: "target-main",
      type: "purpose",
      value: "Target fixture",
      rationale: "Target drift context fixture",
      confidence: 0.8,
    }, [{
      id: "evidence-pr-target-unchanged",
      kind: "code",
      locator: `code://${checkout.originalRevision}/src/main.c#L1-L1`,
      digest: codeDigest("stable line"),
      why: "Stable line",
    }, {
      id: "evidence-pr-target-drifted",
      kind: "code",
      locator: `code://${checkout.originalRevision}/src/main.c#L2-L2`,
      digest: codeDigest("old line"),
      why: "Changed line",
    }]);
    writeFactWithEvidence(store, {
      id: "fact-pr-unit-drift",
      entityId: "unit-main",
      type: "purpose",
      value: "Unit fixture",
      rationale: "Unit drift context fixture",
      confidence: 0.7,
    }, [{
      id: "evidence-pr-unit-drifted",
      kind: "code",
      locator: `code://${checkout.originalRevision}/src/main.c#L2-L2`,
      digest: codeDigest("old line"),
      why: "Changed line",
    }]);

    const context = buildTaskContext(
      store,
      task("pr_imported", JSON.stringify(["pr-drift-target", "pr-drift-unit"])),
      {
        ...fixtureOptions(store, prsRoot),
        checkoutRoot: checkout.root,
        checkoutRev: checkout.headRevision,
      },
    );

    expect(context.touched).toHaveLength(2);
    const unit = context.touched[0]!;
    const target = context.touched[1]!;
    expect(unit).toMatchObject({
      kind: "entity",
      drift: {
        subject: { entityId: "unit-main" },
        head_revision: checkout.headRevision,
        drifted_count: 1,
        unresolvable_count: 0,
        evidence: [{
          evidence_id: "evidence-pr-unit-drifted",
          status: "drifted",
          head_digest: codeDigest("new line"),
          head_locator: `code://${checkout.headRevision}/src/main.c#L2-L2`,
        }],
      },
    });
    expect(target).toMatchObject({
      kind: "target",
      drift: {
        subject: { targetId: "target-main" },
        head_revision: checkout.headRevision,
        drifted_count: 1,
        unresolvable_count: 0,
        evidence: [{
          evidence_id: "evidence-pr-target-drifted",
          status: "drifted",
        }],
      },
    });
    expect((target as unknown as { drift: { evidence: Array<{ status: string }> } }).drift.evidence)
      .toHaveLength(1);
  });

  test("adds rename history to imported PR targets", () => {
    const store = openFixture();
    const prsRoot = writePrArchive();
    store.db.query(`INSERT INTO target
      (id, kind, unit, unit_entity_id, symbol, stable_key, address, identity_status,
        report_revision, moved_to_id)
      VALUES ('target-main-old-z', 'function', 'main/melee/ft/ftcommon', 'unit-main',
        'ftCo_OldZ', 'main/melee/ft/ftcommon:ftCo_OldZ', '0x800BFFD0', 'moved',
        'fixture-rev', 'target-main'),
        ('target-main-old-a', 'function', 'main/melee/ft/ftcommon', 'unit-main',
        'ftCo_OldA', 'main/melee/ft/ftcommon:ftCo_OldA', '0x800BFFD0', 'moved',
        'fixture-rev', 'target-main')`).run();
    store.db.query(`INSERT INTO pull_request
      (id, target_id, entity_id, pr_ref, summary, outcome, merged_at)
      VALUES ('pr-rename-target', 'target-main', NULL, 'melee#1533',
        'Rename history fixture', 'improvement', '2026-01-21T00:00:00.000Z')`).run();

    const context = buildTaskContext(
      store,
      task("pr_imported", JSON.stringify(["pr-rename-target"])),
      fixtureOptions(store, prsRoot),
    );

    expect(context.touched.find((subject) => subject.kind === "target")).toMatchObject({
      target_stable_key: "main/melee/ft/ftcommon:ftCo_800BFFD0",
      renamed_from: [
        "main/melee/ft/ftcommon:ftCo_OldA",
        "main/melee/ft/ftcommon:ftCo_OldZ",
      ],
    });
  });

  test("uses whole-token archival mentions and gives material only after two records", () => {
    const store = openFixture();
    const insertMessage = store.db.query(`INSERT INTO discord_message
      (id, channel, author, posted_at, content, thread_id, ingested_at)
      VALUES (?, 'fixture', 'author', ?, ?, NULL, '2026-01-22T00:00:00.000Z')`);
    insertMessage.run(
      "1",
      "2026-01-01T00:00:00.000Z",
      "ftCo_800BFFD0 RareOnly_80001020 main.c",
    );
    insertMessage.run(
      "2",
      "2026-01-02T00:00:00.000Z",
      "ftCo_800BFFD0 appears again in main.c",
    );
    insertMessage.run(
      "3",
      "2026-01-03T00:00:00.000Z",
      "ftCo_800BFFD0_helper is a different whole token",
    );

    const context = buildTaskContext(
      store,
      task("archival_ingest", JSON.stringify({
        source: "discord",
        channel_id: "fixture",
        from_id: "1",
        to_id: "3",
        count: 3,
      })),
      fixtureOptions(store),
    );
    const object = context.object as {
      records: unknown[];
      mention_map: Array<{
        locator: string;
        mentions: Array<{ stable_key?: string; entity_locator?: string }>;
      }>;
    };

    expect(object.records).toHaveLength(3);
    expect(object.mention_map[2]?.mentions.some(({ stable_key }) =>
      stable_key === "main/melee/ft/ftcommon:ftCo_800BFFD0")).toBeFalse();
    const mainTarget = context.touched.find((subject) =>
      subject.kind === "target"
      && subject.target_stable_key === "main/melee/ft/ftcommon:ftCo_800BFFD0");
    const singleTarget = context.touched.find((subject) =>
      subject.kind === "target"
      && subject.target_stable_key === "main/other:RareOnly_80001020");
    const unit = context.touched.find((subject) =>
      subject.kind === "entity" && subject.entity_locator === "src/main.c");
    expect(mainTarget?.material).toBeDefined();
    expect(singleTarget?.material).toBeUndefined();
    expect(unit?.material).toBeDefined();
    assertOrderingAndScope(context);
  });

  test("splits a 100-message Discord slice into 40, 40, 20 and leaves a small slice alone", () => {
    const store = openFixture();
    const insert = store.db.query(`INSERT INTO discord_message
      (id, channel, author, posted_at, content, thread_id, ingested_at)
      VALUES (?, 'fixture', 'author', ?, 'content', NULL, '2026-01-22T00:00:00.000Z')`);
    for (let index = 1; index <= 100; index += 1) {
      insert.run(String(index), `2026-01-01T00:${String(index).padStart(3, "0")}:00.000Z`);
    }

    const children = splitSlicePayload(store, {
      source: "discord",
      channel_id: "fixture",
      from_id: "1",
      to_id: "100",
      count: 100,
    }).map((payload) => JSON.parse(payload));
    expect(children).toEqual([
      { source: "discord", channel_id: "fixture", from_id: "1", to_id: "40", count: 40 },
      { source: "discord", channel_id: "fixture", from_id: "41", to_id: "80", count: 40 },
      { source: "discord", channel_id: "fixture", from_id: "81", to_id: "100", count: 20 },
    ]);
    expect(splitSlicePayload(store, {
      source: "discord",
      channel_id: "fixture",
      from_id: "1",
      to_id: "5",
      count: 5,
    })).toEqual([]);
  });

  test("resolves regression event references and chooses the newest event for a target", () => {
    const store = openFixture();
    const context = buildTaskContext(
      store,
      task("regression", "target-main"),
      fixtureOptions(store),
    );
    const object = context.object as {
      event: { id: string; summary: string };
      refs: Array<{
        ref_kind: string;
        ref_id: string;
        resolved: Record<string, unknown> | null;
        reason?: string;
      }>;
    };

    expect(object.event).toMatchObject({
      id: "event-regression-new",
      summary: "Newest regression",
    });
    expect(object.refs).toEqual([
      {
        ref_kind: "commit",
        ref_id: "deadbeef",
        resolved: null,
        reason: "unsupported event ref kind: commit",
      },
      {
        ref_kind: "pr",
        ref_id: "77",
        resolved: {
          id: "pr-regression-ref",
          target_id: "target-main",
          entity_id: null,
          pr_ref: "melee#77",
          summary: "Regression reference PR",
          outcome: "no_change",
          merged_at: "2026-01-19T00:00:00.000Z",
        },
      },
      {
        ref_kind: "worker_run",
        ref_id: "run-main",
        resolved: {
          id: "run-main",
          target_id: "target-main",
          goal: "Improve guard",
          baseline: { score: 51.85 },
          run_id: "operator-7",
          final_outcome: "improvement",
          error_type: null,
          integration: "integrated",
          started_at: "2026-01-18T00:00:00.000Z",
          ended_at: "2026-01-18T00:20:00.000Z",
          closed_at: "2026-01-18T00:21:00.000Z",
        },
      },
    ]);
    assertOrderingAndScope(context);
  });

  test("attaches resolver verdicts and current code-drift statuses to drift facts", () => {
    const store = openFixture();
    const checkout = writeDriftCheckout();
    store.db.query(`INSERT INTO discord_message
      (id, channel, author, posted_at, content, thread_id, ingested_at)
      VALUES ('900', 'fixture', 'author', '2026-01-01T00:00:00.000Z', 'evidence', NULL,
        '2026-01-01T00:00:00.000Z')`).run();
    writeFactWithEvidence(store, {
      id: "fact-drift",
      targetId: "target-main",
      type: "purpose",
      value: "Controls the guard state",
      rationale: "Fixture drift fact",
      confidence: 0.8,
      updatedAt: "2026-01-20T00:00:00.000Z",
    }, [{
      id: "evidence-discord",
      kind: "discord",
      locator: "discord://message/900",
      why: "Discussion evidence",
      capturedAt: "2026-01-20T00:00:00.000Z",
    }, {
      id: "evidence-code",
      kind: "code",
      locator: `code://${checkout.originalRevision}/src/main.c#L2-L2`,
      digest: codeDigest("old line"),
      why: "Code evidence",
      capturedAt: "2026-01-20T00:00:00.000Z",
    }]);

    const context = buildTaskContext(
      store,
      task("drift_recheck", JSON.stringify({ target_id: "target-main" })),
      {
        ...fixtureOptions(store),
        checkoutRoot: checkout.root,
        checkoutRev: checkout.headRevision,
      },
    );
    const object = context.object as {
      drift: {
        head_revision: string;
        drifted_count: number;
        unresolvable_count: number;
      };
      flagged_facts: Array<{
        type: string;
        evidence: Array<{
          kind: string;
          resolver_verdict: unknown;
          drift_status?: string;
          head_digest?: string;
          head_locator?: string;
        }>;
      }>;
    };
    const fact = object.flagged_facts.find(({ type }) => type === "purpose");
    const evidenceByKind = Object.fromEntries(
      fact?.evidence.map((evidence) => [evidence.kind, evidence]) ?? [],
    );

    expect(evidenceByKind.discord).toMatchObject({
      resolver_verdict: { ok: true, digest: null },
    });
    expect(evidenceByKind.discord).not.toHaveProperty("drift_status");
    expect(evidenceByKind.code).toMatchObject({
      resolver_verdict: { ok: true, digest: codeDigest("old line") },
      drift_status: "drifted",
      head_digest: codeDigest("new line"),
      head_locator: `code://${checkout.headRevision}/src/main.c#L2-L2`,
    });
    expect(fact?.evidence.every(({ resolver_verdict }) => resolver_verdict !== undefined)).toBeTrue();
    expect(object.drift).toMatchObject({
      head_revision: checkout.headRevision,
      drifted_count: 1,
      unresolvable_count: 0,
    });
    expect(context.touched).toHaveLength(1);
    expect(context.touched[0]).toMatchObject({
      kind: "target",
      target_stable_key: "main/melee/ft/ftcommon:ftCo_800BFFD0",
    });
    expect(context.touched[0]?.material).toBeDefined();
    assertOrderingAndScope(context);
  });

  test("surfaces rename metadata in drift recheck context", () => {
    const store = openFixture();
    const context = buildTaskContext(
      store,
      task("drift_recheck", JSON.stringify({
        target_id: "target-main",
        renamed_from: "main/melee/ft/ftcommon:OldName",
        previous_target_id: "target-function-old",
        reason: "rename",
      })),
      fixtureOptions(store),
    );

    expect(context.object).toMatchObject({
      renamed_from: "main/melee/ft/ftcommon:OldName",
      previous_target_id: "target-function-old",
    });
  });

  test("builds a batched drift recheck context with listed subjects and its unit as support", () => {
    const store = openFixture();
    const context = buildTaskContext(
      store,
      task("drift_recheck", JSON.stringify({
        unit: "main/melee/ft/ftcommon",
        unit_entity_id: "unit-main",
        subjects: [
          { target_id: "target-main", drifted: 1, unresolvable: 0 },
          { entity_id: "concept-guard", drifted: 0, unresolvable: 1 },
        ],
        reason: "drift",
      })),
      fixtureOptions(store),
    );

    expect(context.touched.map((subject) => subject.kind === "target"
      ? subject.target_stable_key
      : subject.entity_locator)).toEqual([
      "concept://guard",
      "main/melee/ft/ftcommon:ftCo_800BFFD0",
    ]);
    expect(context.supporting).toHaveLength(1);
    expect(context.supporting[0]).toMatchObject({
      kind: "translation_unit",
      entity_locator: "src/main.c",
    });
    expect(context.object).toMatchObject({
      unit: "main/melee/ft/ftcommon",
      unit_entity_id: "unit-main",
      reason: "drift",
      subjects: [
        {
          subject: {
            subjectKind: "target",
            stableKey: "main/melee/ft/ftcommon:ftCo_800BFFD0",
          },
          drift: { subject: { targetId: "target-main" } },
        },
        {
          subject: { subjectKind: "entity", locator: "concept://guard" },
          drift: { subject: { entityId: "concept-guard" } },
        },
      ],
    });
    assertOrderingAndScope(context);
  });

  test("returns no-op contexts for malformed and dangling payloads", () => {
    const store = openFixture();
    const cases: Array<[LibrarianPathway, string]> = [
      ["run_closed", JSON.stringify({})],
      ["run_closed", "missing-run"],
      ["pr_imported", JSON.stringify({})],
      ["pr_imported", JSON.stringify(["missing-pr"])],
      ["archival_ingest", JSON.stringify({})],
      ["archival_ingest", JSON.stringify({
        source: "discord",
        channel_id: "fixture",
        from_id: "1000",
        to_id: "1001",
        count: 2,
      })],
      ["regression", JSON.stringify({})],
      ["regression", "missing-target"],
      ["drift_recheck", JSON.stringify({})],
      ["drift_recheck", "missing-subject"],
    ];

    for (const [pathway, payload] of cases) {
      const context = buildTaskContext(store, task(pathway, payload), {
        ...fixtureOptions(store),
        checkoutRev: "fixture-head",
      });
      expect(context.head_revision).toBe("fixture-head");
      expect(typeof (context.object as { error?: unknown }).error).toBe("string");
      expect(context.touched).toEqual([]);
      expect(context.supporting).toEqual([]);
      expect(context.scope).toEqual({ targetStableKeys: [], entityLocators: [] });
    }
  });
});
