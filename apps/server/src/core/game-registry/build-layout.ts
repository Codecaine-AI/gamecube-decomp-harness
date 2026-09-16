export interface GameBuildValidation {
  reportPath?: string;
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
