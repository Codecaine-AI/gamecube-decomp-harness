export {
  conflictResolverPrompt,
  validateConflictResolverAgentResult,
  type ConflictResolverAgentResult,
  type ConflictResolverPromptOptions,
} from "./prompt.js";
export {
  invokeConflictResolver,
  type ConflictResolverAgentRunner,
  type ConflictResolverInvocationResult,
  type ConflictResolverRunnerOptions,
  type ConflictResolverRunnerResult,
} from "./invocation.js";

export const conflictResolverAgent = {
  id: "conflict-resolver",
  role: "conflict-resolver",
  toolProfile: "conflict-resolver",
  purpose: "Resolve one merge-on-finish worker-output conflict in an isolated worktree and fail closed to operator-visible conflict state.",
} as const;
