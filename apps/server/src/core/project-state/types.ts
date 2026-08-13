import type { EventActor } from "./events.js";

export type DispatchKind = "run" | "pr" | "sync";
export type DispatchLeaseStatus = "acquiring" | "active" | "draining" | "blocked" | "releasing";

export interface Blocker {
  code: string;
  message: string;
  source_kind: string;
  source_id: string;
  recoverable: boolean;
}

export interface DispatchHandoffRequest {
  target_kind: DispatchKind;
  target_workflow_id: string;
  reason: string;
  requested_at: string;
}

export interface DispatchLease {
  kind: DispatchKind;
  workflow_id: string;
  lease_id: string;
  status: DispatchLeaseStatus;
  acquired_at: string;
  heartbeat_at: string;
  requested_handoff?: DispatchHandoffRequest;
  blockers: Blocker[];
}

export interface QueuedDispatchRequest {
  kind: DispatchKind;
  workflow_id: string;
  reason: string;
  requested_at: string;
  requested_by: EventActor;
}

export interface ProjectState {
  project_id: string;
  revision: number;
  active_workflow: DispatchLease | null;
  blockers: Blocker[];
  queued_dispatch_requests: QueuedDispatchRequest[];
  trace_id: string;
  caused_by_event_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface InitializeProjectStateInput {
  projectId: string;
  traceId: string;
  now?: string;
}

export interface TransitionContext {
  projectId?: string;
  commandId: string;
  actor: EventActor;
  correlationId?: string;
  spanId?: string;
  now?: string;
}

export interface RequestDispatchInput extends TransitionContext {
  kind: DispatchKind;
  workflowId: string;
  reason: string;
}

export interface HeartbeatDispatchInput {
  leaseId: string;
  projectId?: string;
  now?: string;
}

export interface BeginDrainInput extends TransitionContext {
  leaseId: string;
  /** Omitted when the current workflow is parking rather than handing off. */
  targetKind?: DispatchKind;
  /** Omitted when the current workflow is parking rather than handing off. */
  targetWorkflowId?: string;
  reason: string;
}

export interface ReleaseDispatchInput extends TransitionContext {
  leaseId: string;
  handoffSnapshotId?: string;
}

export interface RecoverDispatchInput extends TransitionContext {
  leaseId: string;
  recoveryReason: string;
  cancelledSubjectIds: string[];
}

export interface DispatchAcquiredDecision {
  queued: false;
  leaseId: string;
  state: ProjectState;
}

export interface DispatchQueuedDecision {
  queued: true;
  blockedBy: DispatchLease;
  state: ProjectState;
}

export type RequestDispatchDecision = DispatchAcquiredDecision | DispatchQueuedDecision;

export interface DispatchRecoveryResult {
  recovered: true;
  cancelledSubjectIds: string[];
  state: ProjectState;
}
