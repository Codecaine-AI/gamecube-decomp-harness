import { markPreparingComplete as runtimeMarkPreparingComplete, startRunning as runtimeStartRunning } from "@server/core/cycle-runtime";
import { cycleProcessState } from "./process-state.js";
import { getActiveCycle, getOrCreateActiveCycle, updateCycle } from "./store.js";
import { openState } from "@server/core/cycle-runtime/run-state";
import type { GameSummary, ResolvedGame } from "@server/core/game-registry";
import { uiLog } from "@server/infrastructure/logging/ui-log";

type GameIdentity = {
  baseRef: string | null;
  graphDbPath: string | null;
  id: string;
  repoRoot: string | null;
  stateDir: string | null;
};

export interface CycleProcessMirror {
  mirrorProcessStateToCycle: (params: {
    command?: string[];
    createIfMissing?: boolean;
    endedAt?: string | null;
    graphDbPath?: string | null;
    name?: string | null;
    pid?: number | null;
    processFilePath?: string | null;
    game: ResolvedGame | GameSummary | null | undefined;
    repoRoot?: string | null;
    startedAt?: string | null;
    state?: string | null;
    stateDir: string;
  }) => void;
  gameIdentity: (game: ResolvedGame | GameSummary | null | undefined) => GameIdentity | null;
}

function stringValue(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

export function createCycleProcessMirror(): CycleProcessMirror {
  function gameIdentity(game: ResolvedGame | GameSummary | null | undefined): GameIdentity | null {
    if (!game) return null;
    const candidate = game as Partial<ResolvedGame & GameSummary>;
    const id = stringValue(candidate.gameId, stringValue(candidate.id));
    if (!id) return null;
    return {
      id,
      baseRef: stringValue(candidate.baseRef) || null,
      graphDbPath: stringValue(candidate.graphDbPath) || null,
      repoRoot: stringValue(candidate.repoRoot) || null,
      stateDir: stringValue(candidate.stateDir) || null,
    };
  }

  function mirrorProcessStateToCycle(params: Parameters<CycleProcessMirror["mirrorProcessStateToCycle"]>[0]): void {
    const identity = gameIdentity(params.game);
    if (!identity) return;
    const store = openState(params.stateDir);
    try {
      let record = params.createIfMissing
          ? getOrCreateActiveCycle(store.db, {
            gameId: identity.id,
            baseRef: identity.baseRef,
            actor: "runner",
            worktreeIdentity: params.repoRoot ?? identity.repoRoot ?? undefined,
          })
        : getActiveCycle(store.db, identity.id);
      if (!record) return;
      if (params.createIfMissing && record.phase === "preparing") {
        if (record.preparing_state_json.status !== "complete") {
          record = runtimeMarkPreparingComplete(store.db, { id: record.id }, {
            completion: { source: "process_start" },
            correlationId: record.cycle_uuid,
          }).record;
        }
        record = runtimeStartRunning(store.db, { id: record.id }, { correlationId: record.cycle_uuid }).record;
      }
      updateCycle(store.db, record.id, {
        process_state_json: cycleProcessState({
          command: params.command,
          endedAt: params.endedAt,
          graphDbPath: params.graphDbPath ?? identity.graphDbPath,
          name: params.name,
          pid: params.pid,
          processFilePath: params.processFilePath,
          gameId: identity.id,
          repoRoot: params.repoRoot ?? identity.repoRoot,
          cycleUuid: record.cycle_uuid,
          startedAt: params.startedAt,
          state: params.state,
          stateDir: params.stateDir ?? identity.stateDir,
        }),
      });
    } catch (error) {
      uiLog("stderr", `cycle process mirror failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      store.db.close();
    }
  }

  return { mirrorProcessStateToCycle, gameIdentity };
}
