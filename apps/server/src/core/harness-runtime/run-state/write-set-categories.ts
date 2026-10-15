export type WriteSetCategory =
  | "target-source"
  | "config-metadata"
  | "owning-header"
  | "foreign-source"
  | "other";

export interface WriteSetEntry {
  path: string;
  category: WriteSetCategory;
  rung: 1 | 2 | 3 | 4;
  addedBy: "claim" | "widening";
  wideningId?: string;
}

export interface WideningRequest {
  schema_version: "write_set_widening_request_v1";
  paths: string[];
  category: Exclude<WriteSetCategory, "target-source" | "other">;
  rung: 2 | 3 | 4;
  evidence: {
    mismatched_declaration: {
      symbol: string;
      current: string;
      required: string;
      expected_owner: string;
    };
    objdiff: {
      unit: string;
      score_without: number;
      score_with: number | null;
      artifact_path?: string;
    };
    ladder_evidence: {
      rung1_in_slice: string;
      rung2_config?: string;
      rung3_header?: string;
    };
  };
}

export interface WideningDecision {
  schema_version: "write_set_widening_decision_v1";
  wideningId: string;
  status: "approved" | "denied" | "routed_cross_module";
  approvedPaths: string[];
  validationTier: 2 | 3 | 4;
  reason: string;
  decidedBy: "runner-policy" | "cross-module-lane" | "operator";
  /**
   * Ordering shadow only: the rung-3 readiness denial enforce would have
   * applied. The decision itself is unchanged (shadow never changes outcomes).
   */
  wouldDeny?: {
    classes: Array<{ class: string; owner_unit: string | null; state: string }>;
    reason: string;
  };
}

function normalizeRepoPath(path: string): string {
  return path.trim().replaceAll("\\", "/").replace(/^\.\/+/, "").replace(/\/{2,}/g, "/");
}

export function categorizePath(path: string, sourcePath: string): WriteSetCategory {
  const normalizedPath = normalizeRepoPath(path);
  const normalizedSourcePath = normalizeRepoPath(sourcePath);

  if (normalizedPath !== "" && normalizedPath === normalizedSourcePath) return "target-source";
  if (/^config\/(?:.*\/)?(?:symbols|splits)\.txt$/.test(normalizedPath)) return "config-metadata";
  if (/^(?:include|src|libs\/[^/]+\/include)\/.+\.h(?:pp)?$/i.test(normalizedPath)) return "owning-header";
  if (/^src\/.+\.c(?:pp)?$/i.test(normalizedPath)) return "foreign-source";
  return "other";
}
