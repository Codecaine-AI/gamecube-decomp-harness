export const CANONICAL_HARNESS_ACTION_IDS = [
  "run.start", "run.resume", "run.hard_stop", "run.cancel", "run.recover",
  "sync.start", "sync.resolve_conflict", "sync.publish", "sync.cancel", "sync.recover",
  "cycle.save_point", "cycle.close",
  "knowledge.process",
] as const;

export type CanonicalHarnessActionId = typeof CANONICAL_HARNESS_ACTION_IDS[number];
