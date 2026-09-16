import { ListTree, RefreshCw } from "@/icons";
import type { FormState } from "@/lib/format";
import { Button, PageHeader } from "@/components/primitives";
import type { DashboardAction, HarnessView, WorkspaceNav } from "@/pages/workspace/_lib/types";
import { SyncStateCard } from "@/pages/workspace/overview/SyncStateCard";
import { HarnessSummary } from "@/pages/workspace/harness/summary";

export function OverviewPage({ busy, nav, onAction, view }: {
  busy: boolean; form: FormState; nav: WorkspaceNav; onAction: (action: DashboardAction) => void; view: HarnessView;
}) {
  return (
    <>
      <PageHeader kicker={view.game?.displayName ?? "No game selected"} title="Overview" />
      <div className="@container grid min-h-0 flex-1 content-start gap-4 overflow-auto p-4 max-w-4xl">
        <HarnessSummary view={view} />
        <div className="flex flex-wrap gap-2">
          <Button icon={<ListTree size={13} />} onClick={() => nav.goToHarness(view.recommendedSub)} tone="primary" type="button">Open Harness</Button>
          <Button onClick={() => nav.goToHarness("artifacts")} type="button">Boundary History</Button>
          <Button disabled={busy} icon={<RefreshCw size={13} />} onClick={() => onAction("refresh")} type="button">Refresh</Button>
        </div>
        <SyncStateCard busy={busy} onAction={onAction} harnessState={view.harnessState} />
      </div>
    </>
  );
}
