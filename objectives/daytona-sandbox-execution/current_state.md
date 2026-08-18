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
  label-filtered async-iterable list). The earlier registry-blocked handoff note is resolved.
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

<in_progress>
- Phase 2 parallel slices. DONE: slice 1 (provider seam + sandbox.* events + config, commit
  2a48700b, suite 1,067 pass); slice 5a corpus audit (only m2c_decompile needs a fetch-first
  shim — examples/phase2/corpus_tool_audit.md). IN FLIGHT on worktree branches: slice 2
  (daytona/slice-2, provisioning), slice 3 (daytona/slice-3, bash-ops/file-tools/exec routing),
  slice 6 (daytona/slice-6, settlement/reap/reconciliation deletion).
</in_progress>

<next_actions>
- Review + merge slices 2/3/6 (order 2->3->6), full suite green after each merge; then slice 4
  (validation/evidence download path) and slice 5b (m2c fetch-first shim, discovery scan
  in-sandbox); then phase 3 live PoC against snapshot melee-sandbox-poc-20260818.
</next_actions>

<risks_or_open_questions>
- Snapshot two-week deactivation: melee-sandbox-poc-20260818 needs the keepalive/reactivation
  runbook step (phase 4) if phase 3 slips.
- Stop-while-thinking is deliberately out of v1; wake latency measured at ~0.85 s (phase 1) —
  write the follow-up objective seed in phase 4 with that number attached.
- Slice-2/6 both touch worker-job.ts on parallel branches — expect a small merge conflict.
</risks_or_open_questions>

<important_paths>
- objectives/daytona-sandbox-execution/context/ — constraints, scope, phased plan.
- docs/40-new-features/10-daytona-sandbox-execution/ — design bundles (amendments pending).
- toolpacks/gamecube-decomp/_impl/gamecube/sandbox-image/ — MANIFEST.md + build_image_bundle.sh.
- games/melee/state/tools/wibo-1.2.0-opt1/ — golden wibo + patch (read-only; production state).
- apps/server/src/core/job-queue/sandbox.ts — provider contract plus Daytona/Fake implementations.
- apps/server/src/core/job-queue/sandbox-events.ts — sandbox lifecycle event emitters.
- apps/server/src/core/job-queue/ and .../workers/worker-job.ts — the seams phase 2 touches.
</important_paths>
</current_state>
