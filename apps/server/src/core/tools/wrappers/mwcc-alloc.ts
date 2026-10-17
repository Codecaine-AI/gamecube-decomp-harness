import { createHash } from "node:crypto";
import { posix } from "node:path";
import type { SandboxHandle } from "@server/core/job-queue/sandbox.js";
import { scaleTimeout } from "../timeout-scale.js";
import { boundToolPayload, boundedToolPayloadCharacters } from "../runtime/bounded-json.js";

const PROBE_TIMEOUT_MS = 10_000;
const COMPARE_TIMEOUT_MS = 60_000;
const DEFAULT_CAPTURE_TIMEOUT_SECONDS = 900;
/** Native (traced compiler) captures are one stock + one traced compile. */
const DEFAULT_NATIVE_TIMEOUT_SECONDS = 300;
/** compare_sources: two variants, each a stock + traced compile. */
const DEFAULT_COMPARE_SOURCES_TIMEOUT_SECONDS = 600;
const MIN_CAPTURE_TIMEOUT_SECONDS = 60;
const MAX_CAPTURE_TIMEOUT_SECONDS = 1_800;
const OUTPUT_TAIL_LENGTH = 4_000;
const MAX_MANIFEST_BYTES = 4 * 1024 * 1024;
const NOT_PROVISIONED_GUIDANCE = "This sandbox image snapshot predates the MWCC allocator tooling; do not retry or treat as a tool error. Continue with checkdiff/mwcc_debug_lookup evidence.";
const SYMBOL_PATTERN = /^[A-Za-z_][A-Za-z0-9_$@]*$/;
/** Native captures select by name, so mangled C++ names (templates included) are allowed. */
const NATIVE_SYMBOL_PATTERN = /^[A-Za-z_~][A-Za-z0-9_$@<>,.~-]{0,511}$/;
const QEMU_CAPTURES = new Set(["pcode", "coloring", "pair", "trace"]);
const NATIVE_CAPTURES = new Set(["coloring-native", "decisions"]);
const CAPTURES = new Set([...QEMU_CAPTURES, ...NATIVE_CAPTURES]);
const BACKENDS = new Set(["auto", "native", "qemu"]);
const SYNCED_API = "/opt/toolpacks/gamecube-decomp/compiler/mwcc_alloc/api";
const SOURCE_DIRS = new Set(["src", "include", "libs"]);
const SOURCE_SUFFIX = /\.(c|cpp|cp|cxx|h|hpp|hh|inc|inl)$/i;
const REV_PATTERN = /^[A-Za-z0-9._\/~^-]{1,200}$/;

interface SandboxMwccAllocInput {
  sandboxHandle: SandboxHandle;
  workspaceRoot: string;
  args: string[];
  /** Sandbox profile multiplier for compiler-bound defaults. */
  timeoutScale?: number;
}

interface ParsedSnapshotArgs {
  unit: string;
  functionName: string;
  capture: string;
  /** The backend that will serve the capture (never "auto"). */
  backend: "native" | "qemu";
  timeoutSeconds: number;
  traceDetail?: string;
}

/** The backend serving a capture under --backend, or why it cannot. Mirrors api/native_backend.choose_backend. */
export function chooseMwccAllocBackend(capture: string, requested: string): { backend: "native" | "qemu" } | { reason: string } {
  if (NATIVE_CAPTURES.has(capture)) {
    return requested === "qemu" ? { reason: `capture ${capture} is produced only by the native traced compiler` } : { backend: "native" };
  }
  return requested === "native"
    ? { reason: `capture ${capture} needs PCode blocks and operands, which milestone 1 does not trace; use backend auto or qemu` }
    : { backend: "qemu" };
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

function parseSnapshotArgs(args: string[], operation: string, scale = 1): ParsedSnapshotArgs | Record<string, unknown> {
  const values = new Map<string, string>();
  let jsonSeen = false;
  const valueArgs = new Set(["--repo-root", "--unit", "--function", "--capture", "--backend", "--timeout-seconds", "--trace-detail"]);
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
  const capture = values.get("--capture") ?? "pair";
  const symbolPattern = NATIVE_CAPTURES.has(capture) ? NATIVE_SYMBOL_PATTERN : SYMBOL_PATTERN;
  if (!symbolPattern.test(functionName)) return rejected(operation, `--function is not a valid MWCC symbol: ${functionName}`);
  if (!CAPTURES.has(capture)) return rejected(operation, `--capture must be one of ${[...CAPTURES].join(", ")}: ${capture}`);
  const requestedBackend = values.get("--backend") ?? "auto";
  if (!BACKENDS.has(requestedBackend)) return rejected(operation, `--backend must be auto, native, or qemu: ${requestedBackend}`);
  const choice = chooseMwccAllocBackend(capture, requestedBackend);
  if ("reason" in choice) return toolError(operation, "backend_unsupported", "sandbox_exec_contract_rejected", choice.reason, { backend: requestedBackend, capture });
  const traceDetail = values.get("--trace-detail");
  if (traceDetail !== undefined && (capture !== "trace" || !["stages", "full"].includes(traceDetail))) return rejected(operation, "--trace-detail requires capture=trace and must be stages or full");
  const rawTimeout = values.get("--timeout-seconds");
  const defaultTimeout = choice.backend === "native" ? DEFAULT_NATIVE_TIMEOUT_SECONDS : DEFAULT_CAPTURE_TIMEOUT_SECONDS;
  const numericTimeout = rawTimeout === undefined ? scaleTimeout(defaultTimeout, scale, MAX_CAPTURE_TIMEOUT_SECONDS) : Number(rawTimeout);
  if (!Number.isFinite(numericTimeout)) return rejected(operation, "--timeout-seconds must be a finite number");
  const timeoutSeconds = Math.min(MAX_CAPTURE_TIMEOUT_SECONDS, Math.max(MIN_CAPTURE_TIMEOUT_SECONDS, Math.trunc(numericTimeout)));
  return { unit, functionName, capture, backend: choice.backend, timeoutSeconds, traceDetail };
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

/** Run an MWCC allocator capture inside the worker sandbox. The result names the backend used. */
export async function runSandboxMwccAllocSnapshot(input: SandboxMwccAllocInput): Promise<Record<string, unknown>> {
  const operation = "tool:mwcc_alloc:snapshot.py";
  const parsed = parseSnapshotArgs(input.args, operation, input.timeoutScale);
  if (isToolError(parsed)) return parsed;
  const native = parsed.backend === "native";
  // The baked capture script serves the legacy qemu captures unchanged; trace and
  // native captures need the synced API (vendored model, traced-compiler glue).
  const synced = native || parsed.capture === "trace";
  const probePath = synced ? `${SYNCED_API}/snapshot.py` : "build/tools/mwcc-alloc/mwcc_alloc_capture.py";
  const command = [
    "python3",
    probePath,
    ...(parsed.capture === "trace" ? ["--repo-root", input.workspaceRoot, "--trace-detail", parsed.traceDetail ?? "stages"] : []),
    ...(native ? ["--repo-root", input.workspaceRoot, "--backend", "native"] : []),
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
  const result = await executeJsonTool({
    sandboxHandle: input.sandboxHandle,
    workspaceRoot: input.workspaceRoot,
    operation,
    probePath,
    command,
    timeoutMs: (parsed.timeoutSeconds + 60) * 1_000,
  });
  return { ...result, backend: parsed.backend };
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
    timeoutMs: scaleTimeout(COMPARE_TIMEOUT_MS, input.timeoutScale ?? 1, MAX_CAPTURE_TIMEOUT_SECONDS * 1_000),
  });
}

interface ParsedCompareSourcesArgs {
  args: string[];
  manifests: Array<{ flag: "--a" | "--b"; json: string }>;
  timeoutSeconds: number;
}

/** Why a source-variant spec is unusable, or null. Python re-checks against the real checkout. */
function variantSpecError(spec: string): string | null {
  if (spec === "@worktree" || spec === "@base") return null;
  if (spec.startsWith("@base:")) return REV_PATTERN.test(spec.slice(6)) ? null : "invalid revision in @base:<rev>";
  if (spec.startsWith("@revert:")) {
    const match = /^@revert:(.+):(\d+)(?:-(\d+))?$/.exec(spec);
    if (!match) return "@revert takes <file>:<line> or <file>:<first>-<last>";
    return sourcePathError(match[1]);
  }
  if (spec.startsWith("@")) return `unknown variant ${spec}`;
  return validWorkspaceRelativePath(spec) && spec.endsWith(".json") ? null : "a manifest must be a workspace-relative .json path";
}

function sourcePathError(path: string): string | null {
  if (!validWorkspaceRelativePath(path)) return `${path} must be a non-escaping workspace-relative path`;
  if (!SOURCE_DIRS.has(path.split("/")[0]) || !SOURCE_SUFFIX.test(path)) return `${path} must be a C/C++ source or header under src/, include/ or libs/`;
  return null;
}

/** Validate an inline manifest ({files: {path: content|null}, base?}) and return its canonical JSON. */
export function mwccAllocManifestJson(value: unknown): string | { error: string } {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { error: "a manifest must be an object with files" };
  const { files, base } = value as { files?: unknown; base?: unknown };
  if (!files || typeof files !== "object" || Array.isArray(files) || !Object.keys(files).length) return { error: "manifest files must map at least one path to content or null" };
  for (const [path, content] of Object.entries(files as Record<string, unknown>)) {
    const error = sourcePathError(path);
    if (error) return { error };
    if (content !== null && typeof content !== "string") return { error: `manifest content for ${path} must be a string or null` };
  }
  if (base !== undefined && (typeof base !== "string" || !(base === "@worktree" || REV_PATTERN.test(base)))) return { error: "manifest base must be a revision or @worktree" };
  const json = JSON.stringify({ files, ...(base === undefined ? {} : { base }) });
  return json.length > MAX_MANIFEST_BYTES ? { error: `manifest is over ${MAX_MANIFEST_BYTES} bytes` } : json;
}

function parseCompareSourcesArgs(args: string[], operation: string, scale = 1): ParsedCompareSourcesArgs | Record<string, unknown> {
  const values = new Map<string, string>();
  const valueArgs = new Set(["--repo-root", "--unit", "--function", "--a", "--b", "--a-manifest-json", "--b-manifest-json", "--base-rev", "--timeout-seconds"]);
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--json") continue;
    if (!valueArgs.has(arg)) return rejected(operation, `mwcc_alloc compare_sources received unrecognized API argument: ${arg}`);
    const value = args[index + 1];
    if (value === undefined) return rejected(operation, `${arg} requires a value`);
    if (values.has(arg)) return rejected(operation, `duplicate ${arg}`);
    values.set(arg, value);
    index += 1;
  }
  const unit = values.get("--unit") ?? "";
  const functionName = values.get("--function") ?? "";
  if (!validWorkspaceRelativePath(unit)) return rejected(operation, `--unit must be a non-escaping workspace-relative path: ${unit}`);
  if (!NATIVE_SYMBOL_PATTERN.test(functionName)) return rejected(operation, `--function is not a valid MWCC symbol: ${functionName}`);
  const out = ["--unit", unit, "--function", functionName];
  const manifests: ParsedCompareSourcesArgs["manifests"] = [];
  for (const side of ["a", "b"] as const) {
    const spec = values.get(`--${side}`);
    const manifest = values.get(`--${side}-manifest-json`);
    if ((spec === undefined) === (manifest === undefined)) return rejected(operation, `give exactly one of --${side} or an inline manifest for ${side}`);
    if (spec !== undefined) {
      const error = variantSpecError(spec);
      if (error) return rejected(operation, `--${side}: ${error}`);
      out.push(`--${side}`, spec);
    } else {
      let parsedManifest: unknown;
      try {
        parsedManifest = JSON.parse(manifest!);
      } catch {
        return rejected(operation, `--${side}-manifest-json is not JSON`);
      }
      const json = mwccAllocManifestJson(parsedManifest);
      if (typeof json !== "string") return rejected(operation, `${side}: ${json.error}`);
      manifests.push({ flag: `--${side}`, json });
    }
  }
  const baseRev = values.get("--base-rev");
  if (baseRev !== undefined) {
    if (!REV_PATTERN.test(baseRev)) return rejected(operation, "--base-rev is not a revision");
    out.push("--base-rev", baseRev);
  }
  const rawTimeout = values.get("--timeout-seconds");
  const numericTimeout = rawTimeout === undefined ? scaleTimeout(DEFAULT_COMPARE_SOURCES_TIMEOUT_SECONDS, scale, MAX_CAPTURE_TIMEOUT_SECONDS) : Number(rawTimeout);
  if (!Number.isFinite(numericTimeout)) return rejected(operation, "--timeout-seconds must be a finite number");
  const timeoutSeconds = Math.min(MAX_CAPTURE_TIMEOUT_SECONDS, Math.max(MIN_CAPTURE_TIMEOUT_SECONDS, Math.trunc(numericTimeout)));
  return { args: out, manifests, timeoutSeconds };
}

/** Validate compare_sources arguments before touching the sandbox. */
export function validateMwccAllocCompareSourcesArgs(args: string[]): string[] | Record<string, unknown> {
  const parsed = parseCompareSourcesArgs(args, "tool:mwcc_alloc:compare_sources.py");
  return isToolError(parsed) ? parsed : args;
}

/** Compare MWCC's decisions for one function between two source variants, in the worker sandbox. */
export async function runSandboxMwccAllocCompareSources(input: SandboxMwccAllocInput): Promise<Record<string, unknown>> {
  const operation = "tool:mwcc_alloc:compare_sources.py";
  const parsed = parseCompareSourcesArgs(input.args, operation, input.timeoutScale);
  if (isToolError(parsed)) return parsed;
  const args = [...parsed.args];
  try {
    for (const manifest of parsed.manifests) {
      const digest = createHash("sha256").update(manifest.json).digest("hex").slice(0, 16);
      const relative = `build/mwcc-alloc/manifests/${manifest.flag.slice(2)}-${digest}.json`;
      const mkdir = await input.sandboxHandle.exec(["mkdir", "-p", "build/mwcc-alloc/manifests"], { cwd: input.workspaceRoot, timeoutMs: PROBE_TIMEOUT_MS });
      if (mkdir.exitCode !== 0) return toolError(operation, "sandbox_exec_failed", "sandbox_exec_failed", mkdir.stderr.trim() || "could not create the manifest directory");
      await input.sandboxHandle.writeFile(posix.join(input.workspaceRoot, relative), manifest.json);
      args.push(manifest.flag, relative);
    }
  } catch (error) {
    return toolError(operation, "sandbox_exec_failed", "sandbox_exec_failed", error instanceof Error ? error.message : String(error));
  }
  const probePath = `${SYNCED_API}/compare_sources.py`;
  const result = await executeJsonTool({
    sandboxHandle: input.sandboxHandle,
    workspaceRoot: input.workspaceRoot,
    operation,
    probePath,
    command: ["python3", probePath, "--repo-root", input.workspaceRoot, ...args, "--timeout-seconds", String(parsed.timeoutSeconds), "--json"],
    timeoutMs: (parsed.timeoutSeconds + 60) * 1_000,
  });
  return { ...result, backend: "native" };
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
    timeoutMs: scaleTimeout(COMPARE_TIMEOUT_MS, input.timeoutScale ?? 1, MAX_CAPTURE_TIMEOUT_SECONDS * 1_000),
  });
}

/** Fields a worker must always get back, whatever else is cut. */
const COMPARE_SOURCES_KEEP = [
  "schema", "status", "backend", "function", "requested_function", "unit", "version", "change_counts",
  "changes_omitted", "changes_truncated", "summary_lines_omitted", "full_report", "note", "stock", "unavailable",
  "variant", "variants_without_decisions", "summary", "error", "traced_object_matches_stock",
];
const SNAPSHOT_KEEP = [
  "status", "backend", "capture", "format", "function", "display", "requested_function", "unit", "version",
  "out_dir", "available_points", "unavailable_points", "decisions_summary", "unavailable", "summary", "error",
  "traced_object_matches_stock", "replay_omitted", "files_omitted",
];
const KEPT_STRING_CHARACTERS = 1_200;

interface BoundPlan {
  keep: string[];
  /** Lists of the parsed result cut first, in order; each reports `<name>_omitted`. */
  lists: string[];
  hint: string;
}

const PLANS: Record<string, BoundPlan> = {
  mwcc_alloc_compare_sources: {
    keep: COMPARE_SOURCES_KEEP,
    lists: ["changes", "summary_lines"],
    hint: "Every change is in full_report; read it with the file tools, or compare a narrower variant pair.",
  },
  mwcc_alloc_snapshot: {
    keep: SNAPSHOT_KEEP,
    lists: ["replay", "files"],
    hint: "All capture files are in out_dir; decisions.json holds every decision.",
  },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function rendered(tool: string, payload: Record<string, unknown>): number {
  return JSON.stringify({ tool, ...payload }, null, 2).length;
}

function shortened(value: unknown): unknown {
  if (typeof value === "string") return value.length > KEPT_STRING_CHARACTERS ? `${value.slice(0, KEPT_STRING_CHARACTERS)}...` : value;
  if (Array.isArray(value)) return value.map(shortened);
  if (isRecord(value)) return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, shortened(item)]));
  return value;
}

/**
 * Bound an mwcc_alloc result so the worker always receives valid JSON.
 *
 * The generic text cap cuts rendered JSON mid-object. Instead the plan's lists
 * (diff rows, then summary lines; replay checks, then file rows) are halved
 * first, with `<list>_omitted` counts and a note naming `full_report`. Anything
 * still too large goes through the shared structural bounding, and the kept
 * fields (status, schema, counts, the full-report locator) are restored on top.
 */
export function boundMwccAllocResult(tool: string, result: Record<string, unknown>, budget = boundedToolPayloadCharacters): Record<string, unknown> {
  const plan = PLANS[tool];
  if (!plan || rendered(tool, result) <= budget) return result;
  if (!isRecord(result.parsed)) return boundToolPayload(tool, result, plan?.hint ?? "Narrow the request.", budget);

  const parsed: Record<string, unknown> = { ...result.parsed };
  const current = () => ({ ...result, parsed });
  for (const name of plan.lists) {
    const list = parsed[name];
    if (!Array.isArray(list)) continue;
    const previouslyOmitted = typeof parsed[`${name}_omitted`] === "number" ? Number(parsed[`${name}_omitted`]) : 0;
    let total = list.length + previouslyOmitted;
    if (name === "changes" && isRecord(parsed.change_counts)) {
      total = Math.max(total, Object.values(parsed.change_counts).reduce<number>((sum, count) => sum + (typeof count === "number" ? count : 0), 0));
    }
    let kept = list;
    while (kept.length > 0 && rendered(tool, current()) > budget) {
      kept = kept.slice(0, Math.floor(kept.length / 2));
      parsed[name] = kept;
      parsed[`${name}_omitted`] = total - kept.length;
    }
    if (name === "changes" && total > kept.length) {
      parsed.changes_truncated = true;
      parsed.note = typeof parsed.full_report === "string"
        ? `${total - kept.length} of ${total} changes are not shown here; every change is in ${parsed.full_report}`
        : `${total - kept.length} of ${total} changes are not shown here`;
    }
    if (rendered(tool, current()) <= budget) return current();
  }

  const keptFields = Object.fromEntries(plan.keep.filter((key) => key in parsed).map((key) => [key, shortened(parsed[key])]));
  const bounded = boundToolPayload(tool, current(), plan.hint, budget);
  const restored = { ...bounded, parsed: { ...(isRecord(bounded.parsed) ? bounded.parsed : {}), ...keptFields } };
  if (rendered(tool, restored) <= budget) return restored;
  // Last resort: only what the worker needs to act, never broken JSON.
  return {
    operation: result.operation,
    exit_code: result.exit_code,
    backend: result.backend,
    truncated: true,
    truncation: { hint: plan.hint },
    parsed: keptFields,
  };
}
