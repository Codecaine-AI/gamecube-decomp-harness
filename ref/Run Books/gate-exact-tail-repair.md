# Gate-Exact Tail Repair

Operating procedure for monitoring a melee run for stuck "Gate-Exact Tail" targets (worker reached an exact match but QA gates rejected it and the repair tail exhausted), repairing them to gate-clean with sub-agents, applying the fixes to the live cycle tree, and capturing the knowledge as worker reports. Written 2026-07-12 after a 46-target campaign (42 exact-clean, 4 documented policy blockers).

Intended use in a fresh agent session: *"Follow `ref/Run Books/gate-exact-tail-repair.md`. Monitor for new gate-exact tails every 30 minutes; process any to completion and write the reports."* (Pair with `/loop 30m` or a Monitor for the cadence.)

## 0. Locate the active run (paths change per run/cycle)

```bash
DB="games/melee/state/orchestrator.sqlite"          # ALWAYS open read-only: sqlite3 -readonly
RUN=$(sqlite3 -readonly "$DB" "SELECT id FROM runs ORDER BY created_at DESC LIMIT 1;")
# Cycle tree (the run's live source; NEVER edit except via the apply step below):
# find it from a running job-runner:  ps ax | grep job-runner | grep -o '\-\-repo-root [^ ]*'
# or: games/melee/worktrees/cycles/<cycle>/current
```

Ground rules (standing user policy):

- Orchestrator DB is **product state**: reads are fine; the ONLY sanctioned writes are the worker-report capture in §6. Never touch worker_state/checkpoints/claims/epochs/integrations.
- **Do not run report-run or reset baselines** — promotion to the UI's Confirmed table belongs to the epoch runner's boundary report. (Applied fixes sit as uncommitted working-tree state until then; that is expected.)
- No git commits to the cycle tree; apply patches to the working tree only (matches the integration convention).

## 1. Detect new tails (every ~30 min)

```sql
SELECT ws.target_key, ws.ended_at, ws.best_score, ws.artifact_dir
FROM worker_state ws
WHERE ws.summary_json LIKE '%gate_failed_exact_followup_budget_exhausted%'
  AND ws.ended_at > '<last sweep timestamp>'
ORDER BY ws.ended_at DESC;
```

Also worth sweeping occasionally (broader class: exact checkpoints that could never be accepted):

```sql
SELECT ws.target_key, MAX(wc.new_score), ws.artifact_dir
FROM worker_checkpoints wc JOIN worker_state ws ON ws.id=wc.worker_state_id
WHERE wc.exact_match=1 AND wc.selectable=0 GROUP BY ws.target_key;
```

**Triage before launching anything:**

- Drop stale echoes: check each symbol's current fuzzy % in the latest report (`<session>/build/GALE01/report.json`) or via objdiff — workers in flight when a prior repair landed produce tail records for already-fixed functions.
- Drop targets already listed as policy blockers in `knowledge/oob-repair-blockers` facts (see §7) — more agent effort will not fix those.
- Group remaining targets **by unit** — one agent per unit, so patches to the same files can't collide.

## 2. Launch the repair fleet

One background general-purpose agent per unit. Prompt template (fill in unit/targets/artifact dirs; keep the playbook reference):

> Read and follow exactly: [Gate-Exact Repair Playbook](./gate-exact-repair-playbook.md)
> Your assigned unit: `<unit>` (`<source path>`). Targets (current fuzzy %): `<symbol — %, artifact dir>` …
> Deliverable dir: `<scratchpad>/repairs/<unit-shortname>/`

Notes that matter:

- If the user has directed that repair agents implement directly (they did for this campaign), state in the prompt that this overrides the global codex-delegation rule.
- Shared-header / config-file units (sysdolphin baselib, anything touching `symbols.txt`/`splits.txt`) must run a repo-wide A/B check; the playbook mandates it.
- Batch size ~8–11 concurrent agents; backfill as they finish. If agents die to an agent session limit, resume them with SendMessage (context survives) rather than relaunching.

## 3. Verification gauntlet (coordinator side, per delivered patch)

Never trust the agent's claims alone. In order:

1. **Banned-construct grep** over added lines: `#pragma` (net-new; pure moves must net zero), `__assert(`, `\bregister\b`, `\basm\b`, `goto `, function-like `#define` aliases, `extern` in `.c`, K&R empty-paren decls. Comment mentions are fine — confirm by eye.
2. **Fresh QA gate**, both surfaces, run yourself:

   ```bash
   python3 toolpacks/gamecube-decomp/source_editing/review_lint/api/scan_diff.py \
     --repo <agent worktree> --diff-file <repair.patch> --surface worker  --gate --json
   # and again with --surface pr_gate ; both must pass 0 errors / 0 warnings
   ```

3. **Same-tool scoring only**: `objdiff-cli diff` vs `objdiff-cli diff` (with `--config functionRelocDiffs=data_value`). `objdiff report generate` disagrees with `diff` on partial matches (they agree at 100) — comparing across tools produces phantom regressions.
4. **Claims gate — check BEFORE apply and let it actually gate** (`if [ "$C" = 0 ]; then apply; fi`):

   ```sql
   SELECT COUNT(*) FROM target_claims tc JOIN epoch_targets et ON et.id=tc.epoch_target_id
   WHERE tc.status='active' AND et.unit LIKE '%<unit>%';
   ```

   Check EVERY unit the patch touches (a patch moving data between TUs gates on both; a header patch gates on consumer units it rewrites).
   If claimed: park the patch and arm a Monitor that polls claim counts (~45s) and notifies when clear. Exception — apply despite an active claim only when the claimed symbol's file region provably cannot overlap the patch hunks (compare hunk headers vs the claimed function).
5. **Drift check**: agents snapshot session-dirty at start; if the live tree moved since (their patch was verified against a stale base), reconcile explicitly — inspect the drift, revert only orphaned lines the patch supersedes (claim must be closed), or have the agent regenerate against the current base. `git apply --check` failing is the signal.
6. Apply: `git -C <session tree> apply <repair.patch>` (working tree only, no commit).

## 4. Outcome classes (all are successes — record them)

- **exact-clean**: 100.0 + QA 0/0 both surfaces + zero regressions → apply.
- **best gate-clean**: exact provably requires a banned pattern; apply the clean improvement and record the blocker evidence.
- **already-done**: measurement/config artifact (stale echo, renamed symbol, moved TU) — fix the metadata story, nothing else.
- **policy blocker**: document precisely (which rule, what evidence, what the only exact route is) — these go to the maintainer, not back into the queue. Known standing blockers: particle `fn_80393C14`/`hsd_80394434` (need per-function `pool_data off`), grgreens `grGreens_80214FA8`/`_802166C4` (need retail `OSReport(__FILE__,…)` vs `assert_idiom_downgrade`).

## 5. Root-cause patterns (check in this order — full detail in the playbook)

1. **Config metadata, not source** (~40% of cases): `symbols.txt` extents (missed NUL/pad), TU-local literals annotated `scope:global` (→ `@NNN scope:local data:string` + claim the `splits.txt` gap), data attributed to the wrong TU, missing TU split (MWCC's merged-data anchor always sits at .data+0 — a retail anchor elsewhere proves a separate TU).
2. **Name evidenced data semantically** across `.c`/`.static.h`/`symbols.txt`; declarations in the owning header, never `extern` in `.c`.
3. **Fix headers truthfully** — try in-slice typing first, then request owning-header widening with evidence instead of hiding a signature mismatch behind a `#define` alias or bare local prototype. Retype the owning prototype and check the owner plus direct consumers.
4. **MWCC idioms**: `if (0) {…}` statement padding beats auto-inline (threshold 14 pre-expansion statements); `__declspec(weak)` breaks ≥3-object data pooling; inlined u16-returning helper reproduces argument truncation (replaces goto); real jobj.h inline helpers already emit exact assert strings; `#ifdef __MWERKS__`/`#else` guard (upstream-master precedent) when clean C provably can't match.
5. **Lint false positives are real** — e.g. `SP_LOCAL_DECL_RE` fires on `speed` (`sp`+hex-letters). If the only "violation" is a name, rename the local.

## 6. Write the worker reports (the knowledge capture step)

For each processed target (including blockers), persist into the run's report/knowledge pipeline. Channel map (established 2026-07-12):

- **`path_facts` is the channel that durably reaches future worker prompts** (`games/melee/knowledge/sources/injectable/path_facts/data/path_facts/*.jsonl`, schema `path_fact_v1`, status `accepted`; rebuild the index after adding; verify resolution injects your fact for the target file). Policy-blocker facts should say "exact requires banned pattern X — do not re-attempt exact". Existing blocker facts live in `oob_repairs_2026_07.jsonl`.
- Copy deliverables (result.json, repair.patch, QA outputs) to `games/melee/state/runs/<RUN>/oob_repairs/<name>/` with per-target `report/<symbol>/worker_report.json` + `facts.json` (+ `blocker.json`) — scratchpad dirs die with the cycle. Maintain `oob_repairs/manifest.json`.
- Insert a `worker_reports` row per repair (`report_type='oob_repair'`, lease_id NULL, paths → durable copies). Know its limits: the table is a legacy channel — no harness code reads it and the UI's worker-reports view renders `worker_state` rows, so these are durable records, not UI entries.
- Do NOT append to `knowledge_curator_updates.jsonl` expecting persistence — `curateKnowledgeEnrichments()` regenerates it from `worker_state` each maintenance run, discarding foreign records. Never fabricate `worker_state`/lease rows to get into that channel.

## 7. Report to the user

End each sweep with: targets found (after triage), per-target before→after and fix class, what was applied vs parked vs blocked, any new lint bugs or systemic findings, and the epoch-boundary ETA for the values to reach the UI's Confirmed table. Silence is only acceptable when the sweep found nothing — say that too, briefly.

## Reference: campaign of 2026-07-11/12

46 targets: 42 exact-clean (41 applied same night), 4 policy blockers. Side findings: 3 real code bugs (grinishie1 backward table walk + wrong assert line, gmregclear wrong literals, mnmainrule fake data blob), 1 CI-breaking K&R contamination removed (toy.c), 1 new TU discovered (gm_1A9B.c), 1 lint bug (`speed`), 2 harness fixes shipped (gate-priority repair prompt; worker objdiff config aligned to the board's `objdiff_report_args`). Root-cause split: ~40% config metadata, ~25% header/prototype truth, ~25% MWCC idiom search, ~10% lint issues.
