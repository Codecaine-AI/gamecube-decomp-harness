import type { EventActor } from "./events.js";

export type DispatchKind = "run" | "pr" | "sync";
export type DispatchLeaseStatus = "acquiring" | "active" | "blocked" | "releasing";

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
  requested_by: EventActor;
  request_command_id: string;
  request_root_span_id: string;
  request_event_id: string;
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
  request_command_id: string;
  request_root_span_id: string;
  request_event_id: string;
}

export interface HarnessState {
  game_id: string;
  revision: number;
  active_workflow: DispatchLease | null;
  blockers: Blocker[];
  queued_dispatch_requests: QueuedDispatchRequest[];
  trace_id: string;
  caused_by_event_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface InitializeHarnessStateInput {
  gameId: string;
  traceId: string;
  now?: string;
}

export interface TransitionContext {
  gameId?: string;
  commandId: string;
  causationId?: string;
  actor: EventActor;
  correlationId: string;
  spanId?: string;
  now?: string;
}

export interface RequestDispatchInput extends TransitionContext {
  handoffOnQueue?: boolean;
  kind: DispatchKind;
  workflowId: string;
  reason: string;
}

export interface HeartbeatDispatchInput {
  leaseId: string;
  gameId?: string;
  now?: string;
}

export interface CancelDispatchRequestInput extends TransitionContext {
  kind: DispatchKind;
  workflowId: string;
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
  acquiredEventId: string;
  state: HarnessState;
}

export interface DispatchQueuedDecision {
  queued: true;
  blockedBy: DispatchLease;
  state: HarnessState;
}

export type RequestDispatchDecision = DispatchAcquiredDecision | DispatchQueuedDecision;

export interface DispatchSuccessorActivationContext {
  actor: EventActor;
  commandId: string;
  correlationId: string;
  causationId: string;
  spanId: string;
  kind: DispatchKind;
  workflowId: string;
  leaseId: string;
}

export interface ReleaseDispatchResult {
  state: HarnessState;
  releasedEventId?: string;
  acquiredEventId?: string;
  successorActivation?: DispatchSuccessorActivationContext;
}

export interface DispatchRecoveryResult {
  recovered: true;
  cancelledSubjectIds: string[];
  state: HarnessState;
}
