import { Field, MiniRows, SelectField } from "@/components/primitives";
import { shortId } from "@/lib/format";
import {
  RepoSyncIdleCard,
  SyncActionsGrid,
  SyncConflictList,
  SyncStalenessCard,
  SyncStatusTag,
  syncActionProjections,
} from "@/pages/workspace/_components/sync";

import type { DetailsRailProps } from "../_lib/types";
import type { SubTab } from "../_lib/workflow-subtabs";

export function SyncSection({
  busy,
  form,
  mode,
  onAction,
  setForm,
  view,
}: Pick<DetailsRailProps, "busy" | "form" | "onAction" | "setForm" | "view"> & { mode: SubTab }) {
  const harnessState = view.harnessState;
  const sync = harnessState?.sync ?? null;
  const repoSync = harnessState?.repo_sync ?? null;
  const projections = syncActionProjections(harnessState);

  if (mode === "config") {
    return (
        <div className="grid gap-3 p-3">
          <div className="border border-line bg-card p-3">
            <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.1em] text-dim">Knowledge Agents</div>
            <div className="grid grid-cols-1 gap-2">
              <Field
                className="mb-0"
                label="Provider"
                onChange={(event) => setForm({ syncProvider: event.currentTarget.value })}
                spellCheck={false}
                value={form.syncProvider}
              />
              <Field
                className="mb-0"
                label="Model"
                onChange={(event) => setForm({ syncModel: event.currentTarget.value })}
                spellCheck={false}
                value={form.syncModel}
              />
              <SelectField
                className="mb-0"
                label="Thinking"
                onChange={(event) => setForm({ syncThinking: event.currentTarget.value })}
                options={["xhigh", "high", "medium", "low"]}
                value={form.syncThinking}
              />
              <SelectField
                className="mb-0"
                label="Ingest parallelism"
                onChange={(event) => setForm({ syncIngestConcurrency: Number(event.currentTarget.value) })}
                options={[1, 2, 4, 6, 8, 12, 16]}
                title="How many merged PRs the sync ingests at once (librarian/intake agents run one per PR)."
                value={form.syncIngestConcurrency}
              />
            </div>
            <p className="mb-0 mt-2 text-[11px] leading-4 text-dim">
              Applies to the librarian and intake agents the next time a sync starts or resumes.
            </p>
          </div>
          {sync ? (
            <MiniRows rows={[
              { label: "Intake", value: sync.intake.knowledge_only ? "knowledge only" : "source + knowledge" },
              { label: "Upstream", value: repoSync?.upstream_ref ?? "-" },
              { label: "From", title: sync.intake.upstream_from, value: shortId(sync.intake.upstream_from) },
              { label: "To", title: sync.intake.upstream_to, value: shortId(sync.intake.upstream_to) },
            ]} />
          ) : null}
        </div>
    );
  }

  if (mode === "actions") {
    return (
        <div className="p-3">
          <div className="mb-3">
            <SyncStatusTag repoSync={repoSync} sync={sync} />
          </div>
          {sync ? (
            <>
              <SyncActionsGrid busy={busy} compact onAction={onAction} projections={projections} />
              <SyncConflictList busy={busy} onAction={onAction} resolveConflictProjection={projections.resolveConflict} staging={sync.staging} />
              <SyncStalenessCard busy={busy} cancelProjection={projections.cancel} onAction={onAction} staleness={sync.staleness} />
            </>
          ) : (
            <RepoSyncIdleCard busy={busy} onAction={onAction} repoSync={repoSync} startProjection={projections.start} />
          )}
        </div>
    );
  }

  return null;
}
