import { defineAgent } from "@agent-kernel/kernel/agent-definition";

import { context } from "./context.js";
import { prompt } from "./prompt.js";
import { tools } from "./tools.js";

export const agent = defineAgent({
  name: "worker",
  description: "Execute one claimed Melee decomp target while the runner owns checkpoints and lifecycle state.",
  model: "codex-lb/gpt-5.5",
  coreTools: [
      "code_graph_file_card",
      "code_graph_search",
      "past_prs_search",
      "ghidra_lookup",
      "opseq_similar_functions",
      "mismatch_db_search",
      "mwcc_debug_lookup",
      "checkdiff_run",
      "checkdiff_summary",
      "direct_compile_tu",
      "objdiff_score_candidate",
      "mwcc_debug_dump_function",
      "mwcc_debug_diagnose_stack",
      "mwcc_debug_diagnose_regflow",
      "mwcc_debug_diagnose_inlines",
      "source_permuter_run",
      "source_permuter_replay",
      "source_mutation_preview",
      "type_oracle_lookup",
      "m2c_decompile",
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
