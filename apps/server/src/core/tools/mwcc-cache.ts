import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const DEFAULT_MWCC_CACHE_DIR = "/tmp/mwcc-objcache-shared";
export const MWCC_CACHE_MODES = ["off", "verify", "on"] as const;

export type MwccCacheMode = (typeof MWCC_CACHE_MODES)[number];

export interface MwccCacheSettings {
  cacheDir: string;
  mode: MwccCacheMode;
}

interface MwccCacheInstallOptions {
  installerPath?: string;
  pythonCommand?: string;
  settings?: MwccCacheSettings;
  shimPath?: string;
}

interface MwccCacheWrapperOptions extends MwccCacheSettings {
  pythonCommand?: string;
  realWiboPath: string;
  shimPath: string;
}

const INSTALL_MARKER = "# Installed by install_mwcc_cache.py (MWCC object cache).";

function packageRoot(): string {
  return fileURLToPath(new URL("../../../../..", import.meta.url));
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

export function selectMwccCacheMode(value: string | undefined): MwccCacheMode {
  const selected = value?.trim() || "off";
  if ((MWCC_CACHE_MODES as readonly string[]).includes(selected)) return selected as MwccCacheMode;
  throw new Error(`Invalid ORCH_MWCC_CACHE ${JSON.stringify(value)}; expected one of ${MWCC_CACHE_MODES.join(", ")}`);
}

export function resolveMwccCacheSettings(env: Record<string, string | undefined> = process.env): MwccCacheSettings {
  return {
    cacheDir: env.MWCC_CACHE_DIR?.trim() || DEFAULT_MWCC_CACHE_DIR,
    mode: selectMwccCacheMode(env.ORCH_MWCC_CACHE),
  };
}

export function mwccCacheWrapperScript(options: MwccCacheWrapperOptions): string {
  if (options.mode === "off") throw new Error("Cannot generate an MWCC cache wrapper when ORCH_MWCC_CACHE is off");
  const verifyLine = options.mode === "verify" ? "export MWCC_CACHE_VERIFY='1'" : "unset MWCC_CACHE_VERIFY";
  return [
    "#!/bin/sh",
    INSTALL_MARKER,
    `export MWCC_CACHE_DIR=${shellQuote(options.cacheDir)}`,
    `export MWCC_CACHE_REAL_WIBO=${shellQuote(options.realWiboPath)}`,
    verifyLine,
    `exec ${shellQuote(options.pythonCommand ?? "python3")} ${shellQuote(options.shimPath)} "$@"`,
    "",
  ].join("\n");
}

function isInstalledCacheShim(path: string): boolean {
  if (!existsSync(path)) return false;
  try {
    const [, marker] = readFileSync(path, "utf8").split(/\r?\n/, 2);
    return marker === INSTALL_MARKER;
  } catch {
    return false;
  }
}

/**
 * Install the cache through the canonical Python installer, then replace its
 * copied Python payload with the small environment-pinning wrapper Ninja uses.
 */
export function installMwccCacheShim(worktreeDir: string, options: MwccCacheInstallOptions = {}): boolean {
  const settings = options.settings ?? resolveMwccCacheSettings();
  if (settings.mode === "off") return false;

  const wiboPath = resolve(worktreeDir, "build/tools/wibo");
  const realWiboPath = resolve(worktreeDir, "build/tools/wibo-real");
  if (existsSync(realWiboPath)) {
    if (!existsSync(wiboPath) || isInstalledCacheShim(wiboPath)) {
      rmSync(wiboPath, { force: true, recursive: true });
      renameSync(realWiboPath, wiboPath);
    } else {
      rmSync(realWiboPath, { force: true, recursive: true });
    }
  }
  if (!existsSync(wiboPath)) throw new Error(`Cannot install MWCC cache: seeded wibo is missing at ${wiboPath}`);

  const toolsDir = resolve(packageRoot(), "toolpacks/gamecube-decomp/_impl/gamecube/tools");
  const installerPath = options.installerPath ?? resolve(toolsDir, "install_mwcc_cache.py");
  const shimPath = options.shimPath ?? resolve(toolsDir, "mwcc_objcache.py");
  const pythonCommand = options.pythonCommand ?? "python3";
  const installed = spawnSync(pythonCommand, [installerPath, worktreeDir], {
    cwd: worktreeDir,
    encoding: "utf8",
    maxBuffer: 1024 * 1024,
  });
  if (installed.error || installed.status !== 0) {
    const detail = installed.error?.message ?? installed.stderr?.trim() ?? installed.stdout?.trim() ?? `exit ${installed.status}`;
    throw new Error(`MWCC cache installer failed for ${worktreeDir}: ${detail}`);
  }

  writeFileSync(
    wiboPath,
    mwccCacheWrapperScript({
      ...settings,
      pythonCommand,
      realWiboPath,
      shimPath,
    }),
  );
  chmodSync(wiboPath, 0o755);
  return true;
}
