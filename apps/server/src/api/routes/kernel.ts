type JsonResponder = (data: unknown, init?: ResponseInit) => Response;

export interface KernelWorkerTraceRequest {
  claimId: string;
  epochId: string;
  gameId: string;
  runId: string;
  sessionId: string;
}

export interface KernelApiRouteDeps {
  json: JsonResponder;
  kernelReadApiResponse: (req: Request) => Promise<Response>;
  kernelRuntimeRequired: boolean;
  kernelStatus: () => Promise<{ configured?: boolean; error?: unknown } & Record<string, unknown>>;
  kernelTraceJson?: (data: unknown) => Response;
  kernelWorkerTrace: (input: KernelWorkerTraceRequest) => Promise<unknown | null>;
}

export async function handleKernelApiRoute(url: URL, deps: KernelApiRouteDeps): Promise<Response | null> {
  if (url.pathname === "/api/kernel/status") {
    const status = await deps.kernelStatus();
    const unavailable = status.configured === false || Boolean(status.error);
    return deps.json(status, { status: unavailable && deps.kernelRuntimeRequired ? 503 : 200 });
  }
  if (url.pathname !== "/api/kernel/worker-trace") return null;

  const input = {
    claimId: url.searchParams.get("claimId")?.trim() ?? "",
    epochId: url.searchParams.get("epochId")?.trim() ?? "",
    gameId: url.searchParams.get("gameId")?.trim() ?? "",
    runId: url.searchParams.get("runId")?.trim() ?? "",
    sessionId: url.searchParams.get("sessionId")?.trim() ?? "",
  };
  const missing = Object.entries(input).find(([, value]) => !value)?.[0];
  if (missing) return deps.json({ error: `Worker trace requires ${missing}` }, { status: 400 });
  const payload = { trace: await deps.kernelWorkerTrace(input) };
  return deps.kernelTraceJson ? deps.kernelTraceJson(payload) : deps.json(payload);
}

export async function handleKernelReadRoute(req: Request, url: URL, deps: Pick<KernelApiRouteDeps, "kernelReadApiResponse">): Promise<Response | null> {
  if (url.pathname !== "/kernel" && !url.pathname.startsWith("/kernel/")) return null;
  return deps.kernelReadApiResponse(req);
}
