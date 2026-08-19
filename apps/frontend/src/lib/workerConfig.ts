import { numberValue } from "./format";

export const DEFAULT_WORKER_TIMEOUT_SECONDS = 3600;

export function workerTimeoutMinutes(value: unknown): number {
  const seconds = numberValue(value, DEFAULT_WORKER_TIMEOUT_SECONDS);
  return Math.max(1, Math.round(seconds / 60));
}

export function workerTimeoutSecondsFromMinutes(value: unknown): number {
  const minutes = Math.max(1, Math.trunc(numberValue(value, DEFAULT_WORKER_TIMEOUT_SECONDS / 60)));
  return minutes * 60;
}
