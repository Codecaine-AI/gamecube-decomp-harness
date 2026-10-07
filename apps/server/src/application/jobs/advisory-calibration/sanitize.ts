// Scrubs text copied out of the harness history before it is committed
// (plan §6.9): absolute paths under the source root (or the legacy checkout
// root the history recorded) become `<source-root>/…`, the home directory
// becomes `<home>`, values of secret-looking environment variables and any
// token-like string are replaced. Credentials are located on the original text
// in one pass (redactSecrets), so a secret inside a token never splits it. Structured data is scrubbed key by key and
// value by value before it is serialized (sanitizeDeep), so a pattern never
// eats JSON punctuation. Every non-empty value of a secret-looking variable is
// a secret, whatever it looks like ("1" and "true" included); only the
// variables in NOT_CREDENTIALS are known not to be. A value too short to scrub
// without mangling unrelated text is never replaced: the sanitizer records
// that it remains in the output, and callers refuse to write
// (assertNoShortSecrets). Only the replacements the sanitizer itself wrote are
// exempt from that scan; marker-shaped text in the input is input like any other.
import { homedir } from "node:os";

import { LEGACY_HARNESS_ROOT } from "./source-root.js";

/** `sk-…` keys and bearer credentials (plan §6.9). */
export const TOKEN_LIKE = /sk-[A-Za-z0-9-]{8,}|Bearer\s+\S+/g;
export const SECRET_ENV_NAME = /KEY|TOKEN|SECRET|PASSWORD|PASSWD|CREDENTIAL|COOKIE|AUTH/i;
/**
 * Variables whose names match SECRET_ENV_NAME but hold no credential: the ssh
 * agent and X11 authority paths, and git's author identity (AUTHOR contains
 * AUTH). Allowlisted by name only; no value is ever judged harmless.
 */
export const NOT_CREDENTIALS: ReadonlySet<string> = new Set(["SSH_AUTH_SOCK", "XAUTHORITY", "GIT_AUTHOR_NAME", "GIT_AUTHOR_EMAIL", "GIT_AUTHOR_DATE"]);
/** Shorter values are too likely to occur by chance to replace everywhere; the kernel refuses credentials this short anyway. */
const MIN_SECRET_LENGTH = 8;
/** Text as pieces: input the sanitizer kept, and replacements it generated (never rewritten or scanned again). */
interface Piece {
  text: string;
  generated: boolean;
}

/** Replaces every occurrence of `needle` in the input pieces. */
function replaceLiteral(pieces: Piece[], needle: string, replacement: string): Piece[] {
  const out: Piece[] = [];
  for (const piece of pieces) {
    if (piece.generated || !piece.text.includes(needle)) {
      out.push(piece);
      continue;
    }
    const parts = piece.text.split(needle);
    for (const [index, part] of parts.entries()) {
      if (part) out.push({ text: part, generated: false });
      if (index < parts.length - 1) out.push({ text: replacement, generated: true });
    }
  }
  return out;
}

export interface SanitizerOptions {
  sourceRoot: string;
  env?: Record<string, string | undefined>;
  home?: string;
}

export interface Sanitize {
  (text: string): string;
  /** Names (never values) of secret-looking variables whose short values remain in sanitized text. */
  shortSecretsSeen(): string[];
}

function withoutTrailingSlash(path: string): string {
  return path.length > 1 ? path.replace(/\/+$/, "") : path;
}

interface Span {
  start: number;
  end: number;
  token: boolean;
  /** The secret variable whose occurrence is longest in the span (env-only spans). */
  name: string;
  nameLength: number;
}

/**
 * Credentials found on the ORIGINAL text, all at once: every token-like span
 * (`Bearer …`, `sk-…`) and every occurrence of a long secret value. Spans that
 * overlap are merged and replaced whole, a span holding any token by
 * `<redacted:token>`, so a secret inside a token never splits it and leaves a
 * suffix behind. Everything outside the spans is kept input.
 */
function redactSecrets(text: string, secrets: ReadonlyArray<[string, string]>): Piece[] {
  const spans: Span[] = [];
  for (const match of text.matchAll(TOKEN_LIKE)) {
    spans.push({ start: match.index, end: match.index + match[0].length, token: true, name: "", nameLength: 0 });
  }
  for (const [name, value] of secrets) {
    for (let at = text.indexOf(value); at >= 0; at = text.indexOf(value, at + 1)) {
      spans.push({ start: at, end: at + value.length, token: false, name, nameLength: value.length });
    }
  }
  if (spans.length === 0) return [{ text, generated: false }];
  spans.sort((a, b) => a.start - b.start || b.end - a.end);
  const merged: Span[] = [];
  for (const span of spans) {
    const last = merged.at(-1);
    if (last && span.start < last.end) {
      last.end = Math.max(last.end, span.end);
      last.token ||= span.token;
      if (span.nameLength > last.nameLength) {
        last.name = span.name;
        last.nameLength = span.nameLength;
      }
    } else {
      merged.push({ ...span });
    }
  }
  const pieces: Piece[] = [];
  let at = 0;
  for (const span of merged) {
    if (span.start > at) pieces.push({ text: text.slice(at, span.start), generated: false });
    pieces.push({ text: span.token ? "<redacted:token>" : `<redacted:env:${span.name}>`, generated: true });
    at = span.end;
  }
  if (at < text.length) pieces.push({ text: text.slice(at), generated: false });
  return pieces;
}

export function createSanitizer(opts: SanitizerOptions): Sanitize {
  const env = opts.env ?? process.env;
  const sensitive = Object.entries(env).filter(
    (entry): entry is [string, string] =>
      SECRET_ENV_NAME.test(entry[0]) && !NOT_CREDENTIALS.has(entry[0]) && typeof entry[1] === "string" && entry[1].length > 0,
  );
  const secrets = sensitive.filter(([, value]) => value.length >= MIN_SECRET_LENGTH).sort((a, b) => b[1].length - a[1].length);
  const shortSecrets = sensitive.filter(([, value]) => value.length < MIN_SECRET_LENGTH);
  const seen = new Set<string>();
  // Longest prefix first, so the source root wins over the home directory that contains it.
  const roots = [
    { prefix: withoutTrailingSlash(LEGACY_HARNESS_ROOT), replacement: "<source-root>" },
    { prefix: withoutTrailingSlash(opts.sourceRoot), replacement: "<source-root>" },
    { prefix: withoutTrailingSlash(opts.home ?? homedir()), replacement: "<home>" },
  ]
    .filter((root) => root.prefix.length > 1)
    .sort((a, b) => b.prefix.length - a.prefix.length);
  const sanitize = (text: string) => {
    let pieces = redactSecrets(text, secrets);
    for (const root of roots) pieces = replaceLiteral(pieces, root.prefix, root.replacement);
    if (shortSecrets.length > 0) {
      // Every kept input piece, scanned on its own: only the replacements generated above are exempt.
      const kept = pieces.filter((piece) => !piece.generated).map((piece) => piece.text);
      for (const [name, value] of shortSecrets) if (kept.some((part) => part.includes(value))) seen.add(name);
    }
    return pieces.map((piece) => piece.text).join("");
  };
  return Object.assign(sanitize, { shortSecretsSeen: () => [...seen].sort() });
}

/**
 * Every string scrubbed, keys included, structure kept; serialize afterwards.
 * Two keys of one object that scrub to the same name are kept apart
 * explicitly: the later ones get `#2`, `#3`, … in key order.
 */
export function sanitizeDeep<T>(value: T, sanitize: (text: string) => string): T {
  if (typeof value === "string") return sanitize(value) as T;
  if (Array.isArray(value)) return value.map((entry) => sanitizeDeep(entry, sanitize)) as T;
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      const scrubbed = sanitize(key);
      let name = scrubbed;
      for (let n = 2; Object.hasOwn(out, name); n += 1) name = `${scrubbed}#${n}`;
      // defineProperty: a "__proto__" key stays a plain key, as JSON.parse made it.
      Object.defineProperty(out, name, { value: sanitizeDeep(entry, sanitize), enumerable: true, writable: true, configurable: true });
    }
    return out as T;
  }
  return value;
}

/**
 * A worker note: most are JSON, so they are scrubbed key by key and value by
 * value and re-serialized only when something was replaced (formatting kept otherwise);
 * prose is scrubbed as text.
 */
export function sanitizeNoteText(text: string, sanitize: (text: string) => string): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return sanitize(text);
  }
  if (parsed === null || typeof parsed !== "object") return sanitize(text);
  const scrubbed = sanitizeDeep(parsed, sanitize);
  return JSON.stringify(scrubbed) === JSON.stringify(parsed) ? text : `${JSON.stringify(scrubbed, null, 2)}${text.endsWith("\n") ? "\n" : ""}`;
}

/** Refuses to write history-derived files when a short secret-looking value occurred in them (names only, never values). */
export function assertNoShortSecrets(sanitize: Sanitize, what: string): void {
  const names = sanitize.shortSecretsSeen();
  if (names.length > 0) {
    throw new Error(
      `${what}: refusing to write: the value of ${names.join(", ")} is shorter than ${MIN_SECRET_LENGTH} characters and occurs in the history, ` +
        "so it cannot be scrubbed safely; unset it for this command",
    );
  }
}
