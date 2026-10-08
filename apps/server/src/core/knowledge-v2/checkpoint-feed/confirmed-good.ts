// Confirmed-good selection for the librarian feed (plan §6.8 rules 1–5, owner
// D1, A3-F5, A3-F6). Every confirmed-good checkpoint qualifies, whatever its
// adjudication mode or advisories. Evidence that is missing, unreadable or
// malformed never confirms: the decision fails closed.
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import type { JsonObject } from "@server/core/harness-state/events.js";
import type { StateStore } from "@server/core/orchestrator-state";

import {
  PERCENT_METRICS,
  validateReportChanges,
  type ReportMetrics,
  type ReportRow,
  type ValidatedReportChanges,
} from "./report-schema.js";

/** "bisect" when the confirmation pass ran for the checkpoint's epoch (rule 5), else "epoch-settled". */
export type ConfirmationSource = "bisect" | "epoch-settled";
export type ConfirmedGoodRule = 1 | 2 | 3 | 4 | 5;

export interface CheckpointTarget {
  /** `unit::function`, as the epoch target names it. */
  key: string;
  unit: string;
  function: string;
  sourcePath: string | null;
}

export interface ConfirmedCheckpoint {
  checkpointId: string;
  integrationId: string;
  epochId: string;
  runId: string;
  workerStateId: string;
  integratedRev: string;
  savePointId: string;
  savePointCommit: string;
  reportChangesPath: string;
  reportChangesSha256: string;
  confirmation: ConfirmationSource;
  target: CheckpointTarget;
  scores: { old: number | null; new: number | null; exact: boolean };
  patchPath: string | null;
  runnerSummaryPath: string | null;
  metadata: Record<string, unknown>;
}

export type ConfirmedGoodVerdict =
  | { confirmed: true; checkpoint: ConfirmedCheckpoint }
  | { confirmed: false; rule: ConfirmedGoodRule; reason: string; detail?: JsonObject };

export interface ConfirmedGoodDeps {
  /** The game repository the integrations were committed to. */
  repoRoot: string;
  /** `git merge-base --is-ancestor`; null when ancestry cannot be checked. */
  isAncestor?: (repoRoot: string, ancestor: string, descendant: string) => Promise<boolean | null>;
}

// ── rule 4: the frozen report ─────────────────────────────────────────────────

export type RegressionEvidence =
  | { status: "ok"; path: string; sha256: string; report: ValidatedReportChanges }
  | { status: "evidence-missing"; path: string | null; error: string }
  | { status: "evidence-invalid"; path: string; sha256: string; issues: string[] };

export function sha256Hex(bytes: Uint8Array | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/** Reads, hashes and validates the frozen `report_changes.json` of one epoch. */
export async function readRegressionEvidence(path: string | null): Promise<RegressionEvidence> {
  if (!path) return { status: "evidence-missing", path: null, error: "the save point records no report_changes_path" };
  let bytes: Buffer;
  try {
    bytes = await readFile(path);
  } catch (cause) {
    return { status: "evidence-missing", path, error: cause instanceof Error ? cause.message : String(cause) };
  }
  const sha256 = sha256Hex(bytes);
  let parsed: unknown;
  try {
    parsed = JSON.parse(bytes.toString("utf8"));
  } catch {
    return { status: "evidence-invalid", path, sha256, issues: ["report is not valid JSON"] };
  }
  const validation = validateReportChanges(parsed);
  return validation.ok
    ? { status: "ok", path, sha256, report: validation.report }
    : { status: "evidence-invalid", path, sha256, issues: validation.issues };
}

export interface MetricDecrease {
  kind: "unit" | "section" | "function";
  row: string;
  /** A quality metric, or "row" when a row present in `from` is missing from `to`. */
  metric: string;
  from: string;
  /** Null when the metric (or the whole row) is absent from `to`. */
  to: string | null;
}

export type TargetClassification =
  | { status: "no-decrease" }
  | { status: "decrease"; decreases: MetricDecrease[] }
  | { status: "unit-missing" };

/** Quality byte counts; `size` is not a quality metric and is never compared. */
const QUALITY_BYTES = ["matched_code", "matched_data"] as const;

function rowDecreases(row: ReportRow, kind: MetricDecrease["kind"]): MetricDecrease[] {
  const from = row.from;
  if (from === null) return [];
  if (row.to === null) return [{ kind, row: row.name, metric: "row", from: "present", to: null }];
  const to: ReportMetrics = row.to;
  const decreases: MetricDecrease[] = [];
  for (const metric of PERCENT_METRICS) {
    const before = from.percents[metric];
    if (before === undefined) continue;
    const after = to.percents[metric];
    if (after === undefined || after < before) {
      decreases.push({ kind, row: row.name, metric, from: String(before), to: after === undefined ? null : String(after) });
    }
  }
  for (const metric of QUALITY_BYTES) {
    const before = from.bytes[metric];
    if (before === undefined) continue;
    const after = to.bytes[metric];
    if (after === undefined || after < before) {
      decreases.push({ kind, row: row.name, metric, from: before.toString(), to: after === undefined ? null : after.toString() });
    }
  }
  return decreases;
}

/** `unit::function` split at the first `::`; null when either side is empty. */
export function splitTargetKey(key: string): { unit: string; function: string } | null {
  const at = key.indexOf("::");
  if (at <= 0 || at + 2 >= key.length) return null;
  return { unit: key.slice(0, at), function: key.slice(at + 2) };
}

/**
 * Classifies a target from the raw rows of its unit, sections included (the
 * parsed regression arrays skip `.text`): the target's function row, every
 * section row and the unit row itself. Any quality metric lower in `to` than
 * in `from`, absent from `to`, or a row missing from `to` is a decrease. A
 * function row the report does not list did not change.
 */
export function classifyTarget(report: ValidatedReportChanges, target: { unit: string; function: string }): TargetClassification {
  const units = report.units.filter((unit) => unit.name === target.unit);
  if (units.length === 0) return { status: "unit-missing" };
  const decreases: MetricDecrease[] = [];
  for (const unit of units) {
    decreases.push(...rowDecreases(unit, "unit"));
    for (const section of unit.sections) decreases.push(...rowDecreases(section, "section"));
    for (const fn of unit.functions) {
      if (fn.name === target.function) decreases.push(...rowDecreases(fn, "function"));
    }
  }
  return decreases.length > 0 ? { status: "decrease", decreases } : { status: "no-decrease" };
}

// ── rule 3: ancestry ──────────────────────────────────────────────────────────

const COMMIT_SHA = /^[0-9a-f]{7,64}$/i;

/** `git merge-base --is-ancestor`: true on exit 0, false on exit 1, null otherwise (unknown commit, no repo). */
export async function gitIsAncestor(repoRoot: string, ancestor: string, descendant: string): Promise<boolean | null> {
  if (!COMMIT_SHA.test(ancestor) || !COMMIT_SHA.test(descendant)) return null;
  try {
    const proc = Bun.spawn(["git", "-C", repoRoot, "merge-base", "--is-ancestor", ancestor, descendant], {
      stdout: "ignore",
      stderr: "ignore",
    });
    const exitCode = await proc.exited;
    return exitCode === 0 ? true : exitCode === 1 ? false : null;
  } catch {
    return null;
  }
}

// ── the evaluation ────────────────────────────────────────────────────────────

interface CheckpointRow {
  id: string;
  run_id: string;
  worker_state_id: string;
  old_score: number | null;
  new_score: number | null;
  exact_match: number;
  validation_state: string;
  patch_path: string | null;
  artifact_path: string | null;
  metadata_json: string;
  et_target_key: string | null;
  et_unit: string | null;
  et_symbol: string | null;
  source_path: string | null;
  ws_target_key: string | null;
}

interface IntegrationRow {
  id: string;
  epoch_id: string;
  status: string;
  target_key: string | null;
  metadata_json: string;
}

interface EpochRow {
  status: string;
  closed_at: string | null;
}

interface SavePointRow {
  id: string;
  commit_sha: string | null;
  report_changes_path: string | null;
}

function jsonObject(text: string | null | undefined): Record<string, unknown> {
  if (!text) return {};
  try {
    const value = JSON.parse(text) as unknown;
    return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function confirmationState(metadata: Record<string, unknown>): string | null {
  const confirmation = metadata.confirmation;
  if (typeof confirmation !== "object" || confirmation === null) return null;
  const state = (confirmation as Record<string, unknown>).validation_state;
  return typeof state === "string" ? state : null;
}

/** "not-run" covers both a disabled pass and one that only waited for a rolling baseline. */
export type ConfirmationPassStatus = "ran" | "not-run" | "unknown";

export interface ConfirmationPassRecord {
  status: ConfirmationPassStatus;
  /** The record that decided it; null when nothing was recorded. */
  source: "save-point" | "progress" | "settled-evidence" | null;
}

interface ConfirmationEvidenceRow {
  save_point_status: string | null;
  progress_ran: number;
  progress_skipped: number;
  settled_ran: number;
  settled_without_pass: number;
}

/**
 * What the epoch's settlement recorded about the confirmation pass:
 * - `save_points.payload_json.confirmation_pass.status` (`ran`, `skipped`,
 *   `disabled`), when the settlement writes it;
 * - the settlement's `confirmation_pass` progress, labelled `epoch-<ordinal>`
 *   in the epoch's run: `started`, `finished` or `warning` (an unattributed
 *   pass, which leaves checkpoints tentative and writes no checkpoint
 *   metadata) mean it ran; `skipped` means it only waited for a baseline;
 * - the settled-evidence record of the epoch: its settlement result carries
 *   `confirmation` exactly when the pass ran, so a result without it means
 *   the pass was disabled or skipped.
 * Any record that the pass ran wins. With no record at all the status is
 * `unknown`, which selection treats as missing evidence (fail closed).
 */
export function confirmationPassStatus(store: StateStore, epochId: string): ConfirmationPassRecord {
  const row = store.db.query<ConfirmationEvidenceRow, [string, string]>(`
    SELECT
      (SELECT CASE WHEN json_valid(sp.payload_json) THEN json_extract(sp.payload_json, '$.confirmation_pass.status') END
        FROM save_points sp WHERE sp.id = 'epoch-save-point-' || e.id) AS save_point_status,
      EXISTS (SELECT 1 FROM events ev
        WHERE ev.run_id = e.run_id AND ev.event_type = 'epoch_checkpoint_progress' AND json_valid(ev.payload_json)
          AND json_extract(ev.payload_json, '$.phase') = 'confirmation_pass'
          AND json_extract(ev.payload_json, '$.label') = 'epoch-' || e.ordinal
          AND json_extract(ev.payload_json, '$.status') IN ('started', 'finished', 'warning')) AS progress_ran,
      EXISTS (SELECT 1 FROM events ev
        WHERE ev.run_id = e.run_id AND ev.event_type = 'epoch_checkpoint_progress' AND json_valid(ev.payload_json)
          AND json_extract(ev.payload_json, '$.phase') = 'confirmation_pass'
          AND json_extract(ev.payload_json, '$.label') = 'epoch-' || e.ordinal
          AND json_extract(ev.payload_json, '$.status') = 'skipped') AS progress_skipped,
      EXISTS (SELECT 1 FROM events ev
        WHERE ev.run_id = e.run_id AND ev.event_type = 'epoch_checkpoint_progress' AND json_valid(ev.payload_json)
          AND json_extract(ev.payload_json, '$.phase') = 'epoch_settled_evidence'
          AND json_extract(ev.payload_json, '$.epoch_id') = ?2
          AND COALESCE(json_extract(ev.payload_json, '$.result.confirmation.status'), 'disabled') <> 'disabled') AS settled_ran,
      EXISTS (SELECT 1 FROM events ev
        WHERE ev.run_id = e.run_id AND ev.event_type = 'epoch_checkpoint_progress' AND json_valid(ev.payload_json)
          AND json_extract(ev.payload_json, '$.phase') = 'epoch_settled_evidence'
          AND json_extract(ev.payload_json, '$.epoch_id') = ?2
          AND json_type(ev.payload_json, '$.result') = 'object'
          AND json_type(ev.payload_json, '$.result.confirmation') IS NULL) AS settled_without_pass
    FROM epochs e WHERE e.id = ?1`).get(epochId, epochId);
  if (!row) return { status: "unknown", source: null };
  if (row.save_point_status === "ran") return { status: "ran", source: "save-point" };
  if (Number(row.progress_ran) === 1) return { status: "ran", source: "progress" };
  if (Number(row.settled_ran) === 1) return { status: "ran", source: "settled-evidence" };
  if (row.save_point_status === "disabled" || row.save_point_status === "skipped") return { status: "not-run", source: "save-point" };
  if (Number(row.progress_skipped) === 1) return { status: "not-run", source: "progress" };
  if (Number(row.settled_without_pass) === 1) return { status: "not-run", source: "settled-evidence" };
  return { status: "unknown", source: null };
}

function targetOf(row: CheckpointRow, integration: IntegrationRow): CheckpointTarget | null {
  if (row.et_target_key && row.et_unit && row.et_symbol) {
    return { key: row.et_target_key, unit: row.et_unit, function: row.et_symbol, sourcePath: row.source_path };
  }
  const key = integration.target_key ?? row.ws_target_key;
  const split = key ? splitTargetKey(key) : null;
  return key && split ? { key, ...split, sourcePath: row.source_path } : null;
}

function notConfirmed(rule: ConfirmedGoodRule, reason: string, detail?: JsonObject): ConfirmedGoodVerdict {
  return { confirmed: false, rule, reason, ...(detail ? { detail } : {}) };
}

/**
 * Evaluates rules 1–5 of §6.8 for one checkpoint. Reads stored rows only, so
 * fresh and reconciled settlements look the same and Sync is never consulted.
 * Rule 4 reads the epoch's frozen report: a missing or unreadable file is
 * `evidence-missing` and a report that does not validate (or has no unit for
 * the target) is `evidence-invalid`, for every checkpoint of the epoch.
 */
export async function evaluateConfirmedGood(
  store: StateStore,
  checkpointId: string,
  deps: ConfirmedGoodDeps,
): Promise<ConfirmedGoodVerdict> {
  const row = store.db.query<CheckpointRow, [string]>(`
    SELECT c.id, c.run_id, c.worker_state_id, c.old_score, c.new_score, c.exact_match, c.validation_state,
      c.patch_path, c.artifact_path, c.metadata_json,
      et.target_key AS et_target_key, et.unit AS et_unit, et.symbol AS et_symbol, et.source_path,
      ws.target_key AS ws_target_key
    FROM worker_checkpoints c
    LEFT JOIN epoch_targets et ON et.id = c.epoch_target_id
    LEFT JOIN worker_state ws ON ws.id = c.worker_state_id
    WHERE c.id = ?`).get(checkpointId);
  if (!row) return notConfirmed(1, "checkpoint-missing");

  // Rule 1: an applied (or resolved) integration with its integrated revision.
  const integration = store.db.query<IntegrationRow, [string]>(`
    SELECT id, epoch_id, status, target_key, metadata_json
    FROM integration_outcomes WHERE worker_checkpoint_id = ?`).get(checkpointId);
  if (!integration) return notConfirmed(1, "integration-missing");
  if (integration.status !== "applied" && integration.status !== "resolved") {
    return notConfirmed(1, "integration-not-applied", { status: integration.status });
  }
  const integrationMetadata = jsonObject(integration.metadata_json);
  const integratedRev = typeof integrationMetadata.integrated_rev === "string" ? integrationMetadata.integrated_rev.trim() : "";
  if (!integratedRev) return notConfirmed(1, "integrated-rev-missing");

  // Rule 2: the epoch settled — completed, closed, with its save point.
  const epochId = integration.epoch_id;
  const epoch = store.db.query<EpochRow, [string]>("SELECT status, closed_at FROM epochs WHERE id = ?").get(epochId);
  if (!epoch || epoch.status !== "completed" || !epoch.closed_at) {
    return notConfirmed(2, "epoch-not-settled", { epoch_id: epochId, status: epoch?.status ?? null });
  }
  const savePoint = store.db.query<SavePointRow, [string]>(
    "SELECT id, commit_sha, report_changes_path FROM save_points WHERE id = ?",
  ).get(`epoch-save-point-${epochId}`);
  if (!savePoint) return notConfirmed(2, "save-point-missing", { epoch_id: epochId });

  // Rule 3: the integrated revision is in the save point's integration commit.
  const savePointCommit = savePoint.commit_sha?.trim() ?? "";
  const ancestor = savePointCommit
    ? await (deps.isAncestor ?? gitIsAncestor)(deps.repoRoot, integratedRev, savePointCommit)
    : null;
  if (ancestor === null) {
    return notConfirmed(3, "ancestry-unverifiable", { integrated_rev: integratedRev, save_point_commit: savePointCommit || null });
  }
  if (!ancestor) return notConfirmed(3, "not-ancestor", { integrated_rev: integratedRev, save_point_commit: savePointCommit });

  // Rule 4: no decrease in the target's unit, from the frozen report's raw rows.
  const reportPath = savePoint.report_changes_path ? resolve(deps.repoRoot, savePoint.report_changes_path) : null;
  const evidence = await readRegressionEvidence(reportPath);
  if (evidence.status === "evidence-missing") {
    return notConfirmed(4, "evidence-missing", { report_changes_path: evidence.path, error: evidence.error });
  }
  if (evidence.status === "evidence-invalid") {
    return notConfirmed(4, "evidence-invalid", { report_changes_sha256: evidence.sha256, issues: evidence.issues.slice(0, 10) });
  }
  const target = targetOf(row, integration);
  if (!target) return notConfirmed(4, "evidence-invalid", { report_changes_sha256: evidence.sha256, issues: ["checkpoint has no target key"] });
  const classified = classifyTarget(evidence.report, target);
  if (classified.status === "unit-missing") {
    return notConfirmed(4, "evidence-invalid", {
      report_changes_sha256: evidence.sha256,
      issues: [`report has no unit ${target.unit}`],
    });
  }
  if (classified.status === "decrease") {
    return notConfirmed(4, "regressed", {
      report_changes_sha256: evidence.sha256,
      decreases: classified.decreases.slice(0, 10).map((decrease) => ({ ...decrease })),
    });
  }

  // Rule 5: when the confirmation pass ran for the epoch, worker_checkpoints.validation_state must be
  // "confirmed". Any recorded pass state of the checkpoint or its integration also counts as a run
  // (fail closed), and every recorded state must agree. A checkpoint the pass confirmed satisfies the
  // rule whatever the epoch recorded; any other checkpoint needs the epoch's record that the pass did
  // not run, and with no record at all it is not confirmed.
  const metadata = jsonObject(row.metadata_json);
  const recordedStates = [confirmationState(metadata), confirmationState(integrationMetadata)]
    .filter((state): state is string => state !== null);
  const pass = confirmationPassStatus(store, epochId);
  const confirmedByPass = row.validation_state === "confirmed" && recordedStates.every((state) => state === "confirmed");
  const passRan = pass.status === "ran" || row.validation_state !== "tentative" || recordedStates.length > 0;
  if (passRan && !confirmedByPass) {
    return notConfirmed(5, "not-confirmed-by-confirmation-pass", {
      validation_state: row.validation_state,
      recorded_states: recordedStates,
      epoch_confirmation: pass.status,
    });
  }
  if (!passRan && pass.status === "unknown") {
    return notConfirmed(5, "confirmation-status-unknown", { epoch_id: epochId });
  }

  return {
    confirmed: true,
    checkpoint: {
      checkpointId,
      integrationId: integration.id,
      epochId,
      runId: row.run_id,
      workerStateId: row.worker_state_id,
      integratedRev,
      savePointId: savePoint.id,
      savePointCommit,
      reportChangesPath: evidence.path,
      reportChangesSha256: evidence.sha256,
      confirmation: passRan ? "bisect" : "epoch-settled",
      target,
      scores: { old: row.old_score, new: row.new_score, exact: Number(row.exact_match) === 1 },
      patchPath: row.patch_path,
      runnerSummaryPath: row.artifact_path,
      metadata,
    },
  };
}
