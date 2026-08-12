import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createProjectSession, getActiveProjectSession } from "@server/core/project-session";
import { eventsForSubject } from "@server/core/project-state/events.js";
import { openState } from "@server/core/session-runtime/run-state";
import { createSavePointRuntime } from "./save-points-runtime.js";

const cleanup: string[] = [];

afterEach(() => {
  for (const path of cleanup.splice(0).reverse()) rmSync(path, { recursive: true, force: true });
});

describe("boundary save points", () => {
  test("returns a typed failure while durably raising the session blocker and staleness flag", async () => {
    const stateDir = mkdtempSync(join(tmpdir(), "boundary-save-point-"));
    cleanup.push(stateDir);
    const store = openState(stateDir);
    try {
      createProjectSession(store.db, {
        id: "project-session:session-1",
        projectId: "melee",
        sessionUuid: "session-1",
        baseSha: "base-sha",
      });
    } finally {
      store.db.close();
    }

    const runtime = createSavePointRuntime({
      appendLog: () => undefined,
      invalidateCampaignCache: () => undefined,
      outputTail: (value) => value,
      resolveDashboardProject: () => {
        throw new Error("not used");
      },
      runCli: async () => ({ exitCode: 1, stdout: "", stderr: "git commit failed" }),
      serverJobPath: "/server-job.ts",
    });

    const result = await runtime.boundarySavePoint(
      { project: null, repoRoot: "/repo", stateDir, graphDbPath: "/graph.sqlite", usePathOverrides: true },
      "qa",
      "QA boundary",
    );

    expect(result).toEqual({ ok: false, savePointId: null, blockerRaised: true });
    const savedStore = openState(stateDir);
    try {
      const session = getActiveProjectSession(savedStore.db, "melee");
      expect(session?.save_point_stale).toBe(true);
      expect(session?.blockers_json).toContainEqual({
        code: "save_point_failed",
        message: "save-point (qa) failed (1): git commit failed",
        source_kind: "save_point_boundary",
        source_id: "QA boundary",
        recoverable: true,
        severity: "error",
      });
      const events = eventsForSubject(savedStore.db, "session", "session-1");
      expect(events.map((event) => event.eventType)).toEqual(["session.opened", "session.save_point_failed"]);
      expect(events[1]?.payload).toEqual({
        trigger_kind: "qa",
        blocker_code: "save_point_failed",
        staleness_flag_raised: true,
      });
      expect(session?.caused_by_event_id).toBe(events[1]?.eventId);
    } finally {
      savedStore.db.close();
    }
  });

  test("does not reject the triggering boundary and spools when no session row exists", async () => {
    const stateDir = mkdtempSync(join(tmpdir(), "boundary-save-point-no-session-"));
    cleanup.push(stateDir);
    const runtime = createSavePointRuntime({
      appendLog: () => undefined,
      invalidateCampaignCache: () => undefined,
      outputTail: (value) => value,
      resolveDashboardProject: () => {
        throw new Error("not used");
      },
      runCli: async () => {
        throw new Error("process unavailable");
      },
      serverJobPath: "/server-job.ts",
    });

    await expect(
      runtime.boundarySavePoint(
        { project: { projectId: "melee" } as never, repoRoot: "/repo", stateDir, graphDbPath: "/graph.sqlite", usePathOverrides: true },
        "checkpoint",
      ),
    ).resolves.toEqual({ ok: false, savePointId: null, blockerRaised: true });
    const files = readdirSync(join(stateDir, "save_point_failures"));
    expect(files).toHaveLength(1);
    expect(JSON.parse(readFileSync(join(stateDir, "save_point_failures", files[0]!), "utf8"))).toMatchObject({
      event_type: "session.save_point_failed",
      project_id: "melee",
      source_kind: "save_point_boundary",
      trigger_kind: "checkpoint",
    });
  });

  test("spools when SQLite cannot be opened", async () => {
    const stateDir = mkdtempSync(join(tmpdir(), "boundary-save-point-no-sqlite-"));
    cleanup.push(stateDir);
    mkdirSync(join(stateDir, "orchestrator.sqlite"));
    const runtime = createSavePointRuntime({
      appendLog: () => undefined,
      invalidateCampaignCache: () => undefined,
      outputTail: (value) => value,
      resolveDashboardProject: () => { throw new Error("not used"); },
      runCli: async () => ({ exitCode: 1, stdout: "", stderr: "capture failed" }),
      serverJobPath: "/server-job.ts",
    });

    await expect(runtime.boundarySavePoint(
      { project: { projectId: "melee" } as never, repoRoot: "/repo", stateDir, graphDbPath: "/graph.sqlite", usePathOverrides: true },
      "qa",
    )).resolves.toEqual({ ok: false, savePointId: null, blockerRaised: true });
    expect(readdirSync(join(stateDir, "save_point_failures"))).toHaveLength(1);
  });
});
