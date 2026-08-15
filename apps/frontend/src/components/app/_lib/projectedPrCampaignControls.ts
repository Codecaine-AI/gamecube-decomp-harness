import type {
  DashboardAction,
  HarnessStatePrReadModel,
  HarnessStatePrSeriesSummary,
} from "@/pages/workspace/_lib/types";

export const PR_CAMPAIGN_ACTION_IDS: Partial<Record<DashboardAction, string>> = {
  prOpenCampaign: "pr.open_campaign",
  prActivate: "pr.activate",
  prPublishBatch: "pr.publish_batch",
  prRelease: "pr.release",
  prCloseCampaign: "pr.close_campaign",
  prAbandonCampaign: "pr.abandon_campaign",
  prCampaignRecover: "pr.campaign_recover",
};

export const PR_CAMPAIGN_ENDPOINTS: Partial<Record<DashboardAction, string>> = {
  prOpenCampaign: "/api/pr/open-campaign",
  prActivate: "/api/pr/activate",
  prPublishBatch: "/api/pr/publish-batch",
  prRelease: "/api/pr/release",
  prCloseCampaign: "/api/pr/close-campaign",
  prAbandonCampaign: "/api/pr/abandon-campaign",
  prCampaignRecover: "/api/pr/campaign-recover",
};

function seriesLabel(series: HarnessStatePrSeriesSummary): string {
  const name = series.branch || series.series_id;
  const units = series.target_units.length > 0 ? ` — ${series.target_units.join(", ")}` : "";
  return `${name}${units}`;
}

export function prCampaignConfirmationMessage(
  action: DashboardAction,
  pr: HarnessStatePrReadModel | null,
): string | null {
  if (action === "prPublishBatch") {
    const batch = pr?.next_batch;
    const series = batch?.series ?? [];
    const lines = series.length > 0
      ? series.map((candidate) => `- ${seriesLabel(candidate)}`)
      : ["- No series are present in the server projection."];
    return [
      `Publish PR batch ${batch?.batch_index ?? "?"} upstream?`,
      "",
      `Series (${series.length}):`,
      ...lines,
      "",
      "This creates the listed pull requests upstream.",
    ].join("\n");
  }
  if (action === "prCloseCampaign") {
    return "Close this PR campaign?\n\nEvery series is terminal. The campaign will become completed.";
  }
  if (action === "prAbandonCampaign") {
    return "Abandon this PR campaign?\n\nThe campaign becomes terminal. Unfinished campaign work will no longer be active.";
  }
  if (action === "prCampaignRecover") {
    return "Recover this PR campaign?\n\nThe stale or failed activation lease will be broken and the campaign will return to review.";
  }
  return null;
}
