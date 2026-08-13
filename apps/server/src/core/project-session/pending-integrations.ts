import { randomUUID } from "node:crypto";
import {
  immediateTransaction,
  now as currentTime,
  type StateStore,
} from "@server/core/orchestrator-state";
import { quietGit } from "@server/core/session-runtime/phases/pr/pr-sync.js";
import { recordEpochCompletedInTransaction } from "./timeline.js";

export interface PendingIntegrationRecord {
  runId: string;
  epochId: string;
  branch: string;
  parentSha: string;
  messageMarker: string;
  createdAt: string;
  attempt: number;
  status: "prepared" | "failed";
  failureReason: string | null;
  failedAt: string | null;
}

export interface PreparePendingIntegrationInput {
  runId: string;
  epochId: string;
  branch: string;
  parentSha: string;
  createdAt?: string;
}

export interface ReconciledPendingIntegration {
  runId: string;
  epochId: string;
  commitSha: string;
}

export interface PendingIntegrationReconciliationResult {
  completed: ReconciledPendingIntegration[];
}

export type PendingIntegrationRetryState =
  | { status: "none" }
  | { status: "failed"; pending: PendingIntegrationRecord }
  | { status: "completed"; completed: ReconciledPendingIntegration };

function requiredIdentity(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${label} is required`);
  if (/\r|\n/.test(normalized)) throw new Error(`${label} must be one line`);
  return normalized;
}

function rowToPendingIntegration(row: Record<string, unknown>): PendingIntegrationRecord {
  return {
    runId: String(row.run_id),
    epochId: String(row.epoch_id),
    branch: String(row.branch),
    parentSha: String(row.parent_sha),
    messageMarker: String(row.message_marker),
    createdAt: String(row.created_at),
    attempt: Number(row.attempt ?? 1),
    status: String(row.status ?? "prepared") === "failed" ? "failed" : "prepared",
    failureReason: row.failure_reason == null ? null : String(row.failure_reason),
    failedAt: row.failed_at == null ? null : String(row.failed_at),
  };
}

/** Stable trailer used to identify an epoch integration commit after a crash. */
export function epochIntegrationMarker(epochId: string): string {
  return `Epoch-Integration: ${requiredIdentity(epochId, "epochId")}`;
}

/** Adds the stable epoch trailer without changing the human-readable subject. */
export function epochIntegrationCommitMessage(subject: string, epochId: string): string {
  const normalizedSubject = subject.trim();
  if (!normalizedSubject) throw new Error("integration commit subject is required");
  return `${normalizedSubject}\n\n${epochIntegrationMarker(epochId)}`;
}

/**
 * Durably records the pre-commit identity in a transaction that completes
 * before the target repository's integration commit is attempted.
 */
export function preparePendingIntegration(
  store: StateStore,
  input: PreparePendingIntegrationInput,
): PendingIntegrationRecord {
  const proposed = {
    runId: requiredIdentity(input.runId, "runId"),
    epochId: requiredIdentity(input.epochId, "epochId"),
    branch: requiredIdentity(input.branch, "branch"),
    parentSha: requiredIdentity(input.parentSha, "parentSha"),
    messageMarker: epochIntegrationMarker(input.epochId),
    createdAt: input.createdAt ?? currentTime(),
  };
  return immediateTransaction(store.db, () => {
    const existingRow = store.db
      .query("SELECT * FROM pending_integrations WHERE epoch_id = ?")
      .get(proposed.epochId) as Record<string, unknown> | undefined;
    if (existingRow) {
      const existing = rowToPendingIntegration(existingRow);
      if (existing.runId !== proposed.runId) {
        throw new Error(
          `Pending integration epoch ${proposed.epochId} belongs to run ${existing.runId}, not ${proposed.runId}`,
        );
      }
      if (existing.status === "prepared") {
        if (
          existing.branch !== proposed.branch ||
          existing.parentSha !== proposed.parentSha ||
          existing.messageMarker !== proposed.messageMarker
        ) {
          throw new Error(
            `Pending integration ${proposed.epochId} attempt ${existing.attempt} is already prepared with different git identity`,
          );
        }
        return existing;
      }
      const result = store.db
        .query(
          `UPDATE pending_integrations
           SET branch = ?, parent_sha = ?, message_marker = ?, created_at = ?,
               attempt = attempt + 1, status = 'prepared', failure_reason = NULL, failed_at = NULL
           WHERE epoch_id = ? AND run_id = ? AND attempt = ? AND status = 'failed'`,
        )
        .run(
          proposed.branch,
          proposed.parentSha,
          proposed.messageMarker,
          proposed.createdAt,
          proposed.epochId,
          proposed.runId,
          existing.attempt,
        );
      if (result.changes !== 1) {
        throw new Error(`Pending integration ${proposed.epochId} changed while preparing its retry`);
      }
    } else {
      store.db
        .query(
          `INSERT INTO pending_integrations (
             epoch_id, run_id, branch, parent_sha, message_marker, created_at,
             attempt, status, failure_reason, failed_at
           ) VALUES (?, ?, ?, ?, ?, ?, 1, 'prepared', NULL, NULL)`,
        )
        .run(
          proposed.epochId,
          proposed.runId,
          proposed.branch,
          proposed.parentSha,
          proposed.messageMarker,
          proposed.createdAt,
        );
    }
    const row = store.db
      .query("SELECT * FROM pending_integrations WHERE epoch_id = ?")
      .get(proposed.epochId) as Record<string, unknown>;
    return rowToPendingIntegration(row);
  });
}

/** Atomically retains a failed attempt and closes its matching epoch boundary. */
export function recordPendingIntegrationFailure(
  store: StateStore,
  input: { runId: string; epochId: string; attempt: number; reason: string; occurredAt?: string },
): PendingIntegrationRecord {
  const runId = requiredIdentity(input.runId, "runId");
  const epochId = requiredIdentity(input.epochId, "epochId");
  const reason = requiredIdentity(input.reason, "failure reason");
  const occurredAt = input.occurredAt ?? currentTime();
  return immediateTransaction(store.db, () => {
    const pendingRow = store.db
      .query("SELECT * FROM pending_integrations WHERE run_id = ? AND epoch_id = ?")
      .get(runId, epochId) as Record<string, unknown> | undefined;
    if (!pendingRow) throw new Error(`Pending integration not found for run ${runId}, epoch ${epochId}`);
    const pending = rowToPendingIntegration(pendingRow);
    if (pending.status === "failed") {
      if (pending.attempt !== input.attempt) {
        throw new Error(`Pending integration ${epochId} is already failed at attempt ${pending.attempt}`);
      }
      return pending;
    }
    if (pending.attempt !== input.attempt) {
      throw new Error(
        `Pending integration ${epochId} attempt mismatch: expected ${input.attempt}, found ${pending.attempt}`,
      );
    }
    const epoch = store.db
      .query("SELECT run_id FROM epochs WHERE id = ?")
      .get(epochId) as { run_id: string } | undefined;
    if (epoch && epoch.run_id !== runId) {
      throw new Error(`Epoch ${epochId} belongs to run ${epoch.run_id}, not ${runId}`);
    }
    if (epoch) {
      const epochResult = store.db
        .query(
          `UPDATE epochs
           SET status = 'error', boundary_status = 'integration_commit_failed',
               routing_summary_json = ?, closed_at = COALESCE(closed_at, ?)
           WHERE id = ? AND run_id = ?`,
        )
        .run(JSON.stringify({ integration_failure: reason, attempt: input.attempt }), occurredAt, epochId, runId);
      if (epochResult.changes !== 1) throw new Error(`Failed to close epoch ${epochId} for run ${runId}`);
    }
    const result = store.db
      .query(
        `UPDATE pending_integrations
         SET status = 'failed', failure_reason = ?, failed_at = ?
         WHERE run_id = ? AND epoch_id = ? AND attempt = ? AND status = 'prepared'`,
      )
      .run(reason, occurredAt, runId, epochId, input.attempt);
    if (result.changes !== 1) throw new Error(`Pending integration ${epochId} changed while recording failure`);
    const updated = store.db
      .query("SELECT * FROM pending_integrations WHERE run_id = ? AND epoch_id = ?")
      .get(runId, epochId) as Record<string, unknown>;
    return rowToPendingIntegration(updated);
  });
}

export function listPendingIntegrations(
  store: StateStore,
  selector: { runId?: string } = {},
): PendingIntegrationRecord[] {
  const rows = (selector.runId
    ? store.db
        .query("SELECT * FROM pending_integrations WHERE run_id = ? ORDER BY created_at, epoch_id")
        .all(requiredIdentity(selector.runId, "runId"))
    : store.db.query("SELECT * FROM pending_integrations ORDER BY created_at, epoch_id").all()) as Array<
    Record<string, unknown>
  >;
  return rows.map(rowToPendingIntegration);
}

function findIntegrationCommit(repoRoot: string, pending: PendingIntegrationRecord): string | null {
  if (!/^[0-9a-fA-F]{40,64}$/.test(pending.parentSha)) return null;
  const marker = epochIntegrationMarker(pending.epochId);
  if (pending.messageMarker !== marker) {
    throw new Error(
      `Pending integration ${pending.epochId} has invalid message marker ${JSON.stringify(pending.messageMarker)}`,
    );
  }
  const branchCheck = quietGit(repoRoot, ["check-ref-format", "--branch", pending.branch]);
  if (branchCheck.exitCode !== 0) return null;
  const parent = quietGit(repoRoot, ["rev-parse", "--verify", `${pending.parentSha}^{commit}`]);
  if (parent.exitCode !== 0) return null;
  const tip = quietGit(repoRoot, ["rev-parse", "--verify", `${pending.branch}^{commit}`]);
  if (tip.exitCode !== 0) return null;
  const branchTip = tip.stdout.trim();
  const revisions = quietGit(repoRoot, ["rev-list", `${pending.parentSha}..${branchTip}`]);
  if (revisions.exitCode !== 0) return null;
  for (const commitSha of revisions.stdout.split(/\r?\n/).map((value) => value.trim()).filter(Boolean)) {
    const message = quietGit(repoRoot, ["show", "-s", "--format=%B", commitSha]);
    if (message.exitCode !== 0) continue;
    // The marker proves that this epoch's integration landed. Later commits
    // (for example confirmation reverts) also belong to the boundary, so the
    // reconciled lineage advances to the current branch tip.
    if (message.stdout.split(/\r?\n/).some((line) => line.trimEnd() === marker)) return branchTip;
  }
  return null;
}

function failMissingIntegration(store: StateStore, pending: PendingIntegrationRecord, occurredAt: string): never {
  const message =
    `Pending integration commit not found for run ${pending.runId}, epoch ${pending.epochId}: ` +
    `expected marker ${JSON.stringify(pending.messageMarker)} on ${pending.parentSha}..${pending.branch}`;
  recordPendingIntegrationFailure(store, {
    runId: pending.runId,
    epochId: pending.epochId,
    attempt: pending.attempt,
    reason: message,
    occurredAt,
  });
  console.error(`[pending-integration] ${message}`);
  throw new Error(message);
}

function reconcilePreparedIntegration(
  store: StateStore,
  pending: PendingIntegrationRecord,
  occurredAt: string,
  failWhenMissing = true,
): ReconciledPendingIntegration | null {
  const run = store.db
    .query("SELECT project_id, project_repo_root FROM runs WHERE id = ?")
    .get(pending.runId) as { project_id: string | null; project_repo_root: string | null } | null;
  const repoRoot = run?.project_repo_root?.trim();
  const commitSha = repoRoot ? findIntegrationCommit(repoRoot, pending) : null;
  if (!commitSha) {
    if (failWhenMissing) failMissingIntegration(store, pending, occurredAt);
    return null;
  }

  immediateTransaction(store.db, () => {
    store.db
      .query(
        `UPDATE epochs
         SET status = 'completed',
             finished_count = (
               SELECT COUNT(*) FROM epoch_targets
               WHERE epoch_targets.epoch_id = epochs.id
                 AND epoch_targets.status = 'finished'
             ),
             boundary_status = 'success',
             closed_at = COALESCE(closed_at, ?)
         WHERE id = ? AND run_id = ?`,
      )
      .run(occurredAt, pending.epochId, pending.runId);
    recordEpochCompletedInTransaction(store.db, {
      projectId: run?.project_id ?? undefined,
      epochId: pending.epochId,
      runId: pending.runId,
      integrationCommit: commitSha,
      commandId: `command-reconcile-epoch-integration-${randomUUID()}`,
      correlationId: pending.runId,
      spanId: `span-reconcile-epoch-integration-${randomUUID()}`,
      actor: "runner",
      occurredAt,
    });
  });
  return { runId: pending.runId, epochId: pending.epochId, commitSha };
}

/** Reconciles one retained attempt before a scheduler/manual boundary retry. */
export function reconcilePendingIntegrationAttempt(
  store: StateStore,
  input: { runId: string; epochId: string; now?: string },
): PendingIntegrationRetryState {
  const runId = requiredIdentity(input.runId, "runId");
  const epochId = requiredIdentity(input.epochId, "epochId");
  const row = store.db
    .query("SELECT * FROM pending_integrations WHERE run_id = ? AND epoch_id = ?")
    .get(runId, epochId) as Record<string, unknown> | undefined;
  if (!row) return { status: "none" };
  const pending = rowToPendingIntegration(row);
  if (pending.status === "failed") {
    const completed = reconcilePreparedIntegration(store, pending, input.now ?? currentTime(), false);
    return completed ? { status: "completed", completed } : { status: "failed", pending };
  }
  const completed = reconcilePreparedIntegration(store, pending, input.now ?? currentTime());
  if (!completed) throw new Error(`Prepared integration ${epochId} was not reconciled`);
  return {
    status: "completed",
    completed,
  };
}

/**
 * Reconciles prepared integration commits. Found commits use the same
 * epoch-completion transaction as the live path; missing prepared commits
 * atomically become retained failure evidence with a failed epoch boundary.
 */
export function reconcilePendingIntegrations(
  store: StateStore,
  options: { runId?: string; now?: string } = {},
): PendingIntegrationReconciliationResult {
  const completed: ReconciledPendingIntegration[] = [];
  for (const pending of listPendingIntegrations(store, { runId: options.runId })) {
    const reconciled = reconcilePreparedIntegration(
      store,
      pending,
      options.now ?? currentTime(),
      pending.status === "prepared",
    );
    if (reconciled) completed.push(reconciled);
  }
  return { completed };
}
