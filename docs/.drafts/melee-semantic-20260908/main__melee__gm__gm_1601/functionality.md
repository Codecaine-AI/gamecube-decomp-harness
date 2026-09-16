# Disjoint Librarian Research

### shard-main__melee__gm__gm_1601-000-retry180539
Reviewed canonical and rendered src/melee/gm/gm_1601.c lines 1–480, with supporting continuation through line 488 to finish the boundary function; this is not complete TU coverage.

- Defines Japanese and US character-name arrays, sparse Fox/Samus name arrays, a numeric pair table, and a playable-character-sized table containing ncolors and three other byte fields.
- Defines character-keyed GmRstM*.dat path entries and numeric theme entries, each ending in an explicit sentinel.
- gm_801601C4 and gm_80160244 convert a signed byte into complementary integer control values using floating-point arithmetic. The former stays at 127 for nonpositive input and decreases for positive input; the latter stays at 127 for nonnegative input and decreases for negative input. Neither clamps the input to −100…100.
- gm_801602C0 computes both values and passes them to two distinct audio functions. gm_801603B0 obtains its input from gmMainLib_8015ED74 and applies the same conversions through forwarding wrappers.
- fn_80160400 scans the theme table for a matching character key, returning theme_id on success or unsigned −1 when traversal reaches the sentinel.

### shard-main__melee__gm__gm_1601-001-retry180539
Reviewed canonical and rendered gm_1601.c lines 481–960, with additional reads through the end of fn_80161154 for boundary context; this is not complete TU coverage.

- Implements character-keyed path lookup, mode-dependent table selection, and two accessors returning offsets +4 and +0x24 into Toy_8030813C's result.
- Provides unlock-table conversions among selectable characters, unlock indices, notification IDs, and stage kinds, with explicit not-found values; two additional helpers map columns of lbl_803B790C.
- Clamps an input to 4, computes a color index from team/slot/human status, and retrieves a GXColor using an index narrowed to u8.
- Selects localized character names, supports optional alternate names with fallback, and handles the Zelda/Sheik player-name branch using Player_80036394. Text helpers choose corresponding horizontal scale factors and enable default kerning for the saved US language branch.
- Computes the maximum is_big_loser field among eligible team or player standings. fn_80161154 selects candidates matching that maximum; its continuation breaks ties by minimum unsigned x20, maximum unsigned x24, minimum x44, maximum x50, then first remaining slot.

### shard-main__melee__gm__gm_1601-002-retry180539
Reviewed canonical and rendered lines 961–1440 of `src/melee/gm/gm_1601.c`, not the entire TU.

- The opening selector tail progressively filters four candidates by minimum unsigned `x20`, maximum unsigned `x24`, minimum `x44`, then maximum `x50`; remaining ties choose the first marked slot.
- `fn_80161C90` updates a shared statistics block from one match participant: self-destruct accumulation, several field accumulations, an `x4C` maximum, participation and selector-dependent counters, elapsed `frame_count / 60`, and a count of slots whose type is not 3. Three additional fields update only for `match_kind == 2`. It also adds `x50` to an external aggregate.
- `fn_80162068` accumulates opponent-character KO counts into persistent fighter records. `fn_80162170` accumulates opponent-name KO counts and per-character play time into persistent name records, excluding name index `0x78`. Both invoke the shared statistics updater; `gm_801623A4` invokes both record passes.
- `gm_801623D8`, `gm_801623FC`, and `gm_8016247C` read, set, and add to accessor-backed counters. The current value is capped at 9999; the setter compares the uncapped unsigned input against two other counters before applying that cap.
- `gm_80162574` increments two character-indexed 16-bit counters with saturation, except for argument values 7 and 8. `gm_SetupHumanResultsScreen` updates reset or mode-selected match counters and additional aggregates; its body performs accounting rather than visible screen construction. `gm_GetVsPlayMatchTotal` sums the five mode-specific match totals.

### shard-main__melee__gm__gm_1601-003-retry180539
Reviewed canonical and rendered gm_1601.c lines 1441–1920, with boundary context through 1932; this is not whole-TU coverage.

- Updates persistent counters: counts human standings, adds elapsed and participant-weighted time, updates damage/self-destruct/power counters, and distributes a KO increment across three records. Several expressions resemble saturation but compare an unsigned value against UINT32_MAX, so they do not provide effective overflow clamping.
- Implements indexed record getters, strictly-increasing record updates after character-kind-to-selection-kind conversion, and totals across indices 0–24. Three parallel record families also provide any/all predicate reductions and minimum-byte reductions initialized to 4. Mode-specific rendered names remain hypotheses.
- Updates two indexed records independently in gm_80163298; its return value reports improvement of the u16 record, not necessarily improvement of the auxiliary x114 entry.
- Exposes predicate-gated scalar records and time formatting. gm_8016332C and gm_80163690 return a record when their respective predicate is false, otherwise -1. Their formatting counterparts write only when the predicate is true. Formatting decomposes a 60-unit-per-second count into byte-sized hours, minutes, seconds, and a fractional display value computed as 99 × remainder / 59. gm_801634D4 requires all 25 predicates before writing any output and returns false immediately on a missing predicate.

### shard-main__melee__gm__gm_1601-004-retry180539
### Bounded review: gm_1601.c lines 1921–2400
- Record helpers conditionally format frame counts into hours, minutes, seconds, and a fractional byte using `99 * remainder / 59`. Two aggregate helpers require all 25 entries to pass their respective predicates before writing any outputs. Other helpers test whether any entry passes, return an individual stored score, or sum 25 scores.
- Selection-kind conversions and several scalar getters directly index tables. A separate helper counts successful predicate results below a caller-supplied bound.
- Item-switch logic tests individual bits and remaps 32 source bits into a caller-owned mask, skipping mapping value `0x23` and preserving unrelated destination bits.
- Stage-switch helpers set/test bits and detect whether at most one of the first 29 bits is enabled. Random-stage eligibility first checks stage availability; when the additional switch gate is active, it returns the requested mask bit and reports an all-off mask without repairing it.
- Stage availability uses a table to map converted stage IDs to unlock bits, treating entries absent from that table as available. Unlocking a mapped stage calls `gmMainLib_8015D818` with its table-derived value before setting its bit. Bulk operations test all required bits, set the low 11 bits, or clear the entire mask.
- A sentinel-terminated lookup normalizes input `0x20` to `0xE` and returns `0x148` if unmatched. Character availability maps character kind through selection kind to an unlock index; the corresponding unlock routine selects a notification value, calls `gmMainLib_8015D818`, and sets the bit.

### shard-main__melee__gm__gm_1601-005-retry180539
### Assigned source: gm_1601.c, lines 2401–2880
- Character-unlock helpers clear an individual mapped bit, test all unlockable bits, test a specific six-character subset, set all unlockable bits, or clear the mask. A separate predicate requires nonzero results from `gmMainLib_8015D94C` for indices 0–27 except 26.
- Camera wrappers enable the match camera, conditionally dispatch player-camera setup for human/CPU slots with an entity, or forward fixed arguments and camera-mode requests. The pause-camera wrapper has a special `playerSlot == -1` path.
- A display callback formats two linked text lines from VI performance state and `gm_801A4BB8()`. Object creation registers that callback only on success; destruction forwards the object to the GObj unlink routine. A scalar helper converts an unsigned byte to float by multiplying by 0.1.
- Result helpers select the last qualifying player/team with `is_small_loser == 0`, defaulting to zero. Team representative selection instead chooses the first eligible team member with a minimal `is_small_loser`, or returns the supplied player index outside teams mode.
- Player subscore packs comparison counts for unsigned `x20` and `x24`, followed by the slot-dependent term `6 - index`. Main score calculation branches on current mode and `x5`, then clamps every result to ±16,777,215.
- Primary ranking increments existing `is_big_loser` values for higher-scoring opponents and builds the zero-rank winners list. Secondary ranking starts from primary rank and counts higher `x30` values among tied primary ranks. Team aggregation sums scores ordinarily; its special branch combines negative scores by keeping the greater negative value until nonnegative contributions replace them, then sums nonnegative contributions. It also accumulates `x30` into team subscore and marks teams active.

### shard-main__melee__gm__gm_1601-006-retry180539
Reviewed canonical and rendered lines 2881–3360 only.

- `fn_80165FA4` ranks active teams by counting strictly higher signed scores, records the maximum primary rank, and lists teams with primary rank zero. `fn_801661E0` derives secondary ranks by counting higher unsigned subscores among teams tied on primary rank.
- `gm_80166378` clears result arrays, snapshots six player slots and statistics, adjusts KO-derived totals according to team membership, computes player scores, and invokes the player/team ranking pipeline.
- `fn_80166A8C` conditionally implements a scalar paired-single store using `qr3`. `gm_80166A98` constructs a four-slot result record from supplied character and score inputs, assigns slot types using character absence and controller errors, normalizes the explicit SEAK character case, and runs the ranking pipeline. `fn_80166CBC` returns a player's secondary rank.
- `gm_80166CCC` combines two result records: propagates selected outcomes, adjusts ranks when winners are tied, copies fighter-kind information and accumulates `xE`, and demotes prior top-ranked entries absent from the second record. It does not rebuild winner arrays or counts. `gm_MatchHasMultipleWinners` excludes no-contest outcomes and tests the applicable winner count; `fn_80167194` returns the player winner count.
- `fn_8016719C` prepares spawn-position state through stage-dependent paths, sets facing toward the horizontal origin, restores configured HP, and invokes player/status/camera helpers. `gm_80167320` chooses this preparation path or slot-removal/character-costume handling according to flags and conditions. `gm_80167470` forwards its arguments only for `GM_STAMINA_VS`.

### shard-main__melee__gm__gm_1601-007-retry180539
Reviewed canonical and rendered lines 3361–3840 of gm_1601.c, with a supplemental read through line 3846 to complete the final function. This bounded region initializes shared setup state and invokes setup helpers; maintains nonzero slot countdowns and assigns stage-derived positions with temporary horizontal offsets; clears a small state object and exposes a byte setter/getter; gates a feedback call on port/name rumble preferences; initializes player, rules, and versus defaults; applies stored rule settings to a versus start configuration; selects forced-stage or controller-selection state; reads and writes handicap values through external helpers; chooses a stored winner index from tied maximum standing-field values; and sums standing field xE for entries whose slot_type is zero.

Notable behavior: offset slots use the first zero countdown, falling back to index zero, and are reserved for 0x90 decrements. Rule application multiplies configured time limits by 60, updates six players, remaps 32 item-mask bits while skipping mapping value 0x23, and derives pause and score-display flags. Stage-selection branches can search 29 ordered candidates or scan connected human slots. Winner selection uses the maximum is_big_loser value among slot_type-zero entries, breaks ties through HSD_Randi, and stores -1 when none qualify.

### shard-main__melee__gm__gm_1601-008-retry180539
Reviewed canonical and rendered lines 3841–4216 only.

- `gm_80168940` returns standings entry zero's `xE` when its `slot_type` is zero, otherwise zero. Two identical animation helpers select optional indexed joint/material/shape animations and attach them to a joint.
- `fn_80168A6C` clears a 32-byte destination and populates eight integer slots from indexed and shared source data.
- `gm_80168B34` computes a character-dependent floating-point value using special constants or a base plus `arg2 * 30`. `gm_80168BF8` obtains player character and costume data and calls it, but contains no explicit return.
- Audio helpers dispatch numeric selections to audio calls, optionally remap two selections, throttle one audio call with a resettable counter, and execute two near-identical audio initialization sequences differing in one mask argument.
- `fn_80169000` copies four handicap bytes, builds a position-to-slot mapping from standings whose slot type is not three, conditionally adjusts the first/last mapped entries and sometimes the second, then copies all four bytes back.
- Four bounds-checked table accessors return `ncolors`, `x1`, `x3`, or `x2`, returning zero for out-of-range indices. The apparent random calls in the first accessor are unreachable.
- `gm_801692E8` converts through an intermediate calendar structure, copies date/time fields, makes the month one-based, and caps seconds at 59.

### shard-main__melee__gm__gm_1601-009-retry180539
Reviewed canonical and rendered `src/melee/gm/gm_1601.h` lines 1–202 only. This guarded header defines both unlockable-count constants as 11 and declares the TU's interface. Its declarations include character-kind/index conversion interfaces, text and color-related signatures, MatchEnd processing interfaces, record and high-score APIs, character-unlock APIs, camera and object interfaces, player/rules initialization, rumble, model-animation signatures, announcer loading, and a seconds/datetime signature. The header contains no function bodies or structure layouts; it establishes declarations, not their runtime behavior.

### shard-main__melee__gm__gm_1601-010-retry180539
Reviewed canonical and rendered `src/melee/gm/gm_1601.static.h` lines 1–236 only. This header supplies private record declarations, constant tables, and three mutable static objects; it contains no function bodies. Records include an opaque byte buffer with a size assertion, character-associated metadata, a signed character/theme pair, and a character/path pair. Tables contain floating-point values, integer sequences, nine opaque RGBA colors, explicit CKIND/SELKIND initializer sequences, and eleven character-associated metadata records. The final three signed-integer tables have corresponding initial entries offset by one across tables, followed by identical 0xFFFF and zero tails. Runtime interpretation, indexing contracts, and state transitions are not established by these declarations alone.

### shard-main__melee__gm__gm_1601-011-retry180539
Reviewed canonical and rendered `src/melee/gm/gm_1601.dox` lines 1–234 only. This file is a declaration/documentation index, not an implementation. It records interfaces involving character resources and unlock-index conversion, match-end records and results, score accessors, character-kind conversion, camera operations, player/rules defaults, rumble, model animation, audio, and date conversion. Detailed comments describe the lossy selectable-character/character mapping and pause-camera selection conditions; these are documentation claims rather than independently verified runtime behavior. No function bodies or compiled layouts occur in the assigned range.

### shard-main__melee__gm__gm_1601-012-retry180539
Reviewed the six assigned section subjects, not the complete translation unit. Canonical declarations contain localized character names, color records, character-keyed resource and theme tables, constant identifier maps and unlock metadata. Lookup routines return matching payloads with sentinel fallbacks. Unlock routines consult and modify character-availability bits. Other reviewed routines compute audio gains, indexed horizontal offsets, and player/rules defaults. Source semantics do not by themselves establish compiler-emitted section membership or padding.

### shard-main__melee__gm__gm_1601-013-retry180539
Reviewed the six assigned lookup/normalization functions and their relevant table definitions and consumers. They select character victory audio, translate character unlock indices to notification IDs, translate stage-table identifiers, clamp player/team color candidates to 0–4, and select saved-language character names with sparse overrides. The helpers themselves do not mutate unlock, audio, player, or localization state; relevant mutations occur downstream. This is bounded subject coverage, not complete TU coverage.

### shard-main__melee__gm__gm_1601-014-retry180539
Reviewed the six assigned subjects and their relevant helper/caller paths. The text helpers select localized ordinary or alternate character names and horizontal scaling. The standings helpers reduce eligible ranks to a maximum and select a player using four ordered tie-breaks. The records helpers accumulate participant statistics into fighter and saved-name records and update character-matchup KO counters. Broad saturation, exact compiled-layout, and some named gameplay/UI claims require correction or further evidence; this review does not claim whole-TU coverage.

### shard-main__melee__gm__gm_1601-015-retry180539
Reviewed the six assigned functions and all 34 baseline facts. The nametag updater filters four match slots, accumulates capped name-to-name KOs and per-fighter time, and delegates shared statistics updates. Three character-indexed score writers replace persistent Classic, Adventure, and All-Star scores only under strict unsigned improvement comparisons. Two predicates short-circuit over 25 persistent fighter flags. The Classic/Adventure predicate combination gates a Toy call, but the meaning of its numeric argument is deferred. A claimed saturated Adventure aggregate is contradicted by its already-u32 comparison against U32_MAX. This review does not claim complete TU coverage.

### shard-main__melee__gm__gm_1601-016-retry180539
Reviewed the six assigned subjects. Two parameterless predicates short-circuit across 25 persistent fighter flags; one helper counts set persistent flags in a caller-selected prefix used by Event Match progression checks. The item helper translates saved item bits into a caller-owned runtime mask while preserving unmapped destinations. Two unchecked, one-based lookups return the attack and defense components of a nine-entry handicap table. Current match setup uses named attack_ratio and defense_ratio fields rather than the baseline's legacy field names. Detailed challenge rules and knockback-mechanics explanations remain deferred where the inspected code establishes only record or ratio plumbing.

### shard-main__melee__gm__gm_1601-017-retry180539
Reviewed the six assigned functions and their relevant downstream implementations. They implement a 29-bit stage-pool cardinality predicate used to permit tournament stage repeats, a short-circuiting six-character unlock predicate, and game-manager adapters for stage-selected match cameras, minimum-distance pause cameras, training-menu cameras, and free-camera initialization. Specific collectible and Special Melee mappings remain deferred where the authenticated source reads do not establish the player-facing identity. This is bounded subject coverage, not complete TU coverage.

### shard-main__melee__gm__gm_1601-018-retry180539
Reviewed the six assigned functions and relevant callers. They refresh a shared two-line performance descriptor, convert a rules byte by multiplication by 0.1f, select player/team winners from secondary standings, choose a team-aware record representative, and construct a deterministic secondary-ranking key. Winner queries retain the last qualifying index; the team representative selects the first minimum-ranked eligible member. The ranking key favors higher x20, lower x24, then lower slot index. This is bounded subject coverage, not complete TU coverage.

### shard-main__melee__gm__gm_1601-019-retry180539
This bounded shard covers six result-processing helpers. A mode-dependent calculator supplies a clamped signed player score. Primary ranking counts strictly better-scoring participants and collects rank-zero winners; secondary ranking refines only equal-primary groups. Team aggregation combines player scores and secondary values, with a sign-sensitive special branch, before equivalent team ranking passes. The caller clears standings before populating scores and invoking these stages. Original-name hypotheses remain descriptive, not recovered symbols.

### shard-main__melee__gm__gm_1601-020-retry180539
Reviewed the six assigned subjects and their 34 baseline facts. They cover GQR3-based encoding of a completed-match statistic, tournament result-order access, individual winner-count access, fighter respawn setup, respawn-offset reservation aging, and stage-dependent platform placement. Source confirms the principal data paths. The raw bit interpretation in one respawn-state fact remains unresolved; inferred names remain semantic hypotheses, not recovered identifiers. This is bounded subject coverage, not complete TU coverage.

### shard-main__melee__gm__gm_1601-021-retry180539
Reviewed the six assigned helpers, not the whole translation unit. They attach indexed model animations, construct an eight-word descriptor, select Results audio by team or character inputs, pace score-change audio using a shared invocation counter, reset that counter, and adjust four handicap values using standings-derived indices. Current callers confirm model setup, score-update, reset, and handicap-persistence connections. Exact sound content, some gameplay interpretation, and compiled record offsets remain deferred.

### shard-main__melee__gm__gm_1601-022-retry180539
The assigned functions implement complementary signed sound-balance conversions, immediate application of both gains, restoration from the saved balance byte, a character-to-result-animation-path lookup, and a stateless campaign-selected character trophy lookup. Balance conversions use floating-point arithmetic followed by integer conversion; their 0–127 range assumes the menu's -100 through +100 domain. The trophy lookup retains a source-level bool return spelling despite returning table entries. This review covers only the six assigned subjects.

### shard-main__melee__gm__gm_1601-023-retry180539
Reviewed the six assigned subjects, not the entire translation unit. Two accessors select character-indexed trophy IDs by mode and return inline archive-name or model-symbol strings from trophy metadata. A player-color selector maps slot, team, and participation state to indices 0–8; its companion performs an unchecked byte-indexed GXColor lookup. Two character-name queries select saved-language strings, with the slot-based query additionally handling unavailable slots and Zelda/Sheik form selection.

### shard-main__melee__gm__gm_1601-024-retry180539
The assigned functions insert localized character names with language-dependent alternate-name fallback and horizontal scaling, coordinate fighter and nametag record updates, and read, replace, or credit the save-backed balance consumed by Figure-pon. The two name renderers differ in whether they scale the whole text object's horizontal font size or the inserted text entry. The balance setter updates two associated fields before capping the spendable balance at 9,999 raw units; Figure-pon displays one coin per ten raw units. This review covers only the assigned subjects.

### shard-main__melee__gm__gm_1601-025-retry180539
Reviewed the six assigned statistic updaters. They record eligible human character participation, accumulate human contestant counts, add single-player and Tournament Sudden Death durations, update Total Damage, and distribute a KO increment across three counters. Character counters saturate at 65,535. The unsigned time/damage additions do not actually saturate. KO accounting returns its final record pointer; its signed first addition requires separate overflow treatment.

### shard-main__melee__gm__gm_1601-026-retry180539
Reviewed the six assigned record-query functions. They expose indexed Classic and Adventure scores, aggregate 25 score records, test all 25 Classic completion flags, and reduce the Classic indicator byte with an initial minimum of 4. The character-selection caller displays individual and aggregate scores and gates the aggregate Classic indicator on the all-record predicate. The aggregate score functions contain unsigned-maximum comparisons, not effective overflow detection in the current C source.

### shard-main__melee__gm__gm_1601-027-retry180539
Reviewed the six assigned record-query functions and their record-panel consumers. They provide Adventure any-clear and all-clear predicates, a minimum Adventure record level initialized to 4, an indexed All-Star high-score getter, a 25-record All-Star total, and an All-Star all-clear predicate. The menu uses the all-clear predicates to reveal aggregate level indicators. These queries do not modify persistent records. The total's unsigned comparison against UINT32_MAX must not be interpreted as effective overflow saturation.

### shard-main__melee__gm__gm_1601-028-retry180539
Reviewed the six assigned record functions and relevant accessors and callers. They provide an All-Star roster minimum, individual and combined Home-Run distances, a Training Mode record getter and independent two-destination maximum updater, and a Target Test pre-clear count query returning -1 after completion. The Home-Run total contains a clamp-shaped branch, but its unsigned comparison cannot detect overflow. Training Mode persistence and display are confirmed; the precise consecutive-hit interpretation requires tracing the session-value producer.

### shard-main__melee__gm__gm_1601-029-retry180539
The six assigned functions expose Target Test and 10-Man record displays. Completed per-character records are converted from frames into optional byte-sized hours, minutes, seconds, and a fractional display field computed as 99 × remaining_frames / 59. Both aggregate queries require all 25 indexed records to qualify before publishing outputs. The 10-Man predicate and KO getter handle the opposite representation; the getter returns -1 for completed-time records. These queries do not modify persistent records.

### shard-main__melee__gm__gm_1601-030-retry180539
Reviewed the six assigned subjects. Four functions expose completion-dependent fighter records: an inverse flag predicate, an uncleared-value query, an optional-output time formatter, and a 25-record aggregate that fails before writing outputs if any flag is clear. The remaining functions test an Item Switch mask bit and translate a compact stage index through a constant table. Persistent records are not modified by these queries. This is bounded subject coverage, not complete TU coverage.

### shard-main__melee__gm__gm_1601-031-retry180539
Reviewed the six assigned stage-setting and stage-unlock subjects. The Random Stage Switch setter and getter manipulate individual save-backed mask bits; random selection separately checks stage availability and conditionally applies that mask. An all-off mask produces a diagnostic, not a fallback. Stage availability and granting use an eleven-entry ground-stage-to-unlock-bit table. Granting requests notification before ORing the bit, without an already-unlocked guard. The completion predicate requires every unlock bit and is consumed by music-selection logic. This is bounded subject coverage, not complete TU coverage.

### shard-main__melee__gm__gm_1601-032-retry180539
The six assigned functions bulk-set or clear stage-unlock state, perform a character-keyed stage lookup, clear one character-unlock bit, test all character-unlock bits, and bulk-set character unlocks. The masks reside in save data. Bulk setters preserve unrelated bits and omit the ordinary single-unlock notification calls. Current callers establish debug-gated bulk unlocking, stage-data reset integration, and character-dependent match/preload stage selection. Specific Target Test and additional-content mappings remain deferred where the inspected code supplies only numeric identifiers.

### shard-main__melee__gm__gm_1601-033-retry180539
Reviewed the six assigned subjects. They clear the saved character-unlock mask; test saved bits 0–27 except 26; adapt integer-argument interfaces to free-camera initialization and fixed-camera selection; and create/destroy a diagnostic display toggled by held X plus triggered D-pad Right. Creation registers the local display producer only on success. Destruction delegates to engine teardown, which can defer destruction of the tracked active object. Specific Pokémon and player-facing camera-mode mappings remain deferred where the inspected code establishes only numeric selection or internal camera state.

### shard-main__melee__gm__gm_1601-034-retry180539
Reviewed the six assigned function subjects. They rebuild live standings, construct synthetic debug results, reconcile Sudden Death standings, dispatch post-Sleep fighter handling, forward Stamina defeat notifications, and initialize shared route-encounter configuration. Current callers confirm debug-result audio consumption, retained Sudden Death results, live standings refresh, completed-match preparation, and fighter-originated notifications. This is bounded subject coverage, not complete TU coverage.

### shard-main__melee__gm__gm_1601-035-retry180539
Reviewed the six assigned functions, not the complete translation unit. They partially reset scene-loop tracking and masks, store and retrieve the controller selected by input scanning, dispatch preference-gated rumble requests, and apply shared rule settings to an existing Versus configuration. The rule application updates six player records, conditionally converts timer limits, derives handicap multipliers, selectively remaps item bits, and sets pause and score-display flags.

### shard-main__melee__gm__gm_1601-036-retry180539
Reviewed the six assigned functions and supporting source. They configure stage-select state, query and update retained handicap bytes, select a slot from maximal `is_big_loser` standings, and extract or aggregate `xE` for result accounting. Stage chooser normalization requires a connected human controller. Handicap updates load four values, apply standings-based adjustment, and conditionally persist them. The aggregate scans `GM_MAX_PLAYERS`, whereas winner selection and handicap updates use four slots. Specific stage-mask, victor-ranking, and Trophy Lottery interpretations remain deferred where the inspected code establishes mechanics but not the claimed gameplay identity.

### shard-main__melee__gm__gm_1601-037-retry180539
Reviewed the six assigned subjects. They attach indexed model animations, calculate character-mark frames, gather player-specific frame inputs, dispatch character-indexed audio cues, perform a fixed audio setup sequence, and bounds-check a character metadata count. Current C leaves some icon-mapper paths with an uninitialized base and omits the player wrapper's return statement; intended HUD use is established, but compiled return behavior is not. Audio sample contents and the costume interpretation of the metadata count remain unverified.

### shard-main__melee__gm__gm_1601-038-retry180539
Reviewed the six assigned subjects and their 27 baseline facts. Three byte getters provide bounds-checked, character-specific costume selections for the CSS default, team-1, and team-2 branches. The timestamp helper converts seconds through OSCalendarTime, copies calendar fields, increments the month, and caps seconds at 59. Character-kind conversion performs an unchecked read-only selection-identity lookup used by record-management callers; the unlock adapter composes that conversion with a lookup returning the stored unlock index or the table-length sentinel. The red/blue/green labels remain unverified by the inspected code.

### shard-main__melee__gm__gm_1601-039-retry180539
Reviewed the six assigned subjects, not the entire TU. The pause-camera adapter forwards the pauser's slot and ID under slot-kind/entity guards, with a separate sentinel call. The 3-Minute and 15-Minute record getters read persistent u16 character records; their totalizers sum 25 entries without modifying them, and the character-selection interface displays these values as KOs. The unlock-index adapter performs a bounded first-match lookup and converts the resulting selectable-character identifier, including the miss sentinel, through the normal conversion table.

### shard-main__melee__gm__gm_1601-040-retry180539
Reviewed the six assigned functions and their relevant records/challenger consumers. Challenger stage selection is a read-only first-match lookup with a typed fallback. Endless and Cruel score queries read individual persistent fighter fields or sum 25 entries; character selection displays both forms as KOs. Play Time adds the single-player and VS timers without mutation, and the records interface bounds and formats the result as hours and minutes. The unsigned comparison against -1 does not provide effective saturation.

### shard-main__melee__gm__gm_1601-041-retry180539
Reviewed the six assigned functions and their 29 baseline facts. They aggregate five match counters, increment Power Count, initialize rules/player/result data, query character-unlock bits, issue a fixed audio call sequence, and test for multiple winners while excluding No Contest. Records and threshold consumers confirm use of the match aggregate. Exact Power Count startup semantics, its signed-overflow boundary behavior, and announcer-resource identification remain deferred.

### shard-main__melee__gm__gm_1601-042-retry180539
Reviewed the six assigned subjects and all 28 baseline facts. These helpers accumulate self-destruct statistics, select effective rumble preferences, translate selectable-character identifiers, resolve unlock-bit indices, reset player initialization arrays, and perform human-participant post-match accounting. The accounting routine separates outcomes 7–8 from played-match updates and gives Stamina mode precedence over the supplied match kind. This review covers only the assigned subjects, not the complete translation unit.

### shard-main__melee__gm__gm_1601-043-retry180539
Reviewed the assigned baseline subjects, not the complete translation unit. Player and rules initializers replace caller-provided records with deterministic defaults, subsequently specialized by Versus setup. Post-match accounting accumulates elapsed and human-weighted play time. Character unlocking maps a character to an unlock ordinal, registers a notification, and sets its persistent availability bit. Result construction collects player statistics, computes scores, and performs player and team ranking. The baseline's general saturation claim is contradicted by unsigned arithmetic; the exact compiled rules-record size remains unverified.

### shard-main__melee__gm__gm_1601-044-retry180539
The six assigned parameter subjects have no baseline facts to disposition. Their current function bodies cover three table lookups, an unsigned-byte clamp to 4, localized character-name selection with alternate-name fallback, and a text-operation wrapper whose first argument is declared HSD_JObj* but used as HSD_Text*. This review is limited to the assigned subjects, not the entire translation unit.

### shard-main__melee__gm__gm_1601-045-retry180539
The assigned subjects have no baseline facts. The canonical body of fn_80160DE8 selects a string and table-derived size using a character index, language, and alternate-name flag, then forwards the selected string, an entry selector, and two floating-point values to text-library functions. fn_80160F58 returns a language-dependent table value indexed by ckind, choosing between tables according to whether an alternate-name string exists. This review covers only the assigned parameter subjects, not the complete translation unit.

### shard-main__melee__gm__gm_1601-046-retry180539
The six assigned parameter subjects have no baseline facts. Their current function bodies operate on match-end standings: fn_80161004 finds the maximum eligible is_big_loser field; fn_80161154 selects a player using that maximum and successive field comparisons. fn_80161C90 reads one indexed player's results and updates a supplied statistics destination. fn_80162068 accumulates opponent-specific KO counts into persistent fighter records and invokes that shared statistics updater.

### shard-main__melee__gm__gm_1601-047-retry180539
The six assigned parameter subjects have no baseline facts to disposition. Current source shows fn_80162170 consuming a MatchEnd pointer to update persistent name-associated KO counts, per-fighter play time, and shared statistics. fn_80162BFC, fn_80162DF8, and fn_80162FF4 convert their first argument through gm_CKindToSelKind, select separate stored records, and replace a record only when the second argument is greater under unsigned comparison, returning whether replacement occurred. This review is limited to the assigned subjects.

### shard-main__melee__gm__gm_1601-048-retry180539
The six assigned parameter subjects have no baseline facts. Their current function bodies show: fn_80162FF4's second argument is a candidate value stored only when greater than the existing value; fn_80163FA4's first argument is an exclusive loop bound for counting nonzero accessor results; fn_801640B0's first argument points to a mask whose mapped bits are selectively set or cleared; fn_8016419C and fn_801641B4 use their first arguments minus one to select the x and y components of a table entry; fn_80165190's first argument is a player slot checked for human/CPU type and an existing entity before forwarding it to Camera_8002F760. This review covers only the assigned subjects, not the complete translation unit.

### shard-main__melee__gm__gm_1601-049-retry180539
The assigned subjects have no baseline facts to assess. Their current enclosing functions implement two guarded camera calls, an unconditional two-argument camera forwarding wrapper, and an unsigned-byte-to-float scaling helper. fn_80165190 and fn_801651FC forward their slot and second argument only for human or CPU slots with a non-null player entity. fn_801652B0 forwards both arguments unchanged to Camera_8002F9E4. fn_801653E8 returns its u8 argument multiplied by 0.1f. This review is limited to the assigned parameter subjects, not the entire translation unit.

### shard-main__melee__gm__gm_1601-050-retry180539
The assigned parameters belong to four read-only MatchEnd helpers. fn_80165418 scans four player entries and returns the last eligible index with is_small_loser zero, defaulting to zero. fn_801654A0 does the equivalent for five active team entries. fn_80165548 returns its second argument outside the is_teams == 1 branch; otherwise it selects the first eligible member of the requested team having no teammate with a smaller is_small_loser value, defaulting to zero. fn_801656A8 compares unsigned x20 and x24 values across six eligible player entries and combines the comparison counts with an index-dependent term. All six assigned subjects have empty baseline fact arrays.

### shard-main__melee__gm__gm_1601-051-retry180539
The assigned parameters belong to player-score calculation and match-end standings processing. The two-argument calculators use their second argument as a player-array index. fn_801656A8 combines comparative x20/x24 counts with an index-based tie breaker; fn_8016588C selects a score expression by mode/settings and clamps its result. The remaining functions mutate the supplied MatchEnd: accumulating primary ranks and winners, refining tied ranks using x30, and aggregating player scores/subscores into team entries. All six assigned subjects have empty baseline fact lists, so there are no fact records to retain or change. This review covers only the bounded subjects, not the entire translation unit.

### shard-main__melee__gm__gm_1601-052-retry180539
The six assigned parameter subjects have no baseline facts. Their canonical functions update team standings in a MatchEnd object, transfer a scalar through a Gekko quantized store, and read an indexed player's is_small_loser field. The team-ranking routines operate in place; the scalar helper's exact stored representation depends on qr3 configuration.

### shard-main__melee__gm__gm_1601-053-retry180539
The six assigned parameter subjects belong to three functions: `fn_80167194` reads a MatchEnd winner count; `fn_8016719C` configures a player's respawn position, facing and HP using a slot and subcharacter selector; `fn_80167638` supplies a stage position and an offset, using either the player slot directly or a temporarily reserved offset index. All assigned subjects have empty baseline fact lists.

### shard-main__melee__gm__gm_1601-054-retry180539
The six assigned parameter subjects contain no baseline facts to disposition. The current body of fn_801689E4 accepts a joint object, a DynamicModelDesc, and an index; it selects indexed entries from each non-null animation array and passes the resulting pointers to HSD_JObjAddAnimAll. The current body of fn_80168A6C accepts source and destination pointers plus an index, zeros 0x20 destination bytes, conditionally copies four indexed source words and two shared words, and writes two unconditional scalar words. These are source-level observations, not verification of register bindings or compiled layouts.

### shard-main__melee__gm__gm_1601-055-retry180539
The six assigned parameter subjects contain no baseline facts to disposition. In the current source, fn_80168E54 uses its fourth argument to select between a three-case audio-call branch indexed by its third argument and forwarding its first argument after conditional remapping involving its second argument. fn_80168F2C does not use its argument; it cycles a shared counter and issues an audio call when that counter is zero. fn_80169000 reads standings through its first argument to build an index ordering used to adjust and copy back four values supplied through its second argument.

### shard-main__melee__gm__gm_1601-056-retry180539
The six assigned parameter subjects have no baseline facts to disposition. Current source shows that fn_80169000 reads and rewrites a four-byte handicap array using standings-dependent adjustments. fn_80169434 stores a callback; fn_80169444 forwards its argument to that callback and clears it when the callback returns 1. fn_80169550 uses a slot-indexed lookup to mark an x20 entry -1. fn_80169574 zeroes the requested buffer length and writes a -2 terminator at that length. These are bounded source observations, not verified register-parameter mappings.

### shard-main__melee__gm__gm_1601-057-retry180539
The six assigned parameter subjects have no baseline facts to assess. No parameter semantics are established in this bounded review: the canonical tail read of gm_1601.c ends with gm_801692E8, not either assigned parent function. No new facts or links are proposed.

### shard-main__melee__gm__gm_1601-058
The bundle contains six parameter subjects and no baseline facts. No fact dispositions or new semantic claims are proposed. Parameter roles for fn_801697FC and fn_8016989C remain unverified; the canonical source tail read in this job ends with gm_801692E8, so address-like subject names alone do not establish their current source location or behavior.

### shard-main__melee__gm__gm_1601-059
The six assigned parameter subjects have no baseline facts. No parameter functionality is established by this review: the inspected canonical source tail ends with gm_801692E8, rather than bodies for the two functions named by these subjects. No semantic or register-to-parameter mapping is proposed.

### shard-main__melee__gm__gm_1601-060
The fully read bundle assigns six parameter subjects, all with empty baseline fact arrays and no source hints. There are no baseline fact IDs to assess in this shard. No new semantic claims or parameter/register mappings are proposed.

### shard-main__melee__gm__gm_1601-061
The complete bundle assigns six parameter subjects, each with an empty baseline facts array. There are consequently no baseline fact IDs to retain, supersede, reject, or mark unresolved. No new semantic claims or parameter mappings are proposed.

### shard-main__melee__gm__gm_1601-062
The six assigned parameter subjects have no baseline facts to assess. In the canonical bodies, gm_80160438 uses ckind as a lookup key against ResultAnimEntry.ckind and returns a matching path or NULL. gm_80160474 and gm_801604DC use ckind to index one of three tables selected by mode; the Classic and Adventure case pairs each select a dedicated table, with all other modes selecting the third. gm_801604DC passes the selected value to Toy_8030813C and returns its result plus 4. gm_80160564 uses the same selection and indexing logic, returning the callee result plus 0x24. These observations describe source parameters, not independently verified register bindings.

### shard-main__melee__gm__gm_1601-063
The six assigned parameter subjects contain no baseline facts. In the canonical source, gm_80160564 uses its mode argument to select one of three character-indexed tables, passes the selected value to Toy_8030813C, and returns that pointer plus 0x24. gm_80160854 selects a numeric index using slot, team, a nonzero team-mode flag, and comparison of slot_type with Gm_PKind_Human. In team mode, teams 0–3 map to human indices 0,1,3,2 or non-human indices 5,6,8,7; team 4 returns 4. Outside team mode, non-human slots return 4 and human slots 0–3 return their slot index. Remaining cases return 0. No gameplay meaning is assigned to those numeric indices.

### shard-main__melee__gm__gm_1601-064
The assigned parameters belong to a color-table lookup and localized character-name helpers. gm_80160968 truncates its input to u8 before indexing a GXColor table. gm_80160980 indexes the saved-language name table by ckind. gm_80160A60 passes its input to player queries, returns NULL for an unavailable slot, and selects a localized character name with a special Zelda/Sheik branch. gm_80160B40 accepts a text object, character index, and alternate-name flag; it selects the localized string and horizontal scale, enables kerning for US language, passes the string to the text routine, and multiplies font_size.x by the selected scale.

### shard-main__melee__gm__gm_1601-065
The six assigned parameter subjects contain no baseline facts, so there are no fact IDs to disposition. The inspected bodies show that gm_80160C90 receives a text object, a character-name table index, and an alternate-name selector; it selects language-dependent text and scaling. gm_801623A4 forwards its MatchEnd pointer to two helpers. gm_801623FC uses its input as an unsigned value, raises two stored values when necessary, and caps the current value at 9999. gm_8016247C adds its input to stored counters and updates a current value capped at 9999. These observations do not establish register bindings or gameplay-specific counter meanings.

### shard-main__melee__gm__gm_1601-066
The six assigned parameter subjects contain no baseline facts. The inspected canonical bodies show gm_80162574 using its first argument through gm_CKindToSelKind to select two counters, incrementing each with a 65535 cap unless its second argument is 7 or 8. gm_80162800 reads a MatchEnd, counts human player standings, adds that count to the stored contestant total, and returns the count. Nearby canonical functions gm_SetupHumanResultsScreen and gm_SetupResultsScreenPlayTime update match-category totals and elapsed/participant-weighted time respectively; their correspondence to the assigned address-based identities remains unverified. No parameter-register or compiled-layout assertions are proposed.

### shard-main__melee__gm__gm_1601-067
The bundle contains six parameter subjects and no baseline facts. Current canonical bodies show gm_80162968, gm_801629B4 and gm_80162A4C adding their input to accessor-selected counters. gm_80162A98 adds its input to three stored totals and returns the final record pointer. The nearby play-time updater uses its second input as a multiplier; the self-destruct updater adds its input to a stored total. Their correspondence to the bundle's older address-based parameter identities is deferred rather than assumed. The unsigned comparisons against the maximum representable value do not establish effective overflow saturation.

### shard-main__melee__gm__gm_1601-068
The five getter parameters are declared u8 and passed unchanged to their respective gmMainLib accessors, whose pointed-to values are returned. The first parameter of gm_80163298 is declared s8, converted through gm_CKindToSelKind, and used to select two records. Each record is increased only when the supplied value exceeds it; the return value reports whether the accessor-backed record changed. All six assigned subjects have empty baseline fact lists, so there are no fact dispositions or proposed changes.

### shard-main__melee__gm__gm_1601-069
The assigned subjects have no baseline facts. Their current enclosing functions implement conditional record updates and indexed record retrieval/decomposition. gm_80163298 uses its u16 second argument to independently raise two stored values, returning true only when the pointed-to record increases. gm_8016332C forwards its u8 argument to a predicate and accessor, returning the stored value when the predicate is false and -1 otherwise. gm_80163374 uses its u8 first argument for lookup; when its predicate is nonzero, it writes optional u8 outputs derived from the retrieved value by successive divisions by 60 and modulo operations. Null outputs are skipped, and all outputs remain untouched when the predicate is zero.

### shard-main__melee__gm__gm_1601-070
The six assigned parameter subjects contain no baseline facts. Their current containing functions implement conditional record-value formatting, aggregate formatting, and a negated predicate. gm_80163374 conditionally writes four optional byte outputs, with the last derived from the record remainder modulo 60 scaled by 99/59. gm_801634D4 sums records across 25 entries only when every predicate succeeds; otherwise it returns false before writing outputs. On success it writes optional hour, minute, second, and scaled-remainder components and returns true. gm_8016365C forwards its byte argument to gmMainLib_8015D6BC and returns whether that call is zero. No gameplay mapping or register-to-source-parameter claim is proposed.

### shard-main__melee__gm__gm_1601-071
The six assigned parameter subjects have no baseline facts to disposition. In the current source, gm_80163690 forwards its u8 argument to a predicate and record accessor, returning the record when the predicate is zero and -1 otherwise. gm_801636D8 forwards its first argument to the same helpers; when the predicate is nonzero, it decomposes the record using a 60-unit time base into four independently nullable u8 outputs: hours, minutes, seconds, and a fractional component scaled from remainder 0–59 to 0–99. When the predicate is zero, outputs remain untouched. This review does not establish a gameplay-mode mapping or compiled register layout.

### shard-main__melee__gm__gm_1601-072
The six assigned parameter subjects have no baseline facts. In gm_80163838, four nullable u8 output pointers receive hours, minutes, seconds, and a fractional-frame value scaled to 0–99 from an accumulated frame count. All outputs remain untouched if any of the 25 queried flags is zero. gm_801639C0 forwards its u8 argument to gmMainLib_8015D710 and returns whether that result is zero. gm_801639F4 forwards its u8 argument to the same predicate and, when zero, returns the value obtained through gmMainLib_8015D6F8; otherwise it returns -1.

### shard-main__melee__gm__gm_1601-073
gm_80163A3C takes a u8 selector and four nullable u8 output pointers. When gmMainLib_8015D710(selector) is nonzero, it reads a value through gmMainLib_8015D6F8 and decomposes it using divisions by 60 into three components plus a remainder scaled by 99/59. Otherwise outputs remain untouched. gm_80163B9C sums the corresponding values for indices 0–24, returning false without writing outputs if any predicate fails; otherwise it performs the same decomposition and returns true. All six assigned subjects have empty baseline fact lists.

### shard-main__melee__gm__gm_1601-074
The six assigned parameter subjects contain no baseline facts. Their canonical function bodies show nullable byte outputs for a gated aggregate converted using divisions by 60 and a fractional remainder scaled to 0–99; an item-mask bit-index test; a direct table-index lookup returning u16; and a stage-mask bit-index update controlled by an enable argument. No gameplay mapping or compiled register-to-parameter mapping is asserted.

### shard-main__melee__gm__gm_1601-075
The six assigned parameter subjects have no baseline facts to assess. Their current function bodies implement: setting or clearing a stage-mask bit according to an enable argument; querying a mask using a bit index; checking table-derived eligibility before consulting that mask; mapping an input through Stage_8022519C to test or set a table-selected unlock bit; and searching a sentinel-terminated table after remapping input 0x20 to 0xE. No gameplay meaning is assigned to those numeric values.

### shard-main__melee__gm__gm_1601-076
The six assigned parameter subjects contain no baseline facts. Canonical bodies show that gm_80164A0C maps its input through ckind_to_selkind_map and gm_SelKindToUnlockIndex before conditionally clearing the corresponding bit. gm_80165268 and gm_80165290 ignore their input parameters and invoke camera functions. gm_80165388 forwards its first three parameters unchanged to hsd_80398310, along with its fourth parameter, and registers fn_801652D8 only when the returned pointer is non-null. This review is limited to the assigned subjects, not the entire translation unit.

### shard-main__melee__gm__gm_1601-077
Read the entire assigned bundle. All six parameter subjects have empty baseline fact lists, so there are no baseline facts to retain, supersede, reject, or mark unresolved. No new semantic or compiled-layout claims are proposed.

### shard-main__melee__gm__gm_1601-078
The assigned six parameter subjects have no baseline facts to disposition. The current gm_80166A98 body clears a MatchEnd, sets its outcome to OUTCOME_TIMEOUT, initializes four player entries from supplied character and score inputs, copies arg1 into each entry's x3, adjusts x30 by slot index, selects slot_type using character absence and controller status, normalizes CKIND_SEAK to CKIND_ZELDA with FTKIND_SEAK, and invokes five downstream helpers. This review does not establish a debug-only purpose or a color meaning for x3.

### shard-main__melee__gm__gm_1601-079
The assigned subjects concern parameters in match-result initialization, result merging, a multiple-winner predicate, and player-state handling. gm_80166A98 initializes four player standings and invokes ranking helpers. gm_80166CCC conditionally combines outcome and standing information, mutating both inputs. gm_80167320 uses a player slot and boolean to select player-state updates or forward to fn_8016719C. All six assigned subjects have empty baseline fact lists; there are no fact IDs to disposition.

### shard-main__melee__gm__gm_1601-080
The six assigned parameter subjects have no baseline facts to assess. In canonical source, gm_80167470 forwards its two s32 arguments unchanged to gm_801B97C4 only when the current mode is GM_STAMINA_VS. gm_801674C4 stores its first four arguments into configuration fields: arg0 into x0, arg1 into both x7 and x8, arg2 into x9, and arg3 masked with 0xFFFF into xA. It also initializes additional fields and invokes setup helpers. These observations do not establish gameplay meanings for the register-labeled parameter subjects.

### shard-main__melee__gm__gm_1601-081
The six assigned parameter subjects contain no baseline facts to disposition. Current source shows gm_801674C4 forwarding its final callback argument to fn_80169434; gm_801677C0 clearing six named members of its supplied structure; and gm_801677E8 storing its argument in lbl_804D6598. gm_80167858 checks port/nametag rumble preferences before forwarding the port and remaining arguments to lb_80014574. The preference helper is currently named gm_RumbleEnabledForPlayer, rather than the assigned legacy gm_801677F8 symbol. No register-identity or compiled-layout claims are proposed.

### shard-main__melee__gm__gm_1601-082
The assigned parameters belong to two small rumble-request helpers. gm_80167858 takes four int parameters (port, nametag, arg2, arg3), checks gm_RumbleEnabledForPlayer(port, nametag), and conditionally forwards port, the constant 3, arg2, and arg3 to lb_80014574. gm_801678F8 takes three int parameters and forwards them to gm_80167858 with nametag fixed to 120. All six assigned subjects have empty baseline fact lists; there are no baseline fact IDs to disposition.

### shard-main__melee__gm__gm_1601-083
The bundle contains six parameter subjects and no baseline facts. Current source includes player/rules default initialization and a VsModeData initializer. gm_80167BC8 mutates supplied VsModeData using game-rule settings, including timers, stocks, handicap ratios, item-mask translation and pause settings. gm_80167FC4 mutates supplied SSSData, choosing a forced stage or updating selection-controller state according to a rule field. No numeric mode values are assigned gameplay names here.

### shard-main__melee__gm__gm_1601-084
The six assigned parameter subjects have no baseline facts to disposition. Current bodies show: gm_801685D4 forwards two byte arguments to a pointer lookup when handicap equals 1, returning the pointed byte or zero; gm_80168638 uses MatchEnd standings to load four values, invoke an adjustment helper, and conditionally write values back; gm_80168710 reads MatchEnd standings and writes VsModeData.winner using a randomly selected index among maximum-is_big_loser entries with slot_type zero, or -1 when none qualify; gm_801688AC sums xE across standings with slot_type zero. These are source-level observations, not verified gameplay mappings or register-layout claims.

### shard-main__melee__gm__gm_1601-085
The complete bundle contains six parameter subjects associated with gm_80168940, gm_8016895C, and gm_80168B34. Every assigned subject has an empty baseline fact list and no source hints. There are therefore no baseline fact IDs to assess in this bounded shard. No parameter semantics or compiled-layout claims are introduced.

### shard-main__melee__gm__gm_1601-086
The six assigned parameter subjects have no baseline facts. Current source shows gm_80168B34's third argument contributing a stride of 30 to the computed result outside early-return cases; gm_80168BF8 supplies Player_GetCostumeId's result in that position and uses its own argument for three player queries. gm_80168C5C uses its argument to select a constant passed to lbAudioAx_800243F4, with no action for unmatched values. The arguments to gm_80169238, gm_80169264, and gm_80169290 index lbl_803D51A0 after an upper-bound check; these accessors return ncolors, x1, and x3 respectively, or zero when out of range. This review is limited to the assigned subjects.

### shard-main__melee__gm__gm_1601-087
The bundle contains six parameter subjects and no baseline facts. In the inspected canonical bodies, gm_801692BC takes a u8 table index, returns zero when out of bounds, and otherwise returns the indexed x2 field. gm_801692E8 passes its u32 input to lbTime_8000B028 and writes calendar fields through its datetime pointer, adding one to the month and capping seconds at 59. No gameplay interpretation or compiled parameter layout is asserted.

### shard-main__melee__gm__gm_1601-088
The six assigned parameter subjects contain no baseline facts. No parameter functionality, type, or register-to-source mapping was established for them, so no semantic writes are proposed. This result covers only the assigned bounded shard.

### shard-main__melee__gm__gm_1601-089
The six assigned parameter subjects have no baseline facts. Their semantic roles were not established; no parameter names, types, data-flow claims, or gameplay mappings are proposed. This review does not establish complete translation-unit coverage.

### shard-main__melee__gm__gm_1601-090
The assigned subjects have no baseline facts. The current gm_8016A22C body resides in gm_16A2.c: it clears shared state, copies configuration arguments into fields, caps x9 at five, initializes a sentinel-terminated buffer, and invokes configuration helpers. Its source parameters are named k0, k1, k2, a3 and others—not the register-style subject names. No register-to-source-parameter mapping or gameplay interpretation is asserted.

### shard-main__melee__gm__gm_1601-091
The six assigned parameter subjects contain no baseline facts to assess. No parameter semantics are asserted: the inspected canonical source and header tails end with gm_801692E8 and do not establish the assigned later-address functions or their register-labelled parameters.

### shard-main__melee__gm__gm_1601-092
The bundle assigns six parameter subjects: r3 and r4 for gm_8016A998, gm_8016A9E8, and gm_8016AC44. Every assigned subject has an empty baseline facts array; therefore there are no baseline fact IDs to retain, supersede, reject, or mark unresolved. No parameter semantics or register-to-source mappings are asserted, and no new facts are proposed.

### shard-main__melee__gm__gm_1601-093
The complete assigned bundle contains six parameter subjects, all with empty baseline fact arrays. There are no baseline facts to retain, supersede, reject, or mark unresolved. No new semantic claims or parameter-register mappings are proposed.

### shard-main__melee__gm__gm_1601-094
The bundle assigns six parameter subjects, each with an empty baseline facts array. There are no baseline fact IDs to retain, supersede, reject, or mark unresolved. No parameter semantics or register-to-source mappings are asserted, and no new facts or links are proposed.

### shard-main__melee__gm__gm_1601-095
The complete assigned bundle contains six parameter subjects, each with an empty baseline facts array and no source hints. There are no baseline fact IDs to disposition. No parameter semantics or compiled register mappings are asserted.

### shard-main__melee__gm__gm_1601-096
The complete bundle contains six parameter subjects, each with an empty baseline facts array. There are therefore no assigned baseline fact IDs to retain, supersede, reject, or mark unresolved. No new semantic claims are proposed; this result does not establish function-body or full-TU coverage.

### shard-main__melee__gm__gm_1601-097
This bounded subjects shard contains two parameter identities, `gm_SetupRulesDefaults#r3` and `gm_UnlockCKind#r3`. Both have empty baseline fact arrays. There are therefore no assigned fact IDs to retain, revise, reject, or defer. No new parameter semantics or compiled-layout claims are proposed.

### shard-main__melee__gm__gm_1601-098
Reviewed the twelve assigned concept links against current canonical source. Confirmed spawn-platform positioning, victory-theme lookup, Multi-Man score queries, Classic and All-Star record presentation, stage unlocking, and saved rumble selection. Deferred links whose gameplay interpretation requires additional caller or field-provenance evidence. This is bounded link review, not complete TU coverage.

### shard-main__melee__gm__gm_1601-099
Reviewed the twelve assigned links against current canonical excerpts and relevant callers. Confirmed stage-index availability checks, character-unlock filtering, stage notification-index conversion, diagnostic-display teardown, results-theme selection, rules initialization, and respawn coordination. Deferred claims requiring additional resource-layout, audio, persistent-record, or compiled-section evidence. This is bounded link review, not complete TU coverage.

### shard-main__melee__gm__gm_1601-100
Reviewed the twelve assigned concept links. Current code supports localized character-name rendering, player-indicator palette lookup, fixed-camera delegation, and Versus exit counter updates. Other reviewed helpers perform record reductions, table lookups, or preference-gated rumble dispatch; several claimed gameplay mappings or caller details remain unverified. This is bounded link review, not complete translation-unit coverage.

### shard-main__melee__gm__gm_1601-101
The reviewed code supports character-unlock checks, fixed-camera activation, team standings and costume selection, and handicap initialization and post-match adjustment. Record aggregation and result-score selection are also present. Several historical gameplay mappings require additional caller or callee verification; this review does not establish complete translation-unit coverage.

### shard-main__melee__gm__gm_1601-102-retry180539
Reviewed the twelve assigned links, not the complete TU. Current code supports sentinel-based theme lookup, player and team result ranking, stamina-specific team score aggregation, unlock-mask operations, and initialization of bookkeeping used by the core loop. Record aggregation, synthetic results construction, and character-index conversion are present, but several more specific gameplay/display mappings remain unverified.

### shard-main__melee__gm__gm_1601-103-retry180539
The assigned links connect persistent-record queries to Target Test, All-Star and Multi-Man displays; match-standing queries to tournament ordering and results presentation; reservation countdowns to spawn-platform positioning; and progression/audio helpers to unlock and game-over handling. The total-damage helper writes through the persistent total-damage accessor. This review covers only the twelve assigned links.

### shard-main__melee__gm__gm_1601-104
Reviewed the twelve assigned links against current function bodies and selected callers. Confirmed record-display predicates and time formatting, costume cycling bounds, unlock-index conversion, Random Stage Switch mask counting, and diagnostic-display creation. Four links remain unresolved where the specific caller or gameplay attribution was not established. This is bounded link review, not complete TU coverage.

### shard-main__melee__gm__gm_1601-105
This bounded review confirms sudden-death result reconciliation, guarded pause-camera setup including stage-minimum zoom, player initialization defaults, random-stage filtering, Multi-Man record access, and DEVELOP display updates. Several broader gameplay mappings remain deferred because the inspected canonical code establishes the mechanics but not all claimed semantic connections. This is not complete TU coverage.

### shard-main__melee__gm__gm_1601-106
Reviewed the twelve assigned links against available current canonical source. Directly supported behavior includes unlock-mask operations, sentinel-terminated victory-theme lookup, and handicap-dependent load/adjust/writeback. Other bodies establish counter updates, indexed record reads, player selection, and audio dispatch, but several specific gameplay/menu associations require unavailable cross-TU evidence. This is bounded link review, not complete TU coverage.

### shard-main__melee__gm__gm_1601-107
Reviewed the 12 assigned concept links against current canonical functions and selected callers. Confirmed result ranking, team representative selection, persistent match counting, Target Test cumulative-time display, localized name selection, match defaults, results audio selection, and developer display removal. Trophy archive layout, the specific Multi-Man completion mapping, and audio-channel identity remain deferred. This is bounded link review, not complete TU coverage.

### shard-main__melee__gm__gm_1601-108
Reviewed the twelve assigned links against current function bodies. Confirmed sentinel lookup and player-default initialization. Other bodies expose standings selection, record aggregation, progression predicates, and participant bookkeeping, but several specific gameplay mappings require renewed caller evidence; historical line ranges have shifted. This is not complete TU coverage.

### shard-main__melee__gm__gm_1601-109-retry180539
The inspected code updates match statistics, ranks player scores and collects tied winners, maps participation/team information to color indices, and transfers a shared byte into mode-local state. Additional inspected helpers perform character-table lookups, conditional record retrieval, and respawn-position allocation. Several historical citations have shifted substantially; the broader gameplay associations below remain deferred where current consumer evidence was not established. This is a bounded link review, not complete TU coverage.

### shard-main__melee__gm__gm_1601-110
The inspected functions apply paired audio gains, select character-associated resources and text, format a gated time record, store a controller-selection byte, gate rumble by persistent name preferences, and configure fighter spawn state. Several gameplay links remain unverified because their specific consumer or resource mappings were not established by the current-source reads. This review does not establish complete translation-unit coverage.

### shard-main__melee__gm__gm_1601-111-retry180539
This bounded review confirms character-kind conversion used by Records text, localized player names consumed by the Stadium display, unlock-mask mutation, stock-icon animation selection, and shared player-default initialization. Other assigned relationships remain deferred where current caller coverage, mode identification, or compiled-section attribution is insufficient. This is not complete TU coverage.

### shard-main__melee__gm__gm_1601-112-retry180539-retry185219
The inspected routines collect match statistics and run standings calculations, gate controller feedback using saved rumble preferences, initialize match rules, and update character-indexed records. Results exit also selects a slot and stores it in Versus data. Several baseline gameplay associations remain unverified because their historical source ranges have moved or because the inspected code establishes only numeric data flow.

### shard-main__melee__gm__gm_1601-113
Reviewed the 12 assigned concept links against current function bodies and selected callers. Confirmed character-unlock operations, saved-language selection, runtime rule and item-mask configuration, stock-dependent branching, team-winner calculation, trophy archive selection, and pause-camera setup. Two audio-presentation mappings remain partially supported but unresolved. This is bounded link review, not complete TU coverage.

### shard-main__melee__gm__gm_1601-114
The reviewed code converts character identifiers to unlock slots, modifies persistent availability masks, performs sentinel-terminated resource lookup, aggregates indexed records, builds match standings, gates a callback on Stamina VS, and selects rumble permission from a port setting or persistent name profile. This review covers only the assigned links; several gameplay, compiler, and compiled-section associations remain unverified.

### shard-main__melee__gm__gm_1601-115
The reviewed code updates character-indexed maxima and persistent name-tag statistics, translates unlock identifiers, manages Random Stage Switch bits, and prepares match standings. Ordered stage selection checks unlock availability rather than the Random Stage Switch mask. Several historical caller citations no longer identify the relevant code, so their gameplay mappings remain deferred. This review covers only the assigned links, not the complete translation unit.

### shard-main__melee__gm__gm_1601-116
Reviewed the twelve assigned concept links against current function bodies and selected callers. Confirmed team-costume selection, localized character text, unlock-notification submission, KO-record data flow, standings-based handicap adjustment, stage-selection state preparation, and Cruel-mode score display. Several more specific audio, Rebirth, and lottery interpretations remain deferred. This is bounded link review, not complete translation-unit coverage.

### shard-main__melee__gm__gm_1601-117
Reviewed the twelve assigned links against current canonical code and relevant callers. The inspected routines select localized character-name text and metrics, construct a two-line develop performance display, manage unlock bookkeeping and challenger-stage selection, initialize Versus rules, refine match-result ranks, and supply Stadium record displays. This is bounded link review, not complete translation-unit coverage.

### shard-main__melee__gm__gm_1601-118
Reviewed the twelve assigned links only. Current bodies implement indexed record access and aggregation, balance assignment, item-mask queries, unlock-index conversion, localized text setup, and preference-gated rumble dispatch. Lottery and Item Switch callers directly corroborate their links. Several historical caller ranges have moved; their specific gameplay associations remain deferred rather than inferred from proposed names.

### shard-main__melee__gm__gm_1601-119
The reviewed bodies implement unlock-notification lookup, stage availability and selection masks, item-mask transfer, team-score aggregation, persistent statistics updates, indexed record queries, and an audio-cadence reset. Several narrower gameplay and menu associations remain unverified because their current caller chains were not established. This assessment covers only the assigned links, not the complete translation unit.

### shard-main__melee__gm__gm_1601-120-retry180539
This bounded review confirms links for Versus rule configuration, validated entry into the training-menu camera, character-select record display, complementary audio gain calculation, diagnostic overlay creation, and the all-stage unlock-mask query. Three links remain unverified because their historical source locations do not establish the claimed implementation in the current revision. This is not complete translation-unit coverage.

### shard-main__melee__gm__gm_1601-121
Reviewed the twelve assigned concept links against current canonical bodies and relevant menu consumers. The sampled code supplies mode-record aggregates and completion tests, stage and character availability operations, shared-winner detection, language-dependent sizing, sound-balance application, and persistent statistics maintenance. Tournament-specific accounting and the trophy interpretation remain deferred. This is bounded link review, not complete translation-unit coverage.

### shard-main__melee__gm__gm_1601-122
Reviewed the twelve assigned links against current canonical helpers and selected consumers. Confirmed record-time formatting, stage-mask menu initialization, Classic high-score storage, score-tally audio, character-dependent Classic stage selection, and cumulative Versus milestone inputs. Deferred mappings whose complete semantic chain was not established. This is bounded link review, not complete TU coverage.

### shard-main__melee__gm__gm_1601-123
Reviewed the twelve assigned concept links against current function bodies and selected callers. Confirmed character and stage unlock handling, victory-theme lookup, player initialization, result-rank merging, name-dependent rumble gating, and roster-total records display. Deferred claims whose specific gameplay interpretation was not fully established by the inspected code. This is bounded link coverage, not complete translation-unit coverage.

### shard-main__melee__gm__gm_1601-124
The reviewed code initializes player descriptors, gates rumble through port or nametag preferences, tests the Random Stage Switch mask, accumulates persistent fighter statistics, computes standings-related keys, delegates camera setup, and exposes character-indexed records and appearance data. Several gameplay and menu mappings remain unverified; this review does not establish complete translation-unit coverage.

### shard-main__melee__gm__gm_1601-125
Reviewed the five assigned links against current source. Confirmed selected-character All-Star score display, completed 10-Man time formatting, and aggregation/display of 3-Minute records. Also verified a capped balance updater and table-driven item-mask translation, but deferred their broader Trophy Lottery and Item Switch integration claims pending consumer/persistence tracing. This is bounded link review, not complete TU coverage.

Status: researched; no-change lead bypass; independent review and live promotion pending.
