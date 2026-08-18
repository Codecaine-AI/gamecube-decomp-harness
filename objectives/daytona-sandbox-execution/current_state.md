<current_state>
<last_updated>2026-08-18</last_updated>

<status>
- Bundle authored from the 2026-08-18 verification + interview session.
- Sign-off: operator launched an execution session against this bundle's goal.md (2026-08-18),
  treated as approval to proceed. Phase 0 in progress.
- Phase 2 slice 1 foundation implemented and fully test-green: sandbox provider seam,
  Daytona/Fake providers, lifecycle events, and runtime configuration. Provisioning and
  agent-runtime wiring remain out of scope.
- Phase 2 slice 6 sandbox lifecycle teardown implemented and test-green: settled-claim deletion,
  reap deletion that cannot block claim recovery, and startup reconciliation under the shared
  current-job-lease write-fence predicate.
- SDK dependency installation remains blocked: this environment cannot reach the npm registry,
  and the local Daytona mirror documents `@daytona/sdk` rather than requested `@daytonaio/sdk`,
  so no stable `@daytonaio/sdk` version could be verified or added without guessing.
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
- Sandbox deletion now emits idempotent `sandbox.deleted` events for settlement, reap, and
  reconciliation; reconciliation also requires the current active run dispatch lease and an
  active target claim before retaining a labeled sandbox.
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

<in_progress>
- Phase 2 provisioning and sandbox execution routing remain in parallel slices; slice 6 is ready
  to integrate with their `sandbox_id` payload attachment and label stamping.
</in_progress>

<next_actions>
- Merge slice 6 with the provisioning/exec-routing slices, then exercise one sandbox worker claim
  end to end so settlement, reap, and restart reconciliation see real Daytona labels.
</next_actions>

<risks_or_open_questions>
- Package authority mismatch: ai_docs/daytona_docs installs `@daytona/sdk` (documented at
  v0.198.0+), while this slice explicitly requested `@daytonaio/sdk`; confirm the installed
  package exposes the session, file, labels, TTL, auto-stop, resource, and list APIs used here.
- Phase 1 falsification risk: 32-bit static wibo on Daytona's shared-kernel amd64 runners is
  unverified; failure halts the objective for an operator decision.
- Image staleness fix scope may grow if configure.py pins drifted since the MANIFEST was written.
- Stop-while-thinking is deliberately out of v1; fleet cost math in design bundle 60 assumes it —
  revisit before scaling beyond the PoC.
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
