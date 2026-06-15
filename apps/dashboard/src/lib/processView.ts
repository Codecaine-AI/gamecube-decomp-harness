import { asArray, asObject, text, type Dashboard, type JsonObject } from "@decomp-orchestrator/ui-contract";

const activeStates = new Set(["running", "stopping", "draining"]);

function normalizedSavedState(record: JsonObject): string {
  const state = text(record.state, "saved");
  if (record.alive === true) return state;
  return activeStates.has(state) ? "exited" : state;
}

export interface ProcessView {
  detached: boolean;
  display: JsonObject;
  draining: boolean;
  pillState: string;
  proc: JsonObject;
  running: boolean;
  saved: JsonObject[];
}

export function processView(dashboard: Dashboard | null, selectedName = ""): ProcessView {
  const proc = asObject(dashboard?.process);
  const saved: JsonObject[] = asArray(proc.knownProcesses).map((item): JsonObject => {
    const record = asObject(item);
    return { ...record, viewState: normalizedSavedState(record) };
  });
  const selected: JsonObject = (selectedName ? saved.find((item) => text(item.name) === selectedName) : null) || saved.find((item) => item.alive === true) || {};
  const display = proc.pid ? proc : selected;
  const procState = text(proc.state);
  const managedLive = activeStates.has(procState);
  const detached = !proc.pid && display.alive === true;
  const savedState = text(display.viewState, normalizedSavedState(display));
  const running = Boolean(managedLive || detached);
  const pillState = procState && procState !== "idle" ? procState : detached && savedState ? savedState : detached ? "detached" : savedState || "idle";
  const draining = (managedLive && procState === "draining") || (detached && savedState === "draining");
  return { detached, display, draining, pillState, proc, running, saved };
}

export function processPillState(dashboard: Dashboard | null): string {
  return processView(dashboard).pillState;
}
