import { describe, expect, test } from "bun:test";
import { handleKnowledgeApiRoute, type KnowledgeActionProjection, type KnowledgeApiRouteDeps } from "./knowledge.js";

function projection(enabled = true): KnowledgeActionProjection {
  return {
    action_id: "knowledge.process",
    subject_kind: "project",
    subject_id: "knowledge-queue",
    enabled,
    blocked_by: enabled
      ? []
      : [{
          code: "knowledge_queue_empty",
          message: "No background knowledge jobs are ready to process.",
          source_kind: "knowledge",
          source_id: "knowledge-queue",
          recoverable: true,
        }],
    expected_transition: "queued → processing → published",
    confirmation_required: false,
  };
}

function deps(overrides: Partial<KnowledgeApiRouteDeps> = {}): KnowledgeApiRouteDeps {
  return {
    action: () => projection(),
    applyStandardEdit: () => ({ ok: true }),
    json: (data, init) => Response.json(data, init),
    loadStandardsPayload: () => ({ standards: [] }),
    triggerBackgroundKnowledgeProcess: async () => ({ outcome: "succeeded", jobId: "job-1", revision: 1 }),
    requestPaths: () => ({ project: { projectId: "melee" }, stateDir: "/tmp/state" }),
    ...overrides,
  };
}

describe("handleKnowledgeApiRoute knowledge.process", () => {
  test("re-derives availability and runs the shared process seam", async () => {
    let calls = 0;
    let receivedBody: Record<string, unknown> | null = null;
    const routeDeps = deps({
      triggerBackgroundKnowledgeProcess: async (paths, body) => {
        calls += 1;
        receivedBody = body;
        expect(paths.stateDir).toBe("/tmp/state");
        return { outcome: "succeeded", jobId: "job-1", revision: 2 };
      },
    });
    const request = new Request("http://localhost/api/knowledge/process", {
      method: "POST",
      body: JSON.stringify({ projectId: "melee" }),
      headers: { "content-type": "application/json" },
    });

    const response = await handleKnowledgeApiRoute(request, new URL(request.url), routeDeps);

    expect(response?.status).toBe(200);
    expect(calls).toBe(1);
    expect(receivedBody as unknown).toEqual({ projectId: "melee" });
    expect(await response?.json()).toMatchObject({
      action_id: "knowledge.process",
      enabled: true,
      result: { outcome: "succeeded", revision: 2 },
    });
  });

  test("returns the projection blockers and never claims a disabled queue", async () => {
    let invoked = false;
    const routeDeps = deps({
      action: () => projection(false),
      triggerBackgroundKnowledgeProcess: async () => {
        invoked = true;
        return { outcome: "succeeded" };
      },
    });
    const request = new Request("http://localhost/api/knowledge/process", { method: "POST" });

    const response = await handleKnowledgeApiRoute(request, new URL(request.url), routeDeps);

    expect(response?.status).toBe(409);
    expect(invoked).toBe(false);
    expect(await response?.json()).toMatchObject({
      action_id: "knowledge.process",
      enabled: false,
      blocked_by: [{ code: "knowledge_queue_empty" }],
      result: null,
    });
  });

  test("re-projects a lease race as a disabled blocker", async () => {
    let projections = 0;
    let invoked = false;
    const routeDeps = deps({
      action: () => {
        projections += 1;
        return projection(projections === 1);
      },
      triggerBackgroundKnowledgeProcess: async () => {
        invoked = true;
        throw new Error("materializer lease held");
      },
    });
    const request = new Request("http://localhost/api/knowledge/process", { method: "POST" });

    const response = await handleKnowledgeApiRoute(request, new URL(request.url), routeDeps);

    expect(response?.status).toBe(409);
    expect(invoked).toBe(true);
    expect(projections).toBe(2);
    expect(await response?.json()).toMatchObject({
      enabled: false,
      blocked_by: [{ code: "knowledge_queue_empty" }],
      error: "materializer lease held",
    });
  });

  test("preserves the standards route", async () => {
    const request = new Request("http://localhost/api/standards");
    const response = await handleKnowledgeApiRoute(request, new URL(request.url), deps());
    expect(response?.status).toBe(200);
    expect(await response?.json()).toEqual({ standards: [] });
  });
});
