import { Activity, Bot, ChevronLeft, ChevronRight, ClipboardCheck, Database, Home, ListTree, Palette, Settings } from "@/icons";
import type { ReactNode } from "react";
import { type AppRoute, type WorkspaceSection, WORKSPACE_SECTIONS } from "@/routing";
import { NavItem } from "@/components/primitives";
import type { WorkspaceNav } from "@/pages/workspace/_lib/types";

const SECTION_ICONS: Record<WorkspaceSection, ReactNode> = {
  overview: <Home size={18} />,
  standards: <ClipboardCheck size={18} />,
  cycles: <ListTree size={18} />,
  agents: <Bot size={18} />,
  trace: <Activity size={18} />,
  knowledge: <Database size={18} />,
  settings: <Settings size={18} />,
  style: <Palette size={18} />,
};

function workspaceSection(id: WorkspaceSection) {
  const section = WORKSPACE_SECTIONS.find((item) => item.id === id);
  if (!section) throw new Error(`Unknown workspace section: ${id}`);
  return section;
}

const CYCLE_WORKSPACE_SECTIONS = (["overview", "cycles"] satisfies ReadonlyArray<WorkspaceSection>).map(workspaceSection);
const CONFIG_WORKSPACE_SECTIONS = (["standards", "settings"] satisfies ReadonlyArray<WorkspaceSection>).map(workspaceSection);
const AGENT_WORKSPACE_SECTIONS = (["agents", "trace"] satisfies ReadonlyArray<WorkspaceSection>).map(workspaceSection);
const KNOWLEDGE_WORKSPACE_SECTIONS = (["knowledge"] satisfies ReadonlyArray<WorkspaceSection>).map(workspaceSection);
const STYLE_WORKSPACE_SECTION = workspaceSection("style");

export function WorkspaceSidebar({
  collapsed,
  nav,
  onCollapsedChange,
  route,
}: {
  collapsed: boolean;
  nav: WorkspaceNav;
  onCollapsedChange: (collapsed: boolean) => void;
  route: Extract<AppRoute, { kind: "workspace" }>;
}) {
  if (collapsed) {
    return (
      <aside className="sidebar-rail sidebar-rail-collapsed grid min-w-0 overflow-hidden border-r border-line2 bg-ink max-[780px]:block">
        <div className="sidebar-rail-tab z-10 flex h-full flex-col items-center justify-start gap-3 bg-raised px-0 max-[780px]:h-[42px] max-[780px]:flex-row max-[780px]:items-center max-[780px]:gap-2 max-[780px]:px-3">
          <div className="flex h-[68px] w-full shrink-0 items-center justify-center border-b border-line2 max-[780px]:h-auto max-[780px]:w-auto">
            <button aria-expanded={false} className="inline-flex h-8 w-8 shrink-0 items-center justify-center border border-line2 bg-raised text-soft hover:border-faint hover:text-fg" onClick={() => onCollapsedChange(false)} title="Show game navigation" type="button">
              <ChevronRight size={16} />
              <span className="sr-only">Show</span>
            </button>
          </div>
          <nav className="flex min-h-0 w-full flex-1 flex-col items-center gap-2 overflow-auto max-[780px]:w-auto max-[780px]:flex-none max-[780px]:flex-row max-[780px]:overflow-visible" aria-label="Game workspace">
            {CYCLE_WORKSPACE_SECTIONS.map((item) => (
              <button
                aria-current={route.section === item.id ? "page" : undefined}
                className={`inline-flex h-8 w-8 shrink-0 items-center justify-center border ${
                  route.section === item.id ? "border-up/60 bg-up/[0.03] text-up" : "border-line bg-card text-soft hover:border-line2 hover:bg-raised"
                }`}
                key={item.id}
                onClick={() => nav.goToSection(item.id)}
                title={item.label}
                type="button"
              >
                {SECTION_ICONS[item.id]}
                <span className="sr-only">{item.label}</span>
              </button>
            ))}
            <div className="my-1 h-px w-5 shrink-0 bg-line2 max-[780px]:mx-1 max-[780px]:my-0 max-[780px]:h-5 max-[780px]:w-px" role="separator" />
            {CONFIG_WORKSPACE_SECTIONS.map((item) => (
              <button
                aria-current={route.section === item.id ? "page" : undefined}
                className={`inline-flex h-8 w-8 shrink-0 items-center justify-center border ${
                  route.section === item.id ? "border-up/60 bg-up/[0.03] text-up" : "border-line bg-card text-soft hover:border-line2 hover:bg-raised"
                }`}
                key={item.id}
                onClick={() => nav.goToSection(item.id)}
                title={item.label}
                type="button"
              >
                {SECTION_ICONS[item.id]}
                <span className="sr-only">{item.label}</span>
              </button>
            ))}
            <div className="my-1 h-px w-5 shrink-0 bg-line2 max-[780px]:mx-1 max-[780px]:my-0 max-[780px]:h-5 max-[780px]:w-px" role="separator" />
            {AGENT_WORKSPACE_SECTIONS.map((item) => (
              <button
                aria-current={route.section === item.id ? "page" : undefined}
                className={`inline-flex h-8 w-8 shrink-0 items-center justify-center border ${
                  route.section === item.id ? "border-up/60 bg-up/[0.03] text-up" : "border-line bg-card text-soft hover:border-line2 hover:bg-raised"
                }`}
                key={item.id}
                onClick={() => nav.goToSection(item.id)}
                title={item.label}
                type="button"
              >
                {SECTION_ICONS[item.id]}
                <span className="sr-only">{item.label}</span>
              </button>
            ))}
            <div className="my-1 h-px w-5 shrink-0 bg-line2 max-[780px]:mx-1 max-[780px]:my-0 max-[780px]:h-5 max-[780px]:w-px" role="separator" />
            {KNOWLEDGE_WORKSPACE_SECTIONS.map((item) => (
              <button
                aria-current={route.section === item.id ? "page" : undefined}
                className={`inline-flex h-8 w-8 shrink-0 items-center justify-center border ${
                  route.section === item.id ? "border-up/60 bg-up/[0.03] text-up" : "border-line bg-card text-soft hover:border-line2 hover:bg-raised"
                }`}
                key={item.id}
                onClick={() => nav.goToSection(item.id)}
                title={item.label}
                type="button"
              >
                {SECTION_ICONS[item.id]}
                <span className="sr-only">{item.label}</span>
              </button>
            ))}
          </nav>
          <div className="mt-auto flex w-full shrink-0 flex-col items-center gap-2 border-t border-line2 py-2 max-[780px]:ml-auto max-[780px]:mt-0 max-[780px]:w-auto max-[780px]:border-l max-[780px]:border-t-0 max-[780px]:px-2 max-[780px]:py-0">
            <button
              aria-current={route.section === STYLE_WORKSPACE_SECTION.id ? "page" : undefined}
              className={`inline-flex h-8 w-8 shrink-0 items-center justify-center border ${
                route.section === STYLE_WORKSPACE_SECTION.id ? "border-up/60 bg-up/[0.03] text-up" : "border-line bg-card text-soft hover:border-line2 hover:bg-raised"
              }`}
              onClick={() => nav.goToSection(STYLE_WORKSPACE_SECTION.id)}
              title={STYLE_WORKSPACE_SECTION.label}
              type="button"
            >
              {SECTION_ICONS[STYLE_WORKSPACE_SECTION.id]}
              <span className="sr-only">{STYLE_WORKSPACE_SECTION.label}</span>
            </button>
          </div>
        </div>
      </aside>
    );
  }

  return (
    <aside className="sidebar-rail sidebar-rail-open min-w-0 overflow-hidden border-r border-line2 bg-ink">
      <div className="sidebar-rail-content flex h-full min-h-0 flex-col">
        <div className="z-10 flex h-[68px] shrink-0 items-center gap-2 border-b border-line2 bg-raised px-3 py-3">
          <button aria-expanded className="inline-flex h-8 w-8 shrink-0 items-center justify-center border border-line2 bg-raised text-soft hover:border-faint hover:text-fg" onClick={() => onCollapsedChange(true)} title="Collapse navigation" type="button">
            <ChevronLeft size={16} />
            <span className="sr-only">Collapse</span>
          </button>
          <h1 className="m-0 min-w-0 flex-1 overflow-hidden whitespace-nowrap px-3 text-center text-[13px] font-bold uppercase tracking-[0.14em] text-fg">GC DECOMP HARNESS</h1>
        </div>
        <div className="min-h-0 flex-1 overflow-auto">
          <div className="grid gap-2.5 p-2.5">
            <nav className="grid gap-1.5" aria-label="Game workspace">
              {CYCLE_WORKSPACE_SECTIONS.map((item) => (
                <NavItem
                  active={route.section === item.id}
                  description={item.description}
                  icon={SECTION_ICONS[item.id]}
                  key={item.id}
                  label={item.label}
                  onClick={() => nav.goToSection(item.id)}
                />
              ))}
              <div className="my-1 border-t border-line2" role="separator" />
              {CONFIG_WORKSPACE_SECTIONS.map((item) => (
                <NavItem
                  active={route.section === item.id}
                  description={item.description}
                  icon={SECTION_ICONS[item.id]}
                  key={item.id}
                  label={item.label}
                  onClick={() => nav.goToSection(item.id)}
                />
              ))}
              <div className="my-1 border-t border-line2" role="separator" />
              {AGENT_WORKSPACE_SECTIONS.map((item) => (
                <NavItem
                  active={route.section === item.id}
                  description={item.description}
                  icon={SECTION_ICONS[item.id]}
                  key={item.id}
                  label={item.label}
                  onClick={() => nav.goToSection(item.id)}
                />
              ))}
              <div className="my-1 border-t border-line2" role="separator" />
              {KNOWLEDGE_WORKSPACE_SECTIONS.map((item) => (
                <NavItem
                  active={route.section === item.id}
                  description={item.description}
                  icon={SECTION_ICONS[item.id]}
                  key={item.id}
                  label={item.label}
                  onClick={() => nav.goToSection(item.id)}
                />
              ))}
            </nav>
          </div>
        </div>
        <div className="grid shrink-0 gap-1.5 border-t border-line2 p-2.5">
          <button className="flex min-h-7 items-center justify-center gap-1 text-[10px] font-bold uppercase tracking-[0.16em] text-dim hover:text-soft" onClick={nav.goToDashboard} title="Back to all games" type="button">
            <ChevronLeft size={12} /> All Games
          </button>
          <NavItem
            active={route.section === STYLE_WORKSPACE_SECTION.id}
            description={STYLE_WORKSPACE_SECTION.description}
            icon={SECTION_ICONS[STYLE_WORKSPACE_SECTION.id]}
            label={STYLE_WORKSPACE_SECTION.label}
            onClick={() => nav.goToSection(STYLE_WORKSPACE_SECTION.id)}
          />
        </div>
      </div>
    </aside>
  );
}
