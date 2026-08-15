import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { HarnessStateSyncReadModel } from "@/pages/workspace/_lib/types";
import {
  SYNC_CONTROL_ACTION_IDS,
  SYNC_CONTROL_ENDPOINTS,
  syncConfirmationMessage,
  syncControlRequestPatch,
} from "./projectedSyncControls";

const sync = {
  publish_preview: {
    prior_head: "old-head",
    new_head: "new-head",
    series_pushes: 3,
  },
} as HarnessStateSyncReadModel;
const sourceRoot = resolve(import.meta.dir, "../../..");

describe("projected sync controls", () => {
  test("maps every UI action to the server projection and route", () => {
    expect(SYNC_CONTROL_ACTION_IDS).toEqual({
      syncStart: "sync.start",
      syncResolveConflict: "sync.resolve_conflict",
      syncPublish: "sync.publish",
      syncCancel: "sync.cancel",
      syncRecover: "sync.recover",
      syncRevalidate: "sync.cancel",
    });
    expect(SYNC_CONTROL_ENDPOINTS).toEqual({
      syncStart: "/api/sync/start",
      syncResolveConflict: "/api/sync/resolve-conflict",
      syncPublish: "/api/sync/publish",
      syncCancel: "/api/sync/cancel",
      syncRecover: "/api/sync/recover",
      syncRevalidate: "/api/sync/cancel",
    });
  });

  test("resumes only crash recovery and cancels stale candidates without an adopt body", () => {
    expect(syncControlRequestPatch("syncRevalidate")).toEqual({});
    expect(syncControlRequestPatch("syncRecover")).toEqual({ choice: "resume" });
    expect(syncControlRequestPatch("syncPublish")).toEqual({});
  });

  test("describes the exact publish and discard consequences", () => {
    expect(syncConfirmationMessage("syncPublish", sync)).toBe(
      "Publish this validated sync?\n\nHead advance: old-head → new-head\nPR series pushes: 3",
    );
    expect(syncConfirmationMessage("syncCancel", sync)).toBe(
      "Cancel this sync?\n\nStaging is discarded. The cycle remains untouched.",
    );
    expect(syncConfirmationMessage("syncRecover", sync)).toContain("preserve staging");
    expect(syncConfirmationMessage("syncRevalidate", sync)).toContain("Start a new sync");
  });

  test("renders sync controls from the server projection without legacy client gates", () => {
    const card = readFileSync(resolve(sourceRoot, "pages/workspace/overview/SyncStateCard.tsx"), "utf8");
    const overview = readFileSync(resolve(sourceRoot, "pages/workspace/overview/index.tsx"), "utf8");
    const dispatcher = readFileSync(resolve(sourceRoot, "components/app/index.tsx"), "utf8");

    for (const actionId of ["sync.start", "sync.resolve_conflict", "sync.publish", "sync.cancel", "sync.recover"]) {
      expect(card).toContain(`harnessStateAction(harnessState, "${actionId}")`);
    }
    expect(card).not.toContain("syncLocked");
    expect(card).not.toContain("process.running");
    expect(overview).toContain("<SyncStateCard");
    expect(overview).not.toContain('onAction("sync")');
    expect(dispatcher).toContain("projectedSyncAction?.confirmation_required");
    expect(dispatcher).toContain('nextAction === "syncGit" || nextAction === "indexPrs"');
    expect(dispatcher).toContain('nextAction === "syncGit" || nextAction === "indexPrs"\n        ? "syncStart"');
    expect(dispatcher).toContain("SYNC_CONTROL_ENDPOINTS[syncControlAction]");
    expect(dispatcher).toContain("syncControlRequestPatch(syncControlAction)");
    expect(dispatcher).not.toContain('/api/cycle/preparing/sync-git');
    expect(dispatcher).not.toContain('/api/cycle/preparing/pr-index');
  });
});
