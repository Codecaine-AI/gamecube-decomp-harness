import type { StateStore } from "@server/core/orchestrator-state";
import { landedCertificates, type LandedCertificate } from "@server/core/harness-runtime/run-state/certification.js";
import { unverifiedMatchKey, type RevAncestry } from "@server/core/harness-runtime/run-state/unverified-matches.js";
import { unitKeyedGet, withUnitKeys } from "@server/core/harness-runtime/run-state/unit-key.js";
import { evaluatePrPromotion, renderRegressionMarkdown, type MetricChange, type RegressionReport, type ReportEntry } from "@server/core/validation/objdiff/report.js";

/**
 * Regression judgement for certification-lane repairs (plan §3.1, the
 * settlement side of the lane). The lane accepts a certified result below the
 * score it replaced (100 unverified -> 96 certified, or a rewrite of a
 * `steering_located` target), so when such an integration lands, the score
 * move it caused is judged against its certified score, not the old one:
 *
 * - the accepted repair itself (to at or above its certified score) is not a
 *   regression: settlement, the confirmation pass, readmission, the master
 *   breakage gate and the dashboard's vs-upstream view set it aside;
 * - a score below that certified result (96 -> 94) still is one;
 * - nothing else changes: a still-unverified function that any other
 *   integration lowers is judged against its current score as before (the
 *   uncertified code must keep compiling to what it did), and so is every
 *   other function, data and section. Games without lane integrations
 *   (Melee) are untouched.
 *
 * PR-slice readiness and Sync keep raw scores (they measure what upstream
 * accepts); they name such a row with `CERTIFIED_REPAIR_HOLD_REASON`.
 */
export type VerificationJudgement =
  | { kind: "ordinary" }
  /** A certification-lane (or restoration) integration of this target landed; its certified score is the baseline. */
  | { kind: "certified"; score: number };

export interface CertifiedRegressionOptions {
  store: StateStore;
  gameId: string;
  /**
   * `epoch`: the report compares the epoch's start (`sinceRev`) with
   * `measuredRev`, so only a lane landing in that range counts (an ancestor of
   * `measuredRev`, and not `sinceRev` or an ancestor of it). `upstream`: the
   * report compares upstream with `measuredRev`, which upstream never had, so
   * every lane landing that is an ancestor of `measuredRev` counts.
   */
  scope: "epoch" | "upstream";
  sinceRev?: string | null;
  /** The revision the report measured. Without it (or `isAncestor`) no landing is in scope and every regression stays. */
  measuredRev?: string | null;
  isAncestor?: RevAncestry;
}

/** Why PR-slice readiness holds out a certification-lane repair that upstream would see as a broken match or regression. */
export const CERTIFIED_REPAIR_HOLD_REASON = "certified repair below upstream score; not shippable until exact";

const SCORE_EPSILON = 1e-9;
const CODE_METRIC_KEYS = new Set(["fuzzy_match", "matched_code", "complete_code"]);

/**
 * Is the landing in the measured tree? Positive ancestry only: the landing's
 * integrated revision is `measuredRev` or one of its ancestors. A missing
 * revision, an unanswerable or failed check, or a landing on a discarded
 * branch is no.
 */
async function landedIn(rev: string, measuredRev: string | null | undefined, isAncestor: RevAncestry | undefined): Promise<boolean> {
  if (!measuredRev || !isAncestor) return false;
  if (rev === measuredRev) return true;
  try {
    return (await isAncestor(rev, measuredRev)) === true;
  } catch {
    return false;
  }
}

/**
 * The baseline of every target with a landed lane acceptance in scope. Only
 * landings with a positive freshness proof (`landedCertificates`) whose
 * integrated revision is an ancestor of the measured revision (`landedIn`)
 * count; in `epoch` scope the landing must also postdate the epoch's start
 * (not `sinceRev` or an ancestor of it). `epoch` takes the latest such
 * landing; `upstream` the highest, raised by a landed certified high-water
 * mark that meets the same rules. Unknown provenance keeps the regression.
 * Keys are canonical (`targetKey`) and the map is tagged `withUnitKeys`:
 * look a report key up with `unitKeyedGet`.
 */
export async function verificationJudgements(options: CertifiedRegressionOptions): Promise<Map<string, VerificationJudgement>> {
  const judgements = withUnitKeys(new Map<string, VerificationJudgement>(), options.gameId);
  let landed: LandedCertificate[];
  try {
    landed = landedCertificates(options.store, options.gameId);
  } catch {
    return judgements;
  }
  const inScope = async (certificate: LandedCertificate): Promise<boolean> => {
    if (!(await landedIn(certificate.integratedRev, options.measuredRev, options.isAncestor))) return false;
    if (options.scope === "upstream") return true;
    // This epoch's: positively not already in its start.
    if (!options.sinceRev) return false;
    if (certificate.integratedRev === options.sinceRev) return false;
    try {
      return (await options.isAncestor!(certificate.integratedRev, options.sinceRev)) === false;
    } catch {
      return false;
    }
  };
  for (const certificate of landed) {
    if (!certificate.lane || certificate.score === null || !(await inScope(certificate))) continue;
    const previous = judgements.get(certificate.key);
    // Ordered by landing: epoch scope keeps the latest lane landing, upstream the highest.
    const score = options.scope === "upstream" && previous?.kind === "certified" ? Math.max(previous.score, certificate.score) : certificate.score;
    judgements.set(certificate.key, { kind: "certified", score });
  }
  if (options.scope === "upstream") {
    for (const certificate of landed) {
      const judgement = judgements.get(certificate.key);
      if (judgement?.kind !== "certified" || certificate.kind !== "gate_pass" || certificate.score === null) continue;
      // A later certified result (the high-water mark, lane or not) that landed under the same rules raises the bar.
      if (certificate.score > judgement.score && (await inScope(certificate))) {
        judgements.set(certificate.key, { kind: "certified", score: certificate.score });
      }
    }
  }
  return judgements;
}

/** One regression row set aside: a landed certification-lane repair that holds its certified score. */
export type VerificationSetAside = ReportEntry & { verification: "certified_baseline_held"; certifiedBaseline: number };

/** Does this function row still regress, given its target's judgement? Null: ordinary (judge as before). */
export function setAsideReason(entry: Pick<ReportEntry, "itemName" | "toPercent">, judgement: VerificationJudgement | undefined): VerificationSetAside["verification"] | null {
  if (!judgement || judgement.kind === "ordinary" || entry.itemName.startsWith(".")) return null;
  return entry.toPercent + SCORE_EPSILON >= judgement.score ? "certified_baseline_held" : null;
}

export type JudgedRegressionReport<T extends RegressionReport> = T & { verificationSetAside?: VerificationSetAside[] };

/** The raw objdiff report changes (`report_changes.json`), for the sizes and totals metric attribution needs. */
interface RawChangesRow {
  name?: unknown;
  from?: Record<string, unknown>;
  to?: Record<string, unknown>;
  functions?: RawChangesRow[];
  sections?: RawChangesRow[];
  units?: RawChangesRow[];
}

/** Percent precision objdiff reports carry. */
const PERCENT_TOLERANCE = 1e-3;

function rawNumber(value: unknown): number | null {
  const parsed = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
  return typeof parsed === "number" && Number.isFinite(parsed) ? parsed : null;
}

function rawRows(value: unknown): RawChangesRow[] {
  return Array.isArray(value) ? value.filter((row): row is RawChangesRow => Boolean(row) && typeof row === "object") : [];
}

function rowSize(row: RawChangesRow): number | null {
  return rawNumber(row.to?.size) ?? rawNumber(row.from?.size);
}

function unitTotalCode(unit: RawChangesRow): number | null {
  const declared = rawNumber(unit.to?.total_code) ?? rawNumber(unit.from?.total_code);
  if (declared !== null) return declared;
  const sizes = rawRows(unit.functions).map(rowSize);
  return sizes.length > 0 && sizes.every((size) => size !== null) ? sizes.reduce((sum: number, size) => sum + (size as number), 0) : null;
}

/**
 * How much of a code metric's drop the set-aside repairs account for, from
 * their own score change and size: the metric with every repair back at its
 * `from` score. Null when a size or total is missing (attribution impossible).
 */
function counterfactualDelta(key: string, entries: VerificationSetAside[], total: number | null): number | null {
  if (total === null || total <= 0 || entries.some((entry) => !(entry.size > 0))) return null;
  if (key === "fuzzy_match") return entries.reduce((sum, entry) => sum + ((entry.fromPercent - entry.toPercent) * entry.size) / total, 0);
  if (key === "matched_code") {
    return entries.reduce((sum, entry) => sum + (entry.fromPercent >= 100 && entry.toPercent < 100 ? (entry.size / total) * 100 : 0), 0);
  }
  return null;
}

/**
 * Is a metric regression entirely attributable to the set-aside repairs?
 * Only code metrics ever are (data metrics never): a function's own row when
 * it is exactly the repair's move, and a unit's, its `.text` section's or the
 * global totals only when restoring every repair's `from` score
 * (`counterfactualDelta`) brings the metric back to its `from` value. Any
 * remainder (another function, an independent section loss) keeps the
 * regression; so does a report without the raw sizes to attribute it.
 */
function attributable(change: MetricChange, aside: VerificationSetAside[], remaining: ReportEntry[], raw: RawChangesRow | null): boolean {
  if (!CODE_METRIC_KEYS.has(change.key)) return false;
  const restores = (delta: number | null) => delta !== null && change.to + delta + PERCENT_TOLERANCE >= change.from;
  if (change.name !== null && change.key === "fuzzy_match"
    && aside.some((entry) => entry.itemName === change.name && entry.fromPercent === change.from && entry.toPercent === change.to)
    && !remaining.some((entry) => entry.itemName === change.name)) return true;
  if (!raw) return false;
  const units = rawRows(raw.units);
  if (change.name === null) {
    const unitTotals = units.map(unitTotalCode);
    const total = rawNumber(raw.to?.total_code) ?? rawNumber(raw.from?.total_code)
      ?? (unitTotals.every((value) => value !== null) ? unitTotals.reduce((sum: number, value) => sum + (value as number), 0) : null);
    if (change.key === "complete_code") {
      // Units the repairs alone made incomplete come back complete when every one of their code losses is the repairs'.
      let delta = 0;
      for (const unit of units) {
        const inUnit = aside.filter((entry) => entry.unitName === unit.name);
        const fromComplete = rawNumber(unit.from?.complete_code_percent) ?? 0;
        const toComplete = rawNumber(unit.to?.complete_code_percent) ?? 0;
        if (inUnit.length === 0 || toComplete >= fromComplete) continue;
        const unitTotal = unitTotalCode(unit);
        const matchedFrom = rawNumber(unit.from?.matched_code_percent);
        const matchedTo = rawNumber(unit.to?.matched_code_percent);
        const restored = counterfactualDelta("matched_code", inUnit, unitTotal);
        if (unitTotal === null || total === null || matchedFrom === null || matchedTo === null || restored === null
          || matchedTo + restored + PERCENT_TOLERANCE < matchedFrom) return false;
        delta += ((fromComplete - toComplete) / 100) * (unitTotal / total) * 100;
      }
      return restores(delta);
    }
    return restores(counterfactualDelta(change.key, aside, total));
  }
  const sectionUnit = change.name.endsWith("::.text") ? change.name.slice(0, -"::.text".length) : null;
  const unit = units.find((row) => row.name === (sectionUnit ?? change.name));
  if (!unit) return false;
  const inUnit = aside.filter((entry) => entry.unitName === unit.name);
  if (inUnit.length === 0) return false;
  if (sectionUnit !== null) {
    const text = rawRows(unit.sections).find((row) => row.name === ".text");
    return change.key === "fuzzy_match" && restores(counterfactualDelta("fuzzy_match", inUnit, text ? rowSize(text) : null));
  }
  const total = unitTotalCode(unit);
  if (change.key === "complete_code") {
    const matchedFrom = rawNumber(unit.from?.matched_code_percent);
    const matchedTo = rawNumber(unit.to?.matched_code_percent);
    const restored = counterfactualDelta("matched_code", inUnit, total);
    return matchedFrom !== null && matchedTo !== null && restored !== null && matchedTo + restored + PERCENT_TOLERANCE >= matchedFrom;
  }
  return restores(counterfactualDelta(change.key, inUnit, total));
}

/**
 * The report with every broken match and fuzzy regression of a landed lane
 * repair set aside (`verificationSetAside`) when its certified score holds,
 * and every code metric regression the repairs alone account for
 * (`attributable`, from `raw`, the report changes) dropped. Data metrics,
 * sections and every other function are untouched; promotion and markdown
 * are re-derived. Identity when nothing is set aside.
 */
export function applyVerificationJudgements<T extends RegressionReport>(
  report: T,
  judgements: ReadonlyMap<string, VerificationJudgement>,
  raw?: unknown,
): JudgedRegressionReport<T> {
  if (judgements.size === 0) return report;
  const setAside: VerificationSetAside[] = [];
  const keep = (entry: ReportEntry): boolean => {
    const judgement = unitKeyedGet(judgements, unverifiedMatchKey(entry.unitName, entry.itemName));
    const reason = setAsideReason(entry, judgement);
    if (!reason) return true;
    setAside.push({ ...entry, verification: reason, certifiedBaseline: (judgement as { score: number }).score });
    return false;
  };
  const brokenMatches = report.brokenMatches.filter(keep);
  const fuzzyRegressions = report.fuzzyRegressions.filter(keep);
  if (setAside.length === 0) return report;
  const remaining = [...brokenMatches, ...fuzzyRegressions];
  const rawChanges = raw && typeof raw === "object" && !Array.isArray(raw) ? raw as RawChangesRow : null;
  const regressions = report.regressions.filter((change) => !attributable(change, setAside, remaining, rawChanges));
  const entries = { regressions, brokenMatches, fuzzyRegressions };
  const promotion = evaluatePrPromotion({ ...report, ...entries }, report.promotion.policy);
  const title = /^### (.*)$/m.exec(report.markdown)?.[1] ?? "Regression report";
  const markdown = [
    renderRegressionMarkdown({ ...report, ...entries, promotion }, title, 50).trimEnd(),
    "",
    `**Certified repairs** (${setAside.length}): accepted on the certification lane and judged against their certified score, not the score they replaced.`,
    "",
    ...setAside.map((entry) => `- \`${entry.unitName}\` \`${entry.itemName}\`: ${entry.fromPercent}% -> ${entry.toPercent}% (certified baseline ${entry.certifiedBaseline}%)`),
    "",
  ].join("\n");
  return { ...report, ...entries, promotion, markdown, verificationSetAside: setAside };
}

/** `verificationJudgements` then `applyVerificationJudgements` (`raw`: the report changes the report was built from). */
export async function judgeRegressionReport<T extends RegressionReport>(report: T, options: CertifiedRegressionOptions, raw?: unknown): Promise<JudgedRegressionReport<T>> {
  return applyVerificationJudgements(report, await verificationJudgements(options), raw);
}

/**
 * Master breakage gate rows (upstream 100% -> ours below) of landed lane
 * repairs that hold their certified score are not breakages. Returns the rows
 * kept and the rows set aside.
 */
export async function judgeMasterBreakages<T extends { unitName: string; itemName: string; toPercent: number; kind?: string }>(
  breakages: T[],
  /** `measuredRev`: the revision our side measured; `isAncestor` proves each landing is in it. */
  options: Omit<CertifiedRegressionOptions, "scope" | "sinceRev">,
): Promise<{ kept: T[]; setAside: T[] }> {
  if (breakages.length === 0) return { kept: breakages, setAside: [] };
  const judgements = await verificationJudgements({ ...options, scope: "upstream" });
  const kept: T[] = [];
  const setAside: T[] = [];
  for (const row of breakages) {
    const reason = row.kind === "section" ? null : setAsideReason(row, unitKeyedGet(judgements, unverifiedMatchKey(row.unitName, row.itemName)));
    (reason ? setAside : kept).push(row);
  }
  return { kept, setAside };
}

/**
 * The master breakage gate's result with held lane repairs set aside
 * (`judgeMasterBreakages`), for a game whose steering gate is active: a gate
 * that only found such rows is `clean`. Identity otherwise (Melee).
 */
export async function judgeMasterBreakageGate<G extends {
  status: string;
  breakages: Array<{ unitName: string; itemName: string; toPercent: number; kind?: string }>;
  reasons: string[];
}>(gate: G, options: {
  store: StateStore;
  gameId: string | null | undefined;
  steeringGateActive: boolean;
  /** The revision our report measured; without it nothing is set aside. */
  measuredRev: string | null | undefined;
  isAncestor: RevAncestry;
}): Promise<G & { verificationSetAside?: G["breakages"] }> {
  if (!options.steeringGateActive || !options.gameId || gate.status !== "breakage") return gate;
  const { kept, setAside } = await judgeMasterBreakages(gate.breakages, {
    store: options.store, gameId: options.gameId, measuredRev: options.measuredRev, isAncestor: options.isAncestor,
  });
  if (setAside.length === 0) return gate;
  return {
    ...gate,
    status: (kept.length === 0 ? "clean" : gate.status) as G["status"],
    breakages: kept,
    reasons: [
      ...gate.reasons,
      `${setAside.length} certified repair(s) judged against their certified score, not the upstream score they replaced: ${
        setAside.slice(0, 5).map((row) => `${row.unitName}::${row.itemName}`).join(", ")}`,
    ],
    verificationSetAside: setAside,
  };
}
