import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  AGENT_COMMENT_TERMS,
  STACK_POLICY_REDACTION,
  STEERING_PROBE_LABEL,
  applyKnowledgePolicies,
  applyKnowledgePolicy,
  applySteeringPolicy,
  detectBannedStackTactics,
  detectSteeringTactics,
  knowledgePolicyText,
  relabelSteeringTactics,
  steeringGateForGame,
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

const steeringRulesOf = (text: string) => [...new Set(detectSteeringTactics(text).map((finding) => finding.rule))].sort();

describe("steering tactic relabel", () => {
  test.each([
    ["Store the position in a temp to match the register allocation.", "steering_temp"],
    ["Splitting the expression into a local fixed r31.", "steering_temp"],
    ["Use a single-use alias for the actor pointer; it matched.", "steering_temp"],
    ["\tf32 tmp = obj->mPos.x;", "steering_temp"],
    ["\tfoo(a); // temp needed to match regalloc", "steering_temp"],
    ["Use the field directly instead of the getter to match.", "steering_accessor"],
    ["Replace obj->getPos() with obj->mPos to get the right load order.", "steering_accessor"],
    ["Rewriting the if/else into a ternary matched the branch.", "steering_form"],
    ["Swapping the operands of the comparison fixed the cmpw order.", "steering_form"],
    ["Using s32 instead of int got the match.", "steering_form"],
    ["Reordering the declarations fixed the register allocation.", "steering_form"],
  ])("labels %p as %p", (text, rule) => {
    expect(steeringRulesOf(text)).toContain(rule as never);
  });

  test.each([
    "Do not add single-use temps to fix the match.",
    "Removed the temp; the real fix was an inline accessor.",
    "The temp variable holds the actor pointer.",
    "Matched calc by restoring the getter.",
    "Hoist the loop bound into a local.",
    "\tint i;",
  ])("leaves %p alone", (text) => {
    expect(detectSteeringTactics(text)).toEqual([]);
    expect(relabelSteeringTactics(text).text).toBe(text);
  });

  test("labels only the offending sentence, keeps the text, and is idempotent", () => {
    const text = "Matched the loop. Store the position in a temp to match. Register r31 holds it.";
    const once = relabelSteeringTactics(text);
    expect(once.text).toBe(`Matched the loop. Store the position in a temp to match. ${STEERING_PROBE_LABEL} Register r31 holds it.`);
    expect(once.findings.map((finding) => finding.rule)).toEqual(["steering_temp"]);
    expect(relabelSteeringTactics(once.text).text).toBe(once.text);
  });

  test("labels added diff lines and ignores removed ones", () => {
    const diff = ["@@ -1,3 +1,3 @@", " void f() {", "-\tf32 tmp = a;", "+\tf32 tmp = b;", " }"].join("\n");
    const lines = relabelSteeringTactics(diff).text.split("\n");
    expect(lines[2]).toBe("-\tf32 tmp = a;");
    expect(lines[3]).toBe(`+\tf32 tmp = b; ${STEERING_PROBE_LABEL}`);
  });

  test("payload relabel keeps identity fields and is a no-op with the gate off", () => {
    const payload = { locator: "pr://doldecomp/sms#212 tmp", summary: "Store the position in a temp to match." };
    expect(applySteeringPolicy(payload, "off")).toBe(payload);
    const labelled = applySteeringPolicy(payload, "shadow");
    expect(labelled.locator).toBe(payload.locator);
    expect(labelled.summary).toBe(`${payload.summary} ${STEERING_PROBE_LABEL}`);
  });

  test("composed policy redacts stack tactics first, then labels steering", () => {
    const text = "Added char trash[0x18] to fix the stack frame. Using s32 instead of int got the match.";
    expect(knowledgePolicyText({ stackFramePolicy: "stop_at_frame", steeringGate: "shadow" })(text))
      .toBe(`${STACK_POLICY_REDACTION} Using s32 instead of int got the match. ${STEERING_PROBE_LABEL}`);
    expect(knowledgePolicyText({ stackFramePolicy: "match_frame", steeringGate: "off" })(text)).toBe(text);
    const applied = applyKnowledgePolicy({ stackFramePolicy: "stop_at_frame", steeringGate: "enforce" }, { summary: text });
    expect(applied.stack_policy_redactions).toBe(1);
    expect(applied.steering_policy_relabels).toBe(1);
    expect(applied.steering_policy_note).toContain("diagnostic probe");
  });

  test("reads the steering gate per game: SMS relabels, Melee is untouched", () => {
    expect(steeringGateForGame("melee")).toBe("off");
    expect(steeringGateForGame("no-such-game")).toBe("off");
    const payload = { summary: "Using s32 instead of int got the match." };
    expect(applyKnowledgePolicies("melee", payload)).toBe(payload);
    const sms = applyKnowledgePolicies("sms", payload);
    expect(sms.stack_policy_note).toContain("banned");
    if (steeringGateForGame("sms") === "off") {
      expect(sms.summary).toBe(payload.summary);
    } else {
      expect(sms.summary).toBe(`${payload.summary} ${STEERING_PROBE_LABEL}`);
      expect(sms.steering_policy_note).toBeDefined();
    }
  });
});
