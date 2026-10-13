import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  AGENT_COMMENT_TERMS,
  STACK_POLICY_REDACTION,
  detectBannedStackTactics,
  hasBannedStackTactic,
  redactBannedStackTactics,
  redactStackTacticsInPayload,
  stackFramePolicyForGame,
  stackFramePolicyPromptBlock,
} from "./stack-policy-filter.js";

const rulesOf = (text: string) => [...new Set(detectBannedStackTactics(text).map((finding) => finding.rule))].sort();

describe("banned stack tactic detector", () => {
  test("keeps the agent-comment vocabulary identical to the toolpack copy", () => {
    const python = readFileSync(
      fileURLToPath(new URL("../../../../../toolpacks/gamecube-decomp/_impl/gamecube/tools/agent_comments.py", import.meta.url)),
      "utf8",
    );
    const block = /AGENT_COMMENT_TERMS = \(([\s\S]*?)\n\)/.exec(python)?.[1] ?? "";
    const terms = [...block.matchAll(/r"((?:[^"\\]|\\.)*)"/g)].map((match) => match[1]);
    expect(terms.length).toBeGreaterThan(10);
    expect([...AGENT_COMMENT_TERMS]).toEqual(terms);
  });

  test.each([
    ["\tchar trash[0x18];", "padding_local"],
    ["\tchar trash[8];", "padding_local"],
    ["\tchar trash[0x4]; // TODO: skill issue", "agent_comment"],
    ["\tPAD_STACK(8);", "pad_stack"],
    ["#pragma dont_inline on", "inline_forcing"],
    ["\tvolatile u8 buf[0x10];", "padding_local"],
    ["\tunion { u64 a; char buf[0x100]; } buf;", "alignment_trick"],
    ["\tMtx mtx ATTRIBUTE_ALIGN(32);", "alignment_trick"],
    ["\tfoo(); // nonmatching: frame size off by 8", "agent_comment"],
    ["Swap the declaration order to fix the frame.", "frame_reorder"],
    ["Added a dummy local to grow the stack frame by 8 bytes.", "padding_local"],
    ["Using `0 <= x` instead of `x >= 0` adds 8 bytes of frame size.", "frame_reorder"],
    ["Mark the function with a `// fakematch` comment and move on.", "agent_comment"],
    ["Selectively inlining GetFoo grows the stack frame to match.", "inline_forcing"],
  ])("flags %p as %p", (text, rule) => {
    expect(rulesOf(text)).toContain(rule as never);
  });

  test.each([
    "the stack of pending events is drained each frame",
    "Entering the panic path emits diagnostics, examines at most 16 valid stack frames, then halts the processor.",
    "Provides the caller's current PowerPC stack-frame pointer for runtime stack inspection.",
    "\tf32 _pad[2];",
    "\tu8 _pad[0x4]; // padding",
    "\t/* 0x10 */ u32 _pad10;",
    "static u8 tmp_data[0x10CC] ATTRIBUTE_ALIGN(32) = {",
    "Swapped the loop condition operands, which moved r31 and matched the branch.",
    "Matched the loop; no TODO comments were left.",
    "An agent is prohibited from committing `volatile char trash[0x10];` tricks to force-fix stack frame size issues.",
    "checkpoint 3 scored 99.83125",
  ])("does not flag %p", (text) => {
    expect(hasBannedStackTactic(text)).toBe(false);
  });

  test("ignores removed diff lines and reads added ones", () => {
    const diff = ["@@ -1,4 +1,4 @@", " void f() {", "-\tchar trash[8];", "+\tint i;", " }"].join("\n");
    expect(hasBannedStackTactic(diff)).toBe(false);
    expect(rulesOf(diff.replace("+\tint i;", "+\tPAD_STACK(8);"))).toEqual(["pad_stack"]);
  });

  test("redacts only the offending sentence and reports when nothing is left", () => {
    const result = redactBannedStackTactics("Matched the loop shape. Swap the declaration order to fix the frame. Register r31 now holds the actor.");
    expect(result.text).toBe(`Matched the loop shape. ${STACK_POLICY_REDACTION} Register r31 now holds the actor.`);
    expect(result.emptied).toBe(false);
    expect(redactBannedStackTactics("\tchar trash[0x18];\n\tPAD_STACK(8);").text).toBe(STACK_POLICY_REDACTION);
    expect(redactBannedStackTactics("\tchar trash[0x18];").emptied).toBe(true);
  });

  test("payload redaction keeps identity and citation fields verbatim", () => {
    const { value, redactions } = redactStackTacticsInPayload({
      locator: "pr://doldecomp/sms#212",
      stable_key: "GMSJ01:MActor:trash",
      summary_snippet: "Added char trash[0x10] to match.",
      nested: [{ description: "PAD_STACK(8) fixed it" }],
    });
    expect(redactions).toBe(2);
    expect(value.locator).toBe("pr://doldecomp/sms#212");
    expect(value.stable_key).toBe("GMSJ01:MActor:trash");
    expect(value.summary_snippet).toBe(STACK_POLICY_REDACTION);
    expect(value.nested[0]!.description).toBe(STACK_POLICY_REDACTION);
  });

  test("reads the per-game policy and only emits the prompt block for stop_at_frame", () => {
    expect(stackFramePolicyForGame("sms")).toBe("stop_at_frame");
    expect(stackFramePolicyForGame("melee")).toBe("match_frame");
    expect(stackFramePolicyForGame("no-such-game")).toBe("match_frame");
    expect(stackFramePolicyPromptBlock("match_frame")).toBe("");
    expect(stackFramePolicyPromptBlock("stop_at_frame")).toContain("<stack_frame_policy");
  });
});
