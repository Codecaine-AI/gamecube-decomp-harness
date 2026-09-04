import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "bun:test";
import {
  applyLibrarianPass,
  createSharedGate,
  REJECTION_MESSAGES,
  type ApplyOptions,
} from "./index.js";
import { createCodeFileCache, resolveCodeCitation } from "./resolver.js";
import { openKnowledgeStore, type KnowledgeStore } from "../storage/store.js";

const FIXED_NOW = "2026-04-01T12:00:00.000Z";
const tempDirs: string[] = [];
const stores: KnowledgeStore[] = [];

afterEach(() => {
  for (const store of stores.splice(0)) store.close();
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function makeTempDir(name: string): string {
  const dir = mkdtempSync(join(tmpdir(), `knowledge-v2-apply-${name}-`));
  tempDirs.push(dir);
  return dir;
}

function openStore(name: string): KnowledgeStore {
  const store = openKnowledgeStore({ knowledgeRoot: makeTempDir(name) });
  stores.push(store);
  return store;
}

function seedMechanicalSubjects(store: KnowledgeStore): void {
  const insertEntity = store.db.query(`INSERT INTO entity
    (id, kind, locator, parent_entity_id, identity_status, merged_into_id)
    VALUES (?, ?, ?, NULL, 'active', NULL)`);
  insertEntity.run("unit-entity-1", "translation_unit", "src/unit-one.c");
  insertEntity.run("unit-entity-2", "translation_unit", "src/unit-two.c");
  insertEntity.run("struct-entity-1", "struct", "struct://fighter");

  const insertTarget = store.db.query(`INSERT INTO target
    (id, kind, unit, unit_entity_id, symbol, stable_key, address, identity_status, report_revision)
    VALUES (?, 'function', ?, ?, ?, ?, ?, 'current', 'fixture-rev')`);
  insertTarget.run(
    "target-1",
    "unit-one",
    "unit-entity-1",
    "func_one",
    "unit-one:func_one",
    "0x80001000",
  );
  insertTarget.run(
    "target-2",
    "unit-two",
    "unit-entity-2",
    "func_two",
    "unit-two:func_two",
    "0x80002000",
  );
}

function seedResolvableSources(store: KnowledgeStore): void {
  store.db.query(`INSERT INTO discord_message
    (id, channel, author, posted_at, content, thread_id, ingested_at)
    VALUES ('discord-1', 'decomp', 'tester', '2026-01-01T00:00:00.000Z', 'A useful message', NULL,
      '2026-01-01T00:01:00.000Z')`).run();
  store.db.query(`INSERT INTO wiki_section
    (id, page, section, mirror_revision, content, ingested_at)
    VALUES ('wiki-1', 'Mechanics', 'Shield', 'wiki-rev-1', 'A useful section',
      '2026-01-01T00:01:00.000Z')`).run();
  store.db.query(`INSERT INTO pull_request
    (id, target_id, entity_id, pr_ref, summary, outcome, merged_at)
    VALUES ('42', 'target-1', NULL, 'melee#42', 'A useful pull request', 'improvement',
      '2026-01-02T00:00:00.000Z')`).run();
  store.db.query(`INSERT INTO worker_run
    (id, target_id, goal, baseline, run_id, worker_state_id, final_outcome, error_type,
      integration, started_at, ended_at, closed_at)
    VALUES ('worker-row-1', 'target-1', 'Try a rewrite', '{}', 'run-1', NULL, 'improvement', NULL,
      'integrated', '2026-01-03T00:00:00.000Z', '2026-01-03T00:10:00.000Z',
      '2026-01-03T00:11:00.000Z')`).run();
  store.db.query(`INSERT INTO submission
    (id, worker_run_id, seq, description, hypothesis, score, submitted_at, runtime_ref)
    VALUES ('submission-1', 'worker-row-1', 1, 'First submission', 'Branch shape', 72.5,
      '2026-01-03T00:05:00.000Z', NULL)`).run();
}

function seedCuratedEntity(
  store: KnowledgeStore,
  id: string,
  kind: "game_concept" | "pattern",
  locator: string,
): void {
  store.db.query(`INSERT INTO entity
    (id, kind, locator, parent_entity_id, identity_status, merged_into_id)
    VALUES (?, ?, ?, NULL, 'active', NULL)`).run(id, kind, locator);
}

function seedFact(
  store: KnowledgeStore,
  input: {
    id: string;
    targetId?: string;
    entityId?: string;
    type: string;
    value: string;
    updatedAt?: string;
    evidenceId?: string;
  },
): void {
  store.db.query(`INSERT INTO fact
    (id, target_id, entity_id, type, value, rationale, confidence, updated_at)
    VALUES (?, ?, ?, ?, ?, 'fixture rationale', 0.5, ?)`).run(
    input.id,
    input.targetId ?? null,
    input.entityId ?? null,
    input.type,
    input.value,
    input.updatedAt ?? "2026-01-01T00:00:00.000Z",
  );
  if (input.evidenceId !== undefined) {
    store.db.query(`INSERT INTO evidence
      (id, fact_id, kind, locator, digest, why, captured_at)
      VALUES (?, ?, 'discord', 'discord://message/discord-1', NULL, 'old evidence',
        '2026-01-01T00:00:00.000Z')`).run(input.evidenceId, input.id);
  }
}

function applyOptions(
  checkoutRoot: string,
  overrides: Partial<ApplyOptions> = {},
): ApplyOptions {
  return {
    scope: {
      targetStableKeys: ["unit-one:func_one"],
      entityLocators: ["src/unit-one.c", "struct://fighter"],
    },
    sharedWriteGate: createSharedGate(),
    checkoutRoot,
    now: () => FIXED_NOW,
    ...overrides,
  };
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

function createGitFixture(name: string): { root: string; revision: string; locator: string; span: string } {
  const root = makeTempDir(name);
  runGit(root, "init");
  runGit(root, "config", "user.email", "apply-test@example.com");
  runGit(root, "config", "user.name", "Apply Test");
  mkdirSync(join(root, "src"), { recursive: true });
  writeFileSync(join(root, "src", "sample.c"), "line one\nline two\nline three\nline four\n");
  runGit(root, "add", "src/sample.c");
  runGit(root, "commit", "-m", "fixture");
  const revision = runGit(root, "rev-parse", "HEAD");
  return {
    root,
    revision,
    locator: `code://${revision}/src/sample.c#L2-L3`,
    span: "line two\nline three",
  };
}

function createPrArchive(name: string): string {
  const root = makeTempDir(name);
  const extracted = join(root, "pr-42", "extracted");
  mkdirSync(extracted, { recursive: true });
  const rows = [
    { kind: "pr_body", author: "author", created_at: "2026-01-01T00:00:00.000Z", body: "The func_one naming decision came from the command handler." },
    { kind: "review_comment", author: "reviewer", created_at: "2026-01-02T00:00:00.000Z", body: "Use the established branch shape.", diff_hunk: "@@ source context @@\n static void func_one(void)" },
    { kind: "review_comment", author: "reviewer", created_at: "2026-01-03T00:00:00.000Z", body: "This is unrelated.", diff_hunk: "@@ source context @@\n static void other_function(void)" },
    { kind: "review_comment", author: "reviewer", created_at: "2026-01-04T00:00:00.000Z", body: "Keep this declaration local.", path: "src/unit-one.c" },
  ];
  writeFileSync(join(extracted, "text_corpus.jsonl"), `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`);
  return root;
}

function rowCount(store: KnowledgeStore, table: string): number {
  return store.db.query<{ count: number }, []>(`SELECT COUNT(*) AS count FROM ${table}`).get()!.count;
}

describe("full happy path", () => {
  test("applies writes, clear, link, curated admission, and merge in one envelope", async () => {
    const store = openStore("happy");
    seedMechanicalSubjects(store);
    seedResolvableSources(store);
    seedCuratedEntity(store, "concept-loser", "game_concept", "concept://old-shield");
    seedCuratedEntity(store, "concept-winner", "game_concept", "concept://shield");
    seedFact(store, {
      id: "fact-purpose",
      targetId: "target-1",
      type: "purpose",
      value: "old purpose",
      evidenceId: "old-purpose-evidence",
    });
    seedFact(store, {
      id: "fact-clear",
      targetId: "target-1",
      type: "state_behavior",
      value: "obsolete state claim",
      evidenceId: "old-clear-evidence",
    });
    seedFact(store, {
      id: "fact-loser",
      entityId: "concept-loser",
      type: "game_mapping",
      value: "Both names mean the shield mechanic",
    });

    const writeFact = {
      subject: { target_stable_key: "unit-one:func_one" },
      type: "purpose",
      op: "write",
      value: "Updates the fighter shield state",
      rationale: "The cited message describes the update.",
      confidence: 0.9,
      evidence: [{
        kind: "discord",
        locator: "discord://message/discord-1",
        why: "The message names the shield update.",
      }],
    };
    const clearFact = {
      subject: { target_stable_key: "unit-one:func_one" },
      type: "state_behavior",
      op: "clear",
      value: "",
      rationale: "The previous claim is no longer supported.",
      confidence: 0.8,
      evidence: [],
    };
    const link = {
      from: { target_stable_key: "unit-one:func_one" },
      to: { entity_locator: "concept://old-shield" },
      role: "implements",
      why: "The message connects the function to the mechanic.",
      kind: "discord",
      locator: "discord://message/discord-1",
    };
    const entity = {
      kind: "pattern",
      locator: "pattern://state-dispatch",
      note: "Names a repeated state-dispatch pattern.",
    };
    const merge = {
      loser_locator: "concept://old-shield",
      winner_locator: "concept://shield",
      why: "Both locators name the same mechanic.",
    };
    const proposal = {
      facts: [writeFact, clearFact],
      links: [link],
      entities: [entity],
      merges: [merge],
      follow_ups: [],
    };

    const report = await applyLibrarianPass(store, proposal, applyOptions(makeTempDir("checkout")));

    expect(report).toEqual({
      startedAt: FIXED_NOW,
      dryRun: false,
      envelope_rejections: [],
      follow_ups: [],
      follow_up_counts: { applied: 0, rejected: 0, skipped: 0 },
      items: [
        { index: 0, itemKind: "fact", item: writeFact, action: "applied" },
        { index: 1, itemKind: "fact", item: clearFact, action: "applied" },
        { index: 2, itemKind: "link", item: link, action: "applied" },
        { index: 3, itemKind: "entity", item: entity, action: "applied" },
        { index: 4, itemKind: "merge", item: merge, action: "applied" },
      ],
      counts: { applied: 5, rejected: 0, skipped: 0 },
    });

    expect(store.db.query(`SELECT id, value, rationale, confidence, updated_at
      FROM fact WHERE target_id = 'target-1' AND type = 'purpose'`).get()).toEqual({
      id: "fact-purpose",
      value: "Updates the fighter shield state",
      rationale: "The cited message describes the update.",
      confidence: 0.9,
      updated_at: FIXED_NOW,
    });
    expect(store.db.query("SELECT id FROM fact WHERE id = 'fact-clear'").get()).toBeNull();
    expect(store.db.query(`SELECT id, locator FROM evidence
      WHERE fact_id = 'fact-purpose'`).get()).toMatchObject({
      locator: "discord://message/discord-1",
    });
    expect(store.db.query(`SELECT id FROM evidence
      WHERE id IN ('old-purpose-evidence', 'old-clear-evidence')`).all()).toEqual([]);

    expect(store.db.query(`SELECT id, identity_status, merged_into_id
      FROM entity WHERE id = 'concept-loser'`).get()).toEqual({
      id: "concept-loser",
      identity_status: "merged",
      merged_into_id: "concept-winner",
    });
    expect(store.db.query(`SELECT id, kind, locator, identity_status
      FROM entity WHERE locator = 'pattern://state-dispatch'`).get()).toEqual({
      id: "pattern:pattern://state-dispatch",
      kind: "pattern",
      locator: "pattern://state-dispatch",
      identity_status: "active",
    });
    expect(store.db.query(`SELECT entity_id, value FROM fact
      WHERE type = 'game_mapping'`).get()).toEqual({
      entity_id: "concept-winner",
      value: "Both names mean the shield mechanic",
    });
    expect(store.db.query("SELECT from_target_id, to_entity_id, role FROM link").get()).toEqual({
      from_target_id: "target-1",
      to_entity_id: "concept-winner",
      role: "implements",
    });
  });
});

describe("required PR citations", () => {
  test("rejects a fact with only code evidence", async () => {
    const store = openStore("required-pr-code-only");
    seedMechanicalSubjects(store);
    const fact = {
      subject: { target_stable_key: "unit-one:func_one" }, type: "purpose", op: "write",
      value: "code-only claim", rationale: "source reading", confidence: 0.8,
      evidence: [{
        kind: "code",
        locator: "code://deadbeef/src/missing.c#L1-L1",
        why: "Code evidence alone is insufficient for this pass.",
      }],
    };

    const report = await applyLibrarianPass(store, { facts: [fact] }, applyOptions(
      makeTempDir("required-pr-code-only-checkout"),
      { requiredCitation: { kind: "pr", prNumber: "42" } },
    ));

    expect(report.items[0]).toMatchObject({ action: "rejected", reason: "missing_pr_citation" });
    expect(rowCount(store, "fact")).toBe(0);
  });

  test("rejects a fact citing another PR", async () => {
    const store = openStore("required-pr-wrong-pr");
    seedMechanicalSubjects(store);
    const fact = {
      subject: { target_stable_key: "unit-one:func_one" }, type: "purpose", op: "write",
      value: "wrong PR claim", rationale: "different pull request", confidence: 0.8,
      evidence: [{ kind: "pr", locator: "pr://41/comment/0", why: "Another PR's discussion." }],
    };

    const report = await applyLibrarianPass(store, { facts: [fact] }, applyOptions(
      makeTempDir("required-pr-wrong-pr-checkout"),
      { requiredCitation: { kind: "pr", prNumber: "42" } },
    ));

    expect(report.items[0]).toMatchObject({ action: "rejected", reason: "missing_pr_citation" });
    expect(rowCount(store, "fact")).toBe(0);
  });

  test("applies a fact when the PR body names its target symbol", async () => {
    const store = openStore("required-pr-comment");
    seedMechanicalSubjects(store);
    seedResolvableSources(store);
    const git = createGitFixture("required-pr-comment-git");
    const prsRoot = createPrArchive("required-pr-comment-archive");
    const fact = {
      subject: { target_stable_key: "unit-one:func_one" }, type: "purpose", op: "write",
      value: "PR-supported claim", rationale: "discussion plus implementation", confidence: 0.8,
      evidence: [
        { kind: "pr", locator: "pr://42/comment/0", why: "The PR body explains the func_one naming decision." },
        { kind: "code", locator: git.locator, why: "The source confirms the implementation." },
      ],
    };

    const report = await applyLibrarianPass(store, { facts: [fact] }, applyOptions(git.root, {
      prsRoot,
      requiredCitation: { kind: "pr", prNumber: "42" },
    }));

    expect(report.counts).toEqual({ applied: 1, rejected: 0, skipped: 0 });
    expect(store.db.query("SELECT kind FROM evidence ORDER BY kind").all()).toEqual([
      { kind: "code" },
      { kind: "pr" },
    ]);
  });

  test("applies a fact when the attached diff hunk names its target symbol", async () => {
    const store = openStore("required-pr-diff-hunk");
    seedMechanicalSubjects(store);
    seedResolvableSources(store);
    const prsRoot = createPrArchive("required-pr-diff-hunk-archive");
    const fact = {
      subject: { target_stable_key: "unit-one:func_one" }, type: "purpose", op: "write",
      value: "review-supported claim", rationale: "attached diff hunk", confidence: 0.8,
      evidence: [{ kind: "pr", locator: "pr://42/comment/1", why: "The review is attached to func_one." }],
    };

    const report = await applyLibrarianPass(store, { facts: [fact] }, applyOptions(
      makeTempDir("required-pr-diff-hunk-checkout"),
      { prsRoot, requiredCitation: { kind: "pr", prNumber: "42" } },
    ));

    expect(report.counts).toEqual({ applied: 1, rejected: 0, skipped: 0 });
  });

  test("rejects an unrelated PR comment", async () => {
    const store = openStore("required-pr-unrelated");
    seedMechanicalSubjects(store);
    seedResolvableSources(store);
    const prsRoot = createPrArchive("required-pr-unrelated-archive");
    const fact = {
      subject: { target_stable_key: "unit-one:func_one" }, type: "purpose", op: "write",
      value: "unrelated claim", rationale: "unrelated review", confidence: 0.8,
      evidence: [{ kind: "pr", locator: "pr://42/comment/2", why: "An unrelated review comment." }],
    };

    const report = await applyLibrarianPass(store, { facts: [fact] }, applyOptions(
      makeTempDir("required-pr-unrelated-checkout"),
      { prsRoot, requiredCitation: { kind: "pr", prNumber: "42" } },
    ));

    expect(report.items[0]).toMatchObject({ action: "rejected", reason: "irrelevant_pr_citation" });
  });

  test("rejects a CI row as the only PR evidence", async () => {
    const store = openStore("required-pr-row");
    seedMechanicalSubjects(store);
    store.db.query(`INSERT INTO pull_request
      (id, target_id, entity_id, pr_ref, summary, outcome, merged_at)
      VALUES ('pr-42--fn--func-one', 'target-1', NULL, 'melee#42', 'Matched CI row', 'match',
        '2026-01-02T00:00:00.000Z')`).run();
    const fact = {
      subject: { target_stable_key: "unit-one:func_one" }, type: "purpose", op: "write",
      value: "CI-supported claim", rationale: "matching CI row", confidence: 0.8,
      evidence: [{
        kind: "pr",
        locator: "pr://pr-42--fn--func-one",
        why: "The triggering PR's CI row records the match.",
      }],
    };

    const report = await applyLibrarianPass(store, { facts: [fact] }, applyOptions(
      makeTempDir("required-pr-row-checkout"),
      { requiredCitation: { kind: "pr", prNumber: "42" } },
    ));

    expect(report.items[0]).toMatchObject({ action: "rejected", reason: "missing_pr_citation" });
  });

  test("applies a link when its comment references either endpoint", async () => {
    const store = openStore("required-pr-link");
    seedMechanicalSubjects(store);
    seedResolvableSources(store);
    const prsRoot = createPrArchive("required-pr-link-archive");
    const matchingPr = {
      from: { target_stable_key: "unit-one:func_one" },
      to: { entity_locator: "src/unit-one.c" },
      role: "discussed_in", why: "Triggering PR discussion", kind: "pr",
      locator: "pr://42/comment/1",
    };

    const report = await applyLibrarianPass(store, {
      links: [matchingPr],
    }, applyOptions(makeTempDir("required-pr-link-checkout"), {
      prsRoot,
      requiredCitation: { kind: "pr", prNumber: "42" },
    }));

    expect(report.counts).toEqual({ applied: 1, rejected: 0, skipped: 0 });
    expect(rowCount(store, "link")).toBe(1);
  });

  test("applies an entity fact when the comment path names its locator basename", async () => {
    const store = openStore("required-pr-entity-path");
    seedMechanicalSubjects(store);
    seedResolvableSources(store);
    const prsRoot = createPrArchive("required-pr-entity-path-archive");
    const fact = {
      subject: { entity_locator: "src/unit-one.c" }, type: "purpose", op: "write",
      value: "translation unit claim", rationale: "review path", confidence: 0.8,
      evidence: [{ kind: "pr", locator: "pr://42/comment/3", why: "The review is on unit-one.c." }],
    };

    const report = await applyLibrarianPass(store, { facts: [fact] }, applyOptions(
      makeTempDir("required-pr-entity-path-checkout"),
      { prsRoot, requiredCitation: { kind: "pr", prNumber: "42" } },
    ));

    expect(report.counts).toEqual({ applied: 1, rejected: 0, skipped: 0 });
  });

  test("keeps code-only behavior unchanged without a required citation", async () => {
    const store = openStore("optional-pr-gate");
    seedMechanicalSubjects(store);
    const git = createGitFixture("optional-pr-gate-git");
    const fact = {
      subject: { target_stable_key: "unit-one:func_one" }, type: "purpose", op: "write",
      value: "ordinary code claim", rationale: "source reading", confidence: 0.8,
      evidence: [{ kind: "code", locator: git.locator, why: "The implementation supports the claim." }],
    };

    const report = await applyLibrarianPass(store, { facts: [fact] }, applyOptions(git.root));

    expect(report.counts).toEqual({ applied: 1, rejected: 0, skipped: 0 });
    expect(rowCount(store, "fact")).toBe(1);
  });
});

describe("code citation cache", () => {
  test("resolving the same citation twice invokes git show once", () => {
    const git = createGitFixture("resolver-cache");
    const oldRevision = git.revision;
    writeFileSync(join(git.root, "src", "sample.c"), "line one\nline two changed\nline three\nline four\n");
    runGit(git.root, "add", "src/sample.c");
    runGit(git.root, "commit", "-m", "head fixture");

    const originalSpawnSync = Bun.spawnSync;
    let showCalls = 0;
    const cache = createCodeFileCache(git.root, {
      spawnSync: (command, options) => {
        if (command.includes("show")) showCalls += 1;
        return originalSpawnSync(command, options);
      },
    });
    const first = resolveCodeCitation(oldRevision, "src/sample.c", 2, 3, git.root, cache);
    const second = resolveCodeCitation(oldRevision, "src/sample.c", 2, 3, git.root, cache);

    expect(first).toEqual(second);
    expect(first.ok).toBe(true);
    expect(showCalls).toBe(1);
    expect(cache.stats()).toEqual({ hits: 1, misses: 1 });
  });

  test("honors the configured cache limit", () => {
    let showCalls = 0;
    const cache = createCodeFileCache("/unused", {
      limit: 2,
      spawnSync: (command) => {
        if (command.includes("rev-parse")) {
          return { exitCode: 0, stdout: { toString: () => "head\n" } };
        }
        showCalls += 1;
        return { exitCode: 0, stdout: { toString: () => "line\n" } };
      },
    });

    cache.read("old", "one.c");
    cache.read("old", "two.c");
    cache.read("old", "one.c");
    cache.read("old", "three.c");
    cache.read("old", "two.c");

    expect(showCalls).toBe(4);
    expect(cache.stats()).toEqual({ hits: 1, misses: 4 });
  });

  test("uses the checkout worktree for the current HEAD revision", () => {
    const git = createGitFixture("resolver-head");
    const headShortRevision = runGit(git.root, "rev-parse", "--short", "HEAD");
    const worktreeSpan = "working tree line two\nline three";
    writeFileSync(join(git.root, "src", "sample.c"), `line one\n${worktreeSpan}\nline four\n`);
    const cache = createCodeFileCache(git.root);
    const expectedDigest = `sha256:${createHash("sha256").update(worktreeSpan).digest("hex").slice(0, 16)}`;

    expect(resolveCodeCitation(headShortRevision, "src/sample.c", 2, 3, git.root, cache)).toEqual({
      ok: true,
      digest: expectedDigest,
    });
  });

  test("preserves unresolved revision and out-of-range results", () => {
    const git = createGitFixture("resolver-errors");
    const cache = createCodeFileCache(git.root);

    expect(resolveCodeCitation("missing-revision", "src/sample.c", 1, 1, git.root, cache)).toEqual({
      ok: false,
      reason: "code_revision_unresolvable",
    });
    expect(resolveCodeCitation(git.revision, "src/sample.c", 3, 9, git.root, cache)).toEqual({
      ok: false,
      reason: "code_span_out_of_range",
      lineCount: 4,
    });
  });
});

describe("every gate", () => {
  test("throws only for malformed envelope collection shapes", async () => {
    const store = openStore("bad-envelope");
    const options = applyOptions(makeTempDir("bad-envelope-checkout"));

    await expect(applyLibrarianPass(store, null, options)).rejects.toThrow();
    await expect(applyLibrarianPass(store, { facts: {} }, options)).rejects.toThrow();
    await expect(applyLibrarianPass(store, { links: "not-an-array" }, options)).rejects.toThrow();
    await expect(applyLibrarianPass(store, { entities: 1 }, options)).rejects.toThrow();
    await expect(applyLibrarianPass(store, { merges: null }, options)).rejects.toThrow();
    await expect(applyLibrarianPass(store, { follow_ups: {} }, options)).rejects.toThrow();
  });

  test("rejects bad enums, confidence, and missing fields without stopping later items", async () => {
    const store = openStore("bad-shapes");
    seedMechanicalSubjects(store);
    seedResolvableSources(store);
    const validBase = {
      subject: { target_stable_key: "unit-one:func_one" },
      type: "purpose",
      op: "write",
      value: "claim",
      rationale: "reason",
      confidence: 0.5,
      evidence: [{ kind: "discord", locator: "discord://message/discord-1", why: "source" }],
    };
    const invalidItems: unknown[] = [
      { ...validBase, type: "summary" },
      { ...validBase, op: "replace" },
      { ...validBase, confidence: 1.1 },
      { ...validBase, evidence: [{ kind: "event", locator: "discord://message/discord-1", why: "source" }] },
      { type: "purpose", op: "write", value: "claim", rationale: "reason", confidence: 0.5, evidence: [] },
    ];
    const invalidLink = {
      from: { target_stable_key: "unit-one:func_one" },
      to: { entity_locator: "src/unit-one.c" },
      role: "implemented_in",
      why: "source",
      kind: "event",
      locator: "discord://message/discord-1",
    };

    const report = await applyLibrarianPass(store, {
      facts: invalidItems,
      links: [invalidLink],
    }, applyOptions(makeTempDir("bad-shapes-checkout")));

    expect(report.items.map(({ action, reason }) => ({ action, reason }))).toEqual([
      { action: "rejected", reason: "invalid_fact_type" },
      { action: "rejected", reason: "invalid_op" },
      { action: "rejected", reason: "invalid_confidence" },
      { action: "rejected", reason: "invalid_kind" },
      { action: "rejected", reason: "missing_field" },
      { action: "rejected", reason: "invalid_kind" },
    ]);
    expect(report.counts).toEqual({ applied: 0, rejected: 6, skipped: 0 });
  });

  test("clamps write confidence above 0.99 and leaves 0.99 unchanged", async () => {
    const store = openStore("confidence-clamp");
    seedMechanicalSubjects(store);
    const clamped = {
      subject: { target_stable_key: "unit-one:func_one" }, type: "purpose", op: "write",
      value: "clamped", rationale: "high confidence", confidence: 1.0, evidence: [],
    };
    const unchanged = {
      subject: { target_stable_key: "unit-one:func_one" }, type: "data_flow", op: "write",
      value: "unchanged", rationale: "accepted confidence", confidence: 0.99, evidence: [],
    };

    const report = await applyLibrarianPass(store, {
      facts: [clamped, unchanged],
    }, applyOptions(makeTempDir("confidence-clamp-checkout")));

    expect(report.items[0]).toMatchObject({
      action: "applied",
      note: "confidence_clamped_to_0.99",
    });
    expect(report.items[1]).toEqual({
      index: 1,
      itemKind: "fact",
      item: unchanged,
      action: "applied",
    });
    expect("note" in report.items[1]!).toBe(false);
    expect(store.db.query(`SELECT type, confidence FROM fact ORDER BY type`).all()).toEqual([
      { type: "data_flow", confidence: 0.99 },
      { type: "purpose", confidence: 0.99 },
    ]);
  });

  test("rejects unresolved subjects and applies an in-scope fact beside an out-of-scope fact", async () => {
    const store = openStore("subjects-scope");
    seedMechanicalSubjects(store);
    const evidence: unknown[] = [];
    const unresolved = {
      subject: { target_stable_key: "missing:target" }, type: "purpose", op: "write",
      value: "missing", rationale: "missing", confidence: 0.5, evidence,
    };
    const inScope = {
      subject: { target_stable_key: "unit-one:func_one" }, type: "purpose", op: "write",
      value: "in scope", rationale: "owned", confidence: 0.8, evidence,
    };
    const outOfScope = {
      subject: { target_stable_key: "unit-two:func_two" }, type: "purpose", op: "write",
      value: "out of scope", rationale: "not owned", confidence: 0.8, evidence,
    };

    const report = await applyLibrarianPass(store, {
      facts: [unresolved, inScope, outOfScope],
    }, applyOptions(makeTempDir("subjects-scope-checkout")));

    expect(report.items.map(({ action, reason }) => ({ action, reason }))).toEqual([
      { action: "rejected", reason: "unresolved_subject" },
      { action: "applied", reason: undefined },
      { action: "rejected", reason: "out_of_scope" },
    ]);
    expect(store.db.query("SELECT target_id, value FROM fact").all()).toEqual([
      { target_id: "target-1", value: "in scope" },
    ]);
  });

  test("rejects unresolved discord, wiki, pr, attempt, and code citations independently", async () => {
    const store = openStore("unresolved-citations");
    seedMechanicalSubjects(store);
    const citationCases = [
      { kind: "discord", locator: "discord://message/missing" },
      { kind: "wiki", locator: "wiki://missing" },
      { kind: "pr", locator: "pr://404" },
      { kind: "attempt", locator: "attempt://run/missing" },
      { kind: "code", locator: "code://deadbeef/src/missing.c#L1-L1" },
    ];
    const facts = citationCases.map((citation, index) => ({
      subject: { target_stable_key: "unit-one:func_one" },
      type: ["purpose", "inferred_name", "inferred_type", "data_flow", "state_behavior"][index],
      op: "write",
      value: `claim-${index}`,
      rationale: "citation check",
      confidence: 0.5,
      evidence: [{ ...citation, why: "missing source" }],
    }));

    const report = await applyLibrarianPass(store, { facts }, applyOptions(makeTempDir("not-a-git-repo")));

    expect(report.items.map(({ action, reason }) => ({ action, reason }))).toEqual([
      { action: "rejected", reason: "unresolved_locator" },
      { action: "rejected", reason: "unresolved_locator" },
      { action: "rejected", reason: "unresolved_locator" },
      { action: "rejected", reason: "unresolved_locator" },
      { action: "rejected", reason: "code_revision_unresolvable" },
    ]);
    expect(rowCount(store, "fact")).toBe(0);
  });

  test("rejects malformed and kind-mismatched locators", async () => {
    const store = openStore("bad-locators");
    seedMechanicalSubjects(store);
    const facts = [
      {
        subject: { target_stable_key: "unit-one:func_one" }, type: "purpose", op: "write",
        value: "claim", rationale: "reason", confidence: 0.5,
        evidence: [{ kind: "discord", locator: "not-a-locator", why: "bad" }],
      },
      {
        subject: { target_stable_key: "unit-one:func_one" }, type: "data_flow", op: "write",
        value: "claim", rationale: "reason", confidence: 0.5,
        evidence: [{ kind: "wiki", locator: "discord://message/discord-1", why: "wrong kind" }],
      },
    ];

    const report = await applyLibrarianPass(store, { facts }, applyOptions(makeTempDir("bad-locators-checkout")));

    expect(report.items.map(({ reason }) => reason)).toEqual([
      "malformed_locator",
      "kind_locator_mismatch",
    ]);
  });

  test("rejects unavailable and missing PR comments plus a missing submission sequence", async () => {
    const store = openStore("citation-segments");
    seedMechanicalSubjects(store);
    seedResolvableSources(store);
    const prsRoot = createPrArchive("prs");
    const facts = [
      {
        subject: { target_stable_key: "unit-one:func_one" }, type: "purpose", op: "write",
        value: "claim", rationale: "reason", confidence: 0.5,
        evidence: [{ kind: "pr", locator: "pr://42/comment/9", why: "missing comment" }],
      },
      {
        subject: { target_stable_key: "unit-one:func_one" }, type: "data_flow", op: "write",
        value: "claim", rationale: "reason", confidence: 0.5,
        evidence: [{ kind: "attempt", locator: "attempt://run/run-1/submission/9", why: "missing submission" }],
      },
    ];

    const noArchiveReport = await applyLibrarianPass(store, {
      facts: [{
        subject: { target_stable_key: "unit-one:func_one" }, type: "game_mapping", op: "write",
        value: "claim", rationale: "reason", confidence: 0.5,
        evidence: [{ kind: "pr", locator: "pr://42/comment/0", why: "comment" }],
      }],
    }, applyOptions(makeTempDir("no-prs-root")));
    const report = await applyLibrarianPass(store, { facts }, applyOptions(
      makeTempDir("citation-segments-checkout"),
      { prsRoot },
    ));

    expect(noArchiveReport.items[0]).toMatchObject({
      action: "rejected",
      reason: "pr_comments_unavailable",
    });
    expect(report.items.map(({ reason }) => reason)).toEqual([
      "pr_comment_not_found",
      "submission_not_found",
    ]);
  });

  test("computes one code digest for evidence and links and rejects an out-of-range span", async () => {
    const store = openStore("code-digest");
    seedMechanicalSubjects(store);
    const git = createGitFixture("git");
    const expectedDigest = `sha256:${createHash("sha256").update(git.span).digest("hex").slice(0, 16)}`;
    const fact = {
      subject: { target_stable_key: "unit-one:func_one" }, type: "purpose", op: "write",
      value: "Reads lines two and three", rationale: "The exact code span supports this.", confidence: 0.9,
      evidence: [{ kind: "code", locator: git.locator, why: "The two lines are the implementation." }],
    };
    const link = {
      from: { target_stable_key: "unit-one:func_one" },
      to: { entity_locator: "src/unit-one.c" },
      role: "implemented_in", why: "The code is in this unit.", kind: "code", locator: git.locator,
    };
    const outOfRange = {
      subject: { target_stable_key: "unit-one:func_one" }, type: "data_flow", op: "write",
      value: "bad span", rationale: "bad span", confidence: 0.5,
      evidence: [{
        kind: "code",
        locator: `code://${git.revision}/src/sample.c#L3-L9`,
        why: "Past end of file",
      }],
    };

    const report = await applyLibrarianPass(store, {
      facts: [fact, outOfRange],
      links: [link],
    }, applyOptions(git.root));

    expect(report.items.map(({ action, reason }) => ({ action, reason }))).toEqual([
      { action: "applied", reason: undefined },
      { action: "rejected", reason: "code_span_out_of_range" },
      { action: "applied", reason: undefined },
    ]);
    expect(store.db.query("SELECT digest FROM evidence").get()).toEqual({ digest: expectedDigest });
    expect(store.db.query("SELECT digest FROM link").get()).toEqual({ digest: expectedDigest });
  });

  test("stores null digests for all non-code citation kinds", async () => {
    const store = openStore("non-code-digests");
    seedMechanicalSubjects(store);
    seedResolvableSources(store);
    const prsRoot = createPrArchive("valid-pr-comment");
    const fact = {
      subject: { target_stable_key: "unit-one:func_one" }, type: "purpose", op: "write",
      value: "Claim with four source kinds", rationale: "Each source supports the claim.", confidence: 0.9,
      evidence: [
        { kind: "discord", locator: "discord://message/discord-1", why: "Discord evidence" },
        { kind: "wiki", locator: "wiki://wiki-1", why: "Wiki evidence" },
        { kind: "pr", locator: "pr://42/comment/0", why: "PR evidence" },
        { kind: "attempt", locator: "attempt://run/run-1/submission/1/transcript/10-20", why: "Run evidence" },
      ],
    };
    const link = {
      from: { target_stable_key: "unit-one:func_one" },
      to: { entity_locator: "src/unit-one.c" },
      role: "documented_in", why: "The wiki documents the unit.", kind: "wiki", locator: "wiki://wiki-1",
    };

    const report = await applyLibrarianPass(store, {
      facts: [fact],
      links: [link],
    }, applyOptions(makeTempDir("non-code-checkout"), { prsRoot }));

    expect(report.counts).toEqual({ applied: 2, rejected: 0, skipped: 0 });
    expect(store.db.query("SELECT kind, digest FROM evidence ORDER BY kind").all()).toEqual([
      { kind: "attempt", digest: null },
      { kind: "discord", digest: null },
      { kind: "pr", digest: null },
      { kind: "wiki", digest: null },
    ]);
    expect(store.db.query("SELECT kind, digest FROM link").get()).toEqual({ kind: "wiki", digest: null });
  });

  test("reports clear, link, admission, and merge write gates", async () => {
    const store = openStore("write-gates");
    seedMechanicalSubjects(store);
    seedResolvableSources(store);
    seedCuratedEntity(store, "concept-existing", "game_concept", "concept://existing");
    const emptyClear = {
      subject: { target_stable_key: "unit-one:func_one" }, type: "purpose", op: "clear",
      value: "", rationale: "nothing exists", confidence: 0.5, evidence: [],
    };
    const link = {
      from: { target_stable_key: "unit-one:func_one" }, to: { entity_locator: "src/unit-one.c" },
      role: "implemented_in", why: "message", kind: "discord", locator: "discord://message/discord-1",
    };
    const existingEntity = { kind: "game_concept", locator: "concept://existing", note: "already present" };
    const mechanicalEntity = { kind: "struct", locator: "struct://new", note: "owned by extraction" };
    const mechanicalMerge = {
      loser_locator: "struct://fighter", winner_locator: "concept://existing", why: "invalid merge",
    };

    const first = await applyLibrarianPass(store, {
      facts: [emptyClear], links: [link], entities: [existingEntity, mechanicalEntity], merges: [mechanicalMerge],
    }, applyOptions(makeTempDir("write-gates-checkout")));
    const duplicate = await applyLibrarianPass(store, { links: [link] }, applyOptions(makeTempDir("duplicate-checkout")));

    expect(first.items.map(({ action, reason }) => ({ action, reason }))).toEqual([
      { action: "skipped", reason: "nothing_to_clear" },
      { action: "applied", reason: undefined },
      { action: "skipped", reason: "already_admitted" },
      { action: "rejected", reason: "invalid_entity_kind" },
      { action: "rejected", reason: "mechanical_merge_rejected" },
    ]);
    expect(duplicate.items[0]).toMatchObject({ action: "skipped", reason: "duplicate" });
    expect(rowCount(store, "link")).toBe(1);
  });
});

describe("parallel semantics", () => {
  test("serializes curated facts while independent scope writes remain intact", async () => {
    const store = openStore("parallel");
    seedMechanicalSubjects(store);
    seedCuratedEntity(store, "concept-shield", "game_concept", "concept://shield");
    const sharedWriteGate = createSharedGate();
    const laterStartedAt = "2026-05-01T00:00:02.000Z";
    const earlierStartedAt = "2026-05-01T00:00:01.000Z";
    const proposalA = {
      facts: [
        {
          subject: { target_stable_key: "unit-one:func_one" }, type: "purpose", op: "write",
          value: "scope A", rationale: "owned by A", confidence: 0.8, evidence: [],
        },
        {
          subject: { entity_locator: "concept://shield" }, type: "data_flow", op: "write",
          value: "newer curated value", rationale: "newer pass", confidence: 0.9, evidence: [],
        },
      ],
    };
    const proposalB = {
      facts: [
        {
          subject: { target_stable_key: "unit-two:func_two" }, type: "purpose", op: "write",
          value: "scope B", rationale: "owned by B", confidence: 0.8, evidence: [],
        },
        {
          subject: { entity_locator: "concept://shield" }, type: "data_flow", op: "write",
          value: "stale curated value", rationale: "older pass", confidence: 0.7, evidence: [],
        },
      ],
    };
    const checkoutRoot = makeTempDir("parallel-checkout");

    const firstPromise = applyLibrarianPass(store, proposalA, {
      scope: { targetStableKeys: ["unit-one:func_one"], entityLocators: [] },
      sharedWriteGate,
      checkoutRoot,
      now: () => laterStartedAt,
    });
    const secondPromise = applyLibrarianPass(store, proposalB, {
      scope: { targetStableKeys: ["unit-two:func_two"], entityLocators: [] },
      sharedWriteGate,
      checkoutRoot,
      now: () => earlierStartedAt,
    });
    const [first, second] = await Promise.all([firstPromise, secondPromise]);

    expect(first.items.map(({ action, reason }) => ({ action, reason }))).toEqual([
      { action: "applied", reason: undefined },
      { action: "applied", reason: undefined },
    ]);
    expect(second.items.map(({ action, reason }) => ({ action, reason }))).toEqual([
      { action: "applied", reason: undefined },
      { action: "skipped", reason: "concurrent_newer_fact" },
    ]);
    expect(store.db.query(`SELECT target_id, value FROM fact
      WHERE target_id IS NOT NULL ORDER BY target_id`).all()).toEqual([
      { target_id: "target-1", value: "scope A" },
      { target_id: "target-2", value: "scope B" },
    ]);
    expect(store.db.query(`SELECT entity_id, value, updated_at FROM fact
      WHERE entity_id = 'concept-shield'`).get()).toEqual({
      entity_id: "concept-shield",
      value: "newer curated value",
      updated_at: laterStartedAt,
    });
  });
});

describe("dryRun", () => {
  test("returns a full applied report without changing data_version or row counts", async () => {
    const store = openStore("dry-run");
    seedMechanicalSubjects(store);
    seedResolvableSources(store);
    seedCuratedEntity(store, "concept-loser", "game_concept", "concept://old-shield");
    seedCuratedEntity(store, "concept-winner", "game_concept", "concept://shield");
    seedFact(store, {
      id: "fact-to-clear", targetId: "target-1", type: "state_behavior", value: "old claim",
      evidenceId: "clear-evidence",
    });
    const proposal = {
      facts: [
        {
          subject: { target_stable_key: "unit-one:func_one" }, type: "purpose", op: "write",
          value: "dry write", rationale: "validated", confidence: 1.0,
          evidence: [{ kind: "discord", locator: "discord://message/discord-1", why: "message" }],
        },
        {
          subject: { target_stable_key: "unit-one:func_one" }, type: "state_behavior", op: "clear",
          value: "", rationale: "validated clear", confidence: 0.8, evidence: [],
        },
      ],
      links: [{
        from: { target_stable_key: "unit-one:func_one" }, to: { entity_locator: "concept://shield" },
        role: "implements", why: "message", kind: "discord", locator: "discord://message/discord-1",
      }],
      entities: [{ kind: "pattern", locator: "pattern://dry", note: "would be admitted" }],
      merges: [{
        loser_locator: "concept://old-shield", winner_locator: "concept://shield", why: "same concept",
      }],
    };
    const tables = ["entity", "fact", "evidence", "link"];
    const countsBefore = Object.fromEntries(tables.map((table) => [table, rowCount(store, table)]));
    const dataVersionBefore = store.db.query<{ data_version: number }, []>("PRAGMA data_version").get()!.data_version;

    const report = await applyLibrarianPass(store, proposal, applyOptions(
      makeTempDir("dry-run-checkout"),
      { dryRun: true },
    ));

    const dataVersionAfter = store.db.query<{ data_version: number }, []>("PRAGMA data_version").get()!.data_version;
    const countsAfter = Object.fromEntries(tables.map((table) => [table, rowCount(store, table)]));
    expect(report).toMatchObject({
      startedAt: FIXED_NOW,
      dryRun: true,
      counts: { applied: 5, rejected: 0, skipped: 0 },
    });
    expect(report.items.map(({ action }) => action)).toEqual([
      "applied", "applied", "applied", "applied", "applied",
    ]);
    expect(report.items[0]).toMatchObject({ note: "confidence_clamped_to_0.99" });
    expect(dataVersionAfter).toBe(dataVersionBefore);
    expect(countsAfter).toEqual(countsBefore);
    expect(store.db.query("SELECT id FROM entity WHERE locator = 'pattern://dry'").get()).toBeNull();
    expect(store.db.query("SELECT value FROM fact WHERE id = 'fact-to-clear'").get()).toEqual({ value: "old claim" });
  });
});

describe("librarian rejection retry contract", () => {
  test("rejects an envelope with unknown keys without applying known items", async () => {
    const store = openStore("unknown-envelope-key");
    seedMechanicalSubjects(store);
    const fact = {
      subject: { target_stable_key: "unit-one:func_one" }, type: "purpose", op: "write",
      value: "must not write", rationale: "malformed envelope", confidence: 0.8, evidence: [],
    };
    const followUp = {
      subject: { target_stable_key: "unit-two:func_two" }, why: "Review the related target.",
    };
    const report = await applyLibrarianPass(store, {
      facts: [fact], links: [], entities: [], merges: [], follow_ups: [followUp],
      fact_writes: [], proposals: [],
    }, applyOptions(makeTempDir("unknown-envelope-checkout")));

    expect(report.envelope_rejections).toHaveLength(2);
    expect(report.envelope_rejections[0]).toMatchObject({
      key: "fact_writes", reason: "unknown_envelope_key",
    });
    expect(report.envelope_rejections.every(({ message }) => message.length > 0)).toBe(true);
    expect(report.items[0]).toMatchObject({ action: "rejected", reason: "malformed_envelope" });
    expect(report.follow_ups[0]).toMatchObject({ action: "rejected", reason: "malformed_envelope" });
    expect(rowCount(store, "fact")).toBe(0);
  });

  test("validates, resolves, deduplicates, and reports follow-ups without writes", async () => {
    const store = openStore("follow-ups");
    seedMechanicalSubjects(store);
    const before = store.db.query<{ version: number }, []>("PRAGMA data_version").get()!.version;
    const report = await applyLibrarianPass(store, {
      facts: [], links: [], entities: [], merges: [], follow_ups: [
        { subject: { target_stable_key: "unit-two:func_two" }, why: "Inspect the sibling." },
        { subject: { entity_locator: "src/unit-two.c" }, why: "Inspect the unit." },
        { subject: { target_stable_key: "unit-two:func_two" }, why: "Duplicate." },
        { subject: { target_stable_key: "unit-one:func_one" }, why: "Already writable." },
        { subject: { target_stable_key: "missing:target" }, why: "Missing." },
        { subject: { target_stable_key: "unit-two:func_two" }, why: "   " },
      ],
    }, applyOptions(makeTempDir("follow-ups-checkout"), { dryRun: true }));

    expect(report.follow_ups.map(({ action, reason }) => ({ action, reason }))).toEqual([
      { action: "applied", reason: undefined },
      { action: "applied", reason: undefined },
      { action: "skipped", reason: "duplicate" },
      { action: "rejected", reason: "follow_up_in_scope" },
      { action: "rejected", reason: "unresolved_subject" },
      { action: "rejected", reason: "missing_field" },
    ]);
    expect(report.follow_ups[0]?.subject).toEqual({
      targetId: "target-2", targetStableKey: "unit-two:func_two",
    });
    expect(report.follow_ups[1]?.subject).toEqual({
      entityId: "unit-entity-2", entityLocator: "src/unit-two.c",
    });
    expect(report.follow_up_counts).toEqual({ applied: 2, rejected: 3, skipped: 1 });
    expect(store.db.query<{ version: number }, []>("PRAGMA data_version").get()!.version).toBe(before);
  });

  test("caps accepted follow-ups at ten", async () => {
    const store = openStore("follow-up-cap");
    seedMechanicalSubjects(store);
    for (let index = 0; index < 11; index += 1) {
      store.db.query(`INSERT INTO target
        (id, kind, unit, unit_entity_id, symbol, stable_key, address, identity_status, report_revision)
        VALUES (?, 'function', 'unit-two', 'unit-entity-2', ?, ?, ?, 'current', 'fixture-rev')`).run(
        `extra-target-${index}`, `extra_${index}`, `unit-two:extra_${index}`, `0x80003${index.toString().padStart(3, "0")}`,
      );
    }
    const follow_ups = Array.from({ length: 11 }, (_, index) => ({
      subject: { target_stable_key: `unit-two:extra_${index}` }, why: `Inspect target ${index}.`,
    }));
    const report = await applyLibrarianPass(store, {
      facts: [], links: [], entities: [], merges: [], follow_ups,
    }, applyOptions(makeTempDir("follow-up-cap-checkout")));

    expect(report.follow_ups.slice(0, 10).every(({ action }) => action === "applied")).toBe(true);
    expect(report.follow_ups[10]).toMatchObject({ action: "rejected", reason: "follow_up_cap" });
  });

  test("waives the PR comment gate only for renamed subjects cited at head revision", async () => {
    const store = openStore("renamed-head-citation");
    seedMechanicalSubjects(store);
    const git = createGitFixture("renamed-head-git");
    const fact = {
      subject: { target_stable_key: "unit-one:func_one" }, type: "purpose", op: "write",
      value: "renamed implementation", rationale: "head code", confidence: 0.8,
      evidence: [{ kind: "code", locator: git.locator, why: "Current implementation." }],
    };
    const base = { requiredCitation: { kind: "pr" as const, prNumber: "42" }, headRevision: git.revision };
    const accepted = await applyLibrarianPass(store, { facts: [fact] }, applyOptions(git.root, {
      ...base, renamedSubjects: ["unit-one:func_one"],
    }));
    const rejected = await applyLibrarianPass(store, { facts: [{ ...fact, type: "data_flow" }] }, applyOptions(git.root, {
      ...base, renamedSubjects: [],
    }));

    expect(accepted.items[0]).toMatchObject({ action: "applied" });
    expect(rejected.items[0]).toMatchObject({ action: "rejected", reason: "missing_pr_citation" });
  });

  test("waives the PR comment gate for drifted facts cited at head revision", async () => {
    const store = openStore("drifted-head-citation");
    seedMechanicalSubjects(store);
    const git = createGitFixture("drifted-head-git");
    const fact = {
      subject: { target_stable_key: "unit-one:func_one" }, type: "purpose", op: "write",
      value: "current implementation purpose", rationale: "head code", confidence: 0.8,
      evidence: [{ kind: "code", locator: git.locator, why: "Current implementation." }],
    };
    const report = await applyLibrarianPass(store, { facts: [fact] }, applyOptions(git.root, {
      requiredCitation: { kind: "pr", prNumber: "42" },
      headRevision: git.revision,
      driftedFacts: [{ subject: "unit-one:func_one", type: "purpose" }],
    }));

    expect(report.items[0]).toMatchObject({ action: "applied" });
  });

  test("keeps the PR comment gate for a non-drifted fact type", async () => {
    const store = openStore("non-drifted-type-citation");
    seedMechanicalSubjects(store);
    const git = createGitFixture("non-drifted-type-git");
    const fact = {
      subject: { target_stable_key: "unit-one:func_one" }, type: "data_flow", op: "write",
      value: "current data flow", rationale: "head code", confidence: 0.8,
      evidence: [{ kind: "code", locator: git.locator, why: "Current implementation." }],
    };
    const report = await applyLibrarianPass(store, { facts: [fact] }, applyOptions(git.root, {
      requiredCitation: { kind: "pr", prNumber: "42" },
      headRevision: git.revision,
      driftedFacts: [{ subject: "unit-one:func_one", type: "purpose" }],
    }));

    expect(report.items[0]).toMatchObject({ action: "rejected", reason: "missing_pr_citation" });
  });

  test("keeps the PR comment gate when a drifted fact cites another revision", async () => {
    const store = openStore("drifted-other-revision-citation");
    seedMechanicalSubjects(store);
    const git = createGitFixture("drifted-other-revision-git");
    writeFileSync(join(git.root, "src", "sample.c"), "line one\nline two changed\nline three\nline four\n");
    runGit(git.root, "add", "src/sample.c");
    runGit(git.root, "commit", "-m", "head fixture");
    const headRevision = runGit(git.root, "rev-parse", "HEAD");
    const fact = {
      subject: { target_stable_key: "unit-one:func_one" }, type: "purpose", op: "write",
      value: "stale implementation purpose", rationale: "old code", confidence: 0.8,
      evidence: [{ kind: "code", locator: git.locator, why: "Previous implementation." }],
    };
    const report = await applyLibrarianPass(store, { facts: [fact] }, applyOptions(git.root, {
      requiredCitation: { kind: "pr", prNumber: "42" },
      headRevision,
      driftedFacts: [{ subject: "unit-one:func_one", type: "purpose" }],
    }));

    expect(report.items[0]).toMatchObject({ action: "rejected", reason: "missing_pr_citation" });
  });

  test("applies the renamed-head exception to links", async () => {
    const store = openStore("renamed-head-link");
    seedMechanicalSubjects(store);
    const git = createGitFixture("renamed-head-link-git");
    const link = {
      from: { target_stable_key: "unit-one:func_one" },
      to: { entity_locator: "src/unit-one.c" },
      role: "implemented_in", why: "The head code locates the target.",
      kind: "code", locator: git.locator,
    };
    const report = await applyLibrarianPass(store, { links: [link] }, applyOptions(git.root, {
      requiredCitation: { kind: "pr", prNumber: "42" },
      headRevision: git.revision,
      renamedSubjects: ["unit-one:func_one"],
    }));

    expect(report.items[0]).toMatchObject({ action: "applied" });
  });

  test("writes specific repair instructions into rejection messages", () => {
    const malformed = REJECTION_MESSAGES.malformed_locator({ locator: "bad" });
    expect(malformed).toContain("discord://message/<id>");
    expect(malformed).toContain("pr://<n>[/comment/<i>]");
    expect(malformed).toContain("wiki://<section-id>");
    expect(malformed).toContain("attempt://run/<run-id>");
    expect(malformed).toContain("code://<revision>/<path>#L<start>-L<end>");
    expect(REJECTION_MESSAGES.out_of_scope({
      subject: "unit-two:func_two", writableSubjects: ["unit-one:func_one"],
    })).toContain("[unit-one:func_one]");
    expect(REJECTION_MESSAGES.code_revision_unresolvable({
      revision: "report-hash", headRevision: "head-hash",
    })).toContain("head_revision head-hash");
    expect(REJECTION_MESSAGES.code_span_out_of_range({
      locator: "code://head/src/a.c#L1-L9", lineCount: 4,
    })).toContain("4 lines");
    expect(REJECTION_MESSAGES.missing_pr_citation({
      subject: "unit-one:func_one", prNumber: "42",
    })).toContain("pr://42/comment/<i>");
    expect(REJECTION_MESSAGES.irrelevant_pr_citation({
      subject: "unit-one:func_one", prNumber: "42",
    })).toContain("body or diff hunk");
  });

  test("has a fix-it template for every rejection reason", () => {
    const reasons = [
      "ambiguous_entity_locator", "ambiguous_target", "code_revision_unresolvable",
      "code_span_out_of_range", "follow_up_cap", "follow_up_in_scope", "internal_error",
      "invalid_confidence", "invalid_entity_kind", "invalid_fact_type", "invalid_kind", "invalid_op",
      "irrelevant_pr_citation", "kind_locator_mismatch", "malformed_envelope", "malformed_locator",
      "mechanical_merge_rejected", "missing_field", "missing_pr_citation", "out_of_scope",
      "pr_comment_not_found", "pr_comments_unavailable", "submission_not_found", "unknown_envelope_key",
      "unresolved_locator", "unresolved_subject",
    ].sort();
    expect(Object.keys(REJECTION_MESSAGES).sort()).toEqual(reasons);
  });
});
