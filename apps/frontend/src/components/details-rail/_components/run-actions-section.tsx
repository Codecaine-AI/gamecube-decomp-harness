import { Play } from "@/icons";
import { Button } from "@/components/primitives";
import { RunActionsGrid } from "@/pages/workspace/_components/run";
import type { CycleView, HarnessStateReadModel, DashboardAction } from "@/pages/workspace/_lib/types";

export function RunActionsSection({
  busy,
  harnessState,
  onAction,
  view,
}: {
  busy: boolean;
  harnessState: HarnessStateReadModel | null;
  onAction: (action: DashboardAction) => void;
  view: CycleView;
}) {
  const startBlocked = view.prepareState.readyToStartRun
    ? ""
    : view.operationActive
      ? `${view.operationLabel} is in progress.`
      : view.process.running
        ? "Workers are already running."
        : !view.prepareState.baselineDone
          ? "Baseline is not ready."
          : "Preparation is not ready.";
  return (
    <div className="grid gap-3 p-3">
      <Button
        disabled={busy || !view.prepareState.readyToStartRun}
        icon={<Play size={14} />}
        onClick={() => onAction("startWork")}
        title={startBlocked || "Initialize the run and start workers."}
        tone={view.prepareState.readyToStartRun ? "primary" : undefined}
        type="button"
      >
        Start Run
      </Button>
      <RunActionsGrid busy={busy} harnessState={harnessState} onAction={onAction} />
    </div>
  );
}
