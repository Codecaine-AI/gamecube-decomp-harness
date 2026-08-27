import { ProgressPanel } from "./components/progress-panel";
import { BoundaryPanel } from "./components/boundary-panel";
import {
  type ImprovedMode,
  type WorkMode,
  WorkTables,
} from "./components/work-tables";
import type { Dashboard } from "@/lib/format";
import type { CycleView } from "@/pages/workspace/_lib/types";

export function RunModePage(props: {
  dashboard: Dashboard | null;
  improvedMode: ImprovedMode;
  improvedPage: number;
  onSelectAttempt?: (workerStateId: string) => void;
  setImprovedMode: (mode: ImprovedMode) => void;
  setImprovedPage: (page: number | ((page: number) => number)) => void;
  setWorkMode: (mode: WorkMode) => void;
  view: CycleView;
  workMode: WorkMode;
}) {
  return (
    <div className="grid gap-4">
      <ProgressPanel dashboard={props.dashboard} />
      <BoundaryPanel dashboard={props.dashboard} view={props.view} />
      <WorkTables
        dashboard={props.dashboard}
        improvedMode={props.improvedMode}
        improvedPage={props.improvedPage}
        onSelectAttempt={props.onSelectAttempt}
        setImprovedMode={props.setImprovedMode}
        setImprovedPage={props.setImprovedPage}
        setWorkMode={props.setWorkMode}
        workMode={props.workMode}
      />
    </div>
  );
}
