/**
 * Requeue regressed symbols from an existing report_changes.json as
 * repair-priority targets, mirroring the Prepare Handoff "requeue rework"
 * block. Useful when an epoch run pauses on the regression threshold but the
 * regressions are understood (e.g. upstream-wins sync-merge resolutions) and
 * should still go back into the queue.
 *
 * Usage:
 *   bun scripts/requeue-regression-repairs.ts --state-dir projects/melee/state \
 *     --repo-root projects/melee/checkout [--run-id <id>] [--requeue-limit n] \
 *     [--changes-path build/GALE01/report_changes.json] [--apply]
 *
 * Without --apply the script prints the repair plan and changes nothing.
 */
import { resolve } from "node:path";
import { planRegressionRepair } from "@decomp-orchestrator/core/epoch";
import { readRegressionReport } from "@decomp-orchestrator/core/objdiff/report";
import { getLatestRun, openState, prioritizeQueuedTargets } from "@decomp-orchestrator/core/state";

function argValue(flag: string): string {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? (process.argv[index + 1] ?? "") : "";
}

const stateDir = resolve(argValue("--state-dir") || ".decomp-orchestrator-state");
const repoRoot = resolve(argValue("--repo-root") || ".");
const requeueLimit = Number(argValue("--requeue-limit") || 96);
const apply = process.argv.includes("--apply");

const store = openState(stateDir);
try {
  const runId = argValue("--run-id") || getLatestRun(store)?.id || "";
  if (!runId) throw new Error("No run found.");

  const changesPath = argValue("--changes-path") || "build/GALE01/report_changes.json";
  const report = await readRegressionReport(resolve(repoRoot, changesPath), "manual requeue", 0);
  const reworkEntries = [...report.brokenMatches, ...report.fuzzyRegressions];
  const sourcePaths = new Map<string, string>();
  for (const entry of reworkEntries) {
    if (entry.sourcePath) sourcePaths.set(entry.unitName, entry.sourcePath);
  }
  const plan = planRegressionRepair(report, { pauseThreshold: 0, repairPriorityBase: 400, requeueLimit, sourcePaths });
  console.log(JSON.stringify({ runId, summary: plan.summary, reasons: plan.reasons, candidates: plan.repairCandidates.length }, null, 2));
  for (const candidate of plan.repairCandidates) {
    console.log(`  ${candidate.priority.toFixed(1).padStart(7)}  ${candidate.unit}::${candidate.symbol}  (${candidate.reason})`);
  }
  if (!apply) {
    console.log("\nDry run: pass --apply to requeue these targets.");
  } else {
    const requeued = prioritizeQueuedTargets(store, runId, plan.repairCandidates);
    console.log(`\nRequeued ${requeued} target(s) at repair priority.`);
  }
} finally {
  store.db.close();
}
