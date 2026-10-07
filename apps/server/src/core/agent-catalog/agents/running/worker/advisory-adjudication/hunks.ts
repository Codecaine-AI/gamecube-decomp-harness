// The patch excerpt a reviewer sees for one advisory (plan §6.5): the lines
// around the flagged line inside its own hunk, as a valid unified-diff hunk
// with a recomputed header. Files and hunks are walked exactly like
// fullFlaggedLineFromPatch (advisory-fingerprint.ts), so line numbers agree
// with the scanner's.
import { normalizeAdvisoryPath } from "@server/core/validation/qa/advisory-fingerprint.js";

export const DEFAULT_HUNK_CONTEXT = 6;

const HUNK_HEADER = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)$/;

interface BodyLine {
  text: string;
  kind: "+" | "-" | " ";
  /** The `\ No newline at end of file` marker that follows this line; not a line of its own. */
  marker?: string;
  /** Old-file line cursor at this line (the line number it has, or would have, in the old file). */
  old: number;
  /** New-file line cursor at this line. */
  new: number;
}

interface Hunk {
  section: string;
  lines: BodyLine[];
}

function hunksOf(patchText: string, file: string): Hunk[] {
  const wanted = normalizeAdvisoryPath(file);
  const hunks: Hunk[] = [];
  let inFile = false;
  let current: Hunk | null = null;
  let oldLine = 0;
  let newLine = 0;
  const rows = patchText.split(/\r\n|\n|\r/);
  // The final newline is a terminator, not an empty context line.
  if (rows.at(-1) === "") rows.pop();
  for (const raw of rows) {
    if (raw.startsWith("+++ ")) {
      let path = raw.slice(4).trim();
      if (path.startsWith("b/")) path = path.slice(2);
      inFile = path !== "/dev/null" && normalizeAdvisoryPath(path) === wanted;
      current = null;
      continue;
    }
    if (raw.startsWith("--- ") || raw.startsWith("diff --git") || raw.startsWith("index ")) {
      current = null;
      continue;
    }
    const header = HUNK_HEADER.exec(raw);
    if (header) {
      current = null;
      if (!inFile) continue;
      oldLine = Number(header[1]);
      newLine = Number(header[3]);
      current = { section: header[5] ?? "", lines: [] };
      hunks.push(current);
      continue;
    }
    if (!current) continue;
    if (raw.startsWith("\\")) {
      const previous = current.lines.at(-1);
      if (previous) previous.marker = raw;
    } else if (raw.startsWith("+")) {
      current.lines.push({ text: raw, kind: "+", old: oldLine, new: newLine });
      newLine += 1;
    } else if (raw.startsWith("-")) {
      current.lines.push({ text: raw, kind: "-", old: oldLine, new: newLine });
      oldLine += 1;
    } else {
      current.lines.push({ text: raw, kind: " ", old: oldLine, new: newLine });
      oldLine += 1;
      newLine += 1;
    }
  }
  return hunks;
}

/** Unified-diff range: a zero-length range starts at the line before it. */
function range(start: number, count: number): string {
  return `${count === 0 ? Math.max(0, start - 1) : start},${count}`;
}

/**
 * The hunk of `file` holding new-file line `line` (an added line, else a
 * context line), cut to `context` diff lines on each side of it and never
 * past the hunk's edges, with a header recomputed for the cut. A `\ No
 * newline at end of file` marker travels with the line it follows and is not
 * counted. Null when the patch has no such line.
 */
export function extractHunk(patchText: string, file: string, line: number, context: number = DEFAULT_HUNK_CONTEXT): string | null {
  if (!Number.isSafeInteger(line) || line < 1 || !Number.isSafeInteger(context) || context < 0) return null;
  let found: { hunk: Hunk; index: number } | null = null;
  for (const hunk of hunksOf(patchText, file)) {
    const added = hunk.lines.findIndex((l) => l.kind === "+" && l.new === line);
    const index = added >= 0 ? added : hunk.lines.findIndex((l) => l.kind === " " && l.new === line);
    if (index < 0) continue;
    found = { hunk, index };
    if (added >= 0) break;
  }
  if (!found) return null;
  const { hunk, index } = found;
  const window = hunk.lines.slice(Math.max(0, index - context), Math.min(hunk.lines.length, index + context + 1));
  const first = window[0]!;
  const oldCount = window.filter((l) => l.kind === "-" || l.kind === " ").length;
  const newCount = window.filter((l) => l.kind === "+" || l.kind === " ").length;
  const header = `@@ -${range(first.old, oldCount)} +${range(first.new, newCount)} @@${hunk.section}`;
  return [header, ...window.flatMap((l) => (l.marker !== undefined ? [l.text, l.marker] : [l.text]))].join("\n");
}
