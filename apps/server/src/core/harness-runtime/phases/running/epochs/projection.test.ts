import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { addSavePoint, ensureCampaign } from "@server/core/harness-runtime/phases/pr/state";
import { openState } from "@server/core/harness-runtime/run-state";
import { recordUnverifiedMatch, unverifiedMatchIndex } from "@server/core/harness-runtime/run-state/unverified-matches.js";
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

  test("a readable percent-only report keeps the gated epoch headline unknown instead of restoring its stored 100%", () => {
    const stateDir = mkdtempSync(join(tmpdir(), "epoch-history-percent-only-"));
    cleanup.push(stateDir);
    const reportPath = join(stateDir, "report.json");
    writeFileSync(reportPath, JSON.stringify({
      measures: { matched_code_percent: 100 },
      units: [{ name: "sms/A.o", functions: [{ name: "unverified", size: 32, fuzzy_match_percent: 100 }] }],
    }));
    const store = openState(stateDir);
    let unverified: ReturnType<typeof unverifiedMatchIndex>;
    try {
      const campaign = ensureCampaign(store, { gameId: "sms" });
      addSavePoint(store, {
        id: "epoch-percent-only", campaignId: campaign.id, triggerKind: "epoch_finish",
        matchedCodePercent: 100, reportPath, payload: { measures: { matched_code_percent: 100 } },
      });
      recordUnverifiedMatch(store, { gameId: "sms", unit: "sms/A.o", symbol: "unverified", analyzedRev: "rev-1", match: { base: 40, candidate: 100, real_only: null }, reasons: ["no steering located"] });
      unverified = unverifiedMatchIndex(store, "sms");
    } finally { store.db.close(); }

    const [epoch] = runningEpochHistory(stateDir, 48, { unverified });
    expect(epoch.matchedCodePercent).toBeNull();
    expect((epoch.measures as Record<string, unknown>).unverified_functions).toBe(1);
    expect(Number.isNaN((epoch.measures as Record<string, unknown>).matched_code_percent)).toBe(true);
  });

  test("steering-gated history: each epoch is re-derived from its archived raw report under the current rows, and an epoch whose report is gone shows unknown completion", () => {
    const stateDir = mkdtempSync(join(tmpdir(), "epoch-history-"));
    cleanup.push(stateDir);
    const reportPath = join(stateDir, "epoch-report.json");
    // Unit A (incomplete): exact_a, an exact unverified function, partial at 90%.
    // Unit B (complete): b_exact and an unverified function at 99.5%.
    const measures = {
      fuzzy_match_percent: 97.9, matched_code: 96, total_code: 160, matched_code_percent: 60,
      matched_functions: 3, total_functions: 5, matched_functions_percent: 60,
      complete_code: 64, complete_code_percent: 40, complete_units: 1, total_units: 2,
    };
    writeFileSync(reportPath, JSON.stringify({
      measures,
      units: [
        {
          name: "sms/A.o",
          measures: { total_code: 96, matched_code: 64, complete_units: 0 },
          functions: [
            { name: "exact_a", size: 32, fuzzy_match_percent: 100 },
            { name: "unverified", size: 32 },
            { name: "partial", size: 32, fuzzy_match_percent: 90 },
          ],
        },
        {
          name: "sms/B.o",
          measures: { total_code: 64, matched_code: 32, complete_code: 64, complete_units: 1 },
          functions: [
            { name: "b_exact", size: 32, fuzzy_match_percent: 100 },
            { name: "b_unverified", size: 32, fuzzy_match_percent: 99.5 },
          ],
        },
      ],
    }));
    const store = openState(stateDir);
    const campaign = ensureCampaign(store, { gameId: "sms" });
    addSavePoint(store, {
      id: "epoch-archived",
      campaignId: campaign.id,
      runId: "run-1",
      triggerKind: "epoch_finish",
      label: "epoch-1",
      commitSha: "archived-head",
      matchedCodePercent: 60,
      reportPath,
      payload: { measures },
    });
    addSavePoint(store, {
      id: "epoch-missing",
      campaignId: campaign.id,
      runId: "run-1",
      triggerKind: "epoch_finish",
      label: "epoch-2",
      commitSha: "missing-head",
      matchedCodePercent: 60,
      reportPath: join(stateDir, "pruned-report.json"),
      payload: { measures },
    });
    for (const [unit, symbol] of [["sms/A.o", "unverified"], ["sms/B.o", "b_unverified"]]) {
      recordUnverifiedMatch(store, { gameId: "sms", unit, symbol, analyzedRev: "rev-1", match: { base: 40, candidate: 100, real_only: null }, reasons: ["no steering located"] });
    }
    const unverified = unverifiedMatchIndex(store, "sms");
    store.db.close();

    const history = runningEpochHistory(stateDir, 48, { unverified });
    const archived = history.find((epoch) => epoch.id === "epoch-archived")!;
    // The 99.5% function costs its fuzzy share and its unit's completeness; the exact one its matched credit.
    expect(archived).toMatchObject({
      matchedCodePercent: 40,
      measures: {
        matched_code_percent: 40, matched_functions_percent: 40, fuzzy_match_percent: 58,
        complete_units: 0, complete_code_percent: 0, unmatched_targets: 3, unverified_code_percent: 20,
      },
    });
    const missing = history.find((epoch) => epoch.id === "epoch-missing")!;
    const missingMeasures = missing.measures as Record<string, unknown>;
    expect(missing.matchedCodePercent).toBeNull();
    expect(missingMeasures.unverified_unbounded).toBe(true);
    for (const key of ["matched_code_percent", "matched_functions_percent", "fuzzy_match_percent", "complete_units", "unmatched_targets"]) {
      expect(Number.isNaN(missingMeasures[key])).toBe(true);
    }
    // Melee and other ungated games pass no index: the recorded measures stand.
    expect(runningEpochHistory(stateDir).find((epoch) => epoch.id === "epoch-missing")).toMatchObject({
      matchedCodePercent: 60,
      measures: { matched_code_percent: 60, complete_units: 1, unmatched_targets: 2 },
    });
  });
});
