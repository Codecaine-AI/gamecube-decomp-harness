type JsonResponder = (data: unknown, init?: ResponseInit) => Response;

export interface AgentsApiRouteDeps {
  json: JsonResponder;
  loadKernelAgentsPayload: (paths: unknown) => unknown;
  requestPaths: (url: URL, options: { useDefaultGame?: boolean }) => unknown;
}

export async function handleAgentsApiRoute(url: URL, deps: AgentsApiRouteDeps): Promise<Response | null> {
  if (url.pathname !== "/api/kernel/agents") return null;
  const paths = deps.requestPaths(url, { useDefaultGame: true });
  return deps.json(deps.loadKernelAgentsPayload(paths));
}
