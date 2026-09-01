import { describe, expect, mock, test } from "bun:test";

// Override execution exports because Bun module mocks can leak from other wrapper test files.
mock.module("../runtime/execution.js", () => ({
  graphFileCard: () => ({}),
  graphRelatedFunctions: () => ({}),
  graphSearch: () => ({}),
  runSourceApi: async () => ({}),
  runKnowledgeToolApiForContext: async () => ({}),
}));

const { agentToolRegistry, toolAllowedForRole } = await import("../runtime/registry.js");

const knowledgeV2ToolIds = [
  "kv2_discord_search",
  "kv2_wiki_search",
  "kv2_pr_search",
  "kv2_attempt_search",
  "kv2_subject_record",
  "kv2_entity_lookup",
  "kv2_resolve_locator",
  "kv2_unit_context",
] as const;

describe("knowledge-v2 tool allowed roles", () => {
  test("each registration is librarian-only and denies workers", () => {
    for (const id of knowledgeV2ToolIds) {
      const registration = agentToolRegistry[id];
      expect(registration).toBeDefined();
      expect(registration.allowedRoles).toEqual(["librarian"]);
      expect(toolAllowedForRole(registration, "librarian")).toBe(true);
      expect(toolAllowedForRole(registration, "worker")).toBe(false);
    }
  });
});
