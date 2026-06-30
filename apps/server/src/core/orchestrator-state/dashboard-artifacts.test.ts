import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  dashboardArtifactPayloads,
  latestDashboardArtifact,
  latestDashboardArtifactPayload,
  openState,
  recordDashboardArtifact,
} from "./index.js";

let tempDirs: string[] = [];

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "dashboard-artifacts-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs) rmSync(dir, { force: true, recursive: true });
  tempDirs = [];
});

describe("dashboard artifacts", () => {
  test("returns the latest payload for a scoped dashboard artifact", () => {
    const store = openState(tempDir());
    try {
      recordDashboardArtifact(store, {
        runId: "run-a",
        projectId: "melee",
        sessionUuid: "session-a",
        artifactType: "board_snapshot",
        artifactKey: "current",
        payload: { generatedAt: "2026-06-28T12:00:00.000Z", measures: { fuzzy_match_percent: 70 } },
        createdAt: "2026-06-28T12:00:00.000Z",
      });
      recordDashboardArtifact(store, {
        runId: "run-a",
        projectId: "melee",
        sessionUuid: "session-a",
        artifactType: "board_snapshot",
        artifactKey: "current",
        payload: { generatedAt: "2026-06-28T12:05:00.000Z", measures: { fuzzy_match_percent: 71 } },
        createdAt: "2026-06-28T12:05:00.000Z",
      });
      recordDashboardArtifact(store, {
        runId: "run-b",
        projectId: "melee",
        sessionUuid: "session-b",
        artifactType: "board_snapshot",
        artifactKey: "current",
        payload: { generatedAt: "2026-06-28T12:10:00.000Z", measures: { fuzzy_match_percent: 90 } },
        createdAt: "2026-06-28T12:10:00.000Z",
      });

      expect(
        latestDashboardArtifactPayload(store, {
          runId: "run-a",
          artifactType: "board_snapshot",
          artifactKey: "current",
        }),
      ).toMatchObject({ measures: { fuzzy_match_percent: 71 } });

      expect(
        dashboardArtifactPayloads(store, {
          runId: "run-a",
          artifactType: "board_snapshot",
          artifactKey: "current",
        }).map((payload) => payload.measures),
      ).toEqual([{ fuzzy_match_percent: 70 }, { fuzzy_match_percent: 71 }]);

      expect(
        latestDashboardArtifactPayload(store, {
          projectId: "melee",
          sessionUuid: "session-b",
          artifactType: "board_snapshot",
          artifactKey: "current",
        }),
      ).toMatchObject({ measures: { fuzzy_match_percent: 90 } });

      expect(
        latestDashboardArtifact(store, {
          runId: "missing",
          artifactType: "board_snapshot",
          artifactKey: "current",
        }),
      ).toBeNull();
    } finally {
      store.db.close();
    }
  });
});
