import { defineHarnessAgent } from "@server/core/agent-catalog/agent-definition.js";

import { context } from "./context.js";
import { prompt } from "./prompt.js";
import { tools } from "./tools.js";

export const agent = defineHarnessAgent({
  name: "integration-resolver",
  description: "Resolve running-phase worker-output integration conflicts before PR handoff.",
  model: "codex-lb/gpt-5.5",
  coreTools: [
      "code_graph_file_card",
      "code_graph_search",
      "knowledge_graph_search",
      "past_prs_search",
      "checkdiff_run",
      "checkdiff_summary",
      "direct_compile_tu",
      "objdiff_score_candidate",
      "source_mutation_preview",
      "type_oracle_lookup",
      "include_fixer_preview",
      "review_lint_scan",
  ],
  disallowedTools: [],
  extensions: false,
  canSpawnSubagent: false,
  variables: {},
  runInBackground: false,
  thinking: "medium",
  prompt,
  context,
  tools,
});

export default agent;
