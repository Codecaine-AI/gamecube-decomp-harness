import { Archive, GitBranch, GitPullRequest, Hammer, Pause, RefreshCw, RotateCcw, ShieldCheck, Wrench } from "@/icons";
import { Button, PanelSection, PanelTitle } from "@/components/primitives";
import { prettyStatus, projectStateAction } from "@/pages/workspace/_lib/model";
import type { DashboardAction, SessionView } from "@/pages/workspace/_lib/types";
import { prLockReason } from "./prStatus";
import { RUN_CONTROL_ACTIONS } from "@/components/app/_lib/projectedRunControls";

export function PrModeActions({ busy, onAction, view }: { busy: boolean; onAction: (action: DashboardAction) => void; view: SessionView }) {
  const prepareEnabled = view.handoffIdle && (view.runStatus === "active" || view.runStatus === "paused");
  const lockReason = prLockReason(view);
  const localPrepCount = view.prRecords.filter((record) => record.status === "planned" && record.localStatus === "not_prepared").length;
  const publishBatch = projectStateAction(view.projectState, "pr.publish_batch");
  const publishTitle = publishBatch?.enabled
    ? publishBatch.expected_transition
    : publishBatch?.blocked_by.map((blocker) => blocker.message || prettyStatus(blocker.code)).join("; ") || "Action is missing from the server projection.";
  return (
    <PanelSection>
      <PanelTitle>Pipeline Actions</PanelTitle>
      <div className="pr-action-groups">
        <div className="pr-action-group">
          <span className="pr-action-group-label">Pipeline</span>
          <Button disabled={busy || !prepareEnabled} icon={<GitPullRequest size={13} />} onClick={() => onAction("preparePr")} title={prepareEnabled ? "Run the full PR handoff pipeline." : view.handoffReason || "Run is not active or paused."} tone={prepareEnabled ? "primary" : undefined} type="button">
            Prepare Handoff
          </Button>
          <Button disabled={busy || !view.handoffIdle} icon={<GitBranch size={13} />} onClick={() => onAction("splitPlan")} title={view.handoffIdle ? "Build the PR split plan." : view.handoffReason} type="button">
            Plan PRs
          </Button>
          <Button disabled={busy} icon={<RefreshCw size={13} />} onClick={() => onAction("syncPrs")} title="Seed/sync PR status from the split plan and GitHub." type="button">
            Sync PRs
          </Button>
        </div>
        <div className="pr-action-group">
          <span className="pr-action-group-label">Local Drafts</span>
          <Button disabled={busy || localPrepCount === 0 || Boolean(lockReason)} icon={<Hammer size={13} />} onClick={() => onAction("prepareLocalBatch")} title={lockReason || (localPrepCount > 0 ? "Prepare the next three planned PR slices in local worktrees without publishing drafts." : "No planned slices need local preparation.")} type="button">
            Prepare Next 3
          </Button>
          <Button disabled={busy || !publishBatch?.enabled} icon={<GitPullRequest size={13} />} onClick={() => onAction("prPublishBatch")} title={publishTitle} tone={publishBatch?.enabled ? "primary" : undefined} type="button">
            Publish Next Batch
          </Button>
        </div>
        <div className="pr-action-group">
          <span className="pr-action-group-label">Session</span>
          {view.process.running ? (
            <Button disabled={busy || view.process.draining} icon={view.process.draining ? <RefreshCw size={13} /> : <Pause size={13} />} onClick={() => onAction(RUN_CONTROL_ACTIONS.pause)} title="Drain workers before PR handoff." tone="warning" type="button">
              {view.process.draining ? "Draining" : "Drain Workers"}
            </Button>
          ) : null}
          <Button disabled={busy || view.newSessionBlocked} icon={<RotateCcw size={13} />} onClick={() => onAction("fresh")} title={view.newSessionBlocked ? view.newSessionReasons.join("; ") : "Start a fresh session."} tone="warning" type="button">
            New Session
          </Button>
        </div>
      </div>
      <details className="control-disclosure mt-3">
        <summary>Manual handoff steps - QA, QA repair, checkpoint, reconcile</summary>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button disabled={busy || !view.handoffIdle} icon={<ShieldCheck size={13} />} onClick={() => onAction("qa")} title={view.handoffIdle ? "Run the PR QA gate." : view.handoffReason} type="button">
            Run QA
          </Button>
          <Button disabled={busy || !view.handoffIdle} icon={<Wrench size={13} />} onClick={() => onAction("qaRepair")} title={view.handoffIdle ? "Run the QA repair resolver over queued repair items." : view.handoffReason} type="button">
            Resolve QA Repair
          </Button>
          <Button disabled={busy || !view.handoffIdle} icon={<Archive size={13} />} onClick={() => onAction("checkpoint")} title={view.handoffIdle ? "Write a PR handoff checkpoint for the current run." : view.handoffReason} type="button">
            Checkpoint
          </Button>
          <Button disabled={busy || !view.handoffIdle || view.runStatus !== "paused"} icon={<Wrench size={13} />} onClick={() => onAction("reconcile")} title={view.handoffIdle && view.runStatus === "paused" ? "Run reconcile against the latest QA report." : view.handoffReason || "Workers must be stopped for PR handoff."} type="button">
            Reconcile
          </Button>
        </div>
      </details>
    </PanelSection>
  );
}
