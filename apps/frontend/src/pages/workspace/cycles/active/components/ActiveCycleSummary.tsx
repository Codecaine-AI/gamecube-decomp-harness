import { GitPullRequest, Play } from "@/icons";
import { asObject, num, text } from "@/lib/format";
import { Button, InfoRows, List, PanelSection, PanelTitle, StatCard } from "@/components/primitives";
import { hasKeys, prettyStatus, statusClass } from "@/pages/workspace/_lib/model";
import type { CycleView, WorkspaceNav } from "@/pages/workspace/_lib/types";
import { activeCycleFocus } from "@/pages/workspace/cycles/_lib/cycleRoute";
import { CycleRouteLink } from "@/pages/workspace/cycles/active/components/CycleRouteLink";

export function ActiveCycleSummary({ nav, view }: { nav: WorkspaceNav; view: CycleView }) {
  const savePoint = asObject(asObject(view.prSummary.ship).savePoint);
  const cycleFocus = activeCycleFocus(view);
  return (
    <div className="grid gap-4">
      <section className="grid grid-cols-2 gap-3 @[36rem]:grid-cols-4">
        <StatCard label="Mode" tone={view.mode === "pr" ? "text-warn" : view.mode === "run" ? "text-up" : "text-dim"} value={view.modeLabel} />
        <StatCard label="Run" value={view.runStatus || "no run"} />
        <StatCard label="Claims" value={num(view.activeClaims)} />
        <StatCard label="Process" value={view.process.pillState} />
      </section>
      <PanelSection>
        <PanelTitle>Mode Evidence</PanelTitle>
        <List values={view.modeEvidence.length ? view.modeEvidence : ["No active mode evidence yet."]} empty="No active mode evidence yet." />
      </PanelSection>
      <div className="grid grid-cols-1 gap-4 @[760px]:grid-cols-2">
        <PanelSection>
          <PanelTitle>Run Artifacts</PanelTitle>
          <InfoRows
            rows={[
              ["Cycle id", <CycleRouteLink nav={nav} sub="done" view={view} />],
              ["Phase", view.canonicalPhase ? prettyStatus(view.canonicalPhase) : view.modeLabel],
              ["Subphase", view.canonicalSubphase ? prettyStatus(view.canonicalSubphase) : "-"],
              ["Baseline", view.baselineLabel],
              ["Branch", view.branchLabel],
              ["Latest save", text(savePoint.trigger_kind, "-")],
            ]}
          />
          <div className="mt-3 flex flex-wrap gap-2">
            <Button icon={<Play size={13} />} onClick={() => nav.goToCycle(cycleFocus, "run")} tone="primary" type="button">Open Run</Button>
          </div>
        </PanelSection>
        <PanelSection>
          <PanelTitle>PR Artifacts</PanelTitle>
          <InfoRows
            rows={[
              ["Checkpoint", hasKeys(view.prSummary.checkpoint) ? "available" : "none"],
              ["QA", prettyStatus(asObject(view.prSummary.qa.prPromotion).status, prettyStatus(view.prSummary.qa.status, "none")), statusClass(asObject(view.prSummary.qa.prPromotion).status || view.prSummary.qa.status)],
              ["QA repair", prettyStatus(view.prSummary.qaRepair.recommendation, prettyStatus(view.prSummary.qaRepair.status, "none")), statusClass(view.prSummary.qaRepair.recommendation || view.prSummary.qaRepair.status)],
              ["Split plan", prettyStatus(view.prSummary.splitPlan.status, "none"), statusClass(view.prSummary.splitPlan.status)],
            ]}
          />
          <div className="mt-3 flex flex-wrap gap-2">
            <Button icon={<GitPullRequest size={13} />} onClick={() => nav.goToCycle(cycleFocus, "pr")} tone="primary" type="button">Open PR Queue</Button>
          </div>
        </PanelSection>
      </div>
    </div>
  );
}
