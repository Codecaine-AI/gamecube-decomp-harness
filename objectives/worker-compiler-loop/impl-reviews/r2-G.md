Prior findings:

| Prior | Status | Why |
|---|---|---|
| #1 | RESOLVED | Integration always runs the host scope check; sandbox attestation is advisory. |
| #2 | RESOLVED | Indexed-source drift invalidates attestation; host validation remains decisive. |
| #3 | RESOLVED | Create-request labels support allocation cleanup before retry. |
| #4 | RESOLVED | Shared toolpack/QA tars with mismatched stamps are removed from cache. |
| #5 | RESOLVED | RSS sampler recognizes `worker-task --task-file` and reads task identity. |
| #6 | RESOLVED | Live evidence rejects null and other invalid JSON values. |
| #7 | RESOLVED | Final tar release enforces the idle-cache bound. |

1. **[BLOCKING] Session closure can execute a command twice** — `apps/server/src/core/job-queue/sandbox.ts:274`. A reused session can close after a command mutates state but before its response arrives. Errors containing `session … closed`, `ended`, or `expired` trigger replay. A mock reproduction applied two mutations for one `exec`. **Fix:** retry only proven pre-execution refusals; fail ambiguous closures or reconcile using command identity. Add a post-mutation closure regression.

2. **[BLOCKING] Stamp memo accepts stale content indefinitely** — `apps/server/src/core/job-queue/provisioning.ts:89`. Equal-length changed bytes with preserved mtime retain the same fingerprint. Provisioning accepts an old `.ready` stamp or cached tar despite changed toolpack/QA content. `provisioning.test.ts:624` explicitly expects this stale behavior. **Fix:** include ctime and file identity in invalidation, and require that test to resynchronize changed content.

3. **[BLOCKING] Tool-data stamp can describe different bytes** — `apps/server/src/core/job-queue/provisioning.ts:514`. Tool data is hashed before the remote probe, then archived from the mutable host tree at line 520. An A→B change during the probe uploads B with stamp A. Restoring A makes later provisioning incorrectly accept B. **Fix:** stage an immutable copy, hash and archive that copy, and write its actual stamp. Add a mutation-during-probe regression.

4. **[NON-BLOCKING] Bake commands omit extra revisions** — `objectives/worker-compiler-loop/scale/LIVE-RUNBOOK.md:79`. Following the supplied commands omits the extra-revisions file prepared earlier, so trusted bases are absent from the image and provisioning loses the intended skip. **Fix:** add `--extra-revs-file /tmp/sms-extra-revs.txt` to both dry-run and apply examples.

Server typecheck passed. Focused tests partially passed; fixture-dependent tests were blocked by read-only sandbox `EPERM` errors.

3 blocking findings.