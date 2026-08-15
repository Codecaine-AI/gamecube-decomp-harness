import {
  runFreshStep,
  serverJobPrefix,
  type FreshRunStep,
  type JsonObject,
  type PreparingRuntimeDeps,
  type PreparingRuntimeGameContext,
} from "../runtime-shared.js";

export function knowledgeGraphRefreshCommand(deps: PreparingRuntimeDeps, paths: PreparingRuntimeGameContext): string[] {
  return [
    ...serverJobPrefix(paths, deps.serverJobPath),
    "kg-maintain",
    "--graph-db",
    paths.graphDbPath,
    "--no-pr-index",
    "--no-tool-runners",
    "--no-tool-index",
  ];
}

export async function refreshKnowledgeForPrepare(
  deps: PreparingRuntimeDeps,
  steps: FreshRunStep[],
  paths: PreparingRuntimeGameContext,
): Promise<JsonObject> {
  deps.operationStep("refresh knowledge");
  await runFreshStep(
    deps,
    steps,
    "refresh knowledge",
    knowledgeGraphRefreshCommand(deps, paths),
    deps.packageRoot,
  );
  const step = steps.at(-1);
  return step ? { ...step } : {};
}
