import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { initializeHarnessState, getHarnessState, transitionHarnessState, getHarnessTimeline, requestHarnessExecution } from "@server/core/harness-state/state.js";
import { seedRunHarness } from "@server/core/harness-runtime/run-state/test-harness.js";
import { addEvent, createRun, openState, setRunBoundarySyncHoldLive, startSchedulerEpoch, type StateStore } from "@server/core/harness-runtime/run-state";
import type { GlobalArgs } from "@server/core/game-registry/runtime-options.js";
import { boundaryFindingKnowledgeEvent, runEpochBoundary, type EpochBoundaryParams } from "./epoch-boundary.js";
const tempDirs: string[] = [];
function fixture(units: unknown[]): { dir: string; store: StateStore; globals: GlobalArgs; runId: string; epochId: string } {
  const dir = mkdtempSync(join(tmpdir(), "epoch-boundary-"));
  tempDirs.push(dir);
  const repoRoot = resolve(dir, "repo");
  const stateDir = resolve(dir, "state");
  mkdirSync(resolve(repoRoot, "build/GALE01"), { recursive: true });
  writeFileSync(resolve(repoRoot, "build/GALE01/report.json"), `${JSON.stringify({ measures: { matched_code_percent: 0 }, units })}\n`);
  const store = openState(stateDir);
  seedRunHarness(store, "test", "base-test", repoRoot);
  const run = createRun(store, "matched_code_percent", 100, 1, { gameId: "test", repoRoot }, { baseRevision: "base-test" });
  const epoch = startSchedulerEpoch(store, run.id, {
    workerPoolSize: 1,
  });
  return {
    dir,
    store,
    globals: {
      repoRoot,
      stateDir,
      dryRunAgents: true,
      provider: "test",
      model: "test",
      thinkingLevel: "low",
    },
    runId: run.id,
    epochId: epoch.id,
  };
}

function params(
  value: ReturnType<typeof fixture>,
  overrides: Partial<Pick<EpochBoundaryParams, "globals" | "dependencies">> = {},
): EpochBoundaryParams {
  return {
    store: value.store,
    globals: overrides.globals ?? value.globals,
    args: new Map(),
    runId: value.runId,
    leaseId: `lease-${value.runId}`,
    trigger: "test boundary",
    schedulerEpochId: value.epochId,
    epochOrdinal: 1,
    config: {
      epochConfigureCommand: "true",
      epochLinkPaths: [],
      epochPauseThreshold: 12,
      epochRequeueLimit: 32,
      harnessDraftPrEnabled: false,
      ciParityEnabled: false,
      preCommitGateEnabled: false,
      preCommitAutofixEnabled: false,
      boundarySyncEnabled: false,
      breakageGateEnabled: false,
      boundaryBuildFixerEnabled: true,
      fullKgMaintenanceMode: "skip",
      writeSetFlags: { writeSetWidening: "off" },
      schedulerEpochConfig: {
        workerPoolSize: 1,
        freshReportGate: false,
      },
      graphDbPath: resolve(value.dir, "missing-graph.sqlite"),
      epochWorktreeDir: resolve(value.dir, "epoch-worktree"),
      boundaryRetry: { enabled: true, maxAttempts: 5, baseMs: 120_000, maxMs: 1_800_000 },
    },
    reportKnowledgeProgress: () => () => {},
    dependencies: overrides.dependencies,
  };
}

function completedBoundary(value: ReturnType<typeof fixture>) {
  return {
    artifactDir: value.dir,
    commitSha: "epoch-head",
    label: "epoch-1",
    matchedCodePercent: 90,
    qaGate: null,
    regressions: { regressedFunctions: 0 },
    repair: { paused: false, requeued: 0, reasons: [] },
    savePointId: null,
    durationMs: 1,
    worktreeDir: value.dir,
  };
}

function git(repoRoot: string, args: string[]): string {
  const result = Bun.spawnSync(["git", "-C", repoRoot, ...args], { stdout: "pipe", stderr: "pipe" });
  if (result.exitCode !== 0) throw new Error(result.stderr.toString());
  return result.stdout.toString().trim();
}

afterAll(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
});

describe("harness epoch handoff", () => {
  function readyFixture() {
    const value = fixture([]);
    git(value.globals.repoRoot, ["init"]);
    git(value.globals.repoRoot, ["config", "user.email", "epoch@example.invalid"]);
    git(value.globals.repoRoot, ["config", "user.name", "Epoch test"]);
    git(value.globals.repoRoot, ["add", "."]);
    git(value.globals.repoRoot, ["commit", "-m", "initial"]);
    const head = git(value.globals.repoRoot, ["rev-parse", "HEAD"]);
    const initial = getHarnessState(value.store.db, "test")!;
    transitionHarnessState(value.store.db, { gameId: "test", expectedRevision: initial.identity.revision, commandId: "ready",
      patch: { source: { head, upstream_revision: head }, readiness: { build: "ready", sources: "ready", sandbox: "ready", evidence: "ready" },
        execution: { desired: "run", workflow: "run", status: "active" }, history: { run_id: value.runId } } });
    return { value, head };
  }
  for (const failedGate of ["ci_parity", "pre_commit"] as const) {
    for (const status of ["failed", "error"] as const) {
      for (const recorded of [false, true]) {
        test(`recovered publication blocks ${recorded ? "recorded" : "new"} ${failedGate} ${status} and retries after passing`, async () => {
          const { value, head } = readyFixture();
          let passes = false;
          let publishes = 0;
          let ciCalls = 0;
          let preCommitCalls = 0;
          const gate = (name: string) => ({ status: !passes && name === failedGate ? status : "passed", reasons: [name], warnings: [], steps: [] });
          try {
            if (recorded) addEvent(value.store, value.runId, "ci_parity_gate", "test", {
              epoch_id: value.epochId, boundary_attempt: 1,
              ci_parity_status: failedGate === "ci_parity" ? status : "passed",
              pre_commit_status: failedGate === "pre_commit" ? status : "passed",
            });
            const input = params(value, { globals: { ...value.globals, dryRunAgents: false, gameId: "test" }, dependencies: {
              runBoundarySync: async () => ({ changed: false, headSha: head, plan: { drifted: false } }) as never,
              reconcilePendingIntegrationAttempt: () => ({ status: "completed", completed: { epochId: value.epochId, commitSha: head, attempt: 1 } }) as never,
              runCiParityGate: async () => { ciCalls++; return gate("ci_parity") as never; },
              runPreCommitGate: async () => { preCommitCalls++; return gate("pre_commit") as never; },
              publishHarnessDraftPr: async () => { publishes++; return { status: "updated", commitSha: head } as never; },
              ensureSchedulerEpochFromBoard: (() => ({ epoch: { id: "next" }, progress: { ordinal: 2, admitted: 0, available: 0 } })) as never,
            } });
            input.config.ciParityEnabled = true;
            input.config.preCommitGateEnabled = true;
            input.config.harnessDraftPrEnabled = true;
            const first = await runEpochBoundary(input);
            expect(first.error).toBeUndefined();
            expect(first.reconciled).toBe(true);
            expect(publishes).toBe(0);
            const events = value.store.db.query("SELECT payload_json FROM events WHERE event_type = 'draft_pr_publish'").all() as { payload_json: string }[];
            expect(events.map(row => JSON.parse(row.payload_json))).toContainEqual(expect.objectContaining({
              status: "skipped", reason: `${failedGate}_failed`, epoch_id: value.epochId, boundary_attempt: 1,
            }));
            if (recorded) {
              expect(ciCalls).toBe(failedGate === "ci_parity" ? 1 : 0);
              expect(preCommitCalls).toBe(failedGate === "pre_commit" ? 1 : 0);
            }
            passes = true;
            const retry = await runEpochBoundary(input);
            expect(retry.error).toBeUndefined();
            expect(publishes).toBe(1);
            // Recovery events can share a timestamp; insertion order must break ties.
            value.store.db.run("UPDATE events SET created_at = ? WHERE run_id = ?", [new Date().toISOString(), value.runId]);
            expect((await runEpochBoundary(input)).error).toBeUndefined();
            expect(publishes).toBe(1);
          } finally { value.store.db.close(); }
        });
      }
    }
  }
  test("recovered CI checkout failure skips precommit and publication", async () => {
    const { value, head } = readyFixture();
    let preCommitCalls = 0;
    let publishes = 0;
    try {
      const input = params(value, { globals: { ...value.globals, dryRunAgents: false, gameId: "test" }, dependencies: {
        runBoundarySync: async () => ({ changed: false, headSha: head, plan: { drifted: false } }) as never,
              reconcilePendingIntegrationAttempt: () => ({ status: "completed", completed: { epochId: value.epochId, commitSha: head, attempt: 1 } }) as never,
        runCiParityGate: async () => ({ status: "error", reasons: ["checkout failed"], warnings: [], steps: [{ name: "git switch", exitCode: 1 }] }) as never,
        runPreCommitGate: async () => { preCommitCalls++; throw new Error("must not run"); },
        publishHarnessDraftPr: async () => { publishes++; throw new Error("must not publish"); },
        ensureSchedulerEpochFromBoard: (() => ({ epoch: { id: "next" }, progress: { ordinal: 2, admitted: 0, available: 0 } })) as never,
      } });
      input.config.ciParityEnabled = true;
      input.config.preCommitGateEnabled = true;
      input.config.harnessDraftPrEnabled = true;
      expect((await runEpochBoundary(input)).error).toBeUndefined();
      expect(preCommitCalls).toBe(0);
      expect(publishes).toBe(0);
    } finally { value.store.db.close(); }
  });
  test("two settled epochs record evidence before Sync and pin admission to accepted head", async () => {
    const { value, head } = readyFixture();
    const order: string[] = [];
    try {
      for (let ordinal = 1; ordinal <= 2; ordinal++) {
        const epochId = ordinal === 1 ? value.epochId : startSchedulerEpoch(value.store, value.runId, { workerPoolSize: 1 }).id;
        const input = params(value, { globals: { ...value.globals, dryRunAgents: false, gameId: "test" }, dependencies: {
          reconcilePendingIntegrationAttempt: () => ({ status: "none" }) as never,
          runEpochSettlement: async () => ({ ...completedBoundary(value), commitSha: head, scoreDelta: 0,
            savePointId: `save-${epochId}`, savePointEvidence: { status: "recorded", savePointId: `save-${epochId}`, artifactPaths: ["report.json"], commitSha: head, triggerKind: "epoch_finish" } }) as never,
          runBoundarySync: async () => {
            const events = getHarnessTimeline(value.store.db, "test");
            expect(events.filter(e => e.epochId === epochId).map(e => e.kind)).toEqual(["epoch_completed", "save_point"]);
            order.push(`sync-${ordinal}`);
            const state = getHarnessState(value.store.db, "test")!;
            transitionHarnessState(value.store.db, { gameId: "test", expectedRevision: state.identity.revision, commandId: `sync-${ordinal}`,
              patch: { execution: { workflow: "none", status: "idle" } },
              boundary: { eventId: `sync-${ordinal}`, kind: "sync_completed", outcome: "no_source_change", epochId } });
            return { changed: false, headSha: head, plan: { drifted: false } } as never;
          },
          ensureSchedulerEpochFromBoard: (() => {
            order.push(`admit-${ordinal}`);
            expect(getHarnessState(value.store.db, "test")!.source.head).toBe(head);
            return { epoch: { id: `next-${ordinal}` }, progress: { ordinal: ordinal + 1, admitted: 0, available: 0 } };
          }) as never,
        } });
        input.schedulerEpochId = epochId; input.epochOrdinal = ordinal;
        const outcome = await runEpochBoundary(input);
        expect(outcome.error).toBeUndefined(); expect(outcome.ok).toBe(true);
      }
      expect(order).toEqual(["sync-1", "admit-1", "sync-2", "admit-2"]);
      expect(getHarnessTimeline(value.store.db, "test").filter(e => e.kind === "epoch_completed")).toHaveLength(2);
    } finally { value.store.db.close(); }
  });
  test("pause during Sync persists and suppresses next admission", async () => {
    const { value, head } = readyFixture();
    let admissions = 0;
    try {
      const input = params(value, { globals: { ...value.globals, dryRunAgents: false, gameId: "test" }, dependencies: {
        reconcilePendingIntegrationAttempt: () => ({ status: "none" }) as never,
        runEpochSettlement: async () => ({ ...completedBoundary(value), commitSha: head, savePointId: "save", savePointEvidence: { status: "recorded", savePointId: "save", artifactPaths: [], commitSha: head } }) as never,
        runBoundarySync: async () => {
          const state = getHarnessState(value.store.db, "test")!;
          transitionHarnessState(value.store.db, { gameId: "test", expectedRevision: state.identity.revision, commandId: "pause", patch: { execution: { desired: "paused", workflow: "none", status: "paused" } } });
          return { changed: false, headSha: head, plan: { drifted: false } } as never;
        },
        ensureSchedulerEpochFromBoard: (() => { admissions++; throw new Error("must not admit"); }) as never,
      } });
      const outcome = await runEpochBoundary(input);
      expect(outcome.error).toBeUndefined(); expect(outcome.paused).toBe(true); expect(admissions).toBe(0);
      expect(getHarnessState(value.store.db, "test")!.execution.desired).toBe("paused");
    } finally { value.store.db.close(); }
  });
  test("failed Sync resumes settled evidence without replaying the epoch", async () => {
    const { value, head } = readyFixture();
    let snapshots = 0; let syncs = 0; let admissions = 0;
    try {
      const input = params(value, { globals: { ...value.globals, dryRunAgents: false, gameId: "test" }, dependencies: {
        reconcilePendingIntegrationAttempt: () => ({ status: "none" }) as never,
        runEpochSettlement: async () => { snapshots++; return { ...completedBoundary(value), commitSha: head, savePointId: "save",
          savePointEvidence: { status: "recorded", savePointId: "save", artifactPaths: [], commitSha: head } } as never; },
        runBoundarySync: async () => {
          if (++syncs === 1) throw new Error("source index unavailable");
          const current = getHarnessState(value.store.db, "test")!;
          transitionHarnessState(value.store.db, { gameId: "test", expectedRevision: current.identity.revision, commandId: "sync-recovered",
            patch: { execution: { workflow: "none", status: "idle", blockers: [] } },
            boundary: { eventId: "sync-recovered", kind: "sync_completed", outcome: "no_source_change", epochId: value.epochId } });
          return { changed: false, headSha: head, plan: { drifted: false } } as never;
        },
        ensureSchedulerEpochFromBoard: (() => { admissions++; return { epoch: { id: "next" }, progress: { ordinal: 2, admitted: 0, available: 0 } }; }) as never,
      } });
      expect((await runEpochBoundary(input)).ok).toBe(false);
      expect(getHarnessState(value.store.db, "test")!.execution.status).toBe("blocked");
      expect(admissions).toBe(0);
      const retry = await runEpochBoundary(input);
      expect(retry.error).toBeUndefined(); expect(retry.ok).toBe(true);
      expect(snapshots).toBe(1); expect(syncs).toBe(2); expect(admissions).toBe(1);
      const timeline = getHarnessTimeline(value.store.db, "test");
      expect(timeline.filter(e => e.kind === "epoch_completed")).toHaveLength(1);
      expect(timeline.filter(e => e.kind === "save_point")).toHaveLength(1);
    } finally { value.store.db.close(); }
  });
  function holdFixture() {
    const { value, head } = readyFixture();
    const calls = { snapshots: 0, syncs: 0, breakage: 0, ciParity: 0, preCommit: 0, publishes: 0, knowledge: 0, admissions: 0 };
    const passed = { status: "passed", reasons: [], warnings: [], steps: [] } as never;
    const input = params(value, { globals: { ...value.globals, dryRunAgents: false, gameId: "test" }, dependencies: {
      reconcilePendingIntegrationAttempt: () => ({ status: "none" }) as never,
      runEpochSettlement: async () => { calls.snapshots++; return { ...completedBoundary(value), commitSha: head, scoreDelta: 0, savePointId: "save",
        savePointEvidence: { status: "recorded", savePointId: "save", artifactPaths: [], commitSha: head } } as never; },
      runBoundarySync: async () => {
        calls.syncs++;
        const current = getHarnessState(value.store.db, "test")!;
        transitionHarnessState(value.store.db, { gameId: "test", expectedRevision: current.identity.revision, commandId: `sync-${calls.syncs}`,
          patch: { execution: { workflow: "none", status: "idle", blockers: [] } },
          boundary: { eventId: `sync-${calls.syncs}`, kind: "sync_completed", outcome: "no_source_change", epochId: value.epochId } });
        return { changed: false, headSha: head, plan: { drifted: false } } as never;
      },
      runMasterBreakageGate: async () => { calls.breakage++; return { status: "clean", breakages: [], moved: [], reasons: [] } as never; },
      runCiParityGate: async () => { calls.ciParity++; return passed; },
      runPreCommitGate: async () => { calls.preCommit++; return passed; },
      publishHarnessDraftPr: async () => { calls.publishes++; return { status: "updated", commitSha: head } as never; },
      runKnowledgeMaintenance: (async () => { calls.knowledge++; return {}; }) as never,
      ensureSchedulerEpochFromBoard: (() => { calls.admissions++; return { epoch: { id: "next" }, progress: { ordinal: 2, admitted: 0, available: 0 } }; }) as never,
    } });
    Object.assign(input.config, { breakageGateEnabled: true, ciParityEnabled: true, preCommitGateEnabled: true, harnessDraftPrEnabled: true, fullKgMaintenanceMode: "full" });
    const resume = (commandId: string) => {
      const current = getHarnessState(value.store.db, "test")!;
      requestHarnessExecution(value.store.db, { gameId: "test", commandId, expectedRevision: current.identity.revision, desired: "run" });
    };
    const epochRow = () => value.store.db.query("SELECT status, boundary_status FROM epochs WHERE id = ?").get(value.epochId);
    const heldEvents = () => (value.store.db.query("SELECT payload_json FROM events WHERE event_type = 'boundary_sync_held'").all() as { payload_json: string }[])
      .map(row => JSON.parse(row.payload_json));
    return { value, head, calls, input, resume, epochRow, heldEvents };
  }
  test("operator hold parks the harness paused after the save point and before Sync, then resumes into Sync", async () => {
    const { value, head, calls, input, resume, epochRow, heldEvents } = holdFixture();
    try {
      setRunBoundarySyncHoldLive(value.store, value.runId, true);
      const held = await runEpochBoundary(input);
      expect(held).toMatchObject({ ok: true, paused: true, reconciled: false });
      expect(held.error).toBeUndefined();
      expect(calls).toEqual({ snapshots: 1, syncs: 0, breakage: 0, ciParity: 0, preCommit: 0, publishes: 0, knowledge: 0, admissions: 0 });
      expect(epochRow()).toEqual({ status: "completed", boundary_status: "sync_held" });
      expect(heldEvents()).toEqual([{ epoch: 1, epoch_id: value.epochId, boundary_attempt: 1, commit_sha: head, save_point_id: "save", created_by: "run-loop" }]);
      expect(value.store.db.query("SELECT COUNT(*) AS count FROM events WHERE event_type = 'boundary_sync'").get()).toEqual({ count: 0 });
      expect(getHarnessState(value.store.db, "test")!.execution).toMatchObject({ desired: "paused", workflow: "none", status: "paused" });
      expect(getHarnessTimeline(value.store.db, "test").at(-1)).toMatchObject({
        kind: "pause_requested", outcome: "requested", runId: value.runId, epochId: value.epochId, evidence: { reason: "boundary_sync_hold", save_point_id: "save" },
      });

      resume("resume-held");
      const heldAgain = await runEpochBoundary(input);
      expect(heldAgain).toMatchObject({ ok: true, paused: true, reconciled: true });
      expect(calls).toMatchObject({ snapshots: 1, syncs: 0, admissions: 0, knowledge: 0 });
      expect(heldEvents()).toHaveLength(2);
      expect(epochRow()).toEqual({ status: "completed", boundary_status: "sync_held" });
      expect(getHarnessState(value.store.db, "test")!.execution.desired).toBe("paused");

      setRunBoundarySyncHoldLive(value.store, value.runId, false);
      resume("resume-cleared");
      const synced = await runEpochBoundary(input);
      expect(synced.error).toBeUndefined();
      expect(synced).toMatchObject({ ok: true, paused: false, reconciled: true });
      expect(calls).toEqual({ snapshots: 1, syncs: 1, breakage: 1, ciParity: 1, preCommit: 1, publishes: 1, knowledge: 1, admissions: 1 });
      expect(epochRow()).toEqual({ status: "completed", boundary_status: "success" });
      expect(heldEvents()).toHaveLength(2);
    } finally { value.store.db.close(); }
  });
  function knowledgeRoots(moveSource: boolean) {
    const fixture = holdFixture();
    const roots: string[] = [];
    Object.assign(fixture.input.dependencies!, {
      runBoundarySync: async () => {
        const current = getHarnessState(fixture.value.store.db, "test")!;
        transitionHarnessState(fixture.value.store.db, { gameId: "test", expectedRevision: current.identity.revision, commandId: "sync-source",
          patch: { ...(moveSource ? { source: { head: "synced-head" } } : {}), execution: { workflow: "none", status: "idle", blockers: [] } },
          boundary: { eventId: "sync-source", kind: "sync_completed", outcome: "no_source_change", epochId: fixture.value.epochId } });
        return { changed: moveSource, headSha: moveSource ? "synced-head" : fixture.head, plan: { drifted: false } } as never;
      },
      runKnowledgeMaintenance: (async (globals: { repoRoot: string }) => { roots.push(globals.repoRoot); return {}; }) as never,
    });
    return { ...fixture, roots };
  }
  test("a Sync that moves source refreshes knowledge from the checkout, not the settlement worktree", async () => {
    const { value, input, roots } = knowledgeRoots(true);
    try {
      const outcome = await runEpochBoundary(input);
      expect(outcome.error).toBeUndefined();
      expect(roots).toEqual([input.globals.repoRoot]);
    } finally { value.store.db.close(); }
  });
  test("a Sync that leaves source unchanged refreshes knowledge from the settlement worktree", async () => {
    const { value, input, roots } = knowledgeRoots(false);
    try {
      const outcome = await runEpochBoundary(input);
      expect(outcome.error).toBeUndefined();
      expect(roots).toEqual([value.dir]);
    } finally { value.store.db.close(); }
  });
  test("a cleared hold leaves the boundary unchanged", async () => {
    const { value, calls, input, epochRow, heldEvents } = holdFixture();
    try {
      setRunBoundarySyncHoldLive(value.store, value.runId, true);
      setRunBoundarySyncHoldLive(value.store, value.runId, false);
      const outcome = await runEpochBoundary(input);
      expect(outcome.error).toBeUndefined();
      expect(outcome).toMatchObject({ ok: true, paused: false, reconciled: false });
      expect(calls).toEqual({ snapshots: 1, syncs: 1, breakage: 1, ciParity: 1, preCommit: 1, publishes: 1, knowledge: 1, admissions: 1 });
      expect(epochRow()).toEqual({ status: "completed", boundary_status: "success" });
      expect(heldEvents()).toEqual([]);
      expect(getHarnessState(value.store.db, "test")!.execution.desired).toBe("run");
    } finally { value.store.db.close(); }
  });

});

describe("boundary QA knowledge notes", () => {
  const finding = {
    rule_id: "type_erasing_cast", severity: "warning", file: "src/melee/gm/x.c", line: 12, excerpt: "data = (u8*) gobj;",
    message: "Added type-erasing cast", standard_id: null, detail: { cast: "(u8*)", llm_review: true },
  };
  const detail = JSON.stringify(finding);

  test("boundary note summaries: adjudicated → acceptance evidence and checkpoint ids, no \"Re-admit\"/repair text; deferred → today's text unchanged", () => {
    const deferred = boundaryFindingKnowledgeEvent("harness-1", "upstream-sha", { reason: "boundary_qa_deferred", sourcePath: finding.file, detail });
    expect(deferred.summary).toBe(
      `boundary_qa_deferred: src/melee/gm/x.c. ${detail} Upstream revision: upstream-sha. Re-admit through next-epoch admission; do not repair at the boundary.`,
    );

    const adjudicated = boundaryFindingKnowledgeEvent("harness-1", "upstream-sha", {
      reason: "boundary_qa_adjudicated",
      sourcePath: finding.file,
      detail,
      adjudication: { ruleId: "type_erasing_cast", file: finding.file, fingerprint: "af2:abc123", checkpointIds: ["checkpoint-a", "checkpoint-b"] },
    });
    expect(adjudicated.summary).toBe(
      "Accepted llm_review advisory type_erasing_cast at src/melee/gm/x.c (fingerprint af2:abc123, checkpoints checkpoint-a, checkpoint-b); no action needed.",
    );
    expect(adjudicated.summary).not.toMatch(/re-admit|repair/i);
    expect(adjudicated.sourcePath).toBe(finding.file);
    expect(adjudicated.id).not.toBe(deferred.id);
  });
});
