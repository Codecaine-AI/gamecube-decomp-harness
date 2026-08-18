import type { StateStore } from "@server/core/orchestrator-state";
import {
  appendGameEvent,
  eventSpan,
  type AppendedGameEvent,
  type JsonObject,
} from "@server/core/harness-state/events.js";

export type SandboxEventActor = "operator" | "runner";
export type SandboxDeleteReason = "settlement" | "reap" | "reconciliation" | "provision_failure";

interface SandboxEventContext {
  gameId: string;
  sandboxId: string;
  correlationId: string;
  causationId: string;
  traceId: string;
  actor?: SandboxEventActor;
  occurredAt?: string;
  parentSpanId?: string | null;
}

export interface SandboxCreatedEventInput extends SandboxEventContext {
  snapshot: string;
  cpu: number;
  memoryGiB: number;
  diskGiB: number;
  jobId: string;
  claimId: string;
  workerStateId: string;
}

export interface SandboxDeletedEventInput extends SandboxEventContext {
  reason: SandboxDeleteReason;
  jobId?: string;
  claimId?: string;
}

function appendSandboxEvent(
  store: StateStore,
  input: SandboxEventContext,
  eventType: "sandbox.created" | "sandbox.deleted",
  payload: JsonObject,
): AppendedGameEvent {
  return appendGameEvent(store.db, {
    eventType,
    gameId: input.gameId,
    subjectKind: "sandbox",
    subjectId: input.sandboxId,
    correlationId: input.correlationId,
    causationId: input.causationId,
    traceId: input.traceId,
    ...eventSpan(input.parentSpanId),
    actor: input.actor ?? "runner",
    occurredAt: input.occurredAt,
    payload,
  });
}

export function emitSandboxCreatedEvent(
  store: StateStore,
  input: SandboxCreatedEventInput,
): AppendedGameEvent {
  return appendSandboxEvent(store, input, "sandbox.created", {
    sandbox_id: input.sandboxId,
    snapshot: input.snapshot,
    cpu: input.cpu,
    memory_gib: input.memoryGiB,
    disk_gib: input.diskGiB,
    job_id: input.jobId,
    claim_id: input.claimId,
    worker_state_id: input.workerStateId,
  });
}

export function emitSandboxDeletedEvent(
  store: StateStore,
  input: SandboxDeletedEventInput,
): AppendedGameEvent {
  return appendSandboxEvent(store, input, "sandbox.deleted", {
    sandbox_id: input.sandboxId,
    reason: input.reason,
    ...(input.jobId === undefined ? {} : { job_id: input.jobId }),
    ...(input.claimId === undefined ? {} : { claim_id: input.claimId }),
  });
}
