import { afterAll, afterEach, beforeAll, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { disableNetwork } from "@agent-kernel/kernel/model-nodes/testing";

import { parseCalibrationArgs } from "./args.js";
import { reviewCommand, type ReviewIO } from "./review.js";
import { calibrationPaths, readJsonl, sha256Hex, writeJson, writeJsonl } from "./store.js";
import type { CalibrationItem, ExtractionRecord, LabelRecord, ProposalRecord, SplitFile } from "./types.js";

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
    hunk: "@@ -10,3 +10,4 @@\n {\n+    templates_800[0] = *(char**) &lbl_804DA6C4;\n     return;",
    note_key: null,
    code_facts: { exact: true, old_score: 0.97, new_score: 1 },
    group_key: sha256Hex(id),
    ...over,
  };
}

function extraction(id: string, justification: string | null): ExtractionRecord {
  return { id, justification, evidence: [], kept: justification !== null, structured_field_used: false, source: "extract", extracted_at: "2026-10-01T00:00:00.000Z" };
}

function proposal(id: string, label: ProposalRecord["label"]): ProposalRecord {
  return { id, label, rationale: `proposed ${label}`, model: "codex-lb/gpt-6.1-sol", proposed_at: "2026-10-01T00:00:00.000Z" };
}

function scripted(keys: Array<string | null>): { io: ReviewIO; lines: string[] } {
  const lines: string[] = [];
  const queue = [...keys];
  return { lines, io: { print: (line) => lines.push(line), nextKey: async () => (queue.length > 0 ? queue.shift()! : null) } };
}

test("review appends labels and resumes", async () => {
  const dir = mkdtempSync(join(tmpdir(), "advisory-review-"));
  dirs.push(dir);
  const paths = calibrationPaths(dir);
  writeJsonl(paths.candidates, [item("adv-1-sel"), item("adv-2-held"), item("adv-3-held"), item("adv-4-held")]);
  writeJsonl(paths.synthetic, [
    item("syn-5-sel", {
      source: "synthetic",
      synthetic: true,
      group_key: sha256Hex("adv-1-sel"),
      source_item_id: "adv-1-sel",
      quality: "good",
      justification: "objdiff shows the char** view keeps the r13 load.",
      rationale: "names the load",
    }),
  ]);
  // adv-3-held has no extraction: it is still reviewable.
  writeJsonl(paths.extractions, [
    extraction("adv-1-sel", "Kept for the match."),
    extraction("adv-2-held", "objdiff: the cast keeps lwz r3 at 0x1C."),
    extraction("adv-4-held", "Cleaner this way."),
  ]);
  writeJsonl(paths.proposals, [proposal("adv-2-held", "justified"), proposal("adv-4-held", "justified")]);
  const split: SplitFile = {
    schema: "advisory_calibration_split_v1",
    salt: "salt",
    heldout_percent: 40,
    base_groups: {},
    items: { "adv-1-sel": "grp-s", "adv-2-held": "grp-h1", "adv-3-held": "grp-h1", "adv-4-held": "grp-h2", "syn-5-sel": "grp-s" },
    components: { "grp-s": "selection", "grp-h1": "heldout", "grp-h2": "heldout" },
    conflicts: [],
  };
  writeJson(paths.split, split);
  const args = parseCalibrationArgs(["review", "--dir", dir, "--reviewer", "tester"]);

  // Run 1: unlabelled held-out groups first (adv-1-sel sorts first by id but is selection);
  // once grp-h1 is labelled, adv-3-held drops behind the other unlabelled groups.
  const first = scripted(["j", "u", "q"]);
  const run1 = await reviewCommand(args, first.io);
  expect(run1.shown).toEqual(["adv-2-held", "adv-4-held", "adv-1-sel"]);
  const afterRun1 = readJsonl<LabelRecord>(paths.labels);
  expect(afterRun1).toHaveLength(2);
  expect(afterRun1[0]).toMatchObject({
    id: "adv-2-held",
    label: "justified",
    labeler: "human",
    reviewer: "tester",
    proposed_label: "justified",
    agreed: true,
    synthetic: false,
    group: "grp-h1",
  });
  expect(afterRun1[1]).toMatchObject({ id: "adv-4-held", label: "unjustified", proposed_label: "justified", agreed: false, group: "grp-h2" });
  expect(Number.isNaN(Date.parse(afterRun1[0]!.labeled_at))).toBe(false);

  // Run 2 resumes at the third item; a skip is recorded and the labels stay.
  const second = scripted(["s", "q"]);
  const run2 = await reviewCommand(args, second.io);
  expect(run2.shown).toEqual(["adv-1-sel", "syn-5-sel"]);
  expect(second.lines).toContain("labelled 2/5; held-out groups labelled: neg 1, pos 1 (need 29 / 10)");
  const afterRun2 = readJsonl<LabelRecord>(paths.labels);
  expect(afterRun2.slice(0, 2)).toEqual(afterRun1);
  expect(afterRun2).toHaveLength(3);
  expect(afterRun2[2]).toMatchObject({ id: "adv-1-sel", label: "skip", proposed_label: null, agreed: null, synthetic: false, group: "grp-s" });

  // Run 3: never-seen items first, the skipped item last; an unknown key re-prompts.
  const third = scripted(["x", "u", "j", "j"]);
  const run3 = await reviewCommand(args, third.io);
  expect(run3.shown).toEqual(["syn-5-sel", "adv-3-held", "adv-1-sel"]);
  expect(third.lines).toContain("    (none)");
  const afterRun3 = readJsonl<LabelRecord>(paths.labels);
  expect(afterRun3).toHaveLength(6);
  expect(afterRun3.slice(3).map((record) => [record.id, record.label, record.synthetic, record.group])).toEqual([
    ["syn-5-sel", "unjustified", true, "grp-s"],
    ["adv-3-held", "justified", false, "grp-h1"],
    ["adv-1-sel", "justified", false, "grp-s"],
  ]);
  expect(third.lines.at(-1)).toContain("labelled 5/5; held-out groups labelled: neg 1, pos 1");

  // Everything is labelled: nothing is shown again.
  const fourth = scripted([]);
  expect((await reviewCommand(args, fourth.io)).shown).toEqual([]);
});
