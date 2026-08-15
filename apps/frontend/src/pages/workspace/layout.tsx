import { AlertTriangle } from "@/icons";
import type { ReactNode } from "react";
import { type AppRoute, type CycleSubPage } from "@/routing";
import { WorkspaceSidebar } from "@/pages/workspace/_components/WorkspaceSidebar";
import type { WorkspaceNav } from "@/pages/workspace/_lib/types";

function ErrorStrip({ error, onDismiss }: { error: string; onDismiss: () => void }) {
  if (!error) return null;
  return (
    <div className="flex w-full shrink-0 items-start gap-2.5 border-b border-down/40 bg-down/10 px-3 py-1.5 text-xs text-down">
      <AlertTriangle className="mt-0.5 shrink-0" size={14} />
      <span className="min-w-0 flex-1 whitespace-normal break-words" title={error}>
        {error}
      </span>
      <button className="ml-auto shrink-0 whitespace-nowrap text-down/80 hover:text-down" onClick={onDismiss} type="button">
        dismiss
      </button>
    </div>
  );
}

export function useWorkspaceNav(onNavigate: (route: AppRoute) => void, gameId: string | undefined): WorkspaceNav {
  return {
    goToDashboard: () => onNavigate({ kind: "dashboard" }),
    goToSection: (section) => onNavigate({ kind: "workspace", section, gameId }),
    goToCycle: (focus, sub?: CycleSubPage) => onNavigate({ kind: "workspace", section: "cycles", cycle: focus, cycleSub: sub, gameId }),
  };
}

export function WorkspaceLayout({
  children,
  collapsed,
  errorMessage,
  nav,
  onCollapsedChange,
  onDismissError,
  route,
}: {
  children: ReactNode;
  collapsed: boolean;
  errorMessage: string;
  nav: WorkspaceNav;
  onCollapsedChange: (collapsed: boolean) => void;
  onDismissError: () => void;
  route: Extract<AppRoute, { kind: "workspace" }>;
}) {
  return (
    <>
      <WorkspaceSidebar collapsed={collapsed} nav={nav} onCollapsedChange={onCollapsedChange} route={route} />
      <section className="flex min-w-0 flex-col overflow-hidden bg-panel">
        <ErrorStrip error={errorMessage} onDismiss={onDismissError} />
        {children}
      </section>
    </>
  );
}
