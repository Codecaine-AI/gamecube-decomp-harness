import {
  CYCLE_PHASES,
  cycleStageForSubPage,
  type CycleSubPage,
} from "@/routing";
import { PageHeader, PhaseStepperBar } from "@/components/primitives";
import { activeCycleFocus } from "@/pages/workspace/cycles/_lib/cycleRoute";
import type { CyclesPageProps } from "@/pages/workspace/cycles/_lib/types";
import { PrModePage } from "@/pages/workspace/cycles/active/subphases/pr";
import { RunModePage } from "@/pages/workspace/cycles/active/subphases/run";
import { CycleHistoryPage } from "@/pages/workspace/cycles/active/subphases/history";
import { ActiveCycleSummary } from "@/pages/workspace/cycles/active/components/ActiveCycleSummary";
import { PrepareSubPage } from "@/pages/workspace/cycles/active/components/PrepareSubPage";
import { ReviewSubPage } from "@/pages/workspace/cycles/active/components/ReviewSubPage";
import { CycleRouteBar } from "@/pages/workspace/cycles/active/components/CycleRouteLink";

export function ActiveCyclePage(props: CyclesPageProps) {
  const sub = props.route.cycleSub ?? props.view.recommendedSub;
  const currentStage = cycleStageForSubPage(sub);
  const workflowStage = cycleStageForSubPage(props.view.recommendedSub);
  const cycleFocus = activeCycleFocus(props.view);
  return (
    <>
      <PageHeader
        kicker={props.view.game?.displayName ?? "No game selected"}
        title="Active Cycle"
      />
      <div className="@container grid min-h-0 flex-1 content-start gap-4 overflow-auto p-4">
        <PhaseStepperBar
          current={currentStage}
          onSelect={(stage) =>
            props.nav.goToCycle(cycleFocus, stage as CycleSubPage)
          }
          phases={CYCLE_PHASES.map((stage) => ({
            ...stage,
            state: props.view.cycleStageStates[stage.id],
          }))}
          workflowCurrent={workflowStage}
        />
        <ActiveCycleSubPage {...props} sub={sub} />
      </div>
    </>
  );
}

function ActiveCycleSubPage(
  props: CyclesPageProps & { sub: CycleSubPage },
) {
  if (props.sub === "run") {
    return (
      <RunModePage
        busy={props.busy}
        dashboard={props.dashboard}
        form={props.form}
        improvedMode={props.improvedMode}
        improvedPage={props.improvedPage}
        onAction={props.onAction}
        setForm={props.setForm}
        setImprovedMode={props.setImprovedMode}
        setImprovedPage={props.setImprovedPage}
        setWorkMode={props.setWorkMode}
        view={props.view}
        workMode={props.workMode}
      />
    );
  }
  if (props.sub === "pr") {
    return (
      <PrModePage
        busy={props.busy}
        dashboard={props.dashboard}
        onAction={props.onAction}
        onOpenPr={props.onOpenPr}
        onPrepareLocalPr={props.onPrepareLocalPr}
        onSetReviewState={props.onSetReviewState}
        view={props.view}
      />
    );
  }
  if (props.sub === "prepare")
    return (
      <PrepareSubPage
        busy={props.busy}
        form={props.form}
        onAction={props.onAction}
        setForm={props.setForm}
        view={props.view}
      />
    );
  if (props.sub === "review")
    return (
      <ReviewSubPage
        busy={props.busy}
        onSetReviewState={props.onSetReviewState}
        view={props.view}
      />
    );
  if (props.sub === "artifacts")
    return <CycleHistoryPage dashboard={props.dashboard} view={props.view} />;
  if (props.sub === "done")
    return <ActiveCycleSummary nav={props.nav} view={props.view} />;
  return <ActiveCycleSummary nav={props.nav} view={props.view} />;
}
