import { harnessStateAction } from "@/pages/workspace/_lib/model";
import type { HarnessStateReadModel } from "@/pages/workspace/_lib/types";

// The rail shows live state in the always-visible Now panel, so each workflow
// tab carries only what the operator can change: its config and its actions.
export type SubTab = "config" | "actions";
export type SubTabbedWorkflow = "sync" | "run";

export const DETAILS_WORKFLOW_SUBTABS: ReadonlyArray<{ id: SubTab; label: string }> = [
  { id: "config", label: "Config" },
  { id: "actions", label: "Actions" },
];

export function syncNeedsDecision(harnessState: HarnessStateReadModel | null | undefined): boolean {
  const sync = harnessState?.sync;
  return sync?.status === "blocked"
    || (sync?.staging?.conflicts_awaiting_operator ?? 0) > 0
    || (!sync && Boolean(harnessState?.repo_sync?.needs_sync));
}

export function runNeedsDecision(harnessState: HarnessStateReadModel | null | undefined): boolean {
  const runStatus: string | undefined = harnessState?.run?.status;
  if (runStatus === "failed" || runStatus === "blocked") return true;

  const actionIds = harnessState?.available_actions
    .map((action) => action.action_id)
    .filter((actionId) => actionId.startsWith("run.")) ?? [];
  return actionIds.some((actionId) => {
    const action = harnessStateAction(harnessState ?? null, actionId);
    return Boolean(action?.enabled && action.confirmation_required);
  });
}

export function defaultWorkflowSubTab(
  workflow: SubTabbedWorkflow,
  harnessState: HarnessStateReadModel | null | undefined,
): SubTab {
  const needsDecision = workflow === "sync"
    ? syncNeedsDecision(harnessState)
    : runNeedsDecision(harnessState);
  return needsDecision ? "actions" : "config";
}
