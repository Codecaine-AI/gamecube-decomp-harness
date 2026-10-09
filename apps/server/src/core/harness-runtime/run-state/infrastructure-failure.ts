export const MAX_CONSECUTIVE_TARGET_INFRA_FAILURES = 3;

export const PROVIDER_OUTAGE_PATTERNS = [
  /\bno_biscuit_no_service\b/i,
  /\binvalid_request_error\b/i,
  /\bbridge_continuity_persistence_failed\b/i,
  // codex-lb: "The previous response operation may still be running; retry after the cooldown."
  /\bupstream_operation_status_unknown\b/i,
  // Upstream and codex-lb errors whose message asks the caller to retry.
  /\bprevious_response_owner_unavailable\b/i,
  /\bservice_unavailable_error\b/i,
  /\bserver_error\b/i,
  /\bstream[_ -]?incomplete\b/i,
  /\bserver_is_overloaded\b/i,
  /\b(?:connection|socket|stream|websocket)\s+(?:refused|reset)\b/i,
  /\bECONN(?:REFUSED|RESET)\b/i,
  /\b(?:HTTP(?:\/\d(?:\.\d)?)?|status(?:\s+code)?|response\s+code)[\s:=-]*(?:error\s*)?(?:401|403|429|5\d\d)\b/i,
] as const;

const INFRASTRUCTURE_FAILURE_PATTERNS = [
  /Runner baseline validation failed before the worker started/i,
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

export function providerOutageReason(error: unknown): string | null {
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  if (!message) return null;
  return PROVIDER_OUTAGE_PATTERNS.some((pattern) => pattern.test(message)) ? message : null;
}
