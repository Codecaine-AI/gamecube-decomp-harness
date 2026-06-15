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

export type QaScanSeverity = "error" | "warning";

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

export interface RunQaScanDiffOptions {
  /** Melee (target project) repo root the diff lives in. */
  repoRoot: string;
  /** Orchestrator root containing tools/source_editing/review_lint. */
  orchestratorRoot: string;
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
}

async function runProcess(repoRoot: string, command: string[]): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  return new Promise((resolveProcess) => {
    const child = spawn(command[0] ?? "", command.slice(1), { cwd: repoRoot });
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
  return resolve(orchestratorRoot, "tools/source_editing/review_lint/api/scan_diff.py");
}

export function qaGatePassed(invocation: QaScanInvocation): boolean {
  return invocation.toolError === null && invocation.result !== null && invocation.result.counts.errors === 0 && (invocation.exitCode === 0 || invocation.exitCode === 2);
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
  const scriptPath = qaScanDiffScriptPath(options.orchestratorRoot);
  const command = ["python3", scriptPath, "--repo", options.repoRoot, "--json"];
  if (options.gate !== false) command.push("--gate");
  if (options.baseRef) command.push("--base", options.baseRef);
  if (options.diffFile) command.push("--diff-file", options.diffFile);
  if (options.includeWorktree) command.push("--include-worktree");
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
  const result = await runProcess(options.repoRoot, command);
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
