import { librarianV2Agent } from "@server/core/agent-catalog/agents/knowledge/librarian-v2/index.js";
import { backfillLibrarianAgent } from "@server/core/agent-catalog/agents/knowledge/backfill-librarian/index.js";
import { workerSummarizerAgent } from "@server/core/agent-catalog/agents/knowledge/worker-summarizer/index.js";

export const agentRegistry = {
  worker: {
    id: "worker",
    role: "worker",
    toolProfile: "worker",
    purpose: "Execute one claimed Melee decomp target while the runner owns checkpoints and lifecycle state.",
  },
  "librarian-v2": librarianV2Agent,
  "backfill-librarian": backfillLibrarianAgent,
  "worker-summarizer": workerSummarizerAgent,
} as const;

export type RegisteredAgentId = keyof typeof agentRegistry;
