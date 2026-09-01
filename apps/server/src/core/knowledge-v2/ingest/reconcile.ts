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
  identity_status: "current" | "moved" | "unresolved" | "retired";
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
    "SELECT id, kind, stable_key, identity_status FROM target WHERE kind IN ('function', 'data')",
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
  };
}
