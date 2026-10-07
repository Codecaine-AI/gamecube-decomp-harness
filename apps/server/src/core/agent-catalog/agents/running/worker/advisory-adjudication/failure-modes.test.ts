// Plan §6.7, row by row: every failure resolves (never throws), fails closed
// (never "pass", nothing accepted), and is classified as a recorded result or
// a retryable infrastructure failure.
import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";

import { disableNetwork, fakeFailure, fakeOk, untilAborted } from "@agent-kernel/kernel/model-nodes/testing";
import type { CallFailure } from "@agent-kernel/kernel/model-nodes";

import {
  ATTEMPT_PATCH,
  bool,
  createAdjudicationHarness,
  extractionAnswer,
  GOOD,
  makeCandidate,
  NOTE_TEXT,
  testConfig,
  type AdjudicationHarness,
} from "./__fixtures__/adjudication.js";
import { foldVerdicts } from "./fold.js";
import {
  adjudicateAdvisories,
  failClosedAdjudication,
  type AdjudicateAdvisoriesParams,
  type AdjudicationKernel,
} from "./index.js";
import type { AdvisoryAdjudication, LlmReviewCandidate } from "./types.js";

let restoreFetch: () => void;
beforeAll(() => {
  restoreFetch = disableNetwork();
});
afterAll(() => restoreFetch());

let harness: AdjudicationHarness | null = null;
afterEach(() => {
  harness?.cleanup();
  harness = null;
});

async function setup(opts: Parameters<typeof createAdjudicationHarness>[0] = {}): Promise<AdjudicationHarness> {
  harness = await createAdjudicationHarness(opts);
  return harness;
}

function run(h: AdjudicationHarness, overrides: Omit<Partial<AdjudicateAdvisoriesParams>, "candidate"> & { candidate?: Partial<LlmReviewCandidate> } = {}) {
  const { candidate, ...rest } = overrides;
  return adjudicateAdvisories({
    kernel: h.temp.kernel,
    candidate: makeCandidate({ parentRunId: h.parentRunId, ...candidate }),
    noteText: NOTE_TEXT,
    patchText: ATTEMPT_PATCH,
    requestIdPrefix: "checkpoint:cp-1",
    config: h.config,
    ...rest,
  });
}

/** Fail closed: never a pass, nothing accepted, every warning named in the repair reasons. */
function expectFailClosed(result: AdvisoryAdjudication): void {
  expect(result.verdict).not.toBe("pass");
  expect(result.accepted_fingerprints).toEqual([]);
  const warnings = result.advisories.filter((a) => a.severity === "warning");
  expect(warnings.length).toBeGreaterThan(0);
  expect(foldVerdicts(result.advisories).repairReasons).toHaveLength(warnings.length);
}

/** A node kernel stub that records calls; every method throws unless overridden. */
function stubKernel(overrides: Partial<AdjudicationKernel> = {}): AdjudicationKernel & { calls: string[] } {
  const calls: string[] = [];
  const refuse = (name: string) => async () => {
    calls.push(name);
    throw new Error(`${name} must not be called`);
  };
  return {
    calls,
    call: (overrides.call ?? refuse("call")) as AdjudicationKernel["call"],
    decide: (overrides.decide ?? refuse("decide")) as AdjudicationKernel["decide"],
    step: (overrides.step ?? refuse("step")) as AdjudicationKernel["step"],
    gate: (overrides.gate ?? refuse("gate")) as AdjudicationKernel["gate"],
  };
}

function engineErrorKinds(h: AdjudicationHarness, runIds: string[]): string[] {
  const db = new Database(h.temp.tempDb.path, { readonly: true });
  try {
    return runIds.map((runId) => {
      const row = db
        .query<{ data: string }, [string]>(`SELECT event_data AS data FROM trace_events WHERE type = 'call_end' AND run_id = ?`)
        .get(runId);
      return (JSON.parse(row!.data) as { error?: { kind: string } }).error?.kind ?? "none";
    });
  } finally {
    db.close();
  }
}

describe("§6.7 failure modes", () => {
  test("node kernel unavailable: no node call, fail closed, retryable", async () => {
    const result = await adjudicateAdvisories({
      kernel: null,
      candidate: makeCandidate({ parentRunId: "run-1" }),
      noteText: NOTE_TEXT,
      patchText: ATTEMPT_PATCH,
      requestIdPrefix: "checkpoint:cp-1",
      config: testConfig("fake-decide/fake-jev"),
    });
    expectFailClosed(result);
    expect(result).toMatchObject({ verdict: "error", error: "reviewer-unavailable: no-node-kernel", retryable: true, extraction: { status: "skipped" } });
    expect(result.advisories.filter((a) => a.severity === "warning").map((a) => a.abstain_reason)).toEqual(["no-node-kernel", "no-node-kernel"]);
  });

  test("no kernel run id: no node call, fail closed, recorded", async () => {
    const kernel = stubKernel();
    const result = await adjudicateAdvisories({
      kernel,
      candidate: makeCandidate({ kernel: null }),
      noteText: NOTE_TEXT,
      patchText: ATTEMPT_PATCH,
      requestIdPrefix: "checkpoint:cp-1",
      config: testConfig("fake-decide/fake-jev"),
    });
    expectFailClosed(result);
    expect(result).toMatchObject({ verdict: "error", error: "reviewer-unavailable: no-kernel-run" });
    expect(result.retryable).toBeUndefined();
    expect(kernel.calls).toEqual([]);
  });

  test("insufficient deadline budget: the fail-closed record needs no kernel and names insufficient time", () => {
    const result = failClosedAdjudication({
      candidate: makeCandidate({ mode: "enforce" }),
      reason: "insufficient-time",
      budgetMs: 12_000,
      config: testConfig("fake-decide/fake-jev"),
    });
    expectFailClosed(result);
    expect(result).toMatchObject({ verdict: "error", applied: true, budget_ms: 12_000, error: "reviewer-unavailable: insufficient-time" });
    expect(foldVerdicts(result.advisories).repairReasons.every((reason) => reason.endsWith(": insufficient time"))).toBe(true);
  });

  test.each<[string, CallFailure]>([
    ["codex-lb down (HTTP 502)", { kind: "http", status: 502 }],
    ["BAML parse error", { kind: "parse", message: "Failed to coerce", rawOutput: "not json" }],
    ["call timeout", { kind: "timeout" }],
  ])("%s: extraction error recorded, no gate, fail closed, not retryable", async (_label, failure) => {
    const h = await setup({ calls: () => fakeFailure(failure) });
    const result = await run(h);

    expectFailClosed(result);
    expect(result).toMatchObject({
      verdict: "error",
      extraction: { status: "error", error_kind: failure.kind },
      error: `reviewer-unavailable: extraction-${failure.kind}`,
    });
    expect(result.extraction.run_id).toBeString();
    expect(result.retryable).toBeUndefined();
    expect(result.gate_span_id).toBeUndefined();
    expect(h.classifier.calls).toHaveLength(0);
    expect(result.advisories.filter((a) => a.severity === "warning").every((a) => a.abstain_reason === "extraction-error")).toBe(true);
  });

  test("TYPESAFE_API_KEY missing: decisions abstain engine-error (not-configured), recorded, no judge even when escalation is on", async () => {
    const h = await setup({ classifierConfigured: false, config: { escalateLowConfidence: true, judgeCanAccept: true } });
    const result = await run(h, { candidate: { mode: "enforce" }, requestIdPrefix: "attempt:ws-1:1" });

    expectFailClosed(result);
    expect(result.verdict).toBe("error");
    const warnings = result.advisories.filter((a) => a.severity === "warning");
    expect(warnings.map((a) => a.abstain_reason)).toEqual(["engine-error", "engine-error"]);
    expect(engineErrorKinds(h, warnings.map((a) => a.decision!.run_id))).toEqual(["not-configured", "not-configured"]);
    expect(h.callNames()).toEqual(["ExtractCheckpointKnowledge"]);
    expect(foldVerdicts(result.advisories).repairReasons[0]).toEndWith(": reviewer unavailable");
  });

  test.each([
    ["Jev 429", { error: "429 Too Many Requests: rate limit exceeded" }],
    ["Jev 5xx", { error: "500 Internal Server Error" }],
    ["malformed answer", { answers: { justified: { type: "bool" as const, probability: 1.7 } } }],
  ])("%s: abstain engine-error, recorded, fail closed", async (_label, reply) => {
    const h = await setup({ decisions: () => reply });
    const result = await run(h);

    expectFailClosed(result);
    expect(result.verdict).toBe("error");
    expect(result.advisories.filter((a) => a.severity === "warning").map((a) => a.abstain_reason)).toEqual(["engine-error", "engine-error"]);
    expect(result.retryable).toBeUndefined();
  });

  test("state over the classifier's token budget: too-large, no request, recorded", async () => {
    const h = await setup({ kernel: { decide: { tokenBudgets: { "fake-decide/*": 50 } } } });
    const result = await run(h);

    expectFailClosed(result);
    const warnings = result.advisories.filter((a) => a.severity === "warning");
    expect(warnings.map((a) => a.abstain_reason)).toEqual(["engine-error", "engine-error"]);
    expect(engineErrorKinds(h, warnings.map((a) => a.decision!.run_id))).toEqual(["too-large", "too-large"]);
    expect(h.classifier.calls).toHaveLength(0);
  });

  test("low-confidence abstain: recorded as unclear; no judge without escalateLowConfidence", async () => {
    const h = await setup({ decisions: () => bool(0.4) });
    const result = await run(h, { candidate: { mode: "enforce" }, requestIdPrefix: "attempt:ws-1:1" });

    expectFailClosed(result);
    expect(result.verdict).toBe("abstain");
    expect(foldVerdicts(result.advisories).repairReasons[0]).toEndWith(": unclear (p=0.40)");
    expect(h.callNames()).toEqual(["ExtractCheckpointKnowledge"]);
  });

  test("kernel DB write failure at the gate: fail closed, retryable, no unpersisted verdict used", async () => {
    const h = await setup();
    const db = new Database(h.temp.tempDb.path);
    db.run(
      "CREATE TRIGGER fail_gate_start BEFORE INSERT ON trace_events WHEN NEW.type = 'gate_start' " +
        "BEGIN SELECT RAISE(ABORT, 'injected gate_start failure'); END",
    );
    db.close();
    const result = await run(h);

    expectFailClosed(result);
    expect(result).toMatchObject({ verdict: "error", retryable: true, extraction: { status: "ok" } });
    expect(result.error).toStartWith("KernelNodeError:");
    expect(h.classifier.calls).toHaveLength(0);
  });

  test("kernel DB write failure at gate_end: the computed but unpersisted verdict is never used", async () => {
    const h = await setup();
    const db = new Database(h.temp.tempDb.path);
    db.run(
      "CREATE TRIGGER fail_gate_end BEFORE INSERT ON trace_events WHEN NEW.type = 'gate_end' " +
        "BEGIN SELECT RAISE(ABORT, 'injected gate_end failure'); END",
    );
    db.close();
    const result = await run(h);

    // Both decisions passed, but the gate never recorded it.
    expect(h.classifier.calls).toHaveLength(2);
    expectFailClosed(result);
    expect(result).toMatchObject({ verdict: "error", retryable: true });
    expect(result.advisories.filter((a) => a.severity === "warning").map((a) => a.abstain_reason)).toEqual(["kernel-error", "kernel-error"]);
  });

  test("a decision whose completion write fails: the gate records it, skips the rest, and the result is retryable", async () => {
    const h = await setup();
    const db = new Database(h.temp.tempDb.path);
    db.run(
      "CREATE TRIGGER fail_decision_made BEFORE INSERT ON trace_events WHEN NEW.type = 'decision_made' " +
        "BEGIN SELECT RAISE(ABORT, 'injected decision_made failure'); END",
    );
    db.close();
    const result = await run(h);

    expectFailClosed(result);
    expect(result).toMatchObject({ verdict: "error", retryable: true });
    expect(result.error).toStartWith("KernelGateError:");
    expect(result.gate_span_id).toBeString();
    expect(result.advisories.filter((a) => a.severity === "warning").map((a) => a.abstain_reason)).toEqual(["kernel-error", "skipped"]);
  });

  test("kernel DB write failure at the extraction claim: extraction error, retryable", async () => {
    const h = await setup();
    const db = new Database(h.temp.tempDb.path);
    db.run(
      "CREATE TRIGGER fail_call_start BEFORE INSERT ON trace_events WHEN NEW.type = 'call_start' " +
        "BEGIN SELECT RAISE(ABORT, 'injected call_start failure'); END",
    );
    db.close();
    const result = await run(h);

    expectFailClosed(result);
    expect(result).toMatchObject({ verdict: "error", retryable: true, extraction: { status: "error", error_kind: "row-write-failed" } });
    expect(h.engine.invocations).toHaveLength(0);
  });

  test.each([
    ["note", { noteText: null }, "evidence-missing: note"],
    ["patch", { patchText: null }, "evidence-missing: patch"],
  ] as const)("%s file missing: evidence-missing, no node call", async (_label, missing, error) => {
    const kernel = stubKernel();
    const result = await adjudicateAdvisories({
      kernel,
      candidate: makeCandidate({ parentRunId: "run-1" }),
      noteText: NOTE_TEXT,
      patchText: ATTEMPT_PATCH,
      requestIdPrefix: "checkpoint:cp-1",
      config: testConfig("fake-decide/fake-jev"),
      ...missing,
    });
    expectFailClosed(result);
    expect(result).toMatchObject({ verdict: "error", error });
    expect(result.retryable).toBeUndefined();
    expect(kernel.calls).toEqual([]);
    expect(foldVerdicts(result.advisories).repairReasons[0]).toEndWith(": evidence missing");
  });

  test("any exception inside adjudication is caught: fail closed, retryable", async () => {
    const kernel = stubKernel({
      call: (async () => {
        throw new TypeError("boom");
      }) as unknown as AdjudicationKernel["call"],
      step: (async (_name: string, _opts: unknown, fn: (span: unknown) => unknown) =>
        fn({ setAttributes() {}, setStatus() {}, addEvent() {}, spanId: "s" })) as unknown as AdjudicationKernel["step"],
    });
    const result = await adjudicateAdvisories({
      kernel,
      candidate: makeCandidate({ parentRunId: "run-1", mode: "enforce" }),
      noteText: NOTE_TEXT,
      patchText: ATTEMPT_PATCH,
      requestIdPrefix: "attempt:ws-1:1",
      config: testConfig("fake-decide/fake-jev"),
    });
    expectFailClosed(result);
    expect(result).toMatchObject({ verdict: "error", retryable: true, extraction: { status: "error", error_kind: "exception" } });
  });

  test("a throwing step and a malformed candidate still resolve fail closed", async () => {
    const kernel = stubKernel({
      call: (async () => {
        throw new Error("down");
      }) as unknown as AdjudicationKernel["call"],
    });
    const thrown = await adjudicateAdvisories({
      kernel,
      candidate: makeCandidate({ parentRunId: "run-1" }),
      noteText: NOTE_TEXT,
      patchText: ATTEMPT_PATCH,
      requestIdPrefix: "checkpoint:cp-1",
      config: testConfig("fake-decide/fake-jev"),
    });
    expectFailClosed(thrown);

    const malformed = await adjudicateAdvisories({
      kernel,
      candidate: { ...makeCandidate({ parentRunId: "run-1" }), advisories: null } as unknown as LlmReviewCandidate,
      noteText: NOTE_TEXT,
      patchText: ATTEMPT_PATCH,
      requestIdPrefix: "checkpoint:cp-1",
    });
    expect(malformed).toMatchObject({ verdict: "error", retryable: true, accepted_fingerprints: [] });
  });

  test("an ineligible candidate or a pre-aborted signal makes no node call", async () => {
    const kernel = stubKernel();
    const base = {
      kernel,
      noteText: NOTE_TEXT,
      patchText: ATTEMPT_PATCH,
      requestIdPrefix: "checkpoint:cp-1",
      config: testConfig("fake-decide/fake-jev"),
    };
    const ineligible = await adjudicateAdvisories({
      ...base,
      candidate: makeCandidate({ parentRunId: "run-1", eligible: false, ineligible_reason: "pre-qa-failed" }),
    });
    expect(ineligible).toMatchObject({ verdict: "error", error: "ineligible: pre-qa-failed" });

    const aborted = await adjudicateAdvisories({
      ...base,
      candidate: makeCandidate({ parentRunId: "run-1" }),
      signal: AbortSignal.abort(),
    });
    expectFailClosed(aborted);
    expect(aborted).toMatchObject({ verdict: "error", error: "reviewer-unavailable: aborted" });
    expect(kernel.calls).toEqual([]);
  });

  test("thresholds missing for the decision model: no node call", async () => {
    const kernel = stubKernel();
    const result = await adjudicateAdvisories({
      kernel,
      candidate: makeCandidate({ parentRunId: "run-1" }),
      noteText: NOTE_TEXT,
      patchText: ATTEMPT_PATCH,
      requestIdPrefix: "checkpoint:cp-1",
      config: { ...testConfig("fake-decide/fake-jev"), thresholds: {} },
    });
    expectFailClosed(result);
    expect(result).toMatchObject({ verdict: "error", error: "reviewer-unavailable: no-thresholds" });
    expect(kernel.calls).toEqual([]);
  });
});

describe("cancellation (§6.6)", () => {
  test("a hanging extraction is cancelled when the signal fires and resolves fail closed promptly", async () => {
    const h = await setup({
      calls: async (req) => {
        await untilAborted(req.signal);
        return fakeFailure({ kind: "aborted" });
      },
    });
    const started = Date.now();
    const result = await run(h, { candidate: { mode: "enforce" }, signal: AbortSignal.timeout(300), requestIdPrefix: "attempt:ws-1:1" });

    expect(Date.now() - started).toBeLessThan(300 + 200);
    expectFailClosed(result);
    expect(result).toMatchObject({
      verdict: "error",
      error: "reviewer-unavailable: timeout",
      extraction: { status: "error", error_kind: "aborted" },
    });
    expect((await h.temp.kernel.doctor()).ok).toBe(true);
  });

  test("a hanging decision is cancelled at the signal: the gate stops and every warning abstains", async () => {
    const h = await setup({ decisions: () => ({ hang: true }) });
    const started = Date.now();
    const result = await run(h, { candidate: { mode: "enforce" }, signal: AbortSignal.timeout(300), requestIdPrefix: "attempt:ws-1:1" });

    expect(Date.now() - started).toBeLessThan(300 + 200);
    expectFailClosed(result);
    expect(result).toMatchObject({ verdict: "error", error: "reviewer-unavailable: timeout", extraction: { status: "ok" } });
    expect(result.gate_span_id).toBeString();
    expect(result.advisories.filter((a) => a.severity === "warning").map((a) => a.abstain_reason)).toEqual(["aborted", "aborted"]);
    expect((await h.temp.kernel.doctor()).ok).toBe(true);
  });

  test("a kernel that ignores the signal is abandoned after the grace; the late result is discarded", async () => {
    let release!: () => void;
    const late = new Promise<void>((resolve) => {
      release = resolve;
    });
    const kernel = stubKernel({
      call: (async () => {
        await late;
        return extractionAnswer({ A1: GOOD, A2: GOOD });
      }) as unknown as AdjudicationKernel["call"],
    });
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 50);
    const started = Date.now();
    const result = await adjudicateAdvisories({
      kernel,
      candidate: makeCandidate({ parentRunId: "run-1", mode: "enforce" }),
      noteText: NOTE_TEXT,
      patchText: ATTEMPT_PATCH,
      requestIdPrefix: "attempt:ws-1:1",
      config: testConfig("fake-decide/fake-jev"),
      signal: controller.signal,
      abortGraceMs: 100,
    });
    release();

    expect(Date.now() - started).toBeLessThan(50 + 100 + 200);
    expectFailClosed(result);
    expect(result).toMatchObject({
      verdict: "error",
      error: "reviewer-unavailable: aborted",
      extraction: { status: "error", error_kind: "aborted" },
    });
  });
});

test("the unanswered extraction leaves later work unpaid: a decision never runs after extraction fails", async () => {
  const h = await setup({ calls: () => fakeFailure({ kind: "http", status: 503 }), decisions: () => bool(0.99) });
  await run(h);
  expect(h.classifier.calls).toHaveLength(0);
  // The fold is still recorded under the worker run.
  const db = new Database(h.temp.tempDb.path, { readonly: true });
  try {
    const folds = db
      .query<{ n: number }, [string]>(
        `SELECT COUNT(*) AS n FROM trace_events WHERE run_id = ? AND type = 'step_end' AND json_extract(event_data, '$.step_name') = 'fold-advisory-verdicts'`,
      )
      .get(h.parentRunId);
    expect(folds?.n).toBe(1);
  } finally {
    db.close();
  }
});

test("extraction output naming unknown findings or duplicates keeps one justification per finding", async () => {
  const h = await setup({
    calls: () =>
      fakeOk({
        advisories: [
          { finding_id: "A9", kept: true, justification: "stray", evidence: [] },
          { finding_id: "A1", kept: true, justification: null, evidence: [] },
          { finding_id: "A1", kept: true, justification: GOOD, evidence: ["objdiff 100%"] },
          { finding_id: "A2", kept: true, justification: "   ", evidence: [] },
        ],
        structured_field_used: false,
      }),
  });
  const result = await run(h);

  expect(result.advisories[0]).toMatchObject({ justification: GOOD, evidence: ["objdiff 100%"], result: "pass" });
  expect(result.advisories[1]).toMatchObject({ justification: null, result: "fail", fail_reason: "justification-missing" });
  expect(result.extraction.structured_field_used).toBe(false);
  expect(result.verdict).toBe("fail");
});
