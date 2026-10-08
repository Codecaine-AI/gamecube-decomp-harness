import { afterAll, afterEach, beforeAll, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { disableNetwork } from "@agent-kernel/kernel/model-nodes/testing";

import { parseCalibrationArgs } from "./args.js";
import { extractCommand } from "./extract.js";
import { calibrationPaths, readJsonl, sha256Hex, writeJsonl } from "./store.js";
import type { CalibrationItem, ExtractionRecord, NoteRecord } from "./types.js";

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

function item(id: string, noteKey: string | null, line: number, over: Partial<CalibrationItem> = {}): CalibrationItem {
  return {
    schema: "advisory_calibration_item_v1",
    id,
    source: "history",
    synthetic: false,
    fingerprint: `af2:${id}`,
    checkpoint_id: `cp-${noteKey}`,
    run_id: "run-1",
    worker_state_id: `ws-${noteKey}`,
    attempt_index: 2,
    target_key: "main/melee/gm/gmtoulib::gmtoulib_fn",
    finding: {
      rule_id: "type_erasing_cast",
      severity: "warning",
      standard_id: "casts",
      file: FILE,
      line,
      excerpt: "templates_800[0] = *(char**) &lbl_804DA6C4;",
      message: "Added type-erasing cast `(char**)`.",
      detail: { llm_review: true, cast: "(char**)" },
    },
    full_line: "    templates_800[0] = *(char**) &lbl_804DA6C4;",
    hunk: "@@ -10,3 +10,4 @@\n+    templates_800[0] = *(char**) &lbl_804DA6C4;",
    note_key: noteKey,
    code_facts: { exact: true, old_score: 0.97, new_score: 1 },
    group_key: sha256Hex(id),
    ...over,
  };
}

function note(key: string, text: string): NoteRecord {
  return { key, checkpoint_id: `cp-${key}`, worker_state_id: `ws-${key}`, attempt_index: 2, source: "agent_output", sha256: sha256Hex(text), text };
}

const KEPT = "MWCC loads lbl_804DA6C4 through r13 only with the char** view; objdiff 100%.";
const LEGACY = "The u32 view keeps the lwz at 0x1C; without it the stack offset moves.";

test("extract --engine fake writes one extraction per item and resumes", async () => {
  const dir = mkdtempSync(join(tmpdir(), "advisory-extract-"));
  dirs.push(dir);
  const paths = calibrationPaths(dir);
  writeJsonl(paths.notes, [
    note(
      "note-a",
      JSON.stringify({
        kept_advisories: [{ rule_id: "type_erasing_cast", file: FILE, line: 12, justification: KEPT }],
        validation: { objdiff: "objdiff 100% match" },
      }),
    ),
    note("note-b", JSON.stringify({ review_justification: LEGACY })),
  ]);
  writeJsonl(paths.candidates, [
    item("adv-a1", "note-a", 11),
    item("adv-a2", "note-a", 40),
    item("adv-b1", "note-b", 11),
    item("adv-c1", null, 11),
    item("adv-d1", "note-missing", 11),
  ]);
  writeJsonl(paths.synthetic, [
    item("syn-x", "note-a", 11, { source: "synthetic", synthetic: true, quality: "good", justification: "objdiff", source_item_id: "adv-a1" }),
  ]);
  const run = (...flags: string[]) => extractCommand(parseCalibrationArgs(["extract", "--dir", dir, ...flags]), () => {});

  // replay only reports.
  expect(await run("--engine", "replay")).toMatchObject({ calls: 0, written: 0, missing: 5 });
  expect(existsSync(paths.extractions)).toBe(false);

  // One call per checkpoint with a note, limited to the first; items without a note need no call.
  expect(await run("--engine", "fake", "--limit", "1")).toEqual({ extracted: 4, missing: 1, calls: 1, failed: 0, written: 4 });
  const first = readJsonl<ExtractionRecord>(paths.extractions);
  expect(first.map((row) => row.id).sort()).toEqual(["adv-a1", "adv-a2", "adv-c1", "adv-d1"]);
  const byId = new Map(first.map((row) => [row.id, row]));
  expect(byId.get("adv-a1")).toMatchObject({
    justification: KEPT,
    evidence: ["objdiff 100% match"],
    kept: true,
    structured_field_used: true,
    source: "extract",
  });
  expect(typeof byId.get("adv-a1")!.run_id).toBe("string");
  expect(byId.get("adv-a1")!.run_id).toBe(byId.get("adv-a2")!.run_id);
  expect(byId.get("adv-a2")).toMatchObject({ justification: null, evidence: [], kept: false, structured_field_used: true });
  for (const id of ["adv-c1", "adv-d1"]) {
    expect(byId.get(id)).toMatchObject({ justification: null, evidence: [], kept: false, structured_field_used: false, source: "extract" });
    expect(byId.get(id)!.run_id).toBeUndefined();
  }

  // The rerun resumes with the remaining checkpoint only.
  expect(await run("--engine", "fake")).toEqual({ extracted: 5, missing: 0, calls: 1, failed: 0, written: 1 });
  const second = readJsonl<ExtractionRecord>(paths.extractions);
  expect(second.slice(0, 4)).toEqual(first);
  expect(second[4]).toMatchObject({ id: "adv-b1", justification: LEGACY, structured_field_used: false, kept: true });

  // Nothing left: no call, nothing written.
  expect(await run("--engine", "fake")).toEqual({ extracted: 5, missing: 0, calls: 0, failed: 0, written: 0 });
  expect(readJsonl<ExtractionRecord>(paths.extractions)).toEqual(second);
});

test("a repeat extraction into the same --db replays the call; a changed note calls afresh", async () => {
  const dir = mkdtempSync(join(tmpdir(), "advisory-extract-replay-"));
  dirs.push(dir);
  const paths = calibrationPaths(dir);
  const dbPath = join(dir, "kernel.db");
  const callRuns = () => {
    const db = new Database(dbPath, { readonly: true });
    try {
      return (db.query("SELECT COUNT(*) AS n FROM pi_agent_sessions WHERE kind = 'call'").get() as { n: number }).n;
    } finally {
      db.close();
    }
  };
  writeJsonl(paths.notes, [note("note-b", JSON.stringify({ review_justification: LEGACY }))]);
  writeJsonl(paths.candidates, [item("adv-b1", "note-b", 11)]);
  const run = () => extractCommand(parseCalibrationArgs(["extract", "--dir", dir, "--engine", "fake", "--db", dbPath]), () => {});

  expect(await run()).toMatchObject({ calls: 1, written: 1 });
  expect(callRuns()).toBe(1);
  // Forget the record: the same request replays from the kernel database (no new call run).
  rmSync(paths.extractions);
  expect(await run()).toMatchObject({ calls: 1, written: 1, failed: 0 });
  expect(callRuns()).toBe(1);
  expect(readJsonl<ExtractionRecord>(paths.extractions)[0]).toMatchObject({ id: "adv-b1", justification: LEGACY });
  // A changed note is a different request: a new id and a fresh call, not invalid-request.
  rmSync(paths.extractions);
  writeJsonl(paths.notes, [note("note-b", JSON.stringify({ review_justification: KEPT }))]);
  expect(await run()).toMatchObject({ calls: 1, written: 1, failed: 0 });
  expect(callRuns()).toBe(2);
  expect(readJsonl<ExtractionRecord>(paths.extractions)[0]).toMatchObject({ id: "adv-b1", justification: KEPT });
});

test("two copies of one dataset extract into one --db without colliding; a repeat in either replays", async () => {
  const root = mkdtempSync(join(tmpdir(), "advisory-extract-shared-"));
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
    writeJsonl(paths.notes, [note("note-b", JSON.stringify({ review_justification: LEGACY }))]);
    writeJsonl(paths.candidates, [item("adv-b1", "note-b", 11)]);
    return { dir, paths };
  });
  const run = (dir: string) => extractCommand(parseCalibrationArgs(["extract", "--dir", dir, "--engine", "fake", "--db", dbPath]), () => {});
  for (const [index, { dir }] of copies.entries()) {
    expect(await run(dir)).toMatchObject({ calls: 1, written: 1, failed: 0 });
    expect(callRuns()).toBe(index + 1);
  }
  for (const { dir, paths } of copies) {
    rmSync(paths.extractions);
    expect(await run(dir)).toMatchObject({ calls: 1, written: 1, failed: 0 });
  }
  expect(callRuns()).toBe(2);
});
