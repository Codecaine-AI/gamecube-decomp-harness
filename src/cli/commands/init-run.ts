import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { loadBoardSnapshot } from "../../board/index.js";
import { resourceGraphDbPath } from "../../knowledge/index.js";
import { addBoardTargets, createRun, openState } from "../../state/index.js";
import { numberArg, stringArg, type GlobalArgs } from "../args.js";

export async function initRun(globals: GlobalArgs, args: Map<string, string | true>): Promise<void> {
  const store = openState(globals.stateDir);
  const goalKind = stringArg(args, "--goal-kind", "matched_code_percent");
  const goalValue = numberArg(args, "--goal-value", 70);
  const desiredWorkers = numberArg(args, "--desired-workers", 16);
  const candidateLimit = numberArg(args, "--candidate-limit", Math.max(32, desiredWorkers * 2));
  const graphDbPath = stringArg(args, "--graph-db", resourceGraphDbPath());
  const run = createRun(store, goalKind, goalValue, desiredWorkers);
  const snapshot = loadBoardSnapshot(globals.repoRoot, candidateLimit, { graphDbPath });
  const targetCount = addBoardTargets(store, run.id, snapshot);
  await mkdir(resolve(globals.stateDir, "runs", run.id, "snapshots"), { recursive: true });
  await writeFile(resolve(globals.stateDir, "runs", run.id, "snapshots", "initial_board.json"), JSON.stringify(snapshot, null, 2));
  console.log(JSON.stringify({ run, targetCount, stateDir: globals.stateDir, measures: snapshot.measures }, null, 2));
}
