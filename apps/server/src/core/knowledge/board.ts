import { loadBoardSnapshot } from "@server/core/cycle-runtime/phases/running/board";
import type { BoardSnapshot } from "@server/core/shared/types";
import { codeGraphFunctionsIndexPath } from "./paths.js";

export interface LoadKnowledgeBoardSnapshotOptions {
  graphDbPath?: string;
  reportRelPath?: string;
}

export function loadKnowledgeBoardSnapshot(repoRoot: string, options: LoadKnowledgeBoardSnapshotOptions = {}): BoardSnapshot {
  return loadBoardSnapshot(repoRoot, { codeGraphFunctionsIndexPath: codeGraphFunctionsIndexPath(), reportRelPath: options.reportRelPath });
}
