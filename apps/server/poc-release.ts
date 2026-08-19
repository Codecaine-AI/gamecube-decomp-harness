// Temporary phase-3 PoC helper: fail an abandoned run and release its dispatch lease.
import { randomUUID } from "node:crypto";
import { openState } from "@server/core/orchestrator-state";
import { releaseDispatch } from "@server/core/harness-state";
import { getRun, updateRunStatus } from "@server/core/cycle-runtime/run-state/runs.js";
import { immediateTransaction } from "@server/core/orchestrator-state/storage/transaction.js";

const [stateDir, runId, leaseId] = process.argv.slice(2);
if (!stateDir || !runId || !leaseId) throw new Error("usage: bun poc-release.ts <stateDir> <runId> <leaseId>");
const store = openState(stateDir);
const commandId = `command-poc-release-${randomUUID()}`;
try {
  immediateTransaction(store.db, () => {
    const run = getRun(store, runId);
    if (run && run.status === "active") {
      updateRunStatus(store, runId, "failed", "operator", { commandId });
    }
    releaseDispatch(store, {
      leaseId,
      gameId: "melee",
      actor: "operator",
      commandId,
      causationId: commandId,
      correlationId: runId,
    });
  });
  console.log(JSON.stringify({ released: leaseId, run: runId }));
} finally {
  store.db.close();
}
