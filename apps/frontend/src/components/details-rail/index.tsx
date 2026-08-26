import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

import { ChevronLeft, ChevronRight } from "@/icons";
import { asObject, text } from "@/lib/format";

import { NowPanel } from "./_components/now-panel";
import { OperationActivity } from "./_components/operation-activity";
import { PrSection } from "./_components/pr-section";
import { RailSection, type RailSectionId } from "./_components/rail-section";
import { RunSetupSection } from "./_components/run-setup";
import { RunActionsSection } from "./_components/run-actions-section";
import { SyncSection } from "./_components/sync-section";
import { SubtabStrip } from "./_components/subtab-strip";
import { WorkflowTabs } from "./_components/workflow-tabs";
import { detailsRailCycleFocus } from "./_lib/cycle-focus";
import type { DetailsRailProps, DetailsTab } from "./_lib/types";
import { defaultWorkflowSubTab, type SubTab } from "./_lib/workflow-subtabs";
import { cycleTabForSubPage, type CycleTab } from "@/routing";

export type { DetailsRailProps, DetailsTab } from "./_lib/types";

function initialRequestedSection(): RailSectionId | null {
  try {
    const requested = new URLSearchParams(window.location.search).get("details");
    if (requested === "run") return "config";
    if (requested === "logs") return "activity";
    if (requested === "process") return "activity";
    return null;
  } catch {
    return null;
  }
}

export function DetailsRail({
  busy,
  collapsed,
  dashboard,
  form,
  onAction,
  onCollapsedChange,
  onNavigate,
  onResizeEnd,
  onResizeStart,
  onWidthChange,
  route,
  setForm,
  tabRequest,
  view,
}: DetailsRailProps) {
  const requestedSection = initialRequestedSection();
  const cycleFocus = detailsRailCycleFocus(view);
  const gameId = route.kind === "workspace" ? route.gameId : undefined;
  const routeSub = route.kind === "workspace" ? route.cycleSub : undefined;
  const workflowTab = cycleTabForSubPage(routeSub ?? view.recommendedSub);
  const [workflowSubtabs, setWorkflowSubtabs] = useState<Record<"sync" | "run", SubTab>>(() => ({
    run: defaultWorkflowSubTab("run", view.harnessState),
    sync: defaultWorkflowSubTab("sync", view.harnessState),
  }));
  const previousWorkflowTab = useRef(workflowTab);
  const operation = asObject(asObject(dashboard?.process).operation);
  const operationStatus = text(operation.status);
  const activityHint = operationStatus || "";
  const activityRequest = tabRequest?.tab === "logs" || tabRequest?.tab === "process"
    ? tabRequest.nonce
    : requestedSection === "activity" ? 0 : undefined;

  useEffect(() => {
    if (tabRequest || requestedSection) onCollapsedChange(false);
  }, [onCollapsedChange, requestedSection, tabRequest]);

  useEffect(() => {
    const runRequested = tabRequest?.tab === "run" || requestedSection === "config";
    if (!runRequested || workflowTab === "run") return;
    onNavigate({
      kind: "workspace",
      section: "cycles",
      gameId,
      cycle: cycleFocus,
      cycleSub: "run",
    });
  }, [cycleFocus, gameId, onNavigate, requestedSection, tabRequest, workflowTab]);

  useEffect(() => {
    if (workflowTab !== "run" && workflowTab !== "sync") return;
    if (previousWorkflowTab.current === workflowTab) return;
    previousWorkflowTab.current = workflowTab;
    setWorkflowSubtabs((current) => ({
      ...current,
      [workflowTab]: defaultWorkflowSubTab(workflowTab, view.harnessState),
    }));
  }, [view.harnessState, workflowTab]);

  useEffect(() => {
    const runRequested = tabRequest?.tab === "run" || requestedSection === "config";
    if (!runRequested) return;
    setWorkflowSubtabs((current) => current.run === "config" ? current : { ...current, run: "config" });
  }, [requestedSection, tabRequest]);

  function startResize(event: ReactPointerEvent<HTMLDivElement>) {
    event.preventDefault();
    onResizeStart();
    const onMove = (moveEvent: PointerEvent) => onWidthChange(window.innerWidth - moveEvent.clientX);
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      onResizeEnd();
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  function selectWorkflowTab(tab: CycleTab): void {
    onNavigate({
      kind: "workspace",
      section: "cycles",
      gameId,
      cycle: cycleFocus,
      cycleSub: tab,
    });
  }

  return (
    <aside className={`details-rail ${collapsed ? "details-rail-collapsed" : "details-rail-open"} relative grid min-w-0 border-l border-line2 bg-panel ${collapsed ? "grid-rows-[minmax(0,1fr)]" : "grid-rows-[auto_minmax(0,1fr)]"} overflow-hidden max-[1180px]:col-span-2 max-[1180px]:border-t max-[780px]:block`}>
      {!collapsed ? <div aria-hidden className="details-rail-resize-handle" onPointerDown={startResize} title="Drag to resize" /> : null}
      {collapsed ? (
        <div className="details-rail-tab z-10 flex h-full flex-col items-center justify-start gap-3 bg-raised px-0 max-[1180px]:h-[42px] max-[1180px]:flex-row max-[1180px]:items-center max-[1180px]:gap-2 max-[1180px]:px-3">
          <div className="flex h-[68px] w-full shrink-0 items-center justify-center border-b border-line2 max-[1180px]:h-auto max-[1180px]:w-auto max-[1180px]:border-b-0">
            <button aria-expanded={false} className="inline-flex h-8 w-8 shrink-0 items-center justify-center border border-line2 bg-raised text-soft hover:border-faint hover:text-fg" onClick={() => onCollapsedChange(false)} title="Show details" type="button">
              <ChevronLeft size={16} />
              <span className="sr-only">Show</span>
            </button>
          </div>
          <span className="[writing-mode:vertical-rl] rotate-180 text-[11px] font-bold uppercase tracking-[0.14em] text-soft max-[1180px]:[writing-mode:initial] max-[1180px]:rotate-0">Details</span>
        </div>
      ) : (
        <div className="details-rail-tab sticky top-0 z-10 flex h-[68px] items-center gap-2 border-b border-line2 bg-raised px-3 max-[1180px]:static max-[1180px]:h-[42px]">
          <h2 className="m-0 min-w-0 flex-1 overflow-hidden px-3 text-center text-ellipsis whitespace-nowrap text-[13px] font-bold uppercase tracking-[0.14em] text-soft">Details</h2>
          <button aria-expanded className="inline-flex h-8 w-8 shrink-0 items-center justify-center border border-line2 bg-raised text-soft hover:border-faint hover:text-fg" onClick={() => onCollapsedChange(true)} title="Hide details" type="button">
            <ChevronRight size={16} />
            <span className="sr-only">Hide</span>
          </button>
        </div>
      )}
      <div className={`details-rail-content ${collapsed ? "hidden" : ""} min-h-0 overflow-auto`}>
        <NowPanel busy={busy} dashboard={dashboard} onAction={onAction} view={view} />
        <WorkflowTabs onSelect={selectWorkflowTab} route={route} view={view} />
        {workflowTab === "run" ? (
          <div aria-labelledby="details-workflow-tab-run" id="details-workflow-panel-run" role="tabpanel">
            <SubtabStrip activeSubTab={workflowSubtabs.run} onSelect={(subtab) => setWorkflowSubtabs((current) => ({ ...current, run: subtab }))} workflow="run" />
            <div aria-labelledby={`details-run-subtab-${workflowSubtabs.run}`} id={`details-run-subpanel-${workflowSubtabs.run}`} role="tabpanel">
              {workflowSubtabs.run === "config" ? (
                <RunSetupSection busy={busy} form={form} onAction={onAction} setForm={setForm} view={view} />
              ) : null}
              {workflowSubtabs.run === "actions" ? <RunActionsSection busy={busy} harnessState={view.harnessState} onAction={onAction} view={view} /> : null}
            </div>
          </div>
        ) : null}
        {workflowTab === "sync" ? (
          <div aria-labelledby="details-workflow-tab-sync" id="details-workflow-panel-sync" role="tabpanel">
            <SubtabStrip activeSubTab={workflowSubtabs.sync} onSelect={(subtab) => setWorkflowSubtabs((current) => ({ ...current, sync: subtab }))} workflow="sync" />
            <div aria-labelledby={`details-sync-subtab-${workflowSubtabs.sync}`} id={`details-sync-subpanel-${workflowSubtabs.sync}`} role="tabpanel">
              <SyncSection busy={busy} form={form} mode={workflowSubtabs.sync} onAction={onAction} setForm={setForm} view={view} />
            </div>
          </div>
        ) : null}
        {workflowTab === "pr" ? (
          <div aria-labelledby="details-workflow-tab-pr" id="details-workflow-panel-pr" role="tabpanel">
            <PrSection view={view} />
          </div>
        ) : null}
        <RailSection hint={activityHint} id="activity" label="Activity" requestOpenNonce={activityRequest} scrollOnRequest>
          <div className="p-3">
            <OperationActivity dashboard={dashboard} />
          </div>
        </RailSection>
      </div>
    </aside>
  );
}
