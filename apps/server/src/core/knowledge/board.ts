import { loadBoardSnapshot } from "@server/core/session-runtime/phases/running/board";
import type { BoardSnapshot } from "@server/core/shared/types";
import type { CandidateRerankMode } from "@server/core/shared/types/board.js";
import { codeGraphFunctionsIndexPath, resourceGraphDbPath } from "./paths.js";
import { withRankFeatureProvider } from "./graph/rank.js";

export interface LoadKnowledgeBoardSnapshotOptions {
  candidateRerank?: CandidateRerankMode;
  graphDbPath?: string;
}

export function loadKnowledgeBoardSnapshot(repoRoot: string, limit: number, options: LoadKnowledgeBoardSnapshotOptions = {}): BoardSnapshot {
  const graphDbPath = options.graphDbPath ?? resourceGraphDbPath();
  return withRankFeatureProvider(graphDbPath, (rankFeatureProvider) =>
    loadBoardSnapshot(repoRoot, limit, {
      candidateRerank: options.candidateRerank,
      codeGraphFunctionsIndexPath: codeGraphFunctionsIndexPath(),
      rankFeatureProvider,
    }),
  );
}
