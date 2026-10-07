export type PiSessionStatus = "dry_run" | "running" | "succeeded" | "failed";

export interface PiRunResult {
  sessionId: string;
  sessionFile?: string;
  sessionDir?: string;
  outputPath: string;
  systemPromptPath: string;
  userPromptPath: string;
  rawText: string;
  dryRun: boolean;
  failed?: boolean;
  error?: string;
  // Set when the session's final assistant turn ended with a provider error
  // (stopReason "error"), e.g. every retry timed out against the LLM endpoint.
  // The session "completed" from the SDK's perspective but produced no usable turn.
  providerError?: string;
  // Agent Kernel identity of the spawn, set on kernel spawns only (never on
  // dry runs). On a spawn that threw, run and container come from the
  // kernel's onRunStarted callback and are absent if the run never started.
  kernelRunId?: string;
  kernelContainerId?: string;
  kernelPiSessionId?: string;
}
