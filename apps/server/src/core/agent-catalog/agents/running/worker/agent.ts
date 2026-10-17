import { defineHarnessAgent } from "@server/core/agent-catalog/agent-definition.js";

import { context } from "./context.js";
import { prompt } from "./prompt.js";
import { defaultWorkerToolProfile } from "@server/core/tools/profiles/defaults.js";
import { tools } from "./tools.js";

export const agent = defineHarnessAgent({
  name: "worker",
  description: "Execute one claimed Melee decomp target while the runner owns checkpoints and lifecycle state.",
  model: "codex-lb/gpt-6-astra",
  // The static worker profile; game-gated tools (steering gate, code graph) are added at launch.
  coreTools: [...defaultWorkerToolProfile],
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
