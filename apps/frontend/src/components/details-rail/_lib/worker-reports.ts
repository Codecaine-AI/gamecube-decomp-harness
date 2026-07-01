import { asArray, asObject, delta, num, scoreOrPercent, scorePairLooksPercent, text, type Dashboard, type JsonObject } from "@/lib/format";

export type WorkerStateOutcome =
  | "running"
  | "exact"
  | "timeout_selected_checkpoint"
  | "timeout_baseline"
  | "claim_deadline"
  | "cold_attempt_budget_exhausted"
  | "improvement_followup_budget_exhausted"
  | "gate_failed_exact_followup_budget_exhausted"
  | "accepted_or_no_repair_reasons"
  | "dry_run"
  | "recovered_requeued"
  | "recovered_finished"
  | "provider_error"
  | "worker_session_failed"
  | "agent_tool_error"
  | "validation_qa_lint_failed"
  | "validation_build_failed"
  | "validation_snapshot_unavailable"
  | "validation_no_official_score_change"
  | "validation_target_regressed"
  | "validation_same_unit_regression"
  | "validation_failed"
  | "validation_skipped"
  | "cancelled"
  | "finished"
  | "unknown_error";
export type WorkerStateFilter = "all" | WorkerStateOutcome;
type WorkerStateResult = "exact" | "improved" | "no_progress";
type StopReason = "target_complete" | "stalled";

export const reportsPageSize = 8;

export const reportFilters: Array<{ description: string; id: WorkerStateFilter; label: string }> = [
  { id: "all", label: "All", description: "Every worker state in this run or recent window." },
  { id: "running", label: "Running", description: "Active worker states that have not closed yet." },
  { id: "exact", label: "Exact", description: "Worker states closed after the runner accepted an exact checkpoint." },
  { id: "timeout_selected_checkpoint", label: "Timeout: Checkpoint", description: "Timeout closed with a runner-selected checkpoint retained." },
  { id: "timeout_baseline", label: "Timeout: Baseline", description: "Timeout closed with no selectable checkpoint, so the baseline was retained." },
  { id: "claim_deadline", label: "Claim Deadline", description: "Repair/continuation stopped because the claim deadline was reached." },
  { id: "cold_attempt_budget_exhausted", label: "Cold Budget", description: "No selectable checkpoint was found before the cold-attempt budget ran out." },
  { id: "improvement_followup_budget_exhausted", label: "Improvement Tail", description: "A best checkpoint existed, but follow-up repair attempts after it were exhausted." },
  { id: "gate_failed_exact_followup_budget_exhausted", label: "Gate-Exact Tail", description: "An exact-scoring attempt failed gates, and its repair tail was exhausted." },
  { id: "accepted_or_no_repair_reasons", label: "No Repair Reasons", description: "The runner stopped because there were no repair reasons to continue with." },
  { id: "dry_run", label: "Dry Run", description: "The worker stopped at the dry-run boundary." },
  { id: "recovered_requeued", label: "Recovered: Requeued", description: "An interrupted active claim was recovered and its target was admitted again." },
  { id: "recovered_finished", label: "Recovered: Retained", description: "An interrupted active claim was recovered with selectable evidence retained." },
  { id: "provider_error", label: "Provider Error", description: "The LLM provider failed before the target was really attempted; worker spawns paused until a probe succeeded." },
  { id: "worker_session_failed", label: "Session Failed", description: "The Pi worker session failed before a validation-ready response was available." },
  { id: "agent_tool_error", label: "Agent Tool Error", description: "The worker explicitly reported a tool/build/validation failure as terminal." },
  { id: "validation_qa_lint_failed", label: "QA Lint Failed", description: "Runner validation failed because QA lint found required repairs." },
  { id: "validation_build_failed", label: "Build Failed", description: "Runner validation could not build the worker's object target." },
  { id: "validation_snapshot_unavailable", label: "Snapshot Missing", description: "Runner validation could not obtain comparable before/after score snapshots." },
  { id: "validation_no_official_score_change", label: "No Score Change", description: "Runner validation found no official target score movement." },
  { id: "validation_target_regressed", label: "Target Regressed", description: "Runner validation found the target score regressed." },
  { id: "validation_same_unit_regression", label: "Unit Regression", description: "Runner validation found a same-unit regression." },
  { id: "validation_failed", label: "Validation Failed", description: "Runner hard gates failed without a more specific validation status." },
  { id: "validation_skipped", label: "Validation Skipped", description: "Runner validation was skipped." },
  { id: "cancelled", label: "Cancelled", description: "Worker states cancelled by an operator or shutdown path." },
  { id: "finished", label: "Finished", description: "Legacy worker states closed as finished without a more specific terminal reason." },
  { id: "unknown_error", label: "Unknown Error", description: "Worker states closed as error without a known error kind." },
];

const reportFilterIds: WorkerStateFilter[] = reportFilters.map((option) => option.id);

export function workerStateStatusLabel(value: unknown): string {
  const status = text(value);
  return status ? status.replace(/_/g, " ") : "unknown";
}

export function attemptNumber(value: unknown, fallback = NaN): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function attemptLooksPercent(attempt: JsonObject): boolean {
  return scorePairLooksPercent(attempt.oldScore, attempt.newScore, attempt.delta);
}

function positivePercentAttempts(report: JsonObject): JsonObject[] {
  return asArray(report.attempts)
    .map(asObject)
    .filter((attempt) => attemptLooksPercent(attempt) && attemptNumber(attempt.delta, 0) > 0);
}

function reportRunnerTarget(report: JsonObject): JsonObject | null {
  const validation = asObject(report.runnerValidation);
  if (text(validation.status) !== "passed") return null;
  const target = asObject(validation.target);
  return Object.keys(target).length > 0 ? target : null;
}

function runnerTargetDelta(target: JsonObject): number {
  const before = attemptNumber(target.before, NaN);
  const after = attemptNumber(target.after, NaN);
  return Number.isFinite(before) && Number.isFinite(after) ? after - before : NaN;
}

export function reportScoreDelta(report: JsonObject): number {
  const runnerTarget = reportRunnerTarget(report);
  if (runnerTarget) {
    const runnerDelta = runnerTargetDelta(runnerTarget);
    if (Number.isFinite(runnerDelta)) return Math.max(0, runnerDelta);
  }
  const recorded = attemptNumber(report.scoreDelta, NaN);
  if (Number.isFinite(recorded)) return recorded;
  return positivePercentAttempts(report).reduce((sum, attempt) => sum + Math.max(0, attemptNumber(attempt.delta, 0)), 0);
}

function reportHasExactAttempt(report: JsonObject): boolean {
  const runnerTarget = reportRunnerTarget(report);
  if (runnerTarget) return runnerTarget.exact === true;
  return asArray(report.attempts)
    .map(asObject)
    .some((attempt) => attemptLooksPercent(attempt) && attemptNumber(attempt.oldScore) < 99.99999 && attemptNumber(attempt.newScore) >= 99.99999);
}

function reportFailed(report: JsonObject): boolean {
  const gate = asObject(report.acceptanceGate);
  const validation = asObject(report.runnerValidation);
  const repairAttempts = asObject(report.repairAttempts);
  const validationStatus = text(validation.status);
  const exhaustedFiniteRepairBudget = repairAttempts.exhausted === true && text(repairAttempts.policy) !== "unbounded_until_claim_timeout";
  return (
    gate.accepted === false ||
    (validationStatus !== "" && validationStatus !== "passed" && validationStatus !== "skipped") ||
    exhaustedFiniteRepairBudget
  );
}

function runnerValidationRejected(report: JsonObject): boolean {
  const status = text(asObject(report.runnerValidation).status);
  return status !== "" && status !== "passed" && status !== "skipped";
}

function joinedText(values: unknown[]): string {
  return values
    .flatMap((value) => {
      if (typeof value === "string") return [value];
      if (Array.isArray(value)) return value.map((item) => text(item)).filter(Boolean);
      if (value && typeof value === "object") {
        return Object.values(value as JsonObject)
          .map((item) => (typeof item === "string" ? item : ""))
          .filter(Boolean);
      }
      return [];
    })
    .join("\n");
}

function reportErrorText(report: JsonObject): string {
  const error = asObject(report.error);
  const recovery = asObject(report.recovery);
  return joinedText([
    report.summary,
    report.timeoutSummary,
    report.errorSummary,
    error.kind,
    error.summary,
    error.reasons,
    recovery.by,
    recovery.reason,
  ]);
}

function reportErrorKind(report: JsonObject): string {
  return text(asObject(report.error).kind);
}

function reportRecovery(report: JsonObject): JsonObject {
  return asObject(report.recovery);
}

function reportRecovered(report: JsonObject): boolean {
  const recovery = asObject(report.recovery);
  const summary = reportErrorText(report);
  return text(recovery.by) === "recover-claims" || text(recovery.reason) !== "" || /\bRecovered interrupted active worker\b/i.test(summary);
}

function reportStopReasonCode(report: JsonObject): string {
  const repairAttempts = asObject(report.repairAttempts);
  const decision = asObject(repairAttempts.decision);
  return text(repairAttempts.stop_reason) || text(decision.stopReason) || text(report.stopReason);
}

function reportSessionFailed(report: JsonObject): boolean {
  const kind = reportErrorKind(report);
  return kind === "worker_session_failed" || /\bWorker Pi session failed before producing\b/i.test(reportErrorText(report));
}

function reportAgentToolError(report: JsonObject): boolean {
  const kind = reportErrorKind(report);
  return kind === "agent_noted_tool_error" || kind === "agent_noted_tool_error_advisory";
}

function reportHasSelectedCheckpoint(report: JsonObject): boolean {
  return Boolean(text(asObject(report.selectedCheckpoint).id));
}

function reportValidationEndstate(report: JsonObject): WorkerStateOutcome | null {
  const validation = asObject(report.runnerValidation);
  const qaLintStatus = text(asObject(validation.qaLint).status);
  const status = text(report.validationStatus, text(validation.status));
  const errorKind = reportErrorKind(report);
  if (errorKind === "runner_validation_qa_lint_failed" || qaLintStatus === "violations" || qaLintStatus === "warnings") return "validation_qa_lint_failed";
  if (status === "build_failed") return "validation_build_failed";
  if (status === "snapshot_unavailable") return "validation_snapshot_unavailable";
  if (status === "no_official_score_change") return "validation_no_official_score_change";
  if (status === "target_regressed") return "validation_target_regressed";
  if (status === "same_unit_regression") return "validation_same_unit_regression";
  if (status === "failed") return "validation_failed";
  if (status === "skipped") return "validation_skipped";
  if (/^runner_validation_/.test(errorKind)) return "validation_failed";
  return null;
}

function reportStopReasonEndstate(report: JsonObject): WorkerStateOutcome | null {
  const stopReason = reportStopReasonCode(report);
  if (stopReason === "accepted_exact") return "exact";
  if (stopReason === "claim_deadline") return "claim_deadline";
  if (stopReason === "cold_attempt_budget_exhausted") return "cold_attempt_budget_exhausted";
  if (stopReason === "improvement_followup_budget_exhausted") return "improvement_followup_budget_exhausted";
  if (stopReason === "gate_failed_exact_followup_budget_exhausted") return "gate_failed_exact_followup_budget_exhausted";
  if (stopReason === "accepted_or_no_repair_reasons") return "accepted_or_no_repair_reasons";
  if (stopReason === "dry_run") return "dry_run";
  if (stopReason === "provider_error") return "provider_error";
  if (stopReason === "worker_session_failed") return "worker_session_failed";
  return null;
}

export function reportResult(report: JsonObject): WorkerStateResult {
  const runnerTarget = reportRunnerTarget(report);
  if (runnerTarget) {
    if (runnerTarget.exact === true) return "exact";
    if (runnerTarget.improved === true || runnerTargetDelta(runnerTarget) > 0) return "improved";
    return "no_progress";
  }
  if (runnerValidationRejected(report)) return "no_progress";
  const explicit = text(report.result);
  if (reportHasExactAttempt(report)) return "exact";
  if (explicit === "no_progress") return explicit;
  if (explicit === "exact" || explicit === "improved") return reportScoreDelta(report) > 0 ? "improved" : "no_progress";
  if (reportScoreDelta(report) > 0) return "improved";
  return "no_progress";
}

export function reportStopReason(report: JsonObject, result = reportResult(report)): StopReason {
  const explicit = text(report.stopReason);
  if (explicit === "target_complete" || explicit === "stalled") return explicit;
  if (explicit === "no_useful_hypothesis") return "stalled";
  if (result === "exact") return "target_complete";
  return "stalled";
}

export function reportOutcome(report: JsonObject): WorkerStateOutcome {
  const lifecycle = text(report.lifecycleStatus);
  const errorKind = reportErrorKind(report);
  if (lifecycle === "running") return "running";
  if (reportRecovered(report)) return reportRecovery(report).requeued === true ? "recovered_requeued" : "recovered_finished";
  if (errorKind === "provider_error") return "provider_error";
  if (reportSessionFailed(report)) return "worker_session_failed";
  if (reportAgentToolError(report)) return "agent_tool_error";
  const stopReasonEndstate = reportStopReasonEndstate(report);
  if (stopReasonEndstate) return stopReasonEndstate;
  if (lifecycle === "exact") return "exact";
  if (lifecycle === "cancelled") return "cancelled";
  if (lifecycle === "timeout") return reportHasSelectedCheckpoint(report) ? "timeout_selected_checkpoint" : "timeout_baseline";
  const validationEndstate = reportValidationEndstate(report);
  if (validationEndstate && reportFailed(report)) return validationEndstate;
  if (lifecycle === "finished") return "finished";
  if (lifecycle === "error" || Object.keys(asObject(report.error)).length > 0) return "unknown_error";
  return "finished";
}

export function reportMatchesFilter(report: JsonObject, filter: WorkerStateFilter): boolean {
  if (filter === "all") return true;
  return reportOutcome(report) === filter;
}

function emptyReportCounts(): Record<WorkerStateFilter, number> {
  return {
    all: 0,
    running: 0,
    exact: 0,
    timeout_selected_checkpoint: 0,
    timeout_baseline: 0,
    claim_deadline: 0,
    cold_attempt_budget_exhausted: 0,
    improvement_followup_budget_exhausted: 0,
    gate_failed_exact_followup_budget_exhausted: 0,
    accepted_or_no_repair_reasons: 0,
    dry_run: 0,
    recovered_requeued: 0,
    recovered_finished: 0,
    provider_error: 0,
    worker_session_failed: 0,
    agent_tool_error: 0,
    validation_qa_lint_failed: 0,
    validation_build_failed: 0,
    validation_snapshot_unavailable: 0,
    validation_no_official_score_change: 0,
    validation_target_regressed: 0,
    validation_same_unit_regression: 0,
    validation_failed: 0,
    validation_skipped: 0,
    cancelled: 0,
    finished: 0,
    unknown_error: 0,
  };
}

export function reportCountsForReports(reports: JsonObject[]): Record<WorkerStateFilter, number> {
  const counts = emptyReportCounts();
  counts.all = reports.length;
  for (const report of reports) counts[reportOutcome(report)] += 1;
  return counts;
}

export function visibleReportFilters(counts: Record<WorkerStateFilter, number>, activeFilter: WorkerStateFilter): typeof reportFilters {
  return reportFilters.filter((option) => option.id === "all" || option.id === activeFilter || counts[option.id] > 0);
}

export function reportTotalCounts(dashboard: Dashboard | null, loadedCounts: Record<WorkerStateFilter, number>): Record<WorkerStateFilter, number> {
  const summary = asObject(dashboard?.runSummary);
  const outcomeCounts = asObject(summary.workerStateOutcomeCounts);
  const counts = { ...loadedCounts };
  for (const id of reportFilterIds) {
    const sourceValue = id === "all" ? outcomeCounts.all ?? summary.totalWorkerStates : outcomeCounts[id];
    const parsed = Number(sourceValue);
    if (Number.isFinite(parsed)) counts[id] = parsed;
  }
  return counts;
}

export function reportWindowText(filter: WorkerStateFilter, loadedCounts: Record<WorkerStateFilter, number>, totalCounts: Record<WorkerStateFilter, number>, loadedAll: boolean): string {
  const loadedForFilter = loadedCounts[filter];
  const totalForFilter = totalCounts[filter];
  if (filter === "all") {
    if (loadedAll && loadedForFilter >= totalForFilter) return `${num(totalForFilter)} worker states loaded`;
    return `${num(loadedForFilter)}/${num(totalForFilter)} worker states recent`;
  }
  if (loadedAll && loadedForFilter >= totalForFilter) return `${num(totalForFilter)} matching worker states loaded`;
  return `${num(loadedForFilter)}/${num(totalForFilter)} matching worker states in ${loadedAll ? "loaded set" : `recent ${num(loadedCounts.all)}`}`;
}

export function pageReportText(filter: WorkerStateFilter, loadedCounts: Record<WorkerStateFilter, number>, totalCounts: Record<WorkerStateFilter, number>): string {
  const loadedForFilter = loadedCounts[filter];
  const totalForFilter = totalCounts[filter];
  if (loadedForFilter === totalForFilter) return `${num(loadedForFilter)} worker states`;
  return `${num(loadedForFilter)}/${num(totalForFilter)} shown`;
}

export function reportBorderClass(report: JsonObject): string {
  const outcome = reportOutcome(report);
  if (outcome === "agent_tool_error" || outcome === "worker_session_failed" || outcome === "unknown_error") return "border-l-down";
  if (outcome === "provider_error") return "border-l-warn";
  if (outcome.startsWith("validation_")) return "border-l-warn";
  if (outcome.startsWith("timeout_") || outcome.endsWith("_budget_exhausted") || outcome === "claim_deadline") return "border-l-purple";
  if (outcome.startsWith("recovered_")) return "border-l-warn";
  if (outcome === "cancelled") return "border-l-purple";
  if (outcome === "exact") return "border-l-up";
  if (outcome === "finished" || outcome === "accepted_or_no_repair_reasons") return "border-l-cyan";
  return "border-l-purple";
}

export function reportFinishLabel(report: JsonObject): string {
  const outcome = reportOutcome(report);
  if (outcome === "running") return "running";
  if (outcome === "exact") return "exact";
  if (outcome === "timeout_selected_checkpoint") return "timeout: checkpoint";
  if (outcome === "timeout_baseline") return "timeout: baseline";
  if (outcome === "claim_deadline") return "claim deadline";
  if (outcome === "cold_attempt_budget_exhausted") return "cold budget";
  if (outcome === "improvement_followup_budget_exhausted") return "improvement tail";
  if (outcome === "gate_failed_exact_followup_budget_exhausted") return "gate-exact tail";
  if (outcome === "accepted_or_no_repair_reasons") return "no repair reasons";
  if (outcome === "dry_run") return "dry run";
  if (outcome === "recovered_requeued") return "recovered: requeued";
  if (outcome === "recovered_finished") return "recovered: retained";
  if (outcome === "provider_error") return "provider error";
  if (outcome === "worker_session_failed") return "session failed";
  if (outcome === "agent_tool_error") return "agent tool error";
  if (outcome === "validation_qa_lint_failed") return "QA lint failed";
  if (outcome === "validation_build_failed") return "build failed";
  if (outcome === "validation_snapshot_unavailable") return "snapshot missing";
  if (outcome === "validation_no_official_score_change") return "no score change";
  if (outcome === "validation_target_regressed") return "target regressed";
  if (outcome === "validation_same_unit_regression") return "unit regression";
  if (outcome === "validation_failed") return "validation failed";
  if (outcome === "validation_skipped") return "validation skipped";
  if (outcome === "cancelled") return "cancelled";
  if (outcome === "finished") return "finished";
  return "unknown error";
}

export function reportOutcomeDescription(report: JsonObject): string {
  const outcome = reportOutcome(report);
  if (outcome === "running") return "Running: this worker state has not closed yet.";
  if (outcome === "exact") return "Exact: the runner accepted an exact checkpoint.";
  if (outcome === "timeout_selected_checkpoint") return "Timeout: the runner closed at the timeout boundary and retained a selected checkpoint.";
  if (outcome === "timeout_baseline") return "Timeout: the runner closed at the timeout boundary with no selected checkpoint.";
  if (outcome === "claim_deadline") return "Claim Deadline: repair/continuation stopped because the claim deadline was reached.";
  if (outcome === "cold_attempt_budget_exhausted") return "Cold Budget: no selectable checkpoint was found before the cold-attempt budget ran out.";
  if (outcome === "improvement_followup_budget_exhausted") return "Improvement Tail: follow-up attempts after the best checkpoint were exhausted.";
  if (outcome === "gate_failed_exact_followup_budget_exhausted") return "Gate-Exact Tail: an exact-scoring attempt failed gates and its repair tail was exhausted.";
  if (outcome === "accepted_or_no_repair_reasons") return "No Repair Reasons: the runner stopped because it had no repair reasons to continue with.";
  if (outcome === "dry_run") return "Dry Run: the worker stopped at the dry-run boundary.";
  if (outcome === "recovered_requeued") return "Recovered: an interrupted active worker was closed and its target was requeued.";
  if (outcome === "recovered_finished") return "Recovered: an interrupted active worker was closed with selectable evidence retained.";
  if (outcome === "provider_error") return "Provider Error: the LLM provider failed before the target was really attempted; worker spawns paused until a provider probe succeeded.";
  if (outcome === "worker_session_failed") return "Session Failed: the Pi worker session failed before a validation-ready response was available.";
  if (outcome === "agent_tool_error") return "Agent Tool Error: the worker explicitly reported a tool/build/validation failure as terminal.";
  if (outcome === "validation_qa_lint_failed") return "QA Lint Failed: runner validation found QA findings that required repair.";
  if (outcome === "validation_build_failed") return "Build Failed: runner validation could not build the worker's object target.";
  if (outcome === "validation_snapshot_unavailable") return "Snapshot Missing: runner validation could not obtain comparable score snapshots.";
  if (outcome === "validation_no_official_score_change") return "No Score Change: runner validation found no official target score movement.";
  if (outcome === "validation_target_regressed") return "Target Regressed: runner validation found the target score moved backward.";
  if (outcome === "validation_same_unit_regression") return "Unit Regression: runner validation found a same-unit regression.";
  if (outcome === "validation_failed") return "Validation Failed: runner hard gates failed without a more specific validation status.";
  if (outcome === "validation_skipped") return "Validation Skipped: runner validation was skipped.";
  if (outcome === "cancelled") return "Cancelled: the worker state was cancelled before completion.";
  if (outcome === "finished") return "Finished: legacy worker state closed without a more specific terminal reason.";
  return "Unknown Error: the worker state closed as an error without a known error kind.";
}

export function stopReasonLabel(value: StopReason): string {
  if (value === "target_complete") return "target complete";
  return "stalled";
}

export function compactValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (value == null) return "";
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function statusText(report: JsonObject): string {
  const gate = asObject(report.acceptanceGate);
  const validation = asObject(report.runnerValidation);
  const accepted = gate.accepted === false ? "gate failed" : gate.accepted === true ? "accepted" : "";
  const runner = text(validation.status);
  return [accepted, runner ? `validation ${runner}` : ""].filter(Boolean).join(" / ") || "-";
}

export function reasonLines(report: JsonObject): string[] {
  const gate = asObject(report.acceptanceGate);
  const validation = asObject(report.runnerValidation);
  const error = asObject(report.error);
  return [
    ...asArray(error.reasons),
    text(error.summary || error.kind),
    ...asArray(gate.reasons),
    ...asArray(validation.reasons),
  ]
    .map((item) => text(item))
    .filter(Boolean);
}

export function attemptScoreText(attempt: JsonObject): string {
  const percent = attemptLooksPercent(attempt);
  return `${percent ? "pct" : "local"} ${scoreOrPercent(attempt.oldScore, percent)} -> ${scoreOrPercent(attempt.newScore, percent)} (${delta(attempt.delta)})`;
}

export function modelAttemptBuildLabel(attempt: JsonObject): { label: string; className: string; title: string } {
  if (attempt.compiled === true) {
    return { label: "compiled", className: "text-up", title: "The model reported this attempt as compiled." };
  }
  return {
    label: "model note",
    className: "text-dim",
    title: "Model-authored attempt description without runner-owned build evidence. See Runner Validation for deterministic build results.",
  };
}

export function runnerAttemptBuildLabel(attempt: JsonObject): { label: string; className: string } {
  if (attempt.compiled === true) return { label: "compiled", className: "text-up" };
  if (text(attempt.status) === "build_failed") return { label: "build failed", className: "text-down" };
  return { label: "no build", className: "text-dim" };
}

export function runnerAttemptScoreText(attempt: JsonObject): string {
  const oldScore = attemptNumber(attempt.oldScore, NaN);
  const newScore = attemptNumber(attempt.newScore, NaN);
  if (!Number.isFinite(oldScore) && !Number.isFinite(newScore)) return "-";
  return `pct ${scoreOrPercent(attempt.oldScore, true)} -> ${scoreOrPercent(attempt.newScore, true)} (${delta(attempt.delta)})`;
}

export function traceEventTone(eventType: string): string {
  if (eventType === "runner_validation_passed" || eventType === "report_recorded") return "text-up";
  if (eventType === "runner_validation_rejected" || eventType === "repair_requested") return "text-warn";
  if (eventType === "acceptance_gate") return "text-soft";
  return "text-dim";
}

export function traceEventLabel(event: JsonObject): string {
  const attemptIndex = Number(event.attemptIndex);
  const eventType = text(event.eventType).replace(/_/g, " ");
  return Number.isFinite(attemptIndex) ? `a${attemptIndex} ${eventType}` : eventType;
}

export function traceScoreText(event: JsonObject): string {
  const score = asObject(event.score);
  const before = Number(score.before);
  const after = Number(score.after);
  if (!Number.isFinite(before) && !Number.isFinite(after)) {
    const baseline = asObject(event.baseline);
    const baselineScore = Number(baseline.score);
    return Number.isFinite(baselineScore) ? `baseline ${scoreOrPercent(baseline.score, true)}` : "";
  }
  return `${scoreOrPercent(score.before, true)} -> ${scoreOrPercent(score.after, true)}${score.exact === true ? " (exact)" : ""}`;
}
