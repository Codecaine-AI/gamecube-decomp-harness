import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { Database } from "bun:sqlite";

import {
  planBoundarySync,
  type BoundarySyncPlan,
  type BoundaryTargetState,
} from "@server/core/harness-runtime/phases/running/epochs/boundary-sync.js";
import { booleanArg, syncMergePolicyArg, type GlobalArgs } from "@server/core/game-registry/runtime-options.js";

interface BoundarySyncDryRunState {
  anchorSha: string;
  targets: BoundaryTargetState[];
}

type PlanBoundarySync = typeof planBoundarySync;

export function loadBoundarySyncDryRunState(stateDir: string, gameId?: string, runId?: string): BoundarySyncDryRunState {
  const databasePath = resolve(stateDir, "orchestrator.sqlite");
  if (!existsSync(databasePath)) throw new Error(`Boundary sync state database not found: ${databasePath}`);
  const db = new Database(databasePath, { readonly: true, strict: true });
  try {
    const owners = db.query(`SELECT game_id, state_json FROM harness_state
      WHERE (?1 IS NULL OR game_id = ?1)`).all(gameId ?? null) as Array<{ game_id: string; state_json: string }>;
    if (owners.length !== 1) throw new Error(`Boundary target discovery requires one game harness; found ${owners.length}`);
    const owner = owners[0]!;
    const state = JSON.parse(owner.state_json) as { source: { upstream_revision: string | null } };
    if (!state.source.upstream_revision) throw new Error(`No accepted upstream anchor found for game ${owner.game_id}`);
    if (runId) {
      const run = db.query("SELECT game_id FROM runs WHERE id = ?").get(runId) as { game_id: string | null } | null;
      if (!run) throw new Error(`Boundary target discovery run not found: ${runId}`);
      if (run.game_id !== owner.game_id) throw new Error(`Boundary target discovery run ${runId} does not belong to game ${owner.game_id}`);
    }

    const rows = db.query(`
      SELECT et.target_key, et.source_path, et.unit, et.symbol,
             ws.exact, ws.best_score
      FROM epoch_targets et
      JOIN worker_state ws ON ws.epoch_target_id = et.id
      JOIN runs r ON r.id = et.run_id
      WHERE r.game_id = ?1
        AND ws.best_checkpoint_id IS NOT NULL
      ORDER BY CASE WHEN et.run_id = ?2 THEN 0 ELSE 1 END,
               ws.ended_at DESC, ws.started_at DESC
    `).all(owner.game_id, runId ?? null) as Array<{
      target_key: string;
      source_path: string;
      unit: string;
      symbol: string;
      exact: number;
      best_score: number | null;
    }>;
    const byTarget = new Map<string, BoundaryTargetState>();
    for (const row of rows) {
      if (byTarget.has(row.target_key)) continue;
      byTarget.set(row.target_key, {
        targetKey: row.target_key,
        sourcePath: row.source_path,
        unit: row.unit,
        symbol: row.symbol,
        priorKind: row.exact ? "match" : "improvement",
        priorScore: row.best_score,
      });
    }
    return { anchorSha: state.source.upstream_revision, targets: [...byTarget.values()] };
  } finally {
    db.close();
  }
}

export async function boundarySync(
  globals: GlobalArgs,
  args: Map<string, string | true>,
  dependencies: {
    loadState?: typeof loadBoundarySyncDryRunState;
    plan?: PlanBoundarySync;
    print?: (plan: BoundarySyncPlan) => void;
  } = {},
): Promise<void> {
  if (!booleanArg(args, "--dry-run")) {
    throw new Error("Usage: boundary-sync --dry-run [--run-id <id>]");
  }
  const loadState = dependencies.loadState ?? loadBoundarySyncDryRunState;
  const runIdArg = args.get("--run-id");
  if (runIdArg === true) throw new Error("Missing value for --run-id. Usage: boundary-sync --dry-run [--run-id <id>]");
  const state = loadState(globals.stateDir, globals.game?.gameId ?? globals.gameId, runIdArg);
  const planInput: Parameters<PlanBoundarySync>[0] = {
    repoRoot: globals.repoRoot,
    anchorSha: state.anchorSha,
    targets: state.targets,
    dryRun: true,
  };
  if (args.has("--sync-merge-policy")) planInput.mergePolicy = syncMergePolicyArg(args);
  const plan = await (dependencies.plan ?? planBoundarySync)(planInput);
  (dependencies.print ?? ((value) => console.log(JSON.stringify(value, null, 2))))(plan);
}
