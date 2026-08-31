export const MAX_CONSECUTIVE_TARGET_INFRA_FAILURES = 3;

const INFRASTRUCTURE_FAILURE_PATTERNS = [
  /LLM provider failed before the runner could continue the worker/i,
  /\b(?:OpenAI|Anthropic|Gemini|LLM) (?:API|provider) error\b/i,
  /\bserver_is_overloaded\b/i,
  /\bprevious_response_id\b/i,
  /Non-dry Melee agent spawns must use kernel createSpawnAgent/i,
  /\bkernel runtime (?:DB|database).*(?:missing|uninitialized|unavailable|unreachable|failed|error)/i,
  /(?:missing|uninitialized|unavailable|unreachable|failed).{0,80}\bkernel runtime (?:DB|database)\b/i,
  /\b(?:sandbox|Daytona).{0,80}(?:provision|create|start).{0,40}(?:failed|failure|error|unavailable|timed out)/i,
  /(?:failed|failure|error|unavailable|timed out).{0,80}\b(?:sandbox|Daytona).{0,40}(?:provision|create|start)/i,
];

export function infrastructureFailureReason(error: unknown): string | null {
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  if (!message) return null;
  return INFRASTRUCTURE_FAILURE_PATTERNS.some((pattern) => pattern.test(message)) ? message : null;
}
