import type { StackFramePolicy } from "@server/core/game-registry/resolver.js";
import { gameBuildLayout, type GameBuildValidation } from "@server/core/game-registry/build-layout.js";
import { SANDBOX_TOOLPACK_ROOT } from "@server/core/tools/wrappers/workspace-tool-exec.js";
import { runCommand, type CommandResult, type WorkspaceExec } from "@server/infrastructure/shell";

/**
 * Runner side of the SMS stack-frame policy. The shared checker
 * `toolpacks/gamecube-decomp/_impl/gamecube/tools/stack_check.py` compares
 * two objects function by function and says whether they differ only in the
 * stack frame (`stwu r1`/`addi r1,r1` immediates and `N(r1)` offsets).
 * Every call fails open: a missing or broken checker leaves the attempt to
 * the normal score rules and only records a warning.
 */
export const STACK_CHECK_TOOLPACK_PATH = "_impl/gamecube/tools/stack_check.py";
export const SANDBOX_STACK_CHECK_SCRIPT = `${SANDBOX_TOOLPACK_ROOT}/gamecube-decomp/${STACK_CHECK_TOOLPACK_PATH}`;
export const STACK_CHECK_TIMEOUT_MS = 120_000;
/** Leave-one-out costs one TU compile per hunk; above this the per-hunk check is skipped. */
export const STACK_HUNK_CHECK_MAX_HUNKS = 8;

export type StackFunctionClass = "identical" | "stack_only" | "code" | "only_a" | "only_b";

export interface StackObjectsFunction {
  name: string;
  class: StackFunctionClass;
  frame_a: number | null;
  frame_b: number | null;
  first_diff?: { a?: string; b?: string } | null;
}

export interface StackObjectsReport {
  functions: StackObjectsFunction[];
  data: "identical" | "differs";
}

export type StackCheckRunner = (args: string[]) => Promise<CommandResult>;

export type StackCheckOutcome<T> = { ok: true; value: T } | { ok: false; error: string };

export function stopsAtFrame(policy: StackFramePolicy | string | null | undefined): boolean {
  return policy === "stop_at_frame";
}

/** Runs the toolpack copy synced into the worker sandbox, from the workspace root. */
export function workspaceStackCheckRunner(exec: WorkspaceExec, options: { timeoutMs?: number } = {}): StackCheckRunner {
  return async (args) => {
    try {
      return await exec.exec(["python3", SANDBOX_STACK_CHECK_SCRIPT, ...args], {
        timeoutMs: options.timeoutMs ?? STACK_CHECK_TIMEOUT_MS,
        env: { ORCH_STACK_FRAME_POLICY: "stop_at_frame" },
      });
    } catch (error) {
      return { exitCode: 127, stdout: "", stderr: error instanceof Error ? error.message : String(error) };
    }
  };
}

/** Runs the host toolpack copy against a local checkout (backfill). */
export function hostStackCheckRunner(scriptPath: string, cwd: string, options: { timeoutMs?: number } = {}): StackCheckRunner {
  return async (args) => {
    try {
      return await runCommand(cwd, ["python3", scriptPath, ...args], {
        timeoutMs: options.timeoutMs ?? STACK_CHECK_TIMEOUT_MS,
        env: { ORCH_STACK_FRAME_POLICY: "stop_at_frame" },
      });
    } catch (error) {
      return { exitCode: 127, stdout: "", stderr: error instanceof Error ? error.message : String(error) };
    }
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function finiteOrNull(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizedClass(value: unknown): StackFunctionClass | null {
  const text = typeof value === "string" ? value.trim().toLowerCase().replaceAll("-", "_") : "";
  return text === "identical" || text === "stack_only" || text === "code" || text === "only_a" || text === "only_b" ? text : null;
}

function invocationError(result: CommandResult, label: string): string {
  const stderr = result.stderr.trim();
  return `stack_check.py ${label} exited ${result.exitCode}${stderr ? `: ${stderr.slice(-400)}` : ""}`;
}

export function parseStackObjectsReport(stdout: string): StackObjectsReport | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    return null;
  }
  if (!isRecord(parsed) || !Array.isArray(parsed.functions)) return null;
  const functions: StackObjectsFunction[] = [];
  for (const row of parsed.functions) {
    if (!isRecord(row) || typeof row.name !== "string") return null;
    const cls = normalizedClass(row.class);
    if (!cls) return null;
    functions.push({
      name: row.name,
      class: cls,
      frame_a: finiteOrNull(row.frame_a),
      frame_b: finiteOrNull(row.frame_b),
      first_diff: isRecord(row.first_diff) ? (row.first_diff as StackObjectsFunction["first_diff"]) : null,
    });
  }
  return { functions, data: parsed.data === "differs" ? "differs" : "identical" };
}

/** `stack_check.py objects A.o B.o --json`. */
export async function compareStackObjects(
  runner: StackCheckRunner,
  objectA: string,
  objectB: string,
): Promise<StackCheckOutcome<StackObjectsReport>> {
  const result = await runner(["objects", objectA, objectB, "--json"]);
  if (result.exitCode !== 0) return { ok: false, error: invocationError(result, "objects") };
  const report = parseStackObjectsReport(result.stdout);
  return report ? { ok: true, value: report } : { ok: false, error: "stack_check.py objects did not return the expected JSON" };
}

/** The target object (`build/<ver>/obj/<object>.o`) dtk-template pairs with a report unit. */
export function targetObjectPathForUnit(unit: string, validation?: GameBuildValidation | null): string | null {
  const objectName = unit.replaceAll("\\", "/").replace(/^\.\//, "").split("/").slice(1).join("/");
  if (!objectName || /\.[^/.]+$/.test(objectName)) return null;
  return `${gameBuildLayout(validation).objRoot}/${objectName}.o`;
}

export interface StackPerturbation {
  /** Functions whose code or frame differs between the two objects. */
  changedFunctions: string[];
  stackOnlyFunctions: string[];
  codeFunctions: string[];
  dataChanged: boolean;
  /** Something changed and every change is a stack-frame change. */
  stackOnly: boolean;
}

/** Reads `objects <before> <after>`: was the edit only a stack-frame move? */
export function stackPerturbation(report: StackObjectsReport): StackPerturbation {
  const changed = report.functions.filter((fn) => fn.class !== "identical");
  const stackOnlyFunctions = changed.filter((fn) => fn.class === "stack_only").map((fn) => fn.name);
  const codeFunctions = changed.filter((fn) => fn.class !== "stack_only").map((fn) => fn.name);
  const dataChanged = report.data === "differs";
  return {
    changedFunctions: changed.map((fn) => fn.name),
    stackOnlyFunctions,
    codeFunctions,
    dataChanged,
    stackOnly: changed.length > 0 && codeFunctions.length === 0 && !dataChanged,
  };
}

export interface StackRemaining {
  class: StackFunctionClass | "missing";
  frameCompiled: number | null;
  frameTarget: number | null;
}

/** Reads `objects <compiled> <target>` for one function: what is left to match? */
export function stackRemainingForSymbol(report: StackObjectsReport, symbol: string): StackRemaining {
  const row = report.functions.find((fn) => fn.name === symbol);
  return row
    ? { class: row.class, frameCompiled: row.frame_a, frameTarget: row.frame_b }
    : { class: "missing", frameCompiled: null, frameTarget: null };
}

export function countDiffHunks(diffText: string): number {
  return diffText.split(/\r?\n/).filter((line) => line.startsWith("@@ ")).length;
}

export interface StackHunkVerdict {
  file: string;
  index: number | null;
  header: string | null;
  /** The hunk's `effect`: none, stack_only, code, build_break or unaudited. */
  class: string;
}

/**
 * `stack_check.py hunks --repo . --base <rev> --files <paths> --json`:
 * leave-one-out over the worktree's diff against the claim base. Each hunk
 * record carries `effect` (`none|stack_only|code|build_break|unaudited`).
 */
export function stackHunksArgs(params: { baseRevision: string; paths: string[] }): string[] {
  // `changed` keeps header hunks to the TUs the attempt touched, inside the
  // validation timeout; the worker's own unit is covered by the objects check.
  return [
    "hunks", "--repo", ".", "--base", params.baseRevision, "--header-scope", "changed", "--json",
    ...(params.paths.length > 0 ? ["--files", ...params.paths] : []),
  ];
}

function hunkHeader(row: Record<string, unknown>): string | null {
  const base = isRecord(row.base) ? row.base : null;
  const head = isRecord(row.head) ? row.head : null;
  if (!base || !head) return null;
  return `@@ -${base.start},${base.count} +${head.start},${head.count} @@`;
}

export function parseStackHunks(stdout: string): StackHunkVerdict[] | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    return null;
  }
  const rows = isRecord(parsed) && Array.isArray(parsed.hunks) ? parsed.hunks : null;
  if (!rows) return null;
  const verdicts: StackHunkVerdict[] = [];
  for (const row of rows) {
    if (!isRecord(row)) return null;
    if (typeof row.effect !== "string") return null;
    verdicts.push({
      file: typeof row.file === "string" ? row.file : "",
      index: finiteOrNull(row.index),
      header: hunkHeader(row),
      class: row.effect,
    });
  }
  return verdicts;
}

export async function checkStackHunks(
  runner: StackCheckRunner,
  params: { baseRevision: string; paths: string[] },
): Promise<StackCheckOutcome<StackHunkVerdict[]>> {
  const result = await runner(stackHunksArgs(params));
  if (result.exitCode !== 0) return { ok: false, error: invocationError(result, "hunks") };
  const verdicts = parseStackHunks(result.stdout);
  return verdicts ? { ok: true, value: verdicts } : { ok: false, error: "stack_check.py hunks did not return the expected JSON" };
}

export function describeHunk(hunk: StackHunkVerdict): string {
  return [hunk.file || "<unknown file>", hunk.header ?? (hunk.index != null ? `hunk ${hunk.index}` : null)].filter(Boolean).join(" ");
}

export const STACK_ONLY_PERTURBATION_INSTRUCTION =
  "SMS bans edits whose only effect is the stack frame (padding or unused locals, operand swaps like `0 <= x`, alignment tricks, inlines chosen for frame size). Revert this edit. Then fix non-stack mismatches (instructions, registers, branches, relocations, data), or stop: when only the stack frame differs from the target, stop and report frame-only; it is never an exact claim.";

export function stackOnlyPerturbationReason(params: { functions?: string[]; hunks?: StackHunkVerdict[] }): string {
  const what = params.hunks && params.hunks.length > 0
    ? `hunk ${params.hunks.map(describeHunk).join("; ")} only moved the stack frame`
    : `the edit only moved the stack frame of ${(params.functions ?? []).join(", ") || "the changed functions"}`;
  return `stack_only_perturbation: ${what} (frame size or r1 stack offsets; no instruction, register, branch, relocation or data change). ${STACK_ONLY_PERTURBATION_INSTRUCTION}`;
}

/** What the runner learned about one attempt under `stop_at_frame`; recorded on the runner validation. */
export interface WorkerStackPolicyResult {
  policy: "stop_at_frame";
  /** evaluated: the checker ran; unavailable: it could not run, so the attempt keeps today's rules (fail open). */
  status: "evaluated" | "unavailable";
  warnings: string[];
  /** The target function against the target object after the attempt. */
  remaining: StackRemaining | null;
  /** True when the target's only remaining difference is the stack frame: the function is done. */
  targetStackOnly: boolean;
  /** Reference object (last accepted, else pre-worker) against the attempt object. */
  perturbation: StackPerturbation | null;
  hunks: {
    status: "evaluated" | "skipped" | "unavailable";
    count: number;
    reason?: string;
    stackOnly: StackHunkVerdict[];
  } | null;
  rejected: boolean;
  reason: string | null;
}
