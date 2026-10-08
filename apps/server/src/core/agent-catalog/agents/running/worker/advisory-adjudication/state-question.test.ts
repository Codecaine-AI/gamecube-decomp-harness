import { describe, expect, test } from "bun:test";
import type { QaScanFinding } from "@server/core/validation/qa/scan-diff.js";
import { JUSTIFIED_QUESTION, justifiedQuestions } from "./question.js";
import {
  buildAdvisoryState,
  MAX_STATE_HUNK_CHARS,
  MAX_STATE_HUNK_LINES,
  MAX_STATE_JUSTIFICATION_CHARS,
} from "./state.js";
import type { LlmReviewCodeFacts } from "./types.js";

// The contract limits, independent of the module's constants: plan §6.5
// (hunk ≤ 120 lines, justification ≤ 4,000 characters) and §6.8 (≤ 16 KB of hunk).
const CONTRACT_HUNK_LINES = 120;
const CONTRACT_HUNK_CHARS = 16_000;
const CONTRACT_JUSTIFICATION_CHARS = 4_000;

test("the module's bounds stay within the contract limits", () => {
  expect(MAX_STATE_HUNK_LINES).toBeLessThanOrEqual(CONTRACT_HUNK_LINES);
  expect(MAX_STATE_HUNK_CHARS).toBeLessThanOrEqual(CONTRACT_HUNK_CHARS);
  expect(MAX_STATE_JUSTIFICATION_CHARS).toBeLessThanOrEqual(CONTRACT_JUSTIFICATION_CHARS);
});

function finding(overrides: Partial<QaScanFinding> = {}): QaScanFinding {
  return {
    rule_id: "type_erasing_cast",
    severity: "warning",
    file: "src/melee/lb/lbsnap.c",
    line: 12,
    excerpt: "lbSnap_Apply((void*)&fighter->mv, 0x24);",
    message: "New type-erasing pointer cast.",
    standard_id: "global_standard:typed-fields-over-pointer-math",
    detail: { llm_review: true, cast: "void*" },
    disposition: "informational",
    ...overrides,
  };
}

const FACTS: LlmReviewCodeFacts = { exact: true, old_score: 0.42, new_score: 1 };

function state(overrides: { finding?: Partial<QaScanFinding>; hunk?: string | null; justification?: string | null; facts?: LlmReviewCodeFacts } = {}) {
  return buildAdvisoryState({
    finding: finding(overrides.finding),
    hunk: overrides.hunk === undefined ? "@@ -12,1 +12,1 @@\n+    lbSnap_Apply((void*)&fighter->mv, 0x24);" : overrides.hunk,
    justification: overrides.justification === undefined ? "objdiff shows the cast is required to match 0x24." : overrides.justification,
    facts: overrides.facts ?? FACTS,
  });
}

describe("advisory decision state", () => {
  test("holds only code facts and the justification, and survives a JSON round trip unchanged", () => {
    const built = state();
    expect(Object.keys(built).sort()).toEqual(
      ["code_facts", "detail", "file", "finding", "flagged_code", "hunk", "justification", "line", "rule_message"].sort(),
    );
    expect(built.finding).toBe("type_erasing_cast");
    expect(built.file).toBe("src/melee/lb/lbsnap.c");
    expect(built.line).toBe(12);
    expect(built.flagged_code).toBe("lbSnap_Apply((void*)&fighter->mv, 0x24);");
    expect(built.code_facts).toEqual({ exact: true, old_score: 0.42, new_score: 1 });
    expect(JSON.parse(JSON.stringify(built))).toStrictEqual(built);
  });

  test("detail drops llm_review and non-primitive values, sorts keys, and is null when nothing remains", () => {
    const detail = {
      zeta: "z",
      llm_review: true,
      alpha: 1,
      nested: { a: 1 },
      list: [1, 2],
      beta: false,
      nan: Number.NaN,
      infinite: Number.POSITIVE_INFINITY,
      gamma: null,
    };
    const built = state({ finding: { detail } });
    expect(built.detail).toStrictEqual({ alpha: 1, beta: false, gamma: null, zeta: "z" });
    expect(Object.keys(built.detail!)).toEqual(["alpha", "beta", "gamma", "zeta"]);

    expect(state({ finding: { detail: { llm_review: true, nested: { a: 1 } } } }).detail).toBeNull();
    expect(state({ finding: { detail: undefined } }).detail).toBeNull();
  });

  test("cuts a long hunk to the line bound, ending in a marker for the lines cut", () => {
    const lines = Array.from({ length: 500 }, (_, index) => `+    line_${index};`);
    const hunk = state({ hunk: lines.join("\n") }).hunk!;
    const kept = hunk.split("\n");
    expect(kept.length).toBeLessThanOrEqual(CONTRACT_HUNK_LINES);
    expect(kept[0]).toBe("+    line_0;");
    expect(kept.at(-1)).toMatch(/more lines/);
  });

  test("cuts a hunk of long lines to the character bound at whole lines, keeping the marker", () => {
    const lines = Array.from({ length: 100 }, (_, index) => `+${String(index).padEnd(399, "x")}`);
    const original = lines.join("\n");
    const hunk = state({ hunk: original }).hunk!;
    expect(hunk.length).toBeLessThanOrEqual(CONTRACT_HUNK_CHARS);
    const kept = hunk.split("\n");
    const body = kept.slice(0, -1);
    expect(body).toEqual(lines.slice(0, body.length));
    expect(kept.at(-1)).toBe(`… [${lines.length - body.length} more lines]`);
  });

  test("a hunk over both bounds keeps the marker; one oversized line is itself cut", () => {
    const lines = Array.from({ length: 300 }, (_, index) => `+${String(index).padEnd(199, "y")}`);
    const hunk = state({ hunk: lines.join("\n") }).hunk!;
    expect(hunk.length).toBeLessThanOrEqual(CONTRACT_HUNK_CHARS);
    expect(hunk.split("\n").length).toBeLessThanOrEqual(CONTRACT_HUNK_LINES);
    expect(hunk).toMatch(/\n… \[\d+ more lines\]$/);

    const single = state({ hunk: `+${"z".repeat(20_000)}` }).hunk!;
    expect(single.length).toBeLessThanOrEqual(CONTRACT_HUNK_CHARS);
    expect(single.startsWith("+zzz")).toBe(true);
    expect(single).toMatch(/more characters\]$/);
  });

  test("bounds and trims the justification; a blank one becomes null", () => {
    const long = state({ justification: "because ".repeat(1250) }).justification!;
    expect(long.length).toBeLessThanOrEqual(CONTRACT_JUSTIFICATION_CHARS);
    expect(long.startsWith("because because")).toBe(true);

    expect(state({ justification: "  matches 0x24 \n" }).justification).toBe("matches 0x24");
    expect(state({ justification: "   \n\t " }).justification).toBeNull();
    expect(state({ justification: null }).justification).toBeNull();
  });

  test("non-finite scores become null and a short hunk is kept verbatim", () => {
    const built = state({ facts: { exact: false, old_score: Number.NaN, new_score: Number.POSITIVE_INFINITY }, hunk: "@@ -1,1 +1,1 @@\n+x;" });
    expect(built.code_facts).toEqual({ exact: false, old_score: null, new_score: null });
    expect(built.hunk).toBe("@@ -1,1 +1,1 @@\n+x;");
    expect(state({ hunk: null }).hunk).toBeNull();
  });
});

describe("justified question", () => {
  test("is a frozen bool question naming the state's hunk, finding and justification", () => {
    expect(JUSTIFIED_QUESTION.type).toBe("bool");
    for (const field of ["`hunk`", "`finding`", "`justification`"]) expect(JUSTIFIED_QUESTION.instructions).toContain(field);
    const before = JUSTIFIED_QUESTION.instructions;
    expect(() => {
      (JUSTIFIED_QUESTION as { instructions: string }).instructions = "changed";
    }).toThrow(TypeError);
    expect(() => {
      JUSTIFIED_QUESTION.criteria.true = "changed";
    }).toThrow(TypeError);
    expect(JUSTIFIED_QUESTION.instructions).toBe(before);
  });

  test("justifiedQuestions carries the same wording with the configured bars and leaves the constant untouched", () => {
    const questions = justifiedQuestions({ passAt: 0.9, failAt: 0.1 });
    expect(questions).toStrictEqual({
      justified: {
        type: "bool",
        instructions: JUSTIFIED_QUESTION.instructions,
        criteria: { true: JUSTIFIED_QUESTION.criteria.true, false: JUSTIFIED_QUESTION.criteria.false },
        passAt: 0.9,
        failAt: 0.1,
      },
    });
    expect(JUSTIFIED_QUESTION).not.toHaveProperty("passAt");
    expect(JUSTIFIED_QUESTION).not.toHaveProperty("failAt");

    questions.justified.criteria.true = "edited by a caller";
    expect(justifiedQuestions({ passAt: 0.8, failAt: 0.2 }).justified.criteria.true).toBe(JUSTIFIED_QUESTION.criteria.true);
  });
});
