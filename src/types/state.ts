export type EventType =
  | "run_started"
  | "run_status_changed"
  | "worker_finished"
  | "worker_stalled"
  | "needs_fact"
  | "score_candidate"
  | "pool_below_target";
