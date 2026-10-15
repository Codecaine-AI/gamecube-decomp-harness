import { loadBoardSnapshot } from "@server/core/harness-runtime/phases/running/board";
import type { StackOnlyIndex } from "@server/core/harness-runtime/phases/running/board/candidates.js";
import type { BoardReadinessOptions } from "@server/core/harness-runtime/phases/running/board/readiness.js";
import type { BoardSnapshot } from "@server/core/shared/types";
import { codeGraphFunctionsIndexPath } from "./paths.js";
import type { GameValidationDefaults } from "../game-registry/resolver.js";

export interface LoadKnowledgeBoardSnapshotOptions {
  graphDbPath?: string;
  validation?: GameValidationDefaults;
  /** stop_at_frame games: functions recorded as done up to the stack frame. */
  stackOnly?: StackOnlyIndex;
  /** Ordering-active games: the epoch's class readiness (see `boardReadinessOptions`). */
  readiness?: BoardReadinessOptions;
}

export function loadKnowledgeBoardSnapshot(repoRoot: string, options: LoadKnowledgeBoardSnapshotOptions = {}): BoardSnapshot {
  return loadBoardSnapshot(repoRoot, {
    ...options.validation,
    ...(options.stackOnly ? { stackOnly: options.stackOnly } : {}),
    ...(options.readiness ?? {}),
    // An explicit game report must never fall back to another game's index.
    ...(!options.validation?.reportPath ? { codeGraphFunctionsIndexPath: codeGraphFunctionsIndexPath() } : {}),
  });
}
