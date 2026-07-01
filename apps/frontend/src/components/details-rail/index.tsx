import { useEffect, useState, type PointerEvent as ReactPointerEvent } from "react";
import { ChevronLeft, ChevronRight } from "@/icons";

import { OperationLogsTab } from "./_components/logs-tab";
import { ProcessTab } from "./_components/process-tab";
import { RunTab } from "./_components/run-tab";
import { TabButton } from "./_components/tab-button";
import type { DetailsRailProps, DetailsTab } from "./_lib/types";

export type { DetailsRailProps, DetailsTab } from "./_lib/types";

export function DetailsRail({
  busy,
  collapsed,
  dashboard,
  form,
  loadRunDetails,
  loadingRunDetails,
  onAction,
  onCollapsedChange,
  onResizeEnd,
  onResizeStart,
  onWidthChange,
  runDetails,
  setForm,
  tabRequest,
}: DetailsRailProps) {
  const [activeTab, setActiveTab] = useState<DetailsTab>(() => {
    try {
      const requested = new URLSearchParams(window.location.search).get("details");
      return requested === "run" || requested === "logs" || requested === "process" ? requested : "run";
    } catch {
      return "run";
    }
  });

  useEffect(() => {
    if (tabRequest) setActiveTab(tabRequest.tab);
  }, [tabRequest]);

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
      <div className={`details-rail-content ${collapsed ? "hidden" : ""} grid min-h-0 grid-rows-[auto_minmax(0,1fr)]`}>
        <div className="flex gap-1.5 border-b border-line bg-raised p-2" role="tablist" aria-label="Details rail">
          <TabButton active={activeTab === "run"} onClick={() => setActiveTab("run")}>
            Run
          </TabButton>
          <TabButton active={activeTab === "process"} onClick={() => setActiveTab("process")}>
            Process
          </TabButton>
          <TabButton active={activeTab === "logs"} onClick={() => setActiveTab("logs")}>
            Logs
          </TabButton>
        </div>
        <div className="min-h-0 overflow-auto" role="tabpanel">
          {activeTab === "logs" ? (
            <OperationLogsTab dashboard={dashboard} />
          ) : activeTab === "process" ? (
            <ProcessTab busy={busy} dashboard={dashboard} form={form} onAction={onAction} setForm={setForm} />
          ) : (
            <RunTab dashboard={dashboard} form={form} loadRunDetails={loadRunDetails} loadingRunDetails={loadingRunDetails} runDetails={runDetails} />
          )}
        </div>
      </div>
    </aside>
  );
}
