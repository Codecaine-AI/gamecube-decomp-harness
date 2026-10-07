import { describe, expect, test } from "bun:test";

import { DETERMINISTIC_FINDING, INFO_FINDING, PATCH, SOURCE_PATH, WARNING_FINDING } from "./__fixtures__/feed-fixture.js";
import {
  boundedHunks,
  boundedNote,
  canonicalJson,
  changedSources,
  HUNK_LINE_LIMIT,
  HUNKS_BYTE_LIMIT,
  NOTE_CHAR_LIMIT,
  patchHunks,
  runnerSummaryAdvisories,
  type SourceDigests,
} from "./sources.js";

const OTHER_PATH = "src/melee/lb/lbcollision.c";

function bytes(text: string): number {
  return Buffer.byteLength(text, "utf8");
}

/** One file's diff header followed by its hunks. */
function fileDiff(path: string, hunks: string[][]): string[] {
  return [`diff --git a/${path} b/${path}`, `--- a/${path}`, `+++ b/${path}`, ...hunks.flat()];
}

/** A hunk that adds `count` lines starting at new-file line `start`. */
function addedHunk(start: number, count: number, line: (index: number) => string): string[] {
  return [`@@ -${start},0 +${start},${count} @@`, ...Array.from({ length: count }, (_, index) => `+${line(index)}`)];
}

describe("canonicalJson", () => {
  test("sorts keys at every level and is stable across key order", () => {
    const one = { b: 1, a: { d: [{ z: 1, y: 2 }], c: "x" } };
    const two = { a: { c: "x", d: [{ y: 2, z: 1 }] }, b: 1 };
    expect(canonicalJson(one)).toBe('{"a":{"c":"x","d":[{"y":2,"z":1}]},"b":1}');
    expect(canonicalJson(two)).toBe(canonicalJson(one));
    // Array order is meaning, not formatting: it is kept.
    expect(canonicalJson([2, 1])).not.toBe(canonicalJson([1, 2]));
  });
});

describe("runnerSummaryAdvisories", () => {
  const summary = (findings: unknown[]): Record<string, unknown> => ({
    status: "passed",
    qaLint: { status: "warnings", exitCode: 2, findings, scanPath: null, toolError: null },
  });

  test("returns every llm_review finding, warning and info, and drops the rest", () => {
    const llmReviewError = { ...WARNING_FINDING, severity: "error" as const, line: 12 };
    const reviewOff = { ...WARNING_FINDING, line: 14, detail: { llm_review: false } };
    expect(runnerSummaryAdvisories(summary([WARNING_FINDING, DETERMINISTIC_FINDING, INFO_FINDING, llmReviewError, reviewOff])))
      .toEqual([WARNING_FINDING, INFO_FINDING]);
  });

  test("a summary without a QA scan has no advisories", () => {
    expect(runnerSummaryAdvisories({ status: "passed", qaLint: null })).toEqual([]);
    expect(runnerSummaryAdvisories({ status: "passed" })).toEqual([]);
  });

  test("a summary that is not an object, or a malformed finding, is null", () => {
    expect(runnerSummaryAdvisories(null)).toBeNull();
    expect(runnerSummaryAdvisories("passed")).toBeNull();
    expect(runnerSummaryAdvisories([WARNING_FINDING])).toBeNull();
    expect(runnerSummaryAdvisories({ qaLint: { findings: "none" } })).toBeNull();
    expect(runnerSummaryAdvisories(summary([WARNING_FINDING, { ...INFO_FINDING, line: "13" }]))).toBeNull();
    const { message: _message, ...withoutMessage } = WARNING_FINDING;
    expect(runnerSummaryAdvisories(summary([withoutMessage]))).toBeNull();
  });
});

describe("boundedNote", () => {
  test("a note within the limit is unchanged", () => {
    expect(boundedNote("Matched lbSnap_8001DA5C.")).toBe("Matched lbSnap_8001DA5C.");
    const atLimit = "n".repeat(NOTE_CHAR_LIMIT);
    expect(boundedNote(atLimit)).toBe(atLimit);
  });

  test("a 30,000-character note keeps its head and its tail within 12,000 characters", () => {
    const head = "Matched lbSnap_8001DA5C by hoisting the loop bound.\n";
    const tail = "\nkept_advisories:\n- rule_id: type_erasing_cast, line 11: MWCC loads through r13.\nstatus: matched\n";
    const note = `${head}${"h".repeat(9_000)}${"~".repeat(30_000 - head.length - tail.length - 18_000)}${"t".repeat(9_000)}${tail}`;
    expect(note).toHaveLength(30_000);

    const bounded = boundedNote(note);
    expect(bounded.length).toBeLessThanOrEqual(12_000);
    expect(bounded.startsWith(`${head}hhh`)).toBe(true);
    expect(bounded.endsWith(`ttt${tail}`)).toBe(true);
    // Only the middle is dropped, and the marker counts exactly what was dropped.
    expect(bounded).not.toContain("~");
    const marker = /\n\[… (\d+) characters omitted …\]\n/.exec(bounded);
    expect(marker).not.toBeNull();
    expect(bounded.length - marker![0].length + Number(marker![1])).toBe(note.length);
  });
});

describe("patchHunks", () => {
  test("splits a two-file patch into hunks per file", () => {
    const patch = [
      ...fileDiff(SOURCE_PATH, [
        ["@@ -1,2 +1,3 @@", " int a;", "+int b;", " int c;"],
        ["@@ -20,2 +21,2 @@", "-    x = 1;", "+    x = 2;", " }"],
      ]),
      ...fileDiff(OTHER_PATH, [["@@ -5 +5 @@", "-old", "+new"]]),
      "",
    ].join("\n");
    expect(patchHunks(patch)).toEqual([
      { file: SOURCE_PATH, lines: ["@@ -1,2 +1,3 @@", " int a;", "+int b;", " int c;"] },
      { file: SOURCE_PATH, lines: ["@@ -20,2 +21,2 @@", "-    x = 1;", "+    x = 2;", " }"] },
      { file: OTHER_PATH, lines: ["@@ -5 +5 @@", "-old", "+new"] },
    ]);
  });

  test("a removed line that starts with `--- ` stays inside its hunk and does not change the file", () => {
    // The removed line's content is "-- i;", so the diff line reads "--- i;"; the added "++ i;" reads "+++ i;".
    const first = ["@@ -1,3 +1,3 @@", " int a;", "--- i;", "+++ i;", " int b;"];
    const second = ["@@ -10,2 +10,3 @@", " x;", "+y;", " z;"];
    const patch = [...fileDiff(SOURCE_PATH, [first, second]), ...fileDiff(OTHER_PATH, [["@@ -5 +5 @@", "-old", "+new"]])].join("\n");
    expect(patchHunks(patch)).toEqual([
      { file: SOURCE_PATH, lines: first },
      { file: SOURCE_PATH, lines: second },
      { file: OTHER_PATH, lines: ["@@ -5 +5 @@", "-old", "+new"] },
    ]);
  });
});

describe("boundedHunks", () => {
  test("an under-limit patch comes back whole", () => {
    const hunk = PATCH.split("\n").slice(3, 10);
    expect(boundedHunks(PATCH, SOURCE_PATH)).toEqual({ hunks: [[SOURCE_PATH, ...hunk].join("\n")], truncated: false });
  });

  test("a 300-line hunk is cut to 120 lines with a more-lines marker", () => {
    const patch = fileDiff(SOURCE_PATH, [addedHunk(1, 300, (index) => `    table[${index}] = ${index};`)]).join("\n");
    const result = boundedHunks(patch, SOURCE_PATH);
    expect(result.truncated).toBe(true);
    expect(result.hunks).toHaveLength(1);
    const lines = result.hunks[0]!.split("\n");
    expect(lines).toHaveLength(HUNK_LINE_LIMIT);
    expect(lines[0]).toBe(SOURCE_PATH);
    expect(lines[1]).toBe("@@ -1,0 +1,300 @@");
    // 302 rendered lines (file, header, 300 body): 119 kept, 183 counted by the marker.
    expect(lines[HUNK_LINE_LIMIT - 1]).toBe("[… 183 more lines]");
  });

  test("many large hunks stay within 16 KB in total, each within 120 lines", () => {
    // Multi-byte text, so the bound is checked in bytes rather than characters.
    const hunks = Array.from({ length: 30 }, (_, hunk) =>
      addedHunk(1 + hunk * 200, 150, (index) => `    évaluer(${hunk}, ${index}); // ré-essai — ${"é".repeat(40)}`));
    const result = boundedHunks(fileDiff(SOURCE_PATH, hunks).join("\n"), SOURCE_PATH);
    expect(result.truncated).toBe(true);
    expect(result.hunks.length).toBeGreaterThan(0);
    expect(bytes(result.hunks.join("\n"))).toBeLessThanOrEqual(HUNKS_BYTE_LIMIT);
    expect(HUNKS_BYTE_LIMIT).toBe(16_384);
    for (const hunk of result.hunks) expect(hunk.split("\n").length).toBeLessThanOrEqual(HUNK_LINE_LIMIT);
  });

  test("hunks of the preferred file come first and survive the byte budget", () => {
    const large = Array.from({ length: 12 }, (_, hunk) =>
      addedHunk(1 + hunk * 200, 100, (index) => `    other_${hunk}_${index} = lbl_804D${String(index).padStart(4, "0")};`));
    const target = addedHunk(10, 1, () => "    templates_800[0] = *(char**) &lbl_804DA6C4;");
    const patch = [...fileDiff(OTHER_PATH, large), ...fileDiff(SOURCE_PATH, [target])].join("\n");

    const preferred = boundedHunks(patch, `./${SOURCE_PATH}`);
    expect(preferred.truncated).toBe(true);
    expect(preferred.hunks[0]).toBe([SOURCE_PATH, ...target].join("\n"));
    expect(preferred.hunks.slice(1).every((hunk) => hunk.startsWith(`${OTHER_PATH}\n`))).toBe(true);

    // Without a preference the target's hunk comes last and falls outside the budget.
    const unordered = boundedHunks(patch);
    expect(unordered.hunks.some((hunk) => hunk.startsWith(`${SOURCE_PATH}\n`))).toBe(false);
  });
});

describe("changedSources", () => {
  const before: SourceDigests = {
    note_sha256: "1".repeat(64),
    agent_note_sha256: "2".repeat(64),
    patch_sha256: "3".repeat(64),
    runner_summary_sha256: "4".repeat(64),
    report_changes_sha256: "5".repeat(64),
    adjudication_sha256: null,
  };

  test("lists exactly the digests that differ", () => {
    expect(changedSources(before, { ...before })).toEqual([]);
    expect(changedSources(before, { ...before, patch_sha256: "6".repeat(64), adjudication_sha256: "7".repeat(64) }))
      .toEqual(["patch_sha256", "adjudication_sha256"]);
    expect(changedSources(before, { ...before, agent_note_sha256: null })).toEqual(["agent_note_sha256"]);
  });
});
