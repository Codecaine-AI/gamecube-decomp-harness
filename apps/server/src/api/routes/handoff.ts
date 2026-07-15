type JsonObject = Record<string, unknown>;
type JsonResponder = (data: unknown, init?: ResponseInit) => Response;

export interface OpenPrApiBody extends JsonObject {
  ledgerPath?: string;
  postLedgerComments?: boolean;
}

export interface HandoffApiRouteDeps {
  checkpointRunForPr: (body: JsonObject) => Promise<unknown>;
  createSavePoint: (body: JsonObject) => Promise<unknown>;
  json: JsonResponder;
  pauseRunForPr: (body: JsonObject) => Promise<unknown>;
  prepareLocalPr: (body: JsonObject) => Promise<unknown>;
  prepareLocalPrBatch: (body: JsonObject) => Promise<unknown>;
  preparePrHandoff: (body: JsonObject) => Promise<unknown>;
  reconcile: (body: JsonObject) => Promise<unknown>;
  resumeRunForPr: (body: JsonObject) => unknown;
  runPrQa: (body: JsonObject) => Promise<unknown>;
  runPrSplitPlan: (body: JsonObject) => Promise<unknown>;
  runQaRepairForPr: (body: JsonObject) => Promise<unknown>;
  setPrReviewState: (body: JsonObject) => Promise<unknown>;
  syncPrRecords: (body: JsonObject) => Promise<unknown>;
  verifyShipSet: (body: JsonObject) => Promise<unknown>;
  openAllPlannedPrs: (body: OpenPrApiBody) => Promise<unknown>;
  openNextDraftBatch: (body: OpenPrApiBody) => Promise<unknown>;
  openPrForSlice: (body: OpenPrApiBody) => Promise<unknown>;
}

async function requestBody(req: Request): Promise<JsonObject> {
  return (await req.json().catch(() => ({}))) as JsonObject;
}

export async function handleHandoffApiRoute(req: Request, url: URL, deps: HandoffApiRouteDeps): Promise<Response | null> {
  if (req.method !== "POST") return null;
  const body = () => requestBody(req);
  if (url.pathname === "/api/pr/pause") return deps.json(await deps.pauseRunForPr(await body()));
  if (url.pathname === "/api/pr/resume") return deps.json(deps.resumeRunForPr(await body()));
  if (url.pathname === "/api/run/checkpoint") return deps.json(await deps.checkpointRunForPr(await body()));
  if (url.pathname === "/api/pr/qa") return deps.json(await deps.runPrQa(await body()));
  if (url.pathname === "/api/pr/qa-repair") return deps.json(await deps.runQaRepairForPr(await body()));
  if (url.pathname === "/api/prs/sync") return deps.json(await deps.syncPrRecords(await body()));
  if (url.pathname === "/api/prs/review-state") return deps.json(await deps.setPrReviewState(await body()));
  if (url.pathname === "/api/prs/prepare-local") return deps.json(await deps.prepareLocalPr(await body()));
  if (url.pathname === "/api/prs/prepare-local-batch") return deps.json(await deps.prepareLocalPrBatch(await body()));
  if (url.pathname === "/api/prs/open") return deps.json(await deps.openPrForSlice(await body() as OpenPrApiBody));
  if (url.pathname === "/api/prs/open-batch") return deps.json(await deps.openNextDraftBatch(await body() as OpenPrApiBody));
  if (url.pathname === "/api/prs/open-all") return deps.json(await deps.openAllPlannedPrs(await body() as OpenPrApiBody));
  if (url.pathname === "/api/pr/split-plan") return deps.json(await deps.runPrSplitPlan(await body()));
  if (url.pathname === "/api/pr/reconcile") return deps.json(await deps.reconcile(await body()));
  if (url.pathname === "/api/save-point") return deps.json(await deps.createSavePoint(await body()));
  if (url.pathname === "/api/pr/prepare") return deps.json(await deps.preparePrHandoff(await body()));
  if (url.pathname === "/api/pr/verify-ship-set") return deps.json(await deps.verifyShipSet(await body()));
  return null;
}
