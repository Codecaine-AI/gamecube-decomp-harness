export function baseConfigureCommand(game?: { kind?: string } | null): string {
  return !game?.kind || game.kind === "doldecomp-melee"
    ? "python3 configure.py --require-protos"
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
