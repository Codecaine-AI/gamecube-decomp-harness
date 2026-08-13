import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getProjectState, initializeProjectState, requestDispatch } from "@server/core/project-state";
import { createRun, getRun, openState, updateRunStatus } from "@server/core/session-runtime/run-state";
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
    { projectId: "melee", repoRoot: stateDir, stateDir },
    { baseRevision: "base-test" },
  );
  initializeProjectState(store, { projectId: "melee", traceId: "trace-project-melee" });
  const decision = requestDispatch(store, {
    actor: "operator",
    commandId: "command-runtime-activate",
    kind: "run",
    projectId: "melee",
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
  test("pause returns draining only after durable run and lease admission gates are closed", async () => {
    const fixture = activeRunFixture();
    let observedDuringSignal: Record<string, unknown> | null = null;
    const runtime = createRunControlRuntime({
      drainManaged: async () => {
        const store = openState(fixture.stateDir);
        try {
          observedDuringSignal = {
            lease: getProjectState(store, "melee")?.active_workflow,
            run: getRun(store, fixture.runId),
          };
        } finally {
          store.db.close();
        }
        return { draining: true, signaled: [123] };
      },
      hasActiveProcess: () => ({ active: true }),
      resolveDashboardProject: () => ({
        graphDbPath: join(fixture.stateDir, "graph.sqlite"),
        project: null,
        repoRoot: fixture.stateDir,
        stateDir: fixture.stateDir,
      }),
      stopManaged: async () => ({ stopped: true }),
    });

    const result = await runtime.pause({ runId: fixture.runId, reason: "operator pause" });

    expect(result).toMatchObject({ draining: true, paused: false, run: { status: "draining" } });
    expect(observedDuringSignal).toMatchObject({
      lease: { lease_id: fixture.leaseId, status: "draining" },
      run: { status: "draining" },
    });
  });
});
