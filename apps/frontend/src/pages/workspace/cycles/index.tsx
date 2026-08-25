import { Archive, RotateCcw, Save } from "@/icons";
import { asObject, clock, num, shortId } from "@/lib/format";
import { Button, PageHeader, PanelSection, PanelTitle } from "@/components/primitives";
import { prettyStatus, harnessStateAction } from "@/pages/workspace/_lib/model";
import type { DashboardAction, HarnessStateActionProjection, CycleView, WorkspaceNav } from "@/pages/workspace/_lib/types";
import { ActiveCyclePage } from "@/pages/workspace/cycles/active/page";
import { CycleHistoryTable } from "@/pages/workspace/cycles/components/CycleHistoryTable";
import { activeCycleFocus } from "@/pages/workspace/cycles/_lib/cycleRoute";
import type { CyclesPageProps } from "@/pages/workspace/cycles/_lib/types";

export function CyclesPage(props: CyclesPageProps) {
  if (props.route.cycle === "active" || (props.route.cycle && props.route.cycle !== "new")) {
    return <ActiveCyclePage {...props} />;
  }
  return <CyclesIndexPage busy={props.busy} nav={props.nav} onAction={props.onAction} view={props.view} />;
}

function CyclesIndexPage({ busy, nav, onAction, view }: { busy: boolean; nav: WorkspaceNav; onAction: (action: DashboardAction) => void; view: CycleView }) {
  const savePoint = asObject(asObject(view.prSummary.ship).savePoint);
  const cycleFocus = activeCycleFocus(view);
  const harnessState = view.harnessState;
  const cycle = harnessState?.cycle ?? null;
  const canonicalSavePoint = cycle?.latest_save_point ?? null;
  const savePointAction = harnessStateAction(harnessState, "cycle.save_point");
  const closeAction = harnessStateAction(harnessState, "cycle.close");
  const activeWorkflow = harnessState?.active_workflow ?? null;
  const queuedCount = harnessState?.queued_dispatch_requests.length ?? 0;
  const authorityLabel = !harnessState
    ? "Authority unavailable"
    : activeWorkflow
      ? `${prettyStatus(activeWorkflow.kind)} · ${prettyStatus(activeWorkflow.status)}${queuedCount > 0 ? ` · ${queuedCount} queued` : ""}`
      : `Lease free${queuedCount > 0 ? ` · ${queuedCount} queued` : ""}`;
  return (
    <>
      <PageHeader kicker={view.game?.displayName ?? "No game selected"} title="Cycles" />
      <div className="@container grid min-h-0 flex-1 content-start grid-cols-[minmax(300px,1fr)_minmax(0,1.6fr)] gap-4 overflow-auto p-4 max-[1180px]:grid-cols-1">
        <PanelSection>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <PanelTitle className="mb-0">Active Cycle</PanelTitle>
            <span
              className={`status-tag ${activeWorkflow && ["blocked", "releasing"].includes(activeWorkflow.status) ? "status-tag-warn" : activeWorkflow ? "status-tag-live" : ""}`}
              title={activeWorkflow?.headline}
            >
              <span className="lamp" />
              {authorityLabel}
            </span>
          </div>
          <div className="grid gap-3">
            <div className="min-w-0">
              <div className="overflow-hidden text-ellipsis whitespace-nowrap text-sm text-fg">{view.activeCycleLabel}</div>
              <div className="mt-1 text-xs text-dim">
                {cycle ? (
                  <>
                    Head <span className="font-mono text-soft" title={cycle.head_revision ?? undefined}>{cycle.head_revision ? cycle.head_revision.slice(0, 10) : "unknown"}</span>
                    {" / "}status {prettyStatus(cycle.status)}
                    {" / "}harness revision {harnessState?.harness_revision ?? 0}
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
              {cycle ? (
                <div className="mt-3 border border-line bg-card px-2.5 py-2 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-dim">Latest save point</span>
                    {cycle.save_point_stale ? (
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
              {view.newCycleBlocked ? (
                <div className="mt-2 text-xs text-warn">
                  New cycle blocked - {view.newCycleReasons.slice(0, 3).join("; ")}
                  {view.newCycleReasons.length > 3 ? " ..." : ""}
                </div>
              ) : null}
              {activeWorkflow ? (
                <div className="mt-2 text-xs text-soft">
                  <span className="font-medium text-fg">{activeWorkflow.headline}</span>
                  {activeWorkflow.blockers.length > 0 ? ` — ${activeWorkflow.blockers.map((blocker) => blocker.message || prettyStatus(blocker.code)).join("; ")}` : ""}
                </div>
              ) : null}
              {(harnessState?.queued_dispatch_requests.length ?? 0) > 0 ? (
                <ul className="mb-0 mt-2 grid gap-1 p-0 text-xs text-dim" aria-label="Queued dispatch requests">
                  {harnessState?.queued_dispatch_requests.map((request, index) => (
                    <li className="list-none" key={`${request.kind}:${request.workflow_id}:${index}`}>
                      Queued {prettyStatus(request.kind)} · {request.workflow_id}{request.reason ? ` — ${request.reason}` : ""}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button icon={<Archive size={13} />} onClick={() => nav.goToCycle(cycleFocus, view.recommendedSub)} tone="primary" type="button">
                Open Cycle
              </Button>
              <Button
                disabled={busy || !savePointAction?.enabled}
                icon={<Save size={13} />}
                onClick={() => onAction("cycleSavePoint")}
                title={actionTitle(savePointAction, "Save-point action is not available in the server projection.")}
                type="button"
              >
                Record save point
              </Button>
              <Button
                disabled={busy || !closeAction?.enabled}
                icon={<Archive size={13} />}
                onClick={() => onAction("cycleClose")}
                title={actionTitle(closeAction, "Close action is not available in the server projection.")}
                tone="warning"
                type="button"
              >
                Close cycle
              </Button>
              {!cycle && view.canCompleteRun ? (
                <Button disabled={busy} icon={<Archive size={13} />} onClick={() => onAction("completeRun")} title="Mark this idle legacy run complete; confirmation can override stale ship or QA blockers." tone="warning" type="button">
                  Close legacy cycle
                </Button>
              ) : null}
              <Button icon={<RotateCcw size={13} />} disabled={busy || view.newCycleBlocked} onClick={() => onAction("fresh")} title={view.newCycleBlocked ? view.newCycleReasons.join("; ") : "Checkpoint, reset baseline, and start a new cycle."} tone="warning" type="button">
                New Cycle
              </Button>
            </div>
            <div className="text-[11px] text-dim">Record save point: {savePointAction?.expected_transition ?? "missing server projection"}</div>
            <ActionBlockers label="Record save point" projection={savePointAction} />
            <div className="text-[11px] text-dim">Close cycle: {closeAction?.expected_transition ?? "missing server projection"}</div>
            <ActionBlockers label="Close cycle" projection={closeAction} />
            {cycle ? (
              <div className="border-t border-line pt-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-dim">Cycle timeline</span>
                  <span className="text-[10px] text-dim">event {harnessState?.recent_events[0]?.sequence ?? 0}</span>
                </div>
                {cycle.timeline.length > 0 ? (
                  <ol className="m-0 grid gap-1.5 p-0">
                    {cycle.timeline.map((entry) => (
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
          <PanelTitle>Past Cycles</PanelTitle>
          <CycleHistoryTable savePoint={savePoint} view={view} />
        </PanelSection>
      </div>
    </>
  );
}

function actionTitle(projection: HarnessStateActionProjection | null, missing: string): string {
  if (!projection) return missing;
  if (projection.enabled) return projection.expected_transition;
  return projection.blocked_by.map((blocker) => blocker.message || blocker.code).join("; ") || "Blocked by the server projection.";
}

function ActionBlockers({ label, projection }: { label: string; projection: HarnessStateActionProjection | null }) {
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
