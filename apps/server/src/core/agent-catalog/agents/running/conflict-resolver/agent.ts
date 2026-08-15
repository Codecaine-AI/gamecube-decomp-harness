import { defineHarnessAgent } from "@server/core/agent-catalog/agent-definition.js";

import { context } from "./context.js";
import { prompt } from "./prompt.js";
import { tools } from "./tools.js";

export const agent = defineHarnessAgent({
  name: "conflict-resolver",
  description:
    "Resolve one merge-on-finish worker-output conflict in an isolated worktree, producing a runner-applied patch or a safe conflict fallback.",
  model: "codex-lb/gpt-5.5",
  coreTools: [
    "code_graph_file_card",
    "code_graph_search",
    "checkdiff_run",
    "checkdiff_summary",
    "direct_compile_tu",
    "objdiff_score_candidate",
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
