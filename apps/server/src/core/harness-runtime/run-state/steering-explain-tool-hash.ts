import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * The explain jobs' tool hash (plan 3.4.1): part of a job's unique key, so a
 * change to any file that computes the delta re-explains every observation.
 * It stamps the contents of the computation trees, not a hand-kept list, so a
 * new or changed dependency (an allocator model under `vendor/`) is never
 * missed. A leaf module (node builtins only): the worker's observation hook
 * imports it, and must not pull the job runner's module graph into the
 * worker path.
 */
export const STEERING_EXPLAIN_TOOL_FILES = [
  "_impl/gamecube/tools/*.py (not test_*.py)",
  "compiler/mwcc_alloc/api/**/*.py (not tests/, __pycache__/, test_*.py)",
  "compiler/mwcc_alloc/vendor/**/*.py (not tests/, __pycache__/, test_*.py)",
  // Pins the traced and stock compiler SHA-1s; native_backend verifies the sandbox binaries against it.
  "compiler/mwcc_alloc/native/CAPABILITIES.json",
] as const;

const FLAT_TREES = ["_impl/gamecube/tools"];
const DEEP_TREES = ["compiler/mwcc_alloc/api", "compiler/mwcc_alloc/vendor"];
const PINNED_FILES = ["compiler/mwcc_alloc/native/CAPABILITIES.json"];
const SKIPPED_DIRS = new Set(["tests", "__pycache__"]);

/** `toolpacks/gamecube-decomp` of this checkout (the repo root is six levels above this file). */
export function defaultSteeringToolpackRoot(): string {
  return resolve(fileURLToPath(new URL("../../../../../..", import.meta.url)), "toolpacks/gamecube-decomp");
}

function isSource(name: string): boolean {
  return name.endsWith(".py") && !name.startsWith("test_");
}

function pythonFiles(root: string, dir: string, deep: boolean, out: string[]): void {
  const absolute = join(root, dir);
  if (!existsSync(absolute)) return;
  for (const name of readdirSync(absolute).sort()) {
    const relative = `${dir}/${name}`;
    const stat = statSync(join(root, relative));
    if (stat.isDirectory()) {
      if (deep && !SKIPPED_DIRS.has(name)) pythonFiles(root, relative, deep, out);
    } else if (stat.isFile() && isSource(name)) {
      out.push(relative);
    }
  }
}

/** The files the hash covers under `toolpackRoot` (sorted, toolpack-relative); pinned files are listed even when missing. */
export function steeringExplainToolFiles(toolpackRoot = defaultSteeringToolpackRoot()): string[] {
  const root = resolve(toolpackRoot);
  const files: string[] = [];
  for (const dir of FLAT_TREES) pythonFiles(root, dir, false, files);
  for (const dir of DEEP_TREES) pythonFiles(root, dir, true, files);
  return [...new Set([...files, ...PINNED_FILES])].sort();
}

const toolHashes = new Map<string, string>();

/** sha256 over each covered file's path, NUL and bytes (`missing` for an absent pinned file); memoized per toolpack root. */
export function steeringExplainToolHash(toolpackRoot = defaultSteeringToolpackRoot()): string {
  const root = resolve(toolpackRoot);
  const cached = toolHashes.get(root);
  if (cached) return cached;
  const hash = createHash("sha256");
  for (const path of steeringExplainToolFiles(root)) {
    const file = resolve(root, path);
    hash.update(path);
    hash.update("\0");
    hash.update(existsSync(file) ? readFileSync(file) : Buffer.from("missing"));
  }
  const digest = hash.digest("hex");
  toolHashes.set(root, digest);
  return digest;
}
