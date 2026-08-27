import { randomUUID } from "node:crypto";
import { copyFile, mkdir, readFile, rename, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { buildRegressionReport } from "@server/core/validation/objdiff/report.js";

export interface MasterBreakage {
  unitName: string;
  itemName: string;
  kind: "function" | "section";
  fromPercent: number;
  toPercent: number;
  bytesDelta: number;
}

export interface MovedMatch {
  unitName: string;
  itemName: string;
  movedToUnit: string;
  matchedAs: string;
  fromPercent: number;
  toPercent: number;
}

export type MasterBaselineKind = "upstream_ci" | "pr_sync_artifact";

export interface MasterBreakageGateResult {
  status: "clean" | "breakage" | "skipped" | "error";
  baselineKind: MasterBaselineKind | null;
  baselineSha: string | null;
  baselineReportPath: string | null;
  oursReportPath: string | null;
  changesPath: string | null;
  breakages: MasterBreakage[];
  moved: MovedMatch[];
  reasons: string[];
}

export interface BreakageGateCommandRunner {
  (cmd: string[], opts: { cwd: string }): Promise<{ exitCode: number; stdout: string; stderr: string }>;
}

const defaultCommandRunner: BreakageGateCommandRunner = async (cmd, opts) => {
  const process = Bun.spawn(cmd, { cwd: opts.cwd, stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(process.stdout).text(),
    new Response(process.stderr).text(),
    process.exited,
  ]);
  return { exitCode, stdout, stderr };
};

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

function githubSlug(remote: string): string | null {
  const trimmed = remote.trim().replace(/\.git$/, "");
  const match = trimmed.match(/^(?:https?:\/\/github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)([^/]+\/[^/]+)$/);
  return match?.[1] ?? null;
}

function failureReason(prefix: string, result: { stdout: string; stderr: string }): string {
  const detail = (result.stderr.trim() || result.stdout.trim()).slice(-2_000);
  return detail ? `${prefix}: ${detail}` : prefix;
}

function emptyResult(status: MasterBreakageGateResult["status"], reasons: string[]): MasterBreakageGateResult {
  return {
    status,
    baselineKind: null,
    baselineSha: null,
    baselineReportPath: null,
    oursReportPath: null,
    changesPath: null,
    breakages: [],
    moved: [],
    reasons,
  };
}

export function evaluateMasterBreakages(changesRaw: unknown): MasterBreakage[] {
  return classifyMasterBreakages(changesRaw, {}).breakages;
}

export function classifyMasterBreakages(
  changesRaw: unknown,
  oursReportRaw: unknown,
): { breakages: MasterBreakage[]; moved: MovedMatch[] } {
  const report = buildRegressionReport(changesRaw, "Master breakage gate", 0);
  const candidates: MasterBreakage[] = report.brokenMatches.map((entry) => ({
    unitName: entry.unitName,
    itemName: entry.itemName,
    kind: entry.itemName.startsWith(".") ? "section" : "function",
    fromPercent: entry.fromPercent,
    toPercent: entry.toPercent,
    bytesDelta: entry.bytesDelta,
  }));
  const exactMatches = new Map<string, Set<string>>();
  const ours = typeof oursReportRaw === "object" && oursReportRaw !== null
    ? oursReportRaw as Record<string, unknown>
    : {};
  for (const unitRaw of Array.isArray(ours.units) ? ours.units : []) {
    if (typeof unitRaw !== "object" || unitRaw === null) continue;
    const unit = unitRaw as Record<string, unknown>;
    if (typeof unit.name !== "string" || !Array.isArray(unit.functions)) continue;
    for (const functionRaw of unit.functions) {
      if (typeof functionRaw !== "object" || functionRaw === null) continue;
      const fn = functionRaw as Record<string, unknown>;
      if (typeof fn.name !== "string" || typeof fn.fuzzy_match_percent !== "number" || fn.fuzzy_match_percent < 100) continue;
      const units = exactMatches.get(fn.name) ?? new Set<string>();
      units.add(unit.name);
      exactMatches.set(fn.name, units);
    }
  }

  const breakages: MasterBreakage[] = [];
  const moved: MovedMatch[] = [];
  for (const candidate of candidates) {
    if (candidate.kind === "function") {
      const names = [
        candidate.itemName,
        ...report.renames
          .filter((rename) => rename.unitName === candidate.unitName && rename.fromName === candidate.itemName)
          .map((rename) => rename.toName),
      ];
      let match: { name: string; unitName: string } | undefined;
      for (const name of names) {
        const unitName = [...(exactMatches.get(name) ?? [])].find((entry) => entry !== candidate.unitName);
        if (unitName) {
          match = { name, unitName };
          break;
        }
      }
      if (match) {
        moved.push({
          unitName: candidate.unitName,
          itemName: candidate.itemName,
          movedToUnit: match.unitName,
          matchedAs: match.name,
          fromPercent: candidate.fromPercent,
          toPercent: candidate.toPercent,
        });
        continue;
      }
    }
    breakages.push(candidate);
  }
  return { breakages, moved };
}

export async function fetchUpstreamMasterReport(input: {
  repoRoot: string;
  stateDir: string;
  anchorSha: string;
  version: string;
  runCommand?: BreakageGateCommandRunner;
}): Promise<{ path: string } | { path: null; reason: string }> {
  try {
    const runCommand = input.runCommand ?? defaultCommandRunner;
    const cacheDir = resolve(input.stateDir, "master_reports");
    const cachePath = resolve(cacheDir, `${input.anchorSha}-${input.version}-report.json`);
    if (await exists(cachePath)) return { path: cachePath };

    const remoteResult = await runCommand(["git", "-C", input.repoRoot, "remote", "get-url", "origin"], { cwd: input.repoRoot });
    if (remoteResult.exitCode !== 0) return { path: null, reason: failureReason("could not read origin remote", remoteResult) };
    const slug = githubSlug(remoteResult.stdout);
    if (!slug) return { path: null, reason: `origin is not a supported GitHub URL: ${remoteResult.stdout.trim()}` };

    const runsResult = await runCommand([
      "gh", "run", "list", "-R", slug, "--commit", input.anchorSha,
      "--json", "databaseId,conclusion", "--limit", "20",
    ], { cwd: input.repoRoot });
    if (runsResult.exitCode !== 0) return { path: null, reason: failureReason("could not list upstream workflow runs", runsResult) };
    const parsed = JSON.parse(runsResult.stdout) as Array<{ databaseId?: unknown; conclusion?: unknown }>;
    if (!Array.isArray(parsed) || parsed.length === 0) return { path: null, reason: `no workflow runs found for ${input.anchorSha}` };
    const runs = [...parsed].sort((a, b) => Number(b.conclusion === "success") - Number(a.conclusion === "success"));
    await mkdir(cacheDir, { recursive: true });
    const attempted: string[] = [];
    for (const run of runs) {
      if (typeof run.databaseId !== "number" && typeof run.databaseId !== "string") continue;
      const tmpDir = resolve(cacheDir, `.download-${input.anchorSha}-${run.databaseId}-${randomUUID()}`);
      await mkdir(tmpDir, { recursive: true });
      const result = await runCommand([
        "gh", "run", "download", String(run.databaseId), "-R", slug,
        "--name", `${input.version}_report`, "--dir", tmpDir,
      ], { cwd: input.repoRoot });
      if (result.exitCode !== 0) {
        attempted.push(failureReason(`run ${run.databaseId}`, result));
        continue;
      }
      const downloaded = resolve(tmpDir, "report.json");
      if (!(await exists(downloaded))) {
        attempted.push(`run ${run.databaseId}: artifact did not contain report.json`);
        continue;
      }
      try {
        await rename(downloaded, cachePath);
      } catch {
        await copyFile(downloaded, cachePath);
      }
      return { path: cachePath };
    }
    return { path: null, reason: `no ${input.version}_report artifact found${attempted.length > 0 ? ` (${attempted.join("; ")})` : ""}` };
  } catch (error) {
    return { path: null, reason: error instanceof Error ? error.message : String(error) };
  }
}

export async function runMasterBreakageGate(input: {
  repoRoot: string;
  stateDir: string;
  worktreeDir: string | null;
  oursReportPath: string;
  anchorSha: string | null;
  reportRelPath: string;
  changesOutPath: string;
  prSyncFallbackReportPath: string | null;
  runCommand?: BreakageGateCommandRunner;
  fetchMasterReport?: typeof fetchUpstreamMasterReport;
}): Promise<MasterBreakageGateResult> {
  try {
    const reasons: string[] = [];
    const version = input.reportRelPath.split("/")[1] || "GALE01";
    const worktreeBinary = input.worktreeDir ? resolve(input.worktreeDir, "build/tools/objdiff-cli") : null;
    const repoBinary = resolve(input.repoRoot, "build/tools/objdiff-cli");
    const binary = worktreeBinary && await exists(worktreeBinary) ? worktreeBinary : await exists(repoBinary) ? repoBinary : null;
    if (!binary) return emptyResult("skipped", ["objdiff-cli binary not found"]);
    if (!(await exists(input.oursReportPath))) return emptyResult("skipped", [`ours report not found: ${input.oursReportPath}`]);

    let baselineKind: MasterBaselineKind | null = null;
    let baselineSha: string | null = null;
    let baselineReportPath: string | null = null;
    let upstreamReason = "anchor SHA unavailable";
    if (input.anchorSha) {
      const fetched = await (input.fetchMasterReport ?? fetchUpstreamMasterReport)({
        repoRoot: input.repoRoot,
        stateDir: input.stateDir,
        anchorSha: input.anchorSha,
        version,
        runCommand: input.runCommand,
      });
      if (!("reason" in fetched)) {
        baselineKind = "upstream_ci";
        baselineSha = input.anchorSha;
        baselineReportPath = fetched.path;
      } else {
        upstreamReason = fetched.reason;
      }
    }
    if (!baselineReportPath && input.prSyncFallbackReportPath && await exists(input.prSyncFallbackReportPath)) {
      baselineKind = "pr_sync_artifact";
      baselineReportPath = input.prSyncFallbackReportPath;
      reasons.push(`master report unavailable (${upstreamReason}); gating against last pr_sync report artifact — only regressions since the last sync are detectable`);
    }
    if (!baselineReportPath) {
      reasons.push(`master report unavailable (${upstreamReason})`);
      if (!input.prSyncFallbackReportPath) reasons.push("no pr_sync fallback report available");
      else if (!(await exists(input.prSyncFallbackReportPath))) reasons.push(`pr_sync fallback report not found: ${input.prSyncFallbackReportPath}`);
      return emptyResult("skipped", reasons);
    }

    await mkdir(resolve(input.changesOutPath, ".."), { recursive: true });
    const result = await (input.runCommand ?? defaultCommandRunner)([
      binary, "report", "changes", "-o", input.changesOutPath, baselineReportPath, input.oursReportPath,
    ], { cwd: input.worktreeDir ?? input.repoRoot });
    const base = {
      baselineKind,
      baselineSha,
      baselineReportPath,
      oursReportPath: input.oursReportPath,
      changesPath: input.changesOutPath,
      breakages: [] as MasterBreakage[],
      moved: [] as MovedMatch[],
      reasons,
    };
    if (result.exitCode !== 0) return { ...base, status: "error", reasons: [...reasons, failureReason("objdiff-cli report changes failed", result)] };
    const changesRaw = JSON.parse(await readFile(input.changesOutPath, "utf8"));
    let oursReportRaw: unknown = {};
    try {
      oursReportRaw = JSON.parse(await readFile(input.oursReportPath, "utf8"));
    } catch (error) {
      reasons.push(`could not parse ours report: ${error instanceof Error ? error.message : String(error)}`);
    }
    const { breakages, moved } = classifyMasterBreakages(changesRaw, oursReportRaw);
    return { ...base, status: breakages.length > 0 ? "breakage" : "clean", breakages, moved };
  } catch (error) {
    return emptyResult("error", [error instanceof Error ? error.message : String(error)]);
  }
}
