import { readFile as defaultReadFile } from "node:fs/promises";

const DEFAULT_MAX_BYTES = 400_000;
const TOOL_RESULT_TEXT_LIMIT = 300;
const USER_TEXT_LIMIT = 2_000;
const CUSTOM_MESSAGE_LIMIT = 2_000;
const UNPARSEABLE_LINE_LIMIT = 500;

export interface TranscriptCondenseOptions {
  maxBytes?: number;
  toolResultTextLimit?: number;
  userTextLimit?: number;
  customMessageLimit?: number;
  unparseableLineLimit?: number;
}

export interface TranscriptPacketRow {
  kind: string;
  session_id: string;
  path: string | null;
  exists: boolean;
}

type ReadTranscriptFile = (path: string, encoding: "utf8") => Promise<string>;

interface CondensedLine {
  text: string;
}

function byteLength(value: string): number {
  return Buffer.byteLength(value, "utf8");
}

function truncationMarker(removedCharacters: number): string {
  return `…[transcript-condenser: truncated ${removedCharacters} chars]`;
}

function truncateString(value: string, limit: number): string {
  if (value.length <= limit) return value;
  return `${value.slice(0, limit)}${truncationMarker(value.length - limit)}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function condenseParsedEvent(
  event: Record<string, unknown>,
  options: Required<Omit<TranscriptCondenseOptions, "maxBytes">>,
): { event: Record<string, unknown>; changed: boolean } {
  if (event.type === "custom_message" && typeof event.content === "string") {
    const content = truncateString(event.content, options.customMessageLimit);
    return content === event.content
      ? { event, changed: false }
      : { event: { ...event, content }, changed: true };
  }

  if (event.type !== "message" || !isRecord(event.message)
    || (event.message.role !== "toolResult" && event.message.role !== "user")
    || !Array.isArray(event.message.content)) {
    return { event, changed: false };
  }

  const textLimit = event.message.role === "user"
    ? options.userTextLimit
    : options.toolResultTextLimit;
  let changed = false;
  const content = event.message.content.map((part) => {
    if (!isRecord(part) || part.type !== "text" || typeof part.text !== "string") return part;
    const text = truncateString(part.text, textLimit);
    if (text === part.text) return part;
    changed = true;
    return { ...part, text };
  });
  return changed
    ? { event: { ...event, message: { ...event.message, content } }, changed: true }
    : { event, changed: false };
}

function condenseLines(raw: string, options: TranscriptCondenseOptions): string {
  const limits = {
    toolResultTextLimit: options.toolResultTextLimit ?? TOOL_RESULT_TEXT_LIMIT,
    userTextLimit: options.userTextLimit ?? USER_TEXT_LIMIT,
    customMessageLimit: options.customMessageLimit ?? CUSTOM_MESSAGE_LIMIT,
    unparseableLineLimit: options.unparseableLineLimit ?? UNPARSEABLE_LINE_LIMIT,
  };
  const trailingNewline = raw.endsWith("\n");
  const lines = raw.split("\n");
  if (trailingNewline) lines.pop();
  let changed = false;
  const condensed = lines.map((line) => {
    try {
      const parsed: unknown = JSON.parse(line);
      if (!isRecord(parsed)) return line;
      const result = condenseParsedEvent(parsed, limits);
      if (!result.changed) return line;
      changed = true;
      return JSON.stringify(result.event);
    } catch {
      if (line.length <= limits.unparseableLineLimit) return line;
      changed = true;
      return line.slice(0, limits.unparseableLineLimit);
    }
  });
  if (!changed) return raw;
  return `${condensed.join("\n")}${trailingNewline ? "\n" : ""}`;
}

function linesForElision(content: string): { lines: CondensedLine[]; trailingNewline: boolean } {
  const trailingNewline = content.endsWith("\n");
  const rawLines = content.split("\n");
  if (trailingNewline) rawLines.pop();
  return { lines: rawLines.map((text) => ({ text })), trailingNewline };
}

function renderElision(
  lines: CondensedLine[],
  start: number,
  count: number,
  trailingNewline: boolean,
): string {
  const removed = lines.slice(start, start + count);
  const marker = JSON.stringify({
    type: "custom",
    marker: "transcript-condenser",
    elided_events: removed.length,
    elided_bytes: removed.reduce((total, line) => total + byteLength(line.text), 0),
  });
  const output = [
    ...lines.slice(0, start).map((line) => line.text),
    marker,
    ...lines.slice(start + count).map((line) => line.text),
  ].join("\n");
  return `${output}${trailingNewline ? "\n" : ""}`;
}

function elideTranscriptToBudget(content: string, maxBytes: number): string {
  if (byteLength(content) <= maxBytes) return content;
  const { lines, trailingNewline } = linesForElision(content);
  if (lines.length < 3) return content;

  const sideBudget = Math.floor(maxBytes * 0.45);
  let headCount = 1;
  let headBytes = byteLength(lines[0].text) + 1;
  while (headCount < lines.length - 1) {
    const nextBytes = byteLength(lines[headCount].text) + 1;
    if (headBytes + nextBytes > sideBudget) break;
    headBytes += nextBytes;
    headCount += 1;
  }

  let tailCount = 1;
  let tailBytes = byteLength(lines.at(-1)!.text) + (trailingNewline ? 1 : 0);
  while (tailCount < lines.length - headCount) {
    const nextIndex = lines.length - tailCount - 1;
    const nextBytes = byteLength(lines[nextIndex].text) + 1;
    if (tailBytes + nextBytes > sideBudget) break;
    tailBytes += nextBytes;
    tailCount += 1;
  }

  return renderElision(lines, headCount, lines.length - headCount - tailCount, trailingNewline);
}

export function condenseTranscriptContent(
  raw: string,
  options: TranscriptCondenseOptions = {},
): string {
  const condensed = condenseLines(raw, options);
  return elideTranscriptToBudget(condensed, options.maxBytes ?? DEFAULT_MAX_BYTES);
}

function distributeBudgets(sizes: number[], maxBytes: number): number[] {
  const total = sizes.reduce((sum, size) => sum + size, 0);
  if (total <= maxBytes || total === 0) return sizes;
  const exact = sizes.map((size) => (size / total) * maxBytes);
  const budgets = exact.map(Math.floor);
  let remaining = maxBytes - budgets.reduce((sum, size) => sum + size, 0);
  const order = exact
    .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((left, right) => right.fraction - left.fraction || left.index - right.index);
  for (const item of order) {
    if (remaining <= 0) break;
    budgets[item.index] += 1;
    remaining -= 1;
  }
  return budgets;
}

export async function buildTranscriptPacket<T extends TranscriptPacketRow>(
  transcripts: readonly T[],
  readFileOrOptions: ReadTranscriptFile | TranscriptCondenseOptions = defaultReadFile,
  options: TranscriptCondenseOptions = {},
): Promise<Array<T & { content: string | null }>> {
  const readFile = typeof readFileOrOptions === "function" ? readFileOrOptions : defaultReadFile;
  const resolvedOptions = typeof readFileOrOptions === "function" ? options : readFileOrOptions;
  const contents = await Promise.all(transcripts.map(async (row) => {
    if (!row.exists || !row.path) return null;
    const raw = await readFile(row.path, "utf8");
    return condenseLines(raw, resolvedOptions);
  }));
  const sizes = contents.map((content) => content === null ? 0 : byteLength(content));
  const budgets = distributeBudgets(sizes, resolvedOptions.maxBytes ?? DEFAULT_MAX_BYTES);
  return transcripts.map((row, index) => ({
    ...row,
    content: contents[index] === null
      ? null
      : elideTranscriptToBudget(contents[index], budgets[index]),
  }));
}
