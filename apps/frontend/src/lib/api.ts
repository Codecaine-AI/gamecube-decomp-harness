import {
  KERNEL_TRACE_READ_PATHS,
  type KernelTraceSessionDetail,
  type KernelTraceSessionListResponse,
} from "@agent-kernel/viewer-core";
import type { AgentViewerDefinition } from "@agent-kernel/viewer-ui";
import type { BoundaryStepDetail } from "./boundary-step-detail-types";
import type {
  Dashboard,
  FormState,
  JsonObject,
  GameEventQueryPage,
  GameEventReconstructionPage,
  RunDetails,
  StandardsPayload,
  UiConfig,
  WorkerStateTrace,
} from "./api-types";

export type KernelAgentGroup = "running" | "knowledge" | "pr";

export interface KernelAgentDefinition extends AgentViewerDefinition {
  group: KernelAgentGroup;
  renderedTools: string | null;
}

export interface KernelAgentsPayload {
  generatedAt: string;
  source: "sample";
  agents: KernelAgentDefinition[];
  warnings: string[];
}

export interface KernelStatusPayload extends JsonObject {
  configured: boolean;
  enabled: boolean;
  required: boolean;
  databaseUrl: string | null;
  kernelId?: string | null;
  piSessionsDir?: string | null;
  readApiPrefix?: string | null;
  error?: string;
}

export async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, options);
  const data = (await response.json()) as JsonObject;
  if (!response.ok) throw new Error(String(data.error || response.statusText));
  return data as T;
}

export function dashboardParams(form: Pick<FormState, "gameId" | "usePathOverrides" | "repoRoot" | "stateDir" | "graphDbPath">): URLSearchParams {
  const params = new URLSearchParams();
  if (form.gameId) params.set("gameId", form.gameId);
  if (form.usePathOverrides) {
    params.set("usePathOverrides", "true");
    params.set("repoRoot", form.repoRoot);
    params.set("stateDir", form.stateDir);
    params.set("graphDbPath", form.graphDbPath);
  }
  return params;
}

export function formBody(form: FormState, dashboard: Dashboard | null): JsonObject {
  const run = (dashboard?.status?.run || {}) as JsonObject;
  const body: JsonObject = {
    ...form,
    runId: String(run.id || ""),
  };
  if (!form.usePathOverrides) {
    delete body.repoRoot;
    delete body.stateDir;
    delete body.graphDbPath;
  }
  return body;
}

export function loadConfig(): Promise<UiConfig> {
  return fetchJson<UiConfig>("/api/config");
}

export function fetchDashboard(form: Pick<FormState, "gameId" | "usePathOverrides" | "repoRoot" | "stateDir" | "graphDbPath">): Promise<Dashboard> {
  return fetchJson<Dashboard>(`/api/dashboard?${dashboardParams(form)}`);
}

export function fetchCycleState(
  form: Pick<FormState, "gameId" | "usePathOverrides" | "repoRoot" | "stateDir" | "graphDbPath">,
): Promise<{ cycle: JsonObject | null; history: JsonObject[] }> {
  return fetchJson<{ cycle: JsonObject | null; history: JsonObject[] }>(`/api/cycle?${dashboardParams(form)}`);
}

export const GAME_EVENT_PAGE_SIZE = 50;
export const GAME_EVENT_RECONSTRUCTION_PAGE_SIZE = 50;
const MAX_GAME_EVENT_PAGE_SIZE = 200;

export interface GameEventPageRequest {
  afterSequence?: number | null;
  limit?: number;
}

type GameEventContext = Pick<FormState, "gameId">;

function gameEventParams(form: GameEventContext): URLSearchParams {
  const gameId = form.gameId.trim();
  if (!gameId) throw new Error("Game event requests require a gameId");
  return new URLSearchParams({ gameId });
}

function validatedGameEventPageRequest(
  request: GameEventPageRequest,
  defaultLimit: number,
): { afterSequence: number | null; limit: number } {
  const afterSequence = request.afterSequence ?? null;
  const limit = request.limit ?? defaultLimit;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_GAME_EVENT_PAGE_SIZE) {
    throw new Error(
      `Game event page limit must be an integer between 1 and ${MAX_GAME_EVENT_PAGE_SIZE}`,
    );
  }
  if (afterSequence !== null && (!Number.isSafeInteger(afterSequence) || afterSequence < 0)) {
    throw new Error("Game event afterSequence must be a non-negative safe integer");
  }
  return { afterSequence, limit };
}

function validateGameEventPageCursor(
  page: Pick<GameEventQueryPage, "events" | "has_more" | "next_after_sequence">,
  afterSequence: number | null,
): void {
  const cursor = page.next_after_sequence;
  if (!page.has_more) {
    if (cursor !== null) {
      throw new Error("Game event pagination returned a cursor without more events");
    }
    return;
  }
  const lastSequence = page.events.at(-1)?.sequence;
  if (
    cursor === null ||
    !Number.isSafeInteger(cursor) ||
    cursor < 0 ||
    lastSequence !== cursor ||
    (afterSequence !== null && cursor <= afterSequence)
  ) {
    throw new Error("Game event pagination did not provide an advancing next_after_sequence");
  }
}

export async function fetchGameEvents(
  form: GameEventContext,
  request: GameEventPageRequest = {},
): Promise<GameEventQueryPage> {
  const { afterSequence, limit } = validatedGameEventPageRequest(
    request,
    GAME_EVENT_PAGE_SIZE,
  );
  const params = gameEventParams(form);
  params.set("limit", String(limit));
  if (afterSequence !== null) params.set("after_sequence", String(afterSequence));
  const page = await fetchJson<GameEventQueryPage>(`/api/events?${params}`);
  validateGameEventPageCursor(page, afterSequence);
  return page;
}

export async function fetchGameEventReconstruction(
  form: GameEventContext,
  correlationId: string,
  request: GameEventPageRequest = {},
): Promise<GameEventReconstructionPage> {
  const requestedCorrelationId = correlationId.trim();
  if (!requestedCorrelationId) {
    throw new Error("Game event reconstruction requires a correlationId");
  }
  const { afterSequence, limit } = validatedGameEventPageRequest(
    request,
    GAME_EVENT_RECONSTRUCTION_PAGE_SIZE,
  );
  const params = gameEventParams(form);
  params.set("correlation_id", requestedCorrelationId);
  params.set("limit", String(limit));
  if (afterSequence !== null) params.set("after_sequence", String(afterSequence));
  const page = await fetchJson<GameEventReconstructionPage>(
    `/api/events/reconstruct?${params}`,
  );
  validateGameEventPageCursor(page, afterSequence);
  if (
    page.game_id !== form.gameId.trim() ||
    page.correlation_id !== requestedCorrelationId
  ) {
    throw new Error("Game event reconstruction returned mismatched game or correlation identity");
  }
  return page;
}

export function fetchRunDetails(form: Pick<FormState, "gameId" | "usePathOverrides" | "repoRoot" | "stateDir" | "graphDbPath">, runId: string): Promise<RunDetails> {
  return fetchJson<RunDetails>(`/api/run/details?${new URLSearchParams({ ...Object.fromEntries(dashboardParams(form)), runId })}`);
}

export function fetchWorkerStateTrace(
  form: Pick<FormState, "gameId" | "usePathOverrides" | "repoRoot" | "stateDir" | "graphDbPath">,
  runId: string,
  workerStateId: string,
): Promise<WorkerStateTrace> {
  return fetchJson<WorkerStateTrace>(`/api/run/worker-state-trace?${new URLSearchParams({ ...Object.fromEntries(dashboardParams(form)), runId, workerStateId })}`);
}

export function fetchBoundaryStepDetail(
  form: Pick<FormState, "gameId" | "usePathOverrides" | "repoRoot" | "stateDir" | "graphDbPath">,
  runId: string,
  epochId: string,
  attempt: number,
  step: string,
): Promise<BoundaryStepDetail> {
  return fetchJson<BoundaryStepDetail>(`/api/run/boundary-step-detail?${new URLSearchParams({
    ...Object.fromEntries(dashboardParams(form)),
    runId,
    epochId,
    attempt: String(attempt),
    step,
  })}`);
}

export function postJson<T>(url: string, body: JsonObject): Promise<T> {
  return fetchJson<T>(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function fetchStandards(form: Pick<FormState, "gameId" | "usePathOverrides" | "repoRoot" | "stateDir" | "graphDbPath">): Promise<StandardsPayload> {
  return fetchJson<StandardsPayload>(`/api/standards?${dashboardParams(form)}`);
}

export function fetchKernelStatus(): Promise<KernelStatusPayload> {
  return fetchJson<KernelStatusPayload>("/api/kernel/status");
}

export function fetchKernelAgents(form: Pick<FormState, "gameId" | "usePathOverrides" | "repoRoot" | "stateDir" | "graphDbPath">): Promise<KernelAgentsPayload> {
  return fetchJson<KernelAgentsPayload>(`/api/kernel/agents?${dashboardParams(form)}`);
}

export async function fetchKernelTraceSessions(): Promise<KernelTraceSessionListResponse> {
  return fetchJson<KernelTraceSessionListResponse>(KERNEL_TRACE_READ_PATHS.listTraceSessions);
}

export function fetchKernelTraceSessionDetail(traceSessionId: string): Promise<KernelTraceSessionDetail> {
  return fetchJson<KernelTraceSessionDetail>(KERNEL_TRACE_READ_PATHS.traceSessionDetail(traceSessionId));
}

export function fetchKernelContainerTrace(containerId: string): Promise<KernelTraceSessionDetail> {
  return fetchJson<KernelTraceSessionDetail>(KERNEL_TRACE_READ_PATHS.containerTrace(containerId));
}

export interface KernelWorkerTraceIdentity {
  claimId: string;
  epochId: string;
  gameId: string;
  runId: string;
  sessionId: string;
}

const kernelWorkerTraceRequests = new Map<string, Promise<KernelTraceSessionDetail | null>>();

export function fetchKernelWorkerTrace(identity: KernelWorkerTraceIdentity): Promise<KernelTraceSessionDetail | null> {
  const params = new URLSearchParams({
    claimId: identity.claimId,
    epochId: identity.epochId,
    gameId: identity.gameId,
    runId: identity.runId,
    sessionId: identity.sessionId,
  });
  const key = params.toString();
  const pending = kernelWorkerTraceRequests.get(key);
  if (pending) return pending;

  const request = fetchJson<{ trace: KernelTraceSessionDetail | null }>(`/api/kernel/worker-trace?${params}`).then(
    (response) => {
      kernelWorkerTraceRequests.delete(key);
      return response.trace;
    },
    (error) => {
      kernelWorkerTraceRequests.delete(key);
      throw error;
    },
  );
  kernelWorkerTraceRequests.set(key, request);
  return request;
}

export function saveStandard(form: Pick<FormState, "gameId" | "usePathOverrides" | "repoRoot" | "stateDir" | "graphDbPath">, edit: JsonObject): Promise<{ ok: boolean; errors?: string[]; savedId?: string }> {
  return postJson(`/api/standards?${dashboardParams(form)}`, { edit });
}

export interface KnowledgeLearningEvidence {
  type: string;
  ref: string;
}

export interface KnowledgeLearningSubject {
  scope: "symbol" | "file" | "area" | "general";
  symbol?: string;
  file?: string;
  area?: string;
  content_hash?: string;
}

export interface KnowledgeLearning {
  id: string;
  origin: "human_extracted" | "ai_inferred";
  subject: KnowledgeLearningSubject;
  statement: string;
  evidence: KnowledgeLearningEvidence[];
  confidence: number;
  produced_by?: string;
  status?: string;
  created_at?: string;
}

export interface KnowledgeLearningsResponse {
  learnings: KnowledgeLearning[];
  total: number;
  counts: {
    by_scope: Record<string, number>;
    by_origin: Record<string, number>;
    by_status: Record<string, number>;
  };
}

export interface KnowledgeLearningDetail {
  learning: KnowledgeLearning;
  versions: KnowledgeLearning[];
}

export interface KnowledgeLearningsQuery {
  q?: string;
  scope?: string;
  origin?: string;
  status?: string;
  subject?: string;
  limit?: number;
}

export function fetchKnowledgeLearnings(params: KnowledgeLearningsQuery): Promise<KnowledgeLearningsResponse> {
  const search = new URLSearchParams();
  if (params.q) search.set("q", params.q);
  if (params.scope) search.set("scope", params.scope);
  if (params.origin) search.set("origin", params.origin);
  if (params.status) search.set("status", params.status);
  if (params.subject) search.set("subject", params.subject);
  if (params.limit) search.set("limit", String(params.limit));
  const query = search.toString();
  return fetchJson<KnowledgeLearningsResponse>(`/api/knowledge/learnings${query ? `?${query}` : ""}`);
}

export function fetchKnowledgeLearningDetail(id: string): Promise<KnowledgeLearningDetail> {
  return fetchJson<KnowledgeLearningDetail>(`/api/knowledge/learnings/${encodeURIComponent(id)}`);
}
