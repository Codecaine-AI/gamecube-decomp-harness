import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { GlobalArgs } from "@server/core/game-registry/runtime-options.js";
import { openState, type StateStore } from "@server/core/orchestrator-state";
import { insertEntitiesIfMissing, insertTargets, insertWorkerRun } from "../records/index.js";
import { openKnowledgeStore, type KnowledgeStore } from "../storage/store.js";
import {
  catchUpWorkerSummaries,
  enqueueWorkerSummaryForWorker,
  handleWorkerSummaryJob,
  validateNarrative,
} from "./index.js";

const fixtures: Array<{ root: string; state: StateStore }> = [];

function fixture(): { root: string; state: StateStore; knowledgeRoot: string; globals: GlobalArgs } {
  const root = mkdtempSync(join(tmpdir(), "worker-summary-"));
  const stateDir = join(root, "state");
  const knowledgeRoot = join(root, "knowledge");
  const state = openState(stateDir);
  fixtures.push({ root, state });
  state.db.query(`INSERT INTO runs
    (id, goal_kind, goal_value, desired_workers, status, created_at, game_id, revision, trace_id)
    VALUES ('source-run', 'matched_percent', 100, 1, 'active', '2026-08-20T00:00:00Z', 'melee', 0, 'trace-1')`).run();
  return {
    root,
    state,
    knowledgeRoot,
    globals: {
      repoRoot: root,
      stateDir,
      gameId: "melee",
      dryRunAgents: false,
      provider: "test",
      model: "test",
      thinkingLevel: "medium",
    },
  };
}

function seedWorker(state: StateStore, id = "worker-1", targetKey = "unit::Func"): void {
  state.db.query(`INSERT INTO worker_state
    (id, run_id, epoch_id, epoch_target_id, target_claim_id, worker_id, target_key,
     lifecycle_status, started_at, ended_at, baseline_score, summary_json)
    VALUES (?, 'source-run', 'epoch-1', 'epoch-target-1', ?, 'agent-1', ?, 'finished',
      '2026-08-20T00:00:00Z', '2026-08-20T00:02:00Z', 10, '{}')`).run(id, `claim-${id}`, targetKey);
}

function seedCheckpoint(state: StateStore, workerId: string, attempt: number, score: number, metadata = "{}"): void {
  state.db.query(`INSERT INTO worker_checkpoints
    (id, worker_state_id, run_id, epoch_id, epoch_target_id, target_claim_id, attempt_index,
     validation_time, old_score, new_score, delta, exact_match, hard_gates_passed,
     improved_over_baseline, selectable, selected, validation_status, metadata_json)
    VALUES (?, ?, 'source-run', 'epoch-1', 'epoch-target-1', ?, ?, ?, 10, ?, ?, 0, 1, 1, 1, 1, 'valid', ?)`)
    .run(`cp-${workerId}-${attempt}`, workerId, `claim-${workerId}`, attempt,
      `2026-08-20T00:0${attempt}:00Z`, score, score - 10, metadata);
}

function seedTarget(root: string): void {
  const knowledge = openKnowledgeStore({ knowledgeRoot: root });
  insertEntitiesIfMissing(knowledge, [
    { id: "entity:translation_unit:src/unit.c", kind: "translation_unit", locator: "src/unit.c" },
  ]);
  insertTargets(knowledge, [
    { id: "target:function:unit:Func", kind: "function", unit: "unit", unitEntityId: "entity:translation_unit:src/unit.c", symbol: "Func", stableKey: "unit:Func", address: "0x80000000", identityStatus: "current", reportRevision: "r1" },
  ]);
  knowledge.close();
}

function injectedStore(knowledgeRoot: string): () => KnowledgeStore {
  return () => openKnowledgeStore({ knowledgeRoot });
}

function modelResult(value: unknown) {
  return Promise.resolve({
    sessionId: "fake-session",
    sessionDir: "/tmp/fake-session",
    outputPath: "/tmp/fake-output",
    systemPromptPath: "/tmp/fake-system",
    userPromptPath: "/tmp/fake-user",
    rawText: JSON.stringify(value),
    dryRun: false,
    failed: false,
  });
}

afterEach(() => {
  for (const item of fixtures.splice(0)) {
    item.state.db.close();
    rmSync(item.root, { recursive: true, force: true });
  }
});

describe("worker summary handler", () => {
  test("refuses the default knowledge root under a test runner", async () => {
    const f = fixture();
    seedWorker(f.state);
    seedCheckpoint(f.state, "worker-1", 1, 12);
    await expect(handleWorkerSummaryJob(f.state, enqueueWorkerSummaryForWorker(f.state, "worker-1"), {
      globals: f.globals,
    })).rejects.toThrow(
      "worker summarizer refuses to touch the default knowledge root under a test runner; inject a temporary knowledge store",
    );
  });

  test("validates the narrative schema strictly", () => {
    const narrative = {
      run: { summary: "s" },
      submissions: [{ submission_id: "submission-1", approach: "a", outcome_reasoning: "r" }],
      notable_observations: [{ observation: "o", reusable_when: "w" }],
    };
    expect(validateNarrative(narrative)).toEqual(narrative);
    expect(() => validateNarrative({ ...narrative, extra: true })).toThrow("outside the narrative schema");
    expect(() => validateNarrative({
      ...narrative,
      submissions: [{ ...narrative.submissions[0], extra: true }],
    })).toThrow("outside the submission narrative schema");
    expect(() => validateNarrative({ ...narrative, dead_ends: [] })).toThrow("outside the narrative schema");
    expect(() => validateNarrative({ ...narrative, run: { ...narrative.run, hypothesis: "h" } })).toThrow("outside the narrative schema");
    expect(() => validateNarrative({
      ...narrative,
      submissions: [{ ...narrative.submissions[0], hypothesis: "sh" }],
    })).toThrow("outside the submission narrative schema");
    expect(() => validateNarrative({
      ...narrative,
      submissions: [{ approach: "a", outcome_reasoning: "r" }],
    })).toThrow("invalid submission narrative");
  });

  test("joins model narrative onto mechanical run and submission fields", async () => {
    const f = fixture();
    seedWorker(f.state);
    seedCheckpoint(f.state, "worker-1", 1, 12);
    seedCheckpoint(f.state, "worker-1", 2, 20, JSON.stringify({ note: "kept" }));
    f.state.db.query(`INSERT INTO checkpoint_items
      (id, checkpoint_id, run_id, worker_checkpoint_id, target_claim_id, target_key, lifecycle_status,
       disposition, item_status, evidence_json, created_at)
      VALUES ('item-1', 'legacy-1', 'source-run', 'cp-worker-1-2', 'claim-worker-1', 'unit::Func',
       'closed', 'merged', 'done', '{}', '2026-08-20T00:03:00Z')`).run();
    seedTarget(f.knowledgeRoot);
    const job = enqueueWorkerSummaryForWorker(f.state, "worker-1");

    await handleWorkerSummaryJob(f.state, job, {
      globals: f.globals,
      openKnowledgeStore: injectedStore(f.knowledgeRoot),
      runPiAgent: () => modelResult({
        run: { summary: "run summary" },
        submissions: [
          { submission_id: "run:worker-1:sub:2", approach: "second approach", outcome_reasoning: "second reasoning" },
          { submission_id: "run:worker-1:sub:1", approach: " first approach ", outcome_reasoning: " first reasoning " },
        ],
        notable_observations: [{ observation: "shared state matters", reusable_when: "editing this unit" }],
      }),
    });

    const knowledge = openKnowledgeStore({ knowledgeRoot: f.knowledgeRoot });
    expect(knowledge.db.query(`SELECT worker_state_id, run_id, final_outcome, error_type, integration, baseline
      FROM worker_run`).get()).toEqual({
      worker_state_id: "worker-1", run_id: "source-run", final_outcome: "improvement",
      error_type: null, integration: null, baseline: '{"score":10}',
    });
    expect(knowledge.db.query(`SELECT seq, score, runtime_ref, hypothesis, description
      FROM submission ORDER BY seq`).all()).toEqual([
      { seq: 1, score: 12, runtime_ref: "cp-worker-1-1", hypothesis: null, description: "first approach first reasoning" },
      { seq: 2, score: 20, runtime_ref: "cp-worker-1-2", hypothesis: null, description: "second approach second reasoning" },
    ]);
    expect(knowledge.db.query(`SELECT worker_run_id, summary, notable_observations, narrative, produced_by
      FROM run_narrative`).get()).toEqual({
      worker_run_id: "run:worker-1",
      summary: "run summary",
      notable_observations: '[{"observation":"shared state matters","reusable_when":"editing this unit"}]',
      narrative: JSON.stringify({
        run: { summary: "run summary" },
        submissions: [
          { submission_id: "run:worker-1:sub:2", approach: "second approach", outcome_reasoning: "second reasoning" },
          { submission_id: "run:worker-1:sub:1", approach: " first approach ", outcome_reasoning: " first reasoning " },
        ],
        notable_observations: [{ observation: "shared state matters", reusable_when: "editing this unit" }],
      }),
      produced_by: "live",
    });
    const run = knowledge.db.query<{ id: string }, []>("SELECT id FROM worker_run").get()!;
    expect(knowledge.db.query("SELECT source, position FROM source_watermark").get()).toEqual({
      source: "attempt", position: '{"last_worker_state_id":"worker-1"}',
    });
    expect(knowledge.db.query("SELECT pathway, payload FROM index_task").get()).toEqual({
      pathway: "run_closed", payload: `attempt://run/${run.id}`,
    });
    knowledge.close();

    const proposal = JSON.parse(readFileSync(join(f.globals.stateDir, "knowledge_v2", "proposals", "run-worker-1.json"), "utf8"));
    expect(proposal).toMatchObject({
      run: { id: "run:worker-1", summary: "run summary" },
      notable_observations: [{ observation: "shared state matters", reusable_when: "editing this unit" }],
    });
    expect(proposal.submissions).toHaveLength(2);
    expect(proposal.submissions[0]).toMatchObject({
      id: "run:worker-1:sub:1",
      submission_id: "run:worker-1:sub:1",
      approach: " first approach ",
      outcome_reasoning: " first reasoning ",
    });
  });

  test("uses integration outcomes for the run and narrative digest", async () => {
    const f = fixture();
    seedWorker(f.state);
    seedCheckpoint(f.state, "worker-1", 1, 12);
    f.state.db.query(`INSERT INTO integration_outcomes
      (id, run_id, epoch_id, epoch_target_id, target_claim_id, worker_state_id,
       worker_checkpoint_id, status, disposition, conflict_paths_json,
       failure_reasons_json, metadata_json, created_at, updated_at, resolved_at)
      VALUES ('integration-1', 'source-run', 'epoch-1', 'epoch-target-1',
       'claim-worker-1', 'worker-1', 'cp-worker-1-1', 'resolved', 'conflicted',
       '["src/a.c", "src/b.c"]', '[]', '{}',
       '2026-08-20T00:01:00Z', '2026-08-20T00:02:00Z', '2026-08-20T00:03:00Z')`).run();
    seedTarget(f.knowledgeRoot);
    let renderedContext = "";
    await handleWorkerSummaryJob(f.state, enqueueWorkerSummaryForWorker(f.state, "worker-1"), {
      globals: f.globals,
      openKnowledgeStore: injectedStore(f.knowledgeRoot),
      runPiAgent: (options) => {
        renderedContext = options.prompt.kernelContext?.renderedContext ?? "";
        return modelResult({
          run: { summary: "s" },
          submissions: [{ submission_id: "run:worker-1:sub:1", approach: "a", outcome_reasoning: "r" }],
          notable_observations: [],
        });
      },
    });

    const knowledge = openKnowledgeStore({ knowledgeRoot: f.knowledgeRoot });
    expect(knowledge.db.query("SELECT integration, integration_detail FROM worker_run").get()).toEqual({
      integration: "conflicted",
      integration_detail: JSON.stringify({
        status: "resolved",
        disposition: "conflicted",
        conflict_paths: ["src/a.c", "src/b.c"],
        failure_reasons: [],
        resolved_at: "2026-08-20T00:03:00Z",
      }),
    });
    knowledge.close();
    expect(renderedContext).toContain('"integration": "conflicted"');
    expect(renderedContext).toContain('"conflict_paths": [\n    "src/a.c",\n    "src/b.c"\n  ]');
  });

  test.each([
    ["duplicate id", ["run:worker-1:sub:1", "run:worker-1:sub:1"], "duplicate submission_id"],
    ["unknown id", ["run:worker-1:sub:1", "unknown-submission"], "unknown submission_id"],
    ["count mismatch", ["run:worker-1:sub:1"], "submission count mismatch"],
  ])("rejects %s", async (_case, submissionIds, message) => {
    const f = fixture();
    seedWorker(f.state);
    seedCheckpoint(f.state, "worker-1", 1, 12);
    seedCheckpoint(f.state, "worker-1", 2, 20);
    seedTarget(f.knowledgeRoot);
    await expect(handleWorkerSummaryJob(f.state, enqueueWorkerSummaryForWorker(f.state, "worker-1"), {
      globals: f.globals,
      openKnowledgeStore: injectedStore(f.knowledgeRoot),
      runPiAgent: () => modelResult({
        run: { summary: "s" },
        submissions: submissionIds.map((submission_id) => ({
          submission_id, approach: "approach", outcome_reasoning: "reason",
        })),
        notable_observations: [],
      }),
    })).rejects.toThrow(message);
    const knowledge = openKnowledgeStore({ knowledgeRoot: f.knowledgeRoot });
    expect(knowledge.db.query("SELECT COUNT(*) AS count FROM worker_run").get()).toEqual({ count: 0 });
    knowledge.close();
  });

  test("skips an existing worker run without invoking the model", async () => {
    const f = fixture();
    seedWorker(f.state);
    seedCheckpoint(f.state, "worker-1", 1, 12);
    seedTarget(f.knowledgeRoot);
    const knowledge = openKnowledgeStore({ knowledgeRoot: f.knowledgeRoot });
    insertWorkerRun(knowledge, {
      id: "run:existing", targetId: "target:function:unit:Func", goal: "existing", baseline: "{}",
      runId: "source-run", workerStateId: "worker-1", finalOutcome: "no_change",
      startedAt: "2026-08-20T00:00:00Z", endedAt: "2026-08-20T00:02:00Z", closedAt: "2026-08-20T00:03:00Z",
    }, []);
    knowledge.close();
    let calls = 0;
    const result = await handleWorkerSummaryJob(f.state, enqueueWorkerSummaryForWorker(f.state, "worker-1"), {
      globals: f.globals,
      openKnowledgeStore: injectedStore(f.knowledgeRoot),
      runPiAgent: () => { calls += 1; return modelResult({}); },
    });
    expect(calls).toBe(0);
    expect(result).toMatchObject({ resultRef: "run:existing", detail: { skipped: "existing" } });
  });

  test("model failure leaves no database rows, watermark, or proposal", async () => {
    const f = fixture();
    seedWorker(f.state);
    seedCheckpoint(f.state, "worker-1", 1, 12);
    seedTarget(f.knowledgeRoot);
    await expect(handleWorkerSummaryJob(f.state, enqueueWorkerSummaryForWorker(f.state, "worker-1"), {
      globals: f.globals,
      openKnowledgeStore: injectedStore(f.knowledgeRoot),
      runPiAgent: async () => { throw new Error("model offline"); },
    })).rejects.toThrow("model offline");
    const knowledge = openKnowledgeStore({ knowledgeRoot: f.knowledgeRoot });
    expect(knowledge.db.query("SELECT COUNT(*) AS count FROM worker_run").get()).toEqual({ count: 0 });
    expect(knowledge.db.query("SELECT COUNT(*) AS count FROM source_watermark").get()).toEqual({ count: 0 });
    knowledge.close();
    expect(existsSync(join(f.globals.stateDir, "knowledge_v2", "proposals", "run-worker-1.json"))).toBe(false);
  });
});

describe("worker summary catch-up", () => {
  test("enqueues closed workers without an existing summary job", () => {
    const f = fixture();
    seedWorker(f.state, "worker-1");
    seedWorker(f.state, "worker-2");
    enqueueWorkerSummaryForWorker(f.state, "worker-1");
    expect(catchUpWorkerSummaries(f.state, "melee")).toBe(1);
    expect(catchUpWorkerSummaries(f.state, "melee")).toBe(0);
    expect(f.state.db.query("SELECT dedupe_key FROM jobs WHERE kind = 'worker_summary' ORDER BY dedupe_key").all()).toEqual([
      { dedupe_key: "worker-1" }, { dedupe_key: "worker-2" },
    ]);
  });
});
