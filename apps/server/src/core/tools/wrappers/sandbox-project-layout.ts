import { posix } from "node:path";
import type { SandboxHandle } from "@server/core/job-queue/sandbox.js";

const LAYOUT_PROBE_TIMEOUT_MS = 10_000;

const PROJECT_LAYOUT_SCRIPT = `
import json
from pathlib import Path, PurePosixPath

root = Path(".")
objdiff_path = root / "objdiff.json"
objdiff = json.loads(objdiff_path.read_text()) if objdiff_path.is_file() else {}
objdiff_units = objdiff.get("units", []) if isinstance(objdiff, dict) else []

def text(value):
    return value if isinstance(value, str) and value else None

def version_from_path(value):
    path = PurePosixPath(value) if text(value) else None
    parts = path.parts if path else ()
    return parts[1] if len(parts) >= 3 and parts[0] == "build" else None

version = None
for unit in objdiff_units:
    if not isinstance(unit, dict):
        continue
    version = version_from_path(unit.get("base_path")) or version_from_path(unit.get("target_path"))
    if version:
        break

report_paths = []
if version:
    report_paths.append(root / "build" / version / "report.json")
report_paths.extend(sorted((root / "build").glob("*/report.json")))
report_path = next((path for path in report_paths if path.is_file()), None)
if report_path is not None and version is None:
    version = report_path.parent.name
if version is None:
    raise SystemExit("could not determine the build version from objdiff.json or build/*/report.json")

report = json.loads(report_path.read_text()) if report_path is not None else {}
report_units = report.get("units", []) if isinstance(report, dict) else []
report_by_name = {
    unit.get("name"): unit
    for unit in report_units
    if isinstance(unit, dict) and text(unit.get("name"))
}

object_root = f"build/{version}/obj"
units = []
seen = set()
for unit in objdiff_units:
    if not isinstance(unit, dict):
        continue
    name = text(unit.get("name"))
    if not name:
        continue
    metadata = unit.get("metadata") if isinstance(unit.get("metadata"), dict) else {}
    report_unit = report_by_name.get(name, {})
    report_metadata = report_unit.get("metadata") if isinstance(report_unit.get("metadata"), dict) else {}
    source_path = text(metadata.get("source_path")) or text(report_metadata.get("source_path"))
    units.append({
        "name": name,
        "base_path": text(unit.get("base_path")),
        "target_path": text(unit.get("target_path")),
        "source_path": source_path,
    })
    seen.add(name)

for unit in report_units:
    if not isinstance(unit, dict):
        continue
    name = text(unit.get("name"))
    if not name or name in seen:
        continue
    metadata = unit.get("metadata") if isinstance(unit.get("metadata"), dict) else {}
    source_path = text(metadata.get("source_path"))
    object_stem = None
    if source_path:
        source = PurePosixPath(source_path)
        source_parts = source.parts[1:] if source.parts and source.parts[0] == "src" else source.parts
        object_stem = PurePosixPath(*source_parts).with_suffix("").as_posix()
    elif name.startswith("main/"):
        object_stem = name[len("main/"):]
    units.append({
        "name": name,
        "base_path": f"build/{version}/src/{object_stem}.o" if object_stem else None,
        "target_path": f"{object_root}/{object_stem}.o" if object_stem else None,
        "source_path": source_path,
    })

context_script = next((
    candidate.as_posix()
    for candidate in (Path("tools/m2ctx/m2ctx.py"), Path("tools/decompctx.py"))
    if candidate.is_file()
), None)
include_paths = [
    candidate.as_posix()
    for candidate in (
        Path("include"),
        Path("include/PowerPC_EABI_Support/Msl/MSL_C/MSL_Common"),
        Path("include/PowerPC_EABI_Support/Msl/MSL_C++/MSL_Common"),
        Path(f"build/{version}/include"),
    )
    if candidate.is_dir()
]

print(json.dumps({
    "version": version,
    "report_path": report_path.relative_to(root).as_posix() if report_path is not None else f"build/{version}/report.json",
    "object_root": object_root,
    "asm_root": f"build/{version}/asm",
    "context_script": context_script,
    "include_paths": include_paths,
    "units": units,
}))
`.trim();

export interface SandboxProjectUnit {
  name: string;
  basePath: string | null;
  targetPath: string | null;
  sourcePath: string | null;
}

export interface SandboxProjectLayout {
  version: string;
  reportPath: string;
  objectRoot: string;
  asmRoot: string;
  contextScript: string | null;
  includePaths: string[];
  units: SandboxProjectUnit[];
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function safeRelativePath(value: unknown): string | null {
  if (typeof value !== "string" || !value) return null;
  if (posix.isAbsolute(value) || posix.normalize(value) !== value || value.split("/").some((part) => !part || part === "." || part === "..")) {
    throw new Error(`layout probe returned an unsafe path: ${value}`);
  }
  return value;
}

function requiredPath(value: unknown, label: string): string {
  const path = safeRelativePath(value);
  if (!path) throw new Error(`layout probe returned no ${label}`);
  return path;
}

function parseLayout(stdout: string): SandboxProjectLayout {
  const raw = recordValue(JSON.parse(stdout));
  if (!raw) throw new Error("layout probe returned a non-object payload");
  const version = typeof raw.version === "string" ? raw.version : "";
  if (!/^[A-Za-z0-9_.-]+$/.test(version) || version === "." || version === "..") {
    throw new Error(`layout probe returned an invalid build version: ${version}`);
  }
  const reportPath = requiredPath(raw.report_path, "report path");
  const objectRoot = requiredPath(raw.object_root, "object root");
  const asmRoot = requiredPath(raw.asm_root, "assembly root");
  if (objectRoot !== `build/${version}/obj` || asmRoot !== `build/${version}/asm`) {
    throw new Error("layout probe returned roots that do not match its build version");
  }
  const contextScript = safeRelativePath(raw.context_script);
  if (contextScript !== null && contextScript !== "tools/m2ctx/m2ctx.py" && contextScript !== "tools/decompctx.py") {
    throw new Error(`layout probe returned an unsupported context script: ${contextScript}`);
  }
  const includePaths = Array.isArray(raw.include_paths)
    ? raw.include_paths.map((path) => requiredPath(path, "include path"))
    : [];
  const units = Array.isArray(raw.units) ? raw.units.map((value): SandboxProjectUnit => {
    const unit = recordValue(value);
    if (!unit || typeof unit.name !== "string" || !unit.name) throw new Error("layout probe returned an invalid unit");
    return {
      name: unit.name,
      basePath: safeRelativePath(unit.base_path),
      targetPath: safeRelativePath(unit.target_path),
      sourcePath: safeRelativePath(unit.source_path),
    };
  }) : [];
  return { version, reportPath, objectRoot, asmRoot, contextScript, includePaths, units };
}

export async function resolveSandboxProjectLayout(
  handle: SandboxHandle,
  workspaceRoot: string,
): Promise<SandboxProjectLayout> {
  const result = await handle.exec(
    ["python3", "-c", PROJECT_LAYOUT_SCRIPT],
    { cwd: workspaceRoot, timeoutMs: LAYOUT_PROBE_TIMEOUT_MS },
  );
  if (result.exitCode !== 0) {
    throw new Error(result.stderr.trim() || `sandbox project layout probe exited ${result.exitCode}`);
  }
  try {
    return parseLayout(result.stdout);
  } catch (error) {
    throw new Error(`invalid sandbox project layout: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export function unitForObjectPath(layout: SandboxProjectLayout, objectPath: string): SandboxProjectUnit | null {
  const targetPath = `${layout.objectRoot}/${objectPath}`;
  return layout.units.find((unit) => unit.targetPath === targetPath) ?? null;
}

export function unitForTranslationUnit(layout: SandboxProjectLayout, input: string): SandboxProjectUnit | null {
  const inputExtension = posix.extname(input);
  const inputStem = inputExtension ? input.slice(0, -inputExtension.length) : input;
  return layout.units.find((unit) => {
    const sourcePath = unit.sourcePath;
    const sourceExtension = sourcePath ? posix.extname(sourcePath) : "";
    const sourceStem = sourcePath && sourceExtension ? sourcePath.slice(0, -sourceExtension.length) : sourcePath;
    const sourceWithoutRoot = sourceStem?.startsWith("src/") ? sourceStem.slice(4) : sourceStem;
    const targetRelative = unit.targetPath?.startsWith(`${layout.objectRoot}/`)
      ? unit.targetPath.slice(layout.objectRoot.length + 1, -2)
      : null;
    return input === unit.name || inputStem === sourceStem || inputStem === sourceWithoutRoot || inputStem === targetRelative;
  }) ?? null;
}

export function contextGenerationCommand(layout: SandboxProjectLayout, sourcePath: string | null): string[] {
  if (layout.contextScript === "tools/m2ctx/m2ctx.py") {
    return ["python3", layout.contextScript, "--quiet", "--preprocessor"];
  }
  if (layout.contextScript === "tools/decompctx.py") {
    if (!sourcePath) throw new Error("tools/decompctx.py requires a source file, but the project layout has none");
    const includeArgs = layout.includePaths.flatMap((path) => ["-I", path]);
    if (!includeArgs.length) throw new Error("tools/decompctx.py requires at least one include directory");
    return ["python3", layout.contextScript, sourcePath, "-o", "build/ctx.c", ...includeArgs];
  }
  throw new Error("the project has no supported context generation script");
}
