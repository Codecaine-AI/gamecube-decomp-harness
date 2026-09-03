import {
  ensureKernelObservabilitySchema as ensureAgentKernelObservabilitySchema,
  openKernelDatabase,
  type AgentRun,
  type Container,
  type KernelDatabase,
  type NewAgentRun,
  type NewContainer,
  type NewPiAgentSession,
  type PiAgentSession,
} from "@agent-kernel/db";
import * as schema from "@agent-kernel/db/schema";
import type { TraceEvent } from "@agent-kernel/protocol";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// The linked Agent Kernel source owns a second physical Drizzle declaration.
// Keep that type identity contained at this adapter boundary.
const sqliteSchema = schema as any;

const packageRoot = fileURLToPath(new URL("../../../../../../", import.meta.url));

export const DEFAULT_AGENT_KERNEL_DB_PATH = resolve(
  packageRoot,
  "games/melee/state/agent-kernel.sqlite",
);

/** Retained for callers that display the configured database as a URL. */
export const DEFAULT_AGENT_KERNEL_DATABASE_URL = pathToFileURL(
  DEFAULT_AGENT_KERNEL_DB_PATH,
).href;

export interface OpenAppKernelDatabaseOptions {
  databasePath?: string | null;
  stateDir?: string | null;
  env?: Record<string, string | undefined>;
  /** Compatibility input. Only file: URLs are accepted. */
  databaseUrl?: string | null;
  /** Former Postgres option retained so existing callers still compile. */
  maxConnections?: number;
  /** Former Postgres option retained so existing callers still compile. */
  suppressNotices?: boolean;
}

export interface AppKernelDatabaseHandle {
  db: AppKernelDatabase;
  databasePath: string;
  databaseUrl: string | null;
  close: () => Promise<void>;
}

export type AppKernelDatabase = KernelDatabase;

function appDb(db: unknown): AppKernelDatabase {
  return db as AppKernelDatabase;
}

function resolveDatabasePath(path: string): string {
  return resolve(path);
}

export function appKernelDatabasePathFromEnv(
  env: Record<string, string | undefined> = process.env,
): string | null {
  const configured = env.ORCH_AGENT_KERNEL_DB_PATH ?? env.AGENT_KERNEL_DB_PATH;
  return configured?.trim() ? resolveDatabasePath(configured) : null;
}

/** Legacy environment reader retained for source compatibility only. */
export function appKernelDatabaseUrlFromEnv(
  env: Record<string, string | undefined> = process.env,
): string | null {
  return env.ORCH_AGENT_KERNEL_DATABASE_URL ?? env.AGENT_KERNEL_DATABASE_URL ?? null;
}

export function resolveAppKernelDatabasePath(
  options: OpenAppKernelDatabaseOptions = {},
): string {
  if (options.databasePath?.trim()) {
    return resolveDatabasePath(options.databasePath);
  }

  if (options.databaseUrl?.trim()) {
    if (!options.databaseUrl.startsWith("file:")) {
      throw new Error(
        "Postgres Agent Kernel URLs are no longer supported; set ORCH_AGENT_KERNEL_DB_PATH or databasePath.",
      );
    }
    return resolveDatabasePath(fileURLToPath(options.databaseUrl));
  }

  const envPath = appKernelDatabasePathFromEnv(options.env);
  if (envPath) return envPath;
  if (options.stateDir?.trim()) {
    return resolve(options.stateDir, "agent-kernel.sqlite");
  }
  return DEFAULT_AGENT_KERNEL_DB_PATH;
}

export function appKernelRuntimeRequiredFromEnv(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return /^(1|true|yes)$/i.test(env.ORCH_AGENT_KERNEL_REQUIRED ?? "");
}

export async function ensureKernelObservabilitySchema(db: unknown): Promise<void> {
  await ensureAgentKernelObservabilitySchema(appDb(db));
}

export async function upsertAppContainer(
  db: unknown,
  input: NewContainer,
): Promise<Container> {
  const database = appDb(db) as any;
  const [row] = await database
    .insert(sqliteSchema.containers)
    .values(input)
    .onConflictDoUpdate({
      // The app keeps stable hierarchical ids. A placeholder row can later be
      // refreshed by the richer runtime container with the same id.
      target: sqliteSchema.containers.id,
      set: {
        kernelId: input.kernelId,
        kind: input.kind,
        appKey: input.appKey,
        label: input.label,
        status: input.status,
        parentContainerId: input.parentContainerId,
        phase: input.phase,
        phaseVocabulary: input.phaseVocabulary,
        workingDir: input.workingDir,
        metadata: input.metadata,
        usageInputTokens: input.usageInputTokens,
        usageOutputTokens: input.usageOutputTokens,
        usageCacheRead: input.usageCacheRead,
        usageCacheWrite: input.usageCacheWrite,
        usageCostEstimate: input.usageCostEstimate,
        startedAt: input.startedAt,
        endedAt: input.endedAt,
      },
    })
    .returning();
  return row as Container;
}

export async function insertAppTraceEventsBatch(
  db: unknown,
  events: TraceEvent[],
): Promise<number> {
  if (events.length === 0) return 0;
  const database = appDb(db) as any;
  const inserted = await database
    .insert(sqliteSchema.traceEvents)
    .values(events.map((event) => ({
      eventId: event.eventId,
      containerId: event.containerId,
      runId: event.runId ?? null,
      piSessionId: event.piSessionUuid ?? null,
      agentId: event.agentId ?? null,
      userId: event.userId ?? null,
      type: event.type,
      source: event.source,
      traceLevel: event.traceLevel,
      eventData: event.eventData,
      spanId: event.spanId ?? null,
      parentEventId: event.parentEventId ?? null,
      timestamp: event.timestamp,
    })))
    .onConflictDoNothing({ target: sqliteSchema.traceEvents.eventId })
    .returning({ eventId: sqliteSchema.traceEvents.eventId });
  return inserted.length;
}

export async function upsertAppPiAgentSession(
  db: unknown,
  data: NewPiAgentSession,
): Promise<PiAgentSession> {
  const database = appDb(db) as any;
  const [row] = await database
    .insert(sqliteSchema.piAgentSessions)
    .values(data)
    .onConflictDoUpdate({
      target: sqliteSchema.piAgentSessions.id,
      set: {
        containerId: data.containerId,
        parentSessionId: data.parentSessionId,
        parentToolUseId: data.parentToolUseId,
        displayLabel: data.displayLabel,
        model: data.model,
        promptHash: data.promptHash,
        status: data.status,
        phase: data.phase,
        usageInputTokens: data.usageInputTokens,
        usageOutputTokens: data.usageOutputTokens,
        endedAt: data.endedAt,
      },
    })
    .returning();
  return row as PiAgentSession;
}

export async function upsertAppAgentRun(
  db: unknown,
  data: NewAgentRun,
): Promise<AgentRun> {
  const database = appDb(db) as any;
  const [row] = await database
    .insert(sqliteSchema.agentRuns)
    .values(data)
    .onConflictDoUpdate({
      target: sqliteSchema.agentRuns.id,
      set: {
        piSessionId: data.piSessionId,
        containerId: data.containerId,
        parentRunId: data.parentRunId,
        parentToolUseId: data.parentToolUseId,
        agentName: data.agentName,
        trigger: data.trigger,
        inboundEventId: data.inboundEventId,
        outboundEventId: data.outboundEventId,
        displayLabel: data.displayLabel,
        phase: data.phase,
        status: data.status,
        usageInputTokens: data.usageInputTokens,
        usageOutputTokens: data.usageOutputTokens,
        usageCacheRead: data.usageCacheRead,
        usageCacheWrite: data.usageCacheWrite,
        usageCostEstimate: data.usageCostEstimate,
        startedAt: data.startedAt,
        endedAt: data.endedAt,
      },
    })
    .returning();
  return row as AgentRun;
}

export async function openAppKernelDatabase(
  options: OpenAppKernelDatabaseOptions = {},
): Promise<AppKernelDatabaseHandle> {
  const databasePath = resolveAppKernelDatabasePath(options);
  const handle = openKernelDatabase({ path: databasePath });
  return {
    db: handle.db,
    databasePath: handle.path,
    databaseUrl: pathToFileURL(handle.path).href,
    close: async () => handle.close(),
  };
}
