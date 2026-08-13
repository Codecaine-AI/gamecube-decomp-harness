import { describe, expect, test } from "bun:test";
import { handleSyncApiRoute, type SyncApiRouteDeps } from "./sync.js";
import type { SyncActionId, SyncActionProjection } from "@server/core/session-runtime/phases/sync/runtime.js";

function projection(actionId: SyncActionId, enabled = true): SyncActionProjection {
  return {
    action_id: actionId,
    subject_kind: "sync",
    subject_id: "sync-1",
    enabled,
    blocked_by: enabled ? [] : [{
      code: "fixture_blocker",
      message: "fixture blocked",
      source_kind: "sync",
      source_id: "sync-1",
      recoverable: true,
    }],
    expected_transition: `${actionId} transition`,
    confirmation_required: actionId === "sync.publish" || actionId === "sync.cancel" || actionId === "sync.recover",
  };
}

function deps(overrides: Partial<SyncApiRouteDeps> = {}): SyncApiRouteDeps {
  return {
    action: (_body, actionId) => projection(actionId),
    cancel: async () => ({ status: "cancelled" }),
    json: (data, init) => Response.json(data, init),
    publish: async () => ({ sync: { status: "published" } }),
    recover: async () => ({ status: "ingesting" }),
    resolveConflict: async () => ({ status: "reconciling" }),
    start: async () => ({ queued: false, run_draining: false, sync: { status: "ingesting" } }),
    ...overrides,
  };
}

describe("sync API command routes", () => {
  test.each([
    ["/api/project/sync", "sync.start", false],
    ["/api/sync/start", "sync.start", false],
    ["/api/sync/resolve-conflict", "sync.resolve_conflict", false],
    ["/api/sync/publish", "sync.publish", true],
    ["/api/sync/cancel", "sync.cancel", true],
    ["/api/sync/recover", "sync.recover", true],
  ] as const)("routes %s through %s with its ActionDecision", async (path, actionId, confirmed) => {
    const called: string[] = [];
    const routeDeps = deps({
      cancel: async () => { called.push("cancel"); return { status: "cancelled" }; },
      publish: async () => { called.push("publish"); return { sync: { status: "published" } }; },
      recover: async () => { called.push("recover"); return { status: "ingesting" }; },
      resolveConflict: async () => { called.push("resolve"); return { status: "reconciling" }; },
      start: async () => { called.push("start"); return { queued: true, run_draining: true, sync: { status: "requested" } }; },
    });
    const request = new Request(`http://localhost${path}`, {
      method: "POST",
      body: JSON.stringify({ ...(confirmed ? { confirmed: true } : {}), projectId: "melee" }),
      headers: { "content-type": "application/json" },
    });

    const response = await handleSyncApiRoute(request, new URL(request.url), routeDeps);
    expect(response?.status).toBe(200);
    expect(await response?.json()).toMatchObject({
      action_id: actionId,
      enabled: true,
      confirmation_required: confirmed,
    });
    expect(called).toHaveLength(1);
  });

  test("returns the blocker decision without executing a disabled command", async () => {
    let executed = false;
    const routeDeps = deps({
      action: (_body, actionId) => projection(actionId, false),
      start: async () => { executed = true; return {}; },
    });
    const request = new Request("http://localhost/api/sync/start", { method: "POST" });
    const response = await handleSyncApiRoute(request, new URL(request.url), routeDeps);

    expect(response?.status).toBe(409);
    expect(await response?.json()).toMatchObject({
      action_id: "sync.start",
      enabled: false,
      blocked_by: [{ code: "fixture_blocker" }],
      result: null,
    });
    expect(executed).toBe(false);
  });

  test("enforces confirmation before publish", async () => {
    let executed = false;
    const routeDeps = deps({ publish: async () => { executed = true; return {}; } });
    const request = new Request("http://localhost/api/sync/publish", { method: "POST" });
    const response = await handleSyncApiRoute(request, new URL(request.url), routeDeps);

    expect(response?.status).toBe(409);
    expect(await response?.json()).toMatchObject({
      action_id: "sync.publish",
      confirmation_required: true,
      error: "sync.publish requires operator confirmation",
    });
    expect(executed).toBe(false);
  });

  test("returns the post-command blocker decision when publication detects staleness", async () => {
    let projected = 0;
    const routeDeps = deps({
      action: (_body, actionId) => projection(actionId, projected++ === 0),
      publish: async () => ({ sync: { status: "blocked", blockers: [{ code: "upstream_moved_after_validation" }] } }),
    });
    const request = new Request("http://localhost/api/sync/publish", {
      method: "POST",
      body: JSON.stringify({ confirmed: true }),
    });
    const response = await handleSyncApiRoute(request, new URL(request.url), routeDeps);

    expect(response?.status).toBe(409);
    expect(await response?.json()).toMatchObject({
      action_id: "sync.publish",
      enabled: false,
      blocked_by: [{ code: "fixture_blocker" }],
      result: { sync: { status: "blocked" } },
    });
  });
});
