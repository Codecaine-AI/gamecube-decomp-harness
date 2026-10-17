# Brief for every implementation slice

You implement one slice of a reviewed plan in the GameCube decomp harness.

1. Read `objectives/worker-compiler-loop/plan.md` (the spec) and `objectives/worker-compiler-loop/contract.md` (interfaces, file ownership, rules) in the worktree `/Users/Ford/.t3/worktrees/gamecube-decomp-harness/feat-worker-compiler-loop`. Follow the contract's Workspace rules exactly: no commits, no git add/reset/checkout/stash, own files only, additive edits to shared files, no UI servers, no live sandboxes/snapshots/state DB.
2. Read the repo's AGENTS.md. Match surrounding code style, comment density and naming. Keep the dashboard Agent preview aligned when prompt/context changes (AGENTS.md).
3. Implement your slice fully, with tests. Prefer real behaviour tests over implementation-coupled ones.
4. Run typecheck and the relevant tests; distinguish pre-existing failures (verify against `origin/main` if unsure) from yours.
5. Final report (under 500 words): files changed; what works now (concrete); tests run + results; anything not done and why; interface questions or contract deviations. If you used Codex, list which changes it made.
