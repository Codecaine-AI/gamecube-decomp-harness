import { WorkspaceLayout, useWorkspaceNav } from "@/pages/workspace/layout";
import { AgentsPage } from "@/pages/workspace/agents";
import { deriveSessionView } from "@/pages/workspace/_lib/model";
import { KnowledgePage } from "@/pages/workspace/knowledge";
import { OverviewPage } from "@/pages/workspace/overview";
import { SessionsPage } from "@/pages/workspace/sessions";
import { SettingsPage } from "@/pages/workspace/settings";
import { StandardsPage } from "@/pages/workspace/standards";
import { StylePage } from "@/pages/workspace/style";
import { TracePage } from "@/pages/workspace/trace";
import type { ProjectWorkspaceProps, SessionView, WorkspaceNav } from "@/pages/workspace/_lib/types";

export type { DashboardAction, ProjectWorkspaceProps } from "@/pages/workspace/_lib/types";

function WorkspaceSectionContent(props: ProjectWorkspaceProps & { nav: WorkspaceNav; view: SessionView }) {
  const projectName = props.view.project?.displayName ?? "No project selected";

  if (props.route.section === "standards") {
    return <StandardsPage form={props.form} projectName={projectName} onNavigate={props.onNavigate} route={props.route} />;
  }
  if (props.route.section === "agents") {
    return <AgentsPage form={props.form} />;
  }
  if (props.route.section === "trace") {
    return <TracePage form={props.form} view={props.view} />;
  }
  if (props.route.section === "knowledge") {
    return <KnowledgePage form={props.form} />;
  }
  if (props.route.section === "style") {
    return <StylePage grainSettings={props.grainSettings} onGrainSettingsChange={props.onGrainSettingsChange} view={props.view} />;
  }
  if (props.route.section === "settings") {
    return <SettingsPage config={props.config} form={props.form} nav={props.nav} setForm={props.setForm} view={props.view} />;
  }
  if (props.route.section === "sessions") {
    return <SessionsPage {...props} />;
  }
  return <OverviewPage busy={props.busy} form={props.form} nav={props.nav} onAction={props.onAction} view={props.view} />;
}

export function ProjectWorkspace(props: ProjectWorkspaceProps) {
  const view = deriveSessionView(props.dashboard, props.config, props.form);
  const nav = useWorkspaceNav(props.onNavigate, props.route.projectId);
  return (
    <WorkspaceLayout
      collapsed={props.collapsed}
      errorMessage={props.errorMessage}
      nav={nav}
      onCollapsedChange={props.onCollapsedChange}
      onDismissError={props.onDismissError}
      route={props.route}
    >
      <WorkspaceSectionContent {...props} nav={nav} view={view} />
    </WorkspaceLayout>
  );
}
