import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { extractHunk } from "@server/core/agent-catalog/agents/running/worker/advisory-adjudication/hunks.js";
import { advisoryFingerprint, fullFlaggedLineFromPatch } from "@server/core/validation/qa/advisory-fingerprint.js";

import { parseCalibrationArgs } from "./args.js";
import { buildDatasetCommand, calibrationItemId } from "./build-dataset.js";
import { createHistoryTree, FIXTURE_CASES, FIXTURE_TOKEN, JEV_MODEL, type HistoryTree } from "./__fixtures__/history-tree.js";
import { shadowExportCommand } from "./shadow-export.js";
import { baseGroupKey } from "./groups.js";
import { LEGACY_HARNESS_ROOT, openSqliteReadOnly } from "./source-root.js";
import { calibrationPaths, readJson, readJsonl, sha256Hex, writeJsonl } from "./store.js";
import type { CalibrationItem, ExtractionRecord, NoteRecord, ProbabilityRow } from "./types.js";

const realFetch = globalThis.fetch;
const cleanups: Array<() => void> = [];

beforeAll(() => {
  globalThis.fetch = (() => {
    throw new Error("network disabled in advisory-calibration tests");
  }) as unknown as typeof fetch;
});

afterAll(() => {
  globalThis.fetch = realFetch;
});

afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});

function tree(): HistoryTree {
  const created = createHistoryTree();
  cleanups.push(created.cleanup);
  return created;
}

function outDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "advisory-calibration-out-"));
  cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

const quiet = () => {};

function argsFor(command: string, root: string, dir: string) {
  return parseCalibrationArgs([command, "--source-root", root, "--game", "melee", "--dir", dir]);
}

const buildDataset = (root: string, dir: string) => buildDatasetCommand(argsFor("build-dataset", root, dir), quiet);
const shadowExport = (root: string, dir: string) => shadowExportCommand(argsFor("shadow-export", root, dir), quiet);

describe("advisory-calibration history datasets", () => {
  test("build-dataset on a fixture runs tree finds advisory findings, joins notes and hunks, dedupes by fingerprint and checkpoint", async () => {
    const history = tree();
    const dir = outDir();
    const paths = calibrationPaths(dir);
    // A shadow row survives the rebuild; a stale history row does not.
    const shadowRow = { id: "adv-shadow-kept", source: "shadow", note_key: null } as unknown as CalibrationItem;
    const staleRow = { id: "adv-stale-history", source: "history", note_key: null } as unknown as CalibrationItem;
    writeJsonl(paths.candidates, [staleRow, shadowRow]);

    await buildDataset(history.root, dir);

    const all = readJsonl<CalibrationItem>(paths.candidates);
    expect(all.map((item) => item.id)).toEqual([...all.map((item) => item.id)].sort());
    expect(all.some((item) => item.id === shadowRow.id)).toBe(true);
    expect(all.some((item) => item.id === staleRow.id)).toBe(false);
    const items = all.filter((item) => item.source === "history");
    expect(items).toHaveLength(8);
    expect(items.every((item) => item.schema === "advisory_calibration_item_v1" && item.synthetic === false)).toBe(true);
    const notes = new Map(readJsonl<NoteRecord>(paths.notes).map((note) => [note.key, note]));
    const of = (workerStateId: string, attempt: number) =>
      items.filter((item) => item.worker_state_id === workerStateId && item.attempt_index === attempt);

    // The four casts: one item each, joined to checkpoint, note and hunk.
    const casts = FIXTURE_CASES.casts;
    const castItems = of(casts.workerStateId, casts.attempt).sort((a, b) => a.finding.line - b.finding.line);
    expect(castItems.map((item) => item.finding.line)).toEqual([1869, 1870, 1871, 1872]);
    for (const [index, item] of castItems.entries()) {
      const finding = history.findings[index]!;
      const fullLine = fullFlaggedLineFromPatch(history.patchText, finding.file, finding.line, finding.excerpt)!;
      expect(item.full_line).toBe(`    ${finding.excerpt}`);
      expect(item.fingerprint).toBe(advisoryFingerprint(finding, fullLine));
      expect(item.id).toBe(calibrationItemId(item.fingerprint, casts.checkpointId));
      expect(item).toMatchObject({
        source: "history",
        checkpoint_id: casts.checkpointId,
        run_id: casts.runId,
        target_key: casts.targetKey,
        note_key: casts.checkpointId,
        code_facts: { exact: true, old_score: 88.12381, new_score: 100 },
        group_key: baseGroupKey(casts.targetKey, "type_erasing_cast", fullLine),
        finding: {
          rule_id: "type_erasing_cast",
          severity: "warning",
          standard_id: "global_standard:typed-fields-over-pointer-math",
          file: "src/melee/gm/gmtoulib.c",
          line: finding.line,
          excerpt: finding.excerpt,
          message: finding.message,
          detail: { cast: "(char**)", llm_review: true },
        },
      });
      expect(item.hunk).toBe(extractHunk(history.patchText, finding.file, finding.line));
      expect(item.hunk).toContain(`+${fullLine}`);
    }
    const castNote = notes.get(casts.checkpointId)!;
    expect(castNote).toMatchObject({ checkpoint_id: casts.checkpointId, worker_state_id: casts.workerStateId, attempt_index: 2, source: "agent_output" });
    expect(castNote.sha256).toBe(sha256Hex(castNote.text));
    expect(castNote.text).toContain("review_justification");
    expect(castNote.text).toContain(`<source-root>/games/melee/state/runs/${casts.runId}/`);
    expect(castNote.text).toContain("<redacted:token>");
    expect(castNote.text).not.toContain(FIXTURE_TOKEN);
    expect(castNote.text).not.toContain(LEGACY_HARNESS_ROOT.slice(0, -1));

    // The edited line: read through the raw patch's absolute headers, note from agent_note.
    const edited = FIXTURE_CASES.edited;
    const [editedItem] = of(edited.workerStateId, edited.attempt);
    expect(editedItem).toMatchObject({ checkpoint_id: edited.checkpointId, full_line: edited.line, note_key: edited.checkpointId });
    expect(editedItem!.hunk).toStartWith("@@ -1866,10 +1866,10 @@ void fn_8018F00C(char* dest, s32 slot_id)");
    expect(editedItem!.hunk).toContain(`+${edited.line}`);
    expect(notes.get(edited.checkpointId)!.source).toBe("agent_note");

    // The same line twice in one checkpoint is one item, found through the (worker state, attempt) fallback.
    const other = FIXTURE_CASES.otherWorker;
    const otherItems = of(other.workerStateId, other.attempt);
    expect(otherItems).toHaveLength(1);
    expect(otherItems[0]).toMatchObject({ checkpoint_id: other.checkpointId, note_key: other.checkpointId, target_key: other.targetKey });
    expect(otherItems[0]!.fingerprint).toBe(castItems[0]!.fingerprint);
    expect(otherItems[0]!.group_key).toBe(castItems[0]!.group_key);
    expect(otherItems[0]!.id).not.toBe(castItems[0]!.id);
    // The final-message file is missing, so the note is the checkpoint's agent_note.
    expect(notes.get(other.checkpointId)!.source).toBe("agent_note");

    // No checkpoint row: keyed by worker state and attempt, code facts from the summary, no note.
    const unmatched = FIXTURE_CASES.unmatched;
    const unmatchedItems = of(unmatched.workerStateId, unmatched.attempt);
    expect(unmatchedItems).toHaveLength(1);
    expect(unmatchedItems[0]).toMatchObject({
      checkpoint_id: null,
      note_key: null,
      code_facts: { exact: false, old_score: 88.12381, new_score: 99.5 },
    });
    expect(unmatchedItems[0]!.id).toBe(calibrationItemId(unmatchedItems[0]!.fingerprint, `${unmatched.workerStateId}:${unmatched.attempt}`));

    const unrelated = FIXTURE_CASES.unrelated;
    expect(of(unrelated.workerStateId, unrelated.attempt)[0]).toMatchObject({
      target_key: unrelated.targetKey,
      full_line: "    GXColor sp114;",
      finding: { rule_id: "m2c_residue_names", detail: { kind: "stack_slot_name", llm_review: true, name: "sp114" } },
    });
    expect(notes.get(unrelated.checkpointId)!.source).toBe("agent_output");
    expect(of(FIXTURE_CASES.noAdvisories.workerStateId, FIXTURE_CASES.noAdvisories.attempt)).toEqual([]);
    expect([...notes.keys()].sort()).toEqual([casts.checkpointId, edited.checkpointId, other.checkpointId, unrelated.checkpointId].sort());

    const manifest = readJson<Record<string, unknown>>(paths.manifest)!;
    expect(manifest).toMatchObject({
      schema: "advisory_calibration_manifest_v1",
      game: "melee",
      source_root: "<source-root>",
      counts: {
        summaries_scanned: 6,
        summaries_with_advisories: 5,
        summaries_unparseable: 0,
        findings: 10,
        unreadable_lines: 1,
        items: 8,
        checkpoints_matched: 4,
        checkpoints_unmatched: 1,
        notes: 4,
      },
    });
    for (const file of [paths.manifest, paths.candidates, paths.notes]) {
      const text = readFileSync(file, "utf8");
      expect(text).not.toContain(history.root);
      expect(text).not.toContain(LEGACY_HARNESS_ROOT.slice(0, -1));
    }

    // A rebuild is byte-identical apart from the manifest timestamp.
    const before = readFileSync(paths.candidates, "utf8");
    await buildDataset(history.root, dir);
    expect(readFileSync(paths.candidates, "utf8")).toBe(before);
  });

  test("shadow-export reads adjudications, writes shadow items, extractions and a replay run file", async () => {
    const history = tree();
    const dir = outDir();
    const paths = calibrationPaths(dir);
    await buildDataset(history.root, dir);
    const result = await shadowExport(history.root, dir);

    const shadow = FIXTURE_CASES.shadow;
    const all = readJsonl<CalibrationItem>(paths.candidates);
    expect(all.filter((item) => item.source === "history")).toHaveLength(8);
    const items = all.filter((item) => item.source === "shadow").sort((a, b) => a.finding.line - b.finding.line);
    // Five adjudicated advisories; the one with an unreadable line has no fingerprint.
    expect(items.map((item) => item.finding.line)).toEqual([124, 125, 126, 127]);
    const store = openSqliteReadOnly(history.paths.orchestratorDb);
    const metadata = JSON.parse(
      store.db.query<{ metadata_json: string }, [string]>("SELECT metadata_json FROM worker_checkpoints WHERE id = ?").get(shadow.checkpointId)!.metadata_json,
    ) as { llm_review_adjudication: { advisories: Array<{ fingerprint: string | null; line: number; hunk: string | null }> } };
    store.close();
    for (const item of items) {
      const advisory = metadata.llm_review_adjudication.advisories.find((entry) => entry.line === item.finding.line)!;
      expect(item.fingerprint).toBe(advisory.fingerprint!);
      expect(item.id).toBe(calibrationItemId(advisory.fingerprint!, shadow.checkpointId));
      expect(item.hunk).toBe(advisory.hunk);
      expect(item).toMatchObject({
        synthetic: false,
        checkpoint_id: shadow.checkpointId,
        run_id: shadow.runId,
        worker_state_id: shadow.workerStateId,
        attempt_index: 2,
        target_key: shadow.targetKey,
        note_key: shadow.checkpointId,
        code_facts: { exact: true, old_score: 91.2, new_score: 100 },
        group_key: baseGroupKey(shadow.targetKey, item.finding.rule_id, item.full_line),
      });
    }
    // Message and detail come from the worker's candidate finding; the full line from the attempt patch.
    expect(items[1]).toMatchObject({
      full_line: "    ip->x40_vel.x = *(f32*) &lbl_804D8A10;",
      finding: { rule_id: "type_erasing_cast", severity: "warning", detail: { cast: "(f32*)", llm_review: true } },
    });
    expect(items[1]!.finding.message).toContain("`(f32*)`");
    expect(items[3]!.finding).toMatchObject({ rule_id: "m2c_residue_names", severity: "info" });

    const note = readJsonl<NoteRecord>(paths.notes).find((entry) => entry.key === shadow.checkpointId)!;
    expect(note.source).toBe("agent_output");
    expect(note.text).toContain("<source-root>/games/melee/runtime/state/runs/");
    expect(note.text).not.toContain(history.root);

    const extractions = readJsonl<ExtractionRecord>(paths.extractions);
    expect(extractions.map((record) => record.id).sort()).toEqual(items.map((item) => item.id).sort());
    for (const record of extractions) {
      expect(record).toMatchObject({ source: "shadow", structured_field_used: true, run_id: "extract-run-1" });
      expect(record.justification ?? "").not.toContain(history.root);
    }
    const castExtraction = extractions.find((record) => record.id === items[1]!.id)!;
    expect(castExtraction).toMatchObject({ kept: true, evidence: ["itCoin_80281A64: PASS (100.00000%)"] });
    expect(castExtraction.justification).toContain("<source-root>/");
    expect(extractions.find((record) => record.id === items[3]!.id)).toMatchObject({ justification: null, kept: false, evidence: [] });

    // One replay run file for the served model: every decided warning, info excluded.
    const modelDir = join(paths.runs, ...JEV_MODEL.split("/"));
    const files = readdirSync(modelDir);
    expect(files).toHaveLength(1);
    expect(files[0]).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}Z\.shadow\.jsonl$/);
    expect(result.runFiles).toEqual([join(modelDir, files[0]!)]);
    const rows = new Map(readJsonl<ProbabilityRow>(join(modelDir, files[0]!)).map((row) => [row.id, row]));
    expect(rows.size).toBe(3);
    expect(rows.get(items[0]!.id)).toEqual({ id: items[0]!.id, probability: null, served_model: JEV_MODEL, abstain_reason: "engine-error" });
    expect(rows.get(items[1]!.id)).toEqual({ id: items[1]!.id, probability: 0.91, served_model: JEV_MODEL });
    expect(rows.get(items[2]!.id)).toEqual({ id: items[2]!.id, probability: 0.52, served_model: JEV_MODEL, abstain_reason: "low-confidence" });

    // Idempotent: a second export appends no extraction and keeps one item per id.
    const again = await shadowExport(history.root, dir);
    expect(again.appendedExtractions).toBe(0);
    expect(readJsonl<ExtractionRecord>(paths.extractions)).toHaveLength(4);
    expect(readJsonl<CalibrationItem>(paths.candidates)).toHaveLength(12);
    // A history rebuild keeps the shadow rows.
    await buildDataset(history.root, dir);
    expect(readJsonl<CalibrationItem>(paths.candidates).filter((item) => item.source === "shadow")).toHaveLength(4);
  });

  test("every exported finding field is scrubbed, identity kept from the original evidence (F14)", async () => {
    const history = tree();
    const token = "Bearer abcdefgh-tail-private";
    // History: a summary finding with a token in its message and in detail keys and array values.
    const summary = JSON.parse(readFileSync(history.paths.summary, "utf8"));
    const original = summary.qaLint.findings[0];
    summary.qaLint.findings[0] = { ...original, message: `${original.message} ${token}`, detail: { ...original.detail, [token]: [token, "sk-abcdefgh-zzz"] } };
    writeFileSync(history.paths.summary, JSON.stringify(summary, null, 2));
    // Shadow: an adjudicated advisory whose excerpt (and so full_line) and candidate finding carry the token.
    const db = new Database(history.paths.orchestratorDb);
    try {
      const row = db.query("SELECT metadata_json FROM worker_checkpoints WHERE id = ?").get(FIXTURE_CASES.shadow.checkpointId) as { metadata_json: string };
      const metadata = JSON.parse(row.metadata_json);
      const advisory = metadata.llm_review_adjudication.advisories[0];
      advisory.excerpt = `x = 1; // ${token}`;
      advisory.line = 9999;
      for (const entry of metadata.llm_review_candidate.advisories) {
        if (entry.finding.rule_id === advisory.rule_id && entry.finding.file === advisory.file) {
          entry.finding = { ...entry.finding, line: 9999, excerpt: advisory.excerpt, message: `rule ${token}`, detail: { ...entry.finding.detail, [token]: [token] } };
        }
      }
      db.run("UPDATE worker_checkpoints SET metadata_json = ? WHERE id = ?", [JSON.stringify(metadata), FIXTURE_CASES.shadow.checkpointId]);
    } finally {
      db.close();
    }
    const saved = process.env.LONG_TOKEN;
    process.env.LONG_TOKEN = "abcdefgh";
    try {
      const dir = outDir();
      await buildDataset(history.root, dir);
      await shadowExport(history.root, dir);
      const written = readdirSync(dir, { recursive: true })
        .map((name) => join(dir, String(name)))
        .filter((path) => path.endsWith(".json") || path.endsWith(".jsonl"))
        .map((path) => readFileSync(path, "utf8"))
        .join("\n");
      for (const leaked of ["abcdefgh", "tail-private", "sk-abcdefgh"]) expect(written).not.toContain(leaked);
      const items = readJsonl<CalibrationItem>(calibrationPaths(dir).candidates);
      const history0 = items.find((item) => item.source === "history" && item.finding.message.endsWith("<redacted:token>"))!;
      expect(history0.finding.detail).toMatchObject({ "<redacted:token>": ["<redacted:token>", "<redacted:token>"] });
      // The id and fingerprint were computed from the original finding, then the fields were scrubbed.
      expect(history0.fingerprint).toBe(advisoryFingerprint(summary.qaLint.findings[0], history0.full_line));
      const shadow0 = items.find((item) => item.source === "shadow" && item.full_line.includes("<redacted:token>"))!;
      expect(shadow0.finding.excerpt).toBe("x = 1; // <redacted:token>");
      expect(shadow0.finding.message).toBe("rule <redacted:token>");
    } finally {
      if (saved === undefined) delete process.env.LONG_TOKEN;
      else process.env.LONG_TOKEN = saved;
    }
  });
});
