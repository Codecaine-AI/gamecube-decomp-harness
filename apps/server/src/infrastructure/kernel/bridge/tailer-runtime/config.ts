export interface TailerConfig {
  /** Directory to watch for Pi JSONL session files. */
  watchDir: string;
  /** Path for cursor snapshot crash recovery. */
  snapshotPath: string;
  /** Number of events to batch before flushing. */
  batchSize: number;
  /** Max time in milliseconds between flushes. */
  flushIntervalMs: number;
  /** Interval in milliseconds for writing cursor snapshots. */
  snapshotIntervalMs: number;
  /** Maximum queue capacity before backpressure activates. */
  queueMax: number;
  /** Port retained for compatibility with the former tailer package config. */
  healthPort: number;
  /** Maximum number of retry attempts for failed flushes. */
  maxRetries: number;
  /** Maximum delay in milliseconds between retries. */
  maxRetryDelayMs: number;
}

export type TailerConfigInput = Pick<TailerConfig, "watchDir" | "snapshotPath"> &
  Partial<Omit<TailerConfig, "watchDir" | "snapshotPath">>;

const DEFAULT_TAILER_CONFIG_VALUES = Object.freeze({
  batchSize: 10,
  flushIntervalMs: 50,
  snapshotIntervalMs: 1000,
  queueMax: 5000,
  healthPort: 8766,
  maxRetries: 10,
  maxRetryDelayMs: 30000,
} satisfies Omit<TailerConfig, "watchDir" | "snapshotPath">);

export function createTailerConfig(input: TailerConfigInput): Readonly<TailerConfig> {
  return Object.freeze({
    ...DEFAULT_TAILER_CONFIG_VALUES,
    ...input,
  });
}
