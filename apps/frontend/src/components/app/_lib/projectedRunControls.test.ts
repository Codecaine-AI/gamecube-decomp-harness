import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { RUN_CONTROL_ACTION_IDS, RUN_CONTROL_ACTIONS, RUN_CONTROL_ENDPOINTS } from "./projectedRunControls";

const sourceRoot = resolve(import.meta.dir, "../../..");

describe("run controls", () => {
  test("maps all canonical run controls onto projected actions and routes", () => {
    expect(RUN_CONTROL_ACTIONS).toEqual({
      start: "runStart",
      resume: "runResume",
      hardStop: "runHardStop",
      cancel: "runCancel",
      recover: "runRecover",
    });
    expect(RUN_CONTROL_ACTION_IDS).toEqual({
      runStart: "run.start",
      runResume: "run.resume",
      runHardStop: "run.hard_stop",
      runCancel: "run.cancel",
      runRecover: "run.recover",
    });
    expect(RUN_CONTROL_ENDPOINTS).toEqual({
      runStart: "/api/process/start",
      runResume: "/api/run/resume",
      runHardStop: "/api/run/hard-stop",
      runCancel: "/api/run/cancel",
      runRecover: "/api/run/recover",
    });
  });

  test("wires every Stop control through the shared projected action", () => {
    const actionUsage = new Map([
      ["components/details-rail/_components/process-tab.tsx", ["hardStop"]],
      ["pages/workspace/cycles/active/subphases/run/components/RunControls.tsx", ["hardStop"]],
      ["pages/workspace/overview/index.tsx", ["hardStop"]],
    ]);

    for (const [relativePath, actions] of actionUsage) {
      const source = readFileSync(resolve(sourceRoot, relativePath), "utf8");
      for (const action of actions) {
        expect(source).toContain(`onAction(RUN_CONTROL_ACTIONS.${action})`);
      }
      expect(source).not.toMatch(/onAction\("(?:stop|forceStop)"\)/);
    }
  });

  test("keeps removed pause and raw process-stop routes out of the frontend dispatcher", () => {
    const source = readFileSync(resolve(sourceRoot, "components/app/index.tsx"), "utf8");

    expect(source).not.toMatch(/\/api\/process\/(?:drain|stop)/);
    expect(source).not.toContain("/api/pr/pause");
    expect(source).not.toContain("/api/run/pause");
    expect(source).toContain("postJson(RUN_CONTROL_ENDPOINTS.runHardStop, body)");
  });
});
