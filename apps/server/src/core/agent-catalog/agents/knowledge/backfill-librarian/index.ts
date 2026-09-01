export {
  backfillLibrarianPrompt,
  type BackfillLibrarianPromptOptions,
} from "./prompt.js";

export const backfillLibrarianAgent = {
  id: "backfill-librarian",
  role: "librarian",
  toolProfile: "librarian",
  schemaPath: "apps/server/src/core/agent-catalog/agents/knowledge/backfill-librarian/schema.json",
  purpose: "Complete one target or entity record by searching every knowledge source against the current library state.",
} as const;
