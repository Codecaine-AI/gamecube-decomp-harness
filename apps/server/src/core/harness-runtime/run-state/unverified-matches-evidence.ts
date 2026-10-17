import type { StateStore } from "@server/core/orchestrator-state";
import { branchSteeringHolds, type SteeringPrHoldReason } from "@server/core/harness-runtime/phases/pr/checkpoint/steering-holds.js";
import { steeringGateActive } from "@server/core/tools/steering-gate.js";
import { listSteeringRollbacks } from "./steering.js";
import { canonicalUnit, targetKey } from "./unit-key.js";
import { listUnverifiedMatches, type RevAncestry } from "./unverified-matches.js";

/**
 * The hold list a sandbox's `real_code_evidence usage` reads to tell
 * certified siblings from "100% but unverified" ones (plan 3.0). The Python
 * tool cannot read the orchestrator store, so the server writes this file
 * into the sandbox at provisioning; `evidence_search.py` reads it from
 * `--unverified-json`, else `$ORCH_UNVERIFIED_MATCHES_JSON`, else
 * `UNVERIFIED_MATCHES_EVIDENCE_PATH` in the checkout. Without a valid file a
 * sibling is `unknown` (never evidence) unless the gate is confirmed off.
 *
 * The list is derived at the sandbox's exact `revision`, so a certification
 * that landed after it never certifies the older body the sandbox holds:
 *
 * - an active `unverified_match` row is listed;
 * - a cleared row is listed unless its `cleared_rev` is `revision` or an
 *   ancestor of it (a clear without a recorded rev never counts);
 * - a function whose latest steering rollback has no certifying rev that is
 *   `revision` or an ancestor of it is listed (`branchSteeringHolds`, the
 *   PR publication rule);
 * - without a `revision`, every row and rollback with history is listed.
 *
 * Python side: on a gated game a listed sibling is `unverified` at its
 * `analyzed_rev`; every other sibling is `certified` at `revision`. A game
 * whose gate is off (Melee) gets `gate_active: false` and no rows: every
 * sibling is `ungated`. Write the file for every game, Melee included, so the
 * tool can tell "gate off" from "data missing". Rows name the canonical unit
 * (no module prefix, as the gate does); the tool matches on the symbol.
 */
export const UNVERIFIED_MATCHES_EVIDENCE_SCHEMA = "orch-unverified-matches-v1";
export const UNVERIFIED_MATCHES_EVIDENCE_ENV = "ORCH_UNVERIFIED_MATCHES_JSON";
/** Checkout-relative path the tool reads when neither the flag nor the env is set. */
export const UNVERIFIED_MATCHES_EVIDENCE_PATH = "build/steering/unverified-matches.json";

export interface UnverifiedMatchesEvidenceRow {
  unit: string;
  symbol: string;
  /** The revision the hold's facts describe (backfill or rollback analysed rev); null when unknown. */
  analyzed_rev: string | null;
  /** The hold's trusted base (the unverified row's, or the rollback's); null when none was recorded. */
  base_rev: string | null;
  /** `unverified_match` (active, or cleared only after `revision`) or `steering_rollback`. */
  reason: SteeringPrHoldReason;
}

export interface UnverifiedMatchesEvidence {
  schema: typeof UNVERIFIED_MATCHES_EVIDENCE_SCHEMA;
  game_id: string;
  gate: string;
  gate_active: boolean;
  /** The checkout revision the sandbox is provisioned at; the list is valid only there. Null when unknown. */
  revision: string | null;
  generated_at: string;
  unverified: UnverifiedMatchesEvidenceRow[];
}

/** The game's holds at the sandbox `revision`, as the sandbox evidence tool reads them. */
export async function unverifiedMatchesEvidence(
  store: StateStore,
  game: { gameId: string; matching?: { steeringGate?: string | null } | null },
  options: { revision: string | null | undefined; isAncestor: RevAncestry; generatedAt?: string },
): Promise<UnverifiedMatchesEvidence> {
  const gate = game.matching?.steeringGate ?? "off";
  const active = steeringGateActive(gate);
  const revision = options.revision || null;
  const base = {
    schema: UNVERIFIED_MATCHES_EVIDENCE_SCHEMA,
    game_id: game.gameId,
    gate,
    gate_active: active,
    revision,
    generated_at: options.generatedAt ?? new Date().toISOString(),
  } as const;
  if (!active) return { ...base, unverified: [] };

  /** `rev` is the sandbox revision or one of its ancestors; unknown, a throw or a rejection is no. */
  const reached = async (rev: string | null | undefined): Promise<boolean> => {
    if (!rev || !revision) return false;
    if (rev === revision) return true;
    try {
      return (await options.isAncestor(rev, revision)) === true;
    } catch {
      return false;
    }
  };

  const key = (unit: string, symbol: string) => targetKey(game.gameId, unit, symbol);
  const rows = new Map<string, UnverifiedMatchesEvidenceRow>();
  for (const row of listUnverifiedMatches(store, game.gameId, { includeCleared: true })) {
    if (row.clearedAt !== null && await reached(row.clearedRev)) continue;
    rows.set(key(row.unit, row.symbol), { unit: row.unit, symbol: row.symbol, analyzed_rev: row.analyzedRev, base_rev: row.baseRev, reason: "unverified_match" });
  }
  const rollbacks = new Map(listSteeringRollbacks(store, game.gameId).map((rollback) => [key(rollback.unit, rollback.symbol), rollback]));
  for (const hold of await branchSteeringHolds(store, { gameId: game.gameId, steeringGate: gate }, (rev) => reached(rev))) {
    const holdKey = key(hold.unit, hold.symbol);
    if (rows.has(holdKey)) continue;
    rows.set(holdKey, {
      unit: canonicalUnit(game.gameId, hold.unit),
      symbol: hold.symbol,
      analyzed_rev: (hold.reason === "steering_rollback" ? rollbacks.get(holdKey)?.analyzedRev : null) ?? null,
      base_rev: (hold.reason === "steering_rollback" ? rollbacks.get(holdKey)?.baseRev : null) ?? null,
      reason: hold.reason,
    });
  }
  return { ...base, unverified: [...rows.values()].sort((left, right) => key(left.unit, left.symbol).localeCompare(key(right.unit, right.symbol))) };
}

/** The file body to write at `UNVERIFIED_MATCHES_EVIDENCE_PATH` (or the env's path) in the sandbox. */
export async function unverifiedMatchesEvidenceJson(...args: Parameters<typeof unverifiedMatchesEvidence>): Promise<string> {
  return `${JSON.stringify(await unverifiedMatchesEvidence(...args))}\n`;
}
