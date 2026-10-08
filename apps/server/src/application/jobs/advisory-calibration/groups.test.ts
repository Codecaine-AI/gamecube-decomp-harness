import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import { buildHistoryDataset } from "./build-dataset.js";
import { createHistoryTree, FIXTURE_CASES } from "./__fixtures__/history-tree.js";
import { computeGroups } from "./groups.js";
import { createSanitizer } from "./sanitize.js";
import { openSourceRoot } from "./source-root.js";
import type { CalibrationItem } from "./types.js";

const realFetch = globalThis.fetch;

beforeAll(() => {
  globalThis.fetch = (() => {
    throw new Error("network disabled in advisory-calibration tests");
  }) as unknown as typeof fetch;
});

afterAll(() => {
  globalThis.fetch = realFetch;
});

function historyItems(): CalibrationItem[] {
  const tree = createHistoryTree();
  try {
    const source = openSourceRoot(tree.root, tree.game);
    return buildHistoryDataset({ source, sanitize: createSanitizer({ sourceRoot: source.root }) }).items;
  } finally {
    tree.cleanup();
  }
}

function sorted(map: ReadonlyMap<string, string>): Array<[string, string]> {
  return [...map.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
}

describe("advisory-calibration evidence groups", () => {
  test("groups merge equivalent flagged lines across worker states", () => {
    const items = historyItems();
    const pick = (workerStateId: string, attempt: number, line?: number) => {
      const found = items.find((item) => item.worker_state_id === workerStateId && item.attempt_index === attempt && (line === undefined || item.finding.line === line));
      if (!found) throw new Error(`no fixture item ${workerStateId}:${attempt}:${line}`);
      return found;
    };
    const { casts, edited, otherWorker, unmatched, unrelated } = FIXTURE_CASES;
    const castLine = pick(casts.workerStateId, casts.attempt, 1869);
    const otherCast = pick(casts.workerStateId, casts.attempt, 1870);
    const keptElsewhere = pick(otherWorker.workerStateId, otherWorker.attempt);
    const keptAgain = pick(unmatched.workerStateId, unmatched.attempt);
    const editedLine = pick(edited.workerStateId, edited.attempt);
    const unrelatedItem = pick(unrelated.workerStateId, unrelated.attempt);

    // The same flagged line kept by another worker state (two attempts): one group, joined only by the line.
    expect(keptElsewhere.group_key).toBe(castLine.group_key);
    const sameLine = computeGroups([castLine, keptElsewhere, keptAgain]);
    expect(new Set(sameLine.itemGroup.values()).size).toBe(1);
    // A different flagged line of another worker state stays apart.
    expect(new Set(computeGroups([otherCast, keptElsewhere]).itemGroup.values()).size).toBe(2);

    // The worker edited the flagged line between attempts: different base groups, one merged group.
    expect(editedLine.group_key).not.toBe(castLine.group_key);
    const editedGroups = computeGroups([castLine, editedLine]);
    expect(editedGroups.itemGroup.get(castLine.id)).toBe(editedGroups.itemGroup.get(editedLine.id)!);
    expect([...editedGroups.baseGroups.values()][0]).toEqual([castLine.group_key, editedLine.group_key].sort());

    // Over the whole fixture: the gmtoulib function is one group, the unrelated target another.
    const groups = computeGroups(items);
    expect(items).toHaveLength(8);
    expect(new Set(groups.itemGroup.values()).size).toBe(2);
    const gm = groups.itemGroup.get(castLine.id)!;
    expect(items.filter((item) => item.target_key === casts.targetKey).every((item) => groups.itemGroup.get(item.id) === gm)).toBe(true);
    expect(groups.itemGroup.get(unrelatedItem.id)).not.toBe(gm);
    expect(groups.baseGroups.get(groups.itemGroup.get(unrelatedItem.id)!)).toEqual([unrelatedItem.group_key]);

    // A synthetic item carries its source's base group and worker state, so it joins the source's group.
    const synthetic = (source: CalibrationItem, quality: "good" | "bad"): CalibrationItem => ({
      ...source,
      id: `syn-${source.id.slice(4)}-${quality}`,
      source: "synthetic",
      synthetic: true,
      source_item_id: source.id,
      quality,
      justification: quality === "good" ? "Pointer-width read of a const object MWCC would fold." : "Needed for the match.",
    });
    const withSynthetic = [...items, synthetic(keptAgain, "good"), synthetic(unrelatedItem, "bad")];
    const merged = computeGroups(withSynthetic);
    expect(merged.itemGroup.get(`syn-${keptAgain.id.slice(4)}-good`)).toBe(merged.itemGroup.get(keptAgain.id)!);
    expect(merged.itemGroup.get(`syn-${unrelatedItem.id.slice(4)}-bad`)).toBe(merged.itemGroup.get(unrelatedItem.id)!);
    expect(new Set(merged.itemGroup.values()).size).toBe(2);

    // Deterministic in the item set, not its order.
    const reversed = computeGroups([...withSynthetic].reverse());
    const interleaved = computeGroups([...withSynthetic].sort((a, b) => (a.fingerprint < b.fingerprint ? 1 : -1)));
    expect(sorted(reversed.itemGroup)).toEqual(sorted(merged.itemGroup));
    expect(sorted(interleaved.itemGroup)).toEqual(sorted(merged.itemGroup));
    expect([...reversed.baseGroups.entries()].sort()).toEqual([...merged.baseGroups.entries()].sort());
  });
});
