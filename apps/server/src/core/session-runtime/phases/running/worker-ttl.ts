import type { GlobalArgs } from "@server/core/project-registry/runtime-options.js";

export function workerTtlSeconds(globals: Pick<GlobalArgs, "agentTimeoutSeconds">, args: Map<string, string | true>): number {
  if (args.has("--ttl-seconds")) {
    throw new Error("--ttl-seconds has been removed; set --agent-timeout-seconds instead.");
  }
  const seconds = globals.agentTimeoutSeconds;
  if (seconds == null || !Number.isFinite(seconds) || seconds <= 0) {
    throw new Error("--agent-timeout-seconds must be set to a positive worker timeout.");
  }
  return Math.trunc(seconds);
}
