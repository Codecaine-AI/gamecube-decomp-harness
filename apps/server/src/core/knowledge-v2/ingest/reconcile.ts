import { readFileSync } from "node:fs";
import type { KnowledgeStoreHandle } from "../records/index.js";
import {
  insertEntitiesIfMissing,
  insertTargets,
  markTargetIdentity,
  refreshTargetFromReport,
  upsertTargetStatuses,
  type EntityRowInput,
  type TargetRowInput,
  type TargetStatusInput,
} from "../records/index.js";
import { immediateTransaction, withBusyRetry } from "../storage/transaction.js";
import { formatAddress, shortHash } from "./common.js";
import type { LaneOptions, ReconcileResult } from "./types.js";

export interface ReconcileOptions extends LaneOptions {
  reportPath: string;
}

interface ReportFunction {
  name: string;
  size?: string;
  fuzzy_match_percent?: number;
  metadata?: { virtual_address?: string };
}

interface ReportSection {
  name: string;
  size?: string;
  fuzzy_match_percent?: number;
  metadata?: { virtual_address?: string };
}

interface ReportUnit {
  name: string;
  measures?: { fuzzy_match_percent?: number; total_code?: string };
  functions?: ReportFunction[];
  sections?: ReportSection[];
  metadata?: { complete?: boolean; source_path?: string };
}

interface ObjdiffReport {
  units?: ReportUnit[];
}

interface StoredTarget {
  id: string;
  kind: "data" | "function";
  stable_key: string;
  unit: string;
  address: string;
  identity_status: "current" | "moved" | "unresolved" | "retired";
}

interface RenameCandidate {
  id: string;
  kind: "data" | "function";
  unit: string;
  stableKey: string;
  address: string;
}

type RenamePair = ReconcileResult["renames"]["pairs"][number] & {
  fromId: string;
  toId: string;
};

function pairRenames(
  unresolved: readonly StoredTarget[],
  inserted: readonly TargetRowInput[],
): { pairs: RenamePair[]; ambiguous: ReconcileResult["renames"]["ambiguous"] } {
  const groups = new Map<string, { unit: string; address: string; unresolved: RenameCandidate[]; inserted: RenameCandidate[] }>();
  const add = (side: "unresolved" | "inserted", row: RenameCandidate): void => {
    const key = `${row.unit}\u0000${row.kind}\u0000${row.address}`;
    const group = groups.get(key) ?? { unit: row.unit, address: row.address, unresolved: [], inserted: [] };
    group[side].push(row);
    groups.set(key, group);
  };
  for (const row of unresolved) add("unresolved", {
    id: row.id, kind: row.kind, unit: row.unit, stableKey: row.stable_key, address: row.address,
  });
  for (const row of inserted) add("inserted", {
    id: row.id, kind: row.kind, unit: row.unit, stableKey: row.stableKey, address: row.address,
  });

  const pairs: RenamePair[] = [];
  const ambiguous: ReconcileResult["renames"]["ambiguous"] = [];
  for (const [, group] of [...groups].sort(([left], [right]) => left.localeCompare(right))) {
    if (group.unresolved.length === 0) continue;
    group.unresolved.sort((left, right) => left.stableKey.localeCompare(right.stableKey));
    group.inserted.sort((left, right) => left.stableKey.localeCompare(right.stableKey));
    if (group.unresolved.length === 1 && group.inserted.length === 1) {
      const from = group.unresolved[0]!;
      const to = group.inserted[0]!;
      pairs.push({
        fromId: from.id,
        toId: to.id,
        from_stable_key: from.stableKey,
        to_stable_key: to.stableKey,
        address: group.address,
        moved_rows: { fact: 0, link: 0, worker_run: 0, pull_request: 0, event: 0, subject_index_state: 0 },
        fact_collisions: 0,
      });
    } else {
      ambiguous.push({
        unit: group.unit,
        address: group.address,
        unresolved: group.unresolved.map((row) => row.stableKey),
        inserted: group.inserted.map((row) => row.stableKey),
      });
    }
  }
  return { pairs, ambiguous };
}

function applyRename(store: KnowledgeStoreHandle, pair: RenamePair, reportRevision: string): void {
  const oldFacts = store.db.query<{ id: string; type: string; updated_at: string }, [string]>(
    "SELECT id, type, updated_at FROM fact WHERE target_id = ? ORDER BY type, id",
  ).all(pair.fromId);
  const newFacts = new Map(store.db.query<{ id: string; type: string; updated_at: string }, [string]>(
    "SELECT id, type, updated_at FROM fact WHERE target_id = ? ORDER BY type, id",
  ).all(pair.toId).map((row) => [row.type, row]));

  for (const oldFact of oldFacts) {
    const newFact = newFacts.get(oldFact.type);
    if (newFact === undefined) {
      pair.moved_rows.fact += store.db.query("UPDATE fact SET target_id = ? WHERE id = ?").run(pair.toId, oldFact.id).changes;
      continue;
    }
    pair.fact_collisions += 1;
    if (oldFact.updated_at > newFact.updated_at) {
      store.db.query("DELETE FROM fact WHERE id = ?").run(newFact.id);
      pair.moved_rows.fact += store.db.query("UPDATE fact SET target_id = ? WHERE id = ?").run(pair.toId, oldFact.id).changes;
    } else {
      store.db.query("DELETE FROM fact WHERE id = ?").run(oldFact.id);
    }
  }

  pair.moved_rows.link = store.db.query(`UPDATE link SET
    from_target_id = CASE WHEN from_target_id = ? THEN ? ELSE from_target_id END,
    to_target_id = CASE WHEN to_target_id = ? THEN ? ELSE to_target_id END
    WHERE from_target_id = ? OR to_target_id = ?`).run(
    pair.fromId, pair.toId, pair.fromId, pair.toId, pair.fromId, pair.fromId,
  ).changes;
  for (const table of ["worker_run", "pull_request", "event"] as const) {
    pair.moved_rows[table] = store.db.query(`UPDATE ${table} SET target_id = ? WHERE target_id = ?`).run(pair.toId, pair.fromId).changes;
  }

  const oldStamp = store.db.query<{ indexed_at: string }, [string]>(
    "SELECT indexed_at FROM subject_index_state WHERE target_id = ?",
  ).get(pair.fromId);
  if (oldStamp !== null) {
    const newStamp = store.db.query<{ indexed_at: string }, [string]>(
      "SELECT indexed_at FROM subject_index_state WHERE target_id = ?",
    ).get(pair.toId);
    if (newStamp === null) {
      pair.moved_rows.subject_index_state = store.db.query(
        "UPDATE subject_index_state SET target_id = ? WHERE target_id = ?",
      ).run(pair.toId, pair.fromId).changes;
    } else {
      if (oldStamp.indexed_at > newStamp.indexed_at) {
        store.db.query("UPDATE subject_index_state SET indexed_at = ? WHERE target_id = ?").run(oldStamp.indexed_at, pair.toId);
      }
      pair.moved_rows.subject_index_state = store.db.query(
        "DELETE FROM subject_index_state WHERE target_id = ?",
      ).run(pair.fromId).changes;
    }
  }

  store.db.query("UPDATE target SET identity_status = 'moved', moved_to_id = ?, report_revision = ? WHERE id = ?")
    .run(pair.toId, reportRevision, pair.fromId);
}

type ReconcileTargetRow = Omit<TargetRowInput, "unitEntityId" | "symbol" | "address"> & {
  unitEntityId: string | null;
  symbol: string | null;
  address: string | null;
};

function parseInteger(value: string | undefined): number | null {
  if (value === undefined) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

export function validateTargetRow(row: ReconcileTargetRow): string | null {
  if (row.symbol == null) return `${row.kind} target is missing symbol`;
  if (row.address == null) return `${row.kind} target is missing address`;
  if (row.unitEntityId == null) return `${row.kind} target is missing translation unit entity`;
  return null;
}

export function translationUnitEntity(sourcePath: string): EntityRowInput {
  return {
    id: `translation_unit:${sourcePath}`,
    kind: "translation_unit",
    locator: sourcePath,
  };
}

export function reconcileReport(store: KnowledgeStoreHandle, options: ReconcileOptions): ReconcileResult {
  const rawReport = readFileSync(options.reportPath, "utf8");
  const report = JSON.parse(rawReport) as ObjdiffReport;
  const reportRevision = shortHash(rawReport);
  const updatedAt = (options.now ?? (() => new Date().toISOString()))();
  const desired: TargetRowInput[] = [];
  const desiredUnitEntities = new Map<string, EntityRowInput>();
  const statuses: TargetStatusInput[] = [];
  const refusedKeys = new Set<string>();
  const skippedMalformedSample: ReconcileResult["skippedMalformedSample"] = [];
  let skippedMalformed = 0;

  const refuse = (row: ReconcileTargetRow, reason: string): void => {
    refusedKeys.add(`${row.kind}:${row.stableKey}`);
    skippedMalformed += 1;
    if (skippedMalformedSample.length < 10) {
      skippedMalformedSample.push({ unit: row.unit, symbol: row.symbol ?? null, reason });
    }
  };

  const acceptCandidate = (row: ReconcileTargetRow, status?: TargetStatusInput): boolean => {
    const reason = validateTargetRow(row);
    if (reason !== null) {
      refuse(row, reason);
      return false;
    }
    desired.push({
      ...row,
      unitEntityId: row.unitEntityId!,
      symbol: row.symbol!,
      address: row.address!,
    });
    if (status !== undefined) statuses.push(status);
    return true;
  };

  for (const unit of report.units ?? []) {
    const sourcePath = unit.metadata?.source_path;
    const unitEntity = sourcePath === undefined ? null : translationUnitEntity(sourcePath);
    if (unitEntity !== null) desiredUnitEntities.set(unitEntity.locator, unitEntity);
    // Objdiff's unit completeness is the available v1 linked signal; functions inherit it.
    const linked = unit.metadata?.complete === true;

    for (const fn of unit.functions ?? []) {
      const stableKey = `${unit.name}:${fn.name}`;
      const functionId = `target:function:${stableKey}`;
      const functionRow: ReconcileTargetRow = {
        id: functionId,
        kind: "function",
        unit: unit.name,
        unitEntityId: unitEntity?.id ?? null,
        symbol: fn.name,
        stableKey,
        address: fn.metadata?.virtual_address === undefined ? null : formatAddress(fn.metadata.virtual_address),
        identityStatus: "current",
        reportRevision,
      };
      const functionStatus: TargetStatusInput = {
        targetId: functionId,
        matchPct: fn.fuzzy_match_percent ?? 0,
        linked,
        size: parseInteger(fn.size),
        // Objdiff v1 has no per-function bytes hash, so the schema-supported value remains null.
        contentHash: null,
        reportRevision,
        updatedAt,
      };
      acceptCandidate(functionRow, functionStatus);
    }

    for (const section of unit.sections ?? []) {
      // .text is the code section whose match is already represented by that unit's function targets, so a .text data row would double-count.
      if (section.name === ".text") continue;

      const stableKey = `${unit.name}:${section.name}`;
      const dataId = `target:data:${stableKey}`;
      const dataRow: ReconcileTargetRow = {
        id: dataId,
        kind: "data",
        unit: unit.name,
        unitEntityId: unitEntity?.id ?? null,
        symbol: section.name,
        stableKey,
        address: section.metadata?.virtual_address === undefined
          ? null
          : formatAddress(section.metadata.virtual_address),
        identityStatus: "current",
        reportRevision,
      };
      // A missing fuzzy_match_percent is a missing score, not a malformed identity, so the target is tracked and simply has no status until the report supplies one; defaulting to 0 would fabricate an "unmatched" score.
      const dataStatus: TargetStatusInput | undefined = section.fuzzy_match_percent === undefined
        ? undefined
        : {
            targetId: dataId,
            matchPct: section.fuzzy_match_percent,
            linked,
            size: parseInteger(section.size),
            contentHash: null,
            reportRevision,
            updatedAt,
          };
      acceptCandidate(dataRow, dataStatus);
    }
  }

  if (skippedMalformed > 0) {
    const first = skippedMalformedSample[0]!;
    console.warn(
      `Skipped ${skippedMalformed} malformed reconcile target${skippedMalformed === 1 ? "" : "s"}; first: unit=${first.unit} symbol=${first.symbol ?? "null"} reason=${first.reason}`,
    );
  }

  const stored = store.db.query<StoredTarget, []>(
    "SELECT id, kind, stable_key, unit, address, identity_status FROM target WHERE kind IN ('function', 'data')",
  ).all();
  const storedByKey = new Map(stored.map((row) => [`${row.kind}:${row.stable_key}`, row]));
  const seenKeys = new Set([...desired.map((row) => `${row.kind}:${row.stableKey}`), ...refusedKeys]);
  const inserted = desired.filter((row) => !storedByKey.has(`${row.kind}:${row.stableKey}`));
  const refreshed = desired.flatMap((row) => {
    const existing = storedByKey.get(`${row.kind}:${row.stableKey}`);
    return existing ? [{ existing, row }] : [];
  });
  // Without explicit move/retirement mappings, every unmapped vanished current target is unresolved.
  const unresolved = stored.filter(
    (row) => row.identity_status === "current" && !seenKeys.has(`${row.kind}:${row.stable_key}`),
  );
  const existingUnitLocators = new Set(store.db.query<{ locator: string }, []>(
    "SELECT locator FROM entity WHERE kind = 'translation_unit'",
  ).all().map(({ locator }) => locator));
  const unitEntitiesInserted = [...desiredUnitEntities.values()].filter(
    ({ locator }) => !existingUnitLocators.has(locator),
  );
  const renames = pairRenames(unresolved, inserted);

  const applyMutations = (): void => {
    insertEntitiesIfMissing(store, unitEntitiesInserted);
    insertTargets(store, inserted.filter((row) => row.kind === "data"));
    insertTargets(store, inserted.filter((row) => row.kind === "function"));
    for (const { existing, row } of refreshed) {
      refreshTargetFromReport(store, existing.id, {
        address: row.address,
        identityStatus: "current",
        reportRevision,
      });
      store.db.query("UPDATE target SET unit_entity_id = ? WHERE id = ?").run(row.unitEntityId, existing.id);
    }
    for (const row of unresolved) markTargetIdentity(store, row.id, "unresolved", reportRevision);
    upsertTargetStatuses(store, statuses);
  };

  if (options.dryRun) {
    withBusyRetry(() => {
      store.db.exec("BEGIN IMMEDIATE");
      let mutationFailed = false;
      let mutationError: unknown;
      try {
        applyMutations();
        for (const pair of renames.pairs) applyRename(store, pair, reportRevision);
      } catch (error) {
        mutationFailed = true;
        mutationError = error;
      }
      try {
        store.db.exec("ROLLBACK");
      } catch (rollbackError) {
        if (!mutationFailed) throw rollbackError;
      }
      if (mutationFailed) throw mutationError;
    });
  } else {
    immediateTransaction(store.db, applyMutations);
    for (const pair of renames.pairs) immediateTransaction(store.db, () => applyRename(store, pair, reportRevision));
  }

  return {
    reportRevision,
    unitsInserted: unitEntitiesInserted.length,
    functionsInserted: inserted.filter((row) => row.kind === "function").length,
    dataInserted: inserted.filter((row) => row.kind === "data").length,
    refreshed: refreshed.length,
    unresolved: unresolved.length,
    statusesUpserted: statuses.length,
    skippedMalformed,
    skippedMalformedSample,
    renames: {
      applied: renames.pairs.length,
      ambiguous: renames.ambiguous,
      pairs: renames.pairs.map(({ fromId: _fromId, toId: _toId, ...pair }) => pair),
    },
  };
}
