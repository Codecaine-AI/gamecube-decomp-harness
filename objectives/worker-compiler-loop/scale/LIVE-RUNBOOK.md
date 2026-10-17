# Live runbook: rebuilt snapshot to a 200-worker sandbox load test

Every step below touches real Daytona or the live SMS state. None of it runs without Ford's approval of the budget in step 0. Run the steps in order and stop at the first failed gate.

The tools:

- `sandbox-image/snapshot.ts` builds the image and snapshots (S8).
- `validate-sandbox` proves the snapshot against the host build and records sandbox readiness in the live state.
- `scale/readiness.ts` runs readiness-checklist items 1-4 and 8 on one sandbox (item 5 is the manual step 4).
- `scale/load-test.ts` runs items 6, 7 and 9: the ramp, the cost guard and the kill switch.
- `scale/worker-rss.ts` samples real LLM worker children for item 15 (step 6).

`load-test.ts`, `readiness.ts` and `worker-rss.ts` never write the live state DB (`worker-rss.ts` only reads `ps`). Each load-test or readiness run uses its own `orchestrator.sqlite` under `$TMPDIR/scale-load-test/<run-id>/`. The claim base is a synthetic commit in a scratch clone of the SMS checkout at `$TMPDIR/scale-load-test/cache/sms-scratch`.

## 0. Approval, budget and quotas (Ford)

Before step 1, agree on:

| Item | Proposal | Why |
|---|---|---|
| Run id | `scale-live-YYYYMMDD` (one per invocation, e.g. `-r10`, `-r200`) | `--confirm-live` must repeat it; the kill switch selects on it |
| Profile | `1-core` (1 vCPU, 2 GiB, 5 GiB disk) | the worker default in `games/sms/config/sandbox.json` |
| Daytona concurrent-sandbox quota | at least 210 sandboxes = 210 vCPU, 420 GiB RAM, 1,050 GiB disk | ramp peak plus margin; check the org limits in the Daytona dashboard |
| Daytona API rate limit | ask Daytona for the per-org limit on create and on toolbox (exec) calls | the dry run made about 203 API calls per attempt before S11 (62 execs at 3 calls each); with one reused session per sandbox handle it is about 82 (one call per exec, plus file transfers); creates queue at 16 in flight and retry 429s with backoff |
| Sandbox-minute budget | 10-step: 300; 50: 1,000; 100: 2,000; 200: 4,000 | about 15 min per attempt on 1 core is an assumption; step 5 measures the real figure |
| LLM budget for item 15 | 5 real workers for about 30 min on the configured model | step 6 measures per-session worker memory; it is an ordinary `sms-live` run with 5 desired workers |
| Host | the Mac running the harness (12 cores, 96 GB), nothing else heavy | dry run at 200 after S11: about 180 MB per worker child without an LLM session (max 255 MB), 16-28 GB peak total. Live children with Pi sessions are larger: 450-700 MB in one loaded-host snapshot, which would be 90-140 GB at 200. Step 6 measures the real figure before the ramp |

Live costs are sandbox-minutes times the 1 vCPU / 2 GiB rate, plus snapshot storage. The cost guard enforces `--max-sandbox-minutes` and `--max-alive`. On a trip it refuses creates and deletes every sandbox the run created.

Prerequisites:

- The harness is idle: no `sms-live` run, nothing dispatched. `validate-sandbox` refuses otherwise. Step 6 is the one step that starts a run; drain it before step 7.
- `DAYTONA_API_KEY` is in `~/.config/codecaine/env`. That is where `job-runner.ts` reads it, and the scale scripts load the same file for a confirmed live run.
- Work from the main repo (`/Users/Ford/workspace/codebases/harnesses/gamecube-decomp-harness`) after `feat/worker-compiler-loop` is merged. Game checkouts exist only there.
- The traced compilers are built and validated (`toolpacks/gamecube-decomp/compiler/mwcc_alloc/native/build.sh`, S4). Their output is in `games/sms/runtime/tool-data/mwcc_native`.

Scale knobs (S11). The defaults suit a 200-worker run; set them in the harness env only to change them:

| Env | Default | Effect |
|---|---|---|
| `ORCH_SANDBOX_CREATE_CONCURRENCY` | 16 | worker-sandbox create calls in flight; the rest queue |
| `ORCH_SANDBOX_MAX_ALIVE` | 0 (none) | cap on alive worker sandboxes this process created; set it to the Daytona quota to never hit a refusal |
| `ORCH_SANDBOX_CREATE_MAX_WAIT_MS` | 1800000 | how long one create may queue and retry quota/rate refusals before its job fails |
| `ORCH_SANDBOX_CREATE_RETRY_BASE_MS` / `_RETRY_MAX_MS` / `ORCH_SANDBOX_CREATE_RATE_RETRIES` | 1000 / 30000 / 8 | jittered exponential backoff after a refusal (a `retry-after` header wins) |
| `ORCH_SANDBOX_QUOTA_PROBE_MS` | 30000 | after a quota refusal, creates wait for one of our deletes or this long before probing again |
| `ORCH_SANDBOX_ALLOCATION_HOLD_PROBE_MS` / `ORCH_SANDBOX_ALLOCATION_HOLD_MAX_AGE_MS` | 5000 / 1800000 | a failed create whose allocation could not be confirmed deleted holds a quota slot (keyed by that attempt's `orch_create_attempt` label); creates blocked behind it re-check every probe interval, and the run loop's sandbox reconciliation re-checks too. Past the max age the hold is released and logged as `ALLOCATION HOLD EXPIRED` (delete that label's sandboxes by hand) |
| `ORCH_DAYTONA_SESSION_REUSE` | on | one reused Daytona session per sandbox handle; `0` restores create/exec/delete per command |
| `ORCH_SANDBOX_TOOLPACK_TAR_TTL_MS` | 600000 | how long a packed toolpack or QA asset tar is kept for drifted sandboxes (one pack per content stamp, shared by every provision) |
| `ORCH_SANDBOX_BUNDLE_CONCURRENCY` / `ORCH_SANDBOX_BUNDLE_TTL_MS` | 4 / 30000 | host `git bundle create` packs at once, and how long a packed seed bundle is kept for the next provision with the same revisions |

Not a knob: host `git merge-base --is-ancestor` and required-revision presence checks are asked once per (checkout, full commit ids) per process and shared by concurrent provisions; a missing revision is asked again on the next provision. Integration always runs the host edit-scope check: the worker's sandbox verdict travels with the checkpoint only as an advisory attestation (a host reject of an attested pass is recorded as `sandbox_attestation: disagrees`). Each create carries an `orch_create_request` label and each allocation attempt its own `orch_create_attempt` label; an attempt refused after Daytona allocated deletes that attempt's allocation (by its attempt label only) before it retries, so late cleanup can never delete a later attempt that succeeded. A command on a reused session first claims its id with `mkdir /tmp/orch-exec-<id>`; a delivery that loses the claim exits 75 without running. When the session vanishes, the command is replayed once with the same id, so the original and the replay run it at most once; a replay that loses the claim fails as ambiguous.

Before baking (step 1), list the trusted bases the image must carry so unverified targets provision thin, from a copy of the state DB (read-only):

```sh
sqlite3 games/sms/runtime/state/orchestrator.sqlite ".backup /tmp/state-copy.sqlite"
bun toolpacks/gamecube-decomp/_impl/gamecube/sandbox-image/extra-baked-revs.ts --state-db /tmp/state-copy.sqlite --game sms --repo games/sms/workspace/checkout --out /tmp/sms-extra-revs.txt
```

Both `snapshot.ts` commands in step 1 pass it with `--extra-revs-file /tmp/sms-extra-revs.txt`.

## 1. Build the image and snapshots (dry run first)

```sh
cd /Users/Ford/workspace/codebases/harnesses/gamecube-decomp-harness
bun toolpacks/gamecube-decomp/_impl/gamecube/sandbox-image/snapshot.ts --game sms --profile 1-core,4-core \
  --extra-revs-file /tmp/sms-extra-revs.txt
```

Expected output: the "would run:" commands (bundle, tar, `daytona snapshot create <name> --dockerfile ... --context ...` per profile), the `sandbox.json` diff with new `snapshot_name` and `snapshot_baked_rev` values, and finally `Dry run: nothing executed. Re-run with --apply to bake.`

Review the dry run:

- Both profiles share one baked rev, and it is the current SMS checkout HEAD.
- The traced-compiler directory is the validated one. A version that `worker-image.json` requires must not be disabled; `--allow-disabled-traced` is not used.

Then bake:

```sh
bun toolpacks/gamecube-decomp/_impl/gamecube/sandbox-image/snapshot.ts --game sms --profile 1-core,4-core \
  --extra-revs-file /tmp/sms-extra-revs.txt --apply 2>&1 | tee /tmp/snapshot-apply.log
```

Expected output: the bundle build, then one `daytona snapshot create` per profile ending ACTIVE, then `games/sms/config/sandbox.json` rewritten.

Gate for readiness items 1 and 2:

- The log shows the traced build stage writing `traced-ok` for 1.2.5 and 1.2.5n (`grep traced-ok /tmp/snapshot-apply.log`).
- No `worker-image.json` verification command failed.
- Commit the `sandbox.json` change. The configuration revision changes, so Sync must accept it before step 2.

## 2. Validate the snapshot (`validateHarnessSandbox`)

```sh
bun apps/server/src/job-runner.ts validate-sandbox --game sms --sandbox-profile 1-core
```

Expected output: `{"evidencePath": ".../runtime/state/sandbox-validation/sandbox-validation-<uuid>/evidence.json", "ready": true}`.

What the command does:

1. It builds the host report.
2. It provisions one sandbox at the accepted head and runs `ninja build/GMSJ01/report.json` there.
3. It requires the sandbox report's scored-function projection to equal the host's, then deletes the sandbox.

This step writes the live harness readiness (`readiness.sandbox = ready`). That is intended: it is the real admission gate.

Keep the printed `evidencePath`. Steps 5 and 7 pass it as `--sandbox-validation-evidence`. The live gate accepts only this file as `validate-sandbox` writes it: under its `sandbox-validation-<uuid>` directory, for the configured snapshot and baked rev, with `report_comparison: "projection_equal"` (evidence from before that field existed, and any dry-run `synthetic` evidence, is refused).

## 3. Readiness items 1-4 and 8 on one sandbox

```sh
RID=readiness-$(date +%Y%m%d-%H%M)
bun objectives/worker-compiler-loop/scale/readiness.ts --live --run-id $RID --confirm-live $RID --profile 1-core
```

The script provisions the sandbox the way an unverified-target claim is provisioned: the trusted base `81248bda` as a required revision, and the full gate report at its locator. It runs the checks, writes `objectives/worker-compiler-loop/scale/results/$RID/readiness.json`, and deletes the sandbox.

Expected output: `[readiness] N/N checks passed`, then exit 0.

| Item | Checks |
|---|---|
| 1 | `sha1sum build/compilers-traced/GC/{1.2.5,1.2.5n}/mwcceppc.exe` equals the committed `native/CAPABILITIES.json` `traced_sha1` (the macOS build); the image's `CAPABILITIES.json` lists both versions |
| 2 | every `verification_commands` entry of `games/sms/config/worker-image.json` exits 0 (clang-21 PowerPC target, llvm-cxxfilt, `/opt/mwcc`, `../mwcc`, `/opt/refs/jsystem/{tp,tww}`, m2c imports, traced compilers, `.qa-ready`) |
| 3 | `ninja <one unit>`; `ninja -t deps build/GMSJ01/include/SMS.mch` and `ninja -t deps <unit>.o` print `#deps N`, N > 0; `ninja -n <unit>.o` prints `no work to do` |
| 4 | `unused_test.py --file src/Enemy/chuuhana.cpp --function TChuuHana::rolling` builds the candidate (no `RAD_TO_DEG redefined`); `ninja` of a `stock_exclusions` unit compiles with the stock compiler |
| 8 | `test -s <full_report_locator>`; `git show 81248bda...:<source>` is non-empty |

`readiness.json` also records the provisioning seed for the unverified target (item 7). Expect `{"kind": "thin", "bakedExtra": ["81248bda..."]}`: the image baked the trusted base beside HEAD (`--extra-revs-file`, step 0), so only the synthetic claim base travels, as a thin bundle. `full` means the trusted base was not baked; the whole history (about 16 MB) is then bundled on the host and uploaded per provision. Fix the extra-revs list and rebake before the ramp.

## 4. Readiness item 5: clang-21 verdict parity in the built image

Manual. Repeat the method of `objectives/worker-compiler-loop/evidence/ir-oracle-clang21.md` inside a sandbox from the new snapshot:

1. Copy the two `edits` manifests (base `fa5d5210`, candidate texts at `2372fda6`) into the sandbox.
2. Run `python3 /opt/toolpacks/gamecube-decomp/_impl/gamecube/tools/steering_check.py reduce --oracle-repo . --input <manifest> --budget-seconds 900 --json --out <file>` for each manifest.
3. Compare the 137 group verdicts with the host results archived with that note.

Gate: 137/137 verdicts equal, and analysis complete or incomplete exactly as on the host.

## 5. One live worker (items 6 and 7)

```sh
RID=scale-live-$(date +%Y%m%d)-r1
EVID=<evidencePath from step 2>
bun objectives/worker-compiler-loop/scale/load-test.ts --live --run-id $RID --confirm-live $RID \
  --ramp 1 --max-alive 3 --max-sandbox-minutes 60 --sandbox-validation-evidence $EVID --profile 1-core
```

Expected output: `[scale] step 1: jobs {"succeeded":1} ...`, then `kill switch deleted 0/0, remaining 0`. The report is at `objectives/worker-compiler-loop/scale/results/$RID/report.md`.

Gate:

- Required-step coverage misses nothing: build, objdiff, qa_lint, steering_edits/reduce/mwcc/decide, native_decisions and compare_sources all ran.
- Placement failures are 0. No validation step spawned a host process.
- Build sandboxes are 0.
- The report's `Native measurements` line shows every `native_decisions` and `compare_sources` call ok (a nested `status: "ok"` result of its schema). An unavailable, malformed or failed result is a measurement failure (`measurement:<op>` under Failures by kind), not a measurement.
- The report gives `native_decisions` and `compare_sources` latency on 1 core. This is item 6; record p95.
- Use the attempt's wall time to re-estimate the sandbox-minute budget for step 7.

## 6. Real LLM worker memory (item 15)

The 450-700 MB per worker child figure is an upper bound from one snapshot of a loaded host; the dry run measures about 180 MB without an LLM session. Measure real sessions before sizing the ramp.

1. In the dashboard, start an ordinary `sms-live` run on the new snapshot with desired workers = 5 and the production model and thinking level. Leave everything else at the accepted configuration.
2. Once the 5 workers are dispatched, start the sampler on the same host:

   ```sh
   RID=worker-rss-$(date +%Y%m%d-%H%M)
   bun objectives/worker-compiler-loop/scale/worker-rss.ts --minutes 35 --interval-s 15 \
     --out objectives/worker-compiler-loop/scale/results/$RID
   ```

   Every 15 s it records the RSS of each worker child (`job-runner.ts ... worker --worker-id <id>`) and of its process tree. Each line it prints is one tick: `<worker id>=<tree MB>`.
3. After about 30 minutes, drain the run from the dashboard. The sampler stops itself after 35 minutes (Ctrl-C stops it early; it still writes the summary).

Output: `results/$RID/worker-rss.md` (per session: samples, minutes, first, p50, max and last MB, growth in MB per minute), `worker-rss.json`, and the raw `worker-rss-samples.jsonl`.

Gate: at least 5 sessions, each sampled for at least 10 minutes. Report per-session p50 and max, and the projection at 200 (p95 of the session maxima x 200) against 70% of host RAM (67 GB on the 96 GB host).

Decision (Ford), from the summary:

| Finding | Decision |
|---|---|
| Projection at 200 within 70% of host RAM, and no session grows more than about 5 MB/min | no change; ramp to 200 with `--max-host-rss-gb` = 70% of host RAM |
| Projection over the budget, and most of a session is shared runtime (similar sizes, flat growth) | pooling: run several worker sessions per child process; rerun this step after the change |
| Projection over the budget, or sessions keep growing | worker cap: `floor(0.7 x host RAM / p95 session max)` desired workers; investigate the growth separately |

Record the numbers and the decision in readiness-checklist item 15 before step 7.

## 7. The ramp

Run one step per invocation, so each result is reviewed before the next spend:

```sh
for N in 10 50 100 200; do
  RID=scale-live-$(date +%Y%m%d)-r$N
  bun objectives/worker-compiler-loop/scale/load-test.ts --live --run-id $RID --confirm-live $RID \
    --ramp $N --max-alive $((N + 10)) --max-sandbox-minutes <budget for N from step 0> \
    --sandbox-validation-evidence $EVID --profile 1-core --max-host-rss-gb 67
  # stop here and review results/$RID/report.md before the next N
  break
done
```

The command exits 1 when a step fails (it timed out, the guard tripped, any target's worker job did not succeed, a required native measurement (`native_decisions`, `compare_sources`) failed or is missing for a succeeded attempt, or an integration drain failed), when the guard tripped, or when sandboxes outlive the kill switch; the ramp stops at the first failed step and `run.json` lists the failures. Treat a non-zero exit as a no-go for the next step.

The guard and the kill switch:

- `--max-alive` refuses creates beyond N+10.
- `--max-sandbox-minutes` trips the guard, which refuses creates and deletes the run's sandboxes.
- `--max-host-rss-gb` trips on host memory (70% of the 96 GB host; lower it if step 6 chose a cap).
- Ctrl-C trips the guard too, which runs the kill switch before exiting.
- `--attempt-timeout-s` (default 1800) bounds each worker; `--step-timeout-s` (default 3600) bounds the step.

## 8. Cleanup (after every live invocation, and after any crash)

```sh
bun objectives/worker-compiler-loop/scale/load-test.ts --kill $RID --live --confirm-live $RID
```

`--confirm-live` must repeat the `--kill` target, and a `--run-id` other than it is refused.

Expected output: `{"found": 0, "deleted": 0, "errors": [], "remaining": 0}` after a clean run; after a crash, `found` is the number of leftover sandboxes and `remaining` is 0.

Then:

- Check the Daytona dashboard filtered on the label `scale_run_id=$RID`.
- Remove the run's work dir: `rm -rf "$TMPDIR/scale-load-test/$RID"`.

## Go / no-go for a 200-worker run

From `results/<run-id>/report.md` of the 200 step. All must hold:

1. **Placement.** 0 placement failures, and 0 build sandboxes. Every validation step (build, objdiff, micro-gates, QA lint, steering edits/reduce/mwcc/decide, native capture, compare_sources) ran in the worker's own sandbox.
2. **Completion.** At least 98% of attempts end without an infrastructure failure. Gate verdicts (pass, steering_located, rejected) do not count against this; provision failures, worker_cycle failures, timeouts, and creates that exhaust their retries do. A 429 that the create admission retried successfully does not.
3. **Daytona.** Every create succeeds. Create 429s are queued and retried by the create admission (the report's `Create admission` line counts quota and rate refusals); its `timeouts` is 0. The `sandbox.create` call p95 is under 180 s (the SDK start timeout). Every delete succeeds, and the kill switch leaves 0.
4. **Host.** Peak total RSS stays under 70% of host RAM, and step 6's projection with real LLM sessions does too (or the step-6 cap is in place). SQLite has no busy errors, and lock wait p95 is under 1 s.
5. **Integration.** The queue keeps up: items per minute are at least the accepted attempts per minute at 200, and no integration job waits more than one step.
6. **Budget.** The guard did not trip, and sandbox-minutes are within the approved budget. The guard counts from admission, so startup time and the sandboxes of failed creates are in the total (`failed_creates` in the Cost guard line; `unconfirmed` must be 0 at the end).

Any miss is a no-go. Fix the cause, then rerun from the failed step.
