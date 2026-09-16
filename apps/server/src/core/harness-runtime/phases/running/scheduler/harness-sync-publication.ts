import { getHarnessState, transitionHarnessState } from "@server/core/harness-state/state.js";
import type { StateStore } from "@server/core/orchestrator-state";

/** Publish verified Sync evidence and the run head together. Git validation precedes this transaction. */
export function publishHarnessEpochSync(store: StateStore, input: {
  gameId: string; runId: string; epochId: string; priorHead: string; head: string; upstream: string; savePointId: string;
}): void {
  store.db.transaction(() => {
    const current = getHarnessState(store.db, input.gameId);
    if (!current) throw new Error(`Harness missing for ${input.gameId}`);
    const syncId = `epoch-sync:${input.epochId}`;
    const recorded = store.db.query("SELECT payload_json FROM harness_timeline_entries WHERE game_id = ? AND event_id = ?")
      .get(input.gameId, syncId) as { payload_json: string } | null;
    if (recorded) {
      const prior = JSON.parse(recorded.payload_json);
      if (prior.runId !== input.runId || prior.epochId !== input.epochId || prior.source?.resulting_head !== input.head || prior.source?.accepted_upstream !== input.upstream || prior.evidence?.save_point_id !== input.savePointId) {
        throw new Error(`Conflicting Sync replay for ${syncId}`);
      }
      // A later epoch may already have advanced the harness and run. Replaying
      // this completed boundary must never move either head back.
      return;
    }
    if (current.history.run_id !== input.runId || current.source.head !== input.priorHead) throw new Error(`Sync publication ownership or head changed for ${syncId}`);
    const run = store.db.query("SELECT game_id, head_revision, revision FROM runs WHERE id = ?").get(input.runId) as { game_id: string; head_revision: string | null; revision: number } | null;
    if (!run || run.game_id !== input.gameId || run.head_revision !== input.priorHead) throw new Error(`Run head disagrees with Sync base for ${syncId}`);
    const savePoint = store.db.query("SELECT run_id, commit_sha, report_path, payload_json FROM save_points WHERE id = ?").get(input.savePointId) as { run_id: string; commit_sha: string; report_path: string | null; payload_json: string } | null;
    if (!savePoint || savePoint.run_id !== input.runId || savePoint.commit_sha !== input.head || !savePoint.report_path) throw new Error(`Sync evidence missing or mismatched for ${syncId}`);
    const evidence = JSON.parse(savePoint.payload_json);
    transitionHarnessState(store.db, {
      gameId: input.gameId, expectedRevision: current.identity.revision, commandId: syncId,
      patch: {
        source: { head: input.head, upstream_revision: input.upstream },
        readiness: { build: "ready", evidence: "ready", sources: "ready" },
        execution: { workflow: "none", status: current.execution.desired === "paused" ? "paused" : "idle", blockers: [] },
        history: { sync_id: syncId, save_point_id: input.savePointId },
      },
      boundary: { eventId: syncId, kind: "sync_completed", outcome: input.head === input.priorHead ? "no_source_change" : "source_changed",
        runId: input.runId, epochId: input.epochId, syncId,
        evidence: { save_point_id: input.savePointId, report: savePoint.report_path, freshness: "valid", measures: evidence.measures ?? {},
          section_measures: evidence.section_measures ?? {}, source_manifests: evidence.source_manifests ?? [] } },
    });
    const changed = store.db.query("UPDATE runs SET head_revision = ?, revision = revision + 1 WHERE id = ? AND revision = ? AND head_revision = ?")
      .run(input.head, input.runId, run.revision, input.priorHead);
    if (changed.changes !== 1) throw new Error(`Run publication conflict for ${syncId}`);
  })();
}
