// The one decision asked per kept advisory warning (plan §6.5 step 2). The
// wording is R3's BOOL_JUSTIFIED, the question its live Jev calibration notes
// were measured with (R3 §9); it names the `finding`, `hunk` and
// `justification` fields of the advisory state (state.ts). Changing the
// wording invalidates calibrated thresholds.
import type { BoolQuestion } from "@agent-kernel/kernel/model-nodes";

import type { AdvisoryThresholds } from "./config.js";

export const JUSTIFIED_QUESTION_ID = "justified";

export const JUSTIFIED_QUESTION: Readonly<BoolQuestion> = Object.freeze({
  type: "bool",
  instructions:
    "A decompilation lint flagged the code in `hunk` for `finding`. The agent kept the code and wrote `justification`. Does the justification give a concrete, verifiable reason that the flagged pattern is required to match the original binary?",
  criteria: Object.freeze({
    true: "The justification names a concrete reason tied to matching the original assembly or binary (for example an objdiff result, a specific instruction, offset, or stack layout) and is consistent with the hunk.",
    false:
      "The justification is empty, vague, generic, a style preference, contradicts the hunk, or gives no reason tied to matching the binary.",
  }),
});

export type JustifiedQuestions = { [JUSTIFIED_QUESTION_ID]: BoolQuestion };

/** The decide-check question set, with the configured bars as the question's thresholds. */
export function justifiedQuestions(thresholds: Pick<AdvisoryThresholds, "passAt" | "failAt">): JustifiedQuestions {
  return {
    [JUSTIFIED_QUESTION_ID]: {
      type: "bool",
      instructions: JUSTIFIED_QUESTION.instructions,
      criteria: { true: JUSTIFIED_QUESTION.criteria.true, false: JUSTIFIED_QUESTION.criteria.false },
      passAt: thresholds.passAt,
      failAt: thresholds.failAt,
    },
  };
}
