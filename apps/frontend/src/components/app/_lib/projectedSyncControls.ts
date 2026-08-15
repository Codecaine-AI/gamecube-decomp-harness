import type {
  DashboardAction,
  HarnessStateSyncReadModel,
} from "@/pages/workspace/_lib/types";

export const SYNC_CONTROL_ACTION_IDS: Partial<Record<DashboardAction, string>> = {
  syncStart: "sync.start",
  syncResolveConflict: "sync.resolve_conflict",
  syncPublish: "sync.publish",
  syncCancel: "sync.cancel",
  syncRecover: "sync.recover",
  syncRevalidate: "sync.cancel",
};

export const SYNC_CONTROL_ENDPOINTS: Partial<Record<DashboardAction, string>> = {
  syncStart: "/api/sync/start",
  syncResolveConflict: "/api/sync/resolve-conflict",
  syncPublish: "/api/sync/publish",
  syncCancel: "/api/sync/cancel",
  syncRecover: "/api/sync/recover",
  syncRevalidate: "/api/sync/cancel",
};

export function syncControlRequestPatch(action: DashboardAction): Record<string, unknown> {
  if (action === "syncRecover") return { choice: "resume" };
  return {};
}

function head(value: string): string {
  return value || "unknown";
}

export function syncConfirmationMessage(
  action: DashboardAction,
  sync: HarnessStateSyncReadModel | null,
): string | null {
  if (action === "syncPublish") {
    const preview = sync?.publish_preview;
    return [
      "Publish this validated sync?",
      "",
      `Head advance: ${head(preview?.prior_head ?? "")} → ${head(preview?.new_head ?? "")}`,
      `PR series pushes: ${preview?.series_pushes ?? 0}`,
    ].join("\n");
  }
  if (action === "syncCancel") {
    return "Cancel this sync?\n\nStaging is discarded. The cycle remains untouched.";
  }
  if (action === "syncRevalidate") {
    return "Cancel this stale sync?\n\nStaging is discarded. Start a new sync to ingest and reconcile the observed upstream together.";
  }
  if (action === "syncRecover") {
    return "Recover this sync?\n\nThe server will preserve staging and resume from its last durable stage.";
  }
  return null;
}
