export type AttemptKind = "worker_run" | "qa_repair";
export type AttemptOutcome = "failed" | "partial" | "success";

export interface AttemptWorkerStateRow {
  id: string;
  target_key: string;
  started_at: string | null;
  ended_at: string | null;
  baseline_score: number | null;
  best_score: number | null;
  exact: number | boolean;
}

export interface AttemptCheckpointRow {
  id: string;
  worker_state_id: string;
  attempt_index: number;
  validation_time: string;
  old_score: number | null;
  new_score: number | null;
  delta: number | null;
  exact_match: number | boolean;
  improved_over_baseline: number | boolean;
}

export interface AttemptCheckpointOutcome {
  checkpoint_id: string;
  attempt_index: number;
  outcome: AttemptOutcome;
  at: string;
  old_score: number | null;
  new_score: number | null;
  delta: number | null;
}

export interface AttemptRecord {
  id: string;
  kind: AttemptKind;
  provenance: "observed";
  worker_state_id: string;
  target: string;
  before_score: number | null;
  after_score: number | null;
  exact: boolean;
  outcomes: AttemptCheckpointOutcome[];
  started_at: string | null;
  ended_at: string | null;
}

export interface AttemptRecordOptions {
  kind?: AttemptKind;
}

export type AttemptCheckpointsByWorkerId =
  | ReadonlyMap<string, readonly AttemptCheckpointRow[]>
  | Readonly<Record<string, readonly AttemptCheckpointRow[]>>;

type AttemptCheckpointSource = AttemptCheckpointsByWorkerId | readonly AttemptCheckpointRow[];

function isCheckpointList(checkpoints: AttemptCheckpointSource): checkpoints is readonly AttemptCheckpointRow[] {
  return Array.isArray(checkpoints);
}

function isCheckpointMap(
  checkpoints: AttemptCheckpointsByWorkerId,
): checkpoints is ReadonlyMap<string, readonly AttemptCheckpointRow[]> {
  return typeof (checkpoints as ReadonlyMap<string, readonly AttemptCheckpointRow[]>).get === "function";
}

function checkpointOutcome(checkpoint: AttemptCheckpointRow): AttemptOutcome {
  if (checkpoint.exact_match) return "success";
  if (checkpoint.improved_over_baseline || (typeof checkpoint.delta === "number" && checkpoint.delta > 0)) return "partial";
  return "failed";
}

function compareCheckpoints(left: AttemptCheckpointRow, right: AttemptCheckpointRow): number {
  const attemptOrder = left.attempt_index - right.attempt_index;
  if (attemptOrder !== 0) return attemptOrder;
  if (left.validation_time < right.validation_time) return -1;
  if (left.validation_time > right.validation_time) return 1;
  return 0;
}

export function buildAttemptRecord(
  worker: AttemptWorkerStateRow,
  checkpoints: readonly AttemptCheckpointRow[],
  options: AttemptRecordOptions = {},
): AttemptRecord {
  const outcomes = checkpoints
    .filter((checkpoint) => checkpoint.worker_state_id === worker.id)
    .sort(compareCheckpoints)
    .map((checkpoint): AttemptCheckpointOutcome => ({
      checkpoint_id: checkpoint.id,
      attempt_index: checkpoint.attempt_index,
      outcome: checkpointOutcome(checkpoint),
      at: checkpoint.validation_time,
      old_score: checkpoint.old_score,
      new_score: checkpoint.new_score,
      delta: checkpoint.delta,
    }));

  return {
    id: `attempt:${worker.id}`,
    kind: options.kind ?? "worker_run",
    provenance: "observed",
    worker_state_id: worker.id,
    target: worker.target_key,
    before_score: worker.baseline_score,
    after_score: worker.best_score,
    exact: Boolean(worker.exact),
    outcomes,
    started_at: worker.started_at,
    ended_at: worker.ended_at,
  };
}

export function buildAttemptRecords(
  workers: readonly AttemptWorkerStateRow[],
  checkpoints: AttemptCheckpointSource,
  options: AttemptRecordOptions = {},
): AttemptRecord[] {
  if (isCheckpointList(checkpoints)) {
    const grouped = new Map<string, AttemptCheckpointRow[]>();
    for (const checkpoint of checkpoints) {
      const workerCheckpoints = grouped.get(checkpoint.worker_state_id) ?? [];
      workerCheckpoints.push(checkpoint);
      grouped.set(checkpoint.worker_state_id, workerCheckpoints);
    }
    return workers.map((worker) => buildAttemptRecord(worker, grouped.get(worker.id) ?? [], options));
  }

  if (isCheckpointMap(checkpoints)) {
    return workers.map((worker) => buildAttemptRecord(worker, checkpoints.get(worker.id) ?? [], options));
  }

  return workers.map((worker) => buildAttemptRecord(worker, checkpoints[worker.id] ?? [], options));
}
