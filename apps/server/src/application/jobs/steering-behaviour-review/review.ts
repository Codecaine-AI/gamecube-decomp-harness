// The review itself: ask the judge the behaviour question for every hunk, map
// each answer to a predicted label with the question-keyed thresholds, and
// score the predictions against the dataset label (and the IR gate's label
// where a row carries one).
//
// Shadow-only: the only thing this module writes is the two artifact files in
// the out directory it is given. It imports nothing from worker state, the
// run-state database or the advisory adjudication lifecycle, so a review can
// never change a worker outcome (steering-behaviour-review.test.ts pins this).
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { BEHAVIOUR_LABELS, type BehaviourHunk, type BehaviourLabel } from "./dataset.js";
import { behaviourState, type BehaviourJudge } from "./judge.js";
import { STEERING_BEHAVIOUR_QUESTION_ID, type BehaviourThresholds } from "./question.js";

export type PredictedLabel = BehaviourLabel | "abstain";
export const PREDICTED_LABELS: readonly PredictedLabel[] = [...BEHAVIOUR_LABELS, "abstain"];

export const RESULTS_FILE = "results.jsonl";
export const SUMMARY_FILE = "summary.json";

/**
 * p(behaviour differs) to a label: at or above `passAt` the added code
 * behaves differently ("real"); at or below `failAt` it behaves the same
 * ("steering"); in between, or without a probability, abstain.
 */
export function predictLabel(probability: number | null, thresholds: Pick<BehaviourThresholds, "passAt" | "failAt">): PredictedLabel {
  if (probability === null || !Number.isFinite(probability)) return "abstain";
  if (probability >= thresholds.passAt) return "real";
  if (probability <= thresholds.failAt) return "steering";
  return "abstain";
}

export interface BehaviourResult {
  schema: "steering_behaviour_result_v1";
  id: string;
  file: string;
  function: string;
  question_id: string;
  label: BehaviourLabel;
  predicted: PredictedLabel;
  probability: number | null;
  abstain_reason?: string;
  served_model: string | null;
  ir_gate?: BehaviourLabel;
  pr?: number | string;
}

/** Rows: the reference label; columns: the predicted label. */
export type ConfusionMatrix = Record<BehaviourLabel, Record<PredictedLabel, number>>;

export interface Agreement {
  /** Rows scored (for the IR gate: rows that carry an `ir_gate`). */
  total: number;
  /** Rows the judge answered (not abstained). */
  answered: number;
  abstain: number;
  confusion: ConfusionMatrix;
  /** Correct / answered; null when nothing was answered. */
  accuracy: number | null;
  /** Answered / total. */
  coverage: number | null;
  steering: {
    /** Predicted steering that is steering / predicted steering. */
    precision: number | null;
    /** Predicted steering that is steering / all reference steering (abstains count as misses). */
    recall: number | null;
  };
}

export interface BehaviourSummary {
  schema: "steering_behaviour_summary_v1";
  shadow_only: true;
  question_id: string;
  thresholds: BehaviourThresholds;
  model: string;
  served_models: Record<string, number>;
  dataset: string | null;
  engine: string | null;
  generated_at: string;
  /** Rows by dataset label. */
  labels: Record<BehaviourLabel, number>;
  /** Predictions by label. */
  predicted: Record<PredictedLabel, number>;
  abstain_reasons: Record<string, number>;
  /** Agreement with the dataset (audit) label. */
  vs_dataset: Agreement;
  /** Agreement with the IR gate, over rows that carry `ir_gate`; null when none does. */
  vs_ir_gate: Agreement | null;
}

function ratio(numerator: number, denominator: number): number | null {
  return denominator === 0 ? null : numerator / denominator;
}

function emptyConfusion(): ConfusionMatrix {
  const row = (): Record<PredictedLabel, number> => ({ steering: 0, real: 0, abstain: 0 });
  return { steering: row(), real: row() };
}

/** Agreement of predicted labels with a reference label (rows without a reference are skipped). */
export function agreement(pairs: ReadonlyArray<{ reference: BehaviourLabel | undefined; predicted: PredictedLabel }>): Agreement {
  const confusion = emptyConfusion();
  let total = 0;
  for (const { reference, predicted } of pairs) {
    if (reference === undefined) continue;
    total += 1;
    confusion[reference][predicted] += 1;
  }
  const abstain = confusion.steering.abstain + confusion.real.abstain;
  const answered = total - abstain;
  const correct = confusion.steering.steering + confusion.real.real;
  const predictedSteering = confusion.steering.steering + confusion.real.steering;
  const referenceSteering = confusion.steering.steering + confusion.steering.real + confusion.steering.abstain;
  return {
    total,
    answered,
    abstain,
    confusion,
    accuracy: ratio(correct, answered),
    coverage: ratio(answered, total),
    steering: {
      precision: ratio(confusion.steering.steering, predictedSteering),
      recall: ratio(confusion.steering.steering, referenceSteering),
    },
  };
}

export interface ReviewOptions {
  hunks: readonly BehaviourHunk[];
  judge: BehaviourJudge;
  thresholds: BehaviourThresholds;
  /** Progress line per hunk; default silent. */
  onResult?: (result: BehaviourResult, index: number, total: number) => void;
}

/** Judges every hunk in order. A judge failure on one hunk is that hunk's abstain, not the run's. */
export async function reviewHunks(opts: ReviewOptions): Promise<BehaviourResult[]> {
  const results: BehaviourResult[] = [];
  for (const [index, hunk] of opts.hunks.entries()) {
    let probability: number | null = null;
    let abstainReason: string | undefined;
    let servedModel: string | null = null;
    let questionId = STEERING_BEHAVIOUR_QUESTION_ID;
    try {
      const answer = await opts.judge.judge(hunk, behaviourState(hunk));
      probability = answer.probability;
      abstainReason = answer.abstainReason;
      servedModel = answer.servedModel;
      questionId = answer.questionId;
    } catch (error) {
      abstainReason = `judge-error: ${error instanceof Error ? error.message : String(error)}`;
    }
    const predicted = predictLabel(probability, opts.thresholds);
    if (predicted === "abstain" && abstainReason === undefined) abstainReason = probability === null ? "no-probability" : "between-thresholds";
    const result: BehaviourResult = {
      schema: "steering_behaviour_result_v1",
      id: hunk.id,
      file: hunk.file,
      function: hunk.function,
      question_id: questionId,
      label: hunk.label,
      predicted,
      probability,
      ...(predicted === "abstain" && abstainReason !== undefined && { abstain_reason: abstainReason }),
      served_model: servedModel,
      ...(hunk.ir_gate !== undefined && { ir_gate: hunk.ir_gate }),
      ...(hunk.pr !== undefined && { pr: hunk.pr }),
    };
    results.push(result);
    opts.onResult?.(result, index, opts.hunks.length);
  }
  return results;
}

export function summarize(
  results: readonly BehaviourResult[],
  meta: { thresholds: BehaviourThresholds; model: string; dataset?: string; engine?: string; generatedAt?: string },
): BehaviourSummary {
  const labels: Record<BehaviourLabel, number> = { steering: 0, real: 0 };
  const predicted: Record<PredictedLabel, number> = { steering: 0, real: 0, abstain: 0 };
  const abstainReasons: Record<string, number> = {};
  const servedModels: Record<string, number> = {};
  for (const result of results) {
    labels[result.label] += 1;
    predicted[result.predicted] += 1;
    if (result.abstain_reason !== undefined) abstainReasons[result.abstain_reason] = (abstainReasons[result.abstain_reason] ?? 0) + 1;
    const served = result.served_model ?? "unknown";
    servedModels[served] = (servedModels[served] ?? 0) + 1;
  }
  const gated = results.filter((result) => result.ir_gate !== undefined);
  return {
    schema: "steering_behaviour_summary_v1",
    shadow_only: true,
    question_id: STEERING_BEHAVIOUR_QUESTION_ID,
    thresholds: { ...meta.thresholds },
    model: meta.model,
    served_models: servedModels,
    dataset: meta.dataset ?? null,
    engine: meta.engine ?? null,
    generated_at: meta.generatedAt ?? new Date().toISOString(),
    labels,
    predicted,
    abstain_reasons: abstainReasons,
    vs_dataset: agreement(results.map((result) => ({ reference: result.label, predicted: result.predicted }))),
    vs_ir_gate: gated.length === 0 ? null : agreement(gated.map((result) => ({ reference: result.ir_gate, predicted: result.predicted }))),
  };
}

/** Writes `results.jsonl` and `summary.json` into `outDir` (created) and nowhere else. */
export function writeReviewArtifacts(outDir: string, results: readonly BehaviourResult[], summary: BehaviourSummary): { results: string; summary: string } {
  const dir = resolve(outDir);
  mkdirSync(dir, { recursive: true });
  const paths = { results: join(dir, RESULTS_FILE), summary: join(dir, SUMMARY_FILE) };
  writeFileSync(paths.results, results.map((result) => JSON.stringify(result)).join("\n") + (results.length > 0 ? "\n" : ""));
  writeFileSync(paths.summary, `${JSON.stringify(summary, null, 2)}\n`);
  return paths;
}
