export type RunStatus = "active" | "complete" | "paused" | "failed";

export interface RunRecord {
  id: string;
  goalKind: string;
  goalValue: number;
  desiredWorkers: number;
  status: RunStatus;
  createdAt: string;
}
