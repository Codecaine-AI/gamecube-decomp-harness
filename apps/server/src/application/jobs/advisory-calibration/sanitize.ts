// Scrubs text copied out of the harness history before it is committed
// (plan §6.9): absolute paths under the source root (or the legacy checkout
// root the history recorded) become `<source-root>/…`, the home directory
// becomes `<home>`, values of secret-looking environment variables and any
// token-like string are replaced.
import { homedir } from "node:os";

import { LEGACY_HARNESS_ROOT } from "./source-root.js";

/** `sk-…` keys and bearer credentials (plan §6.9). */
export const TOKEN_LIKE = /sk-[A-Za-z0-9-]{8,}|Bearer\s+\S+/g;
const SECRET_ENV_NAME = /KEY|TOKEN|SECRET|PASSWORD|PASSWD|CREDENTIAL|COOKIE|AUTH/i;
/** Shorter values are too likely to occur by chance; the kernel refuses credentials this short anyway. */
const MIN_SECRET_LENGTH = 8;

export interface SanitizerOptions {
  sourceRoot: string;
  env?: Record<string, string | undefined>;
  home?: string;
}

export type Sanitize = (text: string) => string;

function withoutTrailingSlash(path: string): string {
  return path.length > 1 ? path.replace(/\/+$/, "") : path;
}

export function createSanitizer(opts: SanitizerOptions): Sanitize {
  const env = opts.env ?? process.env;
  const secrets = Object.entries(env)
    .filter((entry): entry is [string, string] => SECRET_ENV_NAME.test(entry[0]) && (entry[1]?.length ?? 0) >= MIN_SECRET_LENGTH)
    .sort((a, b) => b[1].length - a[1].length);
  // Longest prefix first, so the source root wins over the home directory that contains it.
  const roots = [
    { prefix: withoutTrailingSlash(LEGACY_HARNESS_ROOT), replacement: "<source-root>" },
    { prefix: withoutTrailingSlash(opts.sourceRoot), replacement: "<source-root>" },
    { prefix: withoutTrailingSlash(opts.home ?? homedir()), replacement: "<home>" },
  ]
    .filter((root) => root.prefix.length > 1)
    .sort((a, b) => b.prefix.length - a.prefix.length);
  return (text: string) => {
    let out = text;
    for (const [name, value] of secrets) out = out.split(value).join(`<redacted:env:${name}>`);
    out = out.replace(TOKEN_LIKE, "<redacted:token>");
    for (const root of roots) out = out.split(root.prefix).join(root.replacement);
    return out;
  };
}
