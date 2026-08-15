import { PageHeader, SubNav } from "@/components/primitives";
import { type AppRoute, type StandardsView, STANDARDS_VIEWS } from "@/routing";
import type { FormState } from "@/lib/format";
import { RenderedStandardsPanel, StandardsEditor } from "./_components/StandardsWorkspace";

export function StandardsPage({
  form,
  onNavigate,
  gameName,
  route,
}: {
  form: FormState;
  onNavigate: (route: AppRoute) => void;
  gameName: string;
  route: Extract<AppRoute, { kind: "workspace" }>;
}) {
  const activeView: StandardsView = route.standardsView ?? "edit";

  function goToView(view: StandardsView) {
    onNavigate({ kind: "workspace", section: "standards", standardsView: view, gameId: route.gameId });
  }

  return (
    <>
      <PageHeader kicker={gameName} title="Standards" />
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex items-center gap-2 border-b border-line bg-card px-4 py-2">
          <SubNav
            items={STANDARDS_VIEWS.map((view) => ({
              active: view.id === activeView,
              id: view.id,
              label: view.label,
              onClick: () => goToView(view.id),
            }))}
          />
        </div>
        {activeView === "edit" ? (
          <StandardsEditor form={form} />
        ) : (
          <div className="min-h-0 flex-1 overflow-auto">
            <div className="mx-auto grid w-full max-w-7xl gap-4 p-4">
              <RenderedStandardsPanel form={form} />
            </div>
          </div>
        )}
      </div>
    </>
  );
}
