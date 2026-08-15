import {
  Archive,
  Ban,
  GitPullRequest,
  ListTree,
  Play,
  RefreshCw,
  RotateCcw,
  Settings,
} from "@/icons";
import type { ReactNode } from "react";
import { text, type FormState } from "@/lib/format";
import {
  Button,
  InfoRows,
  List,
  PageHeader,
  PanelSection,
  PanelTitle,
  StatCard,
} from "@/components/primitives";
import { processName } from "@/pages/workspace/_lib/model";
import { RUN_CONTROL_ACTIONS } from "@/components/app/_lib/projectedRunControls";
import type {
  DashboardAction,
  CycleView,
  WorkspaceNav,
} from "@/pages/workspace/_lib/types";
import { activeCycleFocus } from "@/pages/workspace/cycles/_lib/cycleRoute";
import { SyncStateCard } from "@/pages/workspace/overview/SyncStateCard";

function readinessRows(
  view: CycleView,
  nav: WorkspaceNav,
): Array<[string, ReactNode, string]> {
  const repoTone =
    view.game?.repoRootExists === false ? "text-down" : "text-up";
  const stateTone =
    view.game?.stateDirExists === false ? "text-down" : "text-up";
  const graphTone =
    view.game?.graphDbExists === false ? "text-down" : "text-up";
  return [
    [
      "Repository",
      view.game?.repoRootExists === false
        ? "missing checkout"
        : "synced / known branch",
      repoTone,
    ],
    [
      "State dir",
      view.game?.stateDirExists === false ? "missing" : "present",
      stateTone,
    ],
    [
      "Graph DB",
      view.game?.graphDbExists === false ? "not built" : "built",
      graphTone,
    ],
    [
      "Standards",
      <button
        className="text-up underline-offset-2 hover:underline"
        onClick={() => nav.goToSection("standards")}
        title="Open standards"
        type="button"
      >
        loaded / editable
      </button>,
      "text-up",
    ],
  ];
}

function prettyPhase(value: string): string {
  return value.replace(/_/g, " ");
}

export function OverviewPage({
  busy,
  form,
  nav,
  onAction,
  view,
}: {
  busy: boolean;
  form: FormState;
  nav: WorkspaceNav;
  onAction: (action: DashboardAction) => void;
  view: CycleView;
}) {
  const cycleFocus = activeCycleFocus(view);
  const hasCanonicalActiveCycle = Boolean(
    view.activeCycleId &&
    view.canonicalPhase &&
    view.canonicalPhase !== "complete",
  );
  const activePhaseLabel = [view.canonicalPhase, view.canonicalSubphase]
    .filter(Boolean)
    .map(prettyPhase)
    .join(" / ");
  let recommendedAction = "Start a Cycle";
  let recommendedHint =
    "No active cycle. Open the game cycles to start a run when ready.";
  let recommendedIcon: ReactNode = <Play size={14} />;
  if (hasCanonicalActiveCycle) {
    recommendedAction =
      view.canonicalPhase === "preparing"
        ? "Open Preparation"
        : view.canonicalPhase === "running"
          ? "Open Run"
          : view.canonicalPhase === "pr"
            ? "Open PR Queue"
            : "Open Cycle";
    recommendedHint = `Continue the active ${activePhaseLabel || "game"} cycle. New Cycle is gated until this cycle is complete.`;
    recommendedIcon =
      view.canonicalPhase === "pr" ? (
        <GitPullRequest size={14} />
      ) : (
        <ListTree size={14} />
      );
  } else if (view.mode === "pr") {
    recommendedAction = "Open PR Queue";
    recommendedHint =
      "Resolve the active PR-mode cycle before starting another run.";
    recommendedIcon = <GitPullRequest size={14} />;
  } else if (view.mode === "run") {
    recommendedAction = "Open Run";
    recommendedHint =
      "Workers are driving the board; telemetry and controls are the primary surface.";
  }
  return (
    <>
      <PageHeader
        kicker={view.game?.displayName ?? "No game selected"}
        title="Overview"
      />
      <div className="@container grid min-h-0 flex-1 content-top gap-4 overflow-auto p-4 max-w-4xl">
        <PanelSection>
          <PanelTitle>Active Cycle</PanelTitle>
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
            <div className="min-w-0">
              <div className="overflow-hidden text-ellipsis whitespace-nowrap text-sm text-fg">
                {view.activeCycleLabel}
              </div>
              <div className="mt-1 text-xs text-dim">
                Phase:{" "}
                <span
                  className={
                    view.mode === "pr"
                      ? "text-warn"
                      : view.mode === "run"
                        ? "text-up"
                        : "text-dim"
                  }
                >
                  {view.modeLabel}
                </span>
                {" / "}branch {view.branchLabel}
                {" / "}gate {view.newCycleBlocked ? "blocked" : "clear"}
              </div>
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <Button
                icon={<ListTree size={13} />}
                onClick={() =>
                  nav.goToCycle(cycleFocus, view.recommendedSub)
                }
                tone="primary"
                type="button"
              >
                Open Cycle
              </Button>
              {view.mode === "pr" ? (
                <Button
                  icon={<GitPullRequest size={13} />}
                  onClick={() => nav.goToCycle(cycleFocus, "pr")}
                  type="button"
                >
                  Open PR Queue
                </Button>
              ) : null}
              {view.canCompleteRun ? (
                <Button
                  disabled={busy}
                  icon={<Archive size={13} />}
                  onClick={() => onAction("completeRun")}
                  title="Mark this idle legacy run complete; confirmation can override stale ship or QA blockers."
                  tone="warning"
                  type="button"
                >
                  Close Cycle
                </Button>
              ) : null}
              <Button
                disabled={busy || !view.canStartWorkers}
                icon={
                  view.process.draining ? (
                    <RefreshCw size={13} />
                  ) : (
                    <Ban size={13} />
                  )
                }
                onClick={() => onAction(RUN_CONTROL_ACTIONS.pause)}
                title={
                  view.process.running
                    ? "Drain the managed process."
                    : "No process is running."
                }
                tone="warning"
                type="button"
              >
                Drain / Stop
              </Button>
              <Button
                icon={<RefreshCw size={13} />}
                onClick={() => onAction("refresh")}
                type="button"
              >
                Refresh
              </Button>
            </div>
          </div>
        </PanelSection>
        <SyncStateCard busy={busy} onAction={onAction} harnessState={view.harnessState} />
      </div>
    </>
  );
}
