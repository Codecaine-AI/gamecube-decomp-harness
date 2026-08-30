<current_state>
<last_updated>2026-08-29</last_updated>

<status>
- SESSION 21:58Z– (2026-08-29): epoch 9 resumed at xhigh with agent timeout 60→120 min per Ford
  21:58:08Z a scheduler spawned (lease-55590065, resume from the UI, not this operator) and was SIGKILLed at 21:59:13Z; server settlement closed all 32 claims and recovered the run to paused, leaving 27 running + 5 claimed job rows with no processes.
  FORD DIRECTIVE 21:59Z: pause, cancel the workers, requeue them, bump the agent timeout 60→120 min, resume.
  Operator: `UPDATE jobs SET status='queued',revision=revision+1,lease_id=NULL,lease_expires_at=NULL,next_attempt_at=NULL WHERE run_id=… AND kind='worker' AND status IN ('claimed','running','waiting')` (32 rows → 120 queued, 0 active claims, 0 worker-task procs);
  `UPDATE runs SET inputs_json=json_set(inputs_json,'$.configuration_snapshot.agent_timeout_seconds',7200)`; POST /api/run/resume → lease-9a504be8 at ~22:00:30Z.
  Scheduler argv verified: model gpt-5.6-sol, thinking-level xhigh, agent-timeout-seconds 7200, max-workers 32 (resume reads the snapshot in process-command.ts:235/242).
  Fresh scheduler loaded the WORKING TREE including the other session's uncommitted WIP (epochs/cycle.ts, scheduler/epoch-boundary.ts, validation/report/run.ts, kernel/runtime.ts, …) — not stashed per hard rule; watch the epoch-9 boundary for WIP fallout.
  00:02Z DUPLICATE-RETRY CHURN (new failure class): after the first 2-h window, a worker-task child exited 1 ~25 s after spawn (stderr not persisted — error_json only says exitCode=1). Two re-dispatch paths fired for the same claim: kernel.failJob retried the SAME payload (waiting, exponential backoff, no attempt cap; consumer.ts fail() never passes terminal) while run-loop handleWorkerJobSettled force-recovered the claim (re-admitting the target → coverage top-up). Result: worker_states fc7ae188 (gm_1832::fn_801851C0) and 63399be8 (toy::_Toy_8030FE48) each reached 2 concurrently running jobs (two sandboxes on one claim id) + 2–3 waiting duplicates; 9 exit-1 failures in 60 s.
  Operator 00:05–00:07Z: cancelled the 4 waiting duplicates (job-156b481f, job-94436c28, job-f81c35b2, job-5ba1dd07) and the stale retry job-7dec00da (its claim had already settled as timeout); left the two running twins to settle naturally (killing one would re-enter the recovery path). Board after: 32 running, 41 queued, 0 waiting.
  FIX 27 (codex, in progress): worker jobs carrying a target_claim_id fail terminally (descriptor hook terminalOnFailure) instead of queue-retrying; failed task stderr tail goes into the failure message and full output to worker_state/<id>/task_failure.<ts>.log (onTaskFailure hook). Needs a scheduler restart to take effect — do it at the epoch-9 tail or boundary, not mid-epoch.
  00:09Z EMFILE HANG: the scheduler (lease-9a504be8) hit `EMFILE: too many open files` as its 5-min in-process knowledge maintenance finished; the local executor lost all process handles ("Unknown local process handle" ×35), 35 attempts were failed + force-recovered, and the run-loop then hung (lease heartbeat frozen at 00:09:37Z, no dispatch). A concurrent codex `bun test` also hit EMFILE; the machine crashed/rebooted at ~00:16Z (post-reboot load avg 246 from macOS housekeeping). Operator 00:13–00:14Z (before the crash): process/stop, killed 0 remaining workers, requeued 17 running rows, backdated lease, /api/run/recover → paused (36 queued, 73 admitted, 0 claims). NOTE TO SELF: my first kill matched my own shell's argv (skill §7 rule) — match on `job-runner.ts .*worker-task --task-file`, never on the run id.
  00:38Z RESUMED per Ford on lease-6b3232e0 (server restarted by Ford after reboot, pid 16828): scheduler argv gpt-5.6-sol / xhigh / 7200 s / 32 workers; 32 claimed within 60 s, workers carry 7200/xhigh. Fresh scheduler loaded fix 27 from the working tree (uncommitted: job-queue/{types,consumer,consumer.test}.ts, workers/worker-job{,.test}.ts) — its tests could not run (EMFILE both times); verify + commit when the box is quiet.
  00:38–00:44Z KERNEL-DB OUTAGE AFTER REBOOT: the first resume (lease-6b3232e0) spawned 32 workers that all died within ~30 s: `Non-dry Melee agent spawns must use kernel createSpawnAgent; missing initialized kernel runtime DB` — the `agent-kernel-db` Docker container (Postgres 127.0.0.1:55432, no restart policy) had not come back after the reboot. Each dead attempt closed its target as finished/error: 47 targets burned in 4 min (47→94/120) with zero work. Operator: process/stop at 00:42Z (run → paused, lease NULL); re-admitted the 47 targets whose worker_state.error_summary mentions the kernel DB (`UPDATE epoch_targets SET status='admitted', finished_at=NULL … ; UPDATE epochs SET finished_count=…` → 47/120, 73 admitted); `docker start agent-kernel-db` (recovered WAL, healthy at 00:43:55Z); resumed at 00:44Z. LESSON: after any reboot check `docker ps` for agent-kernel-db and codex-lb before resuming; a dead kernel DB turns every attempt into a target-burning error in seconds. Candidate fix 28: the worker should treat "missing kernel runtime DB" as an infrastructure failure (requeue the target, do not finish it), and the run-loop should pause on N consecutive infra failures.
  02:44–02:48Z FIRST 2-H TIMEOUT WAVE under fix 27 (live since the 00:44Z scheduler): failures are terminal (`failed`, no `waiting` retries) and stderr is captured (40 worker_state/<id>/task_failure.*.log). That exposed the exit-1 cause: `kernel.requeueJob` keeps the enriched payload, so a requeued worker job boots on the dead attempt's claim → "Active target claim not found" / "worker_id does not match target claim" / "Sandbox … not found" within ~30 s; two worker_states had 2 running jobs each. Bounded churn (one sandbox provision per spin), no target loss. FIX 27B DONE (codex, 3 passes; tests 74/74 under the fd fence from apps/server): kernel.requeueJob takes an optional `payload`; worker-job-payload.ts `enqueuePayloadForWorkerJob` keeps only {epoch_target_id, epoch_id, target_key}; call sites worker-job.ts + run-state/epochs.ts. Committed with fix 27 on harness main. Scheduler still runs fix 27 only → RESTART PLAN: stop + resume right after epoch-10 admission (fresh claims cost seconds), not mid-epoch.
  02:51Z ROOT CAUSE OF THE 00:09Z EMFILE HANG FOUND: a `bun test` over apps/server/src/core/job-queue (run by the operator's codex fix-27 task) leaks file descriptors until the SYSTEM-WIDE table fills (observed: one `bun test …kernel.test.ts` process holding 74,687 fds; kern.maxfiles 491520) → the live scheduler gets EMFILE/ENFILE, loses its process handles and hangs; the same happened at 00:09Z and likely precipitated the reboot. Operator killed the test process at 02:51Z (scheduler unaffected, lease-93feb5f7 heartbeating). HARD RULE FROM NOW ON: on the run box, run harness tests only as `sh -c 'ulimit -S -n 4096; bun test <files>'` (leak then fails the test process, not the system), never the whole job-queue directory while a run is live; tell codex the same in every prompt. Candidate fix 29: find the descriptor leak in the job-queue tests (temp StateStores / sqlite handles not closed).
  EPOCH-9 RESULTS SO FAR (22:00–00:09Z): 46 attempts settled — 6 exact, 40 timeouts with best checkpoints integrated (40 clean_apply worker-integration commits on the cycle branch since 731a6487d9). The UI's new-matches/improvements tiles read master_reports (newest = fea70654 from the epoch-8 boundary), so they will not move until the epoch-9 boundary rebuilds the report — Ford asked about this at 00:37Z.
  PR #3223 head 731a6487d9 is now CONFLICTING against upstream master (upstream moved since 08:10Z); the epoch-9 boundary sync will merge it.
- SESSION 03:55–07:56Z (2026-08-29): epoch 8 closed (93.07%), boundary replay, fixes 26 + findings
  EPOCH 8 (137 targets, xhigh, lease-2237772d since 19:42Z): reached 110/137 by 07:08Z.
  Operator closed the tail at 07:09Z per precedent: 27 targets after ≥2 xhigh rounds each → 137/137.
  Report after boundary repairs: 93.07033%, +0.60 over epoch 7's 92.47%.
  FORD DIRECTIVE IN FORCE: full boundary, then stop the run process right after ordinal-9 admission.
  Auto-pause session monitor + memory note `ford-end-of-epoch-pause-directive` enforced the directive.
  FIRST ATTEMPT: ordinal 9 admitted 122 targets at 07:22:57Z and auto-stop fired; graceful stop escalated to SIGKILL at 07:23:33Z.
  That boundary took the RECONCILE SHORTCUT: `pending integration attempt reconciled; skipped: [all steps]; re-ran: none`.
  Cause: fix 1's evidence lookup keys boundary events by restart-relative epoch label (`epoch 1`) and matched epoch 7's real evidence.
  Result: gates/PR/pr_sync were skipped; epoch 8 “closed” on non-building snapshot 8969070173.
  Operator rolled ordinal 9 back (epochs/targets/jobs), deleted epoch 8's pending_integrations row, set epoch 8 error, and re-armed the auto-pause watcher.
  Recovered + resumed on lease-46e71ff1 with working tree including fixes 24–26 and the other session's WIP → full replay.
  BOUNDARY REPLAY BREAK (a): report_build failed because ftCo_0D95.c:47 needs it/types.h + mp/mplib.h.
  Fix 3's fixer found it, but fix 20's propagation made a CORRUPT patch by stripping trailing blank context lines.
  FIX 26 (9137e5f8): captureBuildFixerPatch() writes raw bytes, ensures a trailing newline, and validates with `git apply --check`.
  The one-line call-site swap in epochs/cycle.ts (~line 781) is STILL PENDING because another session owns uncommitted WIP there; operator committed the two includes by hand (06991c11b7).
  BOUNDARY REPLAY BREAK (b): boundary-sync merged upstream fea70654de (#3253 `Match fn_80178050; improve eight near-match functions`, #3251, #3231) → 4 TUs broke.
  Fix 21's sync fixer ran for 30 s, exit 0, but fixed only gmresultplayer, correctly using upstream's own `s32 k3 = 0;`, and left its edit uncommitted.
  Operator+Codex restored upstream-touched functions in gmresultplayer, grkongo, grgreens, hsd_3A94, and tydisplay (`_tyDisplay_80319540` → 100).
  BOUNDARY REPLAY BREAK (c): DOL sha1 failed because the `-X theirs` merge took upstream's NEAR-MATCH #3253 versions over OUR EXACT matches in melee/gr/grmaterial.c, a Matching unit since the epoch-6 flip.
  The unit fell to 74.9% and the DOL changed; restored our pre-merge grmaterial.c to 100/100.
  All host-verified: `ninja -k 0`, main.dol OK, clang-tidy/format pass; committed 731a6487d9; retry timer released 07:56Z; auto-pause watcher armed for ordinal 9.
  FOLLOW-UP 1: fix 1 evidence must key on the DB epoch id, not the restart-relative label (epoch-boundary.ts; blocked by the other session's WIP).
  FOLLOW-UP 2: upstream-gospel applies only to functions upstream MATCHED; `-X theirs` can clobber our exact matches in Matching units with upstream near-matches.
  Candidate: merge with `ours` where our report says 100% and upstream's does not, or post-merge restore from the pre-merge snapshot any Matching unit that drops below 100%.
  FOLLOW-UP 3: give the sync fixer the FULL `ninja -k 0` failure list, not the first failure; commit or revert its diff, never leave it dirty.
  FOLLOW-UP 4: scheduler liveness monitor's pgrep matched its own shell, producing false pids (cosmetic).
  HARNESS MAIN: 9137e5f8 (26 fixes).
  BOUNDARY REPLAY SUCCEEDED (07:56–08:15Z): snapshot 731a6487d9, report 93.07033%, QA 5 errors (known set), 7 regressions deferred, sync finished at fea70654de (not drifted), BREAKAGE GATE CLEAN, CI-parity clean, DRAFT PR #3223 UPDATED to 731a6487d9 (08:10Z) — CI all 10 checks pass; decomp-dev bot vs master fea7065: matched code 93.07% (+1.09%, +42,152 bytes), linked 76.41%, matched data 96.73%, 44 new matches, 107 improvements, 0 broken matches. Epoch 8 closed completed/success; ORDINAL 9 ADMITTED 120 targets at 08:14:52Z; the auto-pause watcher stopped the run process (graceful stop escalated to SIGKILL 08:15:29Z); operator reset the 32 just-claimed job rows to queued, killed 2 stray worker-task processes, and recovered the run → PARKED PER FORD'S DIRECTIVE: run paused, dispatch lease NULL, ordinal 9 active 0/120 with all 120 targets admitted and 120 worker jobs queued, no scheduler, 0 active claims.
- SESSION 08:35–18:56Z (2026-08-28): epoch 7 at xhigh (92.47%), upstream-velocity boundary, fixes 19–22, epoch 8 admitted
  EPOCH 7 (08:33–17:06Z): 157 targets at xhigh, progressing at ~1/min.
  Fix 15's per-claim re-enqueue over-enqueued: one lock-contended target accumulated 32 running + queued duplicates.
  FIX 15b (718ca006): count-based coverage keeps live jobs ≈ unfinished targets, tops up or trims queued jobs, and never cancels running jobs.
  Surplus jobs were trimmed by hand twice: 141, then 4.
  A supposed sandbox storm (591/15min) was a broken SQLite time-window query; real churn was ≤12/10min.
  FIX 19 (0f80f4ba) stayed: worker jobs claim a target BEFORE provisioning; surplus jobs complete as no_target_available.
  Operator closed the tail at 17:06Z per epoch-5/6 precedent: 16 targets with 96–99.9% baselines and 1–11 attempts each were force-finished → 157/157.
  Report: 92.41026% pre-merge → 92.47168% after upstream merge + repairs, +0.64 over epoch 6's 91.83613%.
  EPOCH-7 BOUNDARY (17:06–18:52Z): 5 passes while upstream landed 8 commits, #3242–#3249.
  PASS 1: drain blocked on resolver_failed timed-out checkpoint ty/toy _Toy_8030B530; operator rejected it.
  PASS 2: fix 12 autofix reformatted 31 files; fix 3's bounded build-fixer had its FIRST LIVE RUN.
  report_build broke on --require-protos: gmtou_2.c had undeclared gm_* helpers; fixer added `#include "gm_1601.h"` in the epoch worktree and retry passed.
  The fix existed only in the epoch worktree, so operator committed it on the cycle branch as 4fead8b3d7.
  FIX 20 (46118492): fixer diff is 3-way-applied + committed on the cycle branch and the boundary sha advances.
  PASS 3: post-merge regeneration broke lbbgflash fn_80020AEC and toy Toy_80310324 via duplicate locals from upstream #3245/#3243 matches; mnname mnName_InitUserData was removed upstream.
  It also exposed 7 clang-tidy WarningsAsErrors diagnostics: ifstatus `gobj = gobj =`; ifstock/mninfo pointer types; hsd_3B5C casts; ftCo_0A01 uninitialized; gmtou_2 cast; toy prototype `_Toy_8030FE48(ToyDisplayList*)` vs upstream `void*`; and 2 unused toy helpers.
  Codex repaired them using upstream as gospel; host verification passed ninja -k 0, DOL sha1, clang-tidy, and clang-format; commit 6e727eb9bb.
  FIX 21 (9d6cca03): bounded build-fixer also covers sync post-merge regeneration in the cycle worktree, receives the upstream range in its prompt, and commits its diff.
  PASS 4: gates found two harness bugs: CI-parity treated check_complete's exit as fatal although upstream runs it under `set +e` as warning-only.
  Fix 17's auto-flip of "complete" units broke DOL sha1: objdiff 100% is relocation-tolerant, while gmresult stays Linkable.
  FIX 22 (b5fe89ba): check_complete is warning-only; link_complete_units defaults OFF and is DOL-verified when enabled.
  PASS 5: upstream moved again (#3248/#3249); mndiagram3, mndiagram2, and tydisplay restored to upstream in b0f43bd81a.
  Breakage gate caught ftCo_800A8940 100→96.98% from operator's clang-tidy init `s32 blocked = 0` inside upstream's matched function.
  Restored exactly in 38c9f234b9; ftCo_800A8940 returned to 100.0%.
  Fix 16's timer fired retries on schedule; latch cleared by flipping epoch 7 to error; one stop/resume activated fixes 20–22.
  FINAL: sync not_drifted at 05d0b1dccb; breakage gate CLEAN; CI-parity clean.
  DRAFT PR #3223 UPDATED to 38c9f234b9 at 18:52Z; interim push b0f43bd81a carried the one breakage.
  Epoch 7 closed; EPOCH 8 ADMITTED 137 targets at 18:55Z with exactly 137 jobs.
  QA: 4 numeric_literal_to_symbol errors in lbcollision.c from the worker float→address-symbol hack, plus mnInfo_803EFC08; deferred with ledger notes and code remains on branch.
  POLICY QUESTION FOR FORD: should QA errors block the PR push?
  LESSONS: upstream velocity makes every boundary a merge-repair event; sync build-fixer fix 21 is the mitigation.
  Clang-tidy fixes inside upstream-matched functions change codegen: always restore upstream's version instead; objdiff 100% ≠ link-identical.
  Fix 16's 'retry due' log line spams every 5s and is a rate-limit candidate; worker_state rows are overwritten per attempt.
  HARNESS MAIN: dc89a799 → 718ca006 (15b) → 0f80f4ba (19) → 46118492 (20) → 9d6cca03 (21) → b5fe89ba (22).
  Concurrent uncommitted edits by someone else exist under apps/frontend, apps/server/src/api/routes/kernel.ts, infrastructure/{http/server.ts,kernel/runtime*.ts}, and docs/; left untouched.
  19:04Z SCHEDULER CRASH (lease-bc3d59f4): a run-loop exception (message masked) entered error-cleanup, closed the shared StateStore under live consumers → 'Database has closed' storm → run-loop exit code 1 with 32 claims live, lease held; recovered 19:40Z (kill 14 orphan worker-task children, recover, resume → lease-2237772d); ~1 h of xhigh work lost. FIX 24 (02a0cfad): consumer capacity released at DB settlement, settlement hooks detached/bounded (60 s warn, 2-min sandbox-delete deadline). FIX 25 (9d6a04be): owned/borrowed StateStore views (borrowed close() is a no-op), cleanup drains consumers before close, unexpected exit settlement force-recovers claims + pauses + releases the lease + preserves the original error. FIX 23 (7363c296): retry-due log once. Fixes 24–25 are NOT in the running scheduler (needs restart; deferred because another session has uncommitted WIP in epochs/cycle.ts, scheduler/epoch-boundary.ts, validation/report/run.ts, epochs/step-failure*.ts and a syntax-broken untracked test — a fresh scheduler would load that WIP). Epoch 8 progress at 03:55Z: 99/137 at xhigh, 32 busy, queue ~10. Harness main 9d6a04be (25 fixes).
- SESSION 01:15–08:35Z (2026-08-28): epoch 6 at xhigh, tail livelock, semantic-merge repairs, PR refreshed, epoch 7 admitted, fixes 15–16
  XHIGH RESTART (Ford, 01:19Z): scheduler stopped; 32 in-flight attempts released to queue.
  runs.inputs_json.configuration_snapshot.thinking_level changed low→xhigh; resumed on lease-072e70a2.
  Runtime: gpt-5.6-sol @ xhigh, 32 workers; worker-task argv verified.
  Stop left the lease held (intermittent graceful-stop gap); cleared via backdated-heartbeat recover.
  Epoch 6 ran 78→157/165 at ~1/min; xhigh attempts routinely hit the 60-min agent timeout.
  TAIL LIVELOCK (03:30–07:40Z): epoch stuck at 153/165.
  Three admitted targets had NO job: each worker job's claim resolved to a DIFFERENT target and succeeded there (job dedupe target ≠ claimed target).
  One more target had no job at all; 8–9 others cycled 60-min xhigh attempts indefinitely.
  worker_state rows update in place per attempt; attempt history is in jobs.attempts, not worker_state count.
  Operator force-finished the 3 orphans at 06:4xZ and, after ≥2 xhigh rounds each, the last 8 at 07:41Z per Ford's epoch-5 precedent.
  All force-finished targets re-admit from the next board.
  FIX 15 (pushed f3a819f3): a job claiming another target re-enqueues its own; tick reconciles orphaned admitted targets.
  Log: '[run-loop] epoch N: re-enqueued K orphaned admitted target(s)'.
  EPOCH-6 BOUNDARY (07:41–08:33Z, 4 passes): pass 1 drain blocked by one resolver_failed integration.
  mnnamenew::NameContainsOnlySpaces checkpoint came from a timed-out worker whose patch no longer applied; operator rejected it (integration_outcomes status rejected).
  Pass 2: precommit_autofix (fix 12) reformatted 24 files before snapshot b0ef9ca3b1; report 91.82943%.
  Sync merged upstream a3907e5ddd (#3237 'Match NameContainsOnlySpaces', #3236 scene cleanup) as c31d31d186.
  Post-merge report build failed at mnnamenew.c:783: 'null_char' redefined; our worker's leftover line remained inside upstream's now-matched function.
  Run-loop logged MoltenVK stderr noise; host-side ninja exposed the real error.
  Repair (codex): delete one line; snapshot cd00518d82.
  Pass 3 gates found two more issues: breakage gate NameContainsOnlySpaces 100→88.5% vs upstream CI.
  Cause: worker made mnNameNew_NullCharacter `volatile`, changing codegen for every reader in the TU.
  CI-parity check_complete: 'melee/gr/grmaterial complete but not linked'; workers completed the unit while configure.py remained Linkable.
  Repairs (codex): revert volatile; grmaterial Linkable→Matching.
  Host-side build green: NameContainsOnlySpaces 100.0, mnNameNew_MainInput 92.80, report 91.83613; snapshot c3f88bacec.
  Pass 4: breakage gate clean; CI-parity clean; DRAFT PR #3223 UPDATED to c3f88bacec at 08:29Z, MERGEABLE.
  Epoch 6 closed completed/success; EPOCH 7 ADMITTED 157 targets at 08:33Z with fixes 1–16 live on lease-81f86f01.
  QA error remains mnInfo_803EFC08; allowlist pending Ford.
  Timed boundary retries did NOT fire while scheduler idled (epochPaused gate); retries in this stretch were relaunched by stop/resume.
  Regression latch was cleared by flipping epoch 6 to status error.
  FIX 16 (pushed c7ac1ccc): retries evaluated every iteration; resting wait wakes at the retry deadline.
  LESSONS: worker-added `volatile`/storage-class changes on shared globals break upstream-matched neighbours.
  Candidate banned_idioms shape: qualifier added to a global referenced by matched functions.
  Candidate fixes: auto-flip 'complete but not linked' at boundary; capture compiler error instead of generate-report stderr tail.
  Graceful stop still sometimes leaves the lease held.
  HARNESS MAIN: 84a2d927 → … → 88305e90 (fix 14) → 24270db8 (state) → f3a819f3 (fix 15) → c7ac1ccc (fix 16). Cycle branch head c3f88bacec.
  FIXES 17–18 (pushed 7da06605, e87d7c6f): (17) boundary failure messages/events now carry the real ninja 'FAILED:' + MWCC error lines (MoltenVK noise filtered; full output still in artifacts) — applies to report_build, boundary-sync report regeneration and CI-parity; new default-ON boundary step link_complete_units (before snapshot_commit) rewrites configure.py Object(Linkable|NonMatching, unit) → Matching for units at 100% code/data per the game's check_complete rules, --no-link-complete-units to disable, deferred-warning event when a unit completes in the current pass; (18) worker micro-gate banned_idioms shape qualifier_changed_on_shared_global — qualifier/storage/attribute/type/array-size changes on existing file-scope globals read by other functions fail the attempt (new globals, static locals, pointee-only const exempt); live for newly spawned workers immediately. Harness main now e87d7c6f; 18 fixes total since 84a2d927.
  OPEN FOR FORD: melee game.json QA allowlist (mnInfo_803EFC08, lbl_8046E1B0); server restart to pick up fixes 11–18 in the API process (scheduler already has them); Phase-4 evidence write-up + docs chapter (scope item 6); consider a per-target cap on xhigh timeout retries (tail livelock class) and a boundary-time nudge for the intermittent held-lease-after-graceful-stop.
- SESSION 00:10–00:55Z (2026-08-28): PR #3223 pushed green, epoch 6 admitted, fixes 12–14
  PUSHED (Ford approved): harness main 84a2d927 → 717a0c33 (fixes 1–11 + state log) → 3d3e8400 (fix-7 scan_diff.py) → c924edc1 (fix 12) → 0c29e415 (fix 13) → 88305e90 (fix 14).
  Cycle branch orchestrator/cycle/02a80f9b…: boundary snapshot 16e7d88cb8 (7-file clang-format whitespace fix) + operator commit 5cc6faecf3 (clang-tidy strict prototype: tyDisplay_SetupCameraAndBackground(void)).
  DRAFT PR #3223 REFRESHED by the boundary at 00:40:39Z: head 9a8dc95c8f → 5cc6faecf3; MERGEABLE.
  All 10 CI checks pass: clang-format, editorconfig, style-check, ninja clang/diff/link/test, Nix, native-build, pages.
  decomp-dev bot vs master fc960bd: matched code 91.69% (+0.19%, +7188 bytes), matched data 96.71% (+0.03%).
  Bot delta: 11 new matches, 141 improvements, 0 broken matches (2 fuzzy wobbles on unmatched items).
  epoch_finish save point at 5cc6faecf3; breakage gate clean; CI-parity clean.
  QA still 1 error = mnInfo_803EFC08; fix-7 allowlist entry in melee game.json pending Ford.
  BOUNDARY RETRY SAGA: 3 retries to get the push.
  (1) Latch cleared by flipping epoch 5 to error → retry #1 snapshot 16e7d88cb8.
  CI-parity pre-commit failed on clang-tidy (tydisplay.c prototype); PR skipped.
  (2) Tidy fix committed 5cc6faecf3 host-side; stale 'prepared' pending_integrations row deleted so the retry took the full path.
  Retry #2 failed at typed close: UNIQUE constraint cycle_timeline_entries (cycle_uuid, entry_kind, entry_id); first-pass evidence collided → FIX 13.
  (3) Retry #3 on fix 13: close OK, PR pushed, then admission refused by fix-2 guard on PATH mismatch.
  Board built from epoch_worktree report, published verbatim to cycle worktree; sha identical → FIX 14.
  Epoch 5 closed by operator as status completed/boundary success: close, save points, and PR push had all succeeded.
  Resume admitted epoch 6 with 165 targets at 00:51Z on scheduler lease-9fbc74b7 (fixes 1–14).
  FIX 12: precommit_autofix boundary step runs the game repo's pre-commit fix hooks in the CYCLE worktree before snapshot_commit.
  Flag defaults ON; --no-precommit-autofix disables it; first live run reformatted 0 files.
  FIX 13: timeline entries + epoch_finish/pr_sync save points upsert on stable IDs; run.epoch_integrated stays singleton.
  Boundary retries are idempotent.
  FIX 14: admission guard keys on report sha256; path-only mismatch logs one informational line and admits.
  Missing report or sha mismatch still refuse. Full cycle-runtime: 431 pass.
  ANSWERED FOR FORD: pre-commit does auto-fix, but the CI-parity gate ran it only in the throwaway epoch worktree, so fixes were discarded; fix 12 closes that.
  OPEN: fix-7 allowlist entry (mnInfo_803EFC08, lbl_8046E1B0) in games/melee/game.json is Ford's call.
  The running server, started ~23:45Z, lacks fixes 11–14 until next server restart; scheduler has them.
  Phase-4 evidence write-up + docs chapter (scope item 6) remain pending after a clean epoch.
- SESSION 23:30Z–00:20Z (2026-08-27/28): migration incident, restart, epoch-5 boundary on new code
  INCIDENT: fix-4 migration 003 was applied to the live orchestrator DB at 23:09:06Z by a worker-task child; children load the working tree at spawn.
  The OLD-code server + scheduler then rejected the DB: "Storage schema is not the squashed baseline"; bookkeeping [1,2,3] vs known [1,2].
  Scheduler pid 82378 spun at 100% CPU and leaked ~760 sqlite handles because openState threw in the knowledge lane; API dead.
  Operator SIGKILLed scheduler pid 82378 at 23:41:49Z; server pid 69681 also died ~23:41Z with no crash report.
  Ford rebooted the server on the working tree ~23:45Z.
  RECOVERY: force-release-lease, fix 5's first live use, succeeded; recover was BLOCKED because a null lease read as not_stale.
  Lease row restored + heartbeat backdated → recover → resume.
  New scheduler lease-4f57ae06 runs sol/low with 32 workers on fixes 1–10.
  Per Ford, epoch 5 force-ended at 162/166.
  Four targets, fn_80251FE4, lbSnap_8001DA5C, gm_801B5324, gmClassic_801B2BA4, were marked finished with an operator note; jobs cancelled; re-enter via next board.
  FIX 9: scheduled KG maintenance interval is measured from completion.
  rebuild_graph now runs as subprocess `bun job-runner.ts kg-rebuild-graph …` for scheduled and boundary lanes.
  This replaces the back-to-back in-process loop that starved dispatch when 10–18-minute passes exceeded the 5-minute interval.
  FIX 10: old code tolerates a newer additive schema with warning "schema is ahead of this process".
  Child commands, worker-task and KG subprocess, are verify-only and never migrate; only server/run-loop/tick migrate.
  FIX 11: recoverRun proceeds on a null lease when no live scheduler; otherwise dispatch_process_alive / process_liveness_unknown.
  Fixes 9–11 went from uncommitted to committed this session.
  Validation: full suite 1128 pass / 1 fail, the known routes cycle-worktree-root test.
  NOTE: fix 11 landed after the 23:45Z server start; the running server lacks it until next restart.
  EPOCH-5 BOUNDARY, new code, 23:50–00:07Z: report 91.69095%, save point 4ab5f5d1.
  Fix 3 live: 22 regressions + 4 QA findings → ledger deferral notes; 0 repairs and no repair epoch.
  QA error: mnInfo_803EFC08, Ford's own remediation struct; fix-7 allowlist entry in melee game.json pending Ford.
  Boundary sync finished anchor 5108e9f6→fc960bd7; merge already at 68d906e51d; 117 upstream-taken files and 114 displaced.
  BREAKAGE GATE CLEAN vs upstream CI at fc960bd7; fn_8018F00C restore verified.
  KG rebuilt via subprocess: 46.6k entities / 101.9k facts; report provenance stamped and the admission-guard trap closed.
  CI-parity build arms CLEAN; pre-commit FAILED because clang-format rewraps, so draft PR push skipped.
  Epoch closed into regression_pause latch; 22 regressions are sync fallout of −1…−121 bytes, including 4 ex-100s overwritten by the upstream-wins merge.
  Cycle worktree has an uncommitted 7-file whitespace-only clang-format fix; repo-pinned hook passes host-side.
  Boundary retry will commit the format fix and push the PR.
  LESSON: CI-parity runs pre-commit in the throwaway epoch worktree, so its auto-fixes are discarded; run pre-commit auto-fix in the cycle worktree before snapshot.
  LANDMINES: never git stash on this tree while the run is live; recorded in learnings.jsonl.
  Worker children load the working tree; do not leave new migrations there while old-code processes run, and fix 10 now guards this.
  Force-release then recover needs fix 11 in the running server; sysdolphin/gm displacement waves are large after upstream's Linkable/gm work.
  NEXT: Ford approved push of everything, harness main + PR refresh.
  Clear latch via stop→recover→resume → boundary retry: pre-commit → PR #3223 push → pr_sync → confirmed tier > 91.49569.
  Then epoch-6 admission: expect ~280 candidates with fresh-report guard + cap 500 live.
- SESSION 22:00–23:30Z (2026-08-27): fix queue landed + scheduler starvation found
  RUN: Ford's 22:07Z server restart reacquired the dispatch lease itself (scheduler pid 82378, lease-e1c1f273…, sol/low, 32 workers); no recover/resume was needed.
  Epoch 5 progressed 61→162/166 by 23:27Z. One dead claim (job-0299b6e1, target fn_8018F00C, worker never spawned) was manually expired at 23:16Z and reclaimed.
  FIX QUEUE: all 8 pre-approved fixes landed via codex, UNCOMMITTED (Ford decides push):
  (1) Reconcile shortcut no longer skips gates/PR/pr_sync (pending-integrations.ts + epoch-boundary.ts); skipped_steps/rerun_steps logged.
  (2) Fresh-report admission guard: KG rebuild stamps report path/mtime/sha256/HEAD/match% into knowledge_graph_metadata; admission refuses missing/stale/mismatched report.
  Candidate backstop caps at 500 or 4x recent epochs; resolver.ts flags are epochAdmissionFreshReportGate/CandidateMultiple/CandidateCap.
  (3) Ford boundary policy: breakage/regression/QA findings → ledger notes boundary_breakage_deferred/boundary_regression_deferred/boundary_qa_deferred + next-epoch admission; no repair epochs.
  report_build failure gets one bounded codex build-fixer attempt, 5-min timeout, one build retry, and --no-boundary-build-fixer.
  (4) Boundary retry backoff 2m→4m→8m→16m, cap 30m, max 5 attempts persisted on epochs as boundary_attempt_count/boundary_next_attempt_at (migration 003).
  Exhaustion parks run + releases lease; resume resets. (5) POST /api/run/force-release-lease (gameId+confirmed) refuses unless heartbeat stale AND no live process has that --lease-id; emits game.dispatch_released.
  (6) banned_idioms shape static_added_to_global_symbol: symbols.txt scope:global or baseline non-static.
  (7) QA address_named_static_data allowlist in game config: symbol or file+symbol with reason → disposition suppressed; byte-identical-to-base declarations → informational.
  melee game.json entry for lbl_8046E1B0 NOT added yet, Ford's call. (8) Sandbox retry-leak: old sandbox deleted (reason retry_reprovision) before payload.sandbox_id overwrite; audit in payload.sandbox_reprovisions.
  Validation: full apps/server suite 1128 pass / 1 fail (known routes.test.ts cycle-worktree-root test).
  tsc: no new errors in touched files; pre-existing errors remain in change-validation.ts, application/jobs/boundary-sync.test.ts, others.
  TRAPS: (a) migration 003 already ran on the live DB at 23:09:06Z when a fresh worker-task process loaded new code; harmless.
  (b) Live KG board has NO report provenance: knowledge_graph_metadata empty; boundary KG rebuild runs in-process in the OLD-code scheduler.
  First epoch admission under a NEW-code scheduler will refuse unless a boundary KG rebuild under new code runs first,
  or host-side `bun run kg:rebuild -- --game melee --repo-root <cycle worktree>` runs first.
  (c) NEVER `git stash` on this tree while the run is live: learnings.jsonl is appended continuously.
  A stash/pop at 22:5xZ failed on it and briefly removed fixes 1–4 from the tree; recovered, 265 live ledger lines merged back, nothing lost.
  (d) worker-task children load the WORKING TREE at spawn, so worker-side edits (micro-gates) go live immediately; scheduler-side edits need a fresh scheduler.
  SCHEDULER STARVATION (found 23:1x–23:3xZ, NOT fixed, Ford decides): pid 82378 sits at 100% CPU with 0 live workers for 10–18 min stretches (23:09→23:27, again from ~23:28).
  Dispatch/integration lanes stall; progress events land in bursts. Cause: run-loop.ts ~752-770 stamps lastKnowledgeMaintenanceMs at LAUNCH.
  When a full pass exceeds the interval, the next starts immediately; stderr shows knowledge_maintenance finished→started back-to-back.
  kg.ts:324 rebuild_graph runs IN-PROCESS; sqlite-heavy work blocks the event loop, with the main thread sampled in JS+sqlite3Prepare.
  Proposed fix: measure interval from completion + run rebuild_graph in a subprocess for the scheduled lane.
  Epoch-5 tail (4 targets) crawls until then; boundary not yet reached.
- EPOCH 3 STARTED AT SOL/LOW (2026-08-27 18:05Z): run 4a45af8a resumed via
  /api/run/resume; scheduler pid 93138, lease lease-3765aa8e…, spawned with
  --model gpt-5.6-sol --thinking-level low, 32 workers, 4-core profile.
  NO ep2 boundary retry ran: epoch 2's row already had boundary_status=success
  (closed 03:01:06Z — the 91.49569 epoch_finish 5cffbb68 + pr_sync 33c7bb2f
  pair WAS its boundary); only epoch status was stuck 'error' from the
  trailing "Event correlation_id must equal workflow identity <runId>" bug
  (log :49193 — second occurrence; :48774 had the cycle-uuid variant).
  Resume settled it to completed and admitted epoch 3 directly: 181 targets,
  board base = Ford's 17:26Z sync save point (commit 63439be4, remote
  application). Consequence: no upstream re-sync / breakage-gate / PR refresh
  today — first live exercise of the new gates lands at epoch 3's boundary.
  Micro-gate flags verified on in game.json (section parity / undefined
  symbols / banned idioms). Librarian condense drained epoch-1/2 backlog into
  the ledger at resume (learnings_appended in stdout log). FOLLOW-UP: the
  correlation_id event bug (fails the epoch-finalize event emission).
- EPOCH 3 FINISHED 181/181 (~19:11Z, ~66 min at sol/low; 8 exacts + ~40
  improvements). BOUNDARY (save point 38092ef7 @ 91.52135 code / 96.62 data,
  commit 1edb9164ca): MASTER BREAKAGE GATE FIRST LIVE RUN = CLEAN (0 breakages
  vs upstream CI report at anchor 5108e9f6). Regression latch paused repairs
  ("54 rows > threshold 12") — but ALL 9 broken-100 functions had sub-100
  baselines at admission: the drops happened in Ford's 17:26Z upstream-wins
  sync, and the rolling-baseline compare (pre-sync 03:01Z report as "from")
  re-surfaces sync fallout as epoch regressions. Workers IMPROVED several of
  them. QA gate failed (2 errors): worker-added address_named_static_data
  lbl_8046E1B0 in gmresultplayer.c:191 — caught at boundary; NOT covered by
  banned_idioms micro-gate (add the shape). Latch clear/resume = Ford's call.
- BOUNDARY GATE CATCHES + CORRELATION FIX (19:2x–19:4xZ): CI-parity gate
  FIRST LIVE CATCH — link arm fully green, test arm (--linkable) FAILED at
  main.elf link: psNumCmdList + psTexGroupArray undefined from generator.o
  (hsd_8039F05C) and psdisp.o (psDispParticles). Cause: particle.c:41-42
  declares both STATIC while symbols.txt says scope:global; normal build
  links original objects for those units, test arm links reworked ones →
  exactly the orphaned-symbol class the gate was built for. Pre-commit gate
  also failed (clang-format rewrap of psGenerateParticle0 calls in
  particle.c). PR refresh correctly skipped (ci_parity_failed); boundary
  continued. REPAIR NEEDED before PR push: de-static + header decl w/
  byte-identical verify, plus clang-format; and the QA-gate error
  (lbl_8046E1B0 address-named data, gmresultplayer.c:191) wants removal per
  repair_hint. CORRELATION_ID BUG FIXED via codex (uncommitted):
  epoch-boundary.ts:513+595 now pass correlationId: runId (timeline.ts
  asserts runId; cycle evidence keeps its own lane); 51/51 tests
  (epochs 24, timeline 14, epoch-boundary 13). Live scheduler pid 93138
  still has OLD code — fix activates on next resume's fresh scheduler.
  Epoch 3 row left status=error/boundary_status=error (transaction rollback
  from the throw) — boundary retry on resume will re-run gates + KG
  maintenance (which never ran this pass) and settle it properly.
- EPOCH 5 (REAL) LIVE AT 21:36Z — 163 TARGETS: root cause of the 1,081
  admission was the KG BOARD, not report.json alone — admission reads
  loadKnowledgeBoardSnapshot(graphDbPath) (tick.ts:81), and the boundary KG
  rebuild at 20:5x had anchored to the missing report. Second 1,081 admission
  at 21:17 confirmed it; killed + rolled back same as the first (nothing
  banked either time). Repair sequence executed: (1) pre-sync commit
  680ee4b0 of boundary repairs + format pass; (2) merged upstream fc960bd7c0
  (gmtitle renames #3235, gm_1BA8 link #3234, gmresultplayer matches #3232;
  7 conflicts all upstream-wholesale — incl. gmresultplayer lbl_8046E1B0
  overlay+order_bss superseded by upstream) as merge 8f8ca52e; (3) host
  build green + report 91.68013; (4) kg:rebuild --repo-root cycle worktree
  (43k entities/82k facts); (5) board preview via loadKnowledgeBoardSnapshot
  = 166 candidates; (6) resume (scheduler pid 95212) → epoch 5 admitted 163.
  Boundary of this epoch should deliver: PR #3223 refresh + pr_sync →
  confirmed tier catch-up. NOTE: codex sandboxes cannot run wibo (wineserver
  bind) nor download tools — build verification is host-side only.
- EPOCH 5 (BOGUS×2) KILLED + ROLLED BACK PER FORD (~21:1xZ): the 20:56Z admission was
  BOGUS — the board recompute ran with build/GALE01/report.json MISSING from
  the cycle worktree (the first merge-repair codex's failed configure
  disturbed build/), so it admitted 1,081 targets: 700 already at 100%, 258
  not in the report, only ~123 real. Scheduler stopped 21:00Z; nothing was
  banked (0 exacts / 0 selected checkpoints / cycle head untouched at
  5fa2071cfe). Rollback executed: all 1,055 non-terminal worker jobs
  cancelled, ep5 workers' 56 queued absorption jobs cancelled, epoch_targets
  + epochs row for ordinal 5 DELETED (epochs 1-4 all completed). Cycle
  worktree report rebuild running in background (configure + ninja + report
  target) — MUST COMPLETE before the next resume so admission sees a real
  board. Run parked: status active/blocked, scheduler dead, dispatch lease
  goes stale 15 min after ~21:00Z heartbeat → recover then resume.
  RESUME CHECKLIST: (1) verify report.json exists at ~91.5% in the cycle
  worktree; (2) POST /api/run/recover then /api/run/resume (gameId melee,
  runId 4a45af8a-9f8c-499b-b375-c0d8e93fc8fd, confirmed:true); (3) expect a
  boundary pass then a fresh epoch (~123 legit targets) — verify admitted
  count is SMALL before walking away; (4) PR #3223 refresh + pr_sync (which
  updates the confirmed tier with epoch 3+4 wins) land on the first boundary
  that passes gates — confirm the confirmed tier steps past 91.49569.
  OPEN GROSS-BUG FIXES WANTED BY FORD: (a) reconcile shortcut must not skip
  gates/PR/pr_sync; (b) admission must refuse a missing/stale report;
  (c) remove boundary repair epochs (librarian note + next-epoch admission
  instead); (d) boundary retry backoff; (e) lease force-release for dead
  schedulers.
- FORD BOUNDARY-AGENT POLICY (refined 2026-08-27 ~21:1xZ): boundary stays
  agentless with ONE exception — a bounded codex build-fixer for mechanical
  build breaks (naming conflicts, signature drift, residual shims; the class
  hand-driven 3x today). Breakage/regression is NEVER agent-repaired at the
  boundary: write the ledger/library entry, requeue the target, and the next
  epoch's worker reads it in target context (existing displacement-deferral +
  ledger-note + ledger_search mechanism). No librarian-driven repair, no
  repair epochs. Integration-resolver agents at integration_drain stay as-is. Docs: codex building
  docs/40-new-features/30-global-flow-map/45-epoch-boundary/doc.json
  (as-built boundary doc + failure catalog) — verify links check passed.
- EPOCH 5 LIVE AT 20:56Z — ALL EPOCH ROWS SETTLED (SUPERSEDED — see above): after the second
  stop/recover/resume (scheduler pid 71926, fixed correlation + facts-registry
  close code + concurrency 16), the boundary reconcile path settled epoch 3
  → epochs 1-4 all completed, epoch 5 admitted with 1,081 targets from the
  merged upstream board (anchor merge 5fa2071cfe / upstream 73e6414450 incl.
  upstream's own gm_801BC00C match #3230). Second-merge semantic repairs via
  codex (uncommitted, both worktrees, diffs identical): grbigblue
  grBigBlue_801E6364 duplicated 30-car alloc block from bad merge + 2 uninit
  index_ptr + pos->y; mndiagram3 residual HSD_JObjSetTranslateY_Fake shim
  call (the ORIGINAL CI-incident symbol) replaced with real
  HSD_JObjSetTranslateYWithMtxDirty per upstream; all _Fake refs now gone
  from src/. Full ninja green through main.dol. Upstream merge also bumped
  dtk to v1.8.3 (configure re-downloads; codex sandboxes have no network —
  tool downloads must happen host-side). Stale build-ci in the recreated
  epoch worktree caused a bogus repeat link failure at the 20:3x gate run —
  build-ci deleted, first ci-parity run pays a clean rebuild. NEW BUG FIXED
  (uncommitted): run.epoch_integrated event payload facts (ordinal,
  boundary_status, save_point_id) were unregistered — registry now accepts
  them (closed schema kept, 86/86 tests). PR #3223 refresh pending at epoch
  5's boundary (reconcile path skips PR publish). FORD DESIGN DIRECTIVE
  (2026-08-27): no repair epochs at the boundary — failures get a librarian
  note and defer to next-epoch admission; not yet implemented.
- PARTICLE REPAIR RESOLVED (19:4x–20:0xZ, 3 codex rounds): an epoch-3 worker
  RE-ADDED `static` to psTexGroupArray/psNumCmdList in particle.c (upstream's
  Linkable wave had made them global; board base 63439be4 == origin/master
  byte-identical) — static hid in our report build (original objects linked
  for non-Matching units) but broke the --linkable arm. Fix shipped: particle.c
  reverted to board base in BOTH cycle + epoch worktrees (uncommitted; boundary
  snapshot will commit), dropping the worker's hsd_8039930C fuzzy improvement
  (93.2→77.0, back on next board). Verified: test-arm main.elf+main.dol link
  green. The scary psInitDataBankLoad 100→99.72 "regression" was a SCORING
  ARTIFACT: bytes identical, one reloc-name pair (...data.0 vs lbl_8040BFB0);
  with the report config functionRelocDiffs=data_value (used by upstream CI
  AND our report builds) it scores 100.0 — ad-hoc objdiff checks without that
  flag mislead. gmresultplayer lbl_8046E1B0 QA error = FALSE POSITIVE on
  Ford's own remediation commit ce13c74550 — left in place; needs a QA-rule
  allowlist. FOLLOW-UP GATES: banned_idioms should catch "static added to a
  previously-global symbol"; QA address_named_static_data needs an exception
  mechanism. RESTART SEQUENCE: process/stop killed the scheduler but left the
  dispatch lease held + run active (the documented graceful-stop gap, hit
  live) — recover+resume gated on 15-min lease staleness (~20:12Z), waiter
  armed. Absorption: priority 100 applied to the run's 359 queued jobs;
  CONCURRENCY_LIMIT now 16 (Ford wants high knowledge throughput; activates
  with the fresh scheduler).
- FORD-FLAGGED INVESTIGATIONS (19:2xZ, 3 subagents, all resolved):
  (a) knowledge_absorption backlog: NOT stuck — global FIFO with no run
  filter + priority 0 puts ~2,183 dead-run jobs ahead of the active run's
  359, and drain (2.5/min, CONCURRENCY_LIMIT=2, ~47s/job) < production
  (2.9/min at 32-wide). Options: priority-bump active run's queued jobs
  (UPDATE, stopgap), CONCURRENCY_LIMIT 2→6 (code + restart, clears all in
  ~5.5h), optionally cancel 1,904 July-run jobs (Ford's call).
  (b) provider errors: epoch 3 CLEAN (0 of 181 workers); dashboard shows
  Aug-26 wave (117 failures / 65 workers, 70% retried in-place post-fix,
  35 burned). codex-lb healthy (10k responses all-200 since 18:00Z).
  Residual knob: retry budget 1/cycle.
  (c) 5 live-but-dead sandboxes: retry-leak orphans — attempt-2 re-provision
  OVERWRITES payload.sandbox_id, attempt-1 sandbox never deleted; all
  auto-destroy (90-min TTL) by 20:23Z, 20/250 cores, no action. Durable fix:
  delete old sandbox before overwriting payload.sandbox_id on re-provision.
- EPOCH 3 WORKER-SIDE VERIFICATION (18:05–18:25Z, all confirmed live):
  (1) micro-gates evaluate on every checkpoint (168/168 carry the micro_gates
  block); first real catch: gm_1BA8::gm_801BC00C attempt 1 failed
  section_parity (.data 100→64.9%, ~696/1984 bytes) AND banned_idioms
  (K&R-style static inline decl) — exactly the PR-3223 damage class, rejected
  at the worker, micro_gate:<name> reasons in failure_reasons_json; no mass
  rejection (1 failure / 168). (2) ledger handoff v3: all worker system
  prompts mention communal ledger + allowlist ledger_search; 181 ledger_search
  calls in the first 20 min. (3) sandbox rg healthy: 263 grep calls, zero
  "rg: command not found". (4) repair-packet inlining live: 217/308 rendered
  contexts carry previous_return_gate inline, 172 carry output tail +
  audit-reference note. RESIDUAL (benign): sol/low workers still probe the
  host-side *_path audit references anyway — 43/69 sessions, ~108 failed
  "file not found" reads, fail-fast, workers proceed on inline content;
  consider stripping paths or hardening paths_note. Throughput at sol/low is
  fast: 40/181 targets finished by 18:20Z (5 exacts banked in first 12 min,
  attempt-tail closes on 99.x baselines in 5–12 min).
- PHASE 4 BOUNDARY VALIDATED END-TO-END 2026-08-27 ~03:01Z. Final state:
  DRAFT PR https://github.com/doldecomp/melee/pull/3223 OPEN (draft, title
  "GCD decomp session 02a80f9b", head fjooord:orchestrator/cycle/02a80f9b…);
  anchor advanced 89d8368d → 945f2814 (fresh upstream incl. the PRs Ford
  flagged); cycle head 1450713f; typed save points epoch_finish 5cffbb68 +
  pr_sync 33c7bb2f at 91.49569% (earlier pair at ad348c67 @ 91.24294);
  confirmed tier 16 matches + 159 improvements @ 91.49569 (the 2 new epoch-1
  matches processed in); tentative empty (no open epoch); timeline 14 points.
  ~35-target displacement wave deferred with ledger notes ×2 sync passes.
  Epoch 1 completed 176/176 (145 natural + force-ended per Ford). Run PAUSED
  + scheduler parked = ready to start epoch 3 on Ford's go (resume is
  instant — pause released the lease). Latch note: run paused on 10 regressed
  functions (upstream-displacement fallout, deferred to next-epoch
  admission — expected).
- PR #3223 TRIAGE (2026-08-27 morning, 3 parallel agents): (a) freshness —
  no sync bug; upstream landed 6 commits 02:55–08:38Z after our 02:40Z merge
  ("Linkable" wave #3222–#3229 + 0a75cf70d9); PR now CONFLICTING in 3 files
  (grbigblue.c, mndiagram3.c, particle.c — upstream independently matched
  psInitDataBankLocate after our workers); next boundary sync absorbs.
  (b) PR body reduced to the single WIP line — live PR edited + generator
  fixed via codex (cycle-draft-pr.ts, 3/3 tests, uncommitted). (c) CI: game
  build failure = worker commit d10e83a725 mninfo.c HSD_Joint** → void**
  (-Werror on GCC native job); clang job also fails on sdata2-order hack
  functions, bare short/long, non-const params, redundant casts;
  clang-format ~15 TUs; editorconfig fails on LEAKED
  active_session/integration_resolver scratch committed by boundary(init)
  c6908e4956. The "5 data link breakages" = decomp-dev bot broken matches vs
  master: gmresultplayer .bss 100→50 (job-af5e order_bss hack),
  hsd_803A949C 100→95.06 (MERGE CLOBBER — our conflict resolution kept our
  fuzzy over upstream's exact #3211 match, violating zero-epsilon),
  hsd_3A94 .data 100→0, gm_1601 fn_80167638 100→99.54 (the manual conflict
  repair dropped PAD_STACK(8)), mninfo .data 100→99.77. WHY MISSED: rolling
  baseline is self-identical at boundary (gate can never fire), data
  sections never gated (only matched_code per function), repairs authored
  after measurement, no CI-equivalent local jobs (GCC native, clang-tidy,
  clang-format, editorconfig), and no exclusion of orchestrator scratch from
  boundary commits. GAUNTLET ADDITIONS RECOMMENDED: master-baseline
  objdiff-cli changes gate incl. sections; gate matched_data_percent;
  pre-commit run --all-files at boundary; clang-tidy idiom lint; native
  build smoke; exclude active_session/ from boundary commits. Note: the
  upstream diff CI job is set +e warning-only — the decomp-dev comment is
  the real breakage signal.
- PR #3223 REMEDIATION COMPLETE (2026-08-27 ~13:2xZ): branch merged with
  upstream b7686b598d (merge a828914b0b, 17 conflict hunks upstream-side incl.
  psInitDataBankLocate; worker matches in grbigblue/mndiagram3 dropped by
  gospel rule — back on the next board). Repair commits 3472b75f16+741010f5f1:
  mninfo void** cast (GCC -Werror), gm_1601 fn_80167638 rebuilt
  PROTOTYPE-CLEAN byte-exact (old parent used the CI-banned K&R trick and
  PAD_STACK restore ICE'd MWCC), grbigblue pos->y stitch fix, hsd_803A949C
  restored byte-exact, active_session/ scratch removed, clang-format over
  the 40 PR-touched files. Full build OK; report 91.21% code / 99.76% fuzzy;
  PR mergeable:MERGEABLE at 741010f5f1; cycles.head_revision advanced.
- BREAKAGE GATE SHIPPED (uncommitted, 2026-08-27): breakage-gate.ts +
  wiring — boundary compares our report vs upstream-master CI report
  artifact (per-anchor cache, pr_sync-report fallback, loud skip) via
  objdiff-cli report changes; any function OR data/bss section 100→<100
  pauses the run on the regression latch, logged per item + save-point
  payload; cross-TU EXACT rematches exempt as "moved" (sections never,
  99.x rematches never — Ford: "99% should not be allowed");
  matched_data_percent + section measures now in save points;
  active_session/.pi-sessions excluded from boundary commits + stripped
  retroactively. Tests 57/57 touched, suite 1019/1 (known routes.test.ts:390).
  PR body generator reduced to the single WIP line (Ford directive
  overriding the Phase 0 win-list contract).
- CI-PARITY GATE SHIPPED (uncommitted, 2026-08-27): audit found the local
  gauntlet never linked at all (report/changes builds have no link edge) and
  the default configure links ORIGINAL objects for non-Matching units — which
  is exactly how the orphaned HSD_JObjSetTranslateY_Fake reference produced a
  byte-identical main.dol locally while CI's --require-protos (link job) and
  --linkable (test job) arms failed; PR pushes were also entirely ungated.
  New apps/server/src/core/validation/ci-parity/: parses the game repo's OWN
  .github/workflows/build.yml for the link/test configure flags (loud parser
  failure on workflow reshape = can't rot), runs both parity builds
  (per-mode build-ci/ dirs) + ninja diff ERROR scan + check_complete.py +
  pre-commit --all-files, wired into the PR-push path — gate failure blocks
  the push (records ci_parity_gate event + save-point payload), boundary
  continues. Escape hatches --no-ci-parity / --no-pre-commit-gate, default
  ON. Tests 35/35 + 94/94, tsc clean. Unmatched by choice: nix/native jobs
  (container-bound, redundant w/ mwcc parity), --compilers path (tag-pinned
  auto-download equivalent). First post-change boundary pays two full wibo
  builds, then incremental.
- WORKER MICRO-GATES SHIPPED (uncommitted, 2026-08-27): per-attempt hard
  gates in agent-catalog worker validation (micro-gates.ts +
  change-validation wiring): (1) section_parity — any non-.text section
  exact-before/<exact-after in the rebuilt TU fails with byte delta (catches
  the mninfo .data / gmresultplayer .bss class at the worker); (2)
  undefined_symbols — sandbox python3 ELF parse of the rebuilt object vs
  symbols.txt + pre-worker baseline, fail-open on infra breakage (catches
  orphaned-shim calls before CI link); (3) banned_idioms diff scan
  (section-order hacks, new unreferenced statics, bare short/long, K&R
  decl shapes). Flags in game-registry defaults + games/melee/game.json,
  default ON; failures feed the repair loop as micro_gate:<name> reasons.
  Tests 395/0 across cycle-runtime. Deferred: per-attempt clang-tidy
  (needs compile DB in-sandbox; L1 QA lint covers repo rules).
- PR #3223 FULLY CLEAN (2026-08-27 ~late): head 3263adbe7e — all 10 CI
  checks pass, MERGEABLE, decomp-dev bot shows ZERO broken matches (only 3
  small fuzzy wobbles on unmatched items). Data repairs done IN PLACE, no
  reverts: gmresultplayer .bss fixed by one-line full-size overlay-type decl
  (codegen byte-identical, symbol 0x2510, fn_80179854 kept); mninfo .data
  fixed by restoring named mnInfo_803EFC08 as a full MnInfoDataLayout struct
  (worker function bodies kept, one fuzzy improved). Report: 91.207% code /
  99.756 fuzzy, both sections 100.0. Defense stack now: worker micro-gates →
  boundary breakage gate (vs upstream master) → CI-parity + pre-commit gate
  on PR push. Cycle head 3263adbe7e; run still paused, epoch 3 one resume
  away.
- KNOWN GAPS from the live validation (follow-ups): baseline tier shows null
  score until a save point exists at the NEW anchor (projection reads
  save-point-at-anchor); regression-pause latch + boundary interplay OK but
  boundary retry loops rebuild with no backoff/limit; no boundary
  build-repair lane for semantic merge conflicts (Ford wants one — 2 manual
  codex repairs this session: gm_1601/gm_1BA8, then 5 TUs after the second
  merge); dispatch-lease 15-min staleness has no operator force-release for
  provably-dead holders; graceful stop sometimes leaves lease held (hard
  kills always do).
- Objective created after Ford froze all running pending flow redesign.
- Phase 0 COMPLETE: all design decisions made by Ford 2026-08-26 (canonical
  7-step flow + conflict/librarian/requeue mechanism + draft-PR naming +
  stable-state definition). Recorded in context/03_working_plan.md.
- Phase 1 IMPLEMENTED and gate-passed 2026-08-26: boundary-sync module wired
  into runEpochBoundary behind config flag; typed save points
  (baseline/epoch_finish/pr_sync); branch-scoped displacement detection;
  dry-run verb. Gate evidence: dry-run vs real worktree found drift
  (anchor 89d8368d -> upstream 861a69b7), 9 upstream-taken files, 33 displaced
  targets w/ prior scores + ledger notes, no mutations. Tests 994/995 (known
  routes.test.ts:390 only failure).
- Phase 3 IMPLEMENTED 2026-08-26 (commit a1f33e2a): draft-PR contract (title
  'GCD decomp session <cycle-short>', WIP body + tiers + win lists via
  scoreTiersProjection), publish only after successful boundary sync, skip
  logged on sync failure, post-sync head sha. Mocked-runner tests green.
- Phase 2 IMPLEMENTED and gate-passed 2026-08-26: scoreTiers projection
  (application/dashboard/score-tiers.ts) + frontend chart/panes. Real-cycle
  output: baseline 90.7999 @ anchor 89d8368d, confirmed 91.0803 (+0.2805,
  14 matches + 159 improvements listed), tentative empty w/o active run,
  10-point typed timeline. Restage-invariance unit-tested. Server 997/998,
  frontend 30/30. (Codex crashed on a provider error at final verification;
  suites re-verified manually.)
- Everything is stopped: no scheduler, no worker processes, zero Daytona
  sandboxes (all 30 deleted 2026-08-26 ~14:2xZ). No runs until Phase 1–2 land.
</status>

<completed>
- PHASE 4 MILESTONE 1 (2026-08-27 ~01:1xZ): epoch 1 FORCE-ENDED by Ford's
  instruction (145/176 targets completed naturally, 0 failed; 31 residual
  jobs cancelled + 12 worker procs SIGTERMed + 6 targets force-finished; the
  in-flight unaccepted work discarded). Boundary ran cleanly: integration
  drain → snapshot d7f3ffba35 → configure → report build 91.12712% matched
  (+0.0468 over 91.0803 baseline-confirmed) → QA 0/0 → report published →
  0 regressions → epoch_finish save point 7c99b014 recorded (the
  active_run_id repair validated — no timeline mismatch throw). Also at the
  drain point: codex-lb recreated w/ 30s upstream connect timeout; all 52
  Daytona sandboxes deleted; pause-guard armed to cancel epoch-2 worker jobs
  (Ford wants pause after boundary, fixes applied before epoch 2).
- 2026-08-26 ramp validated 32-wide sandbox execution (14 exacts banked,
  committed per-accept on the cycle branch) — see memory
  sandbox-32-ramp-and-run-staging-seams and objectives/sandbox-tool-exec.
- Staging/scheduler fixes pushed to main (harness fb3b8a50, kernel ba25400):
  createRun at cycle head, init-run uses cycle worktree, epochs migration 002,
  sandbox delete retries + periodic reconciliation.
- Cycle worktree report rebuilt at 91.0803% matched (14:08Z), so the last
  staged board excluded already-banked wins.
- This bundle authored: problem, constraints, scope, phase plan, validation.
- 2026-08-26 later: Ford's canonical 7-step flow captured verbatim in
  context/00_problem.md; goal/constraints/scope updated to match (sync every
  boundary, mergeability not rebase, KG rebuild + requeue on change, three
  graph markers, docs chapter added as scope item 6).
</completed>

<in_progress>
- Phase 4 LIVE VALIDATION STARTED 2026-08-26 16:54:52Z (Ford confirmed the
  staged run in the UI; width raised from the planned 8 to 32 per Ford's
  staging). Run 4a45af8a-9f8c-499b-b375-c0d8e93fc8fd, 32 workers, 4-core
  sandbox profile (melee-sandbox-20260825-toolpack-4c), gpt-5.6-terra @ xhigh
  via codex-lb, base 89d8368d, 176 targets admitted (epoch 1) on the 91.0803%
  board. Scheduler pid 92835, lease lease-ea13d6b71cfc17348e54e955c587d4ca.
  Stop commands: POST /api/process/stop; /api/run/hard-stop with
  confirmed:true. Server pid 89385 (kernel-required defaults on in code,
  kg.ts:149). Milestones to verify: epoch_finish save point → boundary sync
  (merge vs upstream 861a69b7+, ~33-target requeue wave with
  overridden_by_upstream_requeued ledger notes, KG rebuild + recompute,
  pr_sync save point, anchor + cycle-head advance) → draft PR ("GCD decomp
  session 02a80f9b…", head fjooord:orchestrator/cycle/02a80f9b…) → epoch 2
  admission from the post-sync board; three-tier scores stepping in the UI.
</in_progress>

<next_actions>
- RUNNING (2026-08-30 00:44Z): run 4a45af8a on lease-93feb5f7 (fix 27 live; fix 27b committed but NOT in the running scheduler — restart right after epoch-10 admission), epoch 9 (120 targets) at xhigh with agent timeout 7200 s per Ford; no standing pause directive. Watch the boundary: PR #3223 is CONFLICTING vs upstream, and the scheduler runs the working tree with another session's WIP.
- (superseded 22:00Z) PARKED (2026-08-29 08:16Z) per Ford: run 4a45af8a paused after the epoch-8 boundary; ordinal 9 (120 targets) admitted with every job queued and nothing in flight; PR #3223 at 731a6487d9 green. TO RESUME: POST /api/run/resume {"gameId":"melee","runId":"4a45af8a-9f8c-499b-b375-c0d8e93fc8fd","confirmed":true} — a fresh scheduler loads the WORKING TREE (currently contains another session's uncommitted WIP in epochs/cycle.ts, scheduler/epoch-boundary.ts, validation/report/run.ts, epochs/step-failure*.ts — confirm it is sound or stash it first). Before resuming consider: the fix-26 call-site swap in epochs/cycle.ts (~line 781 → captureBuildFixerPatch), fix 27 (boundary evidence keyed by DB epoch id), and the merge policy for Matching units (see LESSONS).
- Phase 4: supervised live validation, width 8, two epochs (Ford pre-approved
  running to completion). The Phase 3 live gate folds into Phase 4's first
  boundary (real draft PR beats a scratch test). BLOCKED until the concurrent
  cmux/codex session working the sandbox-profile feature finishes — its WIP
  owns preparing/runtime + process-command and 2 currently-failing tests
  (preparing/runtime.test.ts:66,:140) that are theirs to settle.
- Before Phase 4 start: restart the server WITH ORCH_AGENT_KERNEL_REQUIRED=1
  (the currently running server 33028 was restarted without it).
- After Phase 4: docs chapter (scope item 6) via docs-writer lane.
</next_actions>

<risks_or_open_questions>
- BOUNDARY SYNC FAILURE + FIXES (2026-08-27 ~00:50–01:00Z): the first live
  boundary sync MERGED upstream successfully (worktree HEAD 2cb9489ed6 =
  merge of upstream c9521d9f "gmboot cleanup #3220", clean tree) and the
  epoch_finish save point 7c99b014 recorded, but the displaced-target requeue
  step threw: fn_80169F50 (banked in a PREVIOUS run, no epoch_targets row in
  this run) hit the hard throw at epoch-boundary.ts:139, aborting the
  boundary before recompute/KG/pr_sync/anchor/draft-PR. Second design bug
  found in the same path: requeueEpochTarget reopened 10 displaced targets IN
  epoch 1, livelocking the boundary retry (retry gate waits for them to
  finish while schedulerBlocked stops all claims). BOTH FIXED via codex
  (uncommitted): requeueTarget hook now never mutates current-epoch rows and
  never throws — logs deferral; next-epoch admission from the post-sync board
  is the requeue mechanism (ledger override notes unchanged). Also fixed via
  codex: run-scoped worker claims (consumer passes runId) and run activation
  now sets cycles.active_run_id (tests 100/100). Data repairs: 10 reopened
  targets re-finished; boundary retry relaunched via run.recover +
  process/start once the dead scheduler's dispatch lease went stale (15-min
  threshold). Auto-stop watcher arms a process stop right after the draft-PR
  step so the system parks ready-for-epoch-2 per Ford.
- SECOND BOUNDARY FAILURE + REPAIR (2026-08-27 ~01:2x–01:4xZ): the boundary
  retry (with fixed requeue) failed in report_build — the upstream merge was
  textually clean but semantically broken: gm_1601.c called get_idx() with
  the pre-#3220 signature, gm_1BA8.c referenced a local 'gm' upstream had
  restructured away. Only those 2 TUs (early garbled log names — h_TagCancel
  etc. — were parallel-build noise). ALSO: the failed boundary retries in a
  tight loop re-running configure+build (~3 min each) with no backoff/limit —
  design gap noted. Repair: codex fixed both TUs in the epoch worktree
  (upstream-as-gospel, existing 'ev' local; 7-line diff), full ninja green,
  patch applied to the cycle worktree uncommitted (boundary snapshot will
  commit). Ford asked for an agent lane for exactly this class of quick fix —
  boundary build-repair step proposed as Phase-4 follow-up (boundary is
  no-agents by design; a bounded mechanical-repair hook + build gate would
  close it). Scheduler killed during the loop; recover+resume automation
  re-armed (15-min lease staleness), fresh auto-stop-after-draft-PR watcher.
- FOUND 2026-08-26 ~17:10Z (run 4a45af8a, epoch 1): the run-loop's worker
  consumer claims worker jobs WITHOUT a run filter — claimNextJob is called
  with {kind, concurrencyLimit, leaseMs} only (consumer.ts:197, run-loop.ts:591),
  though the kernel supports input.runId (kernel.ts:388). Result: 27 of 32
  running worker slots are executing stale jobs from the paused ramp runs
  (e2d6b499×14, 9ac41b3c×7, a57a392e×6); only 5 are run 4a45af8a's. 983 stale
  queued worker jobs remain claimable. Stale-claim churn (drops + replacement
  sandboxes + delayed Daytona deletes on Conflict retries) transiently pushed
  started sandboxes >32 → Daytona vCPU >128 (Ford observed; events: 49 created
  vs 14 deleted in first 10 min, reconverged). Startup reconciliation itself
  behaved (8 deletions 16:54:56–16:55:00, reason=reconciliation; scary
  "deleted 37/8×6" log lines predate this run / count skipped rows).
  Ford approved cancel 2026-08-26 ~17:2xZ: 1084 stale worker jobs (983 queued
  + 101 waiting, run_id != 4a45af8a) set to cancelled directly in sqlite; the
  27 in-flight old-run jobs were left to settle naturally (leases expire by
  18:05Z), after which all 32 slots refill from the active run's queue only.
  Still open: run-scoping the worker claim (pass input.runId at
  run-loop.ts:591 → consumer.ts:197) — deferred until after this epoch.
- FOUND+FIXED 2026-08-26 ~17:3xZ: cycles.active_run_id was empty for cycle
  02a80f9b — nothing in the post-stepper start flow sets it (process/start
  activates the run only; mark-preparing-complete was the old writer). Effects:
  scoreTiers tentative pane empty (score-tiers.ts:193 bails), and the boundary
  save-point writer would THROW at epoch finish (timeline.ts:132 run/cycle
  mismatch). Repaired by direct UPDATE setting active_run_id=4a45af8a…
  (Ford: fix little issues without asking). Verified: dashboard tentative now
  lists 6 banked improvements. CODE FIX STILL NEEDED post-epoch: run.start
  should set/clear cycle.active_run_id through the cycle command lane.
- HANDOFF 2026-08-26 (side session, upstream timeouts): the epoch's
  upstream_unavailable "Request to upstream timed out" errors = codex-lb's 8s
  upstream connect timeout vs slow OpenAI backend-api; local proxy healthy.
  (a) worker-cycle.ts retryable-patterns fix + tests landed uncommitted —
  new worker-task spawns retry in-attempt; in-flight workers keep the old
  classification. (b) PENDING AT EPOCH-1 BOUNDARY (drained quiet point, never
  mid-epoch — recreate kills live streams): `docker compose -f
  ~/local-services/codex-lb/docker-compose.runtime.yml up -d` to activate
  staged CODEX_LB_UPSTREAM_CONNECT_TIMEOUT_SECONDS=30. (c) ~13 workers burned
  a bounded_attempt_tail_v2 cold attempt on these timeouts (none permanently
  lost) — discount epoch-1 error counts accordingly.
- Real (non-dry-run) boundary-sync merge has not run yet — first live exercise
  happens in Phase 4 under supervision.
- The 33-target displacement against upstream 861a69b7 will fire on the first
  real boundary sync; expect that requeue wave and the KG rebuild cost.
- ~700 stale queued worker jobs from ramp runs still drain via claim-drop noise.
</risks_or_open_questions>

<important_paths>
- objectives/epoch-flow-redesign/ (this bundle)
- apps/server/src/core/cycle-runtime/phases/running/scheduler/run-loop.ts
- apps/server/src/core/cycle-runtime/phases/running/epochs/cycle.ts
- apps/server/src/application/dashboard/read-model.ts
- games/melee/worktrees/cycles/02a80f9b-1045-481b-88cf-d32b7a673afe/current
- games/melee/state/orchestrator.sqlite
</important_paths>

<active_runs>
- Run 4a45af8a (melee) ACTIVE since 00:38Z 2026-08-30 on lease-6b3232e0 (resumed after the 00:09Z EMFILE hang + reboot): ordinal 9 (120 targets), gpt-5.6-sol xhigh, 32 workers, agent timeout 7200 s. server :8787 up (pid 20468, started ~23:45Z 08-28, lacks fixes 11–26 in its API process). Cycle branch head 731a6487d9; PR #3223 green at 93.07%.
</active_runs>
</current_state>
