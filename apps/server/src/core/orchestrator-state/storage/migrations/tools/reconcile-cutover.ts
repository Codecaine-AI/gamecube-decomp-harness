import type { Database } from "bun:sqlite";
import { readFileSync, realpathSync } from "node:fs";
import { resolve } from "node:path";
import { appendGameEvent, newSpanId, type JsonObject } from "@server/core/harness-state/events.js";

export interface CutoverReconciliation {
  gameId: string; cycleUuid: string; originalWorktree: string; worktree: string; repository: string;
  storedHead: string; observedHead: string; syncId: string; leaseId: string; reason: string;
}
export function readReconciliation(file?: string): CutoverReconciliation | undefined {
  if (!file) return undefined;
  const value = JSON.parse(readFileSync(file, "utf8"));
  for (const key of ["gameId", "cycleUuid", "originalWorktree", "worktree", "repository", "storedHead", "observedHead", "syncId", "leaseId", "reason"]) {
    if (typeof value[key] !== "string" || !value[key].trim()) throw new Error(`Reconciliation requires ${key}`);
  }
  return value;
}
function git(cwd: string, args: string[]): string {
  const result = Bun.spawnSync(["git", "-C", cwd, ...args], { stdout: "pipe", stderr: "pipe" });
  if (result.exitCode) throw new Error(`Reconciliation Git check failed: ${result.stderr.toString().trim()}`);
  return result.stdout.toString().trim();
}
export function verifyReconciliation(db: Database, plan: CutoverReconciliation, owner: Record<string, unknown>, expectedPath: string, worktree: string, gameId: string) {
  if (plan.gameId !== gameId || plan.cycleUuid !== owner.cycle_uuid || plan.storedHead !== owner.head_revision || resolve(plan.originalWorktree) !== resolve(expectedPath) || realpathSync(plan.worktree) !== realpathSync(worktree)) throw new Error("Reconciliation does not match stored ownership and requested checkout");
  if (realpathSync(git(worktree, ["rev-parse", "--show-toplevel"])) !== realpathSync(worktree)) throw new Error("Reconciled checkout must be a Git root");
  const common = (cwd: string) => realpathSync(resolve(cwd, git(cwd, ["rev-parse", "--git-common-dir"])));
  if (common(worktree) !== common(plan.repository)) throw new Error("Reconciled checkout and repository have different Git ownership");
  if (git(worktree, ["status", "--porcelain", "--untracked-files=all"])) throw new Error("Reconciled checkout must be clean");
  if (git(worktree, ["rev-parse", "HEAD"]) !== plan.observedHead) throw new Error("Reconciled checkout HEAD changed");
  git(worktree, ["merge-base", "--is-ancestor", plan.storedHead, plan.observedHead]);
  const sync = db.query("SELECT * FROM sync_state WHERE sync_id = ? AND game_id = ?").get(plan.syncId, gameId) as Record<string, unknown> | null;
  const lease = db.query("SELECT * FROM dispatch_state WHERE game_id = ?").get(gameId) as Record<string, unknown> | null;
  const active = lease?.active_workflow_json ? JSON.parse(String(lease.active_workflow_json)) : null;
  if (!sync || sync.status !== "blocked" || sync.staging_json != null || sync.publication_json != null || active?.lease_id !== plan.leaseId || active?.workflow_id !== plan.syncId || active?.kind !== "sync") throw new Error("Reconciliation requires the exact blocked, unstaged, unpublished Sync and its lease");
  if (JSON.parse(String(lease?.queued_requests_json ?? "[]")).length) throw new Error("Reconcile queued dispatch requests before cutover");
  if (db.query("SELECT 1 FROM sync_push_records WHERE sync_id = ? LIMIT 1").get(plan.syncId)) throw new Error("Reconciliation cannot cancel a Sync with push records");
  return { sync, lease: lease!, active };
}
/** Runs inside the cutover transaction, after the untouched SQLite backup exists. */
export function applyReconciliation(db: Database, plan: CutoverReconciliation, commandId: string, originals: ReturnType<typeof verifyReconciliation>) {
  const now = new Date().toISOString();
  const context = { gameId: plan.gameId, correlationId: commandId, causationId: String(originals.sync.caused_by_event_id), traceId: String(originals.sync.trace_id), spanId: newSpanId(), parentSpanId: null, actor: "operator" as const, occurredAt: now };
  db.exec("CREATE TABLE IF NOT EXISTS historical_cutover_reconciliations(command_id TEXT PRIMARY KEY, created_at TEXT NOT NULL, evidence_json TEXT NOT NULL)");
  db.query("INSERT INTO historical_cutover_reconciliations VALUES(?,?,?)").run(commandId, now, JSON.stringify({ plan, originals }));
  const cancelled = appendGameEvent(db, { ...context, eventType: "sync.cancelled", subjectKind: "sync_workflow", subjectId: plan.syncId, payload: { from_status: "blocked", to_status: "cancelled", discarded_staging_workspace_id: null, untouched_harness_head: plan.observedHead, untouched_submodule_heads: [] } });
  db.query("UPDATE sync_state SET status='cancelled',revision=revision+1,updated_at=?,latest_event_sequence=?,caused_by_event_id=? WHERE sync_id=?").run(now, cancelled.sequence, cancelled.eventId, plan.syncId);
  const released = appendGameEvent(db, { ...context, spanId: newSpanId(), causationId: cancelled.eventId, eventType: "game.dispatch_released", subjectKind: "game", subjectId: plan.gameId, payload: { old_lease_holder: originals.active as JsonObject, handoff_snapshot_id: null, handoff_snapshot_content_hash: null, terminal_revision: Number(originals.lease.revision) + 1, recovery: true, recovery_reason: `One-time harness cutover: ${plan.reason}`, cancelled_subject_ids: [plan.syncId] } });
  db.query("UPDATE dispatch_state SET active_workflow_json=NULL,revision=revision+1,updated_at=?,caused_by_event_id=? WHERE game_id=?").run(now, released.eventId, plan.gameId);
  return { cancelledEventId: cancelled.eventId, releasedEventId: released.eventId };
}
