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
    boundary_attempt_count: 0,
    boundary_next_attempt_at: null,
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
    const checkpointKeys = BOUNDARY_STEP_KEYS.slice(0, BOUNDARY_STEP_KEYS.indexOf("save_point") + 1);
    const events: BoundaryEventRow[] = [event(1, "epoch_started", {})];
    checkpointKeys.forEach((key, index) => {
      events.push(checkpoint(2 + index * 4, key, "started"));
      events.push(checkpoint(4 + index * 4, key, "finished", key === "save_point" ? { save_point_id: "savepoint123456" } : {}));
    });
    const trailingStart = 4 + checkpointKeys.length * 4;
    events.push(
      event(trailingStart, "boundary_sync", { status: "started", anchor_before: "a" }),
      event(trailingStart + 3, "boundary_sync", { status: "finished", drifted: true, merge_commit_sha: "abcdef123456", displaced_count: 2 }),
      event(trailingStart + 5, "boundary_breakage_gate", { status: "clean", baseline_sha: "1234567890", breakages: [], moved: [], reasons: [] }),
      event(trailingStart + 7, "ci_parity_gate", { ci_parity_status: "passed", pre_commit_status: "passed", reasons: [], steps: [] }),
      checkpoint(trailingStart + 9, "precommit_autofix", "started"),
      checkpoint(trailingStart + 11, "precommit_autofix", "finished"),
      event(trailingStart + 13, "draft_pr_publish", { status: "started" }),
      event(trailingStart + 16, "draft_pr_publish", { status: "finished", pr_url: "https://example.test/pr/1" }),
      event(trailingStart + 18, "epoch_full_refresh_started", { lane: "full_boundary" }),
      event(trailingStart + 23, "epoch_full_refresh_finished", { lane: "full_boundary" }),
      event(trailingStart + 25, "epoch_finished", { status: "success" }),
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
    expect(view).toMatchObject({ error: null, retry: null, savePointId: "savepoint123456", matchedCodePercent: 88.25, nextEpoch: { ordinal: 8, admitted: 9 }, active: false });
    expect(attempt.steps.every((item) => item.error === null)).toBeTrue();
  });

  test("keeps the full failed checkpoint error on its step", () => {
    const fullError = "report build failed\ncompiler stderr line 1\ncompiler stderr line 2";
    const attempt = projectBoundaryDashboard(rows({ events: [
      checkpoint(1, "integration_drain", "started"),
      checkpoint(2, "integration_drain", "finished", { error: "ignored on a finished step" }),
      checkpoint(3, "report_build", "started"),
      checkpoint(4, "report_build", "failed", { error: fullError, message: "short runner message", exit_code: 1 }),
    ] })).current!.attempts[0]!;

    expect(step(attempt.steps, "integration_drain").error).toBeNull();
    expect(step(attempt.steps, "report_build")).toMatchObject({
      state: "failed",
      detail: "report build failed",
      error: fullError,
      payload: { exit_code: 1 },
    });
    expect(attempt.failedStep).toBe("report_build");
  });

  test("uses the checkpoint message when a failed checkpoint has no error text", () => {
    const attempt = projectBoundaryDashboard(rows({ events: [
      checkpoint(1, "integration_drain", "started"),
      checkpoint(2, "integration_drain", "failed", { message: "drain command exited 2" }),
    ] })).current!.attempts[0]!;

    expect(step(attempt.steps, "integration_drain")).toMatchObject({ state: "failed", detail: "drain command exited 2", error: null });
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
    expect(attempts[0]!.failedStep).toBe("report_build");
    expect(step(attempts[0]!.steps, "report_build")).toMatchObject({ state: "failed", error: "first attempt exploded" });
    expect(step(attempts[1]!.steps, "report_build").state).toBe("running");
    expect(dashboard.current!.active).toBeTrue();
  });

  test("attributes a cycle error to its failed phase and keeps the latest artifact directory", () => {
    const fullError = "objdiff failed\nstack frame one\nstack frame two";
    const events = [
      checkpoint(1, "integration_drain", "started"),
      checkpoint(2, "integration_drain", "finished"),
      checkpoint(3, "report_build", "started", { artifact_dir: "/artifacts/report" }),
      checkpoint(4, "save_point", "finished", { artifact_dir: "/artifacts/save-point" }),
      event(5, "epoch_cycle_error", { error: fullError, failed_phase: "report_build", artifact_dir: "/artifacts/error" }),
    ];
    const attempt = projectBoundaryDashboard(rows({ epochs: [epoch({ status: "error", boundary_status: null, closed_at: at(6) })], events })).current!.attempts[0]!;

    expect(attempt).toMatchObject({ error: fullError, failedStep: "report_build", artifactDir: "/artifacts/error" });
    expect(step(attempt.steps, "report_build")).toMatchObject({ state: "failed", detail: "objdiff failed", error: fullError });
  });

  test("uses the first failed step when a cycle error has no failed phase", () => {
    const events = [
      checkpoint(1, "integration_drain", "started"),
      checkpoint(2, "integration_drain", "failed", { error: "drain failed\nfull output" }),
      event(3, "epoch_cycle_error", { error: "boundary failed" }),
    ];
    const attempt = projectBoundaryDashboard(rows({ epochs: [epoch({ status: "error", boundary_status: null, closed_at: at(4) })], events })).current!.attempts[0]!;

    expect(attempt.failedStep).toBe("integration_drain");
  });

  test("ignores an unknown failed phase and falls back to the first failed step", () => {
    const events = [
      checkpoint(1, "integration_drain", "started"),
      checkpoint(2, "integration_drain", "failed", { error: "drain failed" }),
      event(3, "epoch_cycle_error", { error: "boundary failed", failed_phase: "unknown_phase" }),
    ];
    const attempt = projectBoundaryDashboard(rows({ epochs: [epoch({ status: "error", boundary_status: null, closed_at: at(4) })], events })).current!.attempts[0]!;

    expect(attempt.failedStep).toBe("integration_drain");
  });

  test("keeps an earlier attempt error on typed close and the epoch view", () => {
    const fullError = "attempt one exploded\nfull stack trace";
    const events = [
      checkpoint(1, "integration_drain", "started"),
      checkpoint(2, "integration_drain", "finished"),
      checkpoint(3, "report_build", "started"),
      event(4, "epoch_cycle_error", { error: fullError, failed_phase: "report_build" }),
      checkpoint(10, "integration_drain", "started"),
      checkpoint(11, "integration_drain", "finished"),
      event(12, "epoch_finished", { status: "error" }),
    ];
    const view = projectBoundaryDashboard(rows({ epochs: [epoch({ status: "error", boundary_status: null, closed_at: at(13) })], events })).current!;
    const close = step(view.attempts[1]!.steps, "typed_close");

    expect(view.attempts).toHaveLength(2);
    expect(view.attempts[0]!.error).toBe(fullError);
    expect(view.attempts[1]!.error).toBeNull();
    expect(view.error).toBe(fullError);
    expect(close).toMatchObject({
      state: "failed",
      detail: "attempt one exploded",
      error: fullError,
      payload: { epoch_status: "error", boundary_status: null, failed_step: null },
    });
  });

  test("uses an epoch finished error when no cycle error was recorded", () => {
    const fullError = "epoch close failed\nclose stack";
    const events = [
      checkpoint(1, "integration_drain", "started"),
      checkpoint(2, "integration_drain", "finished"),
      event(3, "epoch_finished", { status: "error", error: fullError }),
    ];
    const view = projectBoundaryDashboard(rows({ epochs: [epoch({ status: "error", boundary_status: null, closed_at: at(4) })], events })).current!;

    expect(view.error).toBe(fullError);
    expect(step(view.attempts[0]!.steps, "typed_close")).toMatchObject({ state: "failed", detail: "epoch close failed", error: fullError });
  });

  test("projects retry scheduling from the epoch row and retry event", () => {
    const nextAttemptAt = at(45);
    const events = [
      checkpoint(1, "integration_drain", "started"),
      event(3, "epoch_boundary_retry_scheduled", {
        epoch: 7,
        epoch_id: "epoch-7",
        attempt: 2,
        max_attempts: 4,
        next_attempt_at: nextAttemptAt,
        delay_ms: 5_000,
        error: "boundary failed",
      }),
    ];
    const view = projectBoundaryDashboard(rows({
      epochs: [epoch({ status: "active", boundary_status: null, boundary_attempt_count: 2, boundary_next_attempt_at: nextAttemptAt, closed_at: null })],
      events,
    })).current!;

    expect(view.retry).toEqual({ attemptCount: 2, maxAttempts: 4, nextAttemptAt, exhausted: false });
  });

  test("falls back to retry event fields when the epoch row has no retry count", () => {
    const nextAttemptAt = at(45);
    const events = [
      checkpoint(1, "integration_drain", "started"),
      event(3, "epoch_boundary_retry_scheduled", { attempt: 2, max_attempts: 4, next_attempt_at: nextAttemptAt }),
    ];
    const view = projectBoundaryDashboard(rows({
      epochs: [epoch({ status: "active", boundary_status: null, boundary_attempt_count: 0, boundary_next_attempt_at: null, closed_at: null })],
      events,
    })).current!;

    expect(view.retry).toEqual({ attemptCount: 2, maxAttempts: 4, nextAttemptAt, exhausted: false });
  });

  test("projects event-only retry exhaustion when the epoch row has no retry count", () => {
    const events = [
      checkpoint(1, "integration_drain", "started"),
      event(3, "epoch_boundary_retry_exhausted", { attempt: 4, max_attempts: 4, next_attempt_at: null }),
    ];
    const view = projectBoundaryDashboard(rows({
      epochs: [epoch({ status: "error", boundary_status: null, boundary_attempt_count: 0, boundary_next_attempt_at: null, closed_at: at(4) })],
      events,
    })).current!;

    expect(view.retry).toEqual({ attemptCount: 4, maxAttempts: 4, nextAttemptAt: null, exhausted: true });
  });

  test("prefers the larger retry attempt count from the row or event", () => {
    const rowNextAttemptAt = at(40);
    const events = [
      checkpoint(1, "integration_drain", "started"),
      event(3, "epoch_boundary_retry_scheduled", { attempt: 3, max_attempts: 4, next_attempt_at: at(45) }),
    ];
    const view = projectBoundaryDashboard(rows({
      epochs: [epoch({ status: "active", boundary_status: null, boundary_attempt_count: 2, boundary_next_attempt_at: rowNextAttemptAt, closed_at: null })],
      events,
    })).current!;

    expect(view.retry).toEqual({ attemptCount: 3, maxAttempts: 4, nextAttemptAt: rowNextAttemptAt, exhausted: false });
  });

  test("uses the latest retry event and exposes retry exhaustion", () => {
    const events = [
      checkpoint(1, "integration_drain", "started"),
      event(2, "epoch_boundary_retry_scheduled", { attempt: 2, max_attempts: 3, next_attempt_at: at(20), error: "first" }),
      event(3, "epoch_boundary_retry_exhausted", { attempt: 3, max_attempts: 5, next_attempt_at: null, error: "last" }),
    ];
    const view = projectBoundaryDashboard(rows({
      epochs: [epoch({ status: "error", boundary_status: "retry_exhausted", boundary_attempt_count: 5, boundary_next_attempt_at: null, closed_at: at(4) })],
      events,
    })).current!;

    expect(view.retry).toEqual({ attemptCount: 5, maxAttempts: 5, nextAttemptAt: null, exhausted: true });
  });

  test("keeps fixer steps in canonical order and reconciles the named default range", () => {
    expect(BOUNDARY_STEP_KEYS.indexOf("report_build_fixer")).toBe(BOUNDARY_STEP_KEYS.indexOf("report_build") + 1);
    expect(BOUNDARY_STEP_KEYS.indexOf("precommit_autofix")).toBe(BOUNDARY_STEP_KEYS.indexOf("pre_commit_gate") + 1);

    const events = [
      event(2, "epoch_boundary_reconciled", { epoch: 7, epoch_id: "epoch-7" }),
    ];
    const attempt = projectBoundaryDashboard(rows({ events })).current!.attempts[0]!;
    const firstSkipped = BOUNDARY_STEP_KEYS.indexOf("snapshot_commit");
    const lastSkipped = BOUNDARY_STEP_KEYS.indexOf("draft_pr_publish");

    for (const [index, key] of BOUNDARY_STEP_KEYS.entries()) {
      if (index >= firstSkipped && index <= lastSkipped) {
        expect(step(attempt.steps, key)).toMatchObject({ state: "skipped", detail: "reconciled: step skipped" });
      }
    }
    expect(step(attempt.steps, "link_complete_units").state).toBe("pending");
    expect(step(attempt.steps, "report_build_fixer").state).toBe("skipped");
    expect(step(attempt.steps, "precommit_autofix").state).toBe("skipped");
    expect(step(attempt.steps, "draft_pr_publish").state).toBe("skipped");
  });

  test("marks only recorded reconcile steps skipped and preserves rerun evidence", () => {
    const skippedSteps = [
      "link_complete_units", "snapshot_commit", "worktree_prepare", "configure", "report_build", "report_read",
      "confirmation_pass", "qa_scan", "report_publish", "regression_repair", "save_point",
    ];
    const events = [
      event(2, "epoch_boundary_reconciled", {
        epoch: 7,
        epoch_id: "epoch-7",
        skipped_steps: skippedSteps,
        rerun_steps: ["boundary_sync", "master_breakage_gate", "ci_parity_gate", "pre_commit_gate", "draft_pr_publish"],
      }),
      event(3, "boundary_sync", { epoch: 7, epoch_id: "epoch-7", status: "finished", merge_commit_sha: "abcdef123456" }),
      event(4, "boundary_breakage_gate", { epoch: 7, epoch_id: "epoch-7", status: "clean", baseline_sha: "base123456" }),
      event(5, "ci_parity_gate", { epoch: 7, epoch_id: "epoch-7", ci_parity_status: "clean", pre_commit_status: "clean" }),
      event(6, "draft_pr_publish", { epoch: 7, epoch_id: "epoch-7", status: "finished", pr_url: "https://example.invalid/pr/7" }),
      event(7, "epoch_full_refresh_started", { lane: "full_boundary" }),
      event(8, "epoch_full_refresh_finished", { lane: "full_boundary" }),
      event(9, "epoch_admitted", { ordinal: 8, admitted: 4 }),
    ];
    const dashboard = projectBoundaryDashboard(rows({ events, savePoints: [savePoint()] }));
    const attempt = dashboard.current!.attempts[0]!;

    expect(attempt.reconciled).toBeTrue();
    expect(step(attempt.steps, "integration_drain").state).toBe("pending");
    for (const key of skippedSteps) {
      expect(step(attempt.steps, key)).toMatchObject({ state: "skipped", detail: "reconciled: step skipped" });
    }
    for (const key of ["boundary_sync", "master_breakage_gate", "ci_parity_gate", "pre_commit_gate", "draft_pr_publish"]) {
      expect(step(attempt.steps, key).state).toBe("done");
    }
    expect(step(attempt.steps, "knowledge_maintenance").state).toBe("done");
    expect(step(attempt.steps, "typed_close").state).toBe("done");
    expect(step(attempt.steps, "admission").state).toBe("done");
  });

  test("maps breakage, CI parity, and pre-commit failures with full reason text", () => {
    const breakages = [{ unit: "a.c", symbol: "fn" }, { unit: "b.c", symbol: "other" }];
    const breakageReasons = ["regression in a.c", "regression in b.c\nsecond line"];
    const gateReasons = ["pre-commit hook failed\nhook stderr", "pre-commit lint failed", "compile failed\nmore detail", "tests failed"];
    const events = [
      checkpoint(1, "integration_drain", "started"),
      event(2, "boundary_breakage_gate", { status: "breakage", breakages, moved: [], reasons: breakageReasons }),
      event(3, "ci_parity_gate", { ci_parity_status: "failed", pre_commit_status: "failed", reasons: gateReasons, steps: [{ gate: "ci_parity" }] }),
    ];
    const attempt = projectBoundaryDashboard(rows({ epochs: [epoch({ status: "paused", boundary_status: "regression_pause" })], events })).current!.attempts[0]!;

    expect(step(attempt.steps, "master_breakage_gate")).toMatchObject({ state: "failed", detail: "2 breakages", error: breakageReasons.join("\n"), payload: { breakages } });
    expect(step(attempt.steps, "ci_parity_gate")).toMatchObject({ state: "failed", detail: "compile failed", error: [gateReasons[2], gateReasons[3]].join("\n") });
    expect(step(attempt.steps, "pre_commit_gate")).toMatchObject({ state: "failed", detail: "pre-commit hook failed", error: [gateReasons[0], gateReasons[1]].join("\n") });
  });

  test("keeps the full draft PR publish error", () => {
    const fullError = "git push failed\nremote rejected the update";
    const attempt = projectBoundaryDashboard(rows({ events: [
      checkpoint(1, "integration_drain", "started"),
      event(2, "draft_pr_publish", { status: "started" }),
      event(3, "draft_pr_publish", { status: "failed", error: fullError }),
    ] })).current!.attempts[0]!;

    expect(step(attempt.steps, "draft_pr_publish")).toMatchObject({ state: "failed", detail: "git push failed", error: fullError });
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

  test("fails a stranded running step when the epoch is in error", () => {
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
    expect(view.attempts[0]!.failedStep).toBe("report_build");
    expect(step(view.attempts[0]!.steps, "report_build")).toMatchObject({ state: "failed", detail: "report_build started", error: "objdiff failed for src/foo.c" });
    expect(step(view.attempts[0]!.steps, "typed_close")).toMatchObject({ state: "failed", detail: "objdiff failed for src/foo.c" });
  });
});
