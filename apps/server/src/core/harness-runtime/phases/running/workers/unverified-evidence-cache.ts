import { createHash } from "node:crypto";
import type { StateStore } from "@server/core/orchestrator-state";
import { steeringHoldLedger } from "@server/core/harness-runtime/phases/pr/checkpoint/steering-holds.js";
import { listUnverifiedMatches, type RevAncestry } from "@server/core/harness-runtime/run-state/unverified-matches.js";
import { unverifiedMatchesEvidenceJson } from "@server/core/harness-runtime/run-state/unverified-matches-evidence.js";
import { gitRevAncestry } from "@server/core/validation/steering/unverified-certification.js";
import { steeringGateActive } from "@server/core/tools/steering-gate.js";
import { runCommand } from "@server/infrastructure/shell";

/**
 * The unverified-matches inventory every worker sandbox gets
 * (`UNVERIFIED_MATCHES_EVIDENCE_PATH`), shared across workers. At 200 workers
 * regenerating it per claim serialised git ancestry checks on the dispatcher;
 * the inventory only changes with the game, the claim's base revision and the
 * hold state, so it is cached on exactly those, its ancestry checks run
 * asynchronously, and each (ancestor, revision) pair is checked once.
 */
export type AsyncGitRunner = (repoRoot: string, command: string[]) => Promise<{ exitCode: number }>;

type EvidenceGame = Parameters<typeof unverifiedMatchesEvidenceJson>[1];

const MAX_CACHED_INVENTORIES = 32;
const ANCESTRY_TIMEOUT_MS = 60_000;
const inventories = new Map<string, Promise<string>>();

const defaultGit: AsyncGitRunner = (repoRoot, command) => runCommand(repoRoot, command, { timeoutMs: ANCESTRY_TIMEOUT_MS });

/**
 * A cheap version of everything the inventory reads besides git: the gate
 * mode, every unverified row (cleared ones included, with their clear rev),
 * and the hold ledger's rollbacks with their certifying revisions. Store
 * reads only; any hold change yields a new version.
 */
export function unverifiedEvidenceHoldVersion(store: StateStore, game: EvidenceGame): string {
  const gate = game.matching?.steeringGate ?? "off";
  if (!steeringGateActive(gate)) return `gate:${gate}`;
  const rows = listUnverifiedMatches(store, game.gameId, { includeCleared: true })
    .map((row) => [row.unit, row.symbol, row.analyzedRev, row.baseRev, row.recordedAt, row.clearedAt, row.clearedRev]);
  const rollbacks = (steeringHoldLedger(store, { gameId: game.gameId, steeringGate: gate })?.rollbacks ?? [])
    .map(({ key, rollback, revs }) => [key, rollback.id, rollback.analyzedRev, rollback.baseRev, rollback.status, rollback.updatedAt, revs]);
  return createHash("sha256").update(JSON.stringify({ gate, rows, rollbacks })).digest("hex");
}

/** `RevAncestry` over async git that checks each (ancestor, descendant) pair once. */
export function dedupedRevAncestry(repoRoot: string, git: AsyncGitRunner = defaultGit): RevAncestry {
  const ancestry = gitRevAncestry(repoRoot, git);
  const answers = new Map<string, Promise<boolean>>();
  return (ancestor, descendant) => {
    const key = `${ancestor}\0${descendant}`;
    let answer = answers.get(key);
    if (!answer) answers.set(key, answer = Promise.resolve(ancestry(ancestor, descendant)));
    return answer;
  };
}

/** The inventory JSON for a sandbox at `revision`, reused while game, revision and hold version are unchanged. */
export function cachedUnverifiedMatchesEvidenceJson(
  store: StateStore,
  game: EvidenceGame,
  options: { revision: string; repoRoot: string; git?: AsyncGitRunner },
): Promise<string> {
  const key = JSON.stringify([options.repoRoot, game.gameId, options.revision, unverifiedEvidenceHoldVersion(store, game)]);
  const cached = inventories.get(key);
  if (cached) return cached;
  const inventory = unverifiedMatchesEvidenceJson(store, game, {
    revision: options.revision,
    isAncestor: dedupedRevAncestry(options.repoRoot, options.git),
  });
  inventories.set(key, inventory);
  inventory.catch(() => inventories.delete(key));
  while (inventories.size > MAX_CACHED_INVENTORIES) inventories.delete(inventories.keys().next().value!);
  return inventory;
}
