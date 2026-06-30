import { randomUUID } from "node:crypto";
import { immediateTransaction, now, type StateStore } from "./storage/store.js";

export type JsonObject = Record<string, unknown>;

export interface DashboardArtifactRecord {
  id: string;
  runId: string | null;
  projectId: string | null;
  sessionUuid: string | null;
  artifactType: string;
  artifactKey: string;
  sourcePath: string | null;
  sourceLabel: string | null;
  payload: JsonObject;
  createdAt: string;
}

export interface DashboardArtifactInput {
  runId?: string | null;
  projectId?: string | null;
  sessionUuid?: string | null;
  artifactType: string;
  artifactKey: string;
  sourcePath?: string | null;
  sourceLabel?: string | null;
  payload: JsonObject;
  createdAt?: string;
}

export interface DashboardArtifactSelector {
  runId?: string | null;
  projectId?: string | null;
  sessionUuid?: string | null;
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
    projectId: typeof row.project_id === "string" && row.project_id ? row.project_id : null,
    sessionUuid: typeof row.session_uuid === "string" && row.session_uuid ? row.session_uuid : null,
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
  if (selector.projectId !== undefined) {
    clauses.push(selector.projectId ? "project_id = ?" : "project_id IS NULL");
    if (selector.projectId) values.push(selector.projectId);
  }
  if (selector.sessionUuid !== undefined) {
    clauses.push(selector.sessionUuid ? "session_uuid = ?" : "session_uuid IS NULL");
    if (selector.sessionUuid) values.push(selector.sessionUuid);
  }
  return { clauses, values };
}

export function recordDashboardArtifact(store: StateStore, input: DashboardArtifactInput): DashboardArtifactRecord {
  const record: DashboardArtifactRecord = {
    id: randomUUID(),
    runId: input.runId ?? null,
    projectId: input.projectId ?? null,
    sessionUuid: input.sessionUuid ?? null,
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
            id, run_id, project_id, session_uuid, artifact_type, artifact_key,
            source_path, source_label, payload_json, created_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
      )
      .run(
        record.id,
        record.runId,
        record.projectId,
        record.sessionUuid,
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
