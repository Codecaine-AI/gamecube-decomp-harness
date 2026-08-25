import { PanelSection, PanelTitle } from "@/components/primitives";
import {
  RepoSyncIdleCard,
  SyncActionsGrid,
  SyncConflictList,
  SyncIntakeStats,
  SyncPublicationCard,
  SyncStagingProgress,
  SyncStalenessCard,
  SyncStatusTag,
} from "@/pages/workspace/_components/sync";
import { harnessStateAction } from "@/pages/workspace/_lib/model";
import type {
  DashboardAction,
  HarnessStateReadModel,
} from "@/pages/workspace/_lib/types";

export function SyncStateCard({
  busy,
  onAction,
  harnessState,
}: {
  busy: boolean;
  onAction: (action: DashboardAction) => void;
  harnessState: HarnessStateReadModel | null;
}) {
  const sync = harnessState?.sync ?? null;
  const repoSync = harnessState?.repo_sync ?? null;
  const projections = {
    start: harnessStateAction(harnessState, "sync.start"),
    resolveConflict: harnessStateAction(harnessState, "sync.resolve_conflict"),
    publish: harnessStateAction(harnessState, "sync.publish"),
    cancel: harnessStateAction(harnessState, "sync.cancel"),
    recover: harnessStateAction(harnessState, "sync.recover"),
  };

  return (
    <PanelSection>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <PanelTitle className="mb-0">Game Sync</PanelTitle>
        <SyncStatusTag repoSync={repoSync} sync={sync} />
      </div>

      {sync ? (
        <SyncIntakeStats sync={sync} />
      ) : (
        <RepoSyncIdleCard
          busy={busy}
          onAction={onAction}
          repoSync={repoSync}
          startProjection={projections.start}
        />
      )}

      <SyncStagingProgress staging={sync?.staging ?? null} />
      <SyncConflictList
        busy={busy}
        onAction={onAction}
        resolveConflictProjection={projections.resolveConflict}
        staging={sync?.staging ?? null}
      />
      {sync ? (
        <>
          <SyncStalenessCard
            busy={busy}
            cancelProjection={projections.cancel}
            onAction={onAction}
            staleness={sync.staleness}
          />
          <SyncPublicationCard sync={sync} />
        </>
      ) : null}

      <SyncActionsGrid busy={busy} onAction={onAction} projections={projections} />
    </PanelSection>
  );
}
