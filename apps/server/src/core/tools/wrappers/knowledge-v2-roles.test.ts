import { describe, expect, test } from "bun:test";
import type { RuntimeAgentRole } from "@server/core/shared/types";
import { defaultLibrarianToolProfile } from "../profiles/defaults.js";

const { agentToolRegistry, toolAllowedForRole } = await import("../runtime/registry.js");

const knowledgeV2ToolIds = [
  "discord_search",
  "wiki_search",
  "pr_search",
  "attempt_search",
  "knowledge_record",
  "entity_lookup",
  "resolve_locator",
  "unit_context",
] as const;

describe("knowledge-v2 tool allowed roles", () => {
  test("librarian profile excludes legacy search and lint tools", () => {
    expect(defaultLibrarianToolProfile).not.toContain("ledger_search");
    expect(defaultLibrarianToolProfile).not.toContain("past_prs_search");
    expect(defaultLibrarianToolProfile).not.toContain("review_lint_scan");
  });

  test("workers receive the six read-only research tools", () => {
    const expectedRoles: Record<(typeof knowledgeV2ToolIds)[number], RuntimeAgentRole[]> = {
      discord_search: ["librarian", "worker"],
      wiki_search: ["librarian", "worker"],
      pr_search: ["librarian", "worker"],
      attempt_search: ["librarian", "worker"],
      knowledge_record: ["librarian", "worker"],
      entity_lookup: ["librarian"],
      resolve_locator: ["librarian", "worker"],
      unit_context: ["librarian"],
    };

    for (const id of knowledgeV2ToolIds) {
      const registration = agentToolRegistry[id];
      expect(registration).toBeDefined();
      expect(registration.allowedRoles).toEqual(expectedRoles[id]);
      expect(toolAllowedForRole(registration, "librarian")).toBe(true);
      expect(toolAllowedForRole(registration, "worker")).toBe(
        expectedRoles[id].includes("worker"),
      );
    }
  });
});
