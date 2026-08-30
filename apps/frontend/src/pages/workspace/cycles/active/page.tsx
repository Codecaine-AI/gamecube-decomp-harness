import { useEffect, useState } from "react";
import { cycleTabForSubPage, type CycleSubPage } from "@/routing";
import { Button, PageHeader, PanelSection } from "@/components/primitives";
import { prettyStatus } from "@/pages/workspace/_lib/model";
import { asObject, text } from "@/lib/format";
import { activeCycleFocus } from "@/pages/workspace/cycles/_lib/cycleRoute";
import type { CyclesPageProps } from "@/pages/workspace/cycles/_lib/types";
import { EpochDetailPage } from "@/pages/workspace/cycles/active/details/epoch";
import { SyncStageDetailPage } from "@/pages/workspace/cycles/active/details/sync-stage";
import { RunModePage } from "@/pages/workspace/cycles/active/subphases/run";
import { SyncModePage } from "@/pages/workspace/cycles/active/subphases/sync";
import { CycleHistoryPage } from "@/pages/workspace/cycles/active/subphases/history";
import { ActiveCycleSummary } from "@/pages/workspace/cycles/active/components/ActiveCycleSummary";
import { ReviewSubPage } from "@/pages/workspace/cycles/active/components/ReviewSubPage";
import { CycleAgentsBrowser } from "@/pages/workspace/cycles/active/components/agents-browser";

export function ActiveCyclePage(props: CyclesPageProps) {
  const [agentsOpen, setAgentsOpen] = useState(false);
  const [selectedAgentId, setSelectedAgentId] = useState("");
  const sub = props.route.cycleSub ?? props.view.recommendedSub;
  const cycleFocus = activeCycleFocus(props.view);

  useEffect(() => {
    if (props.route.cycleDetail?.kind === "attempt") {
      setSelectedAgentId(props.route.cycleDetail.id);
      setAgentsOpen(true);
      return;
    }
    setAgentsOpen(false);
  }, [props.route.cycleDetail, props.route.cycleSub]);

  function openAgent(id: string) {
    setSelectedAgentId(id);
    setAgentsOpen(true);
  }

  return (
    <>
      <PageHeader
        kicker={props.view.game?.displayName ?? "No game selected"}
        right={
          <Button
            onClick={() => setAgentsOpen((open) => !open)}
            title={agentsOpen ? "Return to run" : "View agents"}
            type="button"
          >
            {agentsOpen ? "Run" : "Agents"}
          </Button>
        }
        title="Active Cycle"
      />
      <div className="@container grid min-h-0 flex-1 content-start gap-4 overflow-auto p-4">
        {agentsOpen ? (
          <CycleAgentsBrowser
            {...props}
            cycleFocus={cycleFocus}
            onSelectWorkerState={setSelectedAgentId}
            selectedWorkerStateId={selectedAgentId}
          />
        ) : (
          <ActiveCycleContent {...props} cycleFocus={cycleFocus} onSelectAgent={openAgent} sub={sub} />
        )}
      </div>
    </>
  );
}

function ActiveCycleContent(
  props: CyclesPageProps & { cycleFocus: string; onSelectAgent: (id: string) => void; sub: CycleSubPage },
) {
  const detail = props.route.cycleDetail;
  const tab = cycleTabForSubPage(props.sub);
  if (detail && tab) {
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
        form={props.form}
        improvedMode={props.improvedMode}
        improvedPage={props.improvedPage}
        onSelectAgent={props.onSelectAgent}
        runId={text(asObject(props.dashboard?.status?.run).id, text(props.runDetails?.runId))}
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
