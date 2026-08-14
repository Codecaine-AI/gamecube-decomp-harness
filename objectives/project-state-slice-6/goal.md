<goal>
- Implement Slice 6 of the project-state overhaul: the unified ProjectStateView read model, the canonical 21-action operator surface, an always-on durable background knowledge queue (migration 017), frontend projection/controls, and canonical documentation absorption of the remaining three feature contracts.
</goal>

<context_refresh>
- Reread objectives/project-state-slice-6/goal.md.
- Reread objectives/project-state-slice-6/current_state.md.
- Reread objectives/project-state-slice-6/context/01_constraints.md and 02_implementation_scope.md.
- Rendered contracts (docs CLI only): docs/40-new-features/20-project-state-and-events/{10-authority-and-actions,60-knowledge,80-operator-view}.
</context_refresh>

<working_strategy>
- Four codex lanes with strict, non-overlapping ownership (see context/lane1..4 specs).
- Wave 1 in parallel: Lane 1 (server knowledge queue + migration 017), Lane 3 (frontend), Lane 4 (docs). Wave 2: Lane 2 (server ProjectStateView + routes) after Lane 1 lands its seam.
- Orchestrator does integration review, migration-copy validation, state updates, and the single scoped commit.
</working_strategy>

<success_metrics>
- getProjectStateView returns every canonical field; exactly 21 canonical actions always present with blockers/expected transitions/confirmation; pr.adopt_legacy only under compatibility_actions.
- Durable knowledge-job table via migration 017; closeWorkerState enqueues exactly once in-transaction; idempotent catch-up; one claim/process seam for automatic + knowledge.process.
- Frontend renders only the server DTO; no client-derived authority.
- Five canonical docs subtrees created; three feature sources absorbed with a source-fact ledger; new-features bundle retained.
</success_metrics>

<non_goals>
- No live migration without explicit user approval (copy validation only).
- No deletion/retirement of docs/40-new-features/20-project-state-and-events/.
- No full repository test suite unless a focused failure cannot be explained.
- No edits to packages/agent-kernel; no UI server start; no push.
</non_goals>

<completion_criteria>
- Focused server/frontend tests and TypeScript pass; affected docs render/link checks pass.
- Migration 017 validated twice on a copy of the live schema-16 DB (backup under ~/backups/); live application explicitly held for user approval.
- current_state.md updated; one commit containing only Slice 6-owned files; unrelated dirty files untouched and unstaged; nothing pushed.
</completion_criteria>
</goal>
