# Docs Agent Handoff

The source rename is complete. Actual directory: apps/server/src/core/harness-runtime. All operational cycle modules removed. Update typed docs source references now.

Canonical Sync staging always uses workspace/staging for grouped game state. Custom state-dir overrides use stateDir/staging. No filesystem-existence legacy fallback remains. Old completed Sync worktrees remain historical evidence.

Live migration is still backing up historical worktrees. Await completion evidence before claiming database migration completed.
