import type { StateStore } from "@server/core/orchestrator-state";
import { steeringGateActive } from "@server/core/tools/steering-gate.js";
import { steeringCompletionIndex } from "@server/core/harness-runtime/phases/pr/checkpoint/completion-index.js";
import { landedCertificates } from "@server/core/harness-runtime/run-state/certification.js";
import { latestSteeringBackfill } from "@server/core/harness-runtime/run-state/steering.js";
import { activeUnverifiedMatch, unverifiedMatchKey } from "@server/core/harness-runtime/run-state/unverified-matches.js";
import { unitKeyedHas, unitVariants, type UnitKeyGame } from "@server/core/harness-runtime/run-state/unit-key.js";
import { NO_SYNC_CERTIFICATION, type SyncCertificationLookup } from "./certified-merge.js";

/**
 * The unit names a report function may be recorded under in steering state:
 * the report unit (`mario/Animal/AnimalBase`), its other spellings under the
 * game's known module prefixes (`Animal/AnimalBase`, how the SMS backfill
 * records it; `unitVariants`, never an arbitrary leading component), and the
 * source path without `src/` and extension.
 */
export function steeringUnitCandidates(unit: string, sourcePath: string, game?: UnitKeyGame): string[] {
  const fromSource = sourcePath.replace(/\\/g, "/").replace(/^\.\//, "").replace(/^src\//, "").replace(/\.[^./]+$/, "");
  return [...new Set([unit, ...unitVariants(game, unit), fromSource].filter(Boolean))];
}

/** Synchronous git reads for the reader (`git -C <repo> ...`); null on failure. */
export type CertificationGit = (args: string[]) => { exitCode: number; stdout: string };

function defaultGit(repoRoot: string): CertificationGit {
  return (args) => {
    try {
      const result = Bun.spawnSync(["git", "-C", repoRoot, ...args], { stdout: "pipe", stderr: "ignore" });
      return { exitCode: result.exitCode ?? -1, stdout: result.stdout.toString() };
    } catch {
      return { exitCode: -1, stdout: "" };
    }
  };
}

/**
 * Revisions at which a gate-pass certificate of the function landed as the
 * code it certified (`landedCertificates`, shared with certified regression:
 * a bound, `fresh: true` landed-content proof for this target, source, claim
 * base and integrated rev). A landing whose gated source was applied onto
 * changed source, or that has no proof, certifies nothing.
 */
function landedCertificateRevisions(store: StateStore, gameId: string, unit: string, symbol: string): string[] {
  return landedCertificates(store, gameId, { unit, symbol }).filter((landed) => landed.kind === "gate_pass").map((landed) => landed.integratedRev);
}

/**
 * Certification of our functions at the pinned ours revision (by default the
 * checkout's HEAD when the reader is built, before the merge). Only a fresh
 * pass certifies, and the reader fails closed:
 *
 * - a hold (active `unverified_match`, or a rollback without a later landed
 *   certificate: `steeringCompletionIndex`) is never certified;
 * - the latest backfill verdict counts only when it was analysed at ours
 *   itself (`analyzed_rev` = ours): `pass` certifies, any other verdict does
 *   not; a verdict from any other revision, an ancestor included, certifies
 *   nothing, since headers, macros, include paths and flags may have changed
 *   the compile since;
 * - otherwise a landed gate-pass certificate counts only when it was
 *   integrated at ours itself (`integrated_rev` = ours).
 *
 * So a certified sync needs a steering backfill at the harness head first
 * (readiness item 11); without one every conflicting function goes to
 * upstream. Unreadable revisions certify nothing. Games without an active
 * gate read nothing and certify nothing.
 */
export async function syncCertificationReader(
  store: StateStore,
  game: { gameId?: string | null; steeringGate?: string | null },
  repoRoot: string,
  options: { oursRevision?: string; git?: CertificationGit } = {},
): Promise<SyncCertificationLookup> {
  const gameId = game.gameId ?? "";
  if (!gameId || !steeringGateActive(game.steeringGate as Parameters<typeof steeringGateActive>[0])) return NO_SYNC_CERTIFICATION;
  const git = options.git ?? defaultGit(repoRoot);
  const held = await steeringCompletionIndex(store, { gameId, steeringGate: game.steeringGate }, repoRoot) ?? new Set<string>();
  const resolved = git(["rev-parse", "--verify", `${options.oursRevision ?? "HEAD"}^{commit}`]);
  const ours = resolved.exitCode === 0 ? resolved.stdout.trim() : "";
  const fullRevisions = new Map<string, string | null>();
  const isOurs = (revision: string) => {
    if (!ours || !revision || revision.startsWith("-")) return false;
    if (!fullRevisions.has(revision)) {
      const full = git(["rev-parse", "--verify", `${revision}^{commit}`]);
      fullRevisions.set(revision, full.exitCode === 0 ? full.stdout.trim() : null);
    }
    return fullRevisions.get(revision) === ours;
  };

  return ({ unit, symbol, sourcePath }) => {
    const units = steeringUnitCandidates(unit, sourcePath, gameId);
    for (const candidate of units) {
      if (!unitKeyedHas(held, unverifiedMatchKey(candidate, symbol))) continue;
      const unverified = activeUnverifiedMatch(store, { gameId, unit: candidate, symbol });
      return { status: unverified ? "unverified" : "rollback_held", verdict: unverified ? "unverified_match" : "steering_rollback" };
    }
    if (!ours) return { status: "uncertified", verdict: "ours_revision_unreadable" };
    let stale: string | null = null;
    for (const candidate of units) {
      const backfill = latestSteeringBackfill(store, { gameId, unit: candidate, symbol });
      if (!backfill) continue;
      if (isOurs(backfill.analyzedRev)) {
        return backfill.verdict === "pass" ? { status: "certified", verdict: "pass" } : { status: "uncertified", verdict: backfill.verdict };
      }
      stale ??= `${backfill.verdict}@${backfill.analyzedRev.slice(0, 10)} (not a backfill at ours)`;
    }
    for (const candidate of units) {
      if (landedCertificateRevisions(store, gameId, candidate, symbol).some(isOurs)) return { status: "certified", verdict: "gate_pass" };
    }
    return stale ? { status: "uncertified", verdict: stale } : { status: "never_gated", verdict: null };
  };
}
