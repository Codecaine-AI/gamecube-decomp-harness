import type { OperationRecord } from "@server/application/dashboard/operation-state";
import type { ManagedProcessController } from "@server/infrastructure/process-control/managed-process-controller";
import type { ResolvedGame } from "@server/core/game-registry";

type JsonObject = Record<string, unknown>;

export interface ProcessStatusService {
  processStatus: (stateDir?: string, game?: ResolvedGame | null) => JsonObject;
}

export interface ProcessStatusServiceDeps {
  defaultStateDir: string;
  getOperationSnapshot: () => OperationRecord | null;
  preparingState: () => { freshRunActive: boolean; gameSyncActive: boolean };
  processController: ManagedProcessController;
}

export function createProcessStatusService(deps: ProcessStatusServiceDeps): ProcessStatusService {
  function processStatus(stateDir = deps.defaultStateDir, game: ResolvedGame | null = null): JsonObject {
    const preparingState = deps.preparingState();
    return deps.processController.status({
      freshRunActive: preparingState.freshRunActive,
      operation: deps.getOperationSnapshot() as unknown as JsonObject | null,
      game,
      gameSyncActive: preparingState.gameSyncActive,
      stateDir,
    });
  }

  return { processStatus };
}
