import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, describe, expect, test } from "bun:test";
import {
  advisoryFingerprint,
  fullFlaggedLineAtRev,
  fullFlaggedLineFromPatch,
  isAdvisoryFinding,
  normalizeAdvisoryCode,
} from "./advisory-fingerprint.js";
import type { QaScanFinding } from "./scan-diff.js";

const orchestratorRoot = resolve(import.meta.dir, "../../../../../..");
const scanner = resolve(orchestratorRoot, "toolpacks/gamecube-decomp/source_editing/review_lint/api/scan_diff.py");
const repos: string[] = [];

afterEach(() => {
  for (const repo of repos.splice(0)) rmSync(repo, { recursive: true, force: true });
});

function run(cwd: string, command: string[]): string {
  const result = Bun.spawnSync(command, { cwd, stdout: "pipe", stderr: "pipe" });
  if (result.exitCode !== 0) throw new Error(result.stderr.toString());
  return result.stdout.toString();
}

/** A type-erasing cast line longer than the scanner's 240-character excerpt. */
const LONG_LINE = `    lbSnap_Apply((void*)&fighter->mv.ca.specialhi.${"segment_".repeat(30)}tail, 0x24);`;

function finding(overrides: Partial<QaScanFinding> = {}): QaScanFinding {
  return {
    rule_id: "type_erasing_cast",
    severity: "warning",
    file: "src/melee/lb/lbsnap.c",
    line: 12,
    excerpt: LONG_LINE.trim().slice(0, 240),
    message: "New type-erasing pointer cast.",
    standard_id: "global_standard:typed-fields-over-pointer-math",
    detail: { llm_review: true, cast: "void*" },
    ...overrides,
  };
}

function patch(file: string, hunks: Array<{ newStart: number; lines: string[] }>): string {
  const body = hunks.map(({ newStart, lines }) => {
    const oldCount = lines.filter((line) => !line.startsWith("+")).length;
    const newCount = lines.filter((line) => !line.startsWith("-")).length;
    return [`@@ -${newStart},${oldCount} +${newStart},${newCount} @@`, ...lines].join("\n");
  });
  return [`diff --git a/${file} b/${file}`, "index 1111111..2222222 100644", `--- a/${file}`, `+++ b/${file}`, ...body].join("\n");
}

describe("advisory fingerprint", () => {
  test("fingerprint ignores line shifts and surrounding edits, changes when any character of the full flagged line changes (incl. past character 240)", () => {
    const file = "src/melee/lb/lbsnap.c";
    const original = patch(file, [{ newStart: 10, lines: [" void lbSnap_8001DA5C(Fighter* fighter) {", "+    int unused;", "+" + LONG_LINE, " }"] }]);
    // Seven lines inserted above, a changed neighbour, and a second hunk elsewhere.
    const shifted = [
      patch(file, [
        { newStart: 2, lines: ["+#include \"a.h\"", "+#include \"b.h\""] },
        { newStart: 17, lines: [" void lbSnap_8001DA5C(Fighter* fighter) {", "-    int unused;", "+    s32 renamed = 0;", "+" + LONG_LINE, "+    renamed += 1;", " }"] },
      ]),
      patch("src/melee/lb/other.c", [{ newStart: 1, lines: ["+int other;"] }]),
    ].join("\n");
    const atOriginal = fullFlaggedLineFromPatch(original, file, 12, finding().excerpt);
    const atShifted = fullFlaggedLineFromPatch(shifted, file, 19, finding({ line: 19 }).excerpt);
    expect(atOriginal).toBe(LONG_LINE);
    expect(atShifted).toBe(LONG_LINE);

    const base = advisoryFingerprint(finding(), atOriginal!);
    expect(base).toMatch(/^af2:[0-9a-f]{64}$/);
    expect(advisoryFingerprint(finding({ line: 19, message: "Reworded." }), atShifted!)).toBe(base);
    expect(advisoryFingerprint(finding({ file: "./src//melee/lb/lbsnap.c" }), LONG_LINE)).toBe(base);
    expect(advisoryFingerprint(finding({ file: "src\\melee\\lb\\lbsnap.c" }), LONG_LINE)).toBe(base);
    expect(advisoryFingerprint(finding(), `\t${LONG_LINE.trim().replace(", 0x24", ",   0x24")}  `)).toBe(base);
    expect(advisoryFingerprint(finding({ detail: { cast: "void*", llm_review: true, note: { nested: 1 } } }), LONG_LINE)).toBe(base);

    for (const index of [4, 120, 239, 240, 250, LONG_LINE.length - 3]) {
      const edited = `${LONG_LINE.slice(0, index)}X${LONG_LINE.slice(index + 1)}`;
      expect(edited.trim().slice(0, 240) === LONG_LINE.trim().slice(0, 240)).toBe(index - 4 >= 240);
      expect(advisoryFingerprint(finding(), edited)).not.toBe(base);
    }
    expect(advisoryFingerprint(finding({ rule_id: "stack_slot_local" }), LONG_LINE)).not.toBe(base);
    expect(advisoryFingerprint(finding({ file: "src/melee/lb/other.c" }), LONG_LINE)).not.toBe(base);
    expect(advisoryFingerprint(finding({ detail: { llm_review: true, cast: "u8*" } }), LONG_LINE)).not.toBe(base);
  });

  test("full flagged line is read from the patch; a mismatch with the excerpt prefix is unreadable", () => {
    const file = "src/melee/lb/lbsnap.c";
    const text = [
      patch("src/melee/lb/other.c", [{ newStart: 12, lines: ["+int other_12;"] }]),
      patch(file, [
        { newStart: 10, lines: [" ctx_10();", "-removed();", "+added_11();", "+" + LONG_LINE, "\\ No newline at end of file"] },
      ]),
    ].join("\n");

    expect(fullFlaggedLineFromPatch(text, file, 12)).toBe(LONG_LINE);
    expect(fullFlaggedLineFromPatch(text, file, 12)!.length).toBeGreaterThan(240);
    expect(fullFlaggedLineFromPatch(text, file, 12, finding().excerpt)).toBe(LONG_LINE);
    expect(fullFlaggedLineFromPatch(text, file, 11)).toBe("added_11();");
    expect(fullFlaggedLineFromPatch(text, "src/melee/lb/other.c", 12)).toBe("int other_12;");
    // Context lines, lines past the hunk, and unknown files are not flagged added lines.
    expect(fullFlaggedLineFromPatch(text, file, 10)).toBeNull();
    expect(fullFlaggedLineFromPatch(text, file, 13)).toBeNull();
    expect(fullFlaggedLineFromPatch(text, "src/melee/lb/missing.c", 12)).toBeNull();
    // The excerpt must be a prefix of the full line, both trimmed.
    expect(fullFlaggedLineFromPatch(text, file, 12, "lbSnap_Apply((u8*)")).toBeNull();
    expect(fullFlaggedLineFromPatch(text, file, 11, finding().excerpt)).toBeNull();
    expect(fullFlaggedLineFromPatch(text, file, 12, `  ${LONG_LINE.trim().slice(0, 60)}  `)).toBe(LONG_LINE);
    expect(normalizeAdvisoryCode(LONG_LINE)).toBe(LONG_LINE.trim());
  });

  test("patch line numbers agree with the scanner's own findings", () => {
    const repo = mkdtempSync(resolve(tmpdir(), "qa-advisory-fingerprint-"));
    repos.push(repo);
    const standardsDir = resolve(repo, "standards", "typed_access_and_pointer_math");
    mkdirSync(standardsDir, { recursive: true });
    writeFileSync(resolve(standardsDir, "slice.json"), JSON.stringify({
      family: "typed_access_and_pointer_math",
      rules: [{ rule_id: "type_erasing_cast", severity: "warning", standard_id: null, llm_review: true, applies_to: ["src/**/*.c"] }],
    }));
    writeFileSync(resolve(standardsDir, "rules.py"), `
def check_type_erasing_cast(hunk):
    return [{"line": line, "excerpt": text.strip(), "detail": {"cast": "void*"}}
            for line, text in hunk["added"] if "(void*)" in text]
RULES = [{"rule_id": "type_erasing_cast", "severity": "warning", "standard_id": None, "llm_review": True,
          "message": "New type-erasing pointer cast.", "applies_to": ["src/**/*.c"], "check": check_type_erasing_cast}]
`);
    mkdirSync(resolve(repo, "src/lb"), { recursive: true });
    run(repo, ["git", "init", "-q"]);
    run(repo, ["git", "config", "user.email", "qa@example.test"]);
    run(repo, ["git", "config", "user.name", "QA Test"]);
    const before = Array.from({ length: 30 }, (_, index) => `int keep_${index};`);
    writeFileSync(resolve(repo, "src/lb/lbsnap.c"), `${before.join("\n")}\n`);
    run(repo, ["git", "add", "."]);
    run(repo, ["git", "commit", "-qm", "base"]);
    const base = run(repo, ["git", "rev-parse", "HEAD"]).trim();
    const after = [...before];
    after.splice(3, 0, "int added_a;", LONG_LINE);
    after.splice(20, 1, `    other((void*)p);`);
    writeFileSync(resolve(repo, "src/lb/lbsnap.c"), `${after.join("\n")}\n`);
    run(repo, ["git", "commit", "-qam", "head"]);

    const scanned = Bun.spawnSync(["python3", scanner, "--repo", repo, "--base", base, "--json"], {
      cwd: repo, stdout: "pipe", stderr: "pipe", env: { ...process.env, REVIEW_LINT_STANDARDS_DIR: resolve(repo, "standards") },
    });
    const findings = (JSON.parse(scanned.stdout.toString()) as { findings: QaScanFinding[] }).findings
      .filter((item) => item.rule_id === "type_erasing_cast");
    expect(findings.map((item) => [item.line, isAdvisoryFinding(item)])).toEqual([[5, true], [21, true]]);
    expect(findings[0]!.excerpt.length).toBe(240);
    const diff = run(repo, ["git", "diff", base, "HEAD"]);
    expect(findings.map((item) => fullFlaggedLineFromPatch(diff, item.file, item.line, item.excerpt))).toEqual([
      LONG_LINE,
      "    other((void*)p);",
    ]);
  });

  test("full flagged line at a revision comes from git show; a missing file or excerpt mismatch is unreadable", async () => {
    const repo = mkdtempSync(resolve(tmpdir(), "qa-advisory-rev-"));
    repos.push(repo);
    run(repo, ["git", "init", "-q"]);
    run(repo, ["git", "config", "user.email", "qa@example.test"]);
    run(repo, ["git", "config", "user.name", "QA Test"]);
    mkdirSync(resolve(repo, "src"), { recursive: true });
    writeFileSync(resolve(repo, "src/lbsnap.c"), `int first;\n${LONG_LINE}\n`);
    run(repo, ["git", "add", "."]);
    run(repo, ["git", "commit", "-qm", "base"]);
    const rev = run(repo, ["git", "rev-parse", "HEAD"]).trim();
    writeFileSync(resolve(repo, "src/lbsnap.c"), "int rewritten_in_worktree;\n");

    expect(await fullFlaggedLineAtRev(repo, rev, "./src/lbsnap.c", 2, finding().excerpt)).toBe(LONG_LINE);
    expect(await fullFlaggedLineAtRev(repo, rev, "src/lbsnap.c", 1)).toBe("int first;");
    expect(await fullFlaggedLineAtRev(repo, rev, "src/lbsnap.c", 1, finding().excerpt)).toBeNull();
    expect(await fullFlaggedLineAtRev(repo, rev, "src/lbsnap.c", 9)).toBeNull();
    expect(await fullFlaggedLineAtRev(repo, rev, "src/missing.c", 1)).toBeNull();
  });

  test("only llm_review warnings and infos are advisories", () => {
    expect(isAdvisoryFinding(finding())).toBe(true);
    expect(isAdvisoryFinding(finding({ severity: "info" }))).toBe(true);
    expect(isAdvisoryFinding(finding({ severity: "error" }))).toBe(false);
    expect(isAdvisoryFinding(finding({ detail: { cast: "void*" } }))).toBe(false);
    expect(isAdvisoryFinding(finding({ detail: undefined }))).toBe(false);
  });
});
