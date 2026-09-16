# Disjoint Librarian Research

### shard-main__melee__pl__player-000
Reviewed canonical and rendered player.c lines 1–480, with lines 481–486 read to finish the boundary function; this is not complete TU coverage.

This region defines character-to-fighter mappings, player-slot storage, slot validation, and early entity-management helpers. Mapping entries provide primary and optional extra fighter IDs, with a separate transformation flag. Human/CPU slot helpers dispatch ftLib operations to each non-null entity selected through the two transformed indices; a bulk helper processes slots 0–5. Player_800319C4 tests whether both indexed entities are present or both are absent, depending on its argument.

Player_80031AD0 creates a primary fighter and an optional extra fighter from mapping data, sets flags.b2 when an extra ID exists, updates player_state, and conditionally invokes the slot callback. Other helpers forward mapped IDs and color to ftData routines, forward two arguments to a Kirby routine, or invoke a callback for each mapped ID in slots with nonzero player_state.

Entity-management code conditionally calls ftCo_800D4F24 before HSD_GObjPLink_80390228, clears an indexed entity pointer and conditionally resets player_state, and dispatches ftCo_800D4FF4 using primary/secondary conditions. Remaining functions expose state, character and slot-type fields, wrap entity predicates, conditionally override the returned slot type with literal 1, and select primary versus extra fighter IDs.

### shard-main__melee__pl__player-001
Reviewed canonical and rendered player.c lines 481–960, with boundary-function context; this is not complete TU coverage.

This range primarily implements player-slot accessors and state propagation. Character lookup selects one of two mapping entries; the slot-based variant indexes a cast data object by player_character. Position access uses transformed[] as an indirection into stored poses: readers select transformed[0], while setters update either one selected entry or both. Two variants additionally call fighter-library helpers for each non-null selected entity. Facing direction, scale, CPU level and CPU type have setters that store slot state and forward values to both non-null selected entities; separate facing and model-scale setters only change stored state. Conditional facing assignment occurs only when its boolean argument is false.

The remaining functions directly access named position fields, unk4E, costume/controller/team/player identifiers, handicap, unk50, attack/defense ratios and stocks. Player_80032BB0 divides a fighter-helper result by stored model_scale without a local null or zero check. Player_80033BB8 delegates directly to gm_8016C5C0. Most accessors call Player_CheckSlot before indexing; Player_GetP1Stock directly reads slot zero.

### shard-main__melee__pl__player-002
Reviewed canonical and rendered player.c lines 961–1440 only. This range implements per-slot counters, mapped entity/stamina/fall access, flag accessors, and conditional bookkeeping. Stock loss decrements only positive values. Coin and unknown-counter accessors directly read or write slot fields. Entity, damage, and indexed fall operations use transformed[] as an indirection; swapping transformed entries changes that mapping. Player_SetHUDDamage writes both mapped stamina entries and calls ftLib_800870F0 for each non-null mapped entity. Remaining-HP getters subtract mapped damage from the named stamina value and clamp negative results to zero. Flag accessors directly expose more_flags bits 2–6 and flagsAE bit 0. Fall aggregation includes both mapped entries only when the character-table y/z predicate holds. KO updates run only when bool_arg is false, saturate the selected counter at U32_MAX, and dispatch different status calls for identical slots, conditionally matching teams, or the remaining case. Match-frame recording requires a false condition and the exact sentinel expression `(match_frame_count + 0x10000) == 0xffff`. The suicide-count setter rejects values outside 0–65535 before checking the slot.

### shard-main__melee__pl__player-003
Reviewed canonical and rendered player.c lines 1441–1920 only. This range primarily provides slot-checked access to player fields and embedded statistics, plus wrappers dispatching through transformed entity indices. The opening fragment conditionally increments suicide_count below 0xffff and calls ifStatus_802F6C04 only after an increment. Player_800353BC tests both player_state == 2 and flags.b0; Player_8003544C additionally requires a false condition argument. Field accessors cover nametag_slot_id, several flag bits, unk4C/unk4D, and struct_func. Statistics getters return addresses within the player record, including an explicitly cast view of stale_moves. Entity queries use transformed[0]; two queries supply explicit null-entity fallbacks (-1 and 6), while other wrappers forward without local null checks. Three operations iterate both transformed indices and forward an argument for each non-null entity. Joystick counters use transformed[index]. Player_GetUnk45 returns unk45 only for Gm_PKind_Human and otherwise returns 4. The final fragment begins resetting player state and character and zeroing a selected position component; the rest of initialization lies outside this shard.

### shard-main__melee__pl__player-004
Reviewed canonical and rendered player.c lines 1921–2133, with preceding reset-function context; this is not complete TU coverage.

- The reset tail clears positions, counters, selected flags, entity references and the callback field; restores transformation indices to 0/1; sets attack/defense ratios and model scale to 1; and assigns explicit defaults including match_frame_count = -1. Position clearing uses the pre-reset transformation indices, whereas subsequent pointer-based index accesses observe the restored indices.
- Two slot-reset wrappers then call distinct pl routines. All-player initialization first invokes the stale/attack initialization routines, then resets each slot and calls pl_8003891C. A separate initializer configures Player_AllocData with arguments 8 and 4 before fighter initialization.
- Archive loading resolves a symbol and stores its dereferenced result in pl_804D6470. Character-indexed archive forwarding always uses the selected entry's x value and conditionally forwards y when y != -1 and z == 0.
- Player_80036EA0 returns NULL for a missing primary mapped entity; otherwise it returns ftLib_800865F0(entity).
- Player_80036F34 and Player_80037054 mark the slot Gm_PKind_Demo and create an entity from the character's primary internal ID. They conditionally create a second entity when an extra ID exists and the mapping's has_transformation field is zero. Their visible difference is the allocation descriptor's b0 value (0 versus 1). Neither explicitly clears entity[1] when the conditional creation is skipped.

### shard-main__melee__pl__player-005
Reviewed canonical and rendered `src/melee/pl/player.h` lines 1–313 only. This header defines `StaticPlayer` and the player module's public declarations. The record groups character/slot configuration, four positions accessible by name or index, facing and model parameters, four signed 16-bit damage/stamina entries, counters, three bitfield groups, two entity pointers, a slot callback, and an embedded stale-move table. The API declares slot-oriented accessors and mutators, entity and indexed-stat interfaces, initialization entry points, and archive/object-related interfaces. These are declaration-level observations, not verification of implementation behavior or complete TU coverage.

### shard-main__melee__pl__player-006-recovery8-retry155554-split1603-0
The assigned storage subjects support mutable player-slot records, allocator initialization, character-indexed primary/optional-secondary fighter creation, and publication of a common-data pointer loaded from PdPm.dat. Slot reset establishes explicit defaults rather than merely relying on static zero initialization. This review covers only the three assigned storage subjects, not the complete translation unit.

### shard-main__melee__pl__player-006-recovery8-retry155554-split1603-1
Reviewed the three assigned subjects. Slot validation reports an invalid index through an assertion. Player initialization writes zero to transformation-selected poses and fixed pose entries, and unity to four floating-point fields. Player_80031790 validates a slot and, for Human/Cpu kinds, dispatches a helper to each non-null transformation-selected entity; that helper resets input data and sets x221D_b4. The paired operation clears the flag. Exact small-data placement and the gameplay interpretation of the flag remain unverified.

### shard-main__melee__pl__player-007
The six assigned functions clear a live-fighter flag for one eligible slot or the six-slot roster, test uniform occupancy of two transformation-mapped entity positions, instantiate primary and optional secondary fighters with guarded state/callback updates, and dispatch ordinary or Kirby-specific resource preloads through character mappings. Read callers connect these operations to multiplayer slot introduction, a scripted route transition, entity removal, and pending-scene preparation. Inferred names remain semantic hypotheses, not recovered original names. This review covers only the assigned subjects.

### shard-main__melee__pl__player-008
Reviewed the six assigned player-interface subjects. They bridge Kirby resource loading, enumerate mapped fighter IDs for participating slots, tear down mapped entities, clear entity registrations and conditionally reset slot state, coordinate primary/secondary respawn initialization, and expose the primary fighter's x221F_b3 predicate to pause and Stadium-display consumers. The roster iterator reads live slot state rather than capturing a snapshot. Entity teardown delegates to a GObj removal routine that can defer removal or release user data, objects, processes, links, and the GObj allocation. This review does not claim complete translation-unit coverage.

### shard-main__melee__pl__player-009
Reviewed the six assigned subjects. Player_8003221C is a read-only state-and-Fighter-bit predicate used by bonus calculations. Player_800325C8 directly selects primary or extra fighter mapping IDs. Player_8003248C and Player_80032610 instead use a legacy cast over data-section strings; their intended mapping interpretation requires compiled-layout verification. The two coordinate setters copy a vector into both transformation-mapped pose entries or one explicitly selected entry. This is bounded subject coverage, not complete TU coverage.

### shard-main__melee__pl__player-010
Reviewed the six assigned player functions, not the complete TU. The position commands update both transformation-mapped cached poses, then either request guarded fighter reset processing or directly copy the position into live fighters. The scale accessor divides effective fighter X scale by the slot multiplier. The selector getter/setter connects respawn setup to direct-position versus stage-anchor Rebirth positioning. The final wrapper delegates to a cached, team-dependent game-mode query; its precise rank interpretation remains deferred pending backing-layout verification.

### shard-main__melee__pl__player-011
Reviewed the six assigned player queries. Two evaluate player_state == 2 and flags.b0, with one allowing caller suppression. Four select player_entity through transformed[0] and expose fighter eligibility, nametag height, fighter kind, or damage-source slot. The kind and damage-source queries explicitly handle a missing entity with -1 and 6 respectively. Current consumers confirm standings storage, nametag visibility and positioning, and paired stock-loss HUD models. This is bounded subject coverage, not complete TU coverage.

### shard-main__melee__pl__player-012
Reviewed six assigned player wrappers. Three dispatch values independently to existing entities selected by both transformed mappings: visibility, dmg.x1958, and x2228_b5. Two query the primary mapped fighter's camera subject, respectively testing pos against zero-margin camera bounds and copying bone_pos. The final wrapper resets the core player record before invoking extended bookkeeping initialization. Rendering callers confirm isolated fighter captures and magnify-position consumption. This is bounded subject coverage, not complete TU coverage.

### shard-main__melee__pl__player-013-retry154703
Reviewed the six assigned subjects, not the complete translation unit. They coordinate slot reset and reference cleanup, initialize player/fighter allocators, publish player common data, prepare demo archive resources, query the selected fighter's bone-4 joint, and instantiate demo fighters. The demo-resource wrapper uses a synthetic overlay rooted at a string symbol; its equivalence to the separately declared mapping table remains unverified. The reset cleanup also removes xD6C references, omitted from the baseline data-flow description.

### shard-main__melee__pl__player-014
Reviewed the six assigned subjects. Player_80037054 installs demo fighter objects using b0 = 1 and conditionally creates a second mapped object. The five accessors return embedded action statistics or stored attack-ratio, coin, controller, and costume values after calling Player_CheckSlot. The accessor bodies do not update player state. Display-specific and gameplay-consumer interpretations remain deferred where current caller evidence was not established.

### shard-main__melee__pl__player-015
Reviewed the six assigned accessor subjects, not the complete translation unit. CPU configuration and defense-ratio accessors return slot-local fields after bounds checking. Entity accessors translate logical positions through the mutable transformed mapping; damage uses the same primary mapping and feeds the live fighter percent field. Neighboring routines swap mappings, synchronize both stored damage entries, and calculate nonnegative remaining HP.

### shard-main__melee__pl__player-016
The six reviewed accessors check the player slot and read stored facing direction, mapped falls counters, or individual flags. Player_GetFalls conditionally sums two mapped counters using a character-indexed y/z predicate; its indexed counterpart reads one mapped counter without mutation. The flags.b1 getter has paired set/clear operations and is demonstrably used to exclude slots from enemy totals in one team-elimination outcome branch. Gameplay interpretations not established by the inspected implementation remain deferred.

### shard-main__melee__pl__player-017
Reviewed the six assigned getters. Each validates its slot and returns a stored field without modifying the player record. Flags b3, b4, is_metal, b6 and b7 are declared one-bit fields; handicap is u8. Fighter creation uses b3 to select the Entry initializer after boss/transformation handling. Fighter initialization copies is_metal into is_always_metal. Broader Metal and handicap gameplay claims remain deferred where the inspected code establishes storage or transfer but not the asserted effects.

### shard-main__melee__pl__player-018-recovery7
Reviewed the six assigned player accessors. They check the owning slot and read its mapped joystick counter, indexed KO counter, recorded frame count, model scale, or more_flags bits. Fighter loading directly consumes model scale. The bit-0 consumer initializes offset-named fighter fields, but equivalence to the dedicated metal state is not established by the inspected source.

### shard-main__melee__pl__player-019
Reviewed the six assigned accessors, not the complete translation unit. Each validates its player-slot index before reading the corresponding StaticPlayer field. The more_flags accessors return b2–b6 through a bool interface; b6 is declared as a two-bit field. The b5 caller selects ftCo_800D3E40 directly on an eligible top-boundary exit, bypassing camera/random/DamageIce-dependent alternatives. The nametag accessor converts an int backing field to u8; nametag rendering uses its result to retrieve text and treats 0x78 as disabled.

### shard-main__melee__pl__player-020
Reviewed six assigned read-only accessors. Five validate a slot before returning its stored stamina baseline, character, identifier, participation kind, or state; Player_GetP1Stock directly returns slot zero's stock field. Remaining-HP logic subtracts transformed-index damage from the stamina baseline and clamps negative results to zero. Fighter creation writes state 2 and conditionally preserves state 1 after secondary creation. Gameplay claims beyond these observed operations remain explicitly deferred.

### shard-main__melee__pl__player-021
Reviewed the six assigned accessors, not the complete translation unit. They validate player slots and expose persistent records, copy stored vectors, calculate zero-clamped stamina differences using transformed indices, or return mutable stale-history storage. Read callers demonstrate additive positioning and timer-scaled movement in Rebirth physics, a guarded zero-HP test in fighter logic, and stale-history reset and deduplicated circular insertion.

### shard-main__melee__pl__player-022
The six assigned accessors select slot-indexed player storage after calling Player_CheckSlot. Four return stored scalar fields; the stale-table accessor returns a mutable typed alias without modifying storage. Player_GetUnk45 returns the stored byte for human slots and 4 otherwise. Read setup and effect consumers establish its use as a player/team-derived RGB-table index. Broader records, coin-lifetime, and stale-history gameplay claims remain deferred; this is not complete TU coverage.

### shard-main__melee__pl__player-023
Reviewed the six assigned player accessors and relevant consumers. All validate the slot before accessing its StaticPlayer record. unk4C initializes the fighter Entry countdown; unk4D and unk98 are simple integer-property getters. unk50 supplies a floating-point initialization setting now assigned to PlayerInitData.defense_ratio. GetUnk6A8Ptr exposes an embedded, mutable statistics block used for accumulation, threshold checks, queries and resets. unk9C accumulates deducted coin counts and is copied into match-end standings. This review does not cover the entire translation unit.

### shard-main__melee__pl__player-024
Reviewed the six assigned subjects, not the complete translation unit. Their bodies implement a condition-gated saturating counter increment with an interface notification, shared initialization followed by ascending per-slot setup, explicit player-record default assignments, transformation-selected position output, positive-only stock decrement, and direct attack-ratio storage. Current stale-table code confirms occurrence-ID deduplication; the debug item caller confirms position-based spawning with a +60 y offset.

### shard-main__melee__pl__player-025
The six assigned setters update scalar fields in a validated StaticPlayer slot: current coins, controller index, costume ID, defense ratio, and facing direction. The conditional facing setter skips validation and mutation when its boolean is true. Fighter_8006DA4C supplies runtime facing direction and the suppression flag to that conditional setter. Costume reads expose the stored byte as u32. Broader Coin Battle, character-selection, costume-setup, and handicap claims remain deferred where the reviewed code does not establish their complete connections. This is bounded subject coverage, not complete TU coverage.

### shard-main__melee__pl__player-026
Reviewed six assigned setters. The Falls setters replace an s32 counter selected through transformed[0] or transformed[index]. The flagsAE setters replace individual one-bit fields; flags.b0 is likewise replaced and is consumed by predicates gated on player_state == 2. The flags.b1 setter writes constant 1 and is idempotent. All six check the slot before selecting its record. Player_SetFlagsAEBit1 is declared u8 but contains no return statement. Records-screen mappings and the historical explanation for that signature remain unverified.

### shard-main__melee__pl__player-027
The four assigned flag setters validate a player slot and directly overwrite individual one-bit fields without updating live fighters. Player_SetHPByIndex replaces one transformation-mapped signed-16-bit damage entry; Player_SetHUDDamage updates both mapped entries and forwards the original integer to each existing fighter's damage-percent setter. Remaining HP is calculated by subtracting the active stored damage entry from stamina and clamping negative results to zero. Review is limited to the six assigned subjects.

### shard-main__melee__pl__player-028
The six assigned setters check a player-slot index and update one field in the global StaticPlayer array: handicap, model_scale, or more_flags.b1–b4. Model scale is assigned without arithmetic or fighter-model synchronization. The flag destinations are declared unsigned one-bit fields and their paired getters return bool. Handicap accepts s8 but stores into u8, so negative inputs undergo unsigned conversion. The detailed user-facing handicap mechanic is not established by these accessor bodies.

### shard-main__melee__pl__player-029
The six assigned setters call Player_CheckSlot before selecting a StaticPlayer. The flag setters assign to a one-bit b5 field and a two-bit b6 field. The nametag setter stores an int, while its getter returns u8. The stamina setter writes an s16 baseline used by the remaining-HP accessor in a subtraction clamped at zero. The CPU setters store into u8 fields and forward the original int argument to fighter-layer functions for each non-null entity selected through two transformed mappings. These storage conversions matter: direct assignment does not guarantee unchanged numeric storage.

### shard-main__melee__pl__player-030-retry160717-retry180539
Reviewed the six assigned setter subjects. Character, identifier, slot-kind, and secondary-position setters validate the slot and directly update its StaticPlayer storage. Facing and scale setters additionally visit both transformed-index mappings and forward the supplied value to each non-null mapped entity. Facing propagation writes fighter orientation and derives model Y rotation. The identifier getter exposes its stored value through a u8 local. Specific gameplay interpretations of character configuration, size scaling, and participation categories require additional downstream evidence.

### shard-main__melee__pl__player-031
Reviewed six player-state setters and their assigned baseline facts. Each selects a player record after calling Player_CheckSlot and replaces one field. Player_SetSuicideCount first rejects values outside 0–65535. Spawn-platform vectors are copied by value; struct_func is stored opaquely without invocation. Stocks use signed-byte storage, team accepts an s8 argument but stores a u8, and current and total coin counters are separate. The inspected item-collision caller adds an item-derived value to both coin counters before invoking their setters. Gameplay mappings and callback lifecycle claims not established by these reads remain deferred; this is not complete TU coverage.

### shard-main__melee__pl__player-032-retry154857
Reviewed the six assigned subjects. The five setters call Player_CheckSlot and directly replace fields in player_slots. Header declarations establish that unk45 is u8, unk4C and unk4D are s8, and unk98 and unk9C are s32. The damage-related caller accumulates an item-generation return value into the source player's unk98, excluding source index 6. Player_SwapTransformedStates exchanges two u8 mapping entries; entity and stamina accessors consume that mapping, and the common fighter handoff invokes the swap before exchanging form flags and transferring runtime state. Gameplay-specific coin and Transform interpretations remain deferred where the independently read code does not establish them.

### shard-main__melee__pl__player-033-retry154941
The reviewed functions clear a per-slot flag, increment a transformation-mapped joystick counter, update a saturating per-opponent KO counter and dispatch status callbacks, and conditionally capture the current frame count into a sentinel-valued player field. Reviewed lifecycle code creates primary and optional extra fighters, dispatches active-roster identifiers, and clears mapped entity pointers. This is bounded fact review, not complete translation-unit coverage.

### shard-main__melee__pl__player-034
The six assigned parameter subjects contain no baseline facts to disposition. Their canonical function bodies show slot-based entity dispatch in Player_80031848; a slot-based test for both mapped entity pointers being present or both absent, selected by arg1, in Player_800319C4; creation of a primary and optional additional fighter for a slot in Player_80031AD0; and character-mapping lookup with color forwarded to ftData_800855C8 in Player_80031CB0. This review is limited to the assigned subjects, not the entire translation unit.

### shard-main__melee__pl__player-035
The six assigned parameter subjects have no baseline facts to adjudicate. Their current function bodies show that Player_80031D2C indexes ftMapping_list using kind and forwards color with each eligible internal ID; Player_80031DA8 forwards its two arguments unchanged. Player_80031EBC uses slot to visit two transformed entity entries, conditionally calls ftCo_800D4F24, and calls HSD_GObjPLink_80390228 for each non-null entry. Player_80031FB0 uses slot to clear a transformed entity entry and conditionally sets player_state to zero. This review is limited to the assigned subjects, not the entire translation unit.

### shard-main__melee__pl__player-036
The assigned parameters belong to slot-indexed player helpers. Player_80031FB0 clears an entity pointer selected through transformed[entity_index] and conditionally resets player_state. Player_80032070 selects two different entity-call paths according to whether its boolean argument is zero. Player_8003219C forwards a predicate on transformed entity 0; Player_8003221C requires player_state == 2 and the negation of that predicate. Player_8003248C normally returns the stored slot type, with a conditional literal-1 override based on its flag, character-indexed data, and stored slot type. All six assigned subjects have empty baseline fact arrays.

### shard-main__melee__pl__player-037
The six assigned parameter subjects have no baseline facts to disposition. Their current function bodies implement a conditional slot-type return override, direct character-mapping entry selection, slot-based selection of an x/y byte through a cast data view, and copying an input vector into both transformed-indexed position entries of a selected player slot. This review covers only the assigned subjects, not the complete translation unit.

### shard-main__melee__pl__player-038
The assigned subjects have no baseline facts. The current bodies show that Player_80032768 copies an input Vec3 into both transformed-index position entries. Player_80032828 selects a player slot and copies the input vector into the position entry selected through transformed[index]. Player_800328D4 copies the input vector into both entries, then calls ftLib_80087140 for each non-null corresponding entity. No gameplay meaning or compiled register-to-parameter mapping is asserted.

### shard-main__melee__pl__player-039
The assigned subjects have no baseline facts to disposition. Current function bodies show slot-indexed access: Player_80032A04 copies an input Vec3 into both transformed position entries and forwards it for each existing entity; Player_80032BB0 divides an entity-derived float by the stored model_scale; Player_80032F30 and Player_80032FA4 read and write unk4E. This review covers only the assigned subjects, not the complete translation unit.

### shard-main__melee__pl__player-040
The assigned subjects have no baseline facts. Their current function bodies use a slot argument to forward to gm_8016C5C0, test player_state == 2 together with flags.b0, or query the entity selected by transformed[0]. Player_8003544C additionally takes a condition argument: a true condition returns false without checking or accessing the slot. No gameplay interpretation or register-to-source parameter mapping is proposed.

### shard-main__melee__pl__player-041
The six assigned parameter subjects have no baseline facts to disposition. The four canonical functions validate a player-slot argument and index player_slots. Player_80036394 and Player_80036428 query the entity selected by transformed[0], returning -1 and 6 respectively when absent. Player_800366DC forwards its s32 second argument to ft_80087AC0 for each present transformed entity; Player_80036790 similarly forwards an f32 second argument to ftLib_80086A4C. This review covers only the assigned subjects, not the entire translation unit.

### shard-main__melee__pl__player-042
The assigned parameters belong to four player-slot wrappers. Player_80036844 validates the slot and forwards its second argument to ft_80087BAC for each non-null entity selected through the two transformed indices. Player_800368F8 validates the slot and returns ftLib_80086BB4 for the entity selected by transformed[0]. Player_80036978 similarly forwards that entity and its Vec3 pointer to ftLib_80086B90. Player_80036CF0 forwards its slot to Player_InitOrResetPlayer and then pl_8003891C. All six assigned subjects have empty baseline fact lists; there are no fact IDs to disposition.

### shard-main__melee__pl__player-043
The six assigned parameter subjects have no baseline facts to disposition. Current source shows Player_80036D24 forwarding its slot to two routines; Player_80036E20 indexing a table with ckind and forwarding archive and arg2 to one or conditionally two ftDemo_SetArchiveData calls; Player_80036EA0 selecting a slot's entity through transformed[0] and returning NULL when absent; and Player_80036F34 using a slot to construct and store one or conditionally two fighter entities. This review is limited to the assigned subjects.

### shard-main__melee__pl__player-044
The bundle contains six parameter subjects and no baseline facts, so there are no fact IDs to disposition. In the inspected creation routines, the slot selects the player record and is copied into the allocation descriptor; the second argument is copied into `plAllocInfo2.unk8`. Both routines create a primary entity and conditionally an additional entity from the character mapping, differing in the descriptor's `b0` value. No parameter-register mapping or additional gameplay meaning is asserted.

### shard-main__melee__pl__player-045
The six assigned getter parameters are source-level player-slot selectors: each getter checks `slot` and indexes `player_slots`. Five return the selected record's controller index, costume ID, CPU level, CPU type, or defense ratio. `Player_GetDamage` instead reads `staminas.byIndex[transformed[0]]`. All six assigned subjects have empty baseline fact lists; there are no baseline fact IDs to disposition.

### shard-main__melee__pl__player-046
The bundle contains six parameter subjects, all with empty baseline fact arrays; there are no baseline fact IDs to disposition. In the inspected entity accessors, the slot selects a player record after validation. Player_GetEntity returns the entity selected by transformed[0], while Player_GetEntityAtIndex uses the supplied index to select a transformed entry before looking up the entity. This is a bounded review, not complete translation-unit coverage.

### shard-main__melee__pl__player-047-retry160717
The six assigned parameter subjects have no baseline facts to disposition. Current canonical bodies show that the five flag getters take a player-slot index, validate it with Player_CheckSlot, and read the corresponding flags or flagsAE member from player_slots[slot]. Player_GetFallsByIndex uses its second parameter to index transformed, then uses that result to select the falls element. This review is limited to the assigned subjects; it does not establish gameplay meanings for the flag bits or compiled register assignments.

### shard-main__melee__pl__player-048
The assigned getter parameters select a player slot, checked by Player_CheckSlot before indexing player_slots. Player_GetFlagsBit5, Player_GetFlagsBit6, and Player_GetFlagsBit7 return flags.is_metal, flags.b6, and flags.b7 respectively. Player_GetHandicap reads handicap through a u8 local and returns it as int. Player_GetJoystickCountByIndex additionally takes an index, maps it through player->transformed, and returns the corresponding joystick_direction_input_count element; the getter does not explicitly validate this second index. All six assigned subjects have empty baseline fact arrays, so there are no baseline fact IDs to disposition. This review covers only the bounded subjects, not the complete translation unit.

### shard-main__melee__pl__player-049
The assigned subjects belong to five getter functions. Each passes its slot argument to Player_CheckSlot and uses it to select player_slots[slot]. Player_GetKOsByPlayerIndex additionally indexes kos_by_player using idx. The remaining getters return match_frame_count, model_scale, more_flags.b0, or more_flags.b1. All six assigned subjects have empty baseline fact lists; there are no baseline fact IDs to disposition.

### shard-main__melee__pl__player-050
The bundle contains six parameter subjects and no baseline facts. Player_GetNametagSlotID takes an integer slot, checks its bounds, selects player_slots[slot], and returns the stored nametag_slot_id converted to u8. The five assigned MoreFlags getter parameter identities remain unverified; the inspected getter region declares and defines MoreFlagsBit0 and MoreFlagsBit1, not the assigned Bit2–Bit6 getters. No gameplay meanings or register bindings are inferred from those identity names.

### shard-main__melee__pl__player-051
The six assigned parameter subjects have no baseline facts to disposition. Their canonical functions take a slot argument, validate it with Player_CheckSlot, and index player_slots. Player_GetPtrForSlot returns the selected record's address; the other five return its stored player state, character, slot type, player ID, or stamina field. This review is limited to the assigned subjects, not complete TU coverage.

### shard-main__melee__pl__player-052
The assigned parameters belong to slot-indexed HP and position getters. Both HP getters subtract a transformed-index-selected stamina entry from the stored stamina value and clamp negative results to zero; the indexed variant accepts the transformation-map index explicitly. The position getters copy their respective stored Vec3 fields into a caller-provided destination. All four functions pass the slot argument through Player_CheckSlot before indexing player_slots. The bundle contains six subjects and no baseline facts to disposition. This review does not claim full TU coverage.

### shard-main__melee__pl__player-053
The six assigned subjects have no baseline facts to disposition. Current canonical bodies show that GetSpawnPlatformPos copies a stored vector into its output pointer; the other five getters use a slot argument to select player_slots after Player_CheckSlot. They return the stored stocks, suicide count, team, or a pointer to the embedded stale_moves object. Both stale-table getters address the same object, with the second explicitly casting the pointer to pl_StaleMoveTableExt_t*. This review is limited to the assigned subjects.

### shard-main__melee__pl__player-054
The six assigned parameter subjects have no baseline facts to disposition. Their current function bodies take a slot argument, call Player_CheckSlot, and use it to select player_slots[slot]. GetTotalCoins, GetUnk4C, GetUnk4D, and GetUnk50 return the corresponding stored field. GetUnk45 returns unk45 for Gm_PKind_Human and otherwise returns 4. GetUnk6A8Ptr returns the address of stale_moves.x5EC within the selected player. This review is limited to the assigned subjects, not the entire translation unit.

### shard-main__melee__pl__player-055-retry160717
The fully read bundle assigns six parameter subjects, all with empty baseline fact arrays. There are no baseline facts to retain, supersede, reject, or mark unresolved. No new parameter semantics or register-to-source-parameter mappings are asserted.

### shard-main__melee__pl__player-056
The assigned subjects concern four slot-based helpers: Player_LoadPlayerCoords copies the stored position selected by transformed[0] into its output vector; Player_LoseStock decrements stocks only when positive; Player_SetAttackRatio and Player_SetCoins directly assign their supplied values to the selected player record. All six assigned subjects have empty baseline fact arrays, so there are no fact IDs to disposition. This review does not claim complete translation-unit coverage.

### shard-main__melee__pl__player-057
The three assigned setters check the slot and directly assign their second source-level argument to the selected player record's controller_index, costume_id, or defense_ratio field. Their source signatures use int for the slot and respectively s8, int, and f32 for the value. All six assigned parameter subjects have empty baseline fact lists; there are no baseline facts to disposition. This review covers only these setters and their slot-check helper, not the entire translation unit.

### shard-main__melee__pl__player-058
The reviewed setters select a player record using a checked slot. Player_SetFacingDirection writes the supplied floating-point direction directly; Player_SetFacingDirectionConditional performs both the slot check and write only when its boolean argument is false. Player_SetFalls writes the supplied count to falls[transformed[0]]. All six assigned parameter subjects have empty baseline fact lists, so there are no baseline facts to disposition. This review covers these bodies, not the complete translation unit.

### shard-main__melee__pl__player-059
The assigned subjects have no baseline facts. Current source shows that Player_SetFalls writes its supplied s32 value to falls[transformed[0]] for the selected player slot. Player_SetFallsByIndex instead selects the destination through transformed[index]. Player_SetFlagsAEBit0 assigns its u8 input to the selected player's flagsAE.b0 bitfield. All three call Player_CheckSlot before selecting player_slots[slot]. This review covers these bounded subjects, not the complete translation unit.

### shard-main__melee__pl__player-060
The assigned subjects concern parameters of four per-slot flag setters. Each setter passes its slot argument to Player_CheckSlot and indexes player_slots. Player_SetFlagsAEBit1 assigns its u8 input to flagsAE.b1; Player_SetFlagsBit0 assigns its bool input to flags.b0; Player_SetFlagsBit1 sets flags.b1 to one; Player_SetFlagsBit3 assigns its u8 input to flags.b3. All six assigned subjects have empty baseline fact arrays, so there are no baseline facts to disposition. This review does not establish gameplay meanings or compiled register bindings.

### shard-main__melee__pl__player-061
The assigned subjects concern parameters of four player-flag setters. Each canonical function takes an s32 slot and a u8 value, checks the slot, selects player_slots[slot], and assigns the value to flags.b3, flags.is_metal, flags.b6, or flags.b7 respectively. The entire bundle was read; all six assigned subjects have empty baseline fact lists, so there are no fact IDs to disposition. This review does not establish register bindings or gameplay meanings and does not claim complete TU coverage.

### shard-main__melee__pl__player-062
The six assigned parameter subjects contain no baseline facts. Current source shows that Player_SetFlagsBit7 assigns its second argument to the selected player's flags.b7 field. Player_SetHPByIndex uses its first argument as the player slot, its second as an index into transformed[], and its third as the value stored in the corresponding staminas.byIndex element. Player_SetHUDDamage uses its first argument as the player slot and writes its second argument to both transformation-mapped stamina entries, also passing that value to ftLib_800870F0 for each non-null mapped entity. This review covers these setters, not the entire translation unit.

### shard-main__melee__pl__player-063
The three assigned setter families validate a slot, select player_slots[slot], and directly assign their second source parameter to handicap, model_scale, or more_flags.b1. Their source signatures respectively use s8, f32, and u8 values. All six assigned parameter subjects have empty baseline fact lists; there are no baseline facts to disposition. This review covers only the bounded subjects, not the complete translation unit.

### shard-main__melee__pl__player-064
The three setters take an s32 slot and a u8 value, validate the slot through Player_CheckSlot, and assign the value to that player's more_flags.b2, b3, or b4 field respectively. All six assigned parameter subjects have empty baseline fact lists; there are no baseline facts to disposition. This review does not establish gameplay meanings or compiled register bindings.

### shard-main__melee__pl__player-065
The three assigned setters call Player_CheckSlot on their first source parameter, use it to index player_slots, and assign their second parameter to more_flags.b5, more_flags.b6, or nametag_slot_id. The flag parameters are declared u8; both nametag setter parameters are int. The header declares b5 as a one-bit field and b6 as a two-bit field. All six assigned parameter subjects have empty baseline fact lists, so there are no baseline facts to retain or change. This review does not establish compiled register bindings or gameplay meanings for the flag fields.

### shard-main__melee__pl__player-066
The fully read bundle assigns six parameter subjects: r3 and r4 for Player_SetOtherStamina, Player_SetPlayerAndEntityCpuLevel, and Player_SetPlayerAndEntityCpuType. All six have empty baseline fact lists, so there are no fact IDs to assess. No new semantic claims or proposals are made.

### shard-main__melee__pl__player-067
The three reviewed setters check the slot before accessing player_slots. Player_SetPlayerCharacter stores its CharacterKind argument in player_character; Player_SetPlayerId stores its integer argument in player_id. Player_SetPlayerAndEntityFacingDirection stores its floating-point argument in facing_direction and passes it to ftDemo_SetFacingDirection for each non-null entity selected through the two transformed indices. All six assigned parameter subjects have empty baseline fact lists; there are no baseline facts to disposition.

### shard-main__melee__pl__player-068
The bundle assigns six parameter subjects and contains no baseline facts. Canonical Player_SetSlottype checks the slot and stores its Gm_PKind value in that player's slot_type. Player_SetSomePos checks the slot and copies the supplied Vec3 into some_other_player_pos. The inspected scale setter is named Player_SetModelScale, not the assigned Player_SetScale; it stores an f32 in model_scale. No parameter-register correspondence or alias is asserted.

### shard-main__melee__pl__player-069
The three assigned setters validate a slot and select its player record. Player_SetSpawnPlatformPos copies the supplied vector into player_poses.byVecName.spawn_platform_final_pos; Player_SetStocks assigns the supplied integer to stocks; Player_SetStructFunc stores the supplied void pointer in struct_func without invoking it. All six assigned parameter subjects have empty baseline fact arrays, so there are no baseline fact IDs to disposition.

### shard-main__melee__pl__player-070
The assigned subjects concern parameters of three per-slot setters. Player_SetTeam writes its s8 team argument into the selected player's team field. Player_SetTotalCoins writes its int coins argument into total_coins. Both validate the slot before accessing player_slots. Player_SetSuicideCount first rejects values outside 0–65535, then validates the slot and assigns suicide_count. All six assigned subjects have empty baseline fact lists; there are no baseline fact IDs to disposition. This review does not claim full translation-unit coverage.

### shard-main__melee__pl__player-071
The three assigned setters check a player-slot index, select player_slots[slot], and directly assign their second argument to unk45, unk4C, or unk4D. Their source signatures use s32 for slot and respectively int, u8, and s8 for the stored argument. All six assigned parameter subjects have empty baseline fact arrays; there are no baseline facts to disposition. This review does not establish gameplay meanings or compiled register mappings.

### shard-main__melee__pl__player-072
The assigned subjects have no baseline facts to disposition. Canonical source shows that Player_SetUnk98 and Player_SetUnk9C take a slot and an s32 value, check the slot, and directly assign the value to the corresponding player field. Player_SwapTransformedStates takes a slot and two s32 indices and exchanges the selected transformed-array entries; it does not exchange the underlying entity objects. This review is limited to the assigned subjects, not the entire translation unit.

### shard-main__melee__pl__player-073
The assigned subjects have no baseline facts. Their containing functions swap two entries of a player's transformed-index mapping, clear flags.b1, increment a counter selected through the transformed-index mapping, and conditionally increment a per-player KO counter with saturation and branch-dependent status calls. This review covers only the bounded subjects, not the complete translation unit.

### shard-main__melee__pl__player-074
The fully read bundle assigns three parameter subjects: Player_UpdateKOsBySlot#r5, Player_UpdateMatchFrameCount#r3, and Player_UpdateMatchFrameCount#r4. Each has an empty baseline fact list. There are therefore no assigned fact IDs to retain, supersede, reject, or mark unresolved. No parameter semantics or register-to-parameter mappings are asserted.

### shard-main__melee__pl__player-075
The reviewed player routines provide roster-to-fighter mapping and resource-loading support, revival-platform configuration, transformed-entry falls access, player-slot and nametag associations, input-flag release, magnify position access, and stale-attack initialization. Current implementations and relevant consumers support the twelve assigned concept links. This is bounded link review, not complete translation-unit coverage.

### shard-main__melee__pl__player-076
Reviewed the twelve assigned concept links against current canonical bodies and selected consumers. The player routines provide transformed-entity damage/HP accounting, demo fighter creation, slot classification, scale normalization, entry timing, visibility propagation, falls aggregation, pause eligibility, and a fighter joint used by the Toy Fall scene. The cast-based identity-table interpretation remains unresolved. This review does not establish complete translation-unit coverage.

### shard-main__melee__pl__player-077
Reviewed the twelve assigned concept links against current canonical source. The reviewed routines connect player-slot configuration to fighter construction, transformed entity selection, facing updates, CPU level, handicap, metal initialization, KO statistics, and stale-move history. The revival-platform interpretation remains deferred because the inspected setter establishes vector storage but not its gameplay consumer. This is bounded link review, not complete translation-unit coverage.

### shard-main__melee__pl__player-078
This bounded review covers player-slot accessors and bridges for archive loading, live fighter identity, costume selection, KO counters, slot categories, and nametag visibility. The source also contains Kirby-specific preload routing. Several broader gameplay interpretations remain unverified; this is not complete TU coverage.

### shard-main__melee__pl__player-079
Reviewed the twelve assigned links. The inspected code provides per-player stock and death accounting, transformed-index entity dispatch, stamina subtraction with zero saturation, and flag predicates consumed by fighter initialization or blast-zone handling. Several specific gameplay mappings remain unverified; this review does not establish complete TU coverage.

### shard-main__melee__pl__player-080-retry161335-retry180539
Reviewed the twelve assigned links, not the entire translation unit. The inspected player interfaces store slot configuration, expose transformed-index falls counters, maintain coin balances and loss bookkeeping, and supply fighter initialization state. DamageSong consumes the delegated player value in its mash-escape timer calculation. The precise interpretation of the stored match-frame value remains deferred.

### shard-main__melee__pl__player-081
Reviewed the twelve assigned links against current canonical code. The bounded excerpts establish slot-based fighter creation, transformation-indexed entity dispatch, rebirth-position contribution, scale propagation, stock decrement, and falls-counter storage. Bonus, ratio, stamina-defeat, and demo-resource mappings retain evidence gaps described below; this is not complete TU coverage.

### shard-main__melee__pl__player-082
Reviewed the twelve assigned links, not the entire translation unit. Current bodies confirm stock and self-destruct accessors, transformation-indexed entity and position operations, coin-loss accumulation, and a slot flag used in team elimination accounting. More specific copy-ability, handicap, revival-platform, and KO-attribution claims require additional caller or callee verification.

### shard-main__melee__pl__player-083
Reviewed the twelve assigned links against current player routines and selected downstream code. The verified relationships cover transformed-form indexing, facing state, falls storage, input reset/control, CPU-setting propagation, costume-index forwarding, and nametag positioning. Coin bookkeeping is visible, but several stronger mechanic claims require additional evidence. This is bounded link review, not complete TU coverage.

### shard-main__melee__pl__player-084
Reviewed the 12 assigned links, not the entire translation unit. The inspected player routines expose persistent slot settings, transformed entity mapping, indexed damage and stamina state, and stale-table storage. Read callers confirm participation in bonus checks, offscreen magnification, and fighter-state handoff. Some broader gameplay interpretations remain unverified.

### shard-main__melee__pl__player-085
The reviewed code maps Zelda and Sheik to paired fighter kinds, creates primary and optional secondary slot entities, and reports the fighter kind through the slot's transformed entity index. Common-data initialization loads the named plLoadCommonData symbol from PdPm.dat and stores its first pointer entry in pl_804D6470. This review covers only the three assigned links, not the entire translation unit.

Status: researched; no-change lead bypass; independent review and live promotion pending.
