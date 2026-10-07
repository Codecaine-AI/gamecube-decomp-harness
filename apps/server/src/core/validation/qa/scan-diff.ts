import { executeBuildTask, remoteBuildsEnabled } from "../build/execution.js";
/**
 * Shared invoker for the review_lint diff-aware QA scanner.
 *
 * The scanner is the deterministic layer of the QA ship gate: it runs the
 * maintainer-rejection rules (literal/data-symbol substitutions, packed string
 * blobs, copied header inlines, stage GroundVars ownership, unrolled asserts,
 * banned patterns, resubmission tombstones) against the added lines of a diff.
 * Both the worker-side L1 check and the
 * regression-check L2 ship gate go through this helper so they share one
 * contract.
 *
 * Exit-code contract for `scan_diff.py --gate`:
 *   0 = clean, 1 = hard-fail findings present, 2 = warnings only.
 * Stdout is always the JSON document; the human summary goes to stderr.
 */
import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import type { RunGameMetadata } from "@server/core/shared/types";
import type { AddressNamedStaticDataAllowlistEntry } from "@server/core/game-registry";
import { resolveRegisteredTool } from "@server/core/tools/resolver";
import type { AcceptedAdvisoryResolution } from "./accepted-advisories.js";
import { isAdvisoryFinding } from "./advisory-fingerprint.js";

/**
 * Environment variable the Python engine reads to compose the global
 * (platform-level `knowledge/global`) standards set with the game-specific
 * set named by ORCH_GAME_DIR. Set for every game; Melee's own tree is an
 * empty shell that inherits the global set.
 */
export const REVIEW_LINT_GLOBAL_STANDARDS_DIR_ENV = "REVIEW_LINT_GLOBAL_STANDARDS_DIR";

/** Global standards slices, relative to the orchestrator root. */
export const GLOBAL_STANDARDS_SLICES_RELATIVE_PATH = "knowledge/global/sources/injectable/decomp_standards/standards";

/** Tool error returned when a scan is requested without a game descriptor. */
export const QA_SCAN_REQUIRES_GAME_ERROR = "qa scan requires a game";

export type QaScanSeverity = "error" | "warning" | "info";

/** Scan surface for per-surface severity resolution in scan_diff.py. */
export type QaScanSurface = "worker" | "pr_gate";

export interface QaScanFinding {
  rule_id: string;
  severity: QaScanSeverity;
  file: string;
  line: number;
  excerpt: string;
  message: string;
  standard_id: string | null;
  /** Extra rule-specific context (ownership verdicts, tombstone refs, ...). */
  detail?: Record<string, unknown>;
  disposition?: "suppressed" | "informational";
}

export interface QaScanResult {
  tool: "review_lint";
  operation: "review_lint:scan_diff";
  status: "passed" | "warned" | "failed";
  repo: string;
  base: string | null;
  findings: QaScanFinding[];
  counts: { errors: number; warnings: number };
}

export interface QaScanInvocation {
  /** Exit code from scan_diff.py (0 clean / 1 hard fail / 2 warnings; other = tool failure). */
  exitCode: number;
  /** Parsed stdout JSON, or null when stdout was not parseable. */
  result: QaScanResult | null;
  /** Raw stdout/stderr for artifact capture. */
  stdout: string;
  stderr: string;
  /** Set when the tool itself failed (script missing, crash, bad JSON). */
  toolError: string | null;
  command: string[];
}

export type QaScanProcessRunner = (repoRoot: string, command: string[], env?: Record<string, string>) => Promise<{ exitCode: number; stdout: string; stderr: string }>;

export interface RunQaScanDiffOptions {
  /** Target game repo root the diff lives in. */
  repoRoot: string;
  /** Orchestrator root; hosts the global standards tree passed to non-Melee scans. */
  orchestratorRoot: string;
  /**
   * Game metadata used to resolve game tool bindings and the standards tree.
   * Required: a scan without a game would silently run Melee's rules against
   * another game's diff, so `runQaScanDiff` fails closed when it is missing.
   */
  game?: RunGameMetadata;
  /** Game state dir used to resolve tool cache/worktree roots when available. */
  stateDir?: string;
  /** Explicit worktree id for parallel validation worktrees. */
  worktreeId?: string;
  /** Base ref to diff against (merge-base is computed by the tool). Mutually exclusive with diffFile/files. */
  baseRef?: string;
  /** Pre-computed unified diff file to scan instead of a ref diff. */
  diffFile?: string;
  /** Restrict the ref diff to these pathspecs (worker L1 scoping). */
  files?: string[];
  /** Include uncommitted worktree edits in ref-mode scans. */
  includeWorktree?: boolean;
  /** Run scanner in gate mode. Defaults to true. Queue-building scans can disable this to collect findings without a failing process exit. */
  gate?: boolean;
  /**
   * Scan surface for per-surface severity resolution ("worker" for the L1
   * worker lint, "pr_gate" for PR-side gates). Omitted = base severities
   * (fully backward compatible).
   */
  surface?: QaScanSurface;
  addressNamedStaticDataAllowlist?: AddressNamedStaticDataAllowlistEntry[];
  /** Injectable process runner (tests); defaults to spawning python3. */
  processRunner?: QaScanProcessRunner;
}

async function runProcess(repoRoot: string, command: string[], env?: Record<string, string>): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  return new Promise((resolveProcess) => {
    const child = spawn(command[0] ?? "", command.slice(1), { cwd: repoRoot, env: env ? { ...process.env, ...env } : process.env });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let closed = false;
    let stdoutEnded = false;
    let stderrEnded = false;
    let exitCode = -1;
    let spawnError = "";
    const finish = () => {
      if (!closed || !stdoutEnded || !stderrEnded) return;
      resolveProcess({
        exitCode,
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: `${Buffer.concat(stderr).toString("utf8")}${spawnError}`,
      });
    };
    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.stdout.on("end", () => {
      stdoutEnded = true;
      finish();
    });
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
    child.stderr.on("end", () => {
      stderrEnded = true;
      finish();
    });
    child.on("error", (error) => {
      spawnError = error.message;
      exitCode = -1;
      stdoutEnded = true;
      stderrEnded = true;
      closed = true;
      finish();
    });
    child.on("close", (code) => {
      exitCode = code ?? -1;
      closed = true;
      finish();
    });
  });
}

export function qaScanDiffScriptPath(orchestratorRoot: string): string {
  return resolve(orchestratorRoot, "toolpacks/gamecube-decomp/source_editing/review_lint/api/scan_diff.py");
}

/** The global (game-agnostic) standards tree under the orchestrator's `knowledge/global` root. */
export function qaScanGlobalStandardsDir(orchestratorRoot: string): string {
  return resolve(orchestratorRoot, GLOBAL_STANDARDS_SLICES_RELATIVE_PATH);
}

/**
 * Scan environment: the resolved tool env (ORCH_GAME_DIR etc.) plus the global
 * standards dir, pinned to this orchestrator root for every game.
 */
export function qaScanEnv(params: { orchestratorRoot: string; gameId: string; toolEnv: Record<string, string> }): Record<string, string> {
  return { ...params.toolEnv, [REVIEW_LINT_GLOBAL_STANDARDS_DIR_ENV]: qaScanGlobalStandardsDir(params.orchestratorRoot) };
}

export function qaGatePassed(invocation: QaScanInvocation): boolean {
  return invocation.toolError === null && invocation.result !== null && invocation.result.counts.errors === 0 && invocation.result.counts.warnings === 0 && invocation.exitCode === 0;
}

function severityCounts(findings: QaScanFinding[]): { errors: number; warnings: number } {
  return {
    errors: findings.filter((finding) => finding.severity === "error").length,
    warnings: findings.filter((finding) => finding.severity === "warning").length,
  };
}

/**
 * The L2 verdict after accepted-advisory exemptions; the invocation itself
 * (the raw scanner evidence) is never modified. Only exempt entries that are
 * this invocation's own `llm_review` warning objects are removed; errors,
 * deterministic findings, and info never are. Counts are recomputed from the
 * remaining findings, and the exit code drops to 0 only when the raw exit code
 * is 2 (warnings only), something was exempted, and nothing remains. With no
 * exemption, or raw counts that disagree with the raw findings, the raw
 * verdict is returned.
 */
export function effectiveQaVerdict(
  invocation: QaScanInvocation,
  resolution: AcceptedAdvisoryResolution,
): { exitCode: number; counts: { errors: number; warnings: number }; findings: QaScanFinding[] } {
  const rawFindings = invocation.result?.findings ?? [];
  const rawCounts = invocation.result?.counts ?? severityCounts(rawFindings);
  const raw = { exitCode: invocation.exitCode, counts: { errors: rawCounts.errors, warnings: rawCounts.warnings }, findings: [...rawFindings] };
  const exempt = new Set(
    resolution.exempt.map((entry) => entry.finding).filter((finding) => isAdvisoryFinding(finding) && finding.severity === "warning"),
  );
  const findings = rawFindings.filter((finding) => !exempt.has(finding));
  if (findings.length === rawFindings.length) return raw;
  const recomputedRaw = severityCounts(rawFindings);
  if (recomputedRaw.errors !== rawCounts.errors || recomputedRaw.warnings !== rawCounts.warnings) return raw;
  const counts = severityCounts(findings);
  const exitCode = invocation.exitCode === 2 && counts.errors === 0 && counts.warnings === 0 ? 0 : invocation.exitCode;
  return { exitCode, counts, findings };
}

export function parseQaScanResult(stdout: string): QaScanResult | null {
  try {
    const parsed = JSON.parse(stdout) as Record<string, unknown>;
    if (parsed && parsed.tool === "review_lint" && Array.isArray(parsed.findings)) {
      return parsed as unknown as QaScanResult;
    }
    return null;
  } catch {
    return null;
  }
}

function cleanResultFromExitZero(options: RunQaScanDiffOptions, stderr: string): QaScanResult | null {
  if (stderr.trim() && !stderr.match(/review_lint scan_diff: passed \(0 error\(s\), 0 warning\(s\), \d+ scanned file\(s\)\)/)) return null;
  return {
    tool: "review_lint",
    operation: "review_lint:scan_diff",
    status: "passed",
    repo: options.repoRoot,
    base: options.baseRef ?? null,
    findings: [],
    counts: { errors: 0, warnings: 0 },
  };
}

export async function runQaScanDiff(options: RunQaScanDiffOptions): Promise<QaScanInvocation> {
  if (options.game?.gameId && !options.processRunner && remoteBuildsEnabled()) return executeBuildTask(options.repoRoot, { kind: "qa", input: { ...options } });
  // Fail closed: resolveRegisteredTool defaults a missing game to Melee, which
  // would scan another game's diff with the wrong standards tree.
  if (!options.game?.gameId) {
    return {
      exitCode: -1,
      result: null,
      stdout: "",
      stderr: "",
      toolError: QA_SCAN_REQUIRES_GAME_ERROR,
      command: [],
    };
  }
  const resolved = resolveRegisteredTool(
    {
      game: options.game,
      repoRoot: options.repoRoot,
      stateDir: options.stateDir,
      worktreeId: options.worktreeId,
    },
    "review_lint",
  );
  const scriptPath = resolve(resolved.apiRoot, "scan_diff.py");
  const command = ["python3", scriptPath, "--repo", options.repoRoot, "--json"];
  if (options.gate !== false) command.push("--gate");
  if (options.baseRef) command.push("--base", options.baseRef);
  if (options.diffFile) command.push("--diff-file", options.diffFile);
  if (options.includeWorktree) command.push("--include-worktree");
  if (options.surface) command.push("--surface", options.surface);
  if (options.addressNamedStaticDataAllowlist?.length) {
    command.push("--address-named-static-data-allowlist", JSON.stringify(options.addressNamedStaticDataAllowlist));
  }
  for (const file of options.files ?? []) command.push("--path", file);
  if (!existsSync(scriptPath)) {
    return {
      exitCode: -1,
      result: null,
      stdout: "",
      stderr: "",
      toolError: `scan_diff.py not found at ${scriptPath}`,
      command,
    };
  }
  const env = qaScanEnv({ orchestratorRoot: options.orchestratorRoot, gameId: resolved.gameId, toolEnv: resolved.env });
  const result = await (options.processRunner ?? runProcess)(options.repoRoot, command, env);
  const parsed = parseQaScanResult(result.stdout) ?? (result.exitCode === 0 && result.stdout.trim() === "" ? cleanResultFromExitZero(options, result.stderr) : null);
  const toolError =
    parsed === null
      ? `scan_diff.py did not return parseable JSON (exit ${result.exitCode})`
      : ![0, 1, 2].includes(result.exitCode)
        ? `scan_diff.py failed with exit ${result.exitCode}`
        : null;
  return {
    exitCode: result.exitCode,
    result: parsed,
    stdout: result.stdout,
    stderr: result.stderr,
    toolError,
    command,
  };
}
