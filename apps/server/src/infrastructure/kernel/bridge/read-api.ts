import type {
  AgentRun as KernelAgentRun,
  Container as KernelContainer,
  KernelTraceReadOptions,
  KernelTraceReadRows,
  PiAgentSessionWithEventCount,
  TraceEventRow as KernelTraceEventRow,
} from "@agent-kernel/db";
import * as schema from "@agent-kernel/db/schema/pg";
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
import { and, asc, count, eq, gt, inArray } from "drizzle-orm";

import type { MeleeKernelDatabase } from "./database.js";

// Core's linked source resolves its own Drizzle declaration. Contain that
// physical-package type skew at this Postgres port boundary.
const pgSchema = schema as any;

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

function clampLimit(limit: number | undefined, fallback: number, max: number): number {
  if (limit === undefined || !Number.isFinite(limit)) return fallback;
  return Math.max(1, Math.min(Math.floor(limit), max));
}

/**
 * The live db actions are SQLite-first. Melee keeps its shared Postgres plane,
 * so this bridge owns the equivalent read port over the exported pg schema.
 */
export async function getMeleeKernelTraceReadRows(
  db: unknown,
  rootContainerId: string,
  options: KernelTraceReadOptions = {},
): Promise<KernelTraceReadRows | undefined> {
  const database = db as MeleeKernelDatabase;
  const maxContainers = clampLimit(options.maxContainers, 500, 5000);
  const [root] = await database
    .select()
    .from(pgSchema.containers)
    .where(eq(pgSchema.containers.id, rootContainerId))
    .limit(1);
  if (!root) return undefined;

  const containers = [root];
  const seen = new Set<string>([root.id]);
  let frontier = [root.id];
  while (frontier.length > 0 && containers.length < maxContainers) {
    const children = await database
      .select()
      .from(pgSchema.containers)
      .where(inArray(pgSchema.containers.parentContainerId, frontier))
      .orderBy(asc(pgSchema.containers.createdAt))
      .limit(maxContainers - containers.length);
    frontier = [];
    for (const child of children) {
      if (seen.has(child.id)) continue;
      seen.add(child.id);
      containers.push(child);
      frontier.push(child.id);
    }
  }

  const containerIds = containers.map((container) => container.id);
  const piSessionRows = await database
    .select()
    .from(pgSchema.piAgentSessions)
    .where(inArray(pgSchema.piAgentSessions.containerId, containerIds))
    .orderBy(asc(pgSchema.piAgentSessions.createdAt));
  const piSessionIds = piSessionRows.map((session) => session.id);
  const eventCountRows = piSessionIds.length > 0
    ? await database
        .select({ piSessionId: pgSchema.traceEvents.piSessionId, eventCount: count() })
        .from(pgSchema.traceEvents)
        .where(inArray(pgSchema.traceEvents.piSessionId, piSessionIds))
        .groupBy(pgSchema.traceEvents.piSessionId)
    : [];
  const eventCountBySession = new Map<string, number>();
  for (const row of eventCountRows) {
    if (row.piSessionId) eventCountBySession.set(row.piSessionId, Number(row.eventCount ?? 0));
  }
  const piSessions = piSessionRows.map((session) => ({
    ...session,
    eventCount: eventCountBySession.get(session.id) ?? 0,
  }));

  const agentRuns = await database
    .select()
    .from(pgSchema.agentRuns)
    .where(inArray(pgSchema.agentRuns.containerId, containerIds))
    .orderBy(asc(pgSchema.agentRuns.startedAt));
  const eventConditions = [inArray(pgSchema.traceEvents.containerId, containerIds)];
  if (options.after) eventConditions.push(gt(pgSchema.traceEvents.timestamp, options.after));
  const events = await database
    .select()
    .from(pgSchema.traceEvents)
    .where(and(...eventConditions))
    .orderBy(asc(pgSchema.traceEvents.timestamp), asc(pgSchema.traceEvents.eventId))
    .limit(clampLimit(options.limit, 5000, 10000));

  return {
    rootContainer: root as KernelContainer,
    containers: containers as KernelContainer[],
    piSessions: piSessions as PiAgentSessionWithEventCount[],
    agentRuns: agentRuns as KernelAgentRun[],
    events: events as KernelTraceEventRow[],
  };
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
