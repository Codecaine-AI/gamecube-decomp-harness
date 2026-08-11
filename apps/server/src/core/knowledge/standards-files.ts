import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

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
 */

export interface SliceJsonlRecord<T> {
  record: T;
  file: string;
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
): Array<SliceJsonlRecord<T>> {
  const loaded: Array<SliceJsonlRecord<T>> = [];
  for (const file of listStandardsSliceFiles(standardsRoot, fileName)) {
    for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
      if (!line.trim()) continue;
      loaded.push({ record: JSON.parse(line) as T, file });
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
