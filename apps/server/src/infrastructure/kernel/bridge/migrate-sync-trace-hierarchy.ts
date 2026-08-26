import type { NewContainer } from "@agent-kernel/db";
import { sql } from "drizzle-orm";

import { MELEE_KERNEL_ID } from "./config.js";
import { getDefaultMeleeKernelRuntime } from "./runtime.js";
import {
  buildMeleeContainer,
  meleeIntakeContainerId,
  meleeKnowledgeContainerId,
  meleeRootContainerId,
  meleeRunContainerId,
  meleeSyncContainerId,
  meleeSyncIntakeContainerId,
  meleeSyncWorkflowContainerId,
  meleeSyncWorkflowIntakeContainerId,
  meleeSyncWorkflowIntakeItemContainerId,
  meleeSyncWorkflowIntakePostmortemContainerId,
  meleeSyncWorkflowKnowledgeContainerId,
  type MeleeCycleRef,
} from "./session-mapping.js";

export interface SyncTraceMigrationContainerRow {
  id: string;
  kernelId: string;
  kind: string;
  appKey: unknown[];
  label: string | null;
  status: string;
  parentContainerId: string | null;
  phase: string | null;
  phaseVocabulary: unknown[] | null;
  workingDir: string | null;
  metadata: Record<string, unknown> | null;
  usageInputTokens: number;
  usageOutputTokens: number;
  usageCacheRead: number;
  usageCacheWrite: number;
  usageCostEstimate: number | null;
  createdAt: string;
  startedAt: string | null;
  endedAt: string | null;
}

export interface SyncTraceContainerRewrite {
  oldId: string;
  newId: string;
  row: SyncTraceMigrationContainerRow;
}

export interface SyncTraceScopedEventMove {
  oldContainerId: string;
  newContainerId: string;
}

export interface SyncTraceMigrationPlan {
  syncId: string;
  refs: MeleeCycleRef[];
  parents: SyncTraceMigrationContainerRow[];
  rewrites: SyncTraceContainerRewrite[];
  scopedEventMoves: SyncTraceScopedEventMove[];
}

export interface SyncTraceMigrationDatabasePort {
  transaction<T>(operation: (tx: SyncTraceMigrationDatabasePort) => Promise<T>): Promise<T>;
  findContainersReferencingSync(syncId: string): Promise<SyncTraceMigrationContainerRow[]>;
  findContainersUnderRoots(rootIds: string[]): Promise<SyncTraceMigrationContainerRow[]>;
  insertContainers(rows: SyncTraceMigrationContainerRow[]): Promise<number>;
  repointChildContainers(rewrites: SyncTraceContainerRewrite[]): Promise<number>;
  repointTraceEvents(rewrites: SyncTraceContainerRewrite[]): Promise<number>;
  repointAgentRuns(rewrites: SyncTraceContainerRewrite[]): Promise<number>;
  repointPiAgentSessions(rewrites: SyncTraceContainerRewrite[]): Promise<number>;
  repointScopedTraceEvents(syncId: string, moves: SyncTraceScopedEventMove[]): Promise<number>;
  deleteEmptyContainers(oldIds: string[]): Promise<number>;
}

export interface RunSyncTraceMigrationOptions {
  syncId: string;
  claimIntakeItems?: boolean;
  dryRun?: boolean;
  db?: unknown;
  port?: SyncTraceMigrationDatabasePort;
  now?: string;
}

export interface SyncTraceMigrationSummary {
  syncId: string;
  dryRun: boolean;
  claimedIntakeItems: boolean;
  cycleCount: number;
  parentContainersPlanned: number;
  containersPlanned: number;
  containersInserted: number;
  childContainersRepointed: number;
  traceEventsRepointed: number;
  agentRunsRepointed: number;
  piAgentSessionsRepointed: number;
  containersDeleted: number;
}

function assertSyncId(syncId: string): string {
  const normalized = syncId.trim();
  if (!/^sync-[a-z0-9][a-z0-9._-]*$/i.test(normalized)) {
    throw new Error("--sync-id must be a nonblank id beginning with 'sync-'");
  }
  return normalized;
}

function metadataText(row: SyncTraceMigrationContainerRow): string {
  return JSON.stringify(row.metadata ?? {});
}

function rowReferencesSync(row: SyncTraceMigrationContainerRow, syncId: string): boolean {
  return row.id.includes(syncId) || metadataText(row).includes(syncId);
}

function metadataString(row: SyncTraceMigrationContainerRow, key: string): string | null {
  const value = row.metadata?.[key];
  if (typeof value === "number") return String(value);
  if (typeof value !== "string") return null;
  return value.trim() || null;
}

function refForRow(row: SyncTraceMigrationContainerRow): MeleeCycleRef | null {
  const gameId = metadataString(row, "gameId");
  const sessionId = metadataString(row, "sessionId");
  return gameId && sessionId ? { gameId, sessionId } : null;
}

function refKey(ref: MeleeCycleRef): string {
  return `${ref.gameId}\n${ref.sessionId}`;
}

function prIdForPostmortem(row: SyncTraceMigrationContainerRow): string | null {
  const explicit = metadataString(row, "prId");
  if (explicit) return explicit.replace(/^#/, "");
  const claimId = metadataString(row, "claimId") ?? metadataString(row, "itemId");
  const claimMatch = claimId?.match(/^pr[-:#]?([0-9]+)(?:\b|-)/i);
  if (claimMatch) return claimMatch[1];
  const labelMatch = row.label?.match(/\bPR\s*#?([0-9]+)\b/i);
  if (labelMatch) return labelMatch[1];
  const idMatch = row.id.match(/:postmortem:pr[-:#]?([0-9]+)(?:\b|-)/i);
  return idMatch?.[1] ?? null;
}

function rowDepth(row: Pick<SyncTraceMigrationContainerRow, "id">): number {
  return row.id.split(":").length;
}

function postmortemDescendantSuffix(id: string): string {
  const marker = ":postmortem:";
  const claimStart = id.indexOf(marker);
  if (claimStart < 0) return "";
  const suffixStart = id.indexOf(":", claimStart + marker.length);
  return suffixStart < 0 ? "" : id.slice(suffixStart);
}

function parentRow(
  ref: MeleeCycleRef,
  syncId: string,
  kind: "sync" | "intake" | "intake-item" | "knowledge",
  id: string,
  parentContainerId: string,
  now: string,
  prId?: string,
): SyncTraceMigrationContainerRow {
  const built = buildMeleeContainer({
    kind,
    ref,
    startedAt: now,
    metadata: {
      runId: syncId,
      syncId,
      ...(prId ? { prId } : {}),
    },
  });
  return {
    id,
    kernelId: built.kernelId,
    kind: built.kind,
    appKey: [id],
    label: built.label ?? null,
    status: built.status ?? "running",
    parentContainerId,
    phase: built.phase ?? null,
    phaseVocabulary: built.phaseVocabulary ?? null,
    workingDir: built.workingDir ?? null,
    metadata: {
      ...(built.metadata ?? {}),
      runId: syncId,
      syncId,
      containerId: id,
      ...(prId ? { prId } : {}),
    },
    usageInputTokens: built.usageInputTokens ?? 0,
    usageOutputTokens: built.usageOutputTokens ?? 0,
    usageCacheRead: built.usageCacheRead ?? 0,
    usageCacheWrite: built.usageCacheWrite ?? 0,
    usageCostEstimate: built.usageCostEstimate ?? null,
    createdAt: built.createdAt,
    startedAt: built.startedAt ?? null,
    endedAt: built.endedAt ?? null,
  };
}

function copiedRow(
  row: SyncTraceMigrationContainerRow,
  newId: string,
  newParentContainerId: string | null,
  syncId: string,
): SyncTraceMigrationContainerRow {
  return {
    ...row,
    id: newId,
    appKey: [newId],
    parentContainerId: newParentContainerId,
    metadata: {
      ...(row.metadata ?? {}),
      runId: syncId,
      syncId,
      containerId: newId,
    },
  };
}

/** Pure rewrite planner. It never reads from or writes to Postgres. */
export function planSyncTraceHierarchyMigration(input: {
  syncId: string;
  refs: MeleeCycleRef[];
  containers: SyncTraceMigrationContainerRow[];
  claimIntakeItems?: boolean;
  now?: string;
}): SyncTraceMigrationPlan {
  const syncId = assertSyncId(input.syncId);
  const now = input.now ?? new Date().toISOString();
  const refsByRoot = new Map(input.refs.map((ref) => [meleeRootContainerId(ref), ref]));
  const parents = new Map<string, SyncTraceMigrationContainerRow>();
  const rewriteIds = new Map<string, string>();
  const scopedEventMoves = new Map<string, SyncTraceScopedEventMove>();

  const addParent = (row: SyncTraceMigrationContainerRow): void => {
    parents.set(row.id, row);
  };
  const addBaseParents = (ref: MeleeCycleRef): { sync: string; intake: string; knowledge: string } => {
    const root = meleeRootContainerId(ref);
    const sync = meleeSyncWorkflowContainerId(ref, syncId);
    const intake = meleeSyncWorkflowIntakeContainerId(ref, syncId);
    const knowledge = meleeSyncWorkflowKnowledgeContainerId(ref, syncId);
    addParent(parentRow(ref, syncId, "sync", sync, root, now));
    addParent(parentRow(ref, syncId, "intake", intake, sync, now));
    addParent(parentRow(ref, syncId, "knowledge", knowledge, sync, now));
    return { sync, intake, knowledge };
  };

  for (const [root, ref] of refsByRoot) {
    const next = addBaseParents(ref);
    const legacySync = meleeSyncContainerId(ref);
    const legacySyncIntake = meleeSyncIntakeContainerId(ref);
    const legacyKnowledge = meleeKnowledgeContainerId(ref);
    for (const [oldContainerId, newContainerId] of [
      [legacySync, next.sync],
      [legacySyncIntake, next.sync],
      [legacyKnowledge, next.knowledge],
    ] as const) {
      scopedEventMoves.set(`${oldContainerId}\n${newContainerId}`, { oldContainerId, newContainerId });
    }

    const legacyRunPrefix = `${meleeRunContainerId({ ...ref, runId: syncId })}:epoch:`;
    const legacyIntakePrefix = `${meleeIntakeContainerId(ref)}:pr:`;
    const legacyKnowledgePrefix = `${legacyKnowledge}:`;
    const legacySyncIntakePrefix = `${legacySyncIntake}:`;
    const rows = input.containers.filter((row) => row.id === root || row.id.startsWith(`${root}:`));

    for (const row of rows) {
      if (row.id.startsWith(legacyRunPrefix) && row.id.includes(":postmortem:")) {
        const prId = prIdForPostmortem(row);
        if (!prId) continue;
        const itemId = meleeSyncWorkflowIntakeItemContainerId(ref, syncId, prId);
        addParent(parentRow(ref, syncId, "intake-item", itemId, next.intake, now, prId));
        rewriteIds.set(
          row.id,
          `${meleeSyncWorkflowIntakePostmortemContainerId(ref, syncId, prId)}${postmortemDescendantSuffix(row.id)}`,
        );
        continue;
      }

      if (input.claimIntakeItems && row.id.startsWith(legacyIntakePrefix)) {
        rewriteIds.set(row.id, `${next.intake}${row.id.slice(meleeIntakeContainerId(ref).length)}`);
        continue;
      }

      if (row.id.startsWith(legacySyncIntakePrefix) && rowReferencesSync(row, syncId)) {
        rewriteIds.set(row.id, `${next.sync}${row.id.slice(legacySyncIntake.length)}`);
        continue;
      }

      if (row.id.startsWith(legacyKnowledgePrefix) && rowReferencesSync(row, syncId)) {
        rewriteIds.set(row.id, `${next.knowledge}${row.id.slice(legacyKnowledge.length)}`);
      }
    }
  }

  const rowsById = new Map(input.containers.map((row) => [row.id, row]));
  const rewrites = [...rewriteIds.entries()].map(([oldId, newId]) => {
    const row = rowsById.get(oldId);
    if (!row) throw new Error(`Missing planned source container ${oldId}`);
    const mappedParent = row.parentContainerId ? rewriteIds.get(row.parentContainerId) : null;
    let newParentContainerId = mappedParent ?? row.parentContainerId;
    for (const [root, ref] of refsByRoot) {
      if (!(oldId === root || oldId.startsWith(`${root}:`))) continue;
      const oldIntake = meleeIntakeContainerId(ref);
      const oldKnowledge = meleeKnowledgeContainerId(ref);
      const oldSyncIntake = meleeSyncIntakeContainerId(ref);
      if (row.parentContainerId === oldIntake) {
        newParentContainerId = meleeSyncWorkflowIntakeContainerId(ref, syncId);
      } else if (row.parentContainerId === oldKnowledge) {
        newParentContainerId = meleeSyncWorkflowKnowledgeContainerId(ref, syncId);
      } else if (row.parentContainerId === oldSyncIntake) {
        newParentContainerId = meleeSyncWorkflowContainerId(ref, syncId);
      } else if (!mappedParent && oldId.includes(":postmortem:")) {
        const prId = prIdForPostmortem(row);
        if (prId) newParentContainerId = meleeSyncWorkflowIntakeItemContainerId(ref, syncId, prId);
      }
      break;
    }
    const copied = copiedRow(row, newId, newParentContainerId, syncId);
    if (oldId.includes(":postmortem:") && postmortemDescendantSuffix(oldId) === "") {
      const prId = prIdForPostmortem(row) ?? "item";
      copied.kind = "intake-postmortem";
      copied.label = `PR #${prId} postmortem`;
      copied.phase = "postmortem";
      copied.metadata = {
        ...(copied.metadata ?? {}),
        containerKind: "intake-postmortem",
        prId,
      };
    }
    return {
      oldId,
      newId,
      row: copied,
    };
  }).sort((a, b) => rowDepth(a.row) - rowDepth(b.row));

  const usedParentIds = new Set<string>();
  for (const rewrite of rewrites) {
    let parentId = rewrite.row.parentContainerId;
    while (parentId && parents.has(parentId)) {
      usedParentIds.add(parentId);
      parentId = parents.get(parentId)?.parentContainerId ?? null;
    }
  }
  for (const move of scopedEventMoves.values()) usedParentIds.add(move.newContainerId);
  const rewriteTargetIds = new Set(rewrites.map((rewrite) => rewrite.newId));
  const selectedParents = [...parents.values()]
    .filter((row) => usedParentIds.has(row.id) && !rewriteTargetIds.has(row.id))
    .sort((a, b) => rowDepth(a) - rowDepth(b));

  return {
    syncId,
    refs: [...refsByRoot.values()],
    parents: selectedParents,
    rewrites,
    scopedEventMoves: [...scopedEventMoves.values()],
  };
}

function queryRows(result: unknown): Record<string, unknown>[] {
  if (Array.isArray(result)) return result as Record<string, unknown>[];
  const rows = (result as { rows?: unknown[] } | null)?.rows;
  return Array.isArray(rows) ? rows as Record<string, unknown>[] : [];
}

function affectedRows(result: unknown): number {
  const count = (result as { count?: unknown; rowCount?: unknown } | null)?.count
    ?? (result as { rowCount?: unknown } | null)?.rowCount;
  return typeof count === "number" ? count : Number(count ?? 0) || 0;
}

function databaseRow(row: Record<string, unknown>): SyncTraceMigrationContainerRow {
  return {
    id: String(row.id),
    kernelId: String(row.kernelId),
    kind: String(row.kind),
    appKey: Array.isArray(row.appKey) ? row.appKey : [],
    label: row.label == null ? null : String(row.label),
    status: String(row.status),
    parentContainerId: row.parentContainerId == null ? null : String(row.parentContainerId),
    phase: row.phase == null ? null : String(row.phase),
    phaseVocabulary: Array.isArray(row.phaseVocabulary) ? row.phaseVocabulary : null,
    workingDir: row.workingDir == null ? null : String(row.workingDir),
    metadata: row.metadata && typeof row.metadata === "object" ? row.metadata as Record<string, unknown> : null,
    usageInputTokens: Number(row.usageInputTokens ?? 0),
    usageOutputTokens: Number(row.usageOutputTokens ?? 0),
    usageCacheRead: Number(row.usageCacheRead ?? 0),
    usageCacheWrite: Number(row.usageCacheWrite ?? 0),
    usageCostEstimate: row.usageCostEstimate == null ? null : Number(row.usageCostEstimate),
    createdAt: String(row.createdAt),
    startedAt: row.startedAt == null ? null : String(row.startedAt),
    endedAt: row.endedAt == null ? null : String(row.endedAt),
  };
}

function createPostgresPort(db: any): SyncTraceMigrationDatabasePort {
  const selectColumns = sql.raw(`
    id,
    kernel_id AS "kernelId",
    kind,
    app_key AS "appKey",
    label,
    status,
    parent_container_id AS "parentContainerId",
    phase,
    phase_vocabulary AS "phaseVocabulary",
    working_dir AS "workingDir",
    metadata,
    usage_input_tokens AS "usageInputTokens",
    usage_output_tokens AS "usageOutputTokens",
    usage_cache_read AS "usageCacheRead",
    usage_cache_write AS "usageCacheWrite",
    usage_cost_estimate AS "usageCostEstimate",
    created_at AS "createdAt",
    started_at AS "startedAt",
    ended_at AS "endedAt"
  `);

  const port: SyncTraceMigrationDatabasePort = {
    async transaction(operation) {
      return db.transaction((tx: unknown) => operation(createPostgresPort(tx)));
    },
    async findContainersReferencingSync(syncId) {
      const pattern = `%${syncId}%`;
      const result = await db.execute(sql`
        SELECT ${selectColumns}
        FROM containers
        WHERE kernel_id = ${MELEE_KERNEL_ID}
          AND (
            id LIKE ${pattern}
            OR COALESCE(metadata, '{}'::jsonb)::text LIKE ${pattern}
            OR EXISTS (
              SELECT 1
              FROM trace_events event
              WHERE event.container_id = containers.id
                AND (event.run_id = ${syncId} OR event.event_data::text LIKE ${pattern})
            )
          )
        ORDER BY id
      `);
      return queryRows(result).map(databaseRow);
    },
    async findContainersUnderRoots(rootIds) {
      if (rootIds.length === 0) return [];
      const clauses = rootIds.map((rootId) => sql`id = ${rootId} OR id LIKE ${`${rootId}:%`}`);
      const result = await db.execute(sql`
        SELECT ${selectColumns}
        FROM containers
        WHERE kernel_id = ${MELEE_KERNEL_ID}
          AND (${sql.join(clauses, sql` OR `)})
        ORDER BY id
      `);
      return queryRows(result).map(databaseRow);
    },
    async insertContainers(rows) {
      let inserted = 0;
      for (const row of rows) {
        const result = await db.execute(sql`
          INSERT INTO containers (
            id, kernel_id, kind, app_key, label, status, parent_container_id,
            phase, phase_vocabulary, working_dir, metadata,
            usage_input_tokens, usage_output_tokens, usage_cache_read,
            usage_cache_write, usage_cost_estimate, created_at, started_at, ended_at
          ) VALUES (
            ${row.id}, ${row.kernelId}, ${row.kind}, ${JSON.stringify(row.appKey)}::jsonb,
            ${row.label}, ${row.status}, ${row.parentContainerId}, ${row.phase},
            ${JSON.stringify(row.phaseVocabulary)}::jsonb, ${row.workingDir},
            ${JSON.stringify(row.metadata)}::jsonb, ${row.usageInputTokens},
            ${row.usageOutputTokens}, ${row.usageCacheRead}, ${row.usageCacheWrite},
            ${row.usageCostEstimate}, ${row.createdAt}, ${row.startedAt}, ${row.endedAt}
          )
          ON CONFLICT DO NOTHING
        `);
        inserted += affectedRows(result);
      }
      return inserted;
    },
    async repointChildContainers(rewrites) {
      let updated = 0;
      for (const rewrite of rewrites) {
        updated += affectedRows(await db.execute(sql`
          UPDATE containers SET parent_container_id = ${rewrite.newId}
          WHERE parent_container_id = ${rewrite.oldId}
            AND id <> ${rewrite.newId}
        `));
      }
      return updated;
    },
    async repointTraceEvents(rewrites) {
      let updated = 0;
      for (const rewrite of rewrites) {
        updated += affectedRows(await db.execute(sql`
          UPDATE trace_events SET container_id = ${rewrite.newId}
          WHERE container_id = ${rewrite.oldId}
        `));
      }
      return updated;
    },
    async repointAgentRuns(rewrites) {
      let updated = 0;
      for (const rewrite of rewrites) {
        updated += affectedRows(await db.execute(sql`
          UPDATE agent_runs SET container_id = ${rewrite.newId}
          WHERE container_id = ${rewrite.oldId}
        `));
      }
      return updated;
    },
    async repointPiAgentSessions(rewrites) {
      let updated = 0;
      for (const rewrite of rewrites) {
        updated += affectedRows(await db.execute(sql`
          UPDATE pi_agent_sessions SET container_id = ${rewrite.newId}
          WHERE container_id = ${rewrite.oldId}
        `));
      }
      return updated;
    },
    async repointScopedTraceEvents(syncId, moves) {
      let updated = 0;
      const pattern = `%${syncId}%`;
      for (const move of moves) {
        updated += affectedRows(await db.execute(sql`
          UPDATE trace_events SET container_id = ${move.newContainerId}
          WHERE container_id = ${move.oldContainerId}
            AND event_data::text LIKE ${pattern}
        `));
      }
      return updated;
    },
    async deleteEmptyContainers(oldIds) {
      let deleted = 0;
      const deepestFirst = [...oldIds].sort((a, b) => b.split(":").length - a.split(":").length);
      for (const oldId of deepestFirst) {
        deleted += affectedRows(await db.execute(sql`
          DELETE FROM containers AS source
          WHERE source.id = ${oldId}
            AND NOT EXISTS (SELECT 1 FROM containers child WHERE child.parent_container_id = source.id)
            AND NOT EXISTS (SELECT 1 FROM trace_events event WHERE event.container_id = source.id)
            AND NOT EXISTS (SELECT 1 FROM agent_runs run WHERE run.container_id = source.id)
            AND NOT EXISTS (SELECT 1 FROM pi_agent_sessions session WHERE session.container_id = source.id)
        `));
      }
      return deleted;
    },
  };
  return port;
}

export async function runSyncTraceHierarchyMigration(
  options: RunSyncTraceMigrationOptions,
): Promise<SyncTraceMigrationSummary> {
  const syncId = assertSyncId(options.syncId);
  if (!options.port && !options.db) throw new Error("Migration requires a database or database port");
  const port = options.port ?? createPostgresPort(options.db);
  const discovery = await port.findContainersReferencingSync(syncId);
  const refsByKey = new Map<string, MeleeCycleRef>();
  for (const row of discovery) {
    const ref = refForRow(row);
    if (ref) refsByKey.set(refKey(ref), ref);
  }
  const refs = [...refsByKey.values()];
  if (refs.length === 0) {
    throw new Error(`No kernel containers with gameId/sessionId metadata reference ${syncId}`);
  }
  const rootIds = refs.map(meleeRootContainerId);
  const containers = await port.findContainersUnderRoots(rootIds);
  const plan = planSyncTraceHierarchyMigration({
    syncId,
    refs,
    containers,
    claimIntakeItems: options.claimIntakeItems,
    now: options.now,
  });
  const summary: SyncTraceMigrationSummary = {
    syncId,
    dryRun: options.dryRun === true,
    claimedIntakeItems: options.claimIntakeItems === true,
    cycleCount: refs.length,
    parentContainersPlanned: plan.parents.length,
    containersPlanned: plan.rewrites.length,
    containersInserted: 0,
    childContainersRepointed: 0,
    traceEventsRepointed: 0,
    agentRunsRepointed: 0,
    piAgentSessionsRepointed: 0,
    containersDeleted: 0,
  };
  if (options.dryRun) return summary;

  return port.transaction(async (tx) => {
    summary.containersInserted += await tx.insertContainers(plan.parents);
    summary.containersInserted += await tx.insertContainers(plan.rewrites.map((rewrite) => rewrite.row));
    summary.childContainersRepointed += await tx.repointChildContainers(plan.rewrites);
    summary.traceEventsRepointed += await tx.repointTraceEvents(plan.rewrites);
    summary.agentRunsRepointed += await tx.repointAgentRuns(plan.rewrites);
    summary.piAgentSessionsRepointed += await tx.repointPiAgentSessions(plan.rewrites);
    summary.traceEventsRepointed += await tx.repointScopedTraceEvents(syncId, plan.scopedEventMoves);
    summary.containersDeleted += await tx.deleteEmptyContainers(plan.rewrites.map((rewrite) => rewrite.oldId));
    return summary;
  });
}

interface CliArgs {
  syncId: string;
  claimIntakeItems: boolean;
  dryRun: boolean;
}

function usage(): never {
  throw new Error(
    "Usage: bun migrate-sync-trace-hierarchy.ts --sync-id <sync-id> [--claim-intake-items] [--dry-run]",
  );
}

export function parseSyncTraceMigrationArgs(argv: string[]): CliArgs {
  let syncId: string | null = null;
  let claimIntakeItems = false;
  let dryRun = false;
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === "--sync-id") {
      const value = argv[++index];
      if (!value) usage();
      syncId = value;
    } else if (arg === "--claim-intake-items") {
      claimIntakeItems = true;
    } else if (arg === "--dry-run") {
      dryRun = true;
    } else {
      usage();
    }
  }
  if (!syncId) usage();
  return { syncId: assertSyncId(syncId), claimIntakeItems, dryRun };
}

async function main(): Promise<void> {
  const args = parseSyncTraceMigrationArgs(process.argv.slice(2));
  const runtime = await getDefaultMeleeKernelRuntime();
  if (!runtime) throw new Error("Melee kernel runtime is unavailable");
  try {
    const summary = await runSyncTraceHierarchyMigration({ db: runtime.db, ...args });
    console.log(JSON.stringify(summary, null, 2));
  } finally {
    await runtime.close();
  }
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
