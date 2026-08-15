import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Database } from "bun:sqlite";
import {
  createNewCycle,
  enterPr,
  finishPrFinalBuild,
  markPreparingComplete,
  markPrComplete,
  markCycleComplete,
  startRunning,
  stopCycleRun,
  updateRunningSubphase,
  updatePrSubphase,
} from "@server/core/cycle-runtime";
import { ensureSchema } from "@server/core/orchestrator-state/storage/ddl";
import { listGameEvents } from "@server/core/harness-state";

let tempDirs: string[] = [];
const cycleTransition = { correlationId: "cycle-uuid" } as const;

function openTestDb(): { db: Database; dir: string } {
  const dir = mkdtempSync(join(tmpdir(), "cycle-runtime-"));
  tempDirs.push(dir);
  const db = new Database(join(dir, "state.sqlite"));
  ensureSchema(db);
  return { db, dir };
}

afterEach(() => {
  for (const dir of tempDirs) rmSync(dir, { force: true, recursive: true });
  tempDirs = [];
});

describe("game cycle runtime", () => {
  test("emits registry-complete nullable facts when opening a cycle", () => {
    const { db } = openTestDb();
    createNewCycle(db, {
      actor: "operator",
      gameId: "melee",
      cycleUuid: "cycle-uuid",
      id: "cycle:cycle-uuid",
      now: "2026-06-25T12:00:00.000Z",
    });

    expect(listGameEvents(db, { gameId: "melee" })[0]).toMatchObject({
      eventType: "cycle.opened",
      correlationId: "cycle-uuid",
      payload: {
        baseline_revision: null,
        initial_head_revision: null,
        worktree_identity: "cycle:melee:cycle-uuid",
        opening_sync_id: null,
        state_revision: 0,
      },
    });
    db.close();
  });

  test("records one revision and event for each accepted phase transition", () => {
    const { db } = openTestDb();
    const created = createNewCycle(db, {
      actor: "operator",
      gameId: "melee",
      cycleUuid: "cycle-uuid",
      id: "cycle:cycle-uuid",
      now: "2026-06-25T12:00:00.000Z",
    });

    const prepared = markPreparingComplete(db, { id: created.record.id }, { ...cycleTransition, now: "2026-06-25T12:01:00.000Z" });
    expect(prepared.view.phases.preparing.completed_at).toBe("2026-06-25T12:01:00.000Z");
    expect(prepared.view.gates.can_start_workers).toBe(true);

    const running = startRunning(db, { id: created.record.id }, { ...cycleTransition, now: "2026-06-25T12:02:00.000Z" });
    expect(running.view.phase).toBe("running");
    expect(running.view.activeSubphase).toBe("candidate_list");

    const stopped = stopCycleRun(db, { id: created.record.id }, "hit_100_percent", { ...cycleTransition, now: "2026-06-25T12:03:00.000Z" });
    expect(stopped.view.phases.running.stop_reason).toBe("hit_100_percent");
    expect(stopped.view.phases.running.completed_at).toBe("2026-06-25T12:03:00.000Z");

    const pr = enterPr(db, { id: created.record.id }, { ...cycleTransition, now: "2026-06-25T12:04:00.000Z" });
    expect(pr.view.phase).toBe("pr");
    expect(pr.view.activeSubphase).toBe("final_build");
    expect(pr.view.phases.pr.final_build?.status).toBe("active");

    const finalBuild = finishPrFinalBuild(db, { id: created.record.id }, { ...cycleTransition, now: "2026-06-25T12:05:00.000Z" });
    expect(finalBuild.view.activeSubphase).toBe("qa");
    expect(finalBuild.view.phases.pr.final_build?.completed_at).toBe("2026-06-25T12:05:00.000Z");

    const prComplete = markPrComplete(db, { id: created.record.id }, { ...cycleTransition, now: "2026-06-25T12:06:00.000Z" });
    expect(prComplete.view.phases.pr.completed_at).toBe("2026-06-25T12:06:00.000Z");
    const complete = markCycleComplete(db, { id: created.record.id }, {
      commandId: "command-cycle-complete",
      actor: "operator",
      ...cycleTransition,
      now: "2026-06-25T12:07:00.000Z",
    });
    expect(complete.view.status).toBe("complete");

    expect(complete.view.revision).toBe(7);
    const events = listGameEvents(db, { gameId: "melee" });
    expect(events.map((event) => event.eventType)).toEqual([
      "cycle.opened",
      "cycle.preparing_completed",
      "cycle.running_started",
      "cycle.running_stopped",
      "cycle.pr_entered",
      "cycle.pr_final_build_completed",
      "cycle.pr_completed",
      "cycle.complete",
    ]);
    expect(complete.view.causedByEventId).toBe(events[7]!.eventId);
    expect(events[7]).toMatchObject({
      actor: "operator",
      causationId: "command-cycle-complete",
      correlationId: "cycle-uuid",
    });
    expect(events[7]!.payload).toEqual({ from_status: "active", to_status: "complete" });
    db.close();
  });

  test("rejects PR QA before final_build completes", () => {
    const { db } = openTestDb();
    const created = createNewCycle(db, { actor: "operator", gameId: "melee", cycleUuid: "cycle-uuid", id: "cycle:cycle-uuid" });
    markPreparingComplete(db, { id: created.record.id }, cycleTransition);
    startRunning(db, { id: created.record.id }, cycleTransition);
    const beforeRejectedBlock = listGameEvents(db, { gameId: "melee" });
    expect(() => Reflect.apply(stopCycleRun, undefined, [db, { id: created.record.id }, "error", {
      ...cycleTransition,
      blockers: [{
        code: "worker_error",
        message: "worker process failed",
        recovery_choices: ["retry_workers"],
      }],
    }])).toThrow("must include source_kind");
    expect(() => Reflect.apply(stopCycleRun, undefined, [db, { id: created.record.id }, "error", {
      ...cycleTransition,
      blockers: [{
        code: "worker_error",
        message: "worker process failed",
        source_id: "cycle-uuid",
        source_kind: "cycle",
      }],
    }])).toThrow("must include explicit recovery_choices");
    expect(listGameEvents(db, { gameId: "melee" })).toEqual(beforeRejectedBlock);
    stopCycleRun(db, { id: created.record.id }, "manual_stop", { ...cycleTransition, manualStopMode: "finish_epoch" });
    enterPr(db, { id: created.record.id }, cycleTransition);

    expect(() => updatePrSubphase(db, { id: created.record.id }, "qa", cycleTransition)).toThrow("final_build");
    db.close();
  });

  test("supports hard-stop force-to-PR through final_build", () => {
    const { db } = openTestDb();
    const created = createNewCycle(db, { actor: "operator", gameId: "melee", cycleUuid: "cycle-uuid", id: "cycle:cycle-uuid" });
    markPreparingComplete(db, { id: created.record.id }, cycleTransition);
    startRunning(db, { id: created.record.id }, cycleTransition);
    const stopped = stopCycleRun(db, { id: created.record.id }, "manual_stop", { ...cycleTransition, manualStopMode: "hard_stop" });
    expect(stopped.view.gates.force_to_pr_available).toBe(true);

    const pr = enterPr(db, { id: created.record.id }, { ...cycleTransition, force: true });
    expect(pr.view.phase).toBe("pr");
    expect(pr.view.activeSubphase).toBe("final_build");
    expect(pr.view.phases.running.manual_stop_mode).toBe("hard_stop");
    db.close();
  });

  test("restarting workers reactivates running state and clears manual stop metadata", () => {
    const { db } = openTestDb();
    const created = createNewCycle(db, { actor: "operator", gameId: "melee", cycleUuid: "cycle-uuid", id: "cycle:cycle-uuid" });
    markPreparingComplete(db, { id: created.record.id }, cycleTransition);
    startRunning(db, { id: created.record.id }, cycleTransition);
    stopCycleRun(db, { id: created.record.id }, "manual_stop", { ...cycleTransition, manualStopMode: "hard_stop" });

    const restarted = updateRunningSubphase(db, { id: created.record.id }, "workers", cycleTransition);
    expect(restarted.view.phases.running.status).toBe("active");
    expect(restarted.view.phases.running.completed_at).toBe(null);
    expect(restarted.view.phases.running.stop_reason).toBeUndefined();
    expect(restarted.view.phases.running.manual_stop_mode).toBeUndefined();
    expect(restarted.view.activeSubphase).toBe("workers");
    db.close();
  });

  test("running subphase stores worker config metadata", () => {
    const { db } = openTestDb();
    const created = createNewCycle(db, { actor: "operator", gameId: "melee", cycleUuid: "cycle-uuid", id: "cycle:cycle-uuid" });
    markPreparingComplete(db, { id: created.record.id }, cycleTransition);
    startRunning(db, { id: created.record.id }, cycleTransition);

    const updated = updateRunningSubphase(db, { id: created.record.id }, "workers", {
      ...cycleTransition,
      data: {
        workers: {
          workerConfig: {
            configVersion: 2,
            maxWorkers: 20,
            epochSize: "128",
            agentTimeoutSeconds: 1800,
            provider: "codex-lb",
            model: "gpt-5.5",
            thinkingLevel: "xhigh",
            toolConcurrency: { compile: 12 },
          },
        },
      },
    });
    expect(updated.view.phases.running.workers?.workerConfig).toEqual({
      configVersion: 2,
      maxWorkers: 20,
      epochSize: "128",
      agentTimeoutSeconds: 1800,
      provider: "codex-lb",
      model: "gpt-5.5",
      thinkingLevel: "xhigh",
      toolConcurrency: { compile: 12 },
    });
    db.close();
  });

  test("represents error stop reason and force-to-PR escape hatch", () => {
    const { db } = openTestDb();
    const created = createNewCycle(db, { actor: "operator", gameId: "melee", cycleUuid: "cycle-uuid", id: "cycle:cycle-uuid" });
    markPreparingComplete(db, { id: created.record.id }, cycleTransition);
    startRunning(db, { id: created.record.id }, cycleTransition);
    const stopped = stopCycleRun(db, { id: created.record.id }, "error", {
      ...cycleTransition,
      blockers: [{
        code: "worker_error",
        message: "worker process failed",
        recovery_choices: ["retry_workers"],
        severity: "error",
        source_id: "cycle-uuid",
        source_kind: "cycle",
      }],
      actor: "guardian",
      commandId: "command-block-worker-error",
      spanId: "span-11111111-1111-4111-8111-111111111111",
    });
    expect(stopped.view.status).toBe("blocked");
    expect(stopped.view.phases.running.stop_reason).toBe("error");
    expect(stopped.view.gates.force_to_pr_available).toBe(true);
    const blockedEvents = listGameEvents(db, { gameId: "melee" });
    expect(stopped.view.revision).toBe(3);
    expect(blockedEvents.map((event) => event.eventType)).toEqual([
      "cycle.opened",
      "cycle.preparing_completed",
      "cycle.running_started",
      "cycle.blocked",
    ]);
    expect(stopped.view.causedByEventId).toBe(blockedEvents[3]!.eventId);
    expect(blockedEvents[3]).toMatchObject({
      actor: "guardian",
      causationId: "command-block-worker-error",
      correlationId: "cycle-uuid",
      parentSpanId: "span-11111111-1111-4111-8111-111111111111",
    });
    expect(blockedEvents[3]!.spanId).toMatch(/^span-[0-9a-f-]{36}$/);
    expect(blockedEvents[3]!.payload).toEqual({
      from_status: "active",
      to_status: "blocked",
      prior_status: "active",
      blocker_codes: ["worker_error"],
      source_identities: [{ source_kind: "cycle", source_id: "cycle-uuid" }],
      recovery_choices: ["retry_workers"],
      state_revision: 3,
    });

    const repeated = stopCycleRun(db, { id: created.record.id }, "error", {
      ...cycleTransition,
      blockers: [{
        code: "worker_error",
        message: "worker process failed",
        recovery_choices: ["retry_workers"],
        severity: "error",
        source_id: "cycle-uuid",
        source_kind: "cycle",
      }],
    });
    expect(repeated.view.revision).toBe(3);
    expect(listGameEvents(db, { gameId: "melee" }).map((event) => event.eventType)).toEqual([
      "cycle.opened",
      "cycle.preparing_completed",
      "cycle.running_started",
      "cycle.blocked",
    ]);

    const updatedBlockers = stopCycleRun(db, { id: created.record.id }, "error", {
      ...cycleTransition,
      blockers: [{
        code: "supervisor_error",
        message: "supervisor process failed",
        recovery_choices: [],
        source_kind: "run",
        source_id: "run-2",
        recoverable: false,
        severity: "error",
      }],
    });
    expect(updatedBlockers.view.revision).toBe(4);
    const blockersUpdatedEvent = listGameEvents(db, { gameId: "melee" }).at(-1)!;
    expect(blockersUpdatedEvent.eventType).toBe("cycle.blockers_updated");
    expect(blockersUpdatedEvent.payload).toEqual({
      added_blocker_codes: ["supervisor_error"],
      removed_blocker_codes: ["worker_error"],
      blocker_codes: ["supervisor_error"],
      source_identities: [{ source_kind: "run", source_id: "run-2" }],
      recovery_choices: [],
      state_revision: 4,
    });

    const pr = enterPr(db, { id: created.record.id }, { ...cycleTransition, force: true });
    expect(pr.view.status).toBe("active");
    expect(pr.view.phase).toBe("pr");
    expect(pr.view.activeSubphase).toBe("final_build");
    expect(pr.view.revision).toBe(6);
    const finalEvents = listGameEvents(db, { gameId: "melee" });
    expect(finalEvents.map((event) => event.eventType)).toEqual([
      "cycle.opened",
      "cycle.preparing_completed",
      "cycle.running_started",
      "cycle.blocked",
      "cycle.blockers_updated",
      "cycle.running_unblocked",
      "cycle.pr_entered",
    ]);
    expect(finalEvents[5]).toMatchObject({
      causationId: expect.any(String),
      correlationId: "cycle-uuid",
      eventType: "cycle.running_unblocked",
      payload: { from_status: "blocked", to_status: "active" },
    });
    expect(finalEvents[6]).toMatchObject({
      causationId: finalEvents[5]?.eventId,
      correlationId: "cycle-uuid",
      eventType: "cycle.pr_entered",
      payload: {
        forced: true,
        previous_phase: "running",
        previous_status: "active",
        phase: "pr",
        status: "active",
      },
    });
    expect(finalEvents[5]!.parentSpanId).toBe(finalEvents[6]!.parentSpanId);
    expect(finalEvents[5]!.spanId).not.toBe(finalEvents[6]!.spanId);
    expect(finalEvents.map((event) => event.eventType)).not.toContain(
      "cycle.running_blocked",
    );
    db.close();
  });
});
