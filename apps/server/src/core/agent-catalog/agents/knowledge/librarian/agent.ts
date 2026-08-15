import { defineHarnessAgent } from "@server/core/agent-catalog/agent-definition.js";

import { context } from "./context.js";
import { prompt } from "./prompt.js";
import { tools } from "./tools.js";

export const agent = defineHarnessAgent({
  name: "librarian",
  description: "Serve three knowledge doors: condense inbound material, curate graph-safe knowledge and source-update proposals, and index PRs into searchable postmortems.",
  model: "codex-lb/gpt-5.6-sol",
  coreTools: [
    "code_graph_search",
    "past_prs_search",
    "decomp_standards_context",
    "decomp_standards_proposals",
    "review_lint_scan",
    "smashwiki_search",
    "smashwiki_get_page",
    "ledger_search",
  ],
  disallowedTools: [],
  extensions: false,
  canSpawnSubagent: false,
  variables: {},
  runInBackground: true,
  thinking: "medium",
  prompt,
  context,
  tools,
});

export default agent;
