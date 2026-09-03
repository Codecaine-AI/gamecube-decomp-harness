import { describe, expect, test } from "bun:test";
import type { RuntimeAgentRole } from "@server/core/shared/types";
import { defaultLibrarianToolProfile } from "../profiles/defaults.js";

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
  test("librarian profile excludes legacy search and lint tools", () => {
    expect(defaultLibrarianToolProfile).not.toContain("ledger_search");
    expect(defaultLibrarianToolProfile).not.toContain("past_prs_search");
    expect(defaultLibrarianToolProfile).not.toContain("review_lint_scan");
  });

  test("workers receive the six read-only research tools", () => {
    const expectedRoles: Record<(typeof knowledgeV2ToolIds)[number], RuntimeAgentRole[]> = {
      kv2_discord_search: ["librarian", "worker"],
      kv2_wiki_search: ["librarian", "worker"],
      kv2_pr_search: ["librarian", "worker"],
      kv2_attempt_search: ["librarian", "worker"],
      kv2_subject_record: ["librarian", "worker"],
      kv2_entity_lookup: ["librarian"],
      kv2_resolve_locator: ["librarian", "worker"],
      kv2_unit_context: ["librarian"],
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
