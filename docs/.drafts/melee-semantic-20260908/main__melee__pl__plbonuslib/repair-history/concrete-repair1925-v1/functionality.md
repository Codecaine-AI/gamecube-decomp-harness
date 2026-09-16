# Disjoint Librarian Research

### shard-main__melee__pl__plbonuslib-000-retry160717
Reviewed canonical and rendered `src/melee/pl/plbonuslib.c` lines 1–480 only.

- `plBonusLib_8003D514` conditionally visits the other five player slots, filters them through player/entity predicates, and sets per-player bits, including one controlled by a signed horizontal-coordinate comparison.
- `pl_8003D60C` recognizes exactly 0xA0, 0xE1, and 0xEA–0xED. Local helpers distinguish sentinel/self/same-team sources and the range [0xA1, 0xD0).
- `pl_8003D644` gathers fighter motion and context values. When `arg1 != 1`, it snapshots context into the player's extended stale-move table, updates flags and counters, and dispatches numeric bonus-record operations. It separates sentinel/self/team sources from other players, updates source-tracking fields, and gates further operations on context bits, thresholds, and category/subtype values.
- `pl_8003DF44` assigns configuration field `xB4` to another player's `xD54`, excluding sentinel, self, and same-team sources. `pl_8003DFF4` forwards its three arguments to three helpers in sequence. The following small routines dispatch conditional bonus-record calls or increment `xCD8`.
- `pl_8003E17C` maps item kinds into logging indices, applies eligibility checks, increments `x674[index]` if the player-specific item predicate is false, and increments `x710[index]` only if that predicate is false for all six slots. The range ends at the signature of `pl_8003E2CC`; its implementation is not assessed.

### shard-main__melee__pl__plbonuslib-001
Reviewed canonical and rendered `src/melee/pl/plbonuslib.c` lines 481–960 only.

- Item-log accessors read individual entries and sum the `x674` and `x710` arrays. `match_item_kind` maps common kinds directly, maps four exceptional kinds to log entries, and otherwise returns -1. `pl_8003E4A4` deduplicates supplied kinds per invocation, advances consecutive-presence counters, resets absent entries, and calls `pl_80038788` when a counter equals the configured threshold.
- Item-related handlers maintain owner-indexed counts, conditionally invoke bonus helpers, store an owner-derived value in `xD6C`, copy that value to a fighter field, and reset attribution or item counters under index gates. Numeric event and bonus meanings are not established here.
- Floating-point event handlers accumulate totals and category-specific values, update a maximum, reset elapsed counters, and maintain a sample-counted average after excluding self and same-team cases.
- `fn_8003EE2C` updates gated counters and maxima, records ground/air branches and predicate-dependent statistics, updates flags from a magnify query, tracks qualifying held-item streaks, and advances or decrements timers. A held but nonqualifying item does not take the no-item streak-finalization branch.
- `fn_8003F294` feeds action statistics, stored counters, configured parameters, and a two-component magnitude into helper calls. A successful final helper call conditionally changes `xDD1.bit5` using the frame count and `xD5C`, then sets `xD5C` to -1. Only the opening declarations of `fn_8003F53C` are assigned.

### shard-main__melee__pl__plbonuslib-002
Reviewed canonical and rendered `src/melee/pl/plbonuslib.c` lines 961–1440, with lines 957–960 supplying the opening function context; this is not complete TU coverage.

- `fn_8003F53C` conditionally sets flags from masked helper results, increments `xCF4`, lowers `xD5C` from `xD58`, and resets `xD58`.
- `fn_8003F654` accumulates position deltas under mode, index, and fighter-helper gates. One branch tracks total and maximum XY displacement, including a maximum in another returned slot; another accumulates absolute horizontal or direction-separated vertical movement. It maintains running averages of horizontal separation from eligible non-team slots and from the stage-provided camera vector. `pl_8003FAA8` invokes four update routines and updates `xC9C` using a frame-count-weighted average for index zero.
- Small entry points expose counters, set flags, accumulate absolute values, count threshold crossings, and maintain a minimum. `pl_8003FC88` implements a four-stage numeric-range recognizer: successive accepted ranges are 1–3, 6–8, 9–11, and 17–48; completion calls `pl_80038824` with 0x56 and resets state, while any mismatch resets state without retrying the input.
- Event wrappers pass fixed identifiers to `pl_80038788` or `pl_80038824`. Two wrappers first scan all six slots and act only when every queried value is zero. Other routines apply helper/threshold conditions, initialize per-slot fields, or assign and reset `xCAC`.
- `pl_8004049C` validates the player, maps selected symbolic item kinds to identifiers 0xCE–0xD6, and dispatches the selected identifier through game and player helpers; unrecognized kinds do nothing. `pl_80040614` dispatches identifier 0x2D only for a nonzero float at or below the configured threshold.

### shard-main__melee__pl__plbonuslib-003
Reviewed canonical and rendered plbonuslib.c lines 1441–1681 only. This region contains conditional bonus-helper dispatch, per-player statistics accessors, two zero-denominator-guarded calls to pl_CalculateAverage, and counter updates.

pl_8004065C guards a helper call using arg1. pl_80040688 dispatches helper calls based on a frame threshold, argument guards, a stored player identifier, a byte range, and a stored flag. Action-stat accessors expose total hits, total attacks, aerial/thrown-item/special counts, the StatsAttack_Catch entry, and total attacks minus aerial attacks. pl_80040A9C sums nine entries at offsets 3 through 11 relative to the StatsAttack_DownAttackD entry; pl_80040AF0 delegates a query with selector 0x70. Other accessors return individual stale-move-extension fields, sometimes converting to unsigned int. pl_80040B8C conditionally adds arg2 to xC68, paired with its getter; pl_80040D8C unconditionally increments xCB0, ignores arg1, and is paired with its getter.

### shard-main__melee__pl__plbonuslib-004
Reviewed the complete assigned header, `src/melee/pl/plbonuslib.h:1–103`, in canonical and rendered form. It supplies guarded function declarations, importing platform and item/player forward declarations. The interface includes functions accepting item-object pointers, item-log selectors, an item-kind value, and paired position pointers; other declarations use integer, boolean, and floating-point parameters and scalar returns. Some parameters explicitly identify a slot or index, but many are unnamed. This range contains no function bodies, storage definitions, or executable state transitions, so it establishes interface signatures rather than the gameplay meanings suggested by rendered names. Coverage is limited to this header, not the complete translation unit.

### shard-main__melee__pl__plbonuslib-005-retry180539
The assigned functions transfer guarded player bookkeeping into fighter metadata, collect recurring condition and input observations, and evaluate cumulative measurements at configured sampling boundaries. Input collection maintains sticky observations, a press count, and a minimum interval; periodic evaluation maintains decisions and saved baselines. Source-level numerical literals and switches do not establish the compiled contents of the assigned data sections. This review covers only the bounded assigned subjects.

### shard-main__melee__pl__plbonuslib-006-retry180539
Reviewed the six assigned subjects and their 36 baseline facts. These routines collect movement and spacing statistics, latch death-relative position observations, classify selected item kinds, process death-related bonus decisions, arm a source player's post-KO taunt timer, and dispatch qualifying attack hits to three detectors. Canonical bodies and relevant callers support most baseline descriptions. Two statements need scope corrections; the results-screen naming correspondence remains unresolved. This is bounded subject coverage, not complete TU coverage.

### shard-main__melee__pl__plbonuslib-007-retry180539
Reviewed the six assigned functions and their relevant producers, callers, and consumers. They record attributed shield breaks, guarded shield depletion, a low-health shield-release condition, special shield-contact counts, and item-category acquisition history; the final function reads one item-category count. Point increments and replacement writes are distinct. Item logging queries existing holder bits without setting them. This is bounded subject coverage, not complete translation-unit coverage.

### shard-main__melee__pl__plbonuslib-008-retry180539
Reviewed the six assigned subjects, not the complete translation unit. The item-log queries read one x710 category or sum the x674/x710 arrays. The evaluator uses these results in zero-total, category-equality, and global-equality tests. The batch updater normalizes item kinds, deduplicates category presence, increments or resets x7AC streaks, and calls pl_80038788 with decision 0x9D at the configured threshold. The final pair increments an owner-selected x598 entry and reads that same per-kind storage; two entries feed evaluator decisions 0xCC and 0xCD. Player-facing bonus names and the precise event represented by the x598 increment are not established by these reads.

### shard-main__melee__pl__plbonuslib-009-retry180539
Reviewed the six assigned subjects and their 35 baseline facts. These routines connect item acquisition, throwing, release, death cleanup, and accepted hits to player bookkeeping. Acquisition conditionally updates bonus entries and owner attribution, forwards qualifying item identifiers, and clears xCA8 for the primary fighter. Throwing propagates non-sentinel attribution; release clears it. Death cleanup separately clears the current qualifying-item holding count without finalizing its minimum. Hit handlers increment decision 0x9B or advance xCA8 toward an equality-triggered assignment to decision 0xC2. The specific Laser Marksman mapping and ammunition-capacity interpretation remain unverified. This is bounded subject coverage, not complete TU coverage.

### shard-main__melee__pl__plbonuslib-010-retry180539
Reviewed the six assigned subjects and their 34 baseline facts. These routines record attributed damage, qualifying bury collision measurements, damage received and peak percentage, and opponents' percentage samples; coordinate recurring per-fighter statistics collection; and expose the accumulated xCFC counter. They update player bookkeeping rather than applying live fighter damage. The recurring wrapper dispatches four collectors and conditionally averages an integer-converted damage percentage using the global frame count. Numeric attack and event categories remain numeric; inferred names are descriptive hypotheses, not recovered original symbols. This review does not claim complete translation-unit coverage.

### shard-main__melee__pl__plbonuslib-011-retry180539
Reviewed the six assigned subjects and their 32 baseline facts. These helpers expose the per-player xD00 counter, conditionally latch xDD0.bit0, recognize an ordered four-family attack sequence that increments decision 0x56, register crowd-cheer decision 0x5B, increment crowd-reaction counter xD70, and register decision 0xC4 after a guarded Hammer-drop transition. Public crowd-bonus names and one caller-count claim remain unresolved. This is bounded subject coverage, not complete TU coverage.

### shard-main__melee__pl__plbonuslib-012-retry180539
Reviewed the six assigned handlers and their relevant callers/accessors. They increment decisions 0xA and 0x4B, conditionally register decisions 0x1A and 0x82 using six-player uniqueness scans, set xDD1.bit4 after a guarded fighter-value threshold comparison, and increment decision 0x46 for an occupied-ledge denial with different-player and remembered-ledge guards. This is bounded subject coverage, not complete TU coverage.

### shard-main__melee__pl__plbonuslib-013-retry180539
Reviewed the six assigned bookkeeping hooks and their relevant caller excerpts, not the entire translation unit. They record accepted ledge catches, propagate AppealS-related bonus conditions, accumulate absolute SDI displacement components, count threshold-qualified knockback events, count mash-processing updates and active updates, and preserve a reported minimum. Fighter movement and input qualification occur in callers; these routines principally update player statistics. Camera-relative provenance, some detailed gameplay mappings, and the relative ordering of configurable ledge thresholds remain deferred.

### shard-main__melee__pl__plbonuslib-014-retry180539
Reviewed the six assigned callbacks and their baseline facts, not the entire translation unit. The callbacks arm a guarded countdown on RebirthWait exit, set decision 0xC5 during Hammer initialization, record and reset attacker attribution in xCAC, dispatch recognized item kinds into category-based bookkeeping, and set decision 0x2D when a supplied grab timer satisfies a configured threshold. Direct assignments, argument origins, guards, and bonus-table replacement/increment operations are supported. Several player-facing mappings and downstream scoring interpretations remain deferred.

### shard-main__melee__pl__plbonuslib-015-retry180539
Reviewed the six assigned functions and their relevant producers, mutators, and consumers. They conditionally increment death-related decision 0x78, apply match-finalization bonus adjustments, calculate a guarded mash-activity statistic, and expose the xCF8, xD40, and xD48 player statistics. The results evaluator compares xCF8 against the negative minimum and xD40 against a configured threshold and competing values. This is bounded subject coverage, not complete TU coverage.

### shard-main__melee__pl__plbonuslib-016-retry180539
The six assigned functions are read-only per-player queries. They expose xCB4, hit and attack totals, a zero-guarded floating-point hit/attack ratio, total attacks minus aerial attacks, and aerial attacks. The standings builder stores the raw counts and scales the ratio by 100 before an s8 conversion. Decision case 0xFD checks the unsigned xCB4 getter result for nonzero equality with rules->x7. This review covers only the assigned subjects.

### shard-main__melee__pl__plbonuslib-017-retry180539
The six assigned functions expose per-player bookkeeping snapshots to gm_80166378. Three directly return thrown_item_count, the StatsAttack_Catch counter, and specials_count. pl_80040A9C sums nine entries at offsets +3 through +11 from StatsAttack_DownAttackD in eleven loop iterations. pl_80040AF0 reads by_attack_hi[0x70] through pl_800386D8. pl_80040B3C converts xC6C to unsigned int. The standings destinations are respectively x7C, x84, x80, x88, x8C, and x40. This review does not establish complete TU coverage or user-facing action labels.

### shard-main__melee__pl__plbonuslib-018-retry180539-retry185219-retry185815
Reviewed the six assigned statistics functions and their demonstrated producers and standings consumer, not the complete translation unit. The functions expose accumulated damage, recorded maximum damage percentage, integer healing contributions, and two floating-point displacement totals. The healing writer selects the player record before excluding flagged updates. Finalization copies damage/healing values and converts movement totals to unsigned integers before multiplying by ten. Movement geometry is verified, but gameplay interpretations of the collector's numeric classification results remain deferred.

### shard-main__melee__pl__plbonuslib-019-retry180539
The six assigned functions are read-only, slot-selected statistics getters. They expose downward self-movement distance, knockback-attributed planar distance, non-airborne and airborne sample counts, the xD04 duration maximum, and the xD68 qualifying-alteration counter. Match finalization converts distance results to unsigned integers before multiplying by ten, and divides duration results by 60. Collection and eligibility checks occur in producers, not these getters. This review covers only the assigned subjects and their supporting paths.

### shard-main__melee__pl__plbonuslib-020-retry180539-retry185219
The assigned accessors expose per-player displacement maxima and a teammate-hit counter. The displacement collector updates the sampled player's xD84 and the damage-source player's xD88; match finalization scales these into standings. The teammate-hit updater increments xCB0 without a local eligibility check, while its caller checks attack-instance eligibility, teams, friendly_fire, and matching teams. Reviewed unit-level examples also maintain event counters, flags, timers, extrema, and indexed bonus values. This is bounded subject review, not complete TU coverage.

### shard-main__melee__pl__plbonuslib-021-retry180539
The six assigned parameter subjects have no baseline facts to disposition. Current source uses first arguments to select player records and second arguments to select or gate entity processing. fn_8003E998 copies a stored value into entity-associated state only for index zero and a non-sentinel stored value. fn_8003EE2C updates counters, extrema, flags, and countdowns; fn_8003F294 submits statistics and configured thresholds to evaluation helpers; fn_8003F53C records predicate results and event timing. These observations do not establish compiled register-to-parameter identities or numeric gameplay mappings.

### shard-main__melee__pl__plbonuslib-022-retry180539
The assigned subjects have no baseline facts to disposition. Canonical source shows fn_8003F53C selecting an entity by slot/index and conditionally updating flags and counters, excluding index 1. fn_8003F654 takes slot, index, and two Vec3 pointers; it accumulates coordinate differences and running horizontal-separation averages under state-dependent gates. pl_8003FAA8 forwards its corresponding arguments directly to both helpers. plBonusLib_8003D514 selects one player's entity and updates flags in other eligible players' tables using a comparison of scaled x coordinates. This review covers only the assigned parameter subjects, not the full translation unit.

### shard-main__melee__pl__plbonuslib-023-retry180539
The six assigned parameter subjects contain no baseline facts to disposition. Canonical bodies show that pl_8003D60C tests an integer against 0xA0, 0xE1, and 0xEA–0xED. pl_8003D644 uses its first two arguments to select a player entity; its first argument also selects player bookkeeping. Most processing is gated by the second argument not being 1. Its third argument is forwarded to ft_80087878, and its fourth is compared with 0x5F. The function snapshots entity-derived data and conditionally updates bookkeeping and bonus records. pl_8003DF44 uses its first argument in entity selection and self/team exclusion, then initializes another player's xD54 from configuration xB4 when the derived player is neither sentinel 6, self, nor a teammate.

### shard-main__melee__pl__plbonuslib-024-retry180539
The six assigned parameter subjects contain no baseline facts. In the inspected canonical bodies, pl_8003DF44 uses its second argument to select an entity, then conditionally copies configuration field xB4 into another player's xD54. pl_8003DFF4 forwards its three arguments unchanged to three functions in sequence. pl_8003E058 passes its third argument to pl_80038824 with 0x3F, then conditionally passes its first argument with 0x3E; its second and fourth arguments are unused in this body. Numeric values are not assigned gameplay meanings.

### shard-main__melee__pl__plbonuslib-025-retry180539
The six assigned parameter subjects have no baseline facts to disposition. The current bodies show that pl_8003E058 passes arg2 to pl_80038824 with 0x3F, then conditionally passes arg0 with 0x3E; arg3 is unused. pl_8003E0E8 calls pl_80038824(arg0, 0x40) only when arg1 is zero. pl_8003E114 calls pl_80038788(arg0, 0x41, 1) when its floating argument is at most pl_804D6470->x84; arg1 is unused. Register-labelled subject mappings and gameplay interpretations are not established by these source bodies.

### shard-main__melee__pl__plbonuslib-026-retry180539
Reviewed the canonical bodies associated with the six assigned parameter subjects. `pl_8003E114` compares its floating-point argument against `pl_804D6470->x84` and conditionally calls `pl_80038788(arg0, 0x41, 1)`. `pl_8003E150` increments the selected player's `xCD8` field and does not use its second argument. `pl_8003E17C` selects a player's table, classifies the supplied item's kind, and conditionally increments indexed `x674` and `x710` counters using item-query results; its second argument is unused. All six subjects have empty baseline fact arrays, so there are no baseline fact IDs to disposition. This review does not establish full translation-unit coverage.

### shard-main__melee__pl__plbonuslib-027-retry180539
The assigned subjects are parameters of four read-only table queries. pl_8003E2CC and pl_8003E334 forward their first argument to Player_GetStaleMoveTableIndexPtr2 and use their second argument, declared Pl_ItemLog, to index x674 and x710 respectively after asserting it is below Pl_ItemLog_Terminate. pl_8003E39C and pl_8003E420 forward their sole argument to the same table accessor and sum the respective array over indices from zero through Pl_ItemLog_Terminate minus one. All six assigned subjects have empty baseline fact lists; there are no existing facts to disposition. Coverage is limited to this bounded shard.

### shard-main__melee__pl__plbonuslib-028-retry180539
The six assigned parameter subjects have no baseline facts. Their canonical function bodies show that `pl_8003E4A4` takes a player slot, an unused boolean, an integer-array pointer supplied as `void*`, and an element count. It maps array entries to item-log indices, increments counters for indices seen in the call, resets absent counters, and invokes `pl_80038788(slot, 0x9D, 1)` when a counter reaches the configured threshold before resetting it. `pl_8003E70C` takes an item object, checks its kind and owner, and increments the owner's per-kind counter. `pl_8003E7D4` reads that counter for a supplied player index and checked kind. This review is limited to the assigned subjects, not the entire translation unit.

### shard-main__melee__pl__plbonuslib-029-retry180539
The six assigned parameter subjects have no baseline facts to assess. Canonical source shows that pl_8003E7D4 validates a kind and uses it to index a per-player counter. pl_8003E854 selects a player entity using its first two arguments, inspects the item passed as its third argument, conditionally updates tracking state, and resets xCA8 when its second argument is zero. pl_8003E978 has three source parameters but only forwards its first two to fn_8003E998; its item argument is unused. Register-labelled subject identities are not authenticated by these C bodies, so no parameter-binding facts are proposed.

### shard-main__melee__pl__plbonuslib-030-retry180539
The assigned subjects contain no baseline facts. The current pl_8003E978 body forwards slot and its second argument to fn_8003E998; its Item_GObj* argument is unused. The helper obtains the slot's table and, when index is zero and xD6C is not 6, copies xD6C into the selected fighter's x207C.y. The source explicitly questions the second argument's interpretation. No register-to-source-parameter mapping or gameplay meaning is established here.

### shard-main__melee__pl__plbonuslib-031-retry180539
The six assigned parameter subjects contain no baseline facts. Canonical pl_8003E978 forwards its first two arguments to fn_8003E998 and does not use its item pointer; the helper conditionally copies xD6C into fighter metadata. pl_8003EA08 writes 6 to the selected table's xD6C only when its second argument is zero. pl_8003EA40 conditionally calls pl_80038824 with its first argument and 0x9B; its second argument is unused. Register-labelled subject identities are not established by these C bodies, so no parameter facts are proposed.

### shard-main__melee__pl__plbonuslib-032-retry180539
The assigned subjects have no baseline facts. Their containing functions implement three small conditional updates: pl_8003EA40 calls pl_80038824(arg0, 0x9B) only when arg3 is zero and arg2 equals arg4; pl_8003EA74 clears the selected table's xD44 only when arg1 is zero; pl_8003EAAC increments xCA8 when arg1 is zero and arg2 equals 0x59, then calls pl_80038788(arg0, 0xC2, 1) if the new count equals it_8026C1D4(). These observations do not establish gameplay meanings or register-to-source parameter identities.

### shard-main__melee__pl__plbonuslib-033-retry180539
The assigned subjects have no baseline facts. In the inspected canonical bodies, pl_8003EAAC increments xCA8 only when arg1 is zero and arg2 equals 0x59, and calls pl_80038788 when the incremented count equals it_8026C1D4(). pl_8003EB30 conditionally accumulates its float input into per-player fields, applies additional numeric-category conditions, optionally updates another player's indexed accumulator and calls pl_80040ED4, then resets xD08. These observations do not establish gameplay meanings for the numeric constants or authenticate the register-labelled parameter identities.

### shard-main__melee__pl__plbonuslib-034-retry180539
The six assigned parameter subjects contain no baseline facts. In the current canonical bodies, `pl_8003EB30` conditionally accumulates its floating-point input into per-player fields, performs additional accumulation selected by integer arguments, forwards arguments to `pl_80040ED4`, and resets `xD08`. `pl_8003EC30` returns when its second argument is nonzero; otherwise, selector values 1 or 3 cause its floating-point argument to be added to the selected player's `xC98`. Register-labeled subject identities are not established as canonical C parameter mappings by these bodies.

### shard-main__melee__pl__plbonuslib-035-retry180539
The six assigned parameter subjects contain no baseline facts. In the current canonical body, pl_8003EC9C selects a player record using arg0; after an arg1 early-return guard, it adds arg3 to xC60, raises xC64 when arg2 is greater, and clears xD10. pl_8003ED0C excludes equal player indices and cases accepted by pl_CheckIfSameTeam, increments xCA4, and passes a weighted previous value plus arg2 to pl_CalculateAverage to update xCA0. Its arg1 parameter is unused. These observations describe source operations, not established gameplay meanings or register-to-parameter identities.

### shard-main__melee__pl__plbonuslib-036-retry180539
The six assigned parameter subjects have no baseline facts to assess. Canonical pl_8003ED0C excludes equal and same-team inputs, then increments xCA4 and updates xCA0 through pl_CalculateAverage using its float input. Canonical pl_8003FAA8 selects a player table, dispatches four update helpers with slot/index and position inputs, and conditionally updates xC9C using the current frame count. This review covers only the assigned subjects, not the complete translation unit.

### shard-main__melee__pl__plbonuslib-037-retry180539
The assigned subjects have no baseline facts. The inspected C bodies show that pl_8003FAA8 forwards its position pointers to fn_8003F654, which computes displacement and accumulates position statistics under explicit guards. pl_8003FBFC and pl_8003FC20 retrieve xCFC and xD00 from the selected player's table. pl_8003FC44 sets xDD0.bit0 only when its second argument is zero. pl_8003FC88 uses its first argument to select a table and advances or resets xC90 according to numeric input ranges; completing the sequence calls pl_80038824 with 0x56. No gameplay labels are inferred from these numbers.

### shard-main__melee__pl__plbonuslib-038-retry180539
The six assigned parameter subjects have no baseline facts to assess. In the canonical source, pl_8003FC88 ignores events when its second argument equals 1; otherwise its third argument is tested against ranges selected by xC90. Matching events advance that state, with the final match resetting it and calling pl_80038824(arg0, 0x56); mismatches reset it. pl_8003FDA0 forwards its first argument to pl_80038788 with constants 0x5B and 1. pl_8003FDC8 increments xD70 in the record selected by its first argument. The latter two functions do not use their second arguments.

### shard-main__melee__pl__plbonuslib-039-retry180539
The six assigned parameter subjects have no baseline facts. Their three canonical functions each accept two int parameters, forward the first parameter unchanged, and do not use the second. pl_8003FDF4 calls pl_80038788(arg0, 0xC4, 1); pl_8003FE1C calls pl_80038824(slot, 0xA); pl_8003FE40 calls pl_80038824(arg0, 0x4B). This review establishes only these local source behaviors, not gameplay meanings or compiled register assignments.

### shard-main__melee__pl__plbonuslib-040-retry180539
Reviewed the current bodies associated with the six assigned parameter subjects. `pl_8003FE64` scans indices 0–5 using selector 0x1A and calls `pl_80038788(arg0, 0x1A, 1)` only when all queried values are zero; its second argument is unused. `pl_8003FED0` performs an analogous scan with selector 0x82, additionally requiring its second argument to be zero. `pl_8003FF44` uses its first argument for state lookup and its first two arguments for entity lookup; it sets `xDD1.bit4` when the second argument is zero, the third is within 1–16, and the queried fighter value exceeds the configured threshold. All six assigned subjects have empty baseline fact lists.

### shard-main__melee__pl__plbonuslib-041-retry180539
The six assigned parameter subjects have no baseline facts. In their current canonical function bodies, pl_8003FF44 sets xDD1.bit4 when arg1 is zero, arg2 is in the inclusive range 1–16, and ft_80087A8C on the selected entity exceeds pl_804D6470->x38. pl_8003FFDC selects an entity using arg2 and arg3, then calls pl_80038824(arg0, 0x46) when arg0 differs from arg2 and arg4 differs from ft_80087A98's result; arg1 is unused. These observations do not establish gameplay meanings or register-to-source parameter identities.

### shard-main__melee__pl__plbonuslib-042-retry180539
Reviewed the six assigned parameter subjects; none contains baseline facts. In canonical source, pl_80040048 uses arg0 for entity and per-player state lookup, while arg1 selects the entity and prevents subsequent updates when nonzero. It conditionally increments xCE8 and calls pl_80038824 using threshold tests. pl_80040120 uses arg0 to select state and distinguish the current slot during a six-slot loop; arg1 equal to 1 suppresses its updates. It tests xD4C/xD54 and initializes xD50 or other active slots' xD4C. pl_800401F0 selects state through arg0 and accumulates the absolute values of its two floating-point arguments into xCDC/xCE0; arg1 is unused.

### shard-main__melee__pl__plbonuslib-043-retry180539
Read the complete bundle and current canonical bodies for the three assigned parent functions. `pl_800401F0` accumulates the absolute values of its two floating-point arguments into xCDC and xCE0 of the selected player's record; its second integer argument is unused. `pl_80040270` increments xCE4 only when its second argument is zero and its floating-point argument meets the configured x98 threshold. `pl_800402D0` increments xCEC when its second argument is zero, and additionally increments xCF0 when its third argument is nonzero. All six assigned subjects have empty baseline fact lists; there are no baseline fact IDs to disposition. Coverage is limited to this bounded shard.

### shard-main__melee__pl__plbonuslib-044-retry180539
The assigned subjects contain no baseline facts. Current source shows that pl_800402D0 gates counter updates on arg1 being zero and additionally gates xCF0 on arg2 being nonzero. pl_80040330 uses slot to select a record, skips updates for nonzero arg1, and lowers xCF8 when its float argument is smaller. pl_80040374 selects a record using arg0 and copies configuration x124 into xD60 when arg1 is zero and xD64 is not 6. These observations do not establish gameplay meanings or compiled register-to-parameter identities.

### shard-main__melee__pl__plbonuslib-045-retry180539
The assigned subjects have no baseline facts. Current source shows that pl_80040374 uses its second argument as a zero-valued gate for assigning xD60 from configuration x124, additionally requiring xD64 != 6. pl_800403C0 leaves its second argument unused and passes its first argument to Player_GetStaleMoveTableIndexPtr2 and pl_80038788 (with constants 0xC5 and 1). pl_800403FC leaves its second argument unused, obtains a table using its third argument, and conditionally stores its first argument into xCAC when its fourth argument is zero and its fifth argument is in the inclusive range 0x54–0x57. No gameplay interpretation is assigned to these numeric values.

### shard-main__melee__pl__plbonuslib-046-retry180539
The six assigned parameter subjects have no baseline facts. Their current function bodies show that pl_800403FC conditionally writes arg0 into the selected player's xCAC field when arg3 is zero and arg4 is in the inclusive range 0x54–0x57. pl_80040460 resets that field to 6 when its second argument is zero. pl_8004049C validates a player argument, maps selected ItemKind cases to record identifiers, and invokes game and player-record helpers for recognized cases. No gameplay interpretation of the numeric identifiers is asserted.

### shard-main__melee__pl__plbonuslib-047-retry180539
The assigned subjects have no baseline facts. Their enclosing canonical functions implement conditional updates: pl_80040614 ignores its boolean parameter and calls pl_80038788(arg0, 0x2D, 1) when its float parameter is nonzero and at most pl_804D6470->x4C; pl_8004065C calls pl_80038824(arg0, 0x78) only when arg1 is zero. pl_80040688 conditionally updates arg0 based on the frame count, then independently examines stored context selected by arg1 when arg2 is nonzero and arg1 is not 6, potentially updating the stored source index. Numeric identifiers are not assigned gameplay meanings.

### shard-main__melee__pl__plbonuslib-048-retry180539
The six assigned parameter subjects contain no baseline facts. In the inspected canonical bodies, pl_80040688 uses arg1 to select a player's stale-move-table extension, except when it equals sentinel 6; arg2 gates that branch. The branch inspects saved fields and conditionally invokes bonus-recording helpers. The sole argument of each assigned getter selects a stale-move-table extension: pl_800407C8 returns zero when xCEC is zero, otherwise calls pl_CalculateAverage with converted xCF0 and xCEC values; pl_80040870, pl_80040894, and pl_800408B8 return xCF8, xD40, and xD48 respectively. This is bounded body-level coverage, not complete translation-unit coverage.

### shard-main__melee__pl__plbonuslib-049-retry180539
The six assigned parameter subjects have no baseline facts. Their current functions take an `int arg0` and forward it to a statistics-record accessor. `pl_800408DC` returns `x0_staleMoveTable.xCB4`; `pl_80040900` returns `x358_hits.total`; `pl_80040924` returns `attacks.total`; `pl_80040948` passes hits and attacks totals to `pl_CalculateAverage` when the attacks total is nonzero, otherwise returning zero; `pl_80040A04` returns attacks total minus `aerials_count`; and `pl_80040A30` returns `aerials_count`. This review covers only the assigned subjects, not the entire translation unit.

### shard-main__melee__pl__plbonuslib-050-retry180539
The six assigned parameter subjects belong to functions whose canonical signatures each take one `int arg0`. Five functions pass that argument to `Player_GetActionStats`; the sixth, `pl_80040B3C`, passes it to `Player_GetStaleMoveTableIndexPtr2`. The bodies read counters, sum selected array entries, or delegate a query to `pl_800386D8`. All six subjects have empty baseline fact lists, so there are no fact IDs to disposition. Review is limited to this bounded shard.

### shard-main__melee__pl__plbonuslib-051-retry180539
The assigned parameters belong to three getters and one conditional accumulator. The getters pass their integer argument to Player_GetStaleMoveTableIndexPtr2 and read xC60, xC68, or xC64; xC60 and xC64 are converted to unsigned int. pl_80040B8C obtains the table using slot and adds arg2 to xC68 only when arg1 is zero. All six assigned subjects have empty baseline fact lists.

### shard-main__melee__pl__plbonuslib-052-retry180539
The six assigned parameter subjects belong to read-only accessors. Each function accepts an `int arg0`, passes it unchanged to `Player_GetStaleMoveTableIndexPtr2`, and returns one field from the resulting record: `pl_80040C24` reads `xD74`, `pl_80040C48` reads `xD78`, `pl_80040C6C` reads `xD7C`, and `pl_80040C90` reads `xD80`, all as `float`; `pl_80040CB4` reads `xD24` and `pl_80040CD8` reads `xD20`, both as `int`. All six subjects have empty baseline fact arrays, so there are no baseline fact IDs to disposition.

### shard-main__melee__pl__plbonuslib-053-retry180539
The assigned subjects have no baseline facts to disposition. In the current canonical bodies, pl_80040CFC, pl_80040D20, pl_80040D44, and pl_80040D68 forward their first int argument to Player_GetStaleMoveTableIndexPtr2 and return xD04, xD68, xD84, and xD88 respectively. pl_80040D8C forwards its first int argument (slot) to the same accessor and increments x0_staleMoveTable.xCB0 by one; its second int argument is unused. These observations do not establish gameplay meanings or compiled register-to-parameter identity.

### shard-main__melee__pl__plbonuslib-054-retry180539
The assigned parameter belongs to `pl_80040DB8(int slot)`. The function passes `slot` to `Player_GetStaleMoveTableIndexPtr2` and returns the selected record's `x0_staleMoveTable.xCB0`. The adjacent `pl_80040D8C` increments that same field. No baseline facts were supplied for this subject.

### shard-main__melee__pl__plbonuslib-055-retry180539
The assigned routines update player bookkeeping counters, conditionally invoke indexed bonus mutators, calculate attack/hit statistics, and sample opponents' damage percentages. Canonical caller evidence supports the damage-percentage data flow and same-team hit counter. Several more specific event descriptions remain unverified; the supplied match-finalization citation does not contain the claimed accessor use. This review covers only the assigned links.

### shard-main__melee__pl__plbonuslib-056-retry180539
The reviewed functions maintain per-player event counters, item logs, displacement aggregates and maxima, and expose statistics copied into MatchEnd player standings. Current source confirms the match-end accessor relationships. Several more specific gameplay and bonus-evaluator relationships remain deferred because the inspected bodies establish bookkeeping but not the complete semantic chain.

### shard-main__melee__pl__plbonuslib-057-retry180539
The reviewed routines aggregate per-item counters, expose player statistics, reset attribution fields, and conditionally record indexed decisions. Current bodies support the bookkeeping relationships, but several specific gameplay mappings depend on caller or helper semantics not authenticated in this job. This review covers only the twelve assigned links.

### shard-main__melee__pl__plbonuslib-058-retry180539
Reviewed the twelve assigned links only. Current source confirms per-player statistic accumulation and export to MatchEnd, same-team-hit counter bookkeeping, indexed bonus checks, and a crowd-reaction bookkeeping callback. Several historical caller ranges have moved. Item-pickup caller provenance and some stronger gameplay interpretations remain deferred; this is not complete TU coverage.

### shard-main__melee__pl__plbonuslib-059
Reviewed the twelve assigned links against current plbonuslib function bodies. These routines latch per-player flags, reset attribution fields, arm event windows, update indexed bonus values, collect predicate-driven counters, and expose accumulated statistics. Specific controller, hammer, movement, and KO-attribution interpretations require cross-file evidence that was not available through the attempted source reads. This review does not establish complete TU coverage.

### shard-main__melee__pl__plbonuslib-060
The reviewed routines maintain and expose per-player counters, averages, condition flags, item logs, and attack statistics. Event classification also invokes indexed bonus updates. Two baseline consumer citations no longer identify the claimed consumers at the pinned revision; specific input-displacement and item-domain gameplay mappings remain unverified. This review covers only the assigned links, not the entire translation unit.

### shard-main__melee__pl__plbonuslib-061
Reviewed the twelve assigned concept links. Current bodies implement persistent item-category streaks, participant-indexed accumulation, guarded fighter-state transfer, indexed bonus updates, and statistics accessors consumed by MatchEnd finalization. Several event-specific explanations remain unverified; this review does not establish complete TU coverage.

### shard-main__melee__pl__plbonuslib-062
The reviewed functions expose player attack and extended-statistics counters, aggregate item logs, and conditionally record persistent state. Match standings consume several accessors directly. Item-log totals also feed bonus evaluation. This assessment covers only the twelve assigned links, not the entire translation unit.

### shard-main__melee__pl__plbonuslib-063
The reviewed functions accumulate per-player observations, evaluate indexed bonus conditions, record selected hit attribution, and expose action-statistic aggregates. The recurring update combines observation counters, periodic threshold checks, and position-derived statistics. Some gameplay-specific explanations and match-end consumer claims remain unverified in this bounded review; this is not complete TU coverage.

### shard-main__melee__pl__plbonuslib-064
The reviewed functions maintain per-player observations and indexed bonus decisions, record shield-break and damage events, and expose statistics consumed by MatchEnd standings construction. The sequence detector advances through four input categories before issuing decision 0x56. Item-batch tracking maintains consecutive presence counts. This review assesses only the twelve assigned links, not the entire translation unit.

### shard-main__melee__pl__plbonuslib-065
The reviewed functions maintain and expose per-player counters, item-category histories, streak maxima, and bonus decisions. One helper copies saved attribution into a live fighter only for index zero and a non-sentinel value. Item-log counts feed flag evaluation, and a qualifying hit invokes a bonus-bookkeeping wrapper. Caller-dependent interpretations not established by the current reads remain deferred; this review does not cover the entire translation unit.

### shard-main__melee__pl__plbonuslib-066
The reviewed routines accumulate per-player measurements, expose item-log and movement counters, and dispatch indexed bonus updates. Local bodies substantiate bookkeeping operations, but several assigned gameplay relationships require external callers or helper implementations that were not available through the attempted reads. This review does not establish complete translation-unit coverage.

Status: researched; no-change lead bypass; independent review and live promotion pending.
