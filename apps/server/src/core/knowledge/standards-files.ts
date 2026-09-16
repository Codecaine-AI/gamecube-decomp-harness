import { existsSync, readdirSync, readFileSync, realpathSync } from "node:fs";
import { basename, dirname, isAbsolute, resolve } from "node:path";
import { globalSourceStorageRoot, packageRoot } from "./paths.js";

/**
 * Slice-file access for the decomp_standards source.
 *
 * Standards and example records live in per-family vertical slices under
 * `<source storage root>/standards/<family>/{standards.jsonl,examples.jsonl}`.
 * `order.json` at the slices root preserves the legacy flat-file record order
 * (consumers rely on it, e.g. "the first example for a standard is
 * canonical"): loaders emit records in that explicit order and append any
 * records missing from the manifest afterwards, in canonical family order
 * then file order.
 *
 * A game's slices compose with the global set (the platform-level
 * `knowledge/global` tree via `globalKnowledgeRoot()`, or
 * `REVIEW_LINT_GLOBAL_STANDARDS_DIR`): game root first, then the global root
 * when it is a different directory. Families are deduplicated by name and the
 * game's slice wins, mirroring `review_lint/api/_qa_rules.py`. A game may ship
 * an empty standards dir (Melee does) and inherit the global set unchanged.
 */

export type StandardsScope = "game" | "global";

export interface StandardsRoot {
  scope: StandardsScope;
  root: string;
}

export interface SliceJsonlRecord<T> {
  record: T;
  file: string;
  scope: StandardsScope;
}

export const GLOBAL_STANDARDS_DIR_ENV = "REVIEW_LINT_GLOBAL_STANDARDS_DIR";
export const GLOBAL_STANDARDS_SOURCE_ID = "decomp_standards";

/** Slices root of the global standards set (env override, else `<globalKnowledgeRoot>/sources/injectable/decomp_standards/standards`). */
export function globalStandardsSlicesRoot(): string {
  const override = process.env[GLOBAL_STANDARDS_DIR_ENV];
  if (override) return isAbsolute(override) ? override : resolve(packageRoot(), override);
  return standardsSlicesRoot(globalSourceStorageRoot(GLOBAL_STANDARDS_SOURCE_ID));
}

function sameDirectory(left: string, right: string): boolean {
  try {
    return realpathSync(left) === realpathSync(right);
  } catch {
    return resolve(left) === resolve(right);
  }
}

/**
 * Ordered standards slices roots for a game: the game's own root first, then
 * the global root when it is a different, existing directory. Selecting the
 * global root itself (no game) yields a single `global` root.
 */
export function standardsRoots(gameSlicesRoot: string): StandardsRoot[] {
  const globalRoot = globalStandardsSlicesRoot();
  if (sameDirectory(globalRoot, gameSlicesRoot)) return [{ scope: "global", root: gameSlicesRoot }];
  const roots: StandardsRoot[] = [{ scope: "game", root: gameSlicesRoot }];
  if (existsSync(globalRoot)) roots.push({ scope: "global", root: globalRoot });
  return roots;
}

interface OrderManifest {
  families?: unknown[];
  standards?: unknown[];
  examples?: unknown[];
}

export function standardsSlicesRoot(storageRoot: string): string {
  return resolve(storageRoot, "standards");
}

export function standardsOrderPath(standardsRoot: string): string {
  return resolve(standardsRoot, "order.json");
}

function readOrderManifest(standardsRoot: string): OrderManifest {
  const path = standardsOrderPath(standardsRoot);
  if (!existsSync(path)) return {};
  try {
    return JSON.parse(readFileSync(path, "utf8")) as OrderManifest;
  } catch {
    return {};
  }
}

function orderedFamilies(standardsRoot: string): string[] {
  if (!existsSync(standardsRoot)) return [];
  const declared = (readOrderManifest(standardsRoot).families ?? []).map((item) => String(item));
  const rank = new Map(declared.map((family, index) => [family, index] as const));
  return readdirSync(standardsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((a, b) => (rank.get(a) ?? rank.size) - (rank.get(b) ?? rank.size) || a.localeCompare(b));
}

export function listStandardsSliceFiles(standardsRoot: string, fileName: string): string[] {
  return orderedFamilies(standardsRoot)
    .map((family) => resolve(standardsRoot, family, fileName))
    .filter((path) => existsSync(path));
}

export function standardsSliceFilePath(standardsRoot: string, family: string, fileName: string): string {
  return resolve(standardsRoot, family, fileName);
}

export function readOrderedSliceRecords<T extends Record<string, unknown>>(
  standardsRoot: string,
  fileName: "standards.jsonl" | "examples.jsonl",
  orderKey: "standards" | "examples",
  options: { scope?: StandardsScope; skipFamilies?: ReadonlySet<string> } = {},
): Array<SliceJsonlRecord<T>> {
  const scope = options.scope ?? "game";
  const loaded: Array<SliceJsonlRecord<T>> = [];
  for (const file of listStandardsSliceFiles(standardsRoot, fileName)) {
    if (options.skipFamilies?.has(basename(dirname(file)))) continue;
    for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
      if (!line.trim()) continue;
      loaded.push({ record: JSON.parse(line) as T, file, scope });
    }
  }
  const order = (readOrderManifest(standardsRoot)[orderKey] ?? []).map((item) => String(item));
  const rank = new Map(order.map((id, index) => [id, index] as const));
  const byId = new Map<string, SliceJsonlRecord<T>>();
  for (const item of loaded) {
    const id = String(item.record.id ?? "");
    if (id && !byId.has(id)) byId.set(id, item);
  }
  const ordered: Array<SliceJsonlRecord<T>> = [];
  for (const id of order) {
    const item = byId.get(id);
    if (item) ordered.push(item);
  }
  for (const item of loaded) {
    if (!rank.has(String(item.record.id ?? ""))) ordered.push(item);
  }
  return ordered;
}

function sliceFamilies(standardsRoot: string): Set<string> {
  return new Set(orderedFamilies(standardsRoot));
}

/**
 * Read records across the composed roots (game first, then global). A family
 * defined by an earlier root hides the same family in later roots, and
 * duplicate record ids keep their first occurrence. Each root keeps its own
 * `order.json` ranking; records are emitted root by root.
 */
export function readComposedSliceRecords<T extends Record<string, unknown>>(
  roots: readonly StandardsRoot[],
  fileName: "standards.jsonl" | "examples.jsonl",
  orderKey: "standards" | "examples",
): Array<SliceJsonlRecord<T>> {
  const seenFamilies = new Set<string>();
  const seenIds = new Set<string>();
  const result: Array<SliceJsonlRecord<T>> = [];
  for (const { scope, root } of roots) {
    if (!existsSync(root)) continue;
    const records = readOrderedSliceRecords<T>(root, fileName, orderKey, { scope, skipFamilies: seenFamilies });
    for (const item of records) {
      const id = String(item.record.id ?? "");
      if (id && seenIds.has(id)) continue;
      if (id) seenIds.add(id);
      result.push(item);
    }
    for (const family of sliceFamilies(root)) seenFamilies.add(family);
  }
  return result;
}
