import {
  type AgentRun,
  type Container,
  type KernelTraceReadRows,
  type NewAgentRun,
  type NewContainer,
  type NewPiAgentSession,
  type PiAgentSession,
} from "@agent-kernel/db";
import * as schema from "@agent-kernel/db/schema/pg";
import { createKernelTraceReadApi } from "@agent-kernel/kernel/read-api";
import type { TraceEvent } from "@agent-kernel/protocol";
import { and, desc, eq, isNull, like, or, sql } from "drizzle-orm";

// The linked Core checkout owns a second physical Drizzle installation. Keep
// that type-skew contained at the exported Postgres schema boundary.
const pgSchema = schema as any;

import {
  createMeleeKernelBridgeConfig,
  MELEE_KERNEL_ID,
  type CreateMeleeKernelBridgeConfigInput,
  type MeleeKernelBridgeConfig,
} from "./config.js";
import {
  ensureKernelObservabilitySchema,
  insertMeleeTraceEventsBatch,
  upsertMeleeAgentRun,
  upsertMeleeContainer,
  upsertMeleePiAgentSession,
  DEFAULT_AGENT_KERNEL_DATABASE_URL,
  meleeKernelDatabaseUrlFromEnv,
  meleeKernelRuntimeRequiredFromEnv,
  openMeleeKernelDatabase,
  type MeleeKernelDatabaseHandle,
  type OpenMeleeKernelDatabaseOptions,
} from "./database.js";
import type { MeleeKernelSpawnContext } from "./kernel.js";
import {
  createDbKernelTraceRowsReader,
  createMeleeKernelTraceReadService,
  getMeleeKernelTraceReadRows,
  type KernelTraceRowsLister,
  type KernelTraceRowsReader,
  type KernelTraceIdentityResolver,
} from "./read-api.js";
import {
  upsertMeleeKernelRegistration,
  type KernelRegistration,
  type KernelRegistrationUpsertPort,
} from "./registration.js";
import {
  createMeleeTraceTailer,
  type CreateMeleeTraceTailerOptions,
  type MeleeTraceTailer,
  type MeleeTraceTailerStatus,
} from "./tailer.js";
import {
  createMeleeTraceWriter,
  type MeleeTraceWriter,
} from "./trace-writer.js";

export type ContainerUpsertPort = (
  db: unknown,
  data: NewContainer,
) => Promise<Container | NewContainer>;

export type TraceEventsInsertPort = (
  db: unknown,
  events: TraceEvent[],
) => Promise<number>;

export type PiAgentSessionUpsertPort = (
  db: unknown,
  data: NewPiAgentSession,
) => Promise<PiAgentSession | NewPiAgentSession>;

export type AgentRunUpsertPort = (
  db: unknown,
  data: NewAgentRun,
) => Promise<AgentRun | NewAgentRun>;

export interface MeleeKernelRuntime {
  config: MeleeKernelBridgeConfig;
  databaseUrl: string | null;
  db: unknown;
  registration: KernelRegistration | null;
  readApi: { handle(request: Request): Promise<Response> };
  readRows: KernelTraceRowsReader;
  traceWriter: MeleeTraceWriter;
  upsertSpawnContainers: (context: MeleeKernelSpawnContext) => Promise<void>;
  startTraceTailer: () => Promise<void>;
  flushTraceTailer: () => Promise<void>;
  stopTraceTailer: () => Promise<void>;
  traceTailerStatus: () => MeleeTraceTailerStatus | null;
  close: () => Promise<void>;
}

export interface CreateMeleeKernelRuntimeOptions {
  config?: CreateMeleeKernelBridgeConfigInput | MeleeKernelBridgeConfig;
  database?: OpenMeleeKernelDatabaseOptions;
  db?: unknown;
  closeDatabase?: () => Promise<void>;
  ensureSchema?: boolean;
  ensureSchemaWith?: (db: unknown) => Promise<void>;
  register?: boolean;
  upsertRegistration?: KernelRegistrationUpsertPort;
  upsertContainer?: ContainerUpsertPort;
  insertTraceEvents?: TraceEventsInsertPort;
  upsertPiAgentSession?: PiAgentSessionUpsertPort;
  upsertAgentRun?: AgentRunUpsertPort;
  tailer?: Omit<
    CreateMeleeTraceTailerOptions,
    "db" | "config" | "insertTraceEvents" | "upsertPiAgentSession" | "upsertAgentRun"
  > | false;
  readRows?: KernelTraceRowsReader;
  listRows?: KernelTraceRowsLister;
  resolveIdentity?: KernelTraceIdentityResolver;
}

export interface GetDefaultMeleeKernelRuntimeOptions
  extends Omit<CreateMeleeKernelRuntimeOptions, "database"> {
  database?: OpenMeleeKernelDatabaseOptions & {
    env?: Record<string, string | undefined>;
  };
}

function metadataString(metadata: Record<string, unknown> | null | undefined, key: string): string | null {
  const value = metadata?.[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

function dedupeContainers(containers: NewContainer[]): NewContainer[] {
  const byId = new Map<string, NewContainer>();
  for (const container of containers) byId.set(container.id, container);
  return [...byId.values()];
}

export async function upsertMeleeSpawnContextContainers({
  context,
  db,
  upsert = upsertMeleeContainer,
}: {
  context: MeleeKernelSpawnContext;
  db: unknown;
  upsert?: ContainerUpsertPort;
}): Promise<void> {
  const lineage = dedupeContainers(context.containerLineage ?? []);
  if (lineage.length === 0 && context.containerId) {
    const createdAt = new Date().toISOString();
    lineage.push({
      id: context.containerId,
      kernelId: MELEE_KERNEL_ID,
      kind: context.phase ?? "session",
      appKey: [context.containerId],
      parentContainerId: null,
      label: context.containerId,
      status: "running",
      workingDir: context.workingDir ?? null,
      phase: context.phase ?? null,
      phaseVocabulary: [],
      metadata: {
        appSessionId: context.appSessionId,
        ...(context.metadata ?? {}),
      },
      createdAt,
      startedAt: createdAt,
    });
  }

  for (const container of lineage) {
    await upsert(db, {
      ...container,
      workingDir: container.workingDir ?? context.workingDir ?? null,
    });
  }
}

export async function resolveMeleeKernelTraceIdentity(
  db: unknown,
  id: string,
): Promise<string> {
  const [direct] = await (db as any)
    .select({ id: pgSchema.containers.id, metadata: pgSchema.containers.metadata })
    .from(pgSchema.containers)
    .where(eq(pgSchema.containers.id, id))
    .limit(1);
  if (direct?.id) {
    return direct.id;
  }

  const metadataIdentity = or(
    sql`${pgSchema.containers.metadata}->>'appSessionId' = ${id}`,
    sql`${pgSchema.containers.metadata}->>'appSessionSlug' = ${id}`,
    sql`${pgSchema.containers.metadata}->>'sessionId' = ${id}`,
  );

  const [rootByMetadata] = await (db as any)
    .select({ id: pgSchema.containers.id, metadata: pgSchema.containers.metadata })
    .from(pgSchema.containers)
    .where(and(isNull(pgSchema.containers.parentContainerId), metadataIdentity))
    .limit(1);
  if (rootByMetadata?.id) {
    return rootByMetadata.id;
  }

  const [byMetadata] = await (db as any)
    .select({ id: pgSchema.containers.id, metadata: pgSchema.containers.metadata })
    .from(pgSchema.containers)
    .where(metadataIdentity)
    .limit(1);

  return byMetadata?.id ?? id;
}

export function createDbMeleeKernelTraceRowsLister(
  db: unknown,
  _config: MeleeKernelBridgeConfig,
): KernelTraceRowsLister {
  return async (query) => {
    const limit = Math.min(Math.max(query.limit ?? 100, 1), 500);
    const roots: Array<{ id: string; metadata: Record<string, unknown> }> = await (db as any)
      .select({ id: pgSchema.containers.id, metadata: pgSchema.containers.metadata })
      .from(pgSchema.containers)
      .where(
        and(
          isNull(pgSchema.containers.parentContainerId),
          like(pgSchema.containers.id, "melee:%:session"),
          sql`${pgSchema.containers.metadata}->>'gameId' IS NOT NULL`,
        ),
      )
      .orderBy(desc(pgSchema.containers.endedAt), desc(pgSchema.containers.createdAt))
      .limit(limit);

    const rows: KernelTraceReadRows[] = [];
    for (const root of roots) {
      const readRows = await getMeleeKernelTraceReadRows(
        db,
        root.id,
        {
          after: query.after,
          limit: query.limit,
        },
      );
      if (readRows) rows.push(readRows);
    }

    return rows;
  };
}

export async function createMeleeKernelRuntime(
  options: CreateMeleeKernelRuntimeOptions = {},
): Promise<MeleeKernelRuntime> {
  const config = createMeleeKernelBridgeConfig(options.config);
  const handle: Pick<MeleeKernelDatabaseHandle, "databaseUrl" | "close"> & { db: unknown } = options.db
    ? {
        db: options.db,
        databaseUrl: options.database?.databaseUrl ?? null,
        close: options.closeDatabase ?? (async () => {}),
      }
    : await openMeleeKernelDatabase(options.database);
  const db = handle.db;

  if (options.ensureSchema !== false) {
    await (options.ensureSchemaWith ?? ensureKernelObservabilitySchema)(db as any);
  }

  const registration =
    options.register === false
      ? null
      : await upsertMeleeKernelRegistration({
          db,
          config,
          upsert: options.upsertRegistration,
        });
  const insertTraceEvents = options.insertTraceEvents ?? insertMeleeTraceEventsBatch;
  const traceWriter = createMeleeTraceWriter({
    insertBatch: (events) => insertTraceEvents(db, events),
  });
  const readRows = options.readRows ?? createDbKernelTraceRowsReader({ db });
  const listRows = options.listRows ?? createDbMeleeKernelTraceRowsLister(db, config);
  const resolveIdentity =
    options.resolveIdentity ?? ((id) => resolveMeleeKernelTraceIdentity(db, id));
  const readService = createMeleeKernelTraceReadService({
    readRows,
    listRows,
    resolveIdentity,
  });
  const readApi = createKernelTraceReadApi(readService);
  const upsertContainer = options.upsertContainer ?? upsertMeleeContainer;
  const upsertPiAgentSession = options.upsertPiAgentSession ?? upsertMeleePiAgentSession;
  const upsertAgentRun = options.upsertAgentRun ?? upsertMeleeAgentRun;
  let traceTailer: MeleeTraceTailer | null = null;
  let traceTailerStartPromise: Promise<void> | null = null;

  const getTraceTailer = (): MeleeTraceTailer | null => {
    if (options.tailer === false) return null;
    if (!traceTailer) {
      traceTailer = createMeleeTraceTailer({
        db,
        config,
        insertTraceEvents,
        upsertPiAgentSession,
        upsertAgentRun,
        ...(options.tailer ?? {}),
      });
    }
    return traceTailer;
  };

  return {
    config,
    databaseUrl: handle.databaseUrl,
    db,
    registration,
    readApi,
    readRows,
    traceWriter,
    upsertSpawnContainers: (context) =>
      upsertMeleeSpawnContextContainers({ context, db, upsert: upsertContainer }),
    startTraceTailer: async () => {
      const tailer = getTraceTailer();
      if (!tailer) return;
      traceTailerStartPromise ??= tailer.start().finally(() => {
        traceTailerStartPromise = null;
      });
      await traceTailerStartPromise;
    },
    flushTraceTailer: async () => {
      await traceTailerStartPromise?.catch(() => {});
      await traceTailer?.flush();
    },
    stopTraceTailer: async () => {
      await traceTailerStartPromise?.catch(() => {});
      await traceTailer?.stop();
    },
    traceTailerStatus: () => traceTailer?.status() ?? null,
    close: async () => {
      await traceTailerStartPromise?.catch(() => {});
      await traceTailer?.stop();
      await handle.close();
    },
  };
}

let defaultRuntimePromise: Promise<MeleeKernelRuntime | null> | null = null;
let defaultRuntimeWarningShown = false;

/** One retry after a short jittered pause. Runtime init can lose a transient
 * race (schema bootstrap DDL queued behind live traffic); by the second
 * attempt another process has usually committed the bootstrap, so the
 * schema-current probe fast-path succeeds without any DDL. */
async function createDefaultMeleeKernelRuntimeWithRetry(
  options: GetDefaultMeleeKernelRuntimeOptions,
): Promise<MeleeKernelRuntime> {
  try {
    return await createMeleeKernelRuntime(options);
  } catch (error) {
    const delayMs = Math.round(1000 + Math.random() * 1000);
    console.warn(
      `Agent Kernel runtime init failed (${error instanceof Error ? error.message : String(error)}); retrying once in ${delayMs}ms`,
    );
    await new Promise<void>((resolveDelay) => setTimeout(resolveDelay, delayMs));
    return createMeleeKernelRuntime(options);
  }
}

export async function getDefaultMeleeKernelRuntime(
  options: GetDefaultMeleeKernelRuntimeOptions = {},
): Promise<MeleeKernelRuntime | null> {
  if (options.db) return createMeleeKernelRuntime(options);

  const env = options.database?.env ?? process.env;
  const databaseUrl =
    options.database?.databaseUrl ?? meleeKernelDatabaseUrlFromEnv(env) ?? DEFAULT_AGENT_KERNEL_DATABASE_URL;
  if (!databaseUrl) return null;

  if (!defaultRuntimePromise) {
    defaultRuntimePromise = createDefaultMeleeKernelRuntimeWithRetry({
      ...options,
      database: {
        ...options.database,
        databaseUrl,
      },
    }).catch((error) => {
      defaultRuntimePromise = null;
      if (meleeKernelRuntimeRequiredFromEnv(env)) throw error;
      if (!defaultRuntimeWarningShown) {
        defaultRuntimeWarningShown = true;
        console.warn(
          `Agent Kernel runtime disabled after DB initialization failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      return null;
    });
  }

  return defaultRuntimePromise;
}

export function resetDefaultMeleeKernelRuntimeForTests(): void {
  defaultRuntimePromise = null;
  defaultRuntimeWarningShown = false;
}

export async function closeDefaultMeleeKernelRuntime(): Promise<void> {
  const runtimePromise = defaultRuntimePromise;
  defaultRuntimePromise = null;
  defaultRuntimeWarningShown = false;
  const runtime = await runtimePromise?.catch(() => null);
  await runtime?.close();
}
