import { formatLocator } from "../locator.js";
import type { PrioritizedTargetRow } from "../migration/prioritize.js";
import type { KnowledgeStoreHandle } from "../records/index.js";
import type {
  EntityIdentityStatus,
  EntityKind,
  Outcome,
  TargetIdentityStatus,
} from "../storage/schema.js";
import type {
  Kv2UnitMemberTarget,
  Kv2UnitPullRequest,
  Kv2UnitSummary,
} from "../tools.js";
import {
  knowledgeRecord,
  targetLedger,
  unitView,
  type KnowledgeRecord,
  type TargetLedgerEntry,
} from "../views/index.js";

export type BackfillMechanicalEntityKind = Extract<
  EntityKind,
  "translation_unit" | "struct" | "struct_field" | "parameter"
>;

export interface BackfillTargetStatus {
  target_id: string;
  match_pct: number;
  linked: boolean;
  size: number | null;
  content_hash: string | null;
  report_revision: string;
  updated_at: string;
}

export interface BackfillPassTarget {
  id: string;
  kind: PrioritizedTargetRow["kind"];
  unit: string;
  unit_entity_id: string;
  symbol: string | null;
  stable_key: string;
  address: string | null;
  identity_status: TargetIdentityStatus;
  report_revision: string;
  target_status: BackfillTargetStatus | null;
  match_pct: number | null;
  linked: boolean;
  named_symbol: boolean;
  unit_named_ratio: number;
}

export interface BackfillUnitContext {
  status: "ok";
  unit: Kv2UnitSummary;
  members: Kv2UnitMemberTarget[];
  pull_requests: Kv2UnitPullRequest[];
  total_pr_count: number;
  count: number;
  truncated: boolean;
}

export interface BackfillMechanicalEntity {
  id: string;
  kind: BackfillMechanicalEntityKind;
  locator: string;
  parent_entity_id: string | null;
  identity_status: EntityIdentityStatus;
  merged_into_id: string | null;
}

/** One entry of the ordered fill-out loop: linked entities first, the target last. */
export type BackfillFillOutSubject =
  | {
    order: number;
    kind: "entity";
    entity_kind: BackfillMechanicalEntityKind;
    entity_locator: string;
    record: KnowledgeRecord;
    /** Present on the translation_unit entry: its members and recent pull requests. */
    material?: BackfillUnitContext;
  }
  | {
    order: number;
    kind: "target";
    target_stable_key: string;
    detail: BackfillPassTarget;
    ledger: TargetLedgerEntry[];
    record: KnowledgeRecord;
  };

/** A connected curated subject: context to read, not owed facts. */
export interface BackfillSupportingSubject {
  kind: "game_concept" | "pattern";
  entity_locator: string;
  record: KnowledgeRecord;
}

export interface BackfillApplyScope {
  targetStableKeys: string[];
  entityLocators: string[];
}

export interface BackfillPassContext {
  target: BackfillPassTarget;
  ledger: TargetLedgerEntry[];
  unitContext: BackfillUnitContext;
  linkedEntities: BackfillMechanicalEntity[];
  /** The ordered fill-out loop the agent works: linked entities first, the target last. */
  fillOut: BackfillFillOutSubject[];
  /** Connected game concepts and patterns: supporting context, not owed facts. */
  supporting: BackfillSupportingSubject[];
  scope: BackfillApplyScope;
}

interface TargetRow {
  id: string;
  kind: PrioritizedTargetRow["kind"];
  unit: string;
  unit_entity_id: string;
  symbol: string | null;
  stable_key: string;
  address: string | null;
  identity_status: TargetIdentityStatus;
  report_revision: string;
}

interface TargetStatusRow {
  target_id: string;
  match_pct: number;
  linked: number;
  size: number | null;
  content_hash: string | null;
  report_revision: string;
  updated_at: string;
}

interface UnitPullRequestRow {
  id: string;
  pr_ref: string;
  summary: string;
  outcome: Outcome;
  merged_at: string;
}

const UNIT_PR_LIMIT = 15;

/** Assemble one backfill pass from mechanical store relationships only. */
export function buildPassContext(
  store: KnowledgeStoreHandle,
  prioritized: PrioritizedTargetRow,
): BackfillPassContext {
  const targetRow = store.db.query<TargetRow, [string]>(
    "SELECT * FROM target WHERE id = ?",
  ).get(prioritized.target_id);
  if (!targetRow) throw new Error(`Backfill target not found: ${prioritized.target_id}`);

  const statusRow = store.db.query<TargetStatusRow, [string]>(
    "SELECT * FROM target_status WHERE target_id = ?",
  ).get(prioritized.target_id);
  const targetStatus: BackfillTargetStatus | null = statusRow === null
    ? null
    : { ...statusRow, linked: statusRow.linked === 1 };

  const unit = unitView(store).find((candidate) => candidate.unit.id === targetRow.unit_entity_id);
  if (!unit) throw new Error(`Backfill unit not found: ${targetRow.unit_entity_id}`);

  const unitPrRows = store.db.query<UnitPullRequestRow, [string]>(`
    SELECT id, pr_ref, summary, outcome, merged_at
    FROM pull_request
    WHERE entity_id = ?
    ORDER BY merged_at DESC, id
  `).all(targetRow.unit_entity_id);
  const unitPullRequests: Kv2UnitPullRequest[] = unitPrRows.slice(0, UNIT_PR_LIMIT).map((row) => ({
    id: row.id,
    locator: formatLocator({ kind: "pr", pullRequestId: row.id }),
    pr_ref: row.pr_ref,
    summary: row.summary,
    outcome: row.outcome,
    merged_at: row.merged_at,
  }));
  const unitContext: BackfillUnitContext = {
    status: "ok",
    unit: {
      locator: unit.unit.locator,
      identity_status: unit.unit.identityStatus,
      match_pct: unit.matchPct,
    },
    members: unit.targets.map((member) => ({
      stable_key: member.stableKey,
      kind: member.kind,
      match_pct: member.status?.matchPct ?? null,
      named: member.symbol !== null,
    })),
    pull_requests: unitPullRequests,
    total_pr_count: unitPrRows.length,
    count: unitPullRequests.length,
    truncated: unitPrRows.length > UNIT_PR_LIMIT,
  };

  const linkedEntities = store.db.query<BackfillMechanicalEntity, [string, string, string, string]>(`
    SELECT e.id, e.kind, e.locator, e.parent_entity_id, e.identity_status, e.merged_into_id
    FROM entity e
    WHERE e.kind IN ('translation_unit', 'struct', 'struct_field', 'parameter')
      AND (
        e.id = ?
        OR EXISTS (
          SELECT 1
          FROM link l
          WHERE (l.from_target_id = ? AND l.to_entity_id = e.id)
             OR (l.to_target_id = ? AND l.from_entity_id = e.id)
        )
      )
    ORDER BY CASE WHEN e.id = ? THEN 0 ELSE 1 END, e.locator, e.id
  `).all(targetRow.unit_entity_id, targetRow.id, targetRow.id, targetRow.unit_entity_id);
  if (!linkedEntities.some((entity) => entity.id === targetRow.unit_entity_id)) {
    throw new Error(`Backfill unit entity not found: ${targetRow.unit_entity_id}`);
  }

  const targetDetail: BackfillPassTarget = {
    ...targetRow,
    target_status: targetStatus,
    match_pct: prioritized.match_pct,
    linked: prioritized.linked,
    named_symbol: prioritized.named_symbol,
    unit_named_ratio: prioritized.unit_named_ratio,
  };
  const ledger = targetLedger(store, targetRow.id);
  const fillOut: BackfillFillOutSubject[] = [
    ...linkedEntities.map((entity, index): BackfillFillOutSubject => ({
      order: index + 1,
      kind: "entity",
      entity_kind: entity.kind,
      entity_locator: entity.locator,
      record: knowledgeRecord(store, { entityId: entity.id }),
      ...(entity.id === targetRow.unit_entity_id ? { material: unitContext } : {}),
    })),
    {
      order: linkedEntities.length + 1,
      kind: "target",
      target_stable_key: targetRow.stable_key,
      detail: targetDetail,
      ledger,
      record: knowledgeRecord(store, { targetId: targetRow.id }),
    },
  ];

  const supportingRows = store.db.query<
    { id: string; kind: "game_concept" | "pattern"; locator: string },
    [string, string]
  >(`
    SELECT e.id, e.kind, e.locator
    FROM entity e
    WHERE e.kind IN ('game_concept', 'pattern')
      AND EXISTS (
        SELECT 1
        FROM link l
        WHERE (l.from_target_id = ? AND l.to_entity_id = e.id)
           OR (l.to_target_id = ? AND l.from_entity_id = e.id)
      )
    ORDER BY e.locator, e.id
  `).all(targetRow.id, targetRow.id);
  const supporting: BackfillSupportingSubject[] = supportingRows.map((row) => ({
    kind: row.kind,
    entity_locator: row.locator,
    record: knowledgeRecord(store, { entityId: row.id }),
  }));

  return {
    target: targetDetail,
    ledger,
    unitContext,
    linkedEntities,
    fillOut,
    supporting,
    scope: {
      targetStableKeys: [prioritized.stable_key],
      entityLocators: linkedEntities.map((entity) => entity.locator),
    },
  };
}
