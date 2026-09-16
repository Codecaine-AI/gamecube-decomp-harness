# Disjoint Librarian Research

### shard-main__melee__it__item-000
Reviewed canonical and rendered item.c lines 1–480 only. This range initializes item-related allocators and global accounting state; provides a predicate testing gm_8016AE80() against -1 and wrappers passing that predicate or false to it_8027870C; initializes an existing item's spawn-derived position, facing, owner, animation state, interaction references and callbacks; conditionally clears a camera-box association; and classifies spawn kinds into numeric hold_kind categories. Counter helpers update category-specific globals, with important asymmetry: incrementing category 0 also increments x1C for It_Kind_M_Ball, while decrementing category 9 decrements x1C and the increment switch has no category-9 case. Both helpers conditionally update x60. The range ends partway through a category-based threshold check, after comparisons for categories 0–2.

### shard-main__melee__it__item-001
Reviewed canonical and rendered item.c lines 481–960 only. The opening switch tail compares global counters against thresholds; case 9 additionally decrements its counter when above threshold. Item_80267978 selects article, logic and state tables by item-kind ranges. Item_80267AA8 initializes spawn-derived identity, article attributes, references, flags, counters, scale and sound fields, then assigns a parent-dependent team value. Model helpers load or allocate the root joint, traverse joints to change material classes and build a joint-pointer table, apply uniform scale, and initialize per-descriptor dynamics. Three local helpers implement hold-kind-dependent field updates, conditional owner-kind bookkeeping, and conditional camera-subject setup. The visible beginning of Item_8026862C gates creation, selects a render callback, allocates user data, invokes initialization helpers and registers update procedures; its completion is outside this shard.

### shard-main__melee__it__item-002
Reviewed canonical and rendered item.c lines 961–1440 only.

- Spawn wrappers select GA_Air or GA_Ground, set x10 to zero or one, and delegate initialization and creation; the x10=1 wrapper discards the result.
- Animation helpers recursively attach animation trees, conditionally skip dynamic-bone skeleton subtrees, replace state animations, request/evaluate frames, and initialize script pointers and counters.
- Item_80268E5C installs a motion-state index and table callbacks, applies flag-dependent updates, resets selected transient fields, and selects animation/script data. Animation ID -1 removes animations and clears the script pointer; callback slots not supplied by the state table are cleared.
- Update routines service pending hitlag flags and decrement the hitlag counter, advance animation and invoke its callback, maintain conditional timers, and dispatch removal requests with explicit destroy_type values.
- Boundary checking independently enables right, left, upper, and lower tests. The upper threshold is the literal 10000.0f, not a stage-top query. Physics processing conditionally invokes its callback and integrates velocity plus nudge, then applies additional displacement vectors outside those integration gates.
- Collision processing either dispatches removal when its callback returns true or synchronizes model translation and invokes two helpers. Accessory processing flushes effects, conditionally invokes its callback, reacquires item data, synchronizes camera-subject positions, and invokes three maintenance helpers.

### shard-main__melee__it__item-003
Reviewed canonical and rendered item.c lines 1441–1920 only.

- Grab processing conditionally invokes paired item/victim callbacks. Damage accumulation is capped above at 999; interaction reset clears transient damage, contact references, vectors and flags, and restores two multipliers to 1.
- Shield handling chooses shield_bounced versus hit_shield using flags, ground_or_air and an angular threshold. Reflection conditionally transfers owner/team state, copies interaction metadata, invokes reflected, and, unless inhibited, scales enabled hitbox damage with an upper cap.
- Predicate callbacks that return true set destroy_type to 2, call Item_8026A8EC and short-circuit processing.
- Hitlag helpers invoke entry/exit callbacks, maintain flags, and conditionally propagate transitions to atk_victim. Item_8026A294 selects only the first applicable interaction: received damage/knockback, shield contact, clank, dealt damage, reflection, absorption, then touch. Surviving paths establish hitlag and reset transient interaction state.
- Remaining complete helpers iterate dynamic-bone descriptors, invoke spawned when present, select fighter-facing helper calls using hold_kind and explicit kind exclusions, dispatch destruction-effect arguments by destroy_type, and invoke nullable callbacks.

### shard-main__melee__it__item-004
Reviewed canonical and rendered item.c lines 1921–2188 only.

- Item_8026A8EC coordinates destruction: validates item data, invokes cleanup helpers, destroys effects, conditionally processes owner-related branches, invokes the destroyed callback, clears owner and eligible camera state, processes dynamic-bone descriptors, clears audio and queued effects, and calls the GObj unlink/removal helper.
- Pickup invokes setup helpers and the picked_up callback, then clears the second tracked audio slot. Two drop paths store xC44 and invoke dropped, but differ in vector/setup helpers; both conditionally call it_80275390. The throw path invokes thrown and does not use arg4. Enter-air sets x1F only when an entered_air callback exists and has run.
- User-data removal frees an optional dynamic-bone table and then the Item allocation. The counter accessor returns the old counter value and increments again if the new value wraps to zero; this alone does not establish that the returned value can never be zero.
- Audio wrappers maintain three tracked handles. Input 540000 leaves them unchanged. Input 540001 is handled differently: the xD6C wrapper passes 540000 to the audio call, whereas the two other wrappers clear their respective slots. Ordinary inputs replace sfx_unk1 or sfx_unk2 after submitting any previous handle to lbAudioAx_800236B8. Aggregate cleanup ends with all three handles set to SFX_NONE.
- Item_IsGrabbable returns exactly the conjunction of flag x15 being nonzero and picked_up being non-null.

### shard-main__melee__it__item-005
Reviewed canonical and rendered `src/melee/it/item.h` lines 1–64 only. This guarded header exposes the item module's typed interface: no-argument entry points; object-oriented entry points accepting `HSD_GObj*` or `Item_GObj*`; three `SpawnItem*` interfaces, two returning `Item_GObj*`; state-descriptor interfaces and an entry point accepting a state identifier and change flags; item/damage, owner/fighter-part, vector, and sound-parameter interfaces; user-data removal callbacks; and a boolean `Item_IsGrabbable` declaration. It also declares four external objects involving allocation, tracking, and integer-vector types. These declarations establish signatures, not implementation behavior or gameplay mappings.

### shard-main__melee__it__item-006
Reviewed canonical and rendered `src/melee/it/item.dox` lines 1–228 only. This is a documentation companion targeting `melee/it/item.h`, primarily comprising declarations and brief, sometimes explicitly tentative descriptions. It catalogs item initialization, spawning, model and animation setup, state changes, per-frame processing, collision and hitlag helpers, ownership transitions, destruction, and sound operations; these are documented roles, not implementation-verified behavior. Its concrete accessor definitions are `GET_ITEM`, which casts `HSD_GObjGetUserData(gobj)` to `Item*`, and deprecated `GetItemData`, which returns `gobj->user_data` as an `Item*`. Neither accessor definition contains an explicit null check.

### shard-main__melee__it__item-007-retry191012-retry191917
The reviewed item startup code registers three object pools, initializes shared limits and bookkeeping, and seeds tracking and sentinel values. Item teardown returns its optional dynamic-bone allocation and Item record to their respective pools. Item_80266F3C tests the active rules' item-frequency value against -1; the debug spawning caller uses a false result to reject common-item selections. Item_80266F70 forwards that predicate to a loader which ignores the argument, selects an archive by language, and publishes six root fields. Match startup calls this resource-loading wrapper before item runtime initialization. This review does not establish compiled section membership or complete TU coverage.

### shard-main__melee__it__item-008
Reviewed the six assigned subjects: fixed-false shared-data loading, item-pool/global initialization, common spawned-item initialization, optional camera-box cleanup, spawn-kind classification, and removal-side population accounting. Current callers establish their scene-start, construction, and teardown contexts. Numeric hold-kind buckets are treated as internal classifications, not independently established gameplay behaviors.

### shard-main__melee__it__item-009
Reviewed the six assigned subjects and their construction context. They maintain category accounting, reject selected over-capacity spawn requests, bind kind-specific article/logic/state tables, initialize Item storage, construct a descriptor-backed or fallback JObj, and traverse model materials to request the item-specific material class. Category 9 accounting is exceptional rather than a symmetric increment/decrement pair. Article references are established inside the Item initializer, not supplied as preinitialized Item fields.

### shard-main__melee__it__item-010
Reviewed the six assigned item-construction subjects. The shared constructor checks admission, allocates an item GObj and userdata, selects a rendering callback, initializes model-related state, and registers ten processes, with rollback on allocation failure. Its helpers build a depth-first joint lookup table, apply uniform model scale, and initialize article-defined dynamics chains. Two public wrappers select airborne or grounded creation, clear x10, prepare the descriptor, and propagate the constructor result. This review does not claim complete TU coverage.

### shard-main__melee__it__item-011-retry191547
This bounded shard covers grounded marked-item creation, recursive animation attachment, state-animation replacement, animation-frame positioning, command-context initialization, and common item motion-state entry. Creation marks requests for predicate-dependent shared accounting and discards creation failure results. Animation attachment skips registered dynamic skeleton subtrees only when the corresponding AnimJoint exists. State entry combines flag-controlled cleanup with descriptor selection, optional animation/script restart, and callback replacement.

### shard-main__melee__it__item-012
Reviewed the six assigned item-update subjects. They service deferred hitlag releases and duration, advance model animation and command scripts, process animation-requested removal and lifetime expiration, enforce enabled spatial bounds, integrate intrinsic and environmental displacement, and dispatch collision callbacks before synchronizing surviving models. Hitlag suppresses animation and intrinsic physics, not every environmental displacement or maintenance operation. This review does not claim complete translation-unit coverage.

### shard-main__melee__it__item-013
Reviewed the six assigned item routines and their relevant implementation dependencies. They synchronize deferred effects, accessory callbacks, camera positions and collision bounds; dispatch jumped-on callbacks or maintain attack capsules; detect fighter captures; coordinate received-damage logging and maximum-knockback selection; add damage with an upper cap of 999; and clear transient interaction results after event dispatch. Gameplay-specific shell, Barrel Cannon and general damage-percentage claims remain partially unverified. This review does not claim complete translation-unit coverage.

### shard-main__melee__it__item-014
Reviewed the six assigned functions and their local callers. Shield-contact processing selects one of two callbacks and performs terminal cleanup on a true result. Reflection processing conditionally replaces ownership, copies reflection state, dispatches a callback, and conditionally recalculates four active hitboxes. The four hitlag helpers coordinate entry, exit, and release of overlapping hold markers; callbacks precede active-state changes, and linked-victim propagation is guarded. This is bounded subject coverage, not complete TU coverage.

### shard-main__melee__it__item-015-retry191547
The six assigned functions cover prioritized item-contact responses and hitlag entry, scheduled dynamic-bone updates, optional spawn-callback dispatch, identity-checked fighter-reference cleanup, common item teardown, and the ordered pickup/owner-association transition. Construction registers the two recurring processes and invokes the spawn dispatcher. Pickup is also reused by the Boomerang constructor. Teardown dispatches the destroyed hook conditionally through a null-checking wrapper; allocation recycling is implemented separately in Item_OnUserDataRemove. This review does not establish complete translation-unit coverage.

### shard-main__melee__it__item-016
Reviewed the six assigned functions and their 36 baseline facts. The release wrappers dispatch dropped or thrown callbacks and perform shared release finalization; the single-vector drop wrapper consumes velocity, despite naming its parameter `pos`. The enter-air wrapper conditionally dispatches a callback and then sets a flag. The serial allocator returns the old counter and skips zero in the initialized sequence. The audio wrapper conditionally starts playback and stores its handle, with two special request values. This review does not establish complete translation-unit coverage.

### shard-main__melee__it__item-017
Reviewed the six assigned subjects, not the complete translation unit. The paired Item playback helpers replace independently tracked sound handles, with 540000 leaving state unchanged and 540001 invoking stop-and-clear. Their cleanup helpers conditionally submit the stored handle to audio cleanup and always clear it. Destruction-time audio cleanup processes three stored references before object unlinking. Item_IsGrabbable is a read-only conjunction of the runtime x15 flag and a non-null picked_up callback, used before fighter pickup range and candidate selection.

### shard-main__melee__it__item-018
The reviewed paths create pooled Item user data, register rendering and scheduled callbacks, initialize article-defined dynamics, dispatch lifecycle callbacks, and release retained resources. User-data removal returns the optional bone table before the Item to their respective pools. Category bookkeeping is asymmetric: hold_kind 9 has no ordinary creation increment, while creating a kind It_Kind_M_Ball in category 0 additionally increments x1C.

### shard-main__melee__it__item-019
The assigned parameter subjects belong to item counter maintenance, counter-limit checking, article/logic-table selection, and initialization. Item_802675A8 and Item_802676F4 obtain Item data from their GObj argument and decrement or increment counters selected by hold_kind; their behavior is not fully symmetric. Item_8026784C selects counter comparisons using its first argument, does not use its second argument, and additionally decrements x1C when case 9 exceeds its limit. Item_80267978 populates article, logic-table, and state-container pointers on the supplied object's Item data. Item_80267AA8 initializes that data from spawn input, article attributes, and defaults. All six assigned subjects have empty baseline fact arrays, so there are no fact IDs to disposition. No new facts are proposed.

### shard-main__melee__it__item-020
The assigned parameters belong to item initialization and model-setup routines. Item_80267AA8 consumes a SpawnItem descriptor to initialize item data. The other five routines consume an HSD_GObj to attach a joint, change material classes throughout its joint tree, construct a joint-pointer table, apply uniform model scale, and initialize dynamics records from article descriptors. Their shared creation caller establishes the setup order and aborts if joint-table allocation fails. All six assigned subjects have empty baseline fact arrays; there are no baseline fact IDs to disposition. This review does not claim complete TU coverage.

### shard-main__melee__it__item-021
The assigned spawn-function parameters supply a SpawnItem descriptor. Item_8026862C uses it for admission checking, render-function selection and item initialization, returning NULL on checked failures. The three wrappers mutate the descriptor before forwarding it: Item_80268B18 sets GA_Air and x10=0; Item_80268B5C sets GA_Ground and x10=0; Item_80268B9C sets GA_Ground and x10=1 and discards the creation result. Item_80268BE0 takes a destination joint and corresponding animation descriptor as its first two source parameters. It recursively traverses joint children and siblings with corresponding animation descriptors. When a non-null animation descriptor accompanies a joint matching a dynamic-bone skeleton, it skips attachment and child traversal, visiting the sibling only if anim_joint->next is non-null. All six assigned subjects have empty baseline fact lists.

### shard-main__melee__it__item-022
The assigned subjects concern animation attachment and evaluation. Item_80268BE0 recursively attaches joint, material, and shape animations, consulting the item's dynamic-bone skeleton list to skip matching subtrees. Item_80268D34 removes existing animations, optionally restores joint data, attaches the state descriptor's animations, sets animation speed, and requests frame zero. Item_80268DD4 requests and evaluates a supplied frame and stores the resulting current frame. All six assigned subjects have empty baseline fact lists; no baseline fact dispositions or new facts are proposed.

### shard-main__melee__it__item-023
The six assigned parameter subjects contain no baseline facts. Their canonical function bodies implement animation-frame requests, script-pointer installation with loop/timer reset, and flag-controlled item-state transitions. The state transition stores the requested state index, selects its animation and callbacks, conditionally refreshes animation/script state, and clears auxiliary callbacks. No compiled register-to-parameter mapping is asserted.

### shard-main__melee__it__item-024
The six assigned parameter subjects correspond to functions whose sole source parameter is `HSD_GObj* gobj`. Each obtains item state from that object. Their bodies respectively update the hitlag countdown and flags; advance joint animation and record its frame; run animation callbacks and conditional timers; test enabled position bounds; integrate conditional movement and invoke the bounds check; and run the collision callback or synchronize joint translation. All six subjects have empty baseline fact lists, so there are no fact records to retain, supersede, reject, or mark unresolved.

### shard-main__melee__it__item-025
The assigned subjects have no baseline facts to assess. Their current function bodies use object parameters to access item state and dispatch callbacks or helper calls. Item_80269A9C conditionally invokes on_accessory and copies item position into a camera subject; Item_80269B60 conditionally sets destroy_type to 2 and invokes Item_8026A8EC; Item_80269BE4 dispatches grab callbacks when its flag and victim conditions hold. Item_80269C5C invokes one parameterless helper followed by three helpers receiving its object. Item_80269CA0 adds its signed damage argument to the supplied Item's xC9C and caps the result at 999, without a lower clamp. This review covers only the assigned subjects, not the entire translation unit.

### shard-main__melee__it__item-026
The six assigned parameter subjects have no baseline facts to disposition. Their canonical functions each accept an `HSD_GObj* gobj` and obtain Item data from its user data. The reviewed bodies reset interaction fields, dispatch shield-contact callbacks, process reflection-related ownership and damage updates, conditionally exit hitlag while clearing flags, or invoke the hitlag-entry callback and propagate entry to an attack victim under guards. This review covers only the assigned subjects, not the entire translation unit.

### shard-main__melee__it__item-027
The assigned functions receive an HSD_GObj pointer and retrieve its Item user data. Their bodies handle hitlag-exit callbacks and conditional propagation, prioritized interaction callbacks and hitlag state updates, iteration over dynamic-bone descriptors, and optional spawned-callback dispatch. Item_8026A848 additionally receives a fighter_gobj pointer and conditionally passes it to fighter-library helpers according to item fields and helper results. All six assigned subjects have empty baseline fact lists; there are no fact IDs to disposition.

### shard-main__melee__it__item-028
The assigned subjects cover parameters of three item routines. Item_8026A8EC receives the item object being cleaned up: it dispatches the destruction callback, clears ownership, releases camera and dynamic-bone resources, clears queued effects, and finishes with object removal. Item_8026AB54 receives an item object, an owner object, and a Fighter_Part; it forwards all three to it_802742F4 and dispatches the item's picked_up callback. Item_8026ABD8 receives an item object and a Vec3 pointer among its arguments; it forwards the vector to it_80273B50 and dispatches the dropped callback. All six assigned subjects have empty baseline fact lists, so there are no baseline facts to disposition.

### shard-main__melee__it__item-029
The assigned subjects have no baseline facts. The inspected canonical bodies show Item_8026ABD8 storing its float argument in xC44, forwarding its vector argument to it_80273B50, and invoking the dropped callback. Item_8026AC74 stores its float argument in xC44, forwards both vector arguments to it_80273748, and invokes the dropped callback. Item_8026AD20 similarly forwards both vectors and stores the float, but invokes the thrown callback; its final boolean parameter is unused in the body. These source-level observations do not establish the register-labeled parameter identities.

### shard-main__melee__it__item-030
The six assigned parameter subjects contain no baseline facts. In the inspected canonical bodies, Item_8026AD20 forwards two vector pointers to it_80273748, stores arg3 in xC44, invokes the optional thrown callback, and performs additional helper calls; its boolean arg4 is unused. Item_8026ADC0 invokes entered_air when present and then sets xDC8_word.flags.x1F. Item_8026AE84 conditionally stores an audio-helper result in the supplied Item's xD6C. This review covers only the assigned subjects, not the complete translation unit.

### shard-main__melee__it__item-031
The six assigned parameter subjects contain no baseline facts. The reviewed canonical bodies take `Item* item_data, enum_t sfx, u8 pan, u8 volume`. Both functions leave state unchanged for `sfx == 540000`. Item_8026AE84 otherwise stores an audio-call result in `xD6C`, passing 540000 directly for input 540001 or passing other inputs through lbAudioAx_800233EC. Item_8026AF0C instead manages `sfx_unk1`: ordinary inputs first conditionally release the previous handle and then replace it; input 540001 invokes Item_8026B034, which conditionally releases that handle and sets it to SFX_NONE. The final two source parameters are forwarded unchanged to lbAudioAx_800237A8.

### shard-main__melee__it__item-032
The assigned subjects belong to two item audio wrappers and one slot-reset helper. Item_8026AF0C and Item_8026AFA0 accept an Item pointer, an enum_t sfx argument, and u8 pan and volume arguments. They leave state unchanged for sfx 540000; for ordinary values they pass any existing slot value to lbAudioAx_800236B8, then replace the slot with the result of lbAudioAx_800237A8(lbAudioAx_800233EC(sfx), pan, volume). Value 540001 instead invokes the corresponding reset helper. Item_8026B034 conditionally passes sfx_unk1 to lbAudioAx_800236B8 and unconditionally sets that field to SFX_NONE. All six assigned subjects have empty baseline fact lists.

### shard-main__melee__it__item-033
Reviewed the four assigned parameter subjects; all have empty baseline fact lists. In the canonical bodies, Item_8026B074 receives Item data, conditionally passes sfx_unk2 to an audio helper, then clears that field to SFX_NONE. Item_8026B0B4 receives a game object, retrieves its Item data, invokes audio helpers, and ultimately resets three audio fields. Item_IsGrabbable receives an item game object and returns true exactly when its Item data has flag x15 set and a non-null picked_up callback. Item_OnUserDataRemove receives opaque user data, casts it to Item*, frees its optional dynamic-bone table, then frees the Item allocation. This review is limited to the assigned subjects, not the entire translation unit.

### shard-main__melee__it__item-034
The reviewed links describe shared item initialization, construction and spawn callbacks, pickup/drop and entered-air hooks, lifetime expiration, shield-hit handling, hitlag transitions, and removal cleanup. Current canonical code supports all twelve assigned relationships. This review covers only this bounded link shard, not the entire translation unit.

### shard-main__melee__it__item-035
Reviewed the 12 assigned semantic links against current canonical source, not the entire translation unit. The inspected code implements parameterized item creation, parent-team and diagnostic initialization, table-driven motion-state entry, collision-triggered removal, capped accumulated damage, coordinated hitlag exit, and item-resident sound-handle management. Baseline line locations have shifted; evidence below uses the pinned current revision.

### shard-main__melee__it__item-036
Reviewed the twelve assigned links against current canonical source. The inspected item routines manage camera-box removal, thrown callbacks, allocator-pool recycling, model construction, animation and script execution, match setup participation, sound cleanup, and grab callback dispatch. Random-spawning and Barrel Cannon-specific interpretations remain deferred; this is not complete translation-unit coverage.

### shard-main__melee__it__item-037
Reviewed the 12 assigned links against current canonical code. The inspected routines support item initialization and population limits, uniform model scaling, hierarchical animation installation, debug-selected spawning, jump-on callback dispatch, reflection response, and hitlag transitions. The pickup predicate is confirmed locally, but its baseline fighter-caller claim remains unresolved because the cited caller path is absent. This is bounded link coverage, not complete translation-unit coverage.

### shard-main__melee__it__item-038
The reviewed code constructs and schedules item objects, provides an explicitly airborne spawn wrapper, dispatches dropped/thrown and absorbed callbacks, coordinates hitlag entry and exit, and performs shared item teardown. The damage-processing wrapper delegates to four collision helpers; its detailed gameplay interpretation remains deferred. This review covers only the assigned links, not the entire translation unit.

### shard-main__melee__it__item-039
The reviewed item routines parameterize and create item objects, register their scheduled processes, initialize dynamic-bone descriptors, bind hierarchical animations, check removal boundaries, dispatch dropped callbacks, release item resources, and submit sound requests. Damage accumulation is capped at 999. This assessment covers only the assigned links, not the entire translation unit.

### shard-main__melee__it__item-040-retry191917
The reviewed item routines gate creation by category counters, parameterize grounded spawning, install state animation and callbacks, integrate movement, dispatch shield and pickup callbacks, update dynamic-bone descriptors, and destroy item resources. Source confirms allocator-backed teardown but does not establish the compiled `.bss` target's identity. This review covers only the assigned links.

### shard-main__melee__it__item-041
The reviewed paths implement common item removal and hitlag updates. Removal invokes the destroyed callback, clears ownership and camera state, processes dynamic-bone cleanup, clears effects, and delegates game-object teardown. Hitlag updates decrement and clamp the frame counter, clear timer-related flags, and invoke the exit callback path when both guard flags are clear; the exit path re-enables animation by clearing its gating flag.

Status: researched; no-change lead bypass; independent review and live promotion pending.
