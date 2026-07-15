import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import { runCommand } from "@server/infrastructure/shell";

export interface UnitMatchSnapshot {
  sourcePath: string;
  objectPath: string;
  functions: Array<{ name: string; fuzzyMatchPercent: number; size: number }>;
  sections: Array<{ name: string; fuzzyMatchPercent: number }>;
}

export interface RepairCheckResult {
  ok: boolean;
  buildOk: boolean;
  buildLog?: string;
  exactRegressions: Array<{ name: string; before: number; after: number }>;
  sectionRegressions: Array<{ name: string; before: number; after: number }>;
}

export type ObjdiffUnitPresence = "present" | "absent" | "unavailable";

type JsonRecord = Record<string, unknown>;
type RepairCommandRunner = typeof runCommand;

const ninjaLockTails = new Map<string, Promise<void>>();

export async function withNinjaLock<T>(repoRoot: string, fn: () => Promise<T>): Promise<T> {
  const key = resolve(repoRoot);
  const previous = ninjaLockTails.get(key) ?? Promise.resolve();
  const result = previous.then(fn);
  const tail = result.then(
    () => undefined,
    () => undefined,
  );
  ninjaLockTails.set(key, tail);
  try {
    return await result;
  } finally {
    if (ninjaLockTails.get(key) === tail) ninjaLockTails.delete(key);
  }
}

function asRecord(value: unknown): JsonRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : null;
}

function normalizeRepoPath(value: string): string {
  return value.replaceAll("\\", "/").replace(/^\.\//, "");
}

function finiteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function combinedLog(stdout: string, stderr: string): string {
  return [stdout.trimEnd(), stderr.trimEnd()].filter(Boolean).join("\n");
}

export function objectPathForSource(sourcePath: string): string {
  const normalized = normalizeRepoPath(sourcePath);
  const withoutExtension = normalized.replace(/\.[^/.]+$/, "");
  return `build/GALE01/${withoutExtension}.o`;
}

export async function buildObjectForSource(opts: {
  repoRoot: string;
  sourcePath: string;
  timeoutMs?: number;
  commandRunner?: RepairCommandRunner;
}): Promise<{ ok: boolean; log: string }> {
  try {
    const commandRunner = opts.commandRunner ?? runCommand;
    const result = await withNinjaLock(opts.repoRoot, () =>
      commandRunner(opts.repoRoot, ["ninja", objectPathForSource(opts.sourcePath)], {
        timeoutMs: opts.timeoutMs,
      }),
    );
    return {
      ok: result.exitCode === 0,
      log: combinedLog(result.stdout, result.stderr),
    };
  } catch (error) {
    return {
      ok: false,
      log: error instanceof Error ? error.stack ?? error.message : String(error),
    };
  }
}

function sourcePathOfUnit(unit: JsonRecord): string {
  const metadata = asRecord(unit.metadata);
  return typeof metadata?.source_path === "string" ? normalizeRepoPath(metadata.source_path) : "";
}

function pathOfUnit(unit: JsonRecord, key: "base_path" | "target_path"): string {
  const value = unit[key];
  return typeof value === "string" ? normalizeRepoPath(value) : "";
}

function selectUnit(config: JsonRecord, sourcePath: string): JsonRecord | null {
  if (!Array.isArray(config.units)) return null;
  const normalizedSource = normalizeRepoPath(sourcePath);
  const objectPath = objectPathForSource(normalizedSource);
  for (const value of config.units) {
    const unit = asRecord(value);
    if (!unit) continue;
    if (sourcePathOfUnit(unit) === normalizedSource || pathOfUnit(unit, "base_path") === objectPath) return unit;
  }
  return null;
}

export async function objdiffUnitPresence(opts: {
  repoRoot: string;
  sourcePath: string;
}): Promise<ObjdiffUnitPresence> {
  try {
    const config = asRecord(JSON.parse(await readFile(resolve(opts.repoRoot, "objdiff.json"), "utf8")));
    if (!config || !Array.isArray(config.units)) return "unavailable";
    return selectUnit(config, opts.sourcePath) ? "present" : "absent";
  } catch {
    return "unavailable";
  }
}

function absoluteObjectPath(repoRoot: string, value: unknown): unknown {
  if (typeof value !== "string" || !value) return value;
  return isAbsolute(value) ? value : resolve(repoRoot, value);
}

function scopedObjdiffConfig(config: JsonRecord, unit: JsonRecord, repoRoot: string): JsonRecord {
  const { custom_make: _customMake, ...rest } = config;
  return {
    ...rest,
    build_target: false,
    watch_patterns: [],
    units: [
      {
        ...unit,
        target_path: absoluteObjectPath(repoRoot, unit.target_path),
        base_path: absoluteObjectPath(repoRoot, unit.base_path),
      },
    ],
  };
}

async function objdiffReportConfigArgs(repoRoot: string): Promise<string[]> {
  try {
    const ninja = await readFile(resolve(repoRoot, "build.ninja"), "utf8");
    const line = ninja.match(/^objdiff_report_args\s*=\s*(.+)$/m);
    const tokens = line ? line[1].trim().split(/\s+/).filter(Boolean) : [];
    const args: string[] = [];
    for (let index = 0; index + 1 < tokens.length; index += 1) {
      if (tokens[index] === "--config" || tokens[index] === "-c") {
        args.push("--config", tokens[index + 1]);
        index += 1;
      }
    }
    return args;
  } catch {
    return [];
  }
}

function rowsFromReport(unit: JsonRecord): Pick<UnitMatchSnapshot, "functions" | "sections"> {
  const functions: UnitMatchSnapshot["functions"] = [];
  const sections: UnitMatchSnapshot["sections"] = [];

  for (const value of Array.isArray(unit.functions) ? unit.functions : []) {
    const row = asRecord(value);
    const score = finiteNumber(row?.fuzzy_match_percent);
    const size = finiteNumber(row?.size);
    if (!row || typeof row.name !== "string" || score === null || size === null) continue;
    functions.push({ name: row.name, fuzzyMatchPercent: score, size });
  }

  for (const value of Array.isArray(unit.sections) ? unit.sections : []) {
    const row = asRecord(value);
    const score = finiteNumber(row?.fuzzy_match_percent);
    if (!row || typeof row.name !== "string" || score === null) continue;
    sections.push({ name: row.name, fuzzyMatchPercent: score });
  }

  return { functions, sections };
}

export async function captureUnitMatchSnapshot(opts: {
  repoRoot: string;
  sourcePath: string;
  timeoutMs?: number;
}): Promise<UnitMatchSnapshot | null> {
  const build = await buildObjectForSource(opts);
  if (!build.ok) return null;

  let tempRoot: string | null = null;
  try {
    const configPath = resolve(opts.repoRoot, "objdiff.json");
    const config = asRecord(JSON.parse(await readFile(configPath, "utf8")));
    if (!config) return null;
    const unit = selectUnit(config, opts.sourcePath);
    if (!unit) return null;

    tempRoot = await mkdtemp(join(tmpdir(), "qa-repair-objdiff-"));
    const reportPath = resolve(tempRoot, "report.json");
    await writeFile(resolve(tempRoot, "objdiff.json"), `${JSON.stringify(scopedObjdiffConfig(config, unit, opts.repoRoot), null, 2)}\n`);

    const localCli = resolve(opts.repoRoot, "build/tools/objdiff-cli");
    const cli = existsSync(localCli) ? localCli : "objdiff-cli";
    const command = [
      cli,
      "report",
      "generate",
      "--project",
      tempRoot,
      "--output",
      reportPath,
      "--format",
      "json",
      ...(await objdiffReportConfigArgs(opts.repoRoot)),
    ];
    const result = await runCommand(opts.repoRoot, command, { timeoutMs: opts.timeoutMs });
    if (result.exitCode !== 0 || !existsSync(reportPath)) return null;

    const report = asRecord(JSON.parse(await readFile(reportPath, "utf8")));
    const reportUnit = report && Array.isArray(report.units) ? asRecord(report.units[0]) : null;
    if (!reportUnit) return null;
    return {
      sourcePath: normalizeRepoPath(opts.sourcePath),
      objectPath: objectPathForSource(opts.sourcePath),
      ...rowsFromReport(reportUnit),
    };
  } catch {
    return null;
  } finally {
    if (tempRoot) await rm(tempRoot, { recursive: true, force: true });
  }
}

function regressionRows(
  before: Array<{ name: string; fuzzyMatchPercent: number }>,
  after: Array<{ name: string; fuzzyMatchPercent: number }>,
): Array<{ name: string; before: number; after: number }> {
  const afterByName = new Map(after.map((row) => [row.name, row.fuzzyMatchPercent]));
  const regressions: Array<{ name: string; before: number; after: number }> = [];
  for (const row of before) {
    if (row.fuzzyMatchPercent !== 100) continue;
    const afterScore = afterByName.get(row.name) ?? 0;
    if (afterScore < 100) regressions.push({ name: row.name, before: row.fuzzyMatchPercent, after: afterScore });
  }
  return regressions;
}

export function compareUnitMatchSnapshots(before: UnitMatchSnapshot, after: UnitMatchSnapshot): RepairCheckResult {
  const exactRegressions = regressionRows(before.functions, after.functions);
  const sectionRegressions = regressionRows(before.sections, after.sections);
  return {
    ok: exactRegressions.length === 0 && sectionRegressions.length === 0,
    buildOk: true,
    exactRegressions,
    sectionRegressions,
  };
}
