import type { NewContainer } from "@agent-kernel/db";
import {
  TraceLevel,
  type EventData,
  type TraceEvent,
} from "@agent-kernel/protocol";

import type { AppKernelSpawnContext } from "./kernel.js";
import type { AppKernelRuntime } from "./runtime.js";
import {
  buildAppContainer,
  appAppSessionId,
  appWorkflowTraceEventId,
  type AppContainerKind,
  type AppCycleRef,
} from "./session-mapping.js";
import type { AppTraceEventInput } from "./trace-writer.js";

export type AppWorkflowTraceStatus =
  | "started"
  | "completed"
  | "failed"
  | "skipped";

export interface AppWorkflowTraceRuntime {
  upsertSpawnContainers: AppKernelRuntime["upsertSpawnContainers"];
  traceWriter: Pick<AppKernelRuntime["traceWriter"], "createAppEvent" | "submit">;
}

export interface SubmitAppWorkflowTraceEventInput {
  runtime: AppWorkflowTraceRuntime;
  kind: Extract<
    AppContainerKind,
    | "session"
    | "sync"
    | "sync-intake"
    | "intake"
    | "intake-item"
    | "intake-postmortem"
    | "intake-knowledge"
    | "knowledge"
    | "knowledge-job"
    | "baseline"
    | "run"
    | "epoch"
    | "pr"
    | "pr-handoff"
    | "pr-qa"
    | "pr-publication"
  >;
  gameId: string;
  sessionId: string;
  correlationId: string;
  gameEventId: string;
  causedByEventId: string | null;
  operation: string;
  status?: AppWorkflowTraceStatus;
  prId?: string | null;
  workingDir?: string | null;
  worktreePath?: string | null;
  detail?: string | null;
  metadata?: Record<string, unknown>;
  traceLevel?: AppTraceEventInput["traceLevel"];
  type?: string;
  timestamp?: string;
}

export interface SubmittedAppWorkflowTraceEvent {
  appSessionId: string;
  containerId: string;
  containers: NewContainer[];
  event: TraceEvent;
}

function containerStatus(status: AppWorkflowTraceStatus): NewContainer["status"] {
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

function optionalText(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return normalized || undefined;
}

function syncWorkflowId(input: {
  kind: SubmitAppWorkflowTraceEventInput["kind"];
  correlationId: string;
  metadata?: Record<string, unknown>;
}): string | undefined {
  if (
    input.kind !== "sync" &&
    input.kind !== "sync-intake" &&
    !input.kind.startsWith("intake") &&
    !input.kind.startsWith("knowledge")
  ) {
    return undefined;
  }
  const metadata = input.metadata ?? {};
  for (const candidate of [
    metadata.syncId,
    metadata.sync_id,
    metadata.subjectId,
    metadata.subject_id,
    metadata.runId,
    input.correlationId,
  ]) {
    const value = optionalText(candidate);
    if (value && /^sync-/.test(value)) return value;
  }
  return undefined;
}

function withEventStatus(
  container: NewContainer,
  status: AppWorkflowTraceStatus,
  timestamp?: string,
): NewContainer {
  const endedAt =
    status === "completed" || status === "failed" || status === "skipped"
      ? timestamp ?? new Date().toISOString()
      : null;
  return {
    ...container,
    status: containerStatus(status),
    endedAt,
  };
}

function childContainerLineage(input: {
  ref: AppCycleRef;
  kind: SubmitAppWorkflowTraceEventInput["kind"];
  status: AppWorkflowTraceStatus;
  prId?: string | null;
  workingDir?: string | null;
  worktreePath?: string | null;
  timestamp?: string;
  metadata?: Record<string, unknown>;
}): NewContainer[] {
  const root = buildAppContainer({
    kind: "session",
    ref: input.ref,
    workingDir: input.workingDir,
    worktreePath: input.worktreePath,
    metadata: input.kind === "session" ? input.metadata : undefined,
  });
  if (input.kind === "session") return [withEventStatus(root, input.status, input.timestamp)];

  const childMetadata: Record<string, unknown> = {
    ...(input.metadata ?? {}),
    ...(input.prId ? { prId: input.prId } : {}),
  };
  const runId = optionalText(childMetadata.runId);
  const syncId = runId && /^sync-/.test(runId) ? runId : undefined;
  const sync = buildAppContainer({
    kind: "sync",
    ref: input.ref,
    workingDir: input.workingDir,
    worktreePath: input.worktreePath,
    metadata: syncId ? childMetadata : input.kind === "sync" ? childMetadata : undefined,
  });
  if (input.kind === "sync") return [root, withEventStatus(sync, input.status, input.timestamp)];
  if (input.kind === "sync-intake" && syncId) {
    return [root, withEventStatus(sync, input.status, input.timestamp)];
  }

  const prepare = buildAppContainer({
    kind: "prepare",
    ref: input.ref,
    workingDir: input.workingDir,
    worktreePath: input.worktreePath,
  });
  if (
    input.kind === "intake" ||
    input.kind === "intake-item" ||
    input.kind === "intake-postmortem" ||
    input.kind === "intake-knowledge"
  ) {
    const intake = buildAppContainer({
      kind: "intake",
      ref: input.ref,
      workingDir: input.workingDir,
      worktreePath: input.worktreePath,
      metadata: childMetadata,
    });
    if (input.kind === "intake") {
      return [root, syncId ? sync : prepare, withEventStatus(intake, input.status, input.timestamp)];
    }

    const item = buildAppContainer({
      kind: "intake-item",
      ref: input.ref,
      workingDir: input.workingDir,
      worktreePath: input.worktreePath,
      metadata: childMetadata,
    });
    if (input.kind === "intake-item") {
      return [
        root,
        syncId ? sync : prepare,
        intake,
        withEventStatus(item, input.status, input.timestamp),
      ];
    }

    const child = withEventStatus(
      buildAppContainer({
        kind: input.kind,
        ref: input.ref,
        workingDir: input.workingDir,
        worktreePath: input.worktreePath,
        metadata: childMetadata,
      }),
      input.status,
      input.timestamp,
    );
    return [root, syncId ? sync : prepare, intake, item, child];
  }

  const child = withEventStatus(
    buildAppContainer({
      kind: input.kind,
      ref: input.ref,
      workingDir: input.workingDir,
      worktreePath: input.worktreePath,
      metadata: childMetadata,
    }),
    input.status,
    input.timestamp,
  );

  // Every PR-scoped child hangs off the PR container, so the PR container has
  // to be in the lineage or nothing ever upserts it and the child is an orphan.
  if (
    input.kind === "pr-publication" ||
    input.kind === "pr-handoff" ||
    input.kind === "pr-qa"
  ) {
    const pr = buildAppContainer({
      kind: "pr",
      ref: input.ref,
      workingDir: input.workingDir,
      worktreePath: input.worktreePath,
      metadata: childMetadata,
    });
    return [root, pr, child];
  }

  // Sync jobs use their workflow node. Operator and CLI jobs keep the
  // cycle-global lane because they have no sync run id.
  if (input.kind === "knowledge" || input.kind === "knowledge-job") {
    const lane = buildAppContainer({
      kind: "knowledge",
      ref: input.ref,
      workingDir: input.workingDir,
      worktreePath: input.worktreePath,
      metadata: childMetadata,
    });
    if (input.kind === "knowledge") {
      return syncId
        ? [root, sync, withEventStatus(lane, input.status, input.timestamp)]
        : [root, withEventStatus(lane, input.status, input.timestamp)];
    }
    return syncId ? [root, sync, lane, child] : [root, lane, child];
  }

  if (input.kind === "sync-intake" || input.kind === "baseline") {
    return [root, prepare, child];
  }

  if (input.kind === "epoch") {
    const run = buildAppContainer({
      kind: "run",
      ref: input.ref,
      workingDir: input.workingDir,
      worktreePath: input.worktreePath,
      metadata: childMetadata,
    });
    return [root, run, child];
  }

  return [root, child];
}

export async function submitAppWorkflowTraceEvent(
  input: SubmitAppWorkflowTraceEventInput,
): Promise<SubmittedAppWorkflowTraceEvent> {
  const gameId = requiredText(input.gameId, "gameId");
  const sessionId = requiredText(input.sessionId, "sessionId");
  const correlationId = requiredText(input.correlationId, "correlationId");
  const gameEventId = requiredText(input.gameEventId, "gameEventId");
  const operation = requiredText(input.operation, "operation");
  const causedByEventId = input.causedByEventId === null
    ? null
    : requiredText(input.causedByEventId, "causedByEventId");
  const status = input.status ?? "completed";
  const ref = { gameId, sessionId };
  const appSessionId = appAppSessionId(ref);
  const syncId = syncWorkflowId({
    kind: input.kind,
    correlationId,
    metadata: input.metadata,
  });
  const scopedMetadata = {
    ...(input.metadata ?? {}),
    ...(syncId ? { runId: syncId } : {}),
  };
  const protectedMetadata = {
    ...scopedMetadata,
    gameId,
    sessionId,
    correlation_id: correlationId,
    game_event_id: gameEventId,
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
  if (!container) throw new Error("Unable to build app workflow trace container lineage");
  const phase = String(container.phase ?? input.kind);
  const eventData: EventData = {
    ...scopedMetadata,
    phase,
    status,
    operation,
    appSessionId,
    containerId: container.id,
    containerKind: input.kind,
    gameId,
    sessionId,
    ...(input.prId ? { prId: input.prId } : {}),
    ...(input.detail ? { detail: input.detail } : {}),
    correlation_id: correlationId,
    game_event_id: gameEventId,
    caused_by_event_id: causedByEventId,
  };
  const context: AppKernelSpawnContext = {
    appSessionId,
    containerId: container.id,
    containerLineage: containers,
    phase,
    workingDir: input.workingDir ?? undefined,
    metadata: eventData,
  };

  await input.runtime.upsertSpawnContainers(context);
  const eventType = input.type ?? `melee:${eventTypePhase(phase)}_${status}`;
  const eventId = appWorkflowTraceEventId({
    gameId,
    sessionId,
    gameEventId,
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
