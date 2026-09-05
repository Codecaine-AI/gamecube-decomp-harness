import type { KernelPreviewOptions } from "@server/core/agent-catalog/kernel-preview.js";

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
  const paths = deps.requestPaths(url, { useDefaultGame: true });
  return deps.json(deps.loadKernelAgentsPayload(paths, options));
}
