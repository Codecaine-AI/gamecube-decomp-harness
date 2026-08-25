import { useEffect, type PointerEvent as ReactPointerEvent } from "react";

import { ChevronLeft, ChevronRight } from "@/icons";
import { asArray, asObject, text } from "@/lib/format";

import { OperationLogsTab } from "./_components/logs-tab";
import { NavigatorSection, navigatorSectionHint } from "./_components/navigator-section";
import { ProcessTab } from "./_components/process-tab";
import { RailSection, type RailSectionId } from "./_components/rail-section";
import { RunSetupSection, runSetupSummary } from "./_components/run-setup";
import { StateSection, stateSectionHint } from "./_components/state-section";
import { detailsRailCycleFocus } from "./_lib/cycle-focus";
import type { DetailsRailProps, DetailsTab } from "./_lib/types";

export type { DetailsRailProps, DetailsTab } from "./_lib/types";

function initialRequestedSection(): RailSectionId | null {
  try {
    const requested = new URLSearchParams(window.location.search).get("details");
    if (requested === "run") return "navigator";
    if (requested === "process" || requested === "logs") return requested;
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
  loadRunDetails,
  loadingRunDetails,
  onAction,
  onCollapsedChange,
  onNavigate,
  onResizeEnd,
  onResizeStart,
  onWidthChange,
  route,
  runDetails,
  setForm,
  tabRequest,
  view,
}: DetailsRailProps) {
  const requestedSection = initialRequestedSection();
  const cycleFocus = detailsRailCycleFocus(dashboard);
  const gameId = route.kind === "workspace" ? route.gameId : undefined;
  const processHint = view.process.draining ? "draining" : view.process.running ? "running" : view.process.pillState || "idle";
  const operation = asObject(asObject(dashboard?.process).operation);
  const operationStatus = text(operation.status);
  const logsHint = operationStatus || `${asArray(asObject(dashboard?.process).logs).length} lines`;
  const navigatorRequest = tabRequest?.tab === "run" ? tabRequest.nonce : requestedSection === "navigator" ? 0 : undefined;
  const processRequest = tabRequest?.tab === "process" ? tabRequest.nonce : requestedSection === "process" ? 0 : undefined;
  const logsRequest = tabRequest?.tab === "logs" ? tabRequest.nonce : requestedSection === "logs" ? 0 : undefined;

  useEffect(() => {
    if (tabRequest) onCollapsedChange(false);
  }, [onCollapsedChange, tabRequest]);

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

  function openAttempt(workerStateId: string): void {
    onNavigate({
      kind: "workspace",
      section: "cycles",
      gameId,
      cycle: cycleFocus,
      cycleSub: "run",
      cycleDetail: { kind: "attempt", id: workerStateId },
    });
  }

  function openEpoch(epochId: string): void {
    onNavigate({
      kind: "workspace",
      section: "cycles",
      gameId,
      cycle: cycleFocus,
      cycleSub: "run",
      cycleDetail: { kind: "epoch", id: epochId },
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
        <RailSection
          defaultOpen={requestedSection === null || requestedSection === "navigator"}
          hint={navigatorSectionHint(dashboard, runDetails)}
          id="navigator"
          label="Navigator"
          requestOpenNonce={navigatorRequest}
        >
          <NavigatorSection
            dashboard={dashboard}
            loadRunDetails={loadRunDetails}
            loadingRunDetails={loadingRunDetails}
            onSelectAttempt={openAttempt}
            onSelectEpoch={openEpoch}
            runDetails={runDetails}
          />
        </RailSection>
        <RailSection hint={stateSectionHint(view)} id="state" label="State">
          <StateSection dashboard={dashboard} view={view} />
        </RailSection>
        <RailSection hint={runSetupSummary(view)} id="config" label="Config">
          <RunSetupSection busy={busy} form={form} onAction={onAction} setForm={setForm} view={view} />
        </RailSection>
        <RailSection hint={processHint} id="process" label="Process" requestOpenNonce={processRequest}>
          <ProcessTab busy={busy} dashboard={dashboard} form={form} onAction={onAction} setForm={setForm} />
        </RailSection>
        <RailSection hint={logsHint} id="logs" label="Logs" requestOpenNonce={logsRequest} scrollOnRequest>
          <OperationLogsTab dashboard={dashboard} />
        </RailSection>
      </div>
    </aside>
  );
}
