import type { DashboardProjectContextService } from "@server/application/dashboard/project-context";
import {
  DEFAULT_EVENT_QUERY_LIMIT,
  MAX_EVENT_QUERY_LIMIT,
  ProjectEventQueryValidationError,
  type ProjectEventQueryInput,
  type ProjectEventQueryPage,
  type ProjectEventReconstruction,
  type ProjectEventReconstructionPageOptions,
} from "@server/core/project-state/event-query";
import {
  PROJECT_EVENT_SUBJECT_KINDS,
  type ProjectEventSubjectKind,
} from "@server/core/project-state/event-registry";

type JsonResponder = (data: unknown, init?: ResponseInit) => Response;

export interface EventsApiRouteDeps {
  json: JsonResponder;
  projectContext: Pick<DashboardProjectContextService, "requestPaths">;
  queryEvents: (
    stateDir: string,
    input: ProjectEventQueryInput,
  ) => ProjectEventQueryPage | Promise<ProjectEventQueryPage>;
  reconstructEvents: (
    stateDir: string,
    projectId: string,
    correlationId: string,
    options: ProjectEventReconstructionPageOptions,
  ) => ProjectEventReconstruction | Promise<ProjectEventReconstruction>;
}

class EventsApiInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EventsApiInputError";
  }
}

const FORBIDDEN_READ_PARAMETER_NAMES = new Set([
  "databasepath",
  "graphdb",
  "graphdbpath",
  "includepayload",
  "path",
  "raw",
  "rawpath",
  "rawpayload",
  "repopath",
  "reporoot",
  "statepath",
  "statedir",
  "usepathoverrides",
]);

function normalizedParameterName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function rejectUnsafeReadParameters(params: URLSearchParams): void {
  for (const name of params.keys()) {
    if (FORBIDDEN_READ_PARAMETER_NAMES.has(normalizedParameterName(name))) {
      throw new EventsApiInputError("Project path and raw payload overrides are not supported");
    }
  }
}

function nonblankParam(params: URLSearchParams, name: string): string | undefined {
  const raw = params.get(name);
  if (raw === null) return undefined;
  const value = raw.trim();
  if (!value) throw new EventsApiInputError(`${name} must be a nonblank string`);
  return value;
}

function integerParam(
  params: URLSearchParams,
  name: string,
  options: { defaultValue?: number; maximum?: number; minimum: number },
): number | undefined {
  const raw = params.get(name);
  if (raw === null) return options.defaultValue;
  const maximum = options.maximum ?? Number.MAX_SAFE_INTEGER;
  if (!/^\d+$/.test(raw)) {
    throw new EventsApiInputError(
      `${name} must be an integer between ${options.minimum} and ${maximum}`,
    );
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < options.minimum || value > maximum) {
    throw new EventsApiInputError(
      `${name} must be an integer between ${options.minimum} and ${maximum}`,
    );
  }
  return value;
}

function registeredSubjectKind(value: string): value is ProjectEventSubjectKind {
  return PROJECT_EVENT_SUBJECT_KINDS.includes(value as ProjectEventSubjectKind);
}

function subjectFilter(params: URLSearchParams): ProjectEventQueryInput["subject"] {
  const hasKind = params.has("subject_kind");
  const hasId = params.has("subject_id");
  if (hasKind !== hasId) {
    throw new EventsApiInputError("subject_kind and subject_id must be provided together");
  }
  if (!hasKind) return undefined;
  const kind = nonblankParam(params, "subject_kind")!;
  if (!registeredSubjectKind(kind)) {
    throw new EventsApiInputError("subject_kind must be a registered project event subject kind");
  }
  return {
    kind,
    id: nonblankParam(params, "subject_id")!,
  };
}

function projectRequest(url: URL, deps: EventsApiRouteDeps): { projectId: string; stateDir: string } {
  const paths = deps.projectContext.requestPaths(url, { useDefaultProject: true });
  const projectId = paths.project?.projectId.trim() ?? "";
  const stateDir = paths.project?.stateDir.trim() ?? "";
  if (!projectId || !stateDir || paths.usePathOverrides) {
    throw new Error("canonical project context unavailable");
  }
  return { projectId, stateDir };
}

function pageOptions(params: URLSearchParams): ProjectEventReconstructionPageOptions {
  return {
    afterSequence: integerParam(params, "after_sequence", { minimum: 0 }),
    limit: integerParam(params, "limit", {
      defaultValue: DEFAULT_EVENT_QUERY_LIMIT,
      minimum: 1,
      maximum: MAX_EVENT_QUERY_LIMIT,
    }),
  };
}

function listInput(params: URLSearchParams, projectId: string): ProjectEventQueryInput {
  const fromSequence = integerParam(params, "from_sequence", { minimum: 0 });
  const toSequence = integerParam(params, "to_sequence", { minimum: 0 });
  if (fromSequence !== undefined && toSequence !== undefined && fromSequence > toSequence) {
    throw new EventsApiInputError("from_sequence must be less than or equal to to_sequence");
  }
  return {
    projectId,
    correlationId: nonblankParam(params, "correlation_id"),
    subject: subjectFilter(params),
    eventTypePrefix: nonblankParam(params, "event_type_prefix"),
    fromSequence,
    toSequence,
    afterSequence: integerParam(params, "after_sequence", { minimum: 0 }),
    limit: integerParam(params, "limit", {
      defaultValue: DEFAULT_EVENT_QUERY_LIMIT,
      minimum: 1,
      maximum: MAX_EVENT_QUERY_LIMIT,
    }),
  };
}

function inputErrorResponse(error: EventsApiInputError, deps: EventsApiRouteDeps): Response {
  return deps.json({ error: error.message }, { status: 400 });
}

function readFailureResponse(deps: EventsApiRouteDeps): Response {
  return deps.json({ error: "Project event read failed" }, { status: 500 });
}

export async function handleEventsApiRoute(
  req: Request,
  url: URL,
  deps: EventsApiRouteDeps,
): Promise<Response | null> {
  const listPath = "/api/events";
  const reconstructPath = "/api/events/reconstruct";
  if (url.pathname !== listPath && url.pathname !== reconstructPath) return null;
  if (req.method !== "GET") {
    return deps.json(
      { error: "method not allowed" },
      { status: 405, headers: { Allow: "GET" } },
    );
  }

  try {
    rejectUnsafeReadParameters(url.searchParams);
  } catch (error) {
    if (error instanceof EventsApiInputError) return inputErrorResponse(error, deps);
    return deps.json({ error: "Invalid project event request" }, { status: 400 });
  }

  let request: { projectId: string; stateDir: string };
  try {
    request = projectRequest(url, deps);
  } catch {
    return deps.json({ error: "Invalid project context" }, { status: 400 });
  }

  if (url.pathname === reconstructPath) {
    let correlationId: string;
    let options: ProjectEventReconstructionPageOptions;
    try {
      correlationId = nonblankParam(url.searchParams, "correlation_id") ?? "";
      if (!correlationId) throw new EventsApiInputError("correlation_id is required");
      options = pageOptions(url.searchParams);
    } catch (error) {
      if (error instanceof EventsApiInputError) return inputErrorResponse(error, deps);
      return deps.json({ error: "Invalid project event request" }, { status: 400 });
    }
    try {
      return deps.json(
        await deps.reconstructEvents(
          request.stateDir,
          request.projectId,
          correlationId,
          options,
        ),
      );
    } catch (error) {
      if (error instanceof ProjectEventQueryValidationError) {
        return deps.json({ error: error.message }, { status: 400 });
      }
      return readFailureResponse(deps);
    }
  }

  let input: ProjectEventQueryInput;
  try {
    input = listInput(url.searchParams, request.projectId);
  } catch (error) {
    if (error instanceof EventsApiInputError) return inputErrorResponse(error, deps);
    return deps.json({ error: "Invalid project event request" }, { status: 400 });
  }
  try {
    return deps.json(await deps.queryEvents(request.stateDir, input));
  } catch (error) {
    if (error instanceof ProjectEventQueryValidationError) {
      return deps.json({ error: error.message }, { status: 400 });
    }
    return readFailureResponse(deps);
  }
}
