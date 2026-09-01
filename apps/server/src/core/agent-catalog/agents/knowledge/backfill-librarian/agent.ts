import { defineHarnessAgent } from "@server/core/agent-catalog/agent-definition.js";

import { context } from "./context.js";
import { prompt } from "./prompt.js";

export const agent = defineHarnessAgent({
  name: "backfill-librarian",
  description: "Fill out the knowledge records of one target and its directly linked entities by researching every available source, subject by subject.",
  model: "codex-lb/gpt-5.6-sol",
  coreTools: [
    "code_graph_search",
    "graph_related_functions",
    "kv2_discord_search",
    "kv2_wiki_search",
    "kv2_pr_search",
    "kv2_attempt_search",
    "kv2_subject_record",
    "kv2_entity_lookup",
    "kv2_resolve_locator",
    "kv2_unit_context",
  ],
  disallowedTools: [],
  extensions: false,
  canSpawnSubagent: false,
  variables: {},
  runInBackground: true,
  thinking: "medium",
  prompt,
  context,
  tools: null,
});

export default agent;
