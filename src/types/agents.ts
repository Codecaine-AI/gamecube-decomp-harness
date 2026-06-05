export type AgentRole = "director" | "worker" | "pr-review";
export type RuntimeAgentRole = "director" | "worker";
export type WorkerReportType = "stalled_no_useful_guess" | "progress" | "needs_fact" | "score_candidate";

export interface PiPromptBundle {
  systemPrompt: string;
  userPrompt: string;
  systemTemplatePath: string;
  userTemplatePath: string;
}
