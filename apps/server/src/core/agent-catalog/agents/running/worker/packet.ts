import type { RunRecord } from "@server/core/shared/types";
import type { ClaimedTarget } from "@server/core/cycle-runtime/run-state";
import type { WorkerFirstDiff } from "./change-validation.js";

export function enabledCapabilities(packet: Record<string, unknown>): string[] {
  const raw = packet.enabled_capabilities;
  if (!Array.isArray(raw)) return [];
  return raw.map((value) => String(value));
}

export function targetPacketTarget(target: Record<string, unknown>): Record<string, unknown> {
  const symbol = String(target.symbol);
  const explicitKind = target.kind ?? target.target_kind;
  const kind = explicitKind === "function" || explicitKind === "section"
    ? explicitKind
    : symbol.startsWith(".")
      ? "section"
      : "function";
  return {
    id: String(target.target_id),
    kind,
    unit: String(target.unit),
    symbol,
    source_path: String(target.source_path),
    size: Number(target.size),
    fuzzy_match_percent: Number(target.fuzzy),
  };
}

export function workerPacket(params: {
  run: RunRecord;
  claim: ClaimedTarget;
  target: Record<string, unknown>;
  baselineMeasures: unknown;
  knowledgeContext?: Record<string, unknown>;
  firstDiff?: WorkerFirstDiff | null;
}): Record<string, unknown> {
  return {
    run: params.run,
    target_claim: {
      id: params.claim.claimId,
      epoch_id: params.claim.epochId,
      epoch_target_id: params.claim.epochTargetId,
      worker_state_id: params.claim.workerStateId,
      worker_id: params.claim.workerId,
      ttl: params.claim.ttl,
      write_set: params.claim.writeSet,
    },
    target: params.target,
    baseline: {
      current_scores: params.baselineMeasures,
      fuzzy_match_percent: params.target.fuzzy_match_percent,
    },
    first_diff: params.firstDiff ?? null,
    knowledge_context: params.knowledgeContext ?? {
      status: "not_precomputed",
      reason: "No graph context was provided by the runner.",
    },
    enabled_capabilities: ["context_packaging", "focused_source_editing", "duplicate_adaptation", "fact_research"],
    stop_rule:
      "Understand the file, make scoped evidence-backed edits inside the write_set, evaluate concrete attempts with narrow validation/review feedback, retain only edits with no unresolved local regression, and keep working toward exact match. When you return, the runner will validate the current worktree and decide whether to continue or close the worker state.",
    runner_contract: {
      ownership: "target_claim",
      durable_state: "worker_state",
      validation_record: "worker_checkpoints",
      wake_event: "runner-owned worker_state lifecycle event",
    },
  };
}
