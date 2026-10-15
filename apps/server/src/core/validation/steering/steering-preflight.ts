import type { ResolvedGame } from "@server/core/game-registry/resolver.js";
import type { StateStore } from "@server/core/orchestrator-state";
import { latestCleanSteeringBackfillRun } from "@server/core/harness-runtime/run-state/steering.js";
import { steeringGateEnforced } from "@server/core/tools/steering-gate.js";

/** Command an operator runs before the first enforced run; quoted in the preflight refusal. */
export function steeringBackfillCommand(gameId: string): string {
  return `bun run server:job -- steering-gate --game ${gameId} --repo <integration checkout> --base <upstream ref> --record --apply `
    + "(or, sharded: --from-reports '<check reports>' --apply, commit, re-run the shards, then --from-reports '<check reports>' --record)";
}

export type GitAncestorCheck = (repoRoot: string, ancestor: string, descendant: string) => boolean;

/** `git merge-base --is-ancestor`: exit 0 is yes; anything else (no, unknown rev, no repo) is no. */
export const gitIsAncestor: GitAncestorCheck = (repoRoot, ancestor, descendant) =>
  Bun.spawnSync(["git", "-C", repoRoot, "merge-base", "--is-ancestor", ancestor, descendant], { stdout: "ignore", stderr: "ignore" }).exitCode === 0;

/**
 * Enforce-mode run preflight (plan 3.5). A game whose `matching.steeringGate`
 * is `enforce` may only start or resume a run once a clean full steering
 * backfill exists whose baseline is an ancestor of the integration head:
 * from then on every banked change is certified by the gate. Off and shadow
 * games (Melee, SMS today) return immediately.
 */
export function assertSteeringGatePreflight(store: StateStore, input: {
  game?: Pick<ResolvedGame, "gameId" | "matching"> | null;
  gameId?: string | null;
  /** Integration checkout; its HEAD is the integration head unless `integrationHead` is given. */
  repoRoot: string;
  integrationHead?: string;
  command: string;
  isAncestor?: GitAncestorCheck;
}): void {
  if (!steeringGateEnforced(input.game?.matching?.steeringGate)) return;
  const gameId = input.game?.gameId ?? input.gameId ?? "";
  const head = input.integrationHead ?? "HEAD";
  const backfill = latestCleanSteeringBackfillRun(store, gameId);
  const fix = `Run the steering backfill on the integration checkout first: ${steeringBackfillCommand(gameId)}`;
  if (!backfill) {
    throw new Error(`Steering gate is enforce for ${gameId}; refusing to run ${input.command}: no clean steering backfill run is recorded. ${fix}`);
  }
  const isAncestor = input.isAncestor ?? gitIsAncestor;
  if (!isAncestor(input.repoRoot, backfill.baselineRev, head)) {
    throw new Error(
      `Steering gate is enforce for ${gameId}; refusing to run ${input.command}: the latest clean steering backfill (${backfill.baselineRev}) is not an ancestor of the integration head ${head} in ${input.repoRoot}. ${fix}`,
    );
  }
}
