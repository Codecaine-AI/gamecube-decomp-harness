import { afterEach, describe, expect, test } from "bun:test";
import { cpSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { parseCalibrationArgs } from "./args";
import { buildCalibrationReport, scorableItems } from "./calibrate";
import { computeSplit, splitCommand } from "./split";
import { appendJsonl, loadDataset, readJsonl, writeJsonl } from "./store";
import type { CalibrationItem, LabelRecord, ProbabilityRow, SplitFile } from "./types";

const REPO_ROOT = join(import.meta.dir, "../../../../../..");
const SAMPLE = join(REPO_ROOT, "analysis/advisory-adjudication/sample");
const JEV = "typesafe/jev-1.13.0";

const tempDirs: string[] = [];
afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function sampleCopy(): string {
  const root = mkdtempSync(join(tmpdir(), "advisory-split-"));
  tempDirs.push(root);
  const dir = join(root, "sample");
  cpSync(SAMPLE, dir, { recursive: true });
  return dir;
}

async function split(dir: string): Promise<SplitFile> {
  return splitCommand(parseCalibrationArgs(["split", "--dir", dir]), () => {});
}

function label(id: string, value: "justified" | "unjustified", synthetic = false): LabelRecord {
  return { id, label: value, labeler: "human", reviewer: "test", proposed_label: null, agreed: null, synthetic, group: null, labeled_at: "2026-10-07T00:00:00.000Z" };
}

function derived(source: CalibrationItem, id: string, overrides: Partial<CalibrationItem> = {}): CalibrationItem {
  return { ...source, id, checkpoint_id: `${source.checkpoint_id}-${id}`, ...overrides };
}

describe("advisory calibration split", () => {
  test("split is grouped and stable as labels grow; held-out holds only human non-synthetic items", async () => {
    const dir = sampleCopy();
    const committed = JSON.parse(readFileSync(join(SAMPLE, "split.json"), "utf8")) as SplitFile;
    const items = loadDataset(dir).items;
    // The committed split is exactly what the split rule gives for the sample.
    expect(computeSplit(items, null, committed.salt)).toEqual(committed);
    // Every item of a merged group sits on one side; equal flagged lines from two worker states share a group.
    for (const group of Object.values(committed.items)) expect(committed.components[group]).toBeDefined();
    const byKey = new Map<string, Set<string>>();
    for (const item of items) byKey.set(item.group_key, (byKey.get(item.group_key) ?? new Set()).add(committed.items[item.id]!));
    for (const groups of byKey.values()) expect(groups.size).toBe(1);

    // Rerunning keeps the salt and every assignment; more labels change nothing.
    expect(await split(dir)).toEqual(committed);
    const before = readFileSync(join(dir, "split.json"), "utf8");
    appendJsonl(join(dir, "labels.jsonl"), label(items.find((item) => !item.synthetic)!.id, "unjustified"));
    await split(dir);
    expect(readFileSync(join(dir, "split.json"), "utf8")).toBe(before);

    // New items: one joins an existing held-out group, one forms a new group, one merges a selection
    // group with a held-out group (same worker state, rule and file) and is forced to selection.
    const heldoutItem = items.find((item) => !item.synthetic && committed.components[committed.items[item.id]!] === "heldout")!;
    const selectionItem = items.find((item) => !item.synthetic && committed.components[committed.items[item.id]!] === "selection")!;
    const sameGroup = derived(heldoutItem, "adv-test-same-group");
    const fresh = derived(heldoutItem, "adv-test-fresh", {
      group_key: "f".repeat(64),
      worker_state_id: "ws-fresh",
      target_key: "main/melee/sample/fresh::fn_fresh",
    });
    const bridge = derived(selectionItem, "adv-test-bridge", {
      worker_state_id: heldoutItem.worker_state_id,
      finding: { ...selectionItem.finding, rule_id: heldoutItem.finding.rule_id, file: heldoutItem.finding.file },
    });
    writeJsonl(join(dir, "candidates.jsonl"), [...readJsonl<CalibrationItem>(join(dir, "candidates.jsonl")), sameGroup, fresh]);
    const grown = await split(dir);
    for (const [id, group] of Object.entries(committed.items)) {
      expect(grown.items[id]).toBe(group);
      expect(grown.components[group]).toBe(committed.components[group]!);
    }
    expect(grown.items[sameGroup.id]).toBe(committed.items[heldoutItem.id]!);
    expect(grown.salt).toBe(committed.salt);
    expect(grown.conflicts).toEqual([]);

    writeJsonl(join(dir, "candidates.jsonl"), [...readJsonl<CalibrationItem>(join(dir, "candidates.jsonl")), bridge]);
    const merged = await split(dir);
    const bridgeGroup = merged.items[bridge.id]!;
    expect(merged.items[heldoutItem.id]).toBe(bridgeGroup);
    expect(merged.items[selectionItem.id]).toBe(bridgeGroup);
    expect(merged.components[bridgeGroup]).toBe("selection");
    expect(merged.conflicts).toEqual([bridgeGroup]);
    // The conflict is remembered: a later split keeps it on selection.
    expect((await split(dir)).conflicts).toEqual([bridgeGroup]);

    // Held-out evaluation units are human-labelled real items only: a synthetic item in a held-out
    // group is excluded, and so is an unlabelled real item (a proposal is not a label).
    const sample = loadDataset(SAMPLE);
    const synthetic: CalibrationItem = {
      ...heldoutItem,
      id: "syn-test-heldout",
      source: "synthetic",
      synthetic: true,
      source_item_id: heldoutItem.id,
      quality: "good",
      justification: "A synthetic justification.",
    };
    const unlabelledReal = derived(heldoutItem, "adv-test-unlabelled");
    const dataset = {
      ...sample,
      items: [...sample.items, synthetic, unlabelledReal],
      extractions: new Map([...sample.extractions, [unlabelledReal.id, { ...sample.extractions.get(heldoutItem.id)!, id: unlabelledReal.id }]]),
      labels: [...sample.labels, label(synthetic.id, "justified", true)],
      split: {
        ...sample.split!,
        items: { ...sample.split!.items, [synthetic.id]: sample.split!.items[heldoutItem.id]!, [unlabelledReal.id]: sample.split!.items[heldoutItem.id]! },
      },
    };
    const excluded = { noJustification: 0, unsplit: 0, unlabelled: 0, syntheticHeldout: 0, unscored: 0, engineError: 0, servedModelMismatch: 0 };
    const scorable = scorableItems(dataset, excluded);
    expect(excluded.syntheticHeldout).toBe(1);
    expect(excluded.unlabelled).toBe(1);
    for (const entry of scorable.filter((e) => e.side === "heldout")) {
      expect(entry.item.synthetic).toBe(false);
      expect(entry.labelSource).toBe("human");
    }
    const rows = new Map(
      readJsonl<ProbabilityRow>(join(SAMPLE, "runs/typesafe/jev-1.13.0/2026-10-07T00-00-00Z.jsonl")).map((row) => [row.id, row]),
    );
    rows.set(synthetic.id, { id: synthetic.id, probability: 0.99, served_model: JEV });
    const report = buildCalibrationReport({ dataset, scorable, excluded, probabilities: rows, model: JEV, engine: "replay", maxFalseAcceptUpper: 0.1 });
    const expected = JSON.parse(readFileSync(join(SAMPLE, "expected-report.json"), "utf8"));
    expect(report.heldout).toEqual(expected.heldout);
  });
});
