import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

import type { PiPromptBundle } from "@server/core/shared/types";

import {
  integrationResolverPrompt,
  librarianPrompt,
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
import { defaultKernelTurnPrompt, ROOT_CONTEXT_LOADER_KIND } from "./kernel-context.js";
import {
  agentToolProfileSummary,
  defaultLibrarianToolProfile,
  defaultWorkerToolProfile,
  resolveAgentToolIds,
} from "@server/core/tools/index.js";
import { createMeleeLoaderCatalog } from "@server/infrastructure/kernel/bridge/loaders.js";

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
        existingCanonicalToolPaths: new Set(),
      });
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
  }
}

describe("meleeKernelAgentCatalog", () => {
  test("registers every declared context loader kind", () => {
    const catalog = createMeleeLoaderCatalog();

    for (const entry of meleeKernelAgentCatalog) {
      for (const kind of entry.contextLoaderKinds) {
        expect(catalog.has(kind)).toBeTrue();
      }
    }
  });

  test("registers all librarian context loader kinds", () => {
    const catalog = createMeleeLoaderCatalog();

    expect(catalog.has("librarian-context")).toBeTrue();
    expect(catalog.has("librarian-curation-context")).toBeTrue();
    expect(catalog.has("librarian-pr-index-context")).toBeTrue();
  });

  test("covers every registered backend agent exactly once", () => {
    const registeredIds = Object.keys(agentRegistry) as KernelAgentId[];

    expect(() => assertMeleeKernelCatalogComplete()).not.toThrow();
    expect(KERNEL_AGENT_IDS).toHaveLength(3);
    expect(meleeKernelAgentCatalog).toHaveLength(3);
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

    expect(meleeKernelAgent("worker").tools).toEqual([...defaultWorkerToolProfile]);
    expect(defaultWorkerToolProfile).toContain("ledger_search");
    expect(
      agentToolProfileSummary("worker").map((tool) => tool.id),
    ).toContain("ledger_search");
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

  test("keeps every harness-authored agent bundle path complete", () => {
    for (const entry of meleeKernelAgentCatalog) {
      expect(existsSync(resolve(repoRoot, entry.promptPaths.systemTemplatePath))).toBeTrue();
      expect(existsSync(resolve(repoRoot, entry.promptPaths.promptModulePath))).toBeTrue();
      expect(existsSync(resolve(repoRoot, entry.promptPaths.contextModulePath))).toBeTrue();
      expect(existsSync(resolve(repoRoot, entry.promptPaths.toolsModulePath))).toBeTrue();
      if (entry.promptPaths.schemaPath) {
        expect(existsSync(resolve(repoRoot, entry.promptPaths.schemaPath))).toBeTrue();
      }
    }
  });

  test("converts existing prompt bundles into kernel ParsedAgent inputs", () => {
    for (const agentId of KERNEL_AGENT_IDS) {
      const entry = meleeKernelAgent(agentId);
      const bundle = samplePrompt(agentId);
      const converted = toKernelParsedAgentFromBundle(entry, bundle);

      expect(converted.parsed.config.name).toBe(agentId);
      expect(converted.parsed.config.tools).toEqual(entry.tools);
      expect(converted.parsed.config.model).toBe(entry.model);
      expect(converted.parsed.body).toBe(bundle.systemPrompt);
      expect(bundle.systemTemplatePath.endsWith("/agent.ts")).toBeTrue();
      expect(converted.userPrompt).toBe(
        bundle.kernelContext
          ? bundle.kernelContext.turnPrompt ?? defaultKernelTurnPrompt(entry.name)
          : bundle.userPrompt,
      );
      expect(converted.contextResolver).not.toBeNull();
      expect(converted.contextResolver?.loaders.map((loader) => loader.kind)).toEqual([
        ROOT_CONTEXT_LOADER_KIND,
        ...(bundle.kernelContext?.inputs.map((input) => input.loaderKind) ?? []),
      ]);
      for (const kind of [
        ROOT_CONTEXT_LOADER_KIND,
        ...(bundle.kernelContext?.inputs.map((input) => input.loaderKind) ?? []),
      ]) {
        expect(entry.contextLoaderKinds).toContain(kind);
      }
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
      expect(viewerDefinition.context?.inputs.map((input) => input.loaderKind)).toEqual([
        ROOT_CONTEXT_LOADER_KIND,
        ...(bundle.kernelContext?.inputs.map((input) => input.loaderKind) ?? []),
      ]);
      for (const kind of [
        ROOT_CONTEXT_LOADER_KIND,
        ...(bundle.kernelContext?.inputs.map((input) => input.loaderKind) ?? []),
      ]) {
        expect(entry.contextLoaderKinds).toContain(kind);
      }
      expect(viewerDefinition.context?.modulePath).toBe(entry.promptPaths.contextModulePath);
      expect(viewerDefinition.context?.renderedContext).toBe(bundle.kernelContext?.renderedContext ?? bundle.userPrompt);
    }
  });

  test("renders dashboard worker sample with validation handoff language and hypothesis context", () => {
    const payload = loadKernelAgentsPayload({
      game: null,
      repoRoot: sampleRepoRoot,
      stateDir: sampleStateDir,
      graphDbPath: resolve(sampleStateDir, "knowledge.sqlite"),
    });
    const worker = payload.agents.find((agent) => agent.name === "worker");
    const librarian = payload.agents.find((agent) => agent.name === "librarian");
    const rendered = `${worker?.renderedPrompt?.content ?? ""}\n${worker?.context?.renderedContext ?? ""}`;

    expect(payload.agents).toHaveLength(3);
    expect(payload.warnings).toEqual([]);
    expect(librarian?.tools).toEqual([...defaultLibrarianToolProfile]);
    expect(worker).toBeDefined();
    expect(rendered).toContain("return a handoff JSON");
    expect(rendered).toContain("Do not treat non-100% progress as failure");
    expect(rendered).toContain("the runner owns the follow-up decision");
    expect(rendered).not.toContain("for this claimed target");
    expect(rendered).toContain('"mismatch_patterns"');
    expect(rendered).toContain('tool name="asm_window_search"');
    expect(rendered).toContain('provider="asm_window_search" type="exploration"');
    expect(rendered).toContain('tool name="type_layout_lookup"');
    expect(rendered).toContain('provider="type_layout_lookup" type="diagnostics"');
    expect(rendered).not.toMatch(unresolvedPlaceholderPattern);
  });

});
