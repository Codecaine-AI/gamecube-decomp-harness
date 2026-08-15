import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getActiveCycle, recordSavePointAnchor, transitionCycle } from "@server/core/cycle";
import { initializeHarnessState, listGameEvents, releaseDispatch, requestDispatch } from "@server/core/harness-state";
import { createRun, openState } from "@server/core/cycle-runtime/run-state";
import { addSavePoint, ensureCampaign } from "@server/core/cycle-runtime/phases/pr/state";
import { handleCycleApiRoute } from "./routes.js";

let tempDirs: string[] = [];

function tempStateDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "cycle-api-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs) rmSync(dir, { force: true, recursive: true });
  tempDirs = [];
});

function deps(
  stateDir: string,
  overrides: Partial<Parameters<typeof handleCycleApiRoute>[2]> = {},
) {
  return {
    baseRefForGame: () => "origin/master",
    campaignStatus: () => ({
      aheadOfBase: 0,
      head: { dirty: false },
    }),
    createSavePoint: async () => ({ ok: true, savePointId: "save-point-manual", blockerRaised: false }),
    invalidateCampaignCache: () => {},
    json: (data: unknown, init?: ResponseInit) => Response.json(data, init),
    gameIdForGame: () => "melee",
    requestPaths: () => ({
      game: { gameId: "melee", baseRef: "origin/master" },
      repoRoot: stateDir,
      stateDir,
      usePathOverrides: false,
    }),
    ...overrides,
  };
}

async function routeJson(
  stateDir: string,
  path: string,
  init: RequestInit = {},
  overrides: Partial<Parameters<typeof handleCycleApiRoute>[2]> = {},
): Promise<{ data: Record<string, unknown>; response: Response }> {
  const request = new Request(`http://localhost${path}`, init);
  const response = await handleCycleApiRoute(request, new URL(request.url), deps(stateDir, overrides));
  if (!response) throw new Error(`No response for ${path}`);
  return { data: (await response.json()) as Record<string, unknown>, response };
}

function seedNamedAnchor(stateDir: string, commitSha = "head-sha"): void {
  const store = openState(stateDir);
  try {
    const cycle = getActiveCycle(store.db, "melee");
    if (!cycle) throw new Error("active cycle fixture is missing");
    const campaign = ensureCampaign(store, { gameId: "melee", baseRef: "origin/master" });
    const savePoint = addSavePoint(store, {
      campaignId: campaign.id,
      triggerKind: "manual",
      label: "close anchor",
      commitSha,
    });
    recordSavePointAnchor(store, {
      gameId: "melee",
      savePointId: savePoint.id,
      commitSha,
      triggerKind: "manual",
      commandId: `command-${savePoint.id}`,
      correlationId: cycle.cycle_uuid,
      actor: "operator",
    });
  } finally {
    store.db.close();
  }
}

describe("cycle API routes", () => {
  test("creates and projects canonical cycle state", async () => {
    const stateDir = tempStateDir();
    const empty = await routeJson(stateDir, "/api/cycle?gameId=melee");
    expect(empty.response.status).toBe(200);
    expect(empty.data.cycle).toBeNull();

    const created = await routeJson(stateDir, "/api/cycle/new?gameId=melee", { method: "POST" });
    const cycle = created.data.cycle as Record<string, unknown>;
    expect(created.response.status).toBe(200);
    expect(cycle.phase).toBe("preparing");
    expect(cycle.activeSubphase).toBe("config");

    const prepared = await routeJson(stateDir, "/api/cycle/preparing/complete?gameId=melee", {
      method: "POST",
      body: JSON.stringify({ activeRunId: "run-1" }),
    });
    expect((prepared.data.cycle as Record<string, unknown>).activeRunId).toBe("run-1");
    expect(((prepared.data.cycle as Record<string, unknown>).gates as Record<string, unknown>).can_start_workers).toBe(true);

    const running = await routeJson(stateDir, "/api/cycle/start-running?gameId=melee", { method: "POST" });
    expect((running.data.cycle as Record<string, unknown>).phase).toBe("running");
  });

  test("accepts bare UUID cycleId selectors from dashboard actions", async () => {
    const stateDir = tempStateDir();
    const created = await routeJson(stateDir, "/api/cycle/new?gameId=melee", { method: "POST" });
    const cycleUuid = String((created.data.cycle as Record<string, unknown>).cycleUuid);

    const prepared = await routeJson(stateDir, "/api/cycle/preparing/complete?gameId=melee", {
      method: "POST",
      body: JSON.stringify({ cycleId: cycleUuid, activeRunId: "run-from-cycle-id" }),
    });

    const cycle = prepared.data.cycle as Record<string, unknown>;
    expect(cycle.cycleUuid).toBe(cycleUuid);
    expect(cycle.activeRunId).toBe("run-from-cycle-id");
    expect(cycle.activeSubphase).toBe("ready");
  });

  test("emits cycle started trace hook after creation", async () => {
    const stateDir = tempStateDir();
    const calls: unknown[] = [];

    const created = await routeJson(
      stateDir,
      "/api/cycle/new?gameId=melee",
      { method: "POST" },
      {
        submitCycleStartedTrace: (_paths, cycle) => calls.push(cycle),
      },
    );

    const cycle = created.data.cycle as Record<string, unknown>;
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      baseRef: "origin/master",
      gameId: "melee",
      cycleUuid: cycle.cycleUuid,
    });
  });

  test("rejects duplicate active cycle creation without emitting a new trace hook", async () => {
    const stateDir = tempStateDir();
    const calls: unknown[] = [];
    const overrides = {
      submitCycleStartedTrace: (_paths: unknown, cycle: unknown) => calls.push(cycle),
    };

    const created = await routeJson(
      stateDir,
      "/api/cycle/new?gameId=melee",
      { method: "POST" },
      overrides,
    );
    const firstCycle = created.data.cycle as Record<string, unknown>;

    const duplicate = await routeJson(
      stateDir,
      "/api/cycle/new?gameId=melee",
      { method: "POST" },
      overrides,
    );
    const duplicateCycle = duplicate.data.cycle as Record<string, unknown>;

    expect(duplicate.response.status).toBe(409);
    expect(duplicate.data.error).toBe("An active game cycle already exists");
    expect(duplicateCycle.cycleUuid).toBe(firstCycle.cycleUuid);
    expect(calls).toHaveLength(1);
  });

  test("routes manual save points through the loud runtime with an ActionProjection response", async () => {
    const stateDir = tempStateDir();
    await routeJson(stateDir, "/api/cycle/new?gameId=melee", { method: "POST" });
    const calls: Record<string, unknown>[] = [];

    const saved = await routeJson(
      stateDir,
      "/api/cycle/save-point?gameId=melee",
      { method: "POST", body: JSON.stringify({ trigger: "ship" }) },
      {
        createSavePoint: async (body) => {
          calls.push(body);
          return { ok: true, savePointId: "save-point-1", blockerRaised: false };
        },
      },
    );

    expect(saved.response.status).toBe(200);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual(
      expect.objectContaining({
        gameId: "melee",
        label: expect.stringMatching(/^manual-.*Z$/),
        repoRoot: stateDir,
        stateDir,
        trigger: "manual",
        usePathOverrides: true,
      }),
    );
    expect(saved.data).toMatchObject({
      action_id: "cycle.save_point",
      enabled: true,
      blocked_by: [],
      confirmation_required: false,
      result: { ok: true, savePointId: "save-point-1", blockerRaised: false },
    });
  });

  test("derives close gates server-side and returns the full ActionProjection decision", async () => {
    const stateDir = tempStateDir();
    await routeJson(stateDir, "/api/cycle/new?gameId=melee", {
      method: "POST",
      body: JSON.stringify({ baseSha: "head-sha" }),
    });

    const blocked = await routeJson(
      stateDir,
      "/api/cycle/close?gameId=melee",
      {
        method: "POST",
        body: JSON.stringify({ aheadOfBase: 0, worktreeDirtyBeyondHead: false }),
      },
      {
        campaignStatus: () => ({ aheadOfBase: 2, head: { dirty: false } }),
      },
    );
    expect(blocked.response.status).toBe(409);
    expect(blocked.data).toMatchObject({
      action_id: "cycle.close",
      enabled: false,
      blocked_by: [{ code: "unshipped_work" }],
      confirmation_required: true,
      result: null,
    });

    seedNamedAnchor(stateDir);
    const unconfirmed = await routeJson(stateDir, "/api/cycle/close?gameId=melee", {
      method: "POST",
    });
    expect(unconfirmed.response.status).toBe(409);
    expect(unconfirmed.data).toMatchObject({
      action_id: "cycle.close",
      enabled: true,
      blocked_by: [],
      confirmation_required: true,
      error: "cycle.close requires operator confirmation",
      result: null,
    });

    const closed = await routeJson(stateDir, "/api/cycle/close?gameId=melee", {
      method: "POST",
      body: JSON.stringify({ aheadOfBase: 99, confirmed: true, worktreeDirtyBeyondHead: true }),
    });
    expect(closed.response.status).toBe(200);
    expect(closed.data).toMatchObject({
      action_id: "cycle.close",
      enabled: true,
      blocked_by: [],
      confirmation_required: true,
      result: { closed: true, cycle: { status: "closed" } },
    });
  });

  test("routes legacy /complete through the lease and unshipped-work close gates", async () => {
    const stateDir = tempStateDir();
    await routeJson(stateDir, "/api/cycle/new?gameId=melee", {
      method: "POST",
      body: JSON.stringify({ baseSha: "head-sha" }),
    });
    const leaseStore = openState(stateDir);
    const cycle = getActiveCycle(leaseStore.db, "melee");
    if (!cycle) throw new Error("expected an active melee cycle");
    const run = createRun(
      leaseStore,
      "matched_code_percent",
      100,
      1,
      { gameId: "melee", stateDir },
      { baseRevision: "head-sha", cycleUuid: cycle.cycle_uuid },
    );
    initializeHarnessState(leaseStore, { gameId: "melee", traceId: "trace-game-melee" });
    const dispatch = requestDispatch(leaseStore, {
      gameId: "melee",
      kind: "run",
      workflowId: run.id,
      reason: "test complete gate",
      commandId: "command-complete-gate-dispatch",
      correlationId: run.id,
      actor: "operator",
    });
    if (dispatch.queued) throw new Error("expected a free dispatch lease");
    leaseStore.db.close();

    const leaseBlocked = await routeJson(stateDir, "/api/cycle/complete?gameId=melee", {
      method: "POST",
    });
    expect(leaseBlocked.response.status).toBe(409);
    expect(leaseBlocked.data).toMatchObject({
      action_id: "cycle.close",
      blocked_by: expect.arrayContaining([expect.objectContaining({ code: "dispatch_lease_held" })]),
      result: null,
    });

    const releaseStore = openState(stateDir);
    releaseDispatch(releaseStore, {
      gameId: "melee",
      leaseId: dispatch.leaseId,
      commandId: "command-complete-gate-release",
      correlationId: run.id,
      actor: "operator",
    });
    releaseStore.db.close();

    const workBlocked = await routeJson(
      stateDir,
      "/api/cycle/complete?gameId=melee",
      { method: "POST" },
      { campaignStatus: () => ({ aheadOfBase: 1, head: { dirty: false } }) },
    );
    expect(workBlocked.response.status).toBe(409);
    expect(workBlocked.data).toMatchObject({ blocked_by: [{ code: "unshipped_work" }], result: null });

    seedNamedAnchor(stateDir);
    const closed = await routeJson(stateDir, "/api/cycle/complete?gameId=melee", {
      method: "POST",
      body: JSON.stringify({ confirmed: true }),
    });
    expect(closed.response.status).toBe(200);
    expect(closed.data).toMatchObject({
      action_id: "cycle.close",
      confirmation_required: true,
      result: { closed: true, cycle: { status: "closed" } },
    });
    const eventStore = openState(stateDir);
    expect(
      listGameEvents(eventStore.db, { gameId: "melee" }).filter(
        (event) => event.eventType === "cycle.closed",
      ),
    ).toHaveLength(1);
    eventStore.db.close();
  });

  test("uses the same canonical cycle worktree root as the dashboard projection", async () => {
    const stateDir = tempStateDir();
    const canonicalRepoRoot = join(stateDir, "cycles", "cycle-current");
    await routeJson(stateDir, "/api/cycle/new?gameId=melee", {
      method: "POST",
      body: JSON.stringify({ baseSha: "head-sha" }),
    });
    const cycleStore = openState(stateDir);
    const cycle = getActiveCycle(cycleStore.db, "melee");
    if (!cycle) throw new Error("expected an active cycle");
    transitionCycle(cycleStore.db, cycle.id, {
      actor: "runner",
      commandId: "command-test-cycle-worktree",
      correlationId: cycle.cycle_uuid,
      eventType: "cycle.preparing_subphase_updated",
      expectedRevision: cycle.revision,
      patch: {
        preparing_state_json: {
          ...cycle.preparing_state_json,
          sync: { cycleCurrentWorktreePath: canonicalRepoRoot },
        },
      },
      payload: { subphase: cycle.preparing_state_json.subphase },
    });
    cycleStore.db.close();
    const seenRepoRoots: string[] = [];
    seedNamedAnchor(stateDir);

    const closed = await routeJson(
      stateDir,
      "/api/cycle/close?gameId=melee",
      { method: "POST", body: JSON.stringify({ confirmed: true }) },
      {
        campaignStatus: (repoRoot) => {
          seenRepoRoots.push(repoRoot);
          return { aheadOfBase: 0, head: { dirty: false } };
        },
      },
    );

    expect(closed.response.status).toBe(200);
    expect(seenRepoRoots).toEqual([canonicalRepoRoot]);
  });
});
