import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, spyOn, test } from "bun:test";

import type { GlobalArgs } from "@server/core/game-registry/runtime-options.js";
import { writeFactWithEvidence } from "../records/index.js";
import { openKnowledgeStore, type KnowledgeStore } from "../storage/store.js";
import { kg2DriftScan, subjectsWithCodeEvidence } from "./cli.js";

const temporaryRoots: string[] = [];
const stores: KnowledgeStore[] = [];

interface Fixture {
  root: string;
  checkoutRoot: string;
  knowledgeRoot: string;
  globals: GlobalArgs;
  store: KnowledgeStore;
}

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

function git(checkoutRoot: string, args: string[]): string {
  return execFileSync("git", ["-C", checkoutRoot, ...args], { encoding: "utf8" }).trim();
}

function fixture(): Fixture {
  const root = mkdtempSync(join(tmpdir(), "kg2-drift-cli-test-"));
  temporaryRoots.push(root);
  const checkoutRoot = join(root, "checkout");
  const knowledgeRoot = join(root, "knowledge");
  mkdirSync(join(checkoutRoot, "src"), { recursive: true });
  git(checkoutRoot, ["init", "-q"]);
  git(checkoutRoot, ["config", "user.email", "test@example.com"]);
  git(checkoutRoot, ["config", "user.name", "Test"]);
  writeFileSync(join(checkoutRoot, "src/drifted.c"), "old drifted line\n");
  writeFileSync(join(checkoutRoot, "src/deleted.c"), "old deleted line\n");
  git(checkoutRoot, ["add", "."]);
  git(checkoutRoot, ["commit", "-qm", "v1"]);
  const revision = git(checkoutRoot, ["rev-parse", "HEAD"]);

  const store = openKnowledgeStore({ knowledgeRoot });
  stores.push(store);
  store.db.run(`INSERT INTO entity
    (id, kind, locator, parent_entity_id, identity_status, merged_into_id)
    VALUES ('unit-main', 'translation_unit', 'src/drifted.c', NULL, 'active', NULL)`);
  store.db.run(`INSERT INTO entity
    (id, kind, locator, parent_entity_id, identity_status, merged_into_id)
    VALUES ('concept-deleted', 'game_concept', 'concept://deleted', 'unit-main', 'active', NULL)`);
  store.db.run(`INSERT INTO target
    (id, kind, unit, unit_entity_id, symbol, stable_key, address, identity_status, report_revision)
    VALUES ('target-drifted', 'function', 'main/test', 'unit-main', 'Drifted',
      'main/test:Drifted', '0x80000000', 'current', 'v1')`);
  writeFactWithEvidence(store, {
    id: "fact-drifted",
    targetId: "target-drifted",
    type: "purpose",
    value: "drifts",
    rationale: "fixture",
    confidence: 1,
  }, [{
    id: "evidence-drifted",
    kind: "code",
    locator: `code://${revision}/src/drifted.c#L1-L1`,
    digest: digest("old drifted line"),
    why: "fixture",
  }]);
  writeFactWithEvidence(store, {
    id: "fact-deleted",
    entityId: "concept-deleted",
    type: "purpose",
    value: "disappears",
    rationale: "fixture",
    confidence: 1,
  }, [{
    id: "evidence-deleted",
    kind: "code",
    locator: `code://${revision}/src/deleted.c#L1-L1`,
    digest: digest("old deleted line"),
    why: "fixture",
  }]);

  writeFileSync(join(checkoutRoot, "src/drifted.c"), "new drifted line\n");
  rmSync(join(checkoutRoot, "src/deleted.c"));
  git(checkoutRoot, ["add", "-A"]);
  git(checkoutRoot, ["commit", "-qm", "v2"]);

  return {
    root,
    checkoutRoot,
    knowledgeRoot,
    store,
    globals: {
      repoRoot: checkoutRoot,
      stateDir: join(root, "state"),
      gameId: "fixture",
      dryRunAgents: true,
      provider: "fixture",
      model: "fixture",
      thinkingLevel: "medium",
    },
  };
}

async function runScan(f: Fixture, extraArgs: Array<[string, string | true]> = []): Promise<Record<string, unknown>> {
  const output: string[] = [];
  const log = spyOn(console, "log").mockImplementation((value) => output.push(String(value)));
  try {
    await kg2DriftScan(f.globals, new Map<string, string | true>([
      ["--knowledge-root", f.knowledgeRoot],
      ["--checkout-root", f.checkoutRoot],
      ...extraArgs,
    ]));
  } finally {
    log.mockRestore();
  }
  expect(output).toHaveLength(2);
  expect(output[0]).toContain(`[kg2-drift-scan] checkout ${f.checkoutRoot} @ `);
  return JSON.parse(output[1]!) as Record<string, unknown>;
}

afterEach(() => {
  for (const store of stores.splice(0)) store.close();
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("kg2DriftScan", () => {
  test("orders targets by unit and stable key before scanning", () => {
    const f = fixture();
    const insertTarget = f.store.db.query(`INSERT INTO target
      (id, kind, unit, unit_entity_id, symbol, stable_key, address, identity_status, report_revision)
      VALUES (?, 'function', ?, 'unit-main', ?, ?, ?, 'current', 'v1')`);
    const cases = [
      { id: "target-alpha-z", unit: "alpha", symbol: "Zed", stableKey: "alpha:Zed", address: "0x80000030" },
      { id: "target-beta-a", unit: "beta", symbol: "Able", stableKey: "beta:Able", address: "0x80000020" },
      { id: "target-alpha-a", unit: "alpha", symbol: "Able", stableKey: "alpha:Able", address: "0x80000010" },
    ];
    for (const entry of cases) {
      insertTarget.run(entry.id, entry.unit, entry.symbol, entry.stableKey, entry.address);
      writeFactWithEvidence(f.store, {
        id: `fact-${entry.id}`,
        targetId: entry.id,
        type: "purpose",
        value: "ordering fixture",
        rationale: "fixture",
        confidence: 1,
      }, [{
        id: `evidence-${entry.id}`,
        kind: "code",
        locator: "code://fixture/src/order.c#L1-L1",
        digest: "fixture",
        why: "fixture",
      }]);
    }

    expect(subjectsWithCodeEvidence(f.store, undefined).slice(0, 3)).toEqual([
      { targetId: "target-alpha-a" },
      { targetId: "target-alpha-z" },
      { targetId: "target-beta-a" },
    ]);
  });

  test("batches flagged target and entity subjects per unit, then deduplicates the unit task", async () => {
    const f = fixture();

    expect(await runScan(f)).toEqual({
      scanned: 2,
      flagged: 2,
      enqueued: 1,
      ungrouped_subjects: 0,
      by_status: { unchanged: 0, drifted: 1, unresolvable: 1 },
    });
    const tasks = f.store.db.query<{ id: string; pathway: string; payload: string }, []>(
      "SELECT id, pathway, payload FROM index_task ORDER BY payload",
    ).all();
    expect(tasks.map((task) => ({ pathway: task.pathway, payload: JSON.parse(task.payload) }))).toEqual([{
      pathway: "drift_recheck",
      payload: {
        unit: "main/test",
        unit_entity_id: "unit-main",
        subjects: [
          { target_id: "target-drifted", drifted: 1, unresolvable: 0 },
          { entity_id: "concept-deleted", drifted: 0, unresolvable: 1 },
        ],
        reason: "drift",
      },
    }]);

    f.store.db.query("UPDATE index_task SET payload = ? WHERE id = ?").run(
      JSON.stringify({ task_payload: JSON.parse(tasks[0]!.payload), drift_attempts: 1 }),
      tasks[0]!.id,
    );
    expect(await runScan(f)).toMatchObject({ scanned: 2, flagged: 2, enqueued: 0 });
    expect(f.store.db.query<{ count: number }, []>("SELECT COUNT(*) AS count FROM index_task").get()!.count).toBe(1);
  });

  test("enqueues an ungrouped curated entity separately while batching unit subjects", async () => {
    const f = fixture();
    writeFileSync(join(f.checkoutRoot, "src/curated.c"), "old curated line\n");
    git(f.checkoutRoot, ["add", "."]);
    git(f.checkoutRoot, ["commit", "-qm", "curated v1"]);
    const curatedRevision = git(f.checkoutRoot, ["rev-parse", "HEAD"]);
    f.store.db.run(`INSERT INTO entity
      (id, kind, locator, parent_entity_id, identity_status, merged_into_id)
      VALUES ('concept-curated', 'game_concept', 'game_concept:held-item-visibility', NULL, 'active', NULL)`);
    writeFactWithEvidence(f.store, {
      id: "fact-curated",
      entityId: "concept-curated",
      type: "purpose",
      value: "curated concept",
      rationale: "fixture",
      confidence: 1,
    }, [{
      id: "evidence-curated",
      kind: "code",
      locator: `code://${curatedRevision}/src/curated.c#L1-L1`,
      digest: digest("old curated line"),
      why: "fixture",
    }]);
    writeFileSync(join(f.checkoutRoot, "src/curated.c"), "new curated line\n");
    git(f.checkoutRoot, ["add", "."]);
    git(f.checkoutRoot, ["commit", "-qm", "curated v2"]);

    expect(await runScan(f)).toEqual({
      scanned: 3,
      flagged: 3,
      enqueued: 2,
      ungrouped_subjects: 1,
      by_status: { unchanged: 0, drifted: 2, unresolvable: 1 },
    });
    const payloads = f.store.db.query<{ payload: string }, []>(
      "SELECT payload FROM index_task ORDER BY payload",
    ).all().map((task) => JSON.parse(task.payload));
    expect(payloads).toContainEqual({ entity_id: "concept-curated", reason: "drift" });
    expect(payloads).toContainEqual(expect.objectContaining({
      unit_entity_id: "unit-main",
      subjects: expect.arrayContaining([
        expect.objectContaining({ target_id: "target-drifted" }),
        expect.objectContaining({ entity_id: "concept-deleted" }),
      ]),
    }));

    expect(await runScan(f)).toMatchObject({ enqueued: 0, ungrouped_subjects: 1 });
    expect(f.store.db.query<{ count: number }, []>("SELECT COUNT(*) AS count FROM index_task").get()!.count).toBe(2);
  });

  test("dry-run reports flagged subjects without enqueueing", async () => {
    const f = fixture();

    expect(await runScan(f, [["--dry-run", true]])).toMatchObject({
      scanned: 2,
      flagged: 2,
      enqueued: 0,
    });
    expect(f.store.db.query<{ count: number }, []>("SELECT COUNT(*) AS count FROM index_task").get()!.count).toBe(0);
  });

  test("supports disabling enqueue without making the scan a dry run", async () => {
    const f = fixture();

    expect(await runScan(f, [["--enqueue", "false"]])).toMatchObject({
      scanned: 2,
      flagged: 2,
      enqueued: 0,
    });
    expect(f.store.db.query<{ count: number }, []>("SELECT COUNT(*) AS count FROM index_task").get()!.count).toBe(0);
  });
});
