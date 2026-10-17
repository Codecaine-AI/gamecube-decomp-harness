import { runCommand } from "@server/infrastructure/shell";
import type { UnverifiedMatchRecord } from "./unverified-matches.js";
import { unverifiedReportLocator } from "./unverified-report-locator.js";

/**
 * The full gate report provisioning writes into the worker sandbox for a
 * claimed "100% but unverified" target, at `unverifiedReportLocator(record)`.
 * It carries the trusted-base source read on the host, so the worker can read
 * it even when the trusted base did not reach the sandbox checkout.
 */
export const UNVERIFIED_REPORT_SCHEMA = "orch-unverified-report-v1";
/** Trusted-base source text beyond this many characters is truncated (and the body says so). */
export const UNVERIFIED_REPORT_SOURCE_MAX_CHARS = 512 * 1024;

export type UnverifiedReportTrustedBaseSource =
  | { rev: string | null; path: string | null; text: string; truncated?: { total_chars: number; kept_chars: number } }
  | { rev: string | null; path: string | null; unavailable: string };

export interface UnverifiedReportBody {
  schema: typeof UNVERIFIED_REPORT_SCHEMA;
  unit: string;
  symbol: string;
  analyzed_rev: string;
  trusted_base_rev: string | null;
  source_path: string | null;
  recorded_at: string;
  /** The function's `SteeringBackfillFunctionReport`, whole. */
  report: Record<string, unknown>;
  /** The target's source at the trusted base, read on the host (`git show <rev>:<path>`). */
  trusted_base_source: UnverifiedReportTrustedBaseSource;
}

type ReportRecord = Pick<UnverifiedMatchRecord, "unit" | "symbol" | "analyzedRev" | "baseRev" | "sourcePath" | "recordedAt" | "report">;
type GitShow = (repoRoot: string, command: string[]) => Promise<{ exitCode: number; stdout: string; stderr: string }>;

function safeSourcePath(path: string | null): boolean {
  return !!path && !path.startsWith("/") && !path.includes("\0") && !path.split("/").some((part) => !part || part === "." || part === "..");
}

async function trustedBaseSource(record: ReportRecord, hostRepoRoot: string, gitShow: GitShow): Promise<UnverifiedReportTrustedBaseSource> {
  const rev = record.baseRev ?? null;
  const path = record.sourcePath ?? null;
  if (!rev) return { rev, path, unavailable: "the record has no trusted base revision" };
  if (!safeSourcePath(path)) return { rev, path, unavailable: "the record has no usable source path" };
  try {
    const result = await gitShow(hostRepoRoot, ["git", "show", `${rev}:${path}`]);
    if (result.exitCode !== 0) {
      return { rev, path, unavailable: `git show ${rev}:${path} failed (${result.exitCode}): ${(result.stderr || result.stdout).trim().slice(-400)}` };
    }
    if (result.stdout.length <= UNVERIFIED_REPORT_SOURCE_MAX_CHARS) return { rev, path, text: result.stdout };
    return {
      rev,
      path,
      text: result.stdout.slice(0, UNVERIFIED_REPORT_SOURCE_MAX_CHARS),
      truncated: { total_chars: result.stdout.length, kept_chars: UNVERIFIED_REPORT_SOURCE_MAX_CHARS },
    };
  } catch (error) {
    return { rev, path, unavailable: `git show failed: ${error instanceof Error ? error.message : String(error)}` };
  }
}

/** The report body provisioning writes at `unverifiedReportLocator(record)`. Never throws. */
export async function unverifiedReportBody(
  record: ReportRecord,
  options: { hostRepoRoot: string; gitShow?: GitShow },
): Promise<UnverifiedReportBody> {
  return {
    schema: UNVERIFIED_REPORT_SCHEMA,
    unit: record.unit,
    symbol: record.symbol,
    analyzed_rev: record.analyzedRev,
    trusted_base_rev: record.baseRev ?? null,
    source_path: record.sourcePath ?? null,
    recorded_at: record.recordedAt,
    report: record.report ?? {},
    trusted_base_source: await trustedBaseSource(record, options.hostRepoRoot, options.gitShow ?? ((cwd, command) => runCommand(cwd, command, { timeoutMs: 60_000 }))),
  };
}

/** The sandbox file (`relativePath`, JSON `content`) carrying the target's full gate report. */
export async function unverifiedReportSandboxFile(
  record: ReportRecord,
  options: { hostRepoRoot: string; gitShow?: GitShow },
): Promise<{ relativePath: string; content: string }> {
  return {
    relativePath: unverifiedReportLocator(record),
    content: `${JSON.stringify(await unverifiedReportBody(record, options), null, 2)}\n`,
  };
}
