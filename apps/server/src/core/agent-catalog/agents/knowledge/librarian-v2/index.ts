export {
  librarianV2Prompt,
  type LibrarianV2PromptOptions,
} from "./prompt.js";

export const librarianV2Agent = {
  id: "librarian-v2",
  role: "librarian",
  toolProfile: "librarian",
  schemaPath: "apps/server/src/core/agent-catalog/agents/knowledge/librarian-v2/schema.json",
  purpose: "Propose evidence-grounded knowledge updates from one event-driven index task for later mechanical application.",
} as const;
