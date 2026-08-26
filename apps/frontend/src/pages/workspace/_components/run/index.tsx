import { AlertTriangle, Ban, Play, RotateCcw, X } from "@/icons";
import { Button } from "@/components/primitives";
import { harnessStateAction, prettyStatus } from "@/pages/workspace/_lib/model";
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

export function RunActionsGrid({ busy, harnessState, onAction }: {
  busy: boolean;
  harnessState: HarnessStateReadModel | null;
  onAction: (action: DashboardAction) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-2">
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
  );
}
