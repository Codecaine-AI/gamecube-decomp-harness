import { Archive, RefreshCw, RotateCcw, Save } from "@/icons";
import { asObject, clock, num, shortId } from "@/lib/format";
import { Button, PageHeader, PanelSection, PanelTitle } from "@/components/primitives";
import { RUN_CONTROL_ACTIONS } from "@/components/app/_lib/projectedRunControls";
import { prettyStatus, projectStateAction } from "@/pages/workspace/_lib/model";
import type { DashboardAction, ProjectStateActionProjection, SessionView, WorkspaceNav } from "@/pages/workspace/_lib/types";
import { ActiveSessionPage } from "@/pages/workspace/sessions/active/page";
import { SessionHistoryTable } from "@/pages/workspace/sessions/components/SessionHistoryTable";
import { activeSessionFocus } from "@/pages/workspace/sessions/_lib/sessionRoute";
import type { SessionsPageProps } from "@/pages/workspace/sessions/_lib/types";

export function SessionsPage(props: SessionsPageProps) {
  if (props.route.session === "active" || (props.route.session && props.route.session !== "new")) {
    return <ActiveSessionPage {...props} />;
  }
  return <SessionsIndexPage busy={props.busy} nav={props.nav} onAction={props.onAction} view={props.view} />;
}

function SessionsIndexPage({ busy, nav, onAction, view }: { busy: boolean; nav: WorkspaceNav; onAction: (action: DashboardAction) => void; view: SessionView }) {
  const savePoint = asObject(asObject(view.prSummary.ship).savePoint);
  const sessionFocus = activeSessionFocus(view);
  const projectState = view.projectState;
  const session = projectState?.session ?? null;
  const canonicalSavePoint = session?.latest_save_point ?? null;
  const savePointAction = projectStateAction(projectState, "session.save_point");
  const closeAction = projectStateAction(projectState, "session.close");
  const activeWorkflow = projectState?.active_workflow ?? null;
  const handoff = activeWorkflow?.requested_handoff;
  const queuedCount = projectState?.queued_dispatch_requests.length ?? 0;
  const authorityLabel = !projectState
    ? "Authority unavailable"
    : activeWorkflow
      ? `${prettyStatus(activeWorkflow.kind)} · ${prettyStatus(activeWorkflow.status)}${handoff ? ` → ${prettyStatus(handoff.target_kind)}` : ""}${queuedCount > 0 ? ` · ${queuedCount} queued` : ""}`
      : `Lease free${queuedCount > 0 ? ` · ${queuedCount} queued` : ""}`;
  return (
    <>
      <PageHeader kicker={view.project?.displayName ?? "No project selected"} title="Sessions" />
      <div className="@container grid min-h-0 flex-1 content-start grid-cols-[minmax(300px,1fr)_minmax(0,1.6fr)] gap-4 overflow-auto p-4 max-[1180px]:grid-cols-1">
        <PanelSection>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <PanelTitle className="mb-0">Active Session</PanelTitle>
            <span
              className={`status-tag ${activeWorkflow && ["draining", "blocked", "releasing"].includes(activeWorkflow.status) ? "status-tag-warn" : activeWorkflow ? "status-tag-live" : ""}`}
              title={handoff ? `${handoff.reason} (${handoff.target_workflow_id})` : activeWorkflow?.lease_id}
            >
              <span className="lamp" />
              {authorityLabel}
            </span>
          </div>
          <div className="grid gap-3">
            <div className="min-w-0">
              <div className="overflow-hidden text-ellipsis whitespace-nowrap text-sm text-fg">{view.activeSessionLabel}</div>
              <div className="mt-1 text-xs text-dim">
                {session ? (
                  <>
                    Head <span className="font-mono text-soft" title={session.head_revision ?? undefined}>{session.head_revision ? session.head_revision.slice(0, 10) : "unknown"}</span>
                    {" / "}status {prettyStatus(session.status)}
                    {" / "}project revision {projectState?.revision ?? 0}
                  </>
                ) : (
                  <>
                    Phase: {view.canonicalPhase ? view.canonicalPhase.replace(/_/g, " ") : view.modeLabel}
                    {view.canonicalSubphase ? ` / ${view.canonicalSubphase.replace(/_/g, " ")}` : ""}
                    {" / "} branch {view.branchLabel}
                    {" / "} claims {num(view.activeClaims)}
                  </>
                )}
              </div>
              {session ? (
                <div className="mt-3 border border-line bg-card px-2.5 py-2 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-dim">Latest save point</span>
                    {session.save_point_stale ? (
                      <span className="status-tag status-tag-warn">stale</span>
                    ) : canonicalSavePoint ? (
                      <span className="status-tag">current</span>
                    ) : (
                      <span className="status-tag">none</span>
                    )}
                  </div>
                  <div className="mt-1 min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-soft">
                    {canonicalSavePoint
                      ? `${canonicalSavePoint.label || prettyStatus(canonicalSavePoint.triggerKind) || shortId(canonicalSavePoint.id)} · ${shortId(canonicalSavePoint.commitSha)}`
                      : "No save point recorded"}
                  </div>
                  {canonicalSavePoint?.createdAt ? <div className="mt-0.5 text-[11px] text-dim">Recorded {clock(canonicalSavePoint.createdAt)}</div> : null}
                </div>
              ) : null}
              {view.newSessionBlocked ? (
                <div className="mt-2 text-xs text-warn">
                  New session blocked - {view.newSessionReasons.slice(0, 3).join("; ")}
                  {view.newSessionReasons.length > 3 ? " ..." : ""}
                </div>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button icon={<Archive size={13} />} onClick={() => nav.goToSession(sessionFocus, view.recommendedSub)} tone="primary" type="button">
                Open Session
              </Button>
              {view.process.running ? (
                <Button disabled={busy} icon={view.process.draining ? <RefreshCw size={13} /> : <Archive size={13} />} onClick={() => onAction(RUN_CONTROL_ACTIONS.pause)} tone="warning" type="button">
                  {view.process.draining ? "Draining" : "Drain Run"}
                </Button>
              ) : null}
              {session ? (
                <>
                  <Button
                    disabled={busy || !savePointAction?.enabled}
                    icon={<Save size={13} />}
                    onClick={() => onAction("sessionSavePoint")}
                    title={actionTitle(savePointAction, "Save-point action is not available in the server projection.")}
                    type="button"
                  >
                    Record save point
                  </Button>
                  <Button
                    disabled={busy || !closeAction?.enabled}
                    icon={<Archive size={13} />}
                    onClick={() => onAction("sessionClose")}
                    title={actionTitle(closeAction, "Close action is not available in the server projection.")}
                    tone="warning"
                    type="button"
                  >
                    Close session
                  </Button>
                </>
              ) : view.canCompleteRun ? (
                <Button disabled={busy} icon={<Archive size={13} />} onClick={() => onAction("completeRun")} title="Mark this idle legacy run complete; confirmation can override stale ship or QA blockers." tone="warning" type="button">
                  Close Session
                </Button>
              ) : null}
              <Button icon={<RotateCcw size={13} />} disabled={busy || view.newSessionBlocked} onClick={() => onAction("fresh")} title={view.newSessionBlocked ? view.newSessionReasons.join("; ") : "Checkpoint, reset baseline, and start a new session."} tone="warning" type="button">
                New Session
              </Button>
            </div>
            {session ? <ActionBlockers label="Record save point" projection={savePointAction} /> : null}
            {session ? <ActionBlockers label="Close session" projection={closeAction} /> : null}
            {session ? (
              <div className="border-t border-line pt-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-dim">Session timeline</span>
                  <span className="text-[10px] text-dim">event {projectState?.latest_event_sequence ?? 0}</span>
                </div>
                {session.timeline.length > 0 ? (
                  <ol className="m-0 grid gap-1.5 p-0">
                    {session.timeline.map((entry) => (
                      <li className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 border border-line bg-card px-2.5 py-2 text-xs" key={`${entry.entry_kind}:${entry.entry_id}`}>
                        <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-soft">
                          <span className="text-fg">{timelineEntryLabel(entry.entry_kind)}</span>
                          {" · "}{shortId(entry.entry_id)}
                        </span>
                        <time className="text-[11px] text-dim" dateTime={entry.occurred_at}>{clock(entry.occurred_at)}</time>
                      </li>
                    ))}
                  </ol>
                ) : <p className="m-0 text-xs text-dim">No timeline entries recorded.</p>}
              </div>
            ) : null}
          </div>
        </PanelSection>
        <PanelSection>
          <PanelTitle>Past Sessions</PanelTitle>
          <SessionHistoryTable savePoint={savePoint} view={view} />
        </PanelSection>
      </div>
    </>
  );
}

function actionTitle(projection: ProjectStateActionProjection | null, missing: string): string {
  if (!projection) return missing;
  if (projection.enabled) return projection.expected_transition;
  return projection.blocked_by.map((blocker) => blocker.message || blocker.code).join("; ") || "Blocked by the server projection.";
}

function ActionBlockers({ label, projection }: { label: string; projection: ProjectStateActionProjection | null }) {
  if (!projection || projection.enabled || projection.blocked_by.length === 0) return null;
  return (
    <div className="text-xs text-warn">
      {label} blocked — {projection.blocked_by.map((blocker) => blocker.message || prettyStatus(blocker.code)).join("; ")}
    </div>
  );
}

function timelineEntryLabel(kind: string): string {
  if (kind === "epoch_completed") return "Epoch completed";
  if (kind === "remote_application") return "Remote application";
  if (kind === "pr_phase") return "PR phase";
  if (kind === "save_point") return "Save point";
  return prettyStatus(kind);
}
