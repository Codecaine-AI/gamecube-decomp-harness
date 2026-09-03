// Game workspace routing. The orchestrator UI is game-centered: a top
// Game Dashboard holds game cards, each card opens a Game Workspace
// (Overview / Standards / Cycles / Agents / Trace / Settings / Style), and the active cycle is a
// nested surface inside Cycles with workflow tabs and drill-in details.
//
// The route is encoded in the path so deep links and reloads keep the operator
// where they were without leaking internal view state into the URL:
//   /                                -> game dashboard
//   /overview
//   /standards
//   /standards/rendered
//   /knowledge
//   /cycles
//   /cycles/active/run
//   /cycles/active/sync
//   /cycles/active/pr
//   /cycles/active/run/attempt/<workerStateId>
//   /cycles/active/run/epoch/<epochId>
//   /cycles/active/sync/stage/<stage>
//   /agents
//   /agents/<agent-name>
//   /trace
//   /settings
//   /style
//
// Legacy ?page=<old> and ?view=workspace&section=<old> values map onto the new
// structure so existing bookmarks and deep links keep working.

export type WorkspaceSection = "overview" | "standards" | "cycles" | "agents" | "trace" | "knowledge" | "settings" | "style";
export type StandardsView = "edit" | "rendered";
export type CycleTab = "run" | "sync" | "pr";
export type CycleStage = "run" | "pr" | "done";
export type CycleSubPage = CycleTab | "done" | "summary" | "review" | "artifacts";
export type CycleDetailKind = "attempt" | "epoch" | "stage";
export interface CycleDetail { kind: CycleDetailKind; id: string }
// "active" points at the single active cycle; a run id opens a past cycle.
export type CycleFocus = "active" | "new" | string;

export type AppRoute =
  | { kind: "dashboard" }
  | { kind: "workspace"; section: WorkspaceSection; gameId?: string; standardsView?: StandardsView; cycle?: CycleFocus; cycleSub?: CycleSubPage; cycleDetail?: CycleDetail; agent?: string };

export const WORKSPACE_SECTIONS: ReadonlyArray<{ id: WorkspaceSection; label: string; description: string }> = [
  { id: "overview", label: "Overview", description: "Active cycle, PR gate, readiness, and next action." },
  { id: "standards", label: "Standards", description: "Inspect decomp standards, QA coverage, examples, and rendered prompt XML." },
  { id: "cycles", label: "Cycles", description: "Active cycle, run/PR phases, and history." },
  { id: "agents", label: "Agents", description: "Prompt previews, agent catalog migration, and recent agent execution identity." },
  { id: "trace", label: "Trace", description: "Kernel container tree, trace events, agent runs, and session lineage." },
  { id: "knowledge", label: "Knowledge", description: "Explore Knowledge V2 subjects, facts, links, events, and source records." },
  { id: "settings", label: "Settings", description: "Game paths, overrides, and validation defaults." },
  { id: "style", label: "Style", description: "Global grain texture controls." },
];

export const STANDARDS_VIEWS: ReadonlyArray<{ id: StandardsView; label: string }> = [
  { id: "edit", label: "Editor" },
  { id: "rendered", label: "Rendered" },
];

export const CYCLE_TABS: ReadonlyArray<{ id: CycleTab; label: string }> = [
  { id: "run", label: "Run" },
  { id: "sync", label: "Sync" },
  { id: "pr", label: "PR" },
];

export const CYCLE_SUBPAGES: ReadonlyArray<{ id: CycleSubPage; label: string }> = [
  ...CYCLE_TABS,
  { id: "done", label: "Done" },
  { id: "summary", label: "Summary" },
  { id: "review", label: "Review" },
  { id: "artifacts", label: "Artifacts" },
];

export function cycleTabForSubPage(sub: CycleSubPage | null | undefined): CycleTab | null {
  if (sub === "run" || sub === "sync" || sub === "pr") return sub;
  if (sub === "review") return "pr";
  return null;
}

// Legacy /cycles/:id/prepare links (the retired Prepare stage) normalize onto
// the Run sub-page, which now hosts the still-real setup inputs.
function normalizeLegacyCycleSub(value: string | null | undefined): string | null {
  if (!value) return null;
  return value === "prepare" ? "run" : value;
}

function isWorkspaceSection(value: string | null): value is WorkspaceSection {
  return WORKSPACE_SECTIONS.some((section) => section.id === value);
}

export function isStandardsView(value: string | null): value is StandardsView {
  return STANDARDS_VIEWS.some((view) => view.id === value);
}

export function isCycleSubPage(value: string | null): value is CycleSubPage {
  return CYCLE_SUBPAGES.some((sub) => sub.id === value);
}

function isCycleDetailKind(value: string | null): value is CycleDetailKind {
  return value === "attempt" || value === "epoch" || value === "stage";
}

// Map the pre-redesign peer tabs onto the new nested structure.
function routeFromLegacyPage(page: string | null): AppRoute | null {
  switch (page ?? "") {
    case "access":
      return { kind: "workspace", section: "settings" };
    case "cycle":
      return { kind: "workspace", section: "cycles", cycle: "active", cycleSub: "done" };
    case "run":
      return { kind: "workspace", section: "cycles", cycle: "active", cycleSub: "run" };
    case "pr":
      return { kind: "workspace", section: "cycles", cycle: "active", cycleSub: "pr" };
    case "history":
      return { kind: "workspace", section: "cycles", cycle: "active", cycleSub: "done" };
    default:
      return null;
  }
}

function gameIdFromParams(params: URLSearchParams): string | undefined {
  return params.get("gameId") || undefined;
}

function withGameId(route: AppRoute, gameId: string | undefined): AppRoute {
  if (route.kind === "dashboard" || !gameId) return route;
  return { ...route, gameId };
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
  if (legacy) return withGameId(legacy, gameIdFromParams(params));

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
    gameId: gameIdFromParams(params),
  } as const;
  if (section === "standards") {
    return {
      ...base,
      standardsView: isStandardsView(params.get("std")) ? (params.get("std") as StandardsView) : "edit",
    };
  }
  if (section === "cycles") {
    const sub = normalizeLegacyCycleSub(params.get("sub"));
    return {
      ...base,
      cycle: params.get("cycle") || undefined,
      cycleSub: isCycleSubPage(sub) ? (sub as CycleSubPage) : undefined,
    };
  }
  return base;
}

function routeFromPathname(pathname: string, params: URLSearchParams): AppRoute {
  const segments = pathSegments(pathname);
  if (segments.length === 0 || segments[0] === "dashboard") {
    return { kind: "dashboard" };
  }

  const [first, second, third, fourth, fifth] = segments[0] === "workspace" ? segments.slice(1) : segments;
  if (first === "knowledge" && params.get("kb") === "standards") {
    return {
      kind: "workspace",
      section: "standards",
      gameId: gameIdFromParams(params),
      standardsView: "edit",
    };
  }
  if (!first || !isWorkspaceSection(first)) return { kind: "dashboard" };
  const section: WorkspaceSection = first;

  const base = {
    kind: "workspace" as const,
    section,
    gameId: gameIdFromParams(params),
  };

  if (section === "standards") {
    return {
      ...base,
      standardsView: isStandardsView(second ?? null) ? second as StandardsView : "edit",
    };
  }

  if (section === "cycles") {
    const cycle = second || undefined;
    const sub = normalizeLegacyCycleSub(third ?? null);
    const cycleSub = isCycleSubPage(sub) ? sub as CycleSubPage : undefined;
    const cycleDetail = cycleSub && isCycleDetailKind(fourth ?? null) && fifth
      ? { kind: fourth, id: fifth } as CycleDetail
      : null;
    return cycleDetail
      ? { ...base, cycle, cycleSub, cycleDetail }
      : { ...base, cycle, cycleSub };
  }

  if (section === "agents") {
    return { ...base, agent: second || undefined };
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

function setGameId(url: URL, gameId: string | undefined): void {
  if (gameId) url.searchParams.set("gameId", gameId);
}

export function routeToUrl(route: AppRoute): string {
  const url = new URL(window.location.href);
  url.search = "";
  url.hash = "";
  if (route.kind === "dashboard") {
    url.pathname = "/";
  } else {
    setGameId(url, route.gameId);
    if (route.section === "standards") {
      url.pathname = route.standardsView === "rendered" ? "/standards/rendered" : "/standards";
    } else if (route.section === "knowledge") {
      url.pathname = "/knowledge";
    } else if (route.section === "cycles") {
      const segments = ["cycles"];
      if (route.cycle) {
        segments.push(encodeURIComponent(route.cycle));
        if (route.cycleSub) {
          segments.push(route.cycleSub);
          if (route.cycleDetail) {
            segments.push(route.cycleDetail.kind, encodeURIComponent(route.cycleDetail.id));
          }
        }
      }
      url.pathname = `/${segments.join("/")}`;
    } else if (route.section === "agents" && route.agent) {
      url.pathname = `/agents/${encodeURIComponent(route.agent)}`;
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
