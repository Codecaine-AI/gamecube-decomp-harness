import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { SteeringUnusedCheck, WorkerSteeringResult } from "@server/core/validation/steering/steering-check.js";

/**
 * UNUSED-reconstruction evidence (plan v3 section 4). The worker's steering
 * run certifies every UNUSED body it saw (`decide`'s `unused_checks`); the
 * worker attaches those checks, bound to the patch they were measured on, to
 * the checkpoint metadata. Integration passes them to `edit_scope.py check
 * --unused-checks` and writes `Evidence-Inlined:` trailers for every
 * `inlined` check on the integration commit.
 */

/** Checkpoint metadata key holding the bound checks. */
export const CHECKPOINT_UNUSED_CHECKS_KEY = "unused_checks";

/**
 * One `unused_checks` row with its binding. The steering parser keeps only the
 * fields it judges; the raw `decide` row also carries `callers` (the worsened,
 * non-calling functions: the evidence) and the binding fields, all kept here.
 */
export type BoundUnusedCheck = Omit<SteeringUnusedCheck, "base_rev" | "edits_hash" | "body_sha256" | "callers"> & {
  base_rev?: string | null;
  edits_hash?: string | null;
  body_sha256?: string | null;
  callers?: Array<{ function: string; before?: Record<string, unknown>; after?: Record<string, unknown>; delta?: number }>;
  [key: string]: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isCheckRow(value: unknown): value is Record<string, unknown> {
  return isRecord(value)
    && typeof value.unit === "string"
    && typeof value.file === "string"
    && typeof value.function === "string"
    && (value.status === "dead" || value.status === "inlined" || value.status === "inconclusive");
}

async function readJson(path: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return undefined;
  }
}

/** `<dir>/attempt-N.steering.json` → `<dir>/attempt-N.steering.<step>.json` (the gate's step files). */
function stepPath(artifactPath: string, step: string): string {
  return artifactPath.replace(/\.json$/, `.${step}.json`);
}

/**
 * Binds rows to `{base_rev, edits_hash, body_sha256}`: fields the checker
 * emitted are kept as they are; a missing `base_rev` falls back to the claim
 * base and a missing `edits_hash` to the steering run's `edits` step.
 */
export function bindUnusedChecks(
  rows: readonly Record<string, unknown>[],
  binding: { baseRev: string | null; editsHash: string | null },
): BoundUnusedCheck[] {
  return rows.filter(isCheckRow).map((row) => ({
    ...row,
    changed: Array.isArray(row.changed) ? row.changed : [],
    base_rev: typeof row.base_rev === "string" && row.base_rev ? row.base_rev : binding.baseRev,
    edits_hash: typeof row.edits_hash === "string" && row.edits_hash ? row.edits_hash : binding.editsHash,
    body_sha256: typeof row.body_sha256 === "string" && row.body_sha256 ? row.body_sha256 : null,
  }) as BoundUnusedCheck);
}

/**
 * The steering run's bound `unused_checks`, for the checkpoint metadata. Null
 * when the gate did not run or produced no decision (nothing was certified).
 * Rows come from the raw `decide` output next to the gate artifact so every
 * binding field the checker emits survives; without it, the parsed decision.
 */
export async function loadBoundUnusedChecks(
  steering: WorkerSteeringResult | null | undefined,
  options: { baseRev: string | null | undefined },
): Promise<BoundUnusedCheck[] | null> {
  if (!steering || steering.mode === "off" || !steering.decision) return null;
  const baseRev = options.baseRev ?? null;
  let rawRows: Record<string, unknown>[] | null = null;
  let editsHash: string | null = null;
  if (steering.artifactPath) {
    const decision = await readJson(stepPath(steering.artifactPath, "decision"));
    if (isRecord(decision) && Array.isArray(decision.unused_checks)) rawRows = decision.unused_checks.filter(isRecord);
    const edits = await readJson(stepPath(steering.artifactPath, "edits"));
    if (isRecord(edits) && typeof edits.edits_hash === "string") editsHash = edits.edits_hash;
  }
  const rows = rawRows ?? (steering.decision.unused_checks ?? []).map((check) => ({ ...check }) as Record<string, unknown>);
  return bindUnusedChecks(rows, { baseRev, editsHash });
}

/** The bound checks a checkpoint's metadata carries, or null when it carries none. */
export function checkpointUnusedChecks(metadata: Record<string, unknown> | null | undefined): BoundUnusedCheck[] | null {
  const value = metadata?.[CHECKPOINT_UNUSED_CHECKS_KEY];
  if (!Array.isArray(value)) return null;
  return value.filter(isCheckRow) as BoundUnusedCheck[];
}

function matchPercent(value: unknown): number | null {
  if (!isRecord(value)) return null;
  const pct = value.match_percent;
  return typeof pct === "number" && Number.isFinite(pct) ? pct : null;
}

/** Trailer values are one line; a demangled signature's parameter list is dropped for brevity. */
function displayName(name: string): string {
  return name.replace(/[\r\n]+/g, " ").replace(/\s*\(.*\)\s*(const)?\s*$/, "").trim() || name.trim();
}

/**
 * `Evidence-Inlined:` trailer lines, one per worsened caller of every
 * `inlined` check, e.g.
 * `Evidence-Inlined: TChuuHana::rolling -> TNerveChuuHanaRoll::execute (86.0% -> 45.0% when emptied)`.
 * Callers come from `callers` (the evidence `decide` judged) or, without
 * them, from `changed` rows whose match dropped.
 */
export function evidenceInlinedTrailers(checks: readonly BoundUnusedCheck[] | null | undefined): string[] {
  const lines: string[] = [];
  for (const check of checks ?? []) {
    if (check.status !== "inlined") continue;
    const callers = Array.isArray(check.callers) && check.callers.length > 0
      ? check.callers
      : (check.changed ?? []).filter((change) => {
          const before = matchPercent(change.before);
          const after = matchPercent(change.after);
          return before !== null && after !== null && after < before;
        });
    for (const caller of callers) {
      if (!isRecord(caller) || typeof caller.function !== "string") continue;
      const before = matchPercent(caller.before);
      const after = matchPercent(caller.after);
      const scores = before !== null && after !== null ? ` (${before.toFixed(1)}% -> ${after.toFixed(1)}% when emptied)` : "";
      lines.push(`Evidence-Inlined: ${displayName(check.function)} -> ${displayName(caller.function)}${scores}`);
    }
  }
  return [...new Set(lines)];
}

/**
 * The unit-content hash a certificate binds to (contract shared with
 * `steering_check.py` / `edit_scope.py`): sha256 over, for each path in
 * sorted order, `path NUL byteLength NUL bytes`; a missing file hashes as
 * length `-1` with no bytes. A certificate stays valid while its unit's
 * inputs (the unit source and the changed headers it includes) are
 * byte-identical, whatever the base revision.
 */
export function unitInputsSha256(files: ReadonlyArray<{ path: string; text: string | null }>): string {
  const hash = createHash("sha256");
  for (const file of [...files].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))) {
    const data = file.text === null ? null : Buffer.from(file.text, "utf8");
    hash.update(Buffer.from(file.path, "utf8"));
    hash.update(Buffer.from([0]));
    hash.update(Buffer.from(String(data === null ? -1 : data.length), "utf8"));
    hash.update(Buffer.from([0]));
    if (data) hash.update(data);
  }
  return hash.digest("hex");
}

export interface UnusedCheckFreshness {
  /** Checks whose unit inputs are byte-identical at the checked texts (or that carry no content binding). */
  fresh: BoundUnusedCheck[];
  /** Content-bound checks whose unit inputs changed since they were certified: re-certify. */
  stale: Array<{ check: BoundUnusedCheck; reason: string }>;
}

/**
 * Splits certificates by their unit-content binding against the texts being
 * checked (post-apply texts over HEAD at integration, the PR head at
 * publication). `readText(path)` returns the file's text there, or null when
 * it does not exist. Rows without `unit_inputs_sha256` are passed through
 * (the checker applies its base-rev rule to them).
 */
export async function partitionUnusedChecksByContent(
  checks: readonly BoundUnusedCheck[],
  readText: (path: string) => string | null | Promise<string | null>,
): Promise<UnusedCheckFreshness> {
  const fresh: BoundUnusedCheck[] = [];
  const stale: UnusedCheckFreshness["stale"] = [];
  for (const check of checks) {
    const expected = typeof check.unit_inputs_sha256 === "string" ? check.unit_inputs_sha256 : null;
    const inputs = Array.isArray(check.unit_inputs) ? check.unit_inputs.filter((path): path is string => typeof path === "string") : null;
    if (!expected) {
      fresh.push(check);
      continue;
    }
    if (!inputs || inputs.length === 0) {
      stale.push({ check, reason: `stale certificate for ${check.function}: no unit_inputs recorded; re-certify` });
      continue;
    }
    const files = await Promise.all(inputs.map(async (path) => ({ path, text: await readText(path) })));
    if (unitInputsSha256(files) === expected) fresh.push(check);
    else stale.push({ check, reason: `stale certificate for ${check.function} (unit inputs changed: ${inputs.join(", ")}); re-certify` });
  }
  return { fresh, stale };
}

/** The repair text for a target whose UNUSED certificate went stale. */
export const UNUSED_RECERTIFY_INSTRUCTION =
  "An UNUSED body's inline certificate no longer matches its unit (the unit source or a header it includes changed since the stub test ran). Re-certify: rebuild, let the steering gate re-run the stub test on the current text, and keep the body only if emptying it still makes a same-unit caller worse; otherwise restore the upstream stub.";
