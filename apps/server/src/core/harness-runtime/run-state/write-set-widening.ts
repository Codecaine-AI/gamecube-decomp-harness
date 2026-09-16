import { randomUUID } from "node:crypto";
import type { WriteSetWideningMode } from "@server/core/game-registry/runtime-options.js";
import { verifyClaimToken } from "@server/core/job-queue/kernel.js";
import { immediateTransaction, now, withBusyRetry, type StateStore } from "@server/core/orchestrator-state";
import {
  normalizeWriteSetEntries,
  widenClaimWriteSet,
  type WorkerWriteAuthority,
} from "./worker-state.js";
import {
  categorizePath,
  type WideningDecision,
  type WideningRequest,
  type WriteSetCategory,
  type WriteSetEntry,
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
  runId: string;
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
  runId: string;
  epochId: string;
  targetClaimId: string;
  workerStateId: string;
  attemptIndex: number;
  request: WideningRequest;
}

export interface RequestWriteSetWideningInput {
  paths: string[];
  reason: string;
  evidence?: string;
}

export interface RequestWriteSetWideningDeniedPath {
  path: string;
  reason: string;
  rung_guidance: string;
}

export interface RequestWriteSetWideningResult {
  approved_paths: string[];
  denied: RequestWriteSetWideningDeniedPath[];
  write_set_after: string[];
  mode: WriteSetWideningMode;
  applied: boolean;
  message?: string;
}

export type RequestWriteSetWideningHandler = (
  input: RequestWriteSetWideningInput,
) => Promise<RequestWriteSetWideningResult>;

export interface BuildInSessionWideningRequestsInput extends RequestWriteSetWideningInput {
  sourcePath: string;
  symbol: string;
  unit: string;
  scoreWithout?: number | null;
}

export interface InSessionWideningRequestDraft {
  path: string;
  category: WriteSetCategory;
  request: WideningRequest | null;
  denied: RequestWriteSetWideningDeniedPath | null;
}

export interface ExecuteWriteSetWideningRequestInput {
  store: StateStore;
  runId: string;
  epochId: string;
  targetClaimId: string;
  workerStateId: string;
  attemptIndex: number;
  request: WideningRequest;
  sourcePath: string;
  mode: WriteSetWideningMode;
  authority: WorkerWriteAuthority;
  headerDeclaresEvidenceSymbol?: boolean;
  wideningId?: string;
}

export interface ExecuteWriteSetWideningRequestResult {
  wideningId: string;
  request: WideningRequest;
  decision: WideningDecision;
  applied: boolean;
  idempotent: boolean;
  newPaths: string[];
  writeSetAfter: string[];
  entriesAfter: WriteSetEntry[];
}

export interface CreateRequestWriteSetWideningHandlerInput {
  store: StateStore;
  runId: string;
  epochId: string;
  targetClaimId: string;
  workerStateId: string;
  attemptIndex: number;
  sourcePath: string;
  symbol: string;
  unit: string;
  scoreWithout?: number | null;
  mode: WriteSetWideningMode;
  authority: WorkerWriteAuthority;
  headerDeclaresEvidenceSymbol?: (request: WideningRequest) => boolean | undefined | Promise<boolean | undefined>;
  onProcessed?: (result: ExecuteWriteSetWideningRequestResult) => void | Promise<void>;
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

export function wideningRungGuidance(category: WriteSetCategory, symbol?: string): string {
  if (category === "target-source") {
    return "Rung 1 is the target source and should already be present in the claim write set.";
  }
  if (category === "config-metadata") {
    return "Rung 2 requires evidence that the target-source edit alone cannot solve the mismatch.";
  }
  if (category === "owning-header") {
    const declaration = hasText(symbol) ? ` that declares ${symbol.trim()}` : " that declares the mismatched symbol";
    return `Rung 3 permits exactly one owning header${declaration}, after ruling out target-source and config-metadata fixes.`;
  }
  if (category === "foreign-source") {
    return "Rung 4 requires operator-visible cross-module routing after target-source, config-metadata, and owning-header fixes have been ruled out.";
  }
  return "No widening rung covers category other. Keep the fix in the target source or request a canonical config, owning-header, or foreign-source path.";
}

export function declarationSymbolForWorkerTarget(symbol: string): string {
  const trimmed = symbol.trim();
  const constructorOrDestructor = /^__(?:ct|dt)__(\d+)(.*)$/.exec(trimmed);
  if (constructorOrDestructor) {
    const length = Number(constructorOrDestructor[1]);
    const owner = constructorOrDestructor[2]?.slice(0, length);
    if (owner) return owner;
  }
  const codeWarriorMethod = /^([A-Za-z_][A-Za-z0-9_]*)__/.exec(trimmed)?.[1];
  if (codeWarriorMethod) return codeWarriorMethod;
  const qualified = trimmed.split("::").at(-1)?.replace(/\(.*$/, "").trim();
  return qualified || trimmed;
}

/**
 * Translate the worker tool's compact explanation into the existing versioned
 * policy request. Each path gets its own request so one denial does not hide an
 * independently approvable path.
 */
export function buildInSessionWideningRequests(
  input: BuildInSessionWideningRequestsInput,
): InSessionWideningRequestDraft[] {
  const paths = [...new Set(input.paths.map(normalizedRepoPath).filter(Boolean))];
  const reason = input.reason.trim();
  const evidence = input.evidence?.trim() || reason;
  const scoreWithout = Number.isFinite(input.scoreWithout) ? Number(input.scoreWithout) : 0;
  const declarationSymbol = declarationSymbolForWorkerTarget(input.symbol);

  return paths.map((requestedPath) => {
    const category = categorizePath(requestedPath, input.sourcePath);
    if (category === "target-source" || category === "other") {
      return {
        path: requestedPath,
        category,
        request: null,
        denied: {
          path: requestedPath,
          reason: `Widening denied: category ${category} is never widenable.`,
          rung_guidance: wideningRungGuidance(category, declarationSymbol),
        },
      };
    }

    const rung = RUNG_BY_CATEGORY[category];
    const request: WideningRequest = {
      schema_version: "write_set_widening_request_v1",
      paths: [requestedPath],
      category,
      rung,
      evidence: {
        mismatched_declaration: {
          symbol: declarationSymbol,
          current: reason,
          required: evidence,
          expected_owner: requestedPath,
        },
        objdiff: {
          unit: input.unit.trim(),
          score_without: scoreWithout,
          score_with: null,
        },
        ladder_evidence: {
          rung1_in_slice: reason,
          ...(rung >= 3 ? { rung2_config: evidence } : {}),
          ...(rung >= 4 ? { rung3_header: evidence } : {}),
        },
      },
    };
    return { path: requestedPath, category, request, denied: null };
  });
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
    runId: String(row.run_id),
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
            id, run_id, epoch_id, target_claim_id, worker_state_id,
            attempt_index, category, rung, requested_paths_json,
            approved_paths_json, evidence_json, status, created_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, '[]', ?, 'requested', ?)
        `,
      )
      .run(
        id,
        input.runId,
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

function requestsMatch(record: WriteSetWideningRecord, request: WideningRequest): boolean {
  return (
    record.category === request.category &&
    record.rung === request.rung &&
    JSON.stringify(record.requestedPaths.map(normalizedRepoPath)) === JSON.stringify(request.paths.map(normalizedRepoPath)) &&
    JSON.stringify(record.evidence) === JSON.stringify(request.evidence)
  );
}

function recordedDecision(record: WriteSetWideningRecord): WideningDecision | null {
  if (!record.decisionReason || !record.decidedBy || !record.validationTier) return null;
  const status: WideningDecision["status"] = record.status === "approved" || record.status === "denied" || record.status === "routed_cross_module"
    ? record.status
    : record.approvedPaths.length > 0
      ? "approved"
      : record.validationTier === 4 && !record.decisionReason.startsWith("Widening denied:")
        ? "routed_cross_module"
        : "denied";
  return {
    schema_version: "write_set_widening_decision_v1",
    wideningId: record.id,
    status,
    approvedPaths: record.approvedPaths,
    validationTier: record.validationTier,
    reason: record.decisionReason,
    decidedBy: record.decidedBy,
  };
}

function currentWriteSet(store: StateStore, claimId: string): { writeSet: string[]; entries: WriteSetEntry[] } {
  const row = withBusyRetry(
    () => store.db
      .query("SELECT write_set_json, write_set_entries_json FROM target_claims WHERE id = ? AND status = 'active'")
      .get(claimId) as Record<string, unknown> | undefined,
  );
  if (!row) throw new Error(`Active target claim not found: ${claimId}`);
  const entries = normalizeWriteSetEntries(row.write_set_entries_json, row.write_set_json);
  return { writeSet: entries.map((entry) => entry.path), entries };
}

export function shouldApplyWideningDecision(
  mode: WriteSetWideningMode,
  decision: WideningDecision,
): boolean {
  if (decision.status !== "approved") return false;
  if (mode === "config") return decision.validationTier === 2;
  if (mode === "header") return decision.validationTier === 2 || decision.validationTier === 3;
  return false;
}

/**
 * Authoritative widening transaction path shared by final-note requests and
 * the in-session worker tool. Identical requests reuse their audit row and do
 * not append duplicate write-set entries.
 */
export function executeWriteSetWidening(
  input: ExecuteWriteSetWideningRequestInput,
): ExecuteWriteSetWideningRequestResult {
  if (!("host" in input.authority)) verifyClaimToken(input.store, input.authority);

  const normalizedRequest: WideningRequest = {
    ...input.request,
    paths: [...new Set(input.request.paths.map(normalizedRepoPath))],
    evidence: {
      ...input.request.evidence,
      mismatched_declaration: {
        ...input.request.evidence.mismatched_declaration,
        expected_owner: normalizedRepoPath(input.request.evidence.mismatched_declaration.expected_owner),
      },
    },
  };
  const prior = writeSetWideningsForClaim(input.store, input.targetClaimId).find((record) =>
    requestsMatch(record, normalizedRequest),
  );
  const wideningId = prior?.id ?? input.wideningId ?? randomUUID();
  if (!prior) {
    createWriteSetWidening(input.store, {
      id: wideningId,
      runId: input.runId,
      epochId: input.epochId,
      targetClaimId: input.targetClaimId,
      workerStateId: input.workerStateId,
      attemptIndex: input.attemptIndex,
      request: normalizedRequest,
    });
  }

  let decision = prior ? recordedDecision(prior) : null;
  if (!decision) {
    decision = decideWidening({
      request: normalizedRequest,
      sourcePath: input.sourcePath,
      wideningId,
      allowOwningHeader: input.mode === "shadow" || input.mode === "header",
      headerDeclaresEvidenceSymbol: input.headerDeclaresEvidenceSymbol,
    });
    recordWriteSetWideningDecision(input.store, wideningId, decision);
  }

  const before = currentWriteSet(input.store, input.targetClaimId);
  const apply = shouldApplyWideningDecision(input.mode, decision);
  const newPaths = apply
    ? decision.approvedPaths.filter((path) => !before.writeSet.includes(path))
    : [];
  const after = newPaths.length > 0
    ? widenClaimWriteSet(
        input.store,
        input.targetClaimId,
        newPaths.map((path) => ({
          path,
          category: normalizedRequest.category,
          rung: normalizedRequest.rung,
          addedBy: "widening" as const,
          wideningId,
        })),
        input.authority,
      )
    : before;

  return {
    wideningId,
    request: normalizedRequest,
    decision,
    applied: apply,
    idempotent: Boolean(prior),
    newPaths,
    writeSetAfter: after.writeSet,
    entriesAfter: after.entries,
  };
}

export const executeWriteSetWideningRequest = executeWriteSetWidening;

export function createRequestWriteSetWideningHandler(
  context: CreateRequestWriteSetWideningHandlerInput,
): RequestWriteSetWideningHandler {
  return async (input) => {
    const drafts = buildInSessionWideningRequests({
      ...input,
      sourcePath: context.sourcePath,
      symbol: context.symbol,
      unit: context.unit,
      scoreWithout: context.scoreWithout,
    });
    const approvedPaths: string[] = [];
    const denied: RequestWriteSetWideningDeniedPath[] = [];
    let applied = false;
    let writeSetAfter = currentWriteSet(context.store, context.targetClaimId).writeSet;

    for (const draft of drafts) {
      if (!draft.request) {
        if (draft.denied) denied.push(draft.denied);
        continue;
      }
      const result = executeWriteSetWidening({
        store: context.store,
        runId: context.runId,
        epochId: context.epochId,
        targetClaimId: context.targetClaimId,
        workerStateId: context.workerStateId,
        attemptIndex: context.attemptIndex,
        request: draft.request,
        sourcePath: context.sourcePath,
        mode: context.mode,
        authority: context.authority,
        headerDeclaresEvidenceSymbol: await context.headerDeclaresEvidenceSymbol?.(draft.request),
      });
      writeSetAfter = result.writeSetAfter;
      applied ||= result.applied;
      if (result.decision.status === "approved") {
        approvedPaths.push(...result.decision.approvedPaths);
      } else {
        denied.push({
          path: draft.path,
          reason: result.decision.reason,
          rung_guidance: wideningRungGuidance(
            draft.category,
            declarationSymbolForWorkerTarget(context.symbol),
          ),
        });
      }
      await context.onProcessed?.(result);
    }

    const response: RequestWriteSetWideningResult = {
      approved_paths: [...new Set(approvedPaths)],
      denied,
      write_set_after: writeSetAfter,
      mode: context.mode,
      applied,
    };
    if (context.mode === "shadow") {
      response.applied = false;
      response.message = "Shadow mode: decisions were recorded but were not applied to the claim write set.";
    } else if (context.mode === "off") {
      response.applied = false;
      response.message = "Write-set widening mode is off, so decisions were not applied to the claim write set.";
    }
    return response;
  };
}
