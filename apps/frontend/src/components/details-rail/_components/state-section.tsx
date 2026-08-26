import { MiniRows } from "@/components/primitives";
import { asObject, num, pct, shortId, text, type Dashboard } from "@/lib/format";
import type { CycleView } from "@/pages/workspace/_lib/types";

function syncSnapshot(view: CycleView): { tone?: string; value: string } {
  const harnessState = view.harnessState;
  if (harnessState?.sync) return { value: text(harnessState.sync.status, "-") };
  const repoSync = harnessState?.repo_sync;
  if (!repoSync) return { value: "-" };
  if (!repoSync.needs_sync) return { tone: "text-up", value: "up to date" };
  return {
    tone: "text-warn",
    value: `${repoSync.behind_count ?? "-"} behind ${repoSync.upstream_ref || "upstream"}`,
  };
}

export function stateSectionHint(view: CycleView): string {
  return text(view.harnessState?.cycle?.status, "-");
}

export function StateSection({ dashboard, view }: { dashboard: Dashboard | null; view: CycleView }) {
  const harnessState = view.harnessState;
  const cycle = harnessState?.cycle;
  const run = harnessState?.run;
  const knowledge = harnessState?.knowledge;
  const dashboardCycle = asObject(dashboard?.cycle);
  const phase = [text(dashboardCycle.phase), text(dashboardCycle.activeSubphase)].filter(Boolean).join(" · ");
  const sync = syncSnapshot(view);

  return (
    <div className="p-3">
      <MiniRows
        rows={[
          {
            label: "Cycle",
            title: cycle?.cycle_uuid,
            value: cycle ? `${shortId(cycle.cycle_uuid)} · ${text(cycle.status, "-")}` : "-",
          },
          { label: "Phase", value: phase || "-" },
          {
            label: "Run",
            value: run ? `${text(run.status, "-")} · ${text(run.scheduler_condition, "-")}` : "-",
          },
          {
            label: "Run id",
            title: run?.workflow_id,
            value: run?.workflow_id || "-",
          },
          {
            label: "Epoch",
            title: run?.active_epoch?.epoch_id,
            value: run?.active_epoch
              ? `Epoch ${num(run.active_epoch.ordinal)}${run.active_epoch.epoch_id ? ` · ${run.active_epoch.epoch_id}` : ""}`
              : "-",
          },
          {
            label: "Queue",
            value: run ? `${num(run.admitted)} admitted · ${num(run.claimed)} claimed · ${num(run.running)} running` : "-",
          },
          {
            label: "Changes",
            value: run
              ? `${num(run.progress.confirmed_changes)} confirmed · ${num(run.progress.tentative_changes)} tentative · ${num(run.progress.regressed_changes)} regressed`
              : "-",
          },
          {
            label: "Score",
            value: run ? `baseline ${pct(run.progress.baseline_score)} -> confirmed ${pct(run.progress.confirmed_score)}` : "-",
          },
          { label: "Sync", tone: sync.tone, value: sync.value },
          {
            label: "Knowledge",
            value: knowledge ? `${num(knowledge.queued)} queued · ${num(knowledge.processing)} processing · ${num(knowledge.failed)} failed` : "-",
          },
        ]}
      />
    </div>
  );
}
