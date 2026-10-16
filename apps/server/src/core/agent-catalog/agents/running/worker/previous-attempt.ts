import { existsSync, readFileSync, statSync } from "node:fs";
import type { StateStore } from "@server/core/orchestrator-state";
import {
  latestSteeringBackfill,
  latestSteeringRollback,
  type SteeringBackfillRecord,
  type SteeringRollbackRecord,
} from "@server/core/harness-runtime/run-state/steering.js";
import {
  activeUnverifiedMatch,
  UNVERIFIED_MATCH_LABEL,
  UNVERIFIED_MATCH_STATE,
  type UnverifiedMatchRecord,
} from "@server/core/harness-runtime/run-state/unverified-matches.js";
import { readReviewRulings, type ReviewRuling } from "@server/core/knowledge-v2/steering-lessons/seed.js";

/**
 * `packet.previous_attempt`: what the steering backfill found for a function
 * an earlier worker took to 100% through steering edits, a dead UNUSED body
 * or an out-of-order fill. The worker context renders it as
 * `<previous_attempt>` inside the steering block so the next worker searches
 * for the real code instead of repeating the trick.
 *
 * Built at claim time from the function's latest `steering_rollbacks` event
 * (append-only, written by every `steering-gate --apply` that rewrote it),
 * else its `steering_backfill` row. The rollback event comes first because
 * the backfill row is the current certification: after apply -> commit ->
 * re-check -> record it says `pass` and no longer shows the trick. Both are
 * matched on (game, unit, symbol) only: the rollback rewrote the source, so a
 * hash of the old text would never match. Their `report_json` is
 * `SteeringBackfillFunctionReport` (validation/jobs/steering-gate.ts); every
 * field is read as optional, and what the row lacks (older rows, or a rule
 * violation whose re-check no longer names it) comes from the first check
 * report it points to (`report.check`).
 *
 * A second variant, `unverified_match` ("100% unverified", migration 015),
 * comes from the function's active `steering_unverified_matches` row: its code
 * usually reaches 100% but the gate left it `unresolved`, neither proven real
 * nor attributed to steering. It wins over a rollback and is shown whatever
 * the current score, since a 100% the gate could not verify is not done.
 */
export type PreviousAttemptRuleKind = "steering" | "dead_unused_body" | "out_of_order";

export interface PreviousAttemptRuling {
  id: string;
  pr: string | null;
  reviewer: string | null;
  quote: string;
  rule: string | null;
}

export interface PreviousAttemptRule {
  kind: PreviousAttemptRuleKind | string;
  name: string;
  summary: string;
  ruling?: PreviousAttemptRuling;
}

export interface PreviousAttemptEdit {
  file: string;
  line?: number;
  shapes?: string[];
  before?: string;
  after?: string;
}

export interface PreviousAttemptHint {
  cause: string;
  why?: string;
  how_to_check?: string;
}

/** The fields every variant carries, so callers can read them without narrowing. */
interface PreviousAttemptCommon {
  unit: string;
  symbol: string;
  analyzed_rev: string;
  recorded_at: string;
  /** The gate's verdict on the earlier source (`steering_located`, `rule_violation`, `unresolved`, ...). */
  decision: string;
  /** The verdict after the backfill (the row's `verdict`). */
  verdict_after: string;
  /** The backfill rewrote the source (S* or the upstream stub). */
  applied: boolean;
  removed_edits: PreviousAttemptEdit[];
  reasons: string[];
  hints: PreviousAttemptHint[];
  rules: PreviousAttemptRule[];
}

/** The rollback variant: an earlier match the backfill rolled back. It carries no `variant` key. */
export interface RollbackPreviousAttempt extends PreviousAttemptCommon {
  variant?: "rollback";
  match: { base: number | null; with_steering: number | null; real_only: number | null };
}

/** An edit of an unverified match the gate could not explain (`unexplained_edit_groups`). */
export interface UnverifiedMatchEdit extends PreviousAttemptEdit {
  /** `held` (removable, kept for the unresolved function), `unresolved` or `incomplete`. */
  status?: string;
}

/** The `unverified_match` variant ("100% unverified"): the gate could not verify the function's code. */
export interface UnverifiedMatchPreviousAttempt extends PreviousAttemptCommon {
  variant: typeof UNVERIFIED_MATCH_STATE;
  label: string;
  base_rev: string | null;
  source_path: string | null;
  /** `candidate` is the match the code reaches; `real_only` the reduced candidate's measured match (not a certified subset). */
  match: { base: number | null; candidate: number | null; real_only: number | null };
  unexplained_edits: UnverifiedMatchEdit[];
}

export type PreviousAttempt = RollbackPreviousAttempt | UnverifiedMatchPreviousAttempt;

/** Which variant a `previous_attempt` block shows; the dashboard preview selects one. */
export type PreviousAttemptVariant = "rollback" | typeof UNVERIFIED_MATCH_STATE;
export const PREVIOUS_ATTEMPT_VARIANTS: readonly PreviousAttemptVariant[] = ["rollback", UNVERIFIED_MATCH_STATE];

export function isPreviousAttemptVariant(value: unknown): value is PreviousAttemptVariant {
  return typeof value === "string" && (PREVIOUS_ATTEMPT_VARIANTS as readonly string[]).includes(value);
}

/** decide's violation kind -> the rule it breaks and the `enforced_by` id its maintainer ruling carries. */
const RULES: Record<PreviousAttemptRuleKind, { name: string; enforcedBy: string; summary: string }> = {
  steering: {
    name: "steering-is-a-probe",
    enforcedBy: "steering_gate",
    summary: "Behaviour-identical rewrites (temps, aliases, reorders, accessor or inline swaps) only move codegen; they are a probe for the real construct, never the fix.",
  },
  dead_unused_body: {
    name: "UNUSED-only-when-inlined",
    enforcedBy: "sms_unused_reconstruction",
    summary: "A function the map marks UNUSED gets a body only when the original inlined it into another function of the same TU; otherwise it stays the upstream stub.",
  },
  out_of_order: {
    name: "decompile-in-order",
    enforcedBy: "sms_out_of_order_fill",
    summary: "Do not fill in code (MarNameRefGen registries, factories, callers) that needs classes whose own units are not decompiled yet.",
  },
};

const TRICK_DECISIONS = new Set(["steering_located", "rule_violation"]);
const MAX_EDITS = 6;
const MAX_REASONS = 6;
const MAX_HINTS = 4;
const TEXT_LIMIT = 240;
/** A check report bigger than this is not parsed at claim time (the row's own report still renders). */
const CHECK_REPORT_MAX_BYTES = 128 * 1024 * 1024;

type JsonObject = Record<string, unknown>;

function asObject(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonObject) : {};
}

function asObjects(value: unknown): JsonObject[] {
  return Array.isArray(value) ? value.map(asObject).filter((row) => Object.keys(row).length > 0) : [];
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function clip(text: string, limit = TEXT_LIMIT): string {
  return text.length > limit ? `${text.slice(0, limit - 1)}…` : text;
}

function lines(value: unknown): string | null {
  if (Array.isArray(value)) return value.filter((line): line is string => typeof line === "string").join("\n").trim() || null;
  return str(value);
}

function firstNonEmpty<T>(...lists: T[][]): T[] {
  return lists.find((list) => list.length > 0) ?? [];
}

function editRow(row: JsonObject): PreviousAttemptEdit | null {
  const file = str(row.file);
  if (!file) return null;
  const line = num(row.line);
  const shapes = Array.isArray(row.shapes) ? row.shapes.filter((shape): shape is string => typeof shape === "string" && shape !== "cosmetic") : [];
  // Backfill rows: `restored` (base lines) / `text` (steered lines); probes: `before` / `after`; reduce: `base_lines` / `cand_lines`.
  const before = lines(row.restored ?? row.before ?? row.base_lines);
  const after = lines(row.text ?? row.after ?? row.cand_lines);
  return {
    file,
    ...(line !== null ? { line } : {}),
    ...(shapes.length > 0 ? { shapes } : {}),
    ...(before ? { before: clip(before) } : {}),
    ...(after ? { after: clip(after) } : {}),
  };
}

function edits(value: unknown): PreviousAttemptEdit[] {
  return asObjects(value).map(editRow).filter((row): row is PreviousAttemptEdit => row !== null).slice(0, MAX_EDITS);
}

function reasonList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((reason): reason is string => typeof reason === "string" && reason.trim() !== "").map((reason) => clip(reason)).slice(0, MAX_REASONS)
    : [];
}

function hintList(value: unknown): PreviousAttemptHint[] {
  return asObjects(value).flatMap((row) => {
    const cause = str(row.cause);
    if (!cause) return [];
    const why = str(row.why);
    const how = str(row.how_to_check);
    return [{ cause, ...(why ? { why: clip(why) } : {}), ...(how ? { how_to_check: clip(how) } : {}) }];
  }).slice(0, MAX_HINTS);
}

/** The check report's view of this function: its decide row, the removable groups it touches, its violations. */
export interface CheckFunctionFacts {
  reasons: string[];
  removedEdits: PreviousAttemptEdit[];
  violationKinds: string[];
  match: JsonObject;
}

/** This function's facts in a `steering_check.py check` report (`{reduce, decision}`); null when it is not listed. */
export function checkFunctionFacts(check: unknown, unit: string, symbol: string): CheckFunctionFacts | null {
  const report = asObject(check);
  const decision = asObject(report.decision);
  const fn = asObjects(decision.functions).find((row) => row.unit === unit && row.name === symbol);
  if (!fn) return null;
  const groupIds = new Set(Array.isArray(fn.groups) ? fn.groups.map(String) : []);
  const groups = asObjects(asObject(report.reduce).groups).filter((group) => groupIds.has(String(group.id)));
  const removable = groups.filter((group) => group.status === "removable" && !group.cosmetic);
  const files = new Set(groups.map((group) => str(group.file)).filter((file): file is string => Boolean(file)));
  const demangled = str(fn.demangled);
  const violationKinds = asObjects(decision.violations).filter((violation) => {
    const fnName = str(violation.function);
    // decide names a violation's function mangled, demangled, or qualified without parameters.
    if (fnName) return fnName === symbol || fnName === demangled || Boolean(demangled?.startsWith(`${fnName}(`));
    const vUnit = str(violation.unit);
    return (!vUnit || vUnit === unit) && files.has(String(violation.file));
  }).map((violation) => String(violation.kind));
  if (fn.unused_check === "dead") violationKinds.push("dead_unused_body");
  return { reasons: reasonList(fn.reasons), removedEdits: edits(removable), violationKinds, match: asObject(fn.match) };
}

/** Violation kinds a reason line names (decide's wording), for reports that carry reasons but no violations. */
function kindsFromReasons(reasons: string[]): string[] {
  return reasons.flatMap((reason) => [
    ...(/dead UNUSED|stub test dead/i.test(reason) ? ["dead_unused_body"] : []),
    ...(/out of order/i.test(reason) ? ["out_of_order"] : []),
  ]);
}

function rulingFor(kind: string, rulings: readonly ReviewRuling[], probeRulings: JsonObject[]): PreviousAttemptRuling | undefined {
  const rule = RULES[kind as PreviousAttemptRuleKind];
  if (!rule) return undefined;
  const fromFile = rulings.find((ruling) => ruling.enforced_by.includes(rule.enforcedBy));
  if (fromFile) return { id: fromFile.id, pr: fromFile.pr, reviewer: fromFile.reviewer, quote: fromFile.quote, rule: clip(fromFile.rule, 400) };
  // The probe's own rulings (diagnose matched them by rule) when the rulings file is unavailable.
  const fromProbe = kind === "steering" ? probeRulings.find((row) => str(row.quote)) : undefined;
  const quote = fromProbe ? str(fromProbe.quote) : null;
  return fromProbe && quote
    ? { id: String(fromProbe.id ?? "probe-ruling"), pr: str(fromProbe.pr), reviewer: str(fromProbe.reviewer), quote, rule: str(fromProbe.rule) }
    : undefined;
}

/**
 * The packet block for a backfill row, or null when the row shows no trick:
 * neither the earlier verdict nor the backfill's names steering or a rule
 * violation, and the backfill rewrote nothing.
 */
export function previousAttemptFromBackfill(
  record: SteeringBackfillRecord,
  options: { rulings?: readonly ReviewRuling[]; check?: CheckFunctionFacts | null } = {},
): RollbackPreviousAttempt | null {
  const report = record.report;
  const probe = asObject(report.probe);
  const check = options.check ?? null;
  // `initial` is the verdict on the source before the backfill; `decision` is the final one.
  const initial = str(report.initial);
  const decision = (initial && initial !== "absent" ? initial : null) ?? str(probe.decision) ?? str(report.decision) ?? record.verdict;
  const verdictAfter = str(report.decision) ?? record.verdict;
  // Rule rollbacks (a dead UNUSED body, an out-of-order fill) can leave every verdict `pass`: their rules still count.
  const reportRules = Array.isArray(report.rules) ? report.rules.filter((rule): rule is string => typeof rule === "string" && rule !== "") : [];
  const reportViolations = asObjects(report.violations);
  if (!TRICK_DECISIONS.has(decision) && !TRICK_DECISIONS.has(verdictAfter) && !record.applied && report.applied !== true
    && reportRules.length === 0 && reportViolations.length === 0) return null;

  const match = Object.keys(asObject(report.match)).length > 0 ? asObject(report.match)
    : Object.keys(asObject(probe.match)).length > 0 ? asObject(probe.match) : check?.match ?? {};
  const finalMatch = asObject(report.final_match);
  const removed = firstNonEmpty(
    edits(report.removed_edit_groups),
    edits(report.removed_groups),
    edits(report.removed_edits),
    edits(report.removed),
    edits(probe.steering_edits),
    check?.removedEdits ?? [],
  );
  const reasons = firstNonEmpty(reasonList(report.reasons), check?.reasons ?? []);
  const hints = firstNonEmpty(hintList(report.hints), hintList(probe.hypotheses));

  const kinds: string[] = [];
  const addKind = (kind: string) => {
    if (kind && !kinds.includes(kind)) kinds.push(kind);
  };
  for (const violation of reportViolations) addKind(String(violation.kind ?? ""));
  for (const rule of reportRules) addKind(rule);
  for (const kind of check?.violationKinds ?? []) addKind(kind);
  for (const kind of kindsFromReasons(reasons)) addKind(kind);
  // Removed edits with no named rule were steering; a dead body or an out-of-order hunk names its rule.
  if (decision === "steering_located" || verdictAfter === "steering_located" || (removed.length > 0 && kinds.length === 0)) addKind("steering");
  if (kinds.length === 0 && decision === "rule_violation") addKind("rule_violation");

  // A rule rollback can leave the first verdict `pass`; name what was rolled back instead.
  const shownDecision = decision !== "pass" ? decision
    : kinds.some((kind) => kind !== "steering") ? "rule_violation" : kinds.includes("steering") ? "steering_located" : decision;

  const probeRulings = asObjects(probe.rulings);
  const rules: PreviousAttemptRule[] = kinds.map((kind) => {
    const known = RULES[kind as PreviousAttemptRuleKind];
    const ruling = rulingFor(kind, options.rulings ?? [], probeRulings);
    return {
      kind,
      name: known?.name ?? kind,
      summary: known?.summary ?? "The gate found a matching-rule violation; the reasons below name it.",
      ...(ruling ? { ruling } : {}),
    };
  });

  return {
    unit: record.unit,
    symbol: record.symbol,
    analyzed_rev: record.analyzedRev,
    recorded_at: record.recordedAt,
    decision: shownDecision,
    verdict_after: verdictAfter,
    applied: record.applied || report.applied === true,
    match: { base: num(match.base), with_steering: num(match.candidate), real_only: num(match.real_only) ?? num(finalMatch.candidate) },
    removed_edits: removed,
    reasons,
    hints,
    rules,
  };
}

/** What `previousAttemptFromUnverified` reads: an `UnverifiedMatchRecord`, or the same fields from a sample. */
export type UnverifiedMatchSource = Pick<UnverifiedMatchRecord, "unit" | "symbol" | "analyzedRev" | "match" | "reasons" | "recordedAt">
  & Partial<Pick<UnverifiedMatchRecord, "baseRev" | "sourcePath" | "report">>;

/**
 * The packet block for a function recorded as `unverified_match`. The record's
 * own `match` and `reasons` come first; its report (a
 * `SteeringBackfillFunctionReport`) adds the edits the gate could not explain
 * and the probe's hypotheses, and fills a match or reasons the record lacks.
 */
export function previousAttemptFromUnverified(record: UnverifiedMatchSource): UnverifiedMatchPreviousAttempt {
  const report = asObject(record.report);
  const reportMatch = asObject(report.match);
  const decision = str(report.decision) ?? "unresolved";
  const unexplained = asObjects(report.unexplained_edit_groups).flatMap((row) => {
    const edit = editRow(row);
    const status = str(row.status);
    return edit ? [{ ...edit, ...(status ? { status } : {}) }] : [];
  }).slice(0, MAX_EDITS);
  return {
    variant: UNVERIFIED_MATCH_STATE,
    label: UNVERIFIED_MATCH_LABEL,
    unit: record.unit,
    symbol: record.symbol,
    analyzed_rev: record.analyzedRev,
    base_rev: record.baseRev ?? str(report.base_rev),
    source_path: record.sourcePath ?? null,
    recorded_at: record.recordedAt,
    decision,
    verdict_after: decision,
    applied: false,
    match: {
      base: record.match.base ?? num(reportMatch.base),
      candidate: record.match.candidate ?? num(reportMatch.candidate),
      real_only: record.match.real_only ?? num(reportMatch.real_only),
    },
    unexplained_edits: unexplained,
    removed_edits: [],
    reasons: firstNonEmpty(reasonList(record.reasons), reasonList(report.reasons)),
    hints: firstNonEmpty(hintList(report.hints), hintList(asObject(report.probe).hypotheses)),
    rules: [],
  };
}

/** A rollback event in the backfill-row shape `previousAttemptFromBackfill` reads: the rewrite is the rollback. */
function rollbackAsRecord(rollback: SteeringRollbackRecord): SteeringBackfillRecord {
  return {
    gameId: rollback.gameId,
    unit: rollback.unit,
    symbol: rollback.symbol,
    analyzedRev: rollback.analyzedRev,
    functionSourceSha: null,
    verdict: rollback.finalVerdict,
    applied: true,
    appliedRev: null,
    report: {
      ...rollback.report,
      initial: rollback.report.initial ?? rollback.initialVerdict,
      rules: Array.isArray(rollback.report.rules) ? rollback.report.rules : rollback.rules,
    },
    recordedAt: rollback.recordedAt,
  };
}

let checkCache: { path: string; mtimeMs: number; json: unknown } | null = null;

function readCheckReport(path: string | null): unknown {
  if (!path || !existsSync(path)) return null;
  try {
    const stat = statSync(path);
    if (stat.size > CHECK_REPORT_MAX_BYTES) return null;
    if (checkCache?.path === path && checkCache.mtimeMs === stat.mtimeMs) return checkCache.json;
    const json = JSON.parse(readFileSync(path, "utf8")) as unknown;
    checkCache = { path, mtimeMs: stat.mtimeMs, json };
    return json;
  } catch {
    return null;
  }
}

function readRulings(path: string | null | undefined): ReviewRuling[] {
  if (!path || !existsSync(path)) return [];
  try {
    return readReviewRulings(path);
  } catch {
    return [];
  }
}

/**
 * Claim-time lookup: the `previous_attempt` block for a target. An active
 * `unverified_match` row comes first, whatever the score (its code usually
 * reaches 100%). Otherwise null when the target is already done (score 100),
 * has no backfill row, or its row shows no trick. Never throws: the block is
 * a hint.
 */
export function steeringPreviousAttempt(
  store: StateStore,
  params: { gameId: string; unit: string; symbol: string; currentScore?: number | null; rulingsPath?: string | null },
): PreviousAttempt | null {
  try {
    const unverified = activeUnverifiedMatch(store, params);
    if (unverified) return previousAttemptFromUnverified(unverified);
  } catch {
    // A store without the table (or a malformed row) falls through to the rollback lookup.
  }
  if (params.currentScore != null && params.currentScore >= 100) return null;
  try {
    const rollback = latestSteeringRollback(store, params);
    const record = rollback ? rollbackAsRecord(rollback) : latestSteeringBackfill(store, params);
    if (!record) return null;
    const rulings = readRulings(params.rulingsPath);
    const fromRow = previousAttemptFromBackfill(record, { rulings });
    // The first check report is only read when the row lacks what the block needs:
    // reasons, removed edits, or (for a rule violation) the rule it broke.
    const complete = fromRow !== null && fromRow.reasons.length > 0
      && (fromRow.removed_edits.length > 0 || fromRow.rules.some((rule) => rule.kind === "dead_unused_body" || rule.kind === "out_of_order"))
      && fromRow.rules.every((rule) => rule.kind !== "rule_violation");
    if (complete) return fromRow;
    const check = checkFunctionFacts(readCheckReport(str(record.report.check)), record.unit, record.symbol);
    return check ? previousAttemptFromBackfill(record, { rulings, check }) : fromRow;
  } catch {
    return null;
  }
}
