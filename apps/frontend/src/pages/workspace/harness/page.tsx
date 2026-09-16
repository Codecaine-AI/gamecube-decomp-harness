import { useEffect, useState } from "react";
import { workflowTabForSubPage, type HarnessSubPage } from "@/routing";
import { Button, PageHeader, PanelSection } from "@/components/primitives";
import { prettyStatus } from "@/pages/workspace/_lib/model";
import { asObject, text } from "@/lib/format";
import type { HarnessPageProps } from "@/pages/workspace/harness/_lib/types";
import { EpochDetailPage } from "@/pages/workspace/harness/details/epoch";
import { SyncStageDetailPage } from "@/pages/workspace/harness/details/sync-stage";
import { RunModePage } from "@/pages/workspace/harness/subphases/run";
import { SyncModePage } from "@/pages/workspace/harness/subphases/sync";
import { RunHistoryPage } from "@/pages/workspace/harness/subphases/history";
import { HarnessSummary } from "@/pages/workspace/harness/summary";
import { ReviewSubPage } from "@/pages/workspace/harness/components/ReviewSubPage";
import { HarnessAgentsBrowser } from "@/pages/workspace/harness/components/agents-browser";

export function HarnessPage(props: HarnessPageProps) {
  const [agentsOpen, setAgentsOpen] = useState(false);
  const [selectedAgentId, setSelectedAgentId] = useState("");
  const sub = props.route.harnessSub ?? props.view.recommendedSub;


  useEffect(() => {
    if (props.route.harnessDetail?.kind === "attempt") {
      setSelectedAgentId(props.route.harnessDetail.id);
      setAgentsOpen(true);
      return;
    }
    setAgentsOpen(false);
  }, [props.route.harnessDetail, props.route.harnessSub]);

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
        title="Harness"
      />
      <div className="@container grid min-h-0 flex-1 content-start gap-4 overflow-auto p-4">
        <nav aria-label="Harness views" className="flex flex-wrap gap-2">
          {([{ sub: "run", label: "Run" }, { sub: "sync", label: "Sync" }, { sub: "artifacts", label: "History" }] as const).map((item) => (
            <Button key={item.sub} onClick={() => props.nav.goToHarness(item.sub)} tone={sub === item.sub ? "primary" : undefined} type="button">{item.label}</Button>
          ))}
        </nav>
        {agentsOpen ? (
          <HarnessAgentsBrowser
            {...props}

            onSelectWorkerState={setSelectedAgentId}
            selectedWorkerStateId={selectedAgentId}
          />
        ) : (
          <HarnessContent {...props}  onSelectAgent={openAgent} sub={sub} />
        )}
      </div>
    </>
  );
}

function HarnessContent(
  props: HarnessPageProps & { onSelectAgent: (id: string) => void; sub: HarnessSubPage },
) {
  const detail = props.route.harnessDetail;
  const tab = workflowTabForSubPage(props.sub);
  if (detail && tab) {
    if (detail.kind === "epoch" && tab === "run") {
      return (
        <EpochDetailPage

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

          dashboard={props.dashboard}
          nav={props.nav}
          onAction={props.onAction}
          stage={detail.id}
          view={props.view}
        />
      );
    }
  }

  if (props.sub === "summary") {
    return <HarnessSummary view={props.view} />;
  }
  if (props.sub === "artifacts") {
    return <RunHistoryPage dashboard={props.dashboard} view={props.view} />;
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
        onSelectStage={(stage) => props.nav.goToHarness("sync", { kind: "stage", id: stage })}
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
