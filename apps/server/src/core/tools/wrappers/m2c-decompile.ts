import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, posix, resolve } from "node:path";
import type { SandboxHandle } from "@server/core/job-queue/sandbox.js";

const OBJECT_ROOT = "build/GALE01/obj";
const ASM_ROOT = "build/GALE01/asm";
const CONTEXT_PATH = "build/ctx.c";
const CONTEXT_SCRIPT = "tools/m2ctx/m2ctx.py";
const CONTEXT_CHECK_TIMEOUT_MS = 10_000;

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

// This mirrors decomp.py's pyelftools lookup without requiring pyelftools in the sandbox:
// inspect each ELF .symtab in Path.rglob order and select an exact STT_FUNC name match.
const SYMBOL_DISCOVERY_SCRIPT = `
import struct
import sys
from pathlib import Path

root = Path("build/GALE01/obj")
target = sys.argv[1]

def unpack_sections(data):
    if data[:4] != b"\\x7fELF":
        raise ValueError("not an ELF file")
    elf_class = data[4]
    byte_order = data[5]
    endian = "<" if byte_order == 1 else ">" if byte_order == 2 else None
    if endian is None:
        raise ValueError("unsupported ELF byte order")
    if elf_class == 1:
        header = struct.unpack_from(endian + "16sHHIIIIIHHHHHH", data)
        section_format = endian + "IIIIIIIIII"
        symbol_format = endian + "IIIBBH"
        info_index = 3
    elif elf_class == 2:
        header = struct.unpack_from(endian + "16sHHIQQQIHHHHHH", data)
        section_format = endian + "IIQQQQIIQQ"
        symbol_format = endian + "IBBHQQ"
        info_index = 1
    else:
        raise ValueError("unsupported ELF class")
    section_offset = header[6]
    section_entry_size = header[11]
    section_count = header[12]
    sections = [
        struct.unpack_from(section_format, data, section_offset + index * section_entry_size)
        for index in range(section_count)
    ]
    return sections, symbol_format, info_index

def has_function(path):
    data = path.read_bytes()
    sections, symbol_format, info_index = unpack_sections(data)
    for section in sections:
        if section[1] != 2:
            continue
        symbol_offset, symbol_size, string_index, symbol_entry_size = section[4], section[5], section[6], section[9]
        string_section = sections[string_index]
        strings = data[string_section[4]:string_section[4] + string_section[5]]
        for offset in range(symbol_offset, symbol_offset + symbol_size, symbol_entry_size):
            symbol = struct.unpack_from(symbol_format, data, offset)
            if symbol[info_index] & 0x0f != 2:
                continue
            name_offset = symbol[0]
            name_end = strings.find(b"\\0", name_offset)
            name = strings[name_offset:name_end if name_end >= 0 else None].decode("utf-8")
            if name == target:
                return True
    return False

if root.is_dir():
    for object_path in root.rglob("*.o"):
        if has_function(object_path):
            print(object_path.relative_to(root).as_posix())
            break
`.trim();

interface ParsedM2cApiArgs {
  input: string;
  extraArgs: string[];
  timeoutMs: number;
}

export interface SandboxM2cFetchFirstInput {
  sandboxHandle: SandboxHandle;
  workspaceRoot: string;
  args: string[];
  runHost(args: string[], mirrorRoot: string): Promise<Record<string, unknown>>;
  tempParent?: string;
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

function assemblyForInput(input: string): string {
  const extension = posix.extname(input);
  return `${extension ? input.slice(0, -extension.length) : input}.s`;
}

function normalizedObjectPath(stdout: string): string | Record<string, unknown> | null {
  const matches = stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (matches.length === 0) return null;
  if (matches.length !== 1) {
    return toolError("symbol_discovery_failed", "sandbox_symbol_discovery_failed", "m2c_decompile symbol discovery returned more than one object");
  }
  const relative = matches[0].startsWith(`${OBJECT_ROOT}/`) ? matches[0].slice(OBJECT_ROOT.length + 1) : matches[0];
  if (posix.isAbsolute(relative) || posix.normalize(relative) !== relative || relative.split("/").includes("..") || !relative.endsWith(".o")) {
    return toolError(
      "symbol_discovery_failed",
      "sandbox_symbol_discovery_failed",
      `m2c_decompile symbol discovery returned an unsafe object path: ${matches[0]}`,
    );
  }
  return relative;
}

function preparedHostArgs(args: string[], mirrorRoot: string): string[] {
  const prepared = [...args];
  const rootIndex = prepared.indexOf("--repo-root");
  prepared[rootIndex + 1] = mirrorRoot;
  const jsonIndex = prepared.lastIndexOf("--json");
  prepared.splice(jsonIndex >= 0 ? jsonIndex : prepared.length, 0, "--prepared-context");
  return prepared;
}

async function downloadIntoMirror(
  handle: SandboxHandle,
  workspaceRoot: string,
  mirrorRoot: string,
  relativePath: string,
): Promise<void> {
  const localPath = resolve(mirrorRoot, relativePath);
  await mkdir(dirname(localPath), { recursive: true });
  await handle.downloadFile(posix.resolve(workspaceRoot, relativePath), localPath);
}

/** Fetch the statically bounded m2c workspace inputs and invoke the host API against their mirror. */
export async function runSandboxM2cFetchFirst(input: SandboxM2cFetchFirstInput): Promise<Record<string, unknown>> {
  const parsed = parseM2cApiArgs(input.args);
  if (isToolError(parsed)) return parsed;
  const inputError = validateInput(parsed.input);
  if (inputError) return inputError;
  const extraArgsError = validateExtraArgs(parsed.extraArgs);
  if (extraArgsError) return extraArgsError;

  let mirrorRoot: string | undefined;
  try {
    const discovery = await input.sandboxHandle.exec(
      ["python3", "-c", SYMBOL_DISCOVERY_SCRIPT, parsed.input],
      { cwd: input.workspaceRoot, timeoutMs: parsed.timeoutMs },
    );
    if (discovery.exitCode !== 0) {
      return toolError(
        "symbol_discovery_failed",
        "sandbox_symbol_discovery_failed",
        discovery.stderr.trim() || `sandbox symbol discovery exited ${discovery.exitCode}`,
      );
    }
    const objectPath = normalizedObjectPath(discovery.stdout);
    if (objectPath && typeof objectPath !== "string") return objectPath;
    const assemblyPath = objectPath
      ? `${ASM_ROOT}/${objectPath.slice(0, -2)}.s`
      : `${ASM_ROOT}/${assemblyForInput(parsed.input)}`;

    const contextCheck = await input.sandboxHandle.exec(
      ["test", "-f", CONTEXT_PATH],
      { cwd: input.workspaceRoot, timeoutMs: CONTEXT_CHECK_TIMEOUT_MS },
    );
    if (contextCheck.exitCode !== 0 && contextCheck.exitCode !== 1) {
      return toolError(
        "context_check_failed",
        "sandbox_context_check_failed",
        contextCheck.stderr.trim() || `sandbox context check exited ${contextCheck.exitCode}`,
      );
    }
    if (contextCheck.exitCode === 1) {
      const generated = await input.sandboxHandle.exec(
        ["python3", CONTEXT_SCRIPT, "--quiet", "--preprocessor"],
        { cwd: input.workspaceRoot, timeoutMs: parsed.timeoutMs },
      );
      if (generated.exitCode !== 0) {
        return toolError(
          "context_generation_failed",
          "sandbox_context_generation_failed",
          generated.stderr.trim() || `sandbox m2ctx exited ${generated.exitCode}`,
        );
      }
    }

    mirrorRoot = await mkdtemp(join(input.tempParent ?? tmpdir(), "orch-m2c-"));
    await mkdir(resolve(mirrorRoot, OBJECT_ROOT), { recursive: true });
    if (objectPath) await downloadIntoMirror(input.sandboxHandle, input.workspaceRoot, mirrorRoot, `${OBJECT_ROOT}/${objectPath}`);
    await downloadIntoMirror(input.sandboxHandle, input.workspaceRoot, mirrorRoot, assemblyPath);
    await downloadIntoMirror(input.sandboxHandle, input.workspaceRoot, mirrorRoot, CONTEXT_PATH);
    return await input.runHost(preparedHostArgs(input.args, mirrorRoot), mirrorRoot);
  } catch (error) {
    return toolError(
      "sandbox_fetch_failed",
      "sandbox_fetch_failed",
      error instanceof Error ? error.message : String(error),
    );
  } finally {
    if (mirrorRoot) await rm(mirrorRoot, { recursive: true, force: true });
  }
}
