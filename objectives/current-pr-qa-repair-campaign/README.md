# Current PR QA Repair Campaign Objective

This objective bundle is the durable source of truth for supervising the live
QA repair campaign on the current Melee PR branch. It assumes the QA Repair
Lane MVP exists and focuses on operating it safely: refresh the queue, dispatch
Pi repair agents with target concurrency 32, validate every item, refresh the
remaining queue, and only hand off a clean or explicitly blocked result.

Start a managed run with:

```text
/goal
<paste objectives/current-pr-qa-repair-campaign/goal.md>
```

Keep `current_state.md` updated as the campaign proceeds. The detailed
execution contract lives in `context/`.
