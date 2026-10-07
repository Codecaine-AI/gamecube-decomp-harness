// Two-stage calibration (plan §6.9), pure:
// 1. select thresholds on the `selection` split: sweep passAt 0.50–0.99 and
//    failAt 0.01–(passAt − 0.01) in 0.01 steps; require zero false accepts
//    on selection `unjustified` items; maximize true accepts, then minimize
//    abstains; remaining ties go to the higher passAt, then the lower failAt
//    (the more conservative pair);
// 2. evaluate that pair once on `heldout`, one unit per independent group:
//    a group is labelled when all its human labels agree (conflicting groups
//    are excluded and listed), and a group's outcome is accept when any item
//    is accepted, else abstain when any abstains, else reject — so a negative
//    group is one false accept if any of its items is accepted.
// Held-out units are human-labelled, non-synthetic items only; synthetic
// items count for selection and are reported separately.
import { clopperPearsonUpper } from "./statistics.js";
import type { HumanLabel, SplitSide } from "./types.js";

export type Outcome = "accept" | "abstain" | "reject";

export interface Matrix {
  accept: number;
  abstain: number;
  reject: number;
}

export interface LabelledMatrix {
  justified: Matrix;
  unjustified: Matrix;
}

export interface Thresholds {
  passAt: number;
  failAt: number;
}

export interface EvaluationItem {
  id: string;
  group: string;
  side: SplitSide;
  synthetic: boolean;
  label: HumanLabel;
  /** `synthetic-quality`: a synthetic item without a human label, labelled by the quality it was written for. */
  labelSource: "human" | "synthetic-quality";
  probability: number;
}

export interface SelectionResult {
  items: number;
  synthetic: number;
  thresholds: Thresholds | null;
  trueAccepts: number;
  falseAccepts: number;
  abstains: number;
  /** Every selection item. */
  matrix: LabelledMatrix;
  /** The synthetic items alone, reported separately. */
  syntheticMatrix: LabelledMatrix;
}

export interface HeldoutResult {
  /** Labelled, non-conflicting held-out groups. */
  groups: number;
  negativeGroups: number;
  positiveGroups: number;
  conflictingGroups: string[];
  groupMatrix: LabelledMatrix | null;
  itemMatrix: LabelledMatrix | null;
  falseAccepts: number | null;
  /** Accepted groups / groups. */
  acceptRate: number | null;
  /** Abstained groups / groups. */
  abstainRate: number | null;
  /** One-sided 95 % Clopper–Pearson upper bound on the false-accept rate over negative groups. */
  upper95: number | null;
}

/** Reported numbers are rounded to 6 decimals so reports are byte-stable. */
export function round6(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}

const EPS = 1e-9;

/** The kernel's bool rule (plan §4.3): p ≥ passAt passes, p ≤ failAt fails, else abstain. */
export function outcomeOf(probability: number, t: Thresholds): Outcome {
  if (probability >= t.passAt - EPS) return "accept";
  if (probability <= t.failAt + EPS) return "reject";
  return "abstain";
}

function emptyMatrix(): Matrix {
  return { accept: 0, abstain: 0, reject: 0 };
}

function emptyLabelled(): LabelledMatrix {
  return { justified: emptyMatrix(), unjustified: emptyMatrix() };
}

function matrixOf(items: readonly EvaluationItem[], t: Thresholds): LabelledMatrix {
  const matrix = emptyLabelled();
  for (const item of items) matrix[item.label][outcomeOf(item.probability, t)] += 1;
  return matrix;
}

const cents = (value: number) => Number((value / 100).toFixed(2));

export function selectThresholds(selection: readonly EvaluationItem[]): SelectionResult {
  const syntheticItems = selection.filter((item) => item.synthetic);
  let best: { passC: number; failC: number; trueAccepts: number; abstains: number } | null = null;
  for (let passC = 50; passC <= 99; passC += 1) {
    const passAt = cents(passC);
    let falseAccepts = 0;
    let trueAccepts = 0;
    for (const item of selection) {
      if (item.probability < passAt - EPS) continue;
      if (item.label === "unjustified") falseAccepts += 1;
      else trueAccepts += 1;
    }
    if (falseAccepts > 0) continue;
    for (let failC = 1; failC <= passC - 1; failC += 1) {
      const t = { passAt, failAt: cents(failC) };
      const abstains = selection.filter((item) => outcomeOf(item.probability, t) === "abstain").length;
      const better =
        best === null ||
        trueAccepts > best.trueAccepts ||
        (trueAccepts === best.trueAccepts &&
          (abstains < best.abstains ||
            (abstains === best.abstains && (passC > best.passC || (passC === best.passC && failC < best.failC)))));
      if (better) best = { passC, failC, trueAccepts, abstains };
    }
  }
  if (selection.length === 0 || best === null) {
    return {
      items: selection.length,
      synthetic: syntheticItems.length,
      thresholds: null,
      trueAccepts: 0,
      falseAccepts: 0,
      abstains: 0,
      matrix: emptyLabelled(),
      syntheticMatrix: emptyLabelled(),
    };
  }
  const thresholds = { passAt: cents(best.passC), failAt: cents(best.failC) };
  return {
    items: selection.length,
    synthetic: syntheticItems.length,
    thresholds,
    trueAccepts: best.trueAccepts,
    falseAccepts: 0,
    abstains: best.abstains,
    matrix: matrixOf(selection, thresholds),
    syntheticMatrix: matrixOf(syntheticItems, thresholds),
  };
}

export function evaluateHeldout(heldout: readonly EvaluationItem[], t: Thresholds | null): HeldoutResult {
  const byGroup = new Map<string, EvaluationItem[]>();
  for (const item of heldout) {
    if (item.synthetic || item.labelSource !== "human") throw new Error(`held-out item ${item.id} is not a human-labelled real item`);
    const members = byGroup.get(item.group);
    if (members) members.push(item);
    else byGroup.set(item.group, [item]);
  }
  const conflictingGroups: string[] = [];
  const units: Array<{ label: HumanLabel; items: EvaluationItem[] }> = [];
  for (const group of [...byGroup.keys()].sort()) {
    const items = byGroup.get(group)!;
    const labels = new Set(items.map((item) => item.label));
    if (labels.size > 1) conflictingGroups.push(group);
    else units.push({ label: items[0]!.label, items });
  }
  const negativeGroups = units.filter((unit) => unit.label === "unjustified").length;
  const positiveGroups = units.length - negativeGroups;
  if (t === null) {
    return {
      groups: units.length,
      negativeGroups,
      positiveGroups,
      conflictingGroups,
      groupMatrix: null,
      itemMatrix: null,
      falseAccepts: null,
      acceptRate: null,
      abstainRate: null,
      upper95: null,
    };
  }
  const groupMatrix = emptyLabelled();
  for (const unit of units) {
    const outcomes = new Set(unit.items.map((item) => outcomeOf(item.probability, t)));
    const outcome: Outcome = outcomes.has("accept") ? "accept" : outcomes.has("abstain") ? "abstain" : "reject";
    groupMatrix[unit.label][outcome] += 1;
  }
  const itemMatrix = matrixOf(
    units.flatMap((unit) => unit.items),
    t,
  );
  const falseAccepts = groupMatrix.unjustified.accept;
  const rate = (count: number) => (units.length === 0 ? null : round6(count / units.length));
  return {
    groups: units.length,
    negativeGroups,
    positiveGroups,
    conflictingGroups,
    groupMatrix,
    itemMatrix,
    falseAccepts,
    acceptRate: rate(groupMatrix.justified.accept + groupMatrix.unjustified.accept),
    abstainRate: rate(groupMatrix.justified.abstain + groupMatrix.unjustified.abstain),
    upper95: round6(clopperPearsonUpper(falseAccepts, negativeGroups)),
  };
}

export interface QualificationBars {
  minNegativeGroups: number;
  minPositiveGroups: number;
  maxFalseAcceptUpper: number;
}

export interface Qualification {
  qualification: "exploratory" | "enforcement-qualified";
  reasons: string[];
}

/** `enforcement-qualified` only when every bar is met (plan §6.9); otherwise `exploratory` with every missed bar. */
export function qualify(selection: SelectionResult, heldout: HeldoutResult, bars: QualificationBars, hashes: { labelSetHash: string | null; splitHash: string | null }): Qualification {
  const reasons: string[] = [];
  if (selection.thresholds === null) {
    reasons.push(selection.items === 0 ? "no scored selection items" : "no threshold pair has zero false accepts on selection");
  }
  if (heldout.negativeGroups < bars.minNegativeGroups) {
    reasons.push(`held-out negative groups ${heldout.negativeGroups} < ${bars.minNegativeGroups}`);
  }
  if (heldout.positiveGroups < bars.minPositiveGroups) {
    reasons.push(`held-out positive groups ${heldout.positiveGroups} < ${bars.minPositiveGroups}`);
  }
  if (heldout.upper95 !== null && heldout.upper95 > bars.maxFalseAcceptUpper) {
    reasons.push(`Clopper–Pearson upper95 ${heldout.upper95} > maxFalseAcceptUpper ${bars.maxFalseAcceptUpper}`);
  }
  if (!hashes.labelSetHash || !hashes.splitHash) reasons.push("labelSetHash or splitHash missing");
  return { qualification: reasons.length === 0 ? "enforcement-qualified" : "exploratory", reasons };
}
