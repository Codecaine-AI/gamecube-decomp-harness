import type { ReactNode } from "react";
import {
  AlertTriangle,
  Archive,
  Ban,
  ExternalLink,
  GitPullRequest,
  Play,
  RotateCcw,
  Save,
} from "@/icons";
import { num, shortId } from "@/lib/format";
import { Button, PanelSection, PanelTitle, StatCard } from "@/components/primitives";
import { prettyStatus, projectStateAction, statusClass } from "@/pages/workspace/_lib/model";
import type {
  DashboardAction,
  ProjectStateActionProjection,
  ProjectStatePrSeriesSummary,
  ProjectStateReadModel,
} from "@/pages/workspace/_lib/types";

const CAMPAIGN_ACTIONS: ReadonlyArray<{
  actionId: string;
  dashboardAction: DashboardAction;
  icon: typeof Play;
  label: string;
  primary?: boolean;
}> = [
  { actionId: "pr.open_campaign", dashboardAction: "prOpenCampaign", icon: GitPullRequest, label: "Open campaign", primary: true },
  { actionId: "pr.activate", dashboardAction: "prActivate", icon: Play, label: "Activate", primary: true },
  { actionId: "pr.publish_batch", dashboardAction: "prPublishBatch", icon: GitPullRequest, label: "Publish batch", primary: true },
  { actionId: "pr.release", dashboardAction: "prRelease", icon: Save, label: "Release" },
  { actionId: "pr.adopt_legacy", dashboardAction: "prAdoptLegacy", icon: Archive, label: "Adopt legacy" },
  { actionId: "pr.close_campaign", dashboardAction: "prCloseCampaign", icon: Archive, label: "Close campaign" },
  { actionId: "pr.abandon_campaign", dashboardAction: "prAbandonCampaign", icon: Ban, label: "Abandon" },
  { actionId: "pr.campaign_recover", dashboardAction: "prCampaignRecover", icon: RotateCcw, label: "Recover" },
];

function projectionTitle(projection: ProjectStateActionProjection): string {
  if (projection.enabled) return projection.expected_transition;
  return projection.blocked_by.map((blocker) => blocker.message || prettyStatus(blocker.code)).join("; ") || "Blocked by the server projection.";
}

function validationLabel(series: ProjectStatePrSeriesSummary): string {
  const validation = series.last_validation;
  if (!validation) return "not recorded";
  for (const key of ["validation_state", "status", "result"]) {
    if (typeof validation[key] === "string" && validation[key]) return prettyStatus(validation[key]);
  }
  if (typeof validation.clean === "boolean") return validation.clean ? "validated" : "failed";
  return "recorded";
}

function prHref(prNumber: number): string {
  return `https://github.com/doldecomp/melee/pull/${prNumber}`;
}

function ProjectedCampaignButton({
  busy,
  children,
  icon,
  onAction,
  projection,
  tone,
}: {
  busy: boolean;
  children: string;
  icon: ReactNode;
  onAction: (action: DashboardAction) => void;
  projection: ProjectStateActionProjection;
  tone?: "default" | "primary" | "warning" | "danger";
}) {
  const dashboardAction = CAMPAIGN_ACTIONS.find((candidate) => candidate.actionId === projection.action_id)?.dashboardAction;
  return (
    <Button
      disabled={busy || !projection.enabled || !dashboardAction}
      icon={icon}
      onClick={() => dashboardAction && onAction(dashboardAction)}
      title={projectionTitle(projection)}
      tone={tone}
      type="button"
    >
      {children}
    </Button>
  );
}

export function PrCampaignCard({
  busy,
  onAction,
  projectState,
}: {
  busy: boolean;
  onAction: (action: DashboardAction) => void;
  projectState: ProjectStateReadModel | null;
}) {
  const campaign = projectState?.pr ?? null;
  const projectedActions = CAMPAIGN_ACTIONS
    .map((definition) => ({ definition, projection: projectStateAction(projectState, definition.actionId) }))
    .filter((candidate): candidate is typeof candidate & { projection: ProjectStateActionProjection } => Boolean(candidate.projection))
    .filter(({ definition, projection }) => !(
      definition.actionId === "pr.activate" &&
      projection.blocked_by.some((blocker) => blocker.code === "pr_already_active")
    ));
  const statusCounts = campaign
    ? Object.entries(campaign.series_by_status).filter(([, series]) => series.length > 0)
    : [];

  return (
    <PanelSection>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <PanelTitle className="mb-0">PR Campaign</PanelTitle>
        <div className="flex flex-wrap items-center gap-2">
          {campaign?.activation.active ? (
            <span className="status-tag status-tag-live" title={campaign.activation.lease_id ?? undefined}>
              <span className="lamp" /> activation {prettyStatus(campaign.activation.status, "active")}
            </span>
          ) : null}
          <span className={`status-tag ${campaign?.status === "working" ? "status-tag-live" : campaign && ["preparing", "in_review"].includes(campaign.status) ? "status-tag-warn" : ""}`}>
            <span className="lamp" />
            {campaign ? prettyStatus(campaign.status) : "No campaign"}
          </span>
        </div>
      </div>

      {campaign ? (
        <>
          <div className="grid grid-cols-2 gap-2 @[760px]:grid-cols-5">
            <StatCard label="Campaign" value={campaign.workflow_id} />
            <StatCard label="Save point" value={campaign.source_anchor.save_point_id || "unknown"} />
            <StatCard label="Source revision" value={shortId(campaign.source_anchor.source_revision) || "unknown"} />
            <StatCard label="Activation" tone={campaign.activation.active ? "text-up" : campaign.activation.queued ? "text-warn" : "text-soft"} value={campaign.activation.queued ? "queued" : prettyStatus(campaign.activation.status, campaign.activation.active ? "active" : "inactive")} />
            <StatCard label="Pending work" tone={campaign.pending_work_items.count > 0 ? "text-warn" : "text-soft"} value={num(campaign.pending_work_items.count)} />
          </div>

          <div className="mt-3 flex flex-wrap gap-1.5" aria-label="PR series by status">
            {statusCounts.length > 0 ? statusCounts.map(([status, series]) => (
              <span className="status-tag" key={status}>
                {prettyStatus(status)} {num(series.length)}
              </span>
            )) : <span className="text-xs text-dim">No series are present in the campaign projection.</span>}
          </div>

          {campaign.next_batch ? (
            <div className={`mt-3 border p-3 ${campaign.next_batch.validation_state === "validated" ? "border-up/40 bg-up/5" : "border-warn/40 bg-warn/5"}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-[0.1em] text-dim">Next batch {num(campaign.next_batch.batch_index)}</div>
                  <div className="mt-1 text-xs text-soft">
                    {num(campaign.next_batch.series.length)} series · {prettyStatus(campaign.next_batch.validation_state)}
                  </div>
                </div>
                {projectedActions.find(({ definition }) => definition.actionId === "pr.publish_batch") ? (() => {
                  const candidate = projectedActions.find(({ definition }) => definition.actionId === "pr.publish_batch")!;
                  const Icon = candidate.definition.icon;
                  return (
                    <ProjectedCampaignButton
                      busy={busy}
                      icon={<Icon size={13} />}
                      onAction={onAction}
                      projection={candidate.projection}
                      tone="primary"
                    >
                      Publish batch
                    </ProjectedCampaignButton>
                  );
                })() : null}
              </div>
              <ul className="mb-0 mt-2 grid gap-1 p-0 text-xs text-soft">
                {campaign.next_batch.series.map((series) => (
                  <li className="list-none" key={series.series_id}>{series.branch || series.series_id}</li>
                ))}
              </ul>
              {campaign.next_batch.blockers.length > 0 ? (
                <div className="mt-2 text-xs text-warn">
                  {campaign.next_batch.blockers.map((blocker) => blocker.message || prettyStatus(blocker.code)).join("; ")}
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="mt-3 overflow-x-auto border border-line bg-card">
            <table className="w-full border-collapse text-left text-xs">
              <thead className="bg-raised text-[10px] uppercase tracking-[0.08em] text-dim">
                <tr>
                  <th className="px-2.5 py-2">Batch</th>
                  <th className="px-2.5 py-2">Series</th>
                  <th className="px-2.5 py-2">Status</th>
                  <th className="px-2.5 py-2">Validation</th>
                  <th className="px-2.5 py-2">Upstream</th>
                </tr>
              </thead>
              <tbody>
                {campaign.series.map((series) => (
                  <tr className="border-t border-line" key={series.series_id}>
                    <td className="whitespace-nowrap px-2.5 py-2 text-dim">{num(series.batch_index)}</td>
                    <td className="min-w-[220px] px-2.5 py-2">
                      <div className="font-mono text-soft">{series.branch || series.series_id}</div>
                      {series.target_units.length > 0 ? <div className="mt-0.5 text-[10px] text-dim">{series.target_units.join(", ")}</div> : null}
                    </td>
                    <td className={`whitespace-nowrap px-2.5 py-2 ${statusClass(series.status)}`}>{prettyStatus(series.status)}</td>
                    <td className={`whitespace-nowrap px-2.5 py-2 ${statusClass(validationLabel(series))}`}>{validationLabel(series)}</td>
                    <td className="whitespace-nowrap px-2.5 py-2">
                      {series.upstream_pr_number === null ? (
                        <span className="text-dim">—</span>
                      ) : (
                        <a className="inline-flex items-center gap-1 text-up hover:underline" href={prHref(series.upstream_pr_number)} rel="noreferrer" target="_blank">
                          #{series.upstream_pr_number} <ExternalLink size={11} />
                        </a>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-3">
            <div className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.1em] text-dim">
              Work-item queue · {num(campaign.pending_work_items.count)}
            </div>
            {campaign.pending_work_items.items.length > 0 ? (
              <ul className="m-0 grid gap-1.5 p-0">
                {campaign.pending_work_items.items.map((item) => (
                  <li className="list-none border border-line bg-card px-2.5 py-2" key={item.item_id}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs text-soft">{item.summary}</span>
                      <span className={`text-[10px] font-bold uppercase tracking-[0.08em] ${statusClass(item.status)}`}>{prettyStatus(item.status)}</span>
                    </div>
                    <div className="mt-1 text-[10px] text-dim">
                      {item.series_branch || item.series_id} · {prettyStatus(item.source_kind)} {item.source_id}
                    </div>
                  </li>
                ))}
              </ul>
            ) : <p className="m-0 text-xs text-dim">No pending campaign work items.</p>}
          </div>
        </>
      ) : (
        <p className="m-0 text-xs text-dim">No open campaign is present in the server read model.</p>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        {projectedActions
          .filter(({ definition }) => definition.actionId !== "pr.publish_batch")
          .map(({ definition, projection }) => {
            const Icon = definition.icon;
            return (
              <ProjectedCampaignButton
                busy={busy}
                icon={<Icon size={13} />}
                key={definition.actionId}
                onAction={onAction}
                projection={projection}
                tone={projection.confirmation_required ? "danger" : definition.primary ? "primary" : undefined}
              >
                {definition.label}
              </ProjectedCampaignButton>
            );
          })}
      </div>

      {projectedActions.some(({ projection }) => !projection.enabled && projection.blocked_by.length > 0) ? (
        <details className="control-disclosure mt-3">
          <summary>Campaign action blockers</summary>
          <ul className="mb-0 mt-2 grid gap-1 p-0 text-xs text-warn">
            {projectedActions.flatMap(({ definition, projection }) => projection.enabled ? [] : projection.blocked_by.map((blocker, index) => (
              <li className="flex list-none gap-1.5" key={`${definition.actionId}:${blocker.code}:${index}`}>
                <AlertTriangle size={11} /> {definition.label}: {blocker.message || prettyStatus(blocker.code)}
              </li>
            )))}
          </ul>
        </details>
      ) : null}
    </PanelSection>
  );
}
