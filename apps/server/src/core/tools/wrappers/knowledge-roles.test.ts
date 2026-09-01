import { describe, expect, mock, test } from "bun:test";
import type { RuntimeAgentRole } from "@server/core/shared/types";

// Override execution exports because Bun module mocks can leak from other wrapper test files.
mock.module("../runtime/execution.js", () => ({
  graphFileCard: () => ({}),
  graphRelatedFunctions: () => ({}),
  graphSearch: () => ({}),
  runSourceApi: async () => ({}),
  runKnowledgeToolApiForContext: async () => ({}),
}));

const { agentToolRegistry } = await import("../runtime/registry.js");

const knowledgeToolIds = [
  "code_graph_file_card",
  "code_graph_search",
  "knowledge_graph_search",
  "graph_related_functions",
  "past_prs_search",
  "ledger_search",
] as const;

describe("knowledge tool allowed roles", () => {
  test("each registration has the exact expected roles", () => {
    const sourceContextRoles: RuntimeAgentRole[] = ["worker", "pr-splitter", "librarian", "reconcile", "qa-repair"];
    const expectedRoles: Record<string, RuntimeAgentRole[]> = {
      code_graph_file_card: sourceContextRoles,
      code_graph_search: sourceContextRoles,
      knowledge_graph_search: sourceContextRoles,
      graph_related_functions: sourceContextRoles,
      past_prs_search: sourceContextRoles,
      ledger_search: ["librarian", "worker"],
    };

    const knowledgeToolRegistrations = knowledgeToolIds.map((id) => agentToolRegistry[id]);

    expect([...knowledgeToolIds].sort() as string[]).toEqual(Object.keys(expectedRoles).sort());
    for (const registration of knowledgeToolRegistrations) {
      expect(registration).toBeDefined();
      expect(registration.allowedRoles).toEqual(expectedRoles[registration.id]);
    }
  });
});
