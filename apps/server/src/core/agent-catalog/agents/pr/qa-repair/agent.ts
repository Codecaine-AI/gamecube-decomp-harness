import { defineAgent } from "@agent-kernel/kernel/agent-definition";

import { context } from "./context.js";
import { prompt } from "./prompt.js";
import { tools } from "./tools.js";

export const agent = defineAgent({
  name: "qa-repair",
  description: "Repair deterministic QA findings in PR-bound candidate files before PR split planning, then report minimal edits for runner-owned validation.",
  model: "codex-lb/gpt-5.5",
  coreTools: [
      "code_graph_file_card",
      "code_graph_search",
      "past_prs_search",
      "path_facts_resolve",
      "mismatch_db_search",
      "checkdiff_run",
      "checkdiff_summary",
      "direct_compile_tu",
      "objdiff_score_candidate",
      "source_mutation_preview",
      "type_oracle_lookup",
      "review_lint_scan",
      "review_lint_sdata2_order_helper",
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
