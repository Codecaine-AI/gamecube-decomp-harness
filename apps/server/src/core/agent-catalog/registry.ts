import { librarianAgent } from "@server/core/agent-catalog/agents/knowledge/librarian/index.js";
import { workerSummarizerAgent } from "@server/core/agent-catalog/agents/knowledge/worker-summarizer/index.js";
import { integrationResolverAgent } from "@server/core/agent-catalog/agents/running/integration-resolver/index.js";

export const agentRegistry = {
  worker: {
    id: "worker",
    role: "worker",
    toolProfile: "worker",
    purpose: "Execute one claimed Melee decomp target while the runner owns checkpoints and lifecycle state.",
  },
  "integration-resolver": integrationResolverAgent,
  librarian: librarianAgent,
  "worker-summarizer": workerSummarizerAgent,
} as const;

export type RegisteredAgentId = keyof typeof agentRegistry;
