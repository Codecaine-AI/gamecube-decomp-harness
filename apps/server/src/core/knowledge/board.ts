import { loadBoardSnapshot } from "@server/core/harness-runtime/phases/running/board";
import type { BoardSnapshot } from "@server/core/shared/types";
import { codeGraphFunctionsIndexPath } from "./paths.js";
import type { GameValidationDefaults } from "../game-registry/resolver.js";

export interface LoadKnowledgeBoardSnapshotOptions {
  graphDbPath?: string;
  validation?: GameValidationDefaults;
}

export function loadKnowledgeBoardSnapshot(repoRoot: string, options: LoadKnowledgeBoardSnapshotOptions = {}): BoardSnapshot {
  return loadBoardSnapshot(repoRoot, {
    ...options.validation,
    // An explicit game report must never fall back to another game's index.
    ...(!options.validation?.reportPath ? { codeGraphFunctionsIndexPath: codeGraphFunctionsIndexPath() } : {}),
  });
}
