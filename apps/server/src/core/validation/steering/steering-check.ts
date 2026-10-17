import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, isAbsolute, resolve } from "node:path";
import type { SteeringGateMode } from "@server/core/game-registry/resolver.js";
import { sandboxCpuCount, scaleTimeout, toolTimeoutScale } from "@server/core/tools/timeout-scale.js";
import { SANDBOX_TOOLPACK_ROOT } from "@server/core/tools/wrappers/workspace-tool-exec.js";
import { runCommand, type CommandResult, type WorkspaceExec } from "@server/infrastructure/shell";

/**
 * Runner side of the SMS steering gate. The checker
 * `toolpacks/gamecube-decomp/_impl/gamecube/tools/steering_check.py` runs in
 * four steps: `edits` (sandbox: the attempt's texts against the claim base),
 * `reduce` (host: clang IR reduction against an exact baseRev context),
 * `mwcc` (sandbox: rebuild S* and compare object code) and `decide` (host).
 * Sandbox outputs come back on stdout and are written to `outputDir`; host
 * steps read and write files there. The whole gate runs under one wall-clock
 * budget; any failure becomes `error` on the result, never a throw.
 */
export const STEERING_CHECK_TOOLPACK_PATH = "_impl/gamecube/tools/steering_check.py";
export const SANDBOX_STEERING_CHECK_SCRIPT = `${SANDBOX_TOOLPACK_ROOT}/gamecube-decomp/${STEERING_CHECK_TOOLPACK_PATH}`;
export const STEERING_GATE_BUDGET_MS = 240_000;
/** The host runner's default per-call ceiling; the worker gate passes its remaining budget instead. */
export const STEERING_STEP_TIMEOUT_MS = STEERING_GATE_BUDGET_MS;
/** Upper bound handed to `reduce --budget-seconds`. */
export const STEERING_REDUCE_BUDGET_SECONDS = 120;
/** Most MWCC compiles `mwcc --jobs` runs at once. */
const STEERING_MWCC_MAX_JOBS = 3;
/** Headroom `mwcc --mwcc-budget-seconds` leaves for the gate to read its output. */
const STEERING_MWCC_BUDGET_SLACK_SECONDS = 5;

/** The worker gate budget, scaled by the claimed sandbox profile's `timeout_scale`. */
export function steeringGateBudgetMs(scale = toolTimeoutScale()): number {
  return scaleTimeout(STEERING_GATE_BUDGET_MS, scale);
}

/** `mwcc --jobs` for the sandbox: one compile per CPU, at most 3 (3 when the CPU count is unknown). */
export function steeringMwccJobs(cpus = sandboxCpuCount()): number {
  return Math.max(1, Math.min(STEERING_MWCC_MAX_JOBS, cpus ?? STEERING_MWCC_MAX_JOBS));
}

/** `rule_violation`: the attempt would pass but breaks a matching rule (today: a dead UNUSED body). */
export type SteeringDecisionKind = "pass" | "steering_located" | "unresolved" | "rule_violation";

export interface SteeringFunctionDecision {
  unit: string;
  name: string;
  decision: SteeringDecisionKind;
  semantic: "clean" | "steering" | "unresolved";
  analysis: "complete" | "incomplete";
  audit_label: string;
  match: { base: number | null; candidate: number | null; real_only: number | null };
  /**
   * The ids of this attempt's edit groups touching the function (`decide`'s
   * row `groups`). Kept only when it is an array of non-empty strings; empty
   * means the attempt left the function alone.
   */
  groups?: string[];
}

export interface SteeringProbe {
  function: string;
  unit: string;
  [k: string]: unknown;
}

/** `dead_unused_body`: a body given to a map-UNUSED function the original never inlined. */
export interface SteeringDeadUnusedViolation {
  kind: "dead_unused_body";
  unit: string;
  file: string;
  function: string;
  line?: number;
}

/**
 * `out_of_order`: an added line in an order-gated file (MarNameRefGen-style
 * registries) references a class whose owner unit is not decompiled. `decide`
 * names no unit or function; the parser fills `unit` from the function rows
 * whose groups touch `file` when exactly one unit does, else leaves it absent
 * (callers filtering by unit treat it as in every scoped unit: fail closed).
 */
export interface SteeringOutOfOrderViolation {
  kind: "out_of_order";
  file: string;
  line?: number;
  class: string;
  owner_unit: string;
  owner_progress?: number;
  reason?: string;
  unit?: string;
  function?: string;
}

/** Any other rule `decide` lists; unknown kinds still reject (generic problem). */
export interface SteeringOtherViolation {
  kind: string;
  file: string;
  unit?: string;
  function?: string;
  line?: number;
}

/** A rule `decide` found broken. */
export type SteeringViolation = SteeringDeadUnusedViolation | SteeringOutOfOrderViolation | SteeringOtherViolation;

export function isDeadUnusedViolation(violation: SteeringViolation): violation is SteeringDeadUnusedViolation {
  return violation.kind === "dead_unused_body";
}

export function isOutOfOrderViolation(violation: SteeringViolation): violation is SteeringOutOfOrderViolation {
  return violation.kind === "out_of_order";
}

/**
 * `decide`'s resolution of one class reference added to an order-gated file:
 * `ok` (owner decompiled), `out_of_order` (listed as a violation too) or
 * `unknown` (owner or progress unknown: analysis incomplete).
 */
export interface SteeringOrderCheck {
  file: string;
  line?: number;
  class: string;
  via?: string;
  edit_id?: string;
  header?: string;
  owner_unit: string | null;
  owner_progress: number | null;
  status: "ok" | "out_of_order" | "unknown";
  reason?: string;
}

/** One function's status/match before and after the stub test emptied the UNUSED body. */
export interface SteeringUnusedCheckChange {
  function: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
}

/**
 * `decide`'s stub test for a map-UNUSED function the attempt gave a body:
 * `dead` (emptying it changes no target function: a violation), `inlined`
 * (some target function changes: allowed, `changed` is the evidence) or
 * `inconclusive` (the stubbed build failed: analysis incomplete).
 */
export interface SteeringUnusedCheck {
  unit: string;
  file: string;
  function: string;
  mangled?: string;
  status: "dead" | "inlined" | "inconclusive";
  stub?: string;
  changed: SteeringUnusedCheckChange[];
  reason?: string;
  /** Line of the definition in `file`. */
  line?: number;
  // Binding (the certificate is valid only for the patch it measured; kept verbatim for integration and publication).
  base_rev?: string;
  edits_hash?: string;
  body_sha256?: string;
  /** Repo-relative paths the unit-content hash covers: the unit source and the changed headers it includes. */
  unit_inputs?: string[];
  /** sha256 of `unit_inputs` at the certified candidate (see `unitInputsSha256`). */
  unit_inputs_sha256?: string;
  /** sha256 of the unit's objdiff `scratch.c_flags` at certification (null when unknown); edit_scope re-checks it. */
  unit_flags_sha256?: string | null;
  /** The worsened same-unit callers `decide` judged (the evidence), verbatim. */
  callers?: Array<Record<string, unknown>>;
}

/** Per-unit build/compare coverage reported by `decide`: a unit that was not built and compared is not certified. */
export interface SteeringUnitCoverage {
  unit: string;
  built: boolean;
  compared: boolean;
  /** Present only if `decide` marked the unit as skipped; a skipped unit is never covered. */
  exempt?: string;
}

/** The unit is certified only when it was built and compared; no exemption covers a unit. */
export function unitCovered(row: SteeringUnitCoverage): boolean {
  return row.built && row.compared && row.exempt === undefined;
}

export interface SteeringDecision {
  attempt: SteeringDecisionKind;
  reasons: string[];
  functions: SteeringFunctionDecision[];
  removable_noncosmetic: string[];
  probes: SteeringProbe[];
  /** Absent when `decide` did not report coverage; enforcement treats that as uncertified. */
  units?: SteeringUnitCoverage[];
  /** `decide` says the candidate has no source change against the base (`no_changes: true` or `changed: false`). */
  no_changes?: boolean;
  /** Group ids still unresolved after `decide`'s evidence promotions (map-call, data-order, approvals). */
  unresolved_groups?: string[];
  /** Rule violations; the parser always sets it (absent in the JSON = []). */
  violations?: SteeringViolation[];
  /** UNUSED-function stub tests; the parser always sets it (absent in the JSON = []). */
  unused_checks?: SteeringUnusedCheck[];
  /** Class references added to order-gated files; the parser always sets it (absent in the JSON = []). */
  order_checks?: SteeringOrderCheck[];
}

/** What the gate saw besides `decide`'s output; the certificate check reads it. */
export interface SteeringCertificateContext {
  /** The attempt changed a source text against the base (from `edits`). */
  sourceChanged: boolean;
  /** `reduce`'s `analysis` field. */
  reduceAnalysis: string | null;
  /** Ids of `reduce` groups with status `unresolved`. */
  unresolvedGroups: string[];
}

export interface WorkerSteeringResult {
  mode: SteeringGateMode;
  decision: SteeringDecision | null;
  error: string | null;
  artifactPath: string | null;
  durationMs: number;
  /** Set once `edits` and `reduce` ran; absent means the certificate is checked without it. */
  certificate?: SteeringCertificateContext;
}

/**
 * Runs one `steering_check.py` subcommand. `uploadToSandbox` writes a file
 * into the sandbox workspace (path relative to the workspace root) so a
 * sandbox step can read a host-produced report (`mwcc --attribute`). A
 * per-call `timeoutMs` overrides the runner's own ceiling, so the command is
 * killed when the gate budget runs out.
 */
export interface SteeringCallOptions {
  timeoutMs?: number;
  /** Absolute (`Date.now()`) deadline for a multi-command upload; no command starts past it. */
  deadlineMs?: number;
}
export type SteeringRunner = ((args: string[], where: "sandbox" | "host", call?: SteeringCallOptions) => Promise<CommandResult>) & {
  uploadToSandbox?: (workspacePath: string, content: string, call?: SteeringCallOptions) => Promise<void>;
};

/** Where the worker gate puts the host `reduce` report inside the sandbox workspace for `mwcc --attribute`. */
export function sandboxAttributePath(attemptIndex: number): string {
  return `build/steering/attempt-${attemptIndex}.reduce.json`;
}

/** Raw bytes per exec call; base64 keeps one argv string under Linux's 128 KiB MAX_ARG_STRLEN. */
const SANDBOX_UPLOAD_CHUNK_BYTES = 64 * 1024;
const SANDBOX_WRITE_CHUNK_PY =
  "import base64,os,sys\np=sys.argv[1]\nos.makedirs(os.path.dirname(p) or '.',exist_ok=True)\nwith open(p,sys.argv[2]) as f: f.write(base64.b64decode(sys.argv[3]))";
const SANDBOX_SHA256_PY = "import hashlib,sys\nprint(hashlib.sha256(open(sys.argv[1],'rb').read()).hexdigest())";

/**
 * Writes `content` to `workspacePath` through `exec` alone (WorkspaceExec has
 * no file API): base64 chunks appended by python3, then a sha256 read-back.
 * `timeoutMs` bounds each exec; with `deadlineMs` each exec gets at most what
 * is left and the upload throws once it has passed.
 */
export async function uploadThroughExec(exec: WorkspaceExec, workspacePath: string, content: string, timeoutMs = 60_000, deadlineMs?: number): Promise<void> {
  const execTimeout = (): number => {
    if (deadlineMs === undefined) return timeoutMs;
    const left = deadlineMs - Date.now();
    if (left <= 0) throw new Error(`upload of ${workspacePath} ran past its deadline`);
    return Math.min(timeoutMs, left);
  };
  const bytes = Buffer.from(content, "utf8");
  for (let offset = 0, first = true; first || offset < bytes.length; offset += SANDBOX_UPLOAD_CHUNK_BYTES, first = false) {
    const chunk = bytes.subarray(offset, offset + SANDBOX_UPLOAD_CHUNK_BYTES).toString("base64");
    const result = await exec.exec(["python3", "-c", SANDBOX_WRITE_CHUNK_PY, workspacePath, first ? "wb" : "ab", chunk], { timeoutMs: execTimeout() });
    if (result.exitCode !== 0) throw new Error(`upload of ${workspacePath} failed: ${result.stderr.trim().slice(-300)}`);
  }
  const check = await exec.exec(["python3", "-c", SANDBOX_SHA256_PY, workspacePath], { timeoutMs: execTimeout() });
  const expected = createHash("sha256").update(bytes).digest("hex");
  if (check.exitCode !== 0 || check.stdout.trim() !== expected) {
    throw new Error(`upload of ${workspacePath} did not verify (sha256 ${check.stdout.trim() || "unreadable"} != ${expected})`);
  }
}

export const STEERING_LOCATED_INSTRUCTION =
  "The steering gate rejected this attempt: the match depends on edits that behave exactly like the code they replace. Use them as a probe. Keep only behaviour-changing fixes, find the real construct the original used (see steering_probe), and remove the steering edits.";

export const UNUSED_BODY_INSTRUCTION =
  "This attempt reconstructs a function the map marks UNUSED, and emptying its body changes no function in the target, so the original never inlined it. Restore the upstream stub (keep the signature, empty body) — UNUSED functions may only be reconstructed when they were inlined into other functions in the same TU.";

export const OUT_OF_ORDER_INSTRUCTION =
  "This attempt fills registry/factory code (or other callers) for classes whose own units are not decompiled yet. Remove those hunks and leave them until those units are decompiled — don't jump the fence.";

function failedResult(error: unknown): CommandResult {
  return { exitCode: 127, stdout: "", stderr: error instanceof Error ? error.message : String(error) };
}

function steeringEnv(mode: SteeringGateMode, extra: Record<string, string> = {}): Record<string, string> {
  return { ORCH_STEERING_GATE: mode, ...extra };
}

/**
 * Worker gate runner: sandbox steps run the toolpack copy synced into the
 * worker sandbox from the workspace root; host steps run the host toolpack
 * copy (`hostScript`) from `hostCwd`. The default per-call ceiling is the
 * scaled gate budget.
 */
export function workspaceSteeringRunner(
  exec: WorkspaceExec,
  hostScript: string,
  hostCwd: string,
  options: { timeoutMs?: number; mode?: SteeringGateMode; hostEnv?: Record<string, string> } = {},
): SteeringRunner {
  const defaultTimeoutMs = options.timeoutMs ?? steeringGateBudgetMs();
  const mode = options.mode ?? "shadow";
  const runner: SteeringRunner = async (args, where, call) => {
    const timeoutMs = call?.timeoutMs ?? defaultTimeoutMs;
    try {
      if (where === "sandbox") {
        return await exec.exec(["python3", SANDBOX_STEERING_CHECK_SCRIPT, ...args], { timeoutMs, env: steeringEnv(mode) });
      }
      return await runCommand(hostCwd, ["python3", hostScript, ...args], { timeoutMs, env: steeringEnv(mode, options.hostEnv) });
    } catch (error) {
      return failedResult(error);
    }
  };
  // A per-call timeout bounds the whole upload, not each of its commands.
  runner.uploadToSandbox = (workspacePath, content, call) => uploadThroughExec(
    exec, workspacePath, content, call?.timeoutMs,
    call?.deadlineMs ?? (call?.timeoutMs === undefined ? undefined : Date.now() + call.timeoutMs),
  );
  return runner;
}

/** Backfill/validation runner: every step on the host, against a local checkout. */
export function hostSteeringRunner(
  scriptPath: string,
  cwd: string,
  options: { timeoutMs?: number; mode?: SteeringGateMode; env?: Record<string, string> } = {},
): SteeringRunner {
  const defaultTimeoutMs = options.timeoutMs ?? STEERING_STEP_TIMEOUT_MS;
  const mode = options.mode ?? "shadow";
  const runner: SteeringRunner = async (args, _where, call) => {
    try {
      return await runCommand(cwd, ["python3", scriptPath, ...args], { timeoutMs: call?.timeoutMs ?? defaultTimeoutMs, env: steeringEnv(mode, options.env) });
    } catch (error) {
      return failedResult(error);
    }
  };
  // "Sandbox" steps run in `cwd` here, so the upload is a local write.
  runner.uploadToSandbox = async (workspacePath, content) => {
    const target = isAbsolute(workspacePath) ? workspacePath : resolve(cwd, workspacePath);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, content);
  };
  return runner;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function finiteOrNull(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

function decisionKind(value: unknown): SteeringDecisionKind | null {
  return value === "pass" || value === "steering_located" || value === "unresolved" || value === "rule_violation" ? value : null;
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

/** Absent/null optional field, or a value of the right type; anything else is malformed. */
function optionalOk(value: unknown, type: "string" | "number"): boolean {
  return value === undefined || value === null || (type === "number" ? typeof value === "number" && Number.isFinite(value) : typeof value === type);
}

/**
 * The one unit whose function rows have a group in `file` (group ids are
 * `<file>@<hunk>`), or undefined when none or several do.
 */
function unitForFile(rawFunctions: unknown[], file: string): string | undefined {
  const units = new Set<string>();
  for (const row of rawFunctions) {
    if (!isRecord(row) || typeof row.unit !== "string" || !Array.isArray(row.groups)) continue;
    if (row.groups.some((group) => typeof group === "string" && group.startsWith(`${file}@`))) units.add(row.unit);
  }
  return units.size === 1 ? [...units][0] : undefined;
}

function parseViolations(value: unknown, rawFunctions: unknown[]): SteeringViolation[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value)) return null;
  const rows: SteeringViolation[] = [];
  for (const row of value) {
    if (!isRecord(row) || typeof row.kind !== "string" || typeof row.file !== "string") return null;
    if (!optionalOk(row.line, "number") || !optionalOk(row.unit, "string") || !optionalOk(row.function, "string")) return null;
    const line = typeof row.line === "number" ? { line: row.line } : {};
    if (row.kind === "out_of_order") {
      if (typeof row.class !== "string" || typeof row.owner_unit !== "string") return null;
      if (!optionalOk(row.owner_progress, "number") || !optionalOk(row.reason, "string")) return null;
      const unit = typeof row.unit === "string" ? row.unit : unitForFile(rawFunctions, row.file);
      rows.push({
        kind: "out_of_order",
        file: row.file,
        ...line,
        class: row.class,
        owner_unit: row.owner_unit,
        ...(typeof row.owner_progress === "number" ? { owner_progress: row.owner_progress } : {}),
        ...(typeof row.reason === "string" ? { reason: row.reason } : {}),
        ...(unit !== undefined ? { unit } : {}),
        ...(typeof row.function === "string" ? { function: row.function } : {}),
      });
      continue;
    }
    if (row.kind === "dead_unused_body") {
      if (typeof row.unit !== "string" || typeof row.function !== "string") return null;
      rows.push({ kind: "dead_unused_body", unit: row.unit, file: row.file, function: row.function, ...line });
      continue;
    }
    rows.push({
      kind: row.kind,
      file: row.file,
      ...(typeof row.unit === "string" ? { unit: row.unit } : {}),
      ...(typeof row.function === "string" ? { function: row.function } : {}),
      ...line,
    });
  }
  return rows;
}

function parseOrderChecks(value: unknown): SteeringOrderCheck[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value)) return null;
  const rows: SteeringOrderCheck[] = [];
  for (const row of value) {
    if (!isRecord(row) || typeof row.file !== "string" || typeof row.class !== "string") return null;
    if (row.status !== "ok" && row.status !== "out_of_order" && row.status !== "unknown") return null;
    if (!optionalOk(row.line, "number") || !optionalOk(row.via, "string") || !optionalOk(row.edit_id, "string") || !optionalOk(row.header, "string")) return null;
    if (!optionalOk(row.owner_unit, "string") || !optionalOk(row.owner_progress, "number") || !optionalOk(row.reason, "string")) return null;
    rows.push({
      file: row.file,
      ...(typeof row.line === "number" ? { line: row.line } : {}),
      class: row.class,
      ...(typeof row.via === "string" ? { via: row.via } : {}),
      ...(typeof row.edit_id === "string" ? { edit_id: row.edit_id } : {}),
      ...(typeof row.header === "string" ? { header: row.header } : {}),
      owner_unit: typeof row.owner_unit === "string" ? row.owner_unit : null,
      owner_progress: typeof row.owner_progress === "number" ? row.owner_progress : null,
      status: row.status,
      ...(typeof row.reason === "string" ? { reason: row.reason } : {}),
    });
  }
  return rows;
}

function parseUnusedChecks(value: unknown): SteeringUnusedCheck[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value)) return null;
  const rows: SteeringUnusedCheck[] = [];
  for (const row of value) {
    if (!isRecord(row) || typeof row.unit !== "string" || typeof row.file !== "string" || typeof row.function !== "string") return null;
    if (row.status !== "dead" && row.status !== "inlined" && row.status !== "inconclusive") return null;
    if (!optionalOk(row.mangled, "string") || !optionalOk(row.stub, "string") || !optionalOk(row.reason, "string")) return null;
    for (const key of ["base_rev", "edits_hash", "body_sha256", "unit_inputs_sha256"] as const) if (!optionalOk(row[key], "string")) return null;
    if (!optionalOk(row.line, "number") || !optionalOk(row.unit_flags_sha256, "string")) return null;
    if (row.unit_inputs !== undefined && row.unit_inputs !== null
      && !(Array.isArray(row.unit_inputs) && row.unit_inputs.every((path) => typeof path === "string"))) return null;
    if (row.callers !== undefined && row.callers !== null && !(Array.isArray(row.callers) && row.callers.every(isRecord))) return null;
    if (row.changed !== undefined && !Array.isArray(row.changed)) return null;
    const changed: SteeringUnusedCheckChange[] = [];
    for (const change of Array.isArray(row.changed) ? row.changed : []) {
      if (!isRecord(change) || typeof change.function !== "string") return null;
      if ((change.before !== undefined && !isRecord(change.before)) || (change.after !== undefined && !isRecord(change.after))) return null;
      changed.push({
        function: change.function,
        ...(isRecord(change.before) ? { before: change.before } : {}),
        ...(isRecord(change.after) ? { after: change.after } : {}),
      });
    }
    rows.push({
      unit: row.unit,
      file: row.file,
      function: row.function,
      ...(typeof row.mangled === "string" ? { mangled: row.mangled } : {}),
      status: row.status,
      ...(typeof row.stub === "string" ? { stub: row.stub } : {}),
      changed,
      ...(typeof row.reason === "string" ? { reason: row.reason } : {}),
      ...(typeof row.line === "number" ? { line: row.line } : {}),
      ...(typeof row.base_rev === "string" ? { base_rev: row.base_rev } : {}),
      ...(typeof row.edits_hash === "string" ? { edits_hash: row.edits_hash } : {}),
      ...(typeof row.body_sha256 === "string" ? { body_sha256: row.body_sha256 } : {}),
      ...(Array.isArray(row.unit_inputs) ? { unit_inputs: [...row.unit_inputs] as string[] } : {}),
      ...(typeof row.unit_inputs_sha256 === "string" ? { unit_inputs_sha256: row.unit_inputs_sha256 } : {}),
      ...(row.unit_flags_sha256 === null || typeof row.unit_flags_sha256 === "string" ? { unit_flags_sha256: row.unit_flags_sha256 } : {}),
      ...(Array.isArray(row.callers) ? { callers: row.callers.map((caller) => ({ ...(caller as Record<string, unknown>) })) } : {}),
    });
  }
  return rows;
}

/**
 * Reads `decide` output, or the `decision` field of `check` output. Returns
 * null for anything malformed: a missing/unknown `attempt`, a function row
 * without unit, name and a known decision, or a `violations` /
 * `unused_checks` entry of the wrong shape.
 */
export function parseSteeringDecision(json: unknown): SteeringDecision | null {
  const root = isRecord(json) && isRecord(json.decision) && !("attempt" in json) ? json.decision : json;
  if (!isRecord(root)) return null;
  const attempt = decisionKind(root.attempt);
  if (!attempt || !Array.isArray(root.functions)) return null;
  const functions: SteeringFunctionDecision[] = [];
  for (const row of root.functions) {
    if (!isRecord(row) || typeof row.unit !== "string" || typeof row.name !== "string") return null;
    const decision = decisionKind(row.decision);
    if (!decision) return null;
    const match = isRecord(row.match) ? row.match : {};
    functions.push({
      unit: row.unit,
      name: row.name,
      decision,
      semantic: row.semantic === "clean" || row.semantic === "steering" ? row.semantic : "unresolved",
      analysis: row.analysis === "complete" ? "complete" : "incomplete",
      audit_label: typeof row.audit_label === "string" ? row.audit_label : "unresolved",
      match: { base: finiteOrNull(match.base), candidate: finiteOrNull(match.candidate), real_only: finiteOrNull(match.real_only) },
      ...(Array.isArray(row.groups) && row.groups.every((id) => typeof id === "string" && id !== "") ? { groups: [...row.groups] as string[] } : {}),
    });
  }
  const probes = (Array.isArray(root.probes) ? root.probes : [])
    .filter((probe): probe is SteeringProbe => isRecord(probe) && typeof probe.function === "string" && typeof probe.unit === "string");
  if (root.removable_noncosmetic !== undefined && !Array.isArray(root.removable_noncosmetic)) return null;
  if (root.unresolved_groups !== undefined && !Array.isArray(root.unresolved_groups)) return null;
  let units: SteeringUnitCoverage[] | undefined;
  if (root.units !== undefined) {
    if (!Array.isArray(root.units)) return null;
    units = [];
    for (const row of root.units) {
      if (!isRecord(row) || typeof row.unit !== "string") return null;
      // Anything but a literal true is "not built" / "not compared".
      if (row.exempt !== undefined && typeof row.exempt !== "string") return null;
      units.push({
        unit: row.unit,
        built: row.built === true,
        compared: row.compared === true,
        ...(typeof row.exempt === "string" ? { exempt: row.exempt } : {}),
      });
    }
  }
  const violations = parseViolations(root.violations, root.functions);
  const unusedChecks = parseUnusedChecks(root.unused_checks);
  const orderChecks = parseOrderChecks(root.order_checks);
  if (!violations || !unusedChecks || !orderChecks) return null;
  return {
    attempt,
    reasons: stringList(root.reasons),
    functions,
    removable_noncosmetic: Array.isArray(root.removable_noncosmetic) ? root.removable_noncosmetic.map(String) : [],
    probes,
    ...(units ? { units } : {}),
    ...(root.no_changes === true || root.changed === false ? { no_changes: true } : {}),
    ...(Array.isArray(root.unresolved_groups) ? { unresolved_groups: root.unresolved_groups.map(String) } : {}),
    violations,
    unused_checks: unusedChecks,
    order_checks: orderChecks,
  };
}

function fileLine(file: string, line: number | undefined): string {
  return `${file}${line != null ? `:${line}` : ""}`;
}

/** The certificate problem one violation raises; it names the rule. */
export function steeringViolationProblem(violation: SteeringViolation): string {
  if (isOutOfOrderViolation(violation)) {
    return `out of order: ${fileLine(violation.file, violation.line)} uses ${violation.class} (owner ${violation.owner_unit}, not decompiled) — don't fill in code that needs classes whose units are not decompiled`;
  }
  const where = violation.function != null ? `${violation.function} (${fileLine(violation.file, violation.line)})` : fileLine(violation.file, violation.line);
  return isDeadUnusedViolation(violation)
    ? `dead UNUSED body: ${where} — UNUSED functions may only be reconstructed when inlined`
    : `rule violation ${violation.kind}: ${where}`;
}

/** The certificate problem an `unknown` order check raises (class owner or progress unknown: analysis incomplete). */
export function steeringOrderCheckProblem(check: SteeringOrderCheck): string {
  return `order check unknown: ${check.class} at ${fileLine(check.file, check.line)}${check.reason ? `: ${check.reason}` : ""}`;
}

/** The certificate problem an inconclusive stub test raises (analysis incomplete). */
export function steeringInconclusiveProblem(check: SteeringUnusedCheck): string {
  return `UNUSED stub test inconclusive: ${check.function} (${check.file})${check.reason ? `: ${check.reason}` : ""}`;
}

function functionLabel(fn: SteeringFunctionDecision): string {
  const realOnly = fn.match.real_only == null ? "" : ` (without steering: ${fn.match.real_only}%)`;
  return `${fn.name}${realOnly}`;
}

/** `reduce` facts the certificate needs: its analysis and the ids of unresolved groups. */
export function reduceCertificateFacts(reduce: unknown): Pick<SteeringCertificateContext, "reduceAnalysis" | "unresolvedGroups"> {
  const record = isRecord(reduce) ? reduce : {};
  const groups = Array.isArray(record.groups) ? record.groups : [];
  return {
    reduceAnalysis: typeof record.analysis === "string" ? record.analysis : null,
    unresolvedGroups: groups.filter((group) => isRecord(group) && group.status === "unresolved")
      .map((group, index) => String((group as Record<string, unknown>).id ?? `#${index}`)),
  };
}

/**
 * The certificate context for a decision: `reduce`'s analysis (incomplete
 * reduction always rejects), and the unresolved groups as `decide` left them
 * after its evidence promotions. A decision without `unresolved_groups` falls
 * back to `reduce`'s pre-promotion list (fail closed).
 */
export function steeringCertificateContext(params: { decision: SteeringDecision | null; reduce: unknown; edits?: unknown; sourceChanged?: boolean }): SteeringCertificateContext {
  const facts = reduceCertificateFacts(params.reduce);
  return {
    sourceChanged: params.sourceChanged ?? editsChangeSource(params.edits),
    reduceAnalysis: facts.reduceAnalysis,
    unresolvedGroups: params.decision?.unresolved_groups ?? facts.unresolvedGroups,
  };
}

/** True when an `edits` report carries at least one file whose text or existence differs from the base. */
export function editsChangeSource(edits: unknown): boolean {
  const files = isRecord(edits) && Array.isArray(edits.files) ? edits.files : [];
  return files.some((file) => isRecord(file) && (
    // `check` omits texts unless `--full`: a listed file without texts is a changed file.
    (file.base_text === undefined && file.cand_text === undefined)
    || file.base_exists !== file.cand_exists
    || file.base_text !== file.cand_text
  ));
}

/**
 * Everything that keeps a decision from certifying an attempt (empty = certified).
 * The top-level `attempt` is never trusted alone: every function row must
 * pass cleanly with complete analysis, no behaviour-identical non-cosmetic
 * group may remain, every touched unit must be built and compared, a
 * source change must yield at least one considered function and one unit,
 * no rule violation may be listed, no UNUSED stub test may be inconclusive
 * and no order check may be unknown.
 */
export function steeringCertificateProblems(
  decision: SteeringDecision | null,
  context: Partial<SteeringCertificateContext> = {},
): string[] {
  if (!decision) return ["no valid steering decision (malformed or missing certificate)"];
  const problems: string[] = [];
  const sourceChanged = context.sourceChanged ?? true;
  const located = decision.functions.filter((fn) => fn.decision === "steering_located");
  const unresolved = decision.functions.filter((fn) => fn.decision === "unresolved");
  if (located.length > 0) problems.push(`steering located in ${located.map(functionLabel).join(", ")}`);
  if (unresolved.length > 0) problems.push(`unresolved: ${unresolved.map(functionLabel).join(", ")}`);
  const violations = decision.violations ?? [];
  for (const violation of violations) problems.push(steeringViolationProblem(violation));
  // A rule_violation row is explained by its violation; one without a listed violation still rejects.
  const unexplained = decision.functions.filter((fn) => fn.decision === "rule_violation"
    && !violations.some((violation) => violation.function === fn.name && violation.unit === fn.unit));
  if (unexplained.length > 0) problems.push(`rule violation in ${unexplained.map((fn) => fn.name).join(", ")}`);
  for (const check of decision.unused_checks ?? []) {
    if (check.status === "inconclusive") problems.push(steeringInconclusiveProblem(check));
  }
  // `out_of_order` checks are listed as violations already; `ok` adds nothing.
  for (const check of decision.order_checks ?? []) {
    if (check.status === "unknown") problems.push(steeringOrderCheckProblem(check));
  }
  const inconsistent = decision.functions.filter((fn) => fn.decision === "pass" && (fn.semantic !== "clean" || fn.analysis !== "complete"));
  if (inconsistent.length > 0) problems.push(`pass without clean, complete analysis: ${inconsistent.map((fn) => fn.name).join(", ")}`);
  if (decision.removable_noncosmetic.length > 0) {
    problems.push(`behaviour-identical edit groups left in the patch: ${decision.removable_noncosmetic.join(", ")}`);
  }
  const declaredNoChange = decision.no_changes === true && !sourceChanged;
  const units = decision.units ?? [];
  if (!declaredNoChange) {
    if (decision.functions.length === 0) problems.push("no function was considered for a source change");
    if (!decision.units) problems.push("no unit coverage reported");
    else if (units.length === 0) problems.push("empty unit coverage for a source change");
  }
  const uncovered = units.filter((unit) => !unitCovered(unit));
  if (uncovered.length > 0) {
    problems.push(`units not built and compared: ${uncovered.map((unit) =>
      `${unit.unit}${unit.built ? "" : " (not built)"}${unit.compared ? "" : " (not compared)"}${unit.exempt !== undefined ? ` (skipped: ${unit.exempt})` : ""}`).join(", ")}`);
  }
  if (context.reduceAnalysis !== undefined && context.reduceAnalysis !== "complete") {
    problems.push(`reduction analysis ${context.reduceAnalysis ?? "missing"}`);
  }
  if (context.unresolvedGroups && context.unresolvedGroups.length > 0) {
    problems.push(`unresolved edit groups: ${context.unresolvedGroups.join(", ")}`);
  }
  // A non-pass attempt is always a problem; name it only when nothing above already explains it.
  if (decision.attempt !== "pass" && problems.length === 0) {
    problems.push(`attempt decision is ${decision.attempt}${decision.reasons.length > 0 ? ` (${decision.reasons.join("; ")})` : ""}`);
  }
  return problems;
}

class SteeringBudgetExceeded extends Error {}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function invocationError(result: CommandResult, step: string): string {
  const stderr = result.stderr.trim();
  return `steering_check.py ${step} exited ${result.exitCode}${stderr ? `: ${stderr.slice(-400)}` : ""}`;
}

/** Edit ids of every group `reduce` marked removable: what `mwcc` reverts to build S*. */
export function removableEditIds(reduce: unknown): string[] {
  const groups = isRecord(reduce) && Array.isArray(reduce.groups) ? reduce.groups : [];
  const ids: string[] = [];
  for (const group of groups) {
    if (!isRecord(group) || group.status !== "removable") continue;
    for (const id of Array.isArray(group.edit_ids) ? group.edit_ids : []) {
      if ((typeof id === "string" || typeof id === "number") && !ids.includes(String(id))) ids.push(String(id));
    }
  }
  return ids;
}

/**
 * The worker gate: edits(sandbox) -> reduce(host) -> mwcc(sandbox) ->
 * decide(host). Writes `attempt-N.steering.json` (plus the step outputs) to
 * `outputDir`. Never throws: tool failures, malformed output and the budget
 * all land in `error` with `decision: null`. Each runner call gets the
 * remaining budget as its timeout, so a step the budget ends is killed.
 */
export async function runWorkerSteeringGate(params: {
  baseRev: string;
  functions: string[];
  hostRepoRoot: string;
  cacheDir: string;
  outputDir: string;
  attemptIndex: number;
  mode: SteeringGateMode;
  runner: SteeringRunner;
  budgetMs?: number;
  /** `mwcc --jobs`; defaults to the sandbox CPU count, capped at 3. */
  mwccJobs?: number;
  approvalsPath?: string;
  lessonsPath?: string;
}): Promise<WorkerSteeringResult> {
  const started = Date.now();
  const budgetMs = params.budgetMs ?? steeringGateBudgetMs();
  const deadline = started + budgetMs;
  const prefix = `attempt-${params.attemptIndex}.steering`;
  const path = (step: string) => resolve(params.outputDir, `${prefix}.${step}.json`);
  const steps: Record<string, unknown> = {};
  let decision: SteeringDecision | null = null;
  let error: string | null = null;
  let certificate: SteeringCertificateContext | undefined;

  /** What is left of the budget, at least 1 s: the per-call timeout handed to the runner. */
  const remainingMs = () => Math.max(1_000, deadline - Date.now());

  /** Starts `start` only once the budget check passes, so no work runs unraced (and unhandled). */
  const withBudget = async <T>(name: string, start: () => Promise<T>): Promise<T> => {
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new SteeringBudgetExceeded(`steering gate budget of ${Math.round(budgetMs / 1000)}s exceeded before ${name}`);
    const work = Promise.resolve().then(start);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new SteeringBudgetExceeded(`steering gate budget of ${Math.round(budgetMs / 1000)}s exceeded during ${name}`)),
        remaining,
      );
    });
    try {
      return await Promise.race([work, timeout]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  };

  const step = async (name: string, args: string[], where: "sandbox" | "host"): Promise<CommandResult> => {
    const stepStart = Date.now();
    const result = await withBudget(name, () => params.runner(args, where, { timeoutMs: remainingMs() }));
    steps[name] = { where, exit_code: result.exitCode, duration_ms: Date.now() - stepStart };
    if (result.exitCode !== 0) throw new Error(invocationError(result, name));
    return result;
  };

  /** Host steps write `--out`; fall back to stdout when the file is missing. */
  const readStepJson = async (name: string, outPath: string, result: CommandResult): Promise<unknown> => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(await readFile(outPath, "utf8"));
    } catch {
      parsed = parseJson(result.stdout);
      if (parsed !== undefined) await writeFile(outPath, `${JSON.stringify(parsed, null, 2)}\n`);
    }
    if (!isRecord(parsed)) throw new Error(`steering_check.py ${name} did not return JSON`);
    return parsed;
  };

  try {
    await mkdir(params.outputDir, { recursive: true });
    // A stale step file from an earlier gate must never stand in for this one's output.
    await Promise.all(["edits", "reduce", "mwcc", "decision"].map((name) => rm(path(name), { force: true })));
    if (params.cacheDir) await mkdir(params.cacheDir, { recursive: true });

    const editsResult = await step("edits", ["edits", "--repo", ".", "--base-ref", params.baseRev, "--json"], "sandbox");
    const edits = parseJson(editsResult.stdout);
    if (!isRecord(edits) || typeof edits.edits_hash !== "string") throw new Error("steering_check.py edits did not return the expected JSON");
    await writeFile(path("edits"), JSON.stringify(edits));

    const reduceBudget = Math.max(1, Math.min(STEERING_REDUCE_BUDGET_SECONDS, Math.floor((deadline - Date.now()) / 2000)));
    const reduceResult = await step("reduce", [
      "reduce", "--oracle-repo", params.hostRepoRoot, "--input", path("edits"), "--cache-dir", params.cacheDir,
      "--budget-seconds", String(reduceBudget), "--json", "--out", path("reduce"),
    ], "host");
    const reduce = await readStepJson("reduce", path("reduce"), reduceResult);
    // Provisional until `decide` reports its final group statuses.
    certificate = steeringCertificateContext({ decision: null, reduce, edits });

    // mwcc runs attribution and the map-call / data-order evidence checks from the host reduction.
    const upload = params.runner.uploadToSandbox;
    if (!upload) throw new Error("steering runner cannot upload the reduce report for mwcc --attribute");
    const attributePath = sandboxAttributePath(params.attemptIndex);
    await withBudget("attribute upload", () => upload(attributePath, JSON.stringify(reduce), { timeoutMs: remainingMs(), deadlineMs: deadline }));
    steps["attribute upload"] = { where: "sandbox", path: attributePath };

    const mwccResult = await step("mwcc", [
      "mwcc", "--repo", ".", "--base-ref", params.baseRev, "--edits-hash", edits.edits_hash,
      "--revert-edits", removableEditIds(reduce).join(","),
      "--attribute", attributePath,
      ...(params.functions.length > 0 ? ["--functions", params.functions.join(",")] : []),
      "--jobs", String(params.mwccJobs ?? steeringMwccJobs()),
      "--mwcc-budget-seconds", String(Math.max(1, Math.floor(remainingMs() / 1000) - STEERING_MWCC_BUDGET_SLACK_SECONDS)),
      "--json",
    ], "sandbox");
    const mwcc = parseJson(mwccResult.stdout);
    if (!isRecord(mwcc) || !Array.isArray(mwcc.functions)) throw new Error("steering_check.py mwcc did not return the expected JSON");
    await writeFile(path("mwcc"), JSON.stringify(mwcc, null, 2));

    const decideResult = await step("decide", [
      "decide", "--reduce", path("reduce"), "--mwcc", path("mwcc"), "--evidence-repo", params.hostRepoRoot,
      ...(params.approvalsPath ? ["--approvals", params.approvalsPath] : []),
      ...(params.lessonsPath ? ["--lessons", params.lessonsPath] : []),
      "--json", "--out", path("decision"),
    ], "host");
    decision = parseSteeringDecision(await readStepJson("decide", path("decision"), decideResult));
    if (!decision) throw new Error("steering_check.py decide did not return a valid decision");
    certificate = steeringCertificateContext({ decision, reduce, sourceChanged: certificate.sourceChanged });
  } catch (cause) {
    decision = null;
    error = cause instanceof Error ? cause.message : String(cause);
  }

  const durationMs = Date.now() - started;
  const artifactPath = resolve(params.outputDir, `${prefix}.json`);
  try {
    await writeFile(artifactPath, `${JSON.stringify({
      mode: params.mode,
      base_rev: params.baseRev,
      functions: params.functions,
      budget_ms: budgetMs,
      duration_ms: durationMs,
      steps,
      error,
      certificate: certificate ?? null,
      certificate_problems: error ? null : steeringCertificateProblems(decision, certificate),
      decision,
    }, null, 2)}\n`);
    return { mode: params.mode, decision, error, artifactPath, durationMs, ...(certificate ? { certificate } : {}) };
  } catch {
    return { mode: params.mode, decision, error, artifactPath: null, durationMs, ...(certificate ? { certificate } : {}) };
  }
}

/**
 * The hard-gate rejection reason in enforce mode, or null when the attempt
 * passes or the gate only observes (shadow/off).
 */
export function steeringRejectionReason(result: WorkerSteeringResult): string | null {
  if (result.mode !== "enforce") return null;
  if (result.error || !result.decision) {
    return `steering_located: the steering gate could not certify this attempt (${result.error ?? "no decision"}), so nothing is banked. ${STEERING_LOCATED_INSTRUCTION}`;
  }
  const problems = steeringCertificateProblems(result.decision, result.certificate);
  if (problems.length === 0) return null;
  return `steering_located: ${problems.join("; ")}. ${steeringRepairInstruction(result)}`;
}

/**
 * The standing repair instruction for a rejected attempt, built from the
 * violation kinds `decide` listed: the UNUSED-body instruction for a dead
 * UNUSED body, the out-of-order instruction for an `out_of_order` reference
 * (both when both), plus the steering instruction when something else was
 * rejected too (or no known violation kind explains the rejection).
 */
export function steeringRepairInstruction(result: Pick<WorkerSteeringResult, "decision" | "certificate" | "error"> | null | undefined): string {
  const decision = result?.error ? null : result?.decision;
  const violations = decision?.violations ?? [];
  if (!decision || violations.length === 0) return STEERING_LOCATED_INSTRUCTION;
  const parts = [
    ...(violations.some(isDeadUnusedViolation) ? [UNUSED_BODY_INSTRUCTION] : []),
    ...(violations.some(isOutOfOrderViolation) ? [OUT_OF_ORDER_INSTRUCTION] : []),
  ];
  const explained = new Set(violations.filter((violation) => isDeadUnusedViolation(violation) || isOutOfOrderViolation(violation)).map(steeringViolationProblem));
  const other = steeringCertificateProblems(decision, result?.certificate).filter((problem) => !explained.has(problem));
  return [...parts, ...(other.length > 0 || parts.length === 0 ? [STEERING_LOCATED_INSTRUCTION] : [])].join(" ");
}
