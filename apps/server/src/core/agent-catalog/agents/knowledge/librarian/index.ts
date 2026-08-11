export {
  librarianPrompt,
  prContextPromptXml,
  type LibrarianCondensePromptOptions,
  type LibrarianCurationPromptOptions,
  type LibrarianDoor,
  type LibrarianPrIndexingPromptOptions,
  type LibrarianPromptOptions,
} from "./prompt.js";

export const librarianAgent = {
  id: "librarian",
  role: "librarian",
  toolProfile: "librarian",
  schemaPath: "apps/server/src/core/agent-catalog/agents/knowledge/librarian/schema.json",
  purpose: "Serve the condense, curation, and pr_indexing knowledge doors through one librarian_v1 contract.",
} as const;
