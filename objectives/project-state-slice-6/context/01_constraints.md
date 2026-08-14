# Constraints

## Contract rules
- The rendered contract wins. Contracts are read only through the docs CLI:
  `bun packages/docs-framework/packages/docs-cli/src/index.ts render <path>`.
- Contract changes require dated decision callouts.
- State remains authoritative; events are accepted-fact history, not replacement state.
- All operator authority is server-owned; the frontend never derives enablement or
  confirmation policy independently.
- Preserve manual operator control and full event/trace lineage.
- Do not weaken Slice 5 dispatch, event, actor, or tracing contracts.

## Repo rules
- Dashboard process name stays `melee-live`.
- Never start the UI server (`bun run ui`, `ui:server`, `ui:dev`).
- Never edit `packages/agent-kernel` (symlink to an external worktree).
- The working tree carries unrelated uncommitted changes (projects/melee/knowledge,
  toolpacks, themes, ref/, Daytona docs, docs-framework submodule, several doc.json
  files). Preserve them; never stage or commit them. Snapshot of the pre-existing dirty
  set: /tmp/slice6-preexisting-dirty.txt.
- Workers never run git write commands (add/commit/stash/checkout/restore/clean).
  The orchestrator stages and makes the single Slice 6 commit. Nothing is pushed.

## Execution rules
- At most four low-reasoning subagents; every implementation edit flows through fresh
  `codex exec -m gpt-5.6-sol -c model_reasoning_effort="low" -s workspace-write -C <repo> '<prompt>' </dev/null`.
- Never `resume --last`. No expanding audit or repair rounds.
- Validation is focused only: targeted bun tests, TypeScript (server root tsc + ui:check),
  affected documentation renders, scoped links/diff checks, and the migration-copy check.
  Full repository suite only if a focused failure cannot be explained.

## Migration rules
- Migration 017 creates schema/indexes only; runtime owns catch-up.
- Do not modify migration 016.
- Back up the live schema-16 DB under ~/backups/ before touching it; validate 017 twice on
  a temporary copy (integrity, foreign keys, counts, constraints, idempotency).
- Ask the user before applying migration 017 to the live database.
