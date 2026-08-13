import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { ProjectStatePrReadModel } from "@/pages/workspace/_lib/types";
import {
  PR_CAMPAIGN_ACTION_IDS,
  PR_CAMPAIGN_ENDPOINTS,
  prCampaignConfirmationMessage,
} from "./projectedPrCampaignControls";

const sourceRoot = resolve(import.meta.dir, "../../..");
const series = {
  series_id: "series-4",
  batch_index: 2,
  status: "prepared",
  branch: "codex/split-04-fighter",
  upstream_pr_number: null,
  target_units: ["src/melee/fighter.c"],
  last_validation: { status: "passed" },
  blockers: [],
  work_items: [],
} as const;
const campaign = {
  next_batch: {
    batch_index: 2,
    validation_state: "validated",
    series_ids: [series.series_id],
    blockers: [],
    series: [series],
  },
} as unknown as ProjectStatePrReadModel;

describe("projected PR campaign controls", () => {
  test("maps the complete action inventory to campaign routes", () => {
    expect(PR_CAMPAIGN_ACTION_IDS).toEqual({
      prOpenCampaign: "pr.open_campaign",
      prActivate: "pr.activate",
      prPublishBatch: "pr.publish_batch",
      prRelease: "pr.release",
      prCloseCampaign: "pr.close_campaign",
      prAbandonCampaign: "pr.abandon_campaign",
      prCampaignRecover: "pr.campaign_recover",
      prAdoptLegacy: "pr.adopt_legacy",
    });
    expect(PR_CAMPAIGN_ENDPOINTS).toEqual({
      prOpenCampaign: "/api/pr/open-campaign",
      prActivate: "/api/pr/activate",
      prPublishBatch: "/api/pr/publish-batch",
      prRelease: "/api/pr/release",
      prCloseCampaign: "/api/pr/close-campaign",
      prAbandonCampaign: "/api/pr/abandon-campaign",
      prCampaignRecover: "/api/pr/campaign-recover",
      prAdoptLegacy: "/api/pr/adopt-legacy",
    });
  });

  test("lists the projected batch series in the publish confirmation", () => {
    expect(prCampaignConfirmationMessage("prPublishBatch", campaign)).toBe(
      "Publish PR batch 2 upstream?\n\nSeries (1):\n- codex/split-04-fighter — src/melee/fighter.c\n\nThis creates the listed pull requests upstream.",
    );
    expect(prCampaignConfirmationMessage("prActivate", campaign)).toBeNull();
    expect(prCampaignConfirmationMessage("prCloseCampaign", campaign)).toContain("Every series is terminal");
    expect(prCampaignConfirmationMessage("prCampaignRecover", campaign)).toContain("activation lease");
  });

  test("renders the campaign card and reroutes legacy batch publication through pr.publish_batch", () => {
    const card = readFileSync(resolve(sourceRoot, "pages/workspace/sessions/active/subphases/pr/components/PrCampaignCard.tsx"), "utf8");
    const legacy = readFileSync(resolve(sourceRoot, "pages/workspace/sessions/active/subphases/pr/components/PrModeActions.tsx"), "utf8");
    const page = readFileSync(resolve(sourceRoot, "pages/workspace/sessions/active/subphases/pr/index.tsx"), "utf8");
    const dispatcher = readFileSync(resolve(sourceRoot, "components/app/index.tsx"), "utf8");

    for (const actionId of [
      "pr.open_campaign",
      "pr.activate",
      "pr.publish_batch",
      "pr.release",
      "pr.close_campaign",
      "pr.abandon_campaign",
      "pr.campaign_recover",
      "pr.adopt_legacy",
    ]) {
      expect(card).toContain(`actionId: "${actionId}"`);
    }
    expect(card).toContain("campaign.series_by_status");
    expect(card).toContain("campaign.pending_work_items.items");
    expect(card).toContain("campaign.next_batch.series");
    expect(page).toContain("<PrCampaignCard");
    expect(legacy).toContain('projectStateAction(view.projectState, "pr.publish_batch")');
    expect(legacy).toContain('onAction("prPublishBatch")');
    expect(legacy).not.toContain('onAction("openDraftBatch")');
    expect(legacy).not.toContain('onAction("openAllPrs")');
    expect(dispatcher).toContain("projectedPrAction?.confirmation_required");
    expect(dispatcher).toContain("prCampaignConfirmationMessage(nextAction, projectState?.pr ?? null)");
    expect(dispatcher).toContain("PR_CAMPAIGN_ENDPOINTS[nextAction]");
  });
});
