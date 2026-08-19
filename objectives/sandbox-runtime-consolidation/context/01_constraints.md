# Constraints

## Operator rulings (binding; deviations require sign-off)

1. **Sandbox-only workers.** Local worker execution class removed, not shimmed (repo convention:
   zero backward compat). FakeSandboxProvider dry-run remains the test/dev surface. Retire with
   it: per-epoch `.worker-ninja-slots` dirs, the host compile-jobserver wrap around worker
   builds (the jobserver remains for host-side builds, e.g. epoch boundary), worker worktree
   provisioning (`provisionWorkerWorktree` leaves the worker path), and worker tool-concurrency
   limits + slot mechanisms + their settings/dashboard UI.
2. **Teardown at worker close.** Delete the sandbox the moment the worker closes its
   worker_state — not at job settlement. Preferred mechanism: host observes worker_state close
   (keeps deletion authority host-side); child-initiated delete is the recorded fallback.
   Reap + startup reconciliation + platform wall-clock TTL stay as the safety net.
3. **Knowledge lane decoupled.** Librarian condensation and knowledge absorption run host-side in
   their own lane, never gating job settlement or teardown, with an explicit per-call LLM timeout.
   Parallelizable independently of the worker loop.
4. **Run-and-sleep.** Stop the sandbox when a model turn begins; start it on the next tool call.
   A stopped sandbox is NOT dead: reap/reconciliation and liveness checks must distinguish
   stopped-by-policy from lost. Debounce policy is an open design question — decide with data
   (mean model turn 10.8 s; stop+start round trip ~1.5 s).
5. **Zombie-claim fix is in scope** (phase 2): the consumer heartbeat must verify child liveness;
   a dead child must let the lease lapse so reap fires.

## Platform + environment facts (verified in the prior objective)

- Stopped sandboxes bill reserved disk only; our 5 GiB is inside the free tier. Started
  sandboxes bill all reserved resources ($0.166/h at 2/4/5). Archived bill nothing.
- Wake latency 0.78–0.86 s to first exec (3 trials). Exec RTT p50 70 ms. Create ~0.9 s.
- Every Daytona exec must pass an explicit timeout (platform default 10 s). Platform inactivity
  auto-stop stays disabled (it ignores background processes); OUR stop calls are explicit.
- Snapshot: melee-sandbox-poc-20260818-trimmed (1.05 GB, class 2/4/5); snapshots deactivate
  after two weeks unused. DAYTONA_API_KEY in repo local.env; daytona CLI profile authed via
  `daytona login --api-key` (env var alone is insufficient for the CLI).
- SDK @daytonaio/sdk 0.205.x: sandbox.stop()/start() exist (Sandbox class); creation from
  snapshot must NOT pass `resources`.

## Process constraints

- Never touch production: games/melee/state and the :8787 dashboard are read-only, always.
  Live validation uses a disposable state dir + repo-root (the prior objective's pattern:
  /tmp state dir, disposable tree, private graph.sqlite copy, poc-activate/poc-release helpers
  preserved at objectives/daytona-sandbox-execution/examples/phase3/).
- `bun test` from apps/server/ only (repo root EMFILEs). Known environmental flake:
  qa-repair.test.ts 5 s timeout — pre-existing, not a regression signal.
- Local-class REMOVAL touches shared code paths; the existing suite is the regression net and
  must be updated deliberately (tests asserting local-path behavior get removed/rewritten with
  the feature, not skipped).
- Keep the host loop caffeinated (or equivalent) for any long live run; host sleep killed a
  worker child in the sweep.
