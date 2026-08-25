import { loadBoardSnapshot } from "@server/core/cycle-runtime/phases/running/board";
import type { BoardSnapshot } from "@server/core/shared/types";
import { codeGraphFunctionsIndexPath, resourceGraphDbPath } from "./paths.js";
import { withRankFeatureProvider } from "./graph/rank.js";

export interface LoadKnowledgeBoardSnapshotOptions {
  graphDbPath?: string;
}

export function loadKnowledgeBoardSnapshot(repoRoot: string, options: LoadKnowledgeBoardSnapshotOptions = {}): BoardSnapshot {
  const graphDbPath = options.graphDbPath ?? resourceGraphDbPath();
  return withRankFeatureProvider(graphDbPath, (rankFeatureProvider) =>
    loadBoardSnapshot(repoRoot, {
      codeGraphFunctionsIndexPath: codeGraphFunctionsIndexPath(),
      rankFeatureProvider,
    }),
  );
}
