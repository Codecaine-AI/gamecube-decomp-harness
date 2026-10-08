// Offline fixtures for adjudicateAdvisories tests: a temp kernel with the
// kernel's fake call engine (extraction, judge) and fake classifier (Jev), a
// parent "worker" run, and an attempt patch with two kept llm_review warnings
// and one info advisory.
import {
  createFakeCallEngine,
  createFakeClassifier,
  createFakeClassifierRegistry,
  createTempKernel,
  fakeOk,
  fakePiModels,
  FAKE_CALL_MODEL_REF,
  type FakeCallEngine,
  type FakeCallRequest,
  type FakeCallResponse,
  type FakeClassifier,
  type FakeReply,
  type TempKernel,
} from "@agent-kernel/kernel/model-nodes/testing";
import type { CreateKernelConfig } from "@agent-kernel/kernel";
import type { QaScanFinding } from "@server/core/validation/qa/scan-diff.js";
import type { NodeCalls } from "@server/infrastructure/kernel/nodes/node-kernel.js";

import type { AdvisoryAdjudicationConfig } from "../config.js";
import type { LlmReviewCandidate } from "../types.js";

export const FLAGGED_FILE = "src/melee/gm/gmtoulib.c";

export const ATTEMPT_PATCH = [
  "diff --git a/src/melee/gm/gmtoulib.h b/src/melee/gm/gmtoulib.h",
  "index 0000001..0000002 100644",
  "--- a/src/melee/gm/gmtoulib.h",
  "+++ b/src/melee/gm/gmtoulib.h",
  "@@ -1,2 +1,3 @@",
  " #include <platform.h>",
  "+extern char* lbl_804DA6C8;",
  " void gm_801A4B60(void);",
  `diff --git a/${FLAGGED_FILE} b/${FLAGGED_FILE}`,
  "index 1111111..2222222 100644",
  `--- a/${FLAGGED_FILE}`,
  `+++ b/${FLAGGED_FILE}`,
  "@@ -1860,8 +1860,10 @@ void gm_801A4B60(void)",
  "     s32 i;",
  "     char** templates_800;",
  " ",
  "-    templates_800[0] = lbl_804DA6C4;",
  "+    templates_800[0] = *(char**) &lbl_804DA6C4;",
  "+    templates_800[1] = *(char**) &lbl_804DA6C8;",
  "     for (i = 0; i < 4; i++) {",
  "+        f32 sp10 = 0.0f;",
  "         func_80000000(templates_800[i]);",
  "     }",
  " }",
  "",
].join("\n");

export const NOTE_TEXT = [
  "Matched gm_801A4B60 (100%).",
  "kept_advisories:",
  `- type_erasing_cast ${FLAGGED_FILE}:1863: MWCC emits lwz r0,-0x1234(r13) only through the cast; the plain read adds an extsh (objdiff 98.1% -> 100%).`,
  `- type_erasing_cast ${FLAGGED_FILE}:1864: same as above.`,
].join("\n");

function finding(line: number, excerpt: string, overrides: Partial<QaScanFinding> = {}): QaScanFinding {
  return {
    rule_id: "type_erasing_cast",
    severity: "warning",
    file: FLAGGED_FILE,
    line,
    excerpt,
    message: "Added type-erasing cast `(char**)`; keep it only when matching requires it.",
    standard_id: "std-type-casts",
    detail: { llm_review: true, cast: "(char**)" },
    ...overrides,
  };
}

export const CAST_A = finding(1863, "templates_800[0] = *(char**) &lbl_804DA6C4;");
export const CAST_B = finding(1864, "templates_800[1] = *(char**) &lbl_804DA6C8;");
export const LOCAL_INFO = finding(1866, "f32 sp10 = 0.0f;", {
  rule_id: "stack_local_name",
  severity: "info",
  message: "Stack-offset local name `sp10`.",
  standard_id: null,
  detail: { llm_review: true, name: "sp10" },
});

export function makeCandidate(overrides: Partial<LlmReviewCandidate> & { parentRunId?: string } = {}): LlmReviewCandidate {
  const { parentRunId, ...rest } = overrides;
  return {
    schema: "llm_review_candidate_v1",
    mode: "shadow",
    eligible: true,
    pre_qa: { status: "passed", reasons: [] },
    post_return_check: "not-run",
    advisories: [CAST_A, CAST_B, LOCAL_INFO].map((f) => ({ fingerprint: null, finding: f })),
    kernel: { run_id: parentRunId ?? "missing-run", container_id: "container", pi_session_id: "session" },
    attempt_index: 2,
    agent_output_path: "worker_state/w/attempt-2.output.txt",
    scan_path: "worker_state/w/attempt-2.qa_diff.patch",
    code_facts: { exact: true, old_score: 98.1, new_score: 100 },
    ...rest,
  };
}

/** The extraction answer: finding ids A1, A2 (warnings) and A3 (info), in candidate order. */
export function extractionAnswer(justifications: Partial<Record<"A1" | "A2" | "A3", string | null>>, structured = true) {
  return {
    advisories: (["A1", "A2", "A3"] as const).map((id) => ({
      finding_id: id,
      kept: true,
      justification: justifications[id] ?? null,
      evidence: justifications[id] ? ["objdiff 98.1% -> 100%", "lwz r0,-0x1234(r13)"] : [],
    })),
    structured_field_used: structured,
  };
}

export const GOOD = "MWCC emits lwz r0,-0x1234(r13) only through the cast; the plain read adds an extsh (objdiff 98.1% -> 100%).";

export interface AdjudicationHarness {
  temp: TempKernel<NodeCalls>;
  engine: FakeCallEngine<NodeCalls>;
  classifier: FakeClassifier;
  parentRunId: string;
  config: AdvisoryAdjudicationConfig;
  /** Every call invocation's function name, in order. */
  callNames(): string[];
  cleanup(): void;
}

export type CallScript = (req: FakeCallRequest<NodeCalls>, index: number) => FakeCallResponse | Promise<FakeCallResponse>;
/** p(justified) per flagged line, or a full classifier reply. */
export type DecisionScript = (line: number) => FakeReply | Promise<FakeReply>;

export function testConfig(model: string, overrides: Partial<AdvisoryAdjudicationConfig> = {}): AdvisoryAdjudicationConfig {
  return {
    model,
    escalateLowConfidence: false,
    judgeCanAccept: false,
    inline: { maxMs: 75_000, reserveMs: 120_000, minMs: 20_000 },
    maxFalseAcceptUpper: 0.1,
    thresholds: { [model]: { passAt: 0.85, failAt: 0.15, qualification: "exploratory" } },
    ...overrides,
  };
}

export function bool(probability: number): FakeReply {
  return { answers: { justified: { type: "bool", probability } }, usage: { input: 500, output: 20 } };
}

export async function createAdjudicationHarness(opts: {
  calls?: CallScript;
  decisions?: DecisionScript;
  classifierConfigured?: boolean;
  config?: Partial<AdvisoryAdjudicationConfig>;
  kernel?: Omit<CreateKernelConfig<unknown, NodeCalls>, "db" | "id">;
} = {}): Promise<AdjudicationHarness> {
  const engine = createFakeCallEngine<NodeCalls>({
    functions: ["ExtractCheckpointKnowledge", "JudgeAdvisoryWithRationale"],
    respond: opts.calls ?? (() => fakeOk(extractionAnswer({ A1: GOOD, A2: GOOD }))),
  });
  const { fake, registry } = await createFakeClassifierRegistry(
    createFakeClassifier({ ...(opts.classifierConfigured !== undefined && { configured: opts.classifierConfigured }) }),
  );
  const decisions = opts.decisions ?? (() => bool(0.93));
  fake.setScript((context) => decisions(Number((context.state as { line?: unknown }).line)));
  const temp = await createTempKernel<NodeCalls>({
    ...opts.kernel,
    calls: { engine },
    decide: { models: registry, ...opts.kernel?.decide },
    nodes: { piModels: fakePiModels() },
    models: { defaults: { call: FAKE_CALL_MODEL_REF, decide: fake.ref } },
  });
  const parent = await temp.tempDb.seedParentRun({ agentName: "worker" });
  return {
    temp,
    engine,
    classifier: fake,
    parentRunId: parent.runId,
    config: testConfig(fake.ref, opts.config),
    callNames: () => engine.invocations.map((invocation) => invocation.name),
    cleanup: () => temp.cleanup(),
  };
}
