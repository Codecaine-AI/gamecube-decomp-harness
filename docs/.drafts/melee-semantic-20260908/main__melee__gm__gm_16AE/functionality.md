# Disjoint Librarian Research

### shard-main__melee__gm__gm_16AE-000
Reviewed canonical and rendered `src/melee/gm/gm_16AE.c` lines 1–480 only.

- Exposes the shared `lbl_8046B6A0` object, its embedded rules, and numerous rule/state fields. Predicates test team configuration, single-player state, timer configuration, numeric rule values, and per-fighter flags.
- Provides frame/timer accessors. `GetMatchTimer` writes only when its output pointer is non-null and the timer is enabled; it returns either `time_limit - timer_seconds` or `timer_seconds` according to `timer_counts_up`. Another accessor scales `unk_2C` by 99/59 and optionally complements the result against 99.
- Converts a supplied or configured game speed to ticks using a 1/(60 × speed) interval. Mutators request match termination, store several direct or incremented arguments, and update a fighter-specific field.
- Implements explicit current-mode membership tests and counts the six player slots whose type is not `Gm_PKind_NA`. Two float helpers select constants from mode membership, slot count, and—in one helper—match state/result.
- Tests rule-dependent ground query results; updates two fields through `lbTime` helpers; returns the embedded `x24C` object; and sets `hud_enabled` before calling a stadium routine. The assigned range ends inside `fn_8016B7B4`, after its initial ground call and conditional stadium call.

### shard-main__melee__gm__gm_16AE-001
Reviewed canonical and rendered lines 481–960 of `src/melee/gm/gm_16AE.c`, with limited continuation reading for the boundary accessor; this is not complete TU coverage.

- Coordinates stage/status calls, clears `hud_enabled`, and updates per-player match fields before notifying the stadium subsystem.
- Implements team stock transfer in versus matches: an eligible zero-stock player requests a stock using Start, or Up-trigger plus held X at debug-ROM level. The first other qualifying teammate with more than one stock is selected; a successful helper check precedes decrementing the donor and incrementing the recipient.
- Tests error-free master controllers for Start/Z triggers. Pause selection instead uses copied controller state, with mode-dependent player eligibility; camera-mode selection additionally permits controller index 3 without a matching occupied player slot.
- Computes individual and team elimination outcomes from stock counts under explicit rule gates. Overall outcome precedence is stored result, explicit termination, suppression flag, timer expiration, individual/team outcome, then the ground predicate.
- Dispatches a gated callback for Classic, Adventure, or All-Star. Populates two per-player arrays across 257 indices, calculating the second value only when the first is nonzero.
- The accessor beginning at line 956 refreshes cached data when its token differs, then selects either a player field or a team-indexed field according to `is_teams`.

### shard-main__melee__gm__gm_16AE-002
Reviewed canonical and rendered gm_16AE.c lines 961–1440 only.

- Cached result accessors refresh through gm_80166378 when their stored token differs from gm_801A4BA8, then return indexed fields. The opening fragment selects an individual or team field according to is_teams; fighter wrappers obtain their index through ftLib_80086BE0.
- fn_8016C7F0 invokes the optional match-end callback, resets rumble, calls audio cleanup routines, frees the countdown, and performs mode-dependent result-field updates and feedback calls. Its target-test/classic branch compares a retrieved value with frame_count when Ground_801C1DE4 returns zero in its first output.
- Pause entry requires an expired unpause timer, enabled HUD, and permission to pause. It obtains a pauser through an override or default check, configures optional pause behavior and camera callbacks, pauses rumble, records the controller, and sets a ten-tick pause timer. Unpause requires the first qualifying controller to equal that recorded controller and sets a ten-tick unpause timer. Input is newly pressed Start normally, or newly pressed D-pad Up while holding X at debug-ROM level.
- fn_8016CD98 conditionally advances match/timer fields, uses a 60-update divider for seconds, emits countdown audio calls, and decrements four per-fighter counters with audio calls at 0x50 and zero. The canonical comparisons against -1 are preserved without assuming field signedness.
- fn_8016CF4C stores a requested outcome and runs match finalization, selecting a separate debug/non-retry transition. fn_8016CFE0 coordinates six respawn countdowns, pause/unpause, gated no-contest and retry inputs, outcome polling, and either end-state setup or timer updates. The final assigned fragment begins the training frame routine and shows reuse of the countdown helper and unpause handling with argument 2.

### shard-main__melee__gm__gm_16AE-003
Reviewed canonical and rendered gm_16AE.c lines 1441–1920 only. This range contains delayed match-result processing and a four-state per-frame dispatcher bracketed by optional callbacks; initialization of player settings and match rules/timers; spawn-point and initial-facing helpers; and a routine that collects distinct Kirby costume IDs and passes each to a helper for qualifying per-player values. Player initialization preserves the requested character separately, conditionally swaps CKIND_ZELDA and CKIND_SEAK for human slots holding A, and transfers configuration into player setters and FighterMatchInfo. Match initialization clears a fixed byte range, copies rules, selects timer initial values, and initializes either all six slots or slot zero with the remaining slots marked unavailable. The final portion begins player-placement/setup orchestration; its body continues beyond this shard.

### shard-main__melee__gm__gm_16AE-004
Reviewed canonical and rendered src/melee/gm/gm_16AE.c lines 1921–2280 only.

- The opening fragment sets player facing and passes spawn coordinates to player setup calls. fn_8016E5C0 returns a nonzero rules.xA override; otherwise it requires at least one human slot and L or R held for every human slot across six slots.
- fn_8016E730 coordinates match initialization, including a game-speed-dependent timing argument, camera and subsystem calls, stage/player setup, optional callbacks, process registration, and a rule-gated call to Stage_80225074 with the input predicate. VS, sudden-death, and training entry points share this initializer but select different status arguments and additional setup; sudden death first sets rules.x6.
- VS exit exports match state. When match_over is zero it adds team/result fields, invokes result-processing helpers, skips fn_8016C4F4 for no-contest/retry, and sets match_over. It also exports a conditional value, elapsed timer field, and ground-query result. Under a mode predicate and non-aborted outcome, it passes each human character's converted selection kind to gmMainLib_8015D00C.
- gm_8016ECE8 averages remaining-HP/other-stamina ratios for slots matching CKIND_MASTERH or CKIND_CREZYH, returning zero when none match. gm_8016EDDC conditionally initializes an unused, entity-free slot outside single-player; fn_8016EF98 conditionally performs removal calls and marks a slot unavailable outside single-player.
- Remaining helpers forward calls, initialize rule/player defaults, resolve a zero/default versus one-based controller-slot field, and load rumble preferences only for human players whose array index is below PAD_MAX_CONTROLLERS; all other rumble flags are cleared.

### shard-main__melee__gm__gm_16AE-005
Reviewed canonical and rendered `src/melee/gm/gm_16AE.h`, lines 1–120, the entire assigned range. This declaration-only header exposes typed entry points for shared game-state/rules pointers, scalar queries and setters, controller/pause interfaces, match outcomes, scene callbacks, and routines accepting player or match initialization data. It declares three outcome functions returning `MatchOutcome`, pause/unpause routines accepting a state pointer and integer, and scene entry/exit callbacks accepting `void*`. Many declarations retain address-based names or opaque types. These declarations establish source-level interfaces, not implementation behavior, gameplay mappings, or compiled layouts; this review does not claim complete TU coverage.

### shard-main__melee__gm__gm_16AE-006
### Assigned static declarations
Reviewed canonical and rendered `src/melee/gm/gm_16AE.static.h` lines 1–25. This guarded header defines two internal-linkage, mutable structs containing four and six `u32` fields. `lbl_803D5620` is initialized with `0x7C859` through `0x7C85C`; `lbl_803D5630` is initialized with `-1`, `0x7C858`, `0x7C862`, `0x7C85F`, `0x7C854`, and `0x7C853`. It also defines the static object `lbl_8046B6A0` using the externally declared type `lbl_8046B6A0_t`, with no explicit initializer. No executable function bodies occur in this assigned range. The declarations alone do not establish the constants’ gameplay meaning or the object's runtime role.

### shard-main__melee__gm__gm_16AE-007
The assigned `gm_16AE.dox` lines 1–39 document and declare the paired pause/unpause routines. Their implementations confirm cooldown, HUD-enabled, and disable-pausing gates. A successful pause records the pauser and sets `pause_timer` to 10; successful unpause requires the detected controller ID to equal the stored pauser and sets `unpause_timer` to 10. Camera/override actions are conditional on `x4_0`. The pause callback receives a human-player slot resolved from the controller ID, whereas the unpause callback receives the controller ID directly. This review covers the assigned documentation range, not the complete TU.

### shard-main__melee__gm__gm_16AE-008-retry180539
The assigned subjects expose and maintain shared live-match rules and state, including timing, pause ownership, fighter countdowns and outcome selection. Two initialized aggregates supply countdown audio IDs. GetMatchTimer conditionally writes a direction-dependent whole-second value; fn_8016AE60 forwards an opaque accessor result; fn_8016B138 unconditionally disables team rules. Source-level behavior is supported, but compiled-section layout and literal-pool attribution remain deferred. This review covers only the assigned subjects, not the entire translation unit.

### shard-main__melee__gm__gm_16AE-009
Reviewed the six assigned subjects and their 28 baseline facts. These routines store per-slot damage used by the training menu, evaluate two rule-gated stage predicates, select a mode/outcome/roster-dependent joystick-count multiplier for match-end standings, and read or saturating-adjust a live-match byte copied into the result snapshot. Stage-condition gameplay meanings and the byte counter's player-facing meaning remain unspecified. This is bounded subject coverage, not complete TU coverage.

### shard-main__melee__gm__gm_16AE-010-retry180539
Reviewed the six assigned subjects. The presentation callbacks coordinate the shared HUD flag, guarded Stadium display requests, and nametag visibility controls. Scene entry chains status callbacks through a startup continuation; status mode 8 dispatches immediately rather than creating an element. The stock-sharing routine scans eligible zero-stock requesters and transfers one stock from the first qualifying teammate. The result dispatcher forwards an integer-carried match-record address to one of three explicitly named game-mode handlers when its processing gate is set. Stadium requests can be remapped internally, and nametag startup here clears visibility overrides rather than constructing the interface.

### shard-main__melee__gm__gm_16AE-011-retry160717
Reviewed the six assigned subjects and their 34 baseline facts. The code materializes per-player decision quantities and scores, maintains sticky best/worst standings flags through a callback adapter, performs shared match-end cleanup, updates match and fighter timers, commits pause-selected outcomes, and coordinates the active versus-match frame lifecycle. Persistence interpretations, the Bonus Records connection, and some delegated effects remain explicitly deferred. This is bounded subject coverage, not complete TU coverage.

### shard-main__melee__gm__gm_16AE-012
Reviewed the six assigned functions and their relevant initialization, dispatch, and resource-consumer paths. They compute conditional post-match bonus eligibility, advance delayed match finalization, install player and match-start configuration, initialize unset team-aware facing directions, and enumerate roster/costume combinations for Kirby resource loading. Numeric selectors and unverified mapping-layout interpretations remain opaque. This is bounded subject coverage, not complete TU coverage.

### shard-main__melee__gm__gm_16AE-013-retry180539
Reviewed the six assigned functions and their relevant source dependencies. They prepare participant positions and fighter objects, derive a stage-music selector from a rule override or human-controller input, coordinate common match startup, deactivate occupied multiplayer slots, initialize match-start defaults, and record indexed result flags in save data. Corrections distinguish the explicit music-override return from the boolean input-scan fallback, use the current startup callback field, and avoid claiming that a save-data mutation itself guarantees permanent storage.

### shard-main__melee__gm__gm_16AE-014-retry180539
Reviewed the six assigned accessors. Two return the same mutable static match-state object; three expose item frequency, weighting, and eligibility settings used by random-item initialization; one forwards player and bonus indices to the player bonus-value accessor. Item initialization independently checks frequency, mask, stage data, and usable weights before registering its process. This review does not establish complete translation-unit coverage.

### shard-main__melee__gm__gm_16AE-015-retry180539
Reviewed the six assigned functions and relevant producers/consumers, not the complete translation unit. The rules accessors expose a prioritized Pokémon-selection override and signed SD-penalty setting. Three timer queries expose whole seconds, raw subsecond frames, and direction-adjusted hundredths used by timer rendering and countdown presentation. The remaining predicate combines a rules bit, a global-state exclusion, and a zero-state scan of player slots 1–5. Timer progression is gated and count-up seconds saturate.

### shard-main__melee__gm__gm_16AE-016-retry180539
The six assigned functions are read-only Boolean queries over active match rules. Their consumers implement stock-loss eligibility, coin effects, same-team interaction eligibility, restricted C-stick input, and timer-direction presentation. The timer updater reads the direction field directly rather than calling its getter. This review covers only the assigned subjects and supporting source.

### shard-main__melee__gm__gm_16AE-017-retry180539
The six assigned functions are read-only Boolean queries over shared match state. They expose an interface-audio suppression bit, exact false/true tests of the teams byte, an exact true test of the single-player byte, an x9 == 1 predicate, and a bit suppressing grab and fighter-collision processing. The teams tests are not complements for noncanonical byte values. Review is limited to these subjects and the supporting source read here.

### shard-main__melee__gm__gm_16AE-018-retry180539
Reviewed the six assigned accessors and relevant consumers, not the whole translation unit. They expose an unnamed rules flag, the phase-zero lifecycle predicate, a timer-configuration predicate, a stage/interface rules flag, a floating-point knockback input, and an indexed fighter flag used by overhead markers. The timer predicate now reads `timer_enabled`, not `x0_6`. Lifecycle and nametag behavior remain supported; some layout, Garden-object, and Damage Ratio interpretations require additional evidence.

### shard-main__melee__gm__gm_16AE-019-retry180539
Reviewed the six assigned subjects. Five routines update shared live-match state: one requests termination, three store caller values plus one, and one copies a signed-byte argument into an unsigned-byte field. The termination flag is evaluated after a sticky result but before ordinary outcome checks. Event failure callbacks configure these fields before requesting termination. The sixth routine tests the current mode against GM_SUPER_SUDDEN_DEATH_VS; stage audio selection consumes its boolean result. This review does not establish complete TU coverage.

### shard-main__melee__gm__gm_16AE-020-retry180539
Reviewed the six assigned subjects. They implement two current-mode membership predicates, a six-slot non-NA counter, a slot-zero-only saturating subtotal adjustment, mutable access to the embedded x24C record, and final-stock defeat bookkeeping with a Stadium display notification. The camera consumer scales quake offsets, not controller input. Player-facing mode and enemy-route mappings remain partly unverified; this review does not claim complete TU coverage.

### shard-main__melee__gm__gm_16AE-021-retry180539
Reviewed the six assigned subjects. Four functions expose lazily refreshed player/team standings, player scores, and fighter-associated opponent-KO totals. The fighter standing wrapper extracts the player ID before delegating. The Hand-health query averages remaining-HP/stamina ratios over six slots filtered by character kind, returning zero when none qualify; stage logic uses descending thresholds. The spawn function accepts only an inactive, entity-free multiplayer slot, initializes its properties, resolves its spawn position and facing, and updates associated systems. This is bounded subject coverage, not complete TU coverage.

### shard-main__melee__gm__gm_16AE-022-retry180539
Reviewed the six assigned subjects. They provide primary-subcharacter respawn delegation, a saved-bonus-bit query used by list filtering, read-only any-controller Start/Z trigger predicates, and two controller-priority pause selectors. The default selector applies participant eligibility or a slot-0 restriction; the camera selector permits controller index 3 without player association. Debug-ROM pause gestures replace Start with triggered D-pad Up plus held X. Specific Event 9 and DEVELOP frame-advance mappings remain unverified.

### shard-main__melee__gm__gm_16AE-023-retry180539
Reviewed the six assigned subjects. Pause and unpause routines enforce eligibility and controller ownership, dispatch configured effects, and establish reciprocal cooldowns. Outcome queries prioritize stored results, termination, suppression, timers, battle evaluators, and a ground completion predicate. The frame accessor exposes the guarded match-update counter, which player bookkeeping can latch; the rules accessor returns mutable shared storage. This review does not establish complete TU coverage.

### shard-main__melee__gm__gm_16AE-024-retry180539
Reviewed the six assigned functions. They expose the configured stage, aggregate team stocks into match outcomes, classify the current mode through a delegated predicate, populate participant rumble flags, reapply configured timing, and perform an ordered scene-entry initialization sequence. Current source corrects two stale identifiers. Broader gameplay and presentation claims not established by the inspected bodies are explicitly deferred; this is not complete TU coverage.

### shard-main__melee__gm__gm_16AE-025
Reviewed the six assigned subjects. Training entry extends common match initialization with specialized subsystem setup; its frame callback manages pause timers and exits on a non-none outcome. VS entry configures status and rule-dependent timers, its frame dispatcher advances through active processing, delayed finalization, completion polling and exit, and its exit callback exports results and conditionally records human-character participation. The speed setter forwards an inverse-speed 60 Hz duration in OS ticks.

### shard-main__melee__gm__gm_16AE-026
The reviewed match-management code exposes the shared live-match record and embedded rules, controls frame timing and termination, and maintains fighter state. Pause/unpause routines enforce reciprocal ten-update lockouts and pauser ownership. Outcome checks preserve an existing result, honor forced termination, then conditionally evaluate timeout, player/team stock elimination, and a ground-completion predicate. Frame processing advances timers and fighter countdowns and transitions into post-match processing. This review covers the assigned baseline facts, not the entire translation unit.

### shard-main__melee__gm__gm_16AE-027
The assigned bundle contains six parameter subjects, each with an empty baseline facts array. There are therefore no baseline fact IDs to retain, supersede, reject, or mark unresolved. No new parameter semantics or compiled-layout claims are proposed. This result covers only the bounded baseline-fact audit, not complete translation-unit coverage.

### shard-main__melee__gm__gm_16AE-028-retry180539
The six assigned parameter subjects have no baseline facts to disposition. Canonical bodies show a match-outcome argument stored in global match state; a player index and PlayerInitData pointer used to initialize player state; and StartMeleeData inputs used for match-state initialization, an override/controller-button predicate, and scene setup. No compiled register-to-parameter identity or additional gameplay meaning is asserted.

### shard-main__melee__gm__gm_16AE-029
The assigned parameters cover a conditional player-slot operation, initialization of rules and six player records through default-setting helpers, integer arguments forwarded unchanged by two wrappers, and an index used to retrieve FighterMatchInfo.x4_b3. All six assigned subjects have empty baseline fact lists; there are no baseline facts to retain, supersede, reject, or mark unresolved.

### shard-main__melee__gm__gm_16AE-030
The assigned subjects have no baseline facts. Canonical bodies show that gm_8016B33C, gm_8016B350, and gm_8016B364 store their integer argument plus one into shared-state fields unk_B, unk_10, and unk_14 respectively. gm_8016B378 directly stores its s8 argument into unk_18. gm_8016B6E8 updates unk_2E through lbTime_8000AF24 only when its first argument is zero, passing its second argument to that helper. These observations do not establish gameplay meanings or compiled register mappings.

### shard-main__melee__gm__gm_16AE-031
The six assigned parameter subjects have no baseline facts to disposition. In the current source, gm_8016B8D4 uses its first argument to index FighterMatchInfo and its second argument as the stored slot_type, forwarding both to grStadium_801D3B4C. gm_8016C5C0 and gm_8016C658 take integer record indices and refresh shared cached data when its identity differs from gm_801A4BA8(); the former selects a per-record or team-indexed value, while the latter returns x2C. gm_8016C6C0 and gm_8016C75C accept HSD_GObj pointers and pass them through ftLib_80086BE0 before indexed access. This review covers only the bounded subjects, not the entire translation unit.

### shard-main__melee__gm__gm_16AE-032
The bundle assigns six parameter subjects, all with empty baseline fact lists; there are no baseline facts to retain, reject, or revise. The inspected scene-entry bodies consume StartMeleeData, while the scene-exit body writes EndMeleeData. gm_8016EDDC takes an integer player-slot argument and a PlayerInitData pointer, forwarding both to initialization only when single-player is disabled, the slot is unavailable, and no player entity exists; it returns whether that guarded initialization ran. Historical scene-symbol identities are not assumed equivalent to current canonical names.

### shard-main__melee__gm__gm_16AE-033
The six assigned parameter subjects contain no baseline facts, so there are no fact dispositions or proposed changes. Canonical bodies show two integer-forwarding wrappers, a StartMeleeData rumble-setting routine, and pause/unpause routines that inspect and update the supplied match-state object. The pause routine forwards its second argument, cast to s64, to gm_801A4634. This review covers only the bounded subjects, not the entire translation unit.

### shard-main__melee__gm__gm_16AE-034
The complete bundle assigns six parameter subjects, each with an empty baseline facts array. There are no baseline fact IDs to retain, supersede, reject, or mark unresolved. No parameter semantics or compiled register mappings are proposed, and no complete translation-unit coverage is claimed.

### shard-main__melee__gm__gm_16AE-035
The assigned subject has no baseline facts. Canonical `gm_SetGameSpeed` takes a single `float speed`, computes `OSSecondsToTicks(1 / 60.0F / speed)`, and passes the result to `lb_80019880`. Its body performs no explicit input validation or persistent speed-field update. The neighboring reset function instead obtains the divisor from `lbl_8046B6A0.x24C8.game_speed`.

### shard-main__melee__gm__gm_16AE-036
Reviewed the 12 assigned links against current canonical source. The examined code supports match-rule predicates, timer access, match/HUD initialization, spawn-position selection, the human Zelda/Sheik A-button starting-form swap, bonus-menu filtering, Pokémon selection control, and free-for-all outcome evaluation. The compiled-section attribution and event-specific respawn mapping remain unresolved. This is bounded link review, not complete TU coverage.

### shard-main__melee__gm__gm_16AE-037
Reviewed the twelve assigned links against current canonical bodies. The reviewed code exposes and initializes match rules, controls the HUD latch, transfers teammate stocks on qualified input, selects a pausing controller, updates the match timer, and packages match outcomes. The Adventure-route mapping remains unverified; this is not complete TU coverage.

### shard-main__melee__gm__gm_16AE-038
Reviewed the twelve assigned links against current canonical excerpts. The code exposes rule predicates, copies player spawn configuration, restores the match camera on unpause, classifies match outcomes, and advances end-of-match phases. Bonus-entry semantics and the historical training damage caller remain deferred; this is not full translation-unit coverage.

### shard-main__melee__gm__gm_16AE-039
Reviewed the 12 assigned concept links against current canonical code. The functions expose match timer/rule state, classify mode sets, select pause controllers and perform unpause transitions, initialize player facing and match subsystems, supply item-selection masks, delegate fighter respawning, and aggregate hand-character HP fractions. This review covers only the assigned links, not the entire translation unit.

### shard-main__melee__gm__gm_16AE-040
Reviewed the twelve assigned links against accessible canonical source. The code exposes rule predicates, counts participating slots, aggregates team stocks, initializes facing directions, configures scene interfaces, and converts game speed to a timer interval. Pause ownership/lockouts and countdown audio consumption are supported at source level; their association with compiled section targets remains unverified. Cross-file Sing behavior could not be independently read.

### shard-main__melee__gm__gm_16AE-041
Reviewed the twelve assigned concept links against current canonical bodies and selected consumers. The supported relationships cover match startup and finalization, results handoff, team stock transfer and elimination, stock-loss gating, Single-Button Mode, and Hand-health-driven stage presentation. Several accessor and display mappings require additional evidence; this review does not establish complete TU coverage.

### shard-main__melee__gm__gm_16AE-042
Reviewed the twelve assigned links, not the complete translation unit. Current source supports match-rule and timer access, pause entry, player-slot initialization, statistics scaling, numeric score display, nametag visibility, and normalized Hand health aggregation. Bonus Records persistence and the compiled .sdata2 attribution remain unverified.

### shard-main__melee__gm__gm_16AE-043
Reviewed the twelve assigned links against current canonical source. The inspected paths classify the current mode, request termination, maintain match-end state, coordinate pausing and rumble, forward participant categories, accumulate enemy-related awards, and derive a stage initialization selector. Compiled-section attribution and several cross-unit semantic details remain deferred; this is not complete TU coverage.

### shard-main__melee__gm__gm_16AE-044
Reviewed the 12 assigned concept links against current canonical code. The examined functions initialize and expose match rules, select pausing controllers, dispatch pause-camera setup, expose timer seconds and a knockback multiplier, update final-stock records, and deactivate player slots. Numeric rule values and proposed names were not treated as independent gameplay evidence. This review does not establish complete translation-unit coverage.

### shard-main__melee__gm__gm_16AE-045
Reviewed the twelve assigned links against current canonical source. The inspected routines expose match timing and classification, resolve stock-based and forced outcomes, coordinate HUD state, initialize player descriptors and character selection, and orchestrate match startup and finalization. This review covers only the assigned links, not the complete translation unit.

### shard-main__melee__gm__gm_16AE-046
The reviewed links cover shared match-rule access, timer initialization and HUD integration, priority-ordered outcome resolution, pause transitions, and the versus post-match dispatcher. Current code supports all twelve assigned relationships. This review is limited to these links and their supporting source, not the complete translation unit.

### shard-main__melee__gm__gm_16AE-047
Reviewed the twelve assigned links, not the complete translation unit. Current source supports rule accessors for team interactions and timers, debug-speed restoration, campaign-mode classification, HUD enabling, and teammate stock transfer. Three links require additional evidence for compiled data identity or deeper gameplay semantics.

### shard-main__melee__gm__gm_16AE-048
Reviewed the seven assigned concept links. Current code initializes player participation, resolves per-slot spawn selectors, clears team mode, and supplies a scalar to item-pick table construction. The rules object is embedded in global match state, but its association with the compiled `.bss` target remains unverified. Bonus-tracking and Damage Ratio mappings require relocated caller evidence.

Status: researched; no-change lead bypass; independent review and live promotion pending.
