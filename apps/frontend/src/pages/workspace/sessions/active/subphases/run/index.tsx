import { ProgressPanel } from "./components/progress-panel";
import { RunStateCard } from "./components/RunStateCard";
import {
  type ImprovedMode,
  type WorkMode,
  WorkTables,
} from "./components/work-tables";
import type { Dashboard, FormState } from "@/lib/format";
import type {
  DashboardAction,
  SessionView,
} from "@/pages/workspace/_lib/types";

export function RunModePage(props: {
  busy: boolean;
  dashboard: Dashboard | null;
  form: FormState;
  improvedMode: ImprovedMode;
  improvedPage: number;
  onAction: (action: DashboardAction) => void;
  setForm: (updates: Partial<FormState>) => void;
  setImprovedMode: (mode: ImprovedMode) => void;
  setImprovedPage: (page: number | ((page: number) => number)) => void;
  setWorkMode: (mode: WorkMode) => void;
  view: SessionView;
  workMode: WorkMode;
}) {
  return (
    <div className="grid gap-4">
      <RunStateCard busy={props.busy} onAction={props.onAction} projectState={props.view.projectState} />
      <ProgressPanel dashboard={props.dashboard} />
      <WorkTables
        dashboard={props.dashboard}
        improvedMode={props.improvedMode}
        improvedPage={props.improvedPage}
        setImprovedMode={props.setImprovedMode}
        setImprovedPage={props.setImprovedPage}
        setWorkMode={props.setWorkMode}
        workMode={props.workMode}
      />
    </div>
  );
}
