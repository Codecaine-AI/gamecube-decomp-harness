export {
  workerSummarizerPrompt,
  type WorkerSummarizerPromptOptions,
} from "./prompt.js";

export const workerSummarizerAgent = {
  id: "worker-summarizer",
  role: "summarizer",
  toolProfile: "summarizer",
  schemaPath: "apps/server/src/core/agent-catalog/agents/knowledge/worker-summarizer/schema.json",
  purpose: "Explain one worker run and its submissions without duplicating deterministic runtime fields.",
} as const;
