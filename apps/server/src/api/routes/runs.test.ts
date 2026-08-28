import { describe, expect, test } from "bun:test";
import { handleRunsApiRoute, type RunsApiRouteDeps } from "./runs.js";

describe("handleRunsApiRoute", () => {
  test("routes an explicitly confirmed game lease force-release", async () => {
    const received: Record<string, unknown>[] = [];
    const deps = {
      forceReleaseLease: (body: Record<string, unknown>) => {
        received.push(body);
        return { released: true };
      },
      json: (data: unknown, init?: ResponseInit) => Response.json(data, init),
    } as unknown as RunsApiRouteDeps;
    const response = await handleRunsApiRoute(
      new Request("http://localhost/api/run/force-release-lease", {
        body: JSON.stringify({ confirmed: true, gameId: "melee" }),
        headers: { "content-type": "application/json" },
        method: "POST",
      }),
      new URL("http://localhost/api/run/force-release-lease"),
      deps,
    );

    expect(response?.status).toBe(200);
    expect(received).toEqual([{ confirmed: true, gameId: "melee" }]);
    expect(await response?.json()).toEqual({ released: true });
  });

  test.each([
    [{ confirmed: true }, 400, "requires gameId"],
    [{ gameId: "melee" }, 409, "requires operator confirmation"],
  ] as const)("refuses an invalid force-release request %#", async (body, status, message) => {
    const deps = {
      forceReleaseLease: () => { throw new Error("must not execute"); },
      json: (data: unknown, init?: ResponseInit) => Response.json(data, init),
    } as unknown as RunsApiRouteDeps;
    const response = await handleRunsApiRoute(
      new Request("http://localhost/api/run/force-release-lease", {
        body: JSON.stringify(body),
        headers: { "content-type": "application/json" },
        method: "POST",
      }),
      new URL("http://localhost/api/run/force-release-lease"),
      deps,
    );

    expect(response?.status).toBe(status);
    expect((await response?.json()).error).toContain(message);
  });

  test.each([
    ["/api/run/resume", "resumeRun", "run.resume"],
    ["/api/run/hard-stop", "hardStopRun", "run.hard_stop"],
    ["/api/run/cancel", "cancelRun", "run.cancel"],
    ["/api/run/recover", "recoverRun", "run.recover"],
  ] as const)("routes %s to %s with its server action decision", async (pathname, method, actionId) => {
    const received: Array<{ method: string; body: Record<string, unknown> }> = [];
    const deps = {
      json: (data: unknown) => Response.json(data),
      runActionProjection: () => ({
        action_id: actionId,
        subject_kind: "run",
        subject_id: "run-1",
        enabled: true,
        blocked_by: [],
        expected_transition: `${actionId} transition`,
        confirmation_required: actionId === "run.hard_stop" || actionId === "run.cancel" || actionId === "run.recover",
      }),
      [method]: async (body: Record<string, unknown>) => {
        received.push({ method, body });
        return { accepted: method };
      },
    } as unknown as RunsApiRouteDeps;
    const response = await handleRunsApiRoute(
      new Request(`http://localhost${pathname}`, {
        body: JSON.stringify({ confirmed: true, runId: "run-1" }),
        headers: { "content-type": "application/json" },
        method: "POST",
      }),
      new URL(`http://localhost${pathname}`),
      deps,
    );

    expect(received).toEqual([{ method, body: { confirmed: true, runId: "run-1" } }]);
    expect(await response?.json()).toMatchObject({
      action_id: actionId,
      subject_kind: "run",
      subject_id: "run-1",
      enabled: true,
      blocked_by: [],
      result: { accepted: method },
    });
  });

  test("returns a blocker decision without invoking the command", async () => {
    let invoked = false;
    const deps = {
      json: (data: unknown, init?: ResponseInit) => Response.json(data, init),
      resumeRun: async () => {
        invoked = true;
        return {};
      },
      runActionProjection: () => ({
        action_id: "run.resume",
        subject_kind: "run",
        subject_id: "run-1",
        enabled: false,
        blocked_by: [{ code: "run_not_paused" }],
        expected_transition: "paused → active",
        confirmation_required: false,
      }),
    } as unknown as RunsApiRouteDeps;

    const response = await handleRunsApiRoute(
      new Request("http://localhost/api/run/resume", { method: "POST" }),
      new URL("http://localhost/api/run/resume"),
      deps,
    );

    expect(response?.status).toBe(409);
    expect(invoked).toBe(false);
    expect(await response?.json()).toMatchObject({
      action_id: "run.resume",
      enabled: false,
      blocked_by: [{ code: "run_not_paused" }],
      result: null,
    });
  });

  test("requires the projected confirmation tier before invoking a destructive command", async () => {
    let invoked = false;
    const deps = {
      cancelRun: () => {
        invoked = true;
        return {};
      },
      json: (data: unknown, init?: ResponseInit) => Response.json(data, init),
      runActionProjection: () => ({
        action_id: "run.cancel",
        subject_kind: "run",
        subject_id: "run-1",
        enabled: true,
        blocked_by: [],
        expected_transition: "paused or failed → cancelled",
        confirmation_required: true,
      }),
    } as unknown as RunsApiRouteDeps;

    const response = await handleRunsApiRoute(
      new Request("http://localhost/api/run/cancel", { method: "POST" }),
      new URL("http://localhost/api/run/cancel"),
      deps,
    );

    expect(response?.status).toBe(409);
    expect(invoked).toBe(false);
    expect(await response?.json()).toMatchObject({
      action_id: "run.cancel",
      confirmation_required: true,
      error: "run.cancel requires operator confirmation",
      result: null,
    });
  });
});
