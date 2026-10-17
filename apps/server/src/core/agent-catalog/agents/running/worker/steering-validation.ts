import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import type { StackFramePolicy, SteeringGateMode } from "@server/core/game-registry/resolver.js";
import type { StateStore } from "@server/core/orchestrator-state";
import { recordSteeringObservation, type SteeringObservationInput } from "@server/core/harness-runtime/run-state/steering.js";
import { sameUnit, type UnitKeyGame } from "@server/core/harness-runtime/run-state/unit-key.js";
import { queueSteeringExplainJob } from "@server/core/harness-runtime/run-state/steering-explain.js";
import { steeringExplainToolHash } from "@server/core/harness-runtime/run-state/steering-explain-tool-hash.js";
import {
  recordEvidenceReviewRequest,
  type EvidenceReviewRecordOutcome,
  type EvidenceReviewRequestInput,
} from "@server/core/harness-runtime/run-state/evidence-reviews.js";
import type { RunGameMetadata } from "@server/core/shared/types";
import { steeringGateActive, steeringGateEnforced } from "@server/core/tools/steering-gate.js";
import { stackOnlyPerturbationReason, stopsAtFrame } from "@server/core/validation/stack/stack-check.js";
import {
  runWorkerSteeringGate,
  steeringGateBudgetMs,
  steeringRejectionReason,
  type SteeringFunctionDecision,
  type SteeringProbe,
  type SteeringRunner,
  type WorkerSteeringResult,
} from "@server/core/validation/steering/steering-check.js";
import { changedSourcePathsFromDiff } from "@server/core/validation/format/clang-format.js";
import type { UnverifiedMatchCertification } from "@server/core/validation/steering/unverified-certification.js";
import type { WorkerRunnerValidation } from "./runner-validation.js";

export { UNVERIFIED_MATCH_CERTIFICATION_KEY, type UnverifiedMatchCertification } from "@server/core/validation/steering/unverified-certification.js";

/**
 * Worker side of the SMS steering gate (plan 3.3/3.4). The gate runs after
 * every other worker-change gate on an attempt that would otherwise pass and
 * changed source. `off` never runs it; `shadow` records the result on the
 * validation and never changes the status; `enforce` turns anything but a
 * certified `pass` into `steering_located` (or `stack_only_perturbation` when
 * the removable edits only bought the stack frame under `stop_at_frame`). A
 * `rule_violation` (a dead UNUSED body) also lands on `steering_located`; its
 * reason names the rule and carries UNUSED_BODY_INSTRUCTION.
 */
export interface WorkerSteeringGateOptions {
  mode: SteeringGateMode;
  /** The claim's immutable base revision; without one the gate cannot run (enforce rejects). */
  baseRev: string | null | undefined;
  /** Host game checkout (`globals.repoRoot`), never the sandbox path. */
  hostRepoRoot: string;
  cacheDir: string;
  runner: SteeringRunner;
  approvalsPath?: string;
  lessonsPath?: string;
  budgetMs?: number;
  /**
   * The claimed target is `unverified_match` (its match is not certified).
   * Enforce: an attempt that edits the target and passes the claim-base gate
   * also gets a target-only gate run against `baseRev`, the trusted base the
   * backfill recorded with the row (the claim base still holds the
   * unexplained code). Only that run's pass for the target's own row
   * certifies it; a missing trusted base never does. An attempt that would
   * retire the target without it is never banked.
   */
  unverifiedTarget?: { unit: string; symbol: string; baseRev: string | null; game?: UnitKeyGame } | null;
}

/** Where the trusted-base run writes its step artifacts: apart from the claim-base run's. */
export const UNVERIFIED_BASELINE_DIR = "unverified-baseline";

/** The repair instruction for an `unverified_match` target whose attempt the gate did not certify. */
export const UNVERIFIED_MATCH_INSTRUCTION =
  "This target is \"100% but unverified\": nothing in its current source is certified, because the steering gate could not verify it is the real code. "
  + "Follow the unverified_match steps in the method: remove edits without evidence at this site, replace what the gate could not explain with what the original source really had, and submit a version the gate certifies (pass) for this function. "
  + "A lower score that certifies is accepted; the unchanged code, or an attempt that does not change this function, never counts.";

/**
 * The claimed target. `game` (a game id or game metadata) lets a gate row's
 * unit (no module prefix: `Animal/AnimalBase`) match the worker's report-named
 * unit (`mario/Animal/AnimalBase`, `sameUnit`); without it units compare as written.
 */
export type UnverifiedTargetRef = { unit: string; symbol: string; game?: UnitKeyGame };

function ownRows(result: WorkerSteeringResult, target: UnverifiedTargetRef) {
  return result.decision?.functions.filter((fn) => sameUnit(target.game, fn.unit, target.unit) && fn.name === target.symbol) ?? [];
}

/**
 * The claim-base gate passed the attempt and this attempt edited the target:
 * an enforce run with a decision nothing rejects whose target row (exact
 * unit and symbol) is `pass` with at least one of the attempt's edit groups
 * touching it. A same-symbol row from another unit never stands in, and an
 * untouched target (unchanged, unrelated-only diff) is no candidate.
 */
export function attemptEditsUnverifiedTarget(result: WorkerSteeringResult | null | undefined, target: UnverifiedTargetRef): boolean {
  if (!result || result.mode !== "enforce" || result.error || !result.decision) return false;
  if (steeringRejectionReason(result) !== null) return false;
  const own = ownRows(result, target);
  // `groups`: this attempt's edit groups touching the row; none (or absent) means the attempt left it alone.
  return own.length > 0 && own.every((fn) => fn.decision === "pass" && (fn.groups?.length ?? 0) > 0);
}

/**
 * The trusted-base run certifies the complete target version: an enforce run
 * whose certificate passes as a whole (`steeringRejectionReason` null: no tool,
 * budget, link-map or coverage failure, complete reduction, no unresolved
 * group, no rule violation, every considered function `pass`), with the
 * target's own rows (exact unit and symbol) `pass`, complete, and touched by an
 * edit group (the version differs from the trusted base), and the target's
 * unit built and compared. Fails closed: a residual in another function of
 * the unit since the trusted base also keeps the target uncertified.
 */
export function trustedBaselineCertifiesTarget(result: WorkerSteeringResult | null | undefined, target: UnverifiedTargetRef): boolean {
  if (!result || result.mode !== "enforce" || result.error || !result.decision) return false;
  if (steeringRejectionReason(result) !== null) return false;
  const own = ownRows(result, target);
  if (own.length === 0 || !own.every((fn) => fn.decision === "pass" && fn.analysis === "complete" && (fn.groups?.length ?? 0) > 0)) return false;
  const unit = result.decision.units?.find((row) => sameUnit(target.game, row.unit, target.unit));
  return Boolean(unit?.built && unit.compared && unit.exempt === undefined);
}

/**
 * Typed evidence for an `unverified_match` target (`validation.unverifiedTarget`):
 * the trusted base (null fails closed) and the target-only run against it
 * (null when it did not run; `skipped` says why). Certification is re-derived
 * from these results, never read from a stored flag.
 */
export type UnverifiedTargetEvidence = NonNullable<WorkerRunnerValidation["unverifiedTarget"]>;

/** Both runs certify: the claim-base run passed an attempt that edited the target, and the trusted-base run passed the target. */
export function unverifiedTargetCertified(
  claimBase: WorkerSteeringResult | null | undefined,
  evidence: UnverifiedTargetEvidence | null | undefined,
  target: UnverifiedTargetRef,
): boolean {
  if (!evidence || !sameUnit(target.game, evidence.unit, target.unit) || evidence.symbol !== target.symbol || !evidence.trustedBaseRev) return false;
  return attemptEditsUnverifiedTarget(claimBase, target) && trustedBaselineCertifiesTarget(evidence.baseline, target);
}

/**
 * Enforce, `unverified_match` target: the trusted-base run. Runs only for an
 * attempt the claim-base gate passed that edited the target, target-only,
 * within what is left of the gate budget, writing to its own directory.
 */
async function unverifiedBaselineEvidence(params: {
  options: WorkerSteeringGateOptions;
  target: { unit: string; symbol: string; baseRev: string | null };
  validation: WorkerRunnerValidation;
  claimBase: WorkerSteeringResult | null;
  outputDir: string;
  attemptIndex: number;
}): Promise<UnverifiedTargetEvidence> {
  const { options, target } = params;
  const evidence = { unit: target.unit, symbol: target.symbol, trustedBaseRev: target.baseRev || null };
  if (!evidence.trustedBaseRev) return { ...evidence, baseline: null, skipped: "no trusted base revision recorded for the unverified target" };
  if (params.validation.status !== "passed") return { ...evidence, baseline: null, skipped: "the attempt did not pass the claim-base gates" };
  if (!attemptEditsUnverifiedTarget(params.claimBase, target)) {
    return { ...evidence, baseline: null, skipped: "the claim-base steering gate did not pass an edit of this function" };
  }
  const budgetMs = (options.budgetMs ?? steeringGateBudgetMs()) - (params.claimBase?.durationMs ?? 0);
  if (budgetMs <= 0) return { ...evidence, baseline: null, skipped: "the steering gate budget was spent by the claim-base run" };
  const baseline = await runWorkerSteeringGate({
    baseRev: evidence.trustedBaseRev,
    functions: [target.symbol],
    hostRepoRoot: options.hostRepoRoot,
    cacheDir: options.cacheDir,
    outputDir: join(params.outputDir, UNVERIFIED_BASELINE_DIR),
    attemptIndex: params.attemptIndex,
    mode: options.mode,
    runner: options.runner,
    budgetMs,
    approvalsPath: options.approvalsPath,
    lessonsPath: options.lessonsPath,
  });
  return { ...evidence, baseline };
}

/**
 * Enforce, `unverified_match` target: records the typed evidence
 * (`validation.unverifiedTarget`), and turns an attempt that would retire the
 * target (exact, or done up to the stack frame) without certification into
 * `steering_located`.
 */
export function requireCertifiedUnverifiedTarget<T extends WorkerRunnerValidation>(
  validation: T,
  options: WorkerSteeringGateOptions | null | undefined,
  claimBase: WorkerSteeringResult | null,
  evidence: UnverifiedTargetEvidence | null,
): T {
  const target = options?.unverifiedTarget;
  if (!target || !steeringGateEnforced(options.mode)) return validation;
  const recorded = {
    ...validation,
    unverifiedTarget: evidence ?? { unit: target.unit, symbol: target.symbol, trustedBaseRev: target.baseRev || null, baseline: null, skipped: "the attempt did not change source the steering gate could certify" },
  };
  // Exact, or done up to the stack frame (stop_at_frame): either would retire the target.
  if (validation.status !== "passed" || !(validation.target?.exact || validation.stackPolicy?.targetStackOnly === true)) return recorded;
  if (unverifiedTargetCertified(claimBase, recorded.unverifiedTarget, target)) return recorded;
  const why = recorded.unverifiedTarget?.skipped
    ?? (recorded.unverifiedTarget?.baseline?.error
      ? `the steering gate against the trusted base failed: ${recorded.unverifiedTarget.baseline.error}`
      : "the steering gate against the trusted base did not pass this function");
  return {
    ...recorded,
    status: "steering_located",
    reasons: [...validation.reasons, `${UNVERIFIED_MATCH_REASON_PREFIX} ${target.symbol} matches but is not certified (${why}). ${UNVERIFIED_MATCH_INSTRUCTION}`],
  };
}

/** Leads the rejection reason `requireCertifiedUnverifiedTarget` adds. */
export const UNVERIFIED_MATCH_REASON_PREFIX = "unverified_match:";

/**
 * The attempt was rejected only because its `unverified_match` target is not
 * certified (the gate itself rejected nothing): the reason carries
 * UNVERIFIED_MATCH_INSTRUCTION. `game` as on `UnverifiedTargetRef`.
 */
export function unverifiedTargetRejected(validation: Pick<WorkerRunnerValidation, "status" | "reasons" | "steering" | "unverifiedTarget">, game?: UnitKeyGame): boolean {
  if (validation.status !== "steering_located" || !validation.unverifiedTarget || !validation.reasons.some((reason) => reason.startsWith(UNVERIFIED_MATCH_REASON_PREFIX))) return false;
  return !unverifiedTargetCertified(validation.steering, validation.unverifiedTarget, { ...validation.unverifiedTarget, game });
}

/**
 * The checkpoint proof that the trusted-base gate passed this target's own
 * (unit, symbol) row for an attempt the claim-base gate passed. Integration
 * clears the target's `unverified_match` row only when it applies a
 * checkpoint carrying it (whatever the score: exact, a numerical improvement,
 * or stack-only) and its `base_rev` still certifies the row's trusted base at
 * that moment (`unverifiedBaseCertified`), and a zero-delta exact or
 * stack-only checkpoint needs it to be selectable. A claim-base pass alone
 * never certifies: the claim base already holds the unexplained code.
 * Re-derived from the recorded results.
 */
export function unverifiedMatchCertification(params: {
  validation: Pick<WorkerRunnerValidation, "status" | "steering" | "unverifiedTarget">;
  gameId: string;
  unit: string;
  symbol: string;
  baseRev: string | null | undefined;
}): UnverifiedMatchCertification | null {
  const { validation } = params;
  const evidence = validation.unverifiedTarget;
  const target = { unit: params.unit, symbol: params.symbol, game: params.gameId };
  if (!params.gameId || validation.status !== "passed") return null;
  if (!unverifiedTargetCertified(validation.steering, evidence, target) || !evidence?.trustedBaseRev) return null;
  return {
    kind: "unverified_match",
    game_id: params.gameId,
    unit: params.unit,
    symbol: params.symbol,
    mode: "enforce",
    decision: "pass",
    base_rev: evidence.trustedBaseRev,
    artifact_path: evidence.baseline?.artifactPath ?? null,
    claim_base_rev: params.baseRev ?? null,
    claim_artifact_path: validation.steering?.artifactPath ?? null,
  };
}

const STEERING_LESSONS_DIR = "knowledge/sources/injectable/steering_lessons";

/** `games/<id>/` on the host orchestrator checkout for the run's game. */
function hostGameDir(game: Pick<RunGameMetadata, "gameId" | "descriptorPath"> | null | undefined, orchestratorRoot: string): string | null {
  if (game?.descriptorPath) return dirname(game.descriptorPath);
  return game?.gameId ? resolve(orchestratorRoot, "games", game.gameId) : null;
}

/** Curated evidence approvals and the lesson store the gate's `decide` step reads; only paths that exist. */
export function steeringLessonPaths(
  game: Pick<RunGameMetadata, "gameId" | "descriptorPath"> | null | undefined,
  orchestratorRoot: string,
): { approvalsPath?: string; lessonsPath?: string } {
  const gameDir = hostGameDir(game, orchestratorRoot);
  if (!gameDir) return {};
  const approvalsPath = resolve(gameDir, STEERING_LESSONS_DIR, "evidence_approvals.jsonl");
  const lessonsPath = resolve(gameDir, STEERING_LESSONS_DIR, "lessons.jsonl");
  return {
    ...(existsSync(approvalsPath) ? { approvalsPath } : {}),
    ...(existsSync(lessonsPath) ? { lessonsPath } : {}),
  };
}

/**
 * The game's site-bound approvals file (`evidence_approvals.jsonl`, schema in
 * `validation/steering/approvals.ts`), whether or not it exists yet: where an
 * operator's evidence-review approval is written. The gate reads it through
 * `steeringLessonPaths` (only when it exists); legacy rows in it never
 * certify. Null when the game has no directory.
 */
export function steeringApprovalsPath(
  game: Pick<RunGameMetadata, "gameId" | "descriptorPath"> | null | undefined,
  orchestratorRoot: string,
): string | null {
  const gameDir = hostGameDir(game, orchestratorRoot);
  return gameDir ? resolve(gameDir, STEERING_LESSONS_DIR, "evidence_approvals.jsonl") : null;
}

/** Maintainer review rulings (`review_rulings.jsonl` next to the lessons), when the game has them. */
export function steeringRulingsPath(
  game: Pick<RunGameMetadata, "gameId" | "descriptorPath"> | null | undefined,
  orchestratorRoot: string,
): string | null {
  const gameDir = hostGameDir(game, orchestratorRoot);
  const path = gameDir ? resolve(gameDir, STEERING_LESSONS_DIR, "review_rulings.jsonl") : null;
  return path && existsSync(path) ? path : null;
}

/** The steering gate's cache (baseRev materializations) under the game state dir. */
export function steeringCacheDir(stateDir: string): string {
  return resolve(stateDir, "cache", "steering");
}

/**
 * Functions the gate should consider, target first: every function the
 * attempt's measured scores or stack comparison show as changed. The Python
 * side also considers every changed function in the touched units, so this is
 * a hint, not the full set.
 */
export function workerSteeringFunctions(symbol: string, validation: WorkerRunnerValidation): string[] {
  const names = [
    symbol,
    ...(validation.stackPolicy?.perturbation?.changedFunctions ?? []),
    ...(validation.improvements ?? []).filter((row) => row.kind === "function").map((row) => row.item),
    ...(validation.regressions ?? []).filter((row) => row.kind === "function").map((row) => row.item),
  ];
  return [...new Set(names.filter((name) => name && !name.startsWith(".")))];
}

/** The gate runs on an attempt that otherwise passed and changed source, when the game's gate is active. */
export function steeringGateApplies(params: {
  mode: SteeringGateMode | null | undefined;
  validation: Pick<WorkerRunnerValidation, "status">;
  postAttemptDiffText?: string;
}): boolean {
  if (!steeringGateActive(params.mode)) return false;
  if (params.validation.status !== "passed") return false;
  return changedSourcePathsFromDiff(params.postAttemptDiffText ?? "").length > 0;
}

interface MwccFunctionRow {
  unit?: unknown;
  name?: unknown;
  sstar_vs_candidate?: unknown;
}

async function readMwccFunctions(outputDir: string, attemptIndex: number): Promise<MwccFunctionRow[]> {
  try {
    const parsed = JSON.parse(await readFile(resolve(outputDir, `attempt-${attemptIndex}.steering.mwcc.json`), "utf8")) as { functions?: unknown };
    return Array.isArray(parsed.functions) ? parsed.functions as MwccFunctionRow[] : [];
  } catch {
    return [];
  }
}

/**
 * The functions that make the attempt `steering_located` when the only thing
 * the removable (steering) edits bought is the stack frame: every non-pass
 * function is complete, semantically `steering`, and S* differs from the
 * candidate only in the stack frame. Null otherwise.
 */
export async function steeringStackOnlyFunctions(result: WorkerSteeringResult, outputDir: string, attemptIndex: number): Promise<string[] | null> {
  const decision = result.decision;
  if (result.error || !decision || decision.attempt !== "steering_located") return null;
  // A rule violation or an incomplete stub test is never excused as frame-only.
  if ((decision.violations ?? []).length > 0 || (decision.unused_checks ?? []).some((check) => check.status === "inconclusive")) return null;
  const failing = decision.functions.filter((fn) => fn.decision !== "pass");
  if (failing.length === 0) return null;
  if (failing.some((fn) => fn.decision !== "steering_located" || fn.semantic !== "steering" || fn.analysis !== "complete")) return null;
  const mwcc = await readMwccFunctions(outputDir, attemptIndex);
  const stackOnly = failing.every((fn) => mwcc.some((row) =>
    row.name === fn.name && (row.unit === undefined || row.unit === fn.unit) && row.sstar_vs_candidate === "stack_only"));
  return stackOnly ? failing.map((fn) => fn.name) : null;
}

/** Folds the gate's result into the validation: shadow records only; enforce may reject. */
export async function applySteeringToValidation<T extends WorkerRunnerValidation>(
  validation: T,
  result: WorkerSteeringResult,
  params: { outputDir: string; attemptIndex: number; stackFramePolicy?: StackFramePolicy | null },
): Promise<T> {
  const recorded = { ...validation, steering: result };
  const reason = steeringRejectionReason(result);
  if (!reason) return recorded;
  if (stopsAtFrame(params.stackFramePolicy)) {
    const frameOnly = await steeringStackOnlyFunctions(result, params.outputDir, params.attemptIndex);
    if (frameOnly) {
      return {
        ...recorded,
        status: "stack_only_perturbation",
        reasons: [...validation.reasons, stackOnlyPerturbationReason({ functions: frameOnly })],
      };
    }
  }
  return { ...recorded, status: "steering_located", reasons: [...validation.reasons, reason] };
}

/** Runs the gate when it applies and folds its result into the validation; anything else is returned unchanged. */
export async function evaluateWorkerSteeringGate<T extends WorkerRunnerValidation>(params: {
  validation: T;
  options: WorkerSteeringGateOptions | null | undefined;
  symbol: string;
  outputDir: string;
  attemptIndex: number;
  postAttemptDiffText?: string;
  stackFramePolicy?: StackFramePolicy | null;
}): Promise<T> {
  const options = params.options;
  if (!options || !steeringGateApplies({ mode: options.mode, validation: params.validation, postAttemptDiffText: params.postAttemptDiffText })) {
    return requireCertifiedUnverifiedTarget(params.validation, options, null, null);
  }
  const functions = workerSteeringFunctions(params.symbol, params.validation);
  const result: WorkerSteeringResult = options.baseRev
    ? await runWorkerSteeringGate({
        baseRev: options.baseRev,
        functions,
        hostRepoRoot: options.hostRepoRoot,
        cacheDir: options.cacheDir,
        outputDir: params.outputDir,
        attemptIndex: params.attemptIndex,
        mode: options.mode,
        runner: options.runner,
        budgetMs: options.budgetMs,
        approvalsPath: options.approvalsPath,
        lessonsPath: options.lessonsPath,
      })
    : { mode: options.mode, decision: null, error: "no claim base revision", artifactPath: null, durationMs: 0 };
  const applied = await applySteeringToValidation(params.validation, result, {
    outputDir: params.outputDir,
    attemptIndex: params.attemptIndex,
    stackFramePolicy: params.stackFramePolicy,
  });
  const target = options.unverifiedTarget;
  const evidence = target && steeringGateEnforced(options.mode)
    ? await unverifiedBaselineEvidence({ options, target, validation: applied, claimBase: result, outputDir: params.outputDir, attemptIndex: params.attemptIndex })
    : null;
  return requireCertifiedUnverifiedTarget(applied, options, result, evidence);
}

/** sha256 of the target source at the claim base: the probe-reuse key (a file-level stand-in for the function source hash). */
export function steeringSourceSha(text: string | null | undefined): string | null {
  return typeof text === "string" ? createHash("sha256").update(text).digest("hex") : null;
}

/**
 * Observation rows for one gated attempt: one per considered function, or one
 * for the target when the gate produced no decision (tool failure, budget).
 * Only rows in the target's unit carry `sourceSha`, the claim-base hash of
 * the target's source file.
 */
export function steeringObservationRows(params: {
  result: WorkerSteeringResult;
  gameId: string;
  unit: string;
  symbol: string;
  runId?: string | null;
  attemptRef?: string | null;
  baseRev?: string | null;
  sourceSha?: string | null;
}): SteeringObservationInput[] {
  const { result } = params;
  if (result.mode === "off") return [];
  const mode = result.mode;
  const common = { gameId: params.gameId, runId: params.runId ?? null, attemptRef: params.attemptRef ?? null, baseRev: params.baseRev ?? null, mode };
  const decision = result.decision;
  if (!decision) {
    return [{
      ...common,
      unit: params.unit,
      symbol: params.symbol,
      functionSourceSha: params.sourceSha ?? null,
      verdict: "unresolved",
      analysis: "incomplete",
      scores: { error: result.error ?? "no decision", duration_ms: result.durationMs },
      probe: null,
    }];
  }
  const functions = decision.functions.length > 0
    ? decision.functions
    : [{ unit: params.unit, name: params.symbol, decision: decision.attempt, semantic: "unresolved" as const, analysis: "incomplete" as const, audit_label: "unresolved", match: { base: null, candidate: null, real_only: null } }];
  return functions.map((fn) => ({
    ...common,
    unit: fn.unit,
    symbol: fn.name,
    functionSourceSha: sameUnit(params.gameId, fn.unit, params.unit) ? params.sourceSha ?? null : null,
    verdict: fn.decision,
    analysis: fn.analysis,
    scores: { match: fn.match, semantic: fn.semantic, audit_label: fn.audit_label, attempt: decision.attempt },
    probe: decision.probes.find((probe) => probeIsFor(probe, fn)) ?? null,
  }));
}

/**
 * `fn.name` is the mangled symbol for C++ (`decide` rows); the probe carries it
 * as `symbol` and the demangled name as `function`, so either may match.
 */
function probeIsFor(probe: SteeringProbe, fn: { unit: string; name: string }): boolean {
  return probe.unit === fn.unit && (probe.symbol === fn.name || probe.function === fn.name);
}

/**
 * Records every observation row for a gated attempt (shadow and enforce); a store behind migration 013
 * ignores them. An `unverified_match` target's trusted-base run records its own rows too (base
 * `trustedBaseRev`, its own artifacts), and its non-pass rows queue explain jobs like the claim-base
 * run's. Returns the claim-base run's row count.
 */
export function recordWorkerSteeringObservations(
  store: StateStore,
  params: Parameters<typeof steeringObservationRows>[0] & Pick<Parameters<typeof evidenceReviewRequestInputs>[0], "workerNote"> & {
    /**
     * `unverified_match` target: the trusted-base run (`validation.unverifiedTarget`; `result` null when
     * it did not run). It certifies the target, so its `evidence_review` groups are queued too, bound to
     * `trustedBaseRev`, and the target's requests from either run carry both bases (one approval, both runs).
     */
    trustedBaseline?: { result: WorkerSteeringResult | null; trustedBaseRev: string | null } | null;
  },
): number {
  const rows = recordGateObservations(store, params);
  const trusted = params.trustedBaseline;
  // The trusted-base run's own rows (its base, artifacts and fidelity), recorded after the claim-base
  // rows: when it rejects the target, its failing probe is the newest one the next claim reads.
  if (trusted?.result && trusted.trustedBaseRev) {
    recordGateObservations(store, { ...params, result: trusted.result, baseRev: trusted.trustedBaseRev });
  }
  const unverifiedBases = trusted?.trustedBaseRev && params.baseRev
    ? { claimBaseRev: params.baseRev, trustedBaseRev: trusted.trustedBaseRev }
    : null;
  recordWorkerEvidenceReviews(store, { ...params, unverifiedBases });
  if (trusted?.result && trusted.trustedBaseRev) {
    recordWorkerEvidenceReviews(store, {
      ...params, result: trusted.result, baseRev: trusted.trustedBaseRev, trustedBaseRev: trusted.trustedBaseRev, unverifiedBases,
    });
  }
  return rows;
}

/** Records one gate run's observation rows and queues the explain jobs of its non-pass decide rows; returns the row count. */
function recordGateObservations(store: StateStore, params: Parameters<typeof steeringObservationRows>[0]): number {
  const rows = steeringObservationRows(params);
  const decided = params.result.decision?.functions ?? [];
  rows.forEach((row, index) => {
    const id = recordSteeringObservation(store, row);
    // Rows map one-to-one onto decide's function rows (when it reported any).
    if (id != null && decided.length > 0) queueWorkerSteeringExplain(store, { result: params.result, row, fn: decided[index]!, observationId: id });
  });
  return rows.length;
}

let explainQueueErrorLogged = false;

/** The gate's host step outputs next to `attempt-N.steering.json` (`runWorkerSteeringGate`). */
function steeringStepArtifacts(artifactPath: string | null): { edits: string; mwcc: string; decision: string } | null {
  if (!artifactPath) return null;
  const stem = artifactPath.replace(/\.json$/, "");
  return { edits: `${stem}.edits.json`, mwcc: `${stem}.mwcc.json`, decision: `${stem}.decision.json` };
}

function editsHashOf(path: string | undefined): string {
  try {
    const edits = path && existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown> : null;
    return typeof edits?.edits_hash === "string" ? edits.edits_hash : "";
  } catch {
    return "";
  }
}

/**
 * Queues the compiler-delta explain job (plan 3.4.1) for one recorded
 * non-pass observation from a decide row: keyed by the row's fidelity
 * `input_hash` and the tool hash. Queue only: nothing runs on the worker
 * path, and a failure here is logged once, never thrown.
 */
function queueWorkerSteeringExplain(
  store: StateStore,
  params: { result: WorkerSteeringResult; row: SteeringObservationInput; fn: SteeringFunctionDecision; observationId: number },
): void {
  if (params.row.verdict === "pass" || !params.result.decision) return;
  try {
    const fidelity = params.fn.fidelity ?? {};
    const artifacts = steeringStepArtifacts(params.result.artifactPath);
    const inputHash = typeof fidelity.input_hash === "string" && fidelity.input_hash
      ? fidelity.input_hash
      : createHash("sha256").update(`no-fidelity:${typeof fidelity.edits_hash === "string" ? fidelity.edits_hash : editsHashOf(artifacts?.edits)}`).digest("hex");
    queueSteeringExplainJob(store, {
      observationId: params.observationId,
      gameId: params.row.gameId,
      unit: params.row.unit,
      symbol: params.row.symbol,
      inputHash,
      toolHash: steeringExplainToolHash(),
      variant: params.fn.sstar_variant ?? null,
      fidelity,
      inputs: { ...(artifacts ?? {}), baseRev: params.row.baseRev ?? null },
    });
  } catch (error) {
    if (explainQueueErrorLogged) return;
    explainQueueErrorLogged = true;
    console.error(`[steering] explain job not queued: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/** Bound on the worker note kept as cited evidence on a review request. */
const REVIEW_WORKER_NOTE_MAX_CHARS = 16_000;

function citedWorkerEvidence(note: Record<string, unknown> | null | undefined): Record<string, unknown> | null {
  if (!note) return null;
  const text = JSON.stringify(note);
  if (text.length <= REVIEW_WORKER_NOTE_MAX_CHARS) return note;
  // Too large to keep whole: the fields a reviewer reads, each clamped.
  const keep: Record<string, unknown> = { truncated: true };
  for (const key of ["summary", "evidence", "cited_evidence", "construct", "residual", "status"]) {
    if (note[key] !== undefined) keep[key] = JSON.stringify(note[key]).slice(0, 4_000);
  }
  return keep;
}

/**
 * Review requests for an attempt the enforced gate rejected with
 * `evidence_review` groups (`decide`'s `evidence_reviews`): one per group and
 * target function it edits (the claimed target when `decide` attributed the
 * group to none in its unit). Anything else, shadow results, and a gate that
 * certified the attempt, yield none.
 */
export function evidenceReviewRequestInputs(params: {
  result: WorkerSteeringResult;
  gameId: string;
  unit: string;
  symbol: string;
  runId?: string | null;
  attemptRef?: string | null;
  baseRev?: string | null;
  /** The worker's checkpoint note: its record and cited evidence. */
  workerNote?: Record<string, unknown> | null;
  /**
   * Set for the trusted-base run of an `unverified_match` target: every request binds to this
   * revision (the run's own base, which its approval lookup uses), never to the claim base.
   */
  trustedBaseRev?: string | null;
  /**
   * The claimed target is `unverified_match`: its requests (exact unit and symbol) carry both bases
   * that certify it, so one approval writes a row for each.
   */
  unverifiedBases?: { claimBaseRev: string; trustedBaseRev: string } | null;
}): EvidenceReviewRequestInput[] {
  const { result } = params;
  const decision = result.decision;
  if (!decision || steeringRejectionReason(result) === null) return [];
  const inputs: EvidenceReviewRequestInput[] = [];
  const seen = new Set<string>();
  for (const review of decision.evidence_reviews ?? []) {
    const baseRev = review.base_rev ?? params.baseRev ?? null;
    if (!baseRev) continue;
    // A trusted-base row whose gate base is not the trusted base would bind an approval the run never reads.
    if (params.trustedBaseRev && baseRev !== params.trustedBaseRev) continue;
    const targets = review.targets.length > 0
      ? review.targets
      : review.units.some((unit) => sameUnit(params.gameId, unit, params.unit)) ? [{ unit: params.unit, name: params.symbol }] : [];
    for (const target of targets) {
      const key = JSON.stringify([target.unit, target.name, review.group_digest]);
      if (seen.has(key)) continue;
      seen.add(key);
      const bases = params.unverifiedBases && sameUnit(params.gameId, target.unit, params.unit) && target.name === params.symbol ? params.unverifiedBases : null;
      inputs.push({
        gameId: review.game ?? params.gameId,
        unit: target.unit,
        symbol: target.name,
        baseRev,
        ...(bases ? { claimBaseRev: bases.claimBaseRev, trustedBaseRev: bases.trustedBaseRev } : {}),
        siteFile: review.site_file,
        siteLines: review.site_lines,
        groupDigest: review.group_digest,
        callee: review.callee,
        calleeSymbol: review.symbol,
        patch: review.patch ?? "",
        evidence: {
          gate: {
            group: review.group,
            callee: review.callee,
            symbol: review.symbol,
            provenance: review.provenance,
            reason: review.reason,
            shapes: review.shapes,
            real_shapes: review.real_shapes,
            functions: review.functions,
            edit_ids: review.edit_ids,
            artifact_path: result.artifactPath,
            run: params.trustedBaseRev ? "trusted_base" : "claim_base",
          },
          worker: citedWorkerEvidence(params.workerNote),
        },
        runId: params.runId ?? null,
        attemptRef: params.attemptRef ?? null,
      });
    }
  }
  return inputs;
}

/** Persists the attempt's evidence-review requests (deduplicated); a store behind migration 017 ignores them. */
export function recordWorkerEvidenceReviews(
  store: StateStore,
  params: Parameters<typeof evidenceReviewRequestInputs>[0],
): Array<{ id: string; outcome: EvidenceReviewRecordOutcome }> {
  const out: Array<{ id: string; outcome: EvidenceReviewRecordOutcome }> = [];
  for (const input of evidenceReviewRequestInputs(params)) {
    const recorded = recordEvidenceReviewRequest(store, input);
    if (recorded) out.push(recorded);
  }
  return out;
}

/** Enforce only: the probe a rejected attempt hands its repair request (the first one the gate returned). */
export function steeringRepairProbe(validation: Pick<WorkerRunnerValidation, "status" | "steering">): SteeringProbe | null {
  const steering = validation.steering;
  if (!steering || !steeringGateEnforced(steering.mode)) return null;
  if (validation.status !== "steering_located" && validation.status !== "stack_only_perturbation") return null;
  return steering.decision?.probes[0] ?? null;
}
