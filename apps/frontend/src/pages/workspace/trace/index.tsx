import { useEffect, useMemo, useState } from "react";
import { buildTraceSpans, type KernelTraceSessionDetail, type KernelTraceSessionSummary } from "@agent-kernel/viewer-core";
import { KernelTraceViewer } from "@agent-kernel/viewer-shell";
import { fetchKernelStatus, fetchKernelTraceSessionDetail, fetchKernelTraceSessions, fetchProjectSessionState } from "@/lib/api";
import { asArray, asObject, shortId, text, type FormState, type JsonObject } from "@/lib/format";
import type { SessionView } from "@/pages/workspace/_lib/types";

interface TraceProjectSession {
  id: string;
  projectId: string;
  sessionUuid: string;
  status: string;
  phase: string;
  activeSubphase: string;
  createdAt: string;
  updatedAt: string;
  kernelTrace: JsonObject;
}

function selectedTraceIdFromLocation(): string | null {
  try {
    const params = new URLSearchParams(window.location.search);
    return params.get("traceId") ?? params.get("containerId");
  } catch {
    return null;
  }
}

function selectedSessionIdFromLocation(): string | null {
  try {
    return new URLSearchParams(window.location.search).get("sessionId");
  } catch {
    return null;
  }
}

function replaceTraceSelectionInUrl(sessionId: string | null, traceId: string | null): void {
  try {
    const url = new URL(window.location.href);
    if (sessionId) url.searchParams.set("sessionId", sessionId);
    else url.searchParams.delete("sessionId");
    if (traceId) {
      url.searchParams.set("traceId", traceId);
      url.searchParams.delete("containerId");
    } else {
      url.searchParams.delete("traceId");
      url.searchParams.delete("containerId");
    }
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  } catch {
    // Trace selection still works if URL mutation is unavailable.
  }
}

function isActiveTrace(status: string): boolean {
  return status === "queued" || status === "running";
}

function traceMatchesId(trace: KernelTraceSessionSummary, id: string): boolean {
  return trace.id === id || trace.containerId === id || trace.appSessionSlug === id;
}

function traceSessionCandidates(trace: KernelTraceSessionSummary): string[] {
  const metadata = asObject(trace.metadata);
  return [
    trace.id,
    trace.containerId,
    trace.appSessionSlug,
    text(metadata.appSessionId),
    text(metadata.app_session_id),
    text(metadata.sessionUuid),
    text(metadata.session_uuid),
    text(metadata.sessionId),
    text(metadata.rootContainerId),
    text(metadata.root_container_id),
    text(metadata.activeContainerId),
    text(metadata.active_container_id),
    text(metadata.runId),
  ].filter(Boolean);
}

function projectSessionTraceCandidates(session: TraceProjectSession): string[] {
  const trace = asObject(session.kernelTrace);
  return [
    session.sessionUuid,
    session.id,
    text(trace.appSessionId),
    text(trace.app_session_id),
    text(trace.rootContainerId),
    text(trace.root_container_id),
    text(trace.activeContainerId),
    text(trace.active_container_id),
  ].filter(Boolean);
}

function traceMatchesProjectSession(trace: KernelTraceSessionSummary, session: TraceProjectSession): boolean {
  const traceCandidates = new Set(traceSessionCandidates(trace));
  return projectSessionTraceCandidates(session).some((candidate) => traceCandidates.has(candidate));
}

function traceMatchesProjectId(trace: KernelTraceSessionSummary, projectId: string): boolean {
  if (!projectId) return true;
  const metadata = asObject(trace.metadata);
  return text(metadata.projectId, text(metadata.project_id)) === projectId;
}

function timestampMs(value: unknown): number {
  const raw = text(value);
  if (!raw) return 0;
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}

function traceTimestamp(trace: KernelTraceSessionSummary): number {
  return timestampMs(trace.latestEventAt ?? trace.updatedAt ?? trace.createdAt);
}

function sortedTraceSessions(sessions: KernelTraceSessionSummary[]): KernelTraceSessionSummary[] {
  return [...sessions].sort((left, right) => traceTimestamp(right) - traceTimestamp(left));
}

function prettyLabel(value: string): string {
  return value.replace(/_/g, " ");
}

function activeSubphaseFromRow(row: JsonObject): string {
  const direct = text(row.activeSubphase, text(row.active_subphase));
  if (direct) return direct;
  const phase = text(row.phase);
  const phaseState = asObject(row[`${phase}_state_json`]);
  return text(phaseState.subphase);
}

function projectSessionFromRow(row: JsonObject): TraceProjectSession | null {
  const sessionUuid = text(row.sessionUuid, text(row.session_uuid));
  if (!sessionUuid) return null;
  return {
    id: text(row.id, `project-session:${sessionUuid}`),
    projectId: text(row.projectId, text(row.project_id)),
    sessionUuid,
    status: text(row.status, "active"),
    phase: text(row.phase, "preparing"),
    activeSubphase: activeSubphaseFromRow(row),
    createdAt: text(row.createdAt, text(row.created_at)),
    updatedAt: text(row.updatedAt, text(row.updated_at)),
    kernelTrace: asObject(row.kernelTrace ?? row.kernel_trace_json),
  };
}

function projectSessionsFromPayload(payload: { projectSession: JsonObject | null; history: JsonObject[] } | null, view: SessionView): TraceProjectSession[] {
  const rows = payload ? [...asArray(payload.history).map(asObject)] : [];
  const active = asObject(payload?.projectSession);
  if (Object.keys(active).length > 0) rows.unshift(active);
  const byUuid = new Map<string, TraceProjectSession>();
  for (const row of rows) {
    const session = projectSessionFromRow(row);
    if (session && !byUuid.has(session.sessionUuid)) byUuid.set(session.sessionUuid, session);
  }
  if (byUuid.size === 0 && view.activeSessionId) {
    byUuid.set(view.activeSessionId, {
      id: `project-session:${view.activeSessionId}`,
      projectId: text(view.project?.id),
      sessionUuid: view.activeSessionId,
      status: "active",
      phase: text(view.canonicalPhase, view.mode === "none" ? "session" : view.mode),
      activeSubphase: text(view.canonicalSubphase),
      createdAt: "",
      updatedAt: "",
      kernelTrace: {},
    });
  }
  return [...byUuid.values()].sort((left, right) => timestampMs(right.createdAt) - timestampMs(left.createdAt));
}

function sessionPhaseLabel(session: TraceProjectSession): string {
  return [session.phase, session.activeSubphase].filter(Boolean).map(prettyLabel).join(" / ");
}

function sessionTitle(session: TraceProjectSession): string {
  return `Session ${shortId(session.sessionUuid)}`;
}

function sessionStatusClass(status: string): string {
  if (status === "active") return "border-status-info-border bg-status-info-fill text-status-info";
  if (status === "complete" || status === "completed") return "border-status-success-border bg-status-success-fill text-status-success";
  if (status === "blocked" || status === "error" || status === "failed") return "border-destructive/40 bg-destructive/10 text-destructive";
  return "border-status-neutral-border bg-status-neutral-fill text-status-neutral";
}

function chooseProjectSessionId(
  sessions: TraceProjectSession[],
  projectTraces: KernelTraceSessionSummary[],
  view: SessionView,
  preferredSessionId: string | null,
  preferredTraceId: string | null,
): string | null {
  if (preferredSessionId && sessions.some((session) => session.sessionUuid === preferredSessionId)) return preferredSessionId;
  if (preferredTraceId) {
    const trace = projectTraces.find((candidate) => traceMatchesId(candidate, preferredTraceId));
    const matchingSession = trace ? sessions.find((session) => traceMatchesProjectSession(trace, session)) : null;
    if (matchingSession) return matchingSession.sessionUuid;
  }
  if (view.activeSessionId && sessions.some((session) => session.sessionUuid === view.activeSessionId)) return view.activeSessionId;
  return sessions[0]?.sessionUuid ?? null;
}

function chooseTraceSessionId(sessions: KernelTraceSessionSummary[], preferredId: string | null): string | null {
  if (preferredId && sessions.some((trace) => traceMatchesId(trace, preferredId))) return preferredId;
  const runningTrace = sessions.find((trace) => isActiveTrace(trace.status));
  return runningTrace?.id ?? sessions[0]?.id ?? sessions[0]?.containerId ?? null;
}

function tracesForSession(projectTraces: KernelTraceSessionSummary[], session: TraceProjectSession | null): KernelTraceSessionSummary[] {
  if (!session) return [];
  return sortedTraceSessions(projectTraces.filter((trace) => traceMatchesProjectSession(trace, session)));
}

export function TracePage({ form, view }: { form: FormState; view: SessionView }) {
  const [projectSessions, setProjectSessions] = useState<TraceProjectSession[]>([]);
  const [projectTraceSessions, setProjectTraceSessions] = useState<KernelTraceSessionSummary[]>([]);
  const [selectedProjectSessionId, setSelectedProjectSessionId] = useState<string | null>(null);
  const [selectedTraceSessionId, setSelectedTraceSessionId] = useState<string | null>(null);
  const [detail, setDetail] = useState<KernelTraceSessionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const spans = useMemo(
    () => (detail ? buildTraceSpans(detail.events, detail.pi_sessions, detail.agent_runs) : []),
    [detail],
  );
  const selectedSession = projectSessions.find((session) => session.sessionUuid === selectedProjectSessionId) ?? null;
  const selectedSessionTraces = tracesForSession(projectTraceSessions, selectedSession);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError("");
      try {
        const [nextStatus, sessionState] = await Promise.all([
          fetchKernelStatus(),
          fetchProjectSessionState(form).catch(() => null),
        ]);
        if (cancelled) return;

        const sessions = projectSessionsFromPayload(sessionState, view);
        const projectId = text(view.project?.id, form.projectId);
        const kernelList = nextStatus.enabled ? await fetchKernelTraceSessions() : { trace_sessions: [] };
        if (cancelled) return;

        const projectTraces = sortedTraceSessions(kernelList.trace_sessions.filter((trace) => traceMatchesProjectId(trace, projectId)));
        const sessionId = chooseProjectSessionId(
          sessions,
          projectTraces,
          view,
          selectedSessionIdFromLocation(),
          selectedTraceIdFromLocation(),
        );
        const sessionTraces = tracesForSession(projectTraces, sessions.find((session) => session.sessionUuid === sessionId) ?? null);
        const traceId = chooseTraceSessionId(sessionTraces, selectedTraceIdFromLocation());

        setProjectSessions(sessions);
        setProjectTraceSessions(projectTraces);
        setSelectedProjectSessionId(sessionId);
        setSelectedTraceSessionId(traceId);
        setDetail(traceId ? await fetchKernelTraceSessionDetail(traceId) : null);
        replaceTraceSelectionInUrl(sessionId, traceId);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [form, view.activeSessionId, view.project?.id]);

  async function selectProjectSession(sessionId: string) {
    const sessionTraces = tracesForSession(projectTraceSessions, projectSessions.find((session) => session.sessionUuid === sessionId) ?? null);
    const traceId = chooseTraceSessionId(sessionTraces, null);
    setSelectedProjectSessionId(sessionId);
    setSelectedTraceSessionId(traceId);
    replaceTraceSelectionInUrl(sessionId, traceId);
    setLoading(true);
    setError("");
    try {
      setDetail(traceId ? await fetchKernelTraceSessionDetail(traceId) : null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="kernel-reference-workspace min-h-0 flex-1 overflow-auto bg-background p-4 font-sans text-foreground">
      {error ? (
        <div className="mb-4 rounded-lg border border-destructive/40 bg-destructive/10 px-3.5 py-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}
      <section className="grid h-[calc(100vh-2rem)] min-h-[680px] min-w-0 grid-cols-[minmax(0,1fr)] overflow-hidden rounded-lg border border-border bg-card lg:grid-cols-[380px_minmax(0,1fr)]">
        <aside className="flex min-h-0 min-w-0 flex-col border-b border-border lg:border-b-0 lg:border-r">
          <div className="border-b border-border px-4 py-3">
            <div className="flex min-w-0 items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="truncate font-display text-lg font-bold leading-tight">Sessions</h2>
                <p className="mt-1 truncate text-xs text-muted-foreground">
                  {projectSessions.length} project {projectSessions.length === 1 ? "session" : "sessions"}
                </p>
              </div>
              {loading ? (
                <span className="shrink-0 rounded-[2px] border border-border px-2 py-1 text-xs text-muted-foreground">
                  Loading
                </span>
              ) : null}
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {projectSessions.length === 0 && !loading ? (
              <div className="px-3 py-8 text-center text-sm text-muted-foreground">
                No project sessions yet.
              </div>
            ) : (
              <div className="min-w-0">
                <div className="sticky top-0 z-10 grid grid-cols-[minmax(0,1fr)_76px_58px] gap-2 border-b border-border bg-card/95 px-3 py-2 text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                  <span>Session</span>
                  <span className="text-right">State</span>
                  <span className="text-right">Trace</span>
                </div>
                {projectSessions.map((session) => {
                  const selected = session.sessionUuid === selectedProjectSessionId;
                  const traceCount = tracesForSession(projectTraceSessions, session).length;
                  const phaseLabel = sessionPhaseLabel(session);
                  return (
                    <button
                      key={session.sessionUuid}
                      type="button"
                      onClick={() => void selectProjectSession(session.sessionUuid)}
                      className={`relative grid w-full min-w-0 grid-cols-[minmax(0,1fr)_76px_58px] items-center gap-2 border-b border-border/70 px-3 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-status-info-border ${
                        selected
                          ? "bg-status-info-fill/30 text-foreground before:absolute before:inset-y-0 before:left-0 before:w-0.5 before:bg-status-info-border"
                          : "text-muted-foreground hover:bg-muted/35 hover:text-foreground"
                      }`}
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-[13px] font-bold leading-5">{sessionTitle(session)}</span>
                        <span className="block truncate font-mono text-[11px] leading-4 text-muted-foreground">
                          {session.sessionUuid}
                        </span>
                        {phaseLabel ? (
                          <span className="mt-1 block truncate text-[11px] uppercase leading-4 text-muted-foreground">
                            {phaseLabel}
                          </span>
                        ) : null}
                      </span>
                      <span className={`justify-self-end rounded-[2px] border px-1.5 py-0.5 text-[10px] font-bold uppercase ${sessionStatusClass(session.status)}`}>
                        {session.status}
                      </span>
                      <span className="justify-self-end text-[11px] font-bold text-muted-foreground">
                        {traceCount}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </aside>

        <div className="min-h-0 overflow-hidden">
          {loading && !detail ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              Loading kernel trace...
            </div>
          ) : !selectedSession ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              Select a session.
            </div>
          ) : selectedSessionTraces.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              No kernel traces for this session yet.
            </div>
          ) : !detail ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              Select a trace.
            </div>
          ) : (
            <KernelTraceViewer
              className="flex h-full flex-col"
              spans={spans}
              initialTraceLevel={2}
            />
          )}
        </div>
      </section>
    </div>
  );
}
