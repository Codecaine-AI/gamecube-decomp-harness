import { createHash } from "node:crypto";
import type { Database } from "bun:sqlite";
import {
  DISPATCH_HANDOFF_SNAPSHOTS_DDL,
  DISPATCH_HANDOFF_SNAPSHOTS_TABLE_DDL,
} from "./ddl.js";
import { rebuildTable } from "./rebuild-table.js";
import type { StorageMigration } from "./types.js";

function columnNames(db: Database, table: string): Set<string> {
  return new Set(
    (db.query(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).map(
      (column) => column.name,
    ),
  );
}

function tableExists(db: Database, table: string): boolean {
  return Boolean(db.query("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(table));
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number" && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(",")}}`;
  }
  throw new Error(`Dispatch handoff snapshot contains a non-JSON value: ${String(value)}`);
}

function parseObject(value: string | null, label: string): Record<string, unknown> | null {
  if (value === null) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("expected an object");
    return parsed as Record<string, unknown>;
  } catch (error) {
    throw new Error(`Cannot backfill dispatch handoff snapshot ${label}: invalid JSON`, { cause: error });
  }
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

const SNAPSHOT_UPDATE_TRIGGER = "dispatch_handoff_snapshots_immutable_update";
const SNAPSHOT_DELETE_TRIGGER = "dispatch_handoff_snapshots_immutable_delete";
const SNAPSHOT_PROJECT_INDEX = "dispatch_handoff_snapshots_project_created";

interface SnapshotRow {
  snapshot_id: string;
  project_id: string;
  content_json: string | null;
  content_hash: string | null;
  old_lease_holder_json: string;
  requested_handoff_json: string | null;
  terminal_project_revision: number;
  release_event_id: string | null;
  acquisition_event_id: string | null;
}

interface ProjectEventRow {
  sequence: number;
  event_id: string;
  event_type: string;
  project_id: string;
  causation_id: string;
  payload_json: string;
}

function eventPayload(event: ProjectEventRow): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(event.payload_json);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

function releaseEventMatches(event: ProjectEventRow, row: SnapshotRow): boolean {
  if (event.event_type !== "project.dispatch_released" || event.project_id !== row.project_id) return false;
  const payload = eventPayload(event);
  if (!payload || payload.handoff_snapshot_id !== row.snapshot_id) return false;
  if (!Object.prototype.hasOwnProperty.call(payload, "handoff_snapshot_content_hash")) return true;
  return payload.handoff_snapshot_content_hash === row.content_hash;
}

function acquisitionEventMatches(
  event: ProjectEventRow,
  row: SnapshotRow,
  releaseEventId: string,
): boolean {
  if (
    event.event_type !== "project.dispatch_acquired" ||
    event.project_id !== row.project_id ||
    event.causation_id !== releaseEventId
  ) return false;
  const payload = eventPayload(event);
  return Boolean(
    payload &&
    payload.handoff_snapshot_id === row.snapshot_id &&
    payload.handoff_snapshot_content_hash === row.content_hash
  );
}

function eventById(db: Database, eventId: string): ProjectEventRow | null {
  return db.query(`
    SELECT sequence, event_id, event_type, project_id, causation_id, payload_json
    FROM project_events
    WHERE event_id = ?
  `).get(eventId) as ProjectEventRow | null;
}

function releaseCandidates(db: Database, row: SnapshotRow): ProjectEventRow[] {
  return (db.query(`
    SELECT sequence, event_id, event_type, project_id, causation_id, payload_json
    FROM project_events
    WHERE project_id = ? AND event_type = 'project.dispatch_released'
    ORDER BY sequence, event_id
  `).all(row.project_id) as ProjectEventRow[]).filter((event) => releaseEventMatches(event, row));
}

function acquisitionEvents(db: Database, releaseEventId: string): ProjectEventRow[] {
  return db.query(`
    SELECT sequence, event_id, event_type, project_id, causation_id, payload_json
    FROM project_events
    WHERE event_type = 'project.dispatch_acquired'
      AND causation_id = ?
    ORDER BY sequence, event_id
  `).all(releaseEventId) as ProjectEventRow[];
}

function candidateSummary(candidates: ProjectEventRow[]): string {
  return candidates.length === 0 ? "none" : candidates.map((event) => event.event_id).join(", ");
}

function repairEventLinks(db: Database, rows: SnapshotRow[]): void {
  for (const row of rows) {
    if (row.release_event_id !== null) {
      const linked = eventById(db, row.release_event_id);
      if (!linked) {
        throw new Error(
          `Cannot validate dispatch handoff snapshot ${row.snapshot_id} release_event_id ` +
          `${row.release_event_id}: linked event is missing`,
        );
      }
      if (!releaseEventMatches(linked, row)) {
        throw new Error(
          `Cannot validate dispatch handoff snapshot ${row.snapshot_id} release_event_id ` +
          `${row.release_event_id}: linked event does not match the snapshot, project, content hash, ` +
          "or required release event type",
        );
      }
      continue;
    }

    const candidates = releaseCandidates(db, row);
    if (candidates.length !== 1) {
      throw new Error(
        `Cannot validate dispatch handoff snapshot ${row.snapshot_id} release event: ` +
        `expected one valid same-project candidate, found ${candidates.length} (${candidateSummary(candidates)})`,
      );
    }
    row.release_event_id = candidates[0]!.event_id;
  }

  for (const row of rows) {
    const releaseEventId = row.release_event_id;
    if (releaseEventId === null) {
      throw new Error(`Cannot validate dispatch handoff snapshot ${row.snapshot_id}: release event is missing`);
    }
    if (row.acquisition_event_id !== null) {
      const linked = eventById(db, row.acquisition_event_id);
      if (!linked) {
        throw new Error(
          `Cannot validate dispatch handoff snapshot ${row.snapshot_id} acquisition_event_id ` +
          `${row.acquisition_event_id}: linked event is missing`,
        );
      }
      if (!acquisitionEventMatches(linked, row, releaseEventId)) {
        throw new Error(
          `Cannot validate dispatch handoff snapshot ${row.snapshot_id} acquisition_event_id ` +
          `${row.acquisition_event_id}: linked event does not match the validated release causation, ` +
          "snapshot, project, content hash, or required acquisition event type",
        );
      }
      continue;
    }

    const related = acquisitionEvents(db, releaseEventId);
    const candidates = related.filter((event) => acquisitionEventMatches(event, row, releaseEventId));
    if (candidates.length > 1) {
      throw new Error(
        `Cannot validate dispatch handoff snapshot ${row.snapshot_id} acquisition event: ` +
        `expected at most one valid same-project candidate, found ${candidates.length} (${candidateSummary(candidates)})`,
      );
    }
    if (candidates.length === 1) {
      row.acquisition_event_id = candidates[0]!.event_id;
      continue;
    }
    if (related.length > 0) {
      throw new Error(
        `Cannot validate dispatch handoff snapshot ${row.snapshot_id} acquisition event: ` +
        "no valid same-project event names the snapshot id and content hash",
      );
    }
  }
}

function backfillHandoffSnapshots(db: Database): void {
  const preservedSchemaObjects = db.query(`
    SELECT type, name, sql
    FROM sqlite_master
    WHERE tbl_name = 'dispatch_handoff_snapshots'
      AND sql IS NOT NULL
      AND (
        (type = 'trigger' AND name NOT IN (?, ?)) OR
        (type = 'index' AND name != ?)
      )
    ORDER BY type, name
  `).all(
    SNAPSHOT_UPDATE_TRIGGER,
    SNAPSHOT_DELETE_TRIGGER,
    SNAPSHOT_PROJECT_INDEX,
  ) as Array<{ type: "index" | "trigger"; name: string; sql: string }>;

  db.exec(`
    DROP TRIGGER IF EXISTS ${SNAPSHOT_UPDATE_TRIGGER};
    DROP TRIGGER IF EXISTS ${SNAPSHOT_DELETE_TRIGGER};
  `);

  const snapshotColumns = columnNames(db, "dispatch_handoff_snapshots");
  if (!snapshotColumns.has("content_json")) {
    db.exec("ALTER TABLE dispatch_handoff_snapshots ADD COLUMN content_json TEXT");
  }
  if (!snapshotColumns.has("content_hash")) {
    db.exec("ALTER TABLE dispatch_handoff_snapshots ADD COLUMN content_hash TEXT");
  }
  if (!snapshotColumns.has("acquisition_event_id")) {
    db.exec("ALTER TABLE dispatch_handoff_snapshots ADD COLUMN acquisition_event_id TEXT");
  }

  const rows = db.query(`
    SELECT snapshot_id, project_id, content_json, content_hash,
           old_lease_holder_json, requested_handoff_json,
           terminal_project_revision, release_event_id, acquisition_event_id
    FROM dispatch_handoff_snapshots
    ORDER BY snapshot_id
  `).all() as SnapshotRow[];

  for (const row of rows) {
    const content = row.content_json === null
      ? {
          schema_version: 1,
          project_id: row.project_id,
          old_lease_holder: parseObject(row.old_lease_holder_json, `${row.snapshot_id} old lease holder`),
          requested_handoff: parseObject(row.requested_handoff_json, `${row.snapshot_id} requested handoff`),
          terminal_project_revision: Number(row.terminal_project_revision),
        }
      : parseObject(row.content_json, `${row.snapshot_id} content`);
    const contentJson = canonicalJson(content);
    const contentHash = sha256(contentJson);
    if (row.content_hash !== null && row.content_hash !== contentHash) {
      throw new Error(
        `Dispatch handoff snapshot ${row.snapshot_id} content hash mismatch: stored ${row.content_hash}, computed ${contentHash}`,
      );
    }
    row.content_json = contentJson;
    row.content_hash = contentHash;
  }

  if (rows.length > 0) {
    const eventColumns = columnNames(db, "project_events");
    const missingEventColumns = [
      "sequence", "event_id", "event_type", "project_id", "causation_id", "payload_json",
    ].filter((column) => !eventColumns.has(column));
    if (missingEventColumns.length > 0) {
      throw new Error(
        "Cannot validate dispatch handoff snapshot event links: project_events is missing " +
        missingEventColumns.join(", "),
      );
    }
    repairEventLinks(db, rows);
  }

  db.exec(`
    CREATE TEMP TABLE dispatch_handoff_snapshot_repairs_016 (
      snapshot_id TEXT PRIMARY KEY,
      content_json TEXT NOT NULL,
      content_hash TEXT NOT NULL,
      release_event_id TEXT NOT NULL,
      acquisition_event_id TEXT
    ) WITHOUT ROWID
  `);
  const insertRepair = db.query(`
    INSERT INTO dispatch_handoff_snapshot_repairs_016 (
      snapshot_id, content_json, content_hash, release_event_id, acquisition_event_id
    ) VALUES (?, ?, ?, ?, ?)
  `);
  for (const row of rows) {
    insertRepair.run(
      row.snapshot_id,
      row.content_json,
      row.content_hash,
      row.release_event_id,
      row.acquisition_event_id,
    );
  }

  rebuildTable(
    db,
    "dispatch_handoff_snapshots",
    DISPATCH_HANDOFF_SNAPSHOTS_TABLE_DDL,
    `INSERT INTO dispatch_handoff_snapshots (
       snapshot_id, project_id, content_json, content_hash,
       old_lease_holder_json, requested_handoff_json, terminal_project_revision,
       release_event_id, acquisition_event_id, created_at
     )
     SELECT old.snapshot_id, old.project_id, repair.content_json, repair.content_hash,
            old.old_lease_holder_json, old.requested_handoff_json, old.terminal_project_revision,
            repair.release_event_id, repair.acquisition_event_id, old.created_at
     FROM dispatch_handoff_snapshots__migration_old AS old
     JOIN dispatch_handoff_snapshot_repairs_016 AS repair USING (snapshot_id)`,
  );
  db.exec("DROP TABLE dispatch_handoff_snapshot_repairs_016");
  for (const schemaObject of preservedSchemaObjects) db.exec(schemaObject.sql);
}

export const eventConventionsMigration: StorageMigration = {
  version: 16,
  name: "event_conventions",
  up(db) {
    const eventColumns = columnNames(db, "project_events");
    if (!eventColumns.has("parent_span_id")) {
      db.exec("ALTER TABLE project_events ADD COLUMN parent_span_id TEXT");
    }

    const syncColumns = columnNames(db, "sync_state");
    if (!syncColumns.has("blocked_origin_status")) {
      db.exec("ALTER TABLE sync_state ADD COLUMN blocked_origin_status TEXT");
    }
    if (!syncColumns.has("validation_evidence_json")) {
      db.exec("ALTER TABLE sync_state ADD COLUMN validation_evidence_json TEXT");
    }
    if (!syncColumns.has("resolved_conflict_paths_json")) {
      db.exec("ALTER TABLE sync_state ADD COLUMN resolved_conflict_paths_json TEXT NOT NULL DEFAULT '[]'");
    }
    if (tableExists(db, "dispatch_handoff_snapshots")) {
      backfillHandoffSnapshots(db);
    }

    const completeSyncColumns = columnNames(db, "sync_state");
    const completeEventColumns = columnNames(db, "project_events");
    const canBackfillFromEvents = [
      "sequence", "event_type", "subject_kind", "subject_id", "payload_json",
    ].every((column) => completeEventColumns.has(column));
    const stagingEvidenceExpression = completeSyncColumns.has("staging_json")
      ? "CASE WHEN json_valid(sync_state.staging_json) THEN json_extract(sync_state.staging_json, '$.validation_evidence') END"
      : "NULL";
    if (canBackfillFromEvents && completeSyncColumns.has("status")) {
      db.exec(`
        UPDATE sync_state
        SET blocked_origin_status = (
          SELECT json_extract(project_events.payload_json, '$.previous_status')
          FROM project_events
          WHERE project_events.event_type = 'sync.blocked'
            AND project_events.subject_kind IN ('sync', 'sync_workflow')
            AND project_events.subject_id = sync_state.sync_id
            AND json_valid(project_events.payload_json)
          ORDER BY project_events.sequence DESC
          LIMIT 1
        )
        WHERE sync_state.status = 'blocked'
          AND sync_state.blocked_origin_status IS NULL
      `);
    }
    if (canBackfillFromEvents) {
      db.exec(`
        UPDATE sync_state
        SET validation_evidence_json = COALESCE(
          (
            SELECT json_extract(project_events.payload_json, '$.validation_evidence')
            FROM project_events
            WHERE project_events.event_type = 'sync.validated'
              AND project_events.subject_kind IN ('sync', 'sync_workflow')
              AND project_events.subject_id = sync_state.sync_id
              AND json_valid(project_events.payload_json)
              AND json_extract(project_events.payload_json, '$.validation_evidence') IS NOT NULL
            ORDER BY project_events.sequence DESC
            LIMIT 1
          ),
          ${stagingEvidenceExpression}
        )
        WHERE sync_state.validation_evidence_json IS NULL
      `);
    }

    if (canBackfillFromEvents && completeSyncColumns.has("staging_json")) {
      const rows = db.query(
        `SELECT sync_id, status, staging_json, resolved_conflict_paths_json
         FROM sync_state
         WHERE resolved_conflict_paths_json = '[]'`,
      ).all() as Array<{
        sync_id: string;
        status: string;
        staging_json: string | null;
        resolved_conflict_paths_json: string;
      }>;
      for (const row of rows) {
        const resolved = new Set<string>();
        let staging: Record<string, unknown> = {};
        try {
          const parsed: unknown = row.staging_json ? JSON.parse(row.staging_json) : {};
          if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) staging = parsed as Record<string, unknown>;
        } catch {
          staging = {};
        }
        const addStrings = (values: unknown, prefix = ""): void => {
          if (!Array.isArray(values)) return;
          for (const value of values) {
            if (typeof value === "string" && value.trim()) resolved.add(`${prefix}${value}`);
          }
        };
        addStrings(staging.auto_resolved_paths);
        if (Array.isArray(staging.pr_workspaces)) {
          for (const candidate of staging.pr_workspaces) {
            if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) continue;
            const workspace = candidate as Record<string, unknown>;
            const branch = typeof workspace.branch === "string" && workspace.branch.trim()
              ? `${workspace.branch}:`
              : "";
            addStrings(workspace.auto_resolved_paths, branch);
          }
        }
        const blockedRows = db.query(
          `SELECT payload_json FROM project_events
           WHERE event_type = 'sync.reconciliation_blocked'
             AND subject_kind IN ('sync', 'sync_workflow') AND subject_id = ?
           ORDER BY sequence`,
        ).all(row.sync_id) as Array<{ payload_json: string }>;
        for (const blocked of blockedRows) {
          try {
            const payload = JSON.parse(blocked.payload_json) as Record<string, unknown>;
            addStrings(payload.conflict_identities);
          } catch {
            // Malformed legacy event payloads cannot contribute backfill evidence.
          }
        }
        if (row.status === "blocked") {
          const unresolved = new Set<string>();
          if (Array.isArray(staging.conflicting_paths)) {
            for (const value of staging.conflicting_paths) {
              if (typeof value === "string") unresolved.add(value);
            }
          }
          for (const path of unresolved) resolved.delete(path);
        }
        if (resolved.size > 0) {
          db.query("UPDATE sync_state SET resolved_conflict_paths_json = ? WHERE sync_id = ?")
            .run(JSON.stringify([...resolved].sort()), row.sync_id);
        }
      }
    }

    db.exec(DISPATCH_HANDOFF_SNAPSHOTS_DDL);
  },
};
