// The Jev seam. The review talks to a BehaviourJudge; the production judge
// asks the node kernel's `decide` (the same path the advisory adjudication and
// calibration use: Jev served through Pi), tests inject a fake. The judge only
// answers; it records nothing outside the kernel database it was given.
import { createHash } from "node:crypto";

import type { DecisionOutcome } from "@agent-kernel/kernel/model-nodes";

import { boundHunk } from "@server/core/agent-catalog/agents/running/worker/advisory-adjudication/state.js";
import type { WorkerNodeKernel } from "@server/infrastructure/kernel/nodes/node-kernel.js";

import type { BehaviourHunk } from "./dataset.js";
import { STEERING_BEHAVIOUR_QUESTION_ID, steeringBehaviourQuestions, type BehaviourThresholds, type SteeringBehaviourQuestions } from "./question.js";

/** The decision state Jev sees: code only, each side bounded like an advisory hunk. */
export interface BehaviourState {
  [key: string]: string;
  file: string;
  function: string;
  removed: string;
  added: string;
}

export interface BehaviourAnswer {
  /** The question that was asked (always STEERING_BEHAVIOUR_QUESTION_ID from the production judge). */
  questionId: string;
  /** p(the added code behaves differently); null when the decision has no probability. */
  probability: number | null;
  /** Why no probability (engine-error, refusal, ...). */
  abstainReason?: string;
  /** The model that served the decision. */
  servedModel: string;
}

export interface BehaviourJudge {
  /** The requested decision model. */
  readonly model: string;
  judge(hunk: BehaviourHunk, state: BehaviourState): Promise<BehaviourAnswer>;
}

export function behaviourState(hunk: BehaviourHunk): BehaviourState {
  return {
    file: hunk.file,
    function: hunk.function,
    removed: boundHunk(hunk.removed) ?? "",
    added: boundHunk(hunk.added) ?? "",
  };
}

export function behaviourDecisionName(hunkId: string): string {
  return `JudgeSteeringBehaviour:${hunkId}`;
}

/** Deterministic, so a rerun into the same kernel database replays instead of re-paying. */
export function behaviourRequestId(parts: { parentRunId: string; model: string; hunkId: string; state: BehaviourState; questions: SteeringBehaviourQuestions }): string {
  const digest = createHash("sha256")
    .update(JSON.stringify({ parent: parts.parentRunId, state: parts.state, questions: parts.questions }))
    .digest("hex")
    .slice(0, 24);
  return `steering-behaviour:${parts.model}:${parts.hunkId}:${digest}`;
}

/** A judge over a node kernel (live Jev, or the kernel's fake classifier). */
export function kernelBehaviourJudge(params: {
  kernel: Pick<WorkerNodeKernel, "decide">;
  parentRunId: string;
  model: string;
  thresholds: Pick<BehaviourThresholds, "passAt" | "failAt">;
}): BehaviourJudge {
  const questions = steeringBehaviourQuestions(params.thresholds);
  return {
    model: params.model,
    async judge(hunk, state) {
      const outcome: DecisionOutcome<SteeringBehaviourQuestions> = await params.kernel.decide(behaviourDecisionName(hunk.id), state, {
        questions,
        model: params.model,
        parentRunId: params.parentRunId,
        trigger: "judge",
        requestId: behaviourRequestId({ parentRunId: params.parentRunId, model: params.model, hunkId: hunk.id, state, questions }),
      });
      const answer = outcome.answers[STEERING_BEHAVIOUR_QUESTION_ID];
      const answered = typeof answer?.probability === "number" && answer.abstainReason !== "engine-error" && answer.abstainReason !== "refusal";
      return {
        questionId: STEERING_BEHAVIOUR_QUESTION_ID,
        probability: answered ? answer!.probability! : null,
        ...(!answered && { abstainReason: answer?.abstainReason ?? outcome.abstainReason ?? outcome.error?.kind ?? "no-answer" }),
        servedModel: outcome.model,
      };
    },
  };
}
