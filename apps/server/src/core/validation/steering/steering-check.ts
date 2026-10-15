import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, isAbsolute, resolve } from "node:path";
import type { SteeringGateMode } from "@server/core/game-registry/resolver.js";
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
/** Per-call ceiling the runners bake in; the gate budget usually ends a step first. */
export const STEERING_STEP_TIMEOUT_MS = STEERING_GATE_BUDGET_MS;
/** Upper bound handed to `reduce --budget-seconds`. */
export const STEERING_REDUCE_BUDGET_SECONDS = 120;

export type SteeringDecisionKind = "pass" | "steering_located" | "unresolved";

export interface SteeringFunctionDecision {
  unit: string;
  name: string;
  decision: SteeringDecisionKind;
  semantic: "clean" | "steering" | "unresolved";
  analysis: "complete" | "incomplete";
  audit_label: string;
  match: { base: number | null; candidate: number | null; real_only: number | null };
}

export interface SteeringProbe {
  function: string;
  unit: string;
  [k: string]: unknown;
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
 * sandbox step can read a host-produced report (`mwcc --attribute`).
 */
export type SteeringRunner = ((args: string[], where: "sandbox" | "host") => Promise<CommandResult>) & {
  uploadToSandbox?: (workspacePath: string, content: string) => Promise<void>;
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
 */
export async function uploadThroughExec(exec: WorkspaceExec, workspacePath: string, content: string, timeoutMs = 60_000): Promise<void> {
  const bytes = Buffer.from(content, "utf8");
  for (let offset = 0, first = true; first || offset < bytes.length; offset += SANDBOX_UPLOAD_CHUNK_BYTES, first = false) {
    const chunk = bytes.subarray(offset, offset + SANDBOX_UPLOAD_CHUNK_BYTES).toString("base64");
    const result = await exec.exec(["python3", "-c", SANDBOX_WRITE_CHUNK_PY, workspacePath, first ? "wb" : "ab", chunk], { timeoutMs });
    if (result.exitCode !== 0) throw new Error(`upload of ${workspacePath} failed: ${result.stderr.trim().slice(-300)}`);
  }
  const check = await exec.exec(["python3", "-c", SANDBOX_SHA256_PY, workspacePath], { timeoutMs });
  const expected = createHash("sha256").update(bytes).digest("hex");
  if (check.exitCode !== 0 || check.stdout.trim() !== expected) {
    throw new Error(`upload of ${workspacePath} did not verify (sha256 ${check.stdout.trim() || "unreadable"} != ${expected})`);
  }
}

export const STEERING_LOCATED_INSTRUCTION =
  "The steering gate rejected this attempt: the match depends on edits that behave exactly like the code they replace. Use them as a probe. Keep only behaviour-changing fixes, find the real construct the original used (see steering_probe), and remove the steering edits.";

function failedResult(error: unknown): CommandResult {
  return { exitCode: 127, stdout: "", stderr: error instanceof Error ? error.message : String(error) };
}

function steeringEnv(mode: SteeringGateMode, extra: Record<string, string> = {}): Record<string, string> {
  return { ORCH_STEERING_GATE: mode, ...extra };
}

/**
 * Worker gate runner: sandbox steps run the toolpack copy synced into the
 * worker sandbox from the workspace root; host steps run the host toolpack
 * copy (`hostScript`) from `hostCwd`.
 */
export function workspaceSteeringRunner(
  exec: WorkspaceExec,
  hostScript: string,
  hostCwd: string,
  options: { timeoutMs?: number; mode?: SteeringGateMode; hostEnv?: Record<string, string> } = {},
): SteeringRunner {
  const timeoutMs = options.timeoutMs ?? STEERING_STEP_TIMEOUT_MS;
  const mode = options.mode ?? "shadow";
  const runner: SteeringRunner = async (args, where) => {
    try {
      if (where === "sandbox") {
        return await exec.exec(["python3", SANDBOX_STEERING_CHECK_SCRIPT, ...args], { timeoutMs, env: steeringEnv(mode) });
      }
      return await runCommand(hostCwd, ["python3", hostScript, ...args], { timeoutMs, env: steeringEnv(mode, options.hostEnv) });
    } catch (error) {
      return failedResult(error);
    }
  };
  runner.uploadToSandbox = (workspacePath, content) => uploadThroughExec(exec, workspacePath, content);
  return runner;
}

/** Backfill/validation runner: every step on the host, against a local checkout. */
export function hostSteeringRunner(
  scriptPath: string,
  cwd: string,
  options: { timeoutMs?: number; mode?: SteeringGateMode; env?: Record<string, string> } = {},
): SteeringRunner {
  const timeoutMs = options.timeoutMs ?? STEERING_STEP_TIMEOUT_MS;
  const mode = options.mode ?? "shadow";
  const runner: SteeringRunner = async (args) => {
    try {
      return await runCommand(cwd, ["python3", scriptPath, ...args], { timeoutMs, env: steeringEnv(mode, options.env) });
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
  return value === "pass" || value === "steering_located" || value === "unresolved" ? value : null;
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

/**
 * Reads `decide` output, or the `decision` field of `check` output. Returns
 * null for anything malformed: a missing/unknown `attempt` or a function row
 * without unit, name and a known decision.
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
  return {
    attempt,
    reasons: stringList(root.reasons),
    functions,
    removable_noncosmetic: Array.isArray(root.removable_noncosmetic) ? root.removable_noncosmetic.map(String) : [],
    probes,
    ...(units ? { units } : {}),
    ...(root.no_changes === true || root.changed === false ? { no_changes: true } : {}),
    ...(Array.isArray(root.unresolved_groups) ? { unresolved_groups: root.unresolved_groups.map(String) } : {}),
  };
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
 * group may remain, every touched unit must be built and compared, and a
 * source change must yield at least one considered function and one unit.
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
 * all land in `error` with `decision: null`.
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
  approvalsPath?: string;
  lessonsPath?: string;
}): Promise<WorkerSteeringResult> {
  const started = Date.now();
  const budgetMs = params.budgetMs ?? STEERING_GATE_BUDGET_MS;
  const deadline = started + budgetMs;
  const prefix = `attempt-${params.attemptIndex}.steering`;
  const path = (step: string) => resolve(params.outputDir, `${prefix}.${step}.json`);
  const steps: Record<string, unknown> = {};
  let decision: SteeringDecision | null = null;
  let error: string | null = null;
  let certificate: SteeringCertificateContext | undefined;

  const withBudget = async <T>(name: string, work: Promise<T>): Promise<T> => {
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new SteeringBudgetExceeded(`steering gate budget of ${Math.round(budgetMs / 1000)}s exceeded before ${name}`);
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
    const result = await withBudget(name, Promise.resolve().then(() => params.runner(args, where)));
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
    if (!params.runner.uploadToSandbox) throw new Error("steering runner cannot upload the reduce report for mwcc --attribute");
    const attributePath = sandboxAttributePath(params.attemptIndex);
    await withBudget("attribute upload", params.runner.uploadToSandbox(attributePath, JSON.stringify(reduce)));
    steps["attribute upload"] = { where: "sandbox", path: attributePath };

    const mwccResult = await step("mwcc", [
      "mwcc", "--repo", ".", "--base-ref", params.baseRev, "--edits-hash", edits.edits_hash,
      "--revert-edits", removableEditIds(reduce).join(","),
      "--attribute", attributePath,
      ...(params.functions.length > 0 ? ["--functions", params.functions.join(",")] : []),
      "--jobs", "3", "--json",
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
  return `steering_located: ${problems.join("; ")}. ${STEERING_LOCATED_INSTRUCTION}`;
}
