import { afterAll, afterEach, beforeAll, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { disableNetwork } from "@agent-kernel/kernel/model-nodes/testing";

import { LABEL_ADVISORY_MODEL } from "@server/infrastructure/kernel/nodes/functions.js";

import { parseCalibrationArgs } from "./args.js";
import { bootstrapLabelsCommand, NO_JUSTIFICATION_RATIONALE, syntheticItemId } from "./bootstrap-labels.js";
import { calibrationPaths, readJsonl, sha256Hex, writeJson, writeJsonl } from "./store.js";
import type { CalibrationItem, ExtractionRecord, ProposalRecord, SplitFile } from "./types.js";

const FILE = "src/melee/gm/gmtoulib.c";
let restoreNetwork: () => void;
const dirs: string[] = [];

beforeAll(() => {
  restoreNetwork = disableNetwork();
});
afterAll(() => restoreNetwork());
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function item(id: string, over: Partial<CalibrationItem> = {}): CalibrationItem {
  return {
    schema: "advisory_calibration_item_v1",
    id,
    source: "history",
    synthetic: false,
    fingerprint: `af2:${id}`,
    checkpoint_id: `cp-${id}`,
    run_id: "run-1",
    worker_state_id: `ws-${id}`,
    attempt_index: 1,
    target_key: "main/melee/gm/gmtoulib::gmtoulib_fn",
    finding: {
      rule_id: "type_erasing_cast",
      severity: "warning",
      standard_id: "casts",
      file: FILE,
      line: 11,
      excerpt: "templates_800[0] = *(char**) &lbl_804DA6C4;",
      message: "Added type-erasing cast `(char**)`.",
      detail: { llm_review: true, cast: "(char**)" },
    },
    full_line: "    templates_800[0] = *(char**) &lbl_804DA6C4;",
    hunk: `@@ -10,3 +10,4 @@ ${id}\n+    templates_800[0] = *(char**) &lbl_804DA6C4;`,
    note_key: `note-${id}`,
    code_facts: { exact: true, old_score: 0.97, new_score: 1 },
    group_key: sha256Hex(id),
    ...over,
  };
}

function extraction(id: string, justification: string | null): ExtractionRecord {
  return { id, justification, evidence: [], kept: justification !== null, structured_field_used: false, source: "extract", extracted_at: "2026-10-01T00:00:00.000Z" };
}

test("bootstrap-labels --engine fake proposes labels and synthesizes only from selection groups", async () => {
  const dir = mkdtempSync(join(tmpdir(), "advisory-bootstrap-"));
  dirs.push(dir);
  const paths = calibrationPaths(dir);
  // Held-out items sort first by id, so picking by id alone would synthesize from them.
  writeJsonl(paths.candidates, [
    item("adv-1-held"),
    item("adv-2-held"),
    item("adv-3-sel"),
    item("adv-4-sel"),
    item("adv-5-sel", { hunk: null }),
    item("adv-6-new"),
  ]);
  writeJsonl(paths.extractions, [
    extraction("adv-1-held", "objdiff: the char** view keeps the r13 load of lbl_804DA6C4."),
    extraction("adv-2-held", "It reads more cleanly this way."),
    extraction("adv-3-sel", null),
  ]);
  const split: SplitFile = {
    schema: "advisory_calibration_split_v1",
    salt: "salt",
    heldout_percent: 40,
    base_groups: {},
    items: { "adv-1-held": "grp-h", "adv-2-held": "grp-h", "adv-3-sel": "grp-s1", "adv-4-sel": "grp-s2", "adv-5-sel": "grp-s2" },
    components: { "grp-h": "heldout", "grp-s1": "selection", "grp-s2": "selection" },
    conflicts: [],
  };
  writeJson(paths.split, split);
  const lines: string[] = [];
  const run = (...flags: string[]) =>
    bootstrapLabelsCommand(parseCalibrationArgs(["bootstrap-labels", "--engine", "fake", "--dir", dir, ...flags]), (line) => lines.push(line));

  // Two label calls (adv-3-sel has no justification: proposed without a call) and 2 × 2 synthesis calls.
  expect(await run("--synthesize", "2")).toEqual({ proposals: 3, synthetic: 4, calls: 6, failed: 0 });
  expect(lines.at(-1)).toContain("6 model calls");
  const proposals = new Map(readJsonl<ProposalRecord>(paths.proposals).map((row) => [row.id, row]));
  expect([...proposals.keys()].sort()).toEqual(["adv-1-held", "adv-2-held", "adv-3-sel"]);
  expect(proposals.get("adv-1-held")).toMatchObject({ label: "justified", model: LABEL_ADVISORY_MODEL });
  expect(typeof proposals.get("adv-1-held")!.run_id).toBe("string");
  expect(proposals.get("adv-2-held")).toMatchObject({ label: "unjustified", model: LABEL_ADVISORY_MODEL });
  expect(proposals.get("adv-3-sel")).toMatchObject({ label: "unjustified", rationale: NO_JUSTIFICATION_RATIONALE });
  expect(proposals.get("adv-3-sel")!.run_id).toBeUndefined();

  const synthetic = readJsonl<CalibrationItem>(paths.synthetic);
  expect(synthetic.map((row) => row.id)).toEqual([
    syntheticItemId("adv-3-sel", "good"),
    syntheticItemId("adv-3-sel", "bad"),
    syntheticItemId("adv-4-sel", "good"),
    syntheticItemId("adv-4-sel", "bad"),
  ]);
  for (const row of synthetic) {
    const source = item(row.source_item_id!);
    expect(row).toMatchObject({
      source: "synthetic",
      synthetic: true,
      group_key: source.group_key,
      worker_state_id: source.worker_state_id,
      fingerprint: source.fingerprint,
      finding: source.finding,
      hunk: source.hunk,
      code_facts: source.code_facts,
    });
    expect(row.justification!.length).toBeGreaterThan(0);
    expect(row.rationale!.length).toBeGreaterThan(0);
  }
  expect(synthetic.map((row) => row.quality)).toEqual(["good", "bad", "good", "bad"]);

  // A rerun makes no calls and writes nothing.
  expect(await run("--synthesize", "2")).toEqual({ proposals: 0, synthetic: 0, calls: 0, failed: 0 });
  expect(readJsonl<CalibrationItem>(paths.synthetic)).toEqual(synthetic);

  // More synthesis takes the item the split has not seen yet, never a held-out one.
  expect(await run("--synthesize", "5")).toEqual({ proposals: 0, synthetic: 2, calls: 2, failed: 0 });
  const sources = new Set(readJsonl<CalibrationItem>(paths.synthetic).map((row) => row.source_item_id));
  expect([...sources].sort()).toEqual(["adv-3-sel", "adv-4-sel", "adv-6-new"]);
});

test("two copies of one dataset label into one --db without colliding; a repeat in either replays", async () => {
  const root = mkdtempSync(join(tmpdir(), "advisory-bootstrap-shared-"));
  dirs.push(root);
  const dbPath = join(root, "kernel.db");
  const callRuns = () => {
    const db = new Database(dbPath, { readonly: true });
    try {
      return (db.query("SELECT COUNT(*) AS n FROM pi_agent_sessions WHERE kind = 'call'").get() as { n: number }).n;
    } finally {
      db.close();
    }
  };
  const copies = ["a", "b"].map((name) => {
    const dir = join(root, name, "dataset");
    mkdirSync(dir, { recursive: true });
    const paths = calibrationPaths(dir);
    writeJsonl(paths.candidates, [item("adv-1")]);
    writeJsonl(paths.extractions, [extraction("adv-1", "objdiff: the cast keeps lwz r3 at 0x1C.")]);
    return { dir, paths };
  });
  const run = (dir: string) => bootstrapLabelsCommand(parseCalibrationArgs(["bootstrap-labels", "--dir", dir, "--engine", "fake", "--db", dbPath]), () => {});
  for (const [index, { dir }] of copies.entries()) {
    expect(await run(dir)).toMatchObject({ proposals: 1, calls: 1, failed: 0 });
    expect(callRuns()).toBe(index + 1);
  }
  // Forget a proposal: the same request under the same parent replays (no new call run).
  rmSync(copies[0]!.paths.proposals);
  expect(await run(copies[0]!.dir)).toMatchObject({ proposals: 1, calls: 1, failed: 0 });
  expect(callRuns()).toBe(2);
});
