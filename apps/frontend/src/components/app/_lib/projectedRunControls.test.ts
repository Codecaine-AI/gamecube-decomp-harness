import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { RUN_CONTROL_ACTION_IDS, RUN_CONTROL_ACTIONS, RUN_CONTROL_ENDPOINTS } from "./projectedRunControls";

const sourceRoot = resolve(import.meta.dir, "../../..");

describe("legacy process controls", () => {
  test("maps all canonical run controls onto projected actions and routes", () => {
    expect(RUN_CONTROL_ACTIONS).toEqual({
      start: "runStart",
      pause: "runPause",
      resume: "runResume",
      hardStop: "runHardStop",
      cancel: "runCancel",
      recover: "runRecover",
    });
    expect(RUN_CONTROL_ACTION_IDS).toEqual({
      runStart: "run.start",
      runPause: "run.pause",
      runResume: "run.resume",
      runHardStop: "run.hard_stop",
      runCancel: "run.cancel",
      runRecover: "run.recover",
    });
    expect(RUN_CONTROL_ENDPOINTS).toEqual({
      runStart: "/api/process/start",
      runPause: "/api/run/pause",
      runResume: "/api/run/resume",
      runHardStop: "/api/run/hard-stop",
      runCancel: "/api/run/cancel",
      runRecover: "/api/run/recover",
    });
  });

  test("wire every legacy Drain/Kill surface through the shared projection actions", () => {
    const actionUsage = new Map([
      ["components/details-rail/_components/process-tab.tsx", ["pause", "hardStop"]],
      ["pages/workspace/sessions/active/subphases/run/components/RunControls.tsx", ["pause", "hardStop"]],
      ["pages/workspace/sessions/index.tsx", ["pause"]],
      ["pages/workspace/overview/index.tsx", ["pause"]],
      ["pages/workspace/sessions/active/subphases/pr/components/PrModeActions.tsx", ["pause"]],
    ]);

    for (const [relativePath, actions] of actionUsage) {
      const source = readFileSync(resolve(sourceRoot, relativePath), "utf8");
      for (const action of actions) {
        expect(source).toContain(`onAction(RUN_CONTROL_ACTIONS.${action})`);
      }
      expect(source).not.toMatch(/onAction\("(?:stop|forceStop)"\)/);
    }
  });

  test("keeps raw supervisor drain/stop endpoints out of the frontend dispatcher", () => {
    const source = readFileSync(resolve(sourceRoot, "components/app/index.tsx"), "utf8");

    expect(source).not.toMatch(/\/api\/process\/(?:drain|stop)/);
    expect(source).not.toContain("/api/pr/pause");
    expect(source).toContain("postJson(RUN_CONTROL_ENDPOINTS.runPause, body)");
    expect(source).toContain("postJson(RUN_CONTROL_ENDPOINTS.runHardStop, body)");
  });
});
