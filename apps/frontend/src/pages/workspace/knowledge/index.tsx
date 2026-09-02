import { PageHeader, SubNav } from "@/components/primitives";
import type { FormState } from "@/lib/format";
import type { DashboardAction, HarnessStateReadModel } from "@/pages/workspace/_lib/types";
import { KNOWLEDGE_VIEWS, type AppRoute, type KnowledgeView } from "@/routing";

import { KnowledgeExplorer } from "./explorer";
import { LegacyLedger } from "./legacy-ledger";

export function KnowledgePage({ busy, form, gameName, harnessState, onAction, onNavigate, route }: {
  busy: boolean;
  form: FormState;
  gameName: string;
  harnessState: HarnessStateReadModel | null;
  onAction: (action: DashboardAction) => void;
  onNavigate: (route: AppRoute) => void;
  route: Extract<AppRoute, { kind: "workspace" }>;
}) {
  const activeView: KnowledgeView = route.knowledgeView ?? "explorer";

  function goToView(view: KnowledgeView) {
    onNavigate({ kind: "workspace", section: "knowledge", knowledgeView: view, gameId: route.gameId });
  }

  return <>
    <PageHeader kicker={gameName} title="Knowledge" />
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-line bg-card px-4 py-2">
        <SubNav items={KNOWLEDGE_VIEWS.map((view) => ({ active: view.id === activeView, id: view.id, label: view.label, onClick: () => goToView(view.id) }))} />
      </div>
      {activeView === "explorer"
        ? <KnowledgeExplorer game={route.gameId ?? form.gameId} />
        : <LegacyLedger busy={busy} form={form} harnessState={harnessState} onAction={onAction} />}
    </div>
  </>;
}
