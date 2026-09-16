## Bonus Records screen

The unit implements a five-row sliding window over a deliberately ordered table of 256 bonus identifiers terminated by `0x100`. Normal eligibility uses `gm_8016F120`; a unit-local debug flag bypasses that query. The remaining-count routine skips the current number of eligible records, then counts all eligible records from that position, including the visible window. The text updater applies the same skip rule and populates at most five rows using three consecutive SIS messages per bonus, with conversion `((u16) gm_8016F208(id) - 2) * 3` and bases `0x1BA`, `0x1BB`, and `0x1BC`. It continues scanning to the sentinel after filling five rows and does not clear unused rows.

Construction publishes menu ID `0x1F`, preserves the previous menu, resets selection and singleton state, establishes global cooldown 5 and local initialization countdown 8, and resets the debug flag. It consumes the already-retained menu archive to load four `MenMainConBo` model/animation descriptors. Heading text and the animated model are created immediately; the fifteen row-text objects are created later when the input callback observes local countdown 1, after global cooldown has finished.

Input priority is global cooldown, local initialization delay, exit mask `0x20`, debug activation, then navigation. Exit requests menu `0x1C`, releases fifteen row texts, the heading and model GObj, and nulls only the retained model pointer. This body does not explicitly destroy its own input GObj or release the shared archive. Debug-level-gated L+R+A enables show-all and resets the offset, but does not return before navigation. Mask 1 takes precedence over mask 2 even when upward movement is blocked. Accepted navigation moves one eligible record, not five, and refreshes existing text objects.

The separate model callback advances its frame counter through 0–200, controls the root child's next sibling from `offset > 0`, controls the root child from `remaining > 5`, and requests/evaluates animation. It does not share the input callback's startup gates.

## Semantic assessment

All six rendered owned function names fit their canonical roles and public declarations; no rename is warranted. The rendered views reported no parse errors, and their function-only substitution coverage leaves field, parameter and data names unchanged. Existing descriptive knowledge is retained explicitly except for six facts and two links whose exact compiled-size or section-attribution claims remain unverified. No compiled artifacts were available, so C literals and source declarations are not treated as proof of emitted section composition.

Status: synthesized; independent review and live promotion pending.
