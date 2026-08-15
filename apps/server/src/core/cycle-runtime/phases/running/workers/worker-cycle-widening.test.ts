import { describe, expect, test } from "bun:test";
import { parse, writeSetWideningArg } from "@server/core/game-registry/runtime-options.js";
import type { WideningDecision, WideningRequest } from "@server/core/cycle-runtime/run-state/write-set-categories.js";
import {
  parseWorkerWideningRequest,
  shouldApplyWideningDecision,
  shouldExposeWideningDecisionToWorker,
} from "./worker-cycle.js";

const configRequest: WideningRequest = {
  schema_version: "write_set_widening_request_v1",
  paths: ["config/GALE01/symbols.txt"],
  category: "config-metadata",
  rung: 2,
  evidence: {
    mismatched_declaration: {
      symbol: "Ground_801C57F0",
      current: "missing",
      required: "Ground_801C57F0 = .text:0x801C57F0",
      expected_owner: "config/GALE01/symbols.txt",
    },
    objdiff: { unit: "main", score_without: 99, score_with: 100 },
    ladder_evidence: { rung1_in_slice: "Typing the target to the existing declaration retained the mismatch." },
  },
};

function approvedConfigDecision(): WideningDecision {
  return {
    schema_version: "write_set_widening_decision_v1",
    wideningId: "widening-1",
    status: "approved",
    approvedPaths: ["config/GALE01/symbols.txt"],
    validationTier: 2,
    reason: "approved",
    decidedBy: "runner-policy",
  };
}

describe("worker-cycle write-set widening", () => {
  test("parses a structured widening request from the handoff note", () => {
    expect(parseWorkerWideningRequest({ widening_request: configRequest })).toEqual({ request: configRequest });
    expect(parseWorkerWideningRequest({ widening_request: { schema_version: "bad" } }).error).toContain(
      "write_set_widening_request_v1",
    );
    expect(parseWorkerWideningRequest(null)).toEqual({ request: null });
  });

  test("shadow mode is a write-set mutation no-op", () => {
    const decision = approvedConfigDecision();
    expect(shouldApplyWideningDecision("off", decision)).toBe(false);
    expect(shouldApplyWideningDecision("shadow", decision)).toBe(false);
    expect(shouldExposeWideningDecisionToWorker("off")).toBe(false);
    expect(shouldExposeWideningDecisionToWorker("shadow")).toBe(false);
    expect(shouldApplyWideningDecision("config", decision)).toBe(true);
    expect(shouldApplyWideningDecision("header", decision)).toBe(true);
    expect(shouldExposeWideningDecisionToWorker("config")).toBe(true);
    expect(shouldExposeWideningDecisionToWorker("header")).toBe(true);
  });

  test("accepts both equals and separated CLI forms and defaults to off", () => {
    expect(writeSetWideningArg(new Map())).toBe("off");
    expect(writeSetWideningArg(parse(["worker", "--write-set-widening=shadow"]).args)).toBe("shadow");
    expect(writeSetWideningArg(parse(["worker", "--write-set-widening", "header"]).args)).toBe("header");
    expect(() => writeSetWideningArg(new Map([["--write-set-widening", "foreign"]]))).toThrow("off, shadow, config, header");
  });
});
