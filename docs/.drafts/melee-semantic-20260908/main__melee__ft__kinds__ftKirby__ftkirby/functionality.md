# Disjoint Librarian Research

### shard-main__melee__ft__kinds__ftKirby__ftkirby-000
Reviewed only `ftkirby.c` lines 1–480, in canonical and rendered views. This range defines a six-element costume array, another global structure, and the opening portion of `ftKb_Init_MotionStateTable`. The table binds motion selectors and flag values to callback pointers. The ten entries labeled JumpAerialF1–F5 and their Met variants share the same four common callbacks. AttackDash and AttackDashAir use the same motion selector but different flags and callback sets. Subsequent SpecialN/Eat-family entries vary callback sets and NULL callback slots; the three EatWalk entries share all four callbacks. Several SpecialAirN-family entries reuse motion selectors from corresponding non-Air entries while selecting different flags and callbacks. Every fully visible entry ends with `ftCamera_UpdateCameraBox`. The range ends partway through SpecialAirNSpit0; it contains no function bodies.

### shard-main__melee__ft__kinds__ftKirby__ftkirby-001
### Assigned source: `ftkirby.c`, lines 481–960
This range is a continuation of state-table initializers, not function implementations. Entries associate `ftKb_SM_*` and `ftKb_MF_*` constants with a move-ID expression shifted left by 24 and callback references. It covers the tail of an airborne neutral-special entry, subsequent neutral/side/up/down-special entries, the Mr/Lk/Ss/Ys-prefixed families, and the beginning of the Fx-prefixed family. Every fully visible entry ends with `ftCamera_UpdateCameraBox`.

The neutral/side entries at the beginning and all fully visible Ys entries have `NULL` in the slot occupied elsewhere by `_IASA` callbacks. The up/down, Mr, Lk, Ss, and complete Fx entry provide named callbacks in that slot. Lk loop entries use distinct `Charged` flag symbols. Several Ys entries share an SM constant but select different callback sets; the two `YsSpecialNCapture2` entries use `FtMoveId_SpecialN`, unlike surrounding entries using `FtMoveId_KbSpecialNYs`. Their comment suffixes `_0`/`_1` select callback suffixes `_1`/`_0`, respectively. These are literal initializer relationships, not verified gameplay interpretations.

Coverage is limited to the assigned 480 lines; neither complete table nor complete TU coverage is claimed.

### shard-main__melee__ft__kinds__ftKirby__ftkirby-002
The assigned ftKirby/ftkirby.c lines 961–1440 are a continuation of state-table initializers, not function bodies. Entries associate ftKb_SM symbols with ftKb_MF values, a family-specific FtMoveId shifted left by 24, four callback references (Anim, IASA, Phys, Coll), and ftCamera_UpdateCameraBox. The range covers the tail of Fx entries, Pk/Lg/Ca entries, Ns/Kp/Pe/Pp/Dk/Zd entries, and the beginning of Sk. Ns Hold0 and Hold1 use distinct motion symbols but identical callback quartets within each ground/air variant. Kp main-phase entries use Loop flag symbols while Start/End entries do not. Pe SpecialLw-named entries explicitly use SpecialNPe move metadata. Dk provides separate Start, Loop, Cancel, unsuffixed, and Full callback sets for both ground/air-named variants. These are source-level registrations; the range does not establish callback execution behavior or gameplay effects.

### shard-main__melee__ft__kinds__ftKirby__ftkirby-003
Reviewed canonical and rendered ftKirby/ftkirby.c lines 1441–1920 only. This range contains motion-state initializer records, not function bodies. The records associate state-motion symbols and flag symbols with a family-specific move ID shifted left by 24, four callback references (Anim, IASA, Phys, Coll), and ftCamera_UpdateCameraBox. It covers the Sk family continuation, Pr records, Ms records, Mt records, and the beginning of Gw records.

Pr start-R/start-L records share callback sets, as do its ground end-R/end-L and AirNEndR0/AirNEndR1 pairs. Ms End0/End1 pairs likewise share callback sets separately for ground-named and air-named records. Sk, Pr, and Mt loop variants select distinct loop flag symbols; Mt LoopFull uses the corresponding loop flags. PrSpecialNHit explicitly uses ftKb_MF_SpecialAirNPr despite lacking Air in its state name. These are initializer relationships, not proof of gameplay behavior or transitions. The final Gw air record is incomplete within this shard.

### shard-main__melee__ft__kinds__ftKirby__ftkirby-004
Reviewed canonical and rendered ft kirby.c lines 1921–2400 only. This data-only range finishes a motion-state initializer table and defines two complete HSD_GObjEvent arrays plus the beginning of a third.

The state records associate distinct submotion/flag constants and move IDs shifted left by 24 with callback sets. Direct callback reuse is visible for Dr→Mr, Cl→Lk, Fc→Fx, Pc→Pk, Gn→Ca, Fe→Ms, and Gk→Kp symbol families. Every complete state record in this range includes ftCamera_UpdateCameraBox. Fe End0 and End1 records use distinct submotion constants but identical callback sets within each ground/air-named pair.

ftKb_Init_803C9CC8 contains 66 event-pointer slots, including NULL holes and a repeated pair of callbacks. ftKb_Init_803C9DD0 contains 33 slots with several reused callbacks and NULL holes. Only the first 15 entries of ftKb_Init_803C9E54 are assigned here. These initializers establish pointer ordering and sharing, not the runtime meaning of their indices or the behavior of their targets.

### shard-main__melee__ft__kinds__ftKirby__ftkirby-005
Reviewed canonical and rendered ftkirby.c lines 2401–2880 only.

- Defines five six-entry costume-archive caches, a sparse kind-indexed cache table, and four motion-state records. Initialization clears kind-indexed storage and all six joint/material-animation pairs in each populated cache.
- Death initialization resets hat state and selected Kirby fields, chooses a random value from 1–5, and conditionally delegates to a player-configured handler. Loading installs attributes, enables multijump, copies a player flag, and passes four item resources to the item-registration helper. Two additional callback chains clear different death callback slots.
- A hat-kind switch compares four stored counters against attribute thresholds or six and invokes a shared helper with distinct IDs. Item callbacks handle non-heavy held-item animation selections or delegate to common callbacks; knockback exit invokes animation resets for parts 1 and 0.
- Two accessors return fields from the Pichu-indexed hat dynamics entry 4. Demo helpers map selected numeric inputs to output indices or motion-string indices.
- Resource routines request base and selected costume files, lazily populate archive/joint/material-animation caches, and request asynchronous or synchronous effects loading. A wrapper supplies the synchronous loader as a player-helper callback; another routine dispatches a non-null callback from index kind*2+1.
- Hat drawing requires a hat joint and a fighter flag, copies part 6's matrix, sets independent/user-matrix flags, and submits the hat for display. A getter returns the hat joint or casts the fighter GObj as its fallback. A mask-driven helper passes selected part descriptors and the current costume joint to ftParts_800753D4. The range ends during initialization/traversal setup of ftKb_SpecialN_insert_joint_refs.

### shard-main__melee__ft__kinds__ftKirby__ftkirby-006
Reviewed canonical and rendered ftkirby.c lines 2881–3360 only. This range implements hat-model attachment, material-animation attachment, removal, conditional model-helper dispatch, and standalone hat allocation/destruction. The costume-backed attachment path appends descriptor DObjs to eligible fighter joints, records their pointers in hat.x14, records per-part starting indices, changes non-null materials to ftMObj, and marks affected bones. A second path reads hat_dynamics[2], stores attached DObjs in hat.x1C, and marks a separate bone flag. Both enforce a 32-entry total bound. Removal deletes attached chains, clears attachment flags, frees both pointer arrays, nulls x14.data, and processes the mask in hat_dynamics[1]. Conditional callbacks route hat/base-model lists according to arguments, joint presence, and an index range. Standalone loaders allocate a list and load a joint only when no hat joint exists; shared destruction removes that joint and frees/nulls its list. Explicit hat-table selectors include FTKIND_MARIO, FTKIND_FOX, FTKIND_KIRBY, FTKIND_KOOPA, FTKIND_LINK, and FTKIND_SEAK; three loader variants additionally call distinct ftCo helpers, while associated removal wrappers call ftCo_UnloadDynamicBones.

### shard-main__melee__ft__kinds__ftKirby__ftkirby-007
Reviewed canonical and rendered lines 3361–3840 only. This range implements character-keyed Kirby hat wrappers, two distinct initialization guards, Pichu-specific material/visibility setup, neutral-special entry dispatch, and the beginning of a kind-dependent article-resource switch.

The first wrapper family calls `ftKb_LoadHat` only when `hat.jobj` is null; companion wrappers call `ftKb_SpecialN_800EFAF0_inline`, sometimes followed by dynamic-bone unloading. Several loaders additionally invoke character-specific helper functions. The `LOAD_HAT` family instead guards `hat.x14.data`, allocates two data blocks, passes kind-plus-one and part indices through shared helpers, and supplies costume and visibility data to parts/animation routines. It is used here for CAPTAIN, YOSHI, PURIN, DRMARIO, and PICHU.

Pichu setup installs a lookup in both hat and fighter visibility slots, applies a resource-supplied diffuse color, copies another color word, and updates model scale. Its companion clears the fighter lookup after calling the shared helper and updates scale again. The diffuse routine traverses lookup-selected hat display objects and writes only when display object, material object, and material exist.

Ground and air neutral-special entry functions independently dispatch through tables indexed by `hat.kind`, using distinct fallback functions when the selected callback is null. The final partial function switches on explicit fighter-kind constants and forwards resource pointers with explicit Kirby article-kind constants to `it_8026B3F8`; its continuation is outside this shard.

### shard-main__melee__ft__kinds__ftKirby__ftkirby-008-retry180539-retry185219
Reviewed canonical and rendered ftkirby.c lines 3841–4161 only.

- The opening switch tail passes selected hat-dynamics entries and explicit Kirby item-kind constants to it_8026B3F8.
- ftKb_SpecialN_800F190C initializes Kirby union fields, clearing pointers and counters, setting fixed defaults, copying two data attributes, and setting a vector to (1,1,1). Its kind parameter is unused.
- ftKb_SpecialN_800F19AC and ftKb_SpecialN_800F1A8C dispatch by hat.kind. Their listed branches match except for distinct Mewtwo callees. ftKb_Init_UnkMotionStates3 delegates only for KOOPA and GKOOPS.
- ftKb_SpecialN_800F1BAC changes hat.kind only when different, initializes fields, invokes a nullable table callback at kind*2, and calls ftKb_SpecialN_800F16D0. When requested, different sounds distinguish changed versus unchanged kinds. Both paths install death callbacks.
- fn_800F1CA0 tests membership in five explicit fighter kinds; ftKb_SpecialN_800F1CD8 returns that Boolean result as s32.
- ftKb_SpecialN_800F1D24 is Kirby-only: it decrements a nonzero counter or checks for collision effects at zero, then refreshes the counter to five when selected environment bits are present. ftKb_SpecialN_800F1DAC compares current and previous collision masks and spawns effect 0x49E at an ECB-derived position, prioritizing left, right, top, then bottom and issuing at most one spawn. ftKb_SpecialN_800F1F1C requests the same effect at a supplied position for Kirby only.

### shard-main__melee__ft__kinds__ftKirby__ftkirby-009
Reviewed canonical and rendered `ftkirby.h` lines 1–480 only. This portion is a declaration interface, not executable implementation. It defines `ftKirby_CopyName` with two `char*` members, `filename` and `name`, and declares initialization, item and knockback callbacks; helpers accepting fighter kinds, hat structures, joints, matrices and vectors; and extensive fighter-object callback families. The declarations include ground/air variants and Anim, IASA, Phys and Coll groups for SpecialLw, SpecialS, SpecialN and Eat-prefixed states, followed by Mr, Lg, Ca, Kp, Lk, Ss and Fx-prefixed interfaces. Some helpers expose scalar results, vector outputs or specialized index return types. These signatures establish the available interface but do not establish runtime transitions, resource ownership, gameplay mappings or side effects.

### shard-main__melee__ft__kinds__ftKirby__ftkirby-010
### Header interface, lines 481–536
This bounded excerpt declares the remaining `FxSpecial` physics/collision functions, five address-named `SpecialNNs` functions, and the `NsSpecial` ground/air Start–Hold–End families with Anim, IASA, Phys, and Coll suffixes. All take `Fighter_GObj*`; only `ftKb_SpecialNNs_800FEC78` returns `bool`, while the other declared functions return `void`.

The header then exposes motion-state arrays and externally defined character, demo, costume, copy-name, byte, and enum data. Explicit array bounds appear for the primary motion-state table (`ftKb_MS_SelfCount`), `ftKb_Init_804D3DB0` (2), and `ftKb_CostumeList` (6). The excerpt ends the header guard. These are declarations, not evidence of runtime transitions, resource contents, or compiled layout.

### shard-main__melee__ft__kinds__ftKirby__ftkirby-011
Reviewed canonical and rendered `ftkirby.dox` lines 1–480 only. This range is an address-annotated declaration inventory, not executable implementation. It declares initialization and lifecycle interfaces, predominantly `void(Fighter_GObj*)` callbacks, alongside helpers accepting fighter kinds, matrices, vectors, collision boxes, and scalar parameters. Its declaration groups include AttackDash, SpecialHi, SpecialLw, SpecialS, SpecialN/Eat, and Mr/Lg/Ca/Pk/Kp/Lk/Ss/Fx-prefixed interfaces, with repeated Anim/IASA/Phys/Coll suffixes and ground/air variants. Several signatures remain explicitly unknown. These declarations establish interface shape and symbol inventory, but do not establish state transitions, resource ownership, gameplay mappings, or the behavior suggested by rendered names.

### shard-main__melee__ft__kinds__ftKirby__ftkirby-012
Reviewed canonical and rendered `ftkirby.dox` lines 481–896 only. This section is an address-annotated declaration inventory, not executable implementations. It lists Fighter_GObj-based functions in the Fx, Ns, Dk, Pr, Zd, Sk, Mt, Ic/Pp, Ys, Ms, Pe and Gw symbol families, including repeated Anim/IASA/Phys/Coll declaration sets and CaptureKirbyYoshi/KirbyYoshiEgg declarations. Most functions are declared void; explicit exceptions include a bool-returning declaration and a Fighter_Part-returning declaration. The tail declares external motion-state arrays, filename/name arrays, demo-motion strings and costume strings, then closes a preprocessor conditional. These declarations establish the documented interface shape, but do not establish runtime transitions, item effects or gameplay mappings.

### shard-main__melee__ft__kinds__ftKirby__ftkirby-013
Reviewed the assigned section subjects and copy-kind predicate, not the complete translation unit. Canonical source declares motion-state and callback tables, five six-entry costume-resource caches, and a constant ten-float zero array. Resource loading populates missing joint/material-animation cache entries. Geometry insertion reports DObj overflows and asserts. Initialization writes zero/unit values into Kirby-local fields; collision-effect helpers construct positions from ECB coordinates. fn_800F1CA0 is a read-only five-kind boolean test, and its immediate wrapper forwards that result. Source declarations and literal uses do not by themselves establish compiled section membership.

### shard-main__melee__ft__kinds__ftKirby__ftkirby-014
Reviewed the six assigned functions, not the complete translation unit. The initializer zeroes a cast global array and clears six joint/material-animation cache entries for each present costume table. Two straight-line aggregators invoke six or five helpers and clear death3_cb or death1_cb respectively. Two accessors supply resource fields through generic dispatchers to a shared article initializer, which receives one output as GXColor and the other in Item.xBC8. The motion-string lookup maps selectors 11 and 14 to table entries 0 and 3; other inputs leave its local offset uninitialized.

### shard-main__melee__ft__kinds__ftKirby__ftkirby-015
Reviewed the six assigned Kirby callbacks and their relevant shared helpers. Attribute loading copies the typed external attribute block into fighter-local storage. Death initialization resets Kirby-local hat state and conditionally reapplies a player-stored copy kind without sound. Item pickup maps non-heavy item hold kinds to saved partial-animation selections on channel 1; visibility callbacks remove or reapply that presentation, while dropping always invalidates the saved selection and optionally removes the active override. This review does not establish complete translation-unit coverage.

### shard-main__melee__ft__kinds__ftKirby__ftkirby-016
Reviewed the six assigned subjects, not the complete translation unit. Kirby's load callback installs attributes, enables multijump, imports a player-slot bit, and registers four articles. Knockback callbacks request costume texture frames 3 and 0. The auxiliary hat texture callback pair performs guarded list-wide resets or indexed frame updates. The demo callback maps selectors 11–13 to outputs (14,16), selector 14 to (17,17), and otherwise leaves outputs untouched.

### shard-main__melee__ft__kinds__ftKirby__ftkirby-017
Reviewed the six assigned functions. They dispatch copied-kind resource recovery, request profiles at exact charge thresholds, load resources for participating roster identities, select an optional hat hierarchy, dispatch aerial entry callbacks, and queue archive/effect resources for selected costumes. The hat selector's fallback is explicitly a cast of the input GObj, not a verified JObj. Gameplay labels not independently established by the reads remain deferred.

### shard-main__melee__ft__kinds__ftKirby__ftkirby-018
Reviewed the six assigned resource, callback, and model-installation helpers. They lazily populate shared and costume resource caches, dispatch an optional copied-kind callback, attach mask-selected model parts, install primary and auxiliary DObj chains on active fighter bones, and apply costume material animation through a part-to-DObj mapping. The shared hat-loader caller establishes the model setup sequence. This review does not establish complete TU coverage or compiled structure layout.

### shard-main__melee__ft__kinds__ftKirby__ftkirby-019
Reviewed the six assigned model-lifecycle functions. The constructors guard on an absent hat JObj, allocate DObj bookkeeping, load a resource hierarchy, and initialize fighter-part visibility. Two teardown entries share a JObj-present guard and clear the hierarchy and bookkeeping pointers. The dynamic-geometry teardown separately frees attachment bookkeeping and dispatches mask-selected part removal. Mario- and Fox-indexed resource selection is explicit; specific copied attacks and visible asset appearances are not established by these bodies.

### shard-main__melee__ft__kinds__ftKirby__ftkirby-020
Reviewed the six assigned hat-lifecycle functions, their shared model helpers, and relevant dynamics implementations. Installation is guarded by a null stored hat JObj and selects the Kirby, Koopa, or Link resource before initializing dynamics. Shared destruction conditionally removes the hierarchy, frees its pooled parts allocation, and clears both pointers. The two assigned model-and-dynamics teardown wrappers additionally unload all active dynamic-bone descriptors unconditionally. Specific copied-move and Kirby-on-Kirby gameplay interpretations remain unverified; this is not complete TU coverage.

### shard-main__melee__ft__kinds__ftKirby__ftkirby-021
The six reviewed callbacks manage standalone Kirby hat resources. Three loaders select SEAK, NESS, or PEACH resources only when the stored hierarchy is absent. The shared loader allocates bookkeeping, creates the hierarchy, enables a display flag, and forwards model/descriptor state to fighter-parts helpers. Removal delegates to a shared non-null-guarded hierarchy and allocation cleanup; 800F0054 additionally calls dynamic-bone unloading unconditionally. This review covers only the assigned subjects, not the entire translation unit.

### shard-main__melee__ft__kinds__ftKirby__ftkirby-022
The six assigned functions implement a bounded portion of Kirby's hat-resource lifecycle. Three installers select NANA-, PIKACHU-, or SAMUS-indexed resources only when the stored hat JObj is null. The shared loader allocates auxiliary storage, loads the joint hierarchy, sets a fighter flag, and passes the hierarchy and descriptor to fighter-parts setup. The NANA-indexed installer additionally initializes dynamics from descriptor index 2. The three assigned removers delegate to guarded hierarchy/allocation cleanup; the NANA-associated remover additionally unloads all active dynamic-bone sets and resets their count, even when the hat JObj was already null. Resource-index associations do not independently establish copied-move names or visible costume details.

### shard-main__melee__ft__kinds__ftKirby__ftkirby-023
The six assigned callbacks implement portions of Kirby's hat-resource lifecycle. Setup selects a fighter-kind-indexed resource only when the stored hat JObj is absent. Shared loading allocates part storage, loads the joint, sets the display flag, and passes the hierarchy and descriptor to fighter-parts setup. Shared removal destroys and clears the hierarchy and frees and clears part storage, all under a JObj-presence guard. Luigi and MARS setup additionally initialize dynamics; Luigi cleanup unconditionally unloads all counted dynamic-bone descriptors after guarded hat cleanup. Specific copied-attack names and the claim that the MARS asset depicts hair remain unverified.

### shard-main__melee__ft__kinds__ftKirby__ftkirby-024
Reviewed six assigned hat-resource callbacks and their shared implementation. Zelda-, CLINK-, and Falco-indexed installers do nothing while a hat JObj is present; otherwise they allocate bookkeeping and load the selected joint hierarchy through ftKb_LoadHat. Zelda and Falco additionally initialize dynamics from hat_dynamics[2]. The three assigned cleanup callbacks remove the stored hierarchy and free its bookkeeping under a JObj-presence guard; the callbacks at 800F09F0 and 800F0B0C additionally unload active dynamic-bone descriptors and reset their count. These bodies establish resource lifecycle behavior, not attack execution or exact visible costume details. This is bounded subject coverage, not complete TU coverage.

### shard-main__melee__ft__kinds__ftKirby__ftkirby-025
Reviewed the six assigned hat-lifecycle callbacks and their shared loading/removal bodies. The Game & Watch and Ganondorf installers guard on the stored hat JObj; Ganondorf additionally initializes dynamic-bone sets. The Falco and Ganondorf removal callbacks perform guarded hat-resource cleanup followed by unconditional dynamics unloading. Game & Watch removal delegates only to hat-resource cleanup. The Captain-indexed installer instead guards on its primary allocation and invokes the shared two-list model-part loading sequence. Character-specific move names and precise visual appearances are not established by these bodies.

### shard-main__melee__ft__kinds__ftKirby__ftkirby-026
The six assigned callbacks manage copied-hat presentation resources. Captain teardown delegates to shared allocation and model-part removal. Yoshi and Jigglypuff installation is guarded by the primary hat allocation and additionally initializes character-specific dynamics; their teardown removes model resources before unloading all counted dynamic-bone sets. Dr. Mario installation uses the same guarded model-loading macro without an additional dynamics initializer. Shared teardown frees both hat allocations but explicitly nulls only the primary pointer; descriptor-mask removal is independently guarded. This review covers only the assigned subjects.

### shard-main__melee__ft__kinds__ftKirby__ftkirby-027
Reviewed the six assigned subjects. They implement Dr. Mario copied-model teardown, Pichu copied-model installation/coloring/teardown, copied-kind-dependent global Article registration, and unconditional initialization of Kirby's shared copy-runtime fields. Registration and runtime initialization are invoked when the copied kind changes; runtime initialization also occurs on a guarded copy-removal path. This is bounded subject coverage, not complete TU coverage.

### shard-main__melee__ft__kinds__ftKirby__ftkirby-028
Reviewed the six assigned subjects. Two copied-kind dispatchers forward Kirby's GObj to cleanup helpers, differing in the Mewtwo charge policy. The copy-kind setter initializes state only when the kind changes, optionally selects sound feedback, and reinstalls death callbacks. A read-only five-kind classifier supplies an integer offset used by common aerial-jump selection. The post-collision pair maintains a contact-renewed cooldown and spawns at most one new-contact effect, prioritizing left, right, ceiling, then floor. This review does not claim complete translation-unit coverage.

### shard-main__melee__ft__kinds__ftKirby__ftkirby-029
Reviewed the assigned subjects, not the complete translation unit. The collision hook queues an effect only for Kirby, using ECB-derived positions supplied by common wall and ceiling handlers. Neutral-special entry dispatches through a hat-kind-indexed callback table with a separate airborne counterpart. Hat presentation includes indexed model-visibility replacement and guarded rendering of a standalone JObj synchronized to fighter part 6. Sampled integration code confirms multiple-jump dispatch, lifecycle adapters, and fighter-kind/costume-dependent hat loading and cleanup.

### shard-main__melee__ft__kinds__ftKirby__ftkirby-030
The assigned subjects contain no baseline facts. In the current source, ftKb_Init_800EE74C and ftKb_Init_800EE7B8 obtain fighter state from their gobj argument, forward that object to several helpers, and clear death3_cb and death1_cb respectively. ftKb_Init_800EEB00 and ftKb_Init_800EEB1C do not use gobj; they write global hat descriptor fields through their second arguments: ftDynamicBones through ArticleDynamicBones**, and x4 through s32*. Both access hats[FTKIND_PICHU]->hat_dynamics[4]. This review is limited to the assigned parameter subjects, not the entire translation unit.

### shard-main__melee__ft__kinds__ftKirby__ftkirby-031
This bounded subjects bundle contains six parameter identities associated with motion-file selection, special-attribute loading, death, item-drop, and item-invisibility callbacks. Every assigned subject has an empty baseline facts array; there are no baseline fact IDs to disposition. No new semantic claims or register-to-source-parameter mappings are proposed.

### shard-main__melee__ft__kinds__ftKirby__ftkirby-032
The assigned shard contains six parameter subjects and no baseline facts. Canonical declarations specify a `Fighter_GObj* gobj` argument for OnLoad, OnItemPickup, OnItemVisible, OnKnockbackEnter, and OnKnockbackExit; OnItemPickup additionally takes `bool flag`. No parameter-register mappings or deeper behavioral claims are proposed.

### shard-main__melee__ft__kinds__ftKirby__ftkirby-033
The two callback-pair functions obtain Fighter data from their object argument and call animation helpers only when hat.x14.data is non-null and hat.jobj is null. The second forwards its integer and float arguments unchanged. The demo callback uses an integer selector: values 11–13 write output pair (14,16), value 14 writes (17,17), and other values leave both outputs untouched. All six assigned parameter subjects have empty baseline fact lists; there are no baseline facts to disposition.

### shard-main__melee__ft__kinds__ftKirby__ftkirby-034
This bounded shard contains six parameter subjects, each with an empty baseline facts array. The entire bundle was read; there are no baseline fact IDs to retain, supersede, reject, or mark unresolved. No new semantic claims or parameter mappings are proposed, and no complete translation-unit coverage is claimed.

### shard-main__melee__ft__kinds__ftKirby__ftkirby-035
The assigned parameter subjects have no baseline facts. Their current enclosing bodies implement indexed resource requests, cached archive loading, and optional callback dispatch. In ftKb_SpecialN_800EEC34, the second argument selects one resource entry unless it is 0xFF; that sentinel selects entries from zero to the third argument's exclusive bound. ftKb_SpecialN_800EED50 uses its arguments as outer resource and inner costume-table indices, skips outer values -1 and 4, and avoids reloading populated archive/joint entries. ftKb_SpecialN_800EEEC4 selects callback slot kind * 2 + 1 and forwards gobj if the callback exists. This review covers only the bounded subjects, not the entire translation unit.

### shard-main__melee__ft__kinds__ftKirby__ftkirby-036
The six assigned parameter subjects have no baseline facts. In canonical source, ftKb_SpecialN_800EF040 takes a fighter object, an archive-table index, and a KirbyHatStruct pointer; it uses hat_dynamics[1] as a mask selecting part records passed to ftParts_800753D4 with a costume-specific joint descriptor. ftKb_SpecialN_800EF0E4 takes a fighter object, an archive-table index, and a writable byte array; it loads and appends descriptor DObjs to selected fighter joints, records their starting indices in that array, populates the hat DObj array, and stores the total count. This review is limited to the assigned subjects, not the whole TU.

### shard-main__melee__ft__kinds__ftKirby__ftkirby-037
The six assigned parameter subjects contain no baseline facts. Current bodies show that 800EF35C selects costume material-animation data using its integer argument and applies animations through a byte-index mapping; 800EF438 loads and appends descriptor DObjs to fighter joints and records them in the secondary hat list; 800EF69C removes attached DObjs, frees hat lists, and removes parts selected by a mask. This review is limited to the assigned shard.

### shard-main__melee__ft__kinds__ftKirby__ftkirby-038
The assigned parameters belong to hat-model setup and cleanup routines. In 800EF69C, the second argument is unused; the third supplies the part-removal mask through hat_dynamics[1]. The other assigned routines receive the object whose Fighter data is accessed: 800EFA40 conditionally allocates and loads a joint from ft_80459B88.x0, 800EFB4C conditionally loads the FTKIND_MARIO hat entry, and 800EFAF0/800EFBFC share cleanup that removes an existing hat joint, frees its DObj-list storage, and clears the corresponding pointers. All six assigned subjects have empty baseline fact arrays.

### shard-main__melee__ft__kinds__ftKirby__ftkirby-039
The six assigned parameter subjects belong to hat-loading and cleanup functions. Their canonical bodies accept a `gobj` argument used to access fighter state or passed to the shared cleanup helper. The three loading functions initialize an absent hat from table entries selected by `FTKIND_FOX`, `FTKIND_KIRBY`, or `FTKIND_KOOPA`; the latter two also invoke additional fighter helpers. Cleanup removes the hat joint and frees its associated allocation when the joint exists; two cleanup wrappers additionally call `ftCo_UnloadDynamicBones`. All six subjects have empty baseline fact lists, so there are no fact IDs to disposition.

### shard-main__melee__ft__kinds__ftKirby__ftkirby-040
The six assigned parameter subjects have no baseline facts. Their canonical functions accept a game-object pointer used to access fighter hat state or forwarded to shared hat helpers. Three functions conditionally load hat resources when the hat joint is absent, selecting FTKIND_LINK, FTKIND_SEAK, or FTKIND_NESS table entries. The other three invoke shared hat cleanup; 800F0054 additionally calls ftCo_UnloadDynamicBones. This review covers only the bounded subjects, not the complete translation unit.

### shard-main__melee__ft__kinds__ftKirby__ftkirby-041
The fully read bundle assigns six parameter subjects, each with an empty baseline fact list and no source hints. There are no baseline facts to retain, supersede, reject, or mark unresolved. No parameter functionality or register-to-source mapping is asserted, and no new knowledge is proposed.

### shard-main__melee__ft__kinds__ftKirby__ftkirby-042
The six assigned parameter subjects have no baseline facts. Their current function bodies take a single object pointer named `gobj`. The three loading wrappers obtain Fighter data from that object and conditionally call `ftKb_LoadHat` with the SAMUS, MEWTWO, or LUIGI table entry when `hat.jobj` is null; the LUIGI wrapper additionally calls `ftCo_8009D920`. The other three wrappers forward the object to `ftKb_SpecialN_800EFAF0_inline`; `ftKb_SpecialN_800F08D4` also obtains Fighter data and calls `ftCo_UnloadDynamicBones`. This review covers only the assigned subjects, not the complete translation unit.

### shard-main__melee__ft__kinds__ftKirby__ftkirby-043
Read the entire assigned bundle. All six parameter subjects have empty baseline fact lists, so there are no baseline facts to retain, supersede, reject, or mark unresolved. No new semantic claims are proposed; function behavior and parameter meanings are not established by this review.

### shard-main__melee__ft__kinds__ftKirby__ftkirby-044
The six assigned parameter subjects have no baseline facts. Their current functions each accept a single `gobj` argument. Three functions conditionally pass that object and its fighter data to `ftKb_LoadHat` when `hat.jobj` is null, selecting the explicitly named FALCO, GAMEWATCH, or GANON table entry. The other three forward the object to `ftKb_SpecialN_800EFAF0_inline`; two additionally pass its fighter data to `ftCo_UnloadDynamicBones`. This review is limited to the assigned subjects.

### shard-main__melee__ft__kinds__ftKirby__ftkirby-045
The full assigned bundle contains six parameter subjects, each with an empty baseline facts array. There are no baseline fact IDs to assess. No parameter semantics or compiled-layout mappings are asserted, and no broader translation-unit coverage is claimed.

### shard-main__melee__ft__kinds__ftKirby__ftkirby-046
The six assigned parameter subjects have no baseline facts to disposition. The five corresponding function bodies accept a `Fighter_GObj*` as their first source parameter. The second parameter of `ftKb_SpecialN_800F1420` is a `const u32*`; its pointed-to value is copied into diffuse material fields for draw objects selected through the fighter's lookup slot 4. The surrounding routines conditionally invoke hat loading, forward the object to a shared helper, and configure or clear lookup/color state. This review covers only the assigned subjects, not the complete translation unit.

### shard-main__melee__ft__kinds__ftKirby__ftkirby-047
The six assigned parameter subjects contain no baseline facts. Their canonical function bodies show that ftKb_SpecialN_800F16D0 switches on its FighterKind argument to pass selected global article pointers and item kinds to it_8026B3F8; its gobj argument is unused. ftKb_SpecialN_800F190C initializes fighter-local Kirby fields through gobj, using constants and two data attributes; its kind argument is unused. ftKb_SpecialN_800F19AC and ftKb_SpecialN_800F1A8C obtain hat.kind through gobj and dispatch that same object to selected helpers. Their dispatches differ only in the FTKIND_MEWTWO helper.

### shard-main__melee__ft__kinds__ftKirby__ftkirby-048
The assigned parameters belong to four routines. `ftKb_SpecialN_800F1BAC` receives a fighter object, a kind value, and a boolean controlling sound playback; a changed kind updates stored hat state, resets associated fields, invokes a table callback when present, and performs kind-dependent setup. `ftKb_SpecialN_800F1CD8` tests the object's stored hat kind against five explicit cases. `ftKb_SpecialN_800F1D24` maintains a Kirby-only collision-effect countdown and calls `ftKb_SpecialN_800F1DAC`, which conditionally spawns an effect at collision-box coordinates based on current and previous environment flags. All six assigned subjects have empty baseline fact lists; there are no baseline fact IDs to disposition.

### shard-main__melee__ft__kinds__ftKirby__ftkirby-049
The complete bundle contains six parameter subjects and zero baseline facts. Consequently, no fact dispositions or mutations are required. The canonical header declares the associated functions with argument lists `(Fighter_GObj*, Vec3*)`, `(Fighter_GObj*)`, and `(Fighter*, int, bool)`. These declarations alone do not establish register-parameter identities or behavioral roles; no such claims are proposed.

### shard-main__melee__ft__kinds__ftKirby__ftkirby-050
The assigned subjects are the three parameter identities of `ftKb_UnkMtxFunc0`; all have empty baseline fact lists. The canonical function obtains fighter data from `gobj`, returns unless a hat joint exists and `x2225_b2` is set, copies part 6's joint matrix to the hat joint, sets matrix-control flags, marks the matrix dirty, and displays the hat. Its integer argument is passed through `HSD_GObj_80390EB8`; its matrix argument is forwarded to `HSD_JObjDispAll`. This is a bounded parameter review, not complete TU coverage.

### shard-main__melee__ft__kinds__ftKirby__ftkirby-051
The reviewed functions provide Kirby hat-model allocation, fighter-kind-specific installation and removal, costume/effect resource loading, dynamic-bone integration, held-item animation selection, and null-checked indexed callback dispatch. This assessment covers only the twelve assigned links, not the entire translation unit.

### shard-main__melee__ft__kinds__ftKirby__ftkirby-052
The reviewed functions install and remove Kirby hat models, update selected hat-material diffuse colors, refresh character attributes, and spawn effects at newly contacted ECB boundaries. The knockback-exit hook directly resets two animation channels. This review assesses only the twelve assigned links, not the entire translation unit.

### shard-main__melee__ft__kinds__ftKirby__ftkirby-053
The reviewed functions manage Kirby's kind/costume resource caches, copy-hat loading and removal, model visibility, dynamic-bone teardown, and copied-state initialization. Other reviewed callbacks handle item notifications, copy-kind predicates, and hat transform invalidation before display. This assessment covers only the twelve assigned links, not the entire translation unit.

### shard-main__melee__ft__kinds__ftKirby__ftkirby-054
The reviewed functions manage copied-hat resource selection, attachment, rendering and teardown, route grounded and airborne neutral-special entry through hat-kind callback tables, and configure copy state. Kirby's knockback callback applies frame 3 to costume texture animations. Hat loaders also initialize fighter dynamic-bone state. This review covers only the assigned links, not the entire translation unit.

### shard-main__melee__ft__kinds__ftKirby__ftkirby-055
Reviewed the twelve assigned links. Current code supports Kirby copy-kind installation, copied-hat creation/removal and animation integration, Link/Luigi hat dynamics initialization, and copied-charge threshold callbacks. The victory-presentation mapping remains unverified; numeric motion selectors alone do not establish that gameplay meaning. This is bounded link review, not complete TU coverage.

### shard-main__melee__ft__kinds__ftKirby__ftkirby-056
The reviewed functions manage Kirby hat resources and presentation: requesting archives and effects, loading hat joints, removing allocated hat hierarchies, invoking dynamic-bone cleanup, and dispatching neutral-special entry through hat-kind-indexed callbacks. This assessment covers only the twelve assigned links, not the complete translation unit.

### shard-main__melee__ft__kinds__ftKirby__ftkirby-057
The reviewed routines load and remove Kirby hat resources, dispatch neutral-special entry through an optional hat-kind-indexed callback, configure copy-specific articles, and classify stored hat kinds. Translation-unit membership is confirmed for the assigned membership links. Inhale cleanup semantics and the predicate's aerial-jump caller context remain deferred; this is not full translation-unit coverage.

### shard-main__melee__ft__kinds__ftKirby__ftkirby-058
Reviewed the twelve assigned relationships against current source. Kirby's integration unit loads character-indexed hat models, maintains auxiliary hat animation state, and invokes shared dynamic-bone initialization and teardown. It also defines Hammer article registration, lifecycle cleanup, motion-file selection, and the knockback entry wrapper. This is bounded relationship coverage, not complete TU coverage.

### shard-main__melee__ft__kinds__ftKirby__ftkirby-059
The reviewed links cover Kirby hat installation callbacks, copy-kind resource and callback integration, dynamic-bone setup and cleanup, and environment-contact effect cooldown handling. Current definitions support the translation-unit relationships and the broader copy-ability, dynamics, and collision relationships. This is bounded link review, not complete translation-unit coverage.

### shard-main__melee__ft__kinds__ftKirby__ftkirby-060
The reviewed callbacks load and remove kind-indexed Kirby hat resources, dispatch copied-ability cleanup, reset auxiliary texture animations, select charge-dependent color profiles, enqueue archive preloads, and supply demo animation bounds. Material animation installation advances through a tree-successor helper. This review covers only the twelve assigned links.

### shard-main__melee__ft__kinds__ftKirby__ftkirby-061
The reviewed links concern Kirby's shared hat-resource access, model installation and removal, auxiliary model geometry, hat-kind-based special dispatch, and non-heavy-item presentation. Current source supports the function-to-translation-unit relationships and copy-model infrastructure relationships. The compiled .rodata identity remains unverified. This review covers only the assigned links, not the entire translation unit.

### shard-main__melee__ft__kinds__ftKirby__ftkirby-062
The reviewed code supports Kirby's fighter-kind-indexed hat models, auxiliary model construction and texture animation, hat cleanup, special-attribute refresh, and checks of persistent copied-ability charge fields. This review covers only the twelve assigned links, not the complete translation unit.

### shard-main__melee__ft__kinds__ftKirby__ftkirby-063
This bounded review covers Kirby's shared item-visibility delegation, resource-loading definitions, character-indexed hat construction and teardown, dynamic-bone cleanup, copied-kind callback dispatch, and a Kirby-only positional effect hook. Current source supports the copy-ability and translation-unit relationships; the environment-collision caller relationship remains deferred.

### shard-main__melee__ft__kinds__ftKirby__ftkirby-064
The reviewed code supplies Kirby hat-resource loading, paired setup/cleanup dispatch, auxiliary hat animation handling, copied-kind charge checks, and death-time Kirby-state initialization. Hat cleanup removes allocated model resources and sometimes unloads dynamic bones. This review assesses only the twelve assigned links, not the complete translation unit.

### shard-main__melee__ft__kinds__ftKirby__ftkirby-065
Reviewed the twelve assigned links against current canonical definitions. The reviewed code enables multijump during initialization, constructs and removes hat model objects, releases dynamic bones, initializes costume-dependent hat visibility data, and classifies stored hat kinds. Named-move interpretations that require additional gameplay evidence remain deferred. This is bounded link review, not complete translation-unit coverage.

### shard-main__melee__ft__kinds__ftKirby__ftkirby-066
The reviewed functions dispatch fighter-kind callbacks, initialize Kirby's hat state, install costume-dependent hat geometry and presentation resources, and release hat allocations. Some teardown paths also invoke common dynamic-bone cleanup. This review covers only the twelve assigned links, not the complete translation unit.

### shard-main__melee__ft__kinds__ftKirby__ftkirby-067
The reviewed functions support Kirby's copy-hat presentation through joint loading, model-part removal, hat-state access, model-event routing, and dynamic-bone initialization and teardown. The reviewed motion-table excerpt dispatches multiple aerial-jump states, but does not establish the compiled .data target's boundaries. This review covers only the assigned links.

### shard-main__melee__ft__kinds__ftKirby__ftkirby-068
This bounded review covers held-item presentation and Kirby hat-model integration: guarded joint loading, appended model-part construction and removal, costume material-animation attachment, visibility routing, and fighter-kind-based dispatch. Current source supports the translation-unit relationships and general model/copy-presentation links. It does not establish that the Peach hat loader itself implements Toad or that its asset visibly depicts a crown.

### shard-main__melee__ft__kinds__ftKirby__ftkirby-069
The four assigned translation-unit relationships are supported by current definitions in ftKirby/ftkirby.c. The reviewed callbacks delegate hat removal or load shared hat resources. The fifth relationship is supported by a guarded hat loader calling a dynamics initializer that sets the active count and populates the Fighter's dynamic-bone descriptors from the hat hierarchy. This review covers only the five assigned links.

Status: researched; no-change lead bypass; independent review and live promotion pending.
