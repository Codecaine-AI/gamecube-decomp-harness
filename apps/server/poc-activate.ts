// Temporary phase-3 PoC helper: activate the disposable run and print the dispatch lease id.
import { randomUUID } from "node:crypto";
import { openState } from "@server/core/orchestrator-state";
import { activateRun } from "@server/core/cycle-runtime/phases/running/run-control.js";

const [stateDir, runId] = process.argv.slice(2);
if (!stateDir || !runId) throw new Error("usage: bun poc-activate.ts <stateDir> <runId>");
const store = openState(stateDir);
try {
  const activation = activateRun({
    actor: "operator",
    commandId: `command-poc-activate-${randomUUID()}`,
    gameId: "melee",
    reason: "daytona phase-3 live PoC (disposable state dir)",
    runId,
    store,
  });
  console.log(JSON.stringify({ leaseId: activation.leaseId, status: activation.run.status }));
} finally {
  store.db.close();
}
