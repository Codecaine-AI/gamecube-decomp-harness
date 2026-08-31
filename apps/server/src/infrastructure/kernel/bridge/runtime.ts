import {
  type Container,
  type KernelTraceReadRows,
  type NewContainer,
} from "@agent-kernel/db";
import * as schema from "@agent-kernel/db/schema";
import { createKernelTraceReadApi } from "@agent-kernel/kernel/read-api";
import type { TraceEvent } from "@agent-kernel/protocol";
import { and, desc, eq, isNull, like, or, sql } from "drizzle-orm";

// The linked Core checkout owns a second physical Drizzle installation. Keep
// that type identity contained at the exported SQLite schema boundary.
const sqliteSchema = schema as any;

import {
  createMeleeKernelBridgeConfig,
  MELEE_KERNEL_ID,
  type CreateMeleeKernelBridgeConfigInput,
  type MeleeKernelBridgeConfig,
} from "./config.js";
import {
  ensureKernelObservabilitySchema,
  insertMeleeTraceEventsBatch,
  upsertMeleeContainer,
  meleeKernelRuntimeRequiredFromEnv,
  openMeleeKernelDatabase,
  resolveMeleeKernelDatabasePath,
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

export interface MeleeKernelRuntime {
  config: MeleeKernelBridgeConfig;
  databasePath: string | null;
  databaseUrl: string | null;
  db: unknown;
  registration: KernelRegistration | null;
  readApi: { handle(request: Request): Promise<Response> };
  readRows: KernelTraceRowsReader;
  traceWriter: MeleeTraceWriter;
  upsertSpawnContainers: (context: MeleeKernelSpawnContext) => Promise<void>;
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
    .select({ id: sqliteSchema.containers.id, metadata: sqliteSchema.containers.metadata })
    .from(sqliteSchema.containers)
    .where(eq(sqliteSchema.containers.id, id))
    .limit(1);
  if (direct?.id) {
    return direct.id;
  }

  const metadataIdentity = or(
    sql`json_extract(${sqliteSchema.containers.metadata}, '$.appSessionId') = ${id}`,
    sql`json_extract(${sqliteSchema.containers.metadata}, '$.appSessionSlug') = ${id}`,
    sql`json_extract(${sqliteSchema.containers.metadata}, '$.sessionId') = ${id}`,
  );

  const [rootByMetadata] = await (db as any)
    .select({ id: sqliteSchema.containers.id, metadata: sqliteSchema.containers.metadata })
    .from(sqliteSchema.containers)
    .where(and(isNull(sqliteSchema.containers.parentContainerId), metadataIdentity))
    .limit(1);
  if (rootByMetadata?.id) {
    return rootByMetadata.id;
  }

  const [byMetadata] = await (db as any)
    .select({ id: sqliteSchema.containers.id, metadata: sqliteSchema.containers.metadata })
    .from(sqliteSchema.containers)
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
      .select({ id: sqliteSchema.containers.id, metadata: sqliteSchema.containers.metadata })
      .from(sqliteSchema.containers)
      .where(
        and(
          isNull(sqliteSchema.containers.parentContainerId),
          like(sqliteSchema.containers.id, "melee:%:session"),
          sql`json_extract(${sqliteSchema.containers.metadata}, '$.gameId') IS NOT NULL`,
        ),
      )
      .orderBy(desc(sqliteSchema.containers.endedAt), desc(sqliteSchema.containers.createdAt))
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
  const handle: Pick<MeleeKernelDatabaseHandle, "databaseUrl" | "close"> & {
    db: unknown;
    databasePath: string | null;
  } = options.db
    ? {
        db: options.db,
        databasePath: options.database?.databasePath ?? null,
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

  return {
    config,
    databasePath: handle.databasePath,
    databaseUrl: handle.databaseUrl,
    db,
    registration,
    readApi,
    readRows,
    traceWriter,
    upsertSpawnContainers: (context) =>
      upsertMeleeSpawnContextContainers({ context, db, upsert: upsertContainer }),
    close: () => handle.close(),
  };
}

let defaultRuntimePromise: Promise<MeleeKernelRuntime | null> | null = null;
let defaultRuntimeWarningShown = false;

/** One retry after a short jittered pause for transient SQLite lock errors. */
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
  if (/^(1|true|yes)$/i.test(env.ORCH_AGENT_KERNEL_DISABLED ?? env.ORCH_AGENT_KERNEL_DISABLE ?? "")) {
    return null;
  }
  const databasePath = resolveMeleeKernelDatabasePath({
    ...options.database,
    env,
  });

  if (!defaultRuntimePromise) {
    defaultRuntimePromise = createDefaultMeleeKernelRuntimeWithRetry({
      ...options,
      database: {
        ...options.database,
        databasePath,
        env,
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
  try {
    await runtime?.traceWriter.flush();
  } finally {
    await runtime?.close();
  }
}
