import { resolve } from "node:path";
import {
  librarianPrompt,
  WORKER_CANONICAL_TOOL_PATHS,
  workerPrompt,
} from "@server/core/agent-catalog";
import {
  KERNEL_AGENT_IDS,
  meleeKernelAgent,
  toKernelAgentViewerDefinition,
  type KernelAgentId,
  type KernelAgentViewerDefinition,
} from "@server/core/agent-catalog/kernel-catalog";
import type { ResolvedGame } from "@server/core/game-registry";
import type { PiPromptBundle, RunGameMetadata } from "@server/core/shared/types";
import { workerSummarizerPrompt } from "@server/core/agent-catalog/agents/knowledge/worker-summarizer/index.js";

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
    case "librarian":
      return librarianPrompt({
        librarianBatch: {
          batch_id: "kernel-viewer-librarian-batch",
          kind: "worker_run",
          worker_state: {
            id: "kernel-viewer-worker-state",
            target_key: "src/melee/ft/chara/ftKirby/ftkirbyspecialhi.c:ftKb_SpecialHi_Enter",
            baseline_score: 62.5,
            best_score: 87.5,
            exact: false,
          },
          checkpoints: [
            {
              kind: "checkpoint",
              id: "kernel-viewer-checkpoint-1",
              attempt_index: 1,
              new_score: 87.5,
              delta: 25.0,
              exact_match: false,
              improved_over_baseline: true,
              validation_time: "2026-08-10T00:00:00Z",
            },
          ],
          transcripts: [],
        },
        repoRoot: paths.repoRoot,
        stateDir: paths.stateDir,
        game,
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
      });
    } catch (error) {
      warnings.push(
        `Unable to render ${agentId} sample prompt: ${error instanceof Error ? error.message : String(error)}`,
      );
      return toKernelAgentViewerDefinition(entry, undefined, {
        generatedAt,
        warnings: ["Sample prompt render failed; catalog metadata is still available."],
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
