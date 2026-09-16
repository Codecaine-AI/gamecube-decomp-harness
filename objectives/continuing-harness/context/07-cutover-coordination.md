# Parent Cutover Findings

- Dashboard process 57920 and its watcher shell exited after SIGTERM. No lsof handles remain for orchestrator.sqlite or agent-kernel.sqlite. No server restart is authorized by repository instructions.
- Current sync sync-9f434fef-7a1e-4e1a-92d7-6d36c9ff6967 is blocked before staging/publication. Its lease is stale, acquired 2026-09-11T00:58. Preserve it in migration evidence and cancel with an explicit migration event before clearing lease.
- Active cycle owner: 5f955426-0cc8-4421-8ff0-068979ee5636. Stored head fcafa1a22316a668099594d94cad8dec8774fecb; actual clean worktree at games/melee/worktrees/cycles/<id>/current has c302741689bd67c361cd7faadb221df3193992c3, a merge of origin/master into that branch. Stored head is its ancestor. Preserve both identities, adopt actual clean head with readiness pending and explicit migration evidence.
- Primary games/melee/checkout has clean upstream HEAD 480b0445408ddcd8db7b8ac64175c6d373053763. It is NOT the authoritative worktree. Promote active worktree to workspace/checkout; primary repository can live at workspace/repository so linked worktrees retain Git object storage. No checkout/reset or deletion of commits.
- Parent will rename core/cycle-runtime to core/harness-runtime after agents finish writes, updating imports/Docs sources; no physical directory moves by agents meanwhile.
- Parent owns infrastructure/kernel/runtime.ts and infrastructure/http/server.ts non-handleApi wiring. Needs dedicated harness kernel trace linkage persistence, retaining all historical session associations. Coordinate schema with harness_state.

Schema coordination: canonical kernel_trace linkage needs game/harness/app_session association and last cursor; migrate all historical cycle kernel_trace_json associations. Parent is implementing infrastructure/kernel/runtime against proposed harness_kernel_traces(game_id,harness_id,app_session_id,kernel_trace_json) table, unique(game_id,harness_id,app_session_id).

Parent has implemented kernel-trace-state.ts and infrastructure/kernel/runtime.ts against harness_kernel_traces; schema must create/migrate this table before runtime. New linkage function persistHarnessKernelTraceLinkage, callback activeHarnessId, trace attachment HarnessKernelTraceLinkageAttachment.
