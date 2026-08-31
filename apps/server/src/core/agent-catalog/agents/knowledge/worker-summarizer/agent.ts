import { defineHarnessAgent } from "@server/core/agent-catalog/agent-definition.js";

import { context } from "./context.js";
import { prompt } from "./prompt.js";

export const agent = defineHarnessAgent({
  name: "worker-summarizer",
  description: "Turn one worker transcript and its deterministic run digest into narrative run and submission reasoning.",
  model: "codex-lb/gpt-5.6-sol",
  coreTools: [],
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
