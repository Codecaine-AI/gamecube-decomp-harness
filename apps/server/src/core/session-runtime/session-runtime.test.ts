import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Database } from "bun:sqlite";
import {
  createNewProjectSession,
  enterPr,
  finishPrFinalBuild,
  markPreparingComplete,
  markPrComplete,
  markSessionComplete,
  startRunning,
  stopProjectSessionRun,
  updateRunningSubphase,
  updatePrSubphase,
} from "@server/core/session-runtime";
import { ensureSchema } from "@server/core/orchestrator-state/storage/ddl";

let tempDirs: string[] = [];

function openTestDb(): { db: Database; dir: string } {
  const dir = mkdtempSync(join(tmpdir(), "project-session-runtime-"));
  tempDirs.push(dir);
  const db = new Database(join(dir, "state.sqlite"));
  ensureSchema(db);
  return { db, dir };
}

afterEach(() => {
  for (const dir of tempDirs) rmSync(dir, { force: true, recursive: true });
  tempDirs = [];
});

describe("project session runtime", () => {
  test("supports preparing -> running -> pr -> complete with phase completed_at markers", () => {
    const { db } = openTestDb();
    const created = createNewProjectSession(db, {
      projectId: "melee",
      sessionUuid: "session-uuid",
      id: "project-session:session-uuid",
      now: "2026-06-25T12:00:00.000Z",
    });

    const prepared = markPreparingComplete(db, { id: created.record.id }, { now: "2026-06-25T12:01:00.000Z" });
    expect(prepared.view.phases.preparing.completed_at).toBe("2026-06-25T12:01:00.000Z");
    expect(prepared.view.gates.can_start_workers).toBe(true);

    const running = startRunning(db, { id: created.record.id }, { now: "2026-06-25T12:02:00.000Z" });
    expect(running.view.phase).toBe("running");
    expect(running.view.activeSubphase).toBe("candidate_list");

    const stopped = stopProjectSessionRun(db, { id: created.record.id }, "hit_100_percent", { now: "2026-06-25T12:03:00.000Z" });
    expect(stopped.view.phases.running.stop_reason).toBe("hit_100_percent");
    expect(stopped.view.phases.running.completed_at).toBe("2026-06-25T12:03:00.000Z");

    const pr = enterPr(db, { id: created.record.id }, { now: "2026-06-25T12:04:00.000Z" });
    expect(pr.view.phase).toBe("pr");
    expect(pr.view.activeSubphase).toBe("final_build");
    expect(pr.view.phases.pr.final_build?.status).toBe("active");

    const finalBuild = finishPrFinalBuild(db, { id: created.record.id }, { now: "2026-06-25T12:05:00.000Z" });
    expect(finalBuild.view.activeSubphase).toBe("qa");
    expect(finalBuild.view.phases.pr.final_build?.completed_at).toBe("2026-06-25T12:05:00.000Z");

    const prComplete = markPrComplete(db, { id: created.record.id }, { now: "2026-06-25T12:06:00.000Z" });
    expect(prComplete.view.phases.pr.completed_at).toBe("2026-06-25T12:06:00.000Z");

    const complete = markSessionComplete(db, { id: created.record.id }, { completedBy: "test", now: "2026-06-25T12:07:00.000Z" });
    expect(complete.view.status).toBe("complete");
    expect(complete.view.phase).toBe("complete");
    expect(complete.view.completedAt).toBe("2026-06-25T12:07:00.000Z");
    expect(complete.view.gates.can_start_next).toBe(true);
    db.close();
  });

  test("rejects PR QA before final_build completes", () => {
    const { db } = openTestDb();
    const created = createNewProjectSession(db, { projectId: "melee", sessionUuid: "session-uuid", id: "project-session:session-uuid" });
    markPreparingComplete(db, { id: created.record.id });
    startRunning(db, { id: created.record.id });
    stopProjectSessionRun(db, { id: created.record.id }, "manual_stop", { manualStopMode: "finish_epoch" });
    enterPr(db, { id: created.record.id });

    expect(() => updatePrSubphase(db, { id: created.record.id }, "qa")).toThrow("final_build");
    db.close();
  });

  test("supports hard-stop force-to-PR through final_build", () => {
    const { db } = openTestDb();
    const created = createNewProjectSession(db, { projectId: "melee", sessionUuid: "session-uuid", id: "project-session:session-uuid" });
    markPreparingComplete(db, { id: created.record.id });
    startRunning(db, { id: created.record.id });
    const stopped = stopProjectSessionRun(db, { id: created.record.id }, "manual_stop", { manualStopMode: "hard_stop" });
    expect(stopped.view.gates.force_to_pr_available).toBe(true);

    const pr = enterPr(db, { id: created.record.id }, { force: true });
    expect(pr.view.phase).toBe("pr");
    expect(pr.view.activeSubphase).toBe("final_build");
    expect(pr.view.phases.running.manual_stop_mode).toBe("hard_stop");
    db.close();
  });

  test("restarting workers reactivates running state and clears manual stop metadata", () => {
    const { db } = openTestDb();
    const created = createNewProjectSession(db, { projectId: "melee", sessionUuid: "session-uuid", id: "project-session:session-uuid" });
    markPreparingComplete(db, { id: created.record.id });
    startRunning(db, { id: created.record.id });
    stopProjectSessionRun(db, { id: created.record.id }, "manual_stop", { manualStopMode: "hard_stop" });

    const restarted = updateRunningSubphase(db, { id: created.record.id }, "workers");
    expect(restarted.view.phases.running.status).toBe("active");
    expect(restarted.view.phases.running.completed_at).toBe(null);
    expect(restarted.view.phases.running.stop_reason).toBeUndefined();
    expect(restarted.view.phases.running.manual_stop_mode).toBeUndefined();
    expect(restarted.view.activeSubphase).toBe("workers");
    db.close();
  });

  test("running subphase stores worker config metadata", () => {
    const { db } = openTestDb();
    const created = createNewProjectSession(db, { projectId: "melee", sessionUuid: "session-uuid", id: "project-session:session-uuid" });
    markPreparingComplete(db, { id: created.record.id });
    startRunning(db, { id: created.record.id });

    const updated = updateRunningSubphase(db, { id: created.record.id }, "workers", {
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
    const created = createNewProjectSession(db, { projectId: "melee", sessionUuid: "session-uuid", id: "project-session:session-uuid" });
    markPreparingComplete(db, { id: created.record.id });
    startRunning(db, { id: created.record.id });
    const stopped = stopProjectSessionRun(db, { id: created.record.id }, "error", {
      blockers: [{ code: "worker_error", message: "worker process failed", severity: "error" }],
    });
    expect(stopped.view.status).toBe("blocked");
    expect(stopped.view.phases.running.stop_reason).toBe("error");
    expect(stopped.view.gates.force_to_pr_available).toBe(true);

    const pr = enterPr(db, { id: created.record.id }, { force: true });
    expect(pr.view.status).toBe("active");
    expect(pr.view.phase).toBe("pr");
    expect(pr.view.activeSubphase).toBe("final_build");
    db.close();
  });
});
