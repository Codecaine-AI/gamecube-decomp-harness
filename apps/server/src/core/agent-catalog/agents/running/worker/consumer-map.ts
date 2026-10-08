import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, relative, resolve } from "node:path";
import { runCommand as defaultRunCommand, type CommandResult } from "@server/infrastructure/shell";

export type ConsumerMapSource = "ninja-deps" | "grep-includes";

export interface HeaderConsumerResolution {
  /** Repo-relative source translation units whose dependency list contains the header. */
  consumers: string[];
  derivedFrom: ConsumerMapSource;
  /** True only when the caller explicitly supplied maxConsumers and the result exceeded it. */
  truncated: boolean;
  cachePath?: string;
}

export type ConsumerMapCommandRunner = (cwd: string, command: string[]) => Promise<CommandResult>;

export interface ConsumerMapFileOps {
  mkdir(path: string, options: { recursive: true }): Promise<unknown>;
  readFile(path: string, encoding: "utf8"): Promise<string>;
  writeFile(path: string, data: string): Promise<unknown>;
}

export interface ResolveHeaderConsumersOptions {
  repoRoot: string;
  runStateDir: string;
  baseRev: string;
  headerPath: string;
  /** Optional hot-header ceiling. Undefined (the default) means no ceiling. */
  maxConsumers?: number;
  runCommand?: ConsumerMapCommandRunner;
  fileOps?: ConsumerMapFileOps;
}

interface ConsumerMapCache {
  schema_version: "consumer_map_v1";
  base_rev: string;
  /** Ninja produces a complete map; grep fallback only fills queried header entries. */
  complete: boolean;
  consumers_by_header: Record<string, string[]>;
  grep_headers: string[];
}

/** Object target (repo-relative, e.g. `build/GALE01/src/x.o`) -> real repo-relative source path. */
export type ObjectSourceMap = Map<string, string>;

interface ParsedNinjaDeps {
  consumersByHeader: Record<string, string[]>;
  sourceUnitCount: number;
}

const defaultFileOps: ConsumerMapFileOps = { mkdir, readFile, writeFile };

function slashPath(value: string): string {
  return value.replaceAll("\\", "/");
}

function repoRelativePath(value: string, repoRoot: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  let normalized: string;
  if (isAbsolute(trimmed)) {
    normalized = slashPath(relative(repoRoot, trimmed));
  } else {
    normalized = slashPath(trimmed).replace(/^\.\//, "");
    if (normalized.startsWith("../")) normalized = slashPath(relative(repoRoot, resolve(repoRoot, trimmed)));
  }
  if (!normalized || normalized === ".." || normalized.startsWith("../") || isAbsolute(normalized)) return null;
  return normalized;
}

const SOURCE_EXTENSIONS = [".c", ".cp", ".cpp", ".cc", ".cxx"] as const;
const CPP_SOURCE_EXTENSIONS = [".cp", ".cpp", ".cc", ".cxx"] as const;
const HEADER_EXTENSIONS = [".h", ".hpp", ".hh", ".hxx", ".inc", ".tpp", ".ipp"] as const;

function hasExtension(path: string, extensions: readonly string[]): boolean {
  const lower = path.toLowerCase();
  return extensions.some((extension) => lower.endsWith(extension));
}

/** A compilable translation unit under `src/` or a configure.py library root `libs/<lib>/src/`. */
export function isTranslationUnitSource(path: string): boolean {
  return (path.startsWith("src/") || /^libs\/[^/]+\/src\//.test(path)) && hasExtension(path, SOURCE_EXTENSIONS);
}

/**
 * Header-like dependency: a known header extension, or an extensionless file in
 * an include tree (C++ standard headers such as MSL `new`/`memory`). Build
 * outputs (precompiled `.mch`, generated files) are never edit targets.
 */
export function isHeaderDependency(path: string): boolean {
  if (path.startsWith("build/") || isTranslationUnitSource(path)) return false;
  if (hasExtension(path, HEADER_EXTENSIONS)) return true;
  const name = path.slice(path.lastIndexOf("/") + 1);
  return !name.includes(".") && /(?:^|\/)include\//.test(path);
}

/** Melee-era fallback: only for C games, where `build/<ver>/src/x.o` comes from `src/x.c`. */
function sourceFromObjectTarget(target: string, repoRoot: string): string | null {
  const normalized = repoRelativePath(target, repoRoot);
  if (!normalized) return null;
  const match = normalized.match(/(?:^|\/)src\/(.+)\.o$/);
  return match ? `src/${match[1]}.c` : null;
}

function sourceForDepsBlock(
  target: string,
  deps: string[],
  repoRoot: string,
  objectSources: ObjectSourceMap | undefined,
  allowObjectFallback: boolean,
): string | null {
  const normalizedTarget = repoRelativePath(target, repoRoot);
  // objdiff.json `base_path` -> `metadata.source_path` is authoritative: configure.py
  // remaps `libs/<lib>/src/x` to object `build/<ver>/src/<lib>/x.o`, and the compiler's
  // depfile then names the (nonexistent) `src/<lib>/x` path.
  const mapped = normalizedTarget ? objectSources?.get(normalizedTarget) : undefined;
  if (mapped) return mapped;
  for (const dep of deps) {
    const normalized = repoRelativePath(dep, repoRoot);
    if (normalized && isTranslationUnitSource(normalized)) return normalized;
  }
  return allowObjectFallback ? sourceFromObjectTarget(target, repoRoot) : null;
}

/** Build object target -> source path from objdiff.json units (`base_path`, `metadata.source_path`). */
export function parseObjdiffObjectSources(raw: string, repoRoot: string): ObjectSourceMap {
  const map: ObjectSourceMap = new Map();
  let config: unknown;
  try {
    config = JSON.parse(raw);
  } catch {
    return map;
  }
  const units = config && typeof config === "object" && Array.isArray((config as { units?: unknown }).units)
    ? (config as { units: unknown[] }).units
    : [];
  for (const unit of units) {
    if (!unit || typeof unit !== "object") continue;
    const { base_path: basePath, metadata } = unit as { base_path?: unknown; metadata?: unknown };
    const sourcePath = metadata && typeof metadata === "object" ? (metadata as { source_path?: unknown }).source_path : undefined;
    if (typeof basePath !== "string" || typeof sourcePath !== "string") continue;
    const object = repoRelativePath(basePath, repoRoot);
    const source = repoRelativePath(sourcePath, repoRoot);
    if (object && source && isTranslationUnitSource(source)) map.set(object, source);
  }
  return map;
}

function parseNinjaDepsDetailed(output: string, repoRoot: string, objectSources?: ObjectSourceMap): ParsedNinjaDeps {
  const consumers = new Map<string, Set<string>>();
  let sourceUnitCount = 0;
  let currentTarget: string | null = null;
  let currentDeps: string[] = [];
  // Never invent `src/x.c` for a C++ game: a `.cpp`-sourced object must not map to a `.c` path.
  const allowObjectFallback = !output
    .split(/\r?\n/)
    .some((line) => /^\s+\S/.test(line) && hasExtension(line.trim(), CPP_SOURCE_EXTENSIONS));

  const finishBlock = (): void => {
    if (!currentTarget) return;
    const sourcePath = sourceForDepsBlock(currentTarget, currentDeps, repoRoot, objectSources, allowObjectFallback);
    if (sourcePath && currentDeps.length > 0) {
      sourceUnitCount += 1;
      for (const dep of currentDeps) {
        const headerPath = repoRelativePath(dep, repoRoot);
        if (!headerPath || !isHeaderDependency(headerPath)) continue;
        const headerConsumers = consumers.get(headerPath) ?? new Set<string>();
        headerConsumers.add(sourcePath);
        consumers.set(headerPath, headerConsumers);
      }
    }
    currentTarget = null;
    currentDeps = [];
  };

  for (const line of output.split(/\r?\n/)) {
    const block = line.match(/^(.+?):\s+#deps\b/);
    if (block) {
      finishBlock();
      currentTarget = block[1].trim();
      continue;
    }
    if (currentTarget && /^\s+\S/.test(line)) currentDeps.push(line.trim());
  }
  finishBlock();

  return {
    consumersByHeader: Object.fromEntries(
      [...consumers.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([header, sourcePaths]) => [header, [...sourcePaths].sort()]),
    ),
    sourceUnitCount,
  };
}

/** Parse `ninja -t deps` output into header -> repo-relative source translation units. */
export function parseNinjaDeps(output: string, repoRoot: string, objectSources?: ObjectSourceMap): Record<string, string[]> {
  return parseNinjaDepsDetailed(output, repoRoot, objectSources).consumersByHeader;
}

function cacheRevToken(baseRev: string): string {
  const trimmed = baseRev.trim();
  if (/^[a-zA-Z0-9._-]+$/.test(trimmed)) return trimmed;
  return createHash("sha256").update(trimmed).digest("hex");
}

/** Stable per-base-revision cache location beneath the supplied run-state directory. */
export function consumerMapCachePath(runStateDir: string, baseRev: string): string {
  return resolve(runStateDir, `consumer_map.${cacheRevToken(baseRev)}.json`);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

function parseCache(raw: string, baseRev: string): ConsumerMapCache | null {
  try {
    const value = JSON.parse(raw) as Partial<ConsumerMapCache>;
    if (
      value.schema_version !== "consumer_map_v1" ||
      value.base_rev !== baseRev ||
      typeof value.complete !== "boolean" ||
      !value.consumers_by_header ||
      typeof value.consumers_by_header !== "object" ||
      !isStringArray(value.grep_headers)
    ) {
      return null;
    }
    for (const consumers of Object.values(value.consumers_by_header)) {
      if (!isStringArray(consumers)) return null;
    }
    return value as ConsumerMapCache;
  } catch {
    return null;
  }
}

async function readCache(fileOps: ConsumerMapFileOps, path: string, baseRev: string): Promise<ConsumerMapCache | null> {
  try {
    return parseCache(await fileOps.readFile(path, "utf8"), baseRev);
  } catch {
    return null;
  }
}

async function writeCache(fileOps: ConsumerMapFileOps, path: string, cache: ConsumerMapCache): Promise<void> {
  await fileOps.mkdir(dirname(path), { recursive: true });
  await fileOps.writeFile(path, `${JSON.stringify(cache, null, 2)}\n`);
}

function limitedConsumers(consumers: string[], maxConsumers: number | undefined): Pick<HeaderConsumerResolution, "consumers" | "truncated"> {
  const sorted = [...new Set(consumers)].sort();
  if (maxConsumers === undefined) return { consumers: sorted, truncated: false };
  if (!Number.isInteger(maxConsumers) || maxConsumers < 0) throw new RangeError("maxConsumers must be a non-negative integer");
  return {
    consumers: sorted.slice(0, maxConsumers),
    truncated: sorted.length > maxConsumers,
  };
}

function result(
  consumers: string[],
  derivedFrom: ConsumerMapSource,
  cachePath: string,
  maxConsumers: number | undefined,
): HeaderConsumerResolution {
  return { ...limitedConsumers(consumers, maxConsumers), derivedFrom, cachePath };
}

function grepConsumers(stdout: string, repoRoot: string): string[] {
  const consumers = stdout
    .split(/\r?\n/)
    .map((line) => repoRelativePath(line, repoRoot))
    .filter((path): path is string => Boolean(path && isTranslationUnitSource(path)));
  return [...new Set(consumers)].sort();
}

/**
 * Resolve source units affected by a header without escalating to a full build.
 *
 * The Ninja dependency database is inverted once per base revision. If it is
 * unavailable, the fallback asks grep for source files naming the header and
 * caches only that query (rather than treating a partial grep map as complete).
 */
export async function resolveHeaderConsumers(options: ResolveHeaderConsumersOptions): Promise<HeaderConsumerResolution> {
  const fileOps = options.fileOps ?? defaultFileOps;
  const commandRunner = options.runCommand ?? defaultRunCommand;
  const cachePath = consumerMapCachePath(options.runStateDir, options.baseRev);
  const headerPath = repoRelativePath(options.headerPath, options.repoRoot) ?? slashPath(options.headerPath).replace(/^\.\//, "");
  const cached = await readCache(fileOps, cachePath, options.baseRev);

  if (cached?.complete) {
    return result(cached.consumers_by_header[headerPath] ?? [], "ninja-deps", cachePath, options.maxConsumers);
  }
  if (cached?.grep_headers.includes(headerPath)) {
    return result(cached.consumers_by_header[headerPath] ?? [], "grep-includes", cachePath, options.maxConsumers);
  }

  try {
    const deps = await commandRunner(options.repoRoot, ["ninja", "-t", "deps"]);
    if (deps.exitCode === 0) {
      let objectSources: ObjectSourceMap | undefined;
      try {
        const objdiff = await commandRunner(options.repoRoot, ["cat", "objdiff.json"]);
        if (objdiff.exitCode === 0) objectSources = parseObjdiffObjectSources(objdiff.stdout, options.repoRoot);
      } catch {
        // Without objdiff.json the deps list (and, for C games, the object target) still apply.
      }
      const parsed = parseNinjaDepsDetailed(deps.stdout, options.repoRoot, objectSources);
      if (parsed.sourceUnitCount > 0) {
        const completeCache: ConsumerMapCache = {
          schema_version: "consumer_map_v1",
          base_rev: options.baseRev,
          complete: true,
          consumers_by_header: parsed.consumersByHeader,
          grep_headers: [],
        };
        try {
          await writeCache(fileOps, cachePath, completeCache);
        } catch {
          // Cache persistence is an optimization; the resolved scope is still usable.
        }
        return result(parsed.consumersByHeader[headerPath] ?? [], "ninja-deps", cachePath, options.maxConsumers);
      }
    }
  } catch {
    // A fresh/unconfigured worktree is expected to miss Ninja deps; grep below.
  }

  let consumers: string[] = [];
  let grepCacheable = false;
  try {
    const grep = await commandRunner(options.repoRoot, [
      "grep",
      "-rl",
      ...SOURCE_EXTENSIONS.map((extension) => `--include=*${extension}`),
      "-F",
      basename(headerPath),
      "src",
      "libs",
    ]);
    if (grep.exitCode === 0 || grep.exitCode === 1) {
      consumers = grepConsumers(grep.stdout, options.repoRoot);
      grepCacheable = true;
    } else if (grep.exitCode === 2 && grep.stdout.trim()) {
      // A missing search root (e.g. no `libs/`) still yields usable matches; don't cache a partial scan.
      consumers = grepConsumers(grep.stdout, options.repoRoot);
    }
  } catch {
    // Keep the scoped check empty/unavailable to its caller; never auto-escalate.
  }

  if (grepCacheable) {
    const fallbackCache: ConsumerMapCache = cached ?? {
      schema_version: "consumer_map_v1",
      base_rev: options.baseRev,
      complete: false,
      consumers_by_header: {},
      grep_headers: [],
    };
    fallbackCache.consumers_by_header[headerPath] = consumers;
    fallbackCache.grep_headers = [...new Set([...fallbackCache.grep_headers, headerPath])].sort();
    try {
      await writeCache(fileOps, cachePath, fallbackCache);
    } catch {
      // Cache persistence is an optimization; the resolved scope is still usable.
    }
  }

  return result(consumers, "grep-includes", cachePath, options.maxConsumers);
}
