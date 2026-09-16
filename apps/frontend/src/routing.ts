export type WorkspaceSection = "overview" | "standards" | "harness" | "agents" | "trace" | "knowledge" | "settings" | "style";
export type StandardsView = "edit" | "rendered";
export type WorkflowTab = "run" | "sync" | "pr";
export type HarnessSubPage = WorkflowTab | "summary" | "review" | "artifacts";
export type HarnessDetailKind = "attempt" | "epoch" | "stage";
export interface HarnessDetail { kind: HarnessDetailKind; id: string }
export type AppRoute =
  | { kind: "dashboard" }
  | { kind: "workspace"; section: WorkspaceSection; gameId?: string; standardsView?: StandardsView; harnessSub?: HarnessSubPage; harnessDetail?: HarnessDetail; agent?: string };
export const WORKSPACE_SECTIONS: ReadonlyArray<{ id: WorkspaceSection; label: string; description: string }> = [
  { id: "overview", label: "Overview", description: "Accepted worktree, readiness, and current workflow." },
  { id: "standards", label: "Standards", description: "Decomp standards, examples, and rendered prompts." },
  { id: "harness", label: "Harness", description: "Run epochs, Sync boundaries, and evidence." },
  { id: "agents", label: "Agents", description: "Agent catalog and recent execution." },
  { id: "trace", label: "Trace", description: "Kernel traces, agent runs, and sessions." },
  { id: "knowledge", label: "Knowledge", description: "Subjects, facts, links, and source records." },
  { id: "settings", label: "Settings", description: "Game paths and validation defaults." },
  { id: "style", label: "Style", description: "Global appearance controls." },
];
export const STANDARDS_VIEWS: ReadonlyArray<{ id: StandardsView; label: string }> = [{ id: "edit", label: "Editor" }, { id: "rendered", label: "Rendered" }];
export const WORKFLOW_TABS: ReadonlyArray<{ id: WorkflowTab; label: string }> = [{ id: "run", label: "Run" }, { id: "sync", label: "Sync" }, { id: "pr", label: "PR" }];
export function workflowTabForSubPage(sub: HarnessSubPage | null | undefined): WorkflowTab | null {
  return sub === "run" || sub === "sync" || sub === "pr" ? sub : sub === "review" ? "pr" : null;
}
export function isStandardsView(value: string | null): value is StandardsView { return value === "edit" || value === "rendered"; }
export function routeFromUrl(): AppRoute {
  try {
    const url = new URL(window.location.href);
    const [first, second, third, fourth] = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
    if (!first || first === "dashboard") return { kind: "dashboard" };
    if (!WORKSPACE_SECTIONS.some((section) => section.id === first)) return { kind: "dashboard" };
    const base = { kind: "workspace" as const, section: first as WorkspaceSection, gameId: url.searchParams.get("gameId") || undefined };
    if (first === "harness") {
      const harnessSub: HarnessSubPage = second === "history" ? "artifacts" : ["run", "sync", "pr", "summary", "review"].includes(second || "") ? second as HarnessSubPage : "run";
      const harnessDetail = third && fourth && ["attempt", "epoch", "stage"].includes(third) ? { kind: third as HarnessDetailKind, id: fourth } : undefined;
      return { ...base, harnessSub, harnessDetail };
    }
    if (first === "standards") return { ...base, standardsView: second === "rendered" ? "rendered" : "edit" };
    if (first === "agents") return { ...base, agent: second || undefined };
    return base;
  } catch { return { kind: "dashboard" }; }
}
export function routeToUrl(route: AppRoute): string {
  if (route.kind === "dashboard") return "/";
  const parts: string[] = [route.section];
  if (route.section === "standards" && route.standardsView === "rendered") parts.push("rendered");
  if (route.section === "agents" && route.agent) parts.push(encodeURIComponent(route.agent));
  if (route.section === "harness") {
    parts.push(route.harnessSub === "artifacts" ? "history" : route.harnessSub || "run");
    if (route.harnessDetail) parts.push(route.harnessDetail.kind, encodeURIComponent(route.harnessDetail.id));
  }
  const query = new URLSearchParams();
  if (route.gameId) query.set("gameId", route.gameId);
  return `/${parts.join("/")}${query.size ? `?${query}` : ""}`;
}
export function saveRoute(route: AppRoute): void {
  try { const next = routeToUrl(route); if (next !== `${window.location.pathname}${window.location.search}${window.location.hash}`) window.history.pushState(null, "", next); } catch { /* Browser history can be unavailable in embedded viewers. */ }
}
