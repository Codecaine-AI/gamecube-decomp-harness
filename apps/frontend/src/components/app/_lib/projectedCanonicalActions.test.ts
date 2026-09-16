import { describe, expect, test } from "bun:test";
import { CANONICAL_HARNESS_ACTION_IDS } from "./projectedCanonicalActions";
import { KNOWLEDGE_CONTROL_ACTION_IDS, KNOWLEDGE_CONTROL_ENDPOINTS, knowledgeConfirmationMessage } from "./projectedKnowledgeControls";
import { RUN_CONTROL_ACTION_IDS } from "./projectedRunControls";
import { SYNC_CONTROL_ACTION_IDS } from "./projectedSyncControls";

describe("canonical projected action inventory", () => {
  test("contains exactly the 11 canonical action ids", () => {
    expect(CANONICAL_HARNESS_ACTION_IDS).toHaveLength(11);
    expect(new Set(CANONICAL_HARNESS_ACTION_IDS).size).toBe(11);
    expect(CANONICAL_HARNESS_ACTION_IDS).toEqual([
      "run.start", "run.resume", "run.hard_stop", "run.cancel", "run.recover",
      "sync.start", "sync.resolve_conflict", "sync.publish", "sync.cancel", "sync.recover",
      "knowledge.process",
    ]);
  });

  test("domain maps cover the canonical inventory exactly", () => {
    const domainProjectedIds = [
      [...new Set(Object.values(RUN_CONTROL_ACTION_IDS))],
      [...new Set(Object.values(SYNC_CONTROL_ACTION_IDS))],
      [...new Set(Object.values(KNOWLEDGE_CONTROL_ACTION_IDS))],
    ];
    const projectedIds = domainProjectedIds.flat();

    expect(projectedIds).toEqual([...CANONICAL_HARNESS_ACTION_IDS]);
    expect(new Set(projectedIds).size).toBe(projectedIds.length);
  });

  test("maps knowledge processing without cycle lifecycle controls", () => {
    expect(KNOWLEDGE_CONTROL_ENDPOINTS).toEqual({ knowledgeProcess: "/api/knowledge/process" });
    expect(CANONICAL_HARNESS_ACTION_IDS.some((id) => id.startsWith("cycle."))).toBe(false);
    expect(knowledgeConfirmationMessage("knowledgeProcess" as never)).toBeNull();
  });
});
