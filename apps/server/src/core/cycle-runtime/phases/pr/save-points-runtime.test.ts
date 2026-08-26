import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createCycle, getActiveCycle } from "@server/core/cycle";
import { eventsForSubject } from "@server/core/harness-state/events.js";
import { openState } from "@server/core/cycle-runtime/run-state";
import { createSavePointRuntime } from "./save-points-runtime.js";

const cleanup: string[] = [];

afterEach(() => {
  for (const path of cleanup.splice(0).reverse()) rmSync(path, { recursive: true, force: true });
});

describe("boundary save points", () => {
  test("returns a typed failure while durably raising the cycle blocker and staleness flag", async () => {
    const stateDir = mkdtempSync(join(tmpdir(), "boundary-save-point-"));
    cleanup.push(stateDir);
    const store = openState(stateDir);
    try {
      createCycle(store.db, {
        actor: "operator",
        id: "cycle:cycle-1",
        gameId: "melee",
        cycleUuid: "cycle-1",
        baseSha: "base-sha",
      });
    } finally {
      store.db.close();
    }

    const runtime = createSavePointRuntime({
      invalidateCampaignCache: () => undefined,
      outputTail: (value) => value,
      resolveDashboardGame: () => {
        throw new Error("not used");
      },
      runCli: async () => ({ exitCode: 1, stdout: "", stderr: "git commit failed" }),
      serverJobPath: "/server-job.ts",
    });

    const result = await runtime.boundarySavePoint(
      { game: null, repoRoot: "/repo", stateDir, graphDbPath: "/graph.sqlite", usePathOverrides: true },
      "qa",
      "cycle-1",
      "QA boundary",
    );

    expect(result).toEqual({ ok: false, savePointId: null, blockerRaised: true });
    const savedStore = openState(stateDir);
    try {
      const cycle = getActiveCycle(savedStore.db, "melee");
      expect(cycle?.save_point_stale).toBe(true);
      expect(cycle?.blockers_json).toContainEqual({
        code: "save_point_failed",
        message: "save-point (qa) failed (1): git commit failed",
        source_kind: "save_point_boundary",
        source_id: "QA boundary",
        recoverable: true,
        severity: "error",
      });
      const events = eventsForSubject(savedStore.db, "cycle", "cycle-1");
      expect(events.map((event) => event.eventType)).toEqual(["cycle.opened", "cycle.save_point_failed"]);
      expect(events[1]?.payload).toEqual({
        anchored_commit: "base-sha",
        trigger_kind: "qa",
        blocker_code: "save_point_failed",
        failed_or_missing_artifact_classes: ["save_point_boundary"],
        replay_key: expect.stringMatching(/^save-point-/),
        staleness_flag_raised: true,
      });
      expect(events[1]?.correlationId).toBe("cycle-1");
      expect(cycle?.caused_by_event_id).toBe(events[1]?.eventId);
    } finally {
      savedStore.db.close();
    }
  });

  test("does not reject the triggering boundary and spools when no cycle row exists", async () => {
    const stateDir = mkdtempSync(join(tmpdir(), "boundary-save-point-no-cycle-"));
    cleanup.push(stateDir);
    const runtime = createSavePointRuntime({
      invalidateCampaignCache: () => undefined,
      outputTail: (value) => value,
      resolveDashboardGame: () => {
        throw new Error("not used");
      },
      runCli: async () => {
        throw new Error("process unavailable");
      },
      serverJobPath: "/server-job.ts",
    });

    await expect(
      runtime.boundarySavePoint(
        { game: { gameId: "melee" } as never, repoRoot: "/repo", stateDir, graphDbPath: "/graph.sqlite", usePathOverrides: true },
        "checkpoint",
        "cycle-intended",
      ),
    ).resolves.toEqual({ ok: false, savePointId: null, blockerRaised: true });
    const files = readdirSync(join(stateDir, "save_point_failures"));
    expect(files).toHaveLength(1);
    expect(JSON.parse(readFileSync(join(stateDir, "save_point_failures", files[0]!), "utf8"))).toMatchObject({
      event_type: "cycle.save_point_failed",
      correlation_id: "cycle-intended",
      game_id: "melee",
      cycle_uuid: "cycle-intended",
      source_kind: "save_point_boundary",
      trigger_kind: "checkpoint",
    });
  });

  test("spools when SQLite cannot be opened", async () => {
    const stateDir = mkdtempSync(join(tmpdir(), "boundary-save-point-no-sqlite-"));
    cleanup.push(stateDir);
    mkdirSync(join(stateDir, "orchestrator.sqlite"));
    const runtime = createSavePointRuntime({
      invalidateCampaignCache: () => undefined,
      outputTail: (value) => value,
      resolveDashboardGame: () => { throw new Error("not used"); },
      runCli: async () => ({ exitCode: 1, stdout: "", stderr: "capture failed" }),
      serverJobPath: "/server-job.ts",
    });

    await expect(runtime.boundarySavePoint(
      { game: { gameId: "melee" } as never, repoRoot: "/repo", stateDir, graphDbPath: "/graph.sqlite", usePathOverrides: true },
      "qa",
      "cycle-intended",
    )).resolves.toEqual({ ok: false, savePointId: null, blockerRaised: true });
    expect(readdirSync(join(stateDir, "save_point_failures"))).toHaveLength(1);
  });
});
