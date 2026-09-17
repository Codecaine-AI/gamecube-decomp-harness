/** Upstream CI formatting policy; unset when the game's CI does not enforce clang-format. */
export interface GameFormattingConfig {
  /** Exact clang-format version upstream CI pins (also baked into the game's sandbox image). */
  clangFormatVersion: string;
}

/** Upstream CI map-symbol validation; unset when the game has no linker-map validator. */
export interface GameSymbolCheckConfig {
  /** Checkout-relative CI driver, e.g. `tools/check-changed-symbol-order.py`; the sandbox runs the checkout's own copy. */
  script: string;
  /** Checkout-relative linker map the validator reads, e.g. `orig/GMSJ01/files/mario.MAP`; baked into the sandbox image. */
  map: string;
}

export interface GameBuildValidation {
  reportPath?: string;
  formatting?: GameFormattingConfig | null;
  symbolCheck?: GameSymbolCheckConfig | null;
}

export interface GameBuildLayout {
  version: string;
  buildDir: string;
  configDir: string;
  objectPathForSource(sourcePath: string): string;
  symbolsTxtPath: string;
  splitsTxtPath: string;
  objRoot: string;
  asmRoot: string;
}

const DEFAULT_VERSION = "GALE01";

function reportVersion(reportPath: string | undefined): string {
  if (!reportPath) return DEFAULT_VERSION;
  const parts = reportPath.replaceAll("\\", "/").split("/").filter(Boolean);
  const reportIndex = parts.lastIndexOf("report.json");
  return reportIndex > 0 ? parts[reportIndex - 1]! : DEFAULT_VERSION;
}

function normalizeRepoPath(value: string): string {
  return value.replaceAll("\\", "/").replace(/^\.\//, "");
}

export function gameBuildLayout(validation?: GameBuildValidation | null): GameBuildLayout {
  const version = reportVersion(validation?.reportPath);
  const buildDir = `build/${version}`;
  const configDir = `config/${version}`;
  return {
    version,
    buildDir,
    configDir,
    objectPathForSource(sourcePath: string): string {
      const normalized = normalizeRepoPath(sourcePath);
      const withoutExtension = normalized.replace(/\.[^/.]+$/, "");
      return `${buildDir}/${withoutExtension}.o`;
    },
    symbolsTxtPath: `${configDir}/symbols.txt`,
    splitsTxtPath: `${configDir}/splits.txt`,
    objRoot: `${buildDir}/obj`,
    asmRoot: `${buildDir}/asm`,
  };
}
