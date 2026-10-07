import {
  DEFAULT_CHECKPOINT_KNOWLEDGE_CAP,
  type AdvisoryAdjudicationMode,
  type GlobalArgs,
} from "@server/core/game-registry/runtime-options.js";
import { addEvent, markEventHandled } from "@server/core/harness-runtime/run-state";
import type { JobRecord } from "@server/core/job-queue/types.js";
import { isStateStoreClosedError, type StateStore } from "@server/core/orchestrator-state";
import {
  catchUpAdjudication,
  catchUpKnowledge,
  DEFAULT_CATCH_UP_BUDGET_MS,
  type ModelNodeJobKind,
} from "./catch-up.js";
import {
  MODEL_NODE_LANE_DEFAULTS,
  startModelNodeLane,
  type ModelNodeFatalErrorHandler,
  type ModelNodeJobHandler,
  type ModelNodeLaneOptions,
} from "./lane.js";
import { createAdjudicationHandler } from "./handlers/adjudication.js";

export {
  CATCH_UP_BATCH_SIZE,
  DEFAULT_CATCH_UP_BUDGET_MS,
  MODEL_NODE_JOB_KINDS,
  catchUpAdjudication,
  catchUpKnowledge,
  ensureModelNodeLaneState,
  modelNodeLaneEnabledSince,
  type CatchUpOptions,
  type ModelNodeJobKind,
} from "./catch-up.js";
export {
  MODEL_NODE_LANE_DEFAULTS,
  ModelNodeLaneAbandonedError,
  startModelNodeLane,
  type ModelNodeFatalErrorHandler,
  type ModelNodeHandlerContext,
  type ModelNodeJobHandler,
  type ModelNodeLane,
  type ModelNodeLaneOptions,
} from "./lane.js";

/** A null handler means the kind enqueues durable jobs but never claims them. */
export type ModelNodeHandlers = Record<ModelNodeJobKind, ModelNodeJobHandler | null>;

export type ModelNodeHandlerFactory = (globals: GlobalArgs) => ModelNodeJobHandler;

/**
 * REGISTRATION POINT for the production lane handlers. Replace a `null` with
 * the kind's factory:
 * - `checkpoint_adjudication`: M9-D, `./handlers/adjudication.ts` (§6.4).
 * - `checkpoint_knowledge`: M11-B, `@server/core/knowledge-v2/checkpoint-feed/handler.ts` (§6.8).
 * Until then the kind's lane only enqueues: its jobs stay `queued` (never
 * claimed, completed, or failed) and are processed by the first lane start
 * that has the handler.
 */
const MODEL_NODE_HANDLER_FACTORIES: Readonly<Record<ModelNodeJobKind, ModelNodeHandlerFactory | null>> = Object.freeze({
  checkpoint_adjudication: createAdjudicationHandler,
  checkpoint_knowledge: null,
});

/** The production handler for each kind, or null when it is not registered yet. */
export function defaultModelNodeHandlers(globals: GlobalArgs): ModelNodeHandlers {
  return {
    checkpoint_adjudication: MODEL_NODE_HANDLER_FACTORIES.checkpoint_adjudication?.(globals) ?? null,
    checkpoint_knowledge: MODEL_NODE_HANDLER_FACTORIES.checkpoint_knowledge?.(globals) ?? null,
  };
}

export interface ModelNodeLanesConfig {
  /** Run the `checkpoint_adjudication` lane. */
  adjudication: boolean;
  /** Run the `checkpoint_knowledge` lane. */
  knowledge: boolean;
  /** Most `checkpoint_knowledge` jobs per settled epoch. */
  knowledgeCap?: number;
}

export interface ModelNodeLanes {
  /** Kinds that enqueue (the run's flags). */
  readonly kinds: readonly ModelNodeJobKind[];
  /** Kinds that also claim and run jobs (a handler is registered). */
  readonly claimingKinds: readonly ModelNodeJobKind[];
  /** Source enqueue after a worker job settles: that worker's eligible checkpoints. SQL only; never throws. */
  afterWorkerSettled(workerStateId: string): void;
  /** Source enqueue after an epoch boundary, fresh or reconciled: that epoch's integrations. SQL only; never throws. */
  afterEpochBoundary(epochId?: string): void;
  /** One bounded catch-up of every running kind. SQL only; never throws. */
  catchUp(): void;
  /** Final catch-up of every kind, then stop every lane together (no claim happens in between). */
  stop(options?: { maxWaitMs?: number }): Promise<void>;
}

export interface StartModelNodeLanesParams {
  store: StateStore;
  config: ModelNodeLanesConfig;
  handlers: ModelNodeHandlers;
  /** Dry run (`globals.dryRunAgents`): enqueue only; every handler is dropped, so nothing is claimed or executed. */
  dryRun?: boolean;
  shouldClaim?: () => boolean;
  onFatalError?: ModelNodeFatalErrorHandler;
  onShutdownAbandoned?: (count: number) => void;
  log?: (message: string) => void;
  /** Lane overrides (timings, clock) for tests. */
  lane?: Pick<ModelNodeLaneOptions, "concurrency" | "leaseMs" | "maxAttempts" | "catchUpEveryMs" | "intervalMs" | "now">;
}

export function startModelNodeLanes(params: StartModelNodeLanesParams): ModelNodeLanes {
  const { store, config } = params;
  const log = params.log ?? ((message: string) => console.warn(message));
  const knowledgeCap = config.knowledgeCap ?? DEFAULT_CHECKPOINT_KNOWLEDGE_CAP;
  const catchUps: Record<ModelNodeJobKind, (options?: { budgetMs?: number }) => number> = {
    checkpoint_adjudication: (options = {}) => catchUpAdjudication(store, options),
    checkpoint_knowledge: (options = {}) => catchUpKnowledge(store, { ...options, cap: knowledgeCap }),
  };
  const handlers: ModelNodeHandlers = params.dryRun
    ? { checkpoint_adjudication: null, checkpoint_knowledge: null }
    : params.handlers;
  const kinds: ModelNodeJobKind[] = [
    ...(config.adjudication ? ["checkpoint_adjudication" as const] : []),
    ...(config.knowledge ? ["checkpoint_knowledge" as const] : []),
  ];
  const abandoned: number[] = [];
  const lanes = kinds.map((kind, index) => startModelNodeLane({
    ...params.lane,
    store,
    kind,
    handler: handlers[kind],
    catchUp: () => catchUps[kind](),
    shouldClaim: params.shouldClaim,
    onFatalError: params.onFatalError,
    onShutdownAbandoned: (count) => {
      abandoned[index] = count;
      params.onShutdownAbandoned?.(abandoned.reduce((sum, value) => sum + (value ?? 0), 0));
    },
    log,
  }));
  const running = new Set(kinds);

  const guarded = (operation: string, work: () => void): void => {
    try {
      work();
    } catch (cause) {
      if (isStateStoreClosedError(cause)) params.onFatalError?.(cause, { job: null, operation });
      log(`[model-node-lanes] ${operation} failed: ${cause instanceof Error ? cause.message : String(cause)}`);
    }
  };

  const catchUpAll = (): void => {
    const deadline = Date.now() + DEFAULT_CATCH_UP_BUDGET_MS;
    for (const kind of kinds) {
      guarded(`${kind}-catch-up`, () => { catchUps[kind]({ budgetMs: Math.max(0, deadline - Date.now()) }); });
    }
  };

  return {
    kinds,
    claimingKinds: lanes.filter((lane) => lane.claiming).map((lane) => lane.kind),
    afterWorkerSettled: (workerStateId) => {
      if (!running.has("checkpoint_adjudication") || !workerStateId) return;
      guarded("checkpoint_adjudication-after-worker", () => { catchUpAdjudication(store, { workerStateId }); });
    },
    afterEpochBoundary: (epochId) => {
      if (!running.has("checkpoint_knowledge")) return;
      guarded("checkpoint_knowledge-after-boundary", () => {
        catchUpKnowledge(store, { ...(epochId ? { epochId } : {}), cap: knowledgeCap });
      });
    },
    catchUp: catchUpAll,
    stop: async (options = {}) => {
      catchUpAll();
      running.clear();
      await Promise.all(lanes.map((lane) => lane.stop({
        maxWaitMs: options.maxWaitMs ?? MODEL_NODE_LANE_DEFAULTS.stopMaxWaitMs,
      })));
    },
  };
}

/**
 * Start the model-node lanes the run's flags enable, recording the decision
 * as a handled run event. Zero footprint (no store access) when every lane is
 * off. The adjudication lane runs whenever adjudication is not `off`: its
 * catch-up only selects candidates whose effective mode is `shadow`, which
 * includes enforce requests the worker downgraded to shadow. With
 * `globals.dryRunAgents` the lanes only enqueue: no handler is constructed and
 * no job of any run is claimed.
 */
export function startModelNodeLanesIfEnabled(params: {
  store: StateStore;
  runId: string;
  globals: GlobalArgs;
  advisoryAdjudication: AdvisoryAdjudicationMode;
  checkpointKnowledgeFeed: boolean;
  checkpointKnowledgeCap: number;
  handlers?: Partial<ModelNodeHandlers>;
  shouldClaim?: () => boolean;
  onFatalError?: (cause: unknown, context: { job: JobRecord | null; operation: string }) => void;
  onShutdownAbandoned?: (count: number) => void;
  start?: typeof startModelNodeLanes;
}): ModelNodeLanes | null {
  const config: ModelNodeLanesConfig = {
    adjudication: params.advisoryAdjudication !== "off",
    knowledge: params.checkpointKnowledgeFeed,
    knowledgeCap: params.checkpointKnowledgeCap,
  };
  if (!config.adjudication && !config.knowledge) return null;
  const { store, runId } = params;
  const dryRun = params.globals.dryRunAgents === true;
  const flagEvent = addEvent(store, runId, "model_node_lanes_recorded", "run-loop", {
    advisory_adjudication: params.advisoryAdjudication,
    checkpoint_adjudication_lane: config.adjudication,
    checkpoint_knowledge_lane: config.knowledge,
    checkpoint_knowledge_cap: params.checkpointKnowledgeCap,
    dry_run: dryRun,
    created_by: "run-loop",
  });
  markEventHandled(store, flagEvent);
  return (params.start ?? startModelNodeLanes)({
    store,
    config,
    // A dry run constructs no handler at all (factories included): enqueue only.
    handlers: dryRun
      ? { checkpoint_adjudication: null, checkpoint_knowledge: null }
      : { ...defaultModelNodeHandlers(params.globals), ...params.handlers },
    dryRun,
    shouldClaim: params.shouldClaim,
    onFatalError: params.onFatalError,
    onShutdownAbandoned: params.onShutdownAbandoned,
  });
}
