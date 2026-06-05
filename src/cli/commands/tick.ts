import { resolve } from "node:path";
import { directorPrompt, directorQueuedTargets } from "../../agents/director/index.js";
import { runPiAgent } from "../../agents/runtime/index.js";
import { loadBoardSnapshot } from "../../board/index.js";
import {
  activeWorkerCount,
  addDirectorCycle,
  addPiSession,
  getLatestRun,
  getRun,
  markEventHandled,
  nextUnhandledEvent,
  openState,
  prioritizeQueuedTargets,
} from "../../state/index.js";
import { numberArg, stringArg, type GlobalArgs } from "../args.js";
import { assertSchedulableRun } from "./shared.js";

export interface DirectorTickResult {
  runId: string;
  status?: "no_unhandled_events";
  handledEvent?: unknown;
  unhandledEvent?: unknown;
  directorCycleId?: string;
  directorOutput?: string;
  directorSystemPrompt?: string;
  directorUserPrompt?: string;
  directorTargetUpdates?: number;
  directorTargetPackets?: number;
  directorTargetPacketsSkipped?: number;
  directorTargetParseError?: string | null;
  directorPiError?: string | null;
  partialDirectorOutputUsed?: boolean;
  dryRun?: boolean;
  failed?: boolean;
}

export async function runDirectorTick(globals: GlobalArgs, args: Map<string, string | true>): Promise<DirectorTickResult> {
  const store = openState(globals.stateDir);
  try {
    const runId = stringArg(args, "--run-id", getLatestRun(store)?.id ?? "");
    if (!runId) throw new Error("No run found. Run init-run first.");
    const run = getRun(store, runId);
    if (!run) throw new Error(`Run not found: ${runId}`);
    assertSchedulableRun(run, "tick");
    const event = nextUnhandledEvent(store, runId);
    if (!event) return { runId, status: "no_unhandled_events" };

    const candidateLimit = numberArg(args, "--candidate-limit", 50);
    const snapshot = loadBoardSnapshot(globals.repoRoot, candidateLimit);
    const outputDir = resolve(globals.stateDir, "runs", runId, "director_cycles");
    const activeWorkers = activeWorkerCount(store, runId);
    const initialBoardPath = resolve(globals.stateDir, "runs", runId, "snapshots", "initial_board.json");
    const result = await runPiAgent({
      role: "director",
      cwd: globals.repoRoot,
      prompt: directorPrompt({
        run,
        snapshot,
        event,
        activeWorkers,
        repoRoot: globals.repoRoot,
        stateDir: globals.stateDir,
        initialBoardPath,
      }),
      outputDir,
      dryRun: globals.dryRunAgents,
      provider: globals.provider,
      model: globals.model,
      thinkingLevel: globals.thinkingLevel,
      timeoutMs: globals.agentTimeoutSeconds ? globals.agentTimeoutSeconds * 1000 : undefined,
    });
    addPiSession({
      store,
      runId,
      role: "director",
      sessionId: result.sessionId,
      sessionFile: result.sessionFile,
      provider: globals.provider,
      model: globals.model,
      thinkingLevel: globals.thinkingLevel,
      status: result.failed ? "failed" : result.dryRun ? "dry_run" : "succeeded",
      outputPath: result.outputPath,
    });
    const directorCycleId = addDirectorCycle({
      store,
      runId,
      triggerEvent: String(event.id),
      activeWorkers,
      summaryPath: result.outputPath,
      decisionPath: result.outputPath,
    });
    const directorTargets = directorQueuedTargets(result.rawText, snapshot);
    const prioritizedTargets = directorTargets.candidates.length ? prioritizeQueuedTargets(store, runId, directorTargets.candidates) : 0;
    const handled = directorTargets.candidates.length > 0 || (!result.failed && !directorTargets.error);
    if (handled) markEventHandled(store, String(event.id));
    return {
      runId,
      handledEvent: handled ? event.id : null,
      unhandledEvent: handled ? null : event.id,
      directorCycleId,
      directorOutput: result.outputPath,
      directorSystemPrompt: result.systemPromptPath,
      directorUserPrompt: result.userPromptPath,
      directorTargetUpdates: prioritizedTargets,
      directorTargetPackets: directorTargets.candidates.length,
      directorTargetPacketsSkipped: directorTargets.skipped,
      directorTargetParseError: directorTargets.error ?? null,
      directorPiError: result.error ?? null,
      partialDirectorOutputUsed: Boolean(result.failed && directorTargets.candidates.length > 0),
      dryRun: result.dryRun,
      failed: result.failed ?? false,
    };
  } finally {
    store.db.close();
  }
}

export async function tick(globals: GlobalArgs, args: Map<string, string | true>): Promise<void> {
  console.log(JSON.stringify(await runDirectorTick(globals, args), null, 2));
}
