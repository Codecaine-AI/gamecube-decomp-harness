// Project workspace routing. The orchestrator UI is project-centered: a top
// Project Dashboard holds project cards, each card opens a Project Workspace
// (Overview / Standards / Sessions / Agents / Trace / Settings / Style), and the active session is a
// nested surface inside Sessions with its own phase sub-navigation.
//
// The route is encoded in the path so deep links and reloads keep the operator
// where they were without leaking internal view state into the URL:
//   /                                -> project dashboard
//   /overview
//   /standards
//   /standards/rendered
//   /sessions
//   /sessions/active/run
//   /agents
//   /trace
//   /settings
//   /style
//
// Legacy ?page=<old> and ?view=workspace&section=<old> values map onto the new
// structure so existing bookmarks and deep links keep working.

export type WorkspaceSection = "overview" | "standards" | "sessions" | "agents" | "trace" | "knowledge" | "settings" | "style";
export type StandardsView = "edit" | "rendered";
export type SessionStage = "prepare" | "run" | "pr" | "done";
export type SessionSubPage = SessionStage | "summary" | "review" | "artifacts";
// "active" points at the single active session; a run id opens a past session.
export type SessionFocus = "active" | "new" | string;

export type AppRoute =
  | { kind: "dashboard" }
  | { kind: "workspace"; section: WorkspaceSection; projectId?: string; standardsView?: StandardsView; session?: SessionFocus; sessionSub?: SessionSubPage };

export const WORKSPACE_SECTIONS: ReadonlyArray<{ id: WorkspaceSection; label: string; description: string }> = [
  { id: "overview", label: "Overview", description: "Active session, PR gate, readiness, and next action." },
  { id: "standards", label: "Standards", description: "Inspect decomp standards, QA coverage, examples, and rendered prompt XML." },
  { id: "sessions", label: "Sessions", description: "Active session, run/PR phases, and history." },
  { id: "agents", label: "Agents", description: "Prompt previews, agent catalog migration, and recent agent execution identity." },
  { id: "trace", label: "Trace", description: "Kernel container tree, trace events, agent runs, and session lineage." },
  { id: "knowledge", label: "Knowledge", description: "Browse the learning ledger: search, filter by scope/origin/status, and inspect evidence." },
  { id: "settings", label: "Settings", description: "Project paths, overrides, and validation defaults." },
  { id: "style", label: "Style", description: "Global grain texture controls." },
];

export const STANDARDS_VIEWS: ReadonlyArray<{ id: StandardsView; label: string }> = [
  { id: "edit", label: "Editor" },
  { id: "rendered", label: "Rendered" },
];

export const SESSION_STAGES: ReadonlyArray<{ id: SessionStage; label: string }> = [
  { id: "prepare", label: "Prepare" },
  { id: "run", label: "Run" },
  { id: "pr", label: "PR" },
  { id: "done", label: "Done" },
];

export const SESSION_SUBPAGES: ReadonlyArray<{ id: SessionSubPage; label: string }> = [
  ...SESSION_STAGES,
  { id: "summary", label: "Summary" },
  { id: "review", label: "Review" },
  { id: "artifacts", label: "Artifacts" },
];

// The active-session workflow stepper doubles as the visible sub-navigation.
export const SESSION_PHASES = SESSION_STAGES;

export function sessionStageForSubPage(sub: SessionSubPage | null | undefined): SessionStage {
  if (sub === "prepare" || sub === "run" || sub === "pr" || sub === "done") return sub;
  if (sub === "review") return "pr";
  return "done";
}

function isWorkspaceSection(value: string | null): value is WorkspaceSection {
  return WORKSPACE_SECTIONS.some((section) => section.id === value);
}

export function isStandardsView(value: string | null): value is StandardsView {
  return STANDARDS_VIEWS.some((view) => view.id === value);
}

export function isSessionSubPage(value: string | null): value is SessionSubPage {
  return SESSION_SUBPAGES.some((sub) => sub.id === value);
}

// Map the pre-redesign peer tabs onto the new nested structure.
function routeFromLegacyPage(page: string | null): AppRoute | null {
  switch (page ?? "") {
    case "project":
      return { kind: "workspace", section: "overview" };
    case "access":
      return { kind: "workspace", section: "settings" };
    case "session":
      return { kind: "workspace", section: "sessions", session: "active", sessionSub: "done" };
    case "run":
      return { kind: "workspace", section: "sessions", session: "active", sessionSub: "run" };
    case "pr":
      return { kind: "workspace", section: "sessions", session: "active", sessionSub: "pr" };
    case "history":
      return { kind: "workspace", section: "sessions", session: "active", sessionSub: "done" };
    default:
      return null;
  }
}

function projectIdFromParams(params: URLSearchParams): string | undefined {
  return params.get("projectId") || undefined;
}

function withProjectId(route: AppRoute, projectId: string | undefined): AppRoute {
  if (route.kind === "dashboard" || !projectId) return route;
  return { ...route, projectId };
}

function stripTrailingSlash(pathname: string): string {
  if (pathname.length <= 1) return pathname;
  return pathname.replace(/\/+$/, "");
}

function pathSegments(pathname: string): string[] {
  return stripTrailingSlash(pathname)
    .split("/")
    .filter(Boolean)
    .map((segment) => {
      try {
        return decodeURIComponent(segment);
      } catch {
        return segment;
      }
    });
}

function workspaceRouteFromSearchParams(params: URLSearchParams): AppRoute | null {
  const legacy = routeFromLegacyPage(params.get("page"));
  if (legacy) return withProjectId(legacy, projectIdFromParams(params));

  const view = params.get("view");
  if (!view) return null;
  if (view !== "workspace") return { kind: "dashboard" };

  const requestedSection = params.get("section");
  // Legacy: the old Knowledge section had kb=standards|graph sub-tabs. Map
  // kb=standards onto the split Standards section so existing bookmarks and
  // deep links keep working.
  const section: WorkspaceSection =
    requestedSection === "knowledge" && params.get("kb") === "standards"
      ? "standards"
      : isWorkspaceSection(requestedSection)
        ? requestedSection
        : "overview";

  const base = {
    kind: "workspace",
    section,
    projectId: projectIdFromParams(params),
  } as const;
  if (section === "standards") {
    return {
      ...base,
      standardsView: isStandardsView(params.get("std")) ? (params.get("std") as StandardsView) : "edit",
    };
  }
  if (section === "sessions") {
    return {
      ...base,
      session: params.get("session") || undefined,
      sessionSub: isSessionSubPage(params.get("sub")) ? (params.get("sub") as SessionSubPage) : undefined,
    };
  }
  return base;
}

function routeFromPathname(pathname: string, params: URLSearchParams): AppRoute {
  const segments = pathSegments(pathname);
  if (segments.length === 0 || segments[0] === "dashboard" || segments[0] === "projects") {
    return { kind: "dashboard" };
  }

  const [first, second, third] = segments[0] === "workspace" ? segments.slice(1) : segments;
  if (first === "knowledge" && params.get("kb") === "standards") {
    return {
      kind: "workspace",
      section: "standards",
      projectId: projectIdFromParams(params),
      standardsView: "edit",
    };
  }
  if (!first || !isWorkspaceSection(first)) return { kind: "dashboard" };
  const section: WorkspaceSection = first;

  const base = {
    kind: "workspace" as const,
    section,
    projectId: projectIdFromParams(params),
  };

  if (section === "standards") {
    return {
      ...base,
      standardsView: isStandardsView(second ?? null) ? second as StandardsView : "edit",
    };
  }

  if (section === "sessions") {
    const session = second || undefined;
    return {
      ...base,
      session,
      sessionSub: isSessionSubPage(third ?? null) ? third as SessionSubPage : undefined,
    };
  }

  return base;
}

export function routeFromUrl(): AppRoute {
  try {
    const url = new URL(window.location.href);
    return workspaceRouteFromSearchParams(url.searchParams) ?? routeFromPathname(url.pathname, url.searchParams);
  } catch {
    return { kind: "dashboard" };
  }
}

function setProjectId(url: URL, projectId: string | undefined): void {
  if (projectId) url.searchParams.set("projectId", projectId);
}

export function routeToUrl(route: AppRoute): string {
  const url = new URL(window.location.href);
  url.search = "";
  url.hash = "";
  if (route.kind === "dashboard") {
    url.pathname = "/";
  } else {
    setProjectId(url, route.projectId);
    if (route.section === "standards") {
      url.pathname = route.standardsView === "rendered" ? "/standards/rendered" : "/standards";
    } else if (route.section === "sessions") {
      const segments = ["sessions"];
      if (route.session) {
        segments.push(encodeURIComponent(route.session));
        if (route.sessionSub) segments.push(route.sessionSub);
      }
      url.pathname = `/${segments.join("/")}`;
    } else {
      url.pathname = `/${route.section}`;
    }
  }
  return `${url.pathname}${url.search}${url.hash}`;
}

export function saveRoute(route: AppRoute): void {
  try {
    const nextUrl = routeToUrl(route);
    const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (nextUrl !== currentUrl) window.history.pushState(null, "", nextUrl);
  } catch {
    // Navigation still works if history is unavailable.
  }
}
