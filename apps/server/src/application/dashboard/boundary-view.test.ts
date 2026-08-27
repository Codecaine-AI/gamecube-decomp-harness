import { describe, expect, test } from "bun:test";
import {
  BOUNDARY_STEP_KEYS,
  projectBoundaryDashboard,
  type BoundaryEpochRow,
  type BoundaryEventRow,
  type BoundaryProjectionRows,
  type BoundarySavePointRow,
  type BoundaryStep,
} from "./boundary-view.js";
import { dashboardStableSignature } from "./read-model.js";

const BASE = Date.parse("2026-08-27T12:00:00.000Z");

function at(seconds: number): string {
  return new Date(BASE + seconds * 1_000).toISOString();
}

function epoch(overrides: Partial<BoundaryEpochRow> = {}): BoundaryEpochRow {
  return {
    id: "epoch-7",
    ordinal: 7,
    status: "completed",
    admitted_count: 12,
    finished_count: 12,
    boundary_status: "success",
    created_at: at(0),
    closed_at: at(90),
    ...overrides,
  };
}

function event(seconds: number, event_type: string, payload: Record<string, unknown>): BoundaryEventRow {
  return { id: `event-${seconds}-${event_type}`, event_type, payload_json: JSON.stringify(payload), created_at: at(seconds) };
}

function savePoint(overrides: Partial<BoundarySavePointRow> = {}): BoundarySavePointRow {
  return {
    id: "savepoint123456",
    trigger_kind: "epoch_finish",
    matched_code_percent: 88.25,
    payload_json: "{}",
    created_at: at(70),
    ...overrides,
  };
}

function rows(overrides: Partial<BoundaryProjectionRows> = {}): BoundaryProjectionRows {
  return { epochs: [epoch()], events: [], savePoints: [], gameEvents: [], now: at(100), ...overrides };
}

function checkpoint(seconds: number, phase: string, status: string, extra: Record<string, unknown> = {}): BoundaryEventRow {
  return event(seconds, "epoch_checkpoint_progress", { phase, status, message: `${phase} ${status}`, ...extra });
}

function step(steps: BoundaryStep[], key: string): BoundaryStep {
  const found = steps.find((candidate) => candidate.key === key);
  if (!found) throw new Error(`missing boundary step ${key}`);
  return found;
}

describe("boundary view projection", () => {
  test("changes the dashboard signature when boundary material changes", () => {
    const pending = { boundary: { current: { active: true, attempts: [{ attempt: 1, steps: [{ key: "boundary_sync", state: "pending" }] }] }, recent: [] } };
    const running = { boundary: { current: { active: true, attempts: [{ attempt: 1, steps: [{ key: "boundary_sync", state: "running" }] }] }, recent: [] } };

    expect(dashboardStableSignature(pending)).not.toBe(dashboardStableSignature(running));
  });

  test("projects a clean full boundary with all steps and durations", () => {
    const checkpointKeys = BOUNDARY_STEP_KEYS.slice(0, 11);
    const events: BoundaryEventRow[] = [event(1, "epoch_started", {})];
    checkpointKeys.forEach((key, index) => {
      events.push(checkpoint(2 + index * 4, key, "started"));
      events.push(checkpoint(4 + index * 4, key, "finished", key === "save_point" ? { save_point_id: "savepoint123456" } : {}));
    });
    events.push(
      event(47, "boundary_sync", { status: "started", anchor_before: "a" }),
      event(50, "boundary_sync", { status: "finished", drifted: true, merge_commit_sha: "abcdef123456", displaced_count: 2 }),
      event(52, "boundary_breakage_gate", { status: "clean", baseline_sha: "1234567890", breakages: [], moved: [], reasons: [] }),
      event(54, "ci_parity_gate", { ci_parity_status: "passed", pre_commit_status: "passed", reasons: [], steps: [] }),
      event(56, "draft_pr_publish", { status: "started" }),
      event(59, "draft_pr_publish", { status: "finished", pr_url: "https://example.test/pr/1" }),
      event(61, "epoch_full_refresh_started", { lane: "full_boundary" }),
      event(66, "epoch_full_refresh_finished", { lane: "full_boundary" }),
      event(68, "epoch_finished", { status: "success" }),
      event(92, "epoch_admitted", { ordinal: 8, admitted: 9 }),
    );
    const dashboard = projectBoundaryDashboard(rows({ events, savePoints: [savePoint()] }));
    const view = dashboard.current!;
    const attempt = view.attempts[0]!;

    expect(attempt.steps.map((item) => item.key)).toEqual([...BOUNDARY_STEP_KEYS]);
    expect(attempt.steps.every((item) => item.state === "done")).toBeTrue();
    expect(step(attempt.steps, "integration_drain").durationMs).toBe(2_000);
    expect(step(attempt.steps, "boundary_sync").durationMs).toBe(3_000);
    expect(step(attempt.steps, "knowledge_maintenance").durationMs).toBe(5_000);
    expect(view).toMatchObject({ savePointId: "savepoint123456", matchedCodePercent: 88.25, nextEpoch: { ordinal: 8, admitted: 9 }, active: false });
  });

  test("projects a mid-flight running step and pending tail", () => {
    const events = [
      event(1, "epoch_started", {}),
      checkpoint(2, "integration_drain", "started"),
      checkpoint(4, "integration_drain", "finished"),
      checkpoint(5, "report_build", "started"),
    ];
    const dashboard = projectBoundaryDashboard(rows({ epochs: [epoch({ status: "active", boundary_status: null, closed_at: null })], events }));
    const view = dashboard.current!;
    const steps = view.attempts[0]!.steps;

    expect(view.active).toBeTrue();
    expect(step(steps, "report_build")).toMatchObject({ state: "running", startedAt: at(5), finishedAt: null, durationMs: null });
    expect(step(steps, "admission").state).toBe("pending");
  });

  test("partitions retries and keeps the latest attempt as attempt two", () => {
    const events = [
      event(1, "epoch_started", {}),
      checkpoint(2, "integration_drain", "started"),
      checkpoint(3, "report_build", "started"),
      event(4, "epoch_cycle_error", { error: "first attempt exploded" }),
      checkpoint(10, "integration_drain", "started"),
      checkpoint(12, "integration_drain", "finished"),
      checkpoint(13, "report_build", "started"),
    ];
    const dashboard = projectBoundaryDashboard(rows({ epochs: [epoch({ status: "active", boundary_status: null, closed_at: null })], events }));
    const attempts = dashboard.current!.attempts;

    expect(attempts.map((attempt) => attempt.attempt)).toEqual([1, 2]);
    expect(attempts[0]!.error).toBe("first attempt exploded");
    expect(step(attempts[0]!.steps, "report_build").state).toBe("failed");
    expect(step(attempts[1]!.steps, "report_build").state).toBe("running");
    expect(dashboard.current!.active).toBeTrue();
  });

  test("marks canonical middle steps skipped for a reconciled attempt", () => {
    const events = [
      event(2, "epoch_boundary_reconciled", { epoch: 7, epoch_id: "epoch-7", skipped_steps: BOUNDARY_STEP_KEYS.slice(1, 16) }),
      event(3, "epoch_full_refresh_started", { lane: "full_boundary" }),
      event(5, "epoch_full_refresh_finished", { lane: "full_boundary" }),
      event(6, "epoch_admitted", { ordinal: 8, admitted: 4 }),
    ];
    const dashboard = projectBoundaryDashboard(rows({ events, savePoints: [savePoint()] }));
    const attempt = dashboard.current!.attempts[0]!;

    expect(attempt.reconciled).toBeTrue();
    expect(step(attempt.steps, "integration_drain").state).toBe("pending");
    for (const key of BOUNDARY_STEP_KEYS.slice(1, 16)) {
      expect(step(attempt.steps, key)).toMatchObject({ state: "skipped", detail: "reconciled: step skipped" });
    }
    expect(step(attempt.steps, "knowledge_maintenance").state).toBe("done");
    expect(step(attempt.steps, "typed_close").state).toBe("done");
    expect(step(attempt.steps, "admission").state).toBe("done");
  });

  test("maps breakage, CI parity, and pre-commit failures", () => {
    const breakages = [{ unit: "a.c", symbol: "fn" }, { unit: "b.c", symbol: "other" }];
    const events = [
      checkpoint(1, "integration_drain", "started"),
      event(2, "boundary_breakage_gate", { status: "breakage", breakages, moved: [], reasons: ["regression"] }),
      event(3, "ci_parity_gate", { ci_parity_status: "failed", pre_commit_status: "failed", reasons: ["pre-commit hook failed", "compile failed\nmore detail"], steps: [{ gate: "ci_parity" }] }),
    ];
    const attempt = projectBoundaryDashboard(rows({ epochs: [epoch({ status: "paused", boundary_status: "regression_pause" })], events })).current!.attempts[0]!;

    expect(step(attempt.steps, "master_breakage_gate")).toMatchObject({ state: "failed", detail: "2 breakages", payload: { breakages } });
    expect(step(attempt.steps, "ci_parity_gate")).toMatchObject({ state: "failed", detail: "compile failed" });
    expect(step(attempt.steps, "pre_commit_gate")).toMatchObject({ state: "failed", detail: "pre-commit hook failed" });
  });

  test("uses clean CI detail while preserving the shared gate payload", () => {
    const reasons = ["pre-commit formatting failed", "CI compiler failed"];
    const attempt = projectBoundaryDashboard(rows({ events: [
      checkpoint(1, "integration_drain", "started"),
      event(2, "ci_parity_gate", { ci_parity_status: "passed", pre_commit_status: "failed", reasons, steps: [] }),
    ] })).current!.attempts[0]!;

    expect(step(attempt.steps, "ci_parity_gate")).toMatchObject({ state: "done", detail: "clean", payload: { reasons } });
    expect(step(attempt.steps, "pre_commit_gate")).toMatchObject({ state: "failed", detail: "pre-commit formatting failed", payload: { reasons } });
  });

  test("resets stale finish data when knowledge maintenance restarts", () => {
    const attempt = projectBoundaryDashboard(rows({ epochs: [epoch({ status: "active", boundary_status: null, closed_at: null })], events: [
      checkpoint(1, "integration_drain", "started"),
      event(2, "epoch_full_refresh_started", { lane: "full_boundary" }),
      event(4, "epoch_full_refresh_finished", { lane: "full_boundary" }),
      event(6, "epoch_full_refresh_started", { lane: "full_boundary" }),
    ] })).current!.attempts[0]!;

    expect(step(attempt.steps, "knowledge_maintenance")).toMatchObject({ state: "running", startedAt: at(6), finishedAt: null, durationMs: null });
  });

  test("infers a missing serial finish from the next canonical step", () => {
    const view = projectBoundaryDashboard(rows({ events: [
      checkpoint(1, "integration_drain", "started"),
      checkpoint(2, "integration_drain", "finished"),
      checkpoint(3, "worktree_prepare", "started"),
      checkpoint(8, "configure", "started"),
      checkpoint(10, "configure", "finished"),
    ] })).current!;

    expect(step(view.attempts[0]!.steps, "worktree_prepare")).toMatchObject({ state: "done", finishedAt: at(8), durationMs: 5_000 });
    expect(view.active).toBeFalse();
  });

  test("marks an unclosed terminal step warning and never active", () => {
    const view = projectBoundaryDashboard(rows({ events: [
      checkpoint(1, "integration_drain", "started"),
      checkpoint(2, "integration_drain", "finished"),
      checkpoint(3, "knowledge_maintenance", "started", { message: "refreshing docs" }),
    ] })).current!;

    expect(step(view.attempts[0]!.steps, "knowledge_maintenance")).toMatchObject({ state: "warning", detail: "refreshing docs (no finish recorded)" });
    expect(view.active).toBeFalse();
  });

  test("does not attribute a late cycle error to a successful closed epoch", () => {
    const view = projectBoundaryDashboard(rows({ events: [
      checkpoint(1, "integration_drain", "started"),
      checkpoint(2, "integration_drain", "finished"),
      event(95, "epoch_cycle_error", { error: "later timeline failure" }),
    ] })).current!;

    expect(view.attempts[0]!.error).toBeNull();
  });

  test("warns on a stranded running step when the epoch is in error", () => {
    const events = [
      event(1, "epoch_started", {}),
      checkpoint(2, "integration_drain", "started"),
      checkpoint(3, "integration_drain", "finished"),
      checkpoint(4, "report_build", "started"),
      event(5, "epoch_finished", { status: "error" }),
      event(6, "epoch_cycle_error", { error: "objdiff failed for src/foo.c" }),
    ];
    const dashboard = projectBoundaryDashboard(rows({ epochs: [epoch({ status: "error", boundary_status: null, closed_at: at(7) })], events }));
    const view = dashboard.current!;

    expect(view.active).toBeFalse();
    expect(view.attempts[0]!.error).toBe("objdiff failed for src/foo.c");
    expect(step(view.attempts[0]!.steps, "report_build")).toMatchObject({ state: "warning", detail: "report_build started (no finish recorded)" });
    expect(step(view.attempts[0]!.steps, "typed_close")).toMatchObject({ state: "failed", detail: "objdiff failed for src/foo.c" });
  });
});
