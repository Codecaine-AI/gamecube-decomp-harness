import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { addSavePoint, ensureCampaign } from "@server/core/harness-runtime/phases/pr/state";
import { openState } from "@server/core/harness-runtime/run-state";
import { runningEpochHistory } from "./projection.js";

const cleanup: string[] = [];

afterEach(() => {
  for (const path of cleanup.splice(0).reverse()) rmSync(path, { recursive: true, force: true });
});

describe("runningEpochHistory", () => {
  test("includes epoch_finish and legacy epoch save points", () => {
    const stateDir = mkdtempSync(join(tmpdir(), "epoch-history-"));
    cleanup.push(stateDir);
    const store = openState(stateDir);
    const campaign = ensureCampaign(store, { gameId: "sms" });

    addSavePoint(store, {
      id: "epoch-finish",
      campaignId: campaign.id,
      runId: "run-1",
      triggerKind: "epoch_finish",
      label: "epoch-2",
      commitSha: "finish-head",
      matchedCodePercent: 39.766,
      payload: { measures: { matched_code_percent: 39.766, unmatched_targets: 42 } },
    });
    addSavePoint(store, {
      id: "legacy-epoch",
      campaignId: campaign.id,
      runId: "run-1",
      triggerKind: "epoch",
      label: "epoch-1",
      commitSha: "legacy-head",
      matchedCodePercent: 39.164,
    });
    addSavePoint(store, {
      id: "pr-sync",
      campaignId: campaign.id,
      runId: "run-1",
      triggerKind: "pr_sync",
      commitSha: "sync-head",
    });
    store.db.close();

    const history = runningEpochHistory(stateDir);

    expect(history.map((epoch) => epoch.id).sort()).toEqual(["epoch-finish", "legacy-epoch"]);
    expect(history.find((epoch) => epoch.id === "epoch-finish")).toMatchObject({
      runId: "run-1",
      label: "epoch-2",
      commitSha: "finish-head",
      matchedCodePercent: 39.766,
      measures: { matched_code_percent: 39.766, unmatched_targets: 42 },
    });
  });
});
