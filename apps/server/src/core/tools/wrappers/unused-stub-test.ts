/**
 * `unused_stub_test`: the UNUSED stub test of one function
 * (`steering_check.py unused-test`, objectives/sms-real-codegen/unused-rule.md).
 *
 * Steering-gated games only (SMS). The resolver routes the `steering_check`
 * tool's `unused_test.py` into the worker sandbox (cwd = the sandbox checkout)
 * and refuses it without one; steering_check compiles C and the stubbed C' in
 * shadow roots under /tmp, so the checkout is never written.
 */
import { isAbsolute } from "node:path";
import { scaleTimeout, toolTimeoutScale } from "../timeout-scale.js";
import { gameSteeringGate, steeringGateActive } from "../steering-gate.js";
import { boundToolPayload } from "../runtime/bounded-json.js";
import type { AgentToolRuntimeContext } from "../types.js";

/** Most `changed`/`callers` rows kept per check; the rest are counted. */
export const UNUSED_STUB_TEST_MAX_ROWS = 12;
/** Most checks kept (one per definition the qualified name matches). */
export const UNUSED_STUB_TEST_MAX_CHECKS = 6;
const MAX_STDERR_CHARS = 2000;

/** A git revision the CLI may receive: no option-looking or whitespace values. */
const REVISION = /^[A-Za-z0-9_][A-Za-z0-9_./~^@{}-]*$/;

function text(params: Record<string, unknown>, key: string): string {
  return String(params[key] ?? "").trim();
}

function rejected(error_summary: string): Record<string, unknown> {
  return { status: "rejected_arguments", tool_error: true, error_kind: "invalid_arguments", error_summary };
}

/**
 * CLI arguments for `unused_test.py`, or a status payload when the call
 * cannot run (wrong game, missing or unsafe parameters).
 */
export function unusedStubTestArgs(
  params: Record<string, unknown>,
  context: Pick<AgentToolRuntimeContext, "repoRoot" | "game" | "timeoutScale">,
): string[] | Record<string, unknown> {
  if (!steeringGateActive(gameSteeringGate(context.game))) {
    return { status: "unavailable", reason: "unused_stub_test runs only for games whose steering gate is active (SMS)." };
  }
  const file = text(params, "file");
  const fn = text(params, "function");
  if (!file) return { status: "missing_file" };
  if (!fn) return { status: "missing_function" };
  if (isAbsolute(file) || file.startsWith("-") || file.split(/[\\/]/).includes("..")) {
    return rejected("file must be a repo-relative source path, e.g. src/Enemy/chuuhana.cpp");
  }
  if (fn.startsWith("-")) return rejected("function must be a qualified name, e.g. TChuuHana::rolling");
  const baseRef = text(params, "base_ref");
  if (baseRef && !REVISION.test(baseRef)) return rejected("base_ref must be a git revision, e.g. HEAD");
  const timeout = params.timeout_seconds === undefined
    ? scaleTimeout(180, toolTimeoutScale(context), 900)
    : Math.max(30, Math.min(900, Math.trunc(Number(params.timeout_seconds)) || 180));
  // One shadow root: the test compiles C, then C', one after the other.
  const args = ["--repo", context.repoRoot, "--file", file, "--function", fn, "--jobs", "1", "--timeout-seconds", String(timeout)];
  if (baseRef) args.push("--base-ref", baseRef);
  return args;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

const ROW_LISTS = ["changed", "callers"] as const;
const BOUND_HINT = "Rows past the cap are counted in <list>_omitted; the status fields carry the verdict. Rerun with function T::f(args) to test one overload.";

/** Bound one check row: the unit's input list becomes a count (its sha256 stays); rows are capped. */
function boundCheck(check: unknown): unknown {
  if (!isRecord(check)) return check;
  const { unit_inputs, ...rest } = check;
  const row: Record<string, unknown> = Array.isArray(unit_inputs) ? { ...rest, unit_inputs_count: unit_inputs.length } : rest;
  for (const key of ROW_LISTS) {
    const rows = row[key];
    if (!Array.isArray(rows)) continue;
    row[`${key}_total`] = rows.length;
    row[key] = rows.slice(0, UNUSED_STUB_TEST_MAX_ROWS);
  }
  return row;
}

/** `<list>_omitted` from the rows that survived every bounding step (total minus shown). */
function recordOmissions(check: unknown): unknown {
  if (!isRecord(check)) return check;
  const row: Record<string, unknown> = { ...check };
  for (const key of ROW_LISTS) {
    const total = row[`${key}_total`];
    const rows = row[key];
    delete row[`${key}_total`];
    if (typeof total !== "number" || !Array.isArray(rows)) continue;
    if (total > rows.length) row[`${key}_omitted`] = total - rows.length;
  }
  return row;
}

/**
 * Keep the result small enough for the worker context without losing the
 * verdict: rows are capped per check, then the whole payload is bounded
 * structurally (boundToolPayload) so the serialized result is always valid
 * JSON under the tool-output cap. Omission counts are computed last, from
 * what is actually shown.
 */
export function boundUnusedStubTestResult(result: Record<string, unknown>): Record<string, unknown> {
  const capped: Record<string, unknown> = { ...result };
  if (typeof capped.stderr === "string" && capped.stderr.length > MAX_STDERR_CHARS) {
    capped.stderr = `...${capped.stderr.slice(-MAX_STDERR_CHARS)}`;
  }
  const parsed = capped.parsed;
  const checksTotal = isRecord(parsed) && Array.isArray(parsed.checks) ? parsed.checks.length : 0;
  if (isRecord(parsed) && Array.isArray(parsed.checks)) {
    capped.parsed = { ...parsed, checks: parsed.checks.slice(0, UNUSED_STUB_TEST_MAX_CHECKS).map(boundCheck) };
  }
  const bounded = boundToolPayload("unused_stub_test", capped, BOUND_HINT);
  const shown = bounded.parsed;
  if (isRecord(shown) && Array.isArray(shown.checks)) {
    const checks = shown.checks.map(recordOmissions);
    bounded.parsed = {
      ...shown,
      checks,
      ...(checksTotal > checks.length ? { checks_omitted: checksTotal - checks.length } : {}),
    };
  }
  return bounded;
}
