export type AgentRole = "director" | "worker" | "pr-review" | "knowledge-curator" | "reconcile" | "qa-repair";
export type RuntimeAgentRole = "director" | "worker" | "pr-review" | "knowledge-curator" | "reconcile" | "qa-repair";
// "needs_rework" is runner-assigned only (a gate rejected the worker's return); agents never
// self-report it — agent-supplied report types are validated by isWorkerReportType, which
// excludes it. "tool_error" is reserved for tool/API/build infrastructure failures.
// "provider_error" is runner-assigned when the LLM provider itself failed (every session
// attempt errored); the target was never really attempted, so it requeues instead of
// quarantining and never counts as a pool-fatal worker failure.
export type WorkerReportType = "stalled_no_useful_guess" | "progress" | "needs_fact" | "score_candidate" | "needs_rework" | "tool_error" | "provider_error";

export interface PiPromptBundle {
  systemPrompt: string;
  userPrompt: string;
  systemTemplatePath: string;
  userTemplatePath: string;
}
