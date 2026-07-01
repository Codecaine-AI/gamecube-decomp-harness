import { asObject, numberValue, type ToolConcurrencySettings } from "./format";

export const DEFAULT_WORKER_TIMEOUT_SECONDS = 1800;

export const DEFAULT_TOOL_CONCURRENCY: ToolConcurrencySettings = {
  checkdiff: 20,
  compile: 12,
  m2cDecomp: 15,
  mwccDebug: 6,
  other: 20,
  sourcePermuter: 3,
  sourcePermuterJobs: 1,
};

export const toolConcurrencyRows: Array<{
  key: keyof ToolConcurrencySettings;
  label: string;
  max: number;
}> = [
  { key: "compile", label: "Compile slots", max: 64 },
  { key: "checkdiff", label: "Checkdiff", max: 64 },
  { key: "m2cDecomp", label: "M2C", max: 64 },
  { key: "mwccDebug", label: "MWCC debug", max: 64 },
  { key: "sourcePermuter", label: "Permuter calls", max: 64 },
  { key: "sourcePermuterJobs", label: "Permuter jobs", max: 16 },
  { key: "other", label: "Other tools", max: 64 },
];

function boundedSlot(value: unknown, fallback: number, max: number): number {
  const parsed = Math.trunc(numberValue(value, fallback));
  return Math.max(1, Math.min(max, Number.isFinite(parsed) ? parsed : fallback));
}

export function normalizeToolConcurrency(value: unknown, fallback: ToolConcurrencySettings = DEFAULT_TOOL_CONCURRENCY): ToolConcurrencySettings {
  const raw = asObject(value);
  return {
    checkdiff: boundedSlot(raw.checkdiff, fallback.checkdiff, 64),
    compile: boundedSlot(raw.compile, fallback.compile, 64),
    m2cDecomp: boundedSlot(raw.m2cDecomp, fallback.m2cDecomp, 64),
    mwccDebug: boundedSlot(raw.mwccDebug, fallback.mwccDebug, 64),
    other: boundedSlot(raw.other, fallback.other, 64),
    sourcePermuter: boundedSlot(raw.sourcePermuter, fallback.sourcePermuter, 64),
    sourcePermuterJobs: boundedSlot(raw.sourcePermuterJobs, fallback.sourcePermuterJobs, 16),
  };
}

export function suggestedToolConcurrency(workers: number): ToolConcurrencySettings {
  const pool = Math.max(1, Math.trunc(numberValue(workers, 16)));
  return {
    checkdiff: Math.min(64, pool),
    compile: Math.min(12, Math.max(4, Math.ceil(pool * 0.75))),
    m2cDecomp: Math.min(64, Math.max(4, Math.ceil(pool * 0.75))),
    mwccDebug: Math.min(6, Math.max(2, Math.ceil(pool / 3))),
    other: Math.min(64, pool),
    sourcePermuter: Math.min(4, Math.max(1, Math.ceil(pool / 8))),
    sourcePermuterJobs: 1,
  };
}

export function workerTimeoutMinutes(value: unknown): number {
  const seconds = numberValue(value, DEFAULT_WORKER_TIMEOUT_SECONDS);
  return Math.max(1, Math.round(seconds / 60));
}

export function workerTimeoutSecondsFromMinutes(value: unknown): number {
  const minutes = Math.max(1, Math.trunc(numberValue(value, DEFAULT_WORKER_TIMEOUT_SECONDS / 60)));
  return minutes * 60;
}
