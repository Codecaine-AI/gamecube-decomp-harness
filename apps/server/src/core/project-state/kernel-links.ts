import type { Database } from "bun:sqlite";
import * as kernelSchema from "@agent-kernel/db/schema";
import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

export interface ProjectEventTraceLinkage {
  correlationId: string;
  projectEventId: string;
  causedByEventId: string | null;
}

export interface KernelTraceDeepLinkDto {
  app_session_id: string;
  container_id: string;
  kernel_event_id: string;
  href: string;
}

export interface ProjectEventKernelTraceProjection extends KernelTraceDeepLinkDto {
  event_id: string;
}

/** Internal E3 linkage shape before it crosses the E2 response boundary. */
export interface KernelTraceLinkage {
  project_event_id: string;
  app_session_id: string;
  container_id: string;
  kernel_event_id: string;
  trace_url: string;
}

/** Kernel read-API event fields normalized at the infrastructure boundary. */
export interface KernelTraceEventObservation {
  app_session_id: string;
  container_id: string;
  event_data: unknown;
  kernel_event_id: string;
  trace_url: string;
}

export type KernelTraceLinkageIndex = ReadonlyMap<
  string,
  readonly KernelTraceDeepLinkDto[]
>;

export type KernelTraceLinkageReader = (
  projectEventIds: readonly string[],
) => Promise<readonly KernelTraceLinkage[]>;

export type KernelTraceDatabase = PostgresJsDatabase<typeof kernelSchema>;

export class KernelTraceReadError extends Error {
  readonly cause: unknown;

  constructor(cause: unknown) {
    super("Kernel trace linkage read failed");
    this.name = "KernelTraceReadError";
    this.cause = cause;
  }
}

export type EnrichedProjectEventReconstruction<
  TReconstruction extends { events: readonly { event_id: string }[] },
> = Omit<TReconstruction, "kernel_traces"> & {
  kernel_traces: ProjectEventKernelTraceProjection[];
};

function requiredText(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${label} must be a nonblank string`);
  return normalized;
}

function normalizedUuid(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(normalized)
    ? normalized
    : null;
}

/** Reads only kernel app-session UUIDs durably assigned to the requested project. */
export function readProjectKernelAppSessionIds(
  db: Database,
  projectId: string,
): string[] {
  const requestedProjectId = requiredText(projectId, "projectId");
  const rows = db
    .query(
      `SELECT kernel_trace_json
       FROM project_sessions
       WHERE project_id = ?
       ORDER BY id`,
    )
    .all(requestedProjectId) as Array<{ kernel_trace_json: unknown }>;
  const appSessionIds = new Set<string>();
  for (const row of rows) {
    let trace: unknown = row.kernel_trace_json;
    if (typeof trace === "string") {
      try {
        trace = JSON.parse(trace);
      } catch {
        continue;
      }
    }
    const appSessionId = normalizedUuid(jsonObject(trace)?.app_session_id);
    if (appSessionId) appSessionIds.add(appSessionId);
  }
  return [...appSessionIds];
}

/** Builds the indexed, project-scoped production trace lookup. */
export function buildProjectKernelTraceQuery(
  db: KernelTraceDatabase,
  projectId: string,
  projectEventIds: readonly string[],
  appSessionIds: readonly string[],
) {
  const requestedProjectId = requiredText(projectId, "projectId");
  const requestedEventIds = projectEventIds.map((eventId) =>
    requiredText(eventId, "project event id")
  );
  const requestedAppSessionIds = appSessionIds.map((appSessionId) => {
    const normalized = normalizedUuid(appSessionId);
    if (!normalized) throw new Error("app_session_id must be a UUID");
    return normalized;
  });
  if (requestedEventIds.length === 0 || requestedAppSessionIds.length === 0) {
    throw new Error("Kernel trace query requires event and app-session ids");
  }

  const metadataEventId = sql<string>`${kernelSchema.traceEvents.eventData}->>'project_event_id'`;
  const metadataProjectId = sql<string>`${kernelSchema.traceEvents.eventData}->>'projectId'`;
  const canonicalMetadataProjectId = sql<string>`${kernelSchema.traceEvents.eventData}->>'project_id'`;
  return db
    .select({
      appSessionId: kernelSchema.traceEvents.appSessionId,
      containerId: kernelSchema.traceEvents.containerId,
      eventData: kernelSchema.traceEvents.eventData,
      kernelEventId: kernelSchema.traceEvents.id,
    })
    .from(kernelSchema.traceEvents)
    .where(
      and(
        inArray(kernelSchema.traceEvents.appSessionId, requestedAppSessionIds),
        eq(metadataProjectId, requestedProjectId),
        inArray(metadataEventId, requestedEventIds),
        or(
          isNull(canonicalMetadataProjectId),
          eq(canonicalMetadataProjectId, requestedProjectId),
        ),
      ),
    )
    .orderBy(kernelSchema.traceEvents.timestamp, kernelSchema.traceEvents.id);
}

/** Keeps optional telemetry optional, but makes configured reader failures explicit. */
export async function readKernelTraceLinkagesFromConfiguredReader<TReader>(
  databaseUrl: string | null,
  appSessionIds: readonly string[],
  projectEventIds: readonly string[],
  initializeReader: () => Promise<TReader | null>,
  readLinkages: (reader: TReader) => Promise<readonly KernelTraceLinkage[]>,
): Promise<readonly KernelTraceLinkage[]> {
  if (appSessionIds.length === 0 || projectEventIds.length === 0) return [];
  if (!databaseUrl?.trim()) return [];

  try {
    const reader = await initializeReader();
    if (!reader) throw new Error("Configured kernel runtime is unavailable");
    const linkages = await readLinkages(reader);
    if (!Array.isArray(linkages)) throw new Error("Kernel trace reader returned malformed data");
    return linkages;
  } catch (error) {
    if (error instanceof KernelTraceReadError) throw error;
    throw new KernelTraceReadError(error);
  }
}

export function safeKernelTraceHref(value: string): string {
  const href = requiredText(value, "trace_url");
  if (
    !href.startsWith("/") ||
    href.startsWith("//") ||
    href.includes("\\") ||
    /[\r\n]/.test(href) ||
    /%(?![0-9a-f]{2})/i.test(href)
  ) {
    throw new Error("trace_url must be a safe relative /workspace/trace link");
  }

  let decoded = href;
  try {
    for (let pass = 0; pass < 3; pass += 1) {
      const next = decodeURIComponent(decoded);
      if (
        next.includes("\\") ||
        /[\r\n]/.test(next) ||
        /(?:^|[/?#&=])\.\.(?:[/?#&=]|$)/.test(next)
      ) {
        throw new Error("unsafe trace link");
      }
      if (next === decoded) break;
      decoded = next;
    }
  } catch {
    throw new Error("trace_url must be a safe relative /workspace/trace link");
  }

  let parsed: URL;
  try {
    parsed = new URL(href, "http://project-event.invalid");
  } catch {
    throw new Error("trace_url must be a safe relative /workspace/trace link");
  }
  if (
    parsed.origin !== "http://project-event.invalid" ||
    parsed.pathname !== "/workspace/trace" ||
    parsed.username ||
    parsed.password
  ) {
    throw new Error("trace_url must be a safe relative /workspace/trace link");
  }
  return `${parsed.pathname}${parsed.search}${parsed.hash}`;
}

/**
 * Resolves a durable project event and only exposes causation when it names
 * another persisted event in the same project. The three-argument form lets
 * project-aware callers prove the expected project; the legacy form derives
 * the event's project before resolving its cause.
 */
export function resolveProjectEventTraceLinkage(
  db: Database,
  projectEventId: string,
): ProjectEventTraceLinkage;
export function resolveProjectEventTraceLinkage(
  db: Database,
  projectId: string,
  projectEventId: string,
): ProjectEventTraceLinkage;
export function resolveProjectEventTraceLinkage(
  db: Database,
  projectIdOrEventId: string,
  maybeProjectEventId?: string,
): ProjectEventTraceLinkage {
  const expectedProjectId = maybeProjectEventId === undefined
    ? null
    : requiredText(projectIdOrEventId, "projectId");
  const eventId = requiredText(
    maybeProjectEventId ?? projectIdOrEventId,
    "projectEventId",
  );
  const scopedProjectId = expectedProjectId ?? (db
    .query("SELECT project_id FROM project_events WHERE event_id = ?")
    .get(eventId) as { project_id: string } | null)?.project_id ?? null;
  const row = (scopedProjectId === null
    ? null
    : db
        .query(
          `SELECT event_id, project_id, correlation_id, causation_id
           FROM project_events
           WHERE project_id = ? AND event_id = ?`,
        )
        .get(scopedProjectId, eventId)) as {
          event_id: string;
          project_id: string;
          correlation_id: string;
          causation_id: string;
        } | null;
  if (!row) throw new Error("Project event not found");
  const persistedCause = db
    .query(
      `SELECT event_id
       FROM project_events
       WHERE project_id = ? AND event_id = ?`,
    )
    .get(row.project_id, row.causation_id) as { event_id: string } | null;
  return {
    correlationId: row.correlation_id,
    projectEventId: row.event_id,
    causedByEventId: persistedCause?.event_id ?? null,
  };
}

function jsonObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

/** Maps project-scoped kernel observations whose metadata names a requested event. */
export function kernelTraceLinkagesFromObservations(
  observations: readonly KernelTraceEventObservation[],
  projectId: string,
  projectEventIds: readonly string[],
): KernelTraceLinkage[] {
  const requestedProjectId = requiredText(projectId, "projectId");
  const requestedEventIds = new Set(
    projectEventIds.map((eventId) => requiredText(eventId, "project event id")),
  );
  const linkages: KernelTraceLinkage[] = [];
  for (const observation of observations) {
    const eventData = jsonObject(observation.event_data);
    const metadataProjectId = typeof eventData?.projectId === "string"
      ? eventData.projectId.trim()
      : "";
    const canonicalMetadataProjectId = typeof eventData?.project_id === "string"
      ? eventData.project_id.trim()
      : eventData && Object.prototype.hasOwnProperty.call(eventData, "project_id")
        ? null
        : undefined;
    if (
      metadataProjectId !== requestedProjectId ||
      (canonicalMetadataProjectId !== undefined && canonicalMetadataProjectId !== requestedProjectId)
    ) {
      continue;
    }
    const projectEventId = typeof eventData?.project_event_id === "string"
      ? eventData.project_event_id.trim()
      : "";
    if (!projectEventId || !requestedEventIds.has(projectEventId)) continue;
    linkages.push({
      project_event_id: projectEventId,
      app_session_id: requiredText(observation.app_session_id, "app_session_id"),
      container_id: requiredText(observation.container_id, "container_id"),
      kernel_event_id: requiredText(observation.kernel_event_id, "kernel_event_id"),
      trace_url: safeKernelTraceHref(observation.trace_url),
    });
  }
  return linkages;
}

/** Builds the one-to-many event-to-kernel index used by server projections. */
export function indexKernelTraceLinkages(
  linkages: readonly KernelTraceLinkage[],
): KernelTraceLinkageIndex {
  const indexed = new Map<string, KernelTraceDeepLinkDto[]>();
  for (const linkage of linkages) {
    const projectEventId = requiredText(
      linkage.project_event_id,
      "project_event_id",
    );
    const links = indexed.get(projectEventId) ?? [];
    links.push({
      app_session_id: requiredText(linkage.app_session_id, "app_session_id"),
      container_id: requiredText(linkage.container_id, "container_id"),
      kernel_event_id: requiredText(linkage.kernel_event_id, "kernel_event_id"),
      href: safeKernelTraceHref(linkage.trace_url),
    });
    indexed.set(projectEventId, links);
  }
  return indexed;
}

/** Adds the flattened E2 kernel_traces projection without changing lifecycle events. */
export function enrichProjectEventReconstruction<
  TReconstruction extends { events: readonly { event_id: string }[] },
>(
  reconstruction: TReconstruction,
  linkages: KernelTraceLinkageIndex,
): EnrichedProjectEventReconstruction<TReconstruction> {
  const kernelTraces = reconstruction.events.flatMap((event) =>
    (linkages.get(event.event_id) ?? []).map((linkage) => ({
      event_id: event.event_id,
      ...linkage,
    })),
  );
  const { kernel_traces: _previousKernelTraces, ...base } = reconstruction as TReconstruction & {
    kernel_traces?: unknown;
  };
  return {
    ...base,
    kernel_traces: kernelTraces,
  } as EnrichedProjectEventReconstruction<TReconstruction>;
}

/** Reads optional telemetry through an injected port, then applies the E2 projection. */
export async function enrichProjectEventReconstructionFromKernelReader<
  TReconstruction extends { events: readonly { event_id: string }[] },
>(
  reconstruction: TReconstruction,
  readLinkages: KernelTraceLinkageReader,
): Promise<EnrichedProjectEventReconstruction<TReconstruction>> {
  const projectEventIds = reconstruction.events.map((event) => event.event_id);
  const linkages = projectEventIds.length > 0
    ? await readLinkages(projectEventIds)
    : [];
  return enrichProjectEventReconstruction(
    reconstruction,
    indexKernelTraceLinkages(linkages),
  );
}
