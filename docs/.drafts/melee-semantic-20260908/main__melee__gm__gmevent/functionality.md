# Disjoint Librarian Research

### shard-main__melee__gm__gmevent-000
Reviewed canonical and rendered `src/melee/gm/gmevent.c` lines 1–480 only. This range defines event configuration structures and the CSS/VS state table, loads `sqEventInitDataLevelTbl` from `GmEvent.dat`, and implements CSS entry/exit handling. A preload helper copies selected character/color entries into the scene cache, optionally copies the stage, and combines character- and stage-dependent audio-call results into a mask. Player initialization applies defaults, copies configuration fields, unpacks flags, and assigns attack/defense ratios and model scale. Character selection filters a configured list against earlier player slots before choosing a random remaining entry. The visible portion of VS entry initializes rules from the selected configuration, handles a stage-table branch, disables all six player slots initially, and starts populating configured players, including selected-character fallback for player zero. VS entry continues beyond this shard.

### shard-main__melee__gm__gmevent-001
Reviewed canonical and rendered gmevent.c lines 481–960 only.

- The match-setup tail resolves character/color selections, avoids specified color collisions, restores saved player state for kind-2 entries, applies index-specific overrides, forwards kind-1 configuration to setup helpers, and selects preload operations using `ev->x44`.
- `onExitVs` handles retry resets, no-contest return to the menu, and continuation that saves stocks/percent and advances `x20`. Otherwise it conditionally compares `xC` with a stored value, dispatches result-processing helpers, and selects menu or challenger transitions. The comparison supports either smaller nonzero-baseline values or larger values according to `xB_6`.
- `gm_Mode_Event_OnInit` initializes event state and four character/color slots. `gm_801BBB64` rebuilds those slots from the selected table entry, chooses an `x44` preload branch, and applies kind- and index-specific overrides.
- `gm_Mode_Event_OnLoad` resets per-run state, rebuilds selections, and selects state 1 when the first configured character differs from `0x21`. Unload is empty; `fn_801BBFE8` calls the current-mode getter and then `gm_801BC00C`. The final partial inline begins a character/color collision check.

### shard-main__melee__gm__gmevent-002
Reviewed canonical and rendered gmevent.c lines 961–1440 only.

- `gm_801BC00C` clears event runtime fields, selectively loads the event archive table, performs index-specific character/color calls and entry processing, restores saved timer fields for selected continuing events, applies camera quake scale, and installs the selected event callback on a new GObj.
- Static records and `gm_803DF94C` form a 51-entry callback dispatch table, with a common callback and selected specialized callbacks or secondary hooks.
- `gm_801BC488` processes a copied result structure and returns `x16` when `xE == 1`, otherwise 4.
- `gm_801BC4F4` marks completion and computes `xC` from either accumulated frame counts (capped at 0x34BBF) or player-zero KO counts. It compares that value with an existing value, selects different downstream calls for improvement, restores game speed, and invokes the common ending sequence.
- `gm_801BC670` saves continuation-related fields, clamps the saved timer against archive data, selects `x38` using an explicit fighter-kind comparison, and accumulates frame count.
- `gm_801BC754` checks occupied opponent slots with stocks for match-kind value 1, optionally adds an external count, and completes when the total is zero. Player-zero stock depletion or an enabled timer boundary produces the alternate ending path. For match-kind values 0 and 2, that timer boundary instead compares `x7` with `gm_801BC488` before choosing the path.
- `gm_801BC9E8` completes when player-zero coins reach an archive-defined threshold; otherwise it applies the same gated timer-boundary failure path. The assigned tail begins `gm_801BCAF0`, including a stock-restoration branch, but does not contain its full behavior.

### shard-main__melee__gm__gmevent-003
Reviewed canonical and rendered gmevent.c lines 1441–1920 only.

- These event callbacks select between gm_801BC4F4 and a repeated path that clears EventData.xB_1, restores game speed to 1.0, invokes several match/audio helpers with fixed arguments, and calls HSD_GObjPLink_80390228. Their shared timer predicate is gated by !xB_0 and timer enablement, with gm_8016AEEC()==0 and gm_8016AEFC()==0x3B.
- gm_801BCC9C handles an xB_2 countdown separately. Otherwise, depletion of slot 1's stocks triggers a table-derived character/costume operation, adjusting a costume collision with the selected player. The final table entry routes to gm_801BC4F4 before checking P1 stocks; a nonfinal entry routes to gm_801BC670 if P1 still has stocks. gm_801BCF20 and gm_801BD44C simply delegate to this callback.
- gm_801BCF40 routes the timer predicate to gm_801BC4F4 but P1 stock depletion to the clearing path. gm_801BD028 additionally spawns an event Yoshi egg at a table-provided position when x10 is zero, increments x10, and takes the clearing path when x18 is nonzero. gm_801BD30C requires both P1 and slot 1 to retain stocks before its timer predicate can route to gm_801BC4F4.
- gm_801BD164 compares Player_GetKOsByPlayerIndex(0,2) against (1,2) when slot 2 is out of stocks, requiring a strict greater-than result for gm_801BC4F4. That branch does not return before subsequent P1-stock and timer checks.
- gm_801BD46C counts nonzero ftLib_8008731C results for secondary entities of slots 1 and 2, routing a count of two to gm_801BC4F4 before stock/timer failure checks. Its null-entity path does not assign the tested local.
- gm_801BD658 counts non-NA slots 1–5 with nonzero stocks, optionally adds gm_80169384() under xB_3, and calls gm_801BC4F4 plus ifStock_802FA2D0(0) when the total is zero. Otherwise it checks P1 stocks and the timer predicate. The visible start of gm_801BD7FC prioritizes slot 1 stock depletion over P1 stock depletion.

### shard-main__melee__gm__gmevent-004
Reviewed canonical and rendered gmevent.c lines 1921–2400 only.

- The callbacks select between gm_801BC4F4 and a repeated path that clears EventData.xB_1, restores game speed to 1, invokes audio and match-control helpers with fixed arguments, and calls HSD_GObjPLink_80390228. Their shared timer predicate requires xB_0 clear, timer_enabled, gm_8016AEEC()==0, and gm_8016AEFC()==0x3B.
- gm_801BD93C checks slot 2 stock exhaustion before slot 1 or P1 exhaustion. gm_801BDAF4 waits for the timer predicate and compares Player_GetKOsByPlayerIndex(0,1)-pl_8003FBFC(0) against pl_8003FC20(1), using a strict greater-than comparison. gm_801BDC08 prioritizes a nonzero ground query; gm_801BDD44 prioritizes exhaustion of both slots 2 and 3.
- gm_801BDE94 implements an x20-dependent, stock-driven sequence through x18. It performs one-time character-dependent audio setup under xB_5; xB_2 instead selects an x10 countdown and background-flash helper. The first sequence prepares entries 2 and 3 for slots 2 and 3, then calls gm_801BC670 if P1 survives. The alternate sequence prepares entry 4 for slot 2 and ultimately calls gm_801BC4F4. Both adjust a matching character/color pair before passing it to gm_8016AC44.
- gm_801BE39C performs one-time audio setup and uses x10 as a one-shot latch: when gm_8016AEEC() reaches the configured threshold, it prepares slot 2 data, overrides its color with x50[2], and calls gm_8016EDDC. Once latched, slot 2 stock exhaustion takes precedence over slot 1/P1 exhaustion.
- gm_801BDAD4, gm_801BE37C, and gm_801BE618 simply forward their object to gm_801BCC9C. The shard ends in declarations at the start of gm_801BE638; no behavior is attributed to that function.

### shard-main__melee__gm__gmevent-005
Reviewed canonical and rendered gmevent.c lines 2401–2627, with the preceding function header for context; this is not full-TU coverage.

- `gm_801BE638` tracks depletion of player slots 1 and 2's HP using `x20`, resetting counter `x10` as the first and then both slots reach nonpositive HP. The one-slot branch schedules presentation calls and temporary half-speed playback, then restores normal speed. The both-slot branch disables the HUD and timer, records the frame count, schedules half-speed playback and a background-flash call, periodically requests a medium camera quake, and ultimately calls `gm_801BC4F4` and returns. P1 stock depletion or a gated timer condition instead clears `xB_1`, restores normal speed, and invokes a shared ending-call sequence.
- `gm_801BEA10` applies the selected table entry's `xC->x16` through `Player_SetPlayerAndEntityCpuType`. Three wrappers simply delegate; `gm_801BEA88` additionally sets model scale to 2.0 when its second argument is zero.
- Remaining helpers write `x18`, set/get the selected table index, read a nested Boolean, perform direct and reverse lookup through `gm_803DF918`, retrieve a byte via a pointer loaded at entry offset 0x14, or return the selected entry's `x4` with a null-entry guard. Reverse lookup scans 51 entries and returns 51 on a miss; `gm_801BEBF8` uses that result without an explicit miss guard.

### shard-main__melee__gm__gmevent-006
The assigned header is an interface-only surface. It declares Event mode initialization, load, and unload callbacks; additional functions with integer, byte, boolean, CharacterKind, and opaque-pointer signatures; title-demo setup and preload entry points; and an external array of gm_803DF94C_t pointers. It contains no implementations, state transitions, or array extent. Review covers canonical and rendered gmevent.h lines 1–39 only, not the entire translation unit.

### shard-main__melee__gm__gmevent-007
The assigned documentation fragment declares `gm_801BF694` as a no-argument function returning `u8`, annotated as `GrKind`. It also declares the five-entry `gm_Mode_Camera_States` scene table and documents it as belonging to `GM_CAMERA_MODE`, with a pauser-override callback named `gm_CameraModeVSGetPauser`. This fragment contains no executable implementation; its callback exclusivity claim is documentation, not independently verified runtime behavior.

### shard-main__melee__gm__gmevent-008
The reviewed subjects support Event Match scene handoff, archive-backed match configuration, event-indexed callback dispatch, and battle startup. CSS selections feed match setup; VS results support retry, continuation, records, and subsequent routing. The parameterless startup wrapper delegates to an initializer that resets runtime state, conditionally restores timers and prepares participants, configures camera shake, and installs the selected controller. Source-level declarations and behavior are supported; exact compiled section membership and sizes remain deferred.

### shard-main__melee__gm__gmevent-009
Reviewed the six assigned Event Match helpers and relevant setup callers. They load archive definitions, populate participant/stage preload state and audio masks, initialize player records, select random characters excluding preceding slots, specialize persistent configuration by phase, and install the selected runtime callback. Runtime preparation can include future rounds, not just the current phase. No complete translation-unit coverage is claimed.

### shard-main__melee__gm__gmevent-010
Reviewed the six assigned functions and their baseline facts, not the entire translation unit. The functions implement a snapshot-based standings query, successful time/score finalization, continuation-state capture before a non-final termination, generic stock/timeout resolution, a coin-threshold objective, and a two-opponent form-dependent elimination objective. Success records are compared and persisted separately on scene leave. Named-event mappings and the standings query's compiled field correspondence remain deferred where the reads do not establish them.

### shard-main__melee__gm__gmevent-011
Reviewed the six assigned callback bodies and their shared completion and transition helpers. The sequence controller consumes an indexed fighter/color entry after slot 1 loses its stocks, requests completion at the final entry, otherwise requests a phase transition, and supports delayed controller removal. Its wrapper forwards the GObj unchanged. Other callbacks implement stock-loss checks, one-time egg spawning, KO-credit comparison, and guarded timer-condition completion or failure. Important ordering details are that final-sequence completion precedes the P1-stock check, and the KO-credit callback does not return after processing slot 2's defeat. Named-event and fighter-slot mappings remain unverified; this is not complete TU coverage.

### shard-main__melee__gm__gmevent-012
Reviewed the six assigned callback bodies and their shared sequence/completion logic. Two callbacks forward their GObj unchanged to the sequence controller. The other four prioritize objective completion over stock-loss and guarded timer termination. Completion sets EventData.xB_1; direct failure paths clear it, restore speed, configure ending parameters, request termination, and remove the controller. The secondary-entity callback has a significant source-level caveat: its temporary result is not assigned when an entity lookup returns NULL. Named scenario/character mappings remain unverified.

### shard-main__melee__gm__gmevent-013
Reviewed the six assigned callbacks and their shared completion/delegation code. They implement a guarded strict KO-counter comparison, stage-status completion, two-slot stock completion, table-driven stock-gated progression, unconditional delegation to a sequential controller, and delayed slot-2 creation with asymmetric stock outcomes. Successful paths set the shared success flag through gm_801BC4F4; unsuccessful paths clear it and perform terminal cleanup. Event titles, character identities, and exact historical names are not established by these bodies or numeric callback positions alone.

### shard-main__melee__gm__gmevent-014
Reviewed the six assigned subjects, not the complete translation unit. gm_801BE618 forwards its controller object to the shared stock/sequence controller. gm_801BE638 monitors HP in slots 1 and 2, advances a three-phase state, schedules presentation effects and speed changes, and handles completion or teardown. gm_801BEA10 obtains a CPU type from the selected event descriptor and applies it to player state and existing fighter entities; gm_801BEA4C and gm_801BEAF0 forward to it. gm_801BEA88 additionally assigns model scale 2.0 when its second argument is zero. Its registration explicitly casts away a callback-signature mismatch.

### shard-main__melee__gm__gmevent-015
The six assigned functions provide an event-indexed CPU-type forwarding wrapper, an integer event-state setter used by the event egg item, a selected-event byte setter/getter pair, an unchecked per-definition boolean getter consumed as a menu animation frame, and an unchecked list-index-to-event-identifier mapping. Menu confirmation stores the selected position before entering Event mode. Egg destruction and its damage-triggered countdown both write 1 to shared event state. Callback registration and the exact egg-loss scenario interpretation remain unverified in this bounded review.

### shard-main__melee__gm__gmevent-016
Reviewed the six assigned functions and relevant consumers. The accessors perform a 51-entry identifier search, retrieve the first configured player character, and expose nullable event-specific Pokémon candidate data. Event initialization establishes baseline shared state; loading retains the selected event, rebuilds participant state, and conditionally requests the versus state. Unloading is empty. Scenario-specific Pokémon attribution remains unverified.

### shard-main__melee__gm__gmevent-017
The reviewed callbacks connect persistent event selections to CSS and battle payloads. Battle entry overlays archive-backed rules and participants, restores phase-dependent settings, configures bonus behavior, and selects preload operations. Battle exit handles retry, no-contest, continuation, record updates, and conditional post-match routing. The reviewed lifecycle and dispatch code supports the broader translation-unit description without establishing complete TU coverage.

### shard-main__melee__gm__gmevent-018
The assigned parameter subjects belong to three helpers. `gm_801BA938` processes the half-open player range [lo, hi), updates character/color preload entries, optionally updates the cached stage, and requests character/stage audio resources. `gm_801BAB40` initializes a destination player record from defaults and a source record, unpacking flags and setting several fixed fields. `gm_801BAC9C` obtains match-entry data from its GameModeState argument and randomly selects a table-listed character absent from the first arg1 player records. All six assigned subjects have empty baseline fact lists; there are no fact IDs to disposition.

### shard-main__melee__gm__gmevent-019
The six assigned parameter subjects have no baseline facts to adjudicate. Current source shows that gm_801BAC9C's second argument bounds the preceding player slots checked when filtering character candidates; its caller supplies player_idx. The HSD_GObj pointer in gm_801BC4F4 is passed to HSD_GObjPLink_80390228. gm_801BC754, gm_801BC9E8, and gm_801BCAF0 forward their object pointer to gm_801BC4F4 on their completion conditions and to HSD_GObjPLink_80390228 on failure paths. gm_801BC670 does not use its object argument and instead updates shared event state and requests a transition. This review covers only the assigned subjects, not the entire translation unit.

### shard-main__melee__gm__gmevent-020
The six assigned parameter subjects have no baseline facts. Their current function bodies take an HSD_GObj pointer and forward it without dereferencing it: gm_801BCF20 delegates directly to gm_801BCC9C; the other bodies pass the pointer to common event helpers or HSD_GObjPLink_80390228 on stock-, timer-, or event-state-dependent branches. This review is limited to the assigned subjects, not the entire translation unit.

### shard-main__melee__gm__gmevent-021
The six assigned parameter subjects have no baseline facts. Their current function definitions each take an `HSD_GObj* gobj`. `gm_801BD44C` and `gm_801BDAD4` forward that argument to `gm_801BCC9C`. The other four functions pass it to `gm_801BC4F4` or `HSD_GObjPLink_80390228` on branches controlled by player stocks, entity status, and timer state. This review is limited to the assigned subjects, not the entire translation unit.

### shard-main__melee__gm__gmevent-022
The six assigned parameter subjects have no baseline facts. Their current function definitions each take one `HSD_GObj*` parameter. Five functions forward that pointer to branch-dependent helper calls, including `HSD_GObjPLink_80390228`; `gm_801BE37C` simply forwards it to `gm_801BCC9C`. The surrounding branches evaluate event flags, stock counts, timer conditions, or sequential player initialization. No gameplay identity or compiled-layout claim is established here.

### shard-main__melee__gm__gmevent-023
The assigned subjects have no baseline facts. In the corresponding canonical bodies, gm_801BE618 forwards its object argument to gm_801BCC9C. gm_801BE638 passes its object to completion or unlink handling while updating shared state based on remaining HP, stocks, and timer conditions. gm_801BEA10 passes its integer argument to Player_SetPlayerAndEntityCpuType with a configuration-derived value; gm_801BEA4C forwards that argument unchanged. gm_801BEA88 additionally calls Player_SetModelScale with 2.0 when its second argument is zero. This review is limited to the assigned subjects, not the entire translation unit.

### shard-main__melee__gm__gmevent-024
The six assigned parameter subjects have no baseline facts to adjudicate. Canonical bodies show that gm_801BEAF0 and gm_801BEB2C forward their integer argument unchanged to gm_801BEA10, which passes it to Player_SetPlayerAndEntityCpuType. gm_801BEB68 stores its integer argument in vs.unk_530.x18; gm_801BEB74 stores its u8 argument in vs.unk_530.unk_535. gm_801BEB8C uses its u8 argument to index (*gm_804D6900) and returns x8->x1_0. gm_801BEBA8 uses its u8 argument to index gm_803DF918. This review is limited to the assigned subjects, not the entire translation unit.

### shard-main__melee__gm__gmevent-025
This bounded shard contains six parameter subjects, each with an empty baseline facts array. There are no assigned baseline fact IDs to retain, supersede, reject, or mark unresolved. No new semantic claims or proposals are made; this result does not claim function-body or complete translation-unit coverage.

### shard-main__melee__gm__gmevent-026
The reviewed links cover Event Match resource preparation, round progression, objective checks, CPU configuration, participant scaling, and event-index lookup. Current code supports these function-level relationships. The association of the compiled `.sbss` section with the archive root remains unverified. This review is bounded to the assigned links, not the entire translation unit.

### shard-main__melee__gm__gmevent-027
Reviewed the assigned links against current canonical function bodies. The code loads event initialization data, copies participant configuration, applies event-selected CPU control, checks stock and timer conditions, and routes completion or intermediate transitions through shared event state. Named-event mappings remain deferred where the inspected code establishes mechanics but not the scenario's identity. This is bounded link review, not complete TU coverage.

### shard-main__melee__gm__gmevent-028
The reviewed Event Match code transfers CSS selections into EventData, initializes selected-event runtime callbacks, evaluates stock and timer conditions, computes completion record candidates, and requests match termination. Scenario-specific callbacks share the completion helper. Named Event 9 and Event 49 mappings require evidence beyond callback-table indices. This review covers only the assigned links, not the complete translation unit.

### shard-main__melee__gm__gmevent-029
The reviewed links connect Event Match initialization, character selection, scenario-specific runtime callbacks, sequential opponents, objective completion, menu identifier conversion, and challenger transitions. The winner helper invokes the shared standings pipeline. The egg callback directly spawns the event egg at a scenario-provided position. The two-HP-opponent callback is verified, but its exact named Event 50 mapping remains deferred. This review covers only the assigned links, not the entire translation unit.

### shard-main__melee__gm__gmevent-030
The reviewed code connects event selection to archive-backed configuration and per-event callbacks, prepares character selection, applies CPU configuration, and evaluates completion, failure, and candidate records. Specific event titles and compiled section ownership are not established by these source reads. Coverage is limited to the assigned links and supporting source.

### shard-main__melee__gm__gmevent-031
Reviewed the assigned links against current source. Event setup copies archive-defined rules and participants, installs a runtime initializer, and exposes configured character and auxiliary data. Runtime callbacks check stocks, coins and timer state, advance table-driven opponent phases, and request match termination. Specific event numbering, compiled section ownership and the downstream outcome conversion remain deferred; this is not complete TU coverage.

### shard-main__melee__gm__gmevent-032
The reviewed functions load event scenario data, configure battle rules and participants, prepare preload state, dispatch objective callbacks, and process results or continuation. Objective completion records event success and requests shared match termination. The reviewed specialized callbacks check coin thresholds, stock-dependent conditions, and sequential-opponent progression. Specific published scenario names are not established by callback indices alone.

### shard-main__melee__gm__gmevent-033
Reviewed the assigned links against current Event Match source. The code supports selected-entry access, event initialization, phase-dependent runtime preparation, continuation-state capture, CPU-type delegation, and outcome-dependent scene transitions. Specific named-event mappings and the central termination-consumer relationship remain deferred where the inspected code does not independently establish them. This is bounded link review, not complete TU coverage.

### shard-main__melee__gm__gmevent-034
The reviewed links cover Event mode scene transitions, authored participant selection, runtime objective callbacks, menu detail animation, and improved-record persistence. Current code supports these general relationships. The specific Target Acquired mapping remains unverified; this review does not claim complete translation-unit coverage.

Status: researched; no-change lead bypass; independent review and live promotion pending.
