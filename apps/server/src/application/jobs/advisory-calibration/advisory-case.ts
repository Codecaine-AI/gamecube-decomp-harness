// The BAML inputs a calibration item becomes: the finding reference that
// ExtractCheckpointKnowledge maps justifications to, and the AdvisoryCase that
// LabelAdvisoryJustification and SynthesizeJustification read.
import type { AdvisoryCase, AdvisoryFindingRef } from "@server/generated/baml_client/types";

import { canonicalJson } from "./store.js";
import type { CalibrationItem } from "./types.js";

export function findingRefOf(item: CalibrationItem): AdvisoryFindingRef {
  return {
    id: item.id,
    rule_id: item.finding.rule_id,
    severity: item.finding.severity,
    file: item.finding.file,
    line: item.finding.line,
    excerpt: item.finding.excerpt,
    message: item.finding.message,
  };
}

/** The finding's rule-specific detail as JSON, without the `llm_review` marker; null when nothing else is left. */
function detailOf(item: CalibrationItem): string | null {
  const { llm_review: _marker, ...rest } = item.finding.detail ?? {};
  return Object.keys(rest).length > 0 ? canonicalJson(rest) : null;
}

export function advisoryCaseOf(item: CalibrationItem, justification: string | null): AdvisoryCase {
  return {
    finding: findingRefOf(item),
    detail: detailOf(item),
    hunk: item.hunk,
    justification,
    code_facts: {
      exact: item.code_facts.exact,
      old_score: item.code_facts.old_score,
      new_score: item.code_facts.new_score,
    },
  };
}
