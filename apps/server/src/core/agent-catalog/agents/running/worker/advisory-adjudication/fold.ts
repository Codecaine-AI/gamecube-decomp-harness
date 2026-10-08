// Folding per-advisory results into the attempt verdict (plan §6.5 step 4).
// Only warnings count: info advisories are "noted" and never block. The
// verdict is fail closed: one rejected warning fails it, and it passes only
// when every warning was accepted with a readable fingerprint.
import type { AdjudicatedAdvisory, AdvisoryVerdict } from "./types.js";

export interface FoldResult {
  verdict: AdvisoryVerdict;
  /** Fingerprints of the warnings accepted on their own, in advisory order, without duplicates. */
  acceptedFingerprints: string[];
  /** One line per warning not accepted, naming its rule, location, fingerprint and reason (enforce repair feedback). */
  repairReasons: string[];
}

function formatP(probability: number | undefined): string {
  return probability === undefined ? "" : ` (p=${probability.toFixed(2)})`;
}

/**
 * Why a warning is not accepted, in the words of the enforce repair
 * instruction ("justification missing", "judged unjustified (p=0.12)",
 * "unclear (p=0.52)", "reviewer unavailable", "insufficient time"), or null
 * when it is accepted or is not a warning.
 */
export function advisoryRejectionReason(advisory: AdjudicatedAdvisory): string | null {
  if (advisory.severity !== "warning") return null;
  if (advisory.result === "pass") return advisory.fingerprint === null ? "flagged line unreadable" : null;
  if (advisory.result === "fail") {
    switch (advisory.fail_reason) {
      case "justification-missing":
        return "justification missing";
      case "judged-unjustified":
        return `judged unjustified${formatP(advisory.probability)}`;
      case "judge-rejected":
        return `judged unjustified on review${formatP(advisory.probability)}`;
      case "evidence-unreadable":
        return "flagged line unreadable";
      default:
        return "rejected";
    }
  }
  if (advisory.result === "abstain") {
    switch (advisory.abstain_reason) {
      case "low-confidence":
        return `unclear${formatP(advisory.probability)}`;
      case "insufficient-time":
        return "insufficient time";
      case "evidence-missing":
        return "evidence missing";
      default:
        return "reviewer unavailable";
    }
  }
  return "reviewer unavailable";
}

function isAccepted(advisory: AdjudicatedAdvisory): boolean {
  return advisory.result === "pass" && advisory.fingerprint !== null;
}

export function foldVerdicts(advisories: readonly AdjudicatedAdvisory[]): FoldResult {
  const warnings = advisories.filter((advisory) => advisory.severity === "warning");
  const acceptedFingerprints = [
    ...new Set(warnings.filter(isAccepted).map((advisory) => advisory.fingerprint as string)),
  ];
  const repairReasons = warnings.flatMap((advisory) => {
    const reason = advisoryRejectionReason(advisory);
    if (reason === null) return [];
    return [
      `llm_review advisory ${advisory.rule_id} at ${advisory.file}:${advisory.line} ` +
        `(fingerprint ${advisory.fingerprint ?? "unavailable"}): ${reason}`,
    ];
  });

  let verdict: AdvisoryVerdict;
  if (warnings.some((a) => a.result === "fail" || (a.result === "pass" && a.fingerprint === null))) verdict = "fail";
  else if (warnings.length > 0 && warnings.every(isAccepted)) verdict = "pass";
  else if (warnings.length > 0 && warnings.every((a) => isAccepted(a) || (a.result === "abstain" && a.abstain_reason === "low-confidence"))) {
    verdict = "abstain";
  } else verdict = "error";

  return { verdict, acceptedFingerprints, repairReasons };
}

export interface AdvisoryJudgeOutcome {
  /** "ACCEPTED" | "REJECTED" | "NEEDS_INFO", or "error" when the judge call failed. */
  verdict: string;
  rationale: string;
  /** The judgement's confidence passed its in-range check. */
  valid: boolean;
  run_id?: string;
}

/**
 * Applies an escalation judgement to a low-confidence abstain: REJECTED
 * rejects (rejecting is always safe), ACCEPTED accepts only when
 * `judgeCanAccept` and the judgement is valid, anything else leaves the
 * abstain. Other advisories are returned unchanged apart from the record.
 */
export function applyJudgement(
  advisory: AdjudicatedAdvisory,
  judge: AdvisoryJudgeOutcome,
  opts: { judgeCanAccept: boolean },
): AdjudicatedAdvisory {
  const record = {
    verdict: judge.verdict,
    rationale: judge.rationale,
    ...(judge.run_id !== undefined && { run_id: judge.run_id }),
  };
  const withJudge: AdjudicatedAdvisory = { ...advisory, judge: record };
  if (advisory.result !== "abstain" || advisory.abstain_reason !== "low-confidence") return withJudge;
  if (judge.verdict === "REJECTED") {
    const { abstain_reason: _abstain, ...rest } = withJudge;
    return { ...rest, result: "fail", fail_reason: "judge-rejected" };
  }
  if (judge.verdict === "ACCEPTED" && judge.valid && opts.judgeCanAccept) {
    const { abstain_reason: _abstain, ...rest } = withJudge;
    return { ...rest, result: "pass" };
  }
  return withJudge;
}
