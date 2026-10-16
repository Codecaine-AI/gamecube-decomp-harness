import type { RevAncestry, UnverifiedMatchRecord } from "@server/core/harness-runtime/run-state/unverified-matches.js";

/**
 * The checkpoint proof that the enforced steering gate, run target-only
 * against the trusted base the backfill recorded (`base_rev`), passed an
 * `unverified_match` target's own (unit, symbol) row for an attempt the
 * claim-base gate also passed
 * (`worker_checkpoints.metadata_json[UNVERIFIED_MATCH_CERTIFICATION_KEY]`).
 * The worker writes it (steering-validation.ts `unverifiedMatchCertification`);
 * integration clears the target's `unverified_match` row only after a clean
 * apply of a checkpoint carrying it, and only while its `base_rev` is the
 * row's current trusted base or an ancestor of it (`unverifiedBaseCertified`).
 */
export const UNVERIFIED_MATCH_CERTIFICATION_KEY = "unverified_match_certification";

export interface UnverifiedMatchCertification {
  kind: "unverified_match";
  game_id: string;
  unit: string;
  symbol: string;
  mode: "enforce";
  decision: "pass";
  /** The trusted base the certifying run compared the complete target version against. */
  base_rev: string;
  /** That run's artifact. */
  artifact_path: string | null;
  /** The claim base and the claim-base run's artifact (the attempt as a whole). */
  claim_base_rev?: string | null;
  claim_artifact_path?: string | null;
}

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value !== "";
}

/** The checkpoint's certification, or null for anything but a complete enforce `pass` proof against a trusted base. */
export function checkpointUnverifiedCertification(metadata: Record<string, unknown>): UnverifiedMatchCertification | null {
  const raw = metadata[UNVERIFIED_MATCH_CERTIFICATION_KEY];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const row = raw as Record<string, unknown>;
  if (row.kind !== "unverified_match" || row.mode !== "enforce" || row.decision !== "pass") return null;
  if (!nonEmpty(row.game_id) || !nonEmpty(row.unit) || !nonEmpty(row.symbol) || !nonEmpty(row.base_rev)) return null;
  return {
    kind: "unverified_match",
    game_id: row.game_id,
    unit: row.unit,
    symbol: row.symbol,
    mode: "enforce",
    decision: "pass",
    base_rev: row.base_rev,
    artifact_path: nonEmpty(row.artifact_path) ? row.artifact_path : null,
    claim_base_rev: nonEmpty(row.claim_base_rev) ? row.claim_base_rev : null,
    claim_artifact_path: nonEmpty(row.claim_artifact_path) ? row.claim_artifact_path : null,
  };
}

type GitRunner = (repoRoot: string, command: string[]) => { exitCode: number } | Promise<{ exitCode: number }>;

function spawnGit(repoRoot: string, command: string[]): { exitCode: number } {
  return { exitCode: Bun.spawnSync(command, { cwd: repoRoot, stdout: "ignore", stderr: "ignore" }).exitCode };
}

/**
 * `RevAncestry` for a checkout: `git merge-base --is-ancestor`. Exit 0 is yes;
 * anything else (1 = not an ancestor, an unknown revision, a failed git, a
 * revision that looks like an option) is no.
 */
export function gitRevAncestry(repoRoot: string, run: GitRunner = spawnGit): RevAncestry {
  return async (ancestor, descendant) => {
    if (!ancestor || !descendant || ancestor.startsWith("-") || descendant.startsWith("-")) return false;
    const result = await run(repoRoot, ["git", "-C", repoRoot, "merge-base", "--is-ancestor", ancestor, descendant]);
    return result.exitCode === 0;
  };
}

function usableRev(rev: string | null | undefined): rev is string {
  return Boolean(rev) && !rev!.startsWith("-");
}

/** What `sourceFreshBeforeApply` established, bound to the row it read. */
export interface SourceFreshness {
  sourcePath: string | null;
  recordedAt: string | null;
  /** Why the content cannot be certified (null: the file is the claim base's). */
  stale: string | null;
}

/**
 * Before `git apply` of an integration that would clear `row`: the worker
 * certified its version of the row's source file as the claim base plus its
 * patch, and the integration commits the whole file, so the file on disk
 * (working tree: staged and unstaged edits, and every commit since) must be
 * exactly the claim base's (`git diff --quiet <claimBase> -- <path>`). A
 * missing claim base, row or source path, a file the claim base does not
 * have, any difference (even one that does not overlap the patch: it may be
 * a newer, unverified implementation the row now describes), or a diff git
 * cannot answer is stale. Integration does not require a clean tree, so this
 * is the only proof that what lands is what was certified.
 */
export async function sourceFreshBeforeApply(params: {
  repoRoot: string;
  claimBaseRev: string | null | undefined;
  row: UnverifiedMatchRecord | null;
  run?: GitRunner;
}): Promise<SourceFreshness> {
  const run = params.run ?? spawnGit;
  const { row, claimBaseRev } = params;
  const bound = { sourcePath: row?.sourcePath ?? null, recordedAt: row?.recordedAt ?? null };
  if (!row) return { ...bound, stale: "no active unverified_match row before the apply" };
  if (!usableRev(claimBaseRev)) return { ...bound, stale: "the certification has no claim base revision" };
  if (!row.sourcePath) return { ...bound, stale: "the row has no source path" };
  try {
    const tracked = await run(params.repoRoot, ["git", "-C", params.repoRoot, "cat-file", "-e", `${claimBaseRev}:${row.sourcePath}`]);
    if (tracked.exitCode !== 0) return { ...bound, stale: `${row.sourcePath} is not in the claim base ${claimBaseRev}` };
    const diff = await run(params.repoRoot, ["git", "-C", params.repoRoot, "diff", "--quiet", "--no-ext-diff", claimBaseRev, "--", row.sourcePath]);
    if (diff.exitCode === 0) return { ...bound, stale: null };
    return {
      ...bound,
      stale: diff.exitCode === 1
        ? `${row.sourcePath} differs from the claim base ${claimBaseRev} before the apply (committed since, or edited in the working tree): the certified version is not what lands`
        : `could not compare ${row.sourcePath} with the claim base ${claimBaseRev}`,
    };
  } catch (error) {
    return { ...bound, stale: `could not compare ${row.sourcePath} with the claim base: ${error instanceof Error ? error.message : String(error)}` };
  }
}

/**
 * Content freshness for an integration clear (`clearUnverifiedMatchIfCertified`
 * `fresh`). The row being cleared must be the one `beforeApply` judged (same
 * source path and `recorded_at`), that judgement must be fresh, and the
 * committed history must agree: the whole file is unchanged between the
 * claim base and `preApplyRev` (`git diff --quiet`; no shortcut when the two
 * revisions are equal). Anything missing or unanswerable leaves the row
 * active, although the patch applied. Changes to other files do not.
 */
export function sourceUnchangedSinceClaim(params: {
  repoRoot: string;
  claimBaseRev: string | null | undefined;
  preApplyRev: string | null | undefined;
  beforeApply: SourceFreshness | null;
  run?: GitRunner;
}): (row: UnverifiedMatchRecord) => Promise<string | null> {
  const run = params.run ?? spawnGit;
  return async (row) => {
    const { claimBaseRev, preApplyRev, beforeApply } = params;
    if (!beforeApply) return "content freshness was not checked before the apply";
    if (beforeApply.stale !== null) return beforeApply.stale;
    if (row.sourcePath !== beforeApply.sourcePath || row.recordedAt !== beforeApply.recordedAt) {
      return "the row changed between the pre-apply freshness check and the clear";
    }
    if (!usableRev(claimBaseRev)) return "the certification has no claim base revision";
    if (!usableRev(preApplyRev)) return "the integration has no pre-apply revision";
    if (!row.sourcePath) return "the row has no source path";
    const diff = await run(params.repoRoot, ["git", "-C", params.repoRoot, "diff", "--quiet", "--no-ext-diff", claimBaseRev, preApplyRev, "--", row.sourcePath]);
    if (diff.exitCode === 0) return null;
    return diff.exitCode === 1
      ? `${row.sourcePath} changed between the claim base ${claimBaseRev} and ${preApplyRev}: the certified version is not what was integrated`
      : `could not compare ${row.sourcePath} between ${claimBaseRev} and ${preApplyRev}`;
  };
}
