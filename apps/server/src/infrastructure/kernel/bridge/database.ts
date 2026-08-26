import type {
  AgentRun,
  Container,
  NewAgentRun,
  NewContainer,
  NewPiAgentSession,
  PiAgentSession,
} from "@agent-kernel/db";
import * as schema from "@agent-kernel/db/schema/pg";
import type { TraceEvent } from "@agent-kernel/protocol";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";

// The linked Core source has its own physical Drizzle declaration. Runtime
// tables are still the live exported pg schema; only its private TS identity
// is erased at this narrow adapter boundary.
const pgSchema = schema as any;

export const DEFAULT_AGENT_KERNEL_DATABASE_URL =
  "postgres://agent_kernel:agent_kernel@127.0.0.1:55432/agent_kernel";

export interface OpenMeleeKernelDatabaseOptions {
  databaseUrl?: string | null;
  maxConnections?: number;
  suppressNotices?: boolean;
}

export interface MeleeKernelDatabaseHandle {
  db: MeleeKernelDatabase;
  databaseUrl: string | null;
  close: () => Promise<void>;
}

export type MeleeKernelDatabase = PostgresJsDatabase<typeof schema>;

function meleeDb(db: unknown): MeleeKernelDatabase {
  return db as MeleeKernelDatabase;
}

/** Executor surface shared by the root database and a transaction handle. */
interface KernelSchemaExecutor {
  execute(query: ReturnType<typeof sql>): Promise<unknown>;
}

function firstProbeRow(result: unknown): Record<string, unknown> | null {
  if (Array.isArray(result)) return (result[0] as Record<string, unknown> | undefined) ?? null;
  const rows = (result as { rows?: unknown[] } | null | undefined)?.rows;
  if (Array.isArray(rows)) return (rows[0] as Record<string, unknown> | undefined) ?? null;
  return null;
}

/** SELECT-only probe: true when the bootstrap below has fully run before.
 *
 * Sentinels are terminal effects of each migration branch plus the very last
 * bootstrap statement, and they also hold on a fresh CREATE TABLE bootstrap:
 * - containers.kernel_id: legacy containers branch ran (or fresh create)
 * - trace_events.event_id as text: id rename + uuid->text conversion
 * - trace_events.container_id NOT NULL: final unconditional DO-block ALTER
 * - agent_runs_parent_run_id_fkey: terminal agent_runs constraint (fresh
 *   CREATE TABLE auto-names the inline REFERENCES identically)
 * - ix_agent_runs_parent_run_id: the last statement of the whole bootstrap
 * Any probe error (missing tables, test doubles) reads as "not current". */
async function kernelObservabilitySchemaCurrent(database: KernelSchemaExecutor): Promise<boolean> {
  try {
    const result = await database.execute(sql`
      SELECT
        EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = current_schema()
            AND table_name = 'containers'
            AND column_name = 'kernel_id'
        ) AS containers_kernel_id,
        EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = current_schema()
            AND table_name = 'trace_events'
            AND column_name = 'event_id'
            AND data_type = 'text'
        ) AS trace_events_event_id_text,
        EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = current_schema()
            AND table_name = 'trace_events'
            AND column_name = 'container_id'
            AND is_nullable = 'NO'
        ) AS trace_events_container_id_not_null,
        EXISTS (
          SELECT 1 FROM pg_constraint AS con
          JOIN pg_class AS rel ON rel.oid = con.conrelid
          JOIN pg_namespace AS nsp ON nsp.oid = rel.relnamespace
          WHERE con.conname = 'agent_runs_parent_run_id_fkey'
            AND rel.relname = 'agent_runs'
            AND nsp.nspname = current_schema()
        ) AS agent_runs_parent_run_id_fkey,
        EXISTS (
          SELECT 1 FROM pg_class AS idx
          JOIN pg_namespace AS nsp ON nsp.oid = idx.relnamespace
          WHERE idx.relname = 'ix_agent_runs_parent_run_id'
            AND nsp.nspname = current_schema()
        ) AS ix_agent_runs_parent_run_id
    `);
    const row = firstProbeRow(result);
    if (!row) return false;
    const values = Object.values(row);
    return values.length > 0 && values.every((value) => value === true || value === "t" || value === 1);
  } catch {
    return false;
  }
}

/** Postgres bootstrap for the live kernel's dialect-neutral row model.
 *
 * Concurrent processes (the server's lazy runtime init plus one `bun
 * server-job` subprocess per merged PR) all run this bootstrap against the
 * same database. The compat migration below re-executes unconditional
 * `ALTER TABLE trace_events ...` statements on every call, each taking an
 * ACCESS EXCLUSIVE lock. The advisory lock serializes bootstraps against
 * each other, but that DDL still queues behind live traffic (the server's
 * live kernel emitter writes trace_events continuously) and can fail under
 * contention, so the steady-state path must run zero DDL: probe first, and
 * only fall through to the locked bootstrap when the schema is not current.
 * Waiters re-probe after acquiring the lock so they skip the DDL the winner
 * just committed. */
export async function ensureKernelObservabilitySchema(db: unknown): Promise<void> {
  const database = meleeDb(db);
  if (await kernelObservabilitySchemaCurrent(database)) return;
  if (typeof database.transaction === "function") {
    await database.transaction(async (tx) => {
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtextextended('melee:kernel-observability-schema', 0))`,
      );
      if (await kernelObservabilitySchemaCurrent(tx)) return;
      await runKernelObservabilitySchemaStatements(tx);
    });
    return;
  }
  // Test doubles may provide only `execute`; run unguarded in that case.
  await runKernelObservabilitySchemaStatements(database);
}

async function runKernelObservabilitySchemaStatements(database: KernelSchemaExecutor): Promise<void> {
  const tableStatements = [
    sql`CREATE TABLE IF NOT EXISTS containers (
      id TEXT PRIMARY KEY,
      kernel_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      app_key JSONB NOT NULL,
      label TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      parent_container_id TEXT REFERENCES containers(id),
      phase TEXT,
      phase_vocabulary JSONB,
      working_dir TEXT,
      metadata JSONB,
      usage_input_tokens INTEGER NOT NULL DEFAULT 0,
      usage_output_tokens INTEGER NOT NULL DEFAULT 0,
      usage_cache_read INTEGER NOT NULL DEFAULT 0,
      usage_cache_write INTEGER NOT NULL DEFAULT 0,
      usage_cost_estimate REAL,
      created_at TEXT NOT NULL,
      started_at TEXT,
      ended_at TEXT,
      UNIQUE (kernel_id, kind, app_key)
    )`,
    sql`CREATE TABLE IF NOT EXISTS pi_agent_sessions (
      id TEXT PRIMARY KEY,
      container_id TEXT NOT NULL REFERENCES containers(id),
      parent_session_id TEXT REFERENCES pi_agent_sessions(id),
      parent_tool_use_id TEXT,
      agent_name TEXT NOT NULL,
      display_label TEXT,
      model TEXT,
      prompt_hash TEXT,
      status TEXT NOT NULL,
      phase TEXT,
      usage_input_tokens INTEGER NOT NULL DEFAULT 0,
      usage_output_tokens INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      ended_at TEXT
    )`,
    sql`CREATE TABLE IF NOT EXISTS agent_runs (
      id TEXT PRIMARY KEY,
      pi_session_id TEXT NOT NULL REFERENCES pi_agent_sessions(id),
      container_id TEXT NOT NULL REFERENCES containers(id),
      parent_run_id TEXT REFERENCES agent_runs(id),
      parent_tool_use_id TEXT,
      agent_name TEXT NOT NULL,
      trigger TEXT NOT NULL,
      inbound_event_id TEXT,
      outbound_event_id TEXT,
      display_label TEXT,
      phase TEXT,
      status TEXT NOT NULL,
      usage_input_tokens INTEGER NOT NULL DEFAULT 0,
      usage_output_tokens INTEGER NOT NULL DEFAULT 0,
      usage_cache_read INTEGER NOT NULL DEFAULT 0,
      usage_cache_write INTEGER NOT NULL DEFAULT 0,
      usage_cost_estimate REAL,
      started_at TEXT NOT NULL,
      ended_at TEXT
    )`,
    sql`CREATE TABLE IF NOT EXISTS trace_events (
      event_id TEXT PRIMARY KEY,
      container_id TEXT NOT NULL,
      run_id TEXT,
      pi_session_id TEXT,
      agent_id TEXT,
      user_id TEXT,
      type TEXT NOT NULL,
      source TEXT NOT NULL,
      trace_level INTEGER NOT NULL,
      event_data JSONB NOT NULL,
      span_id TEXT,
      parent_event_id TEXT,
      timestamp TEXT NOT NULL
    )`,
    sql`CREATE TABLE IF NOT EXISTS trace_blobs (
      hash TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      byte_length INTEGER NOT NULL,
      data BYTEA NOT NULL,
      created_at TEXT NOT NULL
    )`,
    sql`CREATE TABLE IF NOT EXISTS prompt_revisions (
      hash TEXT PRIMARY KEY,
      agent_name TEXT NOT NULL,
      schema_version TEXT NOT NULL,
      document TEXT NOT NULL,
      rendered_text TEXT NOT NULL,
      source TEXT NOT NULL,
      created_at TEXT NOT NULL
    )`,
  ];
  for (const statement of tableStatements) await database.execute(statement);

  // Upgrade the former Postgres schema in place. Historical compatibility
  // columns remain readable, while the live container-first columns are added
  // and populated without changing Melee's hierarchical container identity.
  await database.execute(sql`
    DO $migration$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = 'containers'
          AND column_name = 'worktree_path'
      ) THEN
        ALTER TABLE containers
          ADD COLUMN IF NOT EXISTS kernel_id TEXT,
          ADD COLUMN IF NOT EXISTS kind TEXT,
          ADD COLUMN IF NOT EXISTS app_key JSONB,
          ADD COLUMN IF NOT EXISTS usage_input_tokens INTEGER NOT NULL DEFAULT 0,
          ADD COLUMN IF NOT EXISTS usage_output_tokens INTEGER NOT NULL DEFAULT 0,
          ADD COLUMN IF NOT EXISTS usage_cache_read INTEGER NOT NULL DEFAULT 0,
          ADD COLUMN IF NOT EXISTS usage_cache_write INTEGER NOT NULL DEFAULT 0,
          ADD COLUMN IF NOT EXISTS usage_cost_estimate REAL,
          ADD COLUMN IF NOT EXISTS ended_at TEXT;
        UPDATE containers
        SET kernel_id = COALESCE(kernel_id, 'melee-decomp-orchestrator'),
            kind = COALESCE(kind, metadata->>'containerKind', phase, 'session'),
            app_key = COALESCE(app_key, jsonb_build_array(id)),
            ended_at = COALESCE(
              ended_at,
              CASE WHEN completed_at IS NULL THEN NULL
                   ELSE to_char(completed_at, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') END
            );
        ALTER TABLE containers
          ALTER COLUMN label DROP NOT NULL,
          ALTER COLUMN status SET DEFAULT 'active',
          ALTER COLUMN phase_vocabulary DROP NOT NULL,
          ALTER COLUMN metadata DROP NOT NULL,
          ALTER COLUMN kernel_id SET NOT NULL,
          ALTER COLUMN kind SET NOT NULL,
          ALTER COLUMN app_key SET NOT NULL;
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = current_schema()
            AND table_name = 'containers'
            AND column_name = 'created_at'
            AND data_type LIKE 'timestamp%'
        ) THEN
          ALTER TABLE containers ALTER COLUMN created_at DROP DEFAULT;
          ALTER TABLE containers
            ALTER COLUMN created_at TYPE TEXT
              USING to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
            ALTER COLUMN started_at TYPE TEXT
              USING CASE WHEN started_at IS NULL THEN NULL
                         ELSE to_char(started_at, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') END;
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conrelid = 'containers'::regclass
            AND conname = 'ux_containers_kernel_kind_app_key'
        ) THEN
          ALTER TABLE containers
            ADD CONSTRAINT ux_containers_kernel_kind_app_key
            UNIQUE (kernel_id, kind, app_key);
        END IF;
      END IF;

      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = 'pi_agent_sessions'
          AND column_name = 'parent_id'
      ) THEN
        -- UUID foreign keys must be removed before the live schema's TEXT
        -- identities can replace the legacy UUID columns.
        ALTER TABLE pi_agent_sessions
          DROP CONSTRAINT IF EXISTS pi_agent_sessions_parent_id_fkey,
          DROP CONSTRAINT IF EXISTS pi_agent_sessions_parent_session_id_fkey;
        ALTER TABLE agent_runs
          DROP CONSTRAINT IF EXISTS agent_runs_pi_session_id_fkey,
          DROP CONSTRAINT IF EXISTS agent_runs_parent_run_id_fkey;
        ALTER TABLE trace_events
          DROP CONSTRAINT IF EXISTS trace_events_pi_session_id_fkey;

        ALTER TABLE pi_agent_sessions
          ADD COLUMN IF NOT EXISTS parent_session_id TEXT,
          ADD COLUMN IF NOT EXISTS parent_tool_use_id TEXT,
          ADD COLUMN IF NOT EXISTS prompt_hash TEXT,
          ADD COLUMN IF NOT EXISTS usage_input_tokens INTEGER NOT NULL DEFAULT 0,
          ADD COLUMN IF NOT EXISTS usage_output_tokens INTEGER NOT NULL DEFAULT 0,
          ADD COLUMN IF NOT EXISTS ended_at TEXT;
        UPDATE pi_agent_sessions
        SET parent_session_id = COALESCE(parent_session_id, parent_id::text),
            ended_at = COALESCE(
              ended_at,
              CASE WHEN completed_at IS NULL THEN NULL
                   ELSE to_char(completed_at, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') END
            );
        UPDATE pi_agent_sessions AS session
        SET container_id = container.id
        FROM containers AS container
        WHERE session.container_id IS NULL
          AND session.app_session_id IS NOT NULL
          AND container.parent_container_id IS NULL
          AND (
            container.id = 'melee:' || session.app_session_id::text || ':session'
            OR container.metadata->>'appSessionId' = session.app_session_id::text
          );
        UPDATE pi_agent_sessions
        SET container_id = 'melee:' || COALESCE(app_session_id::text, id::text) || ':session'
        WHERE container_id IS NULL;
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = current_schema()
            AND table_name = 'pi_agent_sessions'
            AND column_name = 'status'
            AND data_type <> 'text'
        ) THEN
          ALTER TABLE pi_agent_sessions ALTER COLUMN status DROP DEFAULT;
          ALTER TABLE pi_agent_sessions
            ALTER COLUMN status TYPE TEXT USING (
              CASE status::text
                WHEN 'completed' THEN 'ended'
                WHEN 'running' THEN 'active'
                ELSE status::text
              END
            );
        END IF;
        UPDATE pi_agent_sessions
        SET status = CASE status
          WHEN 'completed' THEN 'ended'
          WHEN 'running' THEN 'active'
          ELSE status
        END;
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = current_schema()
            AND table_name = 'pi_agent_sessions'
            AND column_name = 'created_at'
            AND data_type LIKE 'timestamp%'
        ) THEN
          ALTER TABLE pi_agent_sessions ALTER COLUMN created_at DROP DEFAULT;
          ALTER TABLE pi_agent_sessions
            ALTER COLUMN created_at TYPE TEXT
              USING to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
        END IF;

        ALTER TABLE pi_agent_sessions
          ALTER COLUMN id TYPE TEXT USING id::text;

        -- Old databases allowed sessions to reference no container at all.
        -- Preserve those rows by materializing an explicit compatibility root
        -- before applying the live schema's required container foreign key.
        INSERT INTO containers (
          id, kernel_id, kind, app_key, label, status, metadata,
          created_at, started_at, ended_at
        )
        SELECT DISTINCT
          session.container_id,
          'melee-decomp-orchestrator',
          'session',
          jsonb_build_array(session.container_id),
          COALESCE(session.display_label, session.agent_name, 'Recovered Pi session'),
          CASE WHEN session.status = 'ended' THEN 'ended' ELSE 'active' END,
          jsonb_build_object(
            'appSessionId', session.app_session_id,
            'compatibilityRecovery', true
          ),
          session.created_at,
          session.created_at,
          session.ended_at
        FROM pi_agent_sessions AS session
        LEFT JOIN containers AS container ON container.id = session.container_id
        WHERE container.id IS NULL
        ON CONFLICT (id) DO NOTHING;

        ALTER TABLE pi_agent_sessions
          ALTER COLUMN container_id SET NOT NULL;

        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conrelid = 'pi_agent_sessions'::regclass
            AND conname = 'pi_agent_sessions_container_id_fkey'
        ) THEN
          ALTER TABLE pi_agent_sessions
            ADD CONSTRAINT pi_agent_sessions_container_id_fkey
            FOREIGN KEY (container_id) REFERENCES containers(id);
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conrelid = 'pi_agent_sessions'::regclass
            AND conname = 'pi_agent_sessions_parent_session_id_fkey'
        ) THEN
          ALTER TABLE pi_agent_sessions
            ADD CONSTRAINT pi_agent_sessions_parent_session_id_fkey
            FOREIGN KEY (parent_session_id) REFERENCES pi_agent_sessions(id);
        END IF;
      END IF;

      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = 'agent_runs'
          AND column_name = 'run_number'
      ) THEN
        ALTER TABLE agent_runs
          ADD COLUMN IF NOT EXISTS trigger TEXT,
          ADD COLUMN IF NOT EXISTS inbound_event_id TEXT,
          ADD COLUMN IF NOT EXISTS outbound_event_id TEXT,
          ADD COLUMN IF NOT EXISTS usage_input_tokens INTEGER,
          ADD COLUMN IF NOT EXISTS usage_output_tokens INTEGER,
          ADD COLUMN IF NOT EXISTS usage_cache_read INTEGER,
          ADD COLUMN IF NOT EXISTS usage_cache_write INTEGER,
          ADD COLUMN IF NOT EXISTS usage_cost_estimate REAL,
          ADD COLUMN IF NOT EXISTS ended_at TEXT;
        UPDATE agent_runs
        SET trigger = COALESCE(trigger, 'system'),
            usage_input_tokens = COALESCE(usage_input_tokens, input_tokens, 0),
            usage_output_tokens = COALESCE(usage_output_tokens, output_tokens, 0),
            usage_cache_read = COALESCE(usage_cache_read, 0),
            usage_cache_write = COALESCE(usage_cache_write, 0),
            ended_at = COALESCE(
              ended_at,
              CASE WHEN completed_at IS NULL THEN NULL
                   ELSE to_char(completed_at, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') END
            );
        UPDATE agent_runs AS run
        SET container_id = session.container_id
        FROM pi_agent_sessions AS session
        WHERE (
            run.container_id IS NULL
            OR NOT EXISTS (
              SELECT 1 FROM containers AS container
              WHERE container.id = run.container_id
            )
          )
          AND run.pi_session_id::text = session.id;
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = current_schema()
            AND table_name = 'agent_runs'
            AND column_name = 'status'
            AND data_type <> 'text'
        ) THEN
          ALTER TABLE agent_runs ALTER COLUMN status DROP DEFAULT;
          ALTER TABLE agent_runs
            ALTER COLUMN status TYPE TEXT USING (
              CASE status::text WHEN 'completed' THEN 'done' ELSE status::text END
            );
        END IF;
        UPDATE agent_runs
        SET status = CASE status WHEN 'completed' THEN 'done' ELSE status END;
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = current_schema()
            AND table_name = 'agent_runs'
            AND column_name = 'started_at'
            AND data_type LIKE 'timestamp%'
        ) THEN
          UPDATE agent_runs SET started_at = COALESCE(started_at, created_at);
          ALTER TABLE agent_runs
            ALTER COLUMN started_at TYPE TEXT
              USING to_char(started_at, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
        END IF;

        ALTER TABLE agent_runs
          ALTER COLUMN id TYPE TEXT USING id::text,
          ALTER COLUMN pi_session_id TYPE TEXT USING pi_session_id::text,
          ALTER COLUMN parent_run_id TYPE TEXT USING parent_run_id::text,
          ALTER COLUMN run_number DROP NOT NULL,
          ALTER COLUMN trigger SET NOT NULL,
          ALTER COLUMN container_id SET NOT NULL,
          ALTER COLUMN usage_input_tokens SET DEFAULT 0,
          ALTER COLUMN usage_input_tokens SET NOT NULL,
          ALTER COLUMN usage_output_tokens SET DEFAULT 0,
          ALTER COLUMN usage_output_tokens SET NOT NULL,
          ALTER COLUMN usage_cache_read SET DEFAULT 0,
          ALTER COLUMN usage_cache_read SET NOT NULL,
          ALTER COLUMN usage_cache_write SET DEFAULT 0,
          ALTER COLUMN usage_cache_write SET NOT NULL,
          ALTER COLUMN started_at SET NOT NULL;

        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conrelid = 'agent_runs'::regclass
            AND conname = 'agent_runs_pi_session_id_fkey'
        ) THEN
          ALTER TABLE agent_runs
            ADD CONSTRAINT agent_runs_pi_session_id_fkey
            FOREIGN KEY (pi_session_id) REFERENCES pi_agent_sessions(id);
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conrelid = 'agent_runs'::regclass
            AND conname = 'agent_runs_container_id_fkey'
        ) THEN
          ALTER TABLE agent_runs
            ADD CONSTRAINT agent_runs_container_id_fkey
            FOREIGN KEY (container_id) REFERENCES containers(id);
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conrelid = 'agent_runs'::regclass
            AND conname = 'agent_runs_parent_run_id_fkey'
        ) THEN
          ALTER TABLE agent_runs
            ADD CONSTRAINT agent_runs_parent_run_id_fkey
            FOREIGN KEY (parent_run_id) REFERENCES agent_runs(id);
        END IF;
      END IF;

      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = 'trace_events'
          AND column_name = 'id'
      ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = 'trace_events'
          AND column_name = 'event_id'
      ) THEN
        ALTER TABLE trace_events RENAME COLUMN id TO event_id;
      END IF;
      ALTER TABLE trace_events
        ADD COLUMN IF NOT EXISTS run_id TEXT,
        ADD COLUMN IF NOT EXISTS agent_id TEXT;
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = 'trace_events'
          AND column_name = 'app_session_id'
      ) THEN
        ALTER TABLE trace_events ALTER COLUMN app_session_id DROP NOT NULL;
      END IF;
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = 'trace_events'
          AND column_name = 'user_id'
      ) THEN
        ALTER TABLE trace_events ALTER COLUMN user_id DROP NOT NULL;
      END IF;
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = 'trace_events'
          AND column_name = 'app_session_id'
      ) THEN
        UPDATE trace_events AS event
        SET container_id = session.container_id
        FROM pi_agent_sessions AS session
        WHERE event.container_id IS NULL
          AND event.pi_session_id::text = session.id;
        UPDATE trace_events
        SET container_id = 'melee:' || app_session_id::text || ':session'
        WHERE container_id IS NULL
          AND app_session_id IS NOT NULL;
        UPDATE trace_events
        SET container_id = 'melee:compat:trace:' || event_id::text
        WHERE container_id IS NULL;

        ALTER TABLE trace_events
          ALTER COLUMN event_id TYPE TEXT USING event_id::text,
          ALTER COLUMN pi_session_id TYPE TEXT USING pi_session_id::text,
          ALTER COLUMN user_id TYPE TEXT USING user_id::text;

        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = current_schema()
            AND table_name = 'trace_events'
            AND column_name = 'event_data'
            AND data_type = 'json'
        ) THEN
          ALTER TABLE trace_events
            ALTER COLUMN event_data TYPE JSONB USING event_data::jsonb;
        END IF;
      END IF;
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = 'trace_events'
          AND column_name = 'timestamp'
          AND data_type LIKE 'timestamp%'
      ) THEN
        ALTER TABLE trace_events
          ALTER COLUMN timestamp TYPE TEXT
            USING to_char(timestamp, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
      END IF;
      ALTER TABLE trace_events ALTER COLUMN container_id SET NOT NULL;
    END
    $migration$;
  `);

  const indexStatements = [
    sql`CREATE INDEX IF NOT EXISTS idx_events_container_ts ON trace_events (container_id, timestamp)`,
    sql`CREATE INDEX IF NOT EXISTS idx_events_run ON trace_events (run_id)`,
    sql`CREATE INDEX IF NOT EXISTS ix_containers_parent_container_id ON containers (parent_container_id)`,
    sql`CREATE INDEX IF NOT EXISTS ix_pi_agent_sessions_container_id ON pi_agent_sessions (container_id)`,
    sql`CREATE INDEX IF NOT EXISTS ix_pi_agent_sessions_parent_session_id ON pi_agent_sessions (parent_session_id)`,
    sql`CREATE INDEX IF NOT EXISTS ix_agent_runs_pi_session_id ON agent_runs (pi_session_id)`,
    sql`CREATE INDEX IF NOT EXISTS ix_agent_runs_container_id ON agent_runs (container_id)`,
    sql`CREATE INDEX IF NOT EXISTS ix_agent_runs_parent_run_id ON agent_runs (parent_run_id)`,
  ];
  for (const statement of indexStatements) await database.execute(statement);
}

export async function upsertMeleeContainer(
  db: unknown,
  input: NewContainer,
): Promise<Container> {
  const database = meleeDb(db);
  const [row] = await database
    .insert(pgSchema.containers)
    .values(input)
    .onConflictDoUpdate({
      // Melee intentionally retains hierarchical container ids while the live
      // kernel derives UUID ids from its natural key. Conflict on the stable
      // harness id so a transcript placeholder can later become the richer
      // runtime container without a primary-key collision.
      target: pgSchema.containers.id,
      set: {
        kernelId: input.kernelId,
        kind: input.kind,
        appKey: input.appKey,
        label: input.label,
        status: input.status,
        parentContainerId: input.parentContainerId,
        phase: input.phase,
        phaseVocabulary: input.phaseVocabulary,
        workingDir: input.workingDir,
        metadata: input.metadata,
        usageInputTokens: input.usageInputTokens,
        usageOutputTokens: input.usageOutputTokens,
        usageCacheRead: input.usageCacheRead,
        usageCacheWrite: input.usageCacheWrite,
        usageCostEstimate: input.usageCostEstimate,
        startedAt: input.startedAt,
        endedAt: input.endedAt,
      },
    })
    .returning();
  return row as Container;
}

export async function insertMeleeTraceEventsBatch(
  db: unknown,
  events: TraceEvent[],
): Promise<number> {
  if (events.length === 0) return 0;
  const inserted = await meleeDb(db)
    .insert(pgSchema.traceEvents)
    .values(events.map((event) => ({
      eventId: event.eventId,
      containerId: event.containerId,
      runId: event.runId ?? null,
      piSessionId: event.piSessionUuid ?? null,
      agentId: event.agentId ?? null,
      userId: event.userId ?? null,
      type: event.type,
      source: event.source,
      traceLevel: event.traceLevel,
      eventData: event.eventData,
      spanId: event.spanId ?? null,
      parentEventId: event.parentEventId ?? null,
      timestamp: event.timestamp,
    })))
    .onConflictDoNothing({ target: pgSchema.traceEvents.eventId })
    .returning({ eventId: pgSchema.traceEvents.eventId });
  return inserted.length;
}

export async function upsertMeleePiAgentSession(
  db: unknown,
  data: NewPiAgentSession,
): Promise<PiAgentSession> {
  const [row] = await meleeDb(db)
    .insert(pgSchema.piAgentSessions)
    .values(data)
    .onConflictDoUpdate({
      target: pgSchema.piAgentSessions.id,
      set: {
        containerId: data.containerId,
        parentSessionId: data.parentSessionId,
        parentToolUseId: data.parentToolUseId,
        displayLabel: data.displayLabel,
        model: data.model,
        promptHash: data.promptHash,
        status: data.status,
        phase: data.phase,
        usageInputTokens: data.usageInputTokens,
        usageOutputTokens: data.usageOutputTokens,
        endedAt: data.endedAt,
      },
    })
    .returning();
  return row as PiAgentSession;
}

export async function upsertMeleeAgentRun(
  db: unknown,
  data: NewAgentRun,
): Promise<AgentRun> {
  const [row] = await meleeDb(db)
    .insert(pgSchema.agentRuns)
    .values(data)
    .onConflictDoUpdate({
      target: pgSchema.agentRuns.id,
      set: {
        piSessionId: data.piSessionId,
        containerId: data.containerId,
        parentRunId: data.parentRunId,
        parentToolUseId: data.parentToolUseId,
        agentName: data.agentName,
        trigger: data.trigger,
        inboundEventId: data.inboundEventId,
        outboundEventId: data.outboundEventId,
        displayLabel: data.displayLabel,
        phase: data.phase,
        status: data.status,
        usageInputTokens: data.usageInputTokens,
        usageOutputTokens: data.usageOutputTokens,
        usageCacheRead: data.usageCacheRead,
        usageCacheWrite: data.usageCacheWrite,
        usageCostEstimate: data.usageCostEstimate,
        startedAt: data.startedAt,
        endedAt: data.endedAt,
      },
    })
    .returning();
  return row as AgentRun;
}

export function meleeKernelDatabaseUrlFromEnv(
  env: Record<string, string | undefined> = process.env,
): string | null {
  return (
    env.ORCH_AGENT_KERNEL_DATABASE_URL ??
    env.AGENT_KERNEL_DATABASE_URL ??
    null
  );
}

export function meleeKernelRuntimeRequiredFromEnv(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return /^(1|true|yes)$/i.test(env.ORCH_AGENT_KERNEL_REQUIRED ?? "");
}

export async function openMeleeKernelDatabase(
  options: OpenMeleeKernelDatabaseOptions = {},
): Promise<MeleeKernelDatabaseHandle> {
  const databaseUrl = options.databaseUrl ?? meleeKernelDatabaseUrlFromEnv();
  if (!databaseUrl) {
    throw new Error(
      "Agent Kernel database URL is not configured; set ORCH_AGENT_KERNEL_DATABASE_URL or AGENT_KERNEL_DATABASE_URL.",
    );
  }

  const queryClient = postgres(databaseUrl, {
    max: options.maxConnections ?? 5,
    onnotice: options.suppressNotices === false ? undefined : () => {},
  });
  const db = drizzle(queryClient, { schema });

  return {
    db,
    databaseUrl,
    close: () => queryClient.end({ timeout: 1 }),
  };
}
