## Stamina VS controller

`gmstamina.c` defines three populated `GameModeState` descriptors—0/CSS, 1/SSS, and 2/VS—followed by a `-1` sentinel. All use `lbDvdPreload_3` and shared VS payload objects. The header declares the public callbacks consistently with their definitions. Rendered names were reviewed as hypotheses, not independent evidence.

### Selection and battle setup

CSS entry copies persistent `modes.vs_stamina`, sets match type 2, assigns a null KO-count pointer, and prepares the VS preload cache. Shared CSS exit returns to `GM_MENU` on `CSSPendingSceneChange_2`; otherwise it commits selections and prepares character audio. Shared SSS entry copies persistent settings into its payload. Stamina SSS exit commits settings and performs audio calls using `force_stage_id` only when `start_game != 0`; cancellation explicitly schedules state 0. This differs from the shared SSS exit's use of `vs->start.rules.stkind`.

VS entry calls `gm_80167BC8`, copies rules, disables `x2_5`, the timer, and `x3_0`, assigns numeric `match_kind = 1`, and installs `fn_801B9850` in `on_match_start`. After player defaults, the controller copies each controller's player record, sets `xC_b7`, one stock, and 150 HP, then performs subcolor, rumble, and announcer setup. The unresolved bits and numeric match kind should not acquire meanings solely from rendered names.

VS exit passes shared match-end data and persistent Stamina settings to `gm_80168710`, then calls `gmVsMelee_ExitVs(scene, 0, 0)`. The independently read shared helper performs human-dependent accounting and chooses exclusively between those destination IDs, so both outcomes return to CSS without entering Results or Sudden Death through this callback.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gmstamina.c#L16-L142; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gmvsmelee.c#L107-L233.

### Runtime state and exceptional paths

Mode initialization delegates persistent VS configuration initialization; mode loading restores speed to 1.0 and resets shared VS KO storage. Neither operation substitutes for match-start initialization of the private runtime state. `fn_801B9850` clears the completion and slowdown counters, marks absent slots eliminated, and registers `fn_801B96E8` on a newly created GObj using arguments `0xF`, `0x11`, 0 and process priority `0x15`. No local process destruction or allocation-failure branch is present.

`gm_801B9600` latches participating zero-stock slots as eliminated, then counts non-eliminated slots or distinct represented teams. Counting itself does not exclude absent slots afresh: it relies on initialized elimination flags. The function is therefore state-mutating, not a pure query.

`gm_801B97C4` accepts an explicit elimination only when `slot < 4 && cond == 0`. For an initially uneliminated slot it calls `Player_UpdateMatchFrameCount`, starts the slowdown counter at 1, and requests speed 0.4; it then latches elimination. Repeated eligible notifications do not retrigger those effects. There is no lower-bound check for negative slots. Zero-stock detection can latch elimination without initiating slowdown and can suppress a later explicit notification's first-elimination effects.

The process updates slowdown counters only for currently participating slots: 1–99 increment, 100 clears and restores speed, and 0 is idle. Each counter independently restores global speed, so overlapping eliminations do not implement a maximum-duration aggregate timer. Counters of slots that become absent stop advancing here.

With at most one surviving side, the process increments the `u16` completion counter; only values greater than 100 invoke speed restoration followed by `gm_8016B33C(5)` and `gm_8016B328()`. There is no reset when the survivor guard is false and no one-shot latch. Requests repeat while the incremented value exceeds 100, subject to eventual unsigned wrap if external flow never stops the process. These are process updates, not a proven wall-clock duration. The central termination consumer and process teardown remain cross-file lifetime questions.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gmstamina.c#L56-L60; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gmstamina.c#L144-L233.

### Evidence limits

Source declarations support the state-table and private-state semantics associated with baseline data subjects, but do not prove compiled section extents, offsets, or literal placement. In particular, the asserted eight-byte `.sdata2` layout remains unresolved. Descriptive function-name hypotheses are retained without claiming original-name recovery.

Status: synthesized; independent review and live promotion pending.
