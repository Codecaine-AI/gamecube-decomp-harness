import { randomUUID } from "node:crypto";
import type { StateStore } from "@server/core/orchestrator-state";
import { immediateTransaction } from "@server/core/orchestrator-state";
import { getCycleByUuid, transitionCycle, type CycleRecord } from "@server/core/cycle";
import type { DispatchLeaseRevalidator } from "@server/core/cycle-runtime/dispatch-guard";
import type {
  PreparingRuntimeDeps,
  PreparingRuntimeGameContext,
} from "../runtime-shared.js";
import { ensurePrepareWorktrees, type PrepareWorktreeResult } from "./worktrees.js";

export interface BootstrapCycleWorktreesOptions {
  actor?: "operator" | "runner";
  commandId?: string;
  revalidateLease?: DispatchLeaseRevalidator;
  now?: string;
}

export interface BootstrapCycleWorktreesResult extends PrepareWorktreeResult {
  baseRef: string;
  baseSha: string;
  cycle: CycleRecord;
}

function remoteForBaseRef(baseRef: string): string {
  const slash = baseRef.indexOf("/");
  return slash > 0 ? baseRef.slice(0, slash) : "origin";
}

export async function bootstrapCycleWorktrees(
  store: StateStore,
  paths: PreparingRuntimeGameContext,
  cycle: CycleRecord,
  deps: Pick<PreparingRuntimeDeps, "runGit">,
  options: BootstrapCycleWorktreesOptions = {},
): Promise<BootstrapCycleWorktreesResult> {
  if (cycle.status !== "active") {
    throw new Error(`Game cycle ${cycle.cycle_uuid} cannot be bootstrapped while ${cycle.status}`);
  }
  const baseRef = cycle.base_ref?.trim() || paths.game?.baseRef?.trim() || "origin/master";
  const remote = remoteForBaseRef(baseRef);
  options.revalidateLease?.();
  const fetched = await deps.runGit(paths.repoRoot, ["fetch", "--prune", remote], {
    failureHint: `Unable to fetch ${remote} while bootstrapping cycle ${cycle.cycle_uuid}`,
  });
  if (fetched.exitCode !== 0) {
    throw new Error(`Unable to fetch ${remote} while bootstrapping cycle ${cycle.cycle_uuid}`);
  }
  options.revalidateLease?.();
  const resolved = await deps.runGit(paths.repoRoot, ["rev-parse", "--verify", baseRef], {
    failureHint: `Unable to resolve ${baseRef} while bootstrapping cycle ${cycle.cycle_uuid}`,
  });
  const baseSha = resolved.stdout.trim();
  if (resolved.exitCode !== 0 || !baseSha) {
    throw new Error(`Unable to resolve ${baseRef} while bootstrapping cycle ${cycle.cycle_uuid}`);
  }

  const worktrees = await ensurePrepareWorktrees(
    deps as PreparingRuntimeDeps,
    paths,
    baseSha,
    cycle.cycle_uuid,
    options.revalidateLease,
  );
  const now = options.now ?? new Date().toISOString();
  const commandId = options.commandId ?? `command-cycle-bootstrap-${randomUUID()}`;
  const saved = immediateTransaction(store.db, () => {
    const current = getCycleByUuid(store.db, cycle.cycle_uuid);
    if (!current) throw new Error(`Game cycle not found: ${cycle.cycle_uuid}`);
    if (current.status !== "active") {
      throw new Error(`Game cycle ${cycle.cycle_uuid} cannot be bootstrapped while ${current.status}`);
    }
    const transitioned = transitionCycle(store.db, current.id, {
      eventType: "cycle.preparing_subphase_updated",
      expectedRevision: current.revision,
      gameId: current.game_id,
      cycleUuid: current.cycle_uuid,
      commandId,
      correlationId: current.cycle_uuid,
      actor: options.actor ?? "operator",
      occurredAt: now,
      patch: {
        base_ref: baseRef,
        base_sha: baseSha,
        head_revision: baseSha,
        preparing_state_json: {
          ...current.preparing_state_json,
          sync: {
            ...current.preparing_state_json.sync,
            status: "complete",
            completedAt: now,
            baseRef,
            afterRef: baseSha,
            cycleBranch: worktrees.cycleBranch,
            cycleCurrentWorktreePath: worktrees.cycleCurrentWorktreePath,
            cycleRootPath: worktrees.cycleRootPath,
            cycleWorktreePath: worktrees.cycleWorktreePath,
            upstreamWorktreePath: worktrees.upstreamWorktreePath,
            steps: worktrees.steps,
          },
        },
      },
      payload: { subphase: current.preparing_state_json.subphase },
    });
    if (!transitioned.caused_by_event_id) throw new Error("Cycle bootstrap transition did not produce an event");
    store.db.query(
      `INSERT INTO game_upstream_anchors (
         game_id, cycle_uuid, upstream_revision, sync_id, caused_by_event_id, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(game_id) DO UPDATE SET
         cycle_uuid = excluded.cycle_uuid,
         upstream_revision = excluded.upstream_revision,
         sync_id = excluded.sync_id,
         caused_by_event_id = excluded.caused_by_event_id,
         updated_at = excluded.updated_at`,
    ).run(
      current.game_id,
      current.cycle_uuid,
      baseSha,
      `bootstrap:${current.cycle_uuid}`,
      transitioned.caused_by_event_id,
      now,
    );
    return transitioned;
  });
  return { ...worktrees, baseRef, baseSha, cycle: saved };
}
