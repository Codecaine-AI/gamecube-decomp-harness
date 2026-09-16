# Validation and Handoff

Required gates are `ninja baseline` before source edits, `ninja changes_all` after each batch, direct unchanged strict validator results, and final full-build SHA verification.
Artifacts must include upstream SHA, map checksum, tool versions, configured tracked TU coverage, per-file failure categories and execution errors.
Matching reports must distinguish gains, losses and unchanged matches.
REPORT.md records fixed, remaining and uncertain cases with evidence paths.
Before ending or compaction update current_state.md with active sessions, safe resume command and outstanding verification.
