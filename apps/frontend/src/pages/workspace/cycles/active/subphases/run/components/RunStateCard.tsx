import { AlertTriangle, Ban, Play, RotateCcw, X } from "@/icons";
import { num, pct } from "@/lib/format";
import { Button, PanelSection, PanelTitle, StatCard } from "@/components/primitives";
import { prettyStatus, harnessStateAction } from "@/pages/workspace/_lib/model";
import type {
  DashboardAction,
  HarnessStateActionProjection,
  HarnessStateReadModel,
} from "@/pages/workspace/_lib/types";

const RUN_ACTIONS: ReadonlyArray<{
  actionId: string;
  dashboardAction: DashboardAction;
  icon: typeof Play;
  label: string;
}> = [
  { actionId: "run.start", dashboardAction: "runStart", icon: Play, label: "Start" },
  { actionId: "run.resume", dashboardAction: "runResume", icon: Play, label: "Resume" },
  { actionId: "run.hard_stop", dashboardAction: "runHardStop", icon: X, label: "Stop" },
  { actionId: "run.cancel", dashboardAction: "runCancel", icon: Ban, label: "Cancel" },
  { actionId: "run.recover", dashboardAction: "runRecover", icon: RotateCcw, label: "Recover" },
];

function projectionTitle(projection: HarnessStateActionProjection | null): string {
  if (!projection) return "Action is missing from the server projection.";
  if (!projection.enabled) {
    return projection.blocked_by.map((blocker) => blocker.message || prettyStatus(blocker.code)).join("; ") || "Blocked by the server projection.";
  }
  return projection.expected_transition;
}

function score(value: number | null): string {
  return value === null ? "n/a" : pct(value);
}

export function RunStateCard({ busy, onAction, harnessState }: {
  busy: boolean;
  onAction: (action: DashboardAction) => void;
  harnessState: HarnessStateReadModel | null;
}) {
  const run = harnessState?.run ?? null;

  return (
    <PanelSection>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <PanelTitle className="mb-0">Run State</PanelTitle>
        <span className={`status-tag ${run?.status === "active" ? "status-tag-live" : run?.status === "failed" ? "status-tag-warn" : ""}`}>
          <span className="lamp" />
          {run ? prettyStatus(run.status) : "No run"}
        </span>
      </div>

      {run ? (
        <>
          <div className="grid grid-cols-2 gap-2 @[760px]:grid-cols-3">
            <StatCard label="Scheduler" value={prettyStatus(run.scheduler_condition, "unknown")} />
            <StatCard label="Active epoch" value={run.active_epoch ? `#${num(run.active_epoch.ordinal)} · ${run.active_epoch.epoch_id}` : "none"} />
            <StatCard label="Run" value={run.workflow_id} />
          </div>
          <div className="mt-2 grid grid-cols-3 gap-2">
            <StatCard label="Admitted" value={num(run.admitted)} />
            <StatCard label="Claimed" value={num(run.claimed)} />
            <StatCard label="Running" value={num(run.running)} />
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2 @[760px]:grid-cols-5">
            <StatCard label="Baseline" value={score(run.progress.baseline_score)} />
            <StatCard label="Confirmed score" value={score(run.progress.confirmed_score)} />
            <StatCard label="Tentative" value={num(run.progress.tentative_changes)} />
            <StatCard label="Confirmed" tone="text-up" value={num(run.progress.confirmed_changes)} />
            <StatCard label="Regressed" tone={run.progress.regressed_changes > 0 ? "text-down" : "text-soft"} value={num(run.progress.regressed_changes)} />
          </div>
        </>
      ) : (
        <p className="m-0 text-xs text-dim">No run summary is present in the server read model.</p>
      )}

      <div className="mt-4 grid grid-cols-2 gap-2 @[760px]:grid-cols-3">
        {RUN_ACTIONS.map((definition) => {
          const projection = harnessStateAction(harnessState, definition.actionId);
          const Icon = definition.icon;
          return (
            <div className="min-w-0 border border-line bg-card p-2" key={definition.actionId}>
              <Button
                className="w-full"
                disabled={busy || !projection?.enabled}
                icon={<Icon size={13} />}
                onClick={() => onAction(definition.dashboardAction)}
                title={projectionTitle(projection)}
                tone={projection?.confirmation_required ? "danger" : definition.actionId === "run.start" || definition.actionId === "run.resume" ? "primary" : undefined}
                type="button"
              >
                {definition.label}
              </Button>
              <div className="mt-1.5 text-[10px] leading-4 text-dim">
                {projection?.confirmation_required ? (
                  <span className="inline-flex items-center gap-1 font-bold uppercase tracking-[0.08em] text-down"><AlertTriangle size={11} /> Confirm required</span>
                ) : (
                  <span className="font-bold uppercase tracking-[0.08em]">No confirmation</span>
                )}
                <div className="mt-0.5 text-soft">{projection?.expected_transition || "Unavailable"}</div>
                {!projection?.enabled && projection?.blocked_by.length ? (
                  <div className="mt-0.5 text-warn">{projection.blocked_by.map((blocker) => blocker.message || prettyStatus(blocker.code)).join("; ")}</div>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </PanelSection>
  );
}
