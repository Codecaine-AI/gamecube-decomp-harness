import { useEffect, useState } from "react";
import { cycleTabForSubPage, type CycleSubPage } from "@/routing";
import { PageHeader, PanelSection } from "@/components/primitives";
import { asArray } from "@/lib/format";
import { prettyStatus } from "@/pages/workspace/_lib/model";
import { activeCycleFocus } from "@/pages/workspace/cycles/_lib/cycleRoute";
import type { CyclesPageProps } from "@/pages/workspace/cycles/_lib/types";
import { AttemptDetailPage } from "@/pages/workspace/cycles/active/details/attempt";
import { EpochDetailPage } from "@/pages/workspace/cycles/active/details/epoch";
import { SyncStageDetailPage } from "@/pages/workspace/cycles/active/details/sync-stage";
import { RunModePage } from "@/pages/workspace/cycles/active/subphases/run";
import { SyncModePage } from "@/pages/workspace/cycles/active/subphases/sync";
import { CycleHistoryPage } from "@/pages/workspace/cycles/active/subphases/history";
import { ActiveCycleSummary } from "@/pages/workspace/cycles/active/components/ActiveCycleSummary";
import { ReviewSubPage } from "@/pages/workspace/cycles/active/components/ReviewSubPage";
import { CycleAgentsBrowser } from "@/pages/workspace/cycles/active/components/agents-browser";

const leaseWarningStatuses = new Set(["blocked", "releasing"]);

export function ActiveCyclePage(props: CyclesPageProps) {
  const [agentsOpen, setAgentsOpen] = useState(false);
  const sub = props.route.cycleSub ?? props.view.recommendedSub;
  const cycleFocus = activeCycleFocus(props.view);
  const harnessState = props.view.harnessState;
  const activeWorkflow = harnessState?.active_workflow ?? null;
  const runningAgents = (props.dashboard?.activeFiles ?? []).length;
  const fullWorkerStates = asArray(props.runDetails?.workerStates);
  const totalAgents = fullWorkerStates.length > 0 ? fullWorkerStates.length : (props.dashboard?.workerStates ?? []).length;

  useEffect(() => {
    setAgentsOpen(false);
  }, [props.route.cycleDetail, props.route.cycleSub]);

  return (
    <>
      <PageHeader
        kicker={props.view.game?.displayName ?? "No game selected"}
        right={
          <div className="flex flex-wrap items-center justify-end gap-2">
              <button
                aria-pressed={agentsOpen}
                className={`status-tag cursor-pointer border hover:border-line2 hover:bg-raised ${runningAgents > 0 ? "status-tag-live" : ""}`}
                onClick={() => setAgentsOpen((open) => !open)}
                title={agentsOpen ? "Close agents browser" : "Open agents browser"}
                type="button"
              >
                <span className="lamp" />
                Agents · {runningAgents} active / {totalAgents}
              </button>
              {props.view.cycleStageStates.done === "done" ? (
                <span className="status-tag status-tag-live">
                  <span className="lamp" />
                  Cycle complete
                </span>
              ) : null}
              {activeWorkflow ? (
                <span
                  className={`status-tag ${leaseWarningStatuses.has(activeWorkflow.status) ? "status-tag-warn" : "status-tag-live"}`}
                  title={activeWorkflow.headline}
                >
                  <span className="lamp" />
                  {prettyStatus(activeWorkflow.kind)} · {prettyStatus(activeWorkflow.status)}
                </span>
              ) : null}
            </div>
        }
        title="Active Cycle"
      />
      <div className="@container grid min-h-0 flex-1 content-start gap-4 overflow-auto p-4">
        {agentsOpen ? (
          <CycleAgentsBrowser {...props} cycleFocus={cycleFocus} onClose={() => setAgentsOpen(false)} />
        ) : (
          <ActiveCycleContent {...props} cycleFocus={cycleFocus} sub={sub} />
        )}
      </div>
    </>
  );
}

function ActiveCycleContent(
  props: CyclesPageProps & { cycleFocus: string; sub: CycleSubPage },
) {
  const detail = props.route.cycleDetail;
  const tab = cycleTabForSubPage(props.sub);
  if (detail && tab) {
    if (detail.kind === "attempt" && tab === "run") {
      return (
        <AttemptDetailPage
          cycleFocus={props.cycleFocus}
          dashboard={props.dashboard}
          form={props.form}
          loadRunDetails={props.loadRunDetails}
          loadingRunDetails={props.loadingRunDetails}
          nav={props.nav}
          runDetails={props.runDetails}
          workerStateId={detail.id}
        />
      );
    }
    if (detail.kind === "epoch" && tab === "run") {
      return (
        <EpochDetailPage
          cycleFocus={props.cycleFocus}
          dashboard={props.dashboard}
          epochId={detail.id}
          loadRunDetails={props.loadRunDetails}
          loadingRunDetails={props.loadingRunDetails}
          nav={props.nav}
          runDetails={props.runDetails}
        />
      );
    }
    if (detail.kind === "stage" && tab === "sync") {
      return (
        <SyncStageDetailPage
          busy={props.busy}
          cycleFocus={props.cycleFocus}
          dashboard={props.dashboard}
          nav={props.nav}
          onAction={props.onAction}
          stage={detail.id}
          view={props.view}
        />
      );
    }
  }

  if (props.sub === "done" || props.sub === "summary") {
    return <ActiveCycleSummary nav={props.nav} view={props.view} />;
  }
  if (props.sub === "artifacts") {
    return <CycleHistoryPage dashboard={props.dashboard} view={props.view} />;
  }
  if (props.sub === "run") {
    return (
      <RunModePage
        dashboard={props.dashboard}
        improvedMode={props.improvedMode}
        improvedPage={props.improvedPage}
        onSelectAttempt={(id) => props.nav.goToCycle(props.cycleFocus, "run", { kind: "attempt", id })}
        setImprovedMode={props.setImprovedMode}
        setImprovedPage={props.setImprovedPage}
        setWorkMode={props.setWorkMode}
        view={props.view}
        workMode={props.workMode}
      />
    );
  }
  if (props.sub === "sync") {
    return (
      <SyncModePage
        busy={props.busy}
        dashboard={props.dashboard}
        onSelectStage={(stage) => props.nav.goToCycle(props.cycleFocus, "sync", { kind: "stage", id: stage })}
        view={props.view}
      />
    );
  }
  if (props.sub === "review") {
    return (
      <ReviewSubPage
        busy={props.busy}
        onSetReviewState={props.onSetReviewState}
        view={props.view}
      />
    );
  }
  return (
    <PanelSection>
      <div className="grid gap-1 text-sm">
        <span className="text-dim">Phase</span>
        <span className="text-fg">{prettyStatus(props.view.canonicalPhase || "pr")}</span>
        <span className="mt-2 text-dim">Subphase</span>
        <span className="text-fg">{prettyStatus(props.view.canonicalSubphase || "active")}</span>
      </div>
    </PanelSection>
  );
}
