import { describe, expect, test } from "bun:test";
import { CANONICAL_PROJECT_ACTION_IDS } from "./projectedCanonicalActions";
import { PR_COMPATIBILITY_ACTION_IDS, PR_COMPATIBILITY_ENDPOINTS } from "./projectedCompatibilityControls";
import { KNOWLEDGE_CONTROL_ACTION_IDS, KNOWLEDGE_CONTROL_ENDPOINTS, knowledgeConfirmationMessage } from "./projectedKnowledgeControls";
import { PR_CAMPAIGN_ACTION_IDS } from "./projectedPrCampaignControls";
import { RUN_CONTROL_ACTION_IDS } from "./projectedRunControls";
import { SESSION_CONTROL_ACTION_IDS, SESSION_CONTROL_ENDPOINTS, sessionConfirmationMessage } from "./projectedSessionControls";
import { SYNC_CONTROL_ACTION_IDS } from "./projectedSyncControls";

describe("canonical projected action inventory", () => {
  test("contains exactly the 21 canonical action ids", () => {
    expect(CANONICAL_PROJECT_ACTION_IDS).toHaveLength(21);
    expect(new Set(CANONICAL_PROJECT_ACTION_IDS).size).toBe(21);
    expect(CANONICAL_PROJECT_ACTION_IDS).toEqual([
      "run.start", "run.pause", "run.resume", "run.hard_stop", "run.cancel", "run.recover",
      "pr.open_campaign", "pr.activate", "pr.publish_batch", "pr.release", "pr.close_campaign", "pr.abandon_campaign", "pr.campaign_recover",
      "sync.start", "sync.resolve_conflict", "sync.publish", "sync.cancel", "sync.recover",
      "session.save_point", "session.close", "knowledge.process",
    ]);
  });

  test("domain maps cover the canonical inventory exactly", () => {
    const domainProjectedIds = [
      [...new Set(Object.values(RUN_CONTROL_ACTION_IDS))],
      [...new Set(Object.values(PR_CAMPAIGN_ACTION_IDS))],
      [...new Set(Object.values(SYNC_CONTROL_ACTION_IDS))],
      [...new Set(Object.values(SESSION_CONTROL_ACTION_IDS))],
      [...new Set(Object.values(KNOWLEDGE_CONTROL_ACTION_IDS))],
    ];
    const projectedIds = domainProjectedIds.flat();

    expect(projectedIds).toEqual([...CANONICAL_PROJECT_ACTION_IDS]);
    expect(new Set(projectedIds).size).toBe(projectedIds.length);
  });

  test("keeps legacy adoption visibly separate from canonical PR actions", () => {
    expect(PR_COMPATIBILITY_ACTION_IDS).toEqual({ prAdoptLegacy: "pr.adopt_legacy" });
    expect(PR_COMPATIBILITY_ENDPOINTS).toEqual({ prAdoptLegacy: "/api/pr/adopt-legacy" });
    expect(Object.values(PR_CAMPAIGN_ACTION_IDS)).not.toContain("pr.adopt_legacy");
    expect(CANONICAL_PROJECT_ACTION_IDS).not.toContain("pr.adopt_legacy" as never);
  });

  test("maps session and knowledge routes and confirms only terminal session close", () => {
    expect(SESSION_CONTROL_ENDPOINTS).toEqual({
      sessionSavePoint: "/api/project-session/save-point",
      sessionClose: "/api/project-session/close",
    });
    expect(KNOWLEDGE_CONTROL_ENDPOINTS).toEqual({ knowledgeProcess: "/api/knowledge/process" });
    expect(sessionConfirmationMessage("sessionSavePoint")).toBeNull();
    expect(sessionConfirmationMessage("sessionClose")).toContain("terminal action");
    expect(knowledgeConfirmationMessage("knowledgeProcess" as never)).toBeNull();
  });
});
