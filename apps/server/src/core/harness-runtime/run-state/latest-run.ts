import { openState } from "@server/core/orchestrator-state";
import { getLatestRun } from "./runs.js";

export function latestRunId(stateDir: string): string {
  const store = openState(stateDir);
  try {
    return getLatestRun(store)?.id ?? "";
  } finally {
    store.db.close();
  }
}
