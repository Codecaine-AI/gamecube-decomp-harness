import { defineHarnessAgent } from "@server/core/agent-catalog/agent-definition.js";

import { context } from "./context.js";
import { prompt } from "./prompt.js";
import { tools } from "./tools.js";

export const agent = defineHarnessAgent({
  name: "worker",
  description: "Execute one claimed Melee decomp target while the runner owns checkpoints and lifecycle state.",
  model: "codex-lb/gpt-5.6-sol",
  coreTools: [
      "code_graph_file_card",
      "code_graph_search",
      "knowledge_graph_search",
      "graph_related_functions",
      "past_prs_search",
      "kv2_subject_record",
      "kv2_pr_search",
      "kv2_discord_search",
      "kv2_wiki_search",
      "kv2_attempt_search",
      "kv2_resolve_locator",
      "mwcc_debug_lookup",
      "checkdiff_run",
      "checkdiff_summary",
      "direct_compile_tu",
      "objdiff_score_candidate",
      "mwcc_debug_dump_function",
      "mwcc_debug_diagnose_stack",
      "mwcc_debug_diagnose_regflow",
      "mwcc_debug_diagnose_inlines",
      "mwcc_alloc_snapshot",
      "mwcc_alloc_compare",
      "source_permuter_run",
      "source_permuter_replay",
      "source_mutation_preview",
      "type_oracle_lookup",
      "m2c_decompile",
      "asm_window_search",
      "type_layout_lookup",
      "review_lint_scan",
      "review_lint_sdata2_order_helper",
  ],
  disallowedTools: [],
  extensions: false,
  canSpawnSubagent: false,
  variables: {},
  runInBackground: false,
  thinking: "xhigh",
  prompt,
  context,
  tools,
});

export default agent;
