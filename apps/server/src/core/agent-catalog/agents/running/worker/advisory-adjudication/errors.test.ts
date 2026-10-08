// Plan §4.7 for adjudication records: no exception message ever reaches a
// record (and through it checkpoint metadata, queue rows or logs), whichever
// node threw it; and a requestId reused for a different request is a
// terminal, recorded failure, not a retry.
import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";

import { disableNetwork } from "@agent-kernel/kernel/model-nodes/testing";

import {
  ATTEMPT_PATCH,
  createAdjudicationHarness,
  makeCandidate,
  NOTE_TEXT,
  type AdjudicationHarness,
} from "./__fixtures__/adjudication.js";
import {
  ADVISORY_GATE_NAME,
  ADVISORY_VERDICT_GATE_NAME,
  adjudicateAdvisories,
  failClosedAdjudication,
  isAdjudicationErrorCode,
  sanitizeAdjudicationError,
  sanitizeAdjudicationRecord,
  UNEXPECTED_ERROR,
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

const SENTINEL = `PROMPT_MARKER_${randomUUID()} Authorization: Bearer CRED_MARKER_${randomUUID()}`;

/** Error shapes a kernel layer could throw, each carrying the sentinel in its message (and fields). */
function sentinelErrors(): Array<[string, () => Error]> {
  const named = (name: string, fields: Record<string, unknown>) => () => Object.assign(new Error(SENTINEL), { name, ...fields });
  return [
    ["a plain Error", () => new Error(SENTINEL)],
    ["a TypeError", () => new TypeError(SENTINEL)],
    ["a KernelNodeError", named("KernelNodeError", { code: "row-write-failed" })],
    ["a KernelNodeError with an unknown code", named("KernelNodeError", { code: SENTINEL })],
    ["a KernelCallError", named("KernelCallError", { runId: "run", failure: { kind: "http", status: 500, rawResponse: SENTINEL } })],
    ["a KernelCallError with an unknown kind", named("KernelCallError", { runId: "run", failure: { kind: SENTINEL } })],
    ["a KernelGateError", named("KernelGateError", { gateResult: { checks: [] }, cause: new Error(SENTINEL) })],
  ];
}

type Layer = "call" | "decide" | "gate" | "fold";

/** The harness kernel, with `error` thrown from one layer. */
function throwingAt(h: AdjudicationHarness, layer: Layer, error: () => Error): AdjudicationKernel {
  const real = h.temp.kernel;
  return {
    call: ((...args: Parameters<AdjudicationKernel["call"]>) => {
      if (layer === "call") return Promise.reject(error());
      return real.call(...args);
    }) as AdjudicationKernel["call"],
    decide: ((...args: Parameters<AdjudicationKernel["decide"]>) => {
      if (layer === "decide") return Promise.reject(error());
      return real.decide(...args);
    }) as AdjudicationKernel["decide"],
    step: ((...args: Parameters<AdjudicationKernel["step"]>) => real.step(...args)) as AdjudicationKernel["step"],
    gate: ((...args: Parameters<AdjudicationKernel["gate"]>) => {
      if (layer === "gate" && args[0] === ADVISORY_GATE_NAME) return Promise.reject(error());
      if (layer === "fold" && args[0] === ADVISORY_VERDICT_GATE_NAME) return Promise.reject(error());
      return real.gate(...args);
    }) as AdjudicationKernel["gate"],
  };
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

function expectNoSentinel(result: AdvisoryAdjudication): void {
  expect(JSON.stringify(result)).not.toContain("PROMPT_MARKER_");
  expect(JSON.stringify(result)).not.toContain("CRED_MARKER_");
  if (result.error !== undefined) expect(isAdjudicationErrorCode(result.error)).toBe(true);
  expect(result.verdict).not.toBe("pass");
  expect(result.accepted_fingerprints).toEqual([]);
}

describe("exception messages never reach a record (§4.7)", () => {
  for (const layer of ["call", "decide", "gate", "fold"] as const) {
    test(`thrown from kernel.${layer === "fold" ? "gate (the fold record)" : layer}`, async () => {
      for (const [label, error] of sentinelErrors()) {
        const h = await createAdjudicationHarness();
        try {
          for (const mode of ["shadow", "enforce"] as const) {
            const result = await run(h, {
              kernel: throwingAt(h, layer, error),
              candidate: { mode },
              requestIdPrefix: `${mode}:${layer}:${label}`,
            });
            // A decide failure only loses provenance: the pass cannot be verified, so nothing is accepted.
            expect({ label, mode, leaked: JSON.stringify(result).includes("PROMPT_MARKER_") }).toEqual({ label, mode, leaked: false });
            expectNoSentinel(result);
          }
        } finally {
          h.cleanup();
        }
      }
    });
  }

  test("an unexpected exception records the constant unexpected-error, retryable", async () => {
    const h = await createAdjudicationHarness();
    harness = h;
    const result = await run(h, { kernel: throwingAt(h, "gate", () => new Error(SENTINEL)) });
    expect(result).toMatchObject({ verdict: "error", error: UNEXPECTED_ERROR, retryable: true });
  });

  test("a fail-closed record and the persistence guard accept only fixed codes", () => {
    const candidate = makeCandidate({ mode: "enforce" });
    expect(failClosedAdjudication({ candidate, reason: "exception", error: SENTINEL }).error).toBe(UNEXPECTED_ERROR);
    expect(failClosedAdjudication({ candidate, reason: "insufficient-time" }).error).toBe("reviewer-unavailable: insufficient-time");
    expect(sanitizeAdjudicationError(SENTINEL)).toBe(UNEXPECTED_ERROR);
    expect(sanitizeAdjudicationError("kernel-error: row-write-failed")).toBe("kernel-error: row-write-failed");
    expect(sanitizeAdjudicationError(undefined)).toBeUndefined();

    const record = failClosedAdjudication({ candidate, reason: "insufficient-time" });
    expect(sanitizeAdjudicationRecord({ ...record, error: SENTINEL }).error).toBe(UNEXPECTED_ERROR);
    expect(sanitizeAdjudicationRecord(record)).toBe(record);
    expect(sanitizeAdjudicationRecord(null)).toBeNull();

    // A downgrade reason read back from metadata is recorded only when known.
    const downgraded = failClosedAdjudication({ candidate: { ...candidate, downgraded_reason: SENTINEL }, reason: "insufficient-time" });
    expect(downgraded.downgraded_reason).toBe("unknown");
  });
});

describe("a requestId reused for a different request (invalid-request)", () => {
  test("at the extraction: recorded with a fixed code, not retryable", async () => {
    const h = await createAdjudicationHarness();
    harness = h;
    await run(h, { noteText: "an earlier note under the same checkpoint id" });
    const result = await run(h);

    expect(result).toMatchObject({
      verdict: "error",
      error: "reviewer-unavailable: extraction-invalid-request",
      extraction: { status: "error", error_kind: "invalid-request" },
      accepted_fingerprints: [],
    });
    expect(result.retryable).toBeUndefined();
    expect(h.engine.invocations).toHaveLength(1);
  });

  test("at a decision: recorded with a fixed code, not retryable", async () => {
    const h = await createAdjudicationHarness();
    harness = h;
    // The same note (extraction replays) with a changed hunk: each decision's state differs.
    const changedPatch = ATTEMPT_PATCH.replace("     s32 i;", "     s32 j;");
    await run(h, { patchText: changedPatch });
    const result = await run(h);

    expect(result).toMatchObject({ verdict: "error", error: "kernel-error: invalid-request", accepted_fingerprints: [] });
    expect(result.retryable).toBeUndefined();
    expect(result.advisories.some((a) => a.result === "pass")).toBe(false);
    expect(h.classifier.calls).toHaveLength(2);
  });
});
