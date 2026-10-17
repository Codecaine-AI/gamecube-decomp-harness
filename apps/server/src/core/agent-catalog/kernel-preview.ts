import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { Database } from "bun:sqlite";
import { workerPrompt } from "@server/core/agent-catalog";
import { workerSystemPromptDocument } from "@server/core/agent-catalog/agents/running/worker/prompt.js";
import { workerPromptToolIds } from "@server/core/agent-catalog/agents/running/worker/context.js";
import {
  previousAttemptFromBackfill,
  previousAttemptFromUnverified,
  steeringReportLocator,
  type PreviousAttemptVariant,
} from "@server/core/agent-catalog/agents/running/worker/previous-attempt.js";
import type { ReviewRuling } from "@server/core/knowledge-v2/steering-lessons/seed.js";
import {
  KERNEL_AGENT_IDS,
  meleeKernelAgent,
  toKernelAgentViewerDefinition,
  type KernelAgentId,
  type KernelAgentViewerDefinition,
} from "@server/core/agent-catalog/kernel-catalog";
import type { ResolvedGame } from "@server/core/game-registry";
import type { OrderingMode, StackFramePolicy, SteeringGateMode } from "@server/core/game-registry/resolver.js";
import { gameOrdering, orderingActive } from "@server/core/tools/ordering.js";
import {
  ADVISORY_ADJUDICATION_ENV,
  DEFAULT_ADVISORY_ADJUDICATION_MODE,
  parseAdvisoryAdjudicationMode,
  type AdvisoryAdjudicationMode,
} from "@server/core/game-registry/runtime-options.js";
import type { PiPromptBundle, RunGameMetadata } from "@server/core/shared/types";
import { availableToolsPromptXml, type AgentToolRuntimeContext } from "@server/core/tools";
import { workerSummarizerPrompt } from "@server/core/agent-catalog/agents/knowledge/worker-summarizer/index.js";
import { librarianV2Prompt } from "@server/core/agent-catalog/agents/knowledge/librarian-v2/index.js";
import { backfillLibrarianPrompt } from "@server/core/agent-catalog/agents/knowledge/backfill-librarian/index.js";
import { globalStandardsContext } from "@server/core/knowledge";
import { gameKnowledgeRoot, knowledgeStorePath } from "@server/core/knowledge/paths.js";
import { buildPassContext, type BackfillPassContext } from "@server/core/knowledge-v2/backfill/context.js";
import { librarianStandardsView } from "@server/core/knowledge-v2/backfill/runner.js";
import { prioritizeTargets } from "@server/core/knowledge-v2/migration/prioritize.js";
import { openKnowledgeStore, type KnowledgeStore } from "@server/core/knowledge-v2/storage/store.js";
import { loadV2TargetCard, type V2TargetCard } from "@server/core/knowledge-v2/card.js";
import { buildWorkerKnowledgeContext } from "@server/core/harness-runtime/phases/running/workers/worker-cycle.js";
import { gameRoot } from "@server/core/knowledge/paths.js";
import { resolveKnowledgeCheckout } from "@server/core/knowledge-v2/checkout.js";
import type { DriftReport } from "@server/core/knowledge-v2/drift/flagger.js";

const sampleSourceReading = {
  sourceFiles: [{ path: "src/melee/ft/chara/ftDemo.c", source: "void ftDemo_KernelViewerSample(void) { /* guarded state update */ }", symbol: "ftDemo_KernelViewerSample" }],
  sourceNames: [{
    symbol: "ftDemo_KernelViewerSample", stable_key: "GALE01:kernel-viewer:ftDemo_KernelViewerSample",
    source_path: "src/melee/ft/chara/ftDemo.c", value: "ftDemo_UpdateGuardedState", confidence: 0.72,
    fact_id: "fact-kernel-viewer-name", updated_at: "2026-09-05T00:00:00Z",
  }],
};

/** Which `compiler_delta` the worker sample's `steering_probe` carries: a measured delta, one marked unavailable, or none yet. */
export type CompilerDeltaPreviewVariant = "present" | "unavailable" | "absent";
export const COMPILER_DELTA_PREVIEW_VARIANTS: readonly CompilerDeltaPreviewVariant[] = ["present", "unavailable", "absent"];

export function isCompilerDeltaPreviewVariant(value: unknown): value is CompilerDeltaPreviewVariant {
  return typeof value === "string" && (COMPILER_DELTA_PREVIEW_VARIANTS as readonly string[]).includes(value);
}

export interface KernelAgentCatalogContext {
  game: ResolvedGame | null;
  repoRoot: string;
  stateDir: string;
  graphDbPath: string;
}

export interface KernelAgentsPayload {
  generatedAt: string;
  source: "sample";
  /** The advisory adjudication mode the worker sample was rendered for. */
  advisoryAdjudication: AdvisoryAdjudicationMode;
  /** The game's stack frame policy the worker sample was rendered for. */
  stackFramePolicy: StackFramePolicy;
  /** The game's steering gate mode the worker sample was rendered for. */
  steeringGate: SteeringGateMode;
  /** The game's ordering mode the worker sample was rendered for. */
  ordering: OrderingMode;
  /** The `previous_attempt` variant the worker sample renders (shown only with an active steering gate). */
  previousAttempt: PreviousAttemptVariant;
  /** The `compiler_delta` variant of the worker sample's `steering_probe` (shown only with an active steering gate). */
  compilerDelta: CompilerDeltaPreviewVariant;
  agents: KernelAgentViewerDefinition[];
  warnings: string[];
}

type BackfillPreviewContext = Pick<BackfillPassContext, "fillOut" | "supporting"> & { headRevision?: string; outputCorrection?: { previous_output: string; parse_error: string } };

export interface KernelPreviewDeps {
  target?: KernelPreviewTarget;
  /** Worker prompt mode; defaults to `ORCH_ADVISORY_ADJUDICATION` when set, else the runtime default (`shadow`). */
  advisoryAdjudication?: AdvisoryAdjudicationMode;
  /** Worker stack frame policy; defaults to the selected game's `matching.stackFramePolicy`, else `match_frame`. */
  stackFramePolicy?: StackFramePolicy;
  /** Worker steering gate; defaults to the selected game's `matching.steeringGate`, else `off`. */
  steeringGate?: SteeringGateMode;
  /** Worker ordering mode; defaults to the selected game's `ordering.mode`, else `off`. */
  ordering?: OrderingMode;
  /** Worker `previous_attempt` variant for an active steering gate; defaults to `rollback`. */
  previousAttempt?: PreviousAttemptVariant;
  /** Worker `steering_probe` `compiler_delta` variant for an active steering gate; defaults to `present`. */
  compilerDelta?: CompilerDeltaPreviewVariant;
  loadBackfillPassContext?: (paths: KernelAgentCatalogContext) => BackfillPreviewContext | null;
  loadTargetCard?: (target: KernelPreviewTarget, gameId?: string) => V2TargetCard | null;
  buildWorkerKnowledgeContext?: typeof buildWorkerKnowledgeContext;
  loadFirstDiff?: (target: KernelPreviewTarget) => Record<string, unknown>;
}

export interface KernelPreviewTarget {
  unit: string;
  symbol: string;
}

export type KernelPreviewOptions = Pick<KernelPreviewDeps, "target" | "advisoryAdjudication" | "stackFramePolicy" | "steeringGate" | "ordering" | "previousAttempt" | "compilerDelta">;

/** Shared by the worker prompt bundle and the viewer's prompt document so both show one variant. */
interface WorkerPreviewMode {
  advisoryAdjudication: AdvisoryAdjudicationMode;
  stackFramePolicy: StackFramePolicy;
  steeringGate: SteeringGateMode;
  ordering: OrderingMode;
  previousAttempt: PreviousAttemptVariant;
  compilerDelta: CompilerDeltaPreviewVariant;
}

/** The prompt builders' options; the `previous_attempt` and `compiler_delta` variants only pick the sample packet. */
function promptMode({ previousAttempt: _variant, compilerDelta: _delta, ...mode }: WorkerPreviewMode): Omit<WorkerPreviewMode, "previousAttempt" | "compilerDelta"> {
  return mode;
}

function previewStackFramePolicy(paths: KernelAgentCatalogContext, deps: KernelPreviewDeps): StackFramePolicy {
  return deps.stackFramePolicy ?? paths.game?.matching?.stackFramePolicy ?? "match_frame";
}

function previewSteeringGate(paths: KernelAgentCatalogContext, deps: KernelPreviewDeps): SteeringGateMode {
  return deps.steeringGate ?? paths.game?.matching?.steeringGate ?? "off";
}

function previewOrdering(paths: KernelAgentCatalogContext, deps: KernelPreviewDeps): OrderingMode {
  return deps.ordering ?? gameOrdering(paths.game)?.mode ?? "off";
}

/**
 * The `compiler_delta` the steering-explain job writes into a probe
 * (`mwcc-decision-diff-v1` summary): measured decision changes, or the reason
 * none could be computed; `absent` is a probe read before the job finished.
 */
function sampleCompilerDelta(variant: CompilerDeltaPreviewVariant): Record<string, unknown> | null {
  if (variant === "absent") return null;
  if (variant === "unavailable") return { unavailable: "reconstruction: dependency hash mismatch for include/M3DUtil/MActor.hpp" };
  return {
    version: "GC/1.2.5",
    observation_id: "obs-preview-0001",
    summary_lines: [
      "+1 node: single-use temp `light` (MActor.cpp:212), coalesced neighbour of `this`",
      "`this` degree 28 -> 29; coloured first; r28 -> r31",
      "no inline verdict, CSE temp or frame slot changed",
    ],
    changes: [
      { kind: "node_added", summary: "temp light (MActor.cpp:212)", a: null, b: "light@MActor.cpp:212", match: "by_site" },
      { kind: "degree", summary: "this 28 -> 29", a: 28, b: 29, match: "exact" },
      { kind: "register", summary: "this r28 -> r31", a: "r28", b: "r31", match: "exact" },
    ],
  };
}

/**
 * A steering probe in the shape `steering_check.py decide` returns (contract
 * 2.4), for the previewed target, with the `compiler_delta` variant. Only an
 * active steering gate shows it, the way a claim only carries one when the
 * gate is on.
 */
function sampleSteeringProbe(target: { unit: string; symbol: string }, compilerDelta: CompilerDeltaPreviewVariant = "present"): Record<string, unknown> {
  const delta = sampleCompilerDelta(compilerDelta);
  return {
    function: target.symbol,
    unit: target.unit,
    revision: "fedcba987654",
    match: { base: 96.4, candidate: 100, real_only: 98.1 },
    steering_edits: [{
      file: "src/M3DUtil/MActor.cpp",
      line: 212,
      shapes: ["temp_alias"],
      before: "mLightData->set(mLightIdx, color);",
      after: "J3DLightObj* light = mLightData; light->set(mLightIdx, color);",
      delta: 1.9,
    }],
    unresolved: [],
    // A measured delta leads with candidate construct kinds; the shape hypotheses become the fallback (steering_diagnose.apply_compiler_delta).
    ...(delta && !("unavailable" in delta) ? {
      candidate_basis: "candidate construct kinds for the measured changes, not evidence of the original; facts: doldecomp/sms@4641b450 docs/AGENT_MATCHING_TIPS.md<see>; check: real_code_evidence compiler --query <kind> --path <mwcc>",
      candidate_constructs: [
        { change_kind: "node_added", change: "temp light (MActor.cpp:212)", kinds: ["web split", "CSE birth", "inline pass"] },
        { change_kind: "degree", change: "this 28 -> 29", kinds: ["degree limit", "coalesced neighbour"] },
      ],
      construct_kinds: {
        "degree limit": { why: "a node of degree 29 or more is coloured first (`this` in r31, not r28); one vreg more or less in the original moves it", see: "#the-degree-limit-this-in-r31-instead-of-r28", mwcc: "Coloring.c" },
        "inline pass": { why: "pass 0 expands written calls with no limit; passes 1-3 take callees of at most 10/7/3 statements, and a call in an expanded call's argument is one pass deeper", see: "#the-inline-pass-ladder", mwcc: "CInline.c" },
      },
    } : {}),
    hypotheses: [{
      cause: "missing inline function",
      why: "A single-use temp only moved the load of mLightData; an inline accessor emits the same load order.",
      how_to_check: "real_code_evidence inlines --type MActor --member mLightData",
    }],
    ...(delta && !("unavailable" in delta) ? { hypotheses_basis: "shape table (fallback: guesses from the edit shapes, not measured)" } : {}),
    evidence: {
      map_callees: ["set__11J3DLightObjFiRC8_GXColor"],
      emitted_inlines: [],
      unused: [],
      header_inlines: ["MActor::getLightData"],
      // evidence_search.usage siblings keep their certification (steering_diagnose.py).
      sibling_uses: [{ function: "calcLight__6MActorFv", match_percent: 100, certification: "certified", revision: "fedcba987654" }],
      sibling_hypotheses: [{ function: "setLightType__6MActorFi", match_percent: 100, certification: "unverified", revision: "0123456789ab" }],
      jsystem_hits: [],
    },
    lessons: [{ id: "steering-temp-accessor", steering: "single-use temp before a member call", real_cause: "header inline accessor" }],
    ...(delta ? { compiler_delta: delta } : {}),
  };
}

/**
 * A `previous_attempt` block for the previewed target, built by the claim
 * path's own builders. `rollback`: from a sample `steering_backfill` row, an
 * earlier attempt matched 100% through the probe's steering edit and the
 * backfill rolled it back. `unverified_match`: from a sample
 * `steering_unverified_matches` row, the code reaches 100% but the gate left
 * it unresolved. Only an active steering gate shows it.
 */
function samplePreviousAttempt(target: { unit: string; symbol: string }, variant: PreviousAttemptVariant): Record<string, unknown> | null {
  if (variant === "none") return null;
  if (variant === "unverified_match") return sampleUnverifiedMatch(target) as unknown as Record<string, unknown>;
  return previousAttemptFromBackfill({
    gameId: "preview",
    unit: target.unit,
    symbol: target.symbol,
    analyzedRev: "0123456789abcdef0123456789abcdef01234567",
    functionSourceSha: null,
    verdict: "pass",
    applied: true,
    appliedRev: null,
    recordedAt: "2026-10-15T00:00:00.000Z",
    // SteeringBackfillFunctionReport (validation/jobs/steering-gate.ts).
    report: {
      base_rev: "fedcba9876543210fedcba9876543210fedcba98",
      initial: "steering_located",
      decision: "pass",
      applied: true,
      provisional: false,
      match: { base: 96.4, candidate: 100, real_only: 98.1 },
      final_match: { base: 96.4, candidate: 98.1, real_only: 98.1 },
      removed_edit_groups: [{
        id: "src/M3DUtil/MActor.cpp@4.0",
        file: "src/M3DUtil/MActor.cpp",
        line: 212,
        location: "src/M3DUtil/MActor.cpp:212",
        shapes: ["temp_alias"],
        text: "J3DLightObj* light = mLightData; / light->set(mLightIdx, color);",
        restored: "mLightData->set(mLightIdx, color);",
      }],
      reasons: ["S* without the steering-only retained groups loses the match (labelled steering)"],
      probe: sampleSteeringProbe(target),
      check: "steering-gate/sms/check.json",
      recheck: "steering-gate/sms/recheck.json",
    },
  }, { rulings: [SAMPLE_REVIEW_RULING] }) as Record<string, unknown> | null;
}

function sampleUnverifiedMatch(target: { unit: string; symbol: string }) {
  const unexplained = (line: number, text: string, restored: string) => ({
    id: `src/M3DUtil/MActor.cpp@${line}`,
    file: "src/M3DUtil/MActor.cpp",
    line,
    location: `src/M3DUtil/MActor.cpp:${line}`,
    shapes: ["other"],
    text,
    restored,
    status: "unresolved",
  });
  return previousAttemptFromUnverified({
    unit: target.unit,
    symbol: target.symbol,
    analyzedRev: "0123456789abcdef0123456789abcdef01234567",
    baseRev: "fedcba9876543210fedcba9876543210fedcba98",
    sourcePath: "src/M3DUtil/MActor.cpp",
    recordedAt: "2026-10-15T00:00:00.000Z",
    match: { base: 96.4, candidate: 100, real_only: 97.2 },
    reasons: [
      "incomplete groups: src/M3DUtil/MActor.cpp@4.0",
      "IR changes but no real shape found (other)",
    ],
    // SteeringBackfillFunctionReport (validation/jobs/steering-gate.ts) of an unresolved function.
    report: {
      base_rev: "fedcba9876543210fedcba9876543210fedcba98",
      initial: "unresolved",
      decision: "unresolved",
      applied: false,
      match: { base: 96.4, candidate: 100, real_only: 97.2 },
      // Eight groups: the block lists the first six and counts the rest as omitted.
      unexplained_edit_groups: [
        unexplained(212, "J3DLightObj* light = getLightData(); / light->set(mLightIdx, color);", "mLightData->set(mLightIdx, color);"),
        unexplained(218, "f32 scale = mScale.x;", "f32 scale = getScale().x;"),
        unexplained(224, "if (!(mFlags & 1)) return;", "if ((mFlags & 1) == 0) return;"),
        unexplained(231, "int i = 0; for (; i < mJointNum; i++) {", "for (int i = 0; i < mJointNum; i++) {"),
        unexplained(240, "J3DModel* model = mModel; model->calc();", "mModel->calc();"),
        unexplained(247, "u8 alpha = mAlpha;", "u8 alpha = getAlpha();"),
        unexplained(255, "return (mFlags >> 2) & 1;", "return isHidden();"),
        unexplained(262, "mModel->entry();", "getModel()->entry();"),
      ],
      reasons: ["IR changes but no real shape found (other)"],
      probe: sampleSteeringProbe(target),
    },
  }, {
    fullReportLocator: steeringReportLocator("obs-preview-0001"),
    // An open evidence-review request (migration 017) for a construct an earlier attempt cited.
    openReviews: [SAMPLE_OPEN_REVIEW],
  });
}

const SAMPLE_REVIEW_RULING: ReviewRuling = {
  id: "sms-330-fakematch-steering",
  date: "2026-10-15",
  pr: "330",
  reviewer: "Mrkol",
  quote: "Totally a fakematch",
  rule: "Steering is a probe, never the fix: a single-use temp, an accessor or inline swap, or any same-behaviour rewrite that only moves codegen (often just the stack frame) is a fakematch. Find the real construct or leave the function nonmatching.",
  enforced_by: ["sms_single_use_temp", "steering_gate"],
  examples: [],
};

/**
 * The readiness entry's `unmet` classes as the scheduler attaches them to a
 * deferred target's packet (contract: `packet.not_ready_classes`). Only an
 * active ordering mode shows them, the way only a deferred claim carries them.
 */
const SAMPLE_NOT_READY_CLASSES = [
  { class: "TKoopa", owner_unit: "mario/Enemy/Koopa", kind: "construct" },
  { class: "TKillerManager", owner_unit: "mario/Enemy/killer", kind: "vtable" },
];

/** An open evidence-review request in the packet's row shape (`packetOpenReview`). */
const SAMPLE_OPEN_REVIEW = {
  id: "review-preview-1",
  site_file: "src/M3DUtil/MActor.cpp",
  site_lines: "212-213",
  summary: "getLightData (getLightData__6MActorFv): map-backed weak inline, cited from the link map (map-unit)",
  base_rev: "fedcba9876543210fedcba9876543210fedcba98",
};

function previewSteeringPacket(mode: WorkerPreviewMode, target: { unit: string; symbol: string }): Record<string, unknown> {
  const previousAttempt = mode.steeringGate === "off" ? null : samplePreviousAttempt(target, mode.previousAttempt);
  return {
    ...(mode.steeringGate === "off" ? {} : { steering_probe: sampleSteeringProbe(target, mode.compilerDelta) }),
    ...(previousAttempt ? { previous_attempt: previousAttempt } : {}),
    // No previous_attempt to carry them: the claim attaches pending reviews on their own.
    ...(mode.steeringGate !== "off" && !previousAttempt ? { open_reviews: [SAMPLE_OPEN_REVIEW] } : {}),
    ...(orderingActive(mode.ordering) ? { not_ready_classes: SAMPLE_NOT_READY_CLASSES } : {}),
  };
}

// The server knows no run's `--advisory-adjudication` flag, only the env
// override that wins over it; without one the preview shows what a run gets
// by default (`DEFAULT_ADVISORY_ADJUDICATION_MODE`, shadow).
function previewAdvisoryAdjudication(deps: KernelPreviewDeps): AdvisoryAdjudicationMode {
  if (deps.advisoryAdjudication) return deps.advisoryAdjudication;
  const configured = process.env[ADVISORY_ADJUDICATION_ENV];
  return configured === undefined ? DEFAULT_ADVISORY_ADJUDICATION_MODE : parseAdvisoryAdjudicationMode(configured, ADVISORY_ADJUDICATION_ENV);
}

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
  mode: WorkerPreviewMode,
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
  let checkoutPath = "";
  try {
    const checkout = resolveKnowledgeCheckout({ gameId: game?.gameId ?? "melee", stateDir: paths.stateDir });
    checkoutPath = sourcePath ? resolve(checkout.checkoutRoot, sourcePath) : "";
  } catch { /* Preview remains available when the checkout is absent. */ }
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
      ...previewSteeringPacket(mode, target),
    },
    repoRoot: paths.repoRoot,
    stateDir: paths.stateDir,
    game,
    initialBoardPath: resolve(paths.stateDir, "runs/kernel-viewer/snapshots/initial_board.json"),
    workerLogDir: resolve(paths.stateDir, "runs/kernel-viewer/worker_logs/preview"),
    targetSourceText: checkoutPath && existsSync(checkoutPath)
      ? readFileSync(checkoutPath, "utf8")
      : `/* preview: source unavailable for ${sourcePath || `${target.unit}:${target.symbol}`} */\n`,
    ...promptMode(mode),
  });
}

function loadRealBackfillPassContext(paths: KernelAgentCatalogContext): BackfillPreviewContext | null {
  let store: KnowledgeStore | undefined;
  try {
    if (!paths.game) return null;
    const gameId = paths.game.gameId;
    const sqlitePath = knowledgeStorePath(gameKnowledgeRoot(gameId));
    if (!existsSync(sqlitePath)) return null;

    // Opening runs migrations; for an up-to-date existing store that pass is a no-op.
    store = openKnowledgeStore({ gameId });
    const rows = prioritizeTargets(store).rows;
    const row = rows.find(
      (candidate) => candidate.stable_key.startsWith("main/melee/") && candidate.attempts_runs > 0,
    ) ?? rows[0];
    if (!row) return null;
    const checkout = resolveKnowledgeCheckout({ gameId, stateDir: paths.stateDir });
    const context = buildPassContext(store, row, { checkoutRoot: checkout.checkoutRoot, checkoutRev: checkout.headRevision });
    return { fillOut: context.fillOut, supporting: context.supporting, headRevision: checkout.headRevision };
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

function toolContext(entry: ReturnType<typeof meleeKernelAgent>, paths: KernelAgentCatalogContext): AgentToolRuntimeContext {
  return {
    role: entry.toolProfile,
    cwd: paths.repoRoot,
    repoRoot: paths.repoRoot,
    stateDir: paths.stateDir,
    game: gameMetadata(paths),
  };
}

/**
 * The worker's tool ids for the previewed variant: the static list plus the
 * steering-gate and code-graph tools, computed the way the worker prompt
 * names them, so the viewer's tool list and the prompt agree.
 */
function workerPreviewToolIds(paths: KernelAgentCatalogContext, mode: WorkerPreviewMode): string[] {
  return workerPromptToolIds({ game: gameMetadata(paths), steeringGate: mode.steeringGate });
}

function renderedTools(
  entry: ReturnType<typeof meleeKernelAgent>,
  paths: KernelAgentCatalogContext,
  tools: readonly string[] = entry.tools,
): string | null {
  if (tools.length === 0) return null;
  return availableToolsPromptXml(toolContext(entry, paths), { replace: [...tools] });
}

function samplePrompt(
  agentId: KernelAgentId,
  paths: KernelAgentCatalogContext,
  deps: KernelPreviewDeps,
  mode: WorkerPreviewMode,
): PiPromptBundle {
  const game = gameMetadata(paths);
  switch (agentId) {
    case "worker":
      {
        const real = realWorkerPrompt(paths, deps, deps.target ?? DEFAULT_WORKER_PREVIEW_TARGET, mode);
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
              ledger: {
                runs: [], entries: [],
                recovery: {
                  cause: "upstream_change",
                  summary: "Previously achieved 100%. Upstream merge displaced the solution. Read the saved commit and adapt it to the current source before revalidating.",
                  refs: [{ refKind: "commit", refId: "sample-pre-merge-commit" }],
                },
              },
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
          ...previewSteeringPacket(mode, { unit: "GALE01:kernel-viewer", symbol: "ftDemo_KernelViewerSample" }),
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
        sourceNames: [{
          symbol: "ftDemo_KernelViewerSample", stable_key: "GALE01:kernel-viewer:ftDemo_KernelViewerSample",
          source_path: "src/melee/ft/chara/ftDemo.c", value: "ftDemo_UpdateGuardedState", confidence: 0.72,
          fact_id: "fact-kernel-viewer-name", updated_at: "2026-09-05T00:00:00Z",
        }],
        ...promptMode(mode),
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
            path: `${paths.repoRoot}/.pi-sessions/8f5861fc/worker/2026-07-12T00-01-35-565Z_019f1424-f574-716d-8065-c53713ee2cf0.jsonl`,
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
        ...sampleSourceReading,
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
            record: {
              facts: {
                inferred_name: {
                  value: "ftDemo_UpdateGuardedState",
                  rationale: "The guard gates the fighter state update; this is a reading-name guess.",
                  confidence: 0.65,
                  evidence: [{ kind: "code", locator: "code://1e28b4203b/src/melee/ft/chara/ftDemo.c#L12-L40", why: "The guarded state update is visible in the source span." }],
                },
              },
              links: [],
            },
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
        ...(context ? {} : sampleSourceReading),
        task: { mode: "fill_out_pass", reason: "dashboard preview", game_id: game?.gameId ?? "melee", head_revision: context?.headRevision ?? "preview-revision-unavailable", ...(context?.outputCorrection ? { output_correction: context.outputCorrection } : {}) },
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
            record: {
              facts: {
                purpose: { value: "Updates demo fighter state.", confidence: 0.55 },
                inferred_name: {
                  value: "ftDemo_UpdateGuardedState",
                  rationale: "The guard gates the fighter state update; this is a reading-name guess.",
                  confidence: 0.65,
                  evidence: [{ kind: "code", locator: "code://1e28b4203b/src/melee/ft/chara/ftDemo.c#L12-L40", why: "The guarded state update is visible in the source span." }],
                },
              },
              links: [],
            },
          },
        ],
        supportingSubjects: context?.supporting ?? [],
        decompStandards: librarianStandardsView(globalStandardsContext({ gameId: game?.gameId })),
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
  let advisoryAdjudication: AdvisoryAdjudicationMode = DEFAULT_ADVISORY_ADJUDICATION_MODE;
  try {
    advisoryAdjudication = previewAdvisoryAdjudication(deps);
  } catch (error) {
    warnings.push(`Rendering the worker sample as ${DEFAULT_ADVISORY_ADJUDICATION_MODE}: ${error instanceof Error ? error.message : String(error)}`);
  }
  const mode: WorkerPreviewMode = {
    advisoryAdjudication,
    stackFramePolicy: previewStackFramePolicy(paths, deps),
    steeringGate: previewSteeringGate(paths, deps),
    ordering: previewOrdering(paths, deps),
    previousAttempt: deps.previousAttempt ?? "rollback",
    compilerDelta: deps.compilerDelta ?? "present",
  };
  const agents = KERNEL_AGENT_IDS.map((agentId) => {
    const entry = meleeKernelAgent(agentId);
    try {
      const workerTools = agentId === "worker" ? workerPreviewToolIds(paths, mode) : undefined;
      return toKernelAgentViewerDefinition(entry, samplePrompt(agentId, paths, deps, mode), {
        generatedAt,
        renderedTools: renderedTools(entry, paths, workerTools),
        ...(workerTools
          ? {
              tools: workerTools,
              promptDocument: workerSystemPromptDocument({ packet: { target: { kind: "function" } }, game: gameMetadata(paths), ...promptMode(mode) }),
            }
          : {}),
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
    advisoryAdjudication,
    stackFramePolicy: mode.stackFramePolicy,
    steeringGate: mode.steeringGate,
    ordering: mode.ordering,
    previousAttempt: mode.previousAttempt,
    compilerDelta: mode.compilerDelta,
    agents,
    warnings,
  };
}
