import {
  Archive,
  Ban,
  Database,
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
  SessionView,
  WorkspaceNav,
} from "@/pages/workspace/_lib/types";
import { activeSessionFocus } from "@/pages/workspace/sessions/_lib/sessionRoute";

function readinessRows(
  view: SessionView,
  nav: WorkspaceNav,
): Array<[string, ReactNode, string]> {
  const repoTone =
    view.project?.repoRootExists === false ? "text-down" : "text-up";
  const stateTone =
    view.project?.stateDirExists === false ? "text-down" : "text-up";
  const graphTone =
    view.project?.graphDbExists === false ? "text-down" : "text-up";
  return [
    [
      "Repository",
      view.project?.repoRootExists === false
        ? "missing checkout"
        : "synced / known branch",
      repoTone,
    ],
    [
      "State dir",
      view.project?.stateDirExists === false ? "missing" : "present",
      stateTone,
    ],
    [
      "Graph DB",
      view.project?.graphDbExists === false ? "not built" : "built",
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
  view: SessionView;
}) {
  const sessionFocus = activeSessionFocus(view);
  const hasCanonicalActiveSession = Boolean(
    view.activeSessionId &&
    view.canonicalPhase &&
    view.canonicalPhase !== "complete",
  );
  const activePhaseLabel = [view.canonicalPhase, view.canonicalSubphase]
    .filter(Boolean)
    .map(prettyPhase)
    .join(" / ");
  let recommendedAction = "Start a Session";
  let recommendedHint =
    "No active session. Open the project sessions to start a run when ready.";
  let recommendedIcon: ReactNode = <Play size={14} />;
  if (hasCanonicalActiveSession) {
    recommendedAction =
      view.canonicalPhase === "preparing"
        ? "Open Preparation"
        : view.canonicalPhase === "running"
          ? "Open Run"
          : view.canonicalPhase === "pr"
            ? "Open PR Queue"
            : "Open Session";
    recommendedHint = `Continue the active ${activePhaseLabel || "project"} session. New Session is gated until this session is complete.`;
    recommendedIcon =
      view.canonicalPhase === "pr" ? (
        <GitPullRequest size={14} />
      ) : (
        <ListTree size={14} />
      );
  } else if (view.mode === "pr") {
    recommendedAction = "Open PR Queue";
    recommendedHint =
      "Resolve the active PR-mode session before starting another run.";
    recommendedIcon = <GitPullRequest size={14} />;
  } else if (view.mode === "run") {
    recommendedAction = "Open Run";
    recommendedHint =
      "Workers are driving the board; telemetry and controls are the primary surface.";
  }
  return (
    <>
      <PageHeader
        kicker={view.project?.displayName ?? "No project selected"}
        title="Overview"
      />
      <div className="@container grid min-h-0 flex-1 content-top gap-4 overflow-auto p-4 max-w-4xl">
        <PanelSection>
          <PanelTitle>Active Session</PanelTitle>
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
            <div className="min-w-0">
              <div className="overflow-hidden text-ellipsis whitespace-nowrap text-sm text-fg">
                {view.activeSessionLabel}
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
                {" / "}gate {view.newSessionBlocked ? "blocked" : "clear"}
              </div>
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <Button
                icon={<ListTree size={13} />}
                onClick={() =>
                  nav.goToSession(sessionFocus, view.recommendedSub)
                }
                tone="primary"
                type="button"
              >
                Open Session
              </Button>
              {view.mode === "pr" ? (
                <Button
                  icon={<GitPullRequest size={13} />}
                  onClick={() => nav.goToSession(sessionFocus, "pr")}
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
                  Close Session
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
              <Button
                disabled={
                  busy ||
                  view.syncLocked ||
                  view.process.running ||
                  view.activeClaims > 0 ||
                  view.operationActive
                }
                icon={<Database size={13} />}
                onClick={() => onAction("sync")}
                title={
                  view.syncLocked
                    ? "Sync is locked while the run is active."
                    : "Pull upstream, intake merged PRs, and rebuild knowledge."
                }
                type="button"
              >
                Sync
              </Button>
            </div>
          </div>
        </PanelSection>
      </div>
    </>
  );
}
