<director_wake_context>
    <current_state_json>
```json
{{CURRENT_STATE_JSON}}
```
    </current_state_json>

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
        Read the board, interpret the wake event, and emit one bounded
        scheduling decision as JSON according to the system prompt. Use only
        resources that exist in this checkout or are listed above. Treat
        missing resources as blockers to report, not facts to invent.

        For this vertical slice, the runner may only persist your output as a
        director cycle artifact. Do not assume a worker has been launched unless
        the current state shows a lease/session row for it.
    </task>
</director_wake_context>
