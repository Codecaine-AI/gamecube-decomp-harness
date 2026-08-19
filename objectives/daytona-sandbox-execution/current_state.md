<current_state>
<last_updated>2026-08-18</last_updated>

<status>
- Bundle authored from the 2026-08-18 verification + interview session.
- Sign-off: operator launched an execution session against this bundle's goal.md (2026-08-18),
  treated as approval to proceed. Phase 0 and phase 1 gates PASSED same day.
- Operator approved running phase 2 in parallel with the phase 1 experiment (deviation from
  strict phase gating; approved 2026-08-18).
- @daytonaio/sdk 0.205.0 installed in apps/server and verified against the provider's assumed
  API surface (session exec seconds-timeout, stdout/stderr split, delete(timeout,wait),
  label-filtered async-iterable list).
</status>

<completed>
- Design docs verified against the shipped unified-job-queue system; all contradictions, stale
  claims, and gaps recorded in context/00_problem.md.
- Worker-child I/O surface fully mapped (summary in context/02_implementation_scope.md).
- Daytona SDK capability survey done (ai_docs/daytona_docs mirror); platform gotchas captured in
  context/01_constraints.md.
- Image groundwork located and staleness assessed: committed 2b12b637 but projects/->games/
  path-broken; musl objdiff-cli missing; golden wibo verified present.
- Eleven decisions interviewed one at a time and locked (context/01_constraints.md): host agent +
  remote exec; image + git-bundle seed; baked-warm local MWCC cache; provisioning in
  buildWorkerTask; job-leaseId orphan authority; per-attempt evidence download; always-run v1;
  sandbox.* game events; 2/4/5 sizing (configurable); experiment-then-live-worker PoC;
  fetch-first corpus tools.
- Phase 2 slice 2: game sandbox config now carries baked revision/workspace root; sandbox claims
  create with all lease/workflow labels and TTL backstop, seed by git bundle + report artifacts,
  verify canonical tools in-sandbox, persist sandbox linkage, and clean up failed provisioning.
- Phase 2 slice 6: sandbox deletion emits idempotent `sandbox.deleted` events for settlement, reap, and
  reconciliation; reconciliation also requires the current active run dispatch lease and an
  active target claim before retaining a labeled sandbox.
- Phase 2 slice 5b: m2c_decompile now uses a sandbox-only fetch-first shim. Symbol discovery scans
  objects in-sandbox, the host mirror downloads only the matched object, corresponding asm, and
  sandbox-generated build/ctx.c, and sandbox claims reject --write plus path-bearing/unrecognized
  extra_args. Focused tests, TypeScript/Python checks, and 1,095 non-environmental server tests pass.
</completed>

<phase0_gate verdict="PASS" date="2026-08-18">
- build_image_bundle.sh succeeds on the games/ tree: 2.54 GiB zst, 5.39 GiB payload,
  sha 8d449868...19f4e at /tmp/melee-image-bundle/daytona-melee-image.tar.zst.
- MANIFEST.md + build_image_bundle.sh repaired: games/ paths, decision-3 cache section
  (baked-warm, sandbox-local, volume mandate dropped), decision-2 shallow-clone requirement,
  and check-5/ layout wording fixed to the real target `ninja build/GALE01/report.json`
  (the tree has no `report.json` alias — found by the acceptance run).
- Score-server patch scope growth: /tmp/objdiff-score was lost, no patch committed. Recreated
  from the README spec + permute.py contract; 98/98 responses byte-exact vs the golden Mach-O
  binary (rebuilt native AND musl-in-container), independently spot-checked. Artifacts:
  games/melee/state/tools/objdiff-cli-3.6.1-score/{objdiff-cli-linux-x86_64,score-server.patch}
  (README updated); git-tracked copies + validation/provenance/acceptance reports in
  objectives/daytona-sandbox-execution/examples/phase0/.
- All five MANIFEST acceptance checks pass in a --network none linux/amd64 container from the
  bundle (Linux dtk v1.8.3 + gc-wii-binutils 2.42-2 installed, build.ninja regenerated with the
  wibo wrapper, cache shim installed): 1,075 warm-up TUs compiled under emulated wibo, one-TU
  rebuild 0.35s, objdiff READY + two-field response, no-op 0.05s, and 3/3 fresh-cache MWCC
  rebuilds byte-identical. No wibo/MWCC/emulation faults. Full report:
  examples/phase0/acceptance_report.md. Repaired warm tree kept at /tmp/melee-acceptance/melee
  (input for the phase 1 bake).
</phase0_gate>

<phase1_gate verdict="PASS" date="2026-08-18">
All four platform unknowns answered on a real Daytona runner (artifacts: examples/phase1/):
- FALSIFICATION GATE PASSED: MWCC-under-wibo on Daytona's amd64 runners produced byte-identical
  .o for both test TUs (claim-edited lbmemory.o a32ab60a..., fresh-cache runtime.o df6bb9cb...
  == shipped). The 32-bit-wibo-on-shared-kernel risk is retired. In-sandbox objdiff score-server
  returned the same raw score + code hash as the local phase-0 container run (675674 05a2692e...).
- Image: 5,868,625,900 bytes uncompressed = 54.7% of the 10 GiB cap. Snapshot
  melee-sandbox-poc-20260818 ACTIVE (2 vCPU / 4 GiB / 10 GiB disk); push took 909 s.
- Exec RTT: 49.5 / 69.7 / 83.3 ms min/p50/max over 20 echoes — fine for chatty tool loops.
- Stop->start wake to first exec: 0.86 / 0.78 / 0.85 s (3 trials) — makes the deferred
  stop-while-thinking follow-up very attractive.
- Other timings (ms): create 882, seed upload 1566, bundle fetch+checkout 297, one-TU builds
  ~230 each, score 102, evidence download 238, delete 755.
- Hygiene: 3 sandbox creations total, all deleted; label sweep empty; API-key leak audit clean.
- NOTE for operator: decision 9's default 5 GiB disk cannot hold the 5.87 GB image — the PoC
  used 10 GiB; recommend raising the config default (knob exists from slice 1).
</phase1_gate>

<phase2_gate verdict="PASS" date="2026-08-18">
- All six slices merged to main and suite-green (final: 1,121 pass / 0 fail): slice 1 provider
  seam + sandbox.* events + config (2a48700b); slice 2 provisioning (b28bf2b7); slice 3 exec
  routing + agent tools + jobserver wrap (4db25680); slice 4 per-attempt evidence download
  (dcecda90); slice 5b m2c fetch-first shim (8d0adc1c); slice 6 settlement/reap/reconciliation
  teardown (30806fb0); close-out d9181103 (widening via seams + gate round-trip test).
- Gate test passes: sandbox-class dry-run job round-trips claim -> provision -> child ->
  settlement delete -> reap sweep empty, with the sandbox.created/deleted event sequence
  asserted against FakeSandboxProvider.
- Local-class behavior unchanged (existing suite as regression net throughout).
- Known non-blockers: qa-repair.test.ts 5s-timeout is a pre-existing environmental flake
  (fails on 9d1b93f6, before this objective's code); three deferred host-FS reads with policy
  choices pending (prompt exists-attribute hydration, QA scanner --repo, MWCC-debug probe).
- Bundle trim landed (e36d8d0e, operator-directed): 5.39 -> 0.70 GiB payload via ai_docs/debris
  exclusion + shallow .git at baked rev; shallow bundle-fetch validated host-side.
</phase2_gate>

<phase3_progress date="2026-08-18">
- LIVE SANDBOX CLAIM COMPLETED END-TO-END (run 0b662f7a, job 3cd82994, sandbox fc08e157,
  target grBigBlue_801E93D8): real two-cycle agent session (initial + runner-requested repair),
  score 99.65522 -> 99.72665, banked-improvement checkpoint b8517a4c with patch/diff evidence
  downloaded to host artifact_dir, integration outcome APPLIED (working-tree change verified),
  2x knowledge_absorption jobs succeeded, sandbox.deleted(settlement), remote orphan sweep = 0.
  All exec/file surface remote (remote pre-worker baseline build + objdiff scoring verified).
- Teardown paths exercised live: settlement (run 2), reconciliation (run 1's orphan swept at
  run-loop startup).
- Live-only defects found and FIXED (committed): (1) Daytona rejects 'resources' on
  snapshot-based creates; (2) host Pi session used in-sandbox workspace path as host cwd
  (EACCES mkdir /opt/melee) — host bookkeeping now uses artifact_dir/host-cwd.
- Known minor follow-up: checkdiff tool-slot path '/opt/.worker-tool-slots' derives a host path
  from the remote workspace root (tool degraded gracefully); fix alongside the deferred host-FS
  read items from phase 2.
- PoC environment notes: disposable state dir /tmp/melee-sandbox-poc-state; repo-root is the
  disposable /tmp/melee-acceptance/melee tree (now wine/macOS-configured; wine one-TU rebuild
  verified byte-identical: runtime.o df6bb9cb... matches shipped + container + Daytona builds).
  Knowledge librarian references the PRODUCTION ledger path even under state-dir override
  (0 appends observed) — isolation gap to note in phase 4.
- Parity run in flight: run 23b77d33, same target, execution_class local, wine host builds.
</phase3_progress>

<phase3_gate verdict="PASS" date="2026-08-18">
All gate criteria verified live (full narrative: examples/phase3/live_poc_report.md):
- Claim settled cleanly: run 0b662f7a banked-improvement checkpoint b8517a4c (99.65522 ->
  99.72665), two-cycle real agent session, all exec/file IO remote.
- Patch integrated: integration outcome APPLIED (working-tree change verified); knowledge
  jobs succeeded.
- Sandbox deleted at settlement; remote list-by-label sweep EMPTY at end (no orphans across
  4 runs / 4 sandboxes created).
- Parity vs local worker (run 23b77d33, same target, same 99.65522 baseline): identical
  mechanism, validation contract, and evidence shape; local banked 99.68132 in one cycle.
  Host wine build verified byte-identical (runtime.o df6bb9cb... == shipped == Daytona).
- Mid-claim sandbox death drill (run 1e74f937): external delete at 01:23:16Z mid-session ->
  claim closed(error) -> job requeued -> retry provisioned a fresh sandbox and resumed;
  drill then terminated deliberately; no dangling sandboxes.
- Both recovery teardown paths exercised live: reconciliation (run 1 orphan) and settlement.
</phase3_gate>

<phase4_gate verdict="PASS" date="2026-08-18">
- Daytona parent and child design bundles 20, 30, 50, and 70 describe the shipped image,
  ClaimToken lifecycle, durable sandbox events, live teardown paths, and measured platform proof.
- Snapshot reactivation guidance is recorded in bundle 70; stop-while-thinking is captured as the
  named future-objective seed at followups/stop-while-thinking-seed.md.
- Docs validation matches the accepted baseline: exactly 10 pre-existing E6 structured-table
  errors in 10-system-design, one pre-existing W1 warning, and 0 stale references.
</phase4_gate>

<in_progress>
- None. OBJECTIVE COMPLETE: all four phase gates passed 2026-08-18; committed per phase.
</in_progress>

<next_actions>
- Operator: review the phase 4 docs diff, the live_poc_report, and the flagged decisions —
  disk default (5 GiB cannot hold even a trimmed image comfortably; PoC ran at 10),
  execution_class selector design for fleet rollout, and the stop-while-thinking seed.
- Fleet rollout is a separate future objective (see followups/ and design bundle 60).
</next_actions>

<risks_or_open_questions>
- The measured 5.87 GB snapshot predates the 0.70 GiB bundle trim; no trimmed-image size has been
  measured. Bundle 60's stopped-idle cost assumption remains future work owned by the follow-up.
- This worktree's full server suite reports the known qa-repair.test.ts 5-second timeout plus an
  environmental boundary failure because root node_modules/@agent-kernel/kernel is absent; the
  app-level link exists, and the suite excluding those two tests passes 1,095/1,095.
</risks_or_open_questions>

<important_paths>
- objectives/daytona-sandbox-execution/context/ — constraints, scope, phased plan.
- objectives/daytona-sandbox-execution/followups/stop-while-thinking-seed.md — future idling work.
- docs/40-new-features/10-daytona-sandbox-execution/ — design bundles (amended, phase 4).
- toolpacks/gamecube-decomp/_impl/gamecube/sandbox-image/ — MANIFEST.md + build_image_bundle.sh.
- games/melee/state/tools/wibo-1.2.0-opt1/ — golden wibo + patch (read-only; production state).
- apps/server/src/core/job-queue/sandbox.ts — provider contract plus Daytona/Fake implementations.
- apps/server/src/core/job-queue/sandbox-events.ts — sandbox lifecycle event emitters.
- apps/server/src/core/job-queue/ and .../workers/worker-job.ts — the seams phase 2 touches.
</important_paths>
</current_state>
