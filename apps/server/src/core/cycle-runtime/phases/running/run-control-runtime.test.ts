import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getHarnessState, initializeHarnessState, requestDispatch } from "@server/core/harness-state";
import { createRun, getRun, openState, updateRunStatus } from "@server/core/cycle-runtime/run-state";
import { createRunControlRuntime } from "./run-control-runtime.js";

const tempDirs: string[] = [];

function activeRunFixture() {
  const stateDir = mkdtempSync(join(tmpdir(), "run-control-runtime-"));
  tempDirs.push(stateDir);
  const store = openState(stateDir);
  const run = createRun(
    store,
    "matched_code_percent",
    100,
    1,
    { gameId: "melee", repoRoot: stateDir, stateDir },
    { baseRevision: "base-test" },
  );
  initializeHarnessState(store, { gameId: "melee", traceId: "trace-game-melee" });
  const decision = requestDispatch(store, {
    actor: "operator",
    commandId: "command-runtime-activate",
    correlationId: run.id,
    kind: "run",
    gameId: "melee",
    reason: "runtime test",
    workflowId: run.id,
  });
  if (decision.queued) throw new Error("test run lease was unexpectedly queued");
  updateRunStatus(store, run.id, "active", "operator");
  store.db.close();
  return { leaseId: decision.leaseId, runId: run.id, stateDir };
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { force: true, recursive: true });
});

describe("run control runtime", () => {
  test("rejects caller-supplied correlation that does not name the run", async () => {
    const fixture = activeRunFixture();
    const runtime = createRunControlRuntime({
      hasActiveProcess: () => ({ active: true }),
      resolveDashboardGame: () => ({
        graphDbPath: join(fixture.stateDir, "graph.sqlite"),
        game: null,
        repoRoot: fixture.stateDir,
        stateDir: fixture.stateDir,
      }),
      stopManaged: async () => ({ stopped: true }),
    });

    expect(() => runtime.cancel({
      confirmed: true,
      correlationId: "sync-wrong-workflow",
      runId: fixture.runId,
    })).toThrow(`correlation_id must equal run id ${fixture.runId}`);

    const store = openState(fixture.stateDir);
    try {
      expect(getRun(store, fixture.runId)?.status).toBe("active");
      expect(getHarnessState(store, "melee")?.active_workflow).toMatchObject({
        status: "active",
        workflow_id: fixture.runId,
      });
    } finally {
      store.db.close();
    }
  });

});
