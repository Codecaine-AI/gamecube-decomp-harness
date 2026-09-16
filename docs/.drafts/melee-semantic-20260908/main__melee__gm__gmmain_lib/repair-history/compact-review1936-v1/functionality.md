# Disjoint Librarian Research

### shard-main__melee__gm__gmmain_lib-000
Reviewed canonical and rendered src/melee/gm/gmmain_lib.c lines 1–480 only. This range defines global state storage, initial rule/data values and a progressive video-mode descriptor. Most functions expose mutable pointers into the active global state's rules, save data, fighter records, name-tag banks and counters. Name-tag indexing uses banks of 19 entries. A selector returns either a controller-indexed byte or a named record's x1A2 byte; its reset caller writes 5 to each non-null result. Other helpers set/test a save-data bitmask, read/write indexed values, and set/test a scalar flag. Per-fighter helpers expose fields and packed values; several setters update both a fighter-local flag and the corresponding bit in an auxiliary mask. Mask queries return masked integers rather than normalized booleans. Gameplay meanings of unnamed fields and proposed mode-specific names are not established by these bodies.

### shard-main__melee__gm__gmmain_lib-001
Reviewed canonical and rendered gmmain_lib.c lines 481–960 only.

- Provides per-fighter flag getters/setters and writable record-field pointers. Three aggregate predicates independently check 25 fighter flags or bits 0–24 of two distinct save-data fields.
- Implements indexed bitset set, clear, and masked-test operations. Two registration routines write a seconds timestamp and set paired bits only when their respective primary bit is clear; repeated calls return failure without those writes.
- Exposes a byte counter and indexed byte storage, including an update through lbTime_8000AF74 and an eleven-element reset.
- Repairs name-tag references: matching indices become unassigned (or zero for three rules fields), while larger non-sentinel indices decrement. The multi-mode traversal visits unk_1490 twice.
- Sets six player handicaps to 9 in each of local mode-array indices 0–5 and 7–12, after calling gmMainLib_8015CDEC; index 6 is skipped.
- Selects rules.bgm as 0x34 by default, permitting 0x36 when both external predicates succeed and HSD_Randi(4) returns zero. Also exposes settings and save-data pointers, rumble and sound-balance access, and test/set/clear operations for mask 4 in x186C.

### shard-main__melee__gm__gmmain_lib-002-retry155554
Reviewed canonical and rendered `src/melee/gm/gmmain_lib.c` lines 961–1370 only.

- Provides masked reads, sets and clears of save field `x186C` bits 1, 2 and 8; clearing bit 2 also restores `stage_mask` from a table entry.
- Resets selected persistent record regions. Fighter resets clear 25 opponent counters and a shared field-by-field record block. Name-record initialization clears 120 opponent counters, the shared record block and 25 play-time entries, then assigns `x1A2 = 5`; the bulk variant processes 120 names. Three additional wrappers zero their accessor-returned objects.
- Writes the saved `deflicker` field and selects a video configuration from progressive state plus either `GetRumbleSettingOfPort(5)` or an explicit boolean, then calls `HSD_VISetConfigure`.
- Initializes bank 1 through fighter-record resets, fixed-length clears, defaults, language handling and conditional external calls. Other bank numbers initialize 19 name records, copy available name strings and enable rumble.
- Coordinates conditional initialization of banks 1–8, debug-gated state changes, audio calls and video configuration. Full initialization first clears a fixed-size memory region and chooses language values according to `/usa.ini` presence. A separate routine clears `x186C` and invokes five external helpers.
- Maintains a seconds timestamp, returning elapsed time while advancing it; runtime initialization derives `skip_intro` from the reset code and resets other runtime fields.

### shard-main__melee__gm__gmmain_lib-003
Reviewed the complete assigned header, `src/melee/gm/gmmain_lib.h:1–171`, in canonical and rendered views. It defines the declaration surface for this library, importing platform and game-manager types. Named declarations expose game rules, save data, persistent fighter/name records, trophy data, aggregate statistics, and per-port rumble settings. Numerous address-named declarations provide scalar queries, pointer-returning accessors, and void operations with indexed or parameterless signatures; the header alone does not establish their runtime behavior or gameplay mapping. The header also declares one external struct object and one external `struct gmm_x0*`. No function bodies or struct layouts occur in this assigned range; this is not complete translation-unit coverage.

### shard-main__melee__gm__gmmain_lib-004
Reviewed the six assigned subjects, not the complete translation unit. The initialized root pointer selects shared rules and save-backed state. Fighter access uses a direct unchecked index; name access uses quotient/remainder indexing across 19-record banks. Memory Card setup retains save-region pointers, while Records and name-management callers read or modify the returned aliases. Reconstruction copies the settings template and conditionally passes a trophy-selection result to Toy_SetUnlockState. Video routines select progressive/interlaced descriptors. Compiled section layout and several broader semantic claims remain deferred.

### shard-main__melee__gm__gmmain_lib-005
Reviewed the six assigned subjects and their 26 baseline facts. The functions expose borrowed pointers into manager-owned save/runtime storage, retrieve per-port rumble preferences, and reset saved-name statistics in place. Read callers confirm seven Memory Card buffers, shared item/stage/language settings, four-port vibration presentation, name creation/deletion resets, and a lottery balance displayed and spent at ten stored units per coin. This is bounded subject coverage, not complete TU coverage.

### shard-main__melee__gm__gmmain_lib-006-retry161335-retry180539
Reviewed the six assigned subjects and their relevant consumers, not the entire translation unit. Two accessors expose save-backed accounting counters; three expose shared Classic, Adventure, and All-Star selection records used for CSS transfer and route resumption. The remaining function resets controller-backed, no-nametag handicap values to 5. The coin accumulator's apparent saturation expression does not establish saturation under unsigned 32-bit C arithmetic, so its saturation and monotonicity claims require correction.

### shard-main__melee__gm__gmmain_lib-007
Reviewed the six assigned accessor subjects and their supplied baseline facts. The bodies select mutable nametag/fallback bytes, set and query indexed save flags, read and overwrite indexed records, and set a separate persistent latch. Event exit code performs record comparisons outside the setters; menu code independently gates time/score presentation on completion flags. Important qualifications: the fallback selector checks only an upper bound, and the special three-stock latch call is not explicitly guarded by the neighboring success flag.

### shard-main__melee__gm__gmmain_lib-008
Reviewed six assigned functions and their relevant consumers. They expose a save-backed boolean latch, a mutable per-fighter counter incremented with saturation during human VS result accounting, a character-use mask query and paired two-location setter, and two distinct Home-Run record accessors. One Home-Run record family synchronizes with a runtime table and supplies menu totals; the other receives greater-only result updates and supplies milestone aggregation. This is bounded subject coverage, not complete translation-unit coverage.

### shard-main__melee__gm__gmmain_lib-009
Reviewed the six assigned Classic-record accessors and their record-update, menu, and progression consumers. They expose a mutable score and difficulty byte, read fighter-local and save-wide completion representations, set both completion representations, and read stock metadata. Completion processing retains greater scores using unsigned comparison, raises difficulty, and updates stock metadata at cpu_level 4 when unset or lower. Menu consumers associate this family with Classic records. Roster reductions inspect 25 entries; the challenger all-character check excludes index 3. The score summation's apparent saturation condition cannot succeed as written.

### shard-main__melee__gm__gmmain_lib-010
Reviewed the six assigned persistent-record accessors and mutators and relevant completion, menu, aggregation, and unlock consumers. The Classic stock setter directly overwrites its field. Adventure records expose a mutable score pointer, a local completion predicate, a non-normalized completion-mask query, a dual-representation clear setter, and a mutable difficulty byte. Completion processing maximizes score and difficulty; menu code reads individual records and roster summaries. Saturation, nonnegative score-domain, and smallest-nonzero-stock claims are not established by the current C.

### shard-main__melee__gm__gmmain_lib-011
Reviewed the six assigned accessors and mutators, plus selected record consumers and completion dispatch. The stock pair reads and overwrites an indexed persistent field; completion case 22 writes it at CPU level 4 when the old value is zero or exceeds the submitted stocks, and a separate predicate scans 25 entries for value one. The All-Star family exposes a mutable score slot, a local completion flag, and a non-normalized mask query; its mutator sets the local flag and corresponding aggregate bit. Score consumers perform conditional improvements and roster aggregation, while flag consumers implement any/all reductions. This is bounded subject coverage, not complete TU coverage.

### shard-main__melee__gm__gmmain_lib-012
Reviewed the six assigned accessors and their relevant result-processing and aggregation consumers. The All-Star path raises a fighter-indexed saved CPU-level byte and conditionally replaces a stock record at level 4. The Target Test paths maintain a progress-or-frame-count word, a separate clear-time array, and a completion predicate; Classic's target-stage result path updates the same records. This review covers the assigned subjects, not the entire translation unit.

### shard-main__melee__gm__gmmain_lib-013
Reviewed the six assigned accessors and predicates and their relevant result/reward consumers. They query a character-indexed completion bit, update a fighter completion flag, reduce three distinct completion stores over 25 entries, and expose a mutable 10-Man record. Target-course result handlers update all three completion stores, including `x1C`; therefore the baseline identification of `x1C` as Classic Mode clear progress is misleading. Trophy processing gates three numeric award requests on the `x8` aggregate and compares summed records against 90000 and 45000. Specific trophy names remain unverified.

### shard-main__melee__gm__gmmain_lib-014
The six assigned functions expose per-character persistent Multi-Man records: read/write access to the 10-Man and 100-Man record-form flags, a mutable s32 pointer for the 100-Man value, and a mutable u16 pointer for the 3-Minute high score. Scene initialization restores these records; non-retry exits save runtime values. The 100-Man set-flag branch carries frame time, not score—the baseline reverses these meanings in two facts. The 3-Minute slot uses zero as absent and is summed across 25 character entries.

### shard-main__melee__gm__gmmain_lib-015-retry180539
Reviewed the six assigned persistent-fighter accessors and their relevant consumers. They expose a boolean flag with a one-way setter, a u16 timed-mode score, two s32 score fields, and a u16 maximum-record field. Multi-Man setup and non-retry result paths share the returned interior pointers with record queries; aggregate queries traverse 25 indices. Training exit supplies a candidate value to a greater-only updater. Detailed gameplay objectives and the precise Training measurement remain deferred rather than inferred from names or numeric modes.

### shard-main__melee__gm__gmmain_lib-016-retry180539
The six assigned functions implement save-backed notification timestamps, first-registration bookkeeping, pending-bit set/clear/query operations, and persistent registration-bit setting. First registration timestamps an entry and sets both bitsets; repeated registration returns zero without writes. Prize presentation clears pending state, while reconciliation can clear timestamps and registration state. The information menu sorts acquired entries by timestamp and renders their dates and times. This review covers only the assigned subjects and necessary consumer excerpts.

### shard-main__melee__gm__gmmain_lib-017-retry180539
Reviewed the six assigned helpers and their relevant consumers. They clear/query persistent message-registration bits, expose indexed trophy timestamp storage, conditionally register trophy events, and set/query runtime trophy markers consumed by prize setup and pending-work scans. Queries return selected masks rather than normalized Booleans. Registration is conditional on the current persistent bit, not a guarantee of once-per-lifetime acquisition; callers can clear that bit and register again.

### shard-main__melee__gm__gmmain_lib-018-retry180539
Reviewed the six assigned accessors and their relevant callers. The x1B58 helpers set, clear, and query persistent trophy-registration bits; registration and prize preparation use the query to guard timestamp and marker initialization. The x1C88 pair records and tests flags consumed by the bonus-list UI and a completion scan. The final accessor returns a shared byte used by How to Play to decide whether to increment and restart the scene sequence. Bitmap indexing is unchecked. This is bounded subject coverage, not complete TU coverage.

### shard-main__melee__gm__gmmain_lib-019
Reviewed six assigned functions and their relevant callers. The presentation API sets or increments a shared byte used by movie-scene flow. The challenger API increments, reads, and clears eleven retry counters; increments saturate at 255, and challenger setup computes CPU level as max(0, 5 - 2 * count). The nametag routine adjusts shared references after name deletion, but its current source visits modes.unk_1490 twice, preventing an unconditional claim that every reference is repaired exactly once.

### shard-main__melee__gm__gmmain_lib-020
The assigned functions reset stored player handicaps, access and select shared BGM, expose an unnamed three-state match setting, and retain a Sound Test music selection for trophy viewing. Canonical bodies confirm the scalar accesses and reset ranges; current callers confirm the title Start invocation, rule translation, and Sound Test-to-trophy data flow. Specific unlock and looping-audio interpretations remain deferred.

### shard-main__melee__gm__gmmain_lib-021-retry180539
The six assigned accessors read or overwrite the save-backed sound-balance byte, or return mutable interior pointers to progress records and the stage-unlock mask. Sound-menu callers own signed bounds checks and five-unit stepping. Progress consumers update character masks, match counters, usage counts and indexed records; stage consumers distinguish unlock availability from the random-selection mask. This review covers only the assigned subjects and supporting reads.

### shard-main__melee__gm__gmmain_lib-022-retry180539
The six assigned functions expose a mutable save subrecord and read or update feature masks 4 and 1. Main-menu code uses mask 4 to gate All-Star availability. Additional Rules uses mask 1 to gate option 3 independently of the selected score_display rule value. Reconciliation synchronizes these masks from entries 0x16 and 0x17. The subrecord has a counter tested against 5,000 and three check-before-set latches. Two baseline claims need correction: x186C is declared u8, not a 32-bit field, and the counter's unsigned comparison against UINT_MAX does not implement saturation. This review covers only the assigned subjects.

### shard-main__melee__gm__gmmain_lib-023-retry180539
Reviewed the six assigned functions and their relevant consumers. They clear the Score Display availability bit, query/set/reset Random Stage Switch availability, and query/set Sound availability in `SaveData.x186C`. Queries return raw mask values; setters and clearers preserve neighboring bits. Random Stage Switch reset additionally restores `stage_mask` from table entry 6. Reconciliation selects the stage-switch and Sound transitions using entries `0x18` and `0x1B`. Menu and stage-selection consumers corroborate the feature mappings; the Sound predicate also gates registration of identifier `0xDC`. This is bounded subject coverage, not complete TU coverage.

### shard-main__melee__gm__gmmain_lib-024-retry180539
Reviewed the six assigned functions and relevant callers. They clear the save-backed Sound selection flag, erase fighter-specific and shared record regions, reset a common 19-field subrecord, reset fighter and name statistics arrays in bulk, and zero the complete save-backed unk_8 object. The deletion handler dispatches these resets by category; the Sound flag is synchronized from entry 0x1B and consumed by the Data-menu selection gate. Exact compiled statistics layout and the user-facing VS Records category label remain unverified.

### shard-main__melee__gm__gmmain_lib-025-retry180539
The six assigned functions clear two save-backed records, read and write the Deflicker selection, and select video descriptors using runtime progressive state and either saved or caller-supplied filtering state. Video selection stages a configuration change rather than directly calling VIConfigure. Menu code separately applies and saves Deflicker changes. This review covers only the assigned subjects.

### shard-main__melee__gm__gmmain_lib-026-retry180539
The six assigned functions initialize logical persistent-data banks, reconcile banks after a Memory Card operation, coordinate a fixed reset-helper sequence, reconstruct startup defaults, and initialize or advance a runtime seconds checkpoint. Banks 1–8 are traversed by the initialization and recovery callers; later banks select 19 name records apiece. The elapsed-time delta is accumulated into Power Time by the card-game caller. Detailed unlock-helper effects, JP/US numeric language mapping, and the intro-skip consumer remain deferred rather than inferred from proposed names.

### shard-main__melee__gm__gmmain_lib-027-retry180539
The six assigned accessors expose borrowed mutable storage for Bonus and Coin match counts, combined versus play time, shared game rules, KO total, and match resets. Records-menu code reads the statistic pointers; result processing and the count editor update match counters. Rules Plus commits options directly into the shared GameRules object. Result selectors 7 and 8 take an early-return reset-counter path. This review covers only the assigned subjects and necessary consumers, not the complete translation unit.

### shard-main__melee__gm__gmmain_lib-028-retry180539
The six assigned accessors expose the embedded save record and mutable pointers to five persistent counters. Consumers update these counters, aggregate match counts and elapsed time, populate records-menu rows, and register save storage with the card manager. Stock-count storage also has an editor write path. Several baseline saturation claims are not supported by the current C expressions: unsigned additions are compared against the maximum only after arithmetic, rather than using an overflow-safe check. Review is limited to the assigned subjects and their relevant consumers.

### shard-main__melee__gm__gmmain_lib-029-retry180539
The six assigned accessors expose borrowed mutable save-data storage for Time-match totals, damage totals, trophy entries, trophy-category flags, distinct-trophy count, and character-unlock bits. Consumers select persistent versus transient trophy state, update packed acquisition values, and manipulate mapped character-unlock bits. Records code reads and caps numeric totals. This review covers only the assigned subjects and inspected consumers.

### shard-main__melee__gm__gmmain_lib-030-retry180539
The reviewed accessors expose mutable save-backed contestant, VS-time, and power-time counters. Results accounting accumulates human participation and elapsed time; records rendering bounds numeric values and formats time in hours and minutes. The rumble setter directly overwrites one saved port preference, while its menu caller implements toggling and hardware feedback. Shared-state accessors, card-manifest registration, and selective record resets were also verified. This is bounded subject review, not complete TU coverage.

### shard-main__melee__gm__gmmain_lib-031
The assigned parameters select banked name records, saved rumble entries, conditional transient/name-record fields, and a bit to set in saved state. GetPersistentNameData uses signed division and remainder by 19; InitializePersistentNameData first converts its index to u8, then clears selected record counters and sets x1A2 to 5. gmMainLib_8015CE44 uses its first argument only when its second argument is GM_NAMETAG_NONE; otherwise the second argument selects a saved name record. gmMainLib_8015CEB4 ORs a shifted bit into x1A68. All six assigned subjects have empty baseline fact lists.

### shard-main__melee__gm__gmmain_lib-032
The assigned parameter subjects belong to small state accessors. gmMainLib_8015CEFC uses its argument as a bit position in thing.x1A68 and returns a boolean. gmMainLib_8015CF5C reads x1A70 at its argument index; gmMainLib_8015CF70 uses its first argument as that index and stores its second argument. gmMainLib_8015CFB4 forwards its argument to GetPersistentFighterData and returns the address of x78. gmMainLib_8015CFCC uses its argument as a bit position in gmMainLib_8015ED98()->xC and returns the masked value. All six assigned subjects have empty baseline fact arrays, so there are no baseline fact IDs to disposition.

### shard-main__melee__gm__gmmain_lib-033
The six assigned parameter subjects have no baseline facts. Their canonical function bodies declare a single u8 input. gmMainLib_8015D00C uses it as both an array index and bit position, setting x7A.b0 and the corresponding xC mask bit. gmMainLib_8015D06C and gmMainLib_8015D0C0 forward it to GetPersistentFighterData and return addresses of x7C.x84 and x7C.x88 respectively; gmMainLib_8015D0D8 similarly reads x7C.b4. gmMainLib_8015D084 indexes xB0 on the object returned by gmMainLib_8015EDBC. gmMainLib_8015D0F4 returns the selected x10 mask bit without Boolean normalization. This review covers only the bounded subjects, not the complete TU.

### shard-main__melee__gm__gmmain_lib-034
The six assigned parameter subjects contain no baseline facts. Their current function bodies use a u8 first argument to select stored fighter data. gmMainLib_8015D134 sets the selected record's x7C.b4 and ORs the corresponding bit into x10 returned through gmMainLib_8015ED98. gmMainLib_8015D194 and gmMainLib_8015D1E8 return addresses of x7C.x80 and x7C.x8C respectively. gmMainLib_8015D1AC reads x7C.b789; gmMainLib_8015D1C8 assigns its second argument, declared int stocks, to that field. This review covers only the assigned subjects, not the entire translation unit.

### shard-main__melee__gm__gmmain_lib-035
The six assigned first-parameter subjects have no baseline facts. Their canonical functions take a u8 index: gmMainLib_8015D200 reads the indexed fighter record's x7C.b5; gmMainLib_8015D21C tests the corresponding bit in x14; gmMainLib_8015D25C sets both representations. gmMainLib_8015D2BC returns the indexed x7C.x81 address, while gmMainLib_8015D2D4 and gmMainLib_8015D2F0 read and write x7C.b10_to_12. This review is limited to the assigned subjects, not the entire translation unit.

### shard-main__melee__gm__gmmain_lib-036
The six assigned parameter subjects have no baseline facts. Their canonical functions assign an integer to a selected fighter record's `x7C.b10_to_12`, select addresses of `x7C.x90` or `x7C.x82`, read `x7C.b6`, test a selected bit in `x18`, or set both the selected fighter's `b6` and corresponding `x18` bit. This review does not establish gameplay-mode meanings or compiled register bindings.

### shard-main__melee__gm__gmmain_lib-037
The assigned subjects have no baseline facts. Their current function bodies use the first argument to select records: gmMainLib_8015D3FC reads x7C.b13_to_15, gmMainLib_8015D418 assigns its second argument to that field, gmMainLib_8015D438 returns the address of x7C.x94, and gmMainLib_8015D48C reads x7C.b0 through GetPersistentFighterData. gmMainLib_8015D450 returns an element address in gmMainLib_8015EDBC()->x4C using arg0 & 255. This review does not establish gameplay meanings or compiled parameter-register mappings.

### shard-main__melee__gm__gmmain_lib-038
The assigned subjects have no baseline facts. In their canonical function bodies, gmMainLib_8015D4A8 uses its u8 argument as a bit position and returns the masked x1C value, not a normalized boolean. gmMainLib_8015D4E8 passes its first argument to GetPersistentFighterData and assigns its second argument to x7C.b0. gmMainLib_8015D6A4, gmMainLib_8015D6BC, and gmMainLib_8015D6D8 pass their first arguments to GetPersistentFighterData to obtain the address of x7C.x98, read x7C.b1, or assign x7C.b1, respectively. Review is limited to this bounded shard.

### shard-main__melee__gm__gmmain_lib-039
The assigned parameter subjects belong to small data accessors. gmMainLib_8015D6D8 assigns its second argument to x7C.b1. gmMainLib_8015D6F8 returns the address of x7C.x9C; gmMainLib_8015D710 reads x7C.b2; gmMainLib_8015D72C assigns its second argument to x7C.b2; and gmMainLib_8015D74C returns the address of x7C.xA0. Each function passes its first, u8 argument to GetPersistentFighterData. All six assigned subjects have empty baseline fact arrays, so there are no baseline fact IDs to disposition. This review does not establish gameplay meanings or compiled register mappings.

### shard-main__melee__gm__gmmain_lib-040
The six assigned parameter subjects have no baseline facts. Their canonical functions each accept a `u8 arg0` and pass it to `GetPersistentFighterData`. `gmMainLib_8015D764` reads `x7C.b3`; `gmMainLib_8015D780` sets that field to 1. The remaining four functions return addresses of `x7C.xA2`, `x7C.xA4`, `x7C.xA8`, and `x7C.x7E`, respectively. This review covers only the assigned subjects, not the complete translation unit.

### shard-main__melee__gm__gmmain_lib-041
The six assigned parameter subjects have no baseline facts. In the current canonical bodies, gmMainLib_8015D804 uses its signed argument to select an x1B80 element and returns its address. gmMainLib_8015D818 uses its unsigned argument as both an x1B80 index and a bit index: when the corresponding x1B4C bit is clear, it stores the result of lbTime_GetTimeInSeconds, sets the corresponding x1B40 and x1B4C bits, and returns 1; otherwise it returns 0. The arguments of gmMainLib_8015D888, gmMainLib_8015D8B0, and gmMainLib_8015D8D8 select an x1B40 bit to set, clear, or return as a mask, respectively. gmMainLib_8015D8FC sets the selected x1B4C bit. These bit selectors use argument / 32 for the word and argument % 32 for the bit; the reviewed bodies perform no bounds checks.

### shard-main__melee__gm__gmmain_lib-042
The six assigned parameter subjects have no baseline facts. Their canonical function bodies use the first argument as an index: gmMainLib_8015D924 clears and gmMainLib_8015D94C tests a bit in x1B4C; gmMainLib_8015D970 returns an indexed pointer into unk_6C; gmMainLib_8015D984 conditionally records time and sets two indexed flags; gmMainLib_8015D9F4 sets and gmMainLib_8015DA1C tests a bit relative to unk_44. Bit indices are split into word and bit positions using division and remainder by 32. Gameplay meanings are not established by this bounded review.

### shard-main__melee__gm__gmmain_lib-043
The five assigned parameters for gmMainLib_8015DA40, gmMainLib_8015DA68, gmMainLib_8015DA90, gmMainLib_8015DAB4, and gmMainLib_8015DADC are declared u32 and select a packed bit using arg0 / 32 and arg0 % 32. The first three functions respectively set, clear, and test that bit in x1B58; the next two set and test it in x1C88. The assigned gmMainLib_8015DB0C parameter is declared u8 and is copied directly into gmMainLib_804D3EE0->unk_1. All six subjects have empty baseline fact lists, so there are no baseline fact IDs to disposition. This review does not establish gameplay meanings or complete TU coverage.

### shard-main__melee__gm__gmmain_lib-044
The assigned subjects contain no baseline facts. Current source shows that gmMainLib_8015DB2C and gmMainLib_8015DB6C accept byte-sized indices into x39: the former updates an entry through lbTime_8000AF74(entry, 1), while the latter returns it. gmMainLib_8015DBF4 converts its argument to a byte and adjusts stored name-tag references, clearing matching references and decrementing larger non-sentinel references. gmMainLib_8015ED68 stores its argument in GameRules.unk_14. The source in the ED4C region instead defines gmMainLib_SetRumbleEnabled(port, enabled), which writes the selected rumble_enabled entry; the legacy subject-to-function identity is not established here.

### shard-main__melee__gm__gmmain_lib-045
The six assigned parameter subjects have no baseline facts. Current bodies show: gmMainLib_8015ED80 takes a byte stored into sound_balance; gmMainLib_8015EF30 takes a destination structure whose listed fields are zeroed; gmMainLib_8015F4F4 stores its byte argument into deflicker; gmMainLib_8015F588 uses its Boolean argument together with the progressive flag to select the render-mode object passed to HSD_VISetConfigure. In gmMainLib_8015F600, the first integer selects the shared-data initialization branch when equal to 1, otherwise selecting a group of 19 name entries through (arg0 - 2) * 19. The second integer gates additional calls when zero in the shared-data branch and is unused in the name-entry branch. This review covers only the assigned subjects, not the entire translation unit.

### shard-main__melee__gm__gmmain_lib-046
The three assigned parameter subjects contain no baseline facts, so no fact dispositions are required. In the current source, gmMainLib_8015FA34's s32 argument controls whether calls to gmMainLib_8015F600 for indices 1 through 8 are unconditional or depend on lb_8001B6E0: values other than 0 and 2 make those calls unconditional. gmMainLib_SetRumbleEnabled takes a ssize_t port index and a bool value and directly stores the value in the selected persistent rumble_enabled element, without local bounds checking.

### shard-main__melee__gm__gmmain_lib-047-retry180539
Reviewed the 12 assigned links against current canonical accessors and relevant consumers. The examined functions expose saved fighter/name records, trophy state, and All-Star settings, reset name statistics, and conditionally initialize save banks. Ten links are retained; two character-select record mappings remain unresolved because their intervening accessor chains were not established. This is bounded link review, not complete TU coverage.

### shard-main__melee__gm__gmmain_lib-048-retry180539
The reviewed accessors expose save-backed cumulative statistics, per-fighter flags, progression state, and character-availability bits. Current callers directly support the records-screen and character-availability relationships and connect the Multi-Man completion setter to its matching predicate. Several baseline caller locations have drifted or disappeared; the remaining gameplay mappings are explicitly deferred rather than inferred from numeric identifiers. This review covers only the assigned links, not the entire translation unit.

### shard-main__melee__gm__gmmain_lib-049-retry180539
The reviewed functions select video configuration descriptors, initialize central save-data banks, reset name statistics and handicap fields, expose persistent counters, and query flags consumed by Prize processing. Current callers substantiate trophy and notification processing and the two Misc. Records counters. Three gameplay associations remain deferred because the current reads do not establish their complete caller chains. This assessment covers only the assigned links, not the entire translation unit.

### shard-main__melee__gm__gmmain_lib-050-retry180539
Reviewed the twelve assigned concept links against current accessor bodies and relevant consumers. The bounded evidence supports shared match rules, Classic selection state, Multi-Man completion state, All-Star availability, persistent fighter writes, trophy acquisition timestamps, sound balance, records values, and an Erase Data reset. The specific Score Display identity of Additional Rules option 3 remains deferred.

### shard-main__melee__gm__gmmain_lib-051-retry180539
Reviewed the twelve assigned concept links against current function bodies and selected consumers. The functions expose or mutate save-backed records, test completion masks, repair name-tag references, and select video configurations. Direct consumer evidence supports name-entry repair, trophy-count access, deflicker application, and Multi-Man record handling. Several narrower gameplay mappings remain deferred rather than inferred from numeric identifiers. This is not complete TU coverage.

### shard-main__melee__gm__gmmain_lib-052-retry180539
Reviewed the twelve assigned links, not the entire translation unit. Current code supports save-backed data access, trophy notification processing, character-unlock checks, erase-data initialization, records display, name-record compaction, rumble settings, and Adventure CSS state exchange. Classic-score and Event Match mappings remain explicitly deferred.

### shard-main__melee__gm__gmmain_lib-053-retry180539
Reviewed the twelve assigned concept links against current canonical accessor/reset bodies and selected callers. Confirmed save-backed storage access, name-profile initialization, records-row consumption, item-frequency persistence, challenger failure handling, and Multi-Man record flag updates. Several older caller citations no longer cover the claimed operations; those mappings remain explicitly unresolved rather than being inferred from proposed names. This is bounded link review, not complete TU coverage.

### shard-main__melee__gm__gmmain_lib-054-retry180539
The reviewed accessors expose mutable save-data fields, manage pending prize and trophy-registration bits, store per-port rumble preferences, and maintain counters used to reduce challenger CPU difficulty. The reviewed record accessor also feeds post-match progress/time updates. This review covers only the twelve assigned links, not the entire translation unit.

### shard-main__melee__gm__gmmain_lib-055-retry180539
The assigned links connect save-data accessors and mutators to trophy state, character statistics, name-tag reference maintenance, record displays, and accumulated power time. Current bodies and callers support eleven relationships. The precise Event 51 no-falls mapping remains deferred because the baseline caller path is absent in this revision. This review covers only the assigned links, not the entire translation unit.

### shard-main__melee__gm__gmmain_lib-056-retry180539
The reviewed functions expose persistent bitsets and character records, reset save subrecords, register timestamped acquisitions, advance a presentation counter, and initialize runtime startup flags. Read callers establish connections to Versus rule conversion, Additional Rules stage-switch availability, How to Play playback, data deletion, startup, and Multi-Man records. Several finer frontend and mode mappings remain unverified. This review covers only the twelve assigned links.

### shard-main__melee__gm__gmmain_lib-057-retry180539
Reviewed the twelve assigned links, not the entire translation unit. Current bodies and callers support save-backed record access, Multi-Man result persistence, Target Test completion-state updates, unlock-history timestamps, trophy notices, stage-unlock masks, and menu availability predicates. Three Adventure/All-Star completion-record mappings remain unresolved because the historical gmregclear.c citation ranges no longer contain the claimed completion paths.

### shard-main__melee__gm__gmmain_lib-058-retry180539
The reviewed functions expose shared save fields, clear persistent statistics and flags, provide the BGM selection restored after Gallery playback, and initialize reset-related runtime state. Caller reads confirm record-screen consumption and multi-man score storage. Several narrower gameplay mappings and the compiled .sdata2 association remain unverified; this review covers only the assigned links.

### shard-main__melee__gm__gmmain_lib-059-retry180539
Reviewed the twelve assigned links only. Current code supports persistent-record resets, Erase Data reset calls, Versus initialization, Multi-Man record access, the stock-match records row, All-Star menu gating, and filtered video selection. Adventure and Cruel-specific mappings remain deferred because the inspected current evidence does not establish those specific gameplay identities.

### shard-main__melee__gm__gmmain_lib-060-retry180539
Reviewed the 12 assigned links against current canonical bodies and selected consumers. The code exposes persistent record storage, initializes language settings from disc content, selects video descriptors, aggregates reset helpers, and supplies notification timestamps and Multi-Man completion flags. Several historical citations have shifted; gameplay mappings and layout-dependent claims not established by the reads are explicitly deferred. This is not complete TU coverage.

### shard-main__melee__gm__gmmain_lib-061-retry180539
Reviewed the twelve assigned links. Current bodies expose save-backed records, initialize name statistics and trophy storage, maintain a sound-test selection, and provide shared match rules. Caller reads confirm the two Misc. Records rows, player-name initialization, sound-test storage, and a character-availability dependency. Notification presentation, the All-Star score dependency, and compiled .sdata attribution remain deferred. This review does not establish complete translation-unit coverage.

### shard-main__melee__gm__gmmain_lib-062-retry180539
The reviewed functions expose save-backed fighter records, event results, notification flags, trophy timestamps, and stage-selection settings. Callers demonstrate event-result presentation, trophy registration, and Multi-Man completion updates. Video configuration and conditional BGM selection are implemented, but their precise Deflicker-layout and Menu 2 mappings remain unverified. This review covers only the twelve assigned links.

### shard-main__melee__gm__gmmain_lib-063-retry180539
Reviewed the twelve assigned concept links against current function bodies and selected callers. Confirmed data-deletion reset participation, Adventure character-selection storage, prize-notification consumption, Home-Run result maximization, handicap resets, and the deflicker setter. Remaining gameplay mappings require additional caller-chain evidence; historical line ranges have shifted. This is bounded link review, not complete TU coverage.

### shard-main__melee__gm__gmmain_lib-064-retry180539
The reviewed functions expose save-backed fighter records, completion flags, indexed registration bits, controller preferences, and name statistics. Callers substantiate Multi-Man record handling, unlock-state reconciliation, progressive video configuration, and an Erase Data reset branch. Adventure and Target Test mappings, and the Random Stage Switch feature identity, remain deferred where current reads establish storage operations but not the complete gameplay mapping. This review covers only the assigned links.

### shard-main__melee__gm__gmmain_lib-065-retry180539
The reviewed functions expose persistent settings and name-profile records, reset profile statistics, manipulate indexed persistent flags, test a 25-bit completion mask, and select a BGM value before leaving the title screen. Current callers confirm saved-language access and records-menu consumption. Several gameplay-specific mappings remain deferred because numeric identifiers or an unverified wrapper do not establish their meanings. This review covers only the assigned links, not the entire translation unit.

### shard-main__melee__gm__gmmain_lib-066-retry180539
Reviewed the twelve assigned links against current source. The functions expose persistent counters, character-indexed masks, record pointers, and timestamped registration bitsets. Confirmed Stamina result accounting, character-unlock predicate consumption, and save-data descriptor installation. Several gameplay identities and compiled-section ownership claims remain explicitly deferred.

### shard-main__melee__gm__gmmain_lib-067-retry180539
The reviewed functions expose mutable save fields, maintain per-fighter flags and aggregate completion predicates, record first-time indexed acquisitions, and initialize shared game-manager state. Current unlock-selection code consumes the indexed completion query. Gameplay mappings not established by authenticated caller reads remain explicitly unresolved; this is not complete TU coverage.

### shard-main__melee__gm__gmmain_lib-068-retry180539
GetPersistentNameData maps a saved-name index into banks of 19 persistent name records. gmMainLib_8015D9F4 sets a runtime bit consumed by the prize flow, which records previously unrecorded trophies, sets their unlock state, and builds prize entries. This review covers only the two assigned links.

Status: researched; no-change lead bypass; independent review and live promotion pending.
