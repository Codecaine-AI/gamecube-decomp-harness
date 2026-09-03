#!/usr/bin/env bun

import { Database } from "bun:sqlite";
import { getContainer } from "@agent-kernel/db";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, stat } from "node:fs/promises";
import { once } from "node:events";
import { resolve } from "node:path";
import { createInterface } from "node:readline";

import {
  ensureKernelObservabilitySchema,
  openAppKernelDatabase,
} from "../src/infrastructure/kernel/bridge/database.js";

const SESSION_SHORT_ID = "02a80f9b";
const SESSION_ID = "02a80f9b-1045-481b-88cf-d32b7a673afe";
const BATCH_SIZE = 2_000;
const PROGRESS_EVERY = 100_000;
const SOURCE_CONTAINER = "agent-kernel-db";
const SOURCE_DATABASE = "agent_kernel";
const SOURCE_USER = "agent_kernel";
const SKIP_EXPORT = process.env.MIGRATE_KERNEL_TRACES_SKIP_EXPORT === "1";
const VERIFIED_SOURCE_COUNTS = {
  containers: 14_339,
  pi_agent_sessions: 14_604,
  agent_runs: 14_233,
  trace_events: 2_390_055,
  prompt_revisions: 7,
  kernel_registrations: 1,
} as const;

const REPO_ROOT = resolve(import.meta.dir, "../../..");
const SQLITE_PATH = resolve(
  process.env.KERNEL_MIGRATION_DB_PATH ??
    resolve(REPO_ROOT, "games/melee/state/agent-kernel.sqlite"),
);
const STAGE_DIR = resolve(
  process.env.KERNEL_MIGRATION_STAGE_DIR ??
    `/private/tmp/kernel-migrate-${SESSION_SHORT_ID}`,
);

type JsonRow = Record<string, unknown>;

interface TableSpec {
  columns: readonly string[];
  jsonColumns: ReadonlySet<string>;
  primaryKey: string;
}

const TABLES = {
  containers: {
    columns: [
      "id",
      "kernel_id",
      "kind",
      "app_key",
      "label",
      "status",
      "parent_container_id",
      "phase",
      "phase_vocabulary",
      "working_dir",
      "metadata",
      "usage_input_tokens",
      "usage_output_tokens",
      "usage_cache_read",
      "usage_cache_write",
      "usage_cost_estimate",
      "created_at",
      "started_at",
      "ended_at",
    ],
    jsonColumns: new Set(["app_key", "phase_vocabulary", "metadata"]),
    primaryKey: "id",
  },
  pi_agent_sessions: {
    columns: [
      "id",
      "container_id",
      "parent_session_id",
      "parent_tool_use_id",
      "agent_name",
      "display_label",
      "model",
      "prompt_hash",
      "status",
      "phase",
      "usage_input_tokens",
      "usage_output_tokens",
      "created_at",
      "ended_at",
    ],
    jsonColumns: new Set<string>(),
    primaryKey: "id",
  },
  agent_runs: {
    columns: [
      "id",
      "pi_session_id",
      "container_id",
      "parent_run_id",
      "parent_tool_use_id",
      "agent_name",
      "trigger",
      "inbound_event_id",
      "outbound_event_id",
      "display_label",
      "phase",
      "status",
      "usage_input_tokens",
      "usage_output_tokens",
      "usage_cache_read",
      "usage_cache_write",
      "usage_cost_estimate",
      "started_at",
      "ended_at",
    ],
    jsonColumns: new Set<string>(),
    primaryKey: "id",
  },
  trace_events: {
    columns: [
      "event_id",
      "container_id",
      "run_id",
      "pi_session_id",
      "agent_id",
      "user_id",
      "type",
      "source",
      "trace_level",
      "event_data",
      "span_id",
      "parent_event_id",
      "timestamp",
    ],
    jsonColumns: new Set(["event_data"]),
    primaryKey: "event_id",
  },
  prompt_revisions: {
    columns: [
      "hash",
      "agent_name",
      "schema_version",
      "document",
      "rendered_text",
      "source",
      "created_at",
    ],
    jsonColumns: new Set<string>(),
    primaryKey: "hash",
  },
  kernel_registrations: {
    columns: [
      "kernel_id",
      "display_name",
      "working_dir",
      "pi_sessions_dir",
      "app_base_url",
      "app_trace_url_template",
      "generic_trace_url_template",
      "marker_config",
      "metadata",
      "registered_at",
      "last_seen_at",
      "created_at",
      "updated_at",
    ],
    jsonColumns: new Set(["marker_config", "metadata"]),
    primaryKey: "kernel_id",
  },
} as const satisfies Record<string, TableSpec>;

type TableName = keyof typeof TABLES;

const CONTAINER_SCOPE = `metadata::text LIKE '%${SESSION_SHORT_ID}%'`;
const SCOPED_CONTAINERS_CTE = `
  scoped_containers AS (
    SELECT id, kernel_id
    FROM containers
    WHERE ${CONTAINER_SCOPE}
  )`;
const SCOPED_SESSIONS_CTE = `
  scoped_pi_agent_sessions AS (
    SELECT id
    FROM pi_agent_sessions
    WHERE container_id IN (SELECT id FROM scoped_containers)
       OR app_session_id::text = '${SESSION_ID}'
  )`;

function rowJsonQuery(innerQuery: string): string {
  return `SELECT row_to_json(export_row)::text FROM (${innerQuery}) AS export_row`;
}

function selectedColumns(table: TableName, prefix = ""): string {
  return TABLES[table].columns.map((column) => `${prefix}${column}`).join(", ");
}

const EXPORT_QUERIES: Record<TableName, string> = {
  containers: rowJsonQuery(`
    SELECT ${selectedColumns("containers")}
    FROM containers
    WHERE ${CONTAINER_SCOPE}
    ORDER BY id
  `),
  pi_agent_sessions: rowJsonQuery(`
    WITH ${SCOPED_CONTAINERS_CTE}
    SELECT ${selectedColumns("pi_agent_sessions", "session.")}
    FROM pi_agent_sessions AS session
    WHERE session.container_id IN (SELECT id FROM scoped_containers)
       OR session.app_session_id::text = '${SESSION_ID}'
    ORDER BY session.id
  `),
  agent_runs: rowJsonQuery(`
    WITH ${SCOPED_CONTAINERS_CTE}, ${SCOPED_SESSIONS_CTE}
    SELECT ${selectedColumns("agent_runs", "run.")}
    FROM agent_runs AS run
    WHERE run.container_id IN (SELECT id FROM scoped_containers)
       OR run.pi_session_id IN (SELECT id FROM scoped_pi_agent_sessions)
    ORDER BY run.id
  `),
  trace_events: rowJsonQuery(`
    WITH ${SCOPED_CONTAINERS_CTE}
    SELECT ${selectedColumns("trace_events", "event.")}
    FROM trace_events AS event
    WHERE event.container_id IN (SELECT id FROM scoped_containers)
    ORDER BY event.event_id
  `),
  prompt_revisions: rowJsonQuery(`
    SELECT ${selectedColumns("prompt_revisions")}
    FROM prompt_revisions
    ORDER BY hash
  `),
  kernel_registrations: rowJsonQuery(`
    WITH ${SCOPED_CONTAINERS_CTE}
    SELECT
      registration.kernel_id,
      registration.display_name,
      registration.working_dir,
      registration.pi_sessions_dir,
      registration.app_base_url,
      registration.app_trace_url_template,
      registration.generic_trace_url_template,
      registration.marker_config,
      registration.metadata,
      to_char(registration.registered_at, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS registered_at,
      to_char(registration.last_seen_at, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS last_seen_at,
      to_char(registration.created_at, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS created_at,
      to_char(registration.updated_at, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS updated_at
    FROM kernel_registrations AS registration
    WHERE registration.kernel_id IN (
      SELECT DISTINCT kernel_id FROM scoped_containers
    )
    ORDER BY registration.kernel_id
  `),
};

const SOURCE_COUNTS_QUERY = `
  WITH ${SCOPED_CONTAINERS_CTE}, ${SCOPED_SESSIONS_CTE},
  scoped_agent_runs AS (
    SELECT id
    FROM agent_runs
    WHERE container_id IN (SELECT id FROM scoped_containers)
       OR pi_session_id IN (SELECT id FROM scoped_pi_agent_sessions)
  )
  SELECT json_build_object(
    'containers', (SELECT count(*) FROM scoped_containers),
    'pi_agent_sessions', (SELECT count(*) FROM scoped_pi_agent_sessions),
    'agent_runs', (SELECT count(*) FROM scoped_agent_runs),
    'trace_events', (
      SELECT count(*)
      FROM trace_events
      WHERE container_id IN (SELECT id FROM scoped_containers)
    ),
    'prompt_revisions', (SELECT count(*) FROM prompt_revisions),
    'kernel_registrations', (
      SELECT count(*)
      FROM kernel_registrations
      WHERE kernel_id IN (SELECT DISTINCT kernel_id FROM scoped_containers)
    )
  )::text
`;

function printUsage(): void {
  console.log(`Usage: bun apps/server/scripts/migrate-kernel-traces-${SESSION_SHORT_ID}.ts\n`);
  console.log(`Source: Docker container ${SOURCE_CONTAINER}, database ${SOURCE_DATABASE}`);
  console.log(`Destination: ${SQLITE_PATH}`);
  console.log(`Stage directory: ${STAGE_DIR}`);
}

function stagedRowsPath(table: TableName): string {
  return resolve(STAGE_DIR, `${table}.${SKIP_EXPORT ? "ndjson" : "csv"}`);
}

function csvJsonLine(line: string): JsonRow {
  const clean = line.endsWith("\r") ? line.slice(0, -1) : line;
  const json = clean.startsWith('"') && clean.endsWith('"')
    ? clean.slice(1, -1).replaceAll('""', '"')
    : clean;
  return JSON.parse(json) as JsonRow;
}

function countNewlines(bytes: Uint8Array): number {
  let count = 0;
  for (const byte of bytes) {
    if (byte === 10) count += 1;
  }
  return count;
}

async function exportQuery(
  label: string,
  query: string,
  outputPath: string,
): Promise<number> {
  // psql backslash commands end at a newline, so keep the full \copy command
  // on one physical line while still defining readable SQL above.
  const compactQuery = query.replace(/\s+/g, " ").trim();
  const command = [
    "docker",
    "exec",
    SOURCE_CONTAINER,
    "psql",
    "-U",
    SOURCE_USER,
    "-d",
    SOURCE_DATABASE,
    "-X",
    "-v",
    "ON_ERROR_STOP=1",
    "-q",
    "-c",
    `\\copy (${compactQuery}) TO STDOUT WITH (FORMAT csv)`,
  ];
  const process = Bun.spawn(command, {
    stdout: "pipe",
    stderr: "pipe",
  });
  const stderrPromise = new Response(process.stderr).text();
  const output = createWriteStream(outputPath, { flags: "w" });
  let rows = 0;
  let nextProgress = PROGRESS_EVERY;

  try {
    for await (const chunk of process.stdout) {
      const bytes = chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk);
      rows += countNewlines(bytes);
      if (!output.write(bytes)) await once(output, "drain");
      if (rows >= nextProgress) {
        console.log(`[export] ${label}: ${rows.toLocaleString()} rows`);
        while (rows >= nextProgress) nextProgress += PROGRESS_EVERY;
      }
    }
    output.end();
    await once(output, "close");
  } catch (error) {
    output.destroy();
    throw error;
  }

  const [exitCode, stderr] = await Promise.all([process.exited, stderrPromise]);
  if (exitCode !== 0) {
    throw new Error(
      `Postgres export failed for ${label} with exit ${exitCode}: ${stderr.trim()}`,
    );
  }
  if (stderr.trim()) console.error(stderr.trim());
  console.log(`[export] ${label}: ${rows.toLocaleString()} rows complete`);
  return rows;
}

async function* readRows(path: string): AsyncGenerator<JsonRow> {
  const lines = createInterface({
    input: createReadStream(path),
    crlfDelay: Infinity,
  });
  for await (const line of lines) {
    if (line.length > 0) yield csvJsonLine(line);
  }
}

async function readAllRows(path: string): Promise<JsonRow[]> {
  const rows: JsonRow[] = [];
  for await (const row of readRows(path)) rows.push(row);
  return rows;
}

function sqliteValue(spec: TableSpec, column: string, value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (spec.jsonColumns.has(column)) return JSON.stringify(value);
  return value;
}

function upsertStatement(database: Database, table: TableName) {
  const spec = TABLES[table];
  const placeholders = spec.columns.map(() => "?").join(", ");
  const updates = spec.columns
    .filter((column) => column !== spec.primaryKey)
    .map((column) => `${column} = excluded.${column}`)
    .join(", ");
  return database.query(`
    INSERT INTO ${table} (${spec.columns.join(", ")})
    VALUES (${placeholders})
    ON CONFLICT (${spec.primaryKey}) DO UPDATE SET ${updates}
  `);
}

function insertOrIgnoreStatement(database: Database, table: TableName) {
  const spec = TABLES[table];
  return database.query(`
    INSERT OR IGNORE INTO ${table} (${spec.columns.join(", ")})
    VALUES (${spec.columns.map(() => "?").join(", ")})
  `);
}

function bindRow(table: TableName, row: JsonRow): unknown[] {
  const spec = TABLES[table];
  return spec.columns.map((column) => sqliteValue(spec, column, row[column]));
}

function parentFirst(
  rows: JsonRow[],
  keyColumn: string,
  parentColumn: string,
): JsonRow[] {
  const pending = new Map(
    rows.map((row) => [String(row[keyColumn]), row] as const),
  );
  const ordered: JsonRow[] = [];
  while (pending.size > 0) {
    let moved = 0;
    for (const [key, row] of pending) {
      const parent = row[parentColumn];
      if (parent === null || parent === undefined || !pending.has(String(parent))) {
        ordered.push(row);
        pending.delete(key);
        moved += 1;
      }
    }
    if (moved === 0) {
      throw new Error(
        `Parent cycle found through ${parentColumn}: ${[...pending.keys()].slice(0, 5).join(", ")}`,
      );
    }
  }
  return ordered;
}

function existingIds(database: Database, table: string, keyColumn: string): Set<string> {
  const rows = database.query(`SELECT ${keyColumn} AS id FROM ${table}`).all() as Array<{
    id: string;
  }>;
  return new Set(rows.map((row) => String(row.id)));
}

function assertReferences(
  label: string,
  rows: JsonRow[],
  column: string,
  allowedIds: Set<string>,
): void {
  const missing = new Set<string>();
  for (const row of rows) {
    const value = row[column];
    if (value !== null && value !== undefined && !allowedIds.has(String(value))) {
      missing.add(String(value));
    }
  }
  if (missing.size > 0) {
    throw new Error(
      `${label} has ${missing.size} references outside the migration scope in ${column}: ${[...missing].slice(0, 5).join(", ")}`,
    );
  }
}

function migrateRows(
  database: Database,
  table: Exclude<TableName, "trace_events">,
  rows: JsonRow[],
): number {
  const statement = upsertStatement(database, table);
  const writeBatch = database.transaction((batch: JsonRow[]) => {
    for (const row of batch) statement.run(...bindRow(table, row));
  });
  let completed = 0;
  for (let offset = 0; offset < rows.length; offset += BATCH_SIZE) {
    const batch = rows.slice(offset, offset + BATCH_SIZE);
    writeBatch(batch);
    completed += batch.length;
    if (completed % PROGRESS_EVERY === 0 || completed === rows.length) {
      console.log(`[migrate] ${table}: ${completed.toLocaleString()} rows`);
    }
  }
  return completed;
}

async function migrateTraceEvents(
  database: Database,
  path: string,
): Promise<{ rows: number; spots: JsonRow[] }> {
  const table: TableName = "trace_events";
  const statement = insertOrIgnoreStatement(database, table);
  const writeBatch = database.transaction((batch: JsonRow[]) => {
    for (const row of batch) statement.run(...bindRow(table, row));
  });
  const batch: JsonRow[] = [];
  const spots: JsonRow[] = [];
  let completed = 0;
  let nextProgress = PROGRESS_EVERY;

  for await (const row of readRows(path)) {
    if (spots.length < 3) spots.push(row);
    batch.push(row);
    if (batch.length < BATCH_SIZE) continue;
    writeBatch(batch);
    completed += batch.length;
    batch.length = 0;
    if (completed >= nextProgress) {
      console.log(`[migrate] trace_events: ${completed.toLocaleString()} rows`);
      while (completed >= nextProgress) nextProgress += PROGRESS_EVERY;
    }
  }
  if (batch.length > 0) {
    writeBatch(batch);
    completed += batch.length;
  }
  console.log(`[migrate] trace_events: ${completed.toLocaleString()} rows complete`);
  return { rows: completed, spots };
}

function createRegistrationCompatibilityTable(database: Database): void {
  // The SQLite-first Agent Kernel replaced registrations with a local manifest.
  // This extra table retains every old registration field without changing the
  // runtime bridge or its owned schema.
  database.exec(`
    CREATE TABLE IF NOT EXISTS kernel_registrations (
      kernel_id                 TEXT PRIMARY KEY,
      display_name              TEXT NOT NULL,
      working_dir               TEXT NOT NULL,
      pi_sessions_dir           TEXT NOT NULL,
      app_base_url              TEXT,
      app_trace_url_template    TEXT,
      generic_trace_url_template TEXT,
      marker_config             TEXT NOT NULL,
      metadata                  TEXT NOT NULL,
      registered_at             TEXT NOT NULL,
      last_seen_at              TEXT NOT NULL,
      created_at                TEXT NOT NULL,
      updated_at                TEXT NOT NULL
    );
  `);
}

function createVerificationScope(database: Database): void {
  database.exec(`
    CREATE TEMP TABLE migration_scope_ids (
      table_name TEXT NOT NULL,
      id TEXT NOT NULL,
      PRIMARY KEY (table_name, id)
    );
  `);
}

function addVerificationIds(
  database: Database,
  table: TableName,
  rows: JsonRow[],
): void {
  const key = TABLES[table].primaryKey;
  const statement = database.query(
    "INSERT OR IGNORE INTO migration_scope_ids (table_name, id) VALUES (?, ?)",
  );
  const insertBatch = database.transaction((batch: JsonRow[]) => {
    for (const row of batch) statement.run(table, String(row[key]));
  });
  for (let offset = 0; offset < rows.length; offset += BATCH_SIZE) {
    insertBatch(rows.slice(offset, offset + BATCH_SIZE));
  }
}

function scopedSqliteCount(database: Database, table: TableName): number {
  if (table === "trace_events") {
    const row = database.query(`
      SELECT count(*) AS count
      FROM trace_events
      WHERE container_id IN (
        SELECT id FROM migration_scope_ids WHERE table_name = 'containers'
      )
    `).get() as { count: number };
    return Number(row.count);
  }
  const key = TABLES[table].primaryKey;
  const row = database.query(`
    SELECT count(*) AS count
    FROM ${table} AS destination
    JOIN migration_scope_ids AS scope
      ON scope.table_name = '${table}'
     AND scope.id = destination.${key}
  `).get() as { count: number };
  return Number(row.count);
}

function decodeSqliteRow(table: TableName, row: JsonRow): JsonRow {
  const result = { ...row };
  for (const column of TABLES[table].jsonColumns) {
    const value = result[column];
    if (typeof value === "string") result[column] = JSON.parse(value);
  }
  return result;
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(object[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function printable(value: unknown): string {
  const text = canonical(value);
  return text.length <= 1_000 ? text : `${text.slice(0, 1_000)}... (${text.length} chars)`;
}

function rowDiff(expected: JsonRow, actual: JsonRow): string[] {
  const differences: string[] = [];
  for (const field of Object.keys(expected)) {
    if (canonical(expected[field]) !== canonical(actual[field])) {
      differences.push(
        `${field}: postgres=${printable(expected[field])} sqlite=${printable(actual[field])}`,
      );
    }
  }
  return differences;
}

function verifySpots(
  database: Database,
  table: TableName,
  spots: JsonRow[],
): number {
  const spec = TABLES[table];
  const query = database.query(
    `SELECT ${spec.columns.join(", ")} FROM ${table} WHERE ${spec.primaryKey} = ?`,
  );
  let failures = 0;
  for (const expected of spots.slice(0, 3)) {
    const key = String(expected[spec.primaryKey]);
    const raw = query.get(key) as JsonRow | null;
    if (!raw) {
      console.error(`[spot] ${table} ${key}: missing in SQLite`);
      failures += 1;
      continue;
    }
    const differences = rowDiff(expected, decodeSqliteRow(table, raw));
    if (differences.length === 0) {
      console.log(`[spot] ${table} ${key}: OK`);
    } else {
      console.error(`[spot] ${table} ${key}: ${differences.length} field differences`);
      for (const difference of differences) console.error(`  ${difference}`);
      failures += 1;
    }
  }
  return failures;
}

function bridgeContainerShape(row: Awaited<ReturnType<typeof getContainer>>): JsonRow {
  if (!row) return {};
  return {
    id: row.id,
    kernel_id: row.kernelId,
    kind: row.kind,
    app_key: row.appKey,
    label: row.label,
    status: row.status,
    parent_container_id: row.parentContainerId,
    phase: row.phase,
    phase_vocabulary: row.phaseVocabulary,
    working_dir: row.workingDir,
    metadata: row.metadata,
    usage_input_tokens: row.usageInputTokens,
    usage_output_tokens: row.usageOutputTokens,
    usage_cache_read: row.usageCacheRead,
    usage_cache_write: row.usageCacheWrite,
    usage_cost_estimate: row.usageCostEstimate,
    created_at: row.createdAt,
    started_at: row.startedAt,
    ended_at: row.endedAt,
  };
}

async function verifyBridgeRoundTrip(expected: JsonRow): Promise<void> {
  const handle = await openAppKernelDatabase({
    databasePath: SQLITE_PATH,
    env: {},
  });
  try {
    await ensureKernelObservabilitySchema(handle.db);
    const id = String(expected.id);
    const row = await getContainer(handle.db, id);
    if (!row) throw new Error(`Bridge could not read migrated container ${id}`);
    const differences = rowDiff(expected, bridgeContainerShape(row));
    if (differences.length > 0) {
      throw new Error(
        `Bridge container ${id} differed after round-trip:\n${differences.join("\n")}`,
      );
    }
    console.log(`[bridge] open and container round-trip ${id}: OK`);
  } finally {
    await handle.close();
  }
}

async function readSourceCounts(path: string): Promise<Record<TableName, number>> {
  const rows = await readAllRows(path);
  if (rows.length !== 1) {
    throw new Error(`Expected one source count row, found ${rows.length}`);
  }
  return Object.fromEntries(
    Object.keys(TABLES).map((table) => [table, Number(rows[0][table])]),
  ) as Record<TableName, number>;
}

async function checkpointDatabase(): Promise<void> {
  const database = new Database(SQLITE_PATH);
  try {
    database.exec("PRAGMA wal_checkpoint(TRUNCATE);");
  } finally {
    database.close();
  }
}

async function main(): Promise<void> {
  if (process.argv.includes("--help")) {
    printUsage();
    return;
  }

  const startedAt = performance.now();
  await mkdir(STAGE_DIR, { recursive: true });

  const bridge = await openAppKernelDatabase({ databasePath: SQLITE_PATH, env: {} });
  try {
    await ensureKernelObservabilitySchema(bridge.db);
  } finally {
    await bridge.close();
  }
  console.log(`[bootstrap] bridge opened ${SQLITE_PATH}`);
  if (SKIP_EXPORT) {
    console.log(`[export] skipped; reading existing staged files from ${STAGE_DIR}`);
  }

  const exportOrder: TableName[] = [
    "prompt_revisions",
    "containers",
    "pi_agent_sessions",
    "agent_runs",
    "kernel_registrations",
    "trace_events",
  ];
  const exportCounts = {} as Record<TableName, number>;
  let sourceCounts = {} as Record<TableName, number>;
  if (!SKIP_EXPORT) {
    for (const table of exportOrder) {
      exportCounts[table] = await exportQuery(
        table,
        EXPORT_QUERIES[table],
        stagedRowsPath(table),
      );
    }
    const sourceCountsPath = resolve(STAGE_DIR, "source-counts.csv");
    await exportQuery("source counts", SOURCE_COUNTS_QUERY, sourceCountsPath);
    sourceCounts = await readSourceCounts(sourceCountsPath);
    for (const table of exportOrder) {
      if (exportCounts[table] !== sourceCounts[table]) {
        throw new Error(
          `${table} changed during export: staged ${exportCounts[table]}, current Postgres ${sourceCounts[table]}`,
        );
      }
    }
  }

  const smallRows = {
    prompt_revisions: await readAllRows(stagedRowsPath("prompt_revisions")),
    containers: await readAllRows(stagedRowsPath("containers")),
    pi_agent_sessions: await readAllRows(stagedRowsPath("pi_agent_sessions")),
    agent_runs: await readAllRows(stagedRowsPath("agent_runs")),
    kernel_registrations: await readAllRows(stagedRowsPath("kernel_registrations")),
  };
  if (SKIP_EXPORT) {
    sourceCounts = { ...VERIFIED_SOURCE_COUNTS };
    for (const table of [
      "prompt_revisions",
      "containers",
      "pi_agent_sessions",
      "agent_runs",
      "kernel_registrations",
    ] as const) {
      if (smallRows[table].length !== sourceCounts[table]) {
        throw new Error(
          `${table} staged ${smallRows[table].length} rows, expected verified Postgres count ${sourceCounts[table]}`,
        );
      }
    }
  }

  const database = new Database(SQLITE_PATH);
  let spotFailures = 0;
  let sqliteCounts = {} as Record<TableName, number>;
  let traceSpots: JsonRow[] = [];
  try {
    database.exec("PRAGMA journal_mode = WAL;");
    database.exec("PRAGMA synchronous = NORMAL;");
    database.exec("PRAGMA foreign_keys = ON;");
    database.exec("PRAGMA busy_timeout = 30000;");
    createRegistrationCompatibilityTable(database);
    createVerificationScope(database);

    const sourceContainerIds = new Set(
      smallRows.containers.map((row) => String(row.id)),
    );
    const allowedContainerIds = existingIds(database, "containers", "id");
    for (const id of sourceContainerIds) allowedContainerIds.add(id);
    assertReferences(
      "containers",
      smallRows.containers,
      "parent_container_id",
      allowedContainerIds,
    );
    assertReferences(
      "pi_agent_sessions",
      smallRows.pi_agent_sessions,
      "container_id",
      allowedContainerIds,
    );

    const allowedSessionIds = existingIds(database, "pi_agent_sessions", "id");
    for (const row of smallRows.pi_agent_sessions) allowedSessionIds.add(String(row.id));
    assertReferences(
      "pi_agent_sessions",
      smallRows.pi_agent_sessions,
      "parent_session_id",
      allowedSessionIds,
    );
    assertReferences(
      "agent_runs",
      smallRows.agent_runs,
      "pi_session_id",
      allowedSessionIds,
    );
    assertReferences(
      "agent_runs",
      smallRows.agent_runs,
      "container_id",
      allowedContainerIds,
    );

    const allowedRunIds = existingIds(database, "agent_runs", "id");
    for (const row of smallRows.agent_runs) allowedRunIds.add(String(row.id));
    assertReferences(
      "agent_runs",
      smallRows.agent_runs,
      "parent_run_id",
      allowedRunIds,
    );

    smallRows.containers = parentFirst(
      smallRows.containers,
      "id",
      "parent_container_id",
    );
    smallRows.pi_agent_sessions = parentFirst(
      smallRows.pi_agent_sessions,
      "id",
      "parent_session_id",
    );
    smallRows.agent_runs = parentFirst(
      smallRows.agent_runs,
      "id",
      "parent_run_id",
    );

    migrateRows(database, "prompt_revisions", smallRows.prompt_revisions);
    migrateRows(database, "containers", smallRows.containers);
    migrateRows(database, "pi_agent_sessions", smallRows.pi_agent_sessions);
    migrateRows(database, "agent_runs", smallRows.agent_runs);
    migrateRows(database, "kernel_registrations", smallRows.kernel_registrations);
    const traceResult = await migrateTraceEvents(
      database,
      stagedRowsPath("trace_events"),
    );
    traceSpots = traceResult.spots;
    if (traceResult.rows !== sourceCounts.trace_events) {
      throw new Error(
        `Parsed ${traceResult.rows} trace events, expected ${sourceCounts.trace_events}`,
      );
    }

    for (const table of exportOrder) {
      if (table !== "trace_events") {
        addVerificationIds(database, table, smallRows[table]);
      }
      sqliteCounts[table] = scopedSqliteCount(database, table);
    }

    console.log("\n[counts] Postgres scoped vs SQLite");
    for (const table of exportOrder) {
      const source = sourceCounts[table];
      const destination = sqliteCounts[table];
      const status = source === destination ? "OK" : "MISMATCH";
      console.log(
        `[count] ${table}: postgres=${source.toLocaleString()} sqlite=${destination.toLocaleString()} ${status}`,
      );
      if (status !== "OK") spotFailures += 1;
    }

    const spotRows: Record<TableName, JsonRow[]> = {
      prompt_revisions: smallRows.prompt_revisions,
      containers: smallRows.containers,
      pi_agent_sessions: smallRows.pi_agent_sessions,
      agent_runs: smallRows.agent_runs,
      kernel_registrations: smallRows.kernel_registrations,
      trace_events: traceSpots,
    };
    console.log("\n[spots] field-by-field checks");
    for (const table of exportOrder) {
      spotFailures += verifySpots(database, table, spotRows[table]);
    }

    const foreignKeyProblems = database.query("PRAGMA foreign_key_check").all();
    if (foreignKeyProblems.length > 0) {
      console.error(`[verify] foreign_key_check: ${foreignKeyProblems.length} failures`);
      console.error(JSON.stringify(foreignKeyProblems.slice(0, 10), null, 2));
      spotFailures += foreignKeyProblems.length;
    } else {
      console.log("[verify] foreign_key_check: OK");
    }
    database.exec("PRAGMA wal_checkpoint(TRUNCATE);");
  } finally {
    database.close();
  }

  if (smallRows.containers.length === 0) {
    throw new Error(`No Postgres containers matched ${SESSION_SHORT_ID}`);
  }
  await verifyBridgeRoundTrip(smallRows.containers[0]);
  await checkpointDatabase();

  const file = await stat(SQLITE_PATH);
  const elapsedSeconds = (performance.now() - startedAt) / 1_000;
  console.log(`[result] runtime: ${elapsedSeconds.toFixed(1)} seconds`);
  console.log(
    `[result] SQLite size: ${file.size.toLocaleString()} bytes (${(file.size / 1024 / 1024 / 1024).toFixed(3)} GiB)`,
  );
  if (spotFailures > 0) {
    throw new Error(`Verification failed with ${spotFailures} count or row differences`);
  }
  console.log("[result] migration and verification: OK");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
