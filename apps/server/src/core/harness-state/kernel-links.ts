import type { Database } from "bun:sqlite";
import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { jsonb, pgTable, text } from "drizzle-orm/pg-core";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

/**
 * Read-only Postgres boundary for the live kernel tables used by this
 * projection. Keeping these narrow declarations local avoids combining the
 * harness Drizzle instance with the linked Core package's private Drizzle
 * types. The live package's default schema is SQLite; its Postgres mirror has
 * these same column names.
 */
const kernelTraceEvents = pgTable("trace_events", {
  eventId: text("event_id").primaryKey(),
  containerId: text("container_id").notNull(),
  eventData: jsonb("event_data").notNull(),
  timestamp: text("timestamp").notNull(),
});

const kernelContainers = pgTable("containers", {
  id: text("id").primaryKey(),
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
});

export interface GameEventTraceLinkage {
  correlationId: string;
  gameEventId: string;
  causedByEventId: string | null;
}

export interface KernelTraceDeepLinkDto {
  app_session_id: string;
  container_id: string;
  kernel_event_id: string;
  href: string;
}

export interface GameEventKernelTraceProjection extends KernelTraceDeepLinkDto {
  event_id: string;
}

/** Internal E3 linkage shape before it crosses the E2 response boundary. */
export interface KernelTraceLinkage {
  game_event_id: string;
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
  gameEventIds: readonly string[],
) => Promise<readonly KernelTraceLinkage[]>;

export type KernelTraceDatabase = PostgresJsDatabase;

export class KernelTraceReadError extends Error {
  readonly cause: unknown;

  constructor(cause: unknown) {
    super("Kernel trace linkage read failed");
    this.name = "KernelTraceReadError";
    this.cause = cause;
  }
}

export type EnrichedGameEventReconstruction<
  TReconstruction extends { events: readonly { event_id: string }[] },
> = Omit<TReconstruction, "kernel_traces"> & {
  kernel_traces: GameEventKernelTraceProjection[];
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

/** Reads only kernel app-session UUIDs durably assigned to the requested game. */
export function readGameKernelAppSessionIds(
  db: Database,
  gameId: string,
): string[] {
  const requestedGameId = requiredText(gameId, "gameId");
  const rows = db
    .query(
      `SELECT kernel_trace_json
       FROM cycles
       WHERE game_id = ?
       ORDER BY id`,
    )
    .all(requestedGameId) as Array<{ kernel_trace_json: unknown }>;
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

/** Builds the indexed, game-scoped production trace lookup. */
export function buildGameKernelTraceQuery(
  db: KernelTraceDatabase,
  gameId: string,
  gameEventIds: readonly string[],
  appSessionIds: readonly string[],
) {
  const requestedGameId = requiredText(gameId, "gameId");
  const requestedEventIds = gameEventIds.map((eventId) =>
    requiredText(eventId, "game event id")
  );
  const requestedAppSessionIds = appSessionIds.map((appSessionId) => {
    const normalized = normalizedUuid(appSessionId);
    if (!normalized) throw new Error("app_session_id must be a UUID");
    return normalized;
  });
  if (requestedEventIds.length === 0 || requestedAppSessionIds.length === 0) {
    throw new Error("Kernel trace query requires event and app-session ids");
  }

  const metadataAppSessionId = sql<string>`coalesce(
    ${kernelContainers.metadata}->>'appSessionId',
    ${kernelTraceEvents.eventData}->>'appSessionId'
  )`;
  const metadataEventId = sql<string>`${kernelTraceEvents.eventData}->>'game_event_id'`;
  const metadataGameId = sql<string>`${kernelTraceEvents.eventData}->>'gameId'`;
  const canonicalMetadataGameId = sql<string>`${kernelTraceEvents.eventData}->>'game_id'`;
  return db
    .select({
      appSessionId: metadataAppSessionId,
      containerId: kernelTraceEvents.containerId,
      eventData: kernelTraceEvents.eventData,
      kernelEventId: kernelTraceEvents.eventId,
    })
    .from(kernelTraceEvents)
    .innerJoin(
      kernelContainers,
      eq(kernelTraceEvents.containerId, kernelContainers.id),
    )
    .where(
      and(
        inArray(metadataAppSessionId, requestedAppSessionIds),
        eq(metadataGameId, requestedGameId),
        inArray(metadataEventId, requestedEventIds),
        or(
          isNull(canonicalMetadataGameId),
          eq(canonicalMetadataGameId, requestedGameId),
        ),
      ),
    )
    .orderBy(kernelTraceEvents.timestamp, kernelTraceEvents.eventId);
}

/** Keeps optional telemetry optional, but makes configured reader failures explicit. */
export async function readKernelTraceLinkagesFromConfiguredReader<TReader>(
  databaseUrl: string | null,
  appSessionIds: readonly string[],
  gameEventIds: readonly string[],
  initializeReader: () => Promise<TReader | null>,
  readLinkages: (reader: TReader) => Promise<readonly KernelTraceLinkage[]>,
): Promise<readonly KernelTraceLinkage[]> {
  if (appSessionIds.length === 0 || gameEventIds.length === 0) return [];
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
    parsed = new URL(href, "http://game-event.invalid");
  } catch {
    throw new Error("trace_url must be a safe relative /workspace/trace link");
  }
  if (
    parsed.origin !== "http://game-event.invalid" ||
    parsed.pathname !== "/workspace/trace" ||
    parsed.username ||
    parsed.password
  ) {
    throw new Error("trace_url must be a safe relative /workspace/trace link");
  }
  return `${parsed.pathname}${parsed.search}${parsed.hash}`;
}

/** Resolve a durable game event and expose only same-game persisted causation. */
export function resolveGameEventTraceLinkage(
  db: Database,
  gameId: string,
  gameEventId: string,
): GameEventTraceLinkage {
  const expectedGameId = requiredText(gameId, "gameId");
  const eventId = requiredText(gameEventId, "gameEventId");
  const row = db
    .query(
      `SELECT event_id, game_id, correlation_id, causation_id
       FROM game_events
       WHERE game_id = ? AND event_id = ?`,
    )
    .get(expectedGameId, eventId) as {
      event_id: string;
      game_id: string;
      correlation_id: string;
      causation_id: string;
    } | null;
  if (!row) throw new Error("Game event not found");
  const persistedCause = db
    .query(
      `SELECT event_id
       FROM game_events
       WHERE game_id = ? AND event_id = ?`,
    )
    .get(row.game_id, row.causation_id) as { event_id: string } | null;
  return {
    correlationId: row.correlation_id,
    gameEventId: row.event_id,
    causedByEventId: persistedCause?.event_id ?? null,
  };
}

function jsonObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

/** Maps game-scoped kernel observations whose metadata names a requested event. */
export function kernelTraceLinkagesFromObservations(
  observations: readonly KernelTraceEventObservation[],
  gameId: string,
  gameEventIds: readonly string[],
): KernelTraceLinkage[] {
  const requestedGameId = requiredText(gameId, "gameId");
  const requestedEventIds = new Set(
    gameEventIds.map((eventId) => requiredText(eventId, "game event id")),
  );
  const linkages: KernelTraceLinkage[] = [];
  for (const observation of observations) {
    const eventData = jsonObject(observation.event_data);
    const metadataGameId = typeof eventData?.gameId === "string"
      ? eventData.gameId.trim()
      : "";
    const canonicalMetadataGameId = typeof eventData?.game_id === "string"
      ? eventData.game_id.trim()
      : eventData && Object.prototype.hasOwnProperty.call(eventData, "game_id")
        ? null
        : undefined;
    if (
      metadataGameId !== requestedGameId ||
      (canonicalMetadataGameId !== undefined && canonicalMetadataGameId !== requestedGameId)
    ) {
      continue;
    }
    const gameEventId = typeof eventData?.game_event_id === "string"
      ? eventData.game_event_id.trim()
      : "";
    if (!gameEventId || !requestedEventIds.has(gameEventId)) continue;
    linkages.push({
      game_event_id: gameEventId,
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
    const gameEventId = requiredText(
      linkage.game_event_id,
      "game_event_id",
    );
    const links = indexed.get(gameEventId) ?? [];
    links.push({
      app_session_id: requiredText(linkage.app_session_id, "app_session_id"),
      container_id: requiredText(linkage.container_id, "container_id"),
      kernel_event_id: requiredText(linkage.kernel_event_id, "kernel_event_id"),
      href: safeKernelTraceHref(linkage.trace_url),
    });
    indexed.set(gameEventId, links);
  }
  return indexed;
}

/** Adds the flattened E2 kernel_traces projection without changing lifecycle events. */
export function enrichGameEventReconstruction<
  TReconstruction extends { events: readonly { event_id: string }[] },
>(
  reconstruction: TReconstruction,
  linkages: KernelTraceLinkageIndex,
): EnrichedGameEventReconstruction<TReconstruction> {
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
  } as EnrichedGameEventReconstruction<TReconstruction>;
}

/** Reads optional telemetry through an injected port, then applies the E2 projection. */
export async function enrichGameEventReconstructionFromKernelReader<
  TReconstruction extends { events: readonly { event_id: string }[] },
>(
  reconstruction: TReconstruction,
  readLinkages: KernelTraceLinkageReader,
): Promise<EnrichedGameEventReconstruction<TReconstruction>> {
  const gameEventIds = reconstruction.events.map((event) => event.event_id);
  const linkages = gameEventIds.length > 0
    ? await readLinkages(gameEventIds)
    : [];
  return enrichGameEventReconstruction(
    reconstruction,
    indexKernelTraceLinkages(linkages),
  );
}
