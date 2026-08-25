import { describe, expect, test } from "bun:test";
import { CANONICAL_HARNESS_ACTION_IDS } from "./projectedCanonicalActions";
import { PR_COMPATIBILITY_ACTION_IDS, PR_COMPATIBILITY_ENDPOINTS } from "./projectedCompatibilityControls";
import { KNOWLEDGE_CONTROL_ACTION_IDS, KNOWLEDGE_CONTROL_ENDPOINTS, knowledgeConfirmationMessage } from "./projectedKnowledgeControls";
import { RUN_CONTROL_ACTION_IDS } from "./projectedRunControls";
import { CYCLE_CONTROL_ACTION_IDS, CYCLE_CONTROL_ENDPOINTS, cycleConfirmationMessage } from "./projectedCycleControls";
import { SYNC_CONTROL_ACTION_IDS } from "./projectedSyncControls";

describe("canonical projected action inventory", () => {
  test("contains exactly the 13 canonical action ids", () => {
    expect(CANONICAL_HARNESS_ACTION_IDS).toHaveLength(13);
    expect(new Set(CANONICAL_HARNESS_ACTION_IDS).size).toBe(13);
    expect(CANONICAL_HARNESS_ACTION_IDS).toEqual([
      "run.start", "run.resume", "run.hard_stop", "run.cancel", "run.recover",
      "sync.start", "sync.resolve_conflict", "sync.publish", "sync.cancel", "sync.recover",
      "cycle.save_point", "cycle.close", "knowledge.process",
    ]);
  });

  test("domain maps cover the canonical inventory exactly", () => {
    const domainProjectedIds = [
      [...new Set(Object.values(RUN_CONTROL_ACTION_IDS))],
      [...new Set(Object.values(SYNC_CONTROL_ACTION_IDS))],
      [...new Set(Object.values(CYCLE_CONTROL_ACTION_IDS))],
      [...new Set(Object.values(KNOWLEDGE_CONTROL_ACTION_IDS))],
    ];
    const projectedIds = domainProjectedIds.flat();

    expect(projectedIds).toEqual([...CANONICAL_HARNESS_ACTION_IDS]);
    expect(new Set(projectedIds).size).toBe(projectedIds.length);
  });

  test("keeps legacy adoption visibly separate from canonical PR actions", () => {
    expect(PR_COMPATIBILITY_ACTION_IDS).toEqual({ prAdoptLegacy: "pr.adopt_legacy" });
    expect(PR_COMPATIBILITY_ENDPOINTS).toEqual({ prAdoptLegacy: "/api/pr/adopt-legacy" });
    expect(CANONICAL_HARNESS_ACTION_IDS).not.toContain("pr.adopt_legacy" as never);
  });

  test("maps cycle and knowledge routes and confirms only terminal cycle close", () => {
    expect(CYCLE_CONTROL_ENDPOINTS).toEqual({
      cycleSavePoint: "/api/cycle/save-point",
      cycleClose: "/api/cycle/close",
    });
    expect(KNOWLEDGE_CONTROL_ENDPOINTS).toEqual({ knowledgeProcess: "/api/knowledge/process" });
    expect(cycleConfirmationMessage("cycleSavePoint")).toBeNull();
    expect(cycleConfirmationMessage("cycleClose")).toContain("terminal action");
    expect(knowledgeConfirmationMessage("knowledgeProcess" as never)).toBeNull();
  });
});
