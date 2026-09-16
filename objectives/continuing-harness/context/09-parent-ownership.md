# Active Parent Ownership, 2026-09-11

Parent is actively editing infrastructure/kernel/runtime.ts, infrastructure/http/server.ts non-route setup, extracting init-run-command.ts, deleting preparing runtime and core/cycle-runtime/index.ts, and moving required helpers to phases/sync/upstream.ts, assets.ts, validation/report/summary.ts. Do not overwrite server.ts changes. API handleApi changes are yours, coordinate surgical replacements.

Parent also implementing harness_kernel_traces table + persistence (kernel-trace-state.ts) and kernel runtime tests. Physical migration already running under external APFS-clone backup; see /tmp/continuing-layout-apply.txt. Manifest modified to promote ACTIVE worktree to workspace/checkout, PRIMARY git tree to workspace/repository. Read context/07-cutover-coordination.md for proven head mismatch and resolution policy: actual clean head c302741 is descendant of persisted fcafa; preserve both, adopt actual with all readiness pending. Not a user question, authorized migration.

No runtime server writers remain; dashboard and watcher stopped. Backup still in progress at /Users/Ford/Decomp Migration Backups/continuing-2026-09-11/journal.json.
