import { describe, expect, test } from "bun:test";
import {
  CONFLICT_RESOLVER_REQUEST_SCHEMA_VERSION,
  type ConflictResolverRequest,
} from "./context.js";
import {
  CONFLICT_RESOLVER_RESULT_SCHEMA_VERSION,
  conflictResolverPrompt,
  validateConflictResolverAgentResult,
  type ConflictResolverAgentResult,
} from "./prompt.js";
import { invokeConflictResolver } from "./invocation.js";

function request(): ConflictResolverRequest {
  const claim = {
    claim_id: "claim-incoming",
    worker_state_id: "worker-1",
    checkpoint_id: "checkpoint-1",
    target_id: "target-1",
    target_symbol: "fn_1",
    source_paths: ["src/a.c"],
    write_set: ["src/a.c", "include/a.h"],
    validation_state: "tentative" as const,
    metadata: { widened: true },
  };
  const checks = {
    passed: true,
    checks: [
      {
        name: "target object",
        command: "ninja build/obj/a.o",
        status: "passed" as const,
        artifact_path: "/state/a.log",
        summary: "compiled",
      },
    ],
    metadata: { tier: "scope-following" },
  };
  return {
    schema_version: CONFLICT_RESOLVER_REQUEST_SCHEMA_VERSION,
    integration_item_id: "integration-1",
    conflict_group_id: "worker-output:integration-1",
    isolated_worktree: {
      path: "/tmp/conflict-1",
      base_revision: "aaaa",
      cycle_revision: "bbbb",
    },
    cycle_worktree_path: "/repo/session/current",
    incoming: {
      claim,
      scoped_checks: checks,
      patch: { path: "/state/incoming.patch", text: "diff --git", sha256: "1234" },
    },
    current: {
      claim: { ...claim, claim_id: "claim-current", validation_state: "confirmed" },
      scoped_checks: checks,
      branch_state: {
        head_revision: "bbbb",
        status_porcelain: "",
        diff: null,
        metadata: { branch: "session-current" },
      },
    },
    conflict_paths: ["include/a.h"],
    metadata: { merge_on_finish: true },
  };
}

function resolvedResult(): ConflictResolverAgentResult {
  return {
    schema_version: CONFLICT_RESOLVER_RESULT_SCHEMA_VERSION,
    integration_item_id: "integration-1",
    conflict_group_id: "worker-output:integration-1",
    outcome: "resolved",
    summary: "Merged both compatible declaration changes.",
    applied_in_isolated_worktree: true,
    resolved_patch: {
      path: "/tmp/conflict-1/resolved.patch",
      text: null,
      sha256: "abcd",
    },
    conflict_resolutions: [
      {
        path: "include/a.h",
        resolution: "merged",
        evidence: "Both declarations are retained without conflict markers.",
      },
    ],
    validation: [
      {
        name: "target object",
        command: "ninja build/obj/a.o",
        status: "passed",
        artifact_path: "/tmp/conflict-1/build.log",
        summary: "compiled",
      },
    ],
    remaining_conflicts: [],
    risks: [],
  };
}

describe("conflictResolverPrompt", () => {
  test("injects both claims, branch state, patch, evidence, and isolated-worktree contract", () => {
    const bundle = conflictResolverPrompt({ request: request() });
    const context = bundle.kernelContext?.renderedContext ?? "";
    expect(bundle.systemPrompt).toContain("merge-on-finish");
    expect(context).toContain("/state/incoming.patch");
    expect(context).toContain("claim-current");
    expect(context).toContain("scope-following");
    expect(context).toContain("/tmp/conflict-1");
    expect(context).toContain("Never edit it directly");
    expect(context).not.toMatch(/\{\{[A-Z0-9_]+\}\}/);
  });

  test("requires an applied isolated-worktree result and a resolved patch", () => {
    expect(validateConflictResolverAgentResult(resolvedResult()).errors).toEqual([]);
    const invalid = resolvedResult();
    invalid.applied_in_isolated_worktree = false;
    invalid.resolved_patch.path = null;
    expect(validateConflictResolverAgentResult(invalid).errors).toEqual(
      expect.arrayContaining([
        "resolved outcome must be applied in the isolated worktree",
        "resolved outcome requires a resolved patch path or text",
      ]),
    );
  });
});

describe("invokeConflictResolver", () => {
  test("runs in the isolated worktree and succeeds only after apply plus record", async () => {
    let runnerCwd = "";
    const result = await invokeConflictResolver({
      request: request(),
      outputDir: "/state/conflict-resolver",
      runner: async (options) => {
        runnerCwd = options.cwd;
        return { rawText: JSON.stringify(resolvedResult()) };
      },
      acceptResolution: async () => ({
        applied: true,
        recorded: true,
        summary: "applied serially and recorded",
      }),
    });
    expect(runnerCwd).toBe("/tmp/conflict-1");
    expect(result.status).toBe("resolved");
  });

  test("fails closed to operator-visible conflict when the provider or acceptor fails", async () => {
    const providerFailure = await invokeConflictResolver({
      request: request(),
      outputDir: "/state/conflict-resolver",
      runner: async () => ({ rawText: "", providerError: "offline" }),
      acceptResolution: async () => ({ applied: true, recorded: true, summary: "unused" }),
    });
    expect(providerFailure.status).toBe("conflict");
    if (providerFailure.status === "conflict") {
      expect(providerFailure.fallback.operator_visible_status).toBe("conflict");
      expect(providerFailure.fallback.conflict_paths).toEqual(["include/a.h"]);
    }

    const acceptFailure = await invokeConflictResolver({
      request: request(),
      outputDir: "/state/conflict-resolver",
      runner: async () => ({ rawText: JSON.stringify(resolvedResult()) }),
      acceptResolution: async () => ({
        applied: false,
        recorded: false,
        summary: "git apply still conflicts",
      }),
    });
    expect(acceptFailure.status).toBe("conflict");
  });
});
