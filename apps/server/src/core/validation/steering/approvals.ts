import { existsSync } from "node:fs";
import { mkdir, open, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

/**
 * Site-bound evidence-review approvals: the rows of the game's
 * `evidence_approvals.jsonl` the steering gate certifies a reviewed construct
 * with (`steering_approvals.py`, worker-compiler-loop plan 3.1). The gate's
 * lookup requires every field below to match the edit group exactly; a legacy
 * row (`{symbol, function}` only) never certifies and is reported as legacy
 * here. Workers never write this file: only an operator's approval of an
 * evidence-review request does (`decideEvidenceReview`).
 */
export const SITE_BOUND_APPROVAL_SCHEMA = "steering-approval-v2";

export interface SiteBoundApproval {
  schema: typeof SITE_BOUND_APPROVAL_SCHEMA;
  game: string;
  unit: string;
  /** Mangled function the approved edit group edits. */
  target: string;
  /** The claim base revision the reviewed attempt was measured against. */
  base_rev: string;
  site_file: string;
  /** 1-based inclusive candidate-file line range of the group. */
  site_lines: [number, number];
  /** Normalized digest of the edit group (operands included). */
  group_digest: string;
  /** Short name of the construct's callee (`getX`). */
  callee: string;
  /** The construct the group introduces (mangled weak function). */
  symbol: string;
  approved_by: string;
  provenance: string;
  review_id?: string;
  note?: string;
  approved_at?: string;
}

const REQUIRED_STRINGS = ["game", "unit", "target", "base_rev", "site_file", "group_digest", "callee", "symbol", "approved_by"] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/** The row as a site-bound approval, or null when any lookup field is missing or malformed (legacy rows). */
export function parseSiteBoundApproval(row: unknown): SiteBoundApproval | null {
  if (!isRecord(row)) return null;
  for (const key of REQUIRED_STRINGS) if (typeof row[key] !== "string" || !(row[key] as string).trim()) return null;
  const lines = row.site_lines;
  if (!Array.isArray(lines) || lines.length !== 2 || !lines.every((n) => Number.isInteger(n) && (n as number) > 0)) return null;
  const [start, end] = lines as number[];
  if (start! > end!) return null;
  return {
    schema: SITE_BOUND_APPROVAL_SCHEMA,
    game: row.game as string,
    unit: row.unit as string,
    target: row.target as string,
    base_rev: row.base_rev as string,
    site_file: row.site_file as string,
    site_lines: [start!, end!],
    group_digest: row.group_digest as string,
    callee: row.callee as string,
    symbol: row.symbol as string,
    approved_by: row.approved_by as string,
    provenance: typeof row.provenance === "string" ? row.provenance : "",
    ...(typeof row.review_id === "string" ? { review_id: row.review_id } : {}),
    ...(typeof row.note === "string" ? { note: row.note } : {}),
    ...(typeof row.approved_at === "string" ? { approved_at: row.approved_at } : {}),
  };
}

/** The approvals file: site-bound rows, plus the count of legacy/malformed rows the gate ignores. */
export async function readSiteBoundApprovals(path: string | null | undefined): Promise<{ approvals: SiteBoundApproval[]; legacy: number }> {
  if (!path || !existsSync(path)) return { approvals: [], legacy: 0 };
  const approvals: SiteBoundApproval[] = [];
  let legacy = 0;
  for (const line of (await readFile(path, "utf8")).split("\n")) {
    if (!line.trim()) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      legacy += 1;
      continue;
    }
    const approval = parseSiteBoundApproval(parsed);
    if (approval) approvals.push(approval);
    else legacy += 1;
  }
  return { approvals, legacy };
}

/** Same review, base, site and digest: the row is already published. */
function sameRow(a: SiteBoundApproval, b: SiteBoundApproval): boolean {
  return a.review_id === b.review_id && a.game === b.game && a.unit === b.unit && a.target === b.target && a.base_rev === b.base_rev
    && a.site_file === b.site_file && a.site_lines[0] === b.site_lines[0] && a.site_lines[1] === b.site_lines[1]
    && a.group_digest === b.group_digest && a.callee === b.callee && a.symbol === b.symbol;
}

const LOCK_WAIT_MS = 10_000;
const LOCK_STALE_MS = 60_000;

/**
 * Runs `work` holding `<path>.lock` (an exclusive create), so every writer of
 * the approvals file, in this process or another, is serialized. A lock older
 * than LOCK_STALE_MS is a crashed writer's and is taken over.
 */
async function withFileLock<T>(path: string, work: () => Promise<T>): Promise<T> {
  const lock = `${path}.lock`;
  const deadline = Date.now() + LOCK_WAIT_MS;
  for (;;) {
    try {
      const handle = await open(lock, "wx");
      await handle.writeFile(`${process.pid} ${new Date().toISOString()}\n`);
      await handle.close();
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      const age = await stat(lock).then((info) => Date.now() - info.mtimeMs, () => 0);
      if (age > LOCK_STALE_MS) {
        await rm(lock, { force: true });
        continue;
      }
      if (Date.now() > deadline) throw new Error(`approvals file ${path} is locked by another writer`);
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  }
  try {
    return await work();
  } finally {
    // Releasing the lock never fails the work: a published file must not be reported as unpublished.
    await rm(lock, { force: true }).catch(() => undefined);
  }
}

/**
 * Publishes approval rows: all or none. Under the file lock, rows already
 * present (`sameRow`, a retried publication) are skipped and the rest are
 * written with the existing text to a temporary file that replaces the
 * approvals file by rename, so the gate never reads a partial file.
 */
export async function publishSiteBoundApprovals(path: string, rows: SiteBoundApproval[]): Promise<void> {
  for (const row of rows) if (!parseSiteBoundApproval(row)) throw new Error("refusing to write an incomplete site-bound approval");
  await mkdir(dirname(path), { recursive: true });
  await withFileLock(path, async () => {
    const text = existsSync(path) ? await readFile(path, "utf8") : "";
    const { approvals: present } = await readSiteBoundApprovals(path);
    const fresh = rows.filter((row) => !present.some((have) => sameRow(have, row)));
    if (fresh.length === 0) return;
    const prefix = text.length > 0 && !text.endsWith("\n") ? "\n" : "";
    const tmp = `${path}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(tmp, `${text}${prefix}${fresh.map((row) => JSON.stringify(row)).join("\n")}\n`);
    await rename(tmp, path);
  });
}

/** Appends one approval row (the file is append-only). */
export async function appendSiteBoundApproval(path: string, approval: SiteBoundApproval): Promise<void> {
  await publishSiteBoundApprovals(path, [approval]);
}
