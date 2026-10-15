import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { StackFramePolicy, SteeringGateMode } from "@server/core/game-registry/resolver.js";
import type { StateStore } from "@server/core/orchestrator-state";
import { recordSteeringObservation, type SteeringObservationInput } from "@server/core/harness-runtime/run-state/steering.js";
import type { RunGameMetadata } from "@server/core/shared/types";
import { steeringGateActive, steeringGateEnforced } from "@server/core/tools/steering-gate.js";
import { stackOnlyPerturbationReason, stopsAtFrame } from "@server/core/validation/stack/stack-check.js";
import {
  runWorkerSteeringGate,
  steeringRejectionReason,
  type SteeringProbe,
  type SteeringRunner,
  type WorkerSteeringResult,
} from "@server/core/validation/steering/steering-check.js";
import { changedSourcePathsFromDiff } from "@server/core/validation/format/clang-format.js";
import type { WorkerRunnerValidation } from "./runner-validation.js";

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
    return params.validation;
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
  return applySteeringToValidation(params.validation, result, {
    outputDir: params.outputDir,
    attemptIndex: params.attemptIndex,
    stackFramePolicy: params.stackFramePolicy,
  });
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
    functionSourceSha: fn.unit === params.unit ? params.sourceSha ?? null : null,
    verdict: fn.decision,
    analysis: fn.analysis,
    scores: { match: fn.match, semantic: fn.semantic, audit_label: fn.audit_label, attempt: decision.attempt },
    probe: decision.probes.find((probe) => probe.function === fn.name && probe.unit === fn.unit) ?? null,
  }));
}

/** Records every observation row for a gated attempt (shadow and enforce); a store behind migration 013 ignores them. */
export function recordWorkerSteeringObservations(store: StateStore, params: Parameters<typeof steeringObservationRows>[0]): number {
  const rows = steeringObservationRows(params);
  for (const row of rows) recordSteeringObservation(store, row);
  return rows.length;
}

/** Enforce only: the probe a rejected attempt hands its repair request (the first one the gate returned). */
export function steeringRepairProbe(validation: Pick<WorkerRunnerValidation, "status" | "steering">): SteeringProbe | null {
  const steering = validation.steering;
  if (!steering || !steeringGateEnforced(steering.mode)) return null;
  if (validation.status !== "steering_located" && validation.status !== "stack_only_perturbation") return null;
  return steering.decision?.probes[0] ?? null;
}
