import { randomUUID } from "node:crypto";
import { immediateTransaction, now, withBusyRetry, type StateStore } from "@server/core/orchestrator-state";
import {
  categorizePath,
  type WideningDecision,
  type WideningRequest,
  type WriteSetCategory,
} from "./write-set-categories.js";

type WidenableCategory = WideningRequest["category"];

export interface DecideWideningInput {
  request: WideningRequest;
  sourcePath: string;
  wideningId: string;
  allowOwningHeader: boolean;
  headerDeclaresEvidenceSymbol?: boolean;
}

export type WriteSetWideningStatus =
  | "requested"
  | "approved"
  | "denied"
  | "routed_cross_module"
  | "validated"
  | "validation_failed"
  | "reverted";

export interface WriteSetWideningRecord {
  id: string;
  sessionId: string;
  epochId: string;
  targetClaimId: string;
  workerStateId: string;
  attemptIndex: number;
  category: WidenableCategory;
  rung: 2 | 3 | 4;
  requestedPaths: string[];
  approvedPaths: string[];
  evidence: WideningRequest["evidence"];
  status: WriteSetWideningStatus;
  decidedBy: WideningDecision["decidedBy"] | null;
  decisionReason: string | null;
  validationTier: 2 | 3 | 4 | null;
  validationEvidence: Record<string, unknown>;
  createdAt: string;
  decidedAt: string | null;
  validatedAt: string | null;
}

export interface CreateWriteSetWideningInput {
  id?: string;
  sessionId: string;
  epochId: string;
  targetClaimId: string;
  workerStateId: string;
  attemptIndex: number;
  request: WideningRequest;
}

export interface SurfacedOutOfWriteSetChange {
  path: string;
  category?: WriteSetCategory;
}

export interface SurfacedOutOfWriteSetTelemetry {
  paths: string[];
  categories?: Record<string, WriteSetCategory>;
  diff_path?: string | null;
}

function isSurfacedTelemetryObject(
  value: SurfacedOutOfWriteSetTelemetry | readonly SurfacedOutOfWriteSetChange[],
): value is SurfacedOutOfWriteSetTelemetry {
  return !Array.isArray(value);
}

const RUNG_BY_CATEGORY: Record<WidenableCategory, 2 | 3 | 4> = {
  "config-metadata": 2,
  "owning-header": 3,
  "foreign-source": 4,
};

function normalizedRepoPath(path: string): string {
  return path.trim().replaceAll("\\", "/").replace(/^\.\/+/, "").replace(/\/{2,}/g, "/");
}

function hasText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function denied(wideningId: string, tier: 2 | 3 | 4, reason: string): WideningDecision {
  return {
    schema_version: "write_set_widening_decision_v1",
    wideningId,
    status: "denied",
    approvedPaths: [],
    validationTier: tier,
    reason,
    decidedBy: "runner-policy",
  };
}

function evidenceProblem(request: WideningRequest): string | null {
  const evidence = request.evidence;
  if (!evidence || !evidence.mismatched_declaration || !evidence.objdiff || !evidence.ladder_evidence) {
    return "Widening evidence is incomplete.";
  }
  const mismatch = evidence.mismatched_declaration;
  if (![mismatch.symbol, mismatch.current, mismatch.required, mismatch.expected_owner].every(hasText)) {
    return "Widening evidence must identify the symbol, current declaration, required declaration, and expected owner.";
  }
  if (!hasText(evidence.objdiff.unit) || !Number.isFinite(evidence.objdiff.score_without)) {
    return "Widening evidence must include an objdiff unit and finite rung-lower score.";
  }
  if (!hasText(evidence.ladder_evidence.rung1_in_slice)) {
    return "Widening denied: missing rung-1 in-slice necessity evidence.";
  }
  if (request.rung >= 3 && !hasText(evidence.ladder_evidence.rung2_config)) {
    return "Widening denied: missing rung-2 config-metadata evidence.";
  }
  if (request.rung >= 4 && !hasText(evidence.ladder_evidence.rung3_header)) {
    return "Widening denied: missing rung-3 owning-header evidence.";
  }
  return null;
}

export function decideWidening(input: DecideWideningInput): WideningDecision {
  const { request, wideningId } = input;
  const tier = request.rung;
  const requestedPaths = [...new Set(request.paths.map(normalizedRepoPath))];
  if (requestedPaths.length === 0 || requestedPaths.some((path) => path.length === 0)) {
    return denied(wideningId, tier, "Widening denied: at least one non-empty repo-relative path is required.");
  }

  const actualCategories = new Set(requestedPaths.map((path) => categorizePath(path, input.sourcePath)));
  if (actualCategories.size !== 1) {
    return denied(wideningId, tier, "Widening denied: every requested path must belong to one write-set category.");
  }
  const actualCategory = [...actualCategories][0];
  if (actualCategory === "target-source" || actualCategory === "other") {
    return denied(wideningId, tier, `Widening denied: category ${actualCategory} is never widenable.`);
  }
  if (actualCategory !== request.category) {
    return denied(
      wideningId,
      tier,
      `Widening denied: request category ${request.category} does not match categorized paths (${actualCategory}).`,
    );
  }
  if (RUNG_BY_CATEGORY[actualCategory] !== request.rung) {
    return denied(
      wideningId,
      tier,
      `Widening denied: category ${actualCategory} belongs to rung ${RUNG_BY_CATEGORY[actualCategory]}, not rung ${request.rung}.`,
    );
  }

  const evidenceIssue = evidenceProblem(request);
  if (evidenceIssue) return denied(wideningId, tier, evidenceIssue);

  const expectedOwner = normalizedRepoPath(request.evidence.mismatched_declaration.expected_owner);
  if (!requestedPaths.includes(expectedOwner)) {
    return denied(wideningId, tier, "Widening denied: the evidence owner is not one of the requested paths.");
  }

  if (request.rung === 2) {
    return {
      schema_version: "write_set_widening_decision_v1",
      wideningId,
      status: "approved",
      approvedPaths: requestedPaths,
      validationTier: 2,
      reason: "Approved rung-2 config-metadata widening for scoped validation.",
      decidedBy: "runner-policy",
    };
  }

  if (request.rung === 3) {
    if (requestedPaths.length !== 1) {
      return denied(wideningId, 3, "Widening denied: rung 3 permits exactly one owning header.");
    }
    if (!input.allowOwningHeader) {
      return denied(wideningId, 3, "Widening denied: owning-header widening is disabled by the runtime flag.");
    }
    if (!input.headerDeclaresEvidenceSymbol) {
      return denied(
        wideningId,
        3,
        `Widening denied: the requested header does not declare ${request.evidence.mismatched_declaration.symbol}.`,
      );
    }
    return {
      schema_version: "write_set_widening_decision_v1",
      wideningId,
      status: "approved",
      approvedPaths: requestedPaths,
      validationTier: 3,
      reason: "Approved rung-3 owning-header widening for scoped owner and direct-consumer validation.",
      decidedBy: "runner-policy",
    };
  }

  return {
    schema_version: "write_set_widening_decision_v1",
    wideningId,
    status: "routed_cross_module",
    approvedPaths: [],
    validationTier: 4,
    reason: "Rung-4 foreign-source widening requires operator-visible cross-module routing.",
    decidedBy: "runner-policy",
  };
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string" && item.trim().length > 0);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function parseWideningRequest(value: unknown): WideningRequest | null {
  if (!isRecord(value) || value.schema_version !== "write_set_widening_request_v1" || !isStringArray(value.paths)) return null;
  if (!(["config-metadata", "owning-header", "foreign-source"] as unknown[]).includes(value.category)) return null;
  if (![2, 3, 4].includes(value.rung as number) || !isRecord(value.evidence)) return null;

  const mismatch = value.evidence.mismatched_declaration;
  const objdiff = value.evidence.objdiff;
  const ladder = value.evidence.ladder_evidence;
  if (!isRecord(mismatch) || !isRecord(objdiff) || !isRecord(ladder)) return null;
  if (![mismatch.symbol, mismatch.current, mismatch.required, mismatch.expected_owner].every((item) => typeof item === "string")) return null;
  if (typeof objdiff.unit !== "string" || typeof objdiff.score_without !== "number") return null;
  if (!(objdiff.score_with === null || typeof objdiff.score_with === "number")) return null;
  if (objdiff.artifact_path !== undefined && typeof objdiff.artifact_path !== "string") return null;
  if (typeof ladder.rung1_in_slice !== "string") return null;
  if (ladder.rung2_config !== undefined && typeof ladder.rung2_config !== "string") return null;
  if (ladder.rung3_header !== undefined && typeof ladder.rung3_header !== "string") return null;
  return value as unknown as WideningRequest;
}

export function draftWideningRequestFromOutOfWriteSet(
  telemetry: SurfacedOutOfWriteSetTelemetry | readonly SurfacedOutOfWriteSetChange[],
  sourcePath: string,
): WideningRequest | null {
  const changes: SurfacedOutOfWriteSetChange[] = isSurfacedTelemetryObject(telemetry)
    ? telemetry.paths.map((path) => ({ path, category: telemetry.categories?.[path] }))
    : [...telemetry];
  const paths = [...new Set(changes.map((change) => normalizedRepoPath(change.path)).filter(Boolean))];
  if (paths.length === 0) return null;

  const categories = new Set<WidenableCategory>();
  for (const path of paths) {
    const categorized = categorizePath(path, sourcePath);
    const surfacedCategory = changes.find((change) => normalizedRepoPath(change.path) === path)?.category;
    if (surfacedCategory && surfacedCategory !== categorized) return null;
    if (categorized === "target-source" || categorized === "other") return null;
    categories.add(categorized);
  }
  if (categories.size !== 1) return null;
  const category = [...categories][0];

  return {
    schema_version: "write_set_widening_request_v1",
    paths,
    category,
    rung: RUNG_BY_CATEGORY[category],
    evidence: {
      mismatched_declaration: {
        symbol: "",
        current: "",
        required: "",
        expected_owner: paths[0],
      },
      objdiff: {
        unit: "",
        score_without: 0,
        score_with: null,
      },
      ladder_evidence: {
        rung1_in_slice: "",
      },
    },
  };
}

function parseJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== "string") return (value as T) ?? fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function wideningFromRow(row: Record<string, unknown>): WriteSetWideningRecord {
  return {
    id: String(row.id),
    sessionId: String(row.session_id),
    epochId: String(row.epoch_id),
    targetClaimId: String(row.target_claim_id),
    workerStateId: String(row.worker_state_id),
    attemptIndex: Number(row.attempt_index),
    category: String(row.category) as WidenableCategory,
    rung: Number(row.rung) as 2 | 3 | 4,
    requestedPaths: parseJson<string[]>(row.requested_paths_json, []),
    approvedPaths: parseJson<string[]>(row.approved_paths_json, []),
    evidence: parseJson<WideningRequest["evidence"]>(row.evidence_json, {
      mismatched_declaration: { symbol: "", current: "", required: "", expected_owner: "" },
      objdiff: { unit: "", score_without: 0, score_with: null },
      ladder_evidence: { rung1_in_slice: "" },
    }),
    status: String(row.status) as WriteSetWideningStatus,
    decidedBy: row.decided_by == null ? null : (String(row.decided_by) as WideningDecision["decidedBy"]),
    decisionReason: row.decision_reason == null ? null : String(row.decision_reason),
    validationTier: row.validation_tier == null ? null : (Number(row.validation_tier) as 2 | 3 | 4),
    validationEvidence: parseJson<Record<string, unknown>>(row.validation_evidence_json, {}),
    createdAt: String(row.created_at),
    decidedAt: row.decided_at == null ? null : String(row.decided_at),
    validatedAt: row.validated_at == null ? null : String(row.validated_at),
  };
}

export function createWriteSetWidening(store: StateStore, input: CreateWriteSetWideningInput): WriteSetWideningRecord {
  return immediateTransaction(store.db, () => {
    const id = input.id ?? randomUUID();
    store.db
      .query(
        `
          INSERT INTO write_set_widenings (
            id, session_id, epoch_id, target_claim_id, worker_state_id,
            attempt_index, category, rung, requested_paths_json,
            approved_paths_json, evidence_json, status, created_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, '[]', ?, 'requested', ?)
        `,
      )
      .run(
        id,
        input.sessionId,
        input.epochId,
        input.targetClaimId,
        input.workerStateId,
        input.attemptIndex,
        input.request.category,
        input.request.rung,
        JSON.stringify(input.request.paths),
        JSON.stringify(input.request.evidence),
        now(),
      );
    const row = store.db.query("SELECT * FROM write_set_widenings WHERE id = ?").get(id) as Record<string, unknown>;
    return wideningFromRow(row);
  });
}

export function getWriteSetWidening(store: StateStore, id: string): WriteSetWideningRecord | null {
  const row = withBusyRetry(
    () => store.db.query("SELECT * FROM write_set_widenings WHERE id = ?").get(id) as Record<string, unknown> | undefined,
  );
  return row ? wideningFromRow(row) : null;
}

export function writeSetWideningsForClaim(store: StateStore, claimId: string): WriteSetWideningRecord[] {
  const rows = withBusyRetry(
    () =>
      store.db
        .query("SELECT * FROM write_set_widenings WHERE target_claim_id = ? ORDER BY created_at ASC, id ASC")
        .all(claimId) as Record<string, unknown>[],
  );
  return rows.map(wideningFromRow);
}

export function recordWriteSetWideningDecision(
  store: StateStore,
  id: string,
  decision: WideningDecision,
): WriteSetWideningRecord {
  if (decision.wideningId !== id) throw new Error(`Widening decision id ${decision.wideningId} does not match row ${id}`);
  return immediateTransaction(store.db, () => {
    const decidedAt = now();
    const result = store.db
      .query(
        `
          UPDATE write_set_widenings
          SET approved_paths_json = ?, status = ?, decided_by = ?,
              decision_reason = ?, validation_tier = ?, decided_at = ?
          WHERE id = ?
        `,
      )
      .run(
        JSON.stringify(decision.approvedPaths),
        decision.status,
        decision.decidedBy,
        decision.reason,
        decision.validationTier,
        decidedAt,
        id,
      );
    if (result.changes !== 1) throw new Error(`Unknown write-set widening ${id}`);
    const row = store.db.query("SELECT * FROM write_set_widenings WHERE id = ?").get(id) as Record<string, unknown>;
    return wideningFromRow(row);
  });
}

export function recordWriteSetWideningValidation(
  store: StateStore,
  id: string,
  input: {
    status: "validated" | "validation_failed" | "reverted";
    evidence?: Record<string, unknown>;
  },
): WriteSetWideningRecord {
  return immediateTransaction(store.db, () => {
    const result = store.db
      .query(
        `
          UPDATE write_set_widenings
          SET status = ?, validation_evidence_json = ?, validated_at = ?
          WHERE id = ?
        `,
      )
      .run(input.status, JSON.stringify(input.evidence ?? {}), now(), id);
    if (result.changes !== 1) throw new Error(`Unknown write-set widening ${id}`);
    const row = store.db.query("SELECT * FROM write_set_widenings WHERE id = ?").get(id) as Record<string, unknown>;
    return wideningFromRow(row);
  });
}
