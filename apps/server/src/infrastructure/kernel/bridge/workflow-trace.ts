import type { NewContainer } from "@agent-kernel/db";
import {
  TraceLevel,
  type EventData,
  type TraceEvent,
} from "@agent-kernel/protocol";

import type { MeleeKernelSpawnContext } from "./kernel.js";
import type { MeleeKernelRuntime } from "./runtime.js";
import {
  buildMeleeContainer,
  meleeAppSessionId,
  meleeWorkflowTraceEventId,
  type MeleeContainerKind,
  type MeleeProjectSessionRef,
} from "./session-mapping.js";
import type { AppTraceEventInput } from "./trace-writer.js";

export type MeleeWorkflowTraceStatus =
  | "started"
  | "completed"
  | "failed"
  | "skipped";

export interface MeleeWorkflowTraceRuntime {
  upsertSpawnContainers: MeleeKernelRuntime["upsertSpawnContainers"];
  traceWriter: Pick<MeleeKernelRuntime["traceWriter"], "createAppEvent" | "submit">;
}

export interface SubmitMeleeWorkflowTraceEventInput {
  runtime: MeleeWorkflowTraceRuntime;
  kind: Extract<
    MeleeContainerKind,
    | "session"
    | "prepare"
    | "sync-intake"
    | "intake"
    | "intake-item"
    | "intake-postmortem"
    | "intake-knowledge"
    | "pr-index"
    | "knowledge-refresh"
    | "baseline"
    | "run"
    | "pr"
    | "pr-handoff"
    | "pr-qa"
    | "pr-publication"
  >;
  projectId: string;
  sessionId: string;
  correlationId: string;
  projectEventId: string;
  causedByEventId: string | null;
  operation: string;
  status?: MeleeWorkflowTraceStatus;
  prId?: string | null;
  workingDir?: string | null;
  worktreePath?: string | null;
  detail?: string | null;
  metadata?: Record<string, unknown>;
  traceLevel?: AppTraceEventInput["traceLevel"];
  type?: string;
  timestamp?: string;
}

export interface SubmittedMeleeWorkflowTraceEvent {
  appSessionId: string;
  containerId: string;
  containers: NewContainer[];
  event: TraceEvent;
}

function containerStatus(status: MeleeWorkflowTraceStatus): NewContainer["status"] {
  switch (status) {
    case "completed":
    case "skipped":
      return "completed";
    case "failed":
      return "error";
    case "started":
      return "running";
  }
}

function eventTypePhase(phase: string): string {
  return phase.replace(/[^a-z0-9]+/gi, "_").replace(/^_+|_+$/g, "").toLowerCase() || "workflow";
}

function requiredText(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${label} must be a nonblank string`);
  return normalized;
}

function withEventStatus(
  container: NewContainer,
  status: MeleeWorkflowTraceStatus,
  timestamp?: string,
): NewContainer {
  const completedAt =
    status === "completed" || status === "failed" || status === "skipped"
      ? timestamp ?? new Date().toISOString()
      : null;
  return {
    ...container,
    status: containerStatus(status),
    completedAt,
  };
}

function childContainerLineage(input: {
  ref: MeleeProjectSessionRef;
  kind: SubmitMeleeWorkflowTraceEventInput["kind"];
  status: MeleeWorkflowTraceStatus;
  prId?: string | null;
  workingDir?: string | null;
  worktreePath?: string | null;
  timestamp?: string;
  metadata?: Record<string, unknown>;
}): NewContainer[] {
  const root = buildMeleeContainer({
    kind: "session",
    ref: input.ref,
    workingDir: input.workingDir,
    worktreePath: input.worktreePath,
    metadata: input.kind === "session" ? input.metadata : undefined,
  });
  if (input.kind === "session") return [withEventStatus(root, input.status, input.timestamp)];

  const prepare = buildMeleeContainer({
    kind: "prepare",
    ref: input.ref,
    workingDir: input.workingDir,
    worktreePath: input.worktreePath,
    metadata: input.kind === "prepare" ? input.metadata : undefined,
  });
  if (input.kind === "prepare") return [root, withEventStatus(prepare, input.status, input.timestamp)];

  const childMetadata = {
    ...(input.metadata ?? {}),
    ...(input.prId ? { prId: input.prId } : {}),
  };
  if (
    input.kind === "intake" ||
    input.kind === "intake-item" ||
    input.kind === "intake-postmortem" ||
    input.kind === "intake-knowledge"
  ) {
    const intake = buildMeleeContainer({
      kind: "intake",
      ref: input.ref,
      workingDir: input.workingDir,
      worktreePath: input.worktreePath,
      metadata: input.kind === "intake" ? childMetadata : undefined,
    });
    if (input.kind === "intake") return [root, prepare, withEventStatus(intake, input.status, input.timestamp)];

    const item = buildMeleeContainer({
      kind: "intake-item",
      ref: input.ref,
      workingDir: input.workingDir,
      worktreePath: input.worktreePath,
      metadata: childMetadata,
    });
    if (input.kind === "intake-item") return [root, prepare, intake, withEventStatus(item, input.status, input.timestamp)];

    const child = withEventStatus(
      buildMeleeContainer({
        kind: input.kind,
        ref: input.ref,
        workingDir: input.workingDir,
        worktreePath: input.worktreePath,
        metadata: childMetadata,
      }),
      input.status,
      input.timestamp,
    );
    return [root, prepare, intake, item, child];
  }

  const child = withEventStatus(
    buildMeleeContainer({
      kind: input.kind,
      ref: input.ref,
      workingDir: input.workingDir,
      worktreePath: input.worktreePath,
      metadata: childMetadata,
    }),
    input.status,
    input.timestamp,
  );

  if (input.kind === "pr-publication") {
    const pr = buildMeleeContainer({
      kind: "pr",
      ref: input.ref,
      workingDir: input.workingDir,
      worktreePath: input.worktreePath,
      metadata: childMetadata,
    });
    return [root, pr, child];
  }

  if (
    input.kind === "sync-intake" ||
    input.kind === "pr-index" ||
    input.kind === "knowledge-refresh" ||
    input.kind === "baseline"
  ) {
    return [root, prepare, child];
  }

  return [root, child];
}

export async function submitMeleeWorkflowTraceEvent(
  input: SubmitMeleeWorkflowTraceEventInput,
): Promise<SubmittedMeleeWorkflowTraceEvent> {
  const projectId = requiredText(input.projectId, "projectId");
  const sessionId = requiredText(input.sessionId, "sessionId");
  const correlationId = requiredText(input.correlationId, "correlationId");
  const projectEventId = requiredText(input.projectEventId, "projectEventId");
  const operation = requiredText(input.operation, "operation");
  const causedByEventId = input.causedByEventId === null
    ? null
    : requiredText(input.causedByEventId, "causedByEventId");
  const status = input.status ?? "completed";
  const ref = { projectId, sessionId };
  const appSessionId = meleeAppSessionId(ref);
  const protectedMetadata = {
    ...(input.metadata ?? {}),
    projectId,
    sessionId,
    correlation_id: correlationId,
    project_event_id: projectEventId,
    caused_by_event_id: causedByEventId,
  };
  const containers = childContainerLineage({
    ref,
    kind: input.kind,
    status,
    prId: input.prId,
    workingDir: input.workingDir,
    worktreePath: input.worktreePath,
    timestamp: input.timestamp,
    metadata: protectedMetadata,
  });
  const container = containers.at(-1);
  if (!container) throw new Error("Unable to build Melee workflow trace container lineage");
  const phase = String(container.phase ?? input.kind);
  const eventData: EventData = {
    ...(input.metadata ?? {}),
    phase,
    status,
    operation,
    appSessionId,
    containerId: container.id,
    containerKind: input.kind,
    projectId,
    sessionId,
    ...(input.prId ? { prId: input.prId } : {}),
    ...(input.detail ? { detail: input.detail } : {}),
    correlation_id: correlationId,
    project_event_id: projectEventId,
    caused_by_event_id: causedByEventId,
  };
  const context: MeleeKernelSpawnContext = {
    appSessionId,
    containerId: container.id,
    containerLineage: containers,
    phase,
    workingDir: input.workingDir ?? undefined,
    metadata: eventData,
  };

  await input.runtime.upsertSpawnContainers(context);
  const eventType = input.type ?? `melee:${eventTypePhase(phase)}_${status}`;
  const eventId = meleeWorkflowTraceEventId({
    projectId,
    sessionId,
    projectEventId,
    containerId: container.id,
    eventType,
    operation,
    status,
  });
  const event = {
    ...input.runtime.traceWriter.createAppEvent({
      appSessionId,
      containerId: container.id,
      type: eventType,
      eventData,
      traceLevel: input.traceLevel ?? TraceLevel.SUMMARY,
      timestamp: input.timestamp,
    }),
    eventId,
  };
  await input.runtime.traceWriter.submit(event);

  return {
    appSessionId,
    containerId: container.id,
    containers,
    event,
  };
}
