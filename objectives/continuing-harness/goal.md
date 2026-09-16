<goal>
- Implement the approved Continuing Harness spec with durable per-game state, grouped configuration, external source contracts, and an epoch -> Sync -> admission loop.
</goal>
<context_refresh>
- Read objectives/continuing-harness/current_state.md and context/*.md.
- Read docs/40-new-features/40-continuing-harness through Docs MCP.
</context_refresh>
<working_strategy>
- Astra agents implement isolated ownership areas; parent reviews actual integration and regression evidence.
- Preserve historical evidence and existing user changes. Test migration using temporary fixtures before any live migration.
</working_strategy>
<success_metrics>
- Fresh game setup does not require cycle creation; completed epochs always Sync, including no-change results.
- Pause and failed readiness block admission; save points and timeline pin real evidence.
- Configuration and sandbox images are game-scoped with named profiles.
</success_metrics>
<non_goals>
- No PR campaign redesign, live worker runs, external ingestion, image pushes, or deletion of historical evidence during validation.
</non_goals>
<completion_criteria>
- Integrated code passes targeted tests, typechecking, policy checks, and docs validation.
- Spec/design docs explain implemented behavior and remaining deployment steps precisely.
- Record tests and any unexecuted live migration in current_state.md.
</completion_criteria>
