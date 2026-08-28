import type { Database } from "bun:sqlite";

export type BoundaryStepState = "pending" | "running" | "done" | "warning" | "failed" | "skipped";

export interface BoundaryStep {
  key: string;
  state: BoundaryStepState;
  startedAt: string | null;
  finishedAt: string | null;
  durationMs: number | null;
  detail: string | null;
  payload: Record<string, unknown> | null;
}

export interface BoundaryAttempt {
  attempt: number;
  reconciled: boolean;
  startedAt: string | null;
  finishedAt: string | null;
  steps: BoundaryStep[];
  error: string | null;
}

export interface BoundaryView {
  epochId: string;
  ordinal: number;
  epochStatus: string;
  boundaryStatus: string | null;
  admittedCount: number;
  finishedCount: number;
  active: boolean;
  attempts: BoundaryAttempt[];
  savePointId: string | null;
  matchedCodePercent: number | null;
  nextEpoch: { ordinal: number; admitted: number } | null;
}

export interface BoundaryDashboard {
  current: BoundaryView | null;
  recent: BoundaryView[];
}

export const BOUNDARY_STEP_KEYS = [
  "integration_drain", "snapshot_commit", "worktree_prepare", "configure", "report_build", "report_read",
  "confirmation_pass", "qa_scan", "report_publish", "regression_repair", "save_point", "boundary_sync",
  "master_breakage_gate", "ci_parity_gate", "pre_commit_gate", "draft_pr_publish", "knowledge_maintenance",
  "typed_close", "admission",
] as const;

export interface BoundaryEpochRow {
  id: string;
  ordinal: number;
  status: string;
  admitted_count: number;
  finished_count: number;
  boundary_status: string | null;
  created_at: string;
  closed_at: string | null;
}

export interface BoundaryEventRow {
  id?: string;
  event_type: string;
  payload_json: string;
  created_at: string;
}

export interface BoundarySavePointRow {
  id: string;
  trigger_kind: string;
  matched_code_percent: number | null;
  payload_json: string;
  created_at: string;
}

export interface BoundaryGameEventRow {
  event_type: string;
  payload_json: string;
  occurred_at: string;
}

export interface BoundaryProjectionRows {
  epochs: BoundaryEpochRow[];
  events: BoundaryEventRow[];
  savePoints: BoundarySavePointRow[];
  gameEvents: BoundaryGameEventRow[];
  now?: string | number | Date;
}

const EVENT_TYPES = [
  "epoch_started", "epoch_finished", "epoch_checkpoint_progress", "boundary_breakage_gate", "ci_parity_gate",
  "epoch_regression_pause", "epoch_full_refresh_started", "epoch_full_refresh_finished", "epoch_admitted",
  "epoch_cycle_error", "boundary_sync", "epoch_boundary_reconciled", "draft_pr_publish",
] as const;

function objectFromJson(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function count(value: unknown): number {
  return Array.isArray(value) ? value.length : 0;
}

function firstLine(value: unknown): string | null {
  const line = Array.isArray(value) ? text(value[0]) : text(value);
  return line ? line.split("\n", 1)[0]!.slice(0, 500) : null;
}

function firstMatchingReason(value: unknown, matches: (reason: string) => boolean): string | null {
  if (!Array.isArray(value)) return null;
  const reason = value.find((candidate) => typeof candidate === "string" && matches(candidate));
  return firstLine(reason);
}

function emptySteps(): BoundaryStep[] {
  return BOUNDARY_STEP_KEYS.map((key) => ({ key, state: "pending", startedAt: null, finishedAt: null, durationMs: null, detail: null, payload: null }));
}

function finishStep(step: BoundaryStep, state: BoundaryStepState, at: string, detail: string | null, payload: Record<string, unknown> | null): void {
  step.state = state;
  step.finishedAt = at;
  step.detail = detail;
  step.payload = payload;
  const start = step.startedAt ? Date.parse(step.startedAt) : NaN;
  const finish = Date.parse(at);
  step.durationMs = Number.isFinite(start) && Number.isFinite(finish) ? Math.max(0, finish - start) : null;
}

function checkpointDetail(key: string, payload: Record<string, unknown>): string | null {
  if (key === "qa_scan") return `${Number(payload.qa_errors ?? 0)} errors / ${Number(payload.qa_warnings ?? 0)} warnings`;
  if (key === "regression_repair") {
    const regressions = payload.regressions as Record<string, unknown> | undefined;
    const repair = payload.repair as Record<string, unknown> | undefined;
    const paused = payload.paused === true || repair?.paused === true;
    const rows = Number(payload.rows ?? regressions?.regressedFunctions ?? regressions?.regressed_functions ?? 0);
    return paused ? `paused: ${rows} rows ≥ threshold` : `requeued ${Number(payload.requeued ?? repair?.requeued ?? 0)}`;
  }
  return firstLine(payload.message);
}

function applyStatus(step: BoundaryStep, payload: Record<string, unknown>, at: string): void {
  const status = text(payload.status);
  if (status === "started") {
    step.state = "running";
    step.startedAt = at;
    step.finishedAt = null;
    step.durationMs = null;
    step.detail = checkpointDetail(step.key, payload);
    step.payload = payload;
    return;
  }
  if (!status || !["finished", "warning", "skipped", "failed"].includes(status)) return;
  let state: BoundaryStepState = status === "warning" ? "warning" : status === "skipped" ? "skipped" : status === "failed" ? "failed" : "done";
  if (step.key === "qa_scan" && text(payload.qa_status) === "failed") state = "warning";
  if (step.key === "regression_repair" && (payload.paused === true || (payload.repair as Record<string, unknown> | undefined)?.paused === true)) state = "warning";
  finishStep(step, state, at, checkpointDetail(step.key, payload), payload);
}

function makeAttempt(events: BoundaryEventRow[], attempt: number, epoch: BoundaryEpochRow, reconciled = false): BoundaryAttempt {
  const steps = emptySteps();
  const byKey = new Map(steps.map((step) => [step.key, step]));
  let startedAt: string | null = null;
  let finishedAt: string | null = null;
  let error: string | null = null;

  for (const event of events) {
    const payload = objectFromJson(event.payload_json);
    if (event.event_type === "epoch_started") startedAt = event.created_at;
    if (event.event_type === "epoch_finished") finishedAt = event.created_at;
    if (event.event_type === "epoch_cycle_error" && (epoch.status === "error" || epoch.closed_at === null || Date.parse(event.created_at) <= Date.parse(epoch.closed_at))) {
      error = text(payload.error) || firstLine(payload.message);
    }
    if (event.event_type === "epoch_checkpoint_progress") {
      const step = byKey.get(text(payload.phase));
      if (step) {
        applyStatus(step, payload, event.created_at);
        if (payload.phase === "integration_drain" && payload.status === "started" && startedAt === null) startedAt = event.created_at;
      }
    }
    if (event.event_type === "boundary_sync") {
      const step = byKey.get("boundary_sync")!;
      applyStatus(step, payload, event.created_at);
      if (text(payload.status) !== "started") {
        const sha = text(payload.merge_commit_sha);
        const displaced = Number(payload.displaced_count ?? count(payload.displaced));
        step.detail = payload.drifted === false || text(payload.status) === "skipped" ? "no drift" : sha ? `merged ${sha.slice(0, 8)}, ${displaced} displaced` : step.detail;
        step.payload = { displaced: payload.displaced, anchor_before: payload.anchor_before, anchor_after: payload.anchor_after, merge_commit_sha: payload.merge_commit_sha };
      }
    }
    if (event.event_type === "boundary_breakage_gate") {
      const step = byKey.get("master_breakage_gate")!;
      const clean = payload.status === "clean";
      finishStep(step, clean ? "done" : "failed", event.created_at, clean ? `clean vs ${text(payload.baseline_sha).slice(0, 8)}` : `${count(payload.breakages)} breakages`, { breakages: payload.breakages, moved: payload.moved, reasons: payload.reasons });
    }
    if (event.event_type === "ci_parity_gate") {
      for (const [key, field] of [["ci_parity_gate", "ci_parity_status"], ["pre_commit_gate", "pre_commit_status"]] as const) {
        const status = text(payload[field]);
        const state: BoundaryStepState = status === "disabled" || status === "skipped" ? "skipped" : status === "failed" || status === "error" ? "failed" : "done";
        const detail = key === "pre_commit_gate"
          ? firstMatchingReason(payload.reasons, (reason) => reason.startsWith("pre-commit"))
          : ["passed", "passing", "clean", "success"].includes(status)
            ? "clean"
            : firstMatchingReason(payload.reasons, (reason) => !reason.startsWith("pre-commit"));
        finishStep(byKey.get(key)!, state, event.created_at, detail, { reasons: payload.reasons, steps: payload.steps });
      }
    }
    if (event.event_type === "epoch_regression_pause") {
      const step = byKey.get("regression_repair")!;
      const regressions = payload.regressions as Record<string, unknown> | undefined;
      finishStep(step, "warning", event.created_at, `paused: ${Number(regressions?.regressedFunctions ?? regressions?.regressed_functions ?? 0)} rows ≥ threshold`, payload);
    }
    if (event.event_type === "draft_pr_publish") {
      const step = byKey.get("draft_pr_publish")!;
      applyStatus(step, payload, event.created_at);
      if (text(payload.status) === "skipped") step.detail = text(payload.reason) || null;
      else if (text(payload.status) === "finished") step.detail = text(payload.pr_url) || (text(payload.head_sha) ? `published ${text(payload.head_sha).slice(0, 8)}` : null);
      else if (text(payload.status) === "failed") step.detail = firstLine(payload.error);
    }
    if ((event.event_type === "epoch_full_refresh_started" || event.event_type === "epoch_full_refresh_finished") && payload.lane === "full_boundary") {
      applyStatus(byKey.get("knowledge_maintenance")!, { ...payload, status: event.event_type.endsWith("started") ? "started" : "finished" }, event.created_at);
    }
  }
  if (reconciled) {
    let reconcileEvent: BoundaryEventRow | undefined;
    for (let index = events.length - 1; index >= 0; index -= 1) {
      if (events[index]!.event_type !== "epoch_boundary_reconciled") continue;
      reconcileEvent = events[index];
      break;
    }
    const reconcilePayload = reconcileEvent ? objectFromJson(reconcileEvent.payload_json) : {};
    const skippedSteps = Array.isArray(reconcilePayload.skipped_steps)
      ? reconcilePayload.skipped_steps.map(String)
      : BOUNDARY_STEP_KEYS.slice(1, 16);
    for (const key of skippedSteps) {
      if (byKey.has(key)) {
        finishStep(byKey.get(key)!, "skipped", reconcileEvent?.created_at ?? epoch.created_at, "reconciled: step skipped", null);
      }
    }
  }
  for (const [index, step] of steps.entries()) {
    if (step.state !== "running") continue;
    const laterActivity = steps.slice(index + 1)
      .flatMap((later) => [later.startedAt, later.finishedAt])
      .filter((at): at is string => at !== null)
      .sort((left, right) => Date.parse(left) - Date.parse(right))[0];
    if (laterActivity) finishStep(step, "done", laterActivity, step.detail, step.payload);
  }
  if (["completed", "paused", "error"].includes(epoch.status)) {
    for (const step of steps.filter((candidate) => candidate.state === "running")) {
      step.state = "warning";
      step.detail = `${step.detail ? `${step.detail} ` : ""}(no finish recorded)`;
    }
  }
  return { attempt, reconciled, startedAt, finishedAt, steps, error };
}

function partitionAttempts(events: BoundaryEventRow[], epoch: BoundaryEpochRow): BoundaryAttempt[] {
  const starts = events.flatMap((event, index) => {
    const payload = objectFromJson(event.payload_json);
    return event.event_type === "epoch_checkpoint_progress" && payload.phase === "integration_drain" && payload.status === "started" ? [index] : [];
  });
  const reconciledIndexes = events.flatMap((event, index) => event.event_type === "epoch_boundary_reconciled" ? [index] : []);
  if (starts.length === 0 && reconciledIndexes.length === 0 && events.length === 0) return [];
  const attempts: BoundaryAttempt[] = [];
  for (let index = 0; index < starts.length; index += 1) {
    const from = index === 0 ? 0 : starts[index]!;
    const to = starts[index + 1] ?? events.length;
    attempts.push(makeAttempt(events.slice(from, to), attempts.length + 1, epoch));
  }
  if (starts.length === 0 && reconciledIndexes.length === 0) attempts.push(makeAttempt(events, 1, epoch));
  for (let index = 0; index < reconciledIndexes.length; index += 1) {
    const from = reconciledIndexes[index]!;
    const to = reconciledIndexes[index + 1] ?? events.length;
    attempts.push(makeAttempt(events.slice(from, to), attempts.length + 1, epoch, true));
  }
  const sorted = attempts.sort((a, b) => Date.parse(a.startedAt ?? epoch.created_at) - Date.parse(b.startedAt ?? epoch.created_at)).map((attempt, index) => ({ ...attempt, attempt: index + 1 }));
  for (const attempt of sorted.slice(0, -1)) {
    if (!attempt.error) continue;
    for (const running of attempt.steps.filter((step) => step.state === "running")) running.state = "failed";
  }
  return sorted;
}

export function projectBoundaryDashboard(rows: BoundaryProjectionRows): BoundaryDashboard {
  const epochs = rows.epochs.filter((epoch) => !epoch.boundary_status?.startsWith("manual_discarded")).sort((a, b) => a.ordinal - b.ordinal);
  const views = epochs.flatMap((epoch, index) => {
    const nextCreatedAt = epochs[index + 1]?.created_at;
    const inWindow = (at: string) => at >= epoch.created_at && (!nextCreatedAt || at < nextCreatedAt);
    const epochEvents = rows.events.filter((event) => inWindow(event.created_at));
    const boundaryEvents = epochEvents.filter((event) => event.event_type !== "epoch_admitted" || Number(objectFromJson(event.payload_json).ordinal) !== epoch.ordinal);
    const attempts = partitionAttempts(boundaryEvents, epoch);
    if (attempts.length === 0) return [];
    const latest = attempts.at(-1)!;
    const close = latest.steps.find((step) => step.key === "typed_close")!;
    const admission = latest.steps.find((step) => step.key === "admission")!;
    const savePoint = rows.savePoints.filter((row) => row.trigger_kind === "epoch_finish" && inWindow(row.created_at)).at(-1) ?? null;
    const integrated = rows.gameEvents.some((event) => event.event_type === "run.epoch_integrated" && Number(objectFromJson(event.payload_json).ordinal) === epoch.ordinal);
    if (epoch.boundary_status === "success" || epoch.boundary_status === "regression_pause" || integrated) {
      finishStep(close, "done", epoch.closed_at ?? latest.finishedAt ?? epoch.created_at, `${epoch.boundary_status ?? "integrated"}${savePoint ? ` ${savePoint.id.slice(0, 8)}` : ""}`, null);
    } else if (epoch.status === "error") finishStep(close, "failed", epoch.closed_at ?? epoch.created_at, latest.error, null);
    const admittedEvent = rows.events.find((event) => {
      const payload = objectFromJson(event.payload_json);
      return event.event_type === "epoch_admitted" && Number(payload.ordinal) === epoch.ordinal + 1 && event.created_at >= epoch.created_at;
    });
    const admittedPayload = admittedEvent ? objectFromJson(admittedEvent.payload_json) : null;
    const nextEpoch = admittedPayload ? { ordinal: epoch.ordinal + 1, admitted: Number(admittedPayload.admitted ?? 0) } : null;
    if (admittedEvent && nextEpoch) finishStep(admission, "done", admittedEvent.created_at, `epoch ${nextEpoch.ordinal}: ${nextEpoch.admitted} targets`, admittedPayload);
    const hasRunning = latest.steps.some((step) => step.state === "running");
    const openCycle = latest.startedAt !== null && latest.finishedAt === null;
    const strandedError = epoch.status === "error" && latest.error !== null;
    const active = epoch.status === "active" && (hasRunning || openCycle);
    if (strandedError) {
      for (const running of latest.steps.filter((step) => step.state === "running")) running.state = "failed";
    }
    return [{ epochId: epoch.id, ordinal: epoch.ordinal, epochStatus: epoch.status, boundaryStatus: epoch.boundary_status, admittedCount: epoch.admitted_count, finishedCount: epoch.finished_count, active, attempts, savePointId: savePoint?.id ?? null, matchedCodePercent: savePoint?.matched_code_percent ?? null, nextEpoch } satisfies BoundaryView];
  });
  const now = new Date(rows.now ?? Date.now()).getTime();
  const newest = views.at(-1) ?? null;
  const current = [...views].reverse().find((view) => view.active)
    ?? (newest && ["error", "paused"].includes(newest.epochStatus) ? newest : null)
    ?? (newest && now - Date.parse(epochs.find((epoch) => epoch.id === newest.epochId)?.closed_at ?? "") <= 15 * 60_000 ? newest : null);
  const recent = views.filter((view) => view !== current && !view.active).reverse().slice(0, 3);
  return { current, recent };
}

export function boundaryDashboardForRun(db: Database, runId: string, now?: string | number | Date): BoundaryDashboard {
  if (!runId) return { current: null, recent: [] };
  const epochs = db.query(`SELECT id, ordinal, status, admitted_count, finished_count, boundary_status, created_at, closed_at FROM epochs WHERE run_id = ? AND (boundary_status IS NULL OR boundary_status NOT LIKE 'manual_discarded%') ORDER BY created_at ASC`).all(runId) as BoundaryEpochRow[];
  const placeholders = EVENT_TYPES.map(() => "?").join(",");
  const events = db.query(`SELECT id, event_type, payload_json, created_at FROM events WHERE run_id = ? AND event_type IN (${placeholders}) ORDER BY created_at ASC`).all(runId, ...EVENT_TYPES) as BoundaryEventRow[];
  const savePoints = db.query(`SELECT id, trigger_kind, matched_code_percent, payload_json, created_at FROM save_points WHERE run_id = ? ORDER BY created_at ASC`).all(runId) as BoundarySavePointRow[];
  const gameEvents = db.query(`SELECT event_type, payload_json, occurred_at FROM game_events WHERE subject_kind = 'run' AND subject_id = ? AND event_type = 'run.epoch_integrated' ORDER BY occurred_at ASC`).all(runId) as BoundaryGameEventRow[];
  return projectBoundaryDashboard({ epochs, events, savePoints, gameEvents, now });
}
