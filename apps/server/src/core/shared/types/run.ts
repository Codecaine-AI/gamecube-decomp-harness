export type RunStatus =
  | "draft"
  | "ready"
  | "active"
  | "draining"
  | "paused"
  | "completed"
  | "failed"
  | "cancelled";

export type RunSchedulerCondition = "idle" | "planning" | "dispatching" | "waiting" | "boundary" | "blocked";

export interface RunInputs {
  base_revision: string;
  policy_revision: string;
  starting_knowledge_revision: string;
  configuration_snapshot: Record<string, unknown>;
}

export interface RunBlocker {
  code: string;
  message: string;
  source_kind: string;
  source_id: string;
  recoverable: boolean;
}

export interface RunProjectMetadata {
  projectId?: string;
  projectKind?: string;
  repoRoot?: string;
  stateDir?: string;
  graphDbPath?: string;
  descriptorPath?: string;
  localOverridePath?: string;
}

export interface RunRecord {
  id: string;
  projectId: string | null;
  goalKind: string;
  goalValue: number;
  desiredWorkers: number;
  status: RunStatus;
  revision: number;
  traceId: string;
  causedByEventId: string | null;
  blockers: RunBlocker[];
  headRevision: string | null;
  sessionUuid: string | null;
  inputs: RunInputs | null;
  stopRequest: Record<string, unknown> | null;
  terminalReason: string | null;
  schedulerCondition: RunSchedulerCondition | null;
  createdAt: string;
  project?: RunProjectMetadata;
}
