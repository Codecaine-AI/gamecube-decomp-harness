import { defineHarnessAgent } from "@server/core/agent-catalog/agent-definition.js";

import { context } from "./context.js";
import { prompt } from "./prompt.js";
import { tools } from "./tools.js";

export const agent = defineHarnessAgent({
  name: "pr-splitter",
  description: "Turn deterministic PR handoff evidence into review-sized, ordered PR slices without changing lane or ship-set facts.",
  model: "codex-lb/gpt-5.5",
  coreTools: [
      "code_graph_search",
      "past_prs_search",
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
