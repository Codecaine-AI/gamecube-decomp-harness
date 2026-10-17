import type { WorkerStackPolicyResult } from "@server/core/validation/stack/stack-check.js";
import type { WorkerSteeringResult } from "@server/core/validation/steering/steering-check.js";
import type { EditScopeHunk, EditScopeResult } from "@server/core/validation/edit-scope/edit-scope.js";

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
    | "steering_located"
    /** Ordering enforce: the order-and-scope fence rejected the attempt (a not-ready/unresolved class or gated reference), or could not run. */
    | "edit_scope_rejected";
  reasons: string[];
  command?: string;
  exitCode?: number;
  summaryPath?: string;
  baselinePath?: string;
  reportPath?: string;
  diffPath?: string;
  /** Sandbox path of the attempt's full objdiff unit report when only its summary came back to the host. */
  sandboxReportPath?: string;
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
  /**
   * Enforce, claimed target `unverified_match`: the trusted base and the
   * target-only gate run against it (steering-validation.ts
   * `UnverifiedTargetEvidence`). Certification is re-derived from it and
   * `steering`; only a certified attempt can be selected without raising the
   * score, and only its integration clears the target's unverified state.
   */
  unverifiedTarget?: {
    unit: string;
    symbol: string;
    trustedBaseRev: string | null;
    baseline: WorkerSteeringResult | null;
    skipped?: string;
  };
  /**
   * Enforce, target with open verification (`unverified_match`, or the latest
   * attempt `steering_located`): the attempt did not raise the target score,
   * so the score verdict was set aside and the attempt went on to every other
   * gate (certification-lane.ts). `pending` until the steering gate ran; only
   * `certified` (the gate certified the target) or `restored` (a base-identity
   * proof) stays `passed`; `rejected` restores the score verdict.
   */
  certificationLane?: {
    reason: "unverified_match" | "steering_located";
    scoreStatus: "target_regressed" | "no_official_score_change";
    scoreReasons: string[];
    outcome: "pending" | "certified" | "restored" | "rejected";
    restoration?: {
      trustedBaseRev: string;
      claimBaseRev: string;
      sourcePath: string;
      inputs: Array<{ path: string; blob: string | null; generated?: boolean }>;
      dependenciesKnown: boolean;
      proofHash: string;
    };
    /** Why a base-identity proof was not established (informational). */
    restorationRefused?: string;
  };
  /** Ordering shadow/enforce: the order-and-scope fence's result for this attempt (shadow never changes `status`). */
  editScope?: EditScopeResult;
  /** `unused_unverified` hunks the pre-steering check deferred to the post-steering UNUSED re-check. */
  editScopeDeferredUnused?: EditScopeHunk[];
  /** The post-steering re-check with this attempt's steering `unused_checks` (only when the first check saw UNUSED hunks). */
  editScopeUnused?: EditScopeResult;
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
