/**
 * clang-format policy shared by the worker micro-gate, the epoch boundary
 * format step, and Sync validation. clang-format itself only ever runs inside
 * a game sandbox whose image bakes the pinned version; no host binary, pip
 * install, or Docker fallback is resolved here. The exec callback is the
 * sandbox command runner (worker session exec or the build task worker).
 */
import type { CommandResult } from "@server/infrastructure/shell/run-command.js";
import type { GameFormattingConfig } from "@server/core/game-registry/build-layout.js";

export type { GameFormattingConfig };

/** Source extensions the harness formats; upstream CI covers a superset but decomp work only touches these. */
export const FORMATTED_SOURCE_RE = /\.(?:c|cc|cpp|h|hpp)$/i;
export const CLANG_FORMAT_CHECK_ARGS = ["--dry-run", "--Werror", "--style=file", "--fallback-style=none"] as const;
export const CLANG_FORMAT_APPLY_ARGS = ["-i", "--style=file", "--fallback-style=none"] as const;
const FILES_PER_INVOCATION = 200;
const DEFAULT_TIMEOUT_MS = 10 * 60_000;

export interface ClangFormatViolation {
  file: string;
  line: number;
  message: string;
}

export interface ClangFormatCheckResult {
  status: "clean" | "violations" | "tool_unavailable";
  /** `clang-format --version` as reported by the sandbox; null when the tool did not answer. */
  version: string | null;
  files: string[];
  violations: ClangFormatViolation[];
  /** Tool/infrastructure failure detail (missing binary, unreadable style file, crash). */
  toolError: string | null;
}

export interface ClangFormatApplyResult {
  status: "unchanged" | "changed" | "tool_unavailable";
  version: string | null;
  files: string[];
  changedFiles: string[];
  /** Unified diff (`git diff` against the pre-format tree) restricted to `files`. */
  diff: string;
  toolError: string | null;
}

export type FormatCommandRunner = (command: string[], options?: { timeoutMs?: number }) => Promise<CommandResult>;

function normalizePath(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\.\//, "");
}

/** Sorted, de-duplicated C/C++ source paths from any path list. */
export function formattableSourcePaths(paths: Iterable<string>): string[] {
  const unique = new Set<string>();
  for (const raw of paths) {
    const path = normalizePath(raw.trim());
    if (path && FORMATTED_SOURCE_RE.test(path)) unique.add(path);
  }
  return [...unique].sort();
}

/** Post-image paths of the formattable files touched by a `git diff` text. */
export function changedSourcePathsFromDiff(diffText: string): string[] {
  const paths: string[] = [];
  for (const line of diffText.split(/\r?\n/)) {
    const match = /^diff --git a\/(.+?) b\/(.+)$/.exec(line);
    if (match?.[2]) paths.push(match[2]);
  }
  return formattableSourcePaths(paths);
}

export function parseClangFormatVersion(output: string): string | null {
  return /clang-format version\s+(\d+\.\d+\.\d+)/.exec(output)?.[1] ?? null;
}

/** Lines shaped like `path:line:col: error: code should be clang-formatted [-Wclang-format-violations]`. */
export function parseClangFormatViolations(output: string): ClangFormatViolation[] {
  const violations: ClangFormatViolation[] = [];
  for (const line of output.split(/\r?\n/)) {
    const match = /^(.+?):(\d+):\d+:\s+(?:error|warning):\s+(.*?)(?:\s+\[-W[^\]]+\])?\s*$/.exec(line.trim());
    if (!match) continue;
    violations.push({ file: normalizePath(match[1]!), line: Number(match[2]), message: match[3]! });
  }
  return violations;
}

/** One reason per file (its first violation), capped so repair feedback stays readable. */
export function formatViolationReasons(violations: ClangFormatViolation[], cap = 20): string[] {
  const firstByFile = new Map<string, ClangFormatViolation>();
  for (const violation of violations) {
    const existing = firstByFile.get(violation.file);
    if (!existing || violation.line < existing.line) firstByFile.set(violation.file, violation);
  }
  const ordered = [...firstByFile.values()].sort((left, right) => left.file.localeCompare(right.file));
  const reasons = ordered.slice(0, cap).map((violation) => `${violation.file}:${violation.line}: code should be clang-formatted`);
  if (ordered.length > cap) reasons.push(`${ordered.length - cap} more unformatted file(s) omitted`);
  return reasons;
}

/** Human-readable mismatch between the sandbox tool and the game's pinned version, or null when they agree. */
export function clangFormatVersionMismatch(reported: string | null, pinned: string): string | null {
  if (!reported) return `clang-format did not report a version; expected pinned ${pinned}`;
  if (reported.trim() === pinned.trim()) return null;
  return `clang-format version ${reported} does not match the game's pinned ${pinned}; rebuild the sandbox image`;
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) chunks.push(items.slice(index, index + size));
  return chunks;
}

function failureText(result: CommandResult): string {
  return (result.stderr.trim() || result.stdout.trim() || `exit code ${result.exitCode}`).slice(0, 2000);
}

async function readVersion(exec: FormatCommandRunner, timeoutMs: number): Promise<{ version: string | null; error: string | null }> {
  let result: CommandResult;
  try {
    result = await exec(["clang-format", "--version"], { timeoutMs });
  } catch (error) {
    return { version: null, error: `clang-format --version failed: ${error instanceof Error ? error.message : String(error)}` };
  }
  if (result.exitCode !== 0) return { version: null, error: `clang-format --version exited ${result.exitCode}: ${failureText(result)}` };
  const version = parseClangFormatVersion(result.stdout);
  return version ? { version, error: null } : { version: null, error: `unrecognized clang-format --version output: ${result.stdout.trim().slice(0, 200)}` };
}

/**
 * Dry-run check from the checkout root. Violations come back parsed; any
 * non-zero exit without parseable violations is a tool failure.
 */
export async function runClangFormatCheck(params: {
  files: string[];
  exec: FormatCommandRunner;
  timeoutMs?: number;
}): Promise<ClangFormatCheckResult> {
  const timeoutMs = params.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const files = formattableSourcePaths(params.files);
  const tool = await readVersion(params.exec, timeoutMs);
  if (tool.error) return { status: "tool_unavailable", version: tool.version, files, violations: [], toolError: tool.error };
  const violations: ClangFormatViolation[] = [];
  for (const batch of chunk(files, FILES_PER_INVOCATION)) {
    let result: CommandResult;
    try {
      result = await params.exec(["clang-format", ...CLANG_FORMAT_CHECK_ARGS, "--", ...batch], { timeoutMs });
    } catch (error) {
      return { status: "tool_unavailable", version: tool.version, files, violations, toolError: error instanceof Error ? error.message : String(error) };
    }
    const parsed = parseClangFormatViolations(`${result.stderr}\n${result.stdout}`);
    if (result.exitCode !== 0 && parsed.length === 0) {
      return { status: "tool_unavailable", version: tool.version, files, violations, toolError: `clang-format exited ${result.exitCode}: ${failureText(result)}` };
    }
    violations.push(...parsed);
  }
  return { status: violations.length > 0 ? "violations" : "clean", version: tool.version, files, violations, toolError: null };
}

/** In-place format from the checkout root; the resulting change is returned as a unified diff for the host to apply. */
export async function runClangFormatApply(params: {
  files: string[];
  exec: FormatCommandRunner;
  timeoutMs?: number;
}): Promise<ClangFormatApplyResult> {
  const timeoutMs = params.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const files = formattableSourcePaths(params.files);
  const tool = await readVersion(params.exec, timeoutMs);
  if (tool.error) return { status: "tool_unavailable", version: tool.version, files, changedFiles: [], diff: "", toolError: tool.error };
  for (const batch of chunk(files, FILES_PER_INVOCATION)) {
    let result: CommandResult;
    try {
      result = await params.exec(["clang-format", ...CLANG_FORMAT_APPLY_ARGS, "--", ...batch], { timeoutMs });
    } catch (error) {
      return { status: "tool_unavailable", version: tool.version, files, changedFiles: [], diff: "", toolError: error instanceof Error ? error.message : String(error) };
    }
    if (result.exitCode !== 0) {
      return { status: "tool_unavailable", version: tool.version, files, changedFiles: [], diff: "", toolError: `clang-format -i exited ${result.exitCode}: ${failureText(result)}` };
    }
  }
  if (files.length === 0) return { status: "unchanged", version: tool.version, files, changedFiles: [], diff: "", toolError: null };
  const names = await params.exec(["git", "diff", "--name-only", "--", ...files], { timeoutMs });
  const diff = await params.exec(["git", "diff", "--no-ext-diff", "--", ...files], { timeoutMs });
  if (names.exitCode !== 0 || diff.exitCode !== 0) {
    return { status: "tool_unavailable", version: tool.version, files, changedFiles: [], diff: "", toolError: `git diff after clang-format failed: ${failureText(names.exitCode !== 0 ? names : diff)}` };
  }
  const changedFiles = formattableSourcePaths(names.stdout.split(/\r?\n/));
  return { status: changedFiles.length > 0 ? "changed" : "unchanged", version: tool.version, files, changedFiles, diff: diff.stdout, toolError: null };
}
