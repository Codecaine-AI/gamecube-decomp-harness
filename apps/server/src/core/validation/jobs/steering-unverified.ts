import type { SteeringCertificateContext, SteeringDecision, SteeringFunctionDecision } from "@server/core/validation/steering/steering-check.js";

/**
 * The steering backfill's `unverified_match` rules (a function `decide`
 * left `unresolved`: neither proven real nor attributed to steering).
 *
 * 1. Held groups. `apply` (S*) never rewrites an unresolved function's code:
 *    a removable group is held (left in place) when it is attributed to an
 *    unresolved function: listed in that function row's `groups`, or its own
 *    line-located `functions` name it. `apply` reverts only the steering
 *    groups: removable groups listed in a `steering_located` row's `groups`
 *    and not held (a group shared with an unresolved function is held whole;
 *    a removable group no steering function claims is left in place). Mirrors
 *    `held_group_ids` / `steering_group_ids` in `steering_check.py` (the
 *    authority for what `apply` writes).
 * 2. Tolerance. A `--record` run records every unresolved function as
 *    `unverified_match` instead of failing; the facts that only explain those
 *    functions are tolerated: their rows, unresolved/incomplete/held groups
 *    attributed to them, IR-oracle failures of units whose every considered
 *    function is unresolved, and an order-sensitive reduction (forward and
 *    reverse disagree: every function of the report is unresolved). Tool
 *    errors, uncovered units, budgets, link-map gaps, header caps and every
 *    other attempt-level fact still make the run unclean.
 */

type JsonObject = Record<string, unknown>;

function asObject(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonObject) : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function strings(value: unknown): string[] {
  return asArray(value).filter((item): item is string => typeof item === "string");
}

/** `reduce`'s global reason for disagreeing forward/reverse reductions (`steering_check.py` ReduceRun.run). */
export const ORDER_SENSITIVE_PREFIX = "order sensitive";

export function isOrderSensitiveReason(reason: string): boolean {
  return reason.trim().startsWith(ORDER_SENSITIVE_PREFIX);
}

/** `T::f` from `T::f(int) const`, templates kept (`steering_check.py` qualified). */
export function qualifiedName(name: string): string {
  let depth = 0;
  for (let index = 0; index < name.length; index += 1) {
    const ch = name[index];
    if (ch === "<") depth += 1;
    else if (ch === ">") depth -= 1;
    else if (ch === "(" && depth === 0 && index > 0 && !name.slice(0, index).endsWith("operator")) return name.slice(0, index).trim();
  }
  return name.trim();
}

/** `steering_check.py` `_match_function`. */
export function matchFunction(entryNames: Array<string | null | undefined>, wanted: readonly string[]): boolean {
  const names = entryNames.filter((name): name is string => Boolean(name));
  return wanted.some((w) => names.some((n) => n === w || qualifiedName(n) === qualifiedName(w) || qualifiedName(n).endsWith(`::${qualifiedName(w)}`)));
}

function functionRows(raw: JsonObject): JsonObject[] {
  return asArray(asObject(raw.decision).functions).map(asObject).filter((row) => typeof row.unit === "string" && typeof row.name === "string");
}

function reduceGroups(raw: JsonObject): JsonObject[] {
  return asArray(asObject(raw.reduce).groups).map(asObject).filter((group) => typeof group.id === "string");
}

/** A group's status after `decide`'s promotions (`decision.group_statuses`), else reduce's. */
function finalStatus(raw: JsonObject, group: JsonObject): unknown {
  const statuses = asObject(asObject(raw.decision).group_statuses);
  return typeof statuses[String(group.id)] === "string" ? statuses[String(group.id)] : group.status;
}

function isRemovable(raw: JsonObject, group: JsonObject): boolean {
  return finalStatus(raw, group) === "removable" && group.cosmetic !== true;
}

/** Is this group attributed to one of these function rows (their `groups`, or its own line-located `functions`)? */
function attributedTo(group: JsonObject, rows: readonly JsonObject[]): boolean {
  const id = String(group.id);
  const located = strings(group.functions);
  const units = strings(group.units);
  return rows.some((row) => strings(row.groups).includes(id)
    || (located.length > 0 && (units.length === 0 || units.includes(String(row.unit)))
      && matchFunction([row.demangled as string | undefined, row.name as string, row.target_name as string | undefined], located)));
}

function unresolvedRows(raw: JsonObject): JsonObject[] {
  return functionRows(raw).filter((row) => row.decision === "unresolved");
}

/** Removable, non-cosmetic groups `apply` leaves in place because they are attributed to an unresolved function. */
export function heldGroupIds(raw: JsonObject): Set<string> {
  const unresolved = unresolvedRows(raw);
  if (unresolved.length === 0) return new Set();
  return new Set(reduceGroups(raw)
    .filter((group) => isRemovable(raw, group) && attributedTo(group, unresolved))
    .map((group) => String(group.id)));
}

/**
 * The groups `apply` reverts: removable, non-cosmetic, listed in a
 * `steering_located` row's `groups` and not held. Mirrors `steering_group_ids`.
 */
export function steeringGroupIds(raw: JsonObject): Set<string> {
  const listed = new Set(functionRows(raw).filter((row) => row.decision === "steering_located").flatMap((row) => strings(row.groups)));
  if (listed.size === 0) return new Set();
  const held = heldGroupIds(raw);
  // `apply` reverts only edits the measured S* reverted (`mwcc.revert_edits`, when the report has it).
  const measured = Array.isArray(asObject(raw.mwcc).revert_edits) ? new Set(strings(asObject(raw.mwcc).revert_edits)) : null;
  return new Set(reduceGroups(raw)
    .filter((group) => listed.has(String(group.id)) && !held.has(String(group.id)) && isRemovable(raw, group)
      && (!measured || strings(group.edit_ids).some((id) => measured.has(id))))
    .map((group) => String(group.id)));
}

/** Group ids attributed to an unresolved function (any status). */
export function unresolvedAttributedGroupIds(raw: JsonObject): Set<string> {
  const unresolved = unresolvedRows(raw);
  if (unresolved.length === 0) return new Set();
  return new Set(reduceGroups(raw).filter((group) => attributedTo(group, unresolved)).map((group) => String(group.id)));
}

/** Units whose every considered function is unresolved (an IR-oracle failure there only explains unverified functions). */
export function allUnresolvedUnits(raw: JsonObject): Set<string> {
  const byUnit = new Map<string, boolean>();
  for (const row of functionRows(raw)) {
    const unit = String(row.unit);
    byUnit.set(unit, (byUnit.get(unit) ?? true) && row.decision === "unresolved");
  }
  return new Set([...byUnit.entries()].filter(([, all]) => all).map(([unit]) => unit));
}

/** One structured issue (`reduce.incomplete_details`, `decision.attempt_issues`). */
export interface SteeringIssue {
  category: string;
  units: string[];
  groups: string[];
  files: string[];
  detail: string;
}

export function steeringIssues(value: unknown): SteeringIssue[] | null {
  if (!Array.isArray(value)) return null;
  return value.map(asObject).map((entry) => ({
    category: typeof entry.category === "string" ? entry.category : "unknown",
    units: strings(entry.units),
    groups: strings(entry.groups),
    files: strings(entry.files),
    detail: typeof entry.detail === "string" ? entry.detail : "",
  }));
}

/** The facts a report's unresolved functions explain (and so a `--record` run tolerates). */
export interface UnverifiedTolerance {
  held: Set<string>;
  attributed: Set<string>;
  allUnresolvedUnits: Set<string>;
  /** The issue is explained by the unresolved (soon `unverified_match`) functions alone. */
  tolerates(issue: SteeringIssue): boolean;
}

export function unverifiedTolerance(raw: JsonObject): UnverifiedTolerance {
  const held = heldGroupIds(raw);
  const attributed = unresolvedAttributedGroupIds(raw);
  const units = allUnresolvedUnits(raw);
  const anyUnresolved = unresolvedRows(raw).length > 0;
  return {
    held,
    attributed,
    allUnresolvedUnits: units,
    tolerates(issue) {
      if (!anyUnresolved) return false;
      switch (issue.category) {
        case "unresolved_functions":
          return true;
        case "unresolved_groups":
        case "group_incomplete":
          return issue.groups.length > 0 && issue.groups.every((id) => attributed.has(id));
        case "removable_noncosmetic":
          return issue.groups.length > 0 && issue.groups.every((id) => held.has(id));
        case "unit_oracle_failed":
          return issue.units.length > 0 && issue.units.every((unit) => units.has(unit));
        case "global":
          return isOrderSensitiveReason(issue.detail);
        default:
          return false;
      }
    },
  };
}

/**
 * The decision and certificate context a `--record` run judges: unresolved
 * function rows and the facts they alone explain removed, everything else
 * as `decide` reported it. `steeringCertificateProblems` over the result
 * lists only what keeps the run unclean beyond the unverified functions.
 */
export function unverifiedCertificateView(
  raw: JsonObject,
  decision: SteeringDecision,
  context: SteeringCertificateContext,
): { decision: SteeringDecision; context: SteeringCertificateContext; unverified: SteeringFunctionDecision[] } {
  const unverified = decision.functions.filter((fn) => fn.decision === "unresolved");
  if (unverified.length === 0) return { decision, context, unverified };
  const tolerance = unverifiedTolerance(raw);
  const reduceDetails = steeringIssues(asObject(raw.reduce).incomplete_details);
  const reduceTolerated = context.reduceAnalysis !== "complete" && reduceDetails !== null && reduceDetails.length > 0
    && reduceDetails.every((issue) => tolerance.tolerates(issue));
  const attemptIssues = steeringIssues(asObject(raw.decision).attempt_issues);
  // An older report without structured issues keeps its attempt verdict (fail closed).
  const attemptTolerated = decision.attempt !== "pass" && attemptIssues !== null
    && attemptIssues.every((issue) => tolerance.tolerates(issue)
      // Judged by the certificate itself on the filtered decision below.
      || ["steering_functions", "uncovered_unit", "dead_unused_body", "out_of_order", "unused_inconclusive", "order_unknown"].includes(issue.category));
  // Every considered function unverified (and coverage reported): nothing is left to consider, so the
  // run is judged on its other facts (coverage, violations, attempt issues) instead of "no function considered".
  const allUnverified = decision.functions.every((fn) => fn.decision === "unresolved") && (decision.units?.length ?? 0) > 0;
  return {
    decision: {
      ...decision,
      attempt: attemptTolerated ? "pass" : decision.attempt,
      functions: decision.functions.filter((fn) => fn.decision !== "unresolved"),
      removable_noncosmetic: decision.removable_noncosmetic.filter((id) => !tolerance.held.has(id)),
      ...(decision.unresolved_groups ? { unresolved_groups: decision.unresolved_groups.filter((id) => !tolerance.attributed.has(id)) } : {}),
      ...(allUnverified ? { no_changes: true } : {}),
    },
    context: {
      ...context,
      sourceChanged: allUnverified ? false : context.sourceChanged,
      reduceAnalysis: reduceTolerated ? "complete" : context.reduceAnalysis,
      unresolvedGroups: context.unresolvedGroups.filter((id) => !tolerance.attributed.has(id)),
    },
    unverified,
  };
}
