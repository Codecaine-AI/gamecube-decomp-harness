import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { StateStore } from "@server/core/orchestrator-state";
import {
  checkpointUnusedChecks,
  partitionUnusedChecksByContent,
  type BoundUnusedCheck,
} from "@server/core/validation/edit-scope/unused-evidence.js";

/**
 * UNUSED evidence for the publication gate (`edit_scope.py pr --unused-checks`).
 *
 * Collection rule: a certificate counts for a PR range `base..head` when the
 * worker checkpoint that carried it was integrated (`integration_outcomes`
 * status `applied`) and its integration commit (`metadata.integrated_rev`) is
 * in `git rev-list base..head`. Reachability, not the run, decides: the harness
 * branch carries integrations from earlier runs of the same game, and commits
 * from other checkouts are never in the range. `runId` narrows to one run
 * (the `pr-scope-check --run` operator path). Certificates come from the
 * checkpoint metadata (`unused_checks`), falling back to the integration
 * outcome's metadata; for one `unit::function` the latest integration wins.
 * Every certificate is then re-validated by unit content at `head`
 * (`git show head:path`): stale ones are dropped and reported, never passed.
 */
export interface PrUnusedCheckSource {
  worker_checkpoint_id: string;
  run_id: string;
  integrated_rev: string;
}

export interface PrUnusedChecks {
  base: string;
  head: string;
  checks: BoundUnusedCheck[];
  stale: Array<{ check: BoundUnusedCheck; reason: string }>;
  sources: PrUnusedCheckSource[];
}

export type PrUnusedGitRunner = (repoRoot: string, args: string[]) => Promise<{ exitCode: number | null; stdout: string; stderr: string }>;

async function defaultGit(repoRoot: string, args: string[]): Promise<{ exitCode: number | null; stdout: string; stderr: string }> {
  const proc = Bun.spawn(["git", ...args], { cwd: repoRoot, stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, exitCode] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
  return { exitCode, stdout, stderr };
}

function parseObject(value: unknown): Record<string, unknown> {
  if (typeof value !== "string") return {};
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

export async function collectPrUnusedChecks(params: {
  store: StateStore;
  repoRoot: string;
  base: string;
  head: string;
  runId?: string | null;
  git?: PrUnusedGitRunner;
}): Promise<PrUnusedChecks> {
  const git = params.git ?? defaultGit;
  const range = await git(params.repoRoot, ["rev-list", `${params.base}..${params.head}`]);
  if (range.exitCode !== 0) throw new Error(`git rev-list ${params.base}..${params.head} failed: ${(range.stderr || range.stdout).trim().slice(-400)}`);
  const onBranch = new Set(range.stdout.split("\n").map((line) => line.trim()).filter(Boolean));
  const rows = params.store.db.query(
    `SELECT io.worker_checkpoint_id AS checkpoint_id, io.run_id AS run_id, io.metadata_json AS outcome_metadata, wc.metadata_json AS checkpoint_metadata
     FROM integration_outcomes io LEFT JOIN worker_checkpoints wc ON wc.id = io.worker_checkpoint_id
     WHERE io.status = 'applied'${params.runId ? " AND io.run_id = ?" : ""}
     ORDER BY io.created_at, io.rowid`,
  ).all(...(params.runId ? [params.runId] : [])) as Array<{ checkpoint_id: string; run_id: string; outcome_metadata: string | null; checkpoint_metadata: string | null }>;
  const latest = new Map<string, BoundUnusedCheck>();
  const sources: PrUnusedCheckSource[] = [];
  for (const row of rows) {
    const outcome = parseObject(row.outcome_metadata);
    const integratedRev = typeof outcome.integrated_rev === "string" ? outcome.integrated_rev.trim() : "";
    if (!integratedRev || !onBranch.has(integratedRev)) continue;
    const checks = checkpointUnusedChecks(parseObject(row.checkpoint_metadata)) ?? checkpointUnusedChecks(outcome);
    if (!checks || checks.length === 0) continue;
    sources.push({ worker_checkpoint_id: row.checkpoint_id, run_id: row.run_id, integrated_rev: integratedRev });
    for (const check of checks) latest.set(`${check.unit}\u0000${check.function}`, check);
  }
  const readText = async (path: string): Promise<string | null> => {
    const shown = await git(params.repoRoot, ["show", `${params.head}:${path}`]);
    return shown.exitCode === 0 ? shown.stdout : null;
  };
  const { fresh, stale } = await partitionUnusedChecksByContent([...latest.values()], readText);
  return { base: params.base, head: params.head, checks: fresh, stale, sources };
}

/** Writes the `--unused-checks` file (`{"unused_checks": [...]}` plus provenance); returns its absolute path. */
export async function writePrUnusedChecks(path: string, collected: PrUnusedChecks): Promise<string> {
  const absolute = resolve(path);
  await mkdir(dirname(absolute), { recursive: true });
  await writeFile(absolute, `${JSON.stringify({
    base: collected.base,
    head: collected.head,
    unused_checks: collected.checks,
    stale: collected.stale.map((entry) => ({ unit: entry.check.unit, function: entry.check.function, reason: entry.reason })),
    sources: collected.sources,
  }, null, 2)}\n`);
  return absolute;
}

/** Collects, re-validates at `head` and writes the file; `stale` are warning lines for the scope check record. */
export async function preparePrUnusedChecks(params: Parameters<typeof collectPrUnusedChecks>[0] & { outputPath: string }): Promise<{
  path: string;
  stale: string[];
  count: number;
}> {
  const collected = await collectPrUnusedChecks(params);
  const path = await writePrUnusedChecks(params.outputPath, collected);
  return { path, stale: collected.stale.map((entry) => entry.reason), count: collected.checks.length };
}
