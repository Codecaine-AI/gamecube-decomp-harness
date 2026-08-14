import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getActiveProjectSession, recordSavePointAnchor, transitionProjectSession } from "@server/core/project-session";
import { initializeProjectState, listProjectEvents, releaseDispatch, requestDispatch } from "@server/core/project-state";
import { createRun, openState } from "@server/core/session-runtime/run-state";
import { addSavePoint, ensureCampaign } from "@server/core/session-runtime/phases/pr/state";
import { handleProjectSessionApiRoute } from "./routes.js";

let tempDirs: string[] = [];

function tempStateDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "project-session-api-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs) rmSync(dir, { force: true, recursive: true });
  tempDirs = [];
});

function deps(
  stateDir: string,
  overrides: Partial<Parameters<typeof handleProjectSessionApiRoute>[2]> = {},
) {
  return {
    baseRefForProject: () => "origin/master",
    campaignStatus: () => ({
      aheadOfBase: 0,
      head: { dirty: false },
    }),
    createSavePoint: async () => ({ ok: true, savePointId: "save-point-manual", blockerRaised: false }),
    invalidateCampaignCache: () => {},
    json: (data: unknown, init?: ResponseInit) => Response.json(data, init),
    projectIdForProject: () => "melee",
    requestPaths: () => ({
      project: { projectId: "melee", baseRef: "origin/master" },
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
  overrides: Partial<Parameters<typeof handleProjectSessionApiRoute>[2]> = {},
): Promise<{ data: Record<string, unknown>; response: Response }> {
  const request = new Request(`http://localhost${path}`, init);
  const response = await handleProjectSessionApiRoute(request, new URL(request.url), deps(stateDir, overrides));
  if (!response) throw new Error(`No response for ${path}`);
  return { data: (await response.json()) as Record<string, unknown>, response };
}

function seedNamedAnchor(stateDir: string, commitSha = "head-sha"): void {
  const store = openState(stateDir);
  try {
    const session = getActiveProjectSession(store.db, "melee");
    if (!session) throw new Error("active session fixture is missing");
    const campaign = ensureCampaign(store, { projectId: "melee", baseRef: "origin/master" });
    const savePoint = addSavePoint(store, {
      campaignId: campaign.id,
      triggerKind: "manual",
      label: "close anchor",
      commitSha,
    });
    recordSavePointAnchor(store, {
      projectId: "melee",
      savePointId: savePoint.id,
      commitSha,
      triggerKind: "manual",
      commandId: `command-${savePoint.id}`,
      correlationId: session.session_uuid,
      actor: "operator",
    });
  } finally {
    store.db.close();
  }
}

describe("project session API routes", () => {
  test("creates and projects canonical session state", async () => {
    const stateDir = tempStateDir();
    const empty = await routeJson(stateDir, "/api/project-session?projectId=melee");
    expect(empty.response.status).toBe(200);
    expect(empty.data.projectSession).toBeNull();

    const created = await routeJson(stateDir, "/api/project-session/new?projectId=melee", { method: "POST" });
    const projectSession = created.data.projectSession as Record<string, unknown>;
    expect(created.response.status).toBe(200);
    expect(projectSession.phase).toBe("preparing");
    expect(projectSession.activeSubphase).toBe("config");

    const prepared = await routeJson(stateDir, "/api/project-session/preparing/complete?projectId=melee", {
      method: "POST",
      body: JSON.stringify({ activeRunId: "run-1" }),
    });
    expect((prepared.data.projectSession as Record<string, unknown>).activeRunId).toBe("run-1");
    expect(((prepared.data.projectSession as Record<string, unknown>).gates as Record<string, unknown>).can_start_workers).toBe(true);

    const running = await routeJson(stateDir, "/api/project-session/start-running?projectId=melee", { method: "POST" });
    expect((running.data.projectSession as Record<string, unknown>).phase).toBe("running");
  });

  test("accepts bare UUID sessionId selectors from dashboard actions", async () => {
    const stateDir = tempStateDir();
    const created = await routeJson(stateDir, "/api/project-session/new?projectId=melee", { method: "POST" });
    const sessionUuid = String((created.data.projectSession as Record<string, unknown>).sessionUuid);

    const prepared = await routeJson(stateDir, "/api/project-session/preparing/complete?projectId=melee", {
      method: "POST",
      body: JSON.stringify({ sessionId: sessionUuid, activeRunId: "run-from-session-id" }),
    });

    const projectSession = prepared.data.projectSession as Record<string, unknown>;
    expect(projectSession.sessionUuid).toBe(sessionUuid);
    expect(projectSession.activeRunId).toBe("run-from-session-id");
    expect(projectSession.activeSubphase).toBe("ready");
  });

  test("emits session started trace hook after creation", async () => {
    const stateDir = tempStateDir();
    const calls: unknown[] = [];

    const created = await routeJson(
      stateDir,
      "/api/project-session/new?projectId=melee",
      { method: "POST" },
      {
        submitSessionStartedTrace: (_paths, session) => calls.push(session),
      },
    );

    const projectSession = created.data.projectSession as Record<string, unknown>;
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      baseRef: "origin/master",
      projectId: "melee",
      sessionUuid: projectSession.sessionUuid,
    });
  });

  test("rejects duplicate active session creation without emitting a new trace hook", async () => {
    const stateDir = tempStateDir();
    const calls: unknown[] = [];
    const overrides = {
      submitSessionStartedTrace: (_paths: unknown, session: unknown) => calls.push(session),
    };

    const created = await routeJson(
      stateDir,
      "/api/project-session/new?projectId=melee",
      { method: "POST" },
      overrides,
    );
    const firstSession = created.data.projectSession as Record<string, unknown>;

    const duplicate = await routeJson(
      stateDir,
      "/api/project-session/new?projectId=melee",
      { method: "POST" },
      overrides,
    );
    const duplicateSession = duplicate.data.projectSession as Record<string, unknown>;

    expect(duplicate.response.status).toBe(409);
    expect(duplicate.data.error).toBe("An active project session already exists");
    expect(duplicateSession.sessionUuid).toBe(firstSession.sessionUuid);
    expect(calls).toHaveLength(1);
  });

  test("routes manual save points through the loud runtime with an ActionProjection response", async () => {
    const stateDir = tempStateDir();
    await routeJson(stateDir, "/api/project-session/new?projectId=melee", { method: "POST" });
    const calls: Record<string, unknown>[] = [];

    const saved = await routeJson(
      stateDir,
      "/api/project-session/save-point?projectId=melee",
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
        projectId: "melee",
        label: expect.stringMatching(/^manual-.*Z$/),
        repoRoot: stateDir,
        stateDir,
        trigger: "manual",
        usePathOverrides: true,
      }),
    );
    expect(saved.data).toMatchObject({
      action_id: "session.save_point",
      enabled: true,
      blocked_by: [],
      confirmation_required: false,
      result: { ok: true, savePointId: "save-point-1", blockerRaised: false },
    });
  });

  test("derives close gates server-side and returns the full ActionProjection decision", async () => {
    const stateDir = tempStateDir();
    await routeJson(stateDir, "/api/project-session/new?projectId=melee", {
      method: "POST",
      body: JSON.stringify({ baseSha: "head-sha" }),
    });

    const blocked = await routeJson(
      stateDir,
      "/api/project-session/close?projectId=melee",
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
      action_id: "session.close",
      enabled: false,
      blocked_by: [{ code: "unshipped_work" }],
      confirmation_required: true,
      result: null,
    });

    seedNamedAnchor(stateDir);
    const unconfirmed = await routeJson(stateDir, "/api/project-session/close?projectId=melee", {
      method: "POST",
    });
    expect(unconfirmed.response.status).toBe(409);
    expect(unconfirmed.data).toMatchObject({
      action_id: "session.close",
      enabled: true,
      blocked_by: [],
      confirmation_required: true,
      error: "session.close requires operator confirmation",
      result: null,
    });

    const closed = await routeJson(stateDir, "/api/project-session/close?projectId=melee", {
      method: "POST",
      body: JSON.stringify({ aheadOfBase: 99, confirmed: true, worktreeDirtyBeyondHead: true }),
    });
    expect(closed.response.status).toBe(200);
    expect(closed.data).toMatchObject({
      action_id: "session.close",
      enabled: true,
      blocked_by: [],
      confirmation_required: true,
      result: { closed: true, session: { status: "closed" } },
    });
  });

  test("routes legacy /complete through the lease and unshipped-work close gates", async () => {
    const stateDir = tempStateDir();
    await routeJson(stateDir, "/api/project-session/new?projectId=melee", {
      method: "POST",
      body: JSON.stringify({ baseSha: "head-sha" }),
    });
    const leaseStore = openState(stateDir);
    const session = getActiveProjectSession(leaseStore.db, "melee");
    if (!session) throw new Error("expected an active melee session");
    const run = createRun(
      leaseStore,
      "matched_code_percent",
      100,
      1,
      { projectId: "melee", stateDir },
      { baseRevision: "head-sha", sessionUuid: session.session_uuid },
    );
    initializeProjectState(leaseStore, { projectId: "melee", traceId: "trace-project-melee" });
    const dispatch = requestDispatch(leaseStore, {
      projectId: "melee",
      kind: "run",
      workflowId: run.id,
      reason: "test complete gate",
      commandId: "command-complete-gate-dispatch",
      correlationId: run.id,
      actor: "operator",
    });
    if (dispatch.queued) throw new Error("expected a free dispatch lease");
    leaseStore.db.close();

    const leaseBlocked = await routeJson(stateDir, "/api/project-session/complete?projectId=melee", {
      method: "POST",
    });
    expect(leaseBlocked.response.status).toBe(409);
    expect(leaseBlocked.data).toMatchObject({
      action_id: "session.close",
      blocked_by: expect.arrayContaining([expect.objectContaining({ code: "dispatch_lease_held" })]),
      result: null,
    });

    const releaseStore = openState(stateDir);
    releaseDispatch(releaseStore, {
      projectId: "melee",
      leaseId: dispatch.leaseId,
      commandId: "command-complete-gate-release",
      correlationId: run.id,
      actor: "operator",
    });
    releaseStore.db.close();

    const workBlocked = await routeJson(
      stateDir,
      "/api/project-session/complete?projectId=melee",
      { method: "POST" },
      { campaignStatus: () => ({ aheadOfBase: 1, head: { dirty: false } }) },
    );
    expect(workBlocked.response.status).toBe(409);
    expect(workBlocked.data).toMatchObject({ blocked_by: [{ code: "unshipped_work" }], result: null });

    seedNamedAnchor(stateDir);
    const closed = await routeJson(stateDir, "/api/project-session/complete?projectId=melee", {
      method: "POST",
      body: JSON.stringify({ confirmed: true }),
    });
    expect(closed.response.status).toBe(200);
    expect(closed.data).toMatchObject({
      action_id: "session.close",
      confirmation_required: true,
      result: { closed: true, session: { status: "closed" } },
    });
    const eventStore = openState(stateDir);
    expect(
      listProjectEvents(eventStore.db, { projectId: "melee" }).filter(
        (event) => event.eventType === "session.closed",
      ),
    ).toHaveLength(1);
    eventStore.db.close();
  });

  test("uses the same canonical session worktree root as the dashboard projection", async () => {
    const stateDir = tempStateDir();
    const canonicalRepoRoot = join(stateDir, "sessions", "session-current");
    await routeJson(stateDir, "/api/project-session/new?projectId=melee", {
      method: "POST",
      body: JSON.stringify({ baseSha: "head-sha" }),
    });
    const sessionStore = openState(stateDir);
    const session = getActiveProjectSession(sessionStore.db, "melee");
    if (!session) throw new Error("expected an active session");
    transitionProjectSession(sessionStore.db, session.id, {
      actor: "runner",
      commandId: "command-test-session-worktree",
      correlationId: session.session_uuid,
      eventType: "session.preparing_subphase_updated",
      expectedRevision: session.revision,
      patch: {
        preparing_state_json: {
          ...session.preparing_state_json,
          sync: { sessionCurrentWorktreePath: canonicalRepoRoot },
        },
      },
      payload: { subphase: session.preparing_state_json.subphase },
    });
    sessionStore.db.close();
    const seenRepoRoots: string[] = [];
    seedNamedAnchor(stateDir);

    const closed = await routeJson(
      stateDir,
      "/api/project-session/close?projectId=melee",
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
