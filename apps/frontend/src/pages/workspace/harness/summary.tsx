import { InfoRows, PanelSection, PanelTitle } from "@/components/primitives";
import { prettyStatus } from "@/pages/workspace/_lib/model";
import type { HarnessView } from "@/pages/workspace/_lib/types";

export function HarnessSummary({ view }: { view: HarnessView }) {
  const state = view.harnessState;
  const harness = state?.state;
  return (
    <PanelSection>
      <PanelTitle>Harness</PanelTitle>
      <InfoRows rows={[
        ["Worktree", harness?.source.worktree || view.game?.repoRoot || "Not configured"],
        ["Accepted head", harness?.source.head || "Not recorded"],
        ["Upstream baseline", harness?.source.upstream_revision || "Not recorded"],
        ["Desired state", harness ? prettyStatus(harness.execution.desired) : "Not initialized"],
        ["Workflow", state?.active_workflow?.headline || (harness ? prettyStatus(harness.execution.status) : "Initial Sync required")],
        ["Epoch", harness?.history.epoch_id || state?.run?.active_epoch?.epoch_id || "None"],
        ["Sync", harness?.history.sync_id || state?.sync?.workflow_id || "None"],
        ["Save point", harness?.history.save_point_id || "Not recorded"],
      ]} />
      {harness ? (
        <div className="mt-3 grid gap-2">
          <div className="flex flex-wrap gap-2" aria-label="Run readiness">
            {Object.entries(harness.readiness).map(([gate, status]) => (
              <span className={`border border-line px-2 py-1 text-xs ${status === "ready" ? "text-up" : "text-warn"}`} key={gate}>{prettyStatus(gate)}: {prettyStatus(status)}</span>
            ))}
          </div>
          {harness.execution.blockers.map((blocker) => <p className="m-0 text-xs text-warn" key={`${blocker.code}:${blocker.source_id}`}>{blocker.message}</p>)}
          {harness.execution.desired === "paused" ? <p className="m-0 text-xs text-dim">Paused. Sync preserves this setting; the next epoch waits for Resume.</p> : null}
        </div>
      ) : <p className="mb-0 text-xs text-warn">Harness state is not initialized. Existing evidence remains available.</p>}
    </PanelSection>
  );
}
