import { parse } from "./args.js";
import {
  babysit,
  checkpointRun,
  initRun,
  kgFileCard,
  kgCurate,
  kgImportAgentState,
  kgMaintain,
  kgRankFeatures,
  kgRebuildGraph,
  kgSearch,
  kgSmoke,
  kgSources,
  kgStatus,
  prSplitPlan,
  recoverLeases,
  regressionCheck,
  reportRun,
  status,
  tick,
  triggerAgent,
  worker,
} from "./commands/index.js";
import { usage } from "./usage.js";
import { loadLocalEnv } from "../env/local.js";

export async function main(argv = process.argv.slice(2)): Promise<void> {
  loadLocalEnv();
  const { command, globals, args } = parse(argv);
  if (command === "init-run") await initRun(globals, args);
  else if (command === "tick") await tick(globals, args);
  else if (command === "worker") await worker(globals, args);
  else if (command === "trigger-agent" || command === "bootstrap") await triggerAgent(globals, args);
  else if (command === "babysit") await babysit(globals, args);
  else if (command === "checkpoint-run") await checkpointRun(globals, args);
  else if (command === "recover-leases") await recoverLeases(globals, args);
  else if (command === "report-run") await reportRun(globals, args);
  else if (command === "regression-check") await regressionCheck(globals, args);
  else if (command === "pr-split-plan") await prSplitPlan(globals, args);
  else if (command === "kg-sources") await kgSources();
  else if (command === "kg-status") await kgStatus(args);
  else if (command === "kg-import-agent-state") await kgImportAgentState(args);
  else if (command === "kg-curate") await kgCurate(globals, args);
  else if (command === "kg-maintain") await kgMaintain(globals, args);
  else if (command === "kg-rebuild-graph") await kgRebuildGraph(globals, args);
  else if (command === "kg-search") await kgSearch(globals, args);
  else if (command === "kg-smoke") await kgSmoke(globals, args);
  else if (command === "kg-file-card") await kgFileCard(globals, args);
  else if (command === "kg-rank-features") await kgRankFeatures(globals, args);
  else if (command === "status") await status(globals);
  else throw new Error(`Unknown command: ${command}\n\n${usage()}`);
}
