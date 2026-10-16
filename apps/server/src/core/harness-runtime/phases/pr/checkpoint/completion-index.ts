import type { StateStore } from "@server/core/orchestrator-state";
import { steeringGateActive } from "@server/core/tools/steering-gate.js";
import { UNKNOWN_COMPLETION_INDEX, type UnverifiedIndex } from "@server/core/harness-runtime/phases/running/board/candidates.js";
import type { RevisionCompletionIndex } from "@server/core/harness-runtime/phases/running/board/unverified-measures.js";
import {
  listUnverifiedMatches,
  unverifiedMatchKey,
  type UnverifiedMatchIndex,
  type UnverifiedMatchRecord,
} from "@server/core/harness-runtime/run-state/unverified-matches.js";
import { branchSteeringHolds, steeringHoldLedger } from "./steering-holds.js";

/**
 * Targets with no completion credit at this checkout's HEAD: active
 * unverified matches and rollbacks without a later, landed gate certificate.
 * This is a progress index, not the active unverified-match record store.
 */
export async function steeringCompletionIndex(
  store: StateStore,
  game: { gameId?: string | null; steeringGate?: string | null },
  repoRoot: string,
): Promise<ReadonlySet<string> | undefined> {
  if (!game.gameId || !steeringGateActive(game.steeringGate)) return undefined;
  const holds = await branchSteeringHolds(store, game, async (rev) => {
    if (!rev || rev.startsWith("-")) return false;
    return Bun.spawnSync(["git", "-C", repoRoot, "merge-base", "--is-ancestor", rev, "HEAD"],
      { stdout: "ignore", stderr: "ignore" }).exitCode === 0;
  });
  return new Set(holds.map((hold) => unverifiedMatchKey(hold.unit, hold.symbol)));
}

/**
 * The completion holds of saved revisions (save points, epoch reports,
 * board snapshots), the read-side twin of `steeringCompletionIndex`:
 * `at(rev)` withholds every active `unverified_match`, every cleared one
 * whose certifying revision (`clearedRev`) is not an ancestor of `rev` (the
 * saved source predates the certified version), and every latest
 * rollback none of whose certifying revs is an ancestor of `rev`. A missing
 * rev, a missing repository or ancestry git cannot establish clears no
 * rollback, so a later certificate on another revision never credits older
 * saved source. `active` keeps the active rows for labels and live counts.
 */
export interface SteeringCompletionHolds extends RevisionCompletionIndex {
  readonly active: UnverifiedMatchIndex;
}

const FULL_SHA = /^[0-9a-f]{40}(?:[0-9a-f]{24})?$/;
const ANCESTRY_CACHE_LIMIT = 4096;
/** Settled answers between two full commit shas only: those never change. */
const ancestry = new Map<string, boolean>();

function revIsAncestor(repoRoot: string, ancestor: string, descendant: string): boolean {
  if (!repoRoot || !ancestor || !descendant || ancestor.startsWith("-") || descendant.startsWith("-")) return false;
  const settled = FULL_SHA.test(ancestor) && FULL_SHA.test(descendant);
  const key = `${repoRoot}\0${ancestor}\0${descendant}`;
  const cached = settled ? ancestry.get(key) : undefined;
  if (cached !== undefined) return cached;
  let exitCode: number | null;
  try {
    exitCode = Bun.spawnSync(["git", "-C", repoRoot, "merge-base", "--is-ancestor", ancestor, descendant],
      { stdout: "ignore", stderr: "ignore" }).exitCode;
  } catch {
    return false;
  }
  // 0: ancestor, 1: not; anything else (an unknown object) is not settled.
  if (settled && (exitCode === 0 || exitCode === 1)) {
    if (ancestry.size >= ANCESTRY_CACHE_LIMIT) ancestry.delete(ancestry.keys().next().value as string);
    ancestry.set(key, exitCode === 0);
  }
  return exitCode === 0;
}

/**
 * The game's saved-revision completion holds, read once from the store;
 * undefined without an active gate (Melee: nothing is read). Throws when the
 * state cannot be read: callers publish `unknownCompletionHolds()` instead.
 */
export function steeringCompletionHolds(
  store: StateStore,
  game: { gameId?: string | null; steeringGate?: string | null },
  repoRoot: string | null | undefined,
): SteeringCompletionHolds | undefined {
  if (!game.gameId || !steeringGateActive(game.steeringGate)) return undefined;
  const active = new Map<string, UnverifiedMatchRecord>();
  const cleared: UnverifiedMatchRecord[] = [];
  for (const row of listUnverifiedMatches(store, game.gameId, { includeCleared: true })) {
    if (row.clearedAt === null) active.set(unverifiedMatchKey(row.unit, row.symbol), row);
    else cleared.push(row);
  }
  const ledger = steeringHoldLedger(store, game);
  const rollbacks = ledger?.rollbacks ?? [];
  const byRev = new Map<string, UnverifiedIndex>();
  return {
    unknown: false,
    active,
    at(rev) {
      const saved = rev ?? "";
      const cached = byRev.get(saved);
      if (cached) return cached;
      const keys = new Set(active.keys());
      for (const row of cleared) {
        const certified = Boolean(saved && row.clearedRev && (row.clearedRev === saved || revIsAncestor(repoRoot ?? "", row.clearedRev, saved)));
        if (!certified) keys.add(unverifiedMatchKey(row.unit, row.symbol));
      }
      for (const rollback of rollbacks) {
        if (keys.has(rollback.key)) continue;
        if (!saved || !rollback.revs.some((certified) => revIsAncestor(repoRoot ?? "", certified, saved))) keys.add(rollback.key);
      }
      byRev.set(saved, keys);
      return keys;
    },
  };
}

/** Holds of a game whose steering state could not be read: no labels, every completion figure unknown. */
export function unknownCompletionHolds(): SteeringCompletionHolds {
  return { unknown: true, active: new Map(), at: () => UNKNOWN_COMPLETION_INDEX };
}

/** The checkout's HEAD commit, or null when git cannot read it (`at(null)` clears nothing). */
export function checkoutHeadRevision(repoRoot: string | null | undefined): string | null {
  if (!repoRoot) return null;
  try {
    const result = Bun.spawnSync(["git", "-C", repoRoot, "rev-parse", "--verify", "HEAD"], { stdout: "pipe", stderr: "ignore" });
    return result.exitCode === 0 ? result.stdout.toString().trim() || null : null;
  } catch {
    return null;
  }
}

/** A completion index as `{ unit, symbol }` refs (graph and file-card labels). */
export function completionHoldRefs(index: UnverifiedIndex | undefined): Array<{ unit: string; symbol: string }> {
  return [...(index?.keys() ?? [])].map((key) => {
    // Only the first separator divides the unit from a possibly namespaced C++ symbol.
    const separator = key.indexOf("::");
    return { unit: key.slice(0, separator), symbol: key.slice(separator + 2) };
  });
}
