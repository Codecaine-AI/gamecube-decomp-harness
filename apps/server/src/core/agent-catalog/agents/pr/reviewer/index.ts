export { PRESHIP_DIFF_CHAR_LIMIT, prPreshipReviewPrompt, type PrPreshipReviewPromptOptions } from "./prompt.js";
export {
  PRESHIP_REVIEW_SCHEMA_VERSION,
  PRESHIP_PROPOSED_RULE_FAMILIES,
  loadPreshipExhibits,
  preshipExhibitsPath,
  preshipExhibitsPromptXml,
  validatePreshipReview,
  type PreshipExhibit,
  type PreshipExhibitKind,
  type PreshipFindingVerdict,
  type PreshipProposedRule,
  type PreshipProposedRuleFamily,
  type PreshipReview,
  type PreshipReviewFinding,
  type PreshipSliceVerdict,
} from "./preship.js";

export const prReviewerAgent = {
  id: "pr-reviewer",
  role: "pr-reviewer",
  toolProfile: "pr-reviewer",
  schemaPath: "apps/server/src/core/agent-catalog/agents/pr/reviewer/schema.json",
  purpose: "Review planned PR slices for known maintainer issues and report findings for the PR fixer.",
} as const;
