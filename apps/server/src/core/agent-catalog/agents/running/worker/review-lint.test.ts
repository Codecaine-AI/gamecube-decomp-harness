import { describe, expect, test } from "bun:test";
import { lintWorkerReviewDiff } from "./review-lint.js";

function unifiedDiff(lines: string[]): string {
  return [
    "diff --git a/src/melee/gm/gmresult.c b/src/melee/gm/gmresult.c",
    "index 1111111..2222222 100644",
    "--- a/src/melee/gm/gmresult.c",
    "+++ b/src/melee/gm/gmresult.c",
    "@@ -1,2 +1,3 @@",
    ...lines,
    "",
  ].join("\n");
}

describe("lintWorkerReviewDiff define aliases", () => {
  test("still flags object-like aliases", () => {
    const result = lintWorkerReviewDiff(unifiedDiff(["+#define gm_801732D8 gm_801732D8_wide"]));

    expect(result.status).toBe("failed");
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]).toMatchObject({
      ruleId: "no-define-alias-global-renames",
      evidence: "#define gm_801732D8 gm_801732D8_wide",
    });
  });

  test("flags a single-line function-like self-reference shim", () => {
    const result = lintWorkerReviewDiff(
      unifiedDiff(["+#define fn_80174468(a, b, c, d, e, f) fn_80174468(s32 slot, HSD_Text* text1, HSD_Text* text2, s32 arg3, s32 arg4, s32 arg5)"]),
    );

    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]).toMatchObject({
      ruleId: "no-define-alias-global-renames",
      message: "Function-like macro fn_80174468 re-declares/aliases global symbol fn_80174468 (prototype-shim shape); fix the owning header instead.",
    });
  });

  test("flags a self-reference on a multi-line continuation", () => {
    const defineLine = "#define fn_80174468(a, b, c, d, e, f) \\";
    const matchingContinuation = "    fn_80174468(s32 slot, HSD_Text* text1, HSD_Text* text2, \\";
    const result = lintWorkerReviewDiff(
      unifiedDiff([
        `+${defineLine}`,
        `+${matchingContinuation}`,
        "+        s32 arg3, s32 arg4, s32 arg5)",
        '+#include "gmresult.h"',
        "+#undef fn_80174468",
      ]),
    );

    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]).toMatchObject({
      path: "src/melee/gm/gmresult.c",
      evidence: `${defineLine}\n${matchingContinuation.trim()}`,
    });
  });

  test("flags a function-like macro that references another address-style global", () => {
    const result = lintWorkerReviewDiff(unifiedDiff(["+#define RESULT_TEXT(slot) gm_801732D8(slot)"]));

    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]?.message).toContain("global symbol gm_801732D8");
  });

  test("flags a function-like macro that calls a named global", () => {
    const result = lintWorkerReviewDiff(unifiedDiff(["+#define AUX_SIZE() HSD_AudioGetAuxHeapSize()"]));

    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]?.message).toContain("global symbol HSD_AudioGetAuxHeapSize");
  });

  test("allows ordinary and exempt function macros plus removed and context shims", () => {
    const result = lintWorkerReviewDiff(
      unifiedDiff([
        "+#define SQ(x) ((x)*(x))",
        "+#define APPLY(fn, x) fn(x)",
        "+#define M2C_FIELD(base, type, offset) (*(type)((u8*)(base) + (offset)))",
        "+#define FOO_ABS(x) gm_801732D8(x)",
        "+#define FOO_MIN(x, y) gm_801732D8(x, y)",
        "+#define FOO_MAX(x, y) gm_801732D8(x, y)",
        "+#define FOO_CLAMP(x, lo, hi) fn_80174468(x, lo, hi)",
        "-#define fn_80174468(a, b) fn_80174468(s32 slot, HSD_Text* text)",
        " #define fn_801732D8(a, b) fn_801732D8(s32 slot, HSD_Text* text)",
      ]),
    );

    expect(result.status).toBe("passed");
    expect(result.findings).toEqual([]);
  });

  test("ignores address-style names inside comments and string literals", () => {
    const result = lintWorkerReviewDiff(
      unifiedDiff([
        '+#define REPORT_NAME(x) "gm_801732D8"',
        "+#define COMMENTED(x) /* gm_801732D8 \\",
        "+    still only a comment */ (x)",
      ]),
    );

    expect(result.status).toBe("passed");
    expect(result.findings).toEqual([]);
  });
});
