<validation_and_handoff>
- Run isolated Bun tests with explicit ./ paths so discovery does not traverse live game checkouts.
- Run bunx tsc --noEmit, bun run ui:check, bun run repo-policy:test, and docs checks.
- Test epoch no-change Sync, changed Sync, paused boundary, intake failure, recovery/replay, and game isolation.
- All databases and worktrees in tests must be temporary fixtures; do not use live runtime state.
- Update current_state.md after meaningful milestones. No background operational runs are required.
</validation_and_handoff>
