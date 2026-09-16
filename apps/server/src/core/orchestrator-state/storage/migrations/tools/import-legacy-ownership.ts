import type { Database } from "bun:sqlite";
import { immediateTransaction } from "../../transaction.js";
import { getHarnessState, initializeHarnessState, transitionHarnessState, type HarnessState, type InitializeHarnessStateInput } from "@server/core/harness-state/state.js";

/** Explicit ownership cutover. All legacy rows remain a recovery checkpoint. Never called by a read or schema migration. */
export function importLegacyHarness(db: Database, input: InitializeHarnessStateInput & { reconciledHead?: string }): HarnessState {
  return immediateTransaction(db, () => {
    const checkpoint = db.query("SELECT command_id, checkpoint_json FROM harness_legacy_imports WHERE game_id = ?").get(input.gameId) as { command_id: string; checkpoint_json: string } | null;
    if (checkpoint) {
      if (checkpoint.command_id !== input.commandId) throw new Error("Legacy harness was already imported by another command");
      const prior = JSON.parse(checkpoint.checkpoint_json).input;
      if (prior.worktree !== input.worktree || prior.configurationRevision !== input.configurationRevision || prior.harnessId !== input.harnessId) {
        throw new Error("Legacy import command was reused with different input");
      }
      return getHarnessState(db, input.gameId)!;
    }
    const cycles = db.query("SELECT * FROM cycles WHERE game_id = ? ORDER BY created_at, id").all(input.gameId) as Array<Record<string, unknown>>;
    const active = cycles.filter(cycle => ["active", "blocked", "closing"].includes(String(cycle.status)));
    if (active.length > 1) throw new Error("Multiple legacy owners require reconciliation before import");
    const owner = active[0] ?? cycles.at(-1);
    if (!owner) throw new Error(`No legacy history for ${input.gameId}`);
    if (input.harnessId && input.harnessId !== owner.cycle_uuid) throw new Error("Legacy import must preserve the existing harness identity");
    const lease = db.query("SELECT active_workflow_json FROM dispatch_state WHERE game_id = ?").get(input.gameId) as { active_workflow_json: string | null } | null;
    if (lease?.active_workflow_json) throw new Error("Settle the dispatch lease before importing legacy ownership");
    const upstreamAnchors = db.query("SELECT * FROM game_upstream_anchors WHERE game_id = ?").all(input.gameId) as Array<Record<string, unknown>>;
    const upstreamAnchor = upstreamAnchors.find(anchor => anchor.cycle_uuid === owner.cycle_uuid);
    const latestEpoch = owner.active_run_id ? db.query("SELECT id FROM epochs WHERE run_id = ? ORDER BY ordinal DESC, id DESC LIMIT 1").get(String(owner.active_run_id)) as { id: string } | null : null;
    const now = input.now ?? new Date().toISOString();
    const state = initializeHarnessState(db, { ...input, harnessId: String(owner.cycle_uuid) });
    const timeline = db.query("SELECT t.* FROM cycle_timeline_entries t JOIN cycles c ON c.cycle_uuid = t.cycle_uuid WHERE c.game_id = ? ORDER BY t.id").all(input.gameId) as Array<{ id: number; cycle_uuid: string; entry_kind: string; entry_id: string; occurred_at: string; payload_json: string; caused_by_event_id: string | null }>;
    let cursor = 0;
    let savePointId: string | null = null;
    for (const entry of timeline) {
      const eventId = `legacy-timeline:${entry.cycle_uuid}:${entry.id}`;
      const result = db.query("INSERT INTO harness_timeline_entries(game_id,harness_id,event_id,command_id,kind,occurred_at,payload_json,legacy_cycle_uuid,legacy_entry_id) VALUES (?,?,?,?,?,?,?,?,?)")
        .run(input.gameId, state.identity.harness_id, eventId, input.commandId, "legacy", entry.occurred_at, JSON.stringify({ eventId, kind: "legacy", outcome: entry.entry_kind, evidence: { ...JSON.parse(entry.payload_json), legacy_entry_id: entry.entry_id, legacy_cycle_uuid: entry.cycle_uuid, caused_by_event_id: entry.caused_by_event_id } }), entry.cycle_uuid, entry.id);
      cursor = Number(result.lastInsertRowid);
      if (entry.cycle_uuid === owner.cycle_uuid && entry.entry_kind === "save_point") savePointId = entry.entry_id;
    }
    // Readiness is deliberately pending: importing history is not proof of a valid current build or sandbox.
    const imported = transitionHarnessState(db, {
      gameId: input.gameId, commandId: `${input.commandId}:ownership`, expectedRevision: 0, now,
      patch: {
        source: { head: input.reconciledHead ?? owner.head_revision as string | null, upstream_revision: (upstreamAnchor?.upstream_revision ?? owner.base_sha) as string | null },
        execution: { desired: "paused", workflow: "none", status: "paused", blockers: JSON.parse(String(owner.blockers_json ?? "[]")) },
        history: { run_id: owner.active_run_id as string | null, epoch_id: latestEpoch?.id ?? null, sync_id: upstreamAnchor?.sync_id as string | undefined ?? null, save_point_id: savePointId },
      },
    });
    imported.history.timeline_cursor = cursor;
    db.query("UPDATE harness_state SET state_json = ? WHERE game_id = ?").run(JSON.stringify(imported), input.gameId);
    db.query("INSERT INTO harness_legacy_imports VALUES (?, ?, ?, ?)").run(input.gameId, input.commandId, now, JSON.stringify({ input, cycles, timeline, lease, upstreamAnchors }));
    return imported;
  });
}
