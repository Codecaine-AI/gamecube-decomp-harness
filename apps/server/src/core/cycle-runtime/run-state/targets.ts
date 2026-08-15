import type { TargetCandidate } from "@server/core/shared/types/index.js";
import type { StateStore } from "@server/core/orchestrator-state";
import { activeSchedulerEpoch, admitEpochTargets, startSchedulerEpoch } from "./epochs.js";

function parseStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => String(item)).filter(Boolean);
  if (typeof value !== "string" || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.map((item) => String(item)).filter(Boolean) : [];
  } catch {
    return [];
  }
}

export function activeLockedSourcePaths(store: StateStore): Set<string> {
  const rows = store.db.query("SELECT write_set_json FROM target_claims WHERE status = 'active'").all() as Record<string, unknown>[];
  const paths = new Set<string>();
  for (const row of rows) {
    for (const path of parseStringArray(row.write_set_json)) paths.add(path);
  }
  return paths;
}

export function admitPriorityTargets(store: StateStore, runId: string, candidates: TargetCandidate[]): number {
  const eligible = candidates.filter((candidate) => candidate.sourcePath.trim());
  if (eligible.length === 0) return 0;
  const epoch =
    activeSchedulerEpoch(store, runId) ??
    startSchedulerEpoch(store, runId, {
      size: { mode: "fixed", value: Math.max(1, eligible.length) },
      workerPoolSize: Math.max(1, eligible.length),
      candidateWindow: Math.max(1, eligible.length),
    });
  const result = admitEpochTargets(store, {
    epochId: epoch.id,
    runId,
    candidates: eligible,
    size: { mode: "fixed", value: eligible.length },
    workerPoolSize: eligible.length,
    allowPreviouslyFinished: true,
  });
  return result.admitted;
}
