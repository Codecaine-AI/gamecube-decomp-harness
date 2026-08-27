import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { openState } from "@server/core/orchestrator-state";
import {
  addSavePoint,
  ensureCampaign,
  latestSavePointByTrigger,
  mergeSavePointPayload,
} from "@server/core/cycle-runtime/phases/pr/state/index.js";
import {
  classifyMasterBreakages,
  evaluateMasterBreakages,
  runMasterBreakageGate,
  type BreakageGateCommandRunner,
} from "./breakage-gate.js";

const cleanup: string[] = [];

afterEach(() => {
  for (const path of cleanup.splice(0).reverse()) rmSync(path, { recursive: true, force: true });
});

function changes(): Record<string, unknown> {
  const row = (name: string, from: number, to: number) => ({
    name,
    from: { fuzzy_match_percent: from, size: 100 },
    to: { fuzzy_match_percent: to, size: 100 },
  });
  return {
    from: {},
    to: {},
    units: [{
      name: "unit.o",
      from: {},
      to: {},
      sections: [row(".data", 100, 99.5)],
      functions: [row("broken", 100, 96.9), row("already_fuzzy", 99, 98), row("still_exact", 100, 100)],
    }],
  };
}

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "breakage-gate-"));
  cleanup.push(root);
  const repoRoot = join(root, "repo");
  const stateDir = join(root, "state");
  const worktreeDir = join(root, "worktree");
  const binary = join(worktreeDir, "build/tools/objdiff-cli");
  const oursReportPath = join(root, "ours.json");
  const baselinePath = join(root, "baseline.json");
  const changesOutPath = join(root, "changes.json");
  mkdirSync(repoRoot, { recursive: true });
  mkdirSync(dirname(binary), { recursive: true });
  mkdirSync(stateDir, { recursive: true });
  writeFileSync(binary, "fixture");
  writeFileSync(oursReportPath, "{}");
  writeFileSync(baselinePath, "{}");
  return { repoRoot, stateDir, worktreeDir, oursReportPath, baselinePath, changesOutPath };
}

describe("master breakage evaluation", () => {
  test("returns only exact matches that became fuzzy", () => {
    expect(evaluateMasterBreakages(changes())).toEqual([
      {
        unitName: "unit.o",
        itemName: "broken",
        kind: "function",
        fromPercent: 100,
        toPercent: 96.9,
        bytesDelta: -3,
      },
      {
        unitName: "unit.o",
        itemName: ".data",
        kind: "section",
        fromPercent: 100,
        toPercent: 99.5,
        bytesDelta: -1,
      },
    ]);
  });

  test("exempts an exact function rematch in a different unit", () => {
    const result = classifyMasterBreakages({
      units: [{ name: "old_tu", functions: [{ name: "fn_a", from: { fuzzy_match_percent: 100, size: 100 }, to: { fuzzy_match_percent: 99.9, size: 100 } }] }],
    }, {
      units: [{ name: "new_tu", functions: [{ name: "fn_a", size: 100, fuzzy_match_percent: 100 }] }],
    });
    expect(result.breakages).toEqual([]);
    expect(result.moved).toEqual([{
      unitName: "old_tu",
      itemName: "fn_a",
      movedToUnit: "new_tu",
      matchedAs: "fn_a",
      fromPercent: 100,
      toPercent: 99.9,
    }]);
  });

  test("keeps a fuzzy same-unit function as a hard breakage", () => {
    const result = classifyMasterBreakages({
      units: [{ name: "old_tu", functions: [{ name: "fn_b", from: { fuzzy_match_percent: 100, size: 100 }, to: { fuzzy_match_percent: 99.5, size: 100 } }] }],
    }, {
      units: [{ name: "old_tu", functions: [{ name: "fn_b", size: 100, fuzzy_match_percent: 99.5 }] }],
    });
    expect(result.breakages).toHaveLength(1);
    expect(result.moved).toEqual([]);
  });

  test("requires an exact cross-unit rematch", () => {
    const result = classifyMasterBreakages({
      units: [{ name: "old_tu", functions: [{ name: "fn_c", from: { fuzzy_match_percent: 100, size: 100 }, to: { fuzzy_match_percent: 0, size: 100 } }] }],
    }, {
      units: [{ name: "new_tu", functions: [{ name: "fn_c", size: 100, fuzzy_match_percent: 99 }] }],
    });
    expect(result.breakages).toHaveLength(1);
    expect(result.moved).toEqual([]);
  });

  test("never exempts section breakages", () => {
    const result = classifyMasterBreakages({
      units: [{ name: "old_tu", sections: [{ name: ".data", from: { fuzzy_match_percent: 100, size: 100 }, to: { fuzzy_match_percent: 50, size: 100 } }] }],
    }, {
      units: [{ name: "new_tu", functions: [{ name: ".data", size: 100, fuzzy_match_percent: 100 }] }],
    });
    expect(result.breakages).toHaveLength(1);
    expect(result.breakages[0]?.kind).toBe("section");
    expect(result.moved).toEqual([]);
  });

  test("uses a rename-paired counterpart for a cross-unit rematch", () => {
    const result = classifyMasterBreakages({
      units: [{
        name: "old_tu",
        functions: [
          { name: "fn_old", from: { fuzzy_match_percent: 100, size: 100 }, to: { fuzzy_match_percent: 0, size: 100 } },
          { name: "fn_old", from: { fuzzy_match_percent: 100, size: 20 }, metadata: { virtual_address: "0x10" } },
          { name: "fn_new", to: { fuzzy_match_percent: 100, size: 20 }, metadata: { virtual_address: "0x10" } },
        ],
      }],
    }, {
      units: [{ name: "other_tu", functions: [{ name: "fn_new", size: 100, fuzzy_match_percent: 100 }] }],
    });
    expect(result.breakages).toEqual([]);
    expect(result.moved).toHaveLength(1);
    expect(result.moved[0]).toMatchObject({ itemName: "fn_old", movedToUnit: "other_tu", matchedAs: "fn_new" });
  });
});

describe("master breakage gate", () => {
  test("reports upstream breakage", async () => {
    const input = fixture();
    const runCommand: BreakageGateCommandRunner = async (_cmd) => {
      writeFileSync(input.changesOutPath, JSON.stringify(changes()));
      return { exitCode: 0, stdout: "", stderr: "" };
    };
    const result = await runMasterBreakageGate({
      ...input,
      anchorSha: "abc123",
      reportRelPath: "build/GALE01/report.json",
      prSyncFallbackReportPath: null,
      runCommand,
      fetchMasterReport: async () => ({ path: input.baselinePath }),
    });
    expect(result.status).toBe("breakage");
    expect(result.baselineKind).toBe("upstream_ci");
    expect(result.breakages).toHaveLength(2);
  });

  test("reports only a moved function as clean", async () => {
    const input = fixture();
    writeFileSync(input.oursReportPath, JSON.stringify({
      units: [{ name: "new_tu", functions: [{ name: "broken", size: 100, fuzzy_match_percent: 100 }] }],
    }));
    const movedChanges = changes();
    (movedChanges.units as Array<Record<string, unknown>>)[0]!.name = "old_tu";
    (movedChanges.units as Array<Record<string, unknown>>)[0]!.sections = [];
    const runCommand: BreakageGateCommandRunner = async () => {
      writeFileSync(input.changesOutPath, JSON.stringify(movedChanges));
      return { exitCode: 0, stdout: "", stderr: "" };
    };
    const result = await runMasterBreakageGate({
      ...input,
      anchorSha: "abc123",
      reportRelPath: "build/GALE01/report.json",
      prSyncFallbackReportPath: null,
      runCommand,
      fetchMasterReport: async () => ({ path: input.baselinePath }),
    });
    expect(result.status).toBe("clean");
    expect(result.breakages).toEqual([]);
    expect(result.moved).toHaveLength(1);
  });

  test("uses the last pr_sync artifact when upstream is unavailable", async () => {
    const input = fixture();
    const runCommand: BreakageGateCommandRunner = async () => {
      writeFileSync(input.changesOutPath, JSON.stringify({ from: {}, to: {}, units: [] }));
      return { exitCode: 0, stdout: "", stderr: "" };
    };
    const result = await runMasterBreakageGate({
      ...input,
      anchorSha: "abc123",
      reportRelPath: "build/GALE01/report.json",
      prSyncFallbackReportPath: input.baselinePath,
      runCommand,
      fetchMasterReport: async () => ({ path: null, reason: "artifact missing" }),
    });
    expect(result.status).toBe("clean");
    expect(result.baselineKind).toBe("pr_sync_artifact");
    expect(result.reasons[0]).toContain("only regressions since the last sync are detectable");
  });

  test("skips when no baseline exists", async () => {
    const input = fixture();
    let called = false;
    const result = await runMasterBreakageGate({
      ...input,
      anchorSha: "abc123",
      reportRelPath: "build/GALE01/report.json",
      prSyncFallbackReportPath: null,
      runCommand: async () => {
        called = true;
        return { exitCode: 0, stdout: "", stderr: "" };
      },
      fetchMasterReport: async () => ({ path: null, reason: "artifact missing" }),
    });
    expect(result.status).toBe("skipped");
    expect(called).toBeFalse();
  });

  test("returns an error when objdiff-cli fails", async () => {
    const input = fixture();
    const result = await runMasterBreakageGate({
      ...input,
      anchorSha: "abc123",
      reportRelPath: "build/GALE01/report.json",
      prSyncFallbackReportPath: null,
      runCommand: async () => ({ exitCode: 1, stdout: "", stderr: "bad diff" }),
      fetchMasterReport: async () => ({ path: input.baselinePath }),
    });
    expect(result.status).toBe("error");
    expect(result.reasons).toContain("objdiff-cli report changes failed: bad diff");
  });
});

describe("breakage gate save-point helpers", () => {
  test("finds the latest trigger and shallow-merges its payload", async () => {
    const stateDir = mkdtempSync(join(tmpdir(), "breakage-save-points-"));
    cleanup.push(stateDir);
    const store = openState(stateDir);
    try {
      const campaign = ensureCampaign(store, { gameId: "melee" });
      addSavePoint(store, { campaignId: campaign.id, triggerKind: "epoch", payload: { untouched: true } });
      const first = addSavePoint(store, { campaignId: campaign.id, triggerKind: "pr_sync", payload: { old: 1, replaced: false } });
      await Bun.sleep(2);
      const latest = addSavePoint(store, { campaignId: campaign.id, triggerKind: "pr_sync", payload: { old: 2, replaced: false } });
      mergeSavePointPayload(store, latest.id, { replaced: true, added: "yes" });
      mergeSavePointPayload(store, "missing", { ignored: true });
      expect(latestSavePointByTrigger(store, "pr_sync")).toMatchObject({
        id: latest.id,
        payload: { old: 2, replaced: true, added: "yes" },
      });
      expect(latestSavePointByTrigger(store, "epoch")?.payload).toEqual({ untouched: true });
      expect(first.id).not.toBe(latest.id);
    } finally {
      store.db.close();
    }
  });
});
