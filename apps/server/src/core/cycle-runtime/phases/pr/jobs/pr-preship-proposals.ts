/**
 * Pure conversion of pre-ship reviewer `proposed_rules[]` output into
 * decomp_standards proposal records.
 *
 * Kept free of kernel/agent-runtime imports so it can be unit-tested without
 * loading the (heavy, currently-flaky) agent kernel. The records match the
 * curator's `source_update_proposal` / `update_kind: global_standard` shape so
 * the existing operator/curator review flow and the decomp_standards
 * proposals.py reader (`payload.target_source_id == "decomp_standards"`) surface
 * them. Accumulate-only: these are never auto-applied.
 */
import { createHash } from "node:crypto";
import { KNOWLEDGE_CURATOR_SCHEMA_VERSION, type CuratedKnowledgeRecord } from "@server/core/knowledge";
import type { PreshipProposedRule } from "@server/core/agent-catalog/agents/pr/reviewer";

/** Record-id source segment so proposal_records() / a curator rebuild can attribute these. */
export const PRESHIP_PROPOSAL_SOURCE = "preship_reviewer";
/** Proposal-only records must never present as auto-appliable; cap confidence like the curator does. */
export const PRESHIP_PROPOSAL_CONFIDENCE = 0.4;

function shortHash(value: string): string {
  return createHash("sha1").update(value).digest("hex").slice(0, 16);
}

export function preshipProposedRuleRecords(params: {
  proposedRules: PreshipProposedRule[];
  runId: string;
  sliceId: string;
  reviewPath?: string | null;
  now?: () => Date;
}): CuratedKnowledgeRecord[] {
  const createdAt = (params.now?.() ?? new Date()).toISOString();
  const records: CuratedKnowledgeRecord[] = [];
  for (const rule of params.proposedRules) {
    const material = `${params.sliceId}:${rule.family}:${rule.standard_id ?? ""}:${rule.description}:${rule.example_excerpt}`;
    const id = `source_update_proposal:${PRESHIP_PROPOSAL_SOURCE}:${shortHash(material)}`;
    const detectorNote = rule.suggested_detector ? ` Suggested detector: ${rule.suggested_detector}.` : "";
    const text = `Proposal-only lint-rule sketch from the pre-ship reviewer (slice ${params.sliceId}, run ${params.runId}). Family: ${rule.family}. ${rule.description}${detectorNote} Offending excerpt: ${rule.example_excerpt}`;
    records.push({
      schema_version: KNOWLEDGE_CURATOR_SCHEMA_VERSION,
      id,
      kind: "source_update_proposal",
      status: "proposal",
      trust_tier: "local",
      confidence: PRESHIP_PROPOSAL_CONFIDENCE,
      title: `Proposed lint rule for ${rule.family} from pre-ship reviewer (slice ${params.sliceId})`,
      text,
      evidence_ref: params.reviewPath ?? "",
      created_at: createdAt,
      payload: {
        target_source_id: "decomp_standards",
        update_kind: "global_standard",
        mutation_policy: "proposal_only",
        source: PRESHIP_PROPOSAL_SOURCE,
        run_id: params.runId,
        slice_id: params.sliceId,
        proposed_rule: {
          kind: rule.kind,
          family: rule.family,
          standard_id: rule.standard_id,
          description: rule.description,
          example_excerpt: rule.example_excerpt,
          suggested_detector: rule.suggested_detector,
        },
        source_path: null,
        evidence_refs: params.reviewPath ? [params.reviewPath] : [],
        owner_review_reason:
          "Pre-ship reviewer flagged a violation it had to judge by hand and proposed a deterministic lint rule; accumulate-only until the standards owner reviews it.",
        reason: "The pre-ship reviewer proposed a new deterministic decomp-standards lint rule; owner review required before any rule is added.",
      },
    });
  }
  return records;
}
