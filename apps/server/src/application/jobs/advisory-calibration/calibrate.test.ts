import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { ADVISORY_ADJUDICATION_CONFIG_PATH } from "@server/core/agent-catalog/agents/running/worker/advisory-adjudication/config.js";

import { parseCalibrationArgs } from "./args";
import { applyCalibrationToConfig, calibrateCommand, type CalibrationReport } from "./calibrate";
import { evaluateHeldout, qualify, selectThresholds, type EvaluationItem } from "./evaluate";
import { splitCommand } from "./split";
import { appendJsonl, loadDataset, readJsonl, writeJsonl } from "./store";
import type { CalibrationItem, LabelRecord, ProbabilityRow, SplitFile } from "./types";

const REPO_ROOT = join(import.meta.dir, "../../../../../..");
const SAMPLE = join(REPO_ROOT, "analysis/advisory-adjudication/sample");
const SAMPLE_CORRELATED = join(REPO_ROOT, "analysis/advisory-adjudication/sample-correlated");
const JEV = "typesafe/jev-1.13.0";

const realFetch = globalThis.fetch;
const tempDirs: string[] = [];

beforeAll(() => {
  globalThis.fetch = (async () => {
    throw new Error("network disabled in tests");
  }) as unknown as typeof fetch;
});

afterAll(() => {
  globalThis.fetch = realFetch;
});

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "advisory-calibrate-"));
  tempDirs.push(dir);
  return dir;
}

async function calibrate(argv: string[]): Promise<{ report: CalibrationReport; printed: string[] }> {
  const printed: string[] = [];
  const report = await calibrateCommand(parseCalibrationArgs(["calibrate", ...argv]), (line) => printed.push(line));
  return { report, printed };
}

function expectedReport(dir: string): CalibrationReport {
  return JSON.parse(readFileSync(join(dir, "expected-report.json"), "utf8")) as CalibrationReport;
}

function item(id: string, group: string, label: "justified" | "unjustified", probability: number, side: "selection" | "heldout" = "heldout"): EvaluationItem {
  return { id, group, side, synthetic: false, label, labelSource: "human", probability };
}

const BARS = { minNegativeGroups: 29, minPositiveGroups: 10, maxFalseAcceptUpper: 0.1 };
const RUN_FILE = "runs/typesafe/jev-1.13.0/2026-10-07T00-00-00Z.jsonl";

function sampleCopy(): string {
  const dir = join(tempDir(), "sample");
  cpSync(SAMPLE, dir, { recursive: true });
  return dir;
}

function humanLabel(id: string, label: "justified" | "unjustified"): LabelRecord {
  return { id, label, labeler: "human", reviewer: "test", proposed_label: null, agreed: null, synthetic: false, group: null, labeled_at: "2026-10-07T00:00:00.000Z" };
}

/** A real item of the sample by its split side, and the side's group. */
function sampleItem(dir: string, side: "selection" | "heldout", label?: "justified" | "unjustified", notIn: readonly string[] = []): { item: CalibrationItem; group: string } {
  const dataset = loadDataset(dir);
  const labels = new Map(dataset.labels.map((record) => [record.id, record.label]));
  const item = dataset.items.find((candidate) => {
    const group = dataset.split!.items[candidate.id]!;
    return !candidate.synthetic && dataset.split!.components[group] === side && !notIn.includes(group) && (label === undefined || labels.get(candidate.id) === label);
  })!;
  return { item, group: dataset.split!.items[item.id]! };
}

function addItem(dir: string, item: CalibrationItem): void {
  writeJsonl(join(dir, "candidates.jsonl"), [...readJsonl<CalibrationItem>(join(dir, "candidates.jsonl")), item]);
}
const HASHES = { labelSetHash: "labels", splitHash: "split" };

describe("advisory calibration", () => {
  test("calibrate --engine replay on sample reproduces expected-report.json with fetch disabled", async () => {
    // The plan's mandatory offline verification: no credentials, no network, the shipped config.
    const { report, printed } = await calibrate(["--dir", SAMPLE, "--engine", "replay", "--dry-run"]);
    const expected = expectedReport(SAMPLE);
    expect(JSON.parse(printed.join("\n"))).toEqual(expected);
    expect(report).toEqual(expected);
    // The numbers the sample was built to produce (12 held-out groups: 8 negative, 4 positive).
    expect(report.selection.thresholds).toEqual({ passAt: 0.88, failAt: 0.84 });
    expect(report.heldout.groupMatrix).toEqual({
      justified: { accept: 2, abstain: 1, reject: 1 },
      unjustified: { accept: 1, abstain: 1, reject: 6 },
    });
    expect(report.heldout.itemMatrix).toEqual({
      justified: { accept: 2, abstain: 1, reject: 2 },
      unjustified: { accept: 1, abstain: 1, reject: 8 },
    });
    expect(report.heldout.falseAccepts).toBe(1);
    // Beta(0.95; 2, 7).
    expect(report.heldout.upper95).toBe(0.470679);
    expect(report.qualification).toBe("exploratory");
    // A dry run writes nothing.
    expect(existsSync(join(SAMPLE, "reports"))).toBe(false);
  });

  test("calibrate --engine fake on sample runs the kernel decision path and matches the replay report", async () => {
    const { report } = await calibrate(["--dir", SAMPLE, "--engine", "fake", "--dry-run"]);
    expect({ ...report, engine: "replay" }).toEqual(expectedReport(SAMPLE));
  });

  test("a repeat calibration into the same --db replays its decisions; a changed question set decides afresh", async () => {
    const dbPath = join(tempDir(), "calibrate.db");
    const decisionRuns = () => {
      const db = new Database(dbPath, { readonly: true });
      try {
        return (db.query("SELECT COUNT(*) AS n FROM pi_agent_sessions WHERE kind = 'decision'").get() as { n: number }).n;
      } finally {
        db.close();
      }
    };
    const first = await calibrate(["--dir", SAMPLE, "--engine", "fake", "--dry-run", "--db", dbPath]);
    expect(decisionRuns()).toBe(24);
    // Same requests: every decision replays (no new run) and the report is unchanged.
    const second = await calibrate(["--dir", SAMPLE, "--engine", "fake", "--dry-run", "--db", dbPath]);
    expect(decisionRuns()).toBe(24);
    expect(second.report).toEqual(first.report);
    // Other bars in the question set: new requestIds, fresh decisions, no invalid-request.
    const configPath = join(tempDir(), "config.json");
    const shipped = JSON.parse(readFileSync(ADVISORY_ADJUDICATION_CONFIG_PATH, "utf8")) as { thresholds: Record<string, object> };
    writeFileSync(configPath, JSON.stringify({ ...shipped, thresholds: { ...shipped.thresholds, [JEV]: { passAt: 0.9, failAt: 0.1, qualification: "exploratory" } } }));
    const third = await calibrate(["--dir", SAMPLE, "--engine", "fake", "--dry-run", "--db", dbPath, "--config", configPath]);
    expect(decisionRuns()).toBe(48);
    expect({ ...third.report, engine: "replay" }).toEqual(expectedReport(SAMPLE));
  });

  test("29 negative items from one group stay exploratory", async () => {
    const { report } = await calibrate(["--dir", SAMPLE_CORRELATED, "--engine", "replay", "--dry-run"]);
    expect(report).toEqual(expectedReport(SAMPLE_CORRELATED));
    expect(report.heldout.negativeGroups).toBe(1);
    expect(report.heldout.positiveGroups).toBe(10);
    expect(report.heldout.itemMatrix!.unjustified.reject).toBe(29);
    expect(report.qualification).toBe("exploratory");
    // Counted as 29 independent items, the same evidence would wrongly qualify.
    const asIndependent = Array.from({ length: 29 }, (_, i) => item(`n${i}`, `n${i}`, "unjustified", 0.1)).concat(
      Array.from({ length: 10 }, (_, i) => item(`p${i}`, `p${i}`, "justified", 0.95)),
    );
    const naive = evaluateHeldout(asIndependent, report.selection.thresholds);
    expect(naive.upper95).toBe(0.098145);
    expect(qualify(report.selection, naive, BARS, HASHES).qualification).toBe("enforcement-qualified");
  });

  test("qualification needs ≥ 29 negative groups and a Clopper–Pearson upper95 ≤ maxFalseAcceptUpper", () => {
    const selection = selectThresholds([item("sj", "s1", "justified", 0.95, "selection"), item("su", "s2", "unjustified", 0.1, "selection")]);
    expect(selection.thresholds).toEqual({ passAt: 0.95, failAt: 0.1 });
    const positives = Array.from({ length: 10 }, (_, i) => item(`p${i}`, `pg${i}`, "justified", 0.97));
    const negatives = (n: number) => Array.from({ length: n }, (_, i) => item(`n${i}`, `ng${i}`, "unjustified", 0.05));

    const n28 = evaluateHeldout([...negatives(28), ...positives], selection.thresholds);
    expect(n28.upper95).toBe(0.101466);
    expect(qualify(selection, n28, BARS, HASHES)).toEqual({
      qualification: "exploratory",
      reasons: ["held-out negative groups 28 < 29", "Clopper–Pearson upper95 0.101466 > maxFalseAcceptUpper 0.1"],
    });

    const n29 = evaluateHeldout([...negatives(29), ...positives], selection.thresholds);
    expect(n29.upper95).toBe(0.098145);
    expect(qualify(selection, n29, BARS, HASHES)).toEqual({ qualification: "enforcement-qualified", reasons: [] });
    // Too few positive groups, or a missing hash, still blocks.
    expect(qualify(selection, evaluateHeldout([...negatives(29), ...positives.slice(1)], selection.thresholds), BARS, HASHES).reasons).toEqual([
      "held-out positive groups 9 < 10",
    ]);
    expect(qualify(selection, n29, BARS, { labelSetHash: null, splitHash: "split" }).qualification).toBe("exploratory");

    // 29 groups, one false accept: the beta quantile 0.1534 fails the bar.
    const oneFalseAccept = negatives(29);
    oneFalseAccept[0] = item("n0", "ng0", "unjustified", 0.99);
    const x1 = evaluateHeldout([...oneFalseAccept, ...positives], selection.thresholds);
    expect(x1.falseAccepts).toBe(1);
    expect(x1.upper95).toBe(0.153392);
    expect(qualify(selection, x1, BARS, HASHES).qualification).toBe("exploratory");

    // A group is one unit: two accepted items in one negative group are one false accept.
    const correlated = [
      item("a", "g-neg", "unjustified", 0.99),
      item("b", "g-neg", "unjustified", 0.98),
      item("c", "g-neg", "unjustified", 0.01),
      ...negatives(28).slice(1),
      ...positives,
    ];
    const grouped = evaluateHeldout(correlated, selection.thresholds);
    expect(grouped.negativeGroups).toBe(28);
    expect(grouped.falseAccepts).toBe(1);
    expect(grouped.itemMatrix!.unjustified.accept).toBe(2);

    // Groups whose human labels disagree are excluded and listed.
    const conflicting = evaluateHeldout([item("x", "g-mixed", "unjustified", 0.2), item("y", "g-mixed", "justified", 0.97), ...positives], selection.thresholds);
    expect(conflicting.conflictingGroups).toEqual(["g-mixed"]);
    expect(conflicting.negativeGroups).toBe(0);
    expect(conflicting.positiveGroups).toBe(10);
  });

  test("threshold selection admits no selection false accept and prefers true accepts, then fewer abstains", () => {
    // An unjustified item at p 0.99 accepts at every passAt: no feasible pair.
    const infeasible = selectThresholds([item("u", "g1", "unjustified", 0.99, "selection"), item("j", "g2", "justified", 0.99, "selection")]);
    expect(infeasible.thresholds).toBeNull();
    expect(qualify(infeasible, evaluateHeldout([], null), BARS, HASHES).reasons[0]).toBe("no threshold pair has zero false accepts on selection");
    const chosen = selectThresholds([
      item("u1", "g1", "unjustified", 0.7, "selection"),
      item("j1", "g2", "justified", 0.9, "selection"),
      item("j2", "g3", "justified", 0.72, "selection"),
      item("u2", "g4", "unjustified", 0.2, "selection"),
    ]);
    // passAt must clear 0.70; 0.71–0.72 keeps both justified items; the higher passAt wins the tie.
    expect(chosen.thresholds).toEqual({ passAt: 0.72, failAt: 0.7 });
    expect(chosen.trueAccepts).toBe(2);
    expect(chosen.abstains).toBe(0);
  });

  test("calibrate refuses a stale split until split is rerun (an item bridging a selection and a held-out group)", async () => {
    const dir = sampleCopy();
    const selection = sampleItem(dir, "selection").item;
    const heldout = sampleItem(dir, "heldout").item;
    // Same worker state, rule and file as the held-out item, same flagged line as the selection item.
    const bridge: CalibrationItem = {
      ...selection,
      id: "adv-test-bridge",
      checkpoint_id: "ckpt-test-bridge",
      worker_state_id: heldout.worker_state_id,
      finding: { ...selection.finding, rule_id: heldout.finding.rule_id, file: heldout.finding.file },
    };
    addItem(dir, bridge);
    await expect(calibrate(["--dir", dir, "--engine", "replay", "--dry-run"])).rejects.toThrow(
      /split\.json is stale \(1 item\(s\) are not in split\.json; 1 group\(s\) now join saved groups that were split apart\); rerun `advisory-calibration split/,
    );
    // Even with the item assigned to its old selection group, the merge is caught.
    const split = JSON.parse(readFileSync(join(dir, "split.json"), "utf8")) as SplitFile;
    writeFileSync(join(dir, "split.json"), JSON.stringify({ ...split, items: { ...split.items, [bridge.id]: split.items[selection.id] } }));
    await expect(calibrate(["--dir", dir, "--engine", "replay", "--dry-run"])).rejects.toThrow("now join saved groups");

    writeFileSync(join(dir, "split.json"), JSON.stringify(split));
    await splitCommand(parseCalibrationArgs(["split", "--dir", dir]), () => {});
    const { report } = await calibrate(["--dir", dir, "--engine", "replay", "--dry-run"]);
    // The merged group is forced to selection, so the held-out side loses that group.
    expect(report.heldout.negativeGroups + report.heldout.positiveGroups).toBe(11);

    // Removing the bridge splits the saved group apart again: also stale.
    writeJsonl(join(dir, "candidates.jsonl"), readJsonl<CalibrationItem>(join(dir, "candidates.jsonl")).filter((row) => row.id !== bridge.id));
    await expect(calibrate(["--dir", dir, "--engine", "replay", "--dry-run"])).rejects.toThrow("1 saved group(s) no longer hold together");
  });

  test("a selection group with opposing human labels is left out of threshold selection and listed", async () => {
    const dir = sampleCopy();
    const expected = expectedReport(SAMPLE);
    // The sample's own S3 group (one justified and one unjustified attempt of the same line) is such a group.
    expect(expected.selection.conflictingGroups).toHaveLength(1);
    const { item: justified, group } = sampleItem(dir, "selection", "justified", expected.selection.conflictingGroups);
    // An opposing, unjustified member scored at p 0.99 would otherwise leave no feasible threshold pair.
    const opposing: CalibrationItem = { ...justified, id: "adv-test-opposing-selection", checkpoint_id: "ckpt-test-opposing-selection", attempt_index: 9 };
    addItem(dir, opposing);
    appendJsonl(join(dir, "extractions.jsonl"), { ...readJsonl<{ id: string }>(join(dir, "extractions.jsonl")).find((row) => row.id === justified.id)!, id: opposing.id });
    appendJsonl(join(dir, "labels.jsonl"), humanLabel(opposing.id, "unjustified"));
    appendJsonl(join(dir, RUN_FILE), { id: opposing.id, probability: 0.99, served_model: JEV } satisfies ProbabilityRow);
    await splitCommand(parseCalibrationArgs(["split", "--dir", dir]), () => {});

    const { report } = await calibrate(["--dir", dir, "--engine", "replay", "--dry-run"]);
    expect(report.selection.conflictingGroups).toEqual([...expected.selection.conflictingGroups, group].sort());
    expect(report.selection.items).toBe(expected.selection.items - 1);
    // Selection without that group: S4's justified 0.88 is gone too, so passAt rises to the next justified p.
    expect(report.selection.thresholds).toEqual({ passAt: 0.91, failAt: 0.84 });
    expect(report.selection.matrix.unjustified.accept).toBe(0);
    expect(report.heldout.conflictingGroups).toEqual([]);
    expect([report.heldout.negativeGroups, report.heldout.positiveGroups]).toEqual([8, 4]);

    // The opposing member is caught even when it has no justification (and so is never scored).
    appendJsonl(join(dir, "extractions.jsonl"), { id: opposing.id, justification: null, evidence: [], kept: false, structured_field_used: false, source: "extract", extracted_at: "2026-10-07T00:00:00.000Z" });
    const { report: unscored } = await calibrate(["--dir", dir, "--engine", "replay", "--dry-run"]);
    expect(unscored.items.excluded.noJustification).toBe(1);
    expect(unscored.selection.conflictingGroups).toContain(group);
    expect(unscored.selection).toEqual(report.selection);
  });

  test("a held-out group with opposing human labels is excluded even when the opposing member is never scored", async () => {
    const dir = sampleCopy();
    const { item: negative, group } = sampleItem(dir, "heldout", "unjustified");
    const opposing: CalibrationItem = { ...negative, id: "adv-test-opposing", checkpoint_id: "ckpt-test-opposing", attempt_index: 9 };
    addItem(dir, opposing);
    appendJsonl(join(dir, "extractions.jsonl"), { ...readJsonl<{ id: string }>(join(dir, "extractions.jsonl")).find((row) => row.id === negative.id)!, id: opposing.id });
    appendJsonl(join(dir, "labels.jsonl"), humanLabel(opposing.id, "justified"));
    // The opposing member's decision failed: it is filtered out before evaluation.
    appendJsonl(join(dir, RUN_FILE), { id: opposing.id, probability: null, served_model: JEV, abstain_reason: "engine-error" } satisfies ProbabilityRow);
    await splitCommand(parseCalibrationArgs(["split", "--dir", dir]), () => {});

    const { report } = await calibrate(["--dir", dir, "--engine", "replay", "--dry-run"]);
    expect(report.items.excluded.engineError).toBe(1);
    expect(report.heldout.conflictingGroups).toEqual([group]);
    expect(report.heldout.negativeGroups).toBe(7);
    expect(report.heldout.positiveGroups).toBe(4);
    expect(report.heldout.groups).toBe(11);
    // Labelling the opposing member without any justification at all is caught the same way.
    appendJsonl(join(dir, "extractions.jsonl"), { id: opposing.id, justification: null, evidence: [], kept: false, structured_field_used: false, source: "extract", extracted_at: "2026-10-07T00:00:00.000Z" });
    const { report: noJustification } = await calibrate(["--dir", dir, "--engine", "replay", "--dry-run"]);
    expect(noJustification.items.excluded.noJustification).toBe(1);
    expect(noJustification.heldout.conflictingGroups).toEqual([group]);
    expect(noJustification.heldout.negativeGroups).toBe(7);
  });

  test("qualification compares the exact Clopper–Pearson bound, not the rounded one", () => {
    const selection = selectThresholds([item("sj", "s1", "justified", 0.95, "selection"), item("su", "s2", "unjustified", 0.1, "selection")]);
    const positives = Array.from({ length: 10 }, (_, i) => item(`p${i}`, `pg${i}`, "justified", 0.97));
    const negatives = Array.from({ length: 46 }, (_, i) => item(`n${i}`, `ng${i}`, "unjustified", i === 0 ? 0.99 : 0.05));
    const heldout = evaluateHeldout([...negatives, ...positives], selection.thresholds);
    // x = 1, n = 46: exactly 0.09902431681989782, reported as 0.099024.
    expect(heldout.falseAccepts).toBe(1);
    expect(heldout.upper95).toBe(0.099024);
    expect(qualify(selection, heldout, { ...BARS, maxFalseAcceptUpper: 0.099024 }, HASHES)).toEqual({
      qualification: "exploratory",
      reasons: ["Clopper–Pearson upper95 0.099024 > maxFalseAcceptUpper 0.099024"],
    });
    expect(qualify(selection, heldout, { ...BARS, maxFalseAcceptUpper: 0.099025 }, HASHES).qualification).toBe("enforcement-qualified");
  });

  test("calibrate never raises maxFalseAcceptUpper and keeps other models' entries on --write", async () => {
    const dir = join(tempDir(), "sample");
    cpSync(SAMPLE, dir, { recursive: true });
    const configPath = join(tempDir(), "config.json");
    const shipped = JSON.parse(readFileSync(ADVISORY_ADJUDICATION_CONFIG_PATH, "utf8")) as Record<string, unknown>;
    const other = { passAt: 0.9, failAt: 0.2, qualification: "exploratory" };
    writeFileSync(
      configPath,
      JSON.stringify({ ...shipped, maxFalseAcceptUpper: 0.05, thresholds: { ...(shipped.thresholds as object), "openai/gpt-6-luna": other } }, null, 2),
    );

    await expect(calibrate(["--dir", dir, "--engine", "replay", "--write", "--config", configPath, "--max-false-accept-upper", "0.1"])).rejects.toThrow(
      "may only lower",
    );
    await expect(calibrate(["--dir", dir, "--engine", "fake", "--write", "--config", configPath])).rejects.toThrow("--write needs");

    const { report } = await calibrate(["--dir", dir, "--engine", "replay", "--write", "--config", configPath]);
    expect(report.maxFalseAcceptUpper).toBe(0.05);
    const written = JSON.parse(readFileSync(configPath, "utf8"));
    expect(written.maxFalseAcceptUpper).toBe(0.05);
    expect(written.thresholds["openai/gpt-6-luna"]).toEqual(other);
    expect(written.thresholds[JEV]).toEqual({
      passAt: 0.88,
      failAt: 0.84,
      qualification: "exploratory",
      labelSetHash: report.labelSetHash,
      splitHash: report.splitHash,
      heldout: { negatives: 8, positives: 4, falseAccepts: 1, upper95: 0.470679 },
      calibratedAt: expect.any(String),
    });
    expect(written.model).toBe(shipped.model);
    expect(written.inline).toEqual(shipped.inline);
    // The report pair is written beside the dataset.
    expect(readdirSync(join(dir, "reports")).sort()).toEqual([expect.stringMatching(/\.json$/), expect.stringMatching(/\.md$/)]);

    // A report computed against a higher cap is refused outright.
    expect(() => applyCalibrationToConfig(written, { ...report, maxFalseAcceptUpper: 0.1 }, "2026-10-07T00:00:00.000Z")).toThrow("never raises");
  });
});
