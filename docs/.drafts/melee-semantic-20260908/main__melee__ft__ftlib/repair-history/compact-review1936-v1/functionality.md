# Disjoint Librarian Research

### shard-main__melee__ft__ftlib-000
Reviewed canonical and rendered `src/melee/ft/ftlib.c` lines 1–480 only.

- Counts the fighter list and tests for the explicit Master Hand and Crazy Hand kind constants.
- Implements filtered fighter selection by damage, squared XY distance, and squared XY distance restricted to a horizontal side. Filters exclude candidates accepted by `ftLib_80086FD4`, candidates with `x221F_b3`, and matching teams when `gm_8016B168()` is true and a reference fighter exists. The damage search starts with an integer threshold of 999 and assigns candidate damage back into that integer. Distance searches use positions supplied by the camera-target-bone helper. Side restriction applies only for direction exactly −1 or +1 and permits equal X.
- Computes a horizontal direction by counting eligible candidates on each side, counting equal X as positive, and choosing randomly when the signed count is zero; this is not a nearest-target direction calculation.
- Provides facing, ground/air, left-stick, joint, current/previous-position, item-pointer, collision-data, and scale accessors. Position assignment directly copies `cur_pos`; scale assignment updates only `x34_scale.y` before invoking two update helpers. Camera-target position passes the configured joint and attribute offset to `lb_8000B1CC`.
- Conditionally delegates item operations, compares an item argument against two stored pointers, and queries/sets/clears `x221D_b4`, including list-wide setters and clearers. Setting the bit first calls the input-reset helper. Another predicate gates three associated object pointers using visibility and flag conditions, returning true immediately for unrelated pointers.
- Tests the fighter object classifier and computes current position plus the vertical midpoint of ECB top/bottom offsets. The range ends inside `ftLib_80086A18`; its complete behavior is not assessed.

### shard-main__melee__ft__ftlib-001
Reviewed canonical and rendered ftlib.c lines 481–960 only. This range implements fighter field accessors, camera-dependent predicates, gated per-fighter and all-fighter helper dispatch, motion-ID predicates, player-identity comparison, spawn-number lookup, and ordered subsystem calls.

The camera predicate updates x221F_b0 only under specific camera/flag conditions and otherwise clears it and returns true. The screen-coordinate accessor conditionally copies x2188 but always returns false. Other accessors expose camera-subject data, player/team/kind identifiers, position delta, damage fields, shadow storage, and individual flags. Name-tag height selects between two attribute sources based on invisible.

The shared dispatch helper checks a player predicate and two fighter flags before calling lb_80014574 with mode 0 or 1; list wrappers apply each mode to every fighter. A separate wrapper conditionally removes rumble ID 1. Motion predicates use four explicit switch cases, an open-ended lower-bound comparison, or inclusive named-enum intervals. Object comparison rejects null inputs and accepts identical objects or matching player IDs.

Additional wrappers forward +1/-1 to ftData_80085560, conditionally fill output parameters, set/get damage percent, perform a gated four-call sequence, and handle an item asserted to have kind It_Kind_MetalB through ordered calls followed by a quake and sound. The final two routines share a data/effect call sequence, differing in whether ftData_80085820 receives one supplied index or every index below numCostumes.

### shard-main__melee__ft__ftlib-002
Reviewed canonical and rendered ftlib.c lines 961–1040 only.

- `ftLib_80087610` iterates indices from zero through `SELKIND_COUNT` inclusively. For each index passing `gm_IsCKindUnlocked`, it passes `Player_800325C8(i, 0)` and the supplied byte to `ftKb_SpecialN_800EED50`; Zelda and Sheik indices additionally use `Player_800325C8(i, 1)`.
- `ftLib_800876B4` calls `ftAnim_IsFramesRemaining` but returns no value. `ftLib_800876D4` tests whether `smash_attrs.state` equals 2.
- `ftLib_800876F4` and `ftLib_80087700` return `dmg.x18CC` and `dmg.x18D0`, respectively.
- `ftLib_8008770C` and `ftLib_80087744` forward `(gobj, dst)` to their respective Game & Watch helpers when the fighter kind is `FTKIND_GAMEWATCH`, and to Kirby helpers for every other kind.
- `ftLib_8008777C` asserts that the fighter is grounded and returns `atan2f(-floor.normal.x, floor.normal.y)` from its collision data. `ftLib_800877D4` tests only whether `xF8_playerNudgeVel.x` is nonzero.

### shard-main__melee__ft__ftlib-003
### Assigned header: `src/melee/ft/ftlib.h`, lines 1–110
This guarded header declares the ftLib interface; it contains no function bodies or state definitions. Its signatures primarily accept game-object pointers, with additional fighter/item-specific pointers, vector and scalar arguments, and pointer outputs. Return types include scalars and pointers to objects, joints, collision data, camera subjects, and shadows. The interface also declares motion-ID and fighter-kind queries. The active declarations for `ftLib_80087508` and `ftLib_80087574` use `s8`; adjacent `FighterKind` alternatives are comments, not active prototypes. This review covers the complete assigned header in canonical and rendered form, not the complete translation unit.

### shard-main__melee__ft__ftlib-004
### Assigned documentation surface
Reviewed canonical and rendered `src/melee/ft/ftlib.dox` lines 1–118 only. This file is a guarded, header-like declaration surface, not an implementation: it includes fighter, game-object, platform, and matrix types and declares the ftLib interface. Signatures predominantly take `HSD_GObj*`, with scalar, vector, object-pointer, collision-data, camera-box, and fighter-kind types. Two comments explicitly document `ftLib_80086960` as testing whether an object is a Fighter and `ftLib_GetMotionId` as returning a fighter action-state ID. No function bodies, state transitions, or compiled layouts are present in the assigned range.

### shard-main__melee__ft__ftlib-005
This bounded review covers three section subjects and three fighter queries. The queries count linked fighter objects, select a candidate using a damage threshold stored as an integer initialized to 999, and select a candidate by strictly decreasing squared XY distance initialized to F32_MAX. Both selectors exclude same-player objects, flagged candidates, and conditional same-team candidates. Assertion macros pass condition text and source metadata into the diagnostic/panic path. Source evidence does not establish the compiled section placement or byte layout of those strings and numeric literals.

### shard-main__melee__ft__ftlib-006
Reviewed the six assigned fighter-library subjects. They implement a direction-constrained nearest-fighter query, a left/right fighter-majority facing query with randomized ties, direct facing and ground/air accessors, copying of left-stick sample zero, and retrieval of the joint mapped from logical fighter part 4. Read callers demonstrate item targeting, spawn orientation, arrow launch orientation, article state selection, and player-joint use in Toy Fall setup. This is bounded subject coverage, not complete TU coverage.

### shard-main__melee__ft__ftlib-007-retry180539-retry185219
Reviewed the six assigned fighter-library subjects. They expose a selected model joint, copy current and previous positions, replace current position, compute a bone-derived camera position, and conditionally delegate associated-item cleanup. Current callers corroborate joint-transform consumption, position propagation, boundary comparisons, camera-subject updates, and item-association checking. This review does not claim complete TU coverage.

### shard-main__melee__ft__ftlib-008
Reviewed six assigned fighter utilities. The item helpers conditionally clear the separately tracked special-item reference, compare an object against two ordinary item-related slots, and expose the special-item pointer to identity-guarded cleanup callers. The input helpers query a marker, reset input samples and timing/history counters before setting it, and apply that operation across the fighter list. The marker also gates bonus-statistics collection and causes sampled input to be neutralized during fighter input processing. This is bounded subject coverage, not complete TU coverage.

### shard-main__melee__ft__ftlib-009
Reviewed the six assigned functions and relevant callers, not the complete translation unit. These helpers clear a Fighter flag individually or across the fighter list, test fighter-associated item visibility, classify nullable game-object pointers, expose collision data, and calculate a position offset by the ECB's vertical midpoint. Item rendering and spawning callers corroborate the visibility and spatial-query roles. The precise input-gating interpretation of x221D_b4 remains deferred pending a read of its input-processing consumers.

### shard-main__melee__ft__ftlib-010
Reviewed the six assigned ftLib interfaces and relevant consumers. Three getters expose effective Y model scale, effective X model scale, and raw runtime Y scale. The motion predicate accepts exactly GuardOn, Guard, and GuardSetOff—not the GuardOff release state. A float setter overwrites damage-state field x1958, with item-hitlag synchronization and player broadcasts verified. The magnify accessor conditionally copies cached projected coordinates and always returns false. This review does not claim complete TU coverage.

### shard-main__melee__ft__ftlib-011
The six assigned functions connect fighter camera subjects to rendering and interface consumers. The rendering predicate updates a center-visibility flag and applies an extent-plus-15 fallback, with permissive bypasses. Accessors expose that flag, the camera subject, its target extent scalar, and a copy of bone_pos. A separate predicate tests subject.pos through the zero-margin camera-bounds classifier. The magnifier consumes the flag, scalar, and position; Player wrappers forward position and bounds queries. The bounds classifier additionally raises its bottom limit using a Ground-provided value.

### shard-main__melee__ft__ftlib-012
The six assigned functions expose a fighter's player ID and positional delta, and dispatch controller-rumble requests individually or across the fighter list. Both rumble variants share player eligibility and two fighter suppression guards, differing only in request ID (0 or 1). The downstream scheduler selects loaded rumble data and converts zero duration to -2. Read callers confirm player-record indexing, item source attribution, Flipper spin calculations, and item-animation-driven ID-1 requests. This review covers only the assigned subjects, not the complete translation unit.

### shard-main__melee__ft__ftlib-013
Reviewed the six assigned fighter utilities and relevant caller excerpts, not the entire translation unit. They conditionally remove controller-rumble requests tagged ID 1, return a stored team identifier or status flag, test magnifier and nametag eligibility, and select a nametag-height attribute according to invisibility. These accessors and predicates do not modify Fighter state. Item-owner, stage-scrolling, magnifier, and nametag callers substantiate their immediate integration roles.

### shard-main__melee__ft__ftlib-014
Reviewed the six assigned functions and their 32 baseline facts, not the complete translation unit. They classify four motion IDs for a sword-scale reset guard, compare fighter player identities, expose an unnamed status bit, increment/decrement indexed fighter reference counts, and conditionally export an XY rendering displacement. Current callers substantiate targeting/jostling exclusion, item reference acquisition/release, player-status gating, and fighter/item rendering uses. Specific gameplay mappings and the broad status-bit consumer inventory remain partially unverified.

### shard-main__melee__ft__ftlib-015
Reviewed the six assigned subjects and all 33 baseline facts. The bounded code implements a conditional fighter-common lookup, integer damage setter/getter, guarded in-place fighter reconstruction, Metal activation/refresh with parameter and presentation updates, and a motion-threshold predicate consumed by Flipper throw initialization. This review does not establish complete TU coverage.

### shard-main__melee__ft__ftlib-016
Reviewed the six assigned accessors/predicates and relevant consumers. They expose embedded shadow state, test three shadow-suppression conditions, return the recorded damage-source player and a bookkeeping flag, forward an inactivity-related query, and classify an inclusive motion-state interval. Shadow activation, paired HUD-model selection, bonus-history gating, and crowd/stage exclusion are directly observable in current code. Specific KO presentation mappings remain partly unverified; this is not complete TU coverage.

### shard-main__melee__ft__ftlib-017
Reviewed six assigned functions and their 36 baseline facts. Five functions read Fighter.motion_id and return inclusive interval classifications without changing state. Their consumers include bonus bookkeeping, paired-fighter RebirthWait coordination, and a stage collision early-return guard. The sixth traverses the global fighter list and returns the first object with a matching unsigned spawn number, or NULL; crowd processing uses this lookup. The broad death-state naming and some presentation-level interpretations remain deferred. This is bounded subject coverage, not complete TU coverage.

### shard-main__melee__ft__ftlib-018
Reviewed the six assigned functions, not the complete TU. They expose stored knockback magnitude, spawn identity, a selected crowd SFX identifier, and a player-associated discriminator; adapt item-generation batches to player bookkeeping; and synchronously prepare one fighter kind and costume. Crowd callers confirm threshold comparisons and tracked-identity use. Item bookkeeping reduces categories to presence bits and updates streak counters. Resource loading uses persistent caches and an optional post-load callback. Costume-color/audio-content mappings and the expanded meaning of the discriminator remain unverified.

### shard-main__melee__ft__ftlib-019
Reviewed the six assigned functions and all 33 baseline facts. The bounded region orchestrates all-costume fighter loading and unlock-filtered Kirby resource loading, delegates an animation query through a void wrapper, tests smash state 2 for article animation synchronization, and exposes two damage-record integers to bonus processing. Return-value ABI claims and several gameplay interpretations remain deferred; this is not complete TU coverage.

### shard-main__melee__ft__ftlib-020
Reviewed the six assigned subjects. Two dispatchers select Game & Watch attribute callbacks or Kirby resource callbacks and supply values to shared item initialization. The ground-angle accessor asserts groundedness and computes atan2f(-normal.x, normal.y); the nudge predicate tests horizontal nudge velocity against zero. Player statistics consume both queries. GetItem and GetKind directly return fighter fields without mutation. Resource representation and broader item-possession claims remain explicitly deferred.

### shard-main__melee__ft__ftlib-021
Reviewed the assigned baseline subjects, not the entire TU. The motion accessor returns Fighter.motion_id without mutation; an item callback uses it as a lifetime guard. The two hand-presence predicates scan the live fighter list and influence debug controller processing. SetScale writes the runtime scale factor, updates the root model, and invokes scale-dependent common/item updates. Sampled TU utilities also demonstrate roster queries, field access, resource-preparation dispatch, and guarded controller-rumble scheduling.

### shard-main__melee__ft__ftlib-022
The assigned subjects have no baseline facts. Their enclosing functions scan fighter objects with exclusion filters. ftLib_8008627C selects the minimum squared XY distance from an input position; ftLib_80086368 additionally filters by horizontal side when facing_dir equals -1 or +1. Both accept a nullable object used by exclusion logic. ftLib_800864A8 sums signs of candidate X offsets from an input position, randomly resolves a zero sum, and returns -1 or +1. This review is limited to the assigned parameter subjects.

### shard-main__melee__ft__ftlib-023
The six assigned parameter subjects contain no baseline facts. Their canonical function bodies show that ftLib_800864A8 uses an optional object for candidate filtering while computing a horizontal-side vote, randomly breaking ties and returning -1 or +1. ftLib_800865C0 and ftLib_800865CC read facing_dir and ground_or_air from the supplied object's Fighter data. ftLib_800865D8 copies input.lstick[0].x and .y into two float output pointers. This review is limited to the assigned subjects; register-to-source-parameter mappings were not independently established.

### shard-main__melee__ft__ftlib-024
The six assigned parameter subjects belong to four small fighter accessors. ftLib_800865F0 obtains a joint using ftParts_GetBoneIndex(fp, 4); ftLib_80086630 directly indexes parts with its part argument and returns the joint. ftLib_80086644 copies cur_pos into the supplied Vec3, while ftLib_80086664 copies the supplied Vec3 into cur_pos. All six subjects have empty baseline fact lists, so no baseline dispositions are required. Review is limited to this bounded shard.

### shard-main__melee__ft__ftlib-025
The assigned subjects have no baseline facts. Their containing functions copy an input vector into fighter current position, copy fighter previous position to an output vector, pass a selected fighter joint and attribute offset to lb_8000B1CC, and conditionally forward a fighter object to ftCommon_8007E6DC when either of two item-related pointers is non-null. This review covers only the assigned subjects, not the complete translation unit.

### shard-main__melee__ft__ftlib-026
The assigned parameters belong to five small fighter-object helpers. ftLib_80086724 conditionally forwards its two objects and constant 1 to ftCommon_8007E6DC when either item_gobj or x1978 is non-null. ftLib_80086764 conditionally delegates when x1984_heldItemSpec is non-null. ftLib_800867A0 compares its second object against item_gobj and x1978, without excluding null matches. ftLib_800867CC returns x1984_heldItemSpec; ftLib_800867D8 returns x221D_b4. All six assigned subjects have empty baseline fact arrays, so there are no baseline fact IDs to disposition.

### shard-main__melee__ft__ftlib-027
The assigned parameters belong to five small object-facing helpers. ftLib_800867E8 receives an HSD_GObj*, calls Fighter_ResetInputData_80068854 with it, and sets its Fighter user-data flag x221D_b4; ftLib_8008688C clears that flag. ftLib_800868D4 receives a fighter object and a comparison object, checks the latter against three stored object pointers, and combines those matches with visibility-related flags to produce a Boolean. ftLib_80086960 accepts a nullable object and tests its classifier against HSD_GOBJ_CLASS_FIGHTER. ftLib_80086984 obtains Fighter data from its object and forwards it to Fighter_GetCollData. All six assigned subjects have empty baseline fact arrays.

### shard-main__melee__ft__ftlib-028
The assigned subjects have no baseline facts. Their containing functions take a fighter object to compute a position with the average ECB top/bottom Y offset, query scale values, or test motion_id against exactly GuardOn, Guard, and GuardSetOff. ftLib_80086990 additionally takes a Vec3 output pointer. This review covers only the assigned bounded shard.

### shard-main__melee__ft__ftlib-029
The assigned parameters belong to four functions. ftLib_80086A4C obtains Fighter data from its object argument and stores its float argument into dmg.x1958. ftLib_80086A58 conditionally copies x2188 to its output pointer when both x2229_b3 and x2220_b7 are clear, but always returns false. ftLib_80086A8C conditionally performs camera checks, updates x221F_b0, and returns a boolean; its fallback clears the flag and returns true. ftLib_80086B64 reads that flag. All six assigned subjects have empty baseline fact arrays, so there are no baseline fact dispositions.

### shard-main__melee__ft__ftlib-030
The assigned subjects cover parameters of five small fighter accessors. ftLib_80086B74 obtains the fighter's x890_cameraBox pointer; ftLib_80086B80 reads that subject's target_ext.v.z; ftLib_80086B90 copies its bone_pos into the supplied Vec3 output; ftLib_80086BB4 passes its pos address to Camera_80031154 and returns the result; ftLib_80086BE0 returns the fighter's player_id. All five take an HSD_GObj* source argument. The bundle contains no baseline facts for any of its six parameter subjects.

### shard-main__melee__ft__ftlib-031
The assigned subjects have no baseline facts to assess. In the corresponding canonical bodies, ftLib_80086BEC copies the fighter's pos_delta into a caller-provided Vec3. ftLib_80086C18 forwards its object and two signed integer arguments to a helper with a fixed fourth argument of zero. That helper conditionally calls lb_80014574 using the fighter's x618_player_id and the forwarded arguments. ftLib_80086C9C traverses the fighters list and forwards its two arguments to ftLib_80086C18 for each object. This review is limited to the assigned subjects, not the entire translation unit.

### shard-main__melee__ft__ftlib-032
The assigned subjects have no baseline facts. Their containing functions forward two integer arguments through a shared, conditionally executed helper: ftLib_80086C9C iterates fighters using selector 0, ftLib_80086D40 handles one fighter using selector 1, and ftLib_80086DC4 iterates fighters through ftLib_80086D40. The helper checks Player_8003544C and two fighter flags before calling lb_80014574 with the fighter's x618_player_id, selector, and forwarded integers. This review is limited to the assigned subjects, not the complete translation unit.

### shard-main__melee__ft__ftlib-033
The six assigned parameter subjects correspond to functions whose source-level input is `HSD_GObj* gobj`, used to obtain Fighter data. Their bodies conditionally call rumble removal with ID 1, return the team field, return `x221C_b6`, test a combination of visibility/player flags, test two flags and `x209A == 1`, and select a name-tag height according to invisibility. All six subjects have empty baseline fact lists; there are no baseline fact IDs to disposition. This review covers only the assigned subjects, not the entire translation unit.

### shard-main__melee__ft__ftlib-034
The assigned parameters belong to five small helpers. ftLib_80086FA8 passes its object to a motion-ID query and tests four explicit cases. ftLib_80086FD4 accepts two nullable objects and returns true only when both are non-null and either identical or associated with equal player_id fields. ftLib_8008701C reads the object's Fighter x221F_b3 flag. ftLib_8008702C and ftLib_80087050 forward their s32 argument to ftData_80085560 with respective second arguments 1 and -1. All six assigned subjects have empty baseline fact lists; there are no fact IDs to disposition.

### shard-main__melee__ft__ftlib-035
The six assigned parameter subjects have no baseline facts. Their three canonical function bodies take a fighter object as the first argument. `ftLib_80087074` conditionally writes a Vec3 output from dmg.x18B8 and dmg.x18BC, setting z to zero; when both fields are zero it returns false without writing the output. `ftLib_800870BC` conditionally writes an integer from the common-data x6D8 table indexed by x61A_controller_index; a zero index returns false without writing the output. `ftLib_800870F0` assigns its s32 second argument to dmg.x1830_percent. This review covers only the assigned parameter subjects, not the complete translation unit.

### shard-main__melee__ft__ftlib-036
The assigned parameters belong to five functions. ftLib_80087120 reads the supplied object's Fighter damage-percent field into an s32 return value. ftLib_80087140 runs four calls on the supplied object or its Fighter only when x221F_b3 is clear. ftLib_800871A8 accepts fighter and item objects, asserts the item's kind equals It_Kind_MetalB, forwards two item-derived values to ftCo_800C8348, then makes additional fighter-related calls, requests a small camera quake at the fighter position, and plays an SFX. ftLib_80087284 tests whether the supplied object's motion ID is at least ftCo_MS_LightThrowF4, without an upper bound. ftLib_800872B0 returns the address of the supplied Fighter's x20A4 member as LbShadow*. All six assigned subjects have empty baseline fact lists; there are no fact IDs to disposition.

### shard-main__melee__ft__ftlib-037
The six assigned parameter subjects have no baseline facts. Their canonical functions all accept `HSD_GObj* gobj`: three retrieve fighter data to test three flags or return a stored field; one forwards the argument to `ftLib_8008701C`; two obtain the motion ID and test inclusive ranges with different lower bounds. This review covers only the assigned subjects, not the entire translation unit.

### shard-main__melee__ft__ftlib-038
The six assigned parameter subjects have no baseline facts. Their canonical function bodies implement four inclusive motion-ID range predicates, a fighter-list lookup comparing an unsigned spawn-number field against its input, and a getter for dmg.x18A4_knockbackMagnitude. The predicates accept HSD_GObj* and pass it to ftLib_GetMotionId; the lookup accepts u32 and returns the first matching object or NULL; the getter obtains Fighter data from its HSD_GObj* input. This review covers only the assigned subjects, not the complete TU.

### shard-main__melee__ft__ftlib-039
The assigned parameters belong to four wrappers taking an HSD_GObj pointer and obtaining its Fighter data. ftLib_80087460 returns x8_spawnNum; ftLib_8008746C returns 0x1FBD1 when ftCommon_80080144 succeeds, otherwise ft_data->x4C_sfx->x34; ftLib_800874BC returns x221F_b4. ftLib_800874CC forwards player_id, x221F_b4, and its unchanged void* and s32 arguments to pl_8003E4A4. All six assigned subjects have empty baseline fact lists, so there are no baseline fact IDs to disposition.

### shard-main__melee__ft__ftlib-040
The six assigned parameter subjects contain no baseline facts. Their canonical function bodies show: `ftLib_80087508` uses an `s8` character index across data calls and forwards its `u8` second argument to `ftData_80085820`; `ftLib_80087574` performs the analogous sequence while iterating the indexed costume count. `ftLib_80087610` forwards its `u8` argument unchanged through calls made for unlocked selection indices, with an additional call for the two explicitly tested constants. `ftLib_800876B4` passes its object argument to `ftAnim_IsFramesRemaining` without returning a value. `ftLib_800876D4` accesses the object's fighter data and returns whether `smash_attrs.state` equals 2. This review covers only the assigned subjects, not the entire translation unit.

### shard-main__melee__ft__ftlib-041
The six assigned parameter subjects have no baseline facts to disposition. Their current function bodies show two accessors extracting a Fighter from an HSD_GObj and returning dmg.x18CC or dmg.x18D0. Two additional wrappers accept HSD_GObj* gobj and void* dst, test ftLib_GetKind(gobj) against FTKIND_GAMEWATCH, and forward both arguments unchanged to their respective ftGw_Init or ftKb_Init callees. This review does not establish destination layout, register bindings, or further gameplay semantics.

### shard-main__melee__ft__ftlib-042
The six assigned parameter subjects correspond to functions accepting an HSD_GObj* named gobj and obtaining Fighter data through GET_FIGHTER. Three return item_gobj, kind, or motion_id. SetScale writes x34_scale.y and calls Fighter_UpdateModelScale and ftCommon_80080174. The remaining functions assert grounded state and calculate atan2f(-floor.normal.x, floor.normal.y), or test whether xF8_playerNudgeVel.x is nonzero. All six subjects have empty baseline fact lists, so there are no baseline fact IDs to disposition. This review does not establish compiled r3 bindings or claim complete translation-unit coverage.

### shard-main__melee__ft__ftlib-043
The assigned subject has no baseline facts to assess. The canonical `ftLib_SetScale` body accepts `HSD_GObj* gobj` and `float val`, assigns `val` to the fighter's `x34_scale.y`, then calls `Fighter_UpdateModelScale(gobj)` and `ftCommon_80080174(fp)`. This source-level behavior does not establish the assigned `#r4` parameter's compiled-register identity.

### shard-main__melee__ft__ftlib-044
The reviewed ftLib functions supply camera-subject positions, gate fighter and owner-linked item rendering, expose flags and horizontal nudge activity to bonus-statistics code, clear a flag across the fighter roster during startup, replace stored damage percentage, and dispatch character-specific article attributes. Additional bodies broadcast controller-related requests and test a death-motion range; their stronger gameplay explanations remain deferred. This review covers only the twelve assigned links, not the complete translation unit.

### shard-main__melee__ft__ftlib-045
Reviewed the assigned links against current fighter-library implementations and selected consumers. Confirmed fighter selection used by Red Shell targeting and Pokémon spawn facing, camera-anchor production, Master Hand detection, entry/death-state queries, bonus-state access, stamina damage synchronization, and model-scale access. Toy Fall accessor routing and the downstream rumble scheduling interpretation remain deferred. This is bounded link review, not complete TU coverage.

### shard-main__melee__ft__ftlib-046
Reviewed the twelve assigned links, not the complete translation unit. The inspected fighter helpers expose damage percentage, camera subjects and nametag height, classify guard and sword-swing motions, accept item-owner hitlag synchronization, and provide roster-wide feedback operations. Several broader gameplay associations require additional caller or state-transition evidence.

### shard-main__melee__ft__ftlib-047
Reviewed the twelve assigned links against current fighter-library bodies and accessible callers. Direct evidence supports ECB-centered positioning and gating of projected shadows and offscreen magnification. Item-specific mappings remain deferred because their cited caller paths are absent from the pinned checkout. Character and death-state gameplay mappings require corroboration beyond symbolic names. This is bounded link review, not complete TU coverage.

### shard-main__melee__ft__ftlib-048
Reviewed the twelve assigned links against current fighter-library bodies and selected consumers. The library supplies team filtering and affiliation, motion-range predicates, fighter identity and damage accessors, camera-subject queries, reset dispatch, model-joint access, and character-specific resource dispatch. Crowd consumers directly substantiate both assigned crowd links. Several other gameplay mappings require additional call-chain verification; this review does not claim whole-TU coverage.

### shard-main__melee__ft__ftlib-049
Reviewed the twelve assigned concept links. The inspected fighter-library routines expose model scale, motion and player identity; clear a fighter flag; remove tagged rumble; coordinate resource preparation; supply crowd lookup/audio data; forward player bookkeeping; and dispatch Game & Watch article colors. Current crowd callers and Game & Watch callbacks substantiate their respective links. More specific gameplay interpretations without inspected downstream evidence remain unresolved. This is not complete TU coverage.

### shard-main__melee__ft__ftlib-050
Reviewed the twelve assigned concept links against current ftlib bodies and selected presentation callers. Direct evidence confirms damage-based selection, magnification eligibility and screen-edge positioning, shadow activation gating, and camera-anchor updates. Remaining gameplay interpretations require additional callee, state-writer, or wrapper verification; no complete TU coverage is claimed.

### shard-main__melee__ft__ftlib-051
Reviewed the nine assigned links against current fighter-library bodies. Directly confirmed knockback access and runtime scale updates. Other bodies show Metal Box dispatch, rebirth-state testing, conditional item handling, and unlocked-character resource dispatch, but their broader gameplay explanations require additional callee or caller verification. The animation wrapper currently has a void signature and does not explicitly return the delegated predicate result. This review does not establish complete TU coverage.

Status: researched; no-change lead bypass; independent review and live promotion pending.
