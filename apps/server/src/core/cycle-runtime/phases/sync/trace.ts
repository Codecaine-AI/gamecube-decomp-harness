import type { Database } from "bun:sqlite";
import { getCycleByUuid } from "@server/core/cycle/store.js";
import {
  resolveGameEventTraceLinkage,
  type GameEventTraceLinkage,
} from "@server/core/harness-state/kernel-links.js";
import { openState } from "@server/core/orchestrator-state";
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
  appendLog?: (stream: "stdout" | "stderr" | "ui", text: string) => void;
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

/**
 * Files sync milestones into the cycle's `sync-intake` container.
 *
 * Sync used to run entirely dark in the kernel trace: it emitted a rich game
 * event log, but nothing carried a `game_event_id` into the kernel, so every
 * sync event rendered with no trace behind it. This emitter is the missing
 * producer for the `sync-intake` container kind.
 *
 * Emission is strictly observational and can never fail a sync step:
 *
 * - every emit is wrapped; a throw is logged and swallowed
 * - a disabled or unreachable kernel is a no-op (the injected submit returns
 *   null, and an absent submit skips entirely)
 * - a sync whose cycle cannot be resolved is skipped, and logged once, rather
 *   than filed under a session id no reader could open
 *
 * The session id is always the sync's own cycle uuid. The kernel runtime's
 * fallback would hand back a run id when it cannot see an active cycle, and
 * the cycle-linkage write then throws on an id that names no cycle.
 *
 * Known gap: the per-PR knowledge jobs inside the ingest milestone are not
 * traced individually. They do not flow through the job-queue consumer, so the
 * `onJobClaimed`/`onJobSettled` hooks the background knowledge lane uses cannot
 * reach them — `stageSyncKnowledge` claims, works, and settles each job in its
 * own transactions. Their `knowledge.job_*` game events are durable, so wiring
 * per-job containers later is additive.
 */
export function createSyncTraceEmitter<TPaths extends { stateDir: string }>(
  deps: SyncTraceEmitterDeps<TPaths>,
): EmitSyncMilestone<TPaths> {
  let missingCycleLogged = false;

  return async function emitSyncMilestone(paths, sync, milestone, options = {}) {
    const submit = deps.submitWorkflowEvent;
    if (!submit) return;
    const descriptor = MILESTONES[milestone];
    try {
      const cycleUuid = sync.cycle_uuid.trim();
      let linkage: GameEventTraceLinkage | null = null;
      const store = openState(paths.stateDir);
      try {
        // Containers hang off a cycle. Without one there is no session to file
        // them under, and inventing an id would mint a cycle no reader can
        // open. Skip, and say so once.
        const cycle = cycleUuid ? getCycleByUuid(store.db, cycleUuid) : null;
        if (!cycle || cycle.game_id !== sync.game_id) {
          if (!missingCycleLogged) {
            missingCycleLogged = true;
            deps.appendLog?.(
              "stderr",
              `sync trace emission skipped: sync ${sync.sync_id} has no resolvable cycle (${cycleUuid || "none"})`,
            );
          }
          return;
        }
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
        status: descriptor.status,
        sessionId: cycleUuid,
        detail: options.detail ?? null,
        metadata: {
          ...(options.metadata ?? {}),
          milestone,
          syncId: sync.sync_id,
          syncStatus: sync.status,
          syncRevision: sync.revision,
          cycleUuid,
        },
        ...linkage,
      });
    } catch (cause) {
      deps.appendLog?.(
        "stderr",
        `sync trace emission failed (${descriptor.operation}/${descriptor.status}) for ${sync.sync_id}: ${
          cause instanceof Error ? cause.message : String(cause)
        }`,
      );
    }
  };
}
