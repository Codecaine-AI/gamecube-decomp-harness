import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { GameOrderingConfig, OrderingMode } from "@server/core/game-registry/resolver.js";
import {
  ORDERING_MODE_ENV,
  ORDERING_POLICY_ENV,
  gameOrdering,
  orderingActive,
  orderingEnforced,
  orderingPolicyJson,
  orderingToolEnv,
  type GameOrderingSource,
} from "@server/core/tools/ordering.js";
import { SANDBOX_TOOLPACK_ROOT } from "@server/core/tools/wrappers/workspace-tool-exec.js";
import { runCommand, type CommandResult, type WorkspaceExec } from "@server/infrastructure/shell";

/**
 * Runner side of the order-and-scope fence (plan v3 sections 3-5, contract
 * "edit_scope.py"). The checker
 * `toolpacks/gamecube-decomp/_impl/gamecube/tools/edit_scope.py` classifies a
 * patch per class against revision-bound readiness:
 *
 * - `check --worktree`: the worker gate, cumulative from the claim base.
 * - `check --overlay-dir`: the integration gate, the patch over HEAD.
 * - `pr`: the publication gate over `base...head`.
 *
 * Every failure (exit code, malformed JSON) becomes `error`, never a throw.
 */
export const EDIT_SCOPE_TOOLPACK_PATH = "_impl/gamecube/tools/edit_scope.py";
export const SANDBOX_EDIT_SCOPE_SCRIPT = `${SANDBOX_TOOLPACK_ROOT}/gamecube-decomp/${EDIT_SCOPE_TOOLPACK_PATH}`;
export const EDIT_SCOPE_TIMEOUT_MS = 120_000;

// The ordering mode, env vars and mode predicates live in `core/tools/ordering.ts`; re-exported for the fence's callers.
export { ORDERING_MODE_ENV, ORDERING_POLICY_ENV, orderingActive, orderingEnforced };
export type { OrderingMode };

/** The game's `ordering` block (`GameDescriptor.ordering`, resolved by `gameOrdering`). */
export type EditScopeOrderingPolicy = GameOrderingConfig;

export const EDIT_SCOPE_HUNK_VERDICTS = [
  "own_class",
  "ready",
  "foreign_header",
  "local_helper",
  "not_ready",
  "unresolved",
  "order_gated",
  "dead_unused",
  "unused_unverified",
  "forward_decl",
  "moved",
] as const;
export type EditScopeHunkVerdict = typeof EDIT_SCOPE_HUNK_VERDICTS[number];

/** Hunk verdicts that reject the patch. */
export const EDIT_SCOPE_REJECT_VERDICTS: readonly EditScopeHunkVerdict[] = ["not_ready", "unresolved", "order_gated", "dead_unused", "unused_unverified"];

export interface EditScopeHunk {
  file: string;
  line: number | null;
  class: string | null;
  verdict: EditScopeHunkVerdict;
  reason: string;
  /** Owner unit of `class` when the checker reports it. */
  owner_unit?: string | null;
}

export interface EditScopeReport {
  identity: { base_rev: string | null; patch_sha256: string | null; readiness: Record<string, unknown> | null; head_rev?: string | null };
  verdict: "pass" | "reject";
  hunks: EditScopeHunk[];
  warnings: string[];
  limits: { foreign_headers: number | null; foreign_header_lines: number | null };
  /** `pr` only. */
  pr_size?: { units: number | null; files: number | null; changed_lines: number | null; warnings: string[] };
  /** `pr` only: "split suggested" warnings, never refusals. */
  same_pr_prerequisites?: unknown[];
}

/** One edit-scope gate run, as recorded on a validation, checkpoint or job. */
export interface EditScopeResult {
  mode: OrderingMode;
  report: EditScopeReport | null;
  /** Tool failure, timeout or malformed output; enforce treats it as a failure. */
  error: string | null;
  durationMs: number;
  artifactPath?: string | null;
}

export type EditScopeRunner = (args: string[], where: "sandbox" | "host") => Promise<CommandResult>;

export const EDIT_SCOPE_INSTRUCTION =
  "The order-and-scope fence rejected this attempt: it constructs, declares or fills in a class whose own unit is not decompiled yet (or a registry such as MarNameRefGen before its classes exist). Remove those hunks: edit your target's file and only the declarations your target needs in headers of decompiled units (forward declarations are fine), leave not-ready classes and their headers alone, and reconstruct an UNUSED body only with inline evidence. Partial work on the ready parts of the target is fine.";

/** `--policy-json` for the checker: the gated paths and soft limits, never the mode. */
export function editScopePolicyJson(policy: EditScopeOrderingPolicy): string {
  return orderingPolicyJson(policy);
}

/** Tool env for an active policy only (`orderingToolEnv`). */
export function orderingEnv(policy: EditScopeOrderingPolicy | null | undefined): Record<string, string> {
  return orderingToolEnv(policy);
}

function failedResult(error: unknown): CommandResult {
  return { exitCode: 127, stdout: "", stderr: error instanceof Error ? error.message : String(error) };
}

/** Worker gate runner: the toolpack copy synced into the worker sandbox, run against the sandbox worktree. */
export function workspaceEditScopeRunner(
  exec: WorkspaceExec,
  policy: EditScopeOrderingPolicy,
  options: { timeoutMs?: number; hostScript?: string; hostCwd?: string } = {},
): EditScopeRunner {
  const timeoutMs = options.timeoutMs ?? EDIT_SCOPE_TIMEOUT_MS;
  const env = orderingEnv(policy);
  return async (args, where) => {
    try {
      if (where === "host" && options.hostScript && options.hostCwd) {
        return await runCommand(options.hostCwd, ["python3", options.hostScript, ...args], { timeoutMs, env });
      }
      return await exec.exec(["python3", SANDBOX_EDIT_SCOPE_SCRIPT, ...args], { timeoutMs, env });
    } catch (error) {
      return failedResult(error);
    }
  };
}

/** Integration / publication / CLI runner: every call on the host. */
export function hostEditScopeRunner(
  scriptPath: string,
  cwd: string,
  policy: EditScopeOrderingPolicy,
  options: { timeoutMs?: number } = {},
): EditScopeRunner {
  const timeoutMs = options.timeoutMs ?? EDIT_SCOPE_TIMEOUT_MS;
  const env = orderingEnv(policy);
  return async (args) => {
    try {
      return await runCommand(cwd, ["python3", scriptPath, ...args], { timeoutMs, env });
    } catch (error) {
      return failedResult(error);
    }
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function isHunkVerdict(value: unknown): value is EditScopeHunkVerdict {
  return typeof value === "string" && (EDIT_SCOPE_HUNK_VERDICTS as readonly string[]).includes(value);
}

/**
 * Reads `edit_scope.py check|pr --json` output. Null for anything malformed:
 * an unknown verdict, a hunk without file and known verdict, or wrong types.
 * A `pass` verdict with a rejecting hunk is malformed too (fail closed).
 */
export function parseEditScopeReport(json: unknown): EditScopeReport | null {
  if (!isRecord(json)) return null;
  if (json.verdict !== "pass" && json.verdict !== "reject") return null;
  if (!Array.isArray(json.hunks)) return null;
  const hunks: EditScopeHunk[] = [];
  for (const row of json.hunks) {
    if (!isRecord(row) || typeof row.file !== "string" || !isHunkVerdict(row.verdict)) return null;
    if (row.line !== undefined && row.line !== null && typeof row.line !== "number") return null;
    if (row.class !== undefined && row.class !== null && typeof row.class !== "string") return null;
    hunks.push({
      file: row.file,
      line: numberOrNull(row.line),
      class: stringOrNull(row.class),
      verdict: row.verdict,
      reason: typeof row.reason === "string" ? row.reason : "",
      ...(row.owner_unit !== undefined ? { owner_unit: stringOrNull(row.owner_unit) } : {}),
    });
  }
  if (json.verdict === "pass" && hunks.some((hunk) => EDIT_SCOPE_REJECT_VERDICTS.includes(hunk.verdict))) return null;
  if (json.warnings !== undefined && !Array.isArray(json.warnings)) return null;
  const identity = isRecord(json.identity) ? json.identity : {};
  const limits = isRecord(json.limits) ? json.limits : {};
  const prSize = isRecord(json.pr_size) ? json.pr_size : null;
  return {
    identity: {
      base_rev: stringOrNull(identity.base_rev),
      patch_sha256: stringOrNull(identity.patch_sha256),
      readiness: isRecord(identity.readiness) ? identity.readiness : null,
      ...(identity.head_rev !== undefined ? { head_rev: stringOrNull(identity.head_rev) } : {}),
    },
    verdict: json.verdict,
    hunks,
    warnings: (Array.isArray(json.warnings) ? json.warnings : []).map(String),
    limits: { foreign_headers: numberOrNull(limits.foreign_headers), foreign_header_lines: numberOrNull(limits.foreign_header_lines) },
    ...(prSize ? {
      pr_size: {
        units: numberOrNull(prSize.units),
        files: numberOrNull(prSize.files),
        changed_lines: numberOrNull(prSize.changed_lines),
        warnings: (Array.isArray(prSize.warnings) ? prSize.warnings : []).map(String),
      },
    } : {}),
    ...(Array.isArray(json.same_pr_prerequisites) ? { same_pr_prerequisites: json.same_pr_prerequisites } : {}),
  };
}

/** The rejecting hunks of a report. */
export function editScopeRejectedHunks(report: EditScopeReport | null | undefined): EditScopeHunk[] {
  return (report?.hunks ?? []).filter((hunk) => EDIT_SCOPE_REJECT_VERDICTS.includes(hunk.verdict));
}

function hunkLabel(hunk: EditScopeHunk): string {
  const where = `${hunk.file}${hunk.line != null ? `:${hunk.line}` : ""}`;
  const owner = hunk.owner_unit ? `, owner ${hunk.owner_unit}` : "";
  const cls = hunk.class ? `${hunk.class} (${hunk.verdict}${owner})` : hunk.verdict;
  return `${cls} at ${where}${hunk.reason ? `: ${hunk.reason}` : ""}`;
}

/**
 * Why a result is not a pass, or null when it passes. Unavailable or
 * malformed checker output is a problem (fail closed); callers decide whether
 * the mode turns it into a rejection.
 */
export function editScopeProblem(result: Pick<EditScopeResult, "report" | "error">): string | null {
  if (result.error || !result.report) return `edit_scope: the scope check could not run (${result.error ?? "no report"})`;
  if (result.report.verdict === "pass") return null;
  const hunks = editScopeRejectedHunks(result.report);
  return `edit_scope: ${hunks.length > 0 ? hunks.slice(0, 6).map(hunkLabel).join("; ") : "rejected"}${hunks.length > 6 ? `; +${hunks.length - 6} more` : ""}`;
}

/** Enforce only: the rejection reason (problem + instruction), else null. */
export function editScopeRejectionReason(result: EditScopeResult): string | null {
  if (!orderingEnforced(result.mode)) return null;
  const problem = editScopeProblem(result);
  return problem ? `${problem}. ${EDIT_SCOPE_INSTRUCTION}` : null;
}

/**
 * Runs one `edit_scope.py` subcommand and parses its JSON. `args` are the
 * subcommand arguments without `--json` / `--policy-json` (added here).
 * Writes the raw output to `artifactPath` when given. Never throws.
 */
export async function runEditScope(params: {
  runner: EditScopeRunner;
  where: "sandbox" | "host";
  args: string[];
  policy: EditScopeOrderingPolicy;
  artifactPath?: string | null;
}): Promise<EditScopeResult> {
  const started = Date.now();
  const done = async (report: EditScopeReport | null, error: string | null, raw?: unknown): Promise<EditScopeResult> => {
    let artifactPath: string | null = null;
    if (params.artifactPath) {
      try {
        await mkdir(dirname(params.artifactPath), { recursive: true });
        await writeFile(params.artifactPath, `${JSON.stringify({ mode: params.policy.mode, args: params.args, error, report, raw: raw ?? null }, null, 2)}\n`);
        artifactPath = resolve(params.artifactPath);
      } catch {
        artifactPath = null;
      }
    }
    return { mode: params.policy.mode, report, error, durationMs: Date.now() - started, ...(params.artifactPath ? { artifactPath } : {}) };
  };
  let result: CommandResult;
  try {
    result = await params.runner([...params.args, "--policy-json", editScopePolicyJson(params.policy), "--json"], params.where);
  } catch (error) {
    return done(null, error instanceof Error ? error.message : String(error));
  }
  if (result.exitCode !== 0) {
    const stderr = result.stderr.trim();
    return done(null, `edit_scope.py ${params.args[0] ?? ""} exited ${result.exitCode}${stderr ? `: ${stderr.slice(-400)}` : ""}`);
  }
  let raw: unknown;
  try {
    raw = JSON.parse(result.stdout);
  } catch {
    return done(null, `edit_scope.py ${params.args[0] ?? ""} did not return JSON`);
  }
  const report = parseEditScopeReport(raw);
  return report ? done(report, null, raw) : done(null, `edit_scope.py ${params.args[0] ?? ""} returned a malformed report`, raw);
}

/** An active ordering policy (shadow/enforce) or null: the fence never runs for `off` or no policy. */
export function activeEditScopePolicy(ordering: GameOrderingConfig | null | undefined): EditScopeOrderingPolicy | null {
  return ordering && orderingActive(ordering.mode) ? ordering : null;
}

/**
 * The active ordering policy for a game. A resolved game or run metadata
 * (game id + descriptor path) resolves through `gameOrdering`; a bare
 * `{ ordering }` record (an already-resolved block) is read as is. Absent,
 * `off` or unresolvable → null.
 */
export function editScopePolicyFromGame(game: GameOrderingSource | { ordering?: GameOrderingConfig | null } | null | undefined): EditScopeOrderingPolicy | null {
  if (!game) return null;
  const bare = !("matching" in game) && !("gameId" in game) && !("descriptorPath" in game) && "ordering" in game;
  return activeEditScopePolicy(bare ? (game as { ordering?: GameOrderingConfig | null }).ordering : gameOrdering(game as GameOrderingSource));
}

/** `toolpacks/<pack>/<EDIT_SCOPE_TOOLPACK_PATH>` under an orchestrator checkout (`packageRoot()`). */
export function hostEditScopeScriptPath(orchestratorRoot: string): string {
  return resolve(orchestratorRoot, "toolpacks/gamecube-decomp", EDIT_SCOPE_TOOLPACK_PATH);
}

/**
 * The publication gate (`edit_scope.py pr`) over `base...head`, bound to
 * `head`: callers pass an exact commit SHA, and a report whose
 * `identity.head_rev` names a different commit is an error (fail closed).
 */
export async function runPrScopeCheck(params: {
  runner: EditScopeRunner;
  repo: string;
  base: string;
  head: string;
  policy: EditScopeOrderingPolicy;
  unusedChecksPath?: string | null;
  artifactPath?: string | null;
}): Promise<EditScopeResult> {
  const args = ["pr", "--repo", params.repo, "--base", params.base, "--head", params.head];
  if (params.unusedChecksPath) args.push("--unused-checks", params.unusedChecksPath);
  const result = await runEditScope({ runner: params.runner, where: "host", args, policy: params.policy, artifactPath: params.artifactPath });
  const reported = result.report?.identity.head_rev;
  if (result.report && reported && !(reported.startsWith(params.head) || params.head.startsWith(reported))) {
    return { ...result, report: null, error: `edit_scope.py pr checked ${reported}, not ${params.head}` };
  }
  return result;
}

/** A `pr` run in the shape operators and publication records read. */
export interface PrScopeSummary {
  verdict: "pass" | "reject" | null;
  problem: string | null;
  error: string | null;
  rejected_hunks: EditScopeHunk[];
  /** Checker warnings, PR size warnings and same-PR prerequisites as "split suggested" warnings. */
  warnings: string[];
  pr_size: { units: number | null; files: number | null; changed_lines: number | null; warnings: string[] } | null;
  same_pr_prerequisites: unknown[];
}

function prerequisiteLabel(value: unknown): string {
  if (typeof value === "string") return value;
  if (isRecord(value)) {
    const name = [value.class, value.unit, value.owner_unit, value.symbol].find((part) => typeof part === "string");
    const reason = typeof value.reason === "string" ? value.reason : null;
    if (name || reason) return [name, reason].filter(Boolean).join(": ");
  }
  return JSON.stringify(value);
}

export function prScopeSummary(result: Pick<EditScopeResult, "report" | "error">): PrScopeSummary {
  const report = result.report;
  const prerequisites = report?.same_pr_prerequisites ?? [];
  return {
    verdict: report?.verdict ?? null,
    problem: editScopeProblem(result),
    error: result.error,
    rejected_hunks: editScopeRejectedHunks(report),
    warnings: [
      ...(report?.warnings ?? []),
      ...(report?.pr_size?.warnings ?? []),
      ...prerequisites.map((item) => `split suggested: ${prerequisiteLabel(item)}`),
    ],
    pr_size: report?.pr_size ?? null,
    same_pr_prerequisites: prerequisites,
  };
}
