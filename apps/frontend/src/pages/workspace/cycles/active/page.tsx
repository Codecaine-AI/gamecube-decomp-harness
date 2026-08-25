import {
  CYCLE_TABS,
  cycleTabForSubPage,
  type CycleSubPage,
} from "@/routing";
import { PageHeader, PanelSection } from "@/components/primitives";
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

const leaseWarningStatuses = new Set(["blocked", "releasing"]);

export function ActiveCyclePage(props: CyclesPageProps) {
  const sub = props.route.cycleSub ?? props.view.recommendedSub;
  const tab = cycleTabForSubPage(sub);
  const cycleFocus = activeCycleFocus(props.view);
  const harnessState = props.view.harnessState;
  const activeWorkflow = harnessState?.active_workflow ?? null;

  const tabHints = {
    run: harnessState?.run ? prettyStatus(harnessState.run.status) : "no run",
    sync: harnessState?.sync
      ? prettyStatus(harnessState.sync.status)
      : harnessState?.repo_sync?.needs_sync
        ? "sync needed"
        : "idle",
    pr: props.view.canonicalPhase === "pr"
      ? prettyStatus(props.view.canonicalSubphase || "active")
      : "idle",
  };

  return (
    <>
      <PageHeader
        kicker={props.view.game?.displayName ?? "No game selected"}
        right={
          props.view.cycleStageStates.done === "done" || activeWorkflow ? (
            <div className="flex flex-wrap items-center justify-end gap-2">
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
          ) : undefined
        }
        title="Active Cycle"
      />
      <div className="@container grid min-h-0 flex-1 content-start gap-4 overflow-auto p-4">
        <nav className="flex flex-wrap gap-1.5 border-b border-line pb-2" role="tablist" aria-label="Cycle workflow">
          {CYCLE_TABS.map((item) => {
            const active = item.id === tab;
            const syncWarning = item.id === "sync"
              && (harnessState?.sync?.status === "blocked" || (!harnessState?.sync && harnessState?.repo_sync?.needs_sync));
            return (
              <button
                aria-selected={active}
                className={`flex min-h-8 items-center gap-2 border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] ${
                  active
                    ? "border-line2 bg-raised text-fg"
                    : "border-line bg-card text-dim hover:border-line2 hover:text-soft"
                }`}
                key={item.id}
                onClick={() => props.nav.goToCycle(cycleFocus, item.id)}
                role="tab"
                type="button"
              >
                <span>{item.label}</span>
                <span className={`text-[10px] font-medium normal-case tracking-normal ${syncWarning ? "text-warn" : "text-dim"}`}>
                  {tabHints[item.id]}
                </span>
              </button>
            );
          })}
        </nav>
        <ActiveCycleContent {...props} cycleFocus={cycleFocus} sub={sub} />
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
        busy={props.busy}
        dashboard={props.dashboard}
        form={props.form}
        improvedMode={props.improvedMode}
        improvedPage={props.improvedPage}
        onAction={props.onAction}
        onSelectAttempt={(id) => props.nav.goToCycle(props.cycleFocus, "run", { kind: "attempt", id })}
        setForm={props.setForm}
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
        onAction={props.onAction}
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
