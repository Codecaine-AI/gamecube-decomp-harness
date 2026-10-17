import { loadBoardSnapshot } from "@server/core/harness-runtime/phases/running/board";
import type { StackOnlyIndex, UnverifiedIndex } from "@server/core/harness-runtime/phases/running/board/candidates.js";
import type { BoardReadinessOptions } from "@server/core/harness-runtime/phases/running/board/readiness.js";
import type { BoardSnapshot } from "@server/core/shared/types";
import { codeGraphFunctionsIndexPath } from "./paths.js";
import type { GameValidationDefaults } from "../game-registry/resolver.js";

export interface LoadKnowledgeBoardSnapshotOptions {
  graphDbPath?: string;
  validation?: GameValidationDefaults;
  /** stop_at_frame games: functions recorded as done up to the stack frame. */
  stackOnly?: StackOnlyIndex;
  /** Steering-gated games: `unverified_match` functions (claimable at 100%, never done). */
  unverified?: UnverifiedIndex;
  /** Unverified targets whose compiler delta is one measured change: ranked first among the unverified. */
  unverifiedSingleChange?: ReadonlySet<string>;
  /** Ordering-active games: the epoch's class readiness (see `boardReadinessOptions`). */
  readiness?: BoardReadinessOptions;
}

export function loadKnowledgeBoardSnapshot(repoRoot: string, options: LoadKnowledgeBoardSnapshotOptions = {}): BoardSnapshot {
  return loadBoardSnapshot(repoRoot, {
    ...options.validation,
    ...(options.stackOnly ? { stackOnly: options.stackOnly } : {}),
    ...(options.unverified && options.unverified.size > 0 ? { unverified: options.unverified } : {}),
    ...(options.unverifiedSingleChange && options.unverifiedSingleChange.size > 0 ? { unverifiedSingleChange: options.unverifiedSingleChange } : {}),
    ...(options.readiness ?? {}),
    // An explicit game report must never fall back to another game's index.
    ...(!options.validation?.reportPath ? { codeGraphFunctionsIndexPath: codeGraphFunctionsIndexPath() } : {}),
  });
}
