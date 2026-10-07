import { describe, expect, test } from "bun:test";
import { applyJudgement, foldVerdicts, type AdvisoryJudgeOutcome } from "./fold.js";
import type { AdjudicatedAdvisory, AdvisoryAbstainReason } from "./types.js";

let nextLine = 10;

/** A warning accepted at the decision step; override what the case needs. */
function advisory(overrides: Partial<AdjudicatedAdvisory> = {}): AdjudicatedAdvisory {
  nextLine += 1;
  return {
    fingerprint: `af2:${nextLine.toString(16).padStart(64, "0")}`,
    rule_id: "type_erasing_cast",
    standard_id: "global_standard:typed-fields-over-pointer-math",
    severity: "warning",
    file: "src/melee/lb/lbsnap.c",
    line: nextLine,
    excerpt: "lbSnap_Apply((void*)&fighter->mv, 0x24);",
    hunk: null,
    hunk_sha256: null,
    justification: "objdiff shows the cast is required to match 0x24.",
    evidence: [],
    result: "pass",
    probability: 0.97,
    ...overrides,
  };
}

const abstain = (reason: AdvisoryAbstainReason, probability?: number) =>
  advisory({ result: "abstain", abstain_reason: reason, probability });
const info = (overrides: Partial<AdjudicatedAdvisory> = {}) => advisory({ severity: "info", result: "noted", ...overrides });

describe("foldVerdicts", () => {
  test("passes only when every warning was accepted with a fingerprint; info advisories never count", () => {
    expect(foldVerdicts([advisory(), advisory(), info()]).verdict).toBe("pass");
    expect(foldVerdicts([advisory(), info({ result: "fail", fail_reason: "judged-unjustified" })]).verdict).toBe("pass");
    expect(foldVerdicts([advisory(), info({ result: "pass", fingerprint: null })]).verdict).toBe("pass");
  });

  test("one rejected warning fails the attempt whatever the others say", () => {
    const rejected = advisory({ result: "fail", fail_reason: "judged-unjustified", probability: 0.05 });
    expect(foldVerdicts([advisory(), abstain("low-confidence", 0.5), abstain("engine-error"), rejected]).verdict).toBe("fail");
    expect(foldVerdicts([rejected, abstain("insufficient-time")]).verdict).toBe("fail");
  });

  test("an accepted warning without a readable fingerprint fails the attempt", () => {
    expect(foldVerdicts([advisory(), advisory({ fingerprint: null })]).verdict).toBe("fail");
  });

  test("abstains when nothing failed and every undecided warning is only unclear", () => {
    expect(foldVerdicts([advisory(), abstain("low-confidence", 0.52), info()]).verdict).toBe("abstain");
  });

  test("errors when a warning could not be adjudicated and none failed", () => {
    const unavailable: AdvisoryAbstainReason[] = ["engine-error", "aborted", "insufficient-time", "served-model-unverified", "extraction-error"];
    for (const reason of unavailable) {
      expect({ reason, verdict: foldVerdicts([advisory(), abstain("low-confidence", 0.5), abstain(reason)]).verdict }).toEqual({
        reason,
        verdict: "error",
      });
    }
  });

  test("errors when there is no warning to decide", () => {
    expect(foldVerdicts([info(), info()]).verdict).toBe("error");
    expect(foldVerdicts([]).verdict).toBe("error");
  });

  test("acceptedFingerprints keeps accepted warnings only, de-duplicated and in order, even when the verdict fails", () => {
    const a = advisory({ fingerprint: "af2:a" });
    const c = advisory({ fingerprint: "af2:c" });
    const fold = foldVerdicts([
      a,
      advisory({ fingerprint: "af2:b", result: "fail", fail_reason: "justification-missing" }),
      advisory({ fingerprint: "af2:a", line: 99 }),
      info({ fingerprint: "af2:info", result: "pass" }),
      abstain("low-confidence", 0.5),
      advisory({ fingerprint: null }),
      c,
    ]);
    expect(fold.verdict).toBe("fail");
    expect(fold.acceptedFingerprints).toEqual(["af2:a", "af2:c"]);
  });

  test("repairReasons gives one line per warning not accepted, naming rule, location, fingerprint and reason", () => {
    const cases: Array<[AdjudicatedAdvisory, string]> = [
      [advisory({ result: "fail", fail_reason: "justification-missing" }), "justification missing"],
      [advisory({ result: "fail", fail_reason: "judged-unjustified", probability: 0.123 }), "judged unjustified (p=0.12)"],
      [abstain("low-confidence", 0.52), "unclear (p=0.52)"],
      [abstain("engine-error"), "reviewer unavailable"],
      [abstain("insufficient-time"), "insufficient time"],
      [advisory({ fingerprint: null }), "flagged line unreadable"],
      [advisory({ result: "fail", fail_reason: "evidence-unreadable", fingerprint: null }), "flagged line unreadable"],
      [abstain("evidence-missing"), "evidence missing"],
    ];
    const { repairReasons } = foldVerdicts([advisory(), info(), ...cases.map(([entry]) => entry), advisory()]);
    expect(repairReasons).toHaveLength(cases.length);
    cases.forEach(([entry, reason], index) => {
      const line = repairReasons[index]!;
      expect(line.endsWith(`: ${reason}`)).toBe(true);
      expect(line).toContain(entry.rule_id);
      expect(line).toContain(`${entry.file}:${entry.line}`);
      expect(line).toContain(entry.fingerprint ?? "unavailable");
    });
  });
});

describe("applyJudgement", () => {
  const judge = (verdict: string, overrides: Partial<AdvisoryJudgeOutcome> = {}): AdvisoryJudgeOutcome => ({
    verdict,
    rationale: "The note cites the objdiff offset.",
    valid: true,
    run_id: "run-judge-1",
    ...overrides,
  });

  test("REJECTED turns a low-confidence abstain into a judge-rejected fail, even from an invalid judgement", () => {
    const unclear = abstain("low-confidence", 0.5);
    for (const outcome of [judge("REJECTED"), judge("REJECTED", { valid: false })]) {
      const judged = applyJudgement(unclear, outcome, { judgeCanAccept: false });
      expect(judged.result).toBe("fail");
      expect(judged.fail_reason).toBe("judge-rejected");
      expect(judged).not.toHaveProperty("abstain_reason");
      expect(judged.judge).toStrictEqual({ verdict: "REJECTED", rationale: outcome.rationale, run_id: "run-judge-1" });
    }
    expect(unclear.result).toBe("abstain");
    expect(unclear).not.toHaveProperty("judge");
  });

  test("ACCEPTED accepts only when the judge may accept and its judgement is valid", () => {
    const unclear = abstain("low-confidence", 0.5);
    const accepted = applyJudgement(unclear, judge("ACCEPTED"), { judgeCanAccept: true });
    expect(accepted.result).toBe("pass");
    expect(accepted).not.toHaveProperty("abstain_reason");
    expect(foldVerdicts([accepted]).verdict).toBe("pass");

    for (const [outcome, judgeCanAccept] of [
      [judge("ACCEPTED"), false],
      [judge("ACCEPTED", { valid: false }), true],
    ] as const) {
      const kept = applyJudgement(unclear, outcome, { judgeCanAccept });
      expect(kept.result).toBe("abstain");
      expect(kept.abstain_reason).toBe("low-confidence");
      expect(kept.judge?.verdict).toBe("ACCEPTED");
    }
  });

  test("NEEDS_INFO or a failed judge call keeps the abstain and records the judgement", () => {
    const unclear = abstain("low-confidence", 0.5);
    for (const verdict of ["NEEDS_INFO", "error:timeout"]) {
      const kept = applyJudgement(unclear, judge(verdict, { run_id: undefined }), { judgeCanAccept: true });
      expect(kept).toStrictEqual({ ...unclear, judge: { verdict, rationale: "The note cites the objdiff offset." } });
    }
  });

  test("leaves decided and unavailable advisories as they were, apart from the judge record", () => {
    for (const entry of [
      advisory(),
      advisory({ result: "fail", fail_reason: "judged-unjustified", probability: 0.1 }),
      abstain("engine-error"),
    ]) {
      for (const verdict of ["REJECTED", "ACCEPTED"]) {
        const judged = applyJudgement(entry, judge(verdict), { judgeCanAccept: true });
        expect(judged).toStrictEqual({ ...entry, judge: { verdict, rationale: "The note cites the objdiff offset.", run_id: "run-judge-1" } });
      }
    }
  });
});
