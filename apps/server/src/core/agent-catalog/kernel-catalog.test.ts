import { describe, expect, test } from "bun:test";
import { buildRegistry } from "@agent-kernel/kernel/agent-registry";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

import type { PiPromptBundle } from "@server/core/shared/types";

import {
  conflictResolverPrompt,
  integrationResolverPrompt,
  librarianPrompt,
  prFixerPrompt,
  prPreshipReviewPrompt,
  prSplitterPrompt,
  qaRepairPrompt,
  reconcilePrompt,
  workerPrompt,
} from "@server/core/agent-catalog";
import { agentRegistry } from "@server/core/agent-catalog/registry";
import {
  assertMeleeKernelCatalogComplete,
  KERNEL_AGENT_IDS,
  meleeKernelAgent,
  meleeKernelAgentCatalog,
  toKernelAgentViewerDefinition,
  toKernelParsedAgentFromBundle,
  type KernelAgentId,
} from "./kernel-catalog.js";
import { loadKernelAgentsPayload } from "./kernel-preview.js";
import { defaultKernelTurnPrompt } from "./kernel-context.js";
import { defaultLibrarianToolProfile, resolveAgentToolIds } from "@server/core/tools/index.js";

const repoRoot = fileURLToPath(new URL("../../../../..", import.meta.url));
const sampleRepoRoot = resolve(repoRoot, "apps/server/testdata/smoke_repo");
const sampleStateDir = resolve(repoRoot, ".decomp-orchestrator-state");
const unresolvedPlaceholderPattern = /\{\{[A-Z0-9_]+\}\}/;

function samplePrompt(agentId: KernelAgentId): PiPromptBundle {
  switch (agentId) {
    case "worker":
      return workerPrompt({
        packet: {
          target: {
            unit: "GALE01:test",
            symbol: "ftDemo_Target",
            source_path: "src/melee/ft/chara/ftDemo.c",
          },
          baseline: {
            fuzzy_match_percent: 91.25,
          },
        },
        repoRoot: sampleRepoRoot,
        stateDir: sampleStateDir,
        initialBoardPath: resolve(sampleStateDir, "board.json"),
        workerLogDir: resolve(sampleStateDir, "workers"),
      });
    case "conflict-resolver": {
      const claim = {
        claim_id: "sample-incoming-claim",
        worker_state_id: "sample-worker-state",
        checkpoint_id: "sample-checkpoint",
        target_id: "sample-target",
        target_symbol: "ftDemo_Target",
        source_paths: ["src/melee/ft/chara/ftDemo.c"],
        write_set: ["src/melee/ft/chara/ftDemo.c", "src/melee/ft/chara/ftDemo.h"],
        validation_state: "tentative" as const,
        metadata: { widening_ids: ["sample-widening"] },
      };
      const scopedChecks = { passed: true, checks: [], metadata: { scope: "touched-files" } };
      return conflictResolverPrompt({
        request: {
          schema_version: "melee_conflict_resolver_request_v1",
          integration_item_id: "sample-merge-conflict",
          conflict_group_id: "worker-output:sample-merge-conflict",
          isolated_worktree: { path: "/tmp/sample-conflict", base_revision: "aaaa", session_revision: "bbbb" },
          session_worktree_path: sampleRepoRoot,
          incoming: {
            claim,
            scoped_checks: scopedChecks,
            patch: { path: "/tmp/sample.patch", text: null, sha256: "1234" },
          },
          current: {
            claim: { ...claim, claim_id: "sample-current-claim", validation_state: "confirmed" },
            scoped_checks: scopedChecks,
            branch_state: { head_revision: "bbbb", status_porcelain: "", diff: null, metadata: {} },
          },
          conflict_paths: ["src/melee/ft/chara/ftDemo.h"],
          metadata: { merge_on_finish: true },
        },
        repoRoot: sampleRepoRoot,
        stateDir: sampleStateDir,
      });
    }
    case "integration-resolver":
      return integrationResolverPrompt({
        integrationItem: {
          schema_version: "integration_conflict_item_v1",
          id: "sample-integration-conflict",
          conflict_group_id: "src-melee-ft-demo",
          run_id: "sample-run",
          epoch_id: "sample-epoch",
          failed_apply: {
            command: "git apply --check worker.patch",
            stderr: "patch failed: src/melee/ft/chara/ftDemo.c:24",
          },
          worker_outputs: [
            {
              worker_state_id: "sample-worker-state",
              checkpoint_id: "sample-checkpoint",
              target: "GALE01:ftDemo::ftDemo_Target",
              source_paths: ["src/melee/ft/chara/ftDemo.c"],
              validation: { exact: true, hard_gates_passed: true },
            },
          ],
          conflict_paths: ["src/melee/ft/chara/ftDemo.c"],
          explicit_write_set: ["src/melee/ft/chara/ftDemo.c"],
        },
        queueSummary: { queued_items: 1, conflict_groups: 1 },
        repoRoot: sampleRepoRoot,
        stateDir: sampleStateDir,
      });
    case "pr-reviewer":
      return prPreshipReviewPrompt({
        sliceId: "slice-001",
        sliceDiff: "diff --git a/src/melee/ft/chara/ftDemo.c b/src/melee/ft/chara/ftDemo.c\n+int ftDemo_Target(void) { return 1; }\n",
        lintFindings: { findings: [] },
        exhibits: [],
      });
    case "pr-fixer":
      return prFixerPrompt({
        fixerContext: {
          pr: {
            number: 2704,
            branch: "sample-pr-fixer",
            title: "Sample PR fixer",
          },
          comments: [
            {
              id: "sample-review-comment",
              file: "src/melee/ft/chara/ftDemo.c",
              line: 24,
              body: "Please restore the project assert helper here instead of open-coding this.",
              standard_id: "global_standard:canonical-asserts",
              rule_id: "raw_assert_idiom",
            },
          ],
          diff_excerpt: "diff --git a/src/melee/ft/chara/ftDemo.c b/src/melee/ft/chara/ftDemo.c",
        },
        repoRoot: sampleRepoRoot,
        stateDir: sampleStateDir,
      });
    case "pr-splitter":
      return prSplitterPrompt({
        splitContext: {
          changed_files: ["src/melee/ft/chara/ftDemo.c"],
          lanes: { match: ["src/melee/ft/chara/ftDemo.c"] },
          max_files_per_pr: 3,
        },
        repoRoot: sampleRepoRoot,
        stateDir: sampleStateDir,
      });
    case "librarian":
      return librarianPrompt({
        librarianBatch: {
          batch_id: "sample-librarian-batch",
          kind: "worker_run",
          worker_state: {
            id: "sample-worker-state",
            target_key: "src/melee/ft/chara/ftDemo.c:ftDemo_Target",
            baseline_score: 91.25,
            best_score: 97.5,
            exact: false,
          },
          checkpoints: [
            {
              kind: "checkpoint",
              id: "sample-checkpoint",
              attempt_index: 1,
              new_score: 97.5,
              delta: 6.25,
              exact_match: false,
              improved_over_baseline: true,
              validation_time: "2026-08-10T00:00:00Z",
            },
          ],
          transcripts: [],
        },
        repoRoot: sampleRepoRoot,
        stateDir: sampleStateDir,
      });
    case "reconcile":
      return reconcilePrompt({
        mode: "ship-validate",
        reconcileContext: {
          gate: "saved-baseline-regression",
          regression_report: { regressions: [] },
          attempt_budget: 1,
        },
        repoRoot: sampleRepoRoot,
        stateDir: sampleStateDir,
      });
    case "qa-repair":
      return qaRepairPrompt({
        item: {
          id: "qa-sample-1",
          source_path: "src/melee/ft/chara/ftDemo.c",
          lane: "match",
          repair_warnings: false,
          findings: [
            {
              rule_id: "review_lint.sample",
              standard_id: "sample-standard",
              severity: "error",
              line: 1,
              message: "Sample finding",
            },
          ],
          warnings: [],
        } as any,
        queueSummary: { total: 1 },
        repoRoot: sampleRepoRoot,
        stateDir: sampleStateDir,
      });
  }
}

describe("meleeKernelAgentCatalog", () => {
  test("covers every registered backend agent exactly once", () => {
    const registeredIds = Object.keys(agentRegistry) as KernelAgentId[];

    expect(() => assertMeleeKernelCatalogComplete()).not.toThrow();
    expect(KERNEL_AGENT_IDS).toHaveLength(9);
    expect(meleeKernelAgentCatalog).toHaveLength(9);
    expect([...KERNEL_AGENT_IDS].sort()).toEqual(registeredIds.sort());
    expect(new Set(meleeKernelAgentCatalog.map((entry) => entry.id)).size).toBe(meleeKernelAgentCatalog.length);
  });

  test("keeps default tool allowlists aligned with existing tool profiles", () => {
    for (const entry of meleeKernelAgentCatalog) {
      expect(entry.promptPaths.systemTemplatePath.endsWith("/agent.ts")).toBeTrue();
      expect(entry.promptPaths.promptModulePath.endsWith("/prompt.ts")).toBeTrue();
      expect(entry.promptPaths.contextModulePath.endsWith("/context.ts")).toBeTrue();
      expect(entry.promptPaths.toolsModulePath.endsWith("/tools.ts")).toBeTrue();
      expect(entry.tools).toEqual(resolveAgentToolIds(entry.role));
      expect(entry.toolProfile).toBe(entry.role);
    }

    expect(meleeKernelAgent("librarian").tools).toEqual([...defaultLibrarianToolProfile]);
    expect(defaultLibrarianToolProfile).toEqual([
      "code_graph_search",
      "past_prs_search",
      "decomp_standards_context",
      "decomp_standards_proposals",
      "review_lint_scan",
      "smashwiki_search",
      "smashwiki_get_page",
      "ledger_search",
    ]);
  });

  test("describes worker output as a runner validation handoff in the catalog", () => {
    const worker = meleeKernelAgent("worker");

    expect(worker.resultContract.notes).toContain("validation handoff");
    expect(worker.resultContract.notes).not.toContain("checkpoint note");
  });

  test("loads Melee agent.ts files as a kernel registry catalog", async () => {
    const registry = await buildRegistry({
      catalogRoot: resolve(repoRoot, "apps/server/src/core/agent-catalog/agents"),
    });

    expect(registry.list().map((agent) => agent.name).sort()).toEqual([...KERNEL_AGENT_IDS].sort());
    for (const entry of meleeKernelAgentCatalog) {
      const definition = registry.get(entry.name);
      expect(definition.agentFile).toBe(resolve(repoRoot, entry.promptPaths.systemTemplatePath));
      expect(definition.source).toBe("typed");
      expect(definition.contextModulePath).toBe(resolve(repoRoot, entry.promptPaths.contextModulePath));
      expect(definition.toolsModulePath).toBe(resolve(repoRoot, entry.promptPaths.toolsModulePath));
      expect(definition.parsed.frontmatter.name).toBe(entry.name);
      expect(definition.parsed.frontmatter.tools).toEqual(entry.tools);
    }
  });

  test("converts existing prompt bundles into kernel ParsedAgent inputs", () => {
    for (const agentId of KERNEL_AGENT_IDS) {
      const entry = meleeKernelAgent(agentId);
      const bundle = samplePrompt(agentId);
      const converted = toKernelParsedAgentFromBundle(entry, bundle);

      expect(converted.parsed.frontmatter.name).toBe(agentId);
      expect(converted.parsed.frontmatter.tools).toEqual(entry.tools);
      expect(converted.parsed.frontmatter.model).toBe(entry.model);
      expect(converted.parsed.body).toBe(bundle.systemPrompt);
      expect(bundle.systemTemplatePath.endsWith("/agent.ts")).toBeTrue();
      expect(converted.userPrompt).toBe(
        bundle.kernelContext
          ? bundle.kernelContext.turnPrompt ?? defaultKernelTurnPrompt(entry.name)
          : bundle.userPrompt,
      );
      expect(converted.contextResolver).not.toBeNull();
      expect(converted.contextResolver?.loaders.map((loader) => loader.kind)).toEqual(entry.contextLoaderKinds);
      expect(`${converted.parsed.body}\n${converted.userPrompt}\n${bundle.userPrompt}`).not.toMatch(unresolvedPlaceholderPattern);
    }
  });

  test("builds kernel viewer definitions from rendered prompt bundles", () => {
    for (const agentId of KERNEL_AGENT_IDS) {
      const entry = meleeKernelAgent(agentId);
      const bundle = samplePrompt(agentId);
      const viewerDefinition = toKernelAgentViewerDefinition(entry, bundle, {
        generatedAt: "2026-06-24T18:00:00.000Z",
      });

      expect(viewerDefinition.name).toBe(agentId);
      expect(viewerDefinition.tools).toEqual(entry.tools);
      expect(viewerDefinition.agentFile).toBe(entry.promptPaths.systemTemplatePath);
      expect(viewerDefinition.source).toBe("typed");
      expect(viewerDefinition.prompt?.kind).toBe("prompt");
      expect(viewerDefinition.renderedPrompt?.content).toContain("=== SYSTEM PROMPT ===");
      if (bundle.userPrompt.trim()) {
        expect(viewerDefinition.renderedPrompt?.content).toContain("=== INITIAL USER PROMPT ===");
      } else {
        expect(viewerDefinition.renderedPrompt?.content).not.toContain("=== INITIAL USER PROMPT ===");
      }
      expect(viewerDefinition.renderedPrompt?.content).not.toMatch(unresolvedPlaceholderPattern);
      expect(viewerDefinition.context?.inputs.map((input) => input.loaderKind)).toEqual(entry.contextLoaderKinds);
      expect(viewerDefinition.context?.modulePath).toBe(entry.promptPaths.contextModulePath);
      expect(viewerDefinition.context?.renderedContext).toBe(bundle.kernelContext?.renderedContext ?? bundle.userPrompt);
    }
  });

  test("renders dashboard worker sample with validation handoff language and hypothesis context", () => {
    const payload = loadKernelAgentsPayload({
      project: null,
      repoRoot: sampleRepoRoot,
      stateDir: sampleStateDir,
      graphDbPath: resolve(sampleStateDir, "knowledge.sqlite"),
    });
    const worker = payload.agents.find((agent) => agent.name === "worker");
    const librarian = payload.agents.find((agent) => agent.name === "librarian");
    const rendered = `${worker?.renderedPrompt?.content ?? ""}\n${worker?.context?.renderedContext ?? ""}`;

    expect(payload.agents).toHaveLength(9);
    expect(payload.warnings).toEqual([]);
    expect(librarian?.tools).toEqual([...defaultLibrarianToolProfile]);
    expect(worker).toBeDefined();
    expect(rendered).toContain("return a handoff JSON");
    expect(rendered).toContain("Do not treat non-100% progress as failure");
    expect(rendered).toContain("the runner owns the follow-up decision");
    expect(rendered).not.toContain("for this claimed target");
    expect(rendered).toContain('"mismatch_patterns"');
    expect(rendered).not.toMatch(unresolvedPlaceholderPattern);
  });

});
