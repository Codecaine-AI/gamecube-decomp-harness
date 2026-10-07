/**
 * Accepted-advisory evidence resolution for L2 (regression-check) and the
 * epoch QA scan.
 *
 * An `llm_review` advisory warning accepted in enforce mode at L1 is honoured
 * later only when the same physical line, unchanged, still comes from the
 * accepted checkpoint's integration commit in an explicitly selected harness
 * run. Every ambiguous case fails closed: the advisory stays blocking, which
 * is exactly today's behaviour. Errors, deterministic findings, info findings,
 * and tool errors are never touched here.
 */
import { existsSync } from "node:fs";
import { lstat } from "node:fs/promises";
import { resolve } from "node:path";
import { openState, type StateStore } from "@server/core/orchestrator-state";
import { advisoryFingerprint, fullFlaggedLineAtRev, isAdvisoryFinding, normalizeAdvisoryPath } from "./advisory-fingerprint.js";
import type { QaScanFinding } from "./scan-diff.js";

export type RejectedReason =
  | "dirty-file"
  | "unreadable"
  | "no-accepted-record"
  | "not-integrated"
  | "not-from-accepted-integration"
  | "credit-exhausted";

export interface AcceptedAdvisoryResolution {
  runId: string;
  headRev: string;
  exempt: Array<{ fingerprint: string; finding: QaScanFinding; checkpointId: string; blame: { commit: string; origLine: number } }>;
  blocking: Array<{ fingerprint: string | null; finding: QaScanFinding; reason: RejectedReason }>;
}

/** `regression-check`'s default `--run-id`; it never selects a harness run. */
export const NO_RUN_SELECTED_RUN_ID = "manual";

interface AcceptedRow {
  checkpointId: string;
  occurrences: number;
  /** `metadata.integrated_rev` of the checkpoint's applied or resolved integration in the same run; null otherwise. */
  integratedRev: string | null;
}

/** Runs git in `repoRoot`; a spawn failure reads as a failed command. */
async function git(repoRoot: string, args: string[]): Promise<{ exitCode: number; stdout: string }> {
  try {
    const proc = Bun.spawn(["git", "-C", repoRoot, ...args], { stdout: "pipe", stderr: "pipe" });
    const [stdout, , exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);
    return { exitCode, stdout };
  } catch {
    return { exitCode: -1, stdout: "" };
  }
}

/** `git rev-parse HEAD`, or null when it cannot be resolved. */
export async function gitHeadRev(repoRoot: string): Promise<string | null> {
  const result = await git(repoRoot, ["rev-parse", "--verify", "HEAD^{commit}"]);
  const rev = result.stdout.trim();
  return result.exitCode === 0 && rev !== "" ? rev : null;
}

/** No staged, unstaged, or untracked change to `file`; a git failure counts as dirty. */
async function fileIsClean(repoRoot: string, file: string): Promise<boolean> {
  const status = await git(repoRoot, ["--literal-pathspecs", "status", "--porcelain", "--untracked-files=all", "--", file]);
  return status.exitCode === 0 && status.stdout.trim() === "";
}

/**
 * Worktree state captured immediately before a QA scan, so the scanned
 * evidence can be tied to the committed tree even if files change while the
 * scan or resolution runs (review M10 F1).
 */
export interface QaScanGuard {
  /** Wall-clock time taken before the scan started. */
  takenAtMs: number;
  /** Paths with any staged, unstaged, or untracked change before the scan; null when `git status` failed. */
  dirtyPaths: ReadonlySet<string> | null;
}

/**
 * A worktree file written within this margin before the scan, or at any time
 * after it, is treated as touched. It covers coarse kernel timestamp clocks
 * and filesystems that store whole-second times.
 */
const SCAN_TIMESTAMP_MARGIN_MS = 1000;

/** Every path `git status --porcelain -z` reports, both sides of a rename or copy included. */
function porcelainPaths(stdout: string): Set<string> {
  const paths = new Set<string>();
  const entries = stdout.split("\0");
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index]!;
    if (entry.length < 4) continue;
    paths.add(normalizeAdvisoryPath(entry.slice(3)));
    if (/[RC]/.test(entry.slice(0, 2)) && index + 1 < entries.length) {
      index += 1;
      paths.add(normalizeAdvisoryPath(entries[index]!));
    }
  }
  return paths;
}

/** Capture the worktree's dirty paths and the time, before running the scan this guards. */
export async function captureQaScanGuard(repoRoot: string): Promise<QaScanGuard> {
  const takenAtMs = Date.now();
  const status = await git(repoRoot, ["status", "--porcelain=v1", "-z", "--untracked-files=all"]);
  return { takenAtMs, dirtyPaths: status.exitCode === 0 ? porcelainPaths(status.stdout) : null };
}

/** The worktree file has not been written since (or just before) the guarded scan started. */
async function untouchedSinceScan(repoRoot: string, file: string, guard: QaScanGuard): Promise<boolean> {
  try {
    const stats = await lstat(resolve(repoRoot, file));
    const cutoff = guard.takenAtMs - SCAN_TIMESTAMP_MARGIN_MS;
    return stats.ctimeMs < cutoff && stats.mtimeMs < cutoff;
  } catch {
    return false;
  }
}

/**
 * The commit and original line `git blame` attributes line `line` of `file`
 * at `rev` to. The ignore-revs list is cleared so a repo's
 * `blame.ignoreRevsFile` cannot reattribute the line.
 */
async function blameLine(repoRoot: string, rev: string, file: string, line: number): Promise<{ commit: string; origLine: number } | null> {
  const result = await git(repoRoot, [
    "--literal-pathspecs",
    "blame",
    "--porcelain",
    "--ignore-revs-file",
    "",
    "-L",
    `${line},${line}`,
    rev,
    "--",
    file,
  ]);
  if (result.exitCode !== 0) return null;
  const header = /^([0-9a-f]{40}|[0-9a-f]{64}) (\d+) (\d+)(?: \d+)?$/.exec(result.stdout.split("\n", 1)[0] ?? "");
  if (!header || Number(header[3]) !== line) return null;
  return { commit: header[1]!, origLine: Number(header[2]) };
}

function acceptedRows(store: StateStore, runId: string, fingerprint: string): AcceptedRow[] {
  const rows = store.db
    .query(
      `SELECT a.checkpoint_id AS checkpoint_id, a.occurrences AS occurrences,
         (SELECT CASE WHEN json_valid(o.metadata_json) THEN json_extract(o.metadata_json, '$.integrated_rev') END
            FROM integration_outcomes o
           WHERE o.worker_checkpoint_id = a.checkpoint_id
             AND o.run_id = a.run_id
             AND o.status IN ('applied', 'resolved')) AS integrated_rev
       FROM accepted_advisory a
       WHERE a.run_id = ? AND a.fingerprint = ?
       ORDER BY a.accepted_at, a.checkpoint_id`,
    )
    .all(runId, fingerprint) as Array<{ checkpoint_id: string; occurrences: unknown; integrated_rev: unknown }>;
  return rows.map((row) => ({
    checkpointId: String(row.checkpoint_id),
    occurrences: typeof row.occurrences === "number" && Number.isInteger(row.occurrences) && row.occurrences > 0 ? row.occurrences : 0,
    integratedRev: typeof row.integrated_rev === "string" && row.integrated_rev.trim() !== "" ? row.integrated_rev.trim() : null,
  }));
}

/**
 * Classify every advisory warning of a scan as exempt or blocking (plan §6.10):
 * 0. the file has no uncommitted change now, nor (with `scanGuard`) before the scan (`dirty-file`);
 * 1. its complete flagged line is readable at `headRev` and starts with the excerpt (`unreadable`);
 * 2. an `accepted_advisory` row of `runId` carries its af2 fingerprint (`no-accepted-record`);
 * 3. that row's checkpoint was integrated (`applied`/`resolved`) at some `integrated_rev` R (`not-integrated`);
 * 4. `git blame -L` attributes the line to R itself (`not-from-accepted-integration`);
 * 5. each row exempts at most `occurrences` distinct blamed (commit, line) pairs (`credit-exhausted`).
 * A finding repeated for an already-credited physical line reuses that credit.
 * Immediately before returning, each exempt file is revalidated: still clean,
 * and (with `scanGuard`) not written since the scan started; otherwise its
 * exemptions become `dirty-file`. Callers must still recheck HEAD afterwards.
 * Never throws: a git or store read failure makes the affected advisories blocking.
 * Exempt and blocking entries carry the caller's own finding objects.
 */
export async function resolveAcceptedAdvisories(params: {
  store: StateStore;
  runId: string;
  repoRoot: string;
  headRev: string;
  findings: QaScanFinding[];
  /** Captured with `captureQaScanGuard` before the scan that produced `findings`. */
  scanGuard?: QaScanGuard;
}): Promise<AcceptedAdvisoryResolution> {
  const { store, runId, repoRoot, headRev, scanGuard } = params;
  const resolution: AcceptedAdvisoryResolution = { runId, headRev, exempt: [], blocking: [] };
  const cleanFiles = new Map<string, boolean>();
  const rowsByFingerprint = new Map<string, AcceptedRow[] | null>();
  const creditedOccurrences = new Map<string, string>();
  const creditUsed = new Map<string, number>();

  for (const finding of params.findings) {
    if (!isAdvisoryFinding(finding) || finding.severity !== "warning") continue;
    const block = (reason: RejectedReason, fingerprint: string | null = null) => resolution.blocking.push({ fingerprint, finding, reason });
    const file = normalizeAdvisoryPath(finding.file);

    if (scanGuard !== undefined && (scanGuard.dirtyPaths === null || scanGuard.dirtyPaths.has(file))) {
      block("dirty-file");
      continue;
    }
    let clean = cleanFiles.get(file);
    if (clean === undefined) {
      clean = await fileIsClean(repoRoot, file);
      cleanFiles.set(file, clean);
    }
    if (!clean) {
      block("dirty-file");
      continue;
    }

    const fullLine = await fullFlaggedLineAtRev(repoRoot, headRev, file, finding.line, finding.excerpt).catch(() => null);
    if (fullLine === null) {
      block("unreadable");
      continue;
    }
    const fingerprint = advisoryFingerprint(finding, fullLine);

    let rows = rowsByFingerprint.get(fingerprint);
    if (rows === undefined) {
      try {
        rows = acceptedRows(store, runId, fingerprint);
      } catch {
        rows = null;
      }
      rowsByFingerprint.set(fingerprint, rows);
    }
    if (rows === null) {
      block("unreadable", fingerprint);
      continue;
    }
    if (rows.length === 0) {
      block("no-accepted-record", fingerprint);
      continue;
    }
    const integrated = rows.filter((row) => row.integratedRev !== null);
    if (integrated.length === 0) {
      block("not-integrated", fingerprint);
      continue;
    }

    const blame = await blameLine(repoRoot, headRev, file, finding.line);
    if (blame === null) {
      block("unreadable", fingerprint);
      continue;
    }
    const fromAcceptedIntegration = integrated.filter((row) => row.integratedRev === blame.commit);
    if (fromAcceptedIntegration.length === 0) {
      block("not-from-accepted-integration", fingerprint);
      continue;
    }

    const occurrenceKey = `${fingerprint}\u0000${blame.commit}\u0000${blame.origLine}`;
    let checkpointId = creditedOccurrences.get(occurrenceKey);
    if (checkpointId === undefined) {
      const row = fromAcceptedIntegration.find((candidate) => (creditUsed.get(`${fingerprint}\u0000${candidate.checkpointId}`) ?? 0) < candidate.occurrences);
      if (!row) {
        block("credit-exhausted", fingerprint);
        continue;
      }
      const creditKey = `${fingerprint}\u0000${row.checkpointId}`;
      creditUsed.set(creditKey, (creditUsed.get(creditKey) ?? 0) + 1);
      creditedOccurrences.set(occurrenceKey, row.checkpointId);
      checkpointId = row.checkpointId;
    }
    resolution.exempt.push({ fingerprint, finding, checkpointId, blame });
  }

  // Revalidate right before publishing: the scanned file must still equal the
  // committed line that was fingerprinted and blamed.
  const stillValid = new Map<string, boolean>();
  for (const file of new Set(resolution.exempt.map((entry) => normalizeAdvisoryPath(entry.finding.file)))) {
    stillValid.set(file, (await fileIsClean(repoRoot, file)) && (scanGuard === undefined || (await untouchedSinceScan(repoRoot, file, scanGuard))));
  }
  const exempt = resolution.exempt;
  resolution.exempt = [];
  for (const entry of exempt) {
    if (stillValid.get(normalizeAdvisoryPath(entry.finding.file))) resolution.exempt.push(entry);
    else resolution.blocking.push({ fingerprint: entry.fingerprint, finding: entry.finding, reason: "dirty-file" });
  }
  return resolution;
}

export interface AcceptedAdvisoryStoreSummary {
  total: number;
  runIds: string[];
}

/** Count of `accepted_advisory` rows across every run, with their distinct run ids. */
export function acceptedAdvisoryStoreSummary(store: StateStore): AcceptedAdvisoryStoreSummary {
  const rows = store.db
    .query("SELECT run_id, COUNT(*) AS count FROM accepted_advisory GROUP BY run_id ORDER BY run_id")
    .all() as Array<{ run_id: string; count: number }>;
  return { total: rows.reduce((sum, row) => sum + Number(row.count), 0), runIds: rows.map((row) => String(row.run_id)) };
}

/** The L2 notice printed when accepted advisories exist but no harness run was selected. */
export function noRunSelectedMessage(summary: AcceptedAdvisoryStoreSummary): string {
  return (
    `${summary.total} accepted llm_review advisories exist (runs: ${summary.runIds.join(", ")}). ` +
    "No harness run was selected, so they are not honoured. " +
    "Rerun with RUN_ID=<run> make regression-check (or --run-id <run>)."
  );
}

export interface L2AcceptedAdvisoryOptions {
  acceptedAdvisories?: AcceptedAdvisoryResolution;
  operatorMessage?: string;
}

/**
 * L2 run selection (plan §6.10). Exemptions apply only when `requestedRunId`
 * names a run in the orchestrator store at `stateDir`, opened in verify mode;
 * only that run's records are used and nothing is inferred. With no run
 * selected (`manual`, missing, or unknown) the result carries at most the
 * operator notice, so the gate behaves exactly as today. `headRev` and
 * `scanGuard` are captured before the scan: findings in paths dirty at that
 * point never qualify, exempt files are revalidated after resolution, and if
 * HEAD cannot be resolved or has moved by then, no exemption is returned. A
 * missing store is never created, and an unreadable one leaves today's
 * behaviour (undefined).
 */
export async function l2AcceptedAdvisoryOptions(params: {
  stateDir: string;
  requestedRunId: string | null;
  repoRoot: string;
  headRev: string | null;
  findings: QaScanFinding[];
  /** From `captureQaScanGuard` before the scan; regression-check always passes it. */
  scanGuard?: QaScanGuard;
  trace?: (message: string) => void;
}): Promise<L2AcceptedAdvisoryOptions | undefined> {
  const trace = params.trace ?? (() => {});
  if (!existsSync(resolve(params.stateDir, "orchestrator.sqlite"))) return undefined;
  let store: StateStore;
  try {
    store = openState(params.stateDir, { migrate: false });
  } catch (error) {
    trace(`accepted llm_review advisories were not consulted: ${error instanceof Error ? error.message : String(error)}`);
    return undefined;
  }
  try {
    const runId = params.requestedRunId !== null && params.requestedRunId !== NO_RUN_SELECTED_RUN_ID ? params.requestedRunId : null;
    const runExists = runId !== null && store.db.query("SELECT 1 FROM runs WHERE id = ?").get(runId) != null;
    if (runId === null || !runExists) {
      const summary = acceptedAdvisoryStoreSummary(store);
      return summary.total > 0 ? { operatorMessage: noRunSelectedMessage(summary) } : undefined;
    }
    if (params.headRev === null) {
      return { operatorMessage: `Harness run ${runId} was selected, but HEAD could not be resolved, so accepted llm_review advisories are not honoured.` };
    }
    const resolution = await resolveAcceptedAdvisories({
      store,
      runId,
      repoRoot: params.repoRoot,
      headRev: params.headRev,
      findings: params.findings,
      scanGuard: params.scanGuard,
    });
    const headAfter = await gitHeadRev(params.repoRoot);
    if (headAfter !== params.headRev) {
      return {
        operatorMessage:
          `Harness run ${runId} was selected, but HEAD moved from ${params.headRev} to ${headAfter ?? "an unresolvable revision"} ` +
          "during the QA scan, so accepted llm_review advisories are not honoured. Rerun regression-check on a quiet tree.",
      };
    }
    return { acceptedAdvisories: resolution };
  } catch (error) {
    trace(`accepted llm_review advisories were not consulted: ${error instanceof Error ? error.message : String(error)}`);
    return undefined;
  } finally {
    store.db.close();
  }
}
