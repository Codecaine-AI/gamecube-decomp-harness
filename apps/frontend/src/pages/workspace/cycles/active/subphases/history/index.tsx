import { AlertTriangle } from "@/icons";
import { asArray, asObject, clock, num, pct, shortId, text, type Dashboard } from "@/lib/format";
import { EmptyState, InfoRows, PanelSection, PanelTitle } from "@/components/primitives";
import { prettyStatus } from "@/pages/workspace/_lib/model";
import type { CycleView } from "@/pages/workspace/_lib/types";

export function CycleHistoryPage({ dashboard, view }: { dashboard: Dashboard | null; view: CycleView }) {
  const epochs = asArray(dashboard?.epochs).map(asObject).slice(-12).reverse();
  const savePoint = asObject(asObject(dashboard?.campaign).savePoint);
  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-1 gap-4 @[760px]:grid-cols-2">
        <PanelSection>
          <PanelTitle>Latest Save Point</PanelTitle>
          <InfoRows
            rows={[
              ["Commit", text(savePoint.commit_sha, "-")],
              ["Trigger", text(savePoint.trigger_kind, "-")],
              ["Branch", text(savePoint.branch, view.branchLabel)],
              ["Matched", savePoint.matched_code_percent ? pct(savePoint.matched_code_percent) : "-"],
            ]}
          />
        </PanelSection>
        <PanelSection>
          <PanelTitle>PR Intake</PanelTitle>
          <InfoRows
            rows={[
              ["Tracked PRs", num(view.prRecords.length)],
              ["Unresolved", num(view.prRecords.filter((record) => !["merged", "closed"].includes(record.status)).length)],
              ["Upstream", Number.isFinite(view.prSummary.upstreamOpen) ? num(view.prSummary.upstreamOpen) : "unknown"],
              ["Gate", view.newCycleBlocked ? "blocked" : "clear", view.newCycleBlocked ? "text-warn" : "text-up"],
            ]}
          />
        </PanelSection>
      </div>
      {view.harnessState?.run?.recovery_points.length ? (
        <PanelSection className="border-warn/70 bg-warn/5">
          <div className="mb-3 flex items-center gap-2 text-warn">
            <AlertTriangle size={16} />
            <PanelTitle className="mb-0 text-warn">Run Recovery Boundaries</PanelTitle>
          </div>
          <ol className="m-0 grid gap-2 p-0">
            {[...view.harnessState.run.recovery_points].reverse().map((point) => (
              <li className="list-none border border-warn/60 border-l-4 bg-ink/30 px-3 py-2" key={point.event_id}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <strong className="text-sm text-warn">Run recovered → {prettyStatus(point.resulting_status, "unknown")}</strong>
                  <time className="text-[11px] text-soft" dateTime={point.occurred_at}>{clock(point.occurred_at)}</time>
                </div>
                <div className="mt-1 text-xs text-soft">{point.recovery_reason || "Recovery reason not recorded"}</div>
                <div className="mt-1 text-[11px] text-dim">
                  Event {point.sequence} · {shortId(point.event_id)} · cancelled {num(point.cancelled_claim_ids.length)} claims / {num(point.cancelled_operation_ids.length)} operations
                </div>
              </li>
            ))}
          </ol>
        </PanelSection>
      ) : null}
      <PanelSection>
        <PanelTitle>Epoch Checkpoints</PanelTitle>
        {epochs.length === 0 ? (
          <EmptyState>No epoch checkpoints recorded for the visible cycle.</EmptyState>
        ) : (
          <div className="overflow-hidden border border-line bg-card">
            {epochs.map((epoch) => (
              <div className="grid min-h-8 grid-cols-[160px_110px_minmax(0,1fr)] items-center gap-2 border-t border-line px-2.5 py-1.5 first:border-t-0 max-[780px]:grid-cols-1" key={text(epoch.id, text(epoch.createdAt))}>
                <span className="text-soft">{clock(epoch.createdAt)}</span>
                <span className="text-up">{pct(epoch.matchedCodePercent)}</span>
                <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-dim">{text(epoch.label, "epoch checkpoint")}</span>
              </div>
            ))}
          </div>
        )}
      </PanelSection>
    </div>
  );
}
