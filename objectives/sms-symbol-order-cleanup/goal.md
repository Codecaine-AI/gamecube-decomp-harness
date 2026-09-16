<goal>
Reduce existing strict symbol validation failures in current upstream SMS using evidence-backed game-code fixes.
</goal>
<context_refresh>
Read current_state.md, context/03_working_plan.md, and REPORT.md in this objective.
Read SMS AGENTS.md in the isolated checkout.
</context_refresh>
<working_strategy>
Build upstream ab00c3c9a466152f6e6bc5b9c28aca959d1a8454, save ninja baseline, run strict validation on tracked TUs, audit findings, fix straightforward cases one at a time, verify batches with changes_all, document difficult cases.
</working_strategy>
<success_metrics>
Fewer strict failures; no lost matches; every tracked configured TU accounted for.
</success_metrics>
<non_goals>
No live checkout, worker, queue, configuration or runtime changes.
No SDK, JSystem, MSL, MetroTRK, THPPlayer edits.
No PR 161 or 162 changes, baseline exemptions, speculative bodies, or validation weakening.
</non_goals>
<completion_criteria>
Useful verified source improvements, complete before/after strict inventory, audited uncertainties, reproducible commands, and durable handoff.
</completion_criteria>
