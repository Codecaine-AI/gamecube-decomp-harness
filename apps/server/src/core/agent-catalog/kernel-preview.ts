import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { Database } from "bun:sqlite";
import { workerPrompt } from "@server/core/agent-catalog";
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
import { globalStandardsContext } from "@server/core/knowledge";
import { gameKnowledgeRoot } from "@server/core/knowledge/paths.js";
import { buildPassContext, type BackfillPassContext } from "@server/core/knowledge-v2/backfill/context.js";
import { librarianStandardsView } from "@server/core/knowledge-v2/backfill/runner.js";
import { prioritizeTargets } from "@server/core/knowledge-v2/migration/prioritize.js";
import { openKnowledgeStore, type KnowledgeStore } from "@server/core/knowledge-v2/storage/store.js";
import { loadV2TargetCard, type V2TargetCard } from "@server/core/knowledge-v2/card.js";
import { buildWorkerKnowledgeContext } from "@server/core/cycle-runtime/phases/running/workers/worker-cycle.js";
import { gameRoot } from "@server/core/knowledge/paths.js";
import type { DriftReport } from "@server/core/knowledge-v2/drift/flagger.js";

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

type BackfillPreviewContext = Pick<BackfillPassContext, "fillOut" | "supporting">;

export interface KernelPreviewDeps {
  target?: KernelPreviewTarget;
  loadBackfillPassContext?: (paths: KernelAgentCatalogContext) => BackfillPreviewContext | null;
  loadTargetCard?: (target: KernelPreviewTarget, gameId?: string) => V2TargetCard | null;
  buildWorkerKnowledgeContext?: typeof buildWorkerKnowledgeContext;
  loadFirstDiff?: (target: KernelPreviewTarget) => Record<string, unknown>;
}

export interface KernelPreviewTarget {
  unit: string;
  symbol: string;
}

export type KernelPreviewOptions = Pick<KernelPreviewDeps, "target">;

const DEFAULT_WORKER_PREVIEW_TARGET: KernelPreviewTarget = {
  unit: "main/melee/mn/mnvibration",
  symbol: "mnVibration_HandleInput",
};

interface LegacyTargetLocation {
  sourcePath: string;
  fuzzyMatchPercent: number | null;
}

function legacyTargetLocation(graphDbPath: string, target: KernelPreviewTarget): LegacyTargetLocation | null {
  if (!existsSync(graphDbPath)) return null;
  let db: Database | null = null;
  try {
    db = new Database(graphDbPath, { readonly: true });
    const rows = db.query<{ payload_json: string }, [string, string]>(
      "SELECT payload_json FROM graph_entities WHERE stable_key IN (?, ?) ORDER BY CASE entity_type WHEN 'object_unit' THEN 0 ELSE 1 END",
    ).all(target.unit, `${target.unit}:${target.symbol}`);
    let sourcePath = "";
    let fuzzyMatchPercent: number | null = null;
    for (const row of rows) {
      const payload = JSON.parse(row.payload_json) as Record<string, unknown>;
      sourcePath ||= typeof payload.source_path === "string"
        ? payload.source_path
        : typeof payload.sourcePath === "string" ? payload.sourcePath : "";
      if (fuzzyMatchPercent === null && Number.isFinite(Number(payload.fuzzy))) {
        fuzzyMatchPercent = Number(payload.fuzzy);
      }
    }
    return sourcePath ? { sourcePath, fuzzyMatchPercent } : null;
  } catch {
    return null;
  } finally {
    db?.close();
  }
}

function previewFirstDiff(target: KernelPreviewTarget): Record<string, unknown> {
  const runsRoot = resolve(gameRoot("melee"), "state", "runs");
  const candidates = existsSync(runsRoot)
    ? [...new Bun.Glob("*/worker_state/*/runner_validation/pre_worker_first_diff.json").scanSync({
        cwd: runsRoot,
        absolute: true,
        onlyFiles: true,
      })]
    : [];
  candidates.sort((left, right) => statSync(right).mtimeMs - statSync(left).mtimeMs);
  for (const path of candidates) {
    try {
      const artifact = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
      const artifactSymbol = typeof artifact.symbol === "string" ? artifact.symbol : "";
      const artifactUnit = typeof artifact.unit === "string" ? artifact.unit : "";
      const artifactMatches = artifactSymbol === target.symbol
        && (!artifactUnit || artifactUnit === target.unit);
      const snapshotPath = resolve(path, "..", "pre_worker_unit_snapshot.json");
      let snapshotMatches = false;
      if (existsSync(snapshotPath)) {
        const snapshot = JSON.parse(readFileSync(snapshotPath, "utf8")) as Record<string, unknown>;
        const snapshotSymbol = typeof snapshot.symbol === "string" ? snapshot.symbol : "";
        const snapshotUnit = typeof snapshot.unit === "string" ? snapshot.unit : "";
        snapshotMatches = snapshotSymbol === target.symbol
          && (!snapshotUnit || snapshotUnit === target.unit);
      }
      if (artifactMatches || snapshotMatches) return artifact;
    } catch {
      // Ignore incomplete historical artifacts and continue to the next newest candidate.
    }
  }
  return { status: "unavailable", reason: "preview: no claim-time diff artifact for this target" };
}

function realWorkerPrompt(
  paths: KernelAgentCatalogContext,
  deps: KernelPreviewDeps,
  target: KernelPreviewTarget,
): PiPromptBundle | null {
  const game = gameMetadata(paths);
  const cardLoader = deps.loadTargetCard ?? (game
    ? ((selected: KernelPreviewTarget, gameId?: string) => loadV2TargetCard({
        gameId,
        unit: selected.unit,
        symbol: selected.symbol,
        budget: "full",
      }))
    : () => null);
  const card = cardLoader(target, game?.gameId);
  const legacy = card ? null : legacyTargetLocation(paths.graphDbPath, target);
  const sourcePath = card?.target.source_path ?? legacy?.sourcePath ?? "";
  const checkoutPath = sourcePath ? resolve(gameRoot("melee"), "checkout", sourcePath) : "";
  if (!card && (!checkoutPath || !existsSync(checkoutPath))) return null;

  const knowledgeContext = (deps.buildWorkerKnowledgeContext ?? buildWorkerKnowledgeContext)(
    sourcePath,
    paths.graphDbPath,
    { unit: target.unit, symbol: target.symbol, gameId: game?.gameId },
  );
  return workerPrompt({
    packet: {
      target: {
        unit: target.unit,
        symbol: target.symbol,
        source_path: sourcePath,
        fuzzy_match_percent: card?.status?.match_pct ?? legacy?.fuzzyMatchPercent ?? 0,
      },
      baseline: {
        fuzzy_match_percent: card?.status?.match_pct ?? legacy?.fuzzyMatchPercent ?? 0,
      },
      first_diff: (deps.loadFirstDiff ?? previewFirstDiff)(target),
      knowledge_context: knowledgeContext,
    },
    repoRoot: paths.repoRoot,
    stateDir: paths.stateDir,
    game,
    initialBoardPath: resolve(paths.stateDir, "runs/kernel-viewer/snapshots/initial_board.json"),
    workerLogDir: resolve(paths.stateDir, "runs/kernel-viewer/worker_logs/preview"),
    targetSourceText: checkoutPath && existsSync(checkoutPath)
      ? readFileSync(checkoutPath, "utf8")
      : `/* preview: source unavailable for ${sourcePath || `${target.unit}:${target.symbol}`} */\n`,
  });
}

function loadRealBackfillPassContext(paths: KernelAgentCatalogContext): BackfillPreviewContext | null {
  let store: KnowledgeStore | undefined;
  try {
    if (!paths.game) return null;
    const gameId = paths.game.gameId;
    const sqlitePath = resolve(gameKnowledgeRoot(gameId), "knowledge.sqlite");
    if (!existsSync(sqlitePath)) return null;

    // Opening runs migrations; for an up-to-date existing store that pass is a no-op.
    store = openKnowledgeStore({ gameId });
    const rows = prioritizeTargets(store).rows;
    const row = rows.find(
      (candidate) => candidate.stable_key.startsWith("main/melee/") && candidate.attempts_runs > 0,
    ) ?? rows[0];
    if (!row) return null;
    const context = buildPassContext(store, row);
    return { fillOut: context.fillOut, supporting: context.supporting };
  } catch {
    return null;
  } finally {
    store?.close();
  }
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

function samplePrompt(
  agentId: KernelAgentId,
  paths: KernelAgentCatalogContext,
  deps: KernelPreviewDeps,
): PiPromptBundle {
  const game = gameMetadata(paths);
  switch (agentId) {
    case "worker":
      {
        const real = realWorkerPrompt(paths, deps, deps.target ?? DEFAULT_WORKER_PREVIEW_TARGET);
        if (real) return real;
      }
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
          first_diff: {
            status: "available",
            score: 91.25,
            rows: [
              {
                side: "left",
                address: "8272",
                kind: "DIFF_ARG_MISMATCH",
                text: "lfs f3, lbl_804DA824@sda21",
              },
            ],
            row_counts_by_kind: { DIFF_ARG_MISMATCH: 1 },
            truncated: false,
          },
          knowledge_context: {
            graph_db: paths.graphDbPath,
            status: "ready",
            related_functions: {
              callers: [
                { symbol: "ftDemo_CallKernelViewerSample", unit: "GALE01:kernel-viewer", matched: true },
              ],
              callees: [
                { symbol: "ftDemo_Helper", unit: "GALE01:kernel-viewer", matched: true },
              ],
              analogs: [
                {
                  symbol: "ftDemo_KernelViewerSolvedNeighbor",
                  unit: "GALE01:kernel-viewer",
                  fuzzy_match_percent: 100,
                  score: 0.97,
                  exact_match: true,
                },
              ],
            },
            knowledge_card_v2: {
              stable_key: "GALE01:kernel-viewer:ftDemo_KernelViewerSample",
              target: {
                kind: "function",
                unit: "GALE01:kernel-viewer",
                symbol: "ftDemo_KernelViewerSample",
                source_path: "src/melee/ft/chara/ftDemo.c",
                identity_status: "current",
              },
              context_budget: "full",
              ledger: { runs: [], entries: [] },
              status: { match_pct: 91.25, linked: true, size: null },
              facts: {
                naming_note: "Use the target symbol as the canonical source name.",
                by_type: {},
              },
              links: [],
              prior_runs: [],
              accepted_prs: [],
            },
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
        targetSourceText: [
          "void ftDemo_KernelViewerSample(void)",
          "{",
          "    /* Dashboard preview of sandbox-prefetched target source. */",
          "}",
          "",
        ].join("\n"),
      });
    case "worker-summarizer": {
      const workerRunId = "run:31f060aa-de8d-49cc-adf0-601e8735dd4e";
      const workerStateId = "31f060aa-de8d-49cc-adf0-601e8735dd4e";
      const targetId = "target:function:main/melee/ft/chara/ftCommon/ftCo_Guard:ftCo_GuardReflect_Anim";
      const stableKey = "main/melee/ft/chara/ftCommon/ftCo_Guard:ftCo_GuardReflect_Anim";
      const checkpoint = (attemptIndex: number, validationTime: string, newScore: number, exact: 0 | 1) => ({
        kind: "checkpoint",
        id: `checkpoint-${attemptIndex}-${workerStateId.slice(0, 8)}`,
        worker_state_id: workerStateId,
        attempt_index: attemptIndex,
        validation_time: validationTime,
        old_score: 80.51613,
        new_score: newScore,
        delta: Number((newScore - 80.51613).toFixed(5)),
        exact_match: exact,
        hard_gates_passed: exact,
        improved_over_baseline: 1,
        selectable: exact,
        selected: exact,
        validation_status: exact === 1 ? "passed" : "failed",
        failure_reasons_json: exact === 1
          ? "[]"
          : JSON.stringify([`target ftCo_GuardReflect_Anim improved from 80.51613 to ${newScore} but did not reach exact as claimed; runner records improved progress`]),
        metadata_json: JSON.stringify({ agent_output_path: `${paths.stateDir}/runs/53d5b342/workers/${workerStateId}/attempt-${attemptIndex}` }),
      });
      const transcriptLines = [
        { type: "session", id: "8f5861fc", timestamp: "2026-07-12T00:01:35.565Z", cwd: paths.repoRoot },
        { type: "message", id: "a1", message: { role: "user", content: [{ type: "text", text: `Match ${stableKey}. Baseline 80.51613. Claim exact only when the validator agrees.…[transcript-condenser: truncated 61204 chars]` }] } },
        { type: "message", id: "a2", message: { role: "assistant", content: [
          { type: "thinking", thinking: "The diff shows the callee chain for the guard-reflect helper is inlined in the reference. I should compare the two helper call sites before touching anything." },
          { type: "toolCall", id: "t1", name: "asm_window_search", arguments: { symbol: "ftCo_GuardReflect_Anim", window: 48 } },
        ] } },
        { type: "message", id: "a3", message: { role: "toolResult", toolCallId: "t1", content: [{ type: "text", text: "ftCo_GuardReflect_Anim:\n  stwu r1, -0x20(r1)\n  mflr r0\n  stw r0, 0x24(r1)\n  stw r31, 0x1c(r1)\n  mr r31, r3\n  lwz r3, 0x2c(r3)\n  bl ftCo_800BFFD0\n  lwz r0, 0x1c(r31)…[transcript-condenser: truncated 21447 chars]" }] } },
        { type: "message", id: "a4", message: { role: "assistant", content: [
          { type: "thinking", thinking: "The reference inlines ftCo_GuardReflectHelper into the caller; my version calls it out of line. Inlining the helper should recover the branch shape." },
          { type: "toolCall", id: "t2", name: "source_edit", arguments: { path: "src/melee/ft/chara/ftCommon/ftCo_Guard.c", summary: "mark ftCo_GuardReflectHelper static inline and hoist the reflect check" } },
        ] } },
        { type: "message", id: "a5", message: { role: "toolResult", toolCallId: "t2", content: [{ type: "text", text: "edit applied: 2 hunks…[transcript-condenser: truncated 1180 chars]" }] } },
        { type: "message", id: "a6", message: { role: "assistant", content: [{ type: "text", text: "Inlining the helper reproduced the branch layout; the remaining diff is a single register rotation around the animation-frame compare. Submitting." }] } },
      ];
      return workerSummarizerPrompt({
        targetCardReference: { id: targetId, stable_key: stableKey },
        checkpointSubmissionDigest: {
          run: {
            id: workerRunId,
            target_id: targetId,
            worker_state_id: workerStateId,
            run_id: "53d5b342-c066-48fc-aa49-dd78b69dc2ac",
            goal: `Match ${stableKey} (worker runloop-35365-71-a1122c32, epoch fe8d8bd5-604c-48aa-a1ce-6c3f995662ac)`,
            baseline: JSON.stringify({ score: 80.51613 }),
            final_outcome: "match",
            error_type: null,
            integration: null,
            started_at: "2026-07-12T00:01:35.565Z",
            ended_at: "2026-07-12T00:19:59.710Z",
            closed_at: "2026-07-12T00:19:59.710Z",
            target_stable_key: stableKey,
          },
          submissions: [
            { id: `${workerRunId}:sub:1`, seq: 1, description: "checkpoint 0 scored 84.23387", hypothesis: null, score: 84.23387, submitted_at: "2026-07-12T00:04:23.159Z", runtime_ref: "007fd7e0-12a5-421a-be9e-b0053f8dc3a7" },
            { id: `${workerRunId}:sub:2`, seq: 2, description: "checkpoint 1 scored 99.951614", hypothesis: null, score: 99.951614, submitted_at: "2026-07-12T00:13:16.971Z", runtime_ref: "0d7435ea-8377-4ffa-99d9-58c2a9637ac7" },
            { id: `${workerRunId}:sub:3`, seq: 3, description: "checkpoint 2 scored 100", hypothesis: null, score: 100, submitted_at: "2026-07-12T00:19:41.008Z", runtime_ref: "c4e2a9d1-6b0f-4f3a-9c7e-2d8b1e5f0a64" },
          ],
          checkpoints: [
            checkpoint(0, "2026-07-12T00:04:23.159Z", 84.23387, 0),
            checkpoint(1, "2026-07-12T00:13:16.971Z", 99.951614, 0),
            checkpoint(2, "2026-07-12T00:19:41.008Z", 100, 1),
          ],
        },
        transcript: [
          {
            kind: "transcript_span",
            session_id: "019f1424-f574-716d-8065-c53713ee2cf0",
            path: `${paths.repoRoot}/games/melee/worktrees/cycles/53d5b342/epochs/0071/workers/${workerStateId}/source/.pi-sessions/8f5861fc/worker/2026-07-12T00-01-35-565Z_019f1424-f574-716d-8065-c53713ee2cf0.jsonl`,
            exists: true,
            content: `${transcriptLines.map((line) => JSON.stringify(line)).join("\n")}\n`,
          },
        ],
        repoRoot: paths.repoRoot,
        stateDir: paths.stateDir,
        game,
      });
    }
    case "librarian-v2":
      return librarianV2Prompt({
        task: {
          pathway: "run_closed",
          instruction: "Review the closed run and preserve durable knowledge.",
          payload: { worker_run_id: "kernel-viewer-run-1" },
        },
        object: {
          run: { id: "kernel-viewer-run-1", target_stable_key: "GALE01:ftDemo_KernelViewerSample" },
          submissions: [{ seq: 1, hypothesis: "Guard order controls the branch shape." }],
          proposal: { purpose: "Updates the demo fighter state after the guard passes." },
        },
        touchedSubjects: [
          {
            order: 1,
            kind: "target",
            target_stable_key: "GALE01:ftDemo_Target",
            renamed_from: ["GALE01:fn_800D0F30"],
            record: { facts: {}, links: [] },
            material: { source: { locator: null, reason: "sample" }, analogs: { unavailable: true } },
            drift: {
              subject: { targetId: "target-kernel-viewer-sample" },
              head_revision: "1e28b4203b",
              evidence: [
                {
                  fact_id: "fact-kernel-viewer-purpose",
                  fact_type: "purpose",
                  evidence_id: "evidence-kernel-viewer-drifted",
                  locator: "code://1e28b420/src/melee/ft/chara/ftDemo.c#L12-L40",
                  status: "drifted",
                  head_digest: "sample-head-digest",
                  head_locator: "code://1e28b4203b/src/melee/ft/chara/ftDemo.c#L12-L40",
                },
                {
                  fact_id: "fact-kernel-viewer-data-flow",
                  fact_type: "data_flow",
                  evidence_id: "evidence-kernel-viewer-unresolvable",
                  locator: "code://1e28b420/src/melee/ft/chara/ftDemoOld.c#L8-L16",
                  status: "unresolvable",
                  head_locator: "code://1e28b4203b/src/melee/ft/chara/ftDemoOld.c#L8-L16",
                },
              ],
              drifted_count: 1,
              unresolvable_count: 1,
            } satisfies DriftReport,
          },
        ],
        supportingSubjects: [],
        decompStandards: { standards: [] },
        headRevision: "1e28b4203b",
        repoRoot: paths.repoRoot,
        stateDir: paths.stateDir,
        game,
      });
    case "backfill-librarian": {
      let context: BackfillPreviewContext | null = null;
      try {
        context = (deps.loadBackfillPassContext ?? loadRealBackfillPassContext)(paths);
      } catch {
        context = null;
      }
      return backfillLibrarianPrompt({
        task: { mode: "fill_out_pass", reason: "dashboard preview" },
        fillOutSubjects: context?.fillOut ?? [
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
        supportingSubjects: context?.supporting ?? [],
        decompStandards: librarianStandardsView(globalStandardsContext()),
        repoRoot: paths.repoRoot,
        stateDir: paths.stateDir,
        game,
      });
    }
  }
}

export function loadKernelAgentsPayload(
  paths: KernelAgentCatalogContext,
  deps: KernelPreviewDeps = {},
): KernelAgentsPayload {
  const generatedAt = new Date().toISOString();
  const warnings: string[] = [];
  const agents = KERNEL_AGENT_IDS.map((agentId) => {
    const entry = meleeKernelAgent(agentId);
    try {
      return toKernelAgentViewerDefinition(entry, samplePrompt(agentId, paths, deps), {
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
