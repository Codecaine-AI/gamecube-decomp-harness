import { WorkspaceLayout, useWorkspaceNav } from "@/pages/workspace/layout";
import { AgentsPage } from "@/pages/workspace/agents";
import { KnowledgePage } from "@/pages/workspace/knowledge";
import { OverviewPage } from "@/pages/workspace/overview";
import { CyclesPage } from "@/pages/workspace/cycles";
import { SettingsPage } from "@/pages/workspace/settings";
import { StandardsPage } from "@/pages/workspace/standards";
import { StylePage } from "@/pages/workspace/style";
import { TracePage } from "@/pages/workspace/trace";
import type { GameWorkspaceProps, CycleView, WorkspaceNav } from "@/pages/workspace/_lib/types";

export type { DashboardAction, GameWorkspaceProps } from "@/pages/workspace/_lib/types";

function WorkspaceSectionContent(props: GameWorkspaceProps & { nav: WorkspaceNav; view: CycleView }) {
  const gameName = props.view.game?.displayName ?? "No game selected";

  if (props.route.section === "standards") {
    return <StandardsPage form={props.form} gameName={gameName} onNavigate={props.onNavigate} route={props.route} />;
  }
  if (props.route.section === "agents") {
    return <AgentsPage form={props.form} onNavigate={props.onNavigate} route={props.route} setForm={props.setForm} />;
  }
  if (props.route.section === "trace") {
    return <TracePage form={props.form} view={props.view} />;
  }
  if (props.route.section === "knowledge") {
    return <KnowledgePage form={props.form} gameName={gameName} route={props.route} />;
  }
  if (props.route.section === "style") {
    return <StylePage grainSettings={props.grainSettings} onGrainSettingsChange={props.onGrainSettingsChange} view={props.view} />;
  }
  if (props.route.section === "settings") {
    return <SettingsPage config={props.config} form={props.form} nav={props.nav} setForm={props.setForm} view={props.view} />;
  }
  if (props.route.section === "cycles") {
    return <CyclesPage {...props} />;
  }
  return <OverviewPage busy={props.busy} form={props.form} nav={props.nav} onAction={props.onAction} view={props.view} />;
}

export function GameWorkspace(props: GameWorkspaceProps) {
  const nav = useWorkspaceNav(props.onNavigate, props.route.gameId);
  return (
    <WorkspaceLayout
      collapsed={props.collapsed}
      errorMessage={props.errorMessage}
      nav={nav}
      onCollapsedChange={props.onCollapsedChange}
      onDismissError={props.onDismissError}
      route={props.route}
    >
      <WorkspaceSectionContent {...props} nav={nav} view={props.view} />
    </WorkspaceLayout>
  );
}
