import {
  KERNEL_TRACE_READ_PATHS,
  type KernelTraceSessionDetail,
  type KernelTraceSessionListResponse,
} from "@agent-kernel/viewer-core";
import type { AgentViewerDefinition } from "@agent-kernel/viewer-ui";
import type { Dashboard, FormState, JsonObject, RunDetails, StandardsPayload, UiConfig, WorkerStateTrace } from "./api-types";

export interface KernelAgentsPayload {
  generatedAt: string;
  source: "sample";
  agents: AgentViewerDefinition[];
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

export function dashboardParams(form: Pick<FormState, "projectId" | "usePathOverrides" | "repoRoot" | "stateDir" | "graphDbPath">): URLSearchParams {
  const params = new URLSearchParams();
  if (form.projectId) params.set("projectId", form.projectId);
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

export function fetchDashboard(form: Pick<FormState, "projectId" | "usePathOverrides" | "repoRoot" | "stateDir" | "graphDbPath">): Promise<Dashboard> {
  return fetchJson<Dashboard>(`/api/dashboard?${dashboardParams(form)}`);
}

export function fetchProjectSessionState(
  form: Pick<FormState, "projectId" | "usePathOverrides" | "repoRoot" | "stateDir" | "graphDbPath">,
): Promise<{ projectSession: JsonObject | null; history: JsonObject[] }> {
  return fetchJson<{ projectSession: JsonObject | null; history: JsonObject[] }>(`/api/project-session?${dashboardParams(form)}`);
}

export function fetchRunDetails(form: Pick<FormState, "projectId" | "usePathOverrides" | "repoRoot" | "stateDir" | "graphDbPath">, runId: string): Promise<RunDetails> {
  return fetchJson<RunDetails>(`/api/run/details?${new URLSearchParams({ ...Object.fromEntries(dashboardParams(form)), runId })}`);
}

export function fetchWorkerStateTrace(
  form: Pick<FormState, "projectId" | "usePathOverrides" | "repoRoot" | "stateDir" | "graphDbPath">,
  runId: string,
  workerStateId: string,
): Promise<WorkerStateTrace> {
  return fetchJson<WorkerStateTrace>(`/api/run/worker-state-trace?${new URLSearchParams({ ...Object.fromEntries(dashboardParams(form)), runId, workerStateId })}`);
}

export function postJson<T>(url: string, body: JsonObject): Promise<T> {
  return fetchJson<T>(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function fetchStandards(form: Pick<FormState, "projectId" | "usePathOverrides" | "repoRoot" | "stateDir" | "graphDbPath">): Promise<StandardsPayload> {
  return fetchJson<StandardsPayload>(`/api/standards?${dashboardParams(form)}`);
}

export function fetchKernelStatus(): Promise<KernelStatusPayload> {
  return fetchJson<KernelStatusPayload>("/api/kernel/status");
}

export function fetchKernelAgents(form: Pick<FormState, "projectId" | "usePathOverrides" | "repoRoot" | "stateDir" | "graphDbPath">): Promise<KernelAgentsPayload> {
  return fetchJson<KernelAgentsPayload>(`/api/kernel/agents?${dashboardParams(form)}`);
}

export async function fetchKernelTraceSessions(): Promise<KernelTraceSessionListResponse> {
  return fetchJson<KernelTraceSessionListResponse>(KERNEL_TRACE_READ_PATHS.listTraceSessions);
}

export function fetchKernelTraceSessionDetail(traceSessionId: string): Promise<KernelTraceSessionDetail> {
  return fetchJson<KernelTraceSessionDetail>(KERNEL_TRACE_READ_PATHS.traceSessionDetail(traceSessionId));
}

export function saveStandard(form: Pick<FormState, "projectId" | "usePathOverrides" | "repoRoot" | "stateDir" | "graphDbPath">, edit: JsonObject): Promise<{ ok: boolean; errors?: string[]; savedId?: string }> {
  return postJson(`/api/standards?${dashboardParams(form)}`, { edit });
}
