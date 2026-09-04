import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "bun:test";
import { createCodeFileCache } from "../apply/resolver.js";
import { writeFactWithEvidence } from "../records/index.js";
import { openKnowledgeStore, type KnowledgeStore } from "../storage/store.js";
import { flagCodeDrift } from "./flagger.js";

const tempDirs: string[] = [];
const stores: KnowledgeStore[] = [];

afterEach(() => {
  for (const store of stores.splice(0)) store.close();
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function makeTempDir(name: string): string {
  const dir = mkdtempSync(join(tmpdir(), `knowledge-v2-drift-${name}-`));
  tempDirs.push(dir);
  return dir;
}

function runGit(root: string, ...args: string[]): string {
  const result = Bun.spawnSync(["git", "-C", root, ...args], {
    stdout: "pipe",
    stderr: "pipe",
  });
  if (result.exitCode !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${result.stderr.toString()}`);
  }
  return result.stdout.toString().trim();
}

function digest(span: string): string {
  return `sha256:${createHash("sha256").update(span).digest("hex").slice(0, 16)}`;
}

function gitFixture(): { root: string; v1: string; head: string } {
  const root = makeTempDir("checkout");
  runGit(root, "init");
  runGit(root, "config", "user.email", "drift-test@example.com");
  runGit(root, "config", "user.name", "Drift Test");
  mkdirSync(join(root, "src"), { recursive: true });
  writeFileSync(join(root, "src", "same.c"), "one\ntwo\nthree\n");
  writeFileSync(join(root, "src", "changed.c"), "alpha\nbeta\ngamma\n");
  writeFileSync(join(root, "src", "deleted.c"), "left\nright\n");
  runGit(root, "add", "src");
  runGit(root, "commit", "-m", "v1");
  const v1 = runGit(root, "rev-parse", "HEAD");

  writeFileSync(join(root, "src", "changed.c"), "alpha\nchanged\ngamma\n");
  rmSync(join(root, "src", "deleted.c"));
  runGit(root, "add", "-A");
  runGit(root, "commit", "-m", "v2");
  return { root, v1, head: runGit(root, "rev-parse", "--short", "HEAD") };
}

function storeFixture(): KnowledgeStore {
  const store = openKnowledgeStore({ knowledgeRoot: makeTempDir("store") });
  stores.push(store);
  store.db.query(`INSERT INTO entity
    (id, kind, locator, parent_entity_id, identity_status, merged_into_id)
    VALUES ('entity-1', 'pattern', 'pattern://drift-fixture', NULL, 'active', NULL)`).run();
  return store;
}

describe("flagCodeDrift", () => {
  test("reads one shared file cache entry for two evidence rows on one file", () => {
    const git = gitFixture();
    const store = storeFixture();
    writeFactWithEvidence(store, {
      id: "fact-shared",
      entityId: "entity-1",
      type: "purpose",
      value: "fact-shared",
      rationale: "fixture",
      confidence: 0.8,
    }, ["L2-L2", "L2-L3"].map((line, index) => ({
      id: `evidence-shared-${index}`,
      kind: "code",
      locator: `code://${git.v1}/src/same.c#${line}`,
      digest: digest(line === "L2-L2" ? "two" : "two\nthree"),
      why: "fixture",
    })));

    let showCount = 0;
    const codeFileCache = createCodeFileCache(git.root, {
      spawnSync(command, options) {
        if (command.includes("show")) showCount += 1;
        return Bun.spawnSync(command, options);
      },
    });

    const report = flagCodeDrift(store, {
      subject: { entityId: "entity-1" },
      checkoutRoot: git.root,
      headRevision: git.v1,
      codeFileCache,
    });

    expect(showCount).toBe(1);
    expect(report.evidence.map(({ status }) => status)).toEqual(["unchanged", "unchanged"]);
  });

  test("classifies unchanged, drifted, and unresolvable code evidence at checkout HEAD", () => {
    const git = gitFixture();
    const store = storeFixture();
    const cases = [
      {
        factId: "fact-changed",
        factType: "data_flow" as const,
        evidenceId: "evidence-changed",
        path: "src/changed.c",
        lines: "L2-L2",
        storedSpan: "beta",
      },
      {
        factId: "fact-deleted",
        factType: "state_behavior" as const,
        evidenceId: "evidence-deleted",
        path: "src/deleted.c",
        lines: "L1-L2",
        storedSpan: "left\nright",
      },
      {
        factId: "fact-same",
        factType: "purpose" as const,
        evidenceId: "evidence-same",
        path: "src/same.c",
        lines: "L2-L3",
        storedSpan: "two\nthree",
      },
    ];
    for (const row of cases) {
      writeFactWithEvidence(store, {
        id: row.factId,
        entityId: "entity-1",
        type: row.factType,
        value: row.factId,
        rationale: "fixture",
        confidence: 0.8,
      }, [{
        id: row.evidenceId,
        kind: "code",
        locator: `code://${git.v1}/${row.path}#${row.lines}`,
        digest: digest(row.storedSpan),
        why: "fixture",
      }]);
    }

    const report = flagCodeDrift(store, {
      subject: { entityId: "entity-1" },
      checkoutRoot: git.root,
    });

    expect(report).toEqual({
      subject: { entityId: "entity-1" },
      head_revision: git.head,
      evidence: [
        {
          fact_id: "fact-changed",
          fact_type: "data_flow",
          evidence_id: "evidence-changed",
          locator: `code://${git.v1}/src/changed.c#L2-L2`,
          status: "drifted",
          head_digest: digest("changed"),
          head_locator: `code://${git.head}/src/changed.c#L2-L2`,
        },
        {
          fact_id: "fact-deleted",
          fact_type: "state_behavior",
          evidence_id: "evidence-deleted",
          locator: `code://${git.v1}/src/deleted.c#L1-L2`,
          status: "unresolvable",
          head_locator: `code://${git.head}/src/deleted.c#L1-L2`,
        },
        {
          fact_id: "fact-same",
          fact_type: "purpose",
          evidence_id: "evidence-same",
          locator: `code://${git.v1}/src/same.c#L2-L3`,
          status: "unchanged",
          head_digest: digest("two\nthree"),
          head_locator: `code://${git.head}/src/same.c#L2-L3`,
        },
      ],
      drifted_count: 1,
      unresolvable_count: 1,
    });
  });
});
