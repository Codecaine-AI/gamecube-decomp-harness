/** Report-backed recovery evidence shared by live boundaries and operator backfills.
 * A merge cannot be accepted if a displaced function has no durable knowledge note.
 * Source commits remain the recoverable solution; an old score is historical evidence.
 */
import { createHash } from "node:crypto";
import { EXACT_SCORE, objdiffRowScore } from "@server/core/validation/objdiff/constants.js";
import { insertEvent, type KnowledgeStoreHandle } from "@server/core/knowledge-v2/records/index.js";
import type { BoundaryDisplacement, BoundaryTargetState } from "./boundary-sync.js";

export function reportRecoveryTargets(report: unknown): BoundaryTargetState[] {
  const units = (report as { units?: unknown[] } | null)?.units;
  if (!Array.isArray(units) || units.length === 0) throw new Error("Boundary recovery requires a nonempty function report");
  return units.flatMap((value) => {
    const unit = value as { name: string; metadata?: { source_path?: string }; functions?: Record<string, unknown>[] };
    return (unit.functions ?? []).map((row) => {
      if (!unit.name || typeof row.name !== "string") throw new Error("Boundary recovery report has an invalid function identity");
      // Objdiff protobuf JSON omits zero-valued score fields.
      const score = objdiffRowScore(row, 0);
      return {
        targetKey: `${unit.name}::${row.name}`, unit: unit.name, symbol: row.name,
        sourcePath: unit.metadata?.source_path ?? "",
        priorScore: score, priorKind: score >= EXACT_SCORE ? "match" as const : "improvement" as const,
      };
    });
  });
}

export function reportBoundaryDisplacements(input: {
  before: unknown; after: unknown; priorHeadSha: string; resultingHeadSha: string; upstreamHeadSha: string;
}): BoundaryDisplacement[] {
  const after = new Map(reportRecoveryTargets(input.after).map((target) => [target.targetKey, target]));
  return reportRecoveryTargets(input.before).flatMap((target) => {
    const current = after.get(target.targetKey);
    if (current && current.priorScore! >= target.priorScore! - 0.00001) return [];
    if (target.priorScore === 0) return [];
    if (!target.sourcePath) throw new Error(`Boundary recovery cannot locate saved source for ${target.targetKey}`);
    return [{
      epochTargetId: null, targetKey: target.targetKey, sourcePath: target.sourcePath,
      unit: target.unit ?? null, symbol: target.symbol ?? null,
      priorKind: target.priorKind, priorScore: target.priorScore,
      afterScore: current?.priorScore ?? null,
      priorHeadSha: input.priorHeadSha, resultingHeadSha: input.resultingHeadSha,
      upstreamLandedSha: input.upstreamHeadSha,
      verdict: "overridden_by_upstream_requeued" as const,
    }];
  }).sort((a, b) => a.targetKey.localeCompare(b.targetKey));
}

export function boundaryRecoverySummary(item: BoundaryDisplacement): string {
  return [
    `Merge recovery: previously achieved ${item.priorScore ?? "unknown"}% (${item.priorKind ?? "unclassified"}).`,
    `After upstream merge ${item.upstreamLandedSha}, measured ${item.afterScore ?? "absent from report"}${item.afterScore == null ? "" : "%"}.`,
    "The upstream merge/resolution displaced prior work; this is not a failed worker attempt.",
    item.priorHeadSha ? `Saved solution: ${item.priorHeadSha}:${item.sourcePath}. Read with git show ${item.priorHeadSha}:${item.sourcePath}.` : "",
    item.resultingHeadSha ? `Post-merge source: ${item.resultingHeadSha}.` : "",
    "Adapt the saved solution to current upstream APIs and revalidate; do not redo from scratch or blindly restore the whole file. Readmit only if eligible within the run's scope.",
  ].filter(Boolean).join(" ");
}

/** Idempotent, exact-target write. Missing identity or conflicting evidence blocks publication. */
export function recordBoundaryRecovery(store: KnowledgeStoreHandle, item: BoundaryDisplacement): string {
  const stableKey = item.targetKey.replace("::", ":");
  const target = store.db.query<{ id: string }, [string]>("SELECT id FROM target WHERE stable_key = ?").get(stableKey);
  if (!target) throw new Error(`Boundary recovery has no knowledge target: ${stableKey}`);
  const id = `boundary-recovery-${createHash("sha256").update(`${stableKey}:${item.priorHeadSha ?? "unknown"}:${item.upstreamLandedSha}`).digest("hex")}`;
  const summary = boundaryRecoverySummary(item);
  const existing = store.db.query<{ target_id: string; summary: string }, [string]>("SELECT target_id, summary FROM event WHERE id = ?").get(id);
  if (existing) {
    if (existing.target_id !== target.id || existing.summary !== summary) throw new Error(`Conflicting boundary recovery evidence: ${id}`);
    return id;
  }
  const commits = [...new Set([item.priorHeadSha, item.resultingHeadSha, item.upstreamLandedSha].filter((sha): sha is string => Boolean(sha)))];
  insertEvent(store, { id, targetId: target.id, kind: "regression", cause: "upstream_change", summary },
    commits.map((refId) => ({ refKind: "commit" as const, refId })));
  return id;
}
