// Reading and writing the calibration dataset directory (plan §6.9). JSONL
// files are append-only logs where a later record for the same id wins; the
// whole-file writers replace atomically (temp file + rename).
import { createHash } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import type {
  CalibrationItem,
  ExtractionRecord,
  HumanLabel,
  LabelRecord,
  NoteRecord,
  ProposalRecord,
  SplitFile,
} from "./types.js";

/** Committed dataset location, relative to the harness repo root (same convention as `analysis/worker-audit-2026-09-01/`). */
export const DEFAULT_CALIBRATION_DIR = "analysis/advisory-adjudication";

export interface CalibrationPaths {
  dir: string;
  manifest: string;
  candidates: string;
  synthetic: string;
  notes: string;
  extractions: string;
  proposals: string;
  labels: string;
  split: string;
  runs: string;
  reports: string;
}

export function calibrationPaths(dir: string): CalibrationPaths {
  return {
    dir,
    manifest: join(dir, "manifest.json"),
    candidates: join(dir, "candidates.jsonl"),
    synthetic: join(dir, "synthetic.jsonl"),
    notes: join(dir, "notes.jsonl"),
    extractions: join(dir, "extractions.jsonl"),
    proposals: join(dir, "proposals.jsonl"),
    labels: join(dir, "labels.jsonl"),
    split: join(dir, "split.json"),
    runs: join(dir, "runs"),
    reports: join(dir, "reports"),
  };
}

/** Every record of a JSONL file; a missing file is empty. */
export function readJsonl<T>(path: string): T[] {
  if (!existsSync(path)) return [];
  const rows: T[] = [];
  const lines = readFileSync(path, "utf8").split("\n");
  for (const [index, line] of lines.entries()) {
    if (!line.trim()) continue;
    try {
      rows.push(JSON.parse(line) as T);
    } catch (error) {
      throw new Error(`${path}:${index + 1}: invalid JSON (${error instanceof Error ? error.message : String(error)})`);
    }
  }
  return rows;
}

function writeAtomic(path: string, text: string): void {
  mkdirSync(dirname(path), { recursive: true });
  const temp = `${path}.tmp-${process.pid}`;
  writeFileSync(temp, text);
  renameSync(temp, path);
}

export function writeJsonl(path: string, rows: readonly unknown[]): void {
  writeAtomic(path, rows.map((row) => `${JSON.stringify(row)}\n`).join(""));
}

export function appendJsonl(path: string, row: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, `${JSON.stringify(row)}\n`);
}

export function readJson<T>(path: string): T | null {
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

export function writeJson(path: string, value: unknown): void {
  writeAtomic(path, `${JSON.stringify(value, null, 2)}\n`);
}

/** The last record per id, in file order. */
export function latestById<T extends { id: string }>(rows: readonly T[]): Map<string, T> {
  const byId = new Map<string, T>();
  for (const row of rows) byId.set(row.id, row);
  return byId;
}

export function sha256Hex(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

/** JSON with object keys sorted at every level: the input of every recorded hash. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const entries = Object.keys(value as Record<string, unknown>)
      .sort()
      .filter((key) => (value as Record<string, unknown>)[key] !== undefined)
      .map((key) => `${JSON.stringify(key)}:${canonicalJson((value as Record<string, unknown>)[key])}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value);
}

export interface CalibrationDataset {
  paths: CalibrationPaths;
  /** Real items (`candidates.jsonl`) then synthetic items (`synthetic.jsonl`). */
  items: CalibrationItem[];
  byId: Map<string, CalibrationItem>;
  notes: Map<string, NoteRecord>;
  extractions: Map<string, ExtractionRecord>;
  proposals: Map<string, ProposalRecord>;
  /** Every label record, in file order. */
  labels: LabelRecord[];
  split: SplitFile | null;
}

export function loadDataset(dir: string): CalibrationDataset {
  const paths = calibrationPaths(dir);
  const items = [...readJsonl<CalibrationItem>(paths.candidates), ...readJsonl<CalibrationItem>(paths.synthetic)];
  const byId = new Map<string, CalibrationItem>();
  for (const item of items) {
    if (byId.has(item.id)) throw new Error(`Duplicate calibration item id ${item.id} in ${dir}`);
    byId.set(item.id, item);
  }
  const notes = new Map<string, NoteRecord>();
  for (const note of readJsonl<NoteRecord>(paths.notes)) notes.set(note.key, note);
  return {
    paths,
    items,
    byId,
    notes,
    extractions: latestById(readJsonl<ExtractionRecord>(paths.extractions)),
    proposals: latestById(readJsonl<ProposalRecord>(paths.proposals)),
    labels: readJsonl<LabelRecord>(paths.labels),
    split: readJson<SplitFile>(paths.split),
  };
}

/** The latest human label per item, skips ignored (a skip never replaces a label). */
export function effectiveHumanLabels(labels: readonly LabelRecord[]): Map<string, HumanLabel> {
  const byId = new Map<string, HumanLabel>();
  for (const record of labels) {
    if (record.labeler !== "human") continue;
    if (record.label === "justified" || record.label === "unjustified") byId.set(record.id, record.label);
  }
  return byId;
}

/** The justification an item is judged on: a synthetic item's own text, else its extraction; null when none or blank. */
export function justificationOf(item: CalibrationItem, extractions: ReadonlyMap<string, ExtractionRecord>): string | null {
  const text = item.synthetic ? item.justification : extractions.get(item.id)?.justification;
  return typeof text === "string" && text.trim() ? text : null;
}
