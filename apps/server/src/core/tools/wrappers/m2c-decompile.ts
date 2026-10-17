import { posix } from "node:path";
import type { SandboxHandle } from "@server/core/job-queue/sandbox.js";

/**
 * m2c_decompile's sandbox argument contract and image probe. decompile.py
 * runs in the claim's sandbox (tools/resolver.ts); nothing runs on the host.
 */

const SAFE_BOOLEAN_EXTRA_ARGS = new Set([
  "--no-cache",
  "--stack-structs",
  "--debug",
  "--debug-patterns",
  "--stacktrace",
  "--print-assembly",
  "--dump-typemap",
  "--visualize",
  "--sanitize-tracebacks",
  "--valid-syntax",
  "--allman",
  "--knr",
  "--indent-switch-contents",
  "--unk-underscore",
  "--hex-case",
  "--no-casts",
  "--zfill-constants",
  "--force-decimal",
  "--deterministic-vars",
  "--descending-regs",
  "--backwards-bss",
  "--stop-on-error",
  "--void",
  "--gotos-only",
  "--no-ifs",
  "--no-switches",
  "--no-andor",
  "--no-unk-inference",
  "--no-stack-spill",
  "--heuristic-strings",
  "--pdb-translate",
  "--disable-gc",
]);

const SYMBOL_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
const TYPE_OVERRIDE_PATTERN = /^[A-Za-z_][A-Za-z0-9_.*:]*$/;
const SAFE_VALUE_EXTRA_ARGS = new Map<string, (value: string) => boolean>([
  ["--globals", (value) => ["all", "used", "none"].includes(value)],
  ["--visualize", (value) => ["c", "asm"].includes(value)],
  ["--pointer-style", (value) => ["left", "right"].includes(value)],
  ["--comment-style", (value) => ["multiline", "oneline", "none"].includes(value)],
  ["--comment-column", (value) => /^\d+$/.test(value)],
  ["--passes", (value) => /^[1-9]\d*$/.test(value)],
  ["-P", (value) => /^[1-9]\d*$/.test(value)],
  ["--reg-vars", (value) => /^(?:[rf]\d+)(?:,[rf]\d+)*$/.test(value)],
  ["-D", (value) => /^[A-Za-z_][A-Za-z0-9_]*(?:=(?:0[xX][0-9A-Fa-f]+|\d+))?$/.test(value)],
  ["-U", (value) => SYMBOL_PATTERN.test(value)],
  ["--goto", (value) => value.length > 0],
  ["--union-field", (value) => TYPE_OVERRIDE_PATTERN.test(value)],
  ["--void-var-type", (value) => TYPE_OVERRIDE_PATTERN.test(value)],
  ["--void-field-type", (value) => TYPE_OVERRIDE_PATTERN.test(value)],
]);

interface ParsedM2cApiArgs {
  input: string;
  extraArgs: string[];
  timeoutMs: number;
}

function toolError(
  status: string,
  errorKind: string,
  errorSummary: string,
  details: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    status,
    operation: "tool:m2c_decomp:decompile.py",
    tool_error: true,
    error_kind: errorKind,
    error_summary: errorSummary,
    ...details,
  };
}

function parseM2cApiArgs(args: string[]): ParsedM2cApiArgs | Record<string, unknown> {
  let input: string | undefined;
  let repoRootSeen = false;
  let timeoutMs = 120_000;
  const extraArgs: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--no-context" || arg === "--format" || arg === "--json") continue;
    if (arg === "--repo-root" || arg === "--input" || arg === "--timeout-seconds" || arg === "--extra-arg") {
      const value = args[index + 1];
      if (value === undefined) {
        return toolError("rejected_arguments", "sandbox_fetch_contract_rejected", `${arg} requires a value`);
      }
      index += 1;
      if (arg === "--repo-root") {
        if (repoRootSeen) return toolError("rejected_arguments", "sandbox_fetch_contract_rejected", "duplicate --repo-root");
        repoRootSeen = true;
      } else if (arg === "--input") {
        if (input !== undefined) return toolError("rejected_arguments", "sandbox_fetch_contract_rejected", "duplicate --input");
        input = value;
      } else if (arg === "--timeout-seconds") {
        const seconds = Number(value);
        if (!Number.isFinite(seconds) || seconds < 10 || seconds > 600) {
          return toolError("rejected_arguments", "sandbox_fetch_contract_rejected", "--timeout-seconds must be between 10 and 600");
        }
        timeoutMs = Math.trunc(seconds) * 1_000;
      } else {
        extraArgs.push(value);
      }
      continue;
    }
    return toolError(
      "rejected_arguments",
      "sandbox_fetch_contract_rejected",
      `m2c_decompile sandbox shim received unrecognized API argument: ${arg}`,
    );
  }
  if (!repoRootSeen || input === undefined || !input) {
    return toolError("rejected_arguments", "sandbox_fetch_contract_rejected", "m2c_decompile sandbox shim requires --repo-root and --input");
  }
  return { input, extraArgs, timeoutMs };
}

function isToolError(value: ParsedM2cApiArgs | Record<string, unknown>): value is Record<string, unknown> {
  return "tool_error" in value;
}

function pathBearing(value: string): boolean {
  return value.includes("/") || value.includes("\\") || value.startsWith(".") || value.startsWith("~") || value.includes("\0");
}

function validateExtraArgs(extraArgs: string[]): Record<string, unknown> | null {
  for (let index = 0; index < extraArgs.length; index += 1) {
    const arg = extraArgs[index];
    if (arg === "-w" || arg === "--write" || arg.startsWith("--write=")) {
      return toolError(
        "rejected_arguments",
        "sandbox_fetch_contract_rejected",
        "m2c_decompile --write is unavailable for sandbox claims because the fetch set must remain read-only and bounded",
      );
    }
    if (pathBearing(arg)) {
      return toolError(
        "rejected_arguments",
        "sandbox_fetch_contract_rejected",
        `m2c_decompile sandbox extra_args cannot contain paths: ${arg}`,
      );
    }
    const equalsIndex = arg.indexOf("=");
    const option = equalsIndex >= 0 ? arg.slice(0, equalsIndex) : arg;
    const attachedValue = equalsIndex >= 0 ? arg.slice(equalsIndex + 1) : undefined;
    if (attachedValue === undefined && SAFE_BOOLEAN_EXTRA_ARGS.has(option)) continue;
    const validate = SAFE_VALUE_EXTRA_ARGS.get(option);
    if (!validate) {
      return toolError(
        "rejected_arguments",
        "sandbox_fetch_contract_rejected",
        `m2c_decompile sandbox extra_args contains an unrecognized option: ${arg}`,
      );
    }
    const value = attachedValue ?? extraArgs[index + 1];
    if (value === undefined || (attachedValue === undefined && value.startsWith("-"))) {
      return toolError(
        "rejected_arguments",
        "sandbox_fetch_contract_rejected",
        `m2c_decompile sandbox extra_args option requires a value: ${option}`,
      );
    }
    if (attachedValue === undefined) index += 1;
    if (pathBearing(value)) {
      return toolError(
        "rejected_arguments",
        "sandbox_fetch_contract_rejected",
        `m2c_decompile sandbox extra_args cannot contain paths: ${value}`,
      );
    }
    if (!validate(value)) {
      return toolError(
        "rejected_arguments",
        "sandbox_fetch_contract_rejected",
        `m2c_decompile sandbox extra_args has an invalid ${option} value: ${value}`,
      );
    }
  }
  return null;
}

function validateInput(input: string): Record<string, unknown> | null {
  const parts = input.split("/");
  if (posix.isAbsolute(input) || input.includes("\\") || input.includes("\0") || parts.some((part) => !part || part === "." || part === "..")) {
    return toolError(
      "rejected_arguments",
      "sandbox_fetch_contract_rejected",
      `m2c_decompile input must be a symbol or a non-escaping workspace-relative translation unit: ${input}`,
    );
  }
  return null;
}

function validatedSandboxM2cArgs(args: string[]): ParsedM2cApiArgs | Record<string, unknown> {
  const parsed = parseM2cApiArgs(args);
  if (isToolError(parsed)) return parsed;
  return validateInput(parsed.input) ?? validateExtraArgs(parsed.extraArgs) ?? parsed;
}

/**
 * The sandbox claim's argument contract (one symbol or workspace-relative unit,
 * path-free allowlisted extras, no `--write`), checked before any sandbox
 * access whichever surface then runs m2c; null when the arguments pass.
 */
export function sandboxM2cArgsError(args: string[]): Record<string, unknown> | null {
  const validated = validatedSandboxM2cArgs(args);
  return isToolError(validated) ? validated : null;
}

const M2C_DEPENDENCY_PROBE = ["python3", "-c", "import elftools"];
const M2C_PROBE_TIMEOUT_MS = 30_000;
const m2cReadySandboxes = new WeakMap<SandboxHandle, Promise<boolean>>();

/**
 * Whether the sandbox image can run m2c itself (the vendored m2c ships in the
 * toolpack; newer images install pyelftools, graphviz and pcpp). Probed once
 * per sandbox handle; an exec failure is not cached. Older images answer
 * false and keep the fetch-first host path.
 */
export function sandboxM2cReady(handle: SandboxHandle): Promise<boolean> {
  const cached = m2cReadySandboxes.get(handle);
  if (cached) return cached;
  const probe = handle.exec(M2C_DEPENDENCY_PROBE, { timeoutMs: M2C_PROBE_TIMEOUT_MS }).then((result) => result.exitCode === 0);
  m2cReadySandboxes.set(handle, probe);
  probe.catch(() => m2cReadySandboxes.delete(handle));
  return probe;
}

/** decompile.py arguments for an in-sandbox run: `--repo-root` is always the sandbox workspace. */
export function sandboxM2cArgs(args: string[], workspaceRoot: string): string[] {
  const prepared = [...args];
  const rootIndex = prepared.indexOf("--repo-root");
  if (rootIndex >= 0 && rootIndex + 1 < prepared.length) prepared[rootIndex + 1] = workspaceRoot;
  else prepared.unshift("--repo-root", workspaceRoot);
  return prepared;
}
