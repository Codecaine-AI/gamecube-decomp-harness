import { describe, expect, test } from "bun:test";
import {
  buildAttemptRecord,
  buildAttemptRecords,
  type AttemptCheckpointRow,
  type AttemptWorkerStateRow,
} from "./attempt-view.js";

function worker(overrides: Partial<AttemptWorkerStateRow> = {}): AttemptWorkerStateRow {
  return {
    id: "worker-state-1",
    target_key: "main/melee/ft/chara/ftCo_8008A2BC",
    started_at: "2026-08-10T10:00:00.000Z",
    ended_at: "2026-08-10T10:15:00.000Z",
    baseline_score: 40,
    best_score: 75,
    exact: false,
    ...overrides,
  };
}

function checkpoint(overrides: Partial<AttemptCheckpointRow> = {}): AttemptCheckpointRow {
  return {
    id: "checkpoint-1",
    worker_state_id: "worker-state-1",
    attempt_index: 1,
    validation_time: "2026-08-10T10:05:00.000Z",
    old_score: 40,
    new_score: 50,
    delta: 10,
    exact_match: false,
    improved_over_baseline: false,
    ...overrides,
  };
}

describe("buildAttemptRecord", () => {
  test("grades exact matches as success even with zero or null deltas", () => {
    const result = buildAttemptRecord(worker({ exact: 0 }), [
      checkpoint({ id: "exact-zero", attempt_index: 1, exact_match: 1, delta: 0 }),
      checkpoint({ id: "exact-null", attempt_index: 2, exact_match: true, delta: null }),
    ]);

    expect(result.exact).toBe(false);
    expect(result.outcomes.map(({ outcome }) => outcome)).toEqual(["success", "success"]);
  });

  test("grades baseline improvements and positive deltas as partial", () => {
    const result = buildAttemptRecord(worker(), [
      checkpoint({ id: "flagged", attempt_index: 1, delta: 0, improved_over_baseline: true }),
      checkpoint({ id: "positive-delta", attempt_index: 2, delta: 0.5, improved_over_baseline: false }),
    ]);

    expect(result.outcomes.map(({ outcome }) => outcome)).toEqual(["partial", "partial"]);
  });

  test("grades zero, null, and negative deltas as failed", () => {
    const result = buildAttemptRecord(worker(), [
      checkpoint({ id: "zero", attempt_index: 1, delta: 0 }),
      checkpoint({ id: "null", attempt_index: 2, old_score: null, new_score: null, delta: null }),
      checkpoint({ id: "negative", attempt_index: 3, delta: -1 }),
    ]);

    expect(result.outcomes.map(({ outcome }) => outcome)).toEqual(["failed", "failed", "failed"]);
  });

  test("sorts outcomes and drops checkpoints belonging to other workers", () => {
    const result = buildAttemptRecord(worker(), [
      checkpoint({ id: "attempt-two", attempt_index: 2, validation_time: "2026-08-10T10:03:00.000Z" }),
      checkpoint({ id: "later-attempt-one", attempt_index: 1, validation_time: "2026-08-10T10:02:00.000Z" }),
      checkpoint({ id: "other-worker", worker_state_id: "worker-state-2", attempt_index: 0 }),
      checkpoint({ id: "earlier-attempt-one", attempt_index: 1, validation_time: "2026-08-10T10:01:00.000Z" }),
    ]);

    expect(result.outcomes.map(({ checkpoint_id }) => checkpoint_id)).toEqual([
      "earlier-attempt-one",
      "later-attempt-one",
      "attempt-two",
    ]);
  });

  test("maps worker provenance, scores, target, timestamps, and kind", () => {
    const result = buildAttemptRecord(
      worker({
        id: "qa-worker",
        target_key: "main/melee/gm/gm_1601/gm_8016247C",
        baseline_score: null,
        best_score: 100,
        exact: 1,
        started_at: null,
        ended_at: "2026-08-10T11:00:00.000Z",
      }),
      [],
      { kind: "qa_repair" },
    );

    expect(result).toEqual({
      id: "attempt:qa-worker",
      kind: "qa_repair",
      provenance: "observed",
      worker_state_id: "qa-worker",
      target: "main/melee/gm/gm_1601/gm_8016247C",
      before_score: null,
      after_score: 100,
      exact: true,
      outcomes: [],
      started_at: null,
      ended_at: "2026-08-10T11:00:00.000Z",
    });
  });
});

describe("buildAttemptRecords", () => {
  test("groups a flat checkpoint list across workers", () => {
    const workers = [worker(), worker({ id: "worker-state-2", target_key: "main/melee/it/item", baseline_score: 10, best_score: 20 })];
    const checkpoints = [
      checkpoint({ id: "worker-2-checkpoint", worker_state_id: "worker-state-2", attempt_index: 1 }),
      checkpoint({ id: "worker-1-checkpoint", worker_state_id: "worker-state-1", attempt_index: 1 }),
    ];

    const results = buildAttemptRecords(workers, checkpoints);

    expect(
      results.map(({ worker_state_id, outcomes }) => [
        worker_state_id,
        outcomes.map(({ checkpoint_id }) => checkpoint_id),
      ]),
    ).toEqual([
      ["worker-state-1", ["worker-1-checkpoint"]],
      ["worker-state-2", ["worker-2-checkpoint"]],
    ]);
    expect(results.map(({ kind }) => kind)).toEqual(["worker_run", "worker_run"]);
  });
});
