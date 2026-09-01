import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

import type { PiPromptBundle } from "@server/core/shared/types";

import { workerPrompt } from "@server/core/agent-catalog";
import { workerSummarizerPrompt } from "@server/core/agent-catalog/agents/knowledge/worker-summarizer/index.js";
import { librarianV2Prompt } from "@server/core/agent-catalog/agents/knowledge/librarian-v2/index.js";
import { backfillLibrarianPrompt } from "@server/core/agent-catalog/agents/knowledge/backfill-librarian/index.js";
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
import {
  defaultKernelTurnPrompt,
  renderKernelContextInputsPreview,
  ROOT_CONTEXT_LOADER_KIND,
} from "./kernel-context.js";
import {
  agentToolProfileSummary,
  defaultLibrarianToolProfile,
  defaultWorkerToolProfile,
  resolveAgentToolIds,
} from "@server/core/tools/index.js";
import { createMeleeLoaderCatalog } from "@server/infrastructure/kernel/bridge/loaders.js";
import { formatLocator, parseLocator } from "@server/core/knowledge-v2/locator.js";

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
    case "worker-summarizer":
      return workerSummarizerPrompt({
        targetCardReference: {
          target_key: "src/melee/ft/chara/ftDemo.c:ftDemo_Target",
        },
        checkpointSubmissionDigest: {
          checkpoints: [{ result: "improved but inexact" }],
          submissions: [{ result: "improved but inexact" }],
        },
        transcript: [
          {
            role: "assistant",
            content: "I reordered the guard branches to test whether branch order caused the mismatch.",
          },
        ],
        repoRoot: sampleRepoRoot,
        stateDir: sampleStateDir,
      });
    case "librarian-v2":
      return librarianV2Prompt({
        task: { pathway: "run_closed", payload: { worker_run_id: "sample-run" } },
        object: {
          run: { id: "sample-run", target_stable_key: "GALE01:ftDemo_Target" },
          submissions: [{ seq: 1, hypothesis: "Guard order controls branch shape." }],
          proposal: { purpose: "Updates fighter state after the guard passes." },
        },
        touchedSubjects: [
          {
            order: 1,
            kind: "target",
            target_stable_key: "GALE01:ftDemo_Target",
            record: { facts: {}, links: [] },
            material: {
              source: { locator: "code://1e28b420/src/melee/ft/chara/ftDemo.c#L12-L40", truncated: false },
              analogs: { unavailable: true },
              ledger: { runs: [{ id: "sample-run", submissions: [{ seq: 1, score: 100, locator: "attempt://run/sample-run/submission/1" }] }] },
            },
          },
        ],
        supportingSubjects: [],
        decompStandards: { standards: [] },
        repoRoot: sampleRepoRoot,
        stateDir: sampleStateDir,
      });
    case "backfill-librarian":
      return backfillLibrarianPrompt({
        task: { mode: "fill_out_pass" },
        fillOutSubjects: [
          {
            order: 1,
            kind: "entity",
            entity_kind: "translation_unit",
            entity_locator: "src/melee/ft/ftDemo.c",
            record: { facts: {}, links: [] },
          },
          {
            order: 2,
            kind: "target",
            target_stable_key: "GALE01:ftDemo_Target",
            detail: { symbol: "ftDemo_Target", match_pct: 100, linked: true },
            ledger: { runs: [{ id: "sample-run", submissions: [{ seq: 1, score: 100, locator: "attempt://run/sample-run/submission/1" }] }] },
            record: { facts: { purpose: { value: "Updates fighter state.", confidence: 0.5, evidence: [{ kind: "discord", locator: "discord://message/1234567890" }] } }, links: [] },
          },
        ],
        supportingSubjects: [],
        decompStandards: { standards: [{ id: "std-sample", rule: "Match the original file layout." }] },
        repoRoot: sampleRepoRoot,
        stateDir: sampleStateDir,
      });
  }
}

describe("meleeKernelAgentCatalog", () => {
  test("keeps librarian sample locators in canonical format", () => {
    const locatorPattern = /(?:discord|wiki|pr|attempt|code):[^\s"'<>\\]+/gu;
    const documentedLocatorPattern = /&lt;[^&]+&gt;|:\/\/`$/u;
    const locators: string[] = [];
    const visit = (value: unknown): void => {
      if (typeof value === "string") {
        for (const match of value.matchAll(locatorPattern)) locators.push(match[0]);
        return;
      }
      if (Array.isArray(value)) {
        for (const item of value) visit(item);
        return;
      }
      if (value !== null && typeof value === "object") {
        for (const item of Object.values(value)) visit(item);
      }
    };

    visit(samplePrompt("librarian-v2"));
    visit(samplePrompt("backfill-librarian"));

    expect(locators.length).toBeGreaterThan(0);
    for (const locator of locators) {
      if (documentedLocatorPattern.test(locator)) continue;
      expect(formatLocator(parseLocator(locator))).toBe(locator);
    }
  });

  test("registers every declared context loader kind", () => {
    const catalog = createMeleeLoaderCatalog();

    for (const entry of meleeKernelAgentCatalog) {
      for (const kind of entry.contextLoaderKinds) {
        expect(catalog.has(kind)).toBeTrue();
      }
    }
  });

  test("registers the worker summarizer context loader kind", () => {
    expect(createMeleeLoaderCatalog().has("worker-summarizer-context")).toBeTrue();
  });

  test("registers the draft librarian context loader kinds", () => {
    const catalog = createMeleeLoaderCatalog();

    expect(catalog.has("librarian-v2-context")).toBeTrue();
    expect(catalog.has("backfill-librarian-context")).toBeTrue();
  });

  test("covers every registered backend agent exactly once", () => {
    const registeredIds = Object.keys(agentRegistry) as KernelAgentId[];

    expect(() => assertMeleeKernelCatalogComplete()).not.toThrow();
    expect(KERNEL_AGENT_IDS).toHaveLength(4);
    expect(meleeKernelAgentCatalog).toHaveLength(4);
    expect([...KERNEL_AGENT_IDS].sort()).toEqual(registeredIds.sort());
    expect(new Set(meleeKernelAgentCatalog.map((entry) => entry.id)).size).toBe(meleeKernelAgentCatalog.length);
  });

  test("keeps default tool allowlists aligned with existing tool profiles", () => {
    for (const entry of meleeKernelAgentCatalog) {
      expect(entry.promptPaths.systemTemplatePath.endsWith("/agent.ts")).toBeTrue();
      expect(entry.promptPaths.promptModulePath.endsWith("/prompt.ts")).toBeTrue();
      expect(entry.promptPaths.contextModulePath.endsWith("/context.ts")).toBeTrue();
      if (entry.promptPaths.toolsModulePath) {
        expect(entry.promptPaths.toolsModulePath.endsWith("/tools.ts")).toBeTrue();
      }
      expect(entry.tools).toEqual(resolveAgentToolIds(entry.role));
      expect(entry.toolProfile).toBe(entry.role);
    }

    expect(meleeKernelAgent("worker").tools).toEqual([...defaultWorkerToolProfile]);
    expect(defaultWorkerToolProfile).toContain("ledger_search");
    expect(
      agentToolProfileSummary("worker").map((tool) => tool.id),
    ).toContain("ledger_search");
    expect(defaultLibrarianToolProfile).toEqual([
      "code_graph_search",
      "graph_related_functions",
      "kv2_discord_search",
      "kv2_wiki_search",
      "kv2_pr_search",
      "kv2_attempt_search",
      "kv2_subject_record",
      "kv2_entity_lookup",
      "kv2_resolve_locator",
      "kv2_unit_context",
    ]);
    expect(meleeKernelAgent("worker-summarizer").tools).toEqual([]);
    expect(meleeKernelAgent("librarian-v2").tools).toEqual([...defaultLibrarianToolProfile]);
    expect(meleeKernelAgent("backfill-librarian").tools).toEqual([...defaultLibrarianToolProfile]);
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
      if (entry.promptPaths.toolsModulePath) {
        expect(existsSync(resolve(repoRoot, entry.promptPaths.toolsModulePath))).toBeTrue();
      }
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
      const renderedInputs = renderKernelContextInputsPreview(bundle.kernelContext?.inputs ?? []);
      expect(viewerDefinition.context?.renderedContext).toBe(
        renderedInputs || (bundle.kernelContext?.renderedContext ?? bundle.userPrompt),
      );
    }
  });

  test("renders viewer context inputs with the runtime envelope", () => {
    expect(renderKernelContextInputsPreview([
      { loaderKind: "worker packet", inputRef: "packet-7", content: "first" },
      { loaderKind: "ignored", content: "  \n" },
      { loaderKind: "standard-examples", content: "second" },
    ])).toBe([
      '<worker_packet ref="packet-7">\nfirst\n</worker_packet>',
      '<standard-examples ref="standard-examples">\nsecond\n</standard-examples>',
    ].join("\n\n"));
  });

  test("falls back when viewer context inputs do not render", () => {
    const entry = meleeKernelAgent("worker");
    const bundle = samplePrompt("worker");
    const emptyInputs = toKernelAgentViewerDefinition(entry, {
      ...bundle,
      kernelContext: { inputs: [], renderedContext: "legacy rendered context" },
    });
    const blankInput = toKernelAgentViewerDefinition(entry, {
      ...bundle,
      userPrompt: "fallback user prompt",
      kernelContext: {
        inputs: [{ loaderKind: "worker-packet", content: "  \n" }],
      },
    });

    expect(emptyInputs.context?.renderedContext).toBe("legacy rendered context");
    expect(blankInput.context?.renderedContext).toBe("fallback user prompt");
  });

  test("renders dashboard worker sample with validation handoff language and hypothesis context", () => {
    const payload = loadKernelAgentsPayload({
      game: null,
      repoRoot: sampleRepoRoot,
      stateDir: sampleStateDir,
      graphDbPath: resolve(sampleStateDir, "knowledge.sqlite"),
    });
    const worker = payload.agents.find((agent) => agent.name === "worker");
    const rendered = `${worker?.renderedPrompt?.content ?? ""}\n${worker?.context?.renderedContext ?? ""}`;

    const workerSummarizer = payload.agents.find((agent) => agent.name === "worker-summarizer");
    const summarizerRendered = `${workerSummarizer?.renderedPrompt?.content ?? ""}\n${workerSummarizer?.context?.renderedContext ?? ""}`;

    const librarianV2 = payload.agents.find((agent) => agent.name === "librarian-v2");
    const librarianV2Rendered = `${librarianV2?.renderedPrompt?.content ?? ""}\n${librarianV2?.context?.renderedContext ?? ""}`;
    const backfillLibrarian = payload.agents.find((agent) => agent.name === "backfill-librarian");
    const backfillRendered = `${backfillLibrarian?.renderedPrompt?.content ?? ""}\n${backfillLibrarian?.context?.renderedContext ?? ""}`;

    expect(payload.agents).toHaveLength(4);
    expect(payload.warnings).toEqual([]);
    expect(worker?.renderedTools).toContain("<available_tools>");
    expect(worker?.renderedTools).toContain('tool name="asm_window_search"');
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
    expect(workerSummarizer?.tools).toEqual([]);
    expect(workerSummarizer?.renderedTools).toBeNull();
    expect(summarizerRendered).toContain("narrative fields only");
    expect(summarizerRendered).toContain("<worker_transcript>");
    expect(summarizerRendered).toContain("<checkpoint_submission_digest>");
    expect(summarizerRendered).toContain("<target_reference>");
    expect(summarizerRendered).not.toMatch(unresolvedPlaceholderPattern);
    expect(librarianV2?.tools).toEqual([...defaultLibrarianToolProfile]);
    expect(librarianV2Rendered).toContain("<touched_subjects>");
    expect(librarianV2Rendered).toContain("<supporting_subjects>");
    expect(librarianV2Rendered).toContain("<output_contract>");
    expect(librarianV2Rendered).toContain("librarian_pass_v1");
    expect(librarianV2Rendered).toContain(
      "In a pr_imported pass every fact and link cites at least one discussion comment of the triggering PR that references its subject",
    );
    expect(librarianV2Rendered).not.toMatch(unresolvedPlaceholderPattern);
    expect(backfillLibrarian?.tools).toEqual([...defaultLibrarianToolProfile]);
    expect(backfillRendered).toContain("<fill_out_subjects>");
    expect(backfillRendered).toContain("<supporting_subjects>");
    expect(backfillRendered).toContain("<output_contract>");
    expect(backfillRendered).toContain("librarian_pass_v1");
    expect(backfillRendered).not.toMatch(unresolvedPlaceholderPattern);
  });

  test("renders the backfill librarian stub when pass context is unavailable", () => {
    const payload = loadKernelAgentsPayload({
      game: null,
      repoRoot: sampleRepoRoot,
      stateDir: sampleStateDir,
      graphDbPath: resolve(sampleStateDir, "knowledge.sqlite"),
    }, {
      loadBackfillPassContext: () => null,
    });
    const backfillLibrarian = payload.agents.find((agent) => agent.name === "backfill-librarian");
    const rendered = `${backfillLibrarian?.renderedPrompt?.content ?? ""}\n${backfillLibrarian?.context?.renderedContext ?? ""}`;

    expect(backfillLibrarian).toBeDefined();
    expect(rendered).toContain("GALE01:ftDemo_KernelViewerSample");
    expect(rendered).not.toMatch(unresolvedPlaceholderPattern);
  });

});
