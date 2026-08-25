import { ProgressPanel } from "./components/progress-panel";
import { RunStateCard } from "./components/RunStateCard";
import {
  type ImprovedMode,
  type WorkMode,
  WorkTables,
} from "./components/work-tables";
import { shortId } from "@/lib/format";
import type { Dashboard, FormState } from "@/lib/format";
import type {
  DashboardAction,
  CycleView,
  HarnessStateRepoSyncReadModel,
} from "@/pages/workspace/_lib/types";

// One-line head-vs-upstream summary from the server-owned repo_sync read
// model. Absent field (older server) renders nothing; null members render "-".
function repoSummaryLine(repoSync: HarnessStateRepoSyncReadModel | null): string {
  if (!repoSync) return "";
  const head = repoSync.cycle_head ? shortId(repoSync.cycle_head) : "-";
  const upstream = repoSync.upstream_ref || "-";
  const behind =
    repoSync.behind_count === null
      ? `unknown vs ${upstream}`
      : repoSync.behind_count === 0
        ? `up to date with ${upstream}`
        : `${repoSync.behind_count.toLocaleString()} behind ${upstream}`;
  return `head ${head} · ${behind}`;
}

export function RunModePage(props: {
  busy: boolean;
  dashboard: Dashboard | null;
  form: FormState;
  improvedMode: ImprovedMode;
  improvedPage: number;
  onAction: (action: DashboardAction) => void;
  onSelectAttempt?: (workerStateId: string) => void;
  setForm: (updates: Partial<FormState>) => void;
  setImprovedMode: (mode: ImprovedMode) => void;
  setImprovedPage: (page: number | ((page: number) => number)) => void;
  setWorkMode: (mode: WorkMode) => void;
  view: CycleView;
  workMode: WorkMode;
}) {
  const repoSync = props.view.harnessState?.repo_sync ?? null;
  const repoLine = repoSummaryLine(repoSync);
  return (
    <div className="grid gap-4">
      {repoLine ? (
        <div
          className="font-mono text-[11px] text-dim"
          title={repoSync?.cycle_head ?? undefined}
        >
          {repoLine}
        </div>
      ) : null}
      <RunStateCard busy={props.busy} onAction={props.onAction} harnessState={props.view.harnessState} />
      <ProgressPanel dashboard={props.dashboard} />
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
