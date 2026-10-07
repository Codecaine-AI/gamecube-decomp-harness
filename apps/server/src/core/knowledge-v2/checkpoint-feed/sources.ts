// Source assembly for one confirmed-good checkpoint (plan §6.8 handler steps 2
// and 5, A3-F7): the raw final note and the parsed agent note, the checkpoint
// patch, the runner summary (every `llm_review` finding, info included), the
// frozen report, and the attempt-time adjudication when one was recorded.
// Each source is digested when assembled and again before the payload is
// enqueued, so the payload never describes evidence that changed under it.
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { isAdvisoryFinding, normalizeAdvisoryPath } from "@server/core/validation/qa/advisory-fingerprint.js";
import type { QaScanFinding } from "@server/core/validation/qa/scan-diff.js";

import { sha256Hex, type ConfirmedCheckpoint } from "./confirmed-good.js";

/** The raw note handed to the extraction (§6.8 `ConfirmedCheckpointInput.note`). */
export const NOTE_CHAR_LIMIT = 12_000;
/** Head of an over-long note kept before the omission marker; the rest of the budget is its tail. */
const NOTE_HEAD_CHARS = 3_000;
export const HUNK_LINE_LIMIT = 120;
export const HUNKS_BYTE_LIMIT = 16 * 1024;
/** A hunk that does not fit the remaining budget is cut to fit only when at least this much remains. */
const MIN_PARTIAL_HUNK_BYTES = 1_024;

export interface SourceDigests {
  note_sha256: string;
  /** Canonical JSON of `metadata.agent_note`; null when the note did not parse. */
  agent_note_sha256: string | null;
  patch_sha256: string;
  runner_summary_sha256: string;
  report_changes_sha256: string;
  /** Canonical JSON of `metadata.llm_review_adjudication`; null when none was recorded. */
  adjudication_sha256: string | null;
}

export interface CheckpointSources {
  noteText: string;
  patchText: string;
  /** `detail.llm_review` findings of severity warning or info, in scan order. */
  advisories: QaScanFinding[];
  adjudication: Record<string, unknown> | null;
  digests: SourceDigests;
}

export type SourceAssembly =
  | { status: "ok"; sources: CheckpointSources }
  | { status: "evidence-missing"; missing: string[] }
  | { status: "evidence-invalid"; reason: string };

/** JSON with object keys sorted by code point at every level, for stable digests. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (typeof value !== "object" || value === null) return value;
  const entries = Object.entries(value as Record<string, unknown>).filter(([, child]) => child !== undefined);
  entries.sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
  return Object.fromEntries(entries.map(([key, child]) => [key, sortKeys(child)]));
}

function jsonDigest(value: unknown): string | null {
  return value === undefined || value === null ? null : sha256Hex(canonicalJson(value));
}

function stringPath(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

interface FileSource {
  name: "note" | "patch" | "runner_summary" | "report_changes";
  path: string | null;
}

function fileSources(checkpoint: ConfirmedCheckpoint, repoRoot: string): FileSource[] {
  const at = (path: string | null) => (path ? resolve(repoRoot, path) : null);
  return [
    { name: "note", path: at(stringPath(checkpoint.metadata.agent_output_path)) },
    { name: "patch", path: at(checkpoint.patchPath) },
    { name: "runner_summary", path: at(checkpoint.runnerSummaryPath) },
    { name: "report_changes", path: checkpoint.reportChangesPath },
  ];
}

type ReadFiles = { ok: true; bytes: Record<FileSource["name"], Buffer> } | { ok: false; missing: string[] };

async function readFiles(sources: FileSource[]): Promise<ReadFiles> {
  const missing: string[] = [];
  const bytes: Partial<Record<FileSource["name"], Buffer>> = {};
  await Promise.all(sources.map(async (source) => {
    if (!source.path) {
      missing.push(source.name);
      return;
    }
    try {
      bytes[source.name] = await readFile(source.path);
    } catch {
      missing.push(source.name);
    }
  }));
  return missing.length > 0 ? { ok: false, missing: missing.sort() } : { ok: true, bytes: bytes as Record<FileSource["name"], Buffer> };
}

function digestsOf(bytes: Record<FileSource["name"], Buffer>, metadata: Record<string, unknown>): SourceDigests {
  return {
    note_sha256: sha256Hex(bytes.note),
    agent_note_sha256: jsonDigest(metadata.agent_note),
    patch_sha256: sha256Hex(bytes.patch),
    runner_summary_sha256: sha256Hex(bytes.runner_summary),
    report_changes_sha256: sha256Hex(bytes.report_changes),
    adjudication_sha256: jsonDigest(metadata.llm_review_adjudication),
  };
}

function isFinding(value: unknown): value is QaScanFinding {
  if (!isRecord(value)) return false;
  return typeof value.rule_id === "string"
    && (value.severity === "warning" || value.severity === "info" || value.severity === "error")
    && typeof value.file === "string"
    && typeof value.line === "number" && Number.isInteger(value.line)
    && typeof value.excerpt === "string"
    && typeof value.message === "string"
    && (value.detail === undefined || isRecord(value.detail));
}

/** Every `llm_review` advisory of the runner summary's raw QA scan; null when the summary is malformed. */
export function runnerSummaryAdvisories(summary: unknown): QaScanFinding[] | null {
  if (!isRecord(summary)) return null;
  const qaLint = summary.qaLint;
  if (qaLint === undefined || qaLint === null) return [];
  if (!isRecord(qaLint) || !Array.isArray(qaLint.findings)) return null;
  const advisories: QaScanFinding[] = [];
  for (const finding of qaLint.findings) {
    if (!isFinding(finding)) return null;
    if (isAdvisoryFinding(finding)) advisories.push(finding);
  }
  return advisories;
}

/**
 * Reads and digests every source of a confirmed checkpoint. A missing or
 * unreadable file is `evidence-missing`; a runner summary that is not JSON or
 * whose QA findings are malformed is `evidence-invalid`.
 */
export async function assembleSources(checkpoint: ConfirmedCheckpoint, repoRoot: string): Promise<SourceAssembly> {
  const read = await readFiles(fileSources(checkpoint, repoRoot));
  if (!read.ok) return { status: "evidence-missing", missing: read.missing };
  let summary: unknown;
  try {
    summary = JSON.parse(read.bytes.runner_summary.toString("utf8"));
  } catch {
    return { status: "evidence-invalid", reason: "runner summary is not valid JSON" };
  }
  const advisories = runnerSummaryAdvisories(summary);
  if (advisories === null) return { status: "evidence-invalid", reason: "runner summary QA findings are malformed" };
  const adjudication = checkpoint.metadata.llm_review_adjudication;
  return {
    status: "ok",
    sources: {
      noteText: read.bytes.note.toString("utf8"),
      patchText: read.bytes.patch.toString("utf8"),
      advisories,
      adjudication: isRecord(adjudication) ? adjudication : null,
      digests: digestsOf(read.bytes, checkpoint.metadata),
    },
  };
}

/**
 * Digests the same sources again: the files from disk and the note and
 * adjudication from the checkpoint's current metadata. Null when a file can
 * no longer be read.
 */
export async function currentDigests(
  checkpoint: ConfirmedCheckpoint,
  currentMetadata: Record<string, unknown>,
  repoRoot: string,
): Promise<SourceDigests | null> {
  const read = await readFiles(fileSources(checkpoint, repoRoot));
  return read.ok ? digestsOf(read.bytes, currentMetadata) : null;
}

/** Names of the digests that differ; empty when every source is unchanged. */
export function changedSources(before: SourceDigests, after: SourceDigests): string[] {
  return (Object.keys(before) as Array<keyof SourceDigests>).filter((key) => before[key] !== after[key]);
}

/** The raw note within NOTE_CHAR_LIMIT: its head and its tail (where notes put their structured fields). */
export function boundedNote(text: string): string {
  if (text.length <= NOTE_CHAR_LIMIT) return text;
  const marker = (omitted: number) => `\n[… ${omitted} characters omitted …]\n`;
  const provisional = marker(text.length);
  const tailChars = NOTE_CHAR_LIMIT - NOTE_HEAD_CHARS - provisional.length;
  const omitted = text.length - NOTE_HEAD_CHARS - tailChars;
  return `${text.slice(0, NOTE_HEAD_CHARS)}${marker(omitted)}${text.slice(text.length - tailChars)}`;
}

interface PatchHunk {
  file: string;
  lines: string[];
}

const HUNK_HEADER = /^@@ -\d+(?:,(\d+))? \+\d+(?:,(\d+))? @@/;

/** Splits a unified diff into hunks, consuming each hunk by its header's line counts. */
export function patchHunks(patchText: string): PatchHunk[] {
  const lines = patchText.split(/\r\n|\n|\r/);
  const hunks: PatchHunk[] = [];
  let file = "";
  let index = 0;
  while (index < lines.length) {
    const line = lines[index]!;
    if (line.startsWith("+++ ")) {
      let path = line.slice(4).trim();
      if (path.startsWith("b/")) path = path.slice(2);
      if (path !== "/dev/null") file = normalizeAdvisoryPath(path);
      index += 1;
      continue;
    }
    if (line.startsWith("--- ") && !file) {
      let path = line.slice(4).trim();
      if (path.startsWith("a/")) path = path.slice(2);
      if (path !== "/dev/null") file = normalizeAdvisoryPath(path);
      index += 1;
      continue;
    }
    if (line.startsWith("diff --git")) {
      file = "";
      index += 1;
      continue;
    }
    const header = HUNK_HEADER.exec(line);
    if (!header) {
      index += 1;
      continue;
    }
    let oldLeft = header[1] === undefined ? 1 : Number(header[1]);
    let newLeft = header[2] === undefined ? 1 : Number(header[2]);
    const body: string[] = [line];
    index += 1;
    while (index < lines.length && (oldLeft > 0 || newLeft > 0 || lines[index]!.startsWith("\\"))) {
      const bodyLine = lines[index]!;
      if (bodyLine.startsWith("\\")) {
        // "\ No newline at end of file" belongs to the previous line and counts for neither side.
      } else if (bodyLine.startsWith("-")) {
        oldLeft -= 1;
      } else if (bodyLine.startsWith("+")) {
        newLeft -= 1;
      } else {
        oldLeft -= 1;
        newLeft -= 1;
      }
      body.push(bodyLine);
      index += 1;
    }
    hunks.push({ file, lines: body });
  }
  return hunks;
}

function byteLength(text: string): number {
  return Buffer.byteLength(text, "utf8");
}

/** One hunk as handed to the model: its file, then at most `maxLines` lines in total. */
function renderHunk(hunk: PatchHunk, maxLines: number): string {
  const all = [hunk.file || "(unknown file)", ...hunk.lines];
  if (all.length <= maxLines) return all.join("\n");
  const kept = all.slice(0, Math.max(1, maxLines - 1));
  return [...kept, `[… ${all.length - kept.length} more lines]`].join("\n");
}

/**
 * The patch's hunks within the extraction bounds: at most HUNK_LINE_LIMIT
 * lines each and HUNKS_BYTE_LIMIT bytes in total, hunks of `preferredFile`
 * (the target's source) first. `truncated` is true when anything was cut.
 */
export function boundedHunks(patchText: string, preferredFile?: string | null): { hunks: string[]; truncated: boolean } {
  const preferred = preferredFile ? normalizeAdvisoryPath(preferredFile) : null;
  const all = patchHunks(patchText);
  const ordered = preferred === null
    ? all
    : [...all.filter((hunk) => hunk.file === preferred), ...all.filter((hunk) => hunk.file !== preferred)];
  const hunks: string[] = [];
  let used = 0;
  let truncated = false;
  for (const hunk of ordered) {
    let text = renderHunk(hunk, HUNK_LINE_LIMIT);
    if (text !== renderHunk(hunk, Number.POSITIVE_INFINITY)) truncated = true;
    const separator = hunks.length > 0 ? 1 : 0;
    const remaining = HUNKS_BYTE_LIMIT - used - separator;
    if (byteLength(text) > remaining) {
      truncated = true;
      if (remaining < MIN_PARTIAL_HUNK_BYTES) break;
      let maxLines = Math.min(HUNK_LINE_LIMIT, hunk.lines.length + 1);
      while (maxLines > 2 && byteLength(text) > remaining) {
        maxLines -= 1;
        text = renderHunk(hunk, maxLines);
      }
      if (byteLength(text) > remaining) break;
      hunks.push(text);
      break;
    }
    hunks.push(text);
    used += byteLength(text) + separator;
  }
  return { hunks, truncated };
}
