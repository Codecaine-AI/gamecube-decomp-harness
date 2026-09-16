/**
 * Melee revisions before doldecomp/melee#3471 (2026-09-13) opt into prototype
 * checking with `--require-protos`; later revisions require prototypes by
 * default and reject the flag. The command runs through `/bin/sh -c`, so probe
 * the checkout's own `configure.py --help` and pass the flag only when it exists.
 */
export const MELEE_REQUIRE_PROTOS_PROBE =
  "$(python3 configure.py --help 2>/dev/null | grep -q '[[:space:]]--require-protos' && printf %s --require-protos)";

export function baseConfigureCommand(game?: { kind?: string } | null): string {
  return !game?.kind || game.kind === "doldecomp-melee"
    ? `python3 configure.py ${MELEE_REQUIRE_PROTOS_PROBE}`
    : "python3 configure.py";
}

function shellQuote(value: string): string {
  if (/^[A-Za-z0-9_./:@%+=,-]+$/.test(value)) return value;
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

export function configureCommandWithWrapper(base: string, wrapperPath: string): string {
  if (!/\bconfigure\.py\b/.test(base)) return base;
  const pattern = /(^|\s)--wrapper(?:\s+|=)(?:"[^"]*"|'[^']*'|\S+)/;
  const replacement = `--wrapper ${shellQuote(wrapperPath)}`;
  if (pattern.test(base)) return base.replace(pattern, (_match, prefix: string) => `${prefix}${replacement}`);
  return `${base} ${replacement}`;
}
