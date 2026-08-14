export const CANONICAL_PROJECT_ACTION_IDS = [
  "run.start", "run.pause", "run.resume", "run.hard_stop", "run.cancel", "run.recover",
  "pr.open_campaign", "pr.activate", "pr.publish_batch", "pr.release", "pr.close_campaign", "pr.abandon_campaign", "pr.campaign_recover",
  "sync.start", "sync.resolve_conflict", "sync.publish", "sync.cancel", "sync.recover",
  "session.save_point", "session.close",
  "knowledge.process",
] as const;

export type CanonicalProjectActionId = typeof CANONICAL_PROJECT_ACTION_IDS[number];
