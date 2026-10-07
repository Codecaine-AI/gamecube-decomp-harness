import { describe, expect, test } from "bun:test";

import { justifiedQuestions } from "@server/core/agent-catalog/agents/running/worker/advisory-adjudication/question.js";

import { bamlPromptHash, callRequestId, decisionRequestId, nodePromptHash } from "./request-ids";

const decision = {
  engine: "live" as const,
  parentRunId: "parent-a",
  model: "typesafe/jev-1.13.0",
  itemId: "adv-1",
  name: "JudgeAdvisory:adv-1",
  state: { finding: "type_erasing_cast", justification: "objdiff 100%" },
  questions: justifiedQuestions({ passAt: 0.85, failAt: 0.15 }),
};

const call = {
  engine: "live" as const,
  parentRunId: "parent-a",
  name: "LabelAdvisoryJustification" as const,
  args: [{ finding: { id: "adv-1" }, justification: "objdiff 100%" }],
  reasoning: "high" as const,
  promptHash: "baml1-aaaa",
};

describe("calibration request ids", () => {
  test("a changed question set gives a new decision id; an unchanged request keeps its id", () => {
    const id = decisionRequestId(decision);
    expect(decisionRequestId({ ...decision, questions: justifiedQuestions({ passAt: 0.85, failAt: 0.15 }) })).toBe(id);
    // Thresholds, wording, state, model and engine are all part of the request.
    expect(decisionRequestId({ ...decision, questions: justifiedQuestions({ passAt: 0.9, failAt: 0.15 }) })).not.toBe(id);
    const reworded = { justified: { ...decision.questions.justified, instructions: `${decision.questions.justified.instructions} Be strict.` } };
    expect(decisionRequestId({ ...decision, questions: reworded })).not.toBe(id);
    expect(decisionRequestId({ ...decision, state: { ...decision.state, justification: "style" } })).not.toBe(id);
    expect(decisionRequestId({ ...decision, model: "typesafe/jev-latest" })).not.toBe(id);
    expect(decisionRequestId({ ...decision, engine: "fake" })).not.toBe(id);
    // Another dataset (another fixed parent) in the same database never shares an id.
    expect(decisionRequestId({ ...decision, parentRunId: "parent-b" })).not.toBe(id);
  });

  test("a changed prompt, argument or reasoning gives a new call id; an unchanged request keeps its id", () => {
    const id = callRequestId("calibration-label", "adv-1", call);
    expect(callRequestId("calibration-label", "adv-1", { ...call, args: [{ finding: { id: "adv-1" }, justification: "objdiff 100%" }] })).toBe(id);
    expect(callRequestId("calibration-label", "adv-1", { ...call, promptHash: "baml1-bbbb" })).not.toBe(id);
    expect(callRequestId("calibration-label", "adv-1", { ...call, args: [{ finding: { id: "adv-1" }, justification: "style" }] })).not.toBe(id);
    expect(callRequestId("calibration-label", "adv-1", { ...call, reasoning: "low" })).not.toBe(id);
    // The manifest model is part of the digest: another function's manifest names another model.
    expect(callRequestId("calibration-label", "adv-1", { ...call, name: "SynthesizeJustification" })).not.toBe(id);
    expect(callRequestId("calibration-label", "adv-1", { ...call, parentRunId: "parent-b" })).not.toBe(id);
  });

  test("the prompt hash follows the kernel's rule: prompt sources only, order-free", async () => {
    const sources = { "baml_src/functions/a.baml": "function A", "baml_src/clients.baml": "client X", "baml_src/generators.baml": "gen" };
    const hash = bamlPromptHash(sources);
    expect(bamlPromptHash({ ...sources, "baml_src/clients.baml": "client Y" })).toBe(hash);
    expect(bamlPromptHash({ "baml_src/generators.baml": "gen", "baml_src/functions/a.baml": "function A" })).toBe(hash);
    expect(bamlPromptHash({ ...sources, "baml_src/functions/a.baml": "function A2" })).not.toBe(hash);
    expect(await nodePromptHash()).toMatch(/^baml1-[0-9a-f]{64}$/);
  });
});
