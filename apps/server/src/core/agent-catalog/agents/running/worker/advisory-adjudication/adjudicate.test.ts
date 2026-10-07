import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";

import { disableNetwork, fakeOk } from "@agent-kernel/kernel/model-nodes/testing";
import type { DecisionEngine, EngineRequest, EngineResult } from "@agent-kernel/kernel/model-nodes";
import { advisoryFingerprint, fullFlaggedLineFromPatch } from "@server/core/validation/qa/advisory-fingerprint.js";
import type { QaScanFinding } from "@server/core/validation/qa/scan-diff.js";

import {
  ATTEMPT_PATCH,
  bool,
  CAST_A,
  CAST_B,
  createAdjudicationHarness,
  extractionAnswer,
  GOOD,
  LOCAL_INFO,
  makeCandidate,
  NOTE_TEXT,
  type AdjudicationHarness,
} from "./__fixtures__/adjudication.js";
import { adjudicateAdvisories, type AdjudicateAdvisoriesParams } from "./index.js";
import type { LlmReviewCandidate } from "./types.js";

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

function fingerprintOf(finding: QaScanFinding): string {
  const line = fullFlaggedLineFromPatch(ATTEMPT_PATCH, finding.file, finding.line, finding.excerpt);
  if (line === null) throw new Error("fixture line unreadable");
  return advisoryFingerprint(finding, line);
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

function readDb(h: AdjudicationHarness): Database {
  return new Database(h.temp.tempDb.path, { readonly: true });
}

const BY_LINE = (probabilities: Record<number, number>) => (line: number) => bool(probabilities[line] ?? 0.93);

describe("adjudicateAdvisories", () => {
  test("accepts when every warning is judged justified; call, gate, decisions and fold nest under the worker run", async () => {
    const h = await setup();
    const result = await run(h);

    expect(result).toMatchObject({
      schema: "llm_review_adjudication_v1",
      requested_mode: "shadow",
      mode: "shadow",
      verdict: "pass",
      applied: false,
      accepted_fingerprints: [fingerprintOf(CAST_A), fingerprintOf(CAST_B)],
      extraction: { status: "ok", structured_field_used: true },
      model: { requested: h.config.model, served: h.config.model },
      thresholds: { passAt: 0.85, failAt: 0.15, qualification: "exploratory" },
    });
    expect(result.error).toBeUndefined();
    expect(result.retryable).toBeUndefined();
    expect(result.sources.note_sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(result.sources.patch_sha256).toMatch(/^[0-9a-f]{64}$/);

    const [a, b, info] = result.advisories;
    expect(a).toMatchObject({
      fingerprint: fingerprintOf(CAST_A),
      rule_id: "type_erasing_cast",
      severity: "warning",
      line: 1863,
      justification: GOOD,
      evidence: ["objdiff 98.1% -> 100%", "lwz r0,-0x1234(r13)"],
      result: "pass",
      probability: 0.93,
      decision: {
        engine: "pi-ai",
        served_model: h.config.model,
        confidence_source: "native",
        thresholds: { passAt: 0.85, failAt: 0.15 },
      },
    });
    expect(a!.hunk).toContain("+    templates_800[0] = *(char**) &lbl_804DA6C4;");
    expect(a!.hunk_sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(b).toMatchObject({ result: "pass", line: 1864 });
    // Info advisories are recorded from extraction only: no decision, never blocking.
    expect(info).toMatchObject({ rule_id: "stack_local_name", severity: "info", result: "noted", fingerprint: fingerprintOf(LOCAL_INFO) });
    expect(info!.decision).toBeUndefined();
    expect(h.classifier.calls).toHaveLength(2);
    expect(h.callNames()).toEqual(["ExtractCheckpointKnowledge"]);

    // The extraction sees every advisory, warning and info; the decision state is anchored on code facts.
    const [, findingRefs] = h.engine.invocations[0]!.args as [string, Array<{ id: string; severity: string }>];
    expect(findingRefs.map((f) => [f.id, f.severity])).toEqual([["A1", "warning"], ["A2", "warning"], ["A3", "info"]]);
    const state = h.classifier.calls[0]!.context.state as Record<string, unknown>;
    expect(Object.keys(state).sort()).toEqual(
      ["code_facts", "detail", "file", "finding", "flagged_code", "hunk", "justification", "line", "rule_message"],
    );
    expect(state).toMatchObject({ finding: "type_erasing_cast", justification: GOOD, code_facts: { exact: true, old_score: 98.1, new_score: 100 } });
    expect(JSON.stringify(state)).not.toContain("Matched gm_801A4B60");

    const db = readDb(h);
    try {
      const children = db
        .query<{ id: string; agent_name: string; status: string; kind: string }, [string]>(
          `SELECT r.id, r.agent_name, r.status, s.kind FROM agent_runs r JOIN pi_agent_sessions s ON s.id = r.pi_session_id
           WHERE r.parent_run_id = ? ORDER BY r.agent_name`,
        )
        .all(h.parentRunId);
      expect(children.map((r) => [r.agent_name, r.kind, r.status])).toEqual([
        ["ExtractCheckpointKnowledge", "call", "done"],
        ["JudgeAdvisory:A1", "decision", "done"],
        ["JudgeAdvisory:A2", "decision", "done"],
      ]);
      expect(result.extraction.run_id).toBe(children[0]!.id);
      expect(a!.decision!.run_id).toBe(children[1]!.id);

      const spans = db
        .query<{ type: string; span_id: string | null; data: string }, [string]>(
          `SELECT type, span_id, event_data AS data FROM trace_events
           WHERE run_id = ? AND type IN ('gate_start', 'gate_end', 'step_start') ORDER BY timestamp, type`,
        )
        .all(h.parentRunId);
      const gateEnds = spans.filter((s) => s.type === "gate_end").map((s) => ({ spanId: s.span_id, data: JSON.parse(s.data) }));
      const adviseGate = gateEnds.find((g) => g.data.gate_name === "llm-review-advisories")!;
      expect(adviseGate.spanId).toBe(result.gate_span_id!);
      expect(adviseGate.data).toMatchObject({ verdict: "pass" });
      // The fold is an acknowledged record: the verdict gate's one check carries it.
      expect(gateEnds.find((g) => g.data.gate_name === "advisory-verdict")!.data).toMatchObject({
        verdict: "pass",
        checks: [{ name: "fold-advisory-verdicts", result: "pass", value: "pass" }],
      });
      const stepNames = spans.filter((s) => s.type === "step_start").map((s) => JSON.parse(s.data).step_name);
      expect(stepNames).toEqual(["justification:A1", "justification:A2", "fold-advisory-verdicts"]);
      // Decisions fold under the gate.
      const decisionStart = db
        .query<{ data: string }, [string]>(`SELECT event_data AS data FROM trace_events WHERE type = 'call_start' AND run_id = ?`)
        .get(a!.decision!.run_id)!;
      expect(JSON.parse(decisionStart.data)).toMatchObject({ gate_span_id: result.gate_span_id, function_name: "JudgeAdvisory:A1" });
    } finally {
      db.close();
    }
    expect((await h.temp.kernel.doctor()).ok).toBe(true);
  });

  test("a decision at or below failAt rejects; a missing justification fails with no decision", async () => {
    const h = await setup({
      calls: () => fakeOk(extractionAnswer({ A1: GOOD, A2: null })),
      decisions: BY_LINE({ 1863: 0.08 }),
    });
    const result = await run(h);

    expect(result.verdict).toBe("fail");
    expect(result.accepted_fingerprints).toEqual([]);
    expect(result.advisories[0]).toMatchObject({ result: "fail", fail_reason: "judged-unjustified", probability: 0.08 });
    expect(result.advisories[1]).toMatchObject({ result: "fail", fail_reason: "justification-missing", justification: null });
    expect(result.advisories[1]!.decision).toBeUndefined();
    // Only the justified warning reached the classifier.
    expect(h.classifier.calls).toHaveLength(1);
  });

  test("one warning accepted and one rejected: the verdict fails and only the accepted one is listed", async () => {
    const h = await setup({ decisions: BY_LINE({ 1863: 0.91, 1864: 0.05 }) });
    const result = await run(h);

    expect(result.verdict).toBe("fail");
    expect(result.accepted_fingerprints).toEqual([fingerprintOf(CAST_A)]);
    expect(result.advisories.map((a) => a.result)).toEqual(["pass", "fail", "noted"]);
  });

  test("a probability between the bars abstains at low confidence", async () => {
    const h = await setup({ decisions: BY_LINE({ 1864: 0.52 }) });
    const result = await run(h);

    expect(result.verdict).toBe("abstain");
    expect(result.advisories[1]).toMatchObject({ result: "abstain", abstain_reason: "low-confidence", probability: 0.52 });
    expect(result.accepted_fingerprints).toEqual([fingerprintOf(CAST_A)]);
  });

  test("a retry with the same requestIdPrefix replays every node instead of re-paying", async () => {
    const h = await setup();
    const first = await run(h);
    const second = await run(h);

    expect(h.engine.invocations).toHaveLength(1);
    expect(h.classifier.calls).toHaveLength(2);
    expect(second.verdict).toBe(first.verdict);
    expect(second.accepted_fingerprints).toEqual(first.accepted_fingerprints);
    expect(second.gate_span_id).toBe(first.gate_span_id!);
    expect(second.advisories.map((a) => a.decision?.run_id)).toEqual(first.advisories.map((a) => a.decision?.run_id));
    expect((await h.temp.kernel.doctor()).ok).toBe(true);
  });

  test("an unreadable flagged line is never accepted, even when judged justified", async () => {
    const h = await setup();
    // Line 1865 is a context line (not added), so the patch holds no flagged line for it.
    const moved = { ...CAST_B, line: 1865 };
    const result = await run(h, {
      candidate: {
        mode: "enforce",
        advisories: [
          // A fingerprint the patch does not reproduce is not trusted either.
          { fingerprint: "af2:0000", finding: CAST_A },
          { fingerprint: null, finding: moved },
        ],
      },
    });

    expect(result.verdict).toBe("fail");
    expect(result.accepted_fingerprints).toEqual([]);
    expect(result.advisories.map((a) => [a.fingerprint, a.result, a.fail_reason])).toEqual([
      [null, "fail", "evidence-unreadable"],
      [null, "fail", "evidence-unreadable"],
    ]);
  });

  test("a pass served by a model other than the calibrated one is not accepted", async () => {
    const engine: DecisionEngine = {
      async classify(request: EngineRequest): Promise<EngineResult> {
        return {
          ok: true,
          engine: "jev",
          api: "typesafe-system-one",
          provider: "fake-decide",
          requestedModel: request.model,
          resolvedModel: "fake-decide/jev-2.0.0",
          answers: { justified: { type: "bool", probability: 0.97 } },
          latencyMs: 1,
          attempts: 1,
          startedAtMs: Date.now(),
          secrets: [],
        };
      },
    };
    const h = await setup({ kernel: { decide: { engine } } });
    const result = await run(h);

    expect(result.verdict).toBe("error");
    expect(result.accepted_fingerprints).toEqual([]);
    expect(result.advisories[0]).toMatchObject({
      result: "abstain",
      abstain_reason: "served-model-unverified",
      probability: 0.97,
      decision: { engine: "jev", served_model: "fake-decide/jev-2.0.0" },
    });
    expect(result.model.served).toBe("fake-decide/jev-2.0.0");
  });

  test("enforce is applied and records its budget; a downgraded candidate records the requested mode", async () => {
    const h = await setup();
    const enforced = await run(h, { candidate: { mode: "enforce" }, budgetMs: 45_000, requestIdPrefix: "attempt:ws-1:2" });
    expect(enforced).toMatchObject({ mode: "enforce", requested_mode: "enforce", applied: true, budget_ms: 45_000, verdict: "pass" });

    const downgraded = await run(h, {
      candidate: { mode: "shadow", requested_mode: "enforce", downgraded_reason: "not-enforcement-qualified" },
      requestIdPrefix: "checkpoint:cp-2",
    });
    expect(downgraded).toMatchObject({
      mode: "shadow",
      requested_mode: "enforce",
      downgraded_reason: "not-enforcement-qualified",
      applied: false,
    });
    expect(downgraded.budget_ms).toBeUndefined();
  });
});

describe("escalation", () => {
  const judgement = (verdict: string) =>
    fakeOk({ verdict, rationale: "The hunk shows the lwz the cast produces.", confidence: { value: 0.9, checks: { in_range: { name: "in_range", expr: "", status: "succeeded" } } } });

  function judgeScript(verdict: string) {
    return (req: { name: string }) =>
      req.name === "JudgeAdvisoryWithRationale" ? judgement(verdict) : fakeOk(extractionAnswer({ A1: GOOD, A2: GOOD }));
  }

  test("the judge runs only for low-confidence abstains, in enforce, with escalateLowConfidence", async () => {
    const h = await setup({
      calls: judgeScript("REJECTED"),
      decisions: BY_LINE({ 1863: 0.5, 1864: 0.95 }),
      config: { escalateLowConfidence: true },
    });
    const result = await run(h, { candidate: { mode: "enforce" }, requestIdPrefix: "attempt:ws-1:1" });

    expect(h.callNames()).toEqual(["ExtractCheckpointKnowledge", "JudgeAdvisoryWithRationale"]);
    const judged = h.engine.invocations[1]!.args[0] as { finding: { id: string }; justification: string | null };
    expect(judged.finding.id).toBe("A1");
    expect(judged.justification).toBe(GOOD);
    expect(result.verdict).toBe("fail");
    expect(result.advisories[0]).toMatchObject({
      result: "fail",
      fail_reason: "judge-rejected",
      probability: 0.5,
      judge: { verdict: "REJECTED", rationale: "The hunk shows the lwz the cast produces." },
    });
    expect(result.advisories[1]!.judge).toBeUndefined();

    // Shadow never escalates, and enforce does not without the flag.
    const shadow = await run(h, { requestIdPrefix: "checkpoint:cp-shadow" });
    expect(shadow.verdict).toBe("abstain");
    const unflagged = await run(h, {
      candidate: { mode: "enforce" },
      requestIdPrefix: "attempt:ws-1:3",
      config: { ...h.config, escalateLowConfidence: false },
    });
    expect(unflagged.verdict).toBe("abstain");
    expect(h.callNames().filter((name) => name === "JudgeAdvisoryWithRationale")).toHaveLength(1);
  });

  test("an ACCEPTED judgement accepts only when judgeCanAccept", async () => {
    const h = await setup({ calls: judgeScript("ACCEPTED"), decisions: BY_LINE({ 1863: 0.5 }), config: { escalateLowConfidence: true } });

    const cannot = await run(h, { candidate: { mode: "enforce" }, requestIdPrefix: "attempt:ws-1:1" });
    expect(cannot.verdict).toBe("abstain");
    expect(cannot.advisories[0]).toMatchObject({ result: "abstain", abstain_reason: "low-confidence", judge: { verdict: "ACCEPTED" } });

    const can = await run(h, {
      candidate: { mode: "enforce" },
      requestIdPrefix: "attempt:ws-1:2",
      config: { ...h.config, judgeCanAccept: true },
    });
    expect(can.verdict).toBe("pass");
    expect(can.accepted_fingerprints).toEqual([fingerprintOf(CAST_A), fingerprintOf(CAST_B)]);
  });
});
