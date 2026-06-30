import { resolve } from "node:path";
import {
  integrationResolverPrompt,
  knowledgeCuratorPrompt,
  prFixerPrompt,
  prIndexerPrompt,
  prPreshipReviewPrompt,
  prSplitterPrompt,
  qaRepairPrompt,
  reconcilePrompt,
  workerPrompt,
} from "@server/core/agent-catalog";
import {
  KERNEL_AGENT_IDS,
  meleeKernelAgent,
  toKernelAgentViewerDefinition,
  type KernelAgentId,
  type KernelAgentViewerDefinition,
} from "@server/core/agent-catalog/kernel-catalog";
import type { ResolvedProject } from "@server/core/project-registry";
import type { PiPromptBundle, RunProjectMetadata } from "@server/core/shared/types";

export interface KernelAgentCatalogContext {
  project: ResolvedProject | null;
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

function projectMetadata(paths: KernelAgentCatalogContext): RunProjectMetadata | undefined {
  if (!paths.project) return undefined;
  return {
    projectId: paths.project.projectId,
    projectKind: paths.project.kind,
    repoRoot: paths.repoRoot,
    stateDir: paths.stateDir,
    graphDbPath: paths.graphDbPath,
    descriptorPath: paths.project.descriptorPath,
    localOverridePath: paths.project.localOverridePath,
  };
}

function samplePrompt(agentId: KernelAgentId, paths: KernelAgentCatalogContext): PiPromptBundle {
  const project = projectMetadata(paths);
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
            },
            path_facts: {
              facts: [
                {
                  id: "kernel-viewer:ft-demo-sibling-style",
                  title: "Solved sibling action code",
                  directory: "src/melee/ft/chara",
                  strength: "sample",
                  summary: "Nearby matched character code is the first reference set before deeper mismatch probes.",
                  evidence_refs: ["kernel-viewer:sample"],
                },
              ],
            },
          },
        },
        repoRoot: paths.repoRoot,
        stateDir: paths.stateDir,
        project,
        initialBoardPath: resolve(paths.stateDir, "runs/kernel-viewer/snapshots/initial_board.json"),
        workerLogDir: resolve(paths.stateDir, "runs/kernel-viewer/worker_logs/sample"),
      });
    case "integration-resolver":
      return integrationResolverPrompt({
        integrationItem: {
          schema_version: "integration_conflict_item_v1",
          id: "kernel-viewer-integration-conflict",
          conflict_group_id: "src-melee-ft-demo",
          run_id: "kernel-viewer-run",
          epoch_id: "kernel-viewer-epoch",
          failed_apply: {
            command: "git apply --check worker.patch",
            stderr: "patch failed: src/melee/ft/chara/ftDemo.c:24",
          },
          worker_outputs: [
            {
              worker_state_id: "kernel-viewer-worker-state",
              checkpoint_id: "kernel-viewer-checkpoint",
              target: "GALE01:ftDemo::ftDemo_KernelViewerSample",
              source_paths: ["src/melee/ft/chara/ftDemo.c"],
              validation: { exact: true, hard_gates_passed: true },
            },
          ],
          conflict_paths: ["src/melee/ft/chara/ftDemo.c"],
          explicit_write_set: ["src/melee/ft/chara/ftDemo.c"],
        },
        queueSummary: { queued_items: 1, conflict_groups: 1 },
        repoRoot: paths.repoRoot,
        stateDir: paths.stateDir,
        project,
      });
    case "pr-indexer":
      return prIndexerPrompt({
        prContext: {
          schema_version: "pr_context_v1",
          object_id: "kernel-viewer-pr",
          pr: { number: 0, title: "Kernel viewer sample PR" },
          changed_files: [{ path: "src/melee/ft/chara/ftDemo.c" }],
          human_text_excerpt: "Match a focused ftDemo target while preserving local style.",
          diff_excerpt: "diff --git a/src/melee/ft/chara/ftDemo.c b/src/melee/ft/chara/ftDemo.c",
        },
        repoRoot: paths.repoRoot,
        stateDir: paths.stateDir,
        project,
      });
    case "pr-reviewer":
      return prPreshipReviewPrompt({
        sliceId: "kernel-viewer-slice",
        sliceDiff: "diff --git a/src/melee/ft/chara/ftDemo.c b/src/melee/ft/chara/ftDemo.c\n+int ftDemo_KernelViewerSample(void) { return 1; }\n",
        lintFindings: { findings: [] },
        exhibits: [],
      });
    case "pr-fixer":
      return prFixerPrompt({
        fixerContext: {
          pr: {
            number: 0,
            branch: "kernel-viewer-pr-fixer",
            title: "Kernel viewer sample PR",
          },
          comments: [
            {
              id: "kernel-viewer-review-comment",
              file: "src/melee/ft/chara/ftDemo.c",
              line: 12,
              body: "Please restore the project assert helper here instead of open-coding this.",
              standard_id: "global_standard:canonical-asserts",
              rule_id: "raw_assert_idiom",
            },
          ],
          findings: [
            {
              source: "pr-reviewer",
              file: "src/melee/ft/chara/ftDemo.c",
              line: 12,
              verdict: "reject",
              suggested_fix: "Use the canonical assert macro from nearby code.",
            },
          ],
          diff_excerpt: "diff --git a/src/melee/ft/chara/ftDemo.c b/src/melee/ft/chara/ftDemo.c",
        },
        repoRoot: paths.repoRoot,
        stateDir: paths.stateDir,
        project,
      });
    case "pr-splitter":
      return prSplitterPrompt({
        splitContext: {
          changed_files: ["src/melee/ft/chara/ftDemo.c"],
          lanes: { match: ["src/melee/ft/chara/ftDemo.c"] },
          max_files_per_pr: 3,
        },
        repoRoot: paths.repoRoot,
        stateDir: paths.stateDir,
        project,
      });
    case "knowledge-curator":
      return knowledgeCuratorPrompt({
        curatorContext: {
          batch_id: "kernel-viewer-curator-batch",
          records: [
            {
              evidence_refs: ["worker:kernel-viewer"],
              lesson: "Prefer local source evidence before broad source-shape rewrites.",
            },
          ],
        },
        repoRoot: paths.repoRoot,
        stateDir: paths.stateDir,
        project,
      });
    case "reconcile":
      return reconcilePrompt({
        mode: "ship-validate",
        reconcileContext: {
          gate: "saved-baseline-regression",
          regression_report: { regressions: [] },
          attempt_budget: 1,
        },
        repoRoot: paths.repoRoot,
        stateDir: paths.stateDir,
        project,
      });
    case "qa-repair":
      return qaRepairPrompt({
        item: {
          id: "kernel-viewer-qa-repair",
          source_path: "src/melee/ft/chara/ftDemo.c",
          lane: "match",
          repair_warnings: false,
          findings: [
            {
              rule_id: "review_lint.kernel_viewer_sample",
              standard_id: "global_standard:sample",
              severity: "error",
              line: 1,
              message: "Sample finding for the integrated kernel Agent Viewer.",
            },
          ],
          warnings: [],
        } as any,
        queueSummary: { total: 1 },
        repoRoot: paths.repoRoot,
        stateDir: paths.stateDir,
        project,
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
