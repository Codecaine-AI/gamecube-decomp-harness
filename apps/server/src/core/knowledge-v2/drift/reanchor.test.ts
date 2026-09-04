import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, spyOn, test } from "bun:test";

import type { CodeFileCache } from "../apply/resolver.js";
import { writeFactWithEvidence } from "../records/index.js";
import { openKnowledgeStore, type KnowledgeStore } from "../storage/store.js";
import { reanchorCodeDrift } from "./reanchor.js";

const temporaryRoots: string[] = [];
const stores: KnowledgeStore[] = [];

function digest(value: string): string {
  return `sha256:${createHash("sha256").update(value).digest("hex").slice(0, 16)}`;
}

function git(root: string, ...args: string[]): string {
  const result = Bun.spawnSync(["git", "-C", root, ...args], { stdout: "pipe", stderr: "pipe" });
  if (result.exitCode !== 0) throw new Error(result.stderr.toString());
  return result.stdout.toString().trim();
}

function fixture(): { checkoutRoot: string; store: KnowledgeStore; oldRevision: string; headRevision: string } {
  const root = mkdtempSync(join(tmpdir(), "kg2-reanchor-test-"));
  temporaryRoots.push(root);
  const checkoutRoot = join(root, "checkout");
  mkdirSync(join(checkoutRoot, "src/old"), { recursive: true });
  git(checkoutRoot, "init", "-q");
  git(checkoutRoot, "config", "user.email", "reanchor@example.com");
  git(checkoutRoot, "config", "user.name", "Reanchor Test");
  writeFileSync(join(checkoutRoot, "src/same.c"), "same line\n");
  writeFileSync(join(checkoutRoot, "src/shifted.c"), "alpha\nbeta\ngamma\n");
  writeFileSync(join(checkoutRoot, "src/changed.c"), "old content\n");
  writeFileSync(join(checkoutRoot, "src/old/moved.c"), "move one\nmove two\nmove three\n");
  git(checkoutRoot, "add", ".");
  git(checkoutRoot, "commit", "-qm", "old");
  const oldRevision = git(checkoutRoot, "rev-parse", "HEAD");

  writeFileSync(join(checkoutRoot, "src/shifted.c"), "inserted\nalpha\nbeta\ngamma\n");
  writeFileSync(join(checkoutRoot, "src/changed.c"), "new content\n");
  mkdirSync(join(checkoutRoot, "src/new"), { recursive: true });
  renameSync(join(checkoutRoot, "src/old/moved.c"), join(checkoutRoot, "src/new/moved.c"));
  git(checkoutRoot, "add", "-A");
  git(checkoutRoot, "commit", "-qm", "head");
  const headRevision = git(checkoutRoot, "rev-parse", "--short", "HEAD");

  const store = openKnowledgeStore({ knowledgeRoot: join(root, "knowledge") });
  stores.push(store);
  store.db.run(`INSERT INTO entity
    (id, kind, locator, parent_entity_id, identity_status, merged_into_id) VALUES
    ('unit-old', 'translation_unit', 'src/old/moved.c', NULL, 'merged', 'unit-new'),
    ('unit-new', 'translation_unit', 'src/new/moved.c', NULL, 'active', NULL),
    ('subject', 'pattern', 'pattern://fixture', NULL, 'active', NULL)`);
  return { checkoutRoot, store, oldRevision, headRevision };
}

function addEvidence(
  store: KnowledgeStore,
  oldRevision: string,
  id: string,
  path: string,
  lines: string,
  span: string,
  entityId = "subject",
): void {
  const type = id === "moved" ? "data_flow" : id === "shifted" ? "state_behavior" : "purpose";
  writeFactWithEvidence(store, {
    id: `fact-${id}`,
    entityId,
    type,
    value: id,
    rationale: "fixture",
    confidence: 1,
  }, [{
    id: `evidence-${id}`,
    kind: "code",
    locator: `code://${oldRevision}/${path}#${lines}`,
    digest: digest(span),
    why: "fixture",
  }]);
}

function evidence(store: KnowledgeStore, id: string): { locator: string; digest: string } {
  return store.db.query<{ locator: string; digest: string }, [string]>(
    "SELECT locator, digest FROM evidence WHERE id = ?",
  ).get(`evidence-${id}`)!;
}

afterEach(() => {
  for (const store of stores.splice(0)) store.close();
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("reanchorCodeDrift", () => {
  test("looks up unit paths once per distinct target while streaming evidence once", () => {
    const f = fixture();
    f.store.db.run(`INSERT INTO target
      (id, kind, unit, unit_entity_id, symbol, stable_key, address, identity_status, report_revision)
      VALUES ('target-moved', 'function', 'new/moved', 'unit-new', 'Moved',
        'new/moved:Moved', '0x80000000', 'current', 'v1')`);
    for (const [id, type] of [["first", "purpose"], ["second", "data_flow"]] as const) {
      writeFactWithEvidence(f.store, {
        id: `fact-${id}`,
        targetId: "target-moved",
        type,
        value: id,
        rationale: "fixture",
        confidence: 1,
      }, [{
        id: `evidence-${id}`,
        kind: "code",
        locator: `code://${f.oldRevision}/src/old/moved.c#L1-L3`,
        digest: digest("move one\nmove two\nmove three"),
        why: "fixture",
      }]);
    }
    const query = spyOn(f.store.db, "query");

    const summary = reanchorCodeDrift(f.store, {
      checkoutRoot: f.checkoutRoot,
      headRevision: f.headRevision,
    });

    const sqlCalls = query.mock.calls.map(([sql]) => String(sql));
    expect(summary.scanned).toBe(2);
    expect(sqlCalls.filter((sql) => sql.includes("WITH RECURSIVE lineage")).length).toBe(1);
    expect(sqlCalls.filter((sql) => sql.includes("JOIN entity current_unit")).length).toBe(1);
  });

  test("rewrites same-path, moved-path, and shifted citations without changing facts", () => {
    const f = fixture();
    addEvidence(f.store, f.oldRevision, "same", "src/same.c", "L1-L1", "same line");
    addEvidence(f.store, f.oldRevision, "moved", "src/old/moved.c", "L1-L3", "move one\nmove two\nmove three");
    addEvidence(f.store, f.oldRevision, "shifted", "src/shifted.c", "L1-L3", "alpha\nbeta\ngamma");

    const summary = reanchorCodeDrift(f.store, {
      checkoutRoot: f.checkoutRoot,
      headRevision: f.headRevision,
    });

    expect(summary).toMatchObject({
      scanned: 3,
      reanchored_same_path: 1,
      reanchored_moved_path: 1,
      reanchored_shifted: 1,
      original_unreadable: 0,
      left_for_librarian: { content_changed: 0, path_gone: 0 },
      by_status: {
        before: { unchanged: 1, drifted: 1, unresolvable: 1 },
        after: { unchanged: 3, drifted: 0, unresolvable: 0 },
      },
    });
    expect(evidence(f.store, "same")).toEqual({
      locator: `code://${f.headRevision}/src/same.c#L1-L1`,
      digest: digest("same line"),
    });
    expect(evidence(f.store, "moved").locator).toBe(
      `code://${f.headRevision}/src/new/moved.c#L1-L3`,
    );
    expect(evidence(f.store, "shifted").locator).toBe(
      `code://${f.headRevision}/src/shifted.c#L2-L4`,
    );
    expect(f.store.db.query<{ count: number }, []>("SELECT COUNT(*) AS count FROM fact").get()!.count).toBe(3);
  });

  test("leaves changed content for the librarian with its reason", () => {
    const f = fixture();
    addEvidence(f.store, f.oldRevision, "changed", "src/changed.c", "L1-L1", "old content");
    const before = evidence(f.store, "changed");

    const summary = reanchorCodeDrift(f.store, {
      checkoutRoot: f.checkoutRoot,
      headRevision: f.headRevision,
    });

    expect(summary.left_for_librarian).toEqual({ content_changed: 1, path_gone: 0 });
    expect(evidence(f.store, "changed")).toEqual(before);
  });

  test("dry run reports matches without writing them", () => {
    const f = fixture();
    addEvidence(f.store, f.oldRevision, "same", "src/same.c", "L1-L1", "same line");
    const before = evidence(f.store, "same");

    const summary = reanchorCodeDrift(f.store, {
      checkoutRoot: f.checkoutRoot,
      headRevision: f.headRevision,
      dryRun: true,
    });

    expect(summary.reanchored_same_path).toBe(1);
    expect(evidence(f.store, "same")).toEqual(before);
  });

  test("reanchors 200 spans in a 5,000-line file in under two seconds", () => {
    const root = mkdtempSync(join(tmpdir(), "kg2-reanchor-scale-test-"));
    temporaryRoots.push(root);
    const store = openKnowledgeStore({ knowledgeRoot: join(root, "knowledge") });
    stores.push(store);
    const oldLines = Array.from({ length: 5_000 }, (_, index) => `unique synthetic line ${index + 1}`);
    const insertedLines = Array.from({ length: 37 }, (_, index) => `inserted prefix ${index + 1}`);
    const headLines = [...insertedLines, ...oldLines];
    const oldFile = { ok: true as const, lines: oldLines };
    const headFile = { ok: true as const, lines: headLines };
    const cache: CodeFileCache = {
      read(revision, path) {
        if (path !== "src/scale.c") return { ok: false, reason: "code_revision_unresolvable" };
        return revision === "old" ? oldFile : headFile;
      },
      stats: () => ({ hits: 0, misses: 0 }),
    };

    const starts = Array.from({ length: 200 }, (_, index) => 1 + index * 24);
    for (const [index, startLine] of starts.entries()) {
      const entityId = `scale-subject-${index}`;
      store.db.run(`INSERT INTO entity
        (id, kind, locator, parent_entity_id, identity_status, merged_into_id)
        VALUES (?, 'pattern', ?, NULL, 'active', NULL)`, [entityId, `pattern://scale/${index}`]);
      const span = oldLines.slice(startLine - 1, startLine + 3).join("\n");
      addEvidence(
        store,
        "old",
        `scale-${index}`,
        "src/scale.c",
        `L${startLine}-L${startLine + 3}`,
        span,
        entityId,
      );
    }

    const started = performance.now();
    const summary = reanchorCodeDrift(store, {
      checkoutRoot: root,
      headRevision: "head",
      codeFileCache: cache,
    });
    const elapsedMs = performance.now() - started;

    expect(summary).toMatchObject({ scanned: 200, reanchored: 200, reanchored_shifted: 200 });
    for (const [index, startLine] of starts.entries()) {
      expect(evidence(store, `scale-${index}`).locator).toBe(
        `code://head/src/scale.c#L${startLine + 37}-L${startLine + 40}`,
      );
    }
    expect(elapsedMs).toBeLessThan(2_000);
  });
});
