import type { KeyboardEvent } from "react";

import {
  DETAILS_WORKFLOW_SUBTABS,
  type SubTab,
  type SubTabbedWorkflow,
} from "../_lib/workflow-subtabs";

export function SubtabStrip({
  activeSubTab,
  onSelect,
  workflow,
}: {
  activeSubTab: SubTab;
  onSelect: (subTab: SubTab) => void;
  workflow: SubTabbedWorkflow;
}) {
  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number): void {
    let nextIndex: number | null = null;
    if (event.key === "ArrowRight") nextIndex = (index + 1) % DETAILS_WORKFLOW_SUBTABS.length;
    if (event.key === "ArrowLeft") nextIndex = (index - 1 + DETAILS_WORKFLOW_SUBTABS.length) % DETAILS_WORKFLOW_SUBTABS.length;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = DETAILS_WORKFLOW_SUBTABS.length - 1;
    if (nextIndex === null) return;
    event.preventDefault();
    const nextSubTab = DETAILS_WORKFLOW_SUBTABS[nextIndex];
    onSelect(nextSubTab.id);
    document.getElementById(`details-${workflow}-subtab-${nextSubTab.id}`)?.focus();
  }

  return (
    <nav aria-label={`${workflow} details`} className="grid grid-cols-2 gap-1 border-b border-line2 bg-panel p-1.5" role="tablist">
      {DETAILS_WORKFLOW_SUBTABS.map((item, index) => {
        const active = item.id === activeSubTab;
        return (
          <button
            aria-controls={`details-${workflow}-subpanel-${item.id}`}
            aria-selected={active}
            className={`border px-1.5 py-1 text-[9px] font-bold uppercase tracking-[0.08em] ${
              active
                ? "border-line2 bg-raised text-fg"
                : "border-line bg-card text-dim hover:border-line2 hover:text-soft"
            }`}
            id={`details-${workflow}-subtab-${item.id}`}
            key={item.id}
            onClick={() => onSelect(item.id)}
            onKeyDown={(event) => handleKeyDown(event, index)}
            role="tab"
            tabIndex={active ? 0 : -1}
            type="button"
          >
            {item.label}
          </button>
        );
      })}
    </nav>
  );
}
