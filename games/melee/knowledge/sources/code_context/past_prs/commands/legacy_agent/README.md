# Legacy Past PR Agent Mirror

This folder is retained as a legacy mirror for previously generated run
summaries and older operator workflows.

The canonical PR-review agent now lives at:

```text
apps/server/src/core/agent-catalog/agents/knowledge/pr-indexer/
+-- templates/system.md
+-- templates/initial_user.md
+-- schema.json
```

`projects/melee/knowledge/sources/code_context/past_prs/commands/build_pr_postmortems.py`
writes standard PR-review agent files to the canonical source slice by default.
