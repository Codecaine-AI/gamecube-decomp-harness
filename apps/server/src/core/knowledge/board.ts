import { loadBoardSnapshot } from "@server/core/cycle-runtime/phases/running/board";
import type { BoardSnapshot } from "@server/core/shared/types";
import { codeGraphFunctionsIndexPath } from "./paths.js";

export interface LoadKnowledgeBoardSnapshotOptions {
  graphDbPath?: string;
}

export function loadKnowledgeBoardSnapshot(repoRoot: string, _options: LoadKnowledgeBoardSnapshotOptions = {}): BoardSnapshot {
  return loadBoardSnapshot(repoRoot, { codeGraphFunctionsIndexPath: codeGraphFunctionsIndexPath() });
}
