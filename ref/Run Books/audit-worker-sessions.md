# Audit Worker Sessions

Procedure for auditing what worker agents actually did in a run or epoch: which tools each worker invoked, with what queries, at what error rates, and how tool usage differed between workers that found matches and workers that didn't. Written 2026-08-27 after the run-`4a45af8a` / epoch-`6cfc8345` audits (the ledger-exposure work came out of it).

Intended use in a fresh agent session: *"Follow `ref/Run Books/audit-worker-sessions.md`. Audit the last N epochs of the current run and report per-cohort tool usage plus any broken tools."*

## 0. The three data planes

| Plane | Where | What it holds |
|---|---|---|
| Orchestrator sqlite | `games/melee/state/orchestrator.sqlite` (ALWAYS `sqlite3 -readonly` / `mode=ro`) | `worker_state` (who worked what, outcome, session ids, artifact dir), `worker_checkpoints` (per-attempt scores, `exact_match`, `hard_gates_passed`), `epochs` |
| Kernel Postgres | `postgres://agent_kernel:agent_kernel@127.0.0.1:55432/agent_kernel` (the `agent-kernel-db` docker container) | `pi_agent_sessions` (one row per agent session) and `trace_events` — the full transcript: `tool_call_start`/`tool_call_end` with `tool_name`, `tool_input`, `tool_output`, `is_error`; also `system_prompt_resolved`, `assistant_message`, etc. |
| Worker artifact dir | `worker_state.artifact_dir` → `games/melee/state/runs/<run>/worker_state/<id>/` | `tool_events.jsonl` (one record per custom-tool call), `activity.jsonl` (lifecycle), prompts/output (`worker_<session>.{system.md,user.md,txt}`), `runner_validation/` |

Ground rules:

- Orchestrator DB and kernel DB are **product state**: read-only. In Postgres use `CREATE TEMP TABLE` for scratch joins — never persistent tables.
- Sandbox workers do not write Pi JSONL to `.pi-sessions/` on the host; their transcript exists only in `trace_events`. The artifact dir is the host-side evidence.
- `tool_events.jsonl` caveats: soft failures (`graph_missing`, `disabled_tool`, …) log as `status:"ok"`, and the file is skipped entirely if the worker launched without a log dir — treat `trace_events` as the authority, `tool_events.jsonl` as the quick look.

## 1. Scope the workers

```bash
DB="games/melee/state/orchestrator.sqlite"
sqlite3 -readonly "$DB" "SELECT id, ordinal, status, admitted_count, created_at FROM epochs ORDER BY created_at DESC LIMIT 5;"
```

Note: the column is `ordinal`, not `epoch_number`. A `worker_state.lifecycle_status` of `timeout` is the routine session close, not a failure.

## 2. Cohort each worker by outcome

`worker_state.exact` only marks workers whose *final* state was exact. Workers that hit 100% but failed hard gates, or banked mid-tail, only show in `worker_checkpoints` — use it for match cohorts:

```sql
SELECT ws.worker_id, ws.target_key, ws.worker_session_ids_json,
  CASE WHEN MAX(wc.exact_match)=1 AND MAX(wc.hard_gates_passed)=1 THEN 'exact_banked'
       WHEN MAX(wc.exact_match)=1 THEN 'exact_gate_failed'
       WHEN MAX(wc.improved_over_baseline)=1 THEN 'improved'
       ELSE 'no_gain' END AS cohort
FROM worker_state ws LEFT JOIN worker_checkpoints wc ON wc.worker_state_id=ws.id
WHERE ws.epoch_id IN ('<epoch-id>', ...)
GROUP BY ws.id;
```

`worker_session_ids_json` holds the Pi session ids (UUIDv7) that join the kernel DB. Flatten to CSV (`session_id,worker_id,target_key,cohort`) for the next step. Errored spawns may have no kernel sessions at all — expect partial coverage for the `error` cohort.

## 3. Join to the kernel trace for tool usage

```bash
PGPASSWORD=agent_kernel psql -h 127.0.0.1 -p 55432 -U agent_kernel -d agent_kernel <<'EOF'
CREATE TEMP TABLE m(sid text, worker_id text, target_key text, cohort text);
\copy m FROM '/path/to/map.csv' CSV
-- Per-cohort tool distribution
SELECT m.cohort, e.event_data->>'tool_name' AS tool, count(*) AS calls,
       count(DISTINCT m.worker_id) AS workers_using
FROM m JOIN trace_events e ON e.pi_session_id = m.sid AND e.type='tool_call_start'
GROUP BY 1,2 ORDER BY 1, 3 DESC;
EOF
```

Compare `workers_using` against the cohort size and against the tool roster in `apps/server/src/core/tools/profiles/defaults.ts` (`defaultWorkerToolProfile`) — a wired tool nobody calls, or a cohort gap, is the finding.

## 4. Process reconstruction for interesting workers

Full ordered timeline with the actual search queries:

```sql
SELECT e.timestamp, e.event_data->>'tool_name' AS tool,
  left(coalesce(e.event_data->'tool_input'->'raw'->>'query',
                e.event_data->'tool_input'->'raw'->>'symbol',
                e.event_data->'tool_input'->'raw'->>'path'), 90) AS arg
FROM m JOIN trace_events e ON e.pi_session_id=m.sid AND e.type='tool_call_start'
WHERE m.worker_id='<worker_id>' ORDER BY e.timestamp;
```

Useful aggregates: average call-position percentile per tool (recon vs late-loop), calls-per-worker by cohort (grind vs efficiency), and first-10-calls tool mix.

## 5. Broken-tool sweep

```sql
SELECT e.event_data->>'tool_name' AS tool, count(*) AS calls,
  count(*) FILTER (WHERE e.event_data->>'is_error'='true') AS errors
FROM m JOIN trace_events e ON e.pi_session_id=m.sid AND e.type='tool_call_end'
GROUP BY 1 HAVING count(*) FILTER (WHERE e.event_data->>'is_error'='true') > 0
ORDER BY errors DESC;
```

Then read sample `tool_output` for the top offenders — the message names the cause. Also sweep custom-tool outputs for the soft-failure markers (`graph_missing`, `unknown_source_id`, `disabled_tool`, `debug_compiler_not_provisioned`): these return `is_error=false` and never show in error counts. Precedents found this way (both 100% failure, invisible in summaries): sandbox `grep` with `rg` missing from the snapshot; workers `read`ing host artifact paths injected by repair packets that don't exist inside the sandbox.

## 6. Single-session views (no SQL)

- UI: `/workspace/trace?containerId=melee:<appSessionId>:session:run:<runId>:epoch:<epochId>:worker:<claimId>` (container ids are built in `apps/server/src/infrastructure/kernel/bridge/session-mapping.ts`; find them via `trace_events.container_id LIKE '%<epoch-id-prefix>%'`).
- HTTP: `GET /kernel/containers/<containerId>/trace` on the dashboard server.
- Disk: `worker_state.artifact_dir` → `tool_events.jsonl` for tool calls, `worker_<session>.txt` for raw output.
