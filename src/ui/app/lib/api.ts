import type { Dashboard, FormState, JsonObject, RunDetails, UiConfig } from "../types";

export async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, options);
  const data = (await response.json()) as JsonObject;
  if (!response.ok) throw new Error(String(data.error || response.statusText));
  return data as T;
}

export function dashboardParams(form: Pick<FormState, "repoRoot" | "stateDir">): URLSearchParams {
  return new URLSearchParams({
    repoRoot: form.repoRoot,
    stateDir: form.stateDir,
  });
}

export function formBody(form: FormState, dashboard: Dashboard | null): JsonObject {
  const run = (dashboard?.status?.run || {}) as JsonObject;
  return {
    ...form,
    runId: String(run.id || ""),
  };
}

export function loadConfig(): Promise<UiConfig> {
  return fetchJson<UiConfig>("/api/config");
}

export function fetchDashboard(form: Pick<FormState, "repoRoot" | "stateDir">): Promise<Dashboard> {
  return fetchJson<Dashboard>(`/api/dashboard?${dashboardParams(form)}`);
}

export function fetchRunDetails(form: Pick<FormState, "repoRoot" | "stateDir">, runId: string): Promise<RunDetails> {
  return fetchJson<RunDetails>(`/api/run/details?${new URLSearchParams({ ...Object.fromEntries(dashboardParams(form)), runId })}`);
}

export function postJson<T>(url: string, body: JsonObject): Promise<T> {
  return fetchJson<T>(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
