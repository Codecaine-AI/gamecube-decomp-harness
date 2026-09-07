import { posix } from "node:path";
import type { SandboxHandle } from "@server/core/job-queue/sandbox.js";

const PROBE_TIMEOUT_MS = 10_000;
const COMPARE_TIMEOUT_MS = 60_000;
const DEFAULT_CAPTURE_TIMEOUT_SECONDS = 900;
const MIN_CAPTURE_TIMEOUT_SECONDS = 60;
const MAX_CAPTURE_TIMEOUT_SECONDS = 1_800;
const OUTPUT_TAIL_LENGTH = 4_000;
const NOT_PROVISIONED_GUIDANCE = "This sandbox image snapshot predates the MWCC allocator tooling; do not retry or treat as a tool error. Continue with checkdiff/mwcc_debug_lookup evidence.";
const SYMBOL_PATTERN = /^[A-Za-z_][A-Za-z0-9_$]*$/;
const CAPTURES = new Set(["pcode", "coloring", "pair", "trace"]);

interface SandboxMwccAllocInput {
  sandboxHandle: SandboxHandle;
  workspaceRoot: string;
  args: string[];
}

interface ParsedSnapshotArgs {
  unit: string;
  functionName: string;
  capture: string;
  timeoutSeconds: number;
  traceDetail?: string;
}

interface ParsedCompareArgs {
  before: string;
  after: string;
}

function toolError(
  operation: string,
  status: string,
  errorKind: string,
  errorSummary: string,
  details: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    status,
    operation,
    tool_error: true,
    error_kind: errorKind,
    error_summary: errorSummary,
    ...details,
  };
}

function isToolError(value: object): value is Record<string, unknown> {
  return "tool_error" in value;
}

function validWorkspaceRelativePath(value: string): boolean {
  return value.length > 0
    && !posix.isAbsolute(value)
    && !value.includes("\\")
    && !value.includes("\0")
    && !value.split("/").includes("..");
}

function outputTail(value: string): string {
  return value.slice(-OUTPUT_TAIL_LENGTH);
}

function rejected(operation: string, summary: string): Record<string, unknown> {
  return toolError(operation, "rejected_arguments", "sandbox_exec_contract_rejected", summary);
}

function parseSnapshotArgs(args: string[], operation: string): ParsedSnapshotArgs | Record<string, unknown> {
  const values = new Map<string, string>();
  let jsonSeen = false;
  const valueArgs = new Set(["--repo-root", "--unit", "--function", "--capture", "--timeout-seconds", "--trace-detail"]);
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--json") {
      if (jsonSeen) return rejected(operation, "duplicate --json");
      jsonSeen = true;
      continue;
    }
    if (!valueArgs.has(arg)) return rejected(operation, `mwcc_alloc snapshot sandbox shim received unrecognized API argument: ${arg}`);
    const value = args[index + 1];
    if (value === undefined) return rejected(operation, `${arg} requires a value`);
    if (values.has(arg)) return rejected(operation, `duplicate ${arg}`);
    values.set(arg, value);
    index += 1;
  }
  if (!values.has("--repo-root") || !values.get("--unit") || !values.get("--function")) {
    return rejected(operation, "mwcc_alloc snapshot sandbox shim requires --repo-root, --unit, and --function");
  }
  const unit = values.get("--unit")!;
  if (!validWorkspaceRelativePath(unit)) return rejected(operation, `--unit must be a non-escaping workspace-relative path: ${unit}`);
  const functionName = values.get("--function")!;
  if (!SYMBOL_PATTERN.test(functionName)) return rejected(operation, `--function is not a valid MWCC symbol: ${functionName}`);
  const capture = values.get("--capture") ?? "pair";
  if (!CAPTURES.has(capture)) return rejected(operation, `--capture must be one of pcode, coloring, pair, or trace: ${capture}`);
  const traceDetail = values.get("--trace-detail");
  if (traceDetail !== undefined && (capture !== "trace" || !["stages", "full"].includes(traceDetail))) return rejected(operation, "--trace-detail requires capture=trace and must be stages or full");
  const rawTimeout = values.get("--timeout-seconds");
  const numericTimeout = rawTimeout === undefined ? DEFAULT_CAPTURE_TIMEOUT_SECONDS : Number(rawTimeout);
  if (!Number.isFinite(numericTimeout)) return rejected(operation, "--timeout-seconds must be a finite number");
  const timeoutSeconds = Math.min(MAX_CAPTURE_TIMEOUT_SECONDS, Math.max(MIN_CAPTURE_TIMEOUT_SECONDS, Math.trunc(numericTimeout)));
  return { unit, functionName, capture, timeoutSeconds, traceDetail };
}

function parseCompareArgs(args: string[], operation: string): ParsedCompareArgs | Record<string, unknown> {
  const values = new Map<string, string>();
  let jsonSeen = false;
  const valueArgs = new Set(["--repo-root", "--before", "--after"]);
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--json") {
      if (jsonSeen) return rejected(operation, "duplicate --json");
      jsonSeen = true;
      continue;
    }
    if (!valueArgs.has(arg)) return rejected(operation, `mwcc_alloc compare sandbox shim received unrecognized API argument: ${arg}`);
    const value = args[index + 1];
    if (value === undefined) return rejected(operation, `${arg} requires a value`);
    if (values.has(arg)) return rejected(operation, `duplicate ${arg}`);
    values.set(arg, value);
    index += 1;
  }
  if (!values.has("--repo-root") || !values.get("--before") || !values.get("--after")) {
    return rejected(operation, "mwcc_alloc compare sandbox shim requires --repo-root, --before, and --after");
  }
  const before = values.get("--before")!;
  const after = values.get("--after")!;
  if (!validWorkspaceRelativePath(before)) return rejected(operation, `--before must be a non-escaping workspace-relative path: ${before}`);
  if (!validWorkspaceRelativePath(after)) return rejected(operation, `--after must be a non-escaping workspace-relative path: ${after}`);
  return { before, after };
}

async function executeJsonTool(input: {
  sandboxHandle: SandboxHandle;
  workspaceRoot: string;
  operation: string;
  probePath: string;
  command: string[];
  timeoutMs: number;
}): Promise<Record<string, unknown>> {
  try {
    const probe = await input.sandboxHandle.exec(
      ["test", "-f", input.probePath],
      { cwd: input.workspaceRoot, timeoutMs: PROBE_TIMEOUT_MS },
    );
    if (probe.exitCode === 1) return { status: "debug_tools_not_provisioned", guidance: NOT_PROVISIONED_GUIDANCE };
    if (probe.exitCode !== 0) {
      return toolError(
        input.operation,
        "sandbox_exec_probe_failed",
        "sandbox_exec_probe_failed",
        probe.stderr.trim() || `sandbox provisioning probe exited ${probe.exitCode}`,
        { exit_code: probe.exitCode },
      );
    }
    const result = await input.sandboxHandle.exec(
      input.command,
      { cwd: input.workspaceRoot, timeoutMs: input.timeoutMs },
    );
    let parsed: unknown;
    try {
      parsed = JSON.parse(result.stdout);
    } catch (error) {
      return toolError(
        input.operation,
        "tool_output_parse_error",
        "tool_output_parse_error",
        error instanceof Error ? error.message : String(error),
        {
          command: input.command,
          cwd: input.workspaceRoot,
          exit_code: result.exitCode,
          stdout: outputTail(result.stdout),
          stderr: outputTail(result.stderr),
        },
      );
    }
    return {
      operation: input.operation,
      cwd: input.workspaceRoot,
      command: input.command,
      exit_code: result.exitCode,
      tool_error: result.exitCode !== 0 ? true : undefined,
      error_kind: result.exitCode !== 0 ? "command_failed" : undefined,
      error_summary: result.exitCode !== 0 ? result.stderr.trim() || `command exited ${result.exitCode}` : undefined,
      parsed,
      stderr: result.stderr || undefined,
    };
  } catch (error) {
    return toolError(
      input.operation,
      "sandbox_exec_failed",
      "sandbox_exec_failed",
      error instanceof Error ? error.message : String(error),
    );
  }
}

/** Run an MWCC allocator capture inside the worker sandbox. */
export async function runSandboxMwccAllocSnapshot(input: SandboxMwccAllocInput): Promise<Record<string, unknown>> {
  const operation = "tool:mwcc_alloc:snapshot.py";
  const parsed = parseSnapshotArgs(input.args, operation);
  if (isToolError(parsed)) return parsed;
  const probePath = parsed.capture === "trace"
    ? "/opt/toolpacks/gamecube-decomp/compiler/mwcc_alloc/api/snapshot.py"
    : "build/tools/mwcc-alloc/mwcc_alloc_capture.py";
  const command = [
    "python3",
    probePath,
    ...(parsed.capture === "trace" ? ["--repo-root", input.workspaceRoot, "--trace-detail", parsed.traceDetail ?? "stages"] : []),
    "--unit",
    parsed.unit,
    "--function",
    parsed.functionName,
    "--capture",
    parsed.capture,
    "--timeout-seconds",
    String(parsed.timeoutSeconds),
    "--json",
  ];
  return executeJsonTool({
    sandboxHandle: input.sandboxHandle,
    workspaceRoot: input.workspaceRoot,
    operation,
    probePath,
    command,
    timeoutMs: (parsed.timeoutSeconds + 60) * 1_000,
  });
}

/** Compare two MWCC coloring snapshots inside the worker sandbox. */
export async function runSandboxMwccAllocCompare(input: SandboxMwccAllocInput): Promise<Record<string, unknown>> {
  const operation = "tool:mwcc_alloc:compare.py";
  const parsed = parseCompareArgs(input.args, operation);
  if (isToolError(parsed)) return parsed;
  const command = [
    "python3",
    "build/tools/mwcc-alloc/compare_coloring_snapshots.py",
    "--json",
    parsed.before,
    parsed.after,
  ];
  return executeJsonTool({
    sandboxHandle: input.sandboxHandle,
    workspaceRoot: input.workspaceRoot,
    operation,
    probePath: "build/tools/mwcc-alloc/compare_coloring_snapshots.py",
    command,
    timeoutMs: COMPARE_TIMEOUT_MS,
  });
}

const ANALYSIS_OPTIONS: Record<string, string[]> = {
  provenance: ["--coloring", "--creations"],
  explain: ["--register"],
  inverse: ["--after", "--target", "--provenance", "--degree-search"],
  "source-rank": ["--function-index", "--target", "--fixed-object"],
  stack: ["--provenance", "--after"],
  origins: ["--after"],
};

/** Validate the offline API contract before touching the sandbox. Python also checks real paths. */
export function validateMwccAllocAnalyzeArgs(args: string[]): string[] | Record<string, unknown> {
  const operation = "tool:mwcc_alloc:analyze.py";
  const values = new Map<string, string[]>();
  const common = ["--repo-root", "--mode", "--input", "--output", "--json"];
  const known = new Set([...common, ...Object.values(ANALYSIS_OPTIONS).flat()]);
  for (let index = 0; index < args.length; index += 1) {
    const key = args[index];
    if (!known.has(key)) return rejected(operation, `unrecognized API argument: ${key}`);
    const previous = values.get(key) ?? [];
    if (previous.length && key !== "--coloring" && key !== "--target" && key !== "--fixed-object") return rejected(operation, `duplicate ${key}`);
    const value = key === "--json" ? "true" : args[++index];
    if (!value || value.startsWith("--")) return rejected(operation, `${key} requires a value`);
    values.set(key, [...previous, value]);
  }
  const mode = values.get("--mode")?.[0] ?? "";
  const allowed = Object.hasOwn(ANALYSIS_OPTIONS, mode) ? ANALYSIS_OPTIONS[mode] : undefined;
  if (!allowed) return rejected(operation, "unsupported analysis mode");
  for (const key of values.keys()) {
    if (![...common, ...allowed].includes(key)) return rejected(operation, `${key} is not supported for ${mode}`);
  }
  const required = ["--repo-root", "--input"];
  if (mode === "explain") required.push("--register");
  if (mode === "inverse") required.push("--after", "--target");
  if (mode === "source-rank") required.push("--function-index", "--target");
  for (const key of required) if (!values.has(key)) return rejected(operation, `${mode} requires ${key}`);
  for (const key of ["--input", "--output", "--after", "--provenance", "--creations", "--coloring"]) {
    for (const value of values.get(key) ?? []) {
      if (!validWorkspaceRelativePath(value)) return rejected(operation, `${key} must be a non-escaping workspace-relative path`);
    }
  }
  for (const [key, min, max] of [["--function-index", 1, 100000], ["--degree-search", 0, 8]] as const) {
    const value = values.get(key)?.[0];
    if (value !== undefined && (!/^\d+$/.test(value) || Number(value) < min || Number(value) > max)) return rejected(operation, `${key} must be an integer from ${min} to ${max}`);
  }
  const register = values.get("--register")?.[0];
  if (register && (!/^(gpr|fpr|vr):[0-9]+$/.test(register) || Number(register.split(":")[1]) > 65535)) return rejected(operation, "invalid --register");
  const fixedObjects = values.get("--fixed-object") ?? [];
  if (fixedObjects.length > 64) return rejected(operation, "at most 64 fixed objects are allowed");
  if (new Set(fixedObjects).size !== fixedObjects.length) return rejected(operation, "fixed objects must be unique");
  for (const object of fixedObjects) {
    if (!/^v[0-9]+$/.test(object) || Number(object.slice(1)) > 65535) return rejected(operation, "--fixed-object must be vN with N from 0 to 65535");
  }
  const targets = values.get("--target") ?? [];
  if (targets.length > 16) return rejected(operation, "at most 16 targets are allowed");
  for (const target of targets) {
    const match = /^(\d+)=(\d+)$/.exec(target);
    if (!match || Number(match[1]) > 65535 || Number(match[2]) > 31) return rejected(operation, "--target must be vreg=physical with vreg 0..65535 and physical 0..31");
  }
  if ((values.get("--coloring")?.length ?? 0) > 64) return rejected(operation, "at most 64 coloring files are allowed");
  return args;
}

/** Analyze retained compiler evidence without running the compiler. */
export async function runSandboxMwccAllocAnalyze(input: SandboxMwccAllocInput): Promise<Record<string, unknown>> {
  const parsed = validateMwccAllocAnalyzeArgs(input.args);
  if (!Array.isArray(parsed)) return parsed;
  const args = [...parsed];
  args[args.indexOf("--repo-root") + 1] = input.workspaceRoot;
  if (!args.includes("--json")) args.push("--json");
  const probePath = "/opt/toolpacks/gamecube-decomp/compiler/mwcc_alloc/api/analyze.py";
  return executeJsonTool({
    sandboxHandle: input.sandboxHandle,
    workspaceRoot: input.workspaceRoot,
    operation: "tool:mwcc_alloc:analyze.py",
    probePath,
    command: ["python3", probePath, ...args],
    timeoutMs: COMPARE_TIMEOUT_MS,
  });
}
