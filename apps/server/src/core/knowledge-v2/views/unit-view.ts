import type { KnowledgeStoreHandle } from "../records/index.js";
import type {
  EntityIdentityStatus,
  TargetIdentityStatus,
  TargetKind,
} from "../storage/schema.js";

export interface UnitViewTarget {
  id: string;
  kind: TargetKind;
  unitEntityId: string;
  unit: string;
  symbol: string;
  stableKey: string;
  address: string;
  identityStatus: TargetIdentityStatus;
  reportRevision: string;
  status: {
    matchPct: number;
    linked: boolean;
    size: number | null;
    contentHash: string | null;
    reportRevision: string;
    updatedAt: string;
  } | null;
}

export interface UnitViewRow {
  unit: {
    id: string;
    locator: string;
    identityStatus: EntityIdentityStatus;
  };
  targets: UnitViewTarget[];
  matchPct: number | null;
}

interface UnitViewQueryRow {
  unit_entity_id: string;
  unit_locator: string;
  unit_identity_status: EntityIdentityStatus;
  target_id: string | null;
  target_kind: TargetKind | null;
  target_unit_entity_id: string | null;
  target_unit: string | null;
  target_symbol: string | null;
  target_stable_key: string | null;
  target_address: string | null;
  target_identity_status: TargetIdentityStatus | null;
  target_report_revision: string | null;
  match_pct: number | null;
  linked: number | null;
  size: number | null;
  content_hash: string | null;
  status_report_revision: string | null;
  status_updated_at: string | null;
}

/**
 * Returns one row per translation-unit entity with its current member targets.
 *
 * Match percentage is size-weighted when every member status has a positive
 * size. Otherwise it is the simple average of all member statuses. A unit with
 * no member statuses has a null match percentage.
 */
export function unitView(store: KnowledgeStoreHandle): UnitViewRow[] {
  const rows = store.db.query<UnitViewQueryRow, []>(`
    SELECT
      u.id AS unit_entity_id,
      u.locator AS unit_locator,
      u.identity_status AS unit_identity_status,
      t.id AS target_id,
      t.kind AS target_kind,
      t.unit_entity_id AS target_unit_entity_id,
      t.unit AS target_unit,
      t.symbol AS target_symbol,
      t.stable_key AS target_stable_key,
      t.address AS target_address,
      t.identity_status AS target_identity_status,
      t.report_revision AS target_report_revision,
      s.match_pct,
      s.linked,
      s.size,
      s.content_hash,
      s.report_revision AS status_report_revision,
      s.updated_at AS status_updated_at
    FROM entity u
    LEFT JOIN target t
      ON t.unit_entity_id = u.id
      AND t.identity_status = 'current'
    LEFT JOIN target_status s ON s.target_id = t.id
    WHERE u.kind = 'translation_unit'
    ORDER BY u.locator, u.id, t.address, t.id
  `).all();

  const byUnit = new Map<string, UnitViewRow>();
  for (const row of rows) {
    let unit = byUnit.get(row.unit_entity_id);
    if (!unit) {
      unit = {
        unit: {
          id: row.unit_entity_id,
          locator: row.unit_locator,
          identityStatus: row.unit_identity_status,
        },
        targets: [],
        matchPct: null,
      };
      byUnit.set(row.unit_entity_id, unit);
    }
    if (row.target_id === null) continue;
    unit.targets.push({
      id: row.target_id,
      kind: row.target_kind!,
      unitEntityId: row.target_unit_entity_id!,
      unit: row.target_unit!,
      symbol: row.target_symbol!,
      stableKey: row.target_stable_key!,
      address: row.target_address!,
      identityStatus: row.target_identity_status!,
      reportRevision: row.target_report_revision!,
      status: row.match_pct === null ? null : {
        matchPct: row.match_pct,
        linked: row.linked === 1,
        size: row.size,
        contentHash: row.content_hash,
        reportRevision: row.status_report_revision!,
        updatedAt: row.status_updated_at!,
      },
    });
  }

  for (const unit of byUnit.values()) {
    const statuses = unit.targets.flatMap((target) => target.status === null ? [] : [target.status]);
    if (statuses.length === 0) continue;
    const canWeight = statuses.every((status) => status.size !== null && status.size > 0);
    unit.matchPct = canWeight
      ? statuses.reduce((sum, status) => sum + status.matchPct * status.size!, 0)
        / statuses.reduce((sum, status) => sum + status.size!, 0)
      : statuses.reduce((sum, status) => sum + status.matchPct, 0) / statuses.length;
  }

  return [...byUnit.values()];
}
