import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { Database } from "bun:sqlite";

import {
  planBoundarySync,
  type BoundarySyncPlan,
  type BoundaryTargetState,
} from "@server/core/cycle-runtime/phases/running/epochs/boundary-sync.js";
import { booleanArg, type GlobalArgs } from "@server/core/game-registry/runtime-options.js";

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
    const cycle = db.query(`
      SELECT a.upstream_revision AS anchor_sha, c.active_run_id AS run_id, c.cycle_uuid
      FROM game_upstream_anchors a
      JOIN cycles c ON c.cycle_uuid = a.cycle_uuid
      WHERE (?1 IS NULL OR c.game_id = ?1)
        AND c.status IN ('active', 'blocked', 'closing')
      ORDER BY c.updated_at DESC
      LIMIT 1
    `).get(gameId ?? null) as { anchor_sha: string; run_id: string | null; cycle_uuid: string } | null;
    if (!cycle) throw new Error(`No active cycle upstream anchor found${gameId ? ` for game ${gameId}` : ""}`);
    if (runId) {
      const run = db.query("SELECT cycle_uuid FROM runs WHERE id = ?").get(runId) as { cycle_uuid: string | null } | null;
      if (!run) throw new Error(`Boundary target discovery run not found: ${runId}`);
      if (run.cycle_uuid !== cycle.cycle_uuid) {
        throw new Error(`Boundary target discovery run ${runId} does not belong to active cycle ${cycle.cycle_uuid}`);
      }
    }

    const rows = db.query(`
      SELECT et.target_key, et.source_path, et.unit, et.symbol,
             ws.exact, ws.best_score
      FROM epoch_targets et
      JOIN worker_state ws ON ws.epoch_target_id = et.id
      JOIN runs r ON r.id = et.run_id
      WHERE r.cycle_uuid = ?1
        AND ws.best_checkpoint_id IS NOT NULL
      ORDER BY CASE WHEN et.run_id = ?2 THEN 0 ELSE 1 END,
               ws.ended_at DESC, ws.started_at DESC
    `).all(cycle.cycle_uuid, runId ?? null) as Array<{
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
    return { anchorSha: cycle.anchor_sha, targets: [...byTarget.values()] };
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
  const plan = await (dependencies.plan ?? planBoundarySync)({
    repoRoot: globals.repoRoot,
    anchorSha: state.anchorSha,
    targets: state.targets,
    dryRun: true,
  });
  (dependencies.print ?? ((value) => console.log(JSON.stringify(value, null, 2))))(plan);
}
