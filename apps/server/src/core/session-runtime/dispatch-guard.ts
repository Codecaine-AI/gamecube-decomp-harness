import { randomUUID } from "node:crypto";
import {
  getProjectState,
  initializeProjectState,
  releaseDispatch,
  requestDispatch,
  requireActiveLease,
  requireLease,
  type DispatchLease,
  type DispatchKind,
  type EventActor,
} from "@server/core/project-state";
import { openState } from "@server/core/orchestrator-state";
import { pauseRun } from "@server/core/session-runtime/phases/running/run-control.js";

export interface DispatchGuardContext {
  project?: { projectId: string } | null;
  stateDir: string;
}

export interface DispatchGuardInput {
  actor?: EventActor;
  beginHandoffOnQueue?: boolean;
  commandId?: string;
  correlationId?: string;
  kind: DispatchKind;
  projectId?: string;
  reason: string;
  workflowId: string;
}

export type DispatchLeaseRevalidator = () => DispatchLease;

export class DispatchLeaseUnavailableError extends Error {
  readonly blockedBy: { kind: DispatchKind; workflowId: string; leaseId: string };

  constructor(blockedBy: { kind: DispatchKind; workflowId: string; leaseId: string }) {
    super(`Dispatch lease is held by ${blockedBy.kind}:${blockedBy.workflowId}`);
    this.name = "DispatchLeaseUnavailableError";
    this.blockedBy = blockedBy;
  }
}

function projectIdFor(context: DispatchGuardContext, input: DispatchGuardInput): string {
  const projectId = input.projectId ?? context.project?.projectId;
  if (!projectId) throw new Error(`${input.kind} dispatch requires a project id`);
  return projectId;
}

/**
 * Runs one checkout-mutating workflow section under the canonical dispatch
 * lease. Acquisition, fencing, and release all go through project-state's
 * public API; the workflow body never reaches into project_state directly.
 */
export async function withDispatchLease<T>(
  context: DispatchGuardContext,
  input: DispatchGuardInput,
  operation: (leaseId: string, revalidateLease: DispatchLeaseRevalidator) => Promise<T>,
): Promise<T> {
  const projectId = projectIdFor(context, input);
  const actor = input.actor ?? "operator";
  const commandId = input.commandId ?? `command-${input.kind}-${randomUUID()}`;
  const correlationId = input.correlationId ?? input.workflowId;
  const store = openState(context.stateDir);
  let leaseId: string | null = null;
  try {
    initializeProjectState(store, { projectId, traceId: `trace-project-${projectId}` });
    const current = getProjectState(store, projectId)?.active_workflow;
    if (
      input.beginHandoffOnQueue &&
      current?.kind === input.kind &&
      current.workflow_id === input.workflowId &&
      current.status === "active"
    ) {
      leaseId = current.lease_id;
      requireActiveLease(store, leaseId, projectId);
      const revalidateLease: DispatchLeaseRevalidator = () => requireLease(store, leaseId!, projectId);
      return await operation(leaseId, revalidateLease);
    }
    const decision = requestDispatch(store, {
      actor,
      commandId,
      correlationId,
      kind: input.kind,
      projectId,
      reason: input.reason,
      workflowId: input.workflowId,
    });
    if (decision.queued) {
      if (input.beginHandoffOnQueue) {
        if (actor !== "operator") throw new Error("Dispatch handoff activation is operator-only");
        const holder = decision.blockedBy;
        if (holder.kind !== "run") {
          throw new Error(
            `Cannot hand off ${holder.kind}:${holder.workflow_id} to ${input.kind}:${input.workflowId}; only the active run supports operator handoff`,
          );
        }
        const requested = holder.requested_handoff;
        if (holder.status === "draining") {
          if (
            requested?.target_kind !== input.kind ||
            requested.target_workflow_id !== input.workflowId
          ) {
            throw new Error(
              `Dispatch lease is already draining to ${requested?.target_kind ?? "unknown"}:${requested?.target_workflow_id ?? "unknown"}`,
            );
          }
        } else {
          if (holder.status !== "active") {
            throw new Error(
              `Cannot begin dispatch handoff while ${holder.kind}:${holder.workflow_id} is ${holder.status}`,
            );
          }
          pauseRun({
            actor,
            commandId: `command-${input.kind}-handoff-${randomUUID()}`,
            correlationId,
            reason: input.reason,
            runId: holder.workflow_id,
            store,
            targetKind: input.kind,
            targetWorkflowId: input.workflowId,
          });
        }
      }
      throw new DispatchLeaseUnavailableError({
        kind: decision.blockedBy.kind,
        workflowId: decision.blockedBy.workflow_id,
        leaseId: decision.blockedBy.lease_id,
      });
    }
    leaseId = decision.leaseId;
    requireActiveLease(store, leaseId, projectId);
    const revalidateLease: DispatchLeaseRevalidator = () => requireLease(store, leaseId!, projectId);
    return await operation(leaseId, revalidateLease);
  } finally {
    try {
      if (leaseId) {
        releaseDispatch(store, {
          actor,
          commandId: `command-${input.kind}-release-${randomUUID()}`,
          correlationId,
          leaseId,
          projectId,
        });
      }
    } finally {
      store.db.close();
    }
  }
}
