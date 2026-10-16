// The behaviour question (plan sms-real-codegen §4 "Jev"): asked of Jev per
// hunk by the offline steering-behaviour-review job only. It has its own
// question id and its own thresholds, keyed by that question id. The live
// worker's justified-advisory question (advisory-adjudication/question.ts) and
// its model-keyed thresholds (advisory-adjudication/config.json) are neither
// read nor changed here. Changing the wording invalidates the thresholds.
import type { BoolQuestion } from "@agent-kernel/kernel/model-nodes";

export const STEERING_BEHAVIOUR_QUESTION_ID = "steering_behaviour_change";

export const STEERING_BEHAVIOUR_QUESTION: Readonly<BoolQuestion> = Object.freeze({
  type: "bool",
  instructions:
    "A decompilation change replaced the C code in `removed` with the C code in `added` inside function `function` of `file`. Does the added code behave differently from the removed code for any input, ignoring register allocation, instruction order and stack layout?",
  criteria: Object.freeze({
    true: "For some input the added code computes a different value, has a different side effect, calls something different, or takes a different control path than the removed code (a real behaviour change).",
    false:
      "For every input the added code behaves exactly like the removed code; the edit only changes how the same behaviour is written (temporaries, operand order, declaration order, casts, inline helpers), which can only affect register allocation, instruction order or stack layout.",
  }),
});

export type BehaviourQualification = "exploratory" | "enforcement-qualified";

export interface BehaviourThresholds {
  /** p(behaviour differs) at or above this: the hunk is "real". */
  passAt: number;
  /** p(behaviour differs) at or below this: the hunk is "steering". Between the two: abstain. */
  failAt: number;
  qualification: BehaviourQualification;
}

/**
 * Thresholds keyed by question id, never by model: the job is shadow-only and
 * uncalibrated, so these bars are exploratory. They are independent of the
 * advisory adjudication's model-keyed table.
 */
export const STEERING_BEHAVIOUR_THRESHOLDS: Readonly<Record<string, Readonly<BehaviourThresholds>>> = Object.freeze({
  [STEERING_BEHAVIOUR_QUESTION_ID]: Object.freeze({ passAt: 0.8, failAt: 0.2, qualification: "exploratory" as const }),
});

/** The thresholds for `questionId`; throws for a question without an entry. */
export function behaviourThresholdsFor(questionId: string = STEERING_BEHAVIOUR_QUESTION_ID): BehaviourThresholds {
  const entry = Object.hasOwn(STEERING_BEHAVIOUR_THRESHOLDS, questionId) ? STEERING_BEHAVIOUR_THRESHOLDS[questionId] : undefined;
  if (!entry) throw new Error(`steering-behaviour-review: no thresholds for question ${questionId}`);
  return { ...entry };
}

export type SteeringBehaviourQuestions = { [STEERING_BEHAVIOUR_QUESTION_ID]: BoolQuestion };

/** The decide question set, carrying the question-keyed bars. */
export function steeringBehaviourQuestions(thresholds: Pick<BehaviourThresholds, "passAt" | "failAt"> = behaviourThresholdsFor()): SteeringBehaviourQuestions {
  return {
    [STEERING_BEHAVIOUR_QUESTION_ID]: {
      type: "bool",
      instructions: STEERING_BEHAVIOUR_QUESTION.instructions,
      criteria: { true: STEERING_BEHAVIOUR_QUESTION.criteria.true, false: STEERING_BEHAVIOUR_QUESTION.criteria.false },
      passAt: thresholds.passAt,
      failAt: thresholds.failAt,
    },
  };
}
