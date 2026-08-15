import { Link2 } from "@/icons";
import type { CycleSubPage } from "@/routing";
import type { CycleView, WorkspaceNav } from "@/pages/workspace/_lib/types";
import { activeCycleFocus } from "@/pages/workspace/cycles/_lib/cycleRoute";

export function CycleRouteLink({
  nav,
  sub,
  view,
}: {
  nav: WorkspaceNav;
  sub?: CycleSubPage;
  view: CycleView;
}) {
  const focus = activeCycleFocus(view);
  return (
    <button
      className="inline-flex min-w-0 items-center gap-1 font-mono text-xs text-accent underline-offset-2 hover:underline"
      onClick={() => nav.goToCycle(focus, sub)}
      title={`Open /cycles/${encodeURIComponent(focus)}${sub ? `/${sub}` : ""}`}
      type="button"
    >
      <Link2 size={12} />
      <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">{focus}</span>
    </button>
  );
}

export function CycleRouteBar({
  nav,
  sub,
  view,
}: {
  nav: WorkspaceNav;
  sub: CycleSubPage;
  view: CycleView;
}) {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2 border border-line bg-card px-3 py-2 text-xs text-dim">
      <span className="font-bold uppercase tracking-[0.1em]">Cycle</span>
      <CycleRouteLink nav={nav} sub={sub} view={view} />
      <span className="text-faint">/</span>
      <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-soft">{view.activeCycleLabel}</span>
      {view.canonicalPhase ? (
        <>
          <span className="text-faint">/</span>
          <span className="text-dim">{view.canonicalPhase.replace(/_/g, " ")}</span>
        </>
      ) : null}
    </div>
  );
}
