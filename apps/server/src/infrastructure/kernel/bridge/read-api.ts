import type {
  AgentRun as KernelAgentRun,
  Container as KernelContainer,
  KernelTraceReadOptions,
  KernelTraceReadRows,
  PiAgentSessionWithEventCount,
  TraceEventRow as KernelTraceEventRow,
} from "@agent-kernel/db";
import { getKernelTraceReadRows } from "@agent-kernel/db";
import type {
  KernelTraceReadQuery,
  KernelTraceReadService,
} from "@agent-kernel/kernel/read-api";
import type {
  AgentRun,
  JsonObject,
  KernelContainerSummary,
  KernelTraceSessionDetail,
  KernelTraceSessionListResponse,
  KernelTraceSessionSummary,
  PiSessionWithCount,
  TraceEventRow,
  TraceSessionMeta,
} from "@agent-kernel/viewer-core";

import type { MeleeKernelDatabase } from "./database.js";

export type KernelTraceRowsReader = (
  containerId: string,
  options: KernelTraceReadOptions,
) => Promise<KernelTraceReadRows | undefined>;

export type KernelTraceRowsLister = (
  query: KernelTraceReadQuery,
) => Promise<KernelTraceReadRows[]>;

export type KernelTraceIdentityResolver = (
  id: string,
) => string | Promise<string>;

export type KernelTraceRowsReadPort = (
  db: unknown,
  containerId: string,
  options: KernelTraceReadOptions,
) => Promise<KernelTraceReadRows | undefined>;

export interface CreateDbKernelTraceRowsReaderOptions {
  db: unknown;
  readRows?: KernelTraceRowsReadPort;
}

export interface CreateMeleeKernelTraceReadServiceOptions {
  readRows: KernelTraceRowsReader;
  listRows?: KernelTraceRowsLister;
  resolveIdentity?: KernelTraceIdentityResolver;
}

function asJsonObject(value: unknown): JsonObject {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as JsonObject;
  }
  return {};
}

function stringMeta(metadata: JsonObject, key: string): string | null {
  const value = metadata[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

function latestTimestamp(rows: Array<{ timestamp?: string | null }>): string | null {
  let latest: string | null = null;
  for (const row of rows) {
    if (!row.timestamp) continue;
    if (latest === null || row.timestamp > latest) latest = row.timestamp;
  }
  return latest;
}

export async function getMeleeKernelTraceReadRows(
  db: unknown,
  rootContainerId: string,
  options: KernelTraceReadOptions = {},
): Promise<KernelTraceReadRows | undefined> {
  return getKernelTraceReadRows(
    db as MeleeKernelDatabase,
    rootContainerId,
    options,
  );
}

export function createDbKernelTraceRowsReader({
  db,
  readRows = getMeleeKernelTraceReadRows,
}: CreateDbKernelTraceRowsReaderOptions): KernelTraceRowsReader {
  return (containerId, options) => readRows(db, containerId, options);
}

export function defaultKernelTraceIdentityResolver(id: string): string {
  return id;
}

export function toKernelContainerSummary(container: KernelContainer): KernelContainerSummary {
  return {
    id: container.id,
    kind: container.kind,
    parentContainerId: container.parentContainerId,
    label: container.label,
    status: container.status,
    workingDir: container.workingDir,
    phase: container.phase,
    phaseVocabulary: container.phaseVocabulary,
    metadata: asJsonObject(container.metadata),
    startedAt: container.startedAt,
    endedAt: container.endedAt,
    createdAt: container.createdAt,
    usageInputTokens: container.usageInputTokens,
    usageOutputTokens: container.usageOutputTokens,
    usageCacheRead: container.usageCacheRead,
    usageCacheWrite: container.usageCacheWrite,
    usageCostEstimate: container.usageCostEstimate,
  };
}

export function toPiSessionWithCount(session: PiAgentSessionWithEventCount): PiSessionWithCount {
  return {
    id: session.id,
    containerId: session.containerId,
    parentSessionId: session.parentSessionId,
    parentToolUseId: session.parentToolUseId,
    agentName: session.agentName,
    displayLabel: session.displayLabel,
    model: session.model,
    promptHash: session.promptHash,
    status: session.status,
    phase: session.phase,
    createdAt: session.createdAt,
    endedAt: session.endedAt,
    usageInputTokens: session.usageInputTokens,
    usageOutputTokens: session.usageOutputTokens,
    eventCount: session.eventCount,
  };
}

export function toAgentRun(run: KernelAgentRun): AgentRun {
  return {
    id: run.id,
    piSessionId: run.piSessionId,
    containerId: run.containerId,
    parentRunId: run.parentRunId,
    parentToolUseId: run.parentToolUseId,
    agentName: run.agentName,
    trigger: run.trigger,
    inboundEventId: run.inboundEventId,
    outboundEventId: run.outboundEventId,
    displayLabel: run.displayLabel,
    phase: run.phase,
    status: run.status,
    startedAt: run.startedAt,
    endedAt: run.endedAt,
    usageInputTokens: run.usageInputTokens,
    usageOutputTokens: run.usageOutputTokens,
    usageCacheRead: run.usageCacheRead,
    usageCacheWrite: run.usageCacheWrite,
    usageCostEstimate: run.usageCostEstimate,
  };
}

export function toTraceEventRow(row: KernelTraceEventRow): TraceEventRow {
  return {
    eventId: row.eventId,
    containerId: row.containerId,
    runId: row.runId,
    piSessionId: row.piSessionId,
    agentId: row.agentId,
    userId: row.userId,
    type: row.type as TraceEventRow["type"],
    source: row.source as TraceEventRow["source"],
    traceLevel: row.traceLevel,
    eventData: row.eventData as TraceEventRow["eventData"],
    spanId: row.spanId,
    parentEventId: row.parentEventId,
    timestamp: row.timestamp,
  };
}

export function toTraceSessionMeta(rows: KernelTraceReadRows): TraceSessionMeta {
  const root = rows.rootContainer;
  const metadata = asJsonObject(root.metadata);
  return {
    id: root.id,
    containerId: root.id,
    kind: root.kind,
    label: root.label,
    topic: stringMeta(metadata, "topic") ?? root.label,
    status: root.status,
    createdAt: root.createdAt,
    updatedAt: latestTimestamp(rows.events) ?? root.endedAt ?? root.createdAt,
  };
}

export function toKernelTraceSessionDetail(
  rows: KernelTraceReadRows,
): KernelTraceSessionDetail {
  return {
    session: toTraceSessionMeta(rows),
    container: toKernelContainerSummary(rows.rootContainer),
    containers: rows.containers.map(toKernelContainerSummary),
    pi_sessions: rows.piSessions.map(toPiSessionWithCount),
    agent_runs: rows.agentRuns.map(toAgentRun),
    events: rows.events.map(toTraceEventRow),
  };
}

export function toKernelTraceSessionSummary(
  rows: KernelTraceReadRows,
): KernelTraceSessionSummary {
  const session = toTraceSessionMeta(rows);
  const root = toKernelContainerSummary(rows.rootContainer);
  return {
    id: root.id,
    containerId: root.id,
    kind: root.kind,
    label: root.label ?? root.id,
    topic: session.topic,
    status: root.status,
    phase: root.phase ?? null,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    piSessionCount: rows.piSessions.length,
    eventCount: rows.events.length,
    latestEventAt: latestTimestamp(rows.events),
    metadata: root.metadata ?? {},
  };
}

export function createMeleeKernelTraceReadService({
  readRows,
  listRows,
  resolveIdentity = defaultKernelTraceIdentityResolver,
}: CreateMeleeKernelTraceReadServiceOptions): KernelTraceReadService<
  KernelTraceSessionDetail,
  KernelTraceSessionListResponse
> {
  return {
    ...(listRows
      ? {
          async listSessionContainers(query: KernelTraceReadQuery): Promise<KernelTraceSessionListResponse> {
            const rows = await listRows(query);
            return { trace_sessions: rows.map(toKernelTraceSessionSummary) };
          },
        }
      : {}),
    async getContainerTrace(containerId, query) {
      const identity = await resolveIdentity(containerId);
      const rows = await readRows(identity, {
        after: query.after,
        limit: query.limit,
      });
      return rows ? toKernelTraceSessionDetail(rows) : null;
    },
  };
}
