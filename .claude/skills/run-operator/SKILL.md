---
name: run-operator
description: "Start or resume a melee decomp run with the user's staged config, then babysit it: monitor workers, epochs and boundaries, repair the known failure classes, honor pause directives, and leave a written trail. Use when asked to run, resume, monitor, pause or babysit the melee run."
---

# Run Operator

You are the operator for one live melee decomp run. Your job is not to write
decomp code — the workers do that. Your job is to keep the machinery moving,
catch it when it stalls or breaks, repair the mechanical breaks the boundary
produces, and tell Ford the truth about what happened.

Everything below was learned by running the system live on 2026-08-27..31
(epochs 3–13, 38 harness fixes, PR doldecomp/melee#3223 from 91.49% to 94.47%).
Commands and paths are exact. Where the system has a known bug, the workaround
is written down; fix the bug when you can, but never block the run on it.
Entries marked FIXED describe failure classes that should no longer occur —
their remedies are kept because a recurrence is a regression worth both
repairing and reporting.

## 0. Shape of the system (read once)

- **Server** `bun apps/server/src/server.ts` on `:8787`. **Only Ford starts or
  restarts it.** Never do this yourself. A restart is the only way API-side code
  changes take effect.
- **Scheduler** — the server spawns it as a managed process when a run starts
  or resumes:
  `bun apps/server/src/job-runner.ts --game melee --repo-root <cycle worktree>
  --state-dir games/melee/state --provider codex-lb --model <model>
  --thinking-level <level> --sandbox-profile <profile> run-loop
  --max-workers <N> --run-id <runId> --lease-id <lease>`.
  It loads the **working tree** at spawn. Scheduler-side code changes need a
  scheduler restart (stop + resume).
- **Workers** — `worker-task` children, one per attempt, each in a Daytona
  sandbox. They also load the working tree at spawn, so worker-side changes go
  live on the next attempt with no restart.
- **State** — `games/melee/state/orchestrator.sqlite`. Tables you will touch:
  `runs` (status + `inputs_json.configuration_snapshot`), `epochs`,
  `epoch_targets`, `target_claims`, `jobs`, `harness_state` (the dispatch lease
  lives in `active_workflow_json`), `save_points`, `events`, `game_events`,
  `integration_outcomes`, `pending_integrations`.
- **Knowledge graph** — `games/melee/graph/graph.sqlite`; the admission guard
  reads `knowledge_graph_metadata.board_report_provenance`.
- **Logs** — `games/melee/state/ui-processes/melee-live.stderr.log` (scheduler
  + boundary steps), `melee-live.stdout.log`, process record `melee-live.json`.
- **Worktrees** — cycle worktree `games/melee/worktrees/cycles/<cycle>/current`
  on branch `orchestrator/cycle/<cycle>` (this is what the draft PR pushes);
  epoch worktree `games/melee/state/epoch_worktree` (throwaway, rebuilt every
  boundary — never fix things only there).
- **Run config** — `runs.inputs_json.configuration_snapshot`
  `{model, provider, thinking_level, desired_workers, sandbox_profile,
  agent_timeout_seconds}`. The user sets it by staging the run in the UI.
  Resume applies the snapshot, including a changed `desired_workers` (fix 31
  syncs the column before the scheduler spawns). To change it by hand on a
  paused run: `sqlite3 <db> "UPDATE runs SET inputs_json=json_set(inputs_json,'$.configuration_snapshot.thinking_level','xhigh') WHERE id='<runId>'"`,
  then resume; verify with `ps`.
- **Kernel DB** — `games/melee/state/agent-kernel.sqlite` (bun:sqlite, WAL;
  override `ORCH_AGENT_KERNEL_DB_PATH`). Worker spawns need it readable. The
  old `agent-kernel-db` Postgres docker container is DEPRECATED — nothing
  depends on it; its 37 GB volume is a read-only archive of pre-2026-08-31
  traces.

Set these once per session:

```bash
cd "/Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness"
DB=games/melee/state/orchestrator.sqlite
RUN=<runId>                       # e.g. 4a45af8a-9f8c-499b-b375-c0d8e93fc8fd
CW=games/melee/worktrees/cycles/<cycle>/current
LOG=games/melee/state/ui-processes/melee-live.stderr.log
```

## 1. Preconditions

1. Server up: `lsof -nP -iTCP:8787 -sTCP:LISTEN` shows a `bun` pid. If not,
   ask Ford; do nothing else.
2. Read `objectives/epoch-flow-redesign/current_state.md` top entry and
   `<next_actions>` — any standing directive (e.g. "pause after this epoch")
   lives there. Also `~/.claude/projects/.../memory/MEMORY.md`.
3. Run state:
   ```bash
   sqlite3 $DB "SELECT status FROM runs WHERE id='$RUN';
     SELECT ordinal,status,COALESCE(boundary_status,'-'),finished_count,admitted_count FROM epochs WHERE run_id='$RUN' ORDER BY ordinal DESC LIMIT 2;
     SELECT COALESCE(json_extract(active_workflow_json,'$.lease_id'),'NULL')||' hb='||COALESCE(json_extract(active_workflow_json,'$.heartbeat_at'),'-') FROM harness_state;"
   ps aux | grep 'job-runner.ts' | grep '[r]un-loop'     # scheduler alive?
   ps aux | grep -c '[w]orker-task'                       # workers alive?
   ```
4. Working tree: `git status --short | grep -v '^??'`. Someone else's
   uncommitted WIP in `apps/server/src/core/cycle-runtime/**` means a fresh
   scheduler will load unfinished code. Say so before resuming; don't stash it.

## 2. Start / resume

- **First start after staging** (run `ready`):
  `curl -s -X POST localhost:8787/api/process/start -H 'content-type: application/json' -d '{"gameId":"melee","confirmed":true}'`
- **Resume** (run `paused`):
  `curl -s -X POST localhost:8787/api/run/resume -H 'content-type: application/json' -d "{\"gameId\":\"melee\",\"runId\":\"$RUN\",\"confirmed\":true}"`
- **Run `active` but no scheduler** (crash, or a stop that left the lease held):
  recover first, then resume. Recover requires a stale lease (15 min, holder
  dead). If it's held by a dead scheduler and not yet stale:
  ```bash
  ps aux | grep '[w]orker-task' | grep "$RUN" | awk '{print $2}' | xargs -I{} kill -TERM {}   # orphans block liveness
  sqlite3 $DB "UPDATE harness_state SET active_workflow_json=json_set(active_workflow_json,'$.heartbeat_at','2000-01-01T00:00:00.000Z'), revision=revision+1 WHERE game_id='melee' AND active_workflow_json IS NOT NULL;"
  curl -s -X POST localhost:8787/api/run/recover -H 'content-type: application/json' -d "{\"gameId\":\"melee\",\"runId\":\"$RUN\",\"confirmed\":true}"
  ```
  Do not use `/api/run/force-release-lease` unless the server was restarted
  after 2026-08-28 — with a NULL lease, older server builds refuse recover.
- **Verify the spawn** within 30 s:
  `ps aux | grep 'job-runner.ts' | grep '[r]un-loop' | grep -oE '(model [a-z0-9.-]+|thinking-level [a-z]+|max-workers [0-9]+|lease-id lease-[a-f0-9]{8})'`
  and after ~1 min `ps aux | grep '[w]orker-task' | grep -oE 'thinking-level [a-z]+' | sort | uniq -c`.
  Both must show the user's config.

`/api/process/stop {"gameId":"melee","confirmed":true}` is the graceful stop
(escalates to SIGKILL). It sometimes leaves the lease held and the run
`active`; that is what the recover path above is for.

## 3. Monitoring loop

Run two persistent monitors (Monitor tool) and otherwise stay quiet.

**Heartbeat** (30 s, print only on change):
```bash
DB=...; RUN=...; prev=""; while true; do
  e=$(sqlite3 "$DB" "SELECT 'ep'||ordinal||' '||status||'/'||COALESCE(boundary_status,'-')||' '||finished_count||'/'||admitted_count FROM epochs WHERE run_id='$RUN' ORDER BY ordinal DESC LIMIT 1;" 2>/dev/null)
  [ -z "$e" ] && { sleep 30; continue; }            # transient read during WAL checkpoint
  rs=$(sqlite3 "$DB" "SELECT status FROM runs WHERE id='$RUN';")
  b=$(sqlite3 "$DB" "SELECT COUNT(*) FROM jobs WHERE run_id='$RUN' AND kind='worker' AND status IN ('claimed','running');")
  w=$(sqlite3 "$DB" "SELECT COUNT(*) FROM jobs WHERE run_id='$RUN' AND kind='worker' AND status='waiting';")
  sch=$(ps aux | grep 'job-runner.ts' | grep -c '[r]un-loop --max')
  cur="$e run=$rs sched=$sch"; [ "$w" -ge 5 ] && cur="$cur HIGH-WAITING"
  [ "$cur" != "$prev" ] && { echo "$(date -u +%H:%M:%S) $e run=$rs sched=$sch busy=$b waiting=$w"; prev="$cur"; }
  sleep 30; done
```

**Log tail**:
```bash
tail -F "$LOG" | grep -E --line-buffered '\[run-loop\]|\[epoch\]|breakage|micro_gate|ci_parity|FATAL|draft|pr_sync|admission|reconcil' \
  | grep -vE --line-buffered 'boundary is still failed|displaced by upstream|boundary retry due at'
```

What healthy looks like: `busy` ≈ max-workers early, then tracking the
distinct-file count of open targets (same-file claim exclusivity — one
worker per .c file); `finished_count` rising (xhigh attempts run up to the
configured agent timeout); `waiting` small and transient; occasional
`job coverage reconciled (+k / -m)` (claim-aware since fix 30 — endless
identical +N lines are a regression); `sched=1`.

**Attempt budget (`attempt_budget_v3`, landed 2026-08-31)** — know this
before judging worker pace. Workers NO LONGER close on the first banked
improvement. Each worker gets 5 submissions; every submission that sets a
new best (a gate-clean score improvement, or reaching 100% even with hard
gates failing — that grants only once) adds +2 to its budget. It stops on:
accepted exact, budget spent (`attempt_budget_exhausted`), or claim
deadline. Operational consequences:
- Workers on productive targets hold their claim and slot much longer than
  pre-v3 epochs. A worker cycling several attempts after banking an
  improvement is the design working, not a stall — banked checkpoints are
  safe in SQLite and the best one is selected at close regardless.
- `finished_count` rises slower per slot than in epochs ≤13; recalibrate
  before invoking §5.8. Judge a target by attempts consumed vs its budget
  (`continuation_attempts.decision` in the worker summary / attempt gate
  JSON: `attempt_budget`, `improvementGrants`), not by wall-clock alone.
- The claim TTL is unchanged (`agent_timeout_seconds` + 600 s grace) and the
  budget never extends time, so long budgets often end as `claim_deadline`.
  That is normal, not a fault.
- New stop reason `attempt_budget_exhausted` replaces `improvement_banked`,
  `cold_attempt_budget_exhausted`, `gate_failed_exact_followup_budget_exhausted`
  and `accepted_or_no_repair_reasons` in fresh data (old names appear only
  in pre-v3 rows). Config keys in summaries are now `base_attempts` /
  `bonus_attempts_per_improvement`.
- The policy is worker-side code: worker-task children load the working
  tree at spawn, so it is live from the next attempt with no scheduler
  restart. Mid-epoch, workers spawned before and after the change coexist;
  the first fully-v3 epoch is the one to watch for slot starvation (all
  slots held by long-budget workers while admitted targets queue — report
  it; do not kill productive workers for it).

What is not healthy — act immediately:
- `sched=0` while `run=active` → §5.7.
- `busy` stuck below max-workers with queued jobs for >10 min → §5.7 (dead
  scheduler) or §5.9 (surplus/stale jobs).
- `finished_count` flat for >2 h with slots busy → tail livelock, §5.8.
- The log monitor replays days-old lines → the log file was reopened: the
  scheduler restarted or died; check `melee-live.json`.
- `Database has closed` in the log → scheduler crash; §5.7.

Do not restart the scheduler mid-epoch to pick up code changes; you drop
every in-flight attempt. Restart at the tail (few attempts live) or at a
boundary.

**Widening watch** (owning-header write-set widening is the default since
2026-09-01; it had never run live before that). Check once per epoch:
```bash
sqlite3 -readonly "$DB" "SELECT status, COUNT(*) FROM write_set_widenings WHERE run_id='$RUN' GROUP BY status;"
sqlite3 -readonly "$DB" "SELECT created_at, substr(payload_json,1,300) FROM events WHERE run_id='$RUN' AND event_type='widening_routed_cross_module' ORDER BY created_at DESC LIMIT 5;"
```
- Expect `approved` rows for rung-2 (symbols/splits) and rung-3 (one owning
  header). Mostly `denied` = workers cannot satisfy the evidence schema; quote
  the `decision_reason` values to Ford rather than loosening policy yourself.
- `widening_routed_cross_module` = a rung-4 (other `.c` file) request. It is
  never auto-granted; surface it with the target and requested path.
- Widened checkpoints stay `tentative` until the boundary confirms them, and
  the run checkpoint is in confirmed-only PR eligibility, so tentative work is a
  deferred patch, not a PR candidate, until then. A `regressed` outcome after a
  boundary revert-bisect is the mechanism working; report it, do not re-apply.
- Escape hatch: `--write-set-widening off` (or `shadow`) on the scheduler,
  then restart it. Only with Ford's say-so.

## 4. Boundary checklist

The boundary starts when `finished_count == admitted_count` and no claims
remain. It takes 10–25 min. Verify each step in the log, in order:

1. `integration_drain` — blocked by a `resolver_failed` item → §5.6.
2. `link_complete_units` — warning only by default (candidates listed).
3. `precommit_autofix` — reformats in the cycle worktree; "N file(s)" is fine.
4. `snapshot_commit` — commits the cycle worktree ("using existing HEAD" when clean).
5. `configure`, `report_build` — on failure the bounded codex build-fixer runs
   once with the FULL `ninja -k 0` failure list and retries; on a green retry
   it commits its diff on the cycle branch, on failure it restores a clean
   worktree (fix 36). A dirty worktree after a fixer run is a regression. If
   the fixer can't repair it → §5.1 by hand.
6. `report_read … matched_code X%` — the number to report.
7. `qa_scan` — known false positives: `mnInfo_803EFC08`
   (address_named_static_data), `lbcollision.c` numeric_literal_to_symbol.
8. `regression_repair` — findings are deferred with ledger notes; ">12 rows"
   pauses the run on the regression latch at the end of the pass → §5.4.
9. `save_point`.
10. `boundary_sync` — merges upstream with the per-function POLICY MERGE
    (`--sync-merge-policy=score`, the default since fix 38: upstream-matched
    = upstream text; ours-exact = ours; else higher score; per-file decisions
    in the step log; `theirs` is the escape hatch) and rebuilds; a break here
    runs the sync build-fixer once (commit-or-revert, full failure list); if
    it still fails → §5.1, §5.2.
11. `boundary breakage:` lines = master breakage gate vs upstream CI. Any
    `100% -> <100%` is a real breakage of something upstream matched → §5.3.
    Never let that reach the PR.
12. `ci_parity_gate` — link + test arms, then pre-commit (clang-format,
    clang-tidy with WarningsAsErrors, editorconfig; `check_complete` is
    warning-only). Failure skips the PR push.
13. `cycle draft PR updated https://github.com/doldecomp/melee/pull/3223` —
    verify: `gh pr view 3223 --repo doldecomp/melee --json headRefOid,mergeable`,
    `gh pr checks 3223 --repo doldecomp/melee` (10 checks), and the decomp-dev
    bot comment on the PR (`0 broken matches`, matched-code delta vs master).
14. Typed close → `full knowledge refresh` (subprocess, ~4 min) →
    `epoch N: admitted K targets`. K should be low hundreds. If admission is
    refused ("knowledge board provenance…" — a CONTENT sha mismatch; a
    path-only difference is just an info line): first check YOU didn't build
    in the cycle worktree after `report_publish` (operator builds there
    poison the check — never build between publish and admission). Otherwise
    rebuild host-side: `bun run kg:rebuild -- --game melee --repo-root $CW`.

If the pass ends with `paused on regressions` or `boundary retry k/5 scheduled`,
go to §5.4 / §5.5.

## 5. Failure playbook

Every repair: fix in the **cycle worktree**, verify host-side, commit on the
cycle branch, then retry the boundary. Codex sandboxes cannot run wibo/mwcc —
builds are host-side only.

Host verification, always all four:
```bash
cd $CW
ninja -k 0 2>&1 | grep -vE 'mvk-info|^\s+VK_' | grep -E '^FAILED: |^#\s+[0-9]+:|^#   Error'   # every failing TU
ninja 2>&1 | grep -E 'main\.dol: (OK|FAILED)|did NOT match'                                    # DOL sha1 check
ninja build/GALE01/report.json && python3 -c "import json;print(json.load(open('build/GALE01/report.json'))['measures']['matched_code_percent'])"
pre-commit run clang-tidy --files <changed>; pre-commit run clang-format --files <changed>
```

1. **Post-merge build break** (`object 'x' redefined`, undeclared function,
   incompatible pointer types, `-require-protos` misses) — upstream matched or
   changed a function a worker also touched. For every function upstream
   MATCHED or changed in the merged range (`git log --oneline <old>..<new> -- <file>`,
   `git diff <new> -- <file>`), restore upstream's version exactly
   (`git show <new sha>:<path>`), plus declarations it needs. Missing includes
   under `--require-protos` are just includes. Use `ninja -k 0` first so you fix
   all TUs in one round. Then §verification, commit
   (`git add -A src/ && git commit -m "boundary repairs after upstream <shas>: …"`).
2. **DOL sha1 FAILED but everything compiles** — a `Matching` unit fell below
   100%. Find it:
   ```bash
   python3 - <<'PY'
   import json,re; cfg=open('configure.py').read()
   m=set(re.findall(r'Object\(Matching,\s*"([^"]+)"',cfg)); r=json.load(open('build/GALE01/report.json'))
   for u in r['units']:
       k=u['name'].split('/',1)[1]+'.c'; ms=u['measures']
       if k in m and (ms.get('matched_code_percent',100)<100 or ms.get('matched_data_percent',100)<100): print(k, ms.get('matched_code_percent'), ms.get('matched_data_percent'))
   PY
   ```
   Usually the `-X theirs` merge replaced OUR exact match with upstream's
   near-match (upstream "improved" but did not match it). Restore our
   pre-merge file: `git checkout <pre-merge sha> -- <file>`. Upstream-gospel
   applies only to functions upstream *matched*.
3. **Breakage gate `100% -> <100%`** — our copy of an upstream-matched function
   differs. Typical causes: a clang-tidy "fix" applied inside it (e.g.
   `s32 x = 0;` vs upstream's `s32 x;` assigned later), a `volatile`/qualifier
   a worker added to a shared global, a changed prototype. Restore upstream's
   exact function; do not "fix" upstream's code.
4. **Regression latch** (`epoch N paused/regression_pause`) — the rolling
   baseline re-surfaces upstream-sync fallout as regressions. If the breakage
   gate was clean and the deferral notes are written, clear it:
   `sqlite3 $DB "UPDATE epochs SET status='error',boundary_status='error',boundary_attempt_count=0,boundary_next_attempt_at=NULL WHERE run_id='$RUN' AND ordinal=<N> AND status='paused';"`
   The retry launches within seconds. If it does not (older scheduler), stop +
   resume. To hold a retry while you repair: set `boundary_next_attempt_at` to
   a future ISO time; set it NULL to release.
5. **Reconcile shortcut** (`pending integration attempt reconciled; skipped:
   … re-ran: none`) — FIXED by fix 36 (evidence keyed by {epoch_id,
   boundary_attempt}); seeing this with steps actually skipped is a
   REGRESSION. Remedy if it recurs: delete the epoch's `pending_integrations`
   row, flip the epoch to error (§5.4), retry. If the next epoch was already
   admitted on top of the bogus close, roll it back first: cancel its jobs,
   close active `target_claims`, delete its `epoch_targets` and `epochs` row.
6. **`resolver_failed` integration blocking the drain** — a timed-out,
   non-exact checkpoint whose patch no longer applies:
   `UPDATE integration_outcomes SET status='rejected',disposition='rejected',resolved_at='<now>',updated_at='<now>' WHERE id='<job-id>' AND status='resolver_failed';`
   The target re-admits from the next board.
7. **Scheduler dead** (`sched=0`, `melee-live.json` `exited`, `Database has
   closed` storm, or silent) — kill orphan `worker-task` processes, recover
   (§2, backdate the lease), resume. Attempts in flight at the crash are lost;
   their job leases run the full agent timeout, so REQUEUE the dead
   scheduler's claimed jobs (§6 step-5 SQL) or the successor treats those
   slots as occupied for hours. If the crash
   signature is a masked exception, the run-loop now logs the original error
   (fix 25) — read it before resuming.
8. **Tail livelock** — the last N targets cycle full-timeout attempts, or
   admitted targets have no job (usually same-file exclusivity: open targets
   clustered behind active claims — check with a distinct-source_path count;
   that is by design, not a fault). Since `attempt_budget_v3` (§3) a tail
   worker that keeps earning +2 grants legitimately runs to its claim
   deadline — check `improvementGrants` in its latest attempt gate before
   calling it livelocked: grants accruing = progress; zero grants across
   full-timeout attempts = the old pattern. Give each remaining target ≥2
   rounds at the configured thinking level, then close the tail (precedent:
   Ford, epochs 5–12):
   ```bash
   EP=$(sqlite3 $DB "SELECT id FROM epochs WHERE run_id='$RUN' AND ordinal=<N>"); NOW=$(date -u +%Y-%m-%dT%H:%M:%S.000Z)
   sqlite3 $DB "BEGIN IMMEDIATE;
   UPDATE jobs SET status='cancelled',revision=revision+1,lease_id=NULL,lease_expires_at=NULL,updated_at='$NOW',completed_at='$NOW',error_json=json_object('message','force-ended by operator: epoch <N> tail closed') WHERE run_id='$RUN' AND kind='worker' AND status IN ('queued','claimed','running','waiting');
   UPDATE target_claims SET status='closed' WHERE run_id='$RUN' AND status='active' AND epoch_target_id IN (SELECT id FROM epoch_targets WHERE epoch_id='$EP');
   UPDATE epoch_targets SET status='finished',finished_at='$NOW',reason=COALESCE(reason,'')||' ; force-finished by operator <date> (tail closed; re-admit from next board)' WHERE epoch_id='$EP' AND status!='finished';
   UPDATE epochs SET finished_count=(SELECT COUNT(*) FROM epoch_targets WHERE epoch_id='$EP' AND status='finished') WHERE id='$EP';
   COMMIT;"
   ps aux | grep '[w]orker-task' | grep "$RUN" | awk '{print $2}' | xargs -I{} kill -TERM {}
   ```
   The boundary launches on the next tick.
9. **Surplus jobs / churn** — largely FIXED: the coverage reconciler is
   claim-aware (fix 30, enqueues only claimable uncovered targets) and the
   trim runs automatically (`job coverage reconciled (+0 / -k)`). If churn
   still appears (endless identical `+N / -0` lines, or jobs settling
   `no_target_available` in a loop), that's a regression — cancel the excess
   queued/waiting jobs by hand and investigate.
   Related, now-safe: manually requeued jobs no longer poison fresh attempts
   (fix 35 discards stale payload enrichment at claim), and infra failures
   (provider errors, kernel DB unreachable, sandbox provision failures)
   re-admit the target automatically with a 3-strike cap (fix 33) — no manual
   re-admission needed.
10. **`Storage schema is not the squashed baseline`** — a newer process
    migrated the DB under an older server. Ford must restart the server on the
    current tree. Do not roll the DB back.

## 6. Operator directives

**"Pause at the end of this epoch"** (the pattern Ford used on 2026-08-29):
1. Write it down first: `objectives/epoch-flow-redesign/current_state.md`
   `<next_actions>` and a memory note, with the exact stop condition.
2. Let the epoch finish or close its tail (§5.8).
3. Let the FULL boundary run (§4) — gates, PR push, close.
4. Arm a watcher that fires `POST /api/process/stop` the moment the next
   ordinal shows `admitted_count > 0` (the scheduler claims up to max-workers
   jobs within seconds of admission; the stop releases them).
5. After the stop: reset just-claimed rows
   `UPDATE jobs SET status='queued',revision=revision+1,lease_id=NULL,lease_expires_at=NULL,next_attempt_at=NULL WHERE run_id='$RUN' AND kind='worker' AND status IN ('claimed','running','waiting');`
   kill stray `worker-task` processes, recover the run to `paused` (§2).
6. Verify and report: `run=paused`, lease `NULL`, next epoch `active 0/K`,
   K targets `admitted`, K jobs `queued`, 0 active claims, no scheduler, PR
   head/CI status. Mark the directive DONE in the same two places.

**"Restart with thinking level X" / config changes**: stop → recover to paused
→ stage the new config in the UI (or edit `configuration_snapshot` by hand) →
resume (the snapshot is applied, including desired_workers — fix 31) → verify
`ps` on scheduler and workers.

## 7. Hard rules

- Never start or restart the `:8787` server. Ask Ford.
- Never `git stash` on the harness tree while a run is live —
  `games/melee/knowledge/ledger/learnings.jsonl` is appended continuously and
  the pop will fail.
- Never `git push` the PR branch by hand; the boundary pushes after the gates.
- Game-worktree commits only for boundary repairs (§5), with the verification
  done, on the cycle branch. Never revert worker work without Ford.
- Commit only your own files; other sessions may have WIP in the tree.
- Never turn write-set widening off or down without Ford; the default is `header`.
- Harness/code edits go through codex:
  `codex exec -m gpt-5.6-sol -c model_reasoning_effort="low" --enable fast_mode -s workspace-write "$(cat prompt.txt)" </dev/null`
  — one codex per worktree at a time; `xhigh` only for genuinely unclear root
  causes; always pass prompts via a file (backticks in inline prompts are
  executed by the shell). Codex cannot build the game — you verify host-side.
- Killing processes by pattern: match on the pid's argv, not on a substring that
  also appears in your own commands' text (it will kill your codex).
- Report what happened, not what you hoped: a skipped gate is a skipped gate.

## 8. Handoff

Before you stop for the day, or when Ford asks "status":
1. Append an entry to the top of `<status>` in
   `objectives/epoch-flow-redesign/current_state.md`: what ran, scores, gate
   verdicts, PR head + CI + bot numbers, every manual intervention with the
   SQL/commands used, open items. Update `<next_actions>` and `<active_runs>`.
2. Commit and push the harness (`git add` only your files).
3. One-screen summary to Ford: score delta, PR state, run state, what needs
   their decision.
