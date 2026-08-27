import { cycleTabForSubPage, type CycleTab } from "@/routing";
import type { KeyboardEvent } from "react";

import type { DetailsRailProps } from "../_lib/types";
import {
  DETAILS_WORKFLOW_TABS,
} from "../_lib/workflow-tabs";

export function WorkflowTabs({
  onSelect,
  route,
  view,
}: Pick<DetailsRailProps, "route" | "view"> & { onSelect: (tab: CycleTab) => void }) {
  const routeSub = route.kind === "workspace" ? route.cycleSub : undefined;
  const activeTab = cycleTabForSubPage(routeSub ?? view.recommendedSub);

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
            className={`flex min-h-12 min-w-0 items-center justify-center border bg-card px-1.5 py-2 text-[10px] font-bold uppercase tracking-[0.08em] ${
              active
                ? "border-up/70 text-fg"
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
          </button>
        );
      })}
    </nav>
  );
}
