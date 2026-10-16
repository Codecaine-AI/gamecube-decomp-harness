import type { Dashboard, JsonObject, ReadinessTargetRow } from "@/lib/format";

/** A readiness row (blocked or shadow would-block) in the queue tab's row shape. */
export function readinessQueueRow(row: ReadinessTargetRow): JsonObject {
  return {
    epochTargetId: `readiness:${row.key}`,
    unit: row.unit,
    symbol: row.symbol,
    sourcePath: row.sourcePath,
    fuzzy: row.fuzzy,
    readinessStatus: row.readinessStatus,
    reason: row.label,
    ...(row.verification
      ? {
          verification: row.verification,
          verification_label: row.verification_label,
          verification_match: row.verification_match,
          verification_reasons: row.verification_reasons,
        }
      : {}),
  };
}

/**
 * Queue tab rows: the active epoch's admitted targets (deferred ones carry
 * their "waiting on" label), then targets blocked by class readiness, which
 * are never admitted until their classes' units are decompiled.
 */
export function queueRows(dashboard: Dashboard | null): JsonObject[] {
  const admitted = (dashboard?.epochTargets || []).filter((target) => target.epochStatus === "active" && target.epochTargetStatus === "admitted");
  const blocked = (dashboard?.blockedTargets || []).map(readinessQueueRow);
  return [...admitted, ...blocked];
}

/** The queue status cell: readiness state when set, else the target status. */
export function queueRowStatus(row: JsonObject): string {
  const readiness = typeof row.readinessStatus === "string" ? row.readinessStatus : "";
  if (readiness) return readiness;
  const status = typeof row.targetStatus === "string" && row.targetStatus ? row.targetStatus : row.epochTargetStatus;
  return typeof status === "string" && status ? status : "-";
}
