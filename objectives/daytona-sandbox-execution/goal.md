<goal>
- Move worker-claim command execution and workspaces into per-claim Daytona sandboxes while the worker agent process, all authority, and all durable state stay on the host: the sandbox is a remote exec/file surface reached through the injectable bash-operations seam and the `runCommand` chokepoint, chosen for CPU scale-out.
- Workspaces materialize in-sandbox from a baked game image plus a per-claim git-bundle seed, superseding host git worktrees for sandbox-class claims.
- The objective ends at a live one-worker sandbox PoC on a disposable test run; fleet rollout is a later objective.
</goal>

<context_refresh>
- Reread objectives/daytona-sandbox-execution/goal.md.
- Reread objectives/daytona-sandbox-execution/current_state.md.
- Reread objectives/daytona-sandbox-execution/context/00_problem.md through 04_validation_and_handoff.md.
- Skim docs/40-new-features/10-daytona-sandbox-execution/ (design bundles; amendments pending per context/01) and toolpacks/gamecube-decomp/_impl/gamecube/sandbox-image/MANIFEST.md.
</context_refresh>

<working_strategy>
- Phase-gated per context/03_working_plan.md: (0) repair the stale image groundwork and build the musl objdiff-cli; (1) bake the image and run the bake-and-time platform experiment answering the four unknowns (wibo-i686-on-runner first); (2) build the harness seams — provisioning in buildWorkerTask routed by execution_class, sandboxBashOperations + file-tool redirection, per-attempt evidence download, fetch-first corpus-tool shims, sandbox.* events, reap wiring; (3) live one-worker PoC end-to-end; (4) docs amendments and close-out.
- All eleven operator-locked decisions in context/01_constraints.md are binding; deviations require operator sign-off.
- Never touch live state (games/melee/state, dashboard on :8787). The PoC runs on a disposable test run and state dir.
</working_strategy>

<success_metrics>
- Phase 0: build_image_bundle.sh succeeds on the games/ tree; MANIFEST acceptance checks pass locally.
- Phase 1: MWCC-under-wibo produces byte-identical .o on a Daytona runner; image fits the 10 GiB cap; exec round-trip and wake latencies recorded.
- Phase 2: `bun test` (from apps/server) green with sandbox seams behind execution_class; local path byte-identical in behavior.
- Phase 3: one worker claim completes fully remote-exec — checkpoint recorded, patch integrated, knowledge job enqueued, sandbox deleted at settlement.
</success_metrics>

<non_goals>
- No child-in-sandbox WorkerExecutor adapter (host-agent model is v1; port retained as a possible later phase).
- No stop-while-thinking in v1 (always-run; follow-up after wake latency is measured).
- No fleet scale-out, warm pools, epoch-boundary sandbox builds, or PR work-item kinds.
- No knowledge corpora, secrets, or model access inside sandboxes.
</non_goals>

<completion_criteria>
- Phase 3 gate passed: live one-worker sandbox PoC verified end-to-end with parity evidence against a local-execution worker on the same target.
- Timing/measurement artifacts from phase 1 recorded under the objective.
- Docs amendments applied (design bundles 30/50/20, MANIFEST.md) and current_state.md closed out.
</completion_criteria>
</goal>
