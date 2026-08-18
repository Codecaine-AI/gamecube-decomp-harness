import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  gameEventContract,
  validateRegisteredGameEvent,
} from "@server/core/harness-state/event-registry.js";
import { listGameEvents, newSpanId, type JsonObject } from "@server/core/harness-state/events.js";
import { openState, type StateStore } from "@server/core/orchestrator-state";
import { emitSandboxCreatedEvent, emitSandboxDeletedEvent } from "./sandbox-events.js";

const roots: string[] = [];
const stores: StateStore[] = [];

function fixture(): StateStore {
  const root = mkdtempSync(join(tmpdir(), "sandbox-events-"));
  roots.push(root);
  const store = openState(root);
  stores.push(store);
  return store;
}

afterEach(() => {
  for (const store of stores.splice(0)) store.db.close();
  for (const root of roots.splice(0)) rmSync(root, { force: true, recursive: true });
});

describe("sandbox game events", () => {
  test("registers closed lifecycle contracts for the sandbox subject", () => {
    const created = gameEventContract("sandbox.created");
    expect(created).toMatchObject({
      subjectKinds: ["sandbox"],
      classification: "lifecycle",
      allowedActors: ["operator", "runner"],
      extras: "forbid",
    });
    expect(Object.keys(created.payloadFields)).toEqual([
      "sandbox_id",
      "snapshot",
      "cpu",
      "memory_gib",
      "disk_gib",
      "job_id",
      "claim_id",
      "worker_state_id",
    ]);

    const deleted = gameEventContract("sandbox.deleted");
    expect(deleted).toMatchObject({
      subjectKinds: ["sandbox"],
      classification: "lifecycle",
      allowedActors: ["operator", "runner"],
      extras: "forbid",
    });
    expect(deleted.payloadFields.job_id).toEqual({ type: "string", required: false, nullable: false });
    expect(deleted.payloadFields.claim_id).toEqual({ type: "string", required: false, nullable: false });
  });

  test("emitters append exact created and deleted payloads with shared tracing", () => {
    const store = fixture();
    const linkage = {
      gameId: "melee",
      sandboxId: "sandbox-1",
      correlationId: "job-1",
      causationId: "event-job-claimed",
      traceId: "trace-job-1",
      parentSpanId: newSpanId(),
      occurredAt: "2026-08-18T12:00:00.000Z",
    };
    emitSandboxCreatedEvent(store, {
      ...linkage,
      actor: "operator",
      snapshot: "melee-worker-v1",
      cpu: 2,
      memoryGiB: 4,
      diskGiB: 5,
      jobId: "job-1",
      claimId: "claim-1",
      workerStateId: "worker-state-1",
    });
    emitSandboxDeletedEvent(store, {
      ...linkage,
      reason: "settlement",
      jobId: "job-1",
      claimId: "claim-1",
    });

    const events = listGameEvents(store.db);
    expect(events.map((event) => ({
      eventType: event.eventType,
      subjectKind: event.subjectKind,
      subjectId: event.subjectId,
      correlationId: event.correlationId,
      causationId: event.causationId,
      traceId: event.traceId,
      parentSpanId: event.parentSpanId,
      actor: event.actor,
      payload: event.payload,
    }))).toEqual([
      {
        eventType: "sandbox.created",
        subjectKind: "sandbox",
        subjectId: "sandbox-1",
        correlationId: "job-1",
        causationId: "event-job-claimed",
        traceId: "trace-job-1",
        parentSpanId: linkage.parentSpanId,
        actor: "operator",
        payload: {
          sandbox_id: "sandbox-1",
          snapshot: "melee-worker-v1",
          cpu: 2,
          memory_gib: 4,
          disk_gib: 5,
          job_id: "job-1",
          claim_id: "claim-1",
          worker_state_id: "worker-state-1",
        },
      },
      {
        eventType: "sandbox.deleted",
        subjectKind: "sandbox",
        subjectId: "sandbox-1",
        correlationId: "job-1",
        causationId: "event-job-claimed",
        traceId: "trace-job-1",
        parentSpanId: linkage.parentSpanId,
        actor: "runner",
        payload: {
          sandbox_id: "sandbox-1",
          reason: "settlement",
          job_id: "job-1",
          claim_id: "claim-1",
        },
      },
    ]);
  });

  test("validation rejects subject, actor, missing facts, and payload extras", () => {
    const payload = {
      sandbox_id: "sandbox-1",
      snapshot: "melee-worker-v1",
      cpu: 2,
      memory_gib: 4,
      disk_gib: 5,
      job_id: "job-1",
      claim_id: "claim-1",
      worker_state_id: "worker-state-1",
    } satisfies JsonObject;
    expect(() => validateRegisteredGameEvent("sandbox.created", "job", "runner", payload)).toThrow(
      "does not accept subject kind job",
    );
    expect(() => validateRegisteredGameEvent("sandbox.created", "sandbox", "guardian", payload)).toThrow(
      "does not allow actor guardian",
    );
    expect(() => validateRegisteredGameEvent("sandbox.created", "sandbox", "runner", {
      ...payload,
      snapshot: undefined,
    } as unknown as JsonObject)).toThrow("payload fact snapshot must not be undefined");
    expect(() => validateRegisteredGameEvent("sandbox.deleted", "sandbox", "operator", {
      sandbox_id: "sandbox-1",
      reason: "reap",
      undocumented: true,
    })).toThrow("payload contains unregistered facts: undocumented");
  });

  test("deleted emitter omits unavailable job and claim identifiers", () => {
    const store = fixture();
    emitSandboxDeletedEvent(store, {
      gameId: "melee",
      sandboxId: "sandbox-orphan",
      correlationId: "reconciliation-1",
      causationId: "startup-1",
      traceId: "trace-reconciliation-1",
      reason: "reconciliation",
    });
    expect(listGameEvents(store.db)[0]?.payload).toEqual({
      sandbox_id: "sandbox-orphan",
      reason: "reconciliation",
    });
  });
});
