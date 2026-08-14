import { useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import { buildTraceSpans, type KernelTraceSessionDetail, type KernelTraceSessionSummary } from "@agent-kernel/viewer-core";
import { KernelTraceViewer } from "@agent-kernel/viewer-shell";
import {
  PROJECT_EVENT_PAGE_SIZE,
  PROJECT_EVENT_RECONSTRUCTION_PAGE_SIZE,
  fetchKernelStatus,
  fetchKernelTraceSessionDetail,
  fetchKernelTraceSessions,
  fetchProjectEventReconstruction,
  fetchProjectEvents,
  fetchProjectSessionState,
} from "@/lib/api";
import type {
  ProjectEventDto,
  ProjectEventKernelTraceProjection,
  ProjectEventReconstructionPage,
} from "@/lib/api-types";
import { asArray, asObject, shortId, text, type FormState, type JsonObject } from "@/lib/format";
import type { SessionView } from "@/pages/workspace/_lib/types";
import {
  chooseProjectEventCorrelation,
  isSafeLocalTraceHref,
  isSelectedProjectEvent,
  kernelTraceSelectionUrl,
  mergeProjectEventPages,
  mergeProjectEventReconstructionPages,
  projectEventAnchorAvailability,
  projectEventAnchorId,
  projectEventReconstructionSelection,
  projectEventSelectionUrl,
  projectEventTimeline,
  projectEventUrlSelection,
  projectEventWorkflowOptions,
  traceSelectionUrl,
} from "./project-event-model";

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

function selectedProjectEventFromLocation() {
  if (typeof window === "undefined") return { correlationId: null, eventId: null };
  try {
    return projectEventUrlSelection(window.location.search, window.location.hash);
  } catch {
    return { correlationId: null, eventId: null };
  }
}

function replaceTraceSelectionInUrl(
  sessionId: string | null,
  trace: KernelTraceSessionSummary | null,
): void {
  try {
    const nextUrl = traceSelectionUrl(window.location.href, {
      sessionId,
      traceId: trace?.id ?? null,
      containerId: trace?.containerId ?? null,
    });
    window.history.replaceState(null, "", nextUrl);
  } catch {
    // Trace selection still works if URL mutation is unavailable.
  }
}

function replaceProjectEventSelectionInUrl(correlationId: string | null, eventId?: string | null): void {
  try {
    const nextUrl = projectEventSelectionUrl(window.location.href, correlationId, eventId);
    window.history.replaceState(null, "", nextUrl);
  } catch {
    // Project event selection still works if URL mutation is unavailable.
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

function projectSessionForKernelTrace(
  sessions: TraceProjectSession[],
  kernelTrace: ProjectEventKernelTraceProjection,
): TraceProjectSession | null {
  const kernelIdentities = new Set([kernelTrace.app_session_id, kernelTrace.container_id]);
  return sessions.find(
    (session) => projectSessionTraceCandidates(session).some((candidate) => kernelIdentities.has(candidate)),
  ) ?? null;
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
  const [projectEvents, setProjectEvents] = useState<ProjectEventDto[]>([]);
  const [projectEventSelection, setProjectEventSelection] = useState(selectedProjectEventFromLocation);
  const selectedCorrelationId = projectEventSelection.correlationId;
  const selectedProjectEventId = projectEventSelection.eventId;
  const [reconstruction, setReconstruction] = useState<ProjectEventReconstructionPage | null>(null);
  const [eventListLoading, setEventListLoading] = useState(true);
  const [eventListLoadingMore, setEventListLoadingMore] = useState(false);
  const [eventListHasMore, setEventListHasMore] = useState(false);
  const [eventListCursor, setEventListCursor] = useState<number | null>(null);
  const [reconstructionLoading, setReconstructionLoading] = useState(false);
  const [reconstructionLoadingMore, setReconstructionLoadingMore] = useState(false);
  const [eventListError, setEventListError] = useState("");
  const [reconstructionError, setReconstructionError] = useState("");
  const [reconstructionContinuationError, setReconstructionContinuationError] = useState("");
  const [eventListReload, setEventListReload] = useState(0);
  const [reconstructionReload, setReconstructionReload] = useState(0);
  const eventLoadGeneration = useRef(0);
  const reconstructionLoadGeneration = useRef(0);
  const loadedProjectEventButtons = useRef(new Map<string, HTMLButtonElement>());
  const reconstructionProjectEventItems = useRef(new Map<string, HTMLLIElement>());
  const focusedProjectEventSelection = useRef<string | null>(null);
  const spans = useMemo(
    () => (detail ? buildTraceSpans(detail.events, detail.pi_sessions, detail.agent_runs) : []),
    [detail],
  );
  const listedWorkflowOptions = useMemo(
    () => projectEventWorkflowOptions(projectEvents),
    [projectEvents],
  );
  const workflowOptions = useMemo(
    () => projectEventWorkflowOptions(
      reconstruction ? [...projectEvents, ...reconstruction.events] : projectEvents,
    ),
    [projectEvents, reconstruction],
  );
  const loadedWorkflowEvents = useMemo(() => {
    const correlations = new Set(workflowOptions.map((option) => option.correlation_id));
    return mergeProjectEventPages(
      projectEvents,
      reconstruction?.events ?? [],
    ).filter((event) => correlations.has(event.correlation_id));
  }, [projectEvents, reconstruction, workflowOptions]);
  const selectedWorkflowAvailable = selectedCorrelationId !== null && workflowOptions.some(
    (option) => option.correlation_id === selectedCorrelationId,
  );
  const timeline = useMemo(
    () => (reconstruction ? projectEventTimeline(reconstruction) : []),
    [reconstruction],
  );
  const selectedEventAvailability = projectEventAnchorAvailability(
    projectEventSelection,
    reconstruction,
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
        replaceTraceSelectionInUrl(
          sessionId,
          traceId ? sessionTraces.find((trace) => traceMatchesId(trace, traceId)) ?? null : null,
        );
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

  useEffect(() => {
    const generation = ++eventLoadGeneration.current;
    let cancelled = false;

    async function loadProjectEvents() {
      setEventListLoading(true);
      setEventListLoadingMore(false);
      setEventListError("");
      setProjectEvents([]);
      setEventListHasMore(false);
      setEventListCursor(null);
      try {
        const page = await fetchProjectEvents(form);
        if (cancelled || generation !== eventLoadGeneration.current) return;
        setProjectEvents(mergeProjectEventPages([], page.events));
        setEventListHasMore(page.has_more);
        setEventListCursor(page.next_after_sequence);
      } catch (err) {
        if (!cancelled && generation === eventLoadGeneration.current) {
          setProjectEvents([]);
          setEventListError(err instanceof Error ? err.message : String(err));
        }
      } finally {
        if (!cancelled && generation === eventLoadGeneration.current) setEventListLoading(false);
      }
    }

    void loadProjectEvents();
    return () => {
      cancelled = true;
      if (eventLoadGeneration.current === generation) eventLoadGeneration.current += 1;
    };
  }, [form, eventListReload]);

  useEffect(() => {
    if (eventListLoading || selectedCorrelationId) return;
    const locationSelection = selectedProjectEventFromLocation();
    const correlationId = locationSelection.correlationId ?? chooseProjectEventCorrelation(workflowOptions, null);
    if (!correlationId) return;
    setProjectEventSelection({ correlationId, eventId: locationSelection.eventId });
    if (!locationSelection.correlationId) {
      replaceProjectEventSelectionInUrl(correlationId, locationSelection.eventId);
    }
  }, [eventListLoading, selectedCorrelationId, workflowOptions]);

  useEffect(() => {
    function hydrateProjectEventSelectionFromLocation() {
      const locationSelection = selectedProjectEventFromLocation();
      const correlationId = locationSelection.correlationId ?? chooseProjectEventCorrelation(
        workflowOptions,
        null,
      );
      if (correlationId !== selectedCorrelationId) {
        reconstructionLoadGeneration.current += 1;
        setReconstruction(null);
        setReconstructionLoadingMore(false);
        setReconstructionContinuationError("");
      }
      setProjectEventSelection({ correlationId, eventId: locationSelection.eventId });
      if (!locationSelection.correlationId && correlationId) {
        replaceProjectEventSelectionInUrl(correlationId, locationSelection.eventId);
      }
    }

    window.addEventListener("popstate", hydrateProjectEventSelectionFromLocation);
    window.addEventListener("hashchange", hydrateProjectEventSelectionFromLocation);
    return () => {
      window.removeEventListener("popstate", hydrateProjectEventSelectionFromLocation);
      window.removeEventListener("hashchange", hydrateProjectEventSelectionFromLocation);
    };
  }, [selectedCorrelationId, workflowOptions]);

  useEffect(() => {
    if (!selectedCorrelationId) {
      reconstructionLoadGeneration.current += 1;
      setReconstruction(null);
      setReconstructionLoading(false);
      setReconstructionLoadingMore(false);
      setReconstructionError("");
      setReconstructionContinuationError("");
      return;
    }

    const generation = ++reconstructionLoadGeneration.current;
    let cancelled = false;
    setReconstructionLoading(true);
    setReconstructionLoadingMore(false);
    setReconstructionError("");
    setReconstructionContinuationError("");
    setReconstruction(null);
    fetchProjectEventReconstruction(form, selectedCorrelationId, {
      limit: PROJECT_EVENT_RECONSTRUCTION_PAGE_SIZE,
    })
      .then((page) => {
        if (!cancelled && generation === reconstructionLoadGeneration.current) {
          setReconstruction(mergeProjectEventReconstructionPages(null, page));
        }
      })
      .catch((err: unknown) => {
        if (!cancelled && generation === reconstructionLoadGeneration.current) {
          setReconstruction(null);
          setReconstructionError(err instanceof Error ? err.message : String(err));
        }
      })
      .finally(() => {
        if (!cancelled && generation === reconstructionLoadGeneration.current) {
          setReconstructionLoading(false);
        }
      });

    return () => {
      cancelled = true;
      if (reconstructionLoadGeneration.current === generation) {
        reconstructionLoadGeneration.current += 1;
      }
    };
  }, [form, reconstructionReload, selectedCorrelationId]);

  useLayoutEffect(() => {
    if (
      reconstructionLoading ||
      selectedEventAvailability !== "loaded" ||
      !selectedProjectEventId ||
      !selectedCorrelationId
    ) {
      focusedProjectEventSelection.current = null;
      return;
    }
    const focusIdentity = `${reconstruction?.project_id ?? ""}\u0000${selectedCorrelationId}\u0000${selectedProjectEventId}`;
    if (focusedProjectEventSelection.current === focusIdentity) return;
    try {
      const selectedEvent = loadedProjectEventButtons.current.get(selectedProjectEventId)
        ?? reconstructionProjectEventItems.current.get(selectedProjectEventId);
      if (!selectedEvent) return;
      selectedEvent.focus({ preventScroll: true });
      focusedProjectEventSelection.current = focusIdentity;
      selectedEvent.scrollIntoView({ block: "nearest" });
    } catch {
      // Event selection remains visible if anchored scrolling is unavailable.
    }
  }, [
    loadedWorkflowEvents,
    reconstruction?.project_id,
    reconstructionLoading,
    selectedCorrelationId,
    selectedEventAvailability,
    selectedProjectEventId,
    timeline,
  ]);

  async function selectProjectSession(sessionId: string) {
    const sessionTraces = tracesForSession(projectTraceSessions, projectSessions.find((session) => session.sessionUuid === sessionId) ?? null);
    const traceId = chooseTraceSessionId(sessionTraces, null);
    setSelectedProjectSessionId(sessionId);
    setSelectedTraceSessionId(traceId);
    replaceTraceSelectionInUrl(
      sessionId,
      traceId ? sessionTraces.find((trace) => traceMatchesId(trace, traceId)) ?? null : null,
    );
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

  async function loadMoreProjectEvents() {
    if (eventListLoading || eventListLoadingMore || !eventListHasMore || eventListCursor === null) return;
    const generation = eventLoadGeneration.current;
    setEventListLoadingMore(true);
    setEventListError("");
    try {
      const page = await fetchProjectEvents(form, { afterSequence: eventListCursor });
      if (generation !== eventLoadGeneration.current) return;
      setProjectEvents((current) => mergeProjectEventPages(current, page.events));
      setEventListHasMore(page.has_more);
      setEventListCursor(page.next_after_sequence);
    } catch (err) {
      if (generation === eventLoadGeneration.current) {
        setEventListError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      if (generation === eventLoadGeneration.current) setEventListLoadingMore(false);
    }
  }

  async function loadMoreProjectEventReconstruction() {
    if (
      reconstructionLoading ||
      reconstructionLoadingMore ||
      !reconstruction?.has_more ||
      reconstruction.next_after_sequence === null ||
      !selectedCorrelationId
    ) {
      return;
    }
    const generation = reconstructionLoadGeneration.current;
    const currentReconstruction = reconstruction;
    setReconstructionLoadingMore(true);
    setReconstructionContinuationError("");
    try {
      const page = await fetchProjectEventReconstruction(form, selectedCorrelationId, {
        afterSequence: currentReconstruction.next_after_sequence,
        limit: PROJECT_EVENT_RECONSTRUCTION_PAGE_SIZE,
      });
      if (generation !== reconstructionLoadGeneration.current) return;
      setReconstruction(mergeProjectEventReconstructionPages(currentReconstruction, page));
    } catch (err) {
      if (generation === reconstructionLoadGeneration.current) {
        setReconstructionContinuationError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      if (generation === reconstructionLoadGeneration.current) {
        setReconstructionLoadingMore(false);
      }
    }
  }

  function selectCorrelation(correlationId: string, eventId: string | null = null) {
    if (correlationId !== selectedCorrelationId) {
      reconstructionLoadGeneration.current += 1;
      setReconstruction(null);
      setReconstructionLoadingMore(false);
      setReconstructionContinuationError("");
    }
    setProjectEventSelection({ correlationId, eventId });
    replaceProjectEventSelectionInUrl(correlationId, eventId);
  }

  function selectProjectEvent(event: ProjectEventDto) {
    const selection = projectEventReconstructionSelection(event);
    selectCorrelation(selection.correlationId, selection.eventId);
  }

  function followEventCause(
    click: ReactMouseEvent<HTMLAnchorElement>,
    correlationId: string,
    eventId: string,
  ) {
    if (click.button !== 0 || click.metaKey || click.ctrlKey || click.shiftKey || click.altKey) return;
    click.preventDefault();
    selectCorrelation(correlationId, eventId);
  }

  return (
    <div className="kernel-reference-workspace min-h-0 flex-1 overflow-auto bg-background p-4 font-sans text-foreground">
      {error ? (
        <div role="alert" className="mb-4 rounded-lg border border-destructive/40 bg-destructive/10 px-3.5 py-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}
      <section className="grid min-h-[680px] min-w-0 grid-cols-[minmax(0,1fr)] overflow-hidden rounded-lg border border-border bg-card xl:h-[calc(100vh-2rem)] xl:grid-cols-[300px_420px_minmax(0,1fr)]">
        <aside className="flex min-h-[320px] min-w-0 flex-col border-b border-border xl:min-h-0 xl:border-b-0 xl:border-r">
          <div className="border-b border-border px-4 py-3">
            <div className="flex min-w-0 items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="truncate font-display text-lg font-bold leading-tight">Sessions</h2>
                <p className="mt-1 truncate text-xs text-muted-foreground">
                  {projectSessions.length} project {projectSessions.length === 1 ? "session" : "sessions"}
                </p>
              </div>
              {loading ? (
                <span role="status" className="shrink-0 rounded-[2px] border border-border px-2 py-1 text-xs text-muted-foreground">
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

        <section
          aria-labelledby="project-event-timeline-title"
          aria-busy={
            eventListLoading ||
            eventListLoadingMore ||
            reconstructionLoading ||
            reconstructionLoadingMore
          }
          className="flex min-h-[520px] min-w-0 flex-col border-b border-border xl:min-h-0 xl:border-b-0 xl:border-r"
        >
          <div className="border-b border-border px-4 py-3">
            <div className="flex min-w-0 items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 id="project-event-timeline-title" className="truncate font-display text-lg font-bold leading-tight">
                  Project events
                </h2>
                <p className="mt-1 truncate text-xs text-muted-foreground">
                  {listedWorkflowOptions.length} {listedWorkflowOptions.length === 1 ? "workflow" : "workflows"} from {projectEvents.length} loaded {projectEvents.length === 1 ? "event" : "events"}
                </p>
              </div>
              {eventListLoading || eventListLoadingMore || reconstructionLoading || reconstructionLoadingMore ? (
                <span role="status" className="shrink-0 rounded-[2px] border border-border px-2 py-1 text-xs text-muted-foreground">
                  {eventListLoadingMore || reconstructionLoadingMore ? "Loading more" : "Loading"}
                </span>
              ) : null}
            </div>
            <label htmlFor="project-event-correlation" className="mt-3 block text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
              Workflow / correlation
            </label>
            <select
              id="project-event-correlation"
              value={selectedWorkflowAvailable ? selectedCorrelationId! : ""}
              disabled={eventListLoading || workflowOptions.length === 0}
              onChange={(event) => selectCorrelation(event.currentTarget.value)}
              className="mt-1.5 w-full rounded border border-border bg-background px-2.5 py-2 font-mono text-xs text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-status-info-border disabled:cursor-not-allowed disabled:opacity-60"
            >
              {selectedCorrelationId && !selectedWorkflowAvailable ? (
                <option value="" disabled>Loading linked workflow...</option>
              ) : workflowOptions.length === 0 ? <option value="">No loaded workflows</option> : null}
              {workflowOptions.map((option) => (
                <option key={option.correlation_id} value={option.correlation_id}>
                  {option.workflow_kind} · {option.workflow_id} · {option.event_count} {option.event_count === 1 ? "event" : "events"}
                </option>
              ))}
            </select>
          </div>

          <div id="project-event-surface" className="min-h-0 flex-1 overflow-y-auto p-3">
            {eventListError ? (
              <div role="alert" className="mb-3 rounded border border-destructive/40 bg-destructive/10 px-3 py-3 text-sm text-destructive">
                <p>Project events could not be loaded: {eventListError}</p>
                <button
                  type="button"
                  disabled={projectEvents.length > 0 && (eventListLoadingMore || eventListCursor === null)}
                  onClick={() => {
                    if (projectEvents.length === 0) setEventListReload((value) => value + 1);
                    else void loadMoreProjectEvents();
                  }}
                  className="mt-3 rounded-[2px] border border-destructive/50 px-2.5 py-1.5 text-xs font-bold focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-destructive disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {projectEvents.length === 0 ? "Try again" : "Try loading more again"}
                </button>
              </div>
            ) : null}
            {reconstructionError ? (
              <div role="alert" className="mb-3 rounded border border-destructive/40 bg-destructive/10 px-3 py-3 text-sm text-destructive">
                <p>Lifecycle could not be loaded: {reconstructionError}</p>
                <button
                  type="button"
                  onClick={() => setReconstructionReload((value) => value + 1)}
                  className="mt-3 rounded-[2px] border border-destructive/50 px-2.5 py-1.5 text-xs font-bold focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-destructive"
                >
                  Try again
                </button>
              </div>
            ) : null}
            <div id="loaded-project-event-timeline">
              {!eventListLoading && loadedWorkflowEvents.length > 0 ? (
                <section aria-labelledby="loaded-project-event-timeline-title">
                  <div className="mb-2">
                    <h3 id="loaded-project-event-timeline-title" className="text-xs font-bold text-foreground">
                      Loaded event timeline
                    </h3>
                    <p className="mt-0.5 text-[10px] text-muted-foreground">
                      Select an event to open its correlation reconstruction.
                    </p>
                  </div>
                  <ol className="max-h-52 space-y-1 overflow-y-auto pr-1" aria-label="Loaded workflow events">
                    {loadedWorkflowEvents.map((event) => {
                      const selected = isSelectedProjectEvent(event, projectEventSelection);
                      return (
                        <li key={event.event_id}>
                          <button
                            ref={(element) => {
                              if (element) loadedProjectEventButtons.current.set(event.event_id, element);
                              else loadedProjectEventButtons.current.delete(event.event_id);
                            }}
                            type="button"
                            aria-controls="project-event-reconstruction"
                            aria-pressed={selected}
                            onClick={() => selectProjectEvent(event)}
                            className={`grid w-full min-w-0 grid-cols-[52px_minmax(0,1fr)] gap-2 rounded border px-2 py-1.5 text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-status-info-border ${
                              selected
                                ? "border-status-info-border bg-status-info-fill/35 text-foreground"
                                : "border-border bg-background/45 text-muted-foreground hover:bg-muted/35 hover:text-foreground"
                            }`}
                          >
                            <span className="font-mono text-[10px] font-bold">#{event.sequence}</span>
                            <span className="min-w-0">
                              <span className="block truncate font-mono text-[11px] font-bold">{event.event_type}</span>
                              <span className="block truncate font-mono text-[9px]">{event.correlation_id}</span>
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ol>
                </section>
              ) : null}
            </div>
            {!eventListLoading && eventListHasMore ? (
              <div className="mt-3 border-t border-border pt-3 text-center">
                <button
                  type="button"
                  aria-controls="loaded-project-event-timeline"
                  disabled={eventListLoadingMore || eventListCursor === null}
                  onClick={() => void loadMoreProjectEvents()}
                  className="rounded-[2px] border border-border bg-background px-3 py-2 text-xs font-bold text-foreground hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-status-info-border disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {eventListLoadingMore
                    ? `Loading next ${PROJECT_EVENT_PAGE_SIZE} events...`
                    : `Load next ${PROJECT_EVENT_PAGE_SIZE} events`}
                </button>
                <p className="mt-2 text-[10px] text-muted-foreground">
                  History is loaded only when requested.
                </p>
              </div>
            ) : null}
            <section
              id="project-event-reconstruction"
              aria-labelledby="project-event-reconstruction-title"
              aria-live="polite"
              className="mt-3 border-t border-border pt-3"
            >
              <h3 id="project-event-reconstruction-title" className="mb-2 text-xs font-bold text-foreground">
                Reconstruction details
              </h3>
              {reconstructionContinuationError ? (
                <div role="alert" className="mb-3 rounded border border-destructive/40 bg-destructive/10 px-3 py-3 text-sm text-destructive">
                  <p>More lifecycle events could not be loaded: {reconstructionContinuationError}</p>
                  <button
                    type="button"
                    disabled={reconstructionLoadingMore}
                    onClick={() => void loadMoreProjectEventReconstruction()}
                    className="mt-3 rounded-[2px] border border-destructive/50 px-2.5 py-1.5 text-xs font-bold focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-destructive disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Try loading more again
                  </button>
                </div>
              ) : null}
              {eventListLoading ? (
                <div role="status" className="px-3 py-8 text-center text-sm text-muted-foreground">
                  Loading the first {PROJECT_EVENT_PAGE_SIZE} project events...
                </div>
              ) : eventListError && projectEvents.length === 0 ? null : workflowOptions.length === 0 ? (
                <div className="px-3 py-8 text-center text-sm text-muted-foreground">
                  {projectEvents.length === 0 && !eventListHasMore
                    ? "No accepted project events yet."
                    : "No run, sync, campaign, or session workflow is present in the loaded events."}
                </div>
              ) : reconstructionError ? null : reconstructionLoading || !reconstruction ? (
                <div role="status" className="px-3 py-8 text-center text-sm text-muted-foreground">
                  Loading the first {PROJECT_EVENT_RECONSTRUCTION_PAGE_SIZE} lifecycle events...
                </div>
              ) : timeline.length === 0 ? (
                <div className="px-3 py-8 text-center text-sm text-muted-foreground">
                  This correlation has no accepted lifecycle events.
                </div>
              ) : (
                <ol className="space-y-3" aria-label="Ordered accepted project-event lifecycle">
                  {timeline.map((item) => (
                    <li
                      ref={(element) => {
                        if (element) reconstructionProjectEventItems.current.set(item.event_id, element);
                        else reconstructionProjectEventItems.current.delete(item.event_id);
                      }}
                      id={projectEventAnchorId(item.event_id)}
                      key={item.event_id}
                      tabIndex={-1}
                      className="scroll-mt-3 rounded border border-border bg-background/45 p-3 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-status-info-border"
                    >
                      <div className="flex min-w-0 items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h4 className="break-words font-mono text-xs font-bold text-foreground">
                            {item.event_type}
                          </h4>
                          <p className="mt-1 break-all font-mono text-[10px] text-muted-foreground">
                            {item.event_id}
                          </p>
                        </div>
                        <span className="shrink-0 rounded-[2px] border border-border px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                          #{item.sequence}
                        </span>
                      </div>

                      <dl className="mt-3 grid grid-cols-[64px_minmax(0,1fr)] gap-x-2 gap-y-1 text-[11px]">
                        <dt className="font-bold uppercase text-muted-foreground">Actor</dt>
                        <dd className="font-mono text-foreground">{item.actor}</dd>
                        <dt className="font-bold uppercase text-muted-foreground">Subject</dt>
                        <dd className="break-all font-mono text-foreground">{item.subject_kind}:{item.subject_id}</dd>
                        <dt className="font-bold uppercase text-muted-foreground">At</dt>
                        <dd className="break-all font-mono text-foreground">
                          <time dateTime={item.occurred_at}>{item.occurred_at}</time>
                        </dd>
                      </dl>

                      <div className="mt-3">
                        <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">Payload summary</p>
                        <pre className="mt-1 max-h-24 overflow-auto whitespace-pre-wrap break-words rounded bg-muted/40 p-2 font-mono text-[10px] leading-4 text-foreground">
                          {JSON.stringify(item.payload_summary)}
                        </pre>
                      </div>

                      <div className="mt-3 border-t border-border/70 pt-2 text-[11px]">
                        <span className="font-bold uppercase text-muted-foreground">Caused by </span>
                        {item.caused_by.kind === "event" ? (
                          <a
                            href={projectEventSelectionUrl(
                              window.location.href,
                              item.caused_by.correlation_id,
                              item.caused_by.event_id,
                            )}
                            onClick={(click) => {
                              const cause = item.caused_by;
                              if (cause.kind === "event") {
                                followEventCause(click, cause.correlation_id, cause.event_id);
                              }
                            }}
                            className="break-words font-mono text-status-info underline decoration-status-info/50 underline-offset-2 hover:decoration-status-info focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-status-info-border"
                          >
                            event #{item.caused_by.sequence} · {item.caused_by.event_type} · {item.caused_by.event_id}
                          </a>
                        ) : (
                          <span className="break-all font-mono text-foreground">
                            command · {item.caused_by.command_id}
                          </span>
                        )}
                      </div>

                      {item.kernel_traces.length > 0 ? (
                        <div className="mt-2 flex flex-wrap gap-2 border-t border-border/70 pt-2">
                          {item.kernel_traces.map((kernelTrace, index) => {
                            const kernelSession = projectSessionForKernelTrace(projectSessions, kernelTrace);
                            const href = kernelTraceSelectionUrl(
                              kernelTrace.href,
                              window.location.href,
                              {
                                projectId: reconstruction.project_id,
                                sessionId: kernelSession?.sessionUuid ?? null,
                                correlationId: item.correlation_id,
                                eventId: item.event_id,
                              },
                            );
                            const key = `${kernelTrace.event_id}:${kernelTrace.kernel_event_id}:${index}`;
                            if (!href) {
                              return (
                                <span
                                  key={key}
                                  title="The server trace target was rejected because it is not a safe local trace URL."
                                  className="rounded-[2px] border border-border px-2 py-1 text-[10px] font-bold text-muted-foreground"
                                >
                                  Trace link unavailable
                                </span>
                              );
                            }
                            return (
                              <a
                                key={key}
                                href={href}
                                onClick={(click) => {
                                  const target = click.currentTarget.getAttribute("href") ?? "";
                                  if (!isSafeLocalTraceHref(target, window.location.href)) click.preventDefault();
                                }}
                                aria-label={`Kernel trace ${index + 1} for event ${item.event_id}`}
                                title={`${kernelTrace.kernel_event_id} · ${kernelTrace.container_id}`}
                                className="rounded-[2px] border border-status-info-border bg-status-info-fill px-2 py-1 text-[10px] font-bold text-status-info hover:brightness-110 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-status-info-border"
                              >
                                Kernel trace{item.kernel_traces.length > 1 ? ` ${index + 1}` : ""}
                              </a>
                            );
                          })}
                        </div>
                      ) : null}
                    </li>
                  ))}
                </ol>
              )}
              {selectedEventAvailability === "continuation-available" ? (
                <p
                  id="project-event-selection-continuation"
                  role="status"
                  className="mt-3 text-center text-[11px] text-muted-foreground"
                >
                  The selected event is beyond the loaded lifecycle page. Load one bounded page at a time until it appears.
                </p>
              ) : selectedEventAvailability === "missing" ? (
                <p role="status" className="mt-3 text-center text-[11px] text-muted-foreground">
                  The selected event is not present in this correlation reconstruction.
                </p>
              ) : null}
              {reconstruction?.has_more ? (
                <div className="mt-3 border-t border-border pt-3 text-center">
                  <button
                    type="button"
                    aria-controls="project-event-reconstruction"
                    aria-describedby={
                      selectedEventAvailability === "continuation-available"
                        ? "project-event-selection-continuation"
                        : undefined
                    }
                    disabled={
                      reconstructionLoadingMore || reconstruction.next_after_sequence === null
                    }
                    onClick={() => void loadMoreProjectEventReconstruction()}
                    className="rounded-[2px] border border-border bg-background px-3 py-2 text-xs font-bold text-foreground hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-status-info-border disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {reconstructionLoadingMore
                      ? `Loading next ${PROJECT_EVENT_RECONSTRUCTION_PAGE_SIZE} lifecycle events...`
                      : selectedEventAvailability === "continuation-available"
                        ? `Load next ${PROJECT_EVENT_RECONSTRUCTION_PAGE_SIZE} to find selected event`
                        : `Load next ${PROJECT_EVENT_RECONSTRUCTION_PAGE_SIZE} lifecycle events`}
                  </button>
                  <p className="mt-2 text-[10px] text-muted-foreground">
                    Reconstruction continues only when requested.
                  </p>
                </div>
              ) : null}
            </section>
          </div>
        </section>

        <div className="min-h-[520px] overflow-hidden xl:min-h-0">
          {loading && !detail ? (
            <div role="status" className="flex h-full items-center justify-center text-sm text-muted-foreground">
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
