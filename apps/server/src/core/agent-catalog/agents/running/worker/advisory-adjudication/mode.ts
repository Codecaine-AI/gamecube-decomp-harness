// Effective adjudication mode (plan §6.5, §6.9, §11 item 21): enforce runs
// only with enforcement-qualified thresholds for the decision model; any
// other configuration downgrades enforce to shadow and says why. off and
// shadow pass through unchanged and never read the thresholds.
import type { AdvisoryAdjudicationMode } from "@server/core/game-registry/runtime-options.js";

import {
  ENFORCEMENT_MAX_FALSE_ACCEPT_UPPER,
  ENFORCEMENT_MIN_HELDOUT_NEGATIVE_GROUPS,
  ENFORCEMENT_MIN_HELDOUT_POSITIVE_GROUPS,
  thresholdsFor,
  type AdvisoryAdjudicationConfig,
} from "./config.js";

export type { AdvisoryAdjudicationMode };

export type ModeDowngradeReason =
  /** The config has no thresholds for the decision model. */
  | "no-thresholds"
  /** The thresholds are recorded as exploratory (uncalibrated or failing a bar). */
  | "not-enforcement-qualified"
  /** Marked enforcement-qualified, but the recorded evidence misses a bar of §6.9. */
  | "qualification-evidence-insufficient";

export interface EffectiveMode {
  mode: AdvisoryAdjudicationMode;
  downgradedReason?: ModeDowngradeReason;
}

/**
 * Why the thresholds for `model` cannot gate enforce, or null when they can:
 * qualification `enforcement-qualified`, label-set and split hashes recorded,
 * ≥ 29 held-out negative and ≥ 10 positive groups, and an upper bound within
 * the config cap (itself never above 0.10). The level alone is not trusted, so
 * a hand-edited config cannot switch enforce on.
 */
export function enforcementDisqualification(
  config: AdvisoryAdjudicationConfig,
  model: string = config.model,
): ModeDowngradeReason | null {
  const thresholds = thresholdsFor(config, model);
  if (!thresholds) return "no-thresholds";
  if (thresholds.qualification !== "enforcement-qualified") return "not-enforcement-qualified";
  const heldout = thresholds.heldout;
  const cap = Math.min(config.maxFalseAcceptUpper, ENFORCEMENT_MAX_FALSE_ACCEPT_UPPER);
  const qualified =
    thresholds.labelSetHash !== undefined &&
    thresholds.splitHash !== undefined &&
    heldout !== undefined &&
    heldout.negatives >= ENFORCEMENT_MIN_HELDOUT_NEGATIVE_GROUPS &&
    heldout.positives >= ENFORCEMENT_MIN_HELDOUT_POSITIVE_GROUPS &&
    heldout.falseAccepts <= heldout.negatives &&
    heldout.upper95 <= cap;
  return qualified ? null : "qualification-evidence-insufficient";
}

/** `requested` with enforce downgraded to shadow unless the thresholds for `model` are enforcement-qualified. */
export function effectiveMode(
  requested: AdvisoryAdjudicationMode,
  config: AdvisoryAdjudicationConfig,
  model: string = config.model,
): EffectiveMode {
  if (requested !== "enforce") return { mode: requested };
  const reason = enforcementDisqualification(config, model);
  return reason === null ? { mode: "enforce" } : { mode: "shadow", downgradedReason: reason };
}
