/**
 * One-shot queue refill/refresh from the graph-ranked knowledge board,
 * mirroring trigger-agent's refillQueueFromBoard loop. Works on a paused run
 * (no run-status guard), so it can rebuild the queue after a sync/epoch
 * boundary without resuming workers.
 *
 * Usage:
 *   bun scripts/refill-queue-from-board.ts --state-dir projects/melee/state \
 *     --repo-root projects/melee/checkout --graph-db projects/melee/graph/graph.sqlite \
 *     [--run-id <id>] [--target-size n] [--candidate-window n] [--min-schedulable n]
 */
import { resolve } from "node:path";
import { loadKnowledgeBoardSnapshot } from "@decomp-orchestrator/knowledge";
import { getLatestRun, openState, refillQueuedTargets } from "@decomp-orchestrator/core/state";

function argValue(flag: string): string {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? (process.argv[index + 1] ?? "") : "";
}

const stateDir = resolve(argValue("--state-dir") || ".decomp-orchestrator-state");
const repoRoot = resolve(argValue("--repo-root") || ".");
const graphDbPath = resolve(argValue("--graph-db") || "knowledge/resource_graph/graph.sqlite");
const targetSize = Number(argValue("--target-size") || 128);
const minSchedulableSources = Number(argValue("--min-schedulable") || 32);
let candidateWindow = Number(argValue("--candidate-window") || 1024);

const store = openState(stateDir);
try {
  const runId = argValue("--run-id") || getLatestRun(store)?.id || "";
  if (!runId) throw new Error("No run found.");

  let combined = { inserted: 0, refreshed: 0 };
  for (;;) {
    const board = loadKnowledgeBoardSnapshot(repoRoot, candidateWindow, { graphDbPath });
    const refill = refillQueuedTargets(store, runId, board.candidates, { targetSize, minSchedulableSources });
    combined = { inserted: combined.inserted + refill.inserted, refreshed: combined.refreshed + refill.refreshed };
    const targetSatisfied = refill.queuedAfter >= targetSize && refill.schedulableAfter >= minSchedulableSources;
    const boardExhausted = board.candidates.length < candidateWindow;
    if (targetSatisfied || boardExhausted) {
      console.log(
        JSON.stringify(
          {
            runId,
            boardCandidates: board.candidates.length,
            candidateWindow,
            ...combined,
            queuedAfter: refill.queuedAfter,
            schedulableAfter: refill.schedulableAfter,
            targetSatisfied,
            boardExhausted,
          },
          null,
          2,
        ),
      );
      break;
    }
    candidateWindow *= 2;
  }
} finally {
  store.db.close();
}
