import { prettyStatus } from "@/pages/workspace/_lib/model";
import type { CycleView } from "@/pages/workspace/_lib/types";
import type { CycleTab } from "@/routing";

export const DETAILS_WORKFLOW_TABS: ReadonlyArray<{ id: CycleTab; label: string }> = [
  { id: "sync", label: "Sync" },
  { id: "run", label: "Run" },
  { id: "pr", label: "PR" },
];

export function workflowTabHints(view: CycleView): Record<CycleTab, string> {
  const harnessState = view.harnessState;
  return {
    run: harnessState?.run ? prettyStatus(harnessState.run.status) : "no run",
    sync: harnessState?.sync
      ? prettyStatus(harnessState.sync.status)
      : harnessState?.repo_sync?.needs_sync
        ? "sync needed"
        : "idle",
    pr: view.canonicalPhase === "pr"
      ? prettyStatus(view.canonicalSubphase || "active")
      : "idle",
  };
}

export function workflowTabHasWarning(view: CycleView, tab: CycleTab): boolean {
  if (tab !== "sync") return false;
  const harnessState = view.harnessState;
  return harnessState?.sync?.status === "blocked"
    || (!harnessState?.sync && Boolean(harnessState?.repo_sync?.needs_sync));
}
