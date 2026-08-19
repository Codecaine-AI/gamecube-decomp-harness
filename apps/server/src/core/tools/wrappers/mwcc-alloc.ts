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
const CAPTURES = new Set(["pcode", "coloring", "pair"]);

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
  const valueArgs = new Set(["--repo-root", "--unit", "--function", "--capture", "--timeout-seconds"]);
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
  if (!CAPTURES.has(capture)) return rejected(operation, `--capture must be one of pcode, coloring, or pair: ${capture}`);
  const rawTimeout = values.get("--timeout-seconds");
  const numericTimeout = rawTimeout === undefined ? DEFAULT_CAPTURE_TIMEOUT_SECONDS : Number(rawTimeout);
  if (!Number.isFinite(numericTimeout)) return rejected(operation, "--timeout-seconds must be a finite number");
  const timeoutSeconds = Math.min(MAX_CAPTURE_TIMEOUT_SECONDS, Math.max(MIN_CAPTURE_TIMEOUT_SECONDS, Math.trunc(numericTimeout)));
  return { unit, functionName, capture, timeoutSeconds };
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
  const command = [
    "python3",
    "build/tools/mwcc-alloc/mwcc_alloc_capture.py",
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
    probePath: "build/tools/mwcc-alloc/mwcc_alloc_capture.py",
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
