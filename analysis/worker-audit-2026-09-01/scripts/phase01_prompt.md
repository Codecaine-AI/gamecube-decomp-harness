# Task: Worker-audit Phase 0 + Phase 1 (manifest, cohorts, tool-usage stats, transcript condenser)

You are building the data layer for an audit of decomp worker agents. Work entirely inside:
`/Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/analysis/worker-audit-2026-09-01/`
(call it AUDIT_DIR). Put scripts in AUDIT_DIR/scripts/, outputs in AUDIT_DIR/.

Use sub-agents / parallel execution wherever the work can be split — optimize for wall-clock speed.

## Source data

SQLite DB: `/Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/games/melee/state/orchestrator.sqlite`
Run of interest: run_id = `4a45af8a-9f8c-499b-b375-c0d8e93fc8fd` (cycle 02a80f9b, the only run that matters).

Table `worker_state` columns (relevant): id, run_id, epoch_id, worker_id, target_key, lifecycle_status, artifact_dir, worker_session_ids_json (JSON array of session ids), started_at, ended_at, baseline_score, best_score, exact (0/1), error_summary, timeout_summary.
Table `epochs`: id, ordinal, status. Join worker_state.epoch_id = epochs.id to get epoch ordinal.

Each worker's artifact_dir (absolute path) contains:
- `tool_events.jsonl` — one JSON object per tool call: {claim_id, attempt_index, tool, params, status, exit_code, duration_ms, created_at}
- `worker_<sessionid>.txt` — worker's self-written final summary (JSON-ish text, ~4KB), one per session
- `worker_<sessionid>.system.md` / `.user.md` — prompts
- `host-cwd/.pi-sessions/**/worker/*_<sessionid>.jsonl` — FULL session transcript (~600KB each). JSONL of message/tool events.

Some artifact_dirs may be missing or incomplete — record that in the manifest rather than crashing.

## Phase 0 outputs

1. `manifest.json` — array, one record per worker_state row of the run: {ws_id, worker_id, epoch_ordinal, target_key, lifecycle_status, baseline_score, best_score, exact, started_at, ended_at, duration_min, artifact_dir, summary_files: [...], transcript_files: [...], tool_events_path, has_tool_events, cohort}.
   Cohort rules: `exact` if exact=1; else `near_miss` if best_score >= 99.5; else `progressed` if best_score > baseline_score + 0.0001; else `no_progress`.
2. `cohorts.json` — counts per cohort overall and per epoch ordinal.
3. `pairs.json` — deep-read sample for Phase 3: consider only epochs with ordinal >= 3. Per epoch, take up to 6 exact workers (prefer ones whose baseline_score is lowest, i.e. hardest wins), and for each pair it with the near_miss worker in the SAME epoch with the closest baseline_score (each control used at most once; if the epoch runs out of near_miss controls, borrow from the adjacent epoch). Output array of {pair_id, epoch_ordinal, exact: {ws_id, target_key, baseline_score, best_score}, control: {same fields}}.

## Phase 1 outputs

Parse tool_events.jsonl for EVERY worker in the manifest (~1600 files; parallelize). Per worker compute: total tool calls, calls per tool name (full histogram), n distinct tools, error/nonzero-exit count, duration of session (first to last event), counts for key tools if present (build/compile tools, diff/checkdiff tools, permuter/source_permuter tools, graph_related_functions, past_prs_search, knowledge/search tools — inspect the actual tool names present in the data and group them sensibly; report the raw tool-name vocabulary you found), longest repeated edit->build->diff loop count (approximate: number of build-tool invocations), time-to-first-build-minutes.

4. `phase1_per_worker.json` — the per-worker metrics keyed by ws_id.
5. `phase1_stats.md` — a readable report comparing cohorts (exact vs near_miss vs progressed vs no_progress), overall and per epoch: means/medians of the metrics above, tool-usage prevalence (% of workers in cohort using each tool at least once), the 15 tools with the biggest prevalence gap between exact and near_miss, and any striking sequence-level differences you can compute cheaply (e.g. ratio of diff-inspection calls to edit calls). Include a short "vocabulary" appendix listing all tool names seen with counts. Plain markdown, tables fine.
6. `phase1_stats.json` — the same aggregates machine-readable.

## Transcript condenser

7. Write `scripts/condense_transcript.py` (or .mjs): given a ws_id, reads that worker's full transcript jsonl file(s) from the manifest, and writes `AUDIT_DIR/condensed/<ws_id>.md` containing IN ORDER: every assistant text/reasoning message verbatim, every tool CALL as one line `TOOL <name> <compact params, truncated to 200 chars>`, and tool RESULTS truncated to 400 chars each (keep score/diff summary lines when trivially detectable, drop long file dumps). Target: condensed file ≤ 120KB even if input is 600KB+. First inspect 2-3 real transcript files to learn the actual JSONL schema, and make the condenser robust to it.
8. RUN the condenser for every worker that appears in pairs.json (both exact and control) — populate AUDIT_DIR/condensed/. Parallelize.

## Rules
- Python3 or Node are both fine (bun and node are installed). No new package installs; stdlib only.
- Do not modify anything outside AUDIT_DIR. The state directory is READ-ONLY.
- When done, print a final summary: manifest count, cohort counts, number of pairs, number of condensed transcripts written, and any workers you had to skip and why.
