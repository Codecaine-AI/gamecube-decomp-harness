import { immediateTransaction, type StateStore } from "@server/core/orchestrator-state";
import { addEvent } from "@server/core/cycle-runtime/run-state/events.js";

export type ValidationState = "tentative" | "confirmed" | "regressed";

export interface ConfirmationCandidate {
  integrationId: string;
  checkpointId: string | null;
  targetClaimId: string;
  patchPath: string | null;
  writeSet: string[];
  metadata: Record<string, unknown>;
  createdAt: string;
  widened: boolean;
}

export interface ConfirmationGlobalVerdict {
  clean: boolean;
  buildId: string;
  reportPath: string;
  regressionPaths: string[];
}

export interface ConfirmationPassDeps {
  /** Run the same global comparison with the named candidates removed. */
  probeWithout: (candidates: ConfirmationCandidate[]) => Promise<boolean>;
  /** Revert the blamed patch on the live cycle integration branch. */
  revertLive: (candidate: ConfirmationCandidate) => Promise<{ ok: boolean; revision?: string | null; error?: string }>;
  now?: () => string;
}

export interface ConfirmationPassResult {
  status: "disabled" | "no_tentatives" | "confirmed" | "regressed" | "unattributed";
  confirmedIds: string[];
  regressedId: string | null;
  remainingTentativeIds: string[];
  requiresBoundaryRecheck: boolean;
  probes: string[][];
  reasons: string[];
}

export function isCleanGlobalRegression(report: {
  regressions: readonly unknown[];
  brokenMatches: readonly unknown[];
  fuzzyRegressions: readonly unknown[];
}): boolean {
  return report.regressions.length === 0 && report.brokenMatches.length === 0 && report.fuzzyRegressions.length === 0;
}

function stringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => String(item)).filter(Boolean);
  if (typeof value !== "string" || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.map((item) => String(item)).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function jsonObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value !== "string" || !value.trim()) return {};
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function metadataMarksWidened(metadata: Record<string, unknown>): boolean {
  if (stringArray(metadata.widening_ids).length > 0) return true;
  const entries = Array.isArray(metadata.write_set_entries) ? metadata.write_set_entries : [];
  return entries.some((entry) => {
    const row = jsonObject(entry);
    return typeof row.category === "string" && row.category !== "target-source";
  });
}

function loadTentativeWindow(store: StateStore, runId: string): ConfirmationCandidate[] {
  const rows = store.db
    .query(
      `
        SELECT id, worker_checkpoint_id, target_claim_id, patch_path,
               write_set_json, metadata_json, created_at
        FROM integration_outcomes
        WHERE run_id = ?
          AND status IN ('applied', 'resolved')
          AND COALESCE(json_extract(metadata_json, '$.confirmation.validation_state'), 'tentative') = 'tentative'
        ORDER BY created_at ASC, id ASC
      `,
    )
    .all(runId) as Record<string, unknown>[];

  return rows.map((row) => {
    const metadata = jsonObject(row.metadata_json);
    const targetClaimId = String(row.target_claim_id);
    const widening = store.db
      .query(
        `
          SELECT 1
          FROM write_set_widenings
          WHERE target_claim_id = ?
            AND status IN ('approved', 'validated', 'validation_failed', 'reverted')
          LIMIT 1
        `,
      )
      .get(targetClaimId);
    return {
      integrationId: String(row.id),
      checkpointId: row.worker_checkpoint_id == null ? null : String(row.worker_checkpoint_id),
      targetClaimId,
      patchPath: row.patch_path == null ? null : String(row.patch_path),
      writeSet: stringArray(row.write_set_json),
      metadata,
      createdAt: String(row.created_at),
      widened: Boolean(widening) || metadataMarksWidened(metadata),
    };
  });
}

export function rankConfirmationCandidates(candidates: ConfirmationCandidate[], regressionPaths: string[]): ConfirmationCandidate[] {
  const regressed = new Set(regressionPaths);
  return [...candidates].sort((left, right) => {
    const leftOverlap = left.writeSet.reduce((count, path) => count + Number(regressed.has(path)), 0);
    const rightOverlap = right.writeSet.reduce((count, path) => count + Number(regressed.has(path)), 0);
    if (leftOverlap !== rightOverlap) return rightOverlap - leftOverlap;
    return right.createdAt.localeCompare(left.createdAt) || left.integrationId.localeCompare(right.integrationId);
  });
}

/**
 * One-guilty-item revert bisect. Consumer/file-overlap hints only influence
 * order; the supplied global probe is always the decider. The final singleton
 * is independently verified so unrelated regressions fail closed.
 */
export async function attributeRegressionByRevertBisect(
  candidates: ConfirmationCandidate[],
  probeWithout: ConfirmationPassDeps["probeWithout"],
): Promise<{ guilty: ConfirmationCandidate | null; probes: string[][] }> {
  const probes: string[][] = [];
  let remaining = [...candidates];
  while (remaining.length > 1) {
    const midpoint = Math.ceil(remaining.length / 2);
    const half = remaining.slice(0, midpoint);
    probes.push(half.map((candidate) => candidate.integrationId));
    if (await probeWithout(half)) {
      remaining = half;
    } else {
      remaining = remaining.slice(midpoint);
    }
  }
  const candidate = remaining[0];
  if (!candidate) return { guilty: null, probes };
  probes.push([candidate.integrationId]);
  return (await probeWithout([candidate])) ? { guilty: candidate, probes } : { guilty: null, probes };
}

function writeValidationState(params: {
  store: StateStore;
  candidates: ConfirmationCandidate[];
  state: ValidationState;
  status?: string;
  disposition: string;
  confirmation: Record<string, unknown>;
}): void {
  for (const candidate of params.candidates) {
    const metadata = {
      ...candidate.metadata,
      confirmation: {
        ...jsonObject(candidate.metadata.confirmation),
        ...params.confirmation,
        validation_state: params.state,
      },
    };
    params.store.db
      .query(
        `
          UPDATE integration_outcomes
          SET status = COALESCE(?, status),
              disposition = ?,
              metadata_json = ?,
              updated_at = ?
          WHERE id = ?
        `,
      )
      .run(params.status ?? null, params.disposition, JSON.stringify(metadata), String(params.confirmation.finished_at), candidate.integrationId);
    if (candidate.checkpointId) {
      const checkpoint = params.store.db
        .query("SELECT metadata_json FROM worker_checkpoints WHERE id = ?")
        .get(candidate.checkpointId) as Record<string, unknown> | undefined;
      const checkpointMetadata = jsonObject(checkpoint?.metadata_json);
      params.store.db
        .query("UPDATE worker_checkpoints SET validation_state = ?, metadata_json = ? WHERE id = ?")
        .run(
          params.state,
          JSON.stringify({
            ...checkpointMetadata,
            confirmation: {
              ...jsonObject(checkpointMetadata.confirmation),
              ...params.confirmation,
              validation_state: params.state,
            },
          }),
          candidate.checkpointId,
        );
    }
  }
}

export async function runConfirmationPass(params: {
  enabled: boolean;
  store: StateStore;
  runId: string;
  global: ConfirmationGlobalVerdict;
  deps: ConfirmationPassDeps;
}): Promise<ConfirmationPassResult> {
  const disabled: ConfirmationPassResult = {
    status: "disabled",
    confirmedIds: [],
    regressedId: null,
    remainingTentativeIds: [],
    requiresBoundaryRecheck: false,
    probes: [],
    reasons: [],
  };
  if (!params.enabled) return disabled;

  const tentative = loadTentativeWindow(params.store, params.runId);
  if (tentative.length === 0) return { ...disabled, status: "no_tentatives" };
  const finishedAt = (params.deps.now ?? (() => new Date().toISOString()))();
  const confirmation = {
    build_id: params.global.buildId,
    report_path: params.global.reportPath,
    finished_at: finishedAt,
  };

  if (params.global.clean) {
    immediateTransaction(params.store.db, () => {
      writeValidationState({
        store: params.store,
        candidates: tentative,
        state: "confirmed",
        disposition: "global_confirmation_passed",
        confirmation,
      });
    });
    addEvent(params.store, params.runId, "epoch_checkpoint_progress", "confirmation-pass", {
      phase: "confirmation_pass",
      status: "confirmed",
      build_id: params.global.buildId,
      report_path: params.global.reportPath,
      integration_ids: tentative.map((candidate) => candidate.integrationId),
    });
    return {
      status: "confirmed",
      confirmedIds: tentative.map((candidate) => candidate.integrationId),
      regressedId: null,
      remainingTentativeIds: [],
      requiresBoundaryRecheck: false,
      probes: [],
      reasons: [],
    };
  }

  const widened = rankConfirmationCandidates(
    tentative.filter((candidate) => candidate.widened),
    params.global.regressionPaths,
  );
  if (widened.length === 0) {
    return {
      ...disabled,
      status: "unattributed",
      remainingTentativeIds: tentative.map((candidate) => candidate.integrationId),
      reasons: ["global regression has no tentative widened integration candidates"],
    };
  }

  const blame = await attributeRegressionByRevertBisect(widened, params.deps.probeWithout);
  if (!blame.guilty) {
    return {
      ...disabled,
      status: "unattributed",
      remainingTentativeIds: tentative.map((candidate) => candidate.integrationId),
      probes: blame.probes,
      reasons: ["revert bisect did not produce a clean global for a single widened integration"],
    };
  }

  const reverted = await params.deps.revertLive(blame.guilty);
  if (!reverted.ok) {
    return {
      ...disabled,
      status: "unattributed",
      remainingTentativeIds: tentative.map((candidate) => candidate.integrationId),
      probes: blame.probes,
      reasons: [`blamed integration could not be reverted: ${reverted.error ?? "unknown error"}`],
    };
  }

  const confirmed = widened.filter((candidate) => candidate.integrationId !== blame.guilty?.integrationId);
  immediateTransaction(params.store.db, () => {
    writeValidationState({
      store: params.store,
      candidates: confirmed,
      state: "confirmed",
      disposition: "global_confirmation_passed_after_blame",
      confirmation,
    });
    writeValidationState({
      store: params.store,
      candidates: [blame.guilty!],
      state: "regressed",
      // Keep this historical item out of the existing blocking conflict set;
      // validation_state carries the downstream exclusion contract.
      status: "rejected",
      disposition: "confirmation_regressed_reverted",
      confirmation: { ...confirmation, revert_revision: reverted.revision ?? null },
    });
  });
  addEvent(params.store, params.runId, "epoch_checkpoint_progress", "confirmation-pass", {
    phase: "confirmation_pass",
    status: "regressed",
    build_id: params.global.buildId,
    report_path: params.global.reportPath,
    integration_id: blame.guilty.integrationId,
    checkpoint_id: blame.guilty.checkpointId,
    revert_revision: reverted.revision ?? null,
    confirmed_integration_ids: confirmed.map((candidate) => candidate.integrationId),
  });
  const remainingTentative = tentative.filter((candidate) => !candidate.widened);
  return {
    status: "regressed",
    confirmedIds: confirmed.map((candidate) => candidate.integrationId),
    regressedId: blame.guilty.integrationId,
    remainingTentativeIds: remainingTentative.map((candidate) => candidate.integrationId),
    requiresBoundaryRecheck: true,
    probes: blame.probes,
    reasons: [],
  };
}
