// Scrubs text copied out of the harness history before it is committed
// (plan §6.9): absolute paths under the source root (or the legacy checkout
// root the history recorded) become `<source-root>/…`, the home directory
// becomes `<home>`, values of secret-looking environment variables and any
// token-like string are replaced. Structured data is scrubbed value by value
// before it is serialized (sanitizeDeep), so a pattern never eats JSON
// punctuation. A secret-looking value too short to scrub without mangling
// unrelated text is never replaced; the sanitizer records that it occurred,
// and callers refuse to write (assertNoShortSecrets).
import { homedir } from "node:os";

import { LEGACY_HARNESS_ROOT } from "./source-root.js";

/** `sk-…` keys and bearer credentials (plan §6.9). */
export const TOKEN_LIKE = /sk-[A-Za-z0-9-]{8,}|Bearer\s+\S+/g;
const SECRET_ENV_NAME = /KEY|TOKEN|SECRET|PASSWORD|PASSWD|CREDENTIAL|COOKIE|AUTH/i;
/** Shorter values are too likely to occur by chance to replace everywhere; the kernel refuses credentials this short anyway. */
const MIN_SECRET_LENGTH = 8;
/** Flag-like values of secret-looking names that are not secrets. */
const NOT_A_SECRET = /^(?:\d{1,3}|true|false|yes|no|on|off)$/i;

export interface SanitizerOptions {
  sourceRoot: string;
  env?: Record<string, string | undefined>;
  home?: string;
}

export interface Sanitize {
  (text: string): string;
  /** Names (never values) of secret-looking variables whose short values occurred in sanitized text. */
  shortSecretsSeen(): string[];
}

function withoutTrailingSlash(path: string): string {
  return path.length > 1 ? path.replace(/\/+$/, "") : path;
}

export function createSanitizer(opts: SanitizerOptions): Sanitize {
  const env = opts.env ?? process.env;
  const sensitive = Object.entries(env).filter(
    (entry): entry is [string, string] => SECRET_ENV_NAME.test(entry[0]) && (entry[1]?.trim().length ?? 0) > 0 && !NOT_A_SECRET.test(entry[1]!.trim()),
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
    let out = text;
    for (const [name, value] of secrets) out = out.split(value).join(`<redacted:env:${name}>`);
    out = out.replace(TOKEN_LIKE, "<redacted:token>");
    for (const root of roots) out = out.split(root.prefix).join(root.replacement);
    for (const [name, value] of shortSecrets) if (out.includes(value)) seen.add(name);
    return out;
  };
  return Object.assign(sanitize, { shortSecretsSeen: () => [...seen].sort() });
}

/** Every string value (not key) scrubbed, structure kept; serialize afterwards. */
export function sanitizeDeep<T>(value: T, sanitize: (text: string) => string): T {
  if (typeof value === "string") return sanitize(value) as T;
  if (Array.isArray(value)) return value.map((entry) => sanitizeDeep(entry, sanitize)) as T;
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, entry]) => [key, sanitizeDeep(entry, sanitize)])) as T;
  }
  return value;
}

/**
 * A worker note: most are JSON, so they are scrubbed value by value and
 * re-serialized only when something was replaced (formatting kept otherwise);
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
