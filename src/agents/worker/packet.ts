import type { RunRecord } from "../../types/index.js";
import type { LeasedTarget } from "../../state/index.js";

export function enabledCapabilities(packet: Record<string, unknown>): string[] {
  const raw = packet.enabled_capabilities;
  if (!Array.isArray(raw)) return [];
  return raw.map((value) => String(value));
}

export function targetPacketTarget(target: Record<string, unknown>): Record<string, unknown> {
  return {
    id: String(target.target_id),
    unit: String(target.unit),
    symbol: String(target.symbol),
    source_path: String(target.source_path),
    size: Number(target.size),
    fuzzy_match_percent: Number(target.fuzzy),
    priority: Number(target.priority),
    reason: String(target.reason ?? ""),
  };
}

export function workerPacket(params: {
  run: RunRecord;
  leased: LeasedTarget;
  target: Record<string, unknown>;
  baselineMeasures: unknown;
  dryRunAgents: boolean;
}): Record<string, unknown> {
  return {
    run: params.run,
    lease: {
      id: params.leased.leaseId,
      queue_id: params.leased.queueId,
      worker_id: params.leased.workerId,
      ttl: params.leased.ttl,
      write_set: params.leased.writeSet,
    },
    target: params.target,
    baseline: {
      measures: params.baselineMeasures,
      fuzzy_match_percent: params.target.fuzzy_match_percent,
    },
    enabled_capabilities: ["context_packaging", "focused_source_editing", "duplicate_adaptation", "fact_research"],
    budget: {
      max_attempts: params.dryRunAgents ? 1 : 12,
      wall_clock_minutes: params.dryRunAgents ? 5 : 45,
      file_understanding_minutes: params.dryRunAgents ? 0 : 10,
      extension_minutes_if_progress: params.dryRunAgents ? 0 : 15,
      continue_after_positive_delta: !params.dryRunAgents,
    },
    stop_rule: params.dryRunAgents
      ? "For this vertical-slice smoke path, stop after producing one evidence-backed worker report."
      : "Spend enough time to understand the leased file and target context before editing. Make evidence-backed scoped edits only inside the write_set. Before editing, capture a local regression baseline for the target and affected neighbors; after each attempt, compare narrow object builds and narrow objdiff results against that ledger. Retain improvements only when no unresolved local regression remains, undo only the worker's own regression/no-op hunks, preserve pre-existing dirty work, never use whole-file destructive git checkout/restore/reset/clean commands, never run global report refresh commands such as ninja build/GALE01/report.json, and continue after a positive score delta until the budget expires or remaining ideas become speculative.",
    report_contract: {
      report_types: ["progress", "stalled_no_useful_guess", "needs_fact", "score_candidate"],
      durable_paths: ["summary_path", "facts_path", "blocker_path", "patch_path"],
      wake_event: "worker_finished, worker_stalled, needs_fact, or score_candidate",
    },
  };
}
