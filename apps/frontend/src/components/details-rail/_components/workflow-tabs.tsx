import { cycleTabForSubPage, type CycleTab } from "@/routing";
import type { KeyboardEvent } from "react";

import type { DetailsRailProps } from "../_lib/types";
import {
  DETAILS_WORKFLOW_TABS,
  workflowTabHasWarning,
  workflowTabHints,
} from "../_lib/workflow-tabs";

export function WorkflowTabs({
  onSelect,
  route,
  view,
}: Pick<DetailsRailProps, "route" | "view"> & { onSelect: (tab: CycleTab) => void }) {
  const routeSub = route.kind === "workspace" ? route.cycleSub : undefined;
  const activeTab = cycleTabForSubPage(routeSub ?? view.recommendedSub);
  const hints = workflowTabHints(view);

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number): void {
    let nextIndex: number | null = null;
    if (event.key === "ArrowRight") nextIndex = (index + 1) % DETAILS_WORKFLOW_TABS.length;
    if (event.key === "ArrowLeft") nextIndex = (index - 1 + DETAILS_WORKFLOW_TABS.length) % DETAILS_WORKFLOW_TABS.length;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = DETAILS_WORKFLOW_TABS.length - 1;
    if (nextIndex === null) return;
    event.preventDefault();
    const nextTab = DETAILS_WORKFLOW_TABS[nextIndex];
    onSelect(nextTab.id);
    document.getElementById(`details-workflow-tab-${nextTab.id}`)?.focus();
  }

  return (
    <nav aria-label="Cycle workflow" className="grid grid-cols-3 gap-1.5 border-b border-line2 bg-panel p-2" role="tablist">
      {DETAILS_WORKFLOW_TABS.map((item, index) => {
        const active = item.id === activeTab;
        return (
          <button
            aria-selected={active}
            aria-controls={`details-workflow-panel-${item.id}`}
            className={`flex min-w-0 flex-col items-center gap-0.5 border px-1.5 py-1.5 text-[10px] font-bold uppercase tracking-[0.08em] ${
              active
                ? "border-line2 bg-raised text-fg"
                : "border-line bg-card text-dim hover:border-line2 hover:text-soft"
            }`}
            id={`details-workflow-tab-${item.id}`}
            key={item.id}
            onKeyDown={(event) => handleKeyDown(event, index)}
            onClick={() => onSelect(item.id)}
            role="tab"
            tabIndex={active || (!activeTab && index === 0) ? 0 : -1}
            type="button"
          >
            <span>{item.label}</span>
            <span className={`max-w-full overflow-hidden text-ellipsis whitespace-nowrap rounded-full border border-line bg-panel px-1.5 py-px text-[9px] font-medium normal-case tracking-normal ${workflowTabHasWarning(view, item.id) ? "border-warn/40 text-warn" : "text-dim"}`}>
              {hints[item.id]}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
