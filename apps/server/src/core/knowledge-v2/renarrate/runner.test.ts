import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, test } from "bun:test";

import type { GlobalArgs } from "@server/core/game-registry/runtime-options.js";
import type { LibrarianWorkerCondenseInput } from "@server/core/knowledge/jobs/librarian.js";
import { openState, type StateStore } from "@server/core/orchestrator-state";
import { openKnowledgeStore, type KnowledgeStore } from "../storage/store.js";
import { runRenarrate, selectRenarratePopulation, type RenarrateRunOptions } from "./runner.js";

const roots: Array<{ root: string; knowledge: KnowledgeStore; orchestrator: StateStore }> = [];

function fixture(): {
  root: string;
  stateDir: string;
  knowledge: KnowledgeStore;
  orchestrator: StateStore;
  globals: GlobalArgs;
} {
  const root = mkdtempSync(join(tmpdir(), "kg2-renarrate-"));
  const stateDir = join(root, "state");
  const knowledge = openKnowledgeStore({ knowledgeRoot: join(root, "knowledge") });
  const orchestrator = openState(stateDir);
  roots.push({ root, knowledge, orchestrator });
  knowledge.db.query(`INSERT INTO entity
    (id, kind, locator, parent_entity_id, identity_status, merged_into_id)
    VALUES ('unit', 'translation_unit', 'src/unit.c', NULL, 'active', NULL)`).run();
  knowledge.db.query(`INSERT INTO target
    (id, kind, unit, unit_entity_id, symbol, stable_key, address, identity_status, report_revision)
    VALUES ('target', 'function', 'unit', 'unit', 'func', 'unit:func', '0x80000000', 'current', 'rev')`).run();
  return {
    root,
    stateDir,
    knowledge,
    orchestrator,
    globals: {
      repoRoot: root,
      stateDir,
      gameId: "melee",
      dryRunAgents: false,
      provider: "fixture",
      model: "fixture",
      thinkingLevel: "medium",
    },
  };
}

function insertRun(store: KnowledgeStore, id: string, outcome: string, closedAt: string): void {
  store.db.query(`INSERT INTO worker_run
    (id, target_id, goal, baseline, run_id, worker_state_id, final_outcome, error_type,
      integration, started_at, ended_at, closed_at)
    VALUES (?, 'target', 'goal', '{}', ?, ?, ?, ?, NULL, ?, ?, ?)`)
    .run(
      id,
      `source-${id}`,
      `state-${id}`,
      outcome,
      outcome === "error" ? "worker_crash" : null,
      closedAt,
      closedAt,
      closedAt,
    );
  store.db.query(`INSERT INTO submission
    (id, worker_run_id, seq, description, hypothesis, score, submitted_at, runtime_ref)
    VALUES (?, ?, 1, 'old description', NULL, 50, ?, NULL)`).run(`submission-${id}`, id, closedAt);
}

function insertSubmission(store: KnowledgeStore, runId: string, id: string, seq: number): void {
  store.db.query(`INSERT INTO submission
    (id, worker_run_id, seq, description, hypothesis, score, submitted_at, runtime_ref)
    VALUES (?, ?, ?, 'old description', NULL, 50, '2026-01-01T00:00:00.000Z', NULL)`)
    .run(id, runId, seq);
}

function modelResult(value: unknown): ReturnType<NonNullable<RenarrateRunOptions["runPiAgent"]>> {
  return Promise.resolve({
    sessionId: "session",
    sessionDir: "/tmp/session",
    outputPath: "/tmp/output",
    systemPromptPath: "/tmp/system",
    userPromptPath: "/tmp/user",
    rawText: JSON.stringify(value),
    dryRun: false,
    failed: false,
  });
}

function input(transcriptPath: string): LibrarianWorkerCondenseInput {
  return {
    worker_state: {} as LibrarianWorkerCondenseInput["worker_state"],
    checkpoints: [],
    attempt: {} as LibrarianWorkerCondenseInput["attempt"],
    transcripts: [{ kind: "transcript_span", session_id: "session", path: transcriptPath, exists: true }],
  };
}

afterEach(() => {
  for (const item of roots.splice(0)) {
    item.knowledge.close();
    item.orchestrator.db.close();
    rmSync(item.root, { recursive: true, force: true });
  }
});

describe("renarrate population", () => {
  test("orders funnel-first and then by closed time", () => {
    const f = fixture();
    insertRun(f.knowledge, "error", "error", "2026-01-01T00:00:00.000Z");
    insertRun(f.knowledge, "improvement-late", "improvement", "2026-01-03T00:00:00.000Z");
    insertRun(f.knowledge, "match", "match", "2026-01-04T00:00:00.000Z");
    insertRun(f.knowledge, "improvement-early", "improvement", "2026-01-02T00:00:00.000Z");
    insertRun(f.knowledge, "no-change", "no_change", "2026-01-01T00:00:00.000Z");

    expect(selectRenarratePopulation(f.knowledge).map((row) => row.id)).toEqual([
      "match", "improvement-early", "improvement-late", "no-change", "error",
    ]);
  });
});

describe("renarrate dry run", () => {
  test("runs the model and writes artifacts without database writes", async () => {
    const f = fixture();
    insertRun(f.knowledge, "run", "improvement", "2026-01-01T00:00:00.000Z");
    insertSubmission(f.knowledge, "run", "submission-run-2", 2);
    const transcriptPath = join(f.root, "transcript.jsonl");
    writeFileSync(transcriptPath, "worker transcript", "utf8");
    const narrative = {
      run: { summary: "run summary" },
      submissions: [
        {
          submission_id: "submission-run-2",
          approach: "Second approach.",
          outcome_reasoning: "Second result.",
        },
        {
          submission_id: "submission-run",
          approach: "Tried approach.",
          outcome_reasoning: "It improved.",
        },
      ],
      notable_observations: [{ observation: "Useful detail", reusable_when: "Similar functions" }],
    };

    const summary = await runRenarrate(f.knowledge, {
      runId: "dry-run",
      globals: f.globals,
      orchestratorStore: f.orchestrator,
      dryRun: true,
      loadCondenseInput: () => input(transcriptPath),
      runPiAgent: () => modelResult(narrative),
    });

    expect(summary.completed).toBe(1);
    expect(f.knowledge.db.query("SELECT * FROM run_narrative").all()).toEqual([]);
    expect(f.knowledge.db.query<{ hypothesis: string | null; description: string }, []>(
      "SELECT hypothesis, description FROM submission ORDER BY seq",
    ).all()).toEqual([
      { hypothesis: null, description: "old description" },
      { hypothesis: null, description: "old description" },
    ]);
    const artifact = await Bun.file(join(f.stateDir, "knowledge_v2", "renarrate", "dry-run", "run.json")).json();
    expect(artifact.narrative).toEqual(narrative);
    expect(artifact.would_update).toEqual([{
      id: "submission-run",
      seq: 1,
      description: "Tried approach. It improved.",
    }, {
      id: "submission-run-2",
      seq: 2,
      description: "Second approach. Second result.",
    }]);
  });

  test("rejects a narrative submission without submission_id", async () => {
    const f = fixture();
    insertRun(f.knowledge, "run", "improvement", "2026-01-01T00:00:00.000Z");
    const transcriptPath = join(f.root, "transcript.jsonl");
    writeFileSync(transcriptPath, "worker transcript", "utf8");

    const summary = await runRenarrate(f.knowledge, {
      runId: "missing-id",
      globals: f.globals,
      orchestratorStore: f.orchestrator,
      dryRun: true,
      loadCondenseInput: () => input(transcriptPath),
      runPiAgent: () => modelResult({
        run: { summary: "run summary" },
        submissions: [{ approach: "Approach.", outcome_reasoning: "Result." }],
        notable_observations: [],
      }),
    });

    expect(summary.skipReasons.model_failure).toBe(1);
    const artifact = await Bun.file(join(f.stateDir, "knowledge_v2", "renarrate", "missing-id", "run.json")).json();
    expect(artifact.error).toContain("invalid submission narrative");
  });

  test("skips an unknown submission id and continues the lane", async () => {
    const f = fixture();
    insertRun(f.knowledge, "a-bad", "improvement", "2026-01-01T00:00:00.000Z");
    insertRun(f.knowledge, "b-good", "improvement", "2026-01-02T00:00:00.000Z");
    const transcriptPath = join(f.root, "transcript.jsonl");
    writeFileSync(transcriptPath, "worker transcript", "utf8");
    let calls = 0;

    const summary = await runRenarrate(f.knowledge, {
      runId: "unknown-id",
      globals: f.globals,
      orchestratorStore: f.orchestrator,
      dryRun: true,
      concurrency: 1,
      loadCondenseInput: () => input(transcriptPath),
      runPiAgent: () => {
        calls += 1;
        const submissionId = calls <= 2 ? "unknown" : "submission-b-good";
        return modelResult({
          run: { summary: "run summary" },
          submissions: [{ submission_id: submissionId, approach: "One.", outcome_reasoning: "Result." }],
          notable_observations: [],
        });
      },
    });

    expect(summary).toMatchObject({ completed: 1, skipped: 1 });
    expect(summary.skipReasons.model_failure).toBe(1);
    const artifact = await Bun.file(join(f.stateDir, "knowledge_v2", "renarrate", "unknown-id", "a-bad.json")).json();
    expect(artifact).toMatchObject({ status: "skipped", skip_reason: "model_failure", attempts: 2 });
    expect(artifact.error).toContain("unknown submission_id: unknown");
  });

  test("retries a validation failure and completes on the second response", async () => {
    const f = fixture();
    insertRun(f.knowledge, "run", "improvement", "2026-01-01T00:00:00.000Z");
    const transcriptPath = join(f.root, "transcript.jsonl");
    writeFileSync(transcriptPath, "worker transcript", "utf8");
    let calls = 0;

    const summary = await runRenarrate(f.knowledge, {
      runId: "retry-success",
      globals: f.globals,
      orchestratorStore: f.orchestrator,
      dryRun: true,
      loadCondenseInput: () => input(transcriptPath),
      runPiAgent: () => {
        calls += 1;
        return modelResult({
          run: { summary: "run summary" },
          submissions: [{
            submission_id: calls === 1 ? "mangled" : "submission-run",
            approach: "One.",
            outcome_reasoning: "Result.",
          }],
          notable_observations: [],
        });
      },
    });

    expect(summary.completed).toBe(1);
    const artifact = await Bun.file(join(f.stateDir, "knowledge_v2", "renarrate", "retry-success", "run.json")).json();
    expect(artifact).toMatchObject({ status: "completed", attempts: 2 });
  });

  test("records both validation errors when the retry fails", async () => {
    const f = fixture();
    insertRun(f.knowledge, "run", "improvement", "2026-01-01T00:00:00.000Z");
    const transcriptPath = join(f.root, "transcript.jsonl");
    writeFileSync(transcriptPath, "worker transcript", "utf8");
    let calls = 0;

    const summary = await runRenarrate(f.knowledge, {
      runId: "retry-fail",
      globals: f.globals,
      orchestratorStore: f.orchestrator,
      dryRun: true,
      loadCondenseInput: () => input(transcriptPath),
      runPiAgent: () => {
        calls += 1;
        return modelResult({
          run: { summary: "run summary" },
          submissions: [{ submission_id: `unknown-${calls}`, approach: "One.", outcome_reasoning: "Result." }],
          notable_observations: [],
        });
      },
    });

    expect(summary.skipReasons.model_failure).toBe(1);
    const artifact = await Bun.file(join(f.stateDir, "knowledge_v2", "renarrate", "retry-fail", "run.json")).json();
    expect(artifact).toMatchObject({ status: "skipped", skip_reason: "model_failure", attempts: 2 });
    expect(artifact.error).toContain("unknown submission_id: unknown-1");
    expect(artifact.error).toContain("unknown submission_id: unknown-2");
  });

  test("writes summary.json when a pass throws unexpectedly", async () => {
    const f = fixture();
    insertRun(f.knowledge, "run", "improvement", "2026-01-01T00:00:00.000Z");
    const transcriptPath = join(f.root, "transcript.jsonl");
    writeFileSync(transcriptPath, "worker transcript", "utf8");
    f.knowledge.db.query(`CREATE TRIGGER reject_submission_update BEFORE UPDATE ON submission
      BEGIN SELECT RAISE(ABORT, 'unexpected write failure'); END`).run();

    const summary = await runRenarrate(f.knowledge, {
      runId: "unexpected-pass-failure",
      globals: f.globals,
      orchestratorStore: f.orchestrator,
      loadCondenseInput: () => input(transcriptPath),
      runPiAgent: () => modelResult({
        run: { summary: "run summary" },
        submissions: [{ submission_id: "submission-run", approach: "One.", outcome_reasoning: "Result." }],
        notable_observations: [],
      }),
    });

    expect(summary).toMatchObject({ completed: 0, skipped: 1 });
    expect(summary.skipReasons.model_failure).toBe(1);
    const savedSummary = await Bun.file(join(
      f.stateDir, "knowledge_v2", "renarrate", "unexpected-pass-failure", "summary.json",
    )).json();
    expect(savedSummary).toEqual(summary);
  });
});
