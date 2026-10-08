// Scrubs text copied out of the harness history before it is committed
// (plan §6.9): absolute paths under the source root (or the legacy checkout
// root the history recorded) become `<source-root>/…`, the home directory
// becomes `<home>`, values of secret-looking environment variables and any
// token-like string are replaced. Credentials are located on the original text
// in one pass (redactSecrets), so a secret inside a token never splits it; each
// long secret is also found in percent-encoded runs (any case, any escaped
// character) and base64 runs (standard or URL-safe, padded or not, whitespace
// inside) by their decoded bytes, and token schemes match in any case.
// Boundary: one standard decoding step is covered; multi-step or non-standard
// encodings (base64 of percent-encoding, custom alphabets, encryption) are not. Structured data is scrubbed after decoding, key by
// key and value by value (numbers, booleans and null by their text form), and
// serialized afterwards (sanitizeDeep), so a pattern never eats JSON
// punctuation and no escape sequence hides a secret. Every non-empty value of a secret-looking variable is
// a secret, whatever it looks like ("1" and "true" included); only the
// variables in NOT_CREDENTIALS are known not to be. A value too short to scrub
// without mangling unrelated text is never replaced: the sanitizer records
// that it remains in the output, and callers refuse to write
// (assertNoShortSecrets). Only the replacements the sanitizer itself wrote are
// exempt from that scan; marker-shaped text in the input is input like any other.
import { homedir } from "node:os";

import { LEGACY_HARNESS_ROOT } from "./source-root.js";

/** `sk-…` keys and bearer credentials (plan §6.9), in any case (HTTP auth schemes are case-insensitive). */
export const TOKEN_LIKE = /sk-[A-Za-z0-9-]{8,}|Bearer\s+\S+/gi;
export const SECRET_ENV_NAME = /KEY|TOKEN|SECRET|PASSWORD|PASSWD|CREDENTIAL|COOKIE|AUTH/i;
/**
 * Variables whose names match SECRET_ENV_NAME but hold no credential: the ssh
 * agent and X11 authority paths, and git's author identity (AUTHOR contains
 * AUTH). Allowlisted by name only; no value is ever judged harmless.
 */
export const NOT_CREDENTIALS: ReadonlySet<string> = new Set(["SSH_AUTH_SOCK", "XAUTHORITY", "GIT_AUTHOR_NAME", "GIT_AUTHOR_EMAIL", "GIT_AUTHOR_DATE"]);
/** Whitespace-free runs (found in one linear pass); only those holding a %XX escape are decoded. */
const WHITESPACE_FREE_RUN = /\S+/g;
const HAS_PERCENT_ESCAPE = /%[0-9A-Fa-f]{2}/;
/** Base64 characters (both alphabets) with whitespace inside, then optional padding. */
const BASE64_RUN = /[A-Za-z0-9+/_-](?:[A-Za-z0-9+/_-]|\s)*={0,2}/g;
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
/** Every occurrence of `needle` in `bytes`, as [first byte, last byte]. */
function byteMatches(bytes: Buffer, needle: Buffer): Array<[number, number]> {
  const found: Array<[number, number]> = [];
  for (let at = bytes.indexOf(needle); at >= 0; at = bytes.indexOf(needle, at + 1)) found.push([at, at + needle.length - 1]);
  return found;
}

function isHex(code: number): boolean {
  return (code >= 48 && code <= 57) || (code >= 65 && code <= 70) || (code >= 97 && code <= 102);
}

/** The one whitespace definition: JavaScript `\s`, as in BASE64_RUN and WHITESPACE_FREE_RUN (Unicode spaces included). */
const WHITESPACE = /\s/;

/**
 * Secrets inside percent-encoded runs (any case, escaped unreserved characters,
 * raw characters mixed in), matched on the decoded bytes; the span covers
 * exactly the characters that encode them. Linear: runs are split once and
 * each character is visited once.
 */
function percentEncodedSpans(text: string, secrets: ReadonlyArray<[string, Buffer]>): Span[] {
  const spans: Span[] = [];
  for (const match of text.matchAll(WHITESPACE_FREE_RUN)) {
    const run = match[0];
    if (!HAS_PERCENT_ESCAPE.test(run)) continue;
    const bytes: number[] = [];
    const starts: number[] = [];
    const ends: number[] = [];
    const push = (byte: number, from: number, to: number) => {
      bytes.push(byte);
      starts.push(match.index + from);
      ends.push(match.index + to);
    };
    for (let i = 0; i < run.length; ) {
      const code = run.charCodeAt(i);
      if (code === 37 && i + 2 < run.length && isHex(run.charCodeAt(i + 1)) && isHex(run.charCodeAt(i + 2))) {
        push(Number.parseInt(run.slice(i + 1, i + 3), 16), i, i + 3);
        i += 3;
      } else if (code < 128) {
        push(code, i, i + 1);
        i += 1;
      } else {
        const char = String.fromCodePoint(run.codePointAt(i)!);
        for (const byte of Buffer.from(char, "utf8")) push(byte, i, i + char.length);
        i += char.length;
      }
    }
    const decoded = Buffer.from(bytes);
    for (const [name, needle] of secrets) {
      for (const [first, last] of byteMatches(decoded, needle)) {
        spans.push({ start: starts[first]!, end: ends[last]!, token: false, name, nameLength: needle.length });
      }
    }
  }
  return spans;
}

/**
 * Secrets inside base64 runs (either alphabet, whitespace inside allowed so a
 * wrapped or split blob still decodes), matched on the decoded bytes at each
 * of the four alignments. Each match maps to exactly the characters carrying
 * its bits (byte i holds bits 8i..8i+7, character k bits 6k..6k+5), plus the
 * run's trailing padding when the match reaches its end; neighbours, including
 * a word before it or a slash after it, are kept. Linear in the run.
 */
function base64Spans(text: string, secrets: ReadonlyArray<[string, Buffer]>): Span[] {
  const spans: Span[] = [];
  const shortest = Math.min(...secrets.map(([, needle]) => needle.length));
  for (const match of text.matchAll(BASE64_RUN)) {
    const positions: number[] = [];
    const chars: string[] = [];
    for (let i = 0; i < match[0].length; i += 1) {
      const char = match[0][i]!;
      if (char === "=" || WHITESPACE.test(char)) continue;
      positions.push(match.index + i);
      chars.push(char);
    }
    if (chars.length < Math.ceil((shortest * 4) / 3)) continue;
    const stripped = chars.join("");
    for (let offset = 0; offset < 4; offset += 1) {
      const decoded = Buffer.from(stripped.slice(offset), "base64");
      for (const [name, needle] of secrets) {
        for (const [first, last] of byteMatches(decoded, needle)) {
          const startChar = offset + Math.floor((8 * first) / 6);
          const lastChar = Math.min(chars.length - 1, offset + Math.floor((8 * last + 7) / 6));
          let end = positions[lastChar]! + 1;
          if (lastChar === chars.length - 1) while (text[end] === "=") end += 1;
          spans.push({ start: positions[startChar]!, end, token: false, name, nameLength: needle.length });
        }
      }
    }
  }
  return spans;
}

function redactSecrets(text: string, secrets: ReadonlyArray<[string, string]>, decodedSecrets: ReadonlyArray<[string, Buffer]> = []): Piece[] {
  const spans: Span[] = [];
  if (decodedSecrets.length > 0) spans.push(...percentEncodedSpans(text, decodedSecrets), ...base64Spans(text, decodedSecrets));
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

/** A secret as written, URL-encoded, and in standard and URL-safe base64 (padded and unpadded). */
export function encodedForms(value: string): string[] {
  const base64 = Buffer.from(value, "utf8").toString("base64");
  const base64Url = Buffer.from(value, "utf8").toString("base64url");
  return [...new Set([value, encodeURIComponent(value), base64, base64.replace(/=+$/, ""), base64Url, base64Url.replace(/=+$/, "")])];
}

export function createSanitizer(opts: SanitizerOptions): Sanitize {
  const env = opts.env ?? process.env;
  const sensitive = Object.entries(env).filter(
    (entry): entry is [string, string] =>
      SECRET_ENV_NAME.test(entry[0]) && !NOT_CREDENTIALS.has(entry[0]) && typeof entry[1] === "string" && entry[1].length > 0,
  );
  const secrets = sensitive
    .filter(([, value]) => value.length >= MIN_SECRET_LENGTH)
    .flatMap(([name, value]) => encodedForms(value).map((form): [string, string] => [name, form]))
    .sort((a, b) => b[1].length - a[1].length);
  const decodedSecrets = sensitive
    .filter(([, value]) => value.length >= MIN_SECRET_LENGTH)
    .map(([name, value]): [string, Buffer] => [name, Buffer.from(value, "utf8")]);
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
    let pieces = redactSecrets(text, secrets, decodedSecrets);
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
 * A number, boolean or null is checked by its text form: when that form holds
 * a secret it is replaced by the scrubbed string (a short secret is recorded
 * for refusal like any text). Two keys of one object that scrub to the same
 * name are kept apart explicitly: the later ones get `#2`, `#3`, … in key order.
 */
export function sanitizeDeep<T>(value: T, sanitize: (text: string) => string): T {
  if (typeof value === "string") return sanitize(value) as T;
  if (typeof value === "number" || typeof value === "boolean" || value === null) {
    const text = String(value);
    const scrubbed = sanitize(text);
    return (scrubbed === text ? value : scrubbed) as T;
  }
  if (Array.isArray(value)) return value.map((entry) => sanitizeDeep(entry, sanitize)) as T;
  if (typeof value === "object") {
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
 * A worker note. JSON (object, array or scalar) is scrubbed after decoding,
 * so an escape sequence (`\u0061…`) or a duplicated key never hides a secret.
 * The raw text is kept only when nothing was replaced AND it is already the
 * plain serialization of what it decodes to; otherwise the scrubbed value is
 * re-serialized. Prose is scrubbed as text.
 */
export function sanitizeNoteText(text: string, sanitize: (text: string) => string): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return sanitize(text);
  }
  const scrubbed = sanitizeDeep(parsed, sanitize);
  const body = text.endsWith("\n") ? text.slice(0, -1) : text;
  const plain = body === JSON.stringify(parsed, null, 2) || body === JSON.stringify(parsed);
  if (plain && JSON.stringify(scrubbed) === JSON.stringify(parsed)) return text;
  return `${JSON.stringify(scrubbed, null, 2)}${text.endsWith("\n") ? "\n" : ""}`;
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
