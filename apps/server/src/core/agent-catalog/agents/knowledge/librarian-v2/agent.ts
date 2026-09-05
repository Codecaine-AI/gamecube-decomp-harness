import { defineHarnessAgent } from "@server/core/agent-catalog/agent-definition.js";

import { context } from "./context.js";
import { prompt } from "./prompt.js";

export const agent = defineHarnessAgent({
  name: "librarian-v2",
  description: "Curate evidence-grounded knowledge proposals from one event-driven index task without writing store state directly.",
  model: "codex-lb/gpt-5.6-sol",
  coreTools: [
    "code_graph_search",
    "graph_related_functions",
    "discord_search",
    "wiki_search",
    "pr_search",
    "attempt_search",
    "knowledge_record",
    "entity_lookup",
    "resolve_locator",
    "unit_context",
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
