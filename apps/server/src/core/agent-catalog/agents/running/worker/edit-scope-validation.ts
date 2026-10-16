import { resolve } from "node:path";
import { changedSourcePathsFromDiff } from "@server/core/validation/format/clang-format.js";
import {
  EDIT_SCOPE_INSTRUCTION,
  editScopeRejectedHunks,
  orderingActive,
  orderingEnforced,
  runEditScope,
  type EditScopeHunk,
  type EditScopeOrderingPolicy,
  type EditScopeResult,
  type EditScopeRunner,
} from "@server/core/validation/edit-scope/edit-scope.js";
import { loadBoundUnusedChecks } from "@server/core/validation/edit-scope/unused-evidence.js";
import { UNUSED_BODY_INSTRUCTION } from "@server/core/validation/steering/steering-check.js";
import type { WorkerRunnerValidation } from "./runner-validation.js";

/**
 * Worker side of the order-and-scope fence (plan v3 section 3). The gate runs
 * after the micro-gates and before the steering gate, on every attempt that
 * changed source while the game's ordering is `shadow` or `enforce`; `off` or
 * no policy never runs it (Melee is unchanged). The check is cumulative from
 * the claim base revision (`git diff <baseRev>` plus untracked files).
 *
 * - shadow: the result is recorded on the validation (`editScope`), the
 *   status never changes.
 * - enforce: a `reject` verdict, or a check that could not run (tool
 *   unavailable, malformed output, no base revision), turns an otherwise
 *   passing attempt into `edit_scope_rejected`. Unlike the other micro-gates,
 *   an unavailable tool is a failure here. An attempt that already failed
 *   keeps its status and still records the result.
 *
 * UNUSED reconstructions need the steering gate's `unused_checks`, which run
 * after this gate. The pre-steering check passes `--unused-checks` only when a
 * previous attempt left evidence; its `unused_unverified` hunks are deferred
 * (the attempt stays `passed` so steering can certify them) while
 * `dead_unused` rejects as usual. After steering, `evaluateWorkerEditScopeUnused`
 * re-runs the check with THIS attempt's bound `unused_checks`; in enforce a
 * dead or still-unverified UNUSED body, a failed re-check, or no steering
 * decision rejects the attempt. Integration and publication check again.
 */
export interface WorkerEditScopeGateOptions {
  policy: EditScopeOrderingPolicy;
  /** The claim's immutable base revision; without one the check cannot run (enforce rejects). */
  baseRev: string | null | undefined;
  runner: EditScopeRunner;
  /** Sandbox-visible (workspace-relative) JSON file with a previous attempt's steering `unused_checks`. */
  unusedChecksPath?: string;
  /** Writes a file into the sandbox workspace (workspace-relative path); the post-steering UNUSED re-check needs it. */
  uploadToSandbox?: (workspacePath: string, content: string) => Promise<void>;
}

const UNUSED_VERDICTS: readonly EditScopeHunk["verdict"][] = ["dead_unused", "unused_unverified"];

export const UNUSED_UNVERIFIED_INSTRUCTION =
  "An UNUSED body may only be reconstructed with a bound `inlined` stub-test certificate: the steering gate must show that emptying the body makes a same-unit caller worse. Without that certificate, restore the upstream stub (keep the signature, empty body).";

/** Reason prefix of an enforced post-steering UNUSED rejection. */
export const EDIT_SCOPE_UNUSED_PREFIX = "edit_scope (UNUSED):";

function hunkText(hunk: EditScopeHunk): string {
  const where = `${hunk.file}${hunk.line != null ? `:${hunk.line}` : ""}`;
  const owner = hunk.owner_unit ? `, owner ${hunk.owner_unit}` : "";
  const name = hunk.class ? `${hunk.class} (${hunk.verdict}${owner})` : hunk.verdict;
  return `${name} at ${where}${hunk.reason ? `: ${hunk.reason}` : ""}`;
}

function hunksText(hunks: readonly EditScopeHunk[]): string {
  return `${hunks.slice(0, 6).map(hunkText).join("; ")}${hunks.length > 6 ? `; +${hunks.length - 6} more` : ""}`;
}

/** The UNUSED instruction(s) matching a set of UNUSED hunks. */
export function editScopeUnusedInstruction(hunks: readonly EditScopeHunk[]): string {
  const dead = hunks.some((hunk) => hunk.verdict === "dead_unused");
  const unverified = hunks.some((hunk) => hunk.verdict === "unused_unverified") || hunks.length === 0;
  return [dead ? UNUSED_BODY_INSTRUCTION : null, unverified ? UNUSED_UNVERIFIED_INSTRUCTION : null].filter(Boolean).join(" ");
}

/** The gate runs when the game's ordering is active and the attempt changed source. */
export function editScopeGateApplies(params: {
  policy: EditScopeOrderingPolicy | null | undefined;
  postAttemptDiffText?: string;
}): boolean {
  if (!params.policy || !orderingActive(params.policy.mode)) return false;
  return changedSourcePathsFromDiff(params.postAttemptDiffText ?? "").length > 0;
}

/** `edit_scope.py check` arguments for the worker gate (without `--policy-json` / `--json`). */
export function workerEditScopeArgs(params: { baseRev: string; targetUnit?: string | null; unusedChecksPath?: string | null }): string[] {
  return [
    "check",
    "--repo",
    ".",
    "--base-rev",
    params.baseRev,
    "--worktree",
    ...(params.targetUnit ? ["--target-unit", params.targetUnit] : []),
    ...(params.unusedChecksPath ? ["--unused-checks", params.unusedChecksPath] : []),
  ];
}

/**
 * Folds the pre-steering result into the validation: shadow records only;
 * enforce rejects an otherwise-passing attempt. `unused_unverified` hunks are
 * deferred to the post-steering re-check (recorded, never a rejection here).
 */
export function applyEditScopeToValidation<T extends WorkerRunnerValidation>(validation: T, result: EditScopeResult): T {
  const deferred = (result.report?.hunks ?? []).filter((hunk) => hunk.verdict === "unused_unverified");
  const recorded = { ...validation, editScope: result, ...(deferred.length > 0 ? { editScopeDeferredUnused: deferred } : {}) };
  if (validation.status !== "passed" || !orderingEnforced(result.mode)) return recorded;
  if (result.error || !result.report) {
    return {
      ...recorded,
      status: "edit_scope_rejected",
      reasons: [...validation.reasons, `edit_scope: the scope check could not run (${result.error ?? "no report"}). ${EDIT_SCOPE_INSTRUCTION}`],
    };
  }
  if (result.report.verdict === "pass") return recorded;
  const blocking = editScopeRejectedHunks(result.report).filter((hunk) => hunk.verdict !== "unused_unverified");
  if (blocking.length === 0 && deferred.length > 0) return recorded;
  const onlyUnused = blocking.length > 0 && blocking.every((hunk) => UNUSED_VERDICTS.includes(hunk.verdict));
  const reason = onlyUnused
    ? `${EDIT_SCOPE_UNUSED_PREFIX} ${hunksText(blocking)}. ${editScopeUnusedInstruction(blocking)}`
    : `edit_scope: ${blocking.length > 0 ? hunksText(blocking) : "rejected"}. ${EDIT_SCOPE_INSTRUCTION}`;
  return { ...recorded, status: "edit_scope_rejected", reasons: [...validation.reasons, reason] };
}

/** Runs the gate when it applies and folds its result into the validation; anything else is returned unchanged. */
export async function evaluateWorkerEditScopeGate<T extends WorkerRunnerValidation>(params: {
  validation: T;
  options: WorkerEditScopeGateOptions | null | undefined;
  targetUnit: string;
  outputDir: string;
  attemptIndex: number;
  postAttemptDiffText?: string;
}): Promise<T> {
  const options = params.options;
  if (!options || !editScopeGateApplies({ policy: options.policy, postAttemptDiffText: params.postAttemptDiffText })) {
    return params.validation;
  }
  const result: EditScopeResult = options.baseRev
    ? await runEditScope({
        runner: options.runner,
        where: "sandbox",
        args: workerEditScopeArgs({ baseRev: options.baseRev, targetUnit: params.targetUnit, unusedChecksPath: options.unusedChecksPath }),
        policy: options.policy,
        artifactPath: resolve(params.outputDir, `attempt-${params.attemptIndex}.edit_scope.json`),
      })
    : { mode: options.policy.mode, report: null, error: "no claim base revision", durationMs: 0 };
  return applyEditScopeToValidation(params.validation, result);
}

/** Where the worker cycle uploads a previous attempt's `unused_checks` inside the sandbox workspace. */
export function sandboxUnusedChecksPath(attemptIndex: number): string {
  return `build/edit_scope/attempt-${attemptIndex}.unused_checks.json`;
}

/**
 * After steering: when the pre-steering check saw UNUSED hunks and the attempt
 * is still `passed`, re-run the check with this attempt's bound steering
 * `unused_checks` (uploaded to the sandbox). Shadow records `editScopeUnused`
 * only; enforce rejects a dead or still-unverified UNUSED body, a re-check
 * that could not run, or deferred UNUSED hunks without a steering decision.
 */
export async function evaluateWorkerEditScopeUnused<T extends WorkerRunnerValidation>(params: {
  validation: T;
  options: WorkerEditScopeGateOptions | null | undefined;
  targetUnit: string;
  outputDir: string;
  attemptIndex: number;
}): Promise<T> {
  const options = params.options;
  const first = params.validation.editScope;
  if (!options || !first?.report || params.validation.status !== "passed") return params.validation;
  if (!first.report.hunks.some((hunk) => UNUSED_VERDICTS.includes(hunk.verdict))) return params.validation;
  const mode = options.policy.mode;
  const started = Date.now();
  let result: EditScopeResult;
  const checks = await loadBoundUnusedChecks(params.validation.steering, { baseRev: options.baseRev });
  if (!checks) {
    const why = params.validation.steering?.error ?? (params.validation.steering ? "no decision" : "steering did not run");
    result = { mode, report: null, error: `no steering decision certifies the UNUSED reconstructions (${why})`, durationMs: Date.now() - started };
  } else if (!options.baseRev) {
    result = { mode, report: null, error: "no claim base revision", durationMs: Date.now() - started };
  } else if (!options.uploadToSandbox) {
    result = { mode, report: null, error: "no sandbox upload for the UNUSED evidence", durationMs: Date.now() - started };
  } else {
    const path = sandboxUnusedChecksPath(params.attemptIndex);
    let uploadError: string | null = null;
    try {
      await options.uploadToSandbox(path, JSON.stringify(checks));
    } catch (error) {
      uploadError = error instanceof Error ? error.message : String(error);
    }
    result = uploadError
      ? { mode, report: null, error: `UNUSED evidence upload failed: ${uploadError}`, durationMs: Date.now() - started }
      : await runEditScope({
          runner: options.runner,
          where: "sandbox",
          args: workerEditScopeArgs({ baseRev: options.baseRev, targetUnit: params.targetUnit, unusedChecksPath: path }),
          policy: options.policy,
          artifactPath: resolve(params.outputDir, `attempt-${params.attemptIndex}.edit_scope.unused.json`),
        });
  }
  const recorded = { ...params.validation, editScopeUnused: result };
  if (!orderingEnforced(mode)) return recorded;
  if (result.error || !result.report) {
    const reason = `${EDIT_SCOPE_UNUSED_PREFIX} the UNUSED re-check could not run (${result.error ?? "no report"}). ${editScopeUnusedInstruction([])}`;
    return { ...recorded, status: "edit_scope_rejected", reasons: [...params.validation.reasons, reason] };
  }
  const rejecting = editScopeRejectedHunks(result.report);
  if (result.report.verdict === "pass" && rejecting.length === 0) return recorded;
  const unused = rejecting.filter((hunk) => UNUSED_VERDICTS.includes(hunk.verdict));
  const other = rejecting.filter((hunk) => !UNUSED_VERDICTS.includes(hunk.verdict));
  const reasons = [
    ...(unused.length > 0 ? [`${EDIT_SCOPE_UNUSED_PREFIX} ${hunksText(unused)}. ${editScopeUnusedInstruction(unused)}`] : []),
    ...(other.length > 0 || unused.length === 0 ? [`edit_scope: ${other.length > 0 ? hunksText(other) : "rejected"}. ${EDIT_SCOPE_INSTRUCTION}`] : []),
  ];
  return { ...recorded, status: "edit_scope_rejected", reasons: [...params.validation.reasons, ...reasons] };
}

/** Repair text for an enforced UNUSED rejection, or null when the rejection is not about UNUSED bodies. */
export function editScopeUnusedRepairInstruction(validation: Pick<WorkerRunnerValidation, "status" | "reasons" | "editScope" | "editScopeUnused">): string | null {
  if (validation.status !== "edit_scope_rejected") return null;
  if (!validation.reasons.some((reason) => reason.startsWith(EDIT_SCOPE_UNUSED_PREFIX))) return null;
  // The post-steering re-check, when it ran, is the latest word on the UNUSED bodies.
  const report = validation.editScopeUnused ? validation.editScopeUnused.report : validation.editScope?.report;
  return editScopeUnusedInstruction((report?.hunks ?? []).filter((hunk) => UNUSED_VERDICTS.includes(hunk.verdict)));
}
