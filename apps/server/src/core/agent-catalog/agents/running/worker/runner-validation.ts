import type { WorkerStackPolicyResult } from "@server/core/validation/stack/stack-check.js";
import type { WorkerSteeringResult } from "@server/core/validation/steering/steering-check.js";

export interface WorkerRunnerValidation {
  status:
    | "passed"
    | "failed"
    | "skipped"
    | "build_failed"
    | "snapshot_unavailable"
    | "no_official_score_change"
    | "target_regressed"
    | "same_unit_regression"
    /** stop_at_frame games: every function the attempt changed differs only in the stack frame. */
    | "stack_only_perturbation"
    /** Steering gate enforce: the match depends on behaviour-identical edits, or the gate could not certify the attempt. */
    | "steering_located";
  reasons: string[];
  command?: string;
  exitCode?: number;
  summaryPath?: string;
  baselinePath?: string;
  reportPath?: string;
  diffPath?: string;
  objectTarget?: string;
  stdoutPath?: string;
  stderrPath?: string;
  target?: {
    unit: string;
    symbol: string;
    before: number | null;
    after: number | null;
    improved: boolean;
    exact: boolean;
  };
  regressions?: Array<{
    kind: "unit" | "function" | "section";
    unit: string;
    item: string;
    before: number;
    after: number;
  }>;
  improvements?: Array<{
    kind: "unit" | "function" | "section";
    unit: string;
    item: string;
    before: number;
    after: number;
  }>;
  /** stop_at_frame games only: stack-frame classification of the attempt. */
  stackPolicy?: WorkerStackPolicyResult;
  /** Steering gate shadow/enforce: the gate's result for this attempt (shadow never changes `status`). */
  steering?: WorkerSteeringResult;
  postReturnCheck?: {
    status: "passed" | "failed" | "skipped";
    reasons: string[];
    command?: string;
    exitCode?: number;
    summaryPath?: string;
    stdoutPath?: string;
    stderrPath?: string;
  };
}
