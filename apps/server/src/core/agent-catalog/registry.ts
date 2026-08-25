import { librarianAgent } from "@server/core/agent-catalog/agents/knowledge/librarian/index.js";
import { integrationResolverAgent } from "@server/core/agent-catalog/agents/running/integration-resolver/index.js";
import { prFixerAgent } from "@server/core/agent-catalog/agents/pr/fixer/index.js";
import { qaRepairAgent } from "@server/core/agent-catalog/agents/pr/qa-repair/index.js";
import { reconcileAgent } from "@server/core/agent-catalog/agents/pr/reconcile/index.js";
import { prReviewerAgent } from "@server/core/agent-catalog/agents/pr/reviewer/index.js";
import { prSplitterAgent } from "@server/core/agent-catalog/agents/pr/splitter/index.js";

export const agentRegistry = {
  worker: {
    id: "worker",
    role: "worker",
    toolProfile: "worker",
    purpose: "Execute one claimed Melee decomp target while the runner owns checkpoints and lifecycle state.",
  },
  "integration-resolver": integrationResolverAgent,
  "pr-reviewer": prReviewerAgent,
  "pr-fixer": prFixerAgent,
  "pr-splitter": prSplitterAgent,
  librarian: librarianAgent,
  reconcile: reconcileAgent,
  "qa-repair": qaRepairAgent,
} as const;

export type RegisteredAgentId = keyof typeof agentRegistry;
