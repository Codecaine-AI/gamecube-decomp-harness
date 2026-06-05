# Legacy Past PR Agent Mirror

This folder is retained as a legacy mirror for previously generated run
summaries and older operator workflows.

The canonical PR-review agent now lives at:

```text
decomp-orchestrator/src/agents/pr-review/
+-- templates/system.md
+-- templates/initial_user.md
+-- schema.json
```

`knowledge/past_prs/utils/build_pr_postmortems.py` writes standard PR-review
agent files to the canonical source slice by default.
