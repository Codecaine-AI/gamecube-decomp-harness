import { randomUUID } from "node:crypto";
import { immediateTransaction, now, type StateStore } from "./storage/store.js";

export type JsonObject = Record<string, unknown>;

export interface DashboardArtifactRecord {
  id: string;
  runId: string | null;
  gameId: string | null;
  cycleUuid: string | null;
  artifactType: string;
  artifactKey: string;
  sourcePath: string | null;
  sourceLabel: string | null;
  payload: JsonObject;
  createdAt: string;
}

export interface DashboardArtifactInput {
  runId?: string | null;
  gameId?: string | null;
  cycleUuid?: string | null;
  artifactType: string;
  artifactKey: string;
  sourcePath?: string | null;
  sourceLabel?: string | null;
  payload: JsonObject;
  createdAt?: string;
}

export interface DashboardArtifactSelector {
  runId?: string | null;
  gameId?: string | null;
  cycleUuid?: string | null;
  artifactType: string;
  artifactKey?: string | null;
}

function asObject(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonObject) : {};
}

function parsePayload(value: unknown): JsonObject {
  if (value && typeof value === "object") return asObject(value);
  if (typeof value !== "string" || !value.trim()) return {};
  try {
    return asObject(JSON.parse(value));
  } catch {
    return {};
  }
}

function rowToRecord(row: Record<string, unknown>): DashboardArtifactRecord {
  return {
    id: String(row.id ?? ""),
    runId: typeof row.run_id === "string" && row.run_id ? row.run_id : null,
    gameId: typeof row.game_id === "string" && row.game_id ? row.game_id : null,
    cycleUuid: typeof row.cycle_uuid === "string" && row.cycle_uuid ? row.cycle_uuid : null,
    artifactType: String(row.artifact_type ?? ""),
    artifactKey: String(row.artifact_key ?? ""),
    sourcePath: typeof row.source_path === "string" && row.source_path ? row.source_path : null,
    sourceLabel: typeof row.source_label === "string" && row.source_label ? row.source_label : null,
    payload: parsePayload(row.payload_json),
    createdAt: String(row.created_at ?? ""),
  };
}

function selectorWhere(selector: DashboardArtifactSelector): { clauses: string[]; values: Array<string | null> } {
  const clauses = ["artifact_type = ?"];
  const values: Array<string | null> = [selector.artifactType];
  if (selector.artifactKey) {
    clauses.push("artifact_key = ?");
    values.push(selector.artifactKey);
  }
  if (selector.runId !== undefined) {
    clauses.push(selector.runId ? "run_id = ?" : "run_id IS NULL");
    if (selector.runId) values.push(selector.runId);
  }
  if (selector.gameId !== undefined) {
    clauses.push(selector.gameId ? "game_id = ?" : "game_id IS NULL");
    if (selector.gameId) values.push(selector.gameId);
  }
  if (selector.cycleUuid !== undefined) {
    clauses.push(selector.cycleUuid ? "cycle_uuid = ?" : "cycle_uuid IS NULL");
    if (selector.cycleUuid) values.push(selector.cycleUuid);
  }
  return { clauses, values };
}

export function recordDashboardArtifact(store: StateStore, input: DashboardArtifactInput): DashboardArtifactRecord {
  const record: DashboardArtifactRecord = {
    id: randomUUID(),
    runId: input.runId ?? null,
    gameId: input.gameId ?? null,
    cycleUuid: input.cycleUuid ?? null,
    artifactType: input.artifactType,
    artifactKey: input.artifactKey,
    sourcePath: input.sourcePath ?? null,
    sourceLabel: input.sourceLabel ?? null,
    payload: input.payload,
    createdAt: input.createdAt ?? now(),
  };
  immediateTransaction(store.db, () => {
    store.db
      .query(
        `
          INSERT INTO dashboard_artifacts (
            id, run_id, game_id, cycle_uuid, artifact_type, artifact_key,
            source_path, source_label, payload_json, created_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
      )
      .run(
        record.id,
        record.runId,
        record.gameId,
        record.cycleUuid,
        record.artifactType,
        record.artifactKey,
        record.sourcePath,
        record.sourceLabel,
        JSON.stringify(record.payload),
        record.createdAt,
      );
  });
  return record;
}

export function latestDashboardArtifact(store: StateStore, selector: DashboardArtifactSelector): DashboardArtifactRecord | null {
  const { clauses, values } = selectorWhere(selector);
  const row = store.db
    .query(
      `
        SELECT *
        FROM dashboard_artifacts
        WHERE ${clauses.join(" AND ")}
        ORDER BY created_at DESC, id DESC
        LIMIT 1
      `,
    )
    .get(...values) as Record<string, unknown> | undefined;
  return row ? rowToRecord(row) : null;
}

export function latestDashboardArtifactPayload(store: StateStore, selector: DashboardArtifactSelector): JsonObject {
  return latestDashboardArtifact(store, selector)?.payload ?? {};
}

export function dashboardArtifactPayloads(store: StateStore, selector: DashboardArtifactSelector): JsonObject[] {
  const { clauses, values } = selectorWhere(selector);
  return (
    store.db
      .query(
        `
          SELECT *
          FROM dashboard_artifacts
          WHERE ${clauses.join(" AND ")}
          ORDER BY created_at ASC, id ASC
        `,
      )
      .all(...values) as Record<string, unknown>[]
  ).map((row) => rowToRecord(row).payload);
}
