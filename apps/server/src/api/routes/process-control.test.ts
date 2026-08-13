import { describe, expect, test } from "bun:test";
import { handleProcessControlApiRoute, type ProcessControlApiRouteDeps } from "./process-control.js";

function startDeps(overrides: Partial<ProcessControlApiRouteDeps> = {}): ProcessControlApiRouteDeps {
  return {
    drainManaged: async () => ({}),
    finishEpochNow: async () => ({}),
    json: (data: unknown, init?: ResponseInit) => Response.json(data, init),
    processStatus: () => ({}),
    requestPaths: () => ({ stateDir: "/state" }),
    runActionProjection: () => ({
      action_id: "run.start",
      subject_kind: "run",
      subject_id: "run-1",
      enabled: true,
      blocked_by: [],
      expected_transition: "ready → active",
      confirmation_required: false,
    }),
    startManagedProcess: async () => Response.json({ started: true, leaseId: "lease-1" }),
    stopManaged: async () => ({}),
    ...overrides,
  } as ProcessControlApiRouteDeps;
}

describe("handleProcessControlApiRoute run.start", () => {
  test("wraps the established process start result in its ActionProjection", async () => {
    const received: Record<string, unknown>[] = [];
    const request = new Request("http://localhost/api/process/start", {
      body: JSON.stringify({ runId: "run-1" }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    const response = await handleProcessControlApiRoute(request, new URL(request.url), startDeps({
      startManagedProcess: async (body) => {
        received.push(body);
        return Response.json({ started: true, leaseId: "lease-1" });
      },
    }));

    expect(received).toEqual([{ runId: "run-1" }]);
    expect(response?.status).toBe(200);
    expect(await response?.json()).toMatchObject({
      action_id: "run.start",
      enabled: true,
      confirmation_required: false,
      result: { started: true, leaseId: "lease-1" },
    });
  });

  test("returns the projected blockers without starting a process", async () => {
    let invoked = false;
    const request = new Request("http://localhost/api/process/start", { method: "POST" });
    const response = await handleProcessControlApiRoute(request, new URL(request.url), startDeps({
      runActionProjection: () => ({
        action_id: "run.start",
        subject_kind: "run",
        subject_id: "run-1",
        enabled: false,
        blocked_by: [{ code: "dispatch_lease_held" }],
        expected_transition: "ready → active",
        confirmation_required: false,
      }) as ReturnType<ProcessControlApiRouteDeps["runActionProjection"]>,
      startManagedProcess: async () => {
        invoked = true;
        return Response.json({ started: true });
      },
    }));

    expect(response?.status).toBe(409);
    expect(invoked).toBe(false);
    expect(await response?.json()).toMatchObject({
      action_id: "run.start",
      enabled: false,
      blocked_by: [{ code: "dispatch_lease_held" }],
      result: null,
    });
  });

  test("projects typed immutable-configuration blockers returned by process startup", async () => {
    const blocker = {
      code: "run_configuration_conflict",
      message: "Requested maxWorkers conflicts with immutable run configuration desired_workers.",
      source_kind: "run",
      source_id: "run-1",
      recoverable: false,
    };
    const request = new Request("http://localhost/api/process/start", {
      body: JSON.stringify({ runId: "run-1", maxWorkers: 8 }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    const response = await handleProcessControlApiRoute(request, new URL(request.url), startDeps({
      startManagedProcess: async () => Response.json({ error: "conflict", blocked_by: [blocker] }, { status: 409 }),
    }));

    expect(response?.status).toBe(409);
    expect(await response?.json()).toMatchObject({
      action_id: "run.start",
      enabled: false,
      blocked_by: [blocker],
      result: { error: "conflict", blocked_by: [blocker] },
    });
  });
});
