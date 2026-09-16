## Shared regular-mode utilities

`gmregcommon.c` defines three helpers and one initialized byte array. The header exposes their canonical signatures and the array declaration. Both owned files were read completely in canonical and rendered form by inherited research; the lead independently checked the implementation and targeted supporting canonical code. Rendered names remain hypotheses, not evidence. Supported inherited knowledge and names are retained.

### Packed progression decoder
`gm_8017BE84(u32)` returns `(arg0 >> 3) & 0x1F`: bits 3–7 as an integer in 0–31, without validation or mutation. It groups aligned blocks of eight IDs and ignores bits above bit 7. Canonical callers independently establish the progression interpretation: Classic indexes its encounter table, Adventure writes the value into intro data, and All-Star indexes round/opponent data and supplies the round to match setup. `gmRegGetRoundIndex` remains a plausible descriptive name rather than a recovered historical spelling.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gmregcommon.c#L13-L16; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gmclassic.c#L769-L852; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gmadventure.c#L1203-L1218; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gmallstar.c#L501-L535.

### Opponent count
`gm_8017BE8C(const s8*)` reads exactly three entries and counts those unequal to `CHKIND_NONE`, returning 0–3 without changing the table. It neither validates other character-kind values nor checks pointer validity. The canonical accumulator and neighboring recovered `gmReg` symbol support the tentative name `gmRegGetOpponentCount`.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gmregcommon.c#L8-L31.

### Enemy costume repair
`gmRegSetupEnemyColorTable` reads a supplied player character/color and parallel three-entry opponent-kind/color tables; only the color table is written. It obtains `ncolors` for the supplied player kind from `gm_80169238`, whose canonical implementation returns the corresponding `ncolors` field or zero for an out-of-range unsigned kind.

The first pass marks active opponents matching both player kind and player color with `0xFF`. The second pass processes every active `0xFF` entry, including entries already unresolved on input. Candidates ascend from zero to `ncolors - 1`, excluding the player's color and colors held by other active opponents, regardless of those opponents' character kinds. The inner inactive test explicitly uses `(ckinds[k] & 0xFF) == CHKIND_NONE`; the outer tests compare signed entries directly. These expressions are preserved rather than conflating the character sentinel with the color sentinel.

Assignments occur sequentially, so later searches see earlier replacements. Existing non-`0xFF` opponent-opponent duplicates do not themselves trigger repair, and inactive slots remain untouched. If an active entry still equals `0xFF` after the search, the routine invokes `HSD_ASSERTREPORT(0xDA, 0, ...)`. This includes a zero-candidate search; no fallback color or rollback appears in this function. The called assertion implementation's termination behavior was not established.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gmregcommon.c#L30-L79; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gm_1601.c#L4150-L4174.

### Cross-file ownership and lifetimes
The helper retains no pointers. Classic mutates intro-data colors and subsequently copies them into preload-cache entries, except for the branch that explicitly substitutes `0xFF`. Notably, Classic calls the three-entry repair routine inside its per-entry initialization loop; this pass does not establish that all color entries have already been initialized at each invocation. Adventure passes stack arrays, then copies the resulting Mario/Luigi colors into cutscene data before returning. These uses support costume-index semantics without implying ownership transfer.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gmclassic.c#L820-L884; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gmadventure.c#L1371-L1383.

### Data and evidence limits
`lbl_803D79F0` is a writable `u8` array initialized with 24 values: 0–17, 20, 21, 22, 24, 25, 33. No consumer is present in this TU. Its external gameplay role is not established here. C source proves the assertion literal's use, not its compiled section placement. The baseline `.data` claims involving literal membership remain unresolved; the `.sdata` fact is retained only as an explicitly limited absence-of-C-object observation.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gmregcommon.c#L1-L80; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gmregcommon.h#L1-L14.

Status: synthesized; independent review and live promotion pending.
