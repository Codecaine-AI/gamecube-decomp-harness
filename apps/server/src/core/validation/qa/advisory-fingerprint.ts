import { createHash } from "node:crypto";
import type { QaScanFinding } from "./scan-diff.js";

/**
 * Shared identity for `llm_review` advisories across L1, L2, the epoch scan,
 * the librarian payload, and calibration. The scanner truncates `excerpt` at
 * 240 characters, so the fingerprint hashes the complete flagged line, read
 * from the attempt patch (L1, shadow lane) or the scanned tree (L2, epoch).
 */
export const ADVISORY_FINGERPRINT_VERSION = "af2";

type StableDetailValue = string | number | boolean | null;

/** True for findings the model may adjudicate: detail.llm_review === true and severity "warning" or "info". */
export function isAdvisoryFinding(f: QaScanFinding): boolean {
  return f.detail?.llm_review === true && (f.severity === "warning" || f.severity === "info");
}

/** Repo-relative path with forward slashes, no leading "./", no repeated separators. */
export function normalizeAdvisoryPath(file: string): string {
  let path = file.trim().replaceAll("\\", "/").replace(/\/{2,}/g, "/");
  while (path.startsWith("./")) path = path.slice(2);
  return path;
}

/** Trim and collapse every whitespace run to one space; the form stored as `accepted_advisory.full_line`. */
export function normalizeAdvisoryCode(line: string): string {
  return line.trim().replace(/\s+/g, " ");
}

/** `detail` minus `llm_review`, keys sorted, primitive values only (e.g. cast, name, kind). */
function stableDetail(detail: Record<string, unknown> | undefined): Record<string, StableDetailValue> {
  const stable: Record<string, StableDetailValue> = {};
  if (!detail) return stable;
  for (const key of Object.keys(detail).sort()) {
    if (key === "llm_review") continue;
    const value = detail[key];
    if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      stable[key] = value;
    }
  }
  return stable;
}

/**
 * "af2:" + sha256(JSON.stringify([rule_id, normalizePath(file), normalizeCode(fullLine), stableDetail(detail)]))
 * Line numbers and hunks are excluded; any change anywhere in the full flagged line changes the fingerprint.
 */
export function advisoryFingerprint(f: QaScanFinding, fullLine: string): string {
  const identity = JSON.stringify([
    f.rule_id,
    normalizeAdvisoryPath(f.file),
    normalizeAdvisoryCode(fullLine),
    stableDetail(f.detail),
  ]);
  return `${ADVISORY_FINGERPRINT_VERSION}:${createHash("sha256").update(identity).digest("hex")}`;
}

/** The full line must start with the finding's excerpt, both trimmed; otherwise the evidence is unreadable. */
export function flaggedLineMatchesExcerpt(fullLine: string, excerpt: string): boolean {
  return fullLine.trim().startsWith(excerpt.trim());
}

function withExcerptCheck(fullLine: string | null, excerpt: string | undefined): string | null {
  if (fullLine === null) return null;
  if (excerpt !== undefined && !flaggedLineMatchesExcerpt(fullLine, excerpt)) return null;
  return fullLine;
}

const HUNK_HEADER = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;

/**
 * The added line at new-file line `line` of `file` in a unified diff, or null
 * when the patch has no such `+` line. Walks the diff exactly like the
 * scanner's `parse_unified_diff` (scan_diff.py), so line numbers agree with
 * the finding. With `excerpt`, a line that does not start with it is null.
 */
export function fullFlaggedLineFromPatch(
  patchText: string,
  file: string,
  line: number,
  excerpt?: string,
): string | null {
  const wanted = normalizeAdvisoryPath(file);
  let inFile = false;
  let inHunk = false;
  let newLine = 0;
  for (const raw of patchText.split(/\r\n|\n|\r/)) {
    if (raw.startsWith("+++ ")) {
      let path = raw.slice(4).trim();
      if (path.startsWith("b/")) path = path.slice(2);
      inFile = path !== "/dev/null" && normalizeAdvisoryPath(path) === wanted;
      inHunk = false;
      continue;
    }
    if (raw.startsWith("--- ") || raw.startsWith("diff --git") || raw.startsWith("index ")) {
      inHunk = false;
      continue;
    }
    const header = HUNK_HEADER.exec(raw);
    if (header) {
      inHunk = inFile;
      newLine = Number(header[3]);
      continue;
    }
    if (!inHunk || raw.startsWith("\\")) continue;
    if (raw.startsWith("+")) {
      if (newLine === line) return withExcerptCheck(raw.slice(1), excerpt);
      newLine += 1;
    } else if (!raw.startsWith("-")) {
      newLine += 1;
    }
  }
  return null;
}

/** Line `line` (1-based) of a file's text, or null when out of range. With `excerpt`, a mismatch is null. */
export function fullFlaggedLineFromText(fileText: string, line: number, excerpt?: string): string | null {
  if (!Number.isInteger(line) || line < 1) return null;
  const lines = fileText.split(/\r\n|\n|\r/);
  return withExcerptCheck(line <= lines.length ? lines[line - 1]! : null, excerpt);
}

/** Line `line` of `file` at `rev` (`git show <rev>:<file>`), or null when unreadable. With `excerpt`, a mismatch is null. */
export async function fullFlaggedLineAtRev(
  repoRoot: string,
  rev: string,
  file: string,
  line: number,
  excerpt?: string,
): Promise<string | null> {
  const proc = Bun.spawn(["git", "-C", repoRoot, "show", `${rev}:${normalizeAdvisoryPath(file)}`], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, , exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  if (exitCode !== 0) return null;
  return fullFlaggedLineFromText(stdout, line, excerpt);
}
