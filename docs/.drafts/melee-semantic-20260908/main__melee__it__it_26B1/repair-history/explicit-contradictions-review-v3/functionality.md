# Disjoint Librarian Research

### shard-main__melee__it__it_26B1-000
Reviewed canonical and rendered src/melee/it/it_26B1.c lines 1–480 only. This range implements item accessors, flag updates, kind-based queries, article-table registration, arithmetic helpers, and thin fighter-library wrappers. Damage is computed from capsule damage, optionally adding speed-scaled and constant terms with a minimum of 1 only in that branch. Position helpers copy position or apply a facing-adjusted X offset and a Y offset. Other routines count matching kinds, return kind-specific heal fields, classify explicit kind sets, inspect a nonpositive counter for five kinds, and expose special attributes and globals. Later helpers store hitlag frames, manipulate flags, test an indexed mask, and invoke a non-null interaction callback. The range ends at the opening item-list loop of it_8026B7F8; its overall behavior is not established here.

### shard-main__melee__it__it_26B1-001
Reviewed canonical and rendered src/melee/it/it_26B1.c lines 481–960 only.

- Clears matching object references from six item fields; returns whether the owner matched and resets xCB0_source_ply to 6 when xCEC_fighterGObj matches.
- Provides kind-dependent integer and float field queries, returning -1 or -1.0 when their supported branches do not apply.
- Reinitializes animation around two item/object helper calls, decrements xD54_throwNum, clears flag x14, and clears the command pointer when anim_id is -1. Scale assignment multiplies the supplied factor by the attribute scale, not the current scale.
- Includes model-helper wrappers, position-output helpers, direct owner/attack-ID/flag getters, and conditional forwarding of item hitlag minus one to an owner helper. Two position helpers use different bases: item position plus current ECB vertical midpoint, versus collision last_pos plus xE4_ecb vertical midpoint.
- Provides individual flag setters/clearers and two complementary five-flag presets; these assign constants rather than toggle existing values.
- Begins descriptor-driven object creation dispatch: x14 selects branches, a global predicate rejects selectors other than 6, selected branches have additional predicates, and successful results receive branch-specific processing. The dispatch body continues beyond this shard.

### shard-main__melee__it__it_26B1-002
Reviewed canonical and rendered lines 961–1170 only. The opening dispatch tail conditionally modifies five item flags; case 6 invokes a helper and falls through to return NULL. The complete functions provide collision-data selection, conditional helper dispatch based on xD4C and a boolean argument, a boolean forwarding wrapper, a special-attribute timer getter, a grab/owner eligibility predicate, and source-player assignment through a helper. The nearest-item search filters four hold-kind constants, excludes grabbed or flagged-owned items, applies horizontal facing constraints, and minimizes squared XY distance (keeping the first equal-distance candidate). Another helper writes item position with the collision-bottom Y offset. A collision-flag-gated kind switch invokes specialized handlers or sets destroy_type to zero before a fallback call. Finally, two item-list passes respectively invoke a helper on every item and conditionally set x5 while clearing x3.

### shard-main__melee__it__it_26B1-003
The assigned header, `src/melee/it/it_26B1.h:1–96`, declares an item-facing utility interface. Its signatures expose item-kind and hold-kind results, scalar and Boolean queries, vector-pointer operations, article-pointer operations, and functions connecting item objects with generic objects, fighter objects, hit capsules, and collision data. It also declares several no-argument scalar and void functions. This range contains declarations only: it does not establish implementation behavior, mutation direction, gameplay mappings, or compiled layout. Both canonical and rendered views of the entire assigned range were reviewed; this is not complete TU coverage.

### shard-main__melee__it__it_26B1-004
The assigned range is a Doxygen documentation companion for `melee/it/it_26B1.h`, containing comments and function declarations, not executable bodies. It catalogs item queries and attribute access, position helpers, article registration, hitlag and flag operations, ownership/reference handling, model operations, collision access, and item-specific callbacks. Several descriptions explicitly remain tentative. This review covers only `src/melee/it/it_26B1.dox` lines 1–240, in both canonical and rendered views; documented behavior is not independently established implementation behavior.

### shard-main__melee__it__it_26B1-005
The assigned accessors expose an item's attack identifier, configured multiplier, and horizontal/vertical pickup extents without mutation. Read callers use the attack identifier in owner-attributed combo tracking, the multiplier reciprocally in throw animation speed, and pickup extents in overlap tests and nearest-candidate selection. Source switches and floating literals do not establish the assigned compiled sections' layout or provenance.

### shard-main__melee__it__it_26B1-006
Reviewed the six assigned item queries, not the complete TU. Five return stored item or attribute fields without mutation; itIsHeavy converts an attribute flag to a boolean. Read callers demonstrate hold-kind dispatch during pickup, kind-based contact dispatch, owner-based collision/statistics processing, and heavy-flag-dependent presentation. More specific gameplay interpretations remain deferred where the inspected code does not establish them.

### shard-main__melee__it__it_26B1-007
The six assigned helpers calculate flag-gated speed-adjusted damage, copy item position, test an attribute for equality to 1, retrieve an article classification consumed by attack-input dispatch, calculate the facing-adjusted center used in pickup overlap tests, and unconditionally set runtime flag x15. Representative fighter and stage callers confirm the position and pickup uses. This review does not establish complete translation-unit coverage.

### shard-main__melee__it__it_26B1-008
Reviewed the six assigned function bodies. They clear Item flag x15, count registered items by kind, write Article pointers into two differently based registries, calculate an integer-truncated affine value used as an item-hitlag minimum, and query five kind-specific healing fields with a zero fallback. Fighter loading confirms use of the first registry for fighter resources. Pickup code consumes the healing query, but detailed gameplay mappings and the second registry's stage-specific scope remain deferred. This is bounded subject coverage, not complete TU coverage.

### shard-main__melee__it__it_26B1-009
Reviewed six assigned functions and relevant fighter callers, not the complete TU. The functions provide a held-slot pickup exception predicate, three read-only article-attribute accessors, a common countdown threshold, and a five-kind non-positive-resource predicate. Caller traces establish attachment lifetime initialization/refresh, Metal timer and health initialization, a countdown-triggered helper call, and loaded-versus-empty L-Gun motion selection.

### shard-main__melee__it__it_26B1-010
Reviewed the six assigned functions and all 32 baseline facts. Two wrappers return nearest eligible fighters and write target coordinates only on success; one additionally filters by facing direction. Two wrappers obtain a horizontal facing sign through fighter-side voting, with random tie resolution. A read-only kind predicate controls a fighter-metadata substitution. A setter unconditionally replaces the item's recorded hitlag-frame value. This review does not claim complete TU coverage.

### shard-main__melee__it__it_26B1-011
The six assigned helpers set or clear item hitlag-related flags, test a player-indexed acquisition bitmap, expose an owner-sensitive bookkeeping flag and an initialization serial, and return a global compared against player item-log totals. Acquisition logging distinguishes prior holders; serial-based tracking rejects active duplicate keys. Displayed bonus names and the global counter's lifecycle meaning remain unestablished.

### shard-main__melee__it__it_26B1-012
Reviewed the six assigned functions and their baseline facts. They expose a global statistic and an item flag used by player logging, dispatch item callbacks during fighter unload, clear matching item references, and return kind/state-selected item fields with negative fallback values. The unload pass saves ownership before callback execution but tests x13 afterward. Ammunition and active bomb-countdown interpretations require field-producer evidence beyond the accessor bodies.

### shard-main__melee__it__it_26B1-013
Reviewed the six assigned helpers and all 29 baseline facts. The helpers reconstruct item animation during fighter reassociation, apply base-relative model scaling, expose complementary model visibility operations, and calculate fighter/item ECB-midpoint positions. Read callers confirm fighter-associated item transfer, fighter-derived article scaling, timed show/hide alternation, and separate spawn-position versus previous-position initialization. Broader character-specific mappings remain explicitly deferred where not fully verified; this is not complete TU coverage.

### shard-main__melee__it__it_26B1-014
Reviewed six assigned helpers. They compute an ECB vertical-center point, forward item hitlag minus one to a validated fighter owner, query xDD0_flag.b0, provide fighter position or zero, and clear/set xDCD_flag.b2. Read map-collision, Hammer, Link Bomb, turnip, and fighter attachment context. Broader gameplay interpretations remain deferred where the inspected code establishes only field operations or call ordering.

### shard-main__melee__it__it_26B1-015
The six assigned functions are unconditional, in-place Item bit setters or clearers. They set xDD0_flag.b3, set or clear xDCC_flag.b3, set xDCD_flag.b3 or b4, and set xDC8_word.flags.x1A. Their callers separately perform attachment setup/reset, projectile initialization, and motion-state changes. These helpers contain no guards or motion transitions; downstream meanings of the bits remain unestablished. This review covers only the assigned subjects.

### shard-main__melee__it__it_26B1-016
The six assigned functions clear one Item flag, install complementary five-flag configurations, dispatch descriptor-based creation with guarded post-processing, return nullable collision-data pointers, and select hitbox configuration routines using an Item field and a boolean request. Current callers confirm state-entry flag setup, conditional restoration after animation restart, stage-joint-derived creation requests, and complementary held-item requests from fighter Hammer code. This review does not establish complete TU coverage.

### shard-main__melee__it__it_26B1-017
Reviewed the six assigned functions and their relevant consumers. They provide a non-disabled-hitbox predicate, an L-Gun attribute accessor used as a counter threshold, a cleanup eligibility predicate, fighter-to-item player attribution, a facing-filtered nearest-item search used by missile steering, and an ECB-bottom position calculation used by the Barrel fighter callback. Gameplay labels extending beyond the verified data paths remain explicitly deferred.

### shard-main__melee__it__it_26B1-018
The reviewed dispatcher tests collision flag b7 and forwards the same item object to one of four kind-specific handlers, otherwise setting destroy_type to zero and calling Item_8026A8EC. The two bulk routines set x3 on active items or independently set x5 when x7 is present and clear x3. Current boss-library wrappers expose both bulk operations. Additional reviewed utilities manipulate item flags, references, animation, positions, and conditional spawning; this is not complete TU coverage.

### shard-main__melee__it__it_26B1-019
The six assigned parameter subjects belong to simple accessors taking `HSD_GObj* gobj`. Their bodies retrieve item data and return, respectively, `xBD4_grabRange.x`, `xBD4_grabRange.y`, `xCC_item_attr->x0_hold_kind`, `kind`, `msid`, or `owner`, without explicit state writes. All six subjects have empty baseline fact arrays; there are no baseline facts to disposition. This review covers only the assigned subjects, not the entire translation unit.

### shard-main__melee__it__it_26B1-020
The six assigned parameter subjects have no baseline facts. Their current function bodies access Item data through an HSD_GObj's user_data: itGetTeamId returns x20_team_id; itIsHeavy tests whether x0_is_heavy is nonzero; it_8026B294 copies the item's position into its Vec3 output; and it_8026B1D4 reads capsule damage, conditionally adds a velocity-magnitude contribution and constant, and clamps that adjusted result to at least one. This review covers only the assigned subjects, not the complete translation unit.

### shard-main__melee__it__it_26B1-021
The assigned subjects cover parameters of five small item helpers. `it_8026B2D8` tests whether an item attribute equals exactly 1; `it_8026B30C` returns attribute `x0_78`. `it_8026B344` writes a position with a facing-scaled X offset, an added Y offset, and unchanged Z. `it_8026B390` and `it_8026B3A8` set and clear `xDC8_word.flags.x15`, respectively. All six assigned subjects have empty baseline fact lists, so there are no fact dispositions. Review is limited to this shard, not the complete translation unit.

### shard-main__melee__it__it_26B1-022
The assigned parameters belong to four small helpers: `it_8026B3C0` counts objects in the item list whose kind equals its argument; `it_8026B3F8` and `it_8026B40C` store an Article pointer into separate tables using a kind-relative index; `it_8026B424` scales an integer argument by common-data field xB8, adds xBC, casts to int, and returns the result as float. All six assigned subjects have empty baseline fact arrays, so there are no baseline facts to disposition.

### shard-main__melee__it__it_26B1-023
Reviewed the canonical bodies for the six assigned parameter subjects. Each function accepts an `HSD_GObj*` and reads its `user_data` as `Item*`. `it_8026B47C` returns a kind-selected item-variable value or zero; `it_8026B4F0` tests membership in six explicit item kinds. `it_8026B54C` and `it_8026B560` return `x0_float` through the item's article special attributes, while `it_8026B574` returns `x4_float`. `it_8026B594` returns true only for five explicit kinds when `xD4C <= 0`. None of these bodies writes through the parameter. All six assigned subjects have empty baseline fact arrays, so there are no fact dispositions.

### shard-main__melee__it__it_26B1-024
The assigned subjects are the r3/r4/r5 parameter identities of two wrappers. `it_8026B5E4` forwards its first and third C arguments to `ftLib_8008627C`; if the returned object is non-null, it passes that object and its second argument to `ftLib_800866DC`, then returns the object. `it_8026B634` follows the same conditional pattern using `ftLib_80086368`, additionally forwarding a floating-point argument. All six assigned subjects have empty baseline fact lists.

### shard-main__melee__it__it_26B1-025
The assigned subjects have no baseline facts. Their containing functions forward arguments to fighter-library helpers, test an item's kind against two bounded ranges with two exclusions, or write the supplied float to the item's xCBC_hitlagFrames field. This review covers only the assigned subjects, not the entire translation unit.

### shard-main__melee__it__it_26B1-026
The assigned subjects have no baseline facts. Their enclosing canonical functions write an item's hitlag-frame field, set flag x3, conditionally set x5 and clear x3, test an indexed bit of xF, or return x14. The object parameters supply Item data through user_data. These bodies establish field operations, not the gameplay meanings suggested by rendered names. Review is limited to this bounded shard.

### shard-main__melee__it__it_26B1-027
The assigned parameters belong to five functions. `it_8026B7CC` and `it_8026B7E8` read an item's `x1C` and `xDC8_word.flags.x1`, respectively. `it_8026B7F8` passes its argument to each item's optional interaction callback, then conditionally calls `Item_8026A8EC` using an owner pointer captured before the callback. `it_8026B894` clears six matching object references, sets `xCB0_source_ply` to 6 when `xCEC_fighterGObj` matches, and returns whether the owner matched. `it_8026B924` returns `xD4C` for four explicit item kinds and -1 otherwise. All six assigned subjects have empty baseline fact arrays.

### shard-main__melee__it__it_26B1-028
Reviewed the three canonical function bodies associated with the six assigned parameter subjects. it_8026B960 reads item data through its object argument and returns one of two fields under kind/state checks, otherwise -1.0. it_8026B9A8 forwards its arguments to helpers, decrements a counter, clears a flag, and rebuilds animation state or clears animation commands. it_8026BAE8 multiplies the supplied float by the item's attribute scale, stores the product, and passes it with the model object to a helper. All six subjects have empty baseline fact lists.

### shard-main__melee__it__it_26B1-029
The assigned parameters belong to four functions. `it_8026BB20` and `it_8026BB44` take an `HSD_GObj*` and forward its `hsd_obj` to `it_80272A18` and `it_80272A3C`, respectively. `it_8026BB68` forwards an `HSD_GObj*` and `Vec3*` unchanged to `ftLib_80086990`. `it_8026BB88` takes an item object and a destination vector; it writes the item's position with half the sum of the current ECB top and bottom Y coordinates added to Y, and zero added to X and Z. All six assigned subjects have empty baseline fact arrays; there are no baseline facts to disposition.

### shard-main__melee__it__it_26B1-030
The assigned parameters belong to four functions. `it_8026BBCC` writes a vector using collision `last_pos`, adding half the sum of `xE4_ecb` top and bottom Y coordinates to Y. `it_8026BC14` conditionally passes the item's owner and `xCBC_hitlagFrames - 1` to `ftLib_80086A4C`; it does not decrement the item's field in this body. `it_8026BC68` returns `xDD0_flag.b0`. `it_8026BC90` zeroes its output vector, then conditionally delegates to `ftLib_80086644` when its object is non-null and passes `ftLib_80086960`. All six assigned subjects have empty baseline fact lists.

### shard-main__melee__it__it_26B1-031
The six assigned parameter subjects correspond to single-argument flag mutators. Each function accepts `HSD_GObj* gobj` and obtains an `Item*` through `GET_ITEM(gobj)`. `it_8026BCF4` clears `xDCD_flag.b2`; `it_8026BD0C` sets that bit; `it_8026BD24` sets `xDD0_flag.b3`; `it_8026BD3C` sets `xDCC_flag.b3`; `it_8026BD54` clears that bit; and `it_8026BD6C` sets `xDCD_flag.b3`. All six assigned subjects have empty baseline fact lists, so no fact dispositions are required. This review covers only this bounded shard.

### shard-main__melee__it__it_26B1-032
The five assigned flag-helper parameters are declared HSD_GObj* and supply the object passed to GET_ITEM. it_8026BD84 sets xDCD_flag.b4; it_8026BD9C and it_8026BDB4 set and clear xDC8_word.flags.x1A. it_8026BDCC and it_8026BE28 assign complementary fixed values to five flags; they do not invert the previous values. The assigned parameter of it_8026BE84 is declared BobOmbRain*: its fields select a dispatch branch, supply call arguments, and optionally apply the same flag values as it_8026BE28 to a non-null result. Case 6 performs a call but falls through to return NULL. All six assigned subjects have empty baseline fact arrays, so there are no fact dispositions.

### shard-main__melee__it__it_26B1-033
The assigned parameter subjects belong to five helpers. `it_8026C100` dispatches on `it_80272D40(gobj)`, returning a delegated collision pointer for case 0, the item's embedded collision data for case 1, or NULL otherwise. `it_8026C16C` selects between two callbacks using the item's `xD4C` and its Boolean argument. `it_8026C1B4` forwards its argument to `it_80275870`. `it_8026C1E8` returns false when a grab victim exists or flag x13 and an owner are both present, and true otherwise. `it_8026C220` writes a value obtained from its second argument into the first argument's item data. All six assigned subjects have empty baseline fact arrays; there are no baseline facts to disposition.

### shard-main__melee__it__it_26B1-034
The assigned parameters belong to four inspected functions: `it_8026C220` passes its second object argument to `ftLib_80086BE0` and stores the result in item state; `it_8026C258` finds the nearest eligible item by squared XY distance, with directional X filtering; `it_8026C334` writes item position plus the collision-bottom Y offset to an output vector; `it_8026C368` conditionally dispatches by item kind when a collision flag is set. All six assigned subjects have empty baseline fact lists, so there are no baseline facts to disposition.

### shard-main__melee__it__it_26B1-035
Reviewed the twelve assigned links against current item utility bodies and relevant callers. Supported relationships cover pickup bounds, Star Rod counter checks, Hammer owner-state coordination, ECB positioning, ice-projectile stopping, bonus evaluation, Barrel positioning, and missile steering. Team-battle and the precise hitlag destination remain deferred; this is not complete TU coverage.

### shard-main__melee__it__it_26B1-036
Reviewed the twelve assigned links against current helper bodies and available callers. Verified depleted-resource branching, item-log counter gating, reciprocal throw-animation scaling, conditional item-flag restoration, missile fallback targeting, and paired Hammer requests. Other links remain explicitly deferred where concept identification or current caller evidence was insufficient. This is bounded link review, not complete TU coverage.

### shard-main__melee__it__it_26B1-037
Reviewed the twelve assigned concept links against current item-function bodies and available callers. The code exposes item attributes and counters, computes facing-adjusted positions and speed-dependent damage, dispatches descriptor-based spawning and collision callbacks, and changes item flags. Current callers directly support the ice-projectile stopping sequence and fighter-attachment teardown links. Several broader gameplay interpretations remain deferred rather than inferred from proposed names or numeric selectors. This is bounded link review, not complete TU coverage.

### shard-main__melee__it__it_26B1-038
Reviewed the twelve assigned links against current helper bodies and relevant caller excerpts. These helpers expose item attributes and bounds, test resource/state conditions, configure projectile flags, transfer item attachments, and support hitlag and cleanup. Confirmed direct pickup and hitlag integration; deferred gameplay interpretations not established by the inspected code. This is bounded link review, not complete TU coverage.

### shard-main__melee__it__it_26B1-039
Reviewed the 12 assigned links. Current code supports item-pickup animation selection, fighter-to-fighter item transfer, attached-enemy teardown, missile fallback targeting, ECB center calculation, Hammer owner-hitlag coordination, item-hit counting, Fire Flower flag restoration, and item hitlag assignment. Super Star identification, item-throw timing, and the Ray Gun full-shot-threshold interpretation remain deferred. This is bounded link review, not complete TU coverage.

### shard-main__melee__it__it_26B1-040
The reviewed functions expose item attributes and flags, compute flag-gated speed-dependent damage, return kind-specific recovery values, query a fighter through ftLib, modify item scale, and dispatch collision-marked items by kind. These bodies establish local operations but do not independently establish most of the assigned gameplay links. This is a bounded link review, not complete TU coverage.

### shard-main__melee__it__it_26B1-041
The reviewed helpers apply an attribute-relative item scale, forward item hitlag minus one to an eligible owner, expose state-filtered bomb timer fields, and return the global L_Gun special-attribute timer. Specific Blaster call sites and the bomb-fuse/ammunition interpretations could not be verified from accessible canonical source. This review covers only the five assigned links.

Status: researched; no-change lead bypass; independent review and live promotion pending.
