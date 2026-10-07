import { describe, expect, test } from "bun:test";
import { extractHunk } from "./hunks.js";

const FILE = "src/melee/lb/lbsnap.c";
const FLAGGED = "+    lbSnap_Apply((void*)&fighter->mv, 0x24);";

function fileDiff(path: string, body: string[]): string[] {
  return [`diff --git a/${path} b/${path}`, "index 1111111..2222222 100644", `--- a/${path}`, `+++ b/${path}`, ...body];
}

// other.c adds a line at new line 17 too; lbsnap.c has a long first hunk
// (new lines 10-23), a one-line addition (new line 42) and a deletion-only
// hunk; after.c follows.
const PATCH =
  [
    ...fileDiff("src/melee/ft/other.c", [
      "@@ -15,4 +15,5 @@ void other(void)",
      " int a;",
      " int b;",
      "+int other_added;",
      " int c;",
      " int d;",
    ]),
    ...fileDiff(FILE, [
      "@@ -10,13 +10,14 @@ void lbSnap_8001DA5C(Fighter* fighter)",
      "     s32 i;", // old 10, new 10
      "     s32 j;", // old 11, new 11
      "     s32 k;", // old 12, new 12
      "-    int unused;", // old 13
      "+    s32 count = 0;", // new 13
      "     for (i = 0; i < 4; i++) {", // old 14, new 14
      "         count += i;", // old 15, new 15
      "     }", // old 16, new 16
      FLAGGED, // new 17
      "     j = count;", // old 17, new 18
      "-    k = 0;", // old 18
      "+    k = j;", // new 19
      "     if (k) {", // old 19, new 20
      "         j++;", // old 20, new 21
      "     }", // old 21, new 22
      "     return;", // old 22, new 23
      "@@ -40,3 +41,4 @@ void lbSnap_8001DB00(void)",
      "     void* p;", // old 40, new 41
      "+    p = (void*)0x80001234;", // new 42
      "     p = 0;", // old 41, new 43
      "     return;", // old 42, new 44
      "@@ -60,2 +61,0 @@ void lbSnap_8001DC00(void)",
      "-    unusedA();",
      "-    unusedB();",
    ]),
    ...fileDiff("src/melee/lb/after.c", ["@@ -1,2 +1,3 @@", " int x;", "+int after_added;", " int y;"]),
  ].join("\n") + "\n";

/** Parses an extracted hunk and checks that its header counts describe its body. */
function parseExcerpt(text: string): { header: string; body: string[]; oldCount: number; newCount: number } {
  const [header, ...body] = text.split("\n");
  const match = /^@@ -\d+,(\d+) \+\d+,(\d+) @@/.exec(header!);
  expect(match).not.toBeNull();
  const counted = body.filter((line) => !line.startsWith("\\"));
  expect(counted.filter((line) => !line.startsWith("+")).length).toBe(Number(match![1]));
  expect(counted.filter((line) => !line.startsWith("-")).length).toBe(Number(match![2]));
  return { header: header!, body, oldCount: Number(match![1]), newCount: Number(match![2]) };
}

describe("extractHunk", () => {
  test("cuts the flagged added line's hunk to six lines each side, with a header recomputed for the cut", () => {
    const excerpt = extractHunk(PATCH, FILE, 17)!;
    expect(excerpt).toBe(
      [
        "@@ -12,10 +12,11 @@ void lbSnap_8001DA5C(Fighter* fighter)",
        "     s32 k;",
        "-    int unused;",
        "+    s32 count = 0;",
        "     for (i = 0; i < 4; i++) {",
        "         count += i;",
        "     }",
        FLAGGED,
        "     j = count;",
        "-    k = 0;",
        "+    k = j;",
        "     if (k) {",
        "         j++;",
        "     }",
      ].join("\n"),
    );
    const { body } = parseExcerpt(excerpt);
    const at = body.indexOf(FLAGGED);
    expect(at).toBe(6);
    expect(body.length - at - 1).toBe(6);
    expect(excerpt).not.toContain("other_added");
  });

  test("never crosses into a neighbouring hunk or the next file", () => {
    expect(extractHunk(PATCH, FILE, 42)).toBe(
      ["@@ -40,3 +41,4 @@ void lbSnap_8001DB00(void)", "     void* p;", "+    p = (void*)0x80001234;", "     p = 0;", "     return;"].join("\n"),
    );
    expect(extractHunk(PATCH, "src/melee/lb/after.c", 2, 50)).toBe(["@@ -1,2 +1,3 @@", " int x;", "+int after_added;", " int y;"].join("\n"));
  });

  test("context 0 returns the header and the flagged line alone", () => {
    expect(extractHunk(PATCH, FILE, 17, 0)).toBe(["@@ -16,0 +17,1 @@ void lbSnap_8001DA5C(Fighter* fighter)", FLAGGED].join("\n"));
  });

  test("a flagged line near the hunk start is cut at the hunk's first line", () => {
    const excerpt = extractHunk(PATCH, FILE, 13)!;
    const { header, body } = parseExcerpt(excerpt);
    expect(header).toBe("@@ -10,9 +10,9 @@ void lbSnap_8001DA5C(Fighter* fighter)");
    expect(body[0]).toBe("     s32 i;");
    expect(body.indexOf("+    s32 count = 0;")).toBe(4);
    expect(body).toHaveLength(11);
    expect(excerpt).not.toContain("+++");
  });

  test("returns the context line at the requested new-file line when no added line has that number", () => {
    expect(extractHunk(PATCH, FILE, 15, 1)).toBe(
      ["@@ -14,3 +14,3 @@ void lbSnap_8001DA5C(Fighter* fighter)", "     for (i = 0; i < 4; i++) {", "         count += i;", "     }"].join("\n"),
    );
  });

  test("returns null when the patch has no added or context line there, or the arguments are invalid", () => {
    expect(extractHunk(PATCH, "src/melee/lb/missing.c", 17)).toBeNull();
    expect(extractHunk(PATCH, FILE, 30)).toBeNull();
    // The deletion-only hunk's removed lines sit at new-file cursor 61.
    expect(extractHunk(PATCH, FILE, 61)).toBeNull();
    expect(extractHunk(PATCH, FILE, 0)).toBeNull();
    expect(extractHunk(PATCH, FILE, -17)).toBeNull();
    expect(extractHunk(PATCH, FILE, 17.5)).toBeNull();
    expect(extractHunk(PATCH, FILE, Number.NaN)).toBeNull();
    expect(extractHunk(PATCH, FILE, 17, -1)).toBeNull();
    expect(extractHunk(PATCH, FILE, 17, 1.5)).toBeNull();
  });

  test("reads CRLF patches the same as LF ones, with no phantom empty line from the final newline", () => {
    const crlf = PATCH.replaceAll("\n", "\r\n");
    expect(extractHunk(crlf, FILE, 17)).toBe(extractHunk(PATCH, FILE, 17));
    const last = extractHunk(crlf, "src/melee/lb/after.c", 2)!;
    expect(last.split("\n").at(-1)).toBe(" int y;");
    expect(parseExcerpt(last).newCount).toBe(3);
  });

  test("keeps `No newline at end of file` markers without counting them", () => {
    const patch = [
      ...fileDiff(FILE, [
        "@@ -5,2 +5,2 @@ void tail(void)",
        " int x;",
        "-int y = 0;",
        "\\ No newline at end of file",
        "+int y = 1;",
        "\\ No newline at end of file",
      ]),
    ].join("\n");
    const excerpt = extractHunk(patch, FILE, 6)!;
    expect(excerpt).toBe(
      ["@@ -5,2 +5,2 @@ void tail(void)", " int x;", "-int y = 0;", "\\ No newline at end of file", "+int y = 1;", "\\ No newline at end of file"].join("\n"),
    );
    parseExcerpt(excerpt);

    // A marker travels with its own line: a narrow window never starts on a stray one or drops the flagged line's.
    expect(extractHunk(patch, FILE, 6, 0)).toBe(["@@ -6,0 +6,1 @@ void tail(void)", "+int y = 1;", "\\ No newline at end of file"].join("\n"));
    expect(extractHunk(patch, FILE, 6, 1)).toBe(
      ["@@ -6,1 +6,1 @@ void tail(void)", "-int y = 0;", "\\ No newline at end of file", "+int y = 1;", "\\ No newline at end of file"].join("\n"),
    );
  });

  test("matches the finding's file with ./ prefixes, doubled slashes or backslashes", () => {
    const expected = extractHunk(PATCH, FILE, 17);
    expect(expected).not.toBeNull();
    for (const file of ["./src/melee/lb/lbsnap.c", "src\\melee\\lb\\lbsnap.c", ".//src//melee/lb\\lbsnap.c", "  src/melee/lb/lbsnap.c "]) {
      expect(extractHunk(PATCH, file, 17)).toBe(expected);
    }
  });
});
