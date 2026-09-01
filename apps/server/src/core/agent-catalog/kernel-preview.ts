import { resolve } from "node:path";
import { WORKER_CANONICAL_TOOL_PATHS, workerPrompt } from "@server/core/agent-catalog";
import {
  KERNEL_AGENT_IDS,
  meleeKernelAgent,
  toKernelAgentViewerDefinition,
  type KernelAgentId,
  type KernelAgentViewerDefinition,
} from "@server/core/agent-catalog/kernel-catalog";
import type { ResolvedGame } from "@server/core/game-registry";
import type { PiPromptBundle, RunGameMetadata } from "@server/core/shared/types";
import { availableToolsPromptXml, type AgentToolRuntimeContext } from "@server/core/tools";
import { workerSummarizerPrompt } from "@server/core/agent-catalog/agents/knowledge/worker-summarizer/index.js";
import { librarianV2Prompt } from "@server/core/agent-catalog/agents/knowledge/librarian-v2/index.js";
import { backfillLibrarianPrompt } from "@server/core/agent-catalog/agents/knowledge/backfill-librarian/index.js";

export interface KernelAgentCatalogContext {
  game: ResolvedGame | null;
  repoRoot: string;
  stateDir: string;
  graphDbPath: string;
}

export interface KernelAgentsPayload {
  generatedAt: string;
  source: "sample";
  agents: KernelAgentViewerDefinition[];
  warnings: string[];
}

function gameMetadata(paths: KernelAgentCatalogContext): RunGameMetadata | undefined {
  if (!paths.game) return undefined;
  return {
    gameId: paths.game.gameId,
    gameKind: paths.game.kind,
    repoRoot: paths.repoRoot,
    stateDir: paths.stateDir,
    graphDbPath: paths.graphDbPath,
    descriptorPath: paths.game.descriptorPath,
    localOverridePath: paths.game.localOverridePath,
  };
}

function renderedTools(
  entry: ReturnType<typeof meleeKernelAgent>,
  paths: KernelAgentCatalogContext,
): string | null {
  if (entry.tools.length === 0) return null;
  const context: AgentToolRuntimeContext = {
    role: entry.toolProfile,
    cwd: paths.repoRoot,
    repoRoot: paths.repoRoot,
    stateDir: paths.stateDir,
    game: gameMetadata(paths),
  };
  return availableToolsPromptXml(context, { replace: entry.tools });
}

function samplePrompt(agentId: KernelAgentId, paths: KernelAgentCatalogContext): PiPromptBundle {
  const game = gameMetadata(paths);
  switch (agentId) {
    case "worker":
      return workerPrompt({
        packet: {
          target: {
            unit: "GALE01:kernel-viewer",
            symbol: "ftDemo_KernelViewerSample",
            source_path: "src/melee/ft/chara/ftDemo.c",
          },
          baseline: {
            fuzzy_match_percent: 91.25,
          },
          knowledge_context: {
            graph_db: paths.graphDbPath,
            status: "ready",
            file_card: {
              source_path: "src/melee/ft/chara/ftDemo.c",
              functions: [
                {
                  symbol: "ftDemo_KernelViewerSample",
                  unit: "GALE01:kernel-viewer",
                  fuzzy: 91.25,
                },
                {
                  symbol: "ftDemo_KernelViewerSolvedNeighbor",
                  unit: "GALE01:kernel-viewer",
                  fuzzy: 100,
                  status: "matched",
                },
              ],
              mismatch_patterns: [
                {
                  id: "kernel-viewer:first-mismatch",
                  title: "First mismatch suggests helper-selection or control-flow shape.",
                  category: "source_shape",
                  symptoms: ["Branch shape diverges after a nearby helper call."],
                  tactics: ["Compare solved sibling action helpers before trying deeper probes."],
                  evidence_count: 1,
                  linked_evidence_refs: ["kernel-viewer:sample"],
                },
              ],
              pr_history: {
                tactics: [
                  {
                    title: "Use solved sibling character action helpers as first-pass source-shape references.",
                    evidence_refs: ["kernel-viewer:sample"],
                  },
                ],
              },
              tool_hits: [
                {
                  tool_id: "opseq",
                  source_id: "opseq_similarity",
                  symbol: "ftDemo_KernelViewerSample",
                  unit: "GALE01:kernel-viewer",
                  analog_symbol: "ftDemo_KernelViewerSolvedNeighbor",
                  analog_unit: "GALE01:kernel-viewer",
                  analog_source_path: "src/melee/ft/chara/ftDemo.c",
                  score: 0.97,
                  exact_match: true,
                  matched: true,
                  evidence_ref: "kernel-viewer:opseq-sample",
                },
              ],
            },
          },
        },
        repoRoot: paths.repoRoot,
        stateDir: paths.stateDir,
        game,
        initialBoardPath: resolve(paths.stateDir, "runs/kernel-viewer/snapshots/initial_board.json"),
        workerLogDir: resolve(paths.stateDir, "runs/kernel-viewer/worker_logs/sample"),
        existingCanonicalToolPaths: new Set(
          WORKER_CANONICAL_TOOL_PATHS.map((tool) => tool.relativePath),
        ),
        targetSourceText: [
          "void ftDemo_KernelViewerSample(void)",
          "{",
          "    /* Dashboard preview of sandbox-prefetched target source. */",
          "}",
          "",
        ].join("\n"),
      });
    case "worker-summarizer":
      return workerSummarizerPrompt({
        targetCardReference: {
          target_key: "src/melee/ft/chara/ftDemo.c:ftDemo_KernelViewerSample",
          symbol: "ftDemo_KernelViewerSample",
          source_path: "src/melee/ft/chara/ftDemo.c",
        },
        checkpointSubmissionDigest: {
          checkpoints: [
            {
              submission_count: 1,
              result: "improved but inexact",
              changed_area: "guard order and loop-carried load placement",
            },
          ],
          submissions: [
            {
              result: "improved but inexact",
              validation_summary: "The mismatch narrowed after the load moved before the loop.",
            },
          ],
        },
        transcript: [
          {
            role: "assistant",
            content: "The remaining mismatch may come from branch order. I reordered the guard, then moved the damage-vector load above the loop before submitting.",
          },
        ],
        repoRoot: paths.repoRoot,
        stateDir: paths.stateDir,
        game,
      });
    case "librarian-v2":
      return librarianV2Prompt({
        task: {
          pathway: "run_closed",
          payload: { worker_run_id: "kernel-viewer-run-1" },
        },
        object: {
          run: { id: "kernel-viewer-run-1", target_stable_key: "GALE01:ftDemo_KernelViewerSample" },
          submissions: [{ seq: 1, hypothesis: "Guard order controls the branch shape." }],
          proposal: { purpose: "Updates the demo fighter state after the guard passes." },
        },
        subjectRecords: {
          subjects: [{ target_stable_key: "GALE01:ftDemo_KernelViewerSample", facts: [], links: [], evidence: [] }],
        },
        searchResults: {
          attempts: [{
            locator: "attempt://run/kernel-viewer-run-1/submission/1",
            stable_key: "GALE01:ftDemo_KernelViewerSample",
            final_outcome: "improvement",
            description_snippet: "Reordered the guard branches.",
          }],
          discord: [{
            locator: "discord://message/1234567890",
            author: "sample-contributor",
            snippet: "The guard order controls the branch shape.",
          }],
        },
        repoRoot: paths.repoRoot,
        stateDir: paths.stateDir,
        game,
      });
    case "backfill-librarian":
      return backfillLibrarianPrompt({
        task: { mode: "fill_out_pass", reason: "dashboard preview" },
        fillOutSubjects: [
          {
            order: 1,
            kind: "entity",
            entity_kind: "translation_unit",
            entity_locator: "src/melee/ft/chara/ftDemo.c",
            record: { facts: {}, links: [] },
            material: { members: [{ stable_key: "GALE01:ftDemo_KernelViewerSample", named: true }], total_pr_count: 2 },
          },
          {
            order: 2,
            kind: "target",
            target_stable_key: "GALE01:ftDemo_KernelViewerSample",
            detail: { symbol: "ftDemo_KernelViewerSample", match_pct: 100, linked: true },
            ledger: [{ type: "submission", seq: 1, score: 100 }],
            record: { facts: { purpose: { value: "Updates demo fighter state.", confidence: 0.55 } }, links: [] },
          },
        ],
        supportingSubjects: [],
        decompStandards: { standards: [{ id: "std-sample", rule: "Match the original file layout." }] },
        repoRoot: paths.repoRoot,
        stateDir: paths.stateDir,
        game,
      });
  }
}

export function loadKernelAgentsPayload(paths: KernelAgentCatalogContext): KernelAgentsPayload {
  const generatedAt = new Date().toISOString();
  const warnings: string[] = [];
  const agents = KERNEL_AGENT_IDS.map((agentId) => {
    const entry = meleeKernelAgent(agentId);
    try {
      return toKernelAgentViewerDefinition(entry, samplePrompt(agentId, paths), {
        generatedAt,
        renderedTools: renderedTools(entry, paths),
      });
    } catch (error) {
      warnings.push(
        `Unable to render ${agentId} sample prompt: ${error instanceof Error ? error.message : String(error)}`,
      );
      return toKernelAgentViewerDefinition(entry, undefined, {
        generatedAt,
        warnings: ["Sample prompt render failed; catalog metadata is still available."],
        renderedTools: renderedTools(entry, paths),
      });
    }
  });

  return {
    generatedAt,
    source: "sample",
    agents,
    warnings,
  };
}
