import type { PiPromptBundle, RunGameMetadata } from "@server/core/shared/types";
import { parseJsonObject } from "@server/infrastructure/agent-runtime/runtime";
import type { ConflictResolverRequest } from "./context.js";
import {
  conflictResolverPrompt,
  validateConflictResolverAgentResult,
  type ConflictResolverAgentResult,
} from "./prompt.js";

export interface ConflictResolverRunnerOptions {
  role: "conflict-resolver";
  cwd: string;
  prompt: PiPromptBundle;
  outputDir: string;
  dryRun: boolean;
  provider?: string;
  model?: string;
  thinkingLevel?: string;
  timeoutMs?: number;
  toolContext: {
    repoRoot: string;
    stateDir?: string;
    game?: RunGameMetadata;
  };
  executionContract: {
    worktreeKind: "isolated-conflict-worktree";
    cycleWorktreePath: string;
  };
}

export interface ConflictResolverRunnerResult {
  rawText: string;
  dryRun?: boolean;
  failed?: boolean;
  providerError?: string | null;
  error?: string | null;
  outputPath?: string;
}

export type ConflictResolverAgentRunner = (
  options: ConflictResolverRunnerOptions,
) => Promise<ConflictResolverRunnerResult>;

export interface ConflictResolutionAcceptance {
  applied: boolean;
  recorded: boolean;
  summary: string;
}

/**
 * Applies the resolver-produced patch to the cycle integration branch under
 * the queue's serial apply discipline and records the integration disposition.
 * Implementations must compensate or throw if either half cannot complete.
 */
export type ConflictResolutionAcceptor = (params: {
  request: ConflictResolverRequest;
  result: ConflictResolverAgentResult;
}) => Promise<ConflictResolutionAcceptance>;

export interface InvokeConflictResolverOptions {
  request: ConflictResolverRequest;
  outputDir: string;
  stateDir?: string;
  game?: RunGameMetadata;
  provider?: string;
  model?: string;
  thinkingLevel?: string;
  timeoutMs?: number;
  dryRun?: boolean;
  runner: ConflictResolverAgentRunner;
  acceptResolution: ConflictResolutionAcceptor;
}

export type ConflictResolverInvocationResult =
  | {
      status: "resolved";
      result: ConflictResolverAgentResult;
      acceptance: ConflictResolutionAcceptance;
    }
  | {
      status: "conflict";
      result: ConflictResolverAgentResult | null;
      fallback: {
        operator_visible_status: "conflict";
        reason: string;
        conflict_paths: string[];
        errors: string[];
      };
    };

function conflictFallback(
  request: ConflictResolverRequest,
  reason: string,
  errors: string[] = [],
  result: ConflictResolverAgentResult | null = null,
): ConflictResolverInvocationResult {
  return {
    status: "conflict",
    result,
    fallback: {
      operator_visible_status: "conflict",
      reason,
      conflict_paths: [...request.conflict_paths],
      errors,
    },
  };
}

/**
 * Provider-neutral invocation seam for merge-on-finish. It fails closed: agent,
 * parse, validation, apply, or persistence failures all return today's
 * operator-visible `conflict` disposition instead of throwing to the scheduler.
 */
export async function invokeConflictResolver(
  options: InvokeConflictResolverOptions,
): Promise<ConflictResolverInvocationResult> {
  const { request } = options;
  const isolatedPath = request.isolated_worktree.path.trim();
  if (!isolatedPath) {
    return conflictFallback(request, "isolated conflict worktree path is missing");
  }
  if (isolatedPath === request.cycle_worktree_path.trim()) {
    return conflictFallback(
      request,
      "isolated conflict worktree must differ from the cycle integration worktree",
    );
  }

  let run: ConflictResolverRunnerResult;
  try {
    run = await options.runner({
      role: "conflict-resolver",
      cwd: isolatedPath,
      prompt: conflictResolverPrompt({
        request,
        repoRoot: isolatedPath,
        stateDir: options.stateDir,
        game: options.game,
      }),
      outputDir: options.outputDir,
      dryRun: options.dryRun ?? false,
      provider: options.provider,
      model: options.model,
      thinkingLevel: options.thinkingLevel,
      timeoutMs: options.timeoutMs,
      toolContext: {
        repoRoot: isolatedPath,
        stateDir: options.stateDir,
        game: options.game,
      },
      executionContract: {
        worktreeKind: "isolated-conflict-worktree",
        cycleWorktreePath: request.cycle_worktree_path,
      },
    });
  } catch (error) {
    return conflictFallback(
      request,
      "conflict-resolver runner threw",
      [error instanceof Error ? error.message : String(error)],
    );
  }

  if (run.dryRun || run.failed || run.providerError) {
    return conflictFallback(request, "conflict-resolver agent did not complete", [
      run.error ?? run.providerError ?? (run.dryRun ? "dry-run" : "agent failed"),
    ]);
  }

  const parsed = parseJsonObject(run.rawText);
  if (!parsed.object) {
    return conflictFallback(request, "conflict-resolver output was not JSON", [
      parsed.error ?? "parse failed",
    ]);
  }
  const validated = validateConflictResolverAgentResult(parsed.object);
  if (!validated.result) {
    return conflictFallback(
      request,
      "conflict-resolver output failed validation",
      validated.errors,
    );
  }
  const result = validated.result;
  if (result.integration_item_id !== request.integration_item_id) {
    return conflictFallback(
      request,
      "conflict-resolver returned the wrong integration item id",
      [
        `expected ${request.integration_item_id}, received ${result.integration_item_id}`,
      ],
      result,
    );
  }
  if (result.conflict_group_id !== request.conflict_group_id) {
    return conflictFallback(
      request,
      "conflict-resolver returned the wrong conflict group id",
      [],
      result,
    );
  }
  if (result.outcome !== "resolved") {
    return conflictFallback(
      request,
      result.summary || "conflict-resolver could not resolve the conflict",
      [],
      result,
    );
  }

  let acceptance: ConflictResolutionAcceptance;
  try {
    acceptance = await options.acceptResolution({ request, result });
  } catch (error) {
    return conflictFallback(
      request,
      "resolved patch could not be applied and recorded",
      [error instanceof Error ? error.message : String(error)],
      result,
    );
  }
  if (!acceptance.applied || !acceptance.recorded) {
    return conflictFallback(
      request,
      "resolved patch acceptance was incomplete",
      [acceptance.summary],
      result,
    );
  }
  return { status: "resolved", result, acceptance };
}
