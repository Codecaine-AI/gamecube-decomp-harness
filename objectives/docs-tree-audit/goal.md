<goal>
- Build a shared, recorded understanding of the docs/ tree's order, numbering,
  index accuracy, and block-structure hygiene with Ford, then apply only what is
  agreed in objectives/docs-tree-audit/target_structure.md.
- Scope is order, index, and structure hygiene. Content is assumed mostly
  correct.
</goal>

<context_refresh>
- Reread objectives/docs-tree-audit/target_structure.md (decisions + open questions).
- Reread objectives/docs-tree-audit/current_state.md.
- Baseline: commit f60ef61b on main; Slice 6 absorbed; feature bundle
  40-new-features/20-project-state-and-events deleted.
</context_refresh>

<working_strategy>
- Interview loop, one section at a time, waiting for Ford between sections:
  present current vs proposed order, flag Slice 6 reading-order damage, flag
  block-structure findings (state-shape / structured-table / callout /
  interaction-surface candidates) and the W4 audit warnings in that section,
  ask concrete option-based questions, record decisions with dates.
- Apply only after Ford approves a section (or a batch). All docs/ edits go
  through fresh `codex exec -m gpt-5.6-sol -c model_reasoning_effort="low"
  -s workspace-write -C <repo> '<prompt>' </dev/null` — never resume --last,
  never hand-edit doc.json. Verify with renders of touched bundles +
  `bun run docs:audit` + `bun run docs:links`, show before/after.
</working_strategy>

<success_metrics>
- Every section of target_structure.md carries a dated decision.
- Applied sections render correctly; audit warnings in scope resolved; links 0 stale.
</success_metrics>

<non_goals>
- No app code, tests, UI server, or packages/agent-kernel changes.
- No content rewrites beyond agreed structure/order/index hygiene.
- Never stage unrelated uncommitted work; docs/20-implementation/30-knowledge/doc.json
  and the Daytona doc.json files stay uncommitted.
</non_goals>

<completion_criteria>
- Ford says done; target_structure.md reflects every decision; stage only this
  objective's files plus agreed doc changes; one commit; do not push.
</completion_criteria>
