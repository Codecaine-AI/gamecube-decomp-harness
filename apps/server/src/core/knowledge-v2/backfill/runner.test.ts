import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, test } from "bun:test";

import type { GlobalArgs } from "@server/core/game-registry/runtime-options.js";
import { createSharedGate } from "../apply/index.js";
import { prioritizeTargets, type PrioritizedTargetRow } from "../migration/prioritize.js";
import { openKnowledgeStore, type KnowledgeStore } from "../storage/store.js";
import {
  runBackfill,
  runPass,
  type BackfillPassArtifact,
  type BackfillRunOptions,
  type LibrarianPassEnvelope,
} from "./runner.js";

const FIXED_NOW = "2026-08-31T12:00:00.000Z";
const fixtures: Array<{ root: string; store: KnowledgeStore }> = [];

type FakeRunPiAgent = NonNullable<BackfillRunOptions["runPiAgent"]>;
type CountedTable = "entity" | "fact" | "evidence" | "link" | "subject_index_state";

interface RunnerFixture {
  root: string;
  stateDir: string;
  store: KnowledgeStore;
  globals: GlobalArgs;
}

function fixture(name: string, targetCount: number): RunnerFixture {
  const root = mkdtempSync(join(tmpdir(), `knowledge-v2-backfill-${name}-`));
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
    const stableKey = `unit:func_${index}`;
    const attemptId = `attempt-${index}`;
    insertTarget.run(
      targetId,
      `func_${index}`,
      stableKey,
      `0x${(0x80000000 + index * 0x10).toString(16)}`,
    );
    insertStatus.run(targetId, 100 - index, `sha256:target-${index}`);
    insertPr.run(
      `pr-${index}`,
      targetId,
      `melee#${100 + index}`,
      `Fixture pull request ${index}`,
      `2026-08-${String(20 + index).padStart(2, "0")}T00:00:00.000Z`,
    );
    insertRun.run(attemptId, targetId, `operator-${index}`);
    insertSubmission.run(`submission-${index}`, attemptId);
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

function requestedTargetId(options: Parameters<FakeRunPiAgent>[0]): string {
  const targetId = options.kernelContext?.metadata?.targetId;
  if (typeof targetId !== "string") throw new Error("fake agent call has no target id");
  return targetId;
}

function targetNumber(targetId: string): number {
  const value = Number(targetId.replace("target-", ""));
  if (!Number.isSafeInteger(value) || value < 1) throw new Error(`invalid fixture target id: ${targetId}`);
  return value;
}

function targetRow(store: KnowledgeStore, targetId: string): PrioritizedTargetRow {
  const row = prioritizeTargets(store, undefined, { includeZeroMaterial: false }).rows
    .find((candidate) => candidate.target_id === targetId);
  if (row === undefined) throw new Error(`prioritized fixture target not found: ${targetId}`);
  return row;
}

function fact(targetIndex: number, stableKey = `unit:func_${targetIndex}`): Record<string, unknown> {
  return {
    subject: { target_stable_key: stableKey },
    type: "purpose",
    op: "write",
    value: `Backfilled purpose for target ${targetIndex}`,
    rationale: "The fixture PR and attempt both describe this target.",
    confidence: 0.9,
    evidence: [
      { kind: "pr", locator: `pr://pr-${targetIndex}`, why: "The merged PR records the target change." },
      {
        kind: "attempt",
        locator: `attempt://run/attempt-${targetIndex}/submission/1`,
        why: "The worker submission records the attempted implementation.",
      },
    ],
  };
}

function proposal(
  targetIndex: number,
  additions: Partial<Pick<LibrarianPassEnvelope, "facts" | "links" | "entities" | "merges">> = {},
): LibrarianPassEnvelope {
  return {
    facts: additions.facts ?? [fact(targetIndex)],
    links: additions.links ?? [],
    entities: additions.entities ?? [],
    merges: additions.merges ?? [],
  };
}

function fakeProposalAgent(
  additions?: (targetIndex: number) => Partial<Pick<
    LibrarianPassEnvelope,
    "facts" | "links" | "entities" | "merges"
  >>,
): FakeRunPiAgent {
  return (options) => {
    const index = targetNumber(requestedTargetId(options));
    return modelResult(proposal(index, additions?.(index)));
  };
}

function rowCount(store: KnowledgeStore, table: CountedTable): number {
  return store.db.query<{ count: number }, []>(`SELECT COUNT(*) AS count FROM ${table}`).get()!.count;
}

function indexedAt(store: KnowledgeStore, targetId: string): string | null {
  return store.db.query<{ indexed_at: string }, [string]>(
    "SELECT indexed_at FROM subject_index_state WHERE target_id = ?",
  ).get(targetId)?.indexed_at ?? null;
}

function logEntries(f: RunnerFixture, runId: string): Array<Record<string, unknown>> {
  const path = join(f.stateDir, "knowledge_v2", "backfill", runId, "run-log.jsonl");
  return readFileSync(path, "utf8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

afterEach(() => {
  for (const item of fixtures.splice(0)) {
    item.store.close();
    rmSync(item.root, { recursive: true, force: true });
  }
});

describe("runPass happy path", () => {
  test("applies a cited fact, stamps the target, and writes the full artifact", async () => {
    const f = fixture("happy", 1);
    const passProposal = proposal(1);
    let clock = 0;

    const result = await runPass(f.store, targetRow(f.store, "target-1"), {
      runId: "happy-run",
      globals: f.globals,
      sharedWriteGate: createSharedGate(),
      runPiAgent: () => modelResult(passProposal),
      now: () => FIXED_NOW,
      clockMs: () => clock++,
    });

    expect(result.applyReport.counts).toEqual({ applied: 1, rejected: 0, skipped: 0 });
    expect(f.store.db.query(`SELECT target_id, type, value FROM fact`).get()).toEqual({
      target_id: "target-1",
      type: "purpose",
      value: "Backfilled purpose for target 1",
    });
    expect(rowCount(f.store, "evidence")).toBe(2);
    expect(indexedAt(f.store, "target-1")).toBe(FIXED_NOW);

    const artifactText = readFileSync(result.artifactPath, "utf8");
    const artifact = JSON.parse(artifactText) as BackfillPassArtifact;
    expect(artifactText.endsWith("\n")).toBeTrue();
    expect(artifact).toEqual({
      run_id: "happy-run",
      target: {
        id: "target-1",
        kind: "function",
        unit: "unit",
        unit_entity_id: "unit-main",
        symbol: "func_1",
        stable_key: "unit:func_1",
        address: "0x80000010",
        identity_status: "current",
        report_revision: "fixture-rev",
        target_status: {
          target_id: "target-1",
          match_pct: 99,
          linked: true,
          size: 64,
          content_hash: "sha256:target-1",
          report_revision: "fixture-rev",
          updated_at: "2026-08-30T00:00:00.000Z",
        },
        match_pct: 99,
        moved_to_id: null,
        linked: true,
        named_symbol: true,
        unit_named_ratio: 1,
      },
      context: result.context,
      proposal: passProposal,
      apply_report: {
        startedAt: FIXED_NOW,
        dryRun: false,
        items: [{ index: 0, itemKind: "fact", item: fact(1), action: "applied" }],
        counts: { applied: 1, rejected: 0, skipped: 0 },
      },
      timings: {
        startedAt: FIXED_NOW,
        endedAt: FIXED_NOW,
        contextMs: 1,
        modelMs: 1,
        applyMs: 1,
        wallMs: 7,
      },
      model: "fixture-model",
      dry_run: false,
    });
    expect(result.artifactPath).toBe(join(
      f.stateDir,
      "knowledge_v2",
      "backfill",
      "happy-run",
      "unit-func-1.json",
    ));
  });

  test("truncates long artifact context strings without changing the returned context", async () => {
    const f = fixture("context-truncation", 1);
    const longSummary = "x".repeat(20_001);
    f.store.db.query("UPDATE pull_request SET summary = ? WHERE id = 'pr-1'").run(longSummary);

    const result = await runPass(f.store, targetRow(f.store, "target-1"), {
      runId: "context-truncation-run",
      globals: f.globals,
      sharedWriteGate: createSharedGate(),
      runPiAgent: () => modelResult(proposal(1)),
      now: () => FIXED_NOW,
    });

    const artifact = JSON.parse(readFileSync(result.artifactPath, "utf8")) as BackfillPassArtifact;
    expect(artifact.context.target).toEqual(result.context.target);
    expect(artifact.context.scope).toEqual({
      targetStableKeys: ["unit:func_1"],
      entityLocators: ["src/main.c"],
    });
    expect(artifact.context.linkedEntities).toEqual([
      expect.objectContaining({ id: "unit-main", locator: "src/main.c" }),
    ]);
    const artifactSubmission = artifact.context.ledger.find((entry) => entry.type === "submission");
    const artifactPr = artifact.context.ledger.find((entry) => entry.type === "pull_request");
    const resultPr = result.context.ledger.find((entry) => entry.type === "pull_request");
    expect(artifactSubmission?.description).toBe("Fixture attempt");
    expect(artifactPr?.summary).toBe(
      `${"x".repeat(20_000)}[truncated, original 20001 chars]`,
    );
    expect(resultPr?.summary).toBe(longSummary);
  });
});

describe("runPass scope isolation", () => {
  test("rejects an outside target while applying the in-scope fact", async () => {
    const f = fixture("scope", 2);
    const scopedProposal = proposal(1, { facts: [fact(2), fact(1)] });

    const result = await runPass(f.store, targetRow(f.store, "target-1"), {
      runId: "scope-run",
      globals: f.globals,
      sharedWriteGate: createSharedGate(),
      runPiAgent: () => modelResult(scopedProposal),
      now: () => FIXED_NOW,
    });

    expect(result.applyReport.items.map(({ action, reason }) => ({ action, reason }))).toEqual([
      { action: "rejected", reason: "out_of_scope" },
      { action: "applied", reason: undefined },
    ]);
    expect(result.applyReport.counts).toEqual({ applied: 1, rejected: 1, skipped: 0 });
    expect(f.store.db.query("SELECT target_id FROM fact").all()).toEqual([{ target_id: "target-1" }]);
    expect(indexedAt(f.store, "target-1")).toBe(FIXED_NOW);
    expect(indexedAt(f.store, "target-2")).toBeNull();
  });
});

describe("runBackfill sharding", () => {
  test("splits one ordered target list into disjoint shards", async () => {
    const f = fixture("shards", 7);
    const eligibleTargetIds = prioritizeTargets(f.store, undefined, {
      includeZeroMaterial: true,
    }).rows.map((target) => target.target_id);
    const claimsByShard: [string[], string[]] = [[], []];
    const summaries = [];

    for (const shardIndex of [0, 1] as const) {
      summaries.push(await runBackfill(f.store, {
        runId: `shard-${shardIndex}-run`,
        globals: f.globals,
        concurrency: 2,
        dryRun: true,
        shard: { index: shardIndex, count: 2 },
        runPiAgent: (options) => {
          claimsByShard[shardIndex].push(requestedTargetId(options));
          return modelResult({ facts: [], links: [], entities: [], merges: [] });
        },
        now: () => FIXED_NOW,
      }));
    }

    expect(claimsByShard[0]).toEqual(eligibleTargetIds.filter((_, index) => index % 2 === 0));
    expect(claimsByShard[1]).toEqual(eligibleTargetIds.filter((_, index) => index % 2 === 1));
    expect(claimsByShard[0].filter((targetId) => claimsByShard[1].includes(targetId))).toEqual([]);
    expect(new Set([...claimsByShard[0], ...claimsByShard[1]])).toEqual(new Set(eligibleTargetIds));
    expect(summaries.map((summary) => summary.shard)).toEqual([
      { index: 0, count: 2 },
      { index: 1, count: 2 },
    ]);
  });

  test("rejects invalid shard indexes and counts", async () => {
    const f = fixture("invalid-shards", 1);
    const invalidShards = [
      { shard: { index: -1, count: 2 }, error: "shard index must be a non-negative integer" },
      { shard: { index: 0.5, count: 2 }, error: "shard index must be a non-negative integer" },
      { shard: { index: 0, count: 0 }, error: "shard count must be a positive integer" },
      { shard: { index: 0, count: 1.5 }, error: "shard count must be a positive integer" },
      { shard: { index: 2, count: 2 }, error: "shard index must be less than shard count" },
    ];

    for (const { shard, error } of invalidShards) {
      await expect(runBackfill(f.store, {
        runId: "invalid-shard-run",
        globals: f.globals,
        shard,
        runPiAgent: fakeProposalAgent(),
      })).rejects.toThrow(error);
    }
  });
});

describe("runBackfill parallel pool", () => {
  test("runs zero-direct-material targets last unless minDirectScore excludes them", async () => {
    const runFixture = fixture("zero-direct", 3);
    runFixture.store.db.query("DELETE FROM submission WHERE worker_run_id = 'attempt-3'").run();
    runFixture.store.db.query("DELETE FROM worker_run WHERE target_id = 'target-3'").run();
    runFixture.store.db.query("DELETE FROM pull_request WHERE target_id = 'target-3'").run();
    const claimed: string[] = [];

    const summary = await runBackfill(runFixture.store, {
      runId: "zero-direct-run",
      globals: runFixture.globals,
      concurrency: 1,
      runPiAgent: (options) => {
        claimed.push(requestedTargetId(options));
        return modelResult({ facts: [], links: [], entities: [], merges: [] });
      },
      now: () => FIXED_NOW,
    });

    expect(claimed).toEqual(["target-1", "target-2", "target-3"]);
    expect(summary.passesRun).toBe(3);
    expect(indexedAt(runFixture.store, "target-3")).toBe(FIXED_NOW);

    const filteredFixture = fixture("zero-direct-filtered", 3);
    filteredFixture.store.db.query("DELETE FROM submission WHERE worker_run_id = 'attempt-3'").run();
    filteredFixture.store.db.query("DELETE FROM worker_run WHERE target_id = 'target-3'").run();
    filteredFixture.store.db.query("DELETE FROM pull_request WHERE target_id = 'target-3'").run();
    const filteredClaims: string[] = [];

    const filteredSummary = await runBackfill(filteredFixture.store, {
      runId: "zero-direct-filtered-run",
      globals: filteredFixture.globals,
      concurrency: 1,
      minDirectScore: 1,
      runPiAgent: (options) => {
        filteredClaims.push(requestedTargetId(options));
        return modelResult({ facts: [], links: [], entities: [], merges: [] });
      },
      now: () => FIXED_NOW,
    });

    expect(filteredClaims).toEqual(["target-1", "target-2"]);
    expect(filteredSummary.passesRun).toBe(2);
    expect(indexedAt(filteredFixture.store, "target-3")).toBeNull();
  });

  test("runs six targets in two lanes and admits one shared curated entity", async () => {
    const f = fixture("parallel", 6);
    const delays = [35, 5, 25, 10, 20, 1];
    let active = 0;
    let maxActive = 0;
    const fakeAgent: FakeRunPiAgent = async (options) => {
      const index = targetNumber(requestedTargetId(options));
      active += 1;
      maxActive = Math.max(maxActive, active);
      await Bun.sleep(delays[index - 1]!);
      active -= 1;
      return modelResult(proposal(index, {
        entities: [{
          kind: "pattern",
          locator: "pattern://shared-backfill-admission",
          note: "All lanes found the same reusable pattern.",
        }],
      }));
    };

    const summary = await runBackfill(f.store, {
      runId: "parallel-run",
      globals: f.globals,
      concurrency: 2,
      runPiAgent: fakeAgent,
      now: () => FIXED_NOW,
    });

    expect(maxActive).toBe(2);
    expect(summary).toMatchObject({
      passesRun: 6,
      passesApplied: 6,
      itemsApplied: 7,
      itemsRejected: 0,
      itemsSkipped: 5,
      passesFailed: 0,
      targetsSkipped: 0,
      aborted: false,
      stopped: false,
    });
    expect(rowCount(f.store, "subject_index_state")).toBe(6);
    expect(rowCount(f.store, "fact")).toBe(6);
    expect(f.store.db.query<{ count: number }, []>(`SELECT COUNT(*) AS count FROM entity
      WHERE kind = 'pattern' AND locator = 'pattern://shared-backfill-admission'`).get()!.count).toBe(1);
    expect(logEntries(f, "parallel-run")).toHaveLength(6);
  });
});

describe("runBackfill stop file", () => {
  test("finishes both in-flight lanes and claims no target after the stop appears", async () => {
    const f = fixture("stop", 5);
    const stopFile = join(f.root, "operator.stop");
    let calls = 0;
    const fakeAgent: FakeRunPiAgent = async (options) => {
      calls += 1;
      const index = targetNumber(requestedTargetId(options));
      if (calls === 1) {
        await Bun.sleep(5);
        writeFileSync(stopFile, "stop\n");
      } else {
        await Bun.sleep(30);
      }
      return modelResult(proposal(index));
    };

    const summary = await runBackfill(f.store, {
      runId: "stop-run",
      globals: f.globals,
      concurrency: 2,
      stopFile,
      runPiAgent: fakeAgent,
      now: () => FIXED_NOW,
    });

    expect(calls).toBe(2);
    expect(summary).toMatchObject({
      passesRun: 2,
      passesApplied: 2,
      passesFailed: 0,
      aborted: false,
      stopped: true,
    });
    expect(rowCount(f.store, "subject_index_state")).toBe(2);
    expect(logEntries(f, "stop-run")).toHaveLength(2);
  });
});

describe("runBackfill failure handling", () => {
  test("aborts after the configured consecutive failure threshold and stops claiming", async () => {
    const f = fixture("failure-configured-abort", 5);
    let calls = 0;
    const fakeAgent: FakeRunPiAgent = (options) => {
      calls += 1;
      if (calls <= 3) return Promise.reject(new Error(`fixture failure ${calls}`));
      return modelResult(proposal(targetNumber(requestedTargetId(options))));
    };

    const summary = await runBackfill(f.store, {
      runId: "failure-configured-abort-run",
      globals: f.globals,
      concurrency: 1,
      maxConsecutiveFailures: 2,
      runPiAgent: fakeAgent,
      now: () => FIXED_NOW,
    });

    expect(calls).toBe(3);
    expect(summary).toMatchObject({
      passesRun: 3,
      passesApplied: 0,
      passesFailed: 3,
      targetsSkipped: 2,
      aborted: true,
    });
    expect(indexedAt(f.store, "target-4")).toBeNull();
  });

  test("continues when failures stay within the configured threshold", async () => {
    const f = fixture("failure-configured-continue", 4);
    let calls = 0;
    const fakeAgent: FakeRunPiAgent = (options) => {
      calls += 1;
      if (calls <= 3) return Promise.reject(new Error(`fixture failure ${calls}`));
      return modelResult(proposal(targetNumber(requestedTargetId(options))));
    };

    const summary = await runBackfill(f.store, {
      runId: "failure-configured-continue-run",
      globals: f.globals,
      concurrency: 1,
      maxConsecutiveFailures: 10,
      runPiAgent: fakeAgent,
      now: () => FIXED_NOW,
    });

    expect(calls).toBe(4);
    expect(summary).toMatchObject({
      passesRun: 4,
      passesApplied: 1,
      passesFailed: 3,
      aborted: false,
    });
    expect(indexedAt(f.store, "target-4")).toBe(FIXED_NOW);
  });

  test("rejects invalid consecutive failure thresholds", async () => {
    const f = fixture("failure-invalid-threshold", 1);

    for (const maxConsecutiveFailures of [0, -1, 1.5]) {
      await expect(runBackfill(f.store, {
        runId: "failure-invalid-threshold-run",
        globals: f.globals,
        maxConsecutiveFailures,
        runPiAgent: fakeProposalAgent(),
      })).rejects.toThrow("maxConsecutiveFailures must be a positive integer");
    }
  });

  test("logs one model failure without stamping it, then continues", async () => {
    const f = fixture("failure-continue", 2);
    const fakeAgent: FakeRunPiAgent = (options) => {
      const index = targetNumber(requestedTargetId(options));
      if (index === 1) return Promise.reject(new Error("fixture model offline"));
      return modelResult(proposal(index));
    };

    const summary = await runBackfill(f.store, {
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
      aborted: false,
      stopped: false,
    });
    expect(indexedAt(f.store, "target-1")).toBeNull();
    expect(indexedAt(f.store, "target-2")).toBe(FIXED_NOW);
    expect(logEntries(f, "failure-continue-run")).toEqual([
      expect.objectContaining({
        target_id: "target-1",
        status: "failed",
        error: "fixture model offline",
      }),
      expect.objectContaining({
        target_id: "target-2",
        status: "completed",
      }),
    ]);
  });

  test("aborts after six consecutive failures", async () => {
    const f = fixture("failure-abort", 8);
    let calls = 0;
    const fakeAgent: FakeRunPiAgent = async () => {
      calls += 1;
      throw new Error(`fixture failure ${calls}`);
    };

    const summary = await runBackfill(f.store, {
      runId: "failure-abort-run",
      globals: f.globals,
      concurrency: 1,
      runPiAgent: fakeAgent,
      now: () => FIXED_NOW,
    });

    expect(calls).toBe(6);
    expect(summary).toMatchObject({
      passesRun: 6,
      passesApplied: 0,
      passesFailed: 6,
      targetsSkipped: 2,
      aborted: true,
      stopped: false,
    });
    expect(rowCount(f.store, "subject_index_state")).toBe(0);
    expect(logEntries(f, "failure-abort-run")).toHaveLength(6);
  });

  test("rejects a malformed envelope without applying or stamping", async () => {
    const f = fixture("malformed", 1);

    await expect(runPass(f.store, targetRow(f.store, "target-1"), {
      runId: "malformed-run",
      globals: f.globals,
      sharedWriteGate: createSharedGate(),
      runPiAgent: () => modelResult({ facts: "not-an-array", links: [], entities: [], merges: [] }),
      now: () => FIXED_NOW,
    })).rejects.toThrow("malformed librarian_pass_v1 envelope");

    expect(rowCount(f.store, "fact")).toBe(0);
    expect(rowCount(f.store, "subject_index_state")).toBe(0);
    expect(existsSync(join(
      f.stateDir,
      "knowledge_v2",
      "backfill",
      "malformed-run",
      "unit-func-1.json",
    ))).toBeFalse();
    expect(logEntries(f, "malformed-run")[0]).toMatchObject({
      target_id: "target-1",
      status: "failed",
      error: "backfill librarian returned a malformed librarian_pass_v1 envelope",
    });
  });
});

describe("runBackfill dry run", () => {
  test("writes only the dry-run artifact and run log", async () => {
    const f = fixture("dry-run", 1);
    const tables: CountedTable[] = ["entity", "fact", "evidence", "link", "subject_index_state"];
    const before = Object.fromEntries(tables.map((table) => [table, rowCount(f.store, table)]));
    const fakeAgent = fakeProposalAgent((index) => ({
      facts: [fact(index)],
      links: [{
        from: { target_stable_key: `unit:func_${index}` },
        to: { entity_locator: "src/main.c" },
        role: "implemented_in",
        why: "The target belongs to this translation unit.",
        kind: "pr",
        locator: `pr://pr-${index}`,
      }],
      entities: [{
        kind: "game_concept",
        locator: "concept://dry-run-only",
        note: "This admission must remain virtual during a dry run.",
      }],
    }));

    const summary = await runBackfill(f.store, {
      runId: "dry-run",
      globals: f.globals,
      concurrency: 1,
      dryRun: true,
      runPiAgent: fakeAgent,
      now: () => FIXED_NOW,
    });

    const after = Object.fromEntries(tables.map((table) => [table, rowCount(f.store, table)]));
    expect(after).toEqual(before);
    expect(summary).toMatchObject({
      dryRun: true,
      passesRun: 1,
      passesApplied: 1,
      itemsApplied: 3,
      passesFailed: 0,
    });
    expect(indexedAt(f.store, "target-1")).toBeNull();

    const artifactPath = join(
      f.stateDir,
      "knowledge_v2",
      "backfill",
      "dry-run",
      "unit-func-1.json",
    );
    expect(existsSync(artifactPath)).toBeTrue();
    expect(JSON.parse(readFileSync(artifactPath, "utf8"))).toMatchObject({
      run_id: "dry-run",
      dry_run: true,
      apply_report: {
        dryRun: true,
        counts: { applied: 3, rejected: 0, skipped: 0 },
      },
    });
  });
});
