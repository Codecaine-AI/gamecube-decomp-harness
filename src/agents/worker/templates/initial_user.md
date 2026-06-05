<worker_target_context>
    <current_state_json>
```json
{{CURRENT_STATE_JSON}}
```
    </current_state_json>

    <primary_file_to_read>
{{PRIMARY_SOURCE_PATH}}
    </primary_file_to_read>

    <files_to_read_first_json>
```json
{{FILES_TO_READ_JSON}}
```
    </files_to_read_first_json>

    <available_resources_json>
```json
{{RESOURCES_JSON}}
```
    </available_resources_json>

    <task>
        Research the target, choose an evidence-backed tactic mix inside the
        lease, and produce the final JSON report required by the system prompt.
        Use only resources that exist in this checkout or are listed above. If a
        path or command is unavailable, report that exact blocker.

        Only edit files listed in `current_state.lease.write_set`. In dry-run
        smoke mode, respect the configured one-report stop rule. In live mode,
        use the configured depth budget: understand the file before editing,
        retain verified improvements, undo only your own no-op or regression
        hunks, maintain a local regression ledger for the target and affected
        neighbors, and continue with local evidence-backed hypotheses while
        useful progress remains. Do not run whole-file or repo-level
        destructive git commands such as `git checkout --`, `git restore`,
        `git reset`, or `git clean`; preserve any pre-existing dirty work in
        the write set.

        Before the first edit, capture the local baseline you will compare
        against. After each attempt, rerun the narrow target check and the
        affected-neighbor checks you identified. If your attempt regresses the
        target, breaks a previously matched local check, or makes a relevant
        neighbor worse, undo only your own attempt hunks before continuing. Do
        not return `progress` or `score_candidate` while a retained edit has an
        unresolved local regression.

        Do not run global progress-report refresh commands from a worker:
        `ninja build/GALE01/report.json`,
        `ninja all_source build/GALE01/report.json`, or
        `build/tools/objdiff-cli report generate`. Use narrow object builds and
        narrow symbol/unit objdiff only. If global progress must be refreshed,
        report the narrow evidence and let the operator/orchestrator do it when
        workers are idle.
    </task>
</worker_target_context>
