import type { Database } from "bun:sqlite";
import { getHarnessState } from "@server/core/harness-state/state.js";
import {
  resolveGameEventTraceLinkage,
  type GameEventTraceLinkage,
} from "@server/core/harness-state/kernel-links.js";
import { openState } from "@server/core/orchestrator-state";
import { uiLog } from "@server/infrastructure/logging/ui-log";
import type { SyncState, SyncWorkflowEventType } from "./types.js";

/** Trace status vocabulary shared with the kernel bridge, restated locally so
 * the sync phase does not import infrastructure. */
export type SyncTraceStatus = "started" | "completed" | "failed" | "skipped";

/**
 * The slice of the dashboard kernel workflow-event input sync needs. Declared
 * here (rather than imported from infrastructure) for the same reason the
 * preparing phase declares its own: core phases stay independent of the kernel
 * bridge, and the server wires the real implementation in.
 */
export interface SyncWorkflowEventInput {
  kind: "sync-intake";
  operation: string;
  status?: SyncTraceStatus;
  sessionId?: string | null;
  detail?: string | null;
  metadata?: Record<string, unknown>;
  correlationId?: string;
  gameEventId?: string;
  causedByEventId?: string | null;
}

export type SubmitSyncWorkflowEvent<TPaths> = (
  paths: TPaths,
  input: SyncWorkflowEventInput,
) => Promise<Record<string, unknown> | null>;

/**
 * The sync milestones an operator watches. Each one names the durable game
 * event it is derived from: the trace is a projection of the event log, never
 * an independent story, so a milestone with no persisted event is not emitted.
 */
export type SyncMilestone =
  | "activation"
  | "discord_refresh"
  | "ingest"
  | "reconciling"
  | "validated"
  | "publishing"
  | "published"
  | "blocked"
  | "cancelled"
  | "recovered";

interface SyncMilestoneDescriptor {
  /** Durable sync events that can back this milestone, newest wins. */
  eventTypes: readonly SyncWorkflowEventType[];
  operation: string;
  status: SyncTraceStatus;
}

const MILESTONES: Record<SyncMilestone, SyncMilestoneDescriptor> = {
  activation: { eventTypes: ["sync.ingesting"], operation: "sync.start", status: "started" },
  discord_refresh: {
    eventTypes: ["sync.discord_refresh_completed"],
    operation: "sync.discord_refresh",
    status: "completed",
  },
  ingest: { eventTypes: ["sync.ingesting"], operation: "sync.ingest", status: "started" },
  reconciling: { eventTypes: ["sync.reconciling"], operation: "sync.reconcile", status: "started" },
  validated: { eventTypes: ["sync.validated"], operation: "sync.validate", status: "completed" },
  publishing: { eventTypes: ["sync.publishing"], operation: "sync.publish", status: "started" },
  published: { eventTypes: ["sync.published"], operation: "sync.publish", status: "completed" },
  blocked: {
    eventTypes: ["sync.blocked", "sync.reconciliation_blocked"],
    operation: "sync.blocked",
    status: "failed",
  },
  cancelled: { eventTypes: ["sync.cancelled"], operation: "sync.cancel", status: "skipped" },
  recovered: { eventTypes: ["sync.recovered"], operation: "sync.recover", status: "started" },
};

/** Newest durable event of the given types for one sync, or null. */
function latestSyncEventId(
  db: Database,
  gameId: string,
  syncId: string,
  eventTypes: readonly SyncWorkflowEventType[],
): string | null {
  const placeholders = eventTypes.map(() => "?").join(", ");
  const row = db
    .query(
      `SELECT event_id
       FROM game_events
       WHERE game_id = ?
         AND subject_kind = 'sync_workflow'
         AND subject_id = ?
         AND event_type IN (${placeholders})
       ORDER BY sequence DESC
       LIMIT 1`,
    )
    .get(gameId, syncId, ...eventTypes) as { event_id: string } | null;
  return row?.event_id ?? null;
}

export interface SyncTraceEmitterDeps<TPaths> {
  submitWorkflowEvent?: SubmitSyncWorkflowEvent<TPaths>;
}

export interface SyncMilestoneOptions {
  detail?: string | null;
  metadata?: Record<string, unknown>;
}

export type EmitSyncMilestone<TPaths> = (
  paths: TPaths,
  sync: SyncState,
  milestone: SyncMilestone,
  options?: SyncMilestoneOptions,
) => Promise<void>;

/** File Sync milestones under the durable game harness identity, linked to stored events. */
export function createSyncTraceEmitter<TPaths extends { stateDir: string }>(
  deps: SyncTraceEmitterDeps<TPaths>,
): EmitSyncMilestone<TPaths> {
  let missingHarnessLogged = false;

  return async function emitSyncMilestone(paths, sync, milestone, options = {}) {
    const submit = deps.submitWorkflowEvent;
    if (!submit) return;
    const descriptor = MILESTONES[milestone];
    const status = milestone === "discord_refresh" && options.metadata?.ok === false
      ? "failed"
      : descriptor.status;
    try {
      let harnessId = "";
      let linkage: GameEventTraceLinkage | null = null;
      const store = openState(paths.stateDir);
      try {
        const harness = getHarnessState(store.db, sync.game_id);
        if (!harness) {
          if (!missingHarnessLogged) {
            missingHarnessLogged = true;
            uiLog("stderr", `sync trace emission skipped: harness ${sync.game_id} is not initialized`);
          }
          return;
        }
        harnessId = harness.identity.harness_id;
        const gameEventId = latestSyncEventId(
          store.db,
          sync.game_id,
          sync.sync_id,
          descriptor.eventTypes,
        );
        if (!gameEventId) return;
        linkage = resolveGameEventTraceLinkage(store.db, sync.game_id, gameEventId);
      } finally {
        store.db.close();
      }
      await submit(paths, {
        kind: "sync-intake",
        operation: descriptor.operation,
        status,
        sessionId: harnessId,
        detail: options.detail ?? null,
        metadata: {
          ...(options.metadata ?? {}),
          milestone,
          syncId: sync.sync_id,
          syncStatus: sync.status,
          syncRevision: sync.revision,
          harnessId,
        },
        ...linkage,
      });
    } catch (cause) {
      uiLog(
        "stderr",
        `sync trace emission failed (${descriptor.operation}/${status}) for ${sync.sync_id}: ${
          cause instanceof Error ? cause.message : String(cause)
        }`,
      );
    }
  };
}
