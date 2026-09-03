/**
 * The build/config directory segment a game's objdiff report and splits/symbols
 * config live under (e.g. "GALE01" for Melee, "GMSP01" for Super Mario Sunshine PAL).
 *
 * `game.json`'s `validation.reportPath` (resolved by `game-registry/resolver.ts`
 * into `ResolvedGame.validation.reportPath`) is the source of truth for this —
 * derive it from there instead of hardcoding a literal. Defaults to Melee's id
 * so existing call sites that don't thread a resolved game through yet keep
 * their current behavior unchanged.
 */
export const DEFAULT_REPORT_BUILD_ID = "GALE01";

export function reportBuildIdFromPath(reportPath: string | null | undefined): string {
  const match = reportPath ? /^build\/([^/]+)\//.exec(reportPath) : null;
  return match ? match[1] : DEFAULT_REPORT_BUILD_ID;
}
