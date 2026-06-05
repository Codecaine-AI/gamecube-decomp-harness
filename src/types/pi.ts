export type PiSessionStatus = "dry_run" | "running" | "succeeded" | "failed";

export interface PiRunResult {
  sessionId: string;
  sessionFile?: string;
  outputPath: string;
  systemPromptPath: string;
  userPromptPath: string;
  rawText: string;
  dryRun: boolean;
  failed?: boolean;
  error?: string;
}
