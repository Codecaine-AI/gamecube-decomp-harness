export const CANONICAL_HARNESS_ACTION_IDS = [
  "run.start", "run.resume", "run.hard_stop", "run.cancel", "run.recover",
  "pr.open_campaign", "pr.activate", "pr.publish_batch", "pr.release", "pr.close_campaign", "pr.abandon_campaign", "pr.campaign_recover",
  "sync.start", "sync.resolve_conflict", "sync.publish", "sync.cancel", "sync.recover",
  "cycle.save_point", "cycle.close",
  "knowledge.process",
] as const;

export type CanonicalHarnessActionId = typeof CANONICAL_HARNESS_ACTION_IDS[number];
