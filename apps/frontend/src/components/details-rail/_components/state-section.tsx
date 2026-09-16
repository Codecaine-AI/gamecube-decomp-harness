import { MiniRows } from "@/components/primitives";
import { asObject, num, pct, shortId, text, type Dashboard } from "@/lib/format";
import type { HarnessView } from "@/pages/workspace/_lib/types";

function syncSnapshot(view: HarnessView): { tone?: string; value: string } {
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

export function stateSectionHint(view: HarnessView): string {
  return text(view.harnessState?.state?.execution.status, "Not initialized");
}

export function StateSection({ dashboard, view }: { dashboard: Dashboard | null; view: HarnessView }) {
  const harnessState = view.harnessState;
  const harness = harnessState?.state;
  const run = harnessState?.run;
  const knowledge = harnessState?.knowledge;
  const sync = syncSnapshot(view);

  return (
    <div className="p-3">
      <MiniRows
        rows={[
          {
            label: "Worktree",
            title: harness?.source.worktree,
            value: harness?.source.worktree || view.game?.repoRoot || "-",
          },
          { label: "Desired", value: harness?.execution.desired || "-" },
          { label: "Head", title: harness?.source.head ?? undefined, value: harness?.source.head ? shortId(harness.source.head) : "Not recorded" },
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
