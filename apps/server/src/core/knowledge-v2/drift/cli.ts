import { randomUUID } from "node:crypto";
import { resolve } from "node:path";

import type { GlobalArgs } from "@server/core/game-registry/runtime-options.js";
import { gameKnowledgeRoot } from "@server/core/knowledge/paths.js";
import { createCodeFileCache } from "../apply/resolver.js";
import { resolveKnowledgeCheckout } from "../checkout.js";
import { parseLocator } from "../locator.js";
import { enqueueIndexTask, type SubjectRef } from "../records/index.js";
import { immediateTransaction, openKnowledgeStore, type KnowledgeStore } from "../storage/store.js";
import { flagCodeDrift } from "./flagger.js";

type DriftStatus = "unchanged" | "drifted" | "unresolvable";

export interface DriftScanSummary {
  scanned: number;
  flagged: number;
  enqueued: number;
  by_status: Record<DriftStatus, number>;
}

interface SubjectRow {
  target_id: string | null;
  entity_id: string | null;
}

interface UnitRef {
  unit: string;
  unitEntityId: string;
}

interface DriftTaskSubject {
  target_id?: string;
  entity_id?: string;
  drifted: number;
  unresolvable: number;
}

export async function kg2DriftScan(globals: GlobalArgs, args: Map<string, string | true>): Promise<void> {
  const explicitRoot = optionalStringArg(args, "--knowledge-root");
  if (explicitRoot === undefined && isTestRunner()) {
    throw new Error(
      "kg2-drift-scan refuses to touch the default knowledge root under a test runner; pass --knowledge-root <temp dir>",
    );
  }

  const gameId = globals.game?.gameId ?? globals.gameId ?? "melee";
  const knowledgeRoot = explicitRoot === undefined ? gameKnowledgeRoot(gameId) : resolve(explicitRoot);
  const limit = optionalNonNegativeIntegerArg(args, "--limit");
  const dryRun = args.get("--dry-run") === true;
  const enqueue = booleanArg(args, "--enqueue", true);
  const checkout = resolveKnowledgeCheckout({
    gameId,
    stateDir: globals.stateDir,
    explicitCheckoutRoot: optionalStringArg(args, "--checkout-root"),
  });
  console.log(`[kg2-drift-scan] checkout ${checkout.checkoutRoot} @ ${checkout.headRevision} (${checkout.source})`);
  const store = openKnowledgeStore({ knowledgeRoot });
  try {
    const summary = scanCodeDrift(store, {
      checkoutRoot: checkout.checkoutRoot,
      headRevision: checkout.headRevision,
      limit,
      enqueue: enqueue && !dryRun,
    });
    console.log(JSON.stringify(summary));
  } finally {
    store.close();
  }
}

export function scanCodeDrift(
  store: KnowledgeStore,
  options: { checkoutRoot: string; headRevision?: string; limit?: number; enqueue?: boolean },
): DriftScanSummary {
  const subjects = subjectsWithCodeEvidence(store, options.limit);
  const summary: DriftScanSummary = {
    scanned: 0,
    flagged: 0,
    enqueued: 0,
    by_status: { unchanged: 0, drifted: 0, unresolvable: 0 },
  };
  let headRevision = options.headRevision;
  const codeFileCache = createCodeFileCache(options.checkoutRoot);
  const flaggedByUnit = new Map<string, UnitRef & { subjects: DriftTaskSubject[] }>();

  for (const subject of subjects) {
    const report = flagCodeDrift(store, {
      subject,
      checkoutRoot: options.checkoutRoot,
      headRevision,
      codeFileCache,
    });
    headRevision ??= report.head_revision;
    summary.scanned += 1;
    for (const evidence of report.evidence) summary.by_status[evidence.status] += 1;
    if (report.drifted_count + report.unresolvable_count === 0) continue;
    summary.flagged += 1;
    if (options.enqueue === false) continue;

    const entry = unitForSubject(store, subject);
    const key = `${entry.unitEntityId}\0${entry.unit}`;
    const batch = flaggedByUnit.get(key) ?? {
      unit: entry.unit,
      unitEntityId: entry.unitEntityId,
      subjects: [],
    };
    batch.subjects.push({
      ...(subject.targetId === undefined
        ? { entity_id: subject.entityId }
        : { target_id: subject.targetId }),
      drifted: report.drifted_count,
      unresolvable: report.unresolvable_count,
    });
    flaggedByUnit.set(key, batch);
  }

  for (const batch of flaggedByUnit.values()) {
    const payload = JSON.stringify({
      unit: batch.unit,
      unit_entity_id: batch.unitEntityId,
      subjects: batch.subjects,
      reason: "drift",
    });
    const enqueued = immediateTransaction(store.db, () => {
      if (hasPendingDriftTask(store, batch)) return false;
      enqueueIndexTask(store, {
        id: `task:drift_recheck:${randomUUID()}`,
        pathway: "drift_recheck",
        payload,
      });
      return true;
    });
    if (enqueued) summary.enqueued += 1;
  }

  return summary;
}

function subjectsWithCodeEvidence(store: KnowledgeStore, limit: number | undefined): SubjectRef[] {
  const rows = store.db.query<SubjectRow, [number]>(`
    SELECT fact.target_id, fact.entity_id
    FROM fact
    JOIN evidence ON evidence.fact_id = fact.id
    WHERE evidence.kind = 'code'
    GROUP BY fact.target_id, fact.entity_id
    ORDER BY
      CASE WHEN fact.target_id IS NOT NULL THEN 0 ELSE 1 END,
      COALESCE(fact.target_id, fact.entity_id)
    LIMIT ?
  `).all(limit ?? -1);
  return rows.map((row) => row.target_id === null
    ? { entityId: row.entity_id! }
    : { targetId: row.target_id });
}

function unitForSubject(store: KnowledgeStore, subject: SubjectRef): UnitRef {
  if (subject.targetId !== undefined) {
    const row = store.db.query<{ unit: string; unit_entity_id: string }, [string]>(`
      SELECT unit, unit_entity_id
      FROM target
      WHERE id = ?
    `).get(subject.targetId);
    if (!row) throw new Error(`Target not found while grouping drift: ${subject.targetId}`);
    return { unit: row.unit, unitEntityId: row.unit_entity_id };
  }

  const ancestor = store.db.query<{ id: string; locator: string }, [string]>(`
    WITH RECURSIVE lineage(id, kind, locator, parent_entity_id) AS (
      SELECT id, kind, locator, parent_entity_id FROM entity WHERE id = ?
      UNION ALL
      SELECT parent.id, parent.kind, parent.locator, parent.parent_entity_id
      FROM entity parent
      JOIN lineage child ON child.parent_entity_id = parent.id
    )
    SELECT id, locator
    FROM lineage
    WHERE kind = 'translation_unit'
    LIMIT 1
  `).get(subject.entityId);
  const unitEntity = ancestor ?? unitEntityForEvidence(store, subject.entityId);
  if (!unitEntity) {
    throw new Error(`Translation unit not found while grouping entity drift: ${subject.entityId}`);
  }
  const target = store.db.query<{ unit: string }, [string]>(`
    SELECT unit
    FROM target
    WHERE unit_entity_id = ?
    ORDER BY CASE identity_status WHEN 'current' THEN 0 ELSE 1 END, id
    LIMIT 1
  `).get(unitEntity.id);
  return { unit: target?.unit ?? unitEntity.locator, unitEntityId: unitEntity.id };
}

function unitEntityForEvidence(
  store: KnowledgeStore,
  entityId: string,
): { id: string; locator: string } | null {
  const locators = store.db.query<{ locator: string }, [string]>(`
    SELECT evidence.locator
    FROM fact
    JOIN evidence ON evidence.fact_id = fact.id
    WHERE fact.entity_id = ? AND evidence.kind = 'code'
    ORDER BY evidence.id
  `).all(entityId);
  const findUnit = store.db.query<{ id: string; locator: string }, [string]>(`
    SELECT id, locator
    FROM entity
    WHERE kind = 'translation_unit' AND locator = ?
    LIMIT 1
  `);
  for (const row of locators) {
    try {
      const parsed = parseLocator(row.locator, "code");
      if (parsed.kind !== "code") continue;
      const unit = findUnit.get(parsed.path);
      if (unit) return unit;
    } catch {
      continue;
    }
  }
  return null;
}

function hasPendingDriftTask(store: KnowledgeStore, unit: UnitRef): boolean {
  return store.db.query<{ found: number }, [string, string]>(`
    SELECT 1 AS found
    FROM index_task
    WHERE pathway = 'drift_recheck'
      AND done_at IS NULL
      AND (
        CASE WHEN json_valid(payload)
          THEN COALESCE(
            json_extract(payload, '$.unit_entity_id'),
            json_extract(payload, '$.task_payload.unit_entity_id')
          )
        END = ?
        OR CASE WHEN json_valid(payload)
          THEN COALESCE(
            json_extract(payload, '$.unit'),
            json_extract(payload, '$.task_payload.unit')
          )
        END = ?
      )
    LIMIT 1
  `).get(unit.unitEntityId, unit.unit) !== null;
}

function optionalStringArg(args: Map<string, string | true>, name: string): string | undefined {
  const value = args.get(name);
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value.trim().length === 0) throw new Error(`${name} requires a value`);
  return value;
}

function optionalNonNegativeIntegerArg(args: Map<string, string | true>, name: string): number | undefined {
  const value = args.get(name);
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !/^\d+$/.test(value)) {
    throw new Error(`${name} requires a non-negative integer`);
  }
  return Number(value);
}

function booleanArg(args: Map<string, string | true>, name: string, fallback: boolean): boolean {
  const value = args.get(name);
  if (value === undefined) return fallback;
  if (value === true || value === "true") return true;
  if (value === "false") return false;
  throw new Error(`${name} requires true or false`);
}

function isTestRunner(): boolean {
  return process.env.NODE_ENV === "test"
    || process.env.BUN_TEST !== undefined
    || (typeof Bun !== "undefined" && Bun.env.NODE_ENV === "test");
}
