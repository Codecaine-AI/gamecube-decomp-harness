## Review: `src/melee/pl/types.dox`

Read all 36 canonical and rendered lines and exhausted the subject and link listings. The frozen baseline contains no subjects, facts, or links. The rendered view has no substitutions or parse errors; no naming correction is warranted.

This documentation file declares two player-related structures rather than executable behavior:

- `plAllocInfo2` contains `internal_id`, `slot`, an unknown enum-valued field, and eight one-bit fields, including `has_transformation`. Its TODO conjectures that it is the same structure as `plAllocInfo`; it does not establish equivalence. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/pl/types.dox#L6-L22.
- `StaleMoveTable` declares a signed current index, ten entries pairing unsigned 16-bit move IDs and attack-instance values, and a signed total attack count. The index comment describes zero-based indexing, rollover after nine, and increment after each write. These are documented expectations, not independently verified runtime behavior. The `0xE8` annotation does not establish a compiled field offset. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/pl/types.dox#L24-L33.

No executable branches, allocation lifetimes, or cross-file ownership behavior are established by this file. Existing descriptive names fit the declarations; unknown fields remain unresolved. No supported semantic correction or useful scoped fact proposal is necessary.

Status: synthesized; independent review and live promotion pending.
