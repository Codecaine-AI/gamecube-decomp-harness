# Disjoint Librarian Research

### shard-main__melee__it__it_2725-000
Reviewed canonical and rendered src/melee/it/it_2725.c lines 1–480 only. This range contains joint translation helpers; single/all-hitbox helper dispatch and flag maintenance; hit-capsule position-history state transitions; a special-attributes pointer accessor; and a list search returning the last item of a requested kind. Vertical velocity is conditionally reduced by a signed parameter, with a speed threshold rather than a hard clamp. Visibility helpers toggle joint-subtree hidden flags, including timer-modulo blinking; facing follows horizontal velocity except near zero when an existing direction is preserved. Effect wrappers dispatch numeric effect IDs, call a shared item helper, and invoke it_80274C60. Model helpers select an attachment joint through either a bone table or repeated child traversal, test item classification, and adjust uniform scale. Collision-response routines modify velocity and facing; another decrements the lifetime and reports expiry. A flag-gated wrapper dispatches the stored xD70 value to Item_8026AE84.

### shard-main__melee__it__it_2725-001
Reviewed canonical and rendered src/melee/it/it_2725.c lines 481–960 only.

- Audio-dispatch wrappers gate calls on xDCD_flag.b2; one selects a separate audio call for It_Kind_Unk4. it_8027327C independently dispatches ID1 unless it is -1, then conditionally handles ID2, including a special call for 0x12F.
- Model and motion utilities replace the stored joint, invoke object/model setup helpers, synchronize translation, reset vector fields, or install a supplied velocity while resetting auxiliary vectors. xAC_unk resets to (0, 1, 0), not zero.
- Owner wrappers conditionally forward calls through ftLib; another forwards its two numeric arguments without using the item argument. it_80273670 selects a state animation descriptor, requests and evaluates a frame, removes animations, and clears the command pointer.
- it_80273748 and it_80273B50 scale supplied velocity by x4_throw_speed_mul, derive facing from horizontal velocity while preserving nonzero facing near zero speed, update collision facing, and optionally rotate the model. Their positioning differs: the former adds a computed offset to caller-supplied coordinates; the latter obtains coordinates through an owner-joint helper. Both force position Z to zero.
- it_80273F34 performs shared transition bookkeeping: changes flags, clears xDC4, increments xD54_throwNum, resets xD50_landNum, invokes setup and owner-related helpers, and synchronizes facing and translation. it_80274198 and it_802741F4 have equivalent owner-selection behavior, optionally moving x51C into owner and clearing x51C before that transition. it_80274250 combines velocity/position setup with the shared transition.

### shard-main__melee__it__it_2725-002
Reviewed canonical and rendered src/melee/it/it_2725.c lines 961–1440 only. This range contains item ownership/attachment setup, uniform model scaling with in-place auxiliary-range scaling, spin-speed computation and selected-joint rotation operations. Joint selection descends zero to three child links according to model-description bits; rotation uses Z, X, or Y according to x17. Additional helpers clear/query flags, populate xB54 coordinates from ECB values and item position, install grab callbacks, select bones through a table or child traversal, dispatch joint operations, test a mask, and initialize life timers. Scaling helpers multiply existing bounds rather than reconstructing them, and the secondary life timer uses a configurable multiplier rather than a literal half.

### shard-main__melee__it__it_2725-003
Reviewed canonical and rendered lines 1441–1543 of `src/melee/it/it_2725.c`, with line 1440 read to identify the opening function. This bounded excerpt implements small item utilities: decrementing the life timer and reporting whether it is nonpositive; setting or clearing individual flags; forwarding `arg2 + HSD_Randi(arg1)` to either of two item routines with constants 127 and 64; initializing selected ItemLink fields; clearing an item's owner before invoking another helper; and resetting three fields while assigning a signed-16-bit input to `xC9C`. This is not a complete-TU review.

### shard-main__melee__it__it_2725-004
The assigned header, `src/melee/it/it_2725.h:1–113`, supplies a guarded declaration interface for item utilities. Its signatures connect item objects and item data with fighter objects/parts, joint objects, vectors, scalar arguments, event/interaction callbacks, and ItemLink pointers. Return types include predicates, integers, floats, and fighter/item/joint pointers. This range contains declarations only: it establishes interface types, not the operations, side effects, or gameplay meanings suggested by rendered names.

### shard-main__melee__it__it_2725-005
The reviewed helpers implement parameterized XY velocity adjustment, shield-bounce velocity reflection with facing synchronization, and indexed hitbox disabling followed by position/state updates across all four hitboxes. The indexed helper does not reactivate its selected hitbox or clear its victim history. Source-level assertion strings, switches, and floating literals are visible, but their compiled section placement remains unverified. This review covers only the assigned subjects.

### shard-main__melee__it__it_2725-006
Reviewed the six assigned functions and all 35 baseline facts. The functions disable all item hitboxes, enable and initialize one or all hitboxes, retrieve an attribute used as a Star-status countdown, find the last registered item of a requested kind, and apply sign-sensitive vertical acceleration with a pre-update speed threshold. Hitbox disabling changes capsule state rather than clearing capsule contents. Gameplay details and attribute-layout claims not established by the inspected source remain deferred. This is bounded subject coverage, not complete TU coverage.

### shard-main__melee__it__it_2725-007
Reviewed the six assigned helpers. They implement lifetime-driven child-model blinking, unconditional child-model reveal, velocity-derived item/collision facing synchronization, direct JObj subtree reveal/hide, and a shared effect/audio/flag-clear sequence used by bomb and missile terminal setup. Visibility recursion accepts null roots and stops below instance nodes. This is bounded subject coverage, not complete TU coverage.

### shard-main__melee__it__it_2725-008
Reviewed the six assigned helpers and supporting source, not the complete TU. Four helpers issue positional effects and item-associated sound requests, then clear the common item flag xC; the Thunder variant first adds the item position to a mutable offset. The other helpers expose a read-only model-animation query and resolve an article-designated attachment joint through a bone table or first-child traversal. Item-specific callers own lifecycle guards and motion-state selection.

### shard-main__melee__it__it_2725-009
Reviewed six assigned functions and their relevant callers. They provide indexed item-model joint lookup, nullable item recognition, fighter/item/other classification, additive and absolute uniform joint scaling, and shared reflected-event velocity, facing, and lifetime updates. Scale animation policy resides in callers. Reflection processing here does not change ownership or motion state. This review does not claim complete TU coverage.

### shard-main__melee__it__it_2725-010
Reviewed six assigned helpers, not the complete translation unit. They implement a decrement-and-expiration lifetime predicate; suppression-aware requests from stored pickup, drop, throw, and contact sound fields; and independently guarded destruction-effect and sound dispatch. The contact wrapper has a kind-specific direct audio-track path. Destruction feedback additionally submits sound 0x12F to a bounded audio bookkeeping table. Actual lifecycle dispatch and removal remain outside these wrappers.

### shard-main__melee__it__it_2725-011
The six assigned helpers gate item audio requests, replace an item's graphical hierarchy while restoring scale and position, and reset shared movement vectors. The physics caller applies and then clears the separate stage and supporting-surface displacement vectors. The audio callee has a no-op sentinel that qualifies the baseline handle-write claim. This review covers only the assigned subjects and necessary supporting code.

### shard-main__melee__it__it_2725-012
The six assigned helpers reset item nudge and collision-response vectors, initialize velocity from a spawn descriptor, and dispatch owner-specific or roster-wide rumble. Motion initialization is unconditional; owner rumble validates the owner as a fighter, while downstream fighter utilities apply eligibility checks and use request ID 1. The broadcast wrapper ignores its item argument. This review covers only the assigned subjects and their necessary supporting code.

### shard-main__melee__it__it_2725-013
Reviewed the six assigned subjects. They implement one-time state-animation sampling, release velocity/facing and planar placement preparation, common release bookkeeping, and two equivalent wrappers that optionally commit a staged owner. The observed item-system paths place preparation before dropped/thrown callbacks and ownership finalization afterward. Other local wrappers reach the common finalizer without dispatching those callbacks, so callback execution is not a universal finalizer precondition. This is bounded subject coverage, not complete TU coverage.

### shard-main__melee__it__it_2725-014
Reviewed the six assigned subjects and their 31 baseline facts. The release wrappers share velocity, attachment-position, and release-bookkeeping helpers; only it_8027429C commits the alternate owner. The attachment routine records fighter attribution and binds the configured item bone before item-specific pickup behavior. Scaling routines assign uniform model scale, refresh enabled hit capsules from x3C, and multiply stored interaction bounds by scl. Owner-relative scaling multiplies the existing scl by the fighter's current Y scale; it does not directly pass that product to hit capsules.

### shard-main__melee__it__it_2725-015
The six assigned helpers calculate a signed item-spin increment, select a descriptor-configured model joint, reset/read/advance its selected rotation axis, and clear a separate Item status bit. Joint depth is extracted with `(descriptor >> 6) & 3`; axis selection maps 0 to Z, 1 to X, and other values to Y. Common physics conditionally advances spin, while item-specific callbacks can invoke the update directly. Collision code also consumes the selected model rotation. This review covers only the assigned subjects and supporting reads.

### shard-main__melee__it__it_2725-016
The six assigned helpers query the flag gating ordinary shield-contact hitlag input, clear or enable paired item/debug-range flags, compute current-versus-retained ECB-center displacement, and refresh or initialize ECB-derived collision geometry. Initialization additionally zeros the displacement fields. The reviewed callers establish shield processing, diagnostic eligibility, collision-response setup, and geometry-refresh ordering; they do not establish that xB54 is itself a HurtCapsule.

### shard-main__melee__it__it_2725-017
The six assigned helpers perform small persistent mutations: scale two planar vectors, scale two four-edge records, assign Item.xD09, increment two separate global counters, and clear the x2 marker. Scaling callers update model scale before scaling the stored geometry. Food construction demonstrates success-gated counter bookkeeping. Common motion-state entry restores a five-flag configuration before clearing x2; Flower logic can explicitly reactivate the inverse configuration. This review covers only the assigned subjects and supporting source ranges.

### shard-main__melee__it__it_2725-018
The six assigned helpers set an item flag, install grab configuration, add joint-reference relations between selected item and fighter joints, remove selected joint-reference relations, and test an item word against a mask. Bone selection uses either the dynamic-bone table or root-child traversal. The attachment constructors allocate and prepend relations rather than replacing existing ones. Gameplay labels and several downstream interpretations remain explicitly deferred.

### shard-main__melee__it__it_2725-019
Reviewed six bounded item utilities: an immediate physics/collision update wrapper, two lifetime setters, common timer-and-flag initialization, a decrement-and-expiration predicate, and an idempotent flag setter. Canonical bodies establish their mutations and interfaces; inspected callers establish projectile initialization, attribute-backed durations, shell initialization, and timed-state callback use. Broader explosion and Adventure Mode mappings remain deferred.

### shard-main__melee__it__it_2725-020-retry193532
The six assigned helpers perform four unconditional Item flag mutations and two randomized audio requests. The flag helpers clear xDC8_word.flags.x1C, clear xDC8_word.flags.x1E, or clear/set xDD0_flag.b4 in place. Shared initialization and actor state-entry routines reuse them. Both audio helpers add HSD_Randi(count) to a caller-provided base request and forward controls 127 and 64; their callees differ in handle storage and replacement behavior. This review covers only the assigned subjects and supporting source excerpts.

### shard-main__melee__it__it_2725-021
The three reviewed helpers initialize detached ItemLink storage, clear item ownership and flag x15 after selected dropped-callback paths, and initialize four item fields from the spawn request's damage value. Read constructors demonstrate link allocation followed by topology and model specialization. Broader gameplay mappings and the full translation-unit descriptions remain explicitly deferred; this review does not establish complete TU coverage.

### shard-main__melee__it__it_2725-022
The assigned subjects concern parameters of four item-hitbox routines. Each routine receives an Item_GObj pointer; it_80272560 and it_80272674 additionally receive an s32 index used to select x5D4_hitboxes. The first pair of routines calls lbColl_80008428 on one or all four hit capsules, invokes per-hitbox processing, and clears item flags. The second pair calls lbColl_80008434 on one or all four capsules and sets x16; the indexed routine additionally advances capsule state and updates position fields. All six assigned subjects have empty baseline fact lists.

### shard-main__melee__it__it_2725-023
The assigned parameters belong to four helpers: `it_80272818` returns the fighter field from an item's special attributes; `it_80272828` searches the item list and returns the last object matching the supplied kind, or NULL; `it_80272860` conditionally subtracts its first float argument from vertical velocity using sign and magnitude tests against its second float argument, without clamping; and `it_802728C8` sets or clears JOBJ_HIDDEN on the root's child hierarchy according to a life-timer remainder. All six assigned subjects have empty baseline fact arrays, so there are no baseline facts to disposition.

### shard-main__melee__it__it_2725-024
Reviewed the function bodies associated with all six assigned parameter subjects. it_80272940 clears JOBJ_HIDDEN on the item's root joint's child. it_80272980 updates facing from horizontal velocity unless its magnitude is below 0.00001 and facing is already nonzero, then synchronizes collision facing. it_80272A18 and it_80272A3C respectively clear and set JOBJ_HIDDEN on their joint arguments. it_80272A60 and it_80272AC4 obtain item data from their object arguments and invoke effect and follow-on helpers; the latter passes its vector argument through lbVector_Add with the item position before spawning the effect. All six subjects have empty baseline fact lists, so there are no baseline fact IDs to disposition. This review does not establish complete TU coverage.

### shard-main__melee__it__it_2725-025
The assigned parameter subjects cover six functions. it_80272AC4 passes its Vec3 argument and the item position to lbVector_Add, then supplies that argument to efSync_Spawn. it_80272B40, it_80272BA4, and it_80272C08 obtain Item data from their object argument and pass its position to efSync_Spawn; each also calls Item_8026AE84 and it_80274C60. it_80272C6C forwards the object's hsd_obj to lb_8000B09C. it_80272C90 uses the object's configured attachment-bone index with it_80272CC0, which selects a dynamic-table bone or traverses child joints. All six assigned subjects have empty baseline fact lists.

### shard-main__melee__it__it_2725-026
The assigned subjects have no baseline facts. Their containing functions implement indexed joint lookup, a null-safe item-classifier predicate, a three-result object classification wrapper, and forwarding one scalar to the X/Y/Z joint-scale addition helpers. Joint lookup uses the dynamic bone table when the model's bone count is nonzero; otherwise it descends through child joints according to the index. The nearby caller supplies the model descriptor's attachment-bone index. These observations describe source-level parameters, not verified register assignments.

### shard-main__melee__it__it_2725-027
The assigned subjects have no baseline facts. Their containing canonical functions set uniform joint scale, reverse and scale an item's XY velocity while reversing facing and resetting its lifetime, decrement and test lifetime, or conditionally pass stored item fields to Item_8026AE84. This review covers only these bounded subjects.

### shard-main__melee__it__it_2725-028
The assigned subjects have no baseline facts. Their containing functions obtain Item data from an Item_GObj, except it_802732E4, which accepts Item directly. it_802731E0 conditionally forwards xD74 to Item_8026AE84. it_8027321C conditionally forwards xD84, using a different call for It_Kind_Unk4. it_8027327C forwards ID1 to it_802787B4 unless ID1 is -1; when xDCD_flag.b2 is clear, it forwards ID2 through it_802732E4 and additionally calls lbAudioAx_80024DC4 for ID2 equal to 0x12F. it_802732E4 gates its forwarding call on the same flag.

### shard-main__melee__it__it_2725-029
The assigned subjects have no baseline facts. Their enclosing functions conditionally forward an integer argument to Item_8026AE84; store a supplied joint descriptor and invoke object-update helpers; dispatch a series of state resets; forward item user data to itResetVelocity; and zero all three components of x64_vec_unk2. These observations describe source-level arguments and operations, not verified compiled register assignments or gameplay meanings.

### shard-main__melee__it__it_2725-030
The assigned parameter subjects belong to item-state helpers. it_80273484 clears x58_vec_unk; it_8027349C clears x70_nudge; it_802734B4 clears four vectors and initializes xAC_unk to (0, 1, 0). it_80273500 copies its Vec3 input into the item's velocity and invokes the auxiliary reset helpers. it_80273598 obtains the item's owner and conditionally forwards two integer arguments to ftLib_80086D40. All six assigned subjects have empty baseline fact arrays, so there are no baseline fact dispositions to emit. This review covers these subjects, not the complete translation unit.

### shard-main__melee__it__it_2725-031
The assigned parameter subjects belong to three small wrappers. `it_80273598` forwards its two signed-integer arguments to `ftLib_80086D40` with the item's owner, conditional on a non-null owner passing `ftLib_80086960`. `it_80273600` uses the same owner guard before calling `ftLib_80086E68`. `it_80273648` ignores its item-object argument and forwards its two signed-integer arguments directly to `ftLib_80086DC4`. All six assigned subjects have empty baseline fact lists; there are no baseline fact IDs to disposition.

### shard-main__melee__it__it_2725-032
The six assigned parameter subjects contain no baseline facts. Current source shows that `it_80273670` takes an item object, a descriptor index, and a floating-point animation frame; it selects the descriptor, installs and evaluates its animation, removes animation objects, and clears the command pointer. `it_80273748` takes an item object and position/velocity vectors; it copies and scales velocity, updates facing, and sets planar position from the supplied position plus a conditional attachment-derived offset. No register-to-source-parameter mapping is asserted.

### shard-main__melee__it__it_2725-033
The six assigned parameter subjects have no baseline facts. The reviewed functions operate on an item object: `it_80273B50` copies and scales an input velocity vector, updates facing, and positions the item relative to an owner joint; `it_80273F34` updates item flags and counters and passes a supplied object into associated setup helpers; `it_80274198` selects the current or alternate owner and conditionally commits the alternate owner before calling `it_80273F34`. This review is limited to the assigned subjects, not the complete translation unit.

### shard-main__melee__it__it_2725-034
Reviewed the current bodies associated with the six assigned parameter subjects. All three functions receive an Item_GObj pointer first. it_802741F4 receives a boolean second: when x0 is set, it selects x51C for the downstream call and, if the boolean equals true, transfers x51C into owner and clears x51C. it_80274250 and it_8027429C receive a Vec3 pointer second and forward it with the item object to it_80273B50. Both subsequently select an object for it_80273F34; only it_8027429C transfers x51C into owner and clears x51C when x0 is set. The bundle contains no baseline facts to disposition.

### shard-main__melee__it__it_2725-035
The six assigned parameter subjects have no baseline facts to assess. Current source shows that `it_802742F4` receives an item object, another GObj, and a Fighter_Part; it conditionally updates ownership-related fields and forwards the GObj and part to `it_80274F48`. `it_80274484` receives an item object, a joint, and a floating-point scale; it stores the scale on the item, applies it uniformly to the supplied joint, and invokes three item update helpers. This review is limited to the assigned subjects, not the entire translation unit.

### shard-main__melee__it__it_2725-036
The assigned parameters belong to item scale and rotation helpers. it_80274574 forwards its item object to it_80274594, which multiplies stored scale by an owner-dependent return value, applies uniform joint scale, and invokes three update helpers. it_80274658 computes stored spin speed from a floating-point multiplier, adjusts its sign using facing, horizontal velocity, and a flag, and returns the horizontal-velocity sign. it_802746F8 selects a joint by following zero to three child pointers according to model descriptor bits. it_80274740 uses that selection, clears stored spin speed, and zeroes the rotation component selected by a flag. All six assigned subjects have empty baseline fact lists.

### shard-main__melee__it__it_2725-037
The six assigned parameter subjects have no baseline facts. Their current function bodies take an `Item_GObj*` and access its item data. `it_80274990` reads a selected joint's rotation; `it_80274A64` adds `xD3C_spinSpeed` to that rotation. Both select joint depth from model-description bits and select Z, X, or Y through `x17`. `it_80274C60` clears `xC`, and `it_80274C78` returns it. `it_80274C88` clears `xDD0_flag.b0` and `xDAA_flag.b3`; `it_80274CAC` sets the former and conditionally sets the latter when `db_ShowEnemyStompRange()` is nonzero. This review covers only the assigned subjects, not the entire translation unit.

### shard-main__melee__it__it_2725-038
The assigned parameters belong to five item helpers. it_80274D04 passes its item object to two vector-producing helpers and writes their x/y differences into its output structure. it_80274D6C updates xB54.x8 using ECB coordinates plus item position; it_80274DAC additionally clears xB54.unk_x and unk_y. it_80274DFC multiplies two pairs of item fields by scl, and it_80274E44 multiplies the top, bottom, right, and left fields of xBEC and xBDC by scl.

### shard-main__melee__it__it_2725-039
The assigned subjects concern four small item-state setters. it_80274ECC takes an Item_GObj and writes its bool argument to the underlying Item's xD09. it_80274EF8 and it_80274F10 take an Item_GObj and clear or set xDC8_word.flags.x2, respectively. it_80274F28 takes an Item directly, sets xDD0_flag.b5, stores its s8 argument in xD08, and installs two supplied callbacks. All six assigned parameter subjects have empty baseline fact lists; there are no baseline facts to disposition. This review covers only the bounded shard.

### shard-main__melee__it__it_2725-040
The six assigned parameter subjects contain no baseline facts. In the inspected canonical bodies, it_80274F28 stores its two callback arguments into grab_dealt and grabbed_for_victim, stores arg1 into xD08, and sets xDD0_flag.b5. it_80274F48 resolves an item joint using the supplied bone index, then passes that joint and the result of ftLib_80086630(arg2_gobj, part_idx) to lb_8000C2F8. Joint resolution uses the dynamic bone table when the model bone count is nonzero; otherwise it follows child pointers from the item joint.

### shard-main__melee__it__it_2725-041
The assigned subjects contain no baseline facts. In the current source, it_80274FDC selects a joint using the item object and bone ID, then passes it and the result of ftLib_80086630(fighter object, part index) to lb_8000C1C0. it_80275070 selects a joint using the same helper and passes it to lb_8000C390. Joint selection uses the dynamic bone table when the model descriptor's bone count is nonzero; otherwise it starts at the object's root joint and follows child pointers for positive bone IDs. This review is limited to the six assigned parameter subjects.

### shard-main__melee__it__it_2725-042
The assigned parameters belong to four small item helpers. `it_802750E8` tests the item's `xDC0` against an input mask. `it_802750F8` clears `xDCC_flag.b3`, calls `Item_802697D4` and `Item_80269978` with the same object, then sets the bit. `it_80275158` writes the supplied lifetime to `xD44_lifeTimer` and its product with `it_804D6D28->x4C_float` to `xD48_halfLifeTimer`; `it_80275174` writes only the latter product. All six assigned subjects have empty baseline fact lists, so no baseline dispositions are required.

### shard-main__melee__it__it_2725-043
The assigned parameter subjects belong to six item helpers. `it_80275174` scales its lifetime argument into the item's half-life timer. `it_8027518C` initializes the life timer from shared configuration, sets two flags, and calls `it_8026BDB4`. `it_802751D8` decrements the life timer and reports whether it is nonpositive. The remaining three helpers respectively set and clear `xDC8_word.flags.x1C`, and clear `xDC8_word.flags.x1E`, using the item object's user data. All six assigned subjects have empty baseline fact lists.

### shard-main__melee__it__it_2725-044
The assigned subjects have no baseline facts to assess. Their current function bodies show that it_80275258 and it_80275270 obtain Item data from the supplied object and clear or set xDD0_flag.b4, respectively. it_80275288 obtains Item data and passes arg2 + HSD_Randi(arg1), 127, and 64 to Item_8026AE84. it_802752D8 performs the same computation but calls Item_8026AFA0. No gameplay interpretation or compiled parameter-layout claim is made.

### shard-main__melee__it__it_2725-045
The assigned parameter subjects belong to four helpers. `it_802752D8` passes `arg1` to `HSD_Randi`, adds `arg2`, and forwards the result to `Item_8026AFA0` with constants 127 and 64. `it_80275328` initializes selected ItemLink fields and stores its supplied object pointer. `it_80275390` clears the item's owner and calls `it_8026B3A8`. `it_802753BC` resets three item fields and assigns its signed 16-bit argument to `xC9C`. All six assigned subjects have empty baseline fact lists; there are no baseline fact IDs to disposition.

### shard-main__melee__it__it_2725-046
The assigned parameter subject has no baseline facts to assess. In the canonical body of `it_802753BC`, the second source parameter is `s16 arg1`; its value is copied to the item's `xC9C` field while `xC94`, `xCA0`, and `xCA4` are cleared. No gameplay meaning or compiled-register mapping is established.

### shard-main__melee__it__it_2725-047
The reviewed helpers initialize linked item components, control model visibility, resolve article-selected attachment joints, propagate item scale, calculate direction-dependent spin, clear a flag, and execute paired immediate item updates. Local source supports the visibility, attachment-node, and scaling relationships. Caller-dependent gameplay relationships remain deferred where canonical callers could not be accessed. This review does not claim complete TU coverage.

### shard-main__melee__it__it_2725-048
The reviewed helpers resolve article-selected joints, restore model visibility, set uniform joint scale, and request positional effects with shared audio. Samus missile collision paths select distinct presentation helpers for ordinary and smash missiles. Other reviewed routines select a model descendant and compute a two-dimensional difference between helper-produced positions. This review does not establish complete TU coverage.

### shard-main__melee__it__it_2725-049
Reviewed the twelve assigned links against current helper bodies and relevant item callers. The helpers initialize ECB-derived coordinates, apply model spin and shield-bounce velocity changes, participate in pickup/drop/throw transitions, and provide shared effect/audio presentation for projectile interactions. The Yoshi Star helper calls are verified, but their connection to Yoshi Bomb remains deferred. This is bounded link coverage, not complete TU coverage.

### shard-main__melee__it__it_2725-050
Reviewed the 12 assigned links. Canonical code supports shared item audio playback, food-category registration bookkeeping, release preparation for throwing and dropping, and integration with the shared physics update. Specific explosion, contact-rebound, and Pokémon attack mappings remain deferred where the necessary caller or resource evidence was unavailable.

### shard-main__melee__it__it_2725-051
Reviewed the twelve assigned links against current helper bodies and selected callers. The helpers initialize hitbox position history, finalize item release and ownership bookkeeping, manipulate attachment-related joints and item flags, and dispatch effects and tracked audio. Several concrete call relationships are confirmed, but some named gameplay mappings require additional evidence beyond the item module names or numeric motion states. This is bounded link review, not complete TU coverage.

### shard-main__melee__it__it_2725-052
Reviewed the twelve assigned links, not the entire TU. Current source supports shared item audio requests, pickup and throw integration, velocity initialization, transient displacement clearing, gravity-like vertical acceleration, and hitbox endpoint initialization. Character-specific article mappings and the detailed rumble and Star-duration interpretations remain deferred where supporting implementation evidence was not established.

### shard-main__melee__it__it_2725-053
Reviewed the twelve assigned links only. Current bodies and available callers support item destruction presentation, stored sound playback, shield-contact gating, hierarchical animation evaluation, Hammer hitbox configuration, model-spin orientation access, and drop preparation. Item-specific constructor and attachment mappings remain deferred where their cited caller files were unavailable; the rumble wrapper's downstream semantics also remain unverified.

### shard-main__melee__it__it_2725-054
Reviewed the eleven assigned links only. Current code confirms owner-relative scaling and auxiliary-bound propagation, conditional item audio requests, ECB-derived position data, grab-callback registration used by Like Like, effect/audio dispatch used by Samus Bomb, and ownership clearing after drop callbacks. Model-construction and controller-rumble interpretations require additional callee verification.

Status: researched; no-change lead bypass; independent review and live promotion pending.
