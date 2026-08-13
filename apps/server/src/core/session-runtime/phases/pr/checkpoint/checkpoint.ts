import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { immediateTransaction, now, withBusyRetry, type StateStore } from "@server/core/orchestrator-state";

export type CheckpointDisposition =
  | "pr_candidate"
  | "improvement_candidate"
  | "deferred_patch"
  | "stalled"
  | "needs_rework"
  | "tool_error"
  | "review_required";

export interface ImprovementPromotionPolicy {
  minGainPoints: number;
  minMatchedBytes: number;
}

export const defaultImprovementPromotion: ImprovementPromotionPolicy = {
  minGainPoints: 2,
  minMatchedBytes: 64,
};

// Only exact matches ship. Improvement candidates are the notable local
// improvements (above the promotion floors) -- tracked so the operator can see
// what is close, but they stay on the local branch until they become matches.
export function shipsInPr(disposition: CheckpointDisposition | string): boolean {
  return disposition === "pr_candidate";
}

export interface RunCheckpointItem {
  id: string;
  checkpointId: string;
  runId: string;
  workerStateId: string;
  workerCheckpointId: string;
  targetClaimId: string;
  epochId: string;
  epochTargetId: string;
  targetKey: string;
  unit: string;
  symbol: string;
  sourcePath: string;
  lifecycleStatus: string;
  validationStatus: string;
  validationState: "tentative" | "confirmed" | "regressed";
  disposition: CheckpointDisposition;
  itemStatus: "pending";
  exactMatch: boolean;
  prCandidate: boolean;
  patchPath: string;
  summaryPath: string;
  itemSummary: string;
  evidence: Record<string, unknown>;
  createdAt: string;
}

export interface RunCheckpointResult {
  checkpoint: {
    id: string;
    runId: string;
    checkpointType: string;
    status: string;
    artifactDir: string;
    summaryPath: string;
    prCandidatesPath: string;
    carryForwardPath: string;
    createdAt: string;
  };
  counts: Record<string, number>;
  eligibility: {
    confirmedOnly: boolean;
    activationReasons: string[];
    excludedTentative: number;
    excludedRegressed: number;
  };
  items: RunCheckpointItem[];
}

interface CreateRunCheckpointOptions {
  allowActiveClaims?: boolean;
  artifactDir?: string;
  checkpointType?: string;
  /** Forces the feature-only confirmed-state PR gate for direct callers. */
  confirmedOnlyPrEligibility?: boolean;
  improvementPromotion?: Partial<ImprovementPromotionPolicy>;
  now?: string;
  /**
   * Symbols that broke or regressed against the freshly rebuilt production
   * baseline. Items for these symbols are pulled out of the shipping lanes and
   * recorded as needs_rework instead.
   */
  reworkSymbols?: string[];
  title?: string;
}

interface WorkerCheckpointEvidence {
  id: string;
  attemptIndex: number;
  validationTime: string;
  oldScore: number | null;
  newScore: number | null;
  delta: number | null;
  exactMatch: boolean;
  hardGatesPassed: boolean;
  improvedOverBaseline: boolean;
  selectable: boolean;
  selected: boolean;
  buildStatus: string;
  qaStatus: string;
  objdiffStatus: string;
  validationStatus: string;
  validationState: "tentative" | "confirmed" | "regressed";
  artifactPath: string;
  patchPath: string;
  diffPath: string;
  failureReasons: string[];
  metadata: Record<string, unknown>;
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function stringValue(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function numberValue(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function nullableNumber(value: unknown): number | null {
  const parsed = numberValue(value, NaN);
  return Number.isFinite(parsed) ? parsed : null;
}

function boolValue(value: unknown): boolean {
  return value === true || value === 1 || value === "true";
}

function validationStateValue(value: unknown): "tentative" | "confirmed" | "regressed" {
  return value === "confirmed" || value === "regressed" ? value : "tentative";
}

function jsonObjectValue(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value !== "string" || !value.trim()) return {};
  try {
    return asObject(JSON.parse(value));
  } catch {
    return {};
  }
}

function stringArrayValue(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => String(item)).filter(Boolean);
  if (typeof value !== "string" || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.map((item) => String(item)).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function artifactTimestamp(value: string): string {
  return value.replace(/[:.]/g, "-");
}

function readJsonObject(path: string): Record<string, unknown> {
  if (!path || !existsSync(path)) return {};
  try {
    return asObject(JSON.parse(readFileSync(path, "utf8")));
  } catch {
    return {};
  }
}

function targetKey(unit: string, symbol: string): string {
  return `${unit || "unknown"}::${symbol || "unknown"}`;
}

function checkpointFromRow(row: Record<string, unknown>, prefix: "best" | "latest"): WorkerCheckpointEvidence | null {
  const id = stringValue(row[`${prefix}_checkpoint_id`]);
  if (!id) return null;
  return {
    id,
    attemptIndex: numberValue(row[`${prefix}_attempt_index`]),
    validationTime: stringValue(row[`${prefix}_validation_time`]),
    oldScore: nullableNumber(row[`${prefix}_old_score`]),
    newScore: nullableNumber(row[`${prefix}_new_score`]),
    delta: nullableNumber(row[`${prefix}_delta`]),
    exactMatch: boolValue(row[`${prefix}_exact_match`]),
    hardGatesPassed: boolValue(row[`${prefix}_hard_gates_passed`]),
    improvedOverBaseline: boolValue(row[`${prefix}_improved_over_baseline`]),
    selectable: boolValue(row[`${prefix}_selectable`]),
    selected: boolValue(row[`${prefix}_selected`]),
    buildStatus: stringValue(row[`${prefix}_build_status`]),
    qaStatus: stringValue(row[`${prefix}_qa_status`]),
    objdiffStatus: stringValue(row[`${prefix}_objdiff_status`]),
    validationStatus: stringValue(row[`${prefix}_validation_status`]),
    validationState: validationStateValue(row[`${prefix}_validation_state`]),
    artifactPath: stringValue(row[`${prefix}_artifact_path`]),
    patchPath: stringValue(row[`${prefix}_patch_path`]),
    diffPath: stringValue(row[`${prefix}_diff_path`]),
    failureReasons: stringArrayValue(row[`${prefix}_failure_reasons_json`]),
    metadata: jsonObjectValue(row[`${prefix}_metadata_json`]),
  };
}

function runnerValidationForCheckpoint(checkpoint: WorkerCheckpointEvidence | null, workerSummary: Record<string, unknown>): Record<string, unknown> {
  const artifact = checkpoint?.artifactPath ? readJsonObject(checkpoint.artifactPath) : {};
  if (stringValue(artifact.status)) return artifact;
  const metadataValidation = asObject(checkpoint?.metadata.runner_validation);
  if (stringValue(metadataValidation.status)) return metadataValidation;
  const latestValidation = asObject(workerSummary.latest_runner_validation);
  if (stringValue(latestValidation.status)) return latestValidation;
  return asObject(workerSummary.runner_validation);
}

export interface ImprovementPromotionEvaluation {
  promoted: boolean;
  gain_points: number | null;
  target_before: number | null;
  target_after: number | null;
  function_size_bytes: number | null;
  estimated_matched_bytes: number | null;
  min_gain_points: number;
  min_matched_bytes: number;
  reasons: string[];
}

function baselineFunctionSize(runnerValidation: Record<string, unknown>, symbol: string): number | null {
  const snapshot = readJsonObject(stringValue(runnerValidation.baselinePath, stringValue(runnerValidation.baseline_path)));
  for (const row of asArray(snapshot.functions).map(asObject)) {
    if (stringValue(row.name) !== symbol) continue;
    const size = numberValue(row.size, NaN);
    return Number.isFinite(size) && size > 0 ? size : null;
  }
  return null;
}

// Improvements only become notable when the runner-measured gain clears both
// floors: the gain floor keeps near-99% noise local, and the byte floor keeps
// one-instruction wins on tiny functions local. Missing measurements never
// promote; the reasons make every hold auditable in the evidence.
function evaluateImprovementPromotion(
  checkpoint: WorkerCheckpointEvidence | null,
  runnerValidation: Record<string, unknown>,
  symbol: string,
  policy: ImprovementPromotionPolicy,
): ImprovementPromotionEvaluation {
  const target = asObject(runnerValidation.target);
  const before = checkpoint?.oldScore ?? nullableNumber(target.before);
  const after = checkpoint?.newScore ?? nullableNumber(target.after);
  const reasons: string[] = [];
  const evaluation: ImprovementPromotionEvaluation = {
    promoted: false,
    gain_points: null,
    target_before: before,
    target_after: after,
    function_size_bytes: null,
    estimated_matched_bytes: null,
    min_gain_points: policy.minGainPoints,
    min_matched_bytes: policy.minMatchedBytes,
    reasons,
  };
  if (before === null || after === null) {
    reasons.push("runner validation target scores are unavailable");
    return evaluation;
  }
  const gain = Number((after - before).toFixed(6));
  evaluation.gain_points = gain;
  if (gain < policy.minGainPoints) {
    reasons.push(`gain ${gain >= 0 ? "+" : ""}${gain} is below the ${policy.minGainPoints}pt promotion floor`);
  }
  const size = baselineFunctionSize(runnerValidation, symbol);
  evaluation.function_size_bytes = size;
  if (size === null) {
    reasons.push("target function size is unavailable in the baseline snapshot; promotion requires a measurable byte delta");
  } else {
    const estimatedBytes = Math.round((size * gain) / 100);
    evaluation.estimated_matched_bytes = estimatedBytes;
    if (estimatedBytes < policy.minMatchedBytes) {
      reasons.push(`estimated matched-byte delta ${estimatedBytes} is below the ${policy.minMatchedBytes}-byte promotion floor`);
    }
  }
  evaluation.promoted = reasons.length === 0;
  if (evaluation.promoted) {
    reasons.push(`gain +${gain}pts and ~${evaluation.estimated_matched_bytes} matched bytes clear the promotion floors`);
  }
  return evaluation;
}

function checkpointShowsUnacceptedProgress(checkpoint: WorkerCheckpointEvidence | null): boolean {
  if (!checkpoint) return false;
  if (checkpoint.exactMatch) return true;
  if (checkpoint.oldScore !== null && checkpoint.newScore !== null && checkpoint.newScore > checkpoint.oldScore) return true;
  return checkpoint.failureReasons.length > 0 && checkpoint.validationStatus !== "skipped";
}

function dispositionForWorkerState(params: {
  checkpoint: WorkerCheckpointEvidence | null;
  exactMatch: boolean;
  improvement: ImprovementPromotionEvaluation | null;
  lifecycleStatus: string;
  regressedAgainstBaseline: boolean;
}): CheckpointDisposition {
  if (params.lifecycleStatus === "error") return "tool_error";
  if (params.regressedAgainstBaseline) return "needs_rework";
  if (params.checkpoint?.selectable && params.checkpoint.hardGatesPassed) {
    if (params.exactMatch) return "pr_candidate";
    return params.improvement?.promoted ? "improvement_candidate" : "deferred_patch";
  }
  return checkpointShowsUnacceptedProgress(params.checkpoint) ? "review_required" : "stalled";
}

function checkpointCounts(items: RunCheckpointItem[]): Record<string, number> {
  const counts: Record<string, number> = {
    total: items.length,
    pr_candidate: 0,
    improvement_candidate: 0,
    deferred_patch: 0,
    stalled: 0,
    needs_rework: 0,
    tool_error: 0,
    review_required: 0,
    exact_match: 0,
    carry_forward: 0,
  };
  for (const item of items) {
    counts[item.disposition] = numberValue(counts[item.disposition]) + 1;
    if (item.exactMatch) counts.exact_match += 1;
    if (!shipsInPr(item.disposition)) counts.carry_forward += 1;
  }
  return counts;
}

function workerStateSummaryPath(row: Record<string, unknown>, summary: Record<string, unknown>): string {
  const explicit = stringValue(summary.summary_path);
  if (explicit) return explicit;
  const artifactDir = stringValue(row.artifact_dir);
  return artifactDir ? resolve(artifactDir, "state", "worker_state.json") : "";
}

function itemFromWorkerState(
  row: Record<string, unknown>,
  checkpointId: string,
  runId: string,
  createdAt: string,
  policy: ImprovementPromotionPolicy,
  reworkSymbols: Set<string>,
  confirmedOnlyPrEligibility: boolean,
): RunCheckpointItem {
  const workerSummary = jsonObjectValue(row.summary_json);
  const bestCheckpoint = checkpointFromRow(row, "best");
  const latestCheckpoint = checkpointFromRow(row, "latest");
  const checkpoint = bestCheckpoint ?? latestCheckpoint;
  const runnerValidation = runnerValidationForCheckpoint(checkpoint, workerSummary);
  const summaryTarget = asObject(workerSummary.target);
  const validationTarget = asObject(runnerValidation.target);
  const unit = stringValue(validationTarget.unit, stringValue(summaryTarget.unit, stringValue(row.unit)));
  const symbol = stringValue(validationTarget.symbol, stringValue(summaryTarget.symbol, stringValue(row.symbol)));
  const sourcePath = stringValue(validationTarget.source_path, stringValue(summaryTarget.source_path, stringValue(row.source_path)));
  const lifecycleStatus = stringValue(row.lifecycle_status);
  const exactMatch = Boolean(bestCheckpoint?.selectable && bestCheckpoint.hardGatesPassed && bestCheckpoint.exactMatch);
  const improvement =
    checkpoint && !exactMatch ? evaluateImprovementPromotion(checkpoint, runnerValidation, symbol, policy) : null;
  const regressedAgainstBaseline = Boolean(symbol) && reworkSymbols.has(symbol);
  const candidateDisposition = dispositionForWorkerState({
    checkpoint,
    exactMatch,
    improvement,
    lifecycleStatus,
    regressedAgainstBaseline,
  });
  const validationState = checkpoint?.validationState ?? "tentative";
  const excludedByValidationState =
    confirmedOnlyPrEligibility &&
    (candidateDisposition === "pr_candidate" || candidateDisposition === "improvement_candidate") &&
    validationState !== "confirmed";
  const disposition = excludedByValidationState
    ? validationState === "regressed"
      ? "needs_rework"
      : "deferred_patch"
    : candidateDisposition;
  const validationStatus = checkpoint?.validationStatus || stringValue(runnerValidation.status);
  const summaryPath = workerStateSummaryPath(row, workerSummary);
  const itemSummary =
    stringValue(workerSummary.summary) ||
    stringValue(row.timeout_summary) ||
    stringValue(row.error_summary) ||
    (checkpoint
      ? `Runner checkpoint ${checkpoint.id} finished with validation status ${checkpoint.validationStatus || "unknown"}.`
      : "Worker state closed without a runner checkpoint.");
  const evidence = {
    worker_id: stringValue(row.worker_id),
    lifecycle_status: lifecycleStatus,
    target_claim_id: stringValue(row.target_claim_id),
    epoch_id: stringValue(row.epoch_id),
    epoch_target_id: stringValue(row.epoch_target_id),
    worker_started_at: stringValue(row.started_at),
    worker_ended_at: stringValue(row.ended_at),
    timeout_summary: stringValue(row.timeout_summary),
    error_summary: stringValue(row.error_summary),
    worker_state_summary: workerSummary,
    selected_checkpoint: bestCheckpoint,
    latest_checkpoint: latestCheckpoint,
    runner_validation: runnerValidation,
    pr_eligibility: {
      confirmed_only_gate: confirmedOnlyPrEligibility,
      validation_state: validationState,
      eligible: !excludedByValidationState,
      excluded: excludedByValidationState,
      candidate_disposition: candidateDisposition,
      reason: excludedByValidationState
        ? `validation_state=${validationState}; confirmed-only PR eligibility gate requires confirmed`
        : confirmedOnlyPrEligibility
          ? "validation_state=confirmed or item was not in a PR-preparation lane"
          : "legacy eligibility path; write-set feature gate inactive",
    },
    ...(improvement ? { improvement_promotion: improvement } : {}),
    ...(regressedAgainstBaseline
      ? { baseline_regression: { reason: "symbol broke or regressed against the rebuilt production baseline; pulled from shipping lanes for rework" } }
      : {}),
  };
  return {
    id: randomUUID(),
    checkpointId,
    runId,
    workerStateId: stringValue(row.worker_state_id),
    workerCheckpointId: checkpoint?.id ?? "",
    targetClaimId: stringValue(row.target_claim_id),
    epochId: stringValue(row.epoch_id),
    epochTargetId: stringValue(row.epoch_target_id),
    targetKey: targetKey(unit, symbol),
    unit,
    symbol,
    sourcePath,
    lifecycleStatus,
    validationStatus,
    validationState,
    disposition,
    itemStatus: "pending",
    exactMatch,
    prCandidate: disposition === "pr_candidate",
    patchPath: checkpoint?.patchPath || checkpoint?.diffPath || "",
    summaryPath,
    itemSummary,
    evidence,
    createdAt,
  };
}

function activeClaimCount(store: StateStore, runId: string): number {
  const row = withBusyRetry(
    () =>
      store.db
        .query("SELECT COUNT(*) AS count FROM target_claims WHERE run_id = ? AND status = 'active'")
        .get(runId) as Record<string, unknown>,
  );
  return numberValue(row.count);
}

function workerStateRows(store: StateStore, runId: string): Record<string, unknown>[] {
  return withBusyRetry(
    () =>
      store.db
        .query(
          `
            SELECT
              worker_state.id AS worker_state_id,
              worker_state.run_id,
              worker_state.epoch_id,
              worker_state.epoch_target_id,
              worker_state.target_claim_id,
              worker_state.worker_id,
              worker_state.target_key,
              worker_state.lifecycle_status,
              worker_state.write_set_json,
              worker_state.worker_session_ids_json,
              worker_state.artifact_dir,
              worker_state.worktree_path,
              worker_state.started_at,
              worker_state.ended_at,
              worker_state.baseline_score,
              worker_state.best_checkpoint_id,
              worker_state.best_score,
              worker_state.exact,
              worker_state.timeout_summary,
              worker_state.error_summary,
              worker_state.summary_json,
              epoch_targets.unit,
              epoch_targets.symbol,
              epoch_targets.source_path,
              epoch_targets.size,
              epoch_targets.baseline_score AS epoch_baseline_score,
              best.id AS best_checkpoint_id,
              best.attempt_index AS best_attempt_index,
              best.validation_time AS best_validation_time,
              best.old_score AS best_old_score,
              best.new_score AS best_new_score,
              best.delta AS best_delta,
              best.exact_match AS best_exact_match,
              best.hard_gates_passed AS best_hard_gates_passed,
              best.improved_over_baseline AS best_improved_over_baseline,
              best.selectable AS best_selectable,
              best.selected AS best_selected,
              best.build_status AS best_build_status,
              best.qa_status AS best_qa_status,
              best.objdiff_status AS best_objdiff_status,
              best.validation_status AS best_validation_status,
              best.validation_state AS best_validation_state,
              best.artifact_path AS best_artifact_path,
              best.patch_path AS best_patch_path,
              best.diff_path AS best_diff_path,
              best.failure_reasons_json AS best_failure_reasons_json,
              best.metadata_json AS best_metadata_json,
              latest.id AS latest_checkpoint_id,
              latest.attempt_index AS latest_attempt_index,
              latest.validation_time AS latest_validation_time,
              latest.old_score AS latest_old_score,
              latest.new_score AS latest_new_score,
              latest.delta AS latest_delta,
              latest.exact_match AS latest_exact_match,
              latest.hard_gates_passed AS latest_hard_gates_passed,
              latest.improved_over_baseline AS latest_improved_over_baseline,
              latest.selectable AS latest_selectable,
              latest.selected AS latest_selected,
              latest.build_status AS latest_build_status,
              latest.qa_status AS latest_qa_status,
              latest.objdiff_status AS latest_objdiff_status,
              latest.validation_status AS latest_validation_status,
              latest.validation_state AS latest_validation_state,
              latest.artifact_path AS latest_artifact_path,
              latest.patch_path AS latest_patch_path,
              latest.diff_path AS latest_diff_path,
              latest.failure_reasons_json AS latest_failure_reasons_json,
              latest.metadata_json AS latest_metadata_json
            FROM worker_state
            JOIN epoch_targets ON epoch_targets.id = worker_state.epoch_target_id
            LEFT JOIN worker_checkpoints AS best ON best.id = worker_state.best_checkpoint_id
            LEFT JOIN worker_checkpoints AS latest ON latest.id = (
              SELECT id
              FROM worker_checkpoints
              WHERE worker_checkpoints.worker_state_id = worker_state.id
              ORDER BY validation_time DESC, attempt_index DESC
              LIMIT 1
            )
            WHERE worker_state.run_id = ?
            ORDER BY COALESCE(worker_state.ended_at, latest.validation_time, worker_state.started_at) DESC
          `,
        )
        .all(runId) as Record<string, unknown>[],
  );
}

function confirmedOnlyPrEligibilityReasons(store: StateStore, runId: string, forced: boolean): string[] {
  const reasons: string[] = [];
  if (forced) reasons.push("caller_flag");
  const featureEvent = withBusyRetry(
    () =>
      store.db
        .query(
          `
            SELECT 1
            FROM events
            WHERE run_id = ?
              AND event_type = 'write_set_integration_flags'
            LIMIT 1
          `,
        )
        .get(runId),
  );
  if (featureEvent) reasons.push("feature_flags_recorded");
  const nonDefaultCheckpoint = withBusyRetry(
    () =>
      store.db
        .query(
          `
            SELECT 1
            FROM worker_checkpoints
            WHERE run_id = ?
              AND validation_state IN ('confirmed', 'regressed')
            LIMIT 1
          `,
        )
        .get(runId),
  );
  const nonDefaultIntegration = withBusyRetry(
    () =>
      store.db
        .query(
          `
            SELECT 1
            FROM worker_output_integrations
            WHERE run_id = ?
              AND validation_state IN ('confirmed', 'regressed')
            LIMIT 1
          `,
        )
        .get(runId),
  );
  if (nonDefaultCheckpoint || nonDefaultIntegration) reasons.push("non_default_validation_state");
  const wideningHistory = withBusyRetry(
    () => store.db.query("SELECT 1 FROM write_set_widenings WHERE run_id = ? LIMIT 1").get(runId),
  );
  if (wideningHistory) reasons.push("write_set_widening_history");
  const mergeOnFinishIntegration = withBusyRetry(
    () =>
      store.db
        .query(
          `
            SELECT 1
            FROM worker_output_integrations
            WHERE run_id = ?
              AND disposition IN ('merge_on_finish_clean', 'conflict_resolved')
            LIMIT 1
          `,
        )
        .get(runId),
  );
  if (mergeOnFinishIntegration) reasons.push("merge_on_finish_history");
  return reasons;
}

function markdownTable(items: RunCheckpointItem[]): string[] {
  if (items.length === 0) return ["No items."];
  const lines = ["| Disposition | Symbol | Source | Checkpoint | Patch | Evidence |", "| - | - | - | - | - | - |"];
  for (const item of items) {
    const promotion = asObject(item.evidence.improvement_promotion);
    const eligibility = asObject(item.evidence.pr_eligibility);
    const evidence = boolValue(eligibility.excluded)
      ? stringValue(eligibility.reason)
      : item.exactMatch
      ? "runner-selected exact checkpoint"
      : item.disposition === "improvement_candidate"
        ? `${numberValue(promotion.target_before, NaN)} -> ${numberValue(promotion.target_after, NaN)} (+${numberValue(promotion.gain_points, NaN)}pts, ~${numberValue(promotion.estimated_matched_bytes, NaN)} bytes)`
        : item.disposition.replace(/_/g, " ");
    lines.push(
      `| ${item.disposition} | \`${item.symbol || "-"}\` | \`${item.sourcePath || "-"}\` | ${item.workerCheckpointId || item.workerStateId || "-"} | ${
        item.patchPath ? `\`${item.patchPath}\`` : "-"
      } | ${evidence} |`,
    );
  }
  return lines;
}

function writeArtifacts(params: {
  artifactDir: string;
  carryForwardPath: string;
  checkpoint: RunCheckpointResult["checkpoint"];
  counts: Record<string, number>;
  eligibility: RunCheckpointResult["eligibility"];
  items: RunCheckpointItem[];
  prCandidatesPath: string;
  summaryPath: string;
  title: string;
}): void {
  mkdirSync(params.artifactDir, { recursive: true });
  const prCandidates = params.items.filter((item) => item.disposition === "pr_candidate");
  const improvementCandidates = params.items.filter((item) => item.disposition === "improvement_candidate");
  const carryForward = params.items.filter((item) => !shipsInPr(item.disposition));
  const payload = {
    checkpoint: params.checkpoint,
    counts: params.counts,
    eligibility: params.eligibility,
    pr_candidates: prCandidates,
    improvement_candidates: improvementCandidates,
    carry_forward: carryForward,
    items: params.items,
  };
  writeFileSync(params.summaryPath, JSON.stringify(payload, null, 2), "utf8");
  writeFileSync(
    params.prCandidatesPath,
    [
      `# ${params.title}: PR Candidates`,
      "",
      `Run: \`${params.checkpoint.runId}\``,
      `Checkpoint: \`${params.checkpoint.id}\``,
      "",
      `${prCandidates.length} exact-match candidate(s) ship. Only matches that survive the full build and regression gate go into PRs; everything else stays on the local branch.`,
      "",
      ...markdownTable(prCandidates),
      "",
    ].join("\n"),
    "utf8",
  );
  writeFileSync(
    params.carryForwardPath,
    [
      `# ${params.title}: Carry Forward`,
      "",
      `Run: \`${params.checkpoint.runId}\``,
      `Checkpoint: \`${params.checkpoint.id}\``,
      "",
      `${carryForward.length} item(s) stay local: notable improvements, deferred patches, fact requests, rework, tool errors, and stalls.`,
      "",
      "## Notable improvements (closest to matching)",
      "",
      `${improvementCandidates.length} validated improvement(s) cleared the promotion floors. They do not ship; they are the best next targets.`,
      "",
      ...markdownTable(improvementCandidates),
      "",
      "## Everything else",
      "",
      ...markdownTable(carryForward.filter((item) => item.disposition !== "improvement_candidate")),
      "",
    ].join("\n"),
    "utf8",
  );
}

function persistCheckpoint(store: StateStore, result: RunCheckpointResult): void {
  const insertCheckpoint = store.db.query(
    `
      INSERT INTO run_checkpoints
      (id, run_id, checkpoint_type, status, artifact_dir, summary_path, pr_candidates_path, carry_forward_path, created_at, payload_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
  );
  const insertItem = store.db.query(
    `
      INSERT INTO checkpoint_items
      (id, checkpoint_id, run_id, worker_checkpoint_id, target_claim_id, target_key, unit, symbol, source_path, lifecycle_status, disposition, item_status, exact_match, pr_candidate, patch_path, summary_path, state_summary, evidence_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
  );
  immediateTransaction(store.db, () => {
    insertCheckpoint.run(
      result.checkpoint.id,
      result.checkpoint.runId,
      result.checkpoint.checkpointType,
      result.checkpoint.status,
      result.checkpoint.artifactDir,
      result.checkpoint.summaryPath,
      result.checkpoint.prCandidatesPath,
      result.checkpoint.carryForwardPath,
      result.checkpoint.createdAt,
      JSON.stringify({ counts: result.counts, eligibility: result.eligibility }),
    );
    for (const item of result.items) {
      insertItem.run(
        item.id,
        item.checkpointId,
        item.runId,
        item.workerCheckpointId || null,
        item.targetClaimId || null,
        item.targetKey,
        item.unit || null,
        item.symbol || null,
        item.sourcePath || null,
        item.lifecycleStatus || "finished",
        item.disposition,
        item.itemStatus,
        boolValue(item.exactMatch) ? 1 : 0,
        boolValue(item.prCandidate) ? 1 : 0,
        item.patchPath || null,
        item.summaryPath || null,
        item.itemSummary,
        JSON.stringify(item.evidence),
        item.createdAt,
      );
    }
  });
}

export function createRunCheckpoint(store: StateStore, runId: string, options: CreateRunCheckpointOptions = {}): RunCheckpointResult {
  const activeClaims = activeClaimCount(store, runId);
  if (activeClaims > 0 && !options.allowActiveClaims) {
    throw new Error(`Run ${runId} still has ${activeClaims} active claim(s); drain or recover them before checkpointing.`);
  }

  const createdAt = options.now ?? now();
  const checkpointId = randomUUID();
  const artifactDir = resolve(options.artifactDir ?? resolve(store.stateDir, "runs", runId, "checkpoints", artifactTimestamp(createdAt)));
  const summaryPath = resolve(artifactDir, "checkpoint.json");
  const prCandidatesPath = resolve(artifactDir, "pr_candidates.md");
  const carryForwardPath = resolve(artifactDir, "carry_forward.md");
  const checkpoint = {
    id: checkpointId,
    runId,
    checkpointType: options.checkpointType ?? "pr_handoff",
    status: "open",
    artifactDir,
    summaryPath,
    prCandidatesPath,
    carryForwardPath,
    createdAt,
  };
  const policy: ImprovementPromotionPolicy = {
    minGainPoints: options.improvementPromotion?.minGainPoints ?? defaultImprovementPromotion.minGainPoints,
    minMatchedBytes: options.improvementPromotion?.minMatchedBytes ?? defaultImprovementPromotion.minMatchedBytes,
  };
  const reworkSymbols = new Set((options.reworkSymbols ?? []).filter(Boolean));
  const activationReasons = confirmedOnlyPrEligibilityReasons(store, runId, options.confirmedOnlyPrEligibility === true);
  const confirmedOnlyPrEligibility = activationReasons.length > 0;
  const items = workerStateRows(store, runId).map((row) =>
    itemFromWorkerState(row, checkpointId, runId, createdAt, policy, reworkSymbols, confirmedOnlyPrEligibility),
  );
  const counts = checkpointCounts(items);
  const eligibility = {
    confirmedOnly: confirmedOnlyPrEligibility,
    activationReasons,
    excludedTentative: items.filter(
      (item) => item.validationState === "tentative" && boolValue(asObject(item.evidence.pr_eligibility).excluded),
    ).length,
    excludedRegressed: items.filter(
      (item) => item.validationState === "regressed" && boolValue(asObject(item.evidence.pr_eligibility).excluded),
    ).length,
  };
  const result = { checkpoint, counts, eligibility, items };
  writeArtifacts({
    artifactDir,
    carryForwardPath,
    checkpoint,
    counts,
    eligibility,
    items,
    prCandidatesPath,
    summaryPath,
    title: options.title ?? "Run checkpoint",
  });
  persistCheckpoint(store, result);
  return result;
}

export function latestCheckpointSummary(store: StateStore, runId: string): Record<string, unknown> | null {
  const checkpoint = withBusyRetry(
    () =>
      store.db
        .query(
          `
            SELECT id, run_id, checkpoint_type, status, artifact_dir, summary_path, pr_candidates_path, carry_forward_path, created_at, payload_json
            FROM run_checkpoints
            WHERE run_id = ?
            ORDER BY created_at DESC
            LIMIT 1
          `,
        )
        .get(runId) as Record<string, unknown> | undefined,
  );
  if (!checkpoint) return null;
  const countsRows = withBusyRetry(
    () =>
      store.db
        .query(
          `
            SELECT disposition, COUNT(*) AS count
            FROM checkpoint_items
            WHERE checkpoint_id = ?
            GROUP BY disposition
          `,
        )
        .all(String(checkpoint.id)) as Record<string, unknown>[],
  );
  return {
    id: checkpoint.id,
    runId: checkpoint.run_id,
    checkpointType: checkpoint.checkpoint_type,
    status: checkpoint.status,
    artifactDir: checkpoint.artifact_dir,
    summaryPath: checkpoint.summary_path,
    prCandidatesPath: checkpoint.pr_candidates_path,
    carryForwardPath: checkpoint.carry_forward_path,
    createdAt: checkpoint.created_at,
    counts: Object.fromEntries(countsRows.map((row) => [String(row.disposition), numberValue(row.count)])),
  };
}
