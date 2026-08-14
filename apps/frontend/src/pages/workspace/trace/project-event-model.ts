import type {
  ProjectEventCause,
  ProjectEventDto,
  ProjectEventKernelTraceProjection,
  ProjectEventReconstructionPage,
} from "@/lib/api-types";

export interface ProjectEventWorkflowOption {
  workflow_kind: ProjectEventWorkflowKind;
  workflow_id: string;
  correlation_id: string;
  event_count: number;
  first_sequence: number;
  last_sequence: number;
}

export type ProjectEventWorkflowKind = "run" | "sync" | "campaign" | "session";

export interface ProjectEventTimelineItem {
  event_id: string;
  sequence: number;
  event_type: string;
  correlation_id: string;
  subject_kind: string;
  subject_id: string;
  actor: ProjectEventDto["actor"];
  occurred_at: string;
  payload_summary: ProjectEventDto["payload_summary"];
  caused_by: ProjectEventCause;
  kernel_traces: ProjectEventKernelTraceProjection[];
}

export interface TraceUrlSelection {
  sessionId: string | null;
  traceId: string | null;
  containerId: string | null;
}

export interface ProjectEventReconstructionSelection {
  correlationId: string;
  eventId: string;
}

export interface ProjectEventUrlSelection {
  correlationId: string | null;
  eventId: string | null;
}

export type ProjectEventAnchorAvailability =
  | "unselected"
  | "awaiting-reconstruction"
  | "continuation-available"
  | "loaded"
  | "missing";

export interface KernelTraceUrlContext {
  projectId: string | null;
  sessionId: string | null;
  correlationId: string;
  eventId: string;
}

const PROJECT_EVENT_HASH_PREFIX = "#project-event-";
const PROJECT_EVENT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._~:/-]{0,255}$/;
const FALLBACK_TRACE_ORIGIN = "http://trace.local";

function ascendingSequence(left: Pick<ProjectEventDto, "sequence">, right: Pick<ProjectEventDto, "sequence">): number {
  return left.sequence - right.sequence;
}

interface ProjectEventWorkflowIdentity {
  kind: ProjectEventWorkflowKind;
  id: string;
}

interface ProjectEventWorkflowAccumulator {
  identity: ProjectEventWorkflowIdentity | null;
  ambiguous: boolean;
  correlation_id: string;
  event_count: number;
  first_sequence: number;
  last_sequence: number;
}

function workflowKindFromDispatch(value: unknown): ProjectEventWorkflowKind | null {
  if (value === "run" || value === "sync" || value === "session") return value;
  if (value === "pr" || value === "pr_campaign" || value === "campaign") return "campaign";
  return null;
}

function workflowKindFromSubject(value: string): ProjectEventWorkflowKind | null {
  if (value === "run" || value === "session") return value;
  if (value === "sync_workflow") return "sync";
  return value === "pr_campaign" ? "campaign" : null;
}

function payloadText(event: ProjectEventDto, key: string): string | null {
  const value = event.payload_summary[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function projectDispatchWorkflow(event: ProjectEventDto): ProjectEventWorkflowIdentity | null {
  if (event.subject_kind !== "project" || !event.event_type.startsWith("project.dispatch_")) return null;
  const directKind = workflowKindFromDispatch(payloadText(event, "kind") ?? payloadText(event, "requested_kind"));
  const directId = payloadText(event, "workflow_id");
  if (directKind && directId) return { kind: directKind, id: directId };

  const oldLeaseHolder = event.payload_summary.old_lease_holder;
  if (!oldLeaseHolder || typeof oldLeaseHolder !== "object" || Array.isArray(oldLeaseHolder)) return null;
  const oldKind = workflowKindFromDispatch(oldLeaseHolder.kind);
  const oldId = typeof oldLeaseHolder.workflow_id === "string" && oldLeaseHolder.workflow_id.trim()
    ? oldLeaseHolder.workflow_id.trim()
    : null;
  return oldKind && oldId ? { kind: oldKind, id: oldId } : null;
}

export function projectEventWorkflowIdentity(event: ProjectEventDto): ProjectEventWorkflowIdentity | null {
  const kind = workflowKindFromSubject(event.subject_kind);
  return kind ? { kind, id: event.subject_id } : projectDispatchWorkflow(event);
}

export function projectEventWorkflowOptions(events: readonly ProjectEventDto[]): ProjectEventWorkflowOption[] {
  const grouped = new Map<string, ProjectEventWorkflowAccumulator>();
  const eventsById = new Map<string, ProjectEventDto>();
  for (const event of events) {
    if (!eventsById.has(event.event_id)) eventsById.set(event.event_id, event);
  }
  for (const event of [...eventsById.values()].sort(ascendingSequence)) {
    const identity = projectEventWorkflowIdentity(event);
    const accumulator = grouped.get(event.correlation_id);
    if (accumulator) {
      accumulator.event_count += 1;
      accumulator.last_sequence = event.sequence;
      if (identity && accumulator.identity && (
        identity.kind !== accumulator.identity.kind || identity.id !== accumulator.identity.id
      )) {
        accumulator.ambiguous = true;
      } else if (identity && !accumulator.identity) {
        accumulator.identity = identity;
      }
    } else {
      grouped.set(event.correlation_id, {
        identity,
        ambiguous: false,
        correlation_id: event.correlation_id,
        event_count: 1,
        first_sequence: event.sequence,
        last_sequence: event.sequence,
      });
    }
  }
  return [...grouped.values()]
    .filter((option): option is ProjectEventWorkflowAccumulator & { identity: ProjectEventWorkflowIdentity } => (
      !option.ambiguous && option.identity !== null
    ))
    .map((option) => ({
      workflow_kind: option.identity.kind,
      workflow_id: option.identity.id,
      correlation_id: option.correlation_id,
      event_count: option.event_count,
      first_sequence: option.first_sequence,
      last_sequence: option.last_sequence,
    }))
    .sort((left, right) => right.last_sequence - left.last_sequence);
}

export function chooseProjectEventCorrelation(
  options: ProjectEventWorkflowOption[],
  preferredCorrelationId: string | null,
): string | null {
  if (
    preferredCorrelationId &&
    options.some((option) => option.correlation_id === preferredCorrelationId)
  ) {
    return preferredCorrelationId;
  }
  return options[0]?.correlation_id ?? null;
}

export function mergeProjectEventPages<TEvent extends Pick<ProjectEventDto, "event_id" | "sequence">>(
  current: readonly TEvent[],
  next: readonly TEvent[],
): TEvent[] {
  const eventsById = new Map<string, TEvent>();
  for (const event of [...current, ...next]) {
    if (!eventsById.has(event.event_id)) eventsById.set(event.event_id, event);
  }
  return [...eventsById.values()].sort((left, right) => (
    left.sequence - right.sequence || left.event_id.localeCompare(right.event_id)
  ));
}

function mergeKernelTracePages(
  current: readonly ProjectEventKernelTraceProjection[],
  next: readonly ProjectEventKernelTraceProjection[],
): ProjectEventKernelTraceProjection[] {
  const tracesByIdentity = new Map<string, ProjectEventKernelTraceProjection>();
  for (const trace of [...current, ...next]) {
    const identity = `${trace.event_id}\u0000${trace.kernel_event_id}`;
    if (!tracesByIdentity.has(identity)) tracesByIdentity.set(identity, trace);
  }
  return [...tracesByIdentity.values()];
}

export function mergeProjectEventReconstructionPages(
  current: ProjectEventReconstructionPage | null,
  next: ProjectEventReconstructionPage,
): ProjectEventReconstructionPage {
  if (
    current &&
    (current.project_id !== next.project_id || current.correlation_id !== next.correlation_id)
  ) {
    throw new Error("Cannot merge reconstruction pages from different projects or correlations");
  }
  return {
    ...next,
    events: mergeProjectEventPages(current?.events ?? [], next.events),
    kernel_traces: mergeKernelTracePages(current?.kernel_traces ?? [], next.kernel_traces),
  };
}

export function projectEventTimeline(reconstruction: ProjectEventReconstructionPage): ProjectEventTimelineItem[] {
  const tracesByEvent = new Map<string, ProjectEventKernelTraceProjection[]>();
  for (const trace of reconstruction.kernel_traces) {
    const traces = tracesByEvent.get(trace.event_id) ?? [];
    traces.push(trace);
    tracesByEvent.set(trace.event_id, traces);
  }

  return [...reconstruction.events].sort(ascendingSequence).map((event) => ({
    event_id: event.event_id,
    sequence: event.sequence,
    event_type: event.event_type,
    correlation_id: event.correlation_id,
    subject_kind: event.subject_kind,
    subject_id: event.subject_id,
    actor: event.actor,
    occurred_at: event.occurred_at,
    payload_summary: event.payload_summary,
    caused_by: event.caused_by,
    kernel_traces: tracesByEvent.get(event.event_id) ?? [],
  }));
}

export function projectEventReconstructionSelection(
  event: Pick<ProjectEventDto, "correlation_id" | "event_id">,
): ProjectEventReconstructionSelection {
  return { correlationId: event.correlation_id, eventId: event.event_id };
}

export function projectEventAnchorId(eventId: string): string {
  return `project-event-${encodeURIComponent(eventId)}`;
}

export function selectedProjectEventIdFromHash(hash: string): string | null {
  if (!hash.startsWith(PROJECT_EVENT_HASH_PREFIX)) return null;
  const encodedEventId = hash.slice(PROJECT_EVENT_HASH_PREFIX.length);
  if (!encodedEventId) return null;
  try {
    const eventId = decodeURIComponent(encodedEventId);
    if (!PROJECT_EVENT_ID_PATTERN.test(eventId)) return null;
    return `#${projectEventAnchorId(eventId)}` === hash ? eventId : null;
  } catch {
    return null;
  }
}

export function selectedProjectEventCorrelation(search: string): string | null {
  return new URLSearchParams(search).get("correlation_id");
}

export function projectEventUrlSelection(search: string, hash: string): ProjectEventUrlSelection {
  return {
    correlationId: selectedProjectEventCorrelation(search),
    eventId: selectedProjectEventIdFromHash(hash),
  };
}

export function isSelectedProjectEvent(
  event: Pick<ProjectEventDto, "correlation_id" | "event_id">,
  selection: ProjectEventUrlSelection,
): boolean {
  return Boolean(
    selection.correlationId &&
    selection.eventId &&
    event.correlation_id === selection.correlationId &&
    event.event_id === selection.eventId
  );
}

export function projectEventAnchorAvailability(
  selection: ProjectEventUrlSelection,
  reconstruction: ProjectEventReconstructionPage | null,
): ProjectEventAnchorAvailability {
  if (!selection.eventId) return "unselected";
  if (
    !selection.correlationId ||
    !reconstruction ||
    reconstruction.correlation_id !== selection.correlationId
  ) {
    return "awaiting-reconstruction";
  }
  if (reconstruction.events.some((event) => isSelectedProjectEvent(event, selection))) {
    return "loaded";
  }
  return reconstruction.has_more && reconstruction.next_after_sequence !== null
    ? "continuation-available"
    : "missing";
}

export function projectEventSelectionUrl(
  currentHref: string,
  correlationId: string | null,
  eventId?: string | null,
): string {
  const url = new URL(currentHref, FALLBACK_TRACE_ORIGIN);
  if (correlationId) url.searchParams.set("correlation_id", correlationId);
  else url.searchParams.delete("correlation_id");
  if (typeof eventId === "string") {
    url.hash = projectEventAnchorId(eventId);
  } else if (eventId === null && url.hash.startsWith(PROJECT_EVENT_HASH_PREFIX)) {
    url.hash = "";
  }
  return `${url.pathname}${url.search}${url.hash}`;
}

export function traceSelectionUrl(currentHref: string, selection: TraceUrlSelection): string {
  const url = new URL(currentHref, FALLBACK_TRACE_ORIGIN);
  const identities = [
    ["sessionId", selection.sessionId],
    ["traceId", selection.traceId],
    ["containerId", selection.containerId],
  ] as const;
  for (const [name, value] of identities) {
    if (value) url.searchParams.set(name, value);
    else url.searchParams.delete(name);
  }
  return `${url.pathname}${url.search}${url.hash}`;
}

function localTraceTarget(candidateHref: string, currentHref: string): { current: URL; target: URL } | null {
  try {
    const current = new URL(currentHref, FALLBACK_TRACE_ORIGIN);
    const candidate = candidateHref.trim();
    if (
      !candidate.startsWith("/") ||
      candidate.startsWith("//") ||
      candidate.includes("\\") ||
      /[\r\n]/.test(candidate) ||
      /%(?![0-9a-f]{2})/i.test(candidate) ||
      (current.protocol !== "http:" && current.protocol !== "https:")
    ) {
      return null;
    }
    let decoded = candidate;
    for (let pass = 0; pass < 3; pass += 1) {
      const next = decodeURIComponent(decoded);
      if (
        next.includes("\\") ||
        /[\r\n]/.test(next) ||
        /(?:^|[/?#&=])\.\.(?:[/?#&=]|$)/.test(next)
      ) {
        return null;
      }
      if (next === decoded) break;
      decoded = next;
    }
    const target = new URL(candidate, current);
    if (
      target.origin !== current.origin ||
      target.protocol !== current.protocol ||
      target.pathname !== "/workspace/trace" ||
      target.username ||
      target.password
    ) {
      return null;
    }
    return { current, target };
  } catch {
    return null;
  }
}

export function isSafeLocalTraceHref(candidateHref: string, currentHref: string): boolean {
  return localTraceTarget(candidateHref, currentHref) !== null;
}

/**
 * Keeps the server href as the sole source of kernel trace identity. Project,
 * matching session, and project-event context are added only to a local trace
 * target. Unsafe, off-origin, and non-trace targets are not renderable.
 */
export function kernelTraceSelectionUrl(
  serverHref: string,
  currentHref: string,
  context: KernelTraceUrlContext,
): string | null {
  const local = localTraceTarget(serverHref, currentHref);
  if (!local) return null;
  const { target } = local;
  if (context.projectId && !target.searchParams.has("projectId")) {
    target.searchParams.set("projectId", context.projectId);
  }
  if (context.sessionId && !target.searchParams.has("sessionId")) {
    target.searchParams.set("sessionId", context.sessionId);
  }
  target.searchParams.set("correlation_id", context.correlationId);
  target.hash = projectEventAnchorId(context.eventId);
  return `${target.pathname}${target.search}${target.hash}`;
}
