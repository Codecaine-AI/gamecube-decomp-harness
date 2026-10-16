import type { KernelPreviewOptions } from "@server/core/agent-catalog/kernel-preview.js";
import {
  isPreviousAttemptVariant,
  PREVIOUS_ATTEMPT_VARIANTS,
} from "@server/core/agent-catalog/agents/running/worker/previous-attempt.js";
import { parseAdvisoryAdjudicationMode } from "@server/core/game-registry/runtime-options.js";

type JsonResponder = (data: unknown, init?: ResponseInit) => Response;

export interface AgentsApiRouteDeps {
  json: JsonResponder;
  loadKernelAgentsPayload: (paths: unknown, options?: KernelPreviewOptions) => unknown;
  requestPaths: (url: URL, options: { useDefaultGame?: boolean }) => unknown;
}

export async function handleAgentsApiRoute(url: URL, deps: AgentsApiRouteDeps): Promise<Response | null> {
  if (url.pathname !== "/api/kernel/agents") return null;
  const rawTarget = url.searchParams.get("target")?.trim();
  let options: KernelPreviewOptions | undefined;
  if (rawTarget) {
    const separator = rawTarget.lastIndexOf(":");
    const unit = rawTarget.slice(0, separator).trim();
    const symbol = rawTarget.slice(separator + 1).trim();
    if (separator < 1 || !unit || !symbol) {
      return deps.json({ error: "target must use <unit>:<symbol>" }, { status: 400 });
    }
    options = { target: { unit, symbol } };
  }
  const rawMode = url.searchParams.get("advisory_adjudication");
  if (rawMode !== null) {
    try {
      options = { ...options, advisoryAdjudication: parseAdvisoryAdjudicationMode(rawMode, "advisory_adjudication") };
    } catch (error) {
      return deps.json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 });
    }
  }
  // Which `previous_attempt` variant the worker sample renders (active steering gate only).
  const rawPreviousAttempt = url.searchParams.get("previous_attempt");
  if (rawPreviousAttempt !== null) {
    if (!isPreviousAttemptVariant(rawPreviousAttempt)) {
      return deps.json({ error: `previous_attempt must be one of: ${PREVIOUS_ATTEMPT_VARIANTS.join(", ")}` }, { status: 400 });
    }
    options = { ...options, previousAttempt: rawPreviousAttempt };
  }
  const paths = deps.requestPaths(url, { useDefaultGame: true });
  return deps.json(deps.loadKernelAgentsPayload(paths, options));
}
