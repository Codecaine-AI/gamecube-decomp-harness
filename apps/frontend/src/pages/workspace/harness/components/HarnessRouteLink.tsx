import { Link2 } from "@/icons";
import type { HarnessSubPage } from "@/routing";
import type { HarnessView, WorkspaceNav } from "@/pages/workspace/_lib/types";

export function HarnessRouteLink({
  nav,
  sub,
  view,
}: {
  nav: WorkspaceNav;
  sub?: HarnessSubPage;
  view: HarnessView;
}) {

  return (
    <button
      className="inline-flex min-w-0 items-center gap-1 font-mono text-xs text-accent underline-offset-2 hover:underline"
      onClick={() => nav.goToHarness(sub)}
      title={`Open harness ${sub || "run"}`}
      type="button"
    >
      <Link2 size={12} />
      <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">Harness</span>
    </button>
  );
}

export function HarnessRouteBar({
  nav,
  sub,
  view,
}: {
  nav: WorkspaceNav;
  sub: HarnessSubPage;
  view: HarnessView;
}) {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2 border border-line bg-card px-3 py-2 text-xs text-dim">
      <span className="font-bold uppercase tracking-[0.1em]">Harness</span>
      <HarnessRouteLink nav={nav} sub={sub} view={view} />
      <span className="text-faint">/</span>
      <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-soft">{view.harnessLabel}</span>
      {view.canonicalPhase ? (
        <>
          <span className="text-faint">/</span>
          <span className="text-dim">{view.canonicalPhase.replace(/_/g, " ")}</span>
        </>
      ) : null}
    </div>
  );
}
