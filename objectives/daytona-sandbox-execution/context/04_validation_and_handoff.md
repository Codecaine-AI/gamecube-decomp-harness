# Validation and Handoff

## Validation commands

- Test suite: `cd apps/server && bun test` (never from repo root — EMFILE on game trees).
- Bundle build: `toolpacks/gamecube-decomp/_impl/gamecube/sandbox-image/build_image_bundle.sh`
  (after phase 0 path fixes).
- MANIFEST acceptance: the five checks listed in MANIFEST.md, run inside a Linux container for
  phase 0 and inside a Daytona sandbox for phase 1 — the networking-disabled one-TU rebuild with
  objdiff READY score is the load-bearing one.
- Byte-identity: compare every sandbox-built `.o` SHA-256 against the local golden build (the
  wibo-1.2.0-opt1 verification procedure in
  `games/melee/state/tools/wibo-1.2.0-opt1/README.md` is the template).
- Orphan check after any live run: list Daytona sandboxes filtered by `game_id` label; the set
  must be empty when no claims are active.

## Required artifacts

- `examples/poc_timings.json` (phase 1): per-step timings — create, seed upload, checkout, build,
  score, download, delete, stop->start wake — plus image size and resource class used.
- `examples/live_poc_report.md` (phase 3): run/claim/job/sandbox ids, `sandbox.*` event trail,
  evidence paths in artifact_dir, integration outcome, parity comparison vs a local worker on the
  same target.
- Updated MANIFEST.md and design-bundle amendments (phase 0/4) — diffs reviewable in one commit
  per phase.

## Hard safety rules

- `games/melee/state` and the :8787 dashboard are production — read-only, always. All live
  execution happens against a disposable state dir and test run.
- The Daytona API key lives in host `local.env` only; it never enters an image layer, a seed, or
  sandbox env. No corpora, no model access, no secrets in sandboxes (design bundle 20 rule,
  reconfirmed).
- Sandboxes are always created with wall-clock TTL past the claim deadline; every exec call
  passes an explicit timeout.

## Handoff rules

- Update `current_state.md` at each phase gate with: gate verdict, artifact paths, and any
  deviation from `01_constraints.md` (which requires operator sign-off before proceeding).
- The eleven locked decisions travel with this bundle; a future session must not re-litigate them
  from the design docs, which are older than the interview (2026-08-13 vs 2026-08-18).
- Implementation does not start until the operator signs off on this bundle (recorded in
  current_state.md).
