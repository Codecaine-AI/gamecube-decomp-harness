# Disjoint Librarian Research

### shard-main__melee__ft__kinds__ftKirby__ftkirbyspecialn-000
Reviewed canonical and rendered lines 1–480 only. This range defines neutral-special transition flags; attribute accessors, velocity initialization, and facing-relative capture-position helpers; conditional hat-kind reset logic; item and fighter capture-progress updates; and entry routines for SpecialN/SpecialAirN, capture variants, Eat/EatAir, EatFall, EatWalkSlow, and EatLanding. The two velocity initializers respectively produce horizontal-only motion opposite the supplied facing and angle-derived planar motion with the supplied facing. Hat-reset checks require Kirby, a non-Kirby hat kind, a clear guard bit, no victim, and a successful random test; one excludes Cape damage, while the other adds recovery handling for a numeric motion interval. Capture updates compare helper results against squared inhale velocity before selecting ground/air Eat entry. Startup initializes shared state and installs distinct ground/air callback sets; item capture sets xF4_b0 while Capture0 clears it.

### shard-main__melee__ft__kinds__ftKirby__ftkirbyspecialn-001
Reviewed canonical and rendered lines 481–960 only. This range implements ground/air motion-state transitions for Kirby's SpecialN, loop, end, capture, Eat, spit, drink and turn states. Initial/loop transitions reinstall effect-hitlag callbacks and ground- or air-specific callback tuples; capture-family transitions usually call ftKb_SpecialN_800F9070 and ftCommon_8007E2F4 with 0x1FF. Startup animation callbacks consume cmd_vars[0] to spawn effect 0x49A and change state when animation ends. Capture updates construct a facing-relative offset position and compare item/victim helper results against squared inhale velocity before changing state. Eat animation completion enters EatWait or EatFall. Spit callbacks distinguish target items from fighter victims: the item path constructs position/velocity/duration attributes and clears stored references, while the victim path invokes three interaction helpers and clears the command latch. Several loop/wait animation callbacks are empty. The final function is only partially within this shard.

### shard-main__melee__ft__kinds__ftKirby__ftkirbyspecialn-002
Reviewed canonical and rendered lines 961–1440 only.

This range implements command-gated item/victim processing, animation-completion transitions, and input dispatch for Kirby's neutral-special capture states. Item drink callbacks require a target, call the item helper, and clear both target references and the command flag. Fighter drink callbacks require a victim, invoke paired fighter helpers, store the result of ftCo_800BD9E0 in u.kb.xE0, pass it to ftKb_SpecialN_800F1BAC, and clear the command flag. Air callbacks enter Fall when their animations end.

Turn completion reverses facing and selects EatWait or EatFall. EatJump1 completion selects EatJump2 and passes specialn_jump_height to ftCo_800CB110; EatJump2's animation callback is empty. Landing completion selects EatWait. Both neutral-special loop input callbacks decrement a nonzero xE4 and return; only once it is zero can release of held mask 0x200 select the corresponding end state.

Capture input handling selects item versus fighter branches using xF4_b0. Within each branch, pressed mask 0x200 or sufficiently negative stick Y has priority over pressed mask 0x100, with a nonnull corresponding target required. Successful target actions set x2222_b2 and run shared transition helpers. Opposite-facing horizontal input outside the configured dead zone can then select a turn transition. Grounded dispatch subsequently checks jump input and finally walking, recording jump input in motion variables or supplying stored walk parameters and specialn_walk_speed to the walk helper.

### shard-main__melee__ft__kinds__ftKirby__ftkirbyspecialn-003
Reviewed canonical and rendered lines 1441–1788 only.

- `ftKb_EatWalk_IASA` prioritizes jump input: it stores that input, clears another motion variable, enters `ftKb_MS_EatJump1`, installs death callbacks, and invokes animation/common helpers. Without jump input, a successful `ft_8008A1FC` check enters `ftKb_MS_EatWait`; otherwise it delegates to the walk-update helper. `ftKb_EatJump1_IASA` delegates to the short-hop check.
- Most physics callbacks are thin wrappers around either `ft_80084F3C` or `ft_80084EEC`. EatWalk instead delegates to `ftWalkCommon_800E0060`, and EatJump2 to `ftCo_Jump_Phys_Inner`.
- Collision callbacks pass their object and a state-specific callback to `ft_8008403C` or `ft_80082C74`. EatWalk, EatJump1, and EatLanding share `fn_800F6450`; EatJump2 and SpecialAirNCaptureWait share `fn_800F6528`.
- `ftKb_SpecialN_800F9070` installs two death callbacks. `ftKb_SpecialN_800F9090` acts only with a non-null target item and both fighter and hat kind equal to `FTKIND_KIRBY`: it passes the item, a boolean identifying either of two explicit capture motion IDs, and zero to `it_802F28C8`, then clears `x1A64` and `target_item_gobj`.

### shard-main__melee__ft__kinds__ftKirby__ftkirbyspecialn-004
Reviewed the five assigned function bodies and relevant capture setup, item-controller, initialization, and collision-call sites. The Capture1 callbacks initialize the target item's owner-relative movement controller, enter their respective motion states, set both branch flags, restore death callbacks, and initialize x1A6A. The Capture0 callbacks enter their respective states while clearing the item-branch flag. The EatFall entry performs airborne initialization and is supplied to three Eat-state collision handlers. This is bounded subject coverage, not complete TU coverage.

### shard-main__melee__ft__kinds__ftKirby__ftkirbyspecialn-005
Reviewed six assigned transition helpers and their local callers. They initialize EatWalk through the shared three-tier walker, enter EatLanding, and preserve SpecialN or SpecialNLoop across ground/air transitions while reinstalling callbacks. EatLanding animation completion enters EatWait. Gameplay-specific Inhale descriptions remain deferred where the inspected code establishes state transitions but not the full gameplay interpretation.

### shard-main__melee__ft__kinds__ftKirby__ftkirbyspecialn-006
Reviewed six collision-transition callbacks and their immediate callers. The ending callbacks select opposite ground/air SpecialNEnd states. Four capture callbacks select Capture0 or Capture1 destinations and write 0x1FF to Fighter.x1A6A; the two Capture1-destination callbacks additionally reinstall death callbacks through ftKb_SpecialN_800F9070. Transition bodies contain no local guards or timers; collision dispatchers supply the guards. Gameplay terminology remains deferred where it depends on baseline wiki assertions rather than inspected canonical behavior. This is bounded subject coverage, not complete TU coverage.

### shard-main__melee__ft__kinds__ftKirby__ftkirbyspecialn-007
The six assigned callbacks bridge ground/air variants of Eat and Special-N Spit states. Each extracts the Fighter, calls the directional state-change helper with ftKb_MF_SpecialN_Capture_Coll, reinstalls two death callbacks through ftKb_SpecialN_800F9070, and writes 0x1FF to x1A6A. Their bodies have no local branches or timers; collision wrappers supply dispatch. This review covers only the assigned subjects and necessary supporting code, not the complete translation unit.

### shard-main__melee__ft__kinds__ftKirby__ftkirbyspecialn-008
The six reviewed callbacks perform branchless ground/air state conversions for the Drink and EatTurn collision paths. All reinstall two Special-N death callbacks. Five also pass 0x1FF to the setter for Fighter.x1A6A; the ground-to-air EatTurn callback does not. Collision wrappers delegate the environmental guard to shared dispatchers. Source-phase naming hypotheses are consistent with the actual callers, but swallowing, item-swallowing, and retained-target gameplay interpretations remain unverified.

### shard-main__melee__ft__kinds__ftKirby__ftkirbyspecialn-009
Reviewed the six assigned EatJump callbacks and supporting routines, not the complete translation unit. EatJump1 waits for animation completion before setting airborne bookkeeping, entering EatJump2, reinstalling death callbacks, and invoking scaled jump-velocity initialization. Its input callback delegates to the common source-sensitive short-hop checker; its physics callback delegates to grounded friction and movement. Collision callbacks conditionally enter EatFall or EatLanding, with EatLanding subsequently returning to EatWait. EatJump2's animation callback is empty. Cross-view jump-storage aliasing and the broader captured-target gameplay interpretation remain explicitly deferred.

### shard-main__melee__ft__kinds__ftKirby__ftkirbyspecialn-010
Reviewed six assigned callbacks and their shared physics/collision helpers. EatJump2 physics delegates to a one-update-gated airborne update. EatLanding physics applies speed-dependent ground friction and grounded movement. EatLanding and EatTurn animation completion enter EatWait with setup calls; EatTurn additionally reverses facing. Their collision callbacks bind distinct responses to the shared ground-to-air dispatcher. The captured-opponent gameplay context remains unverified by the code read here; this is not complete TU coverage.

### shard-main__melee__ft__kinds__ftKirby__ftkirbyspecialn-011
The six reviewed callbacks separate input decisions, animation, physics, and collision work. EatWait animation is empty. EatWait IASA prioritizes item/fighter-specific transition helpers, then turning, jump input, and walking initialization. EatWait and EatTurn physics delegate to the same speed-threshold friction helper. EatWait collision delegates position synchronization and conditional response dispatch. EatWalk animation delegates facing-relative, three-tier playback-rate calculation; its movement basis can be stored walk movement rather than actual ground velocity. This review covers only the assigned subjects.

### shard-main__melee__ft__kinds__ftKirby__ftkirbyspecialn-012
Reviewed the six assigned Eat/EatWalk callbacks and relevant shared helpers, not the complete translation unit. EatWalk prioritizes jump input, otherwise stops or updates walking tiers; its physics delegates to stick-driven common walking. Eat physics delegates to ground friction and movement. Eat animation completion enters EatWait and initializes callbacks and fighter state. Both collision callbacks delegate to a shared environmental check, selecting EatAir or EatFall responses. Detailed retained-opponent gameplay interpretations remain deferred where the inspected code establishes state transitions but not the victim lifecycle.

### shard-main__melee__ft__kinds__ftKirby__ftkirbyspecialn-013
Reviewed the six assigned callbacks and their immediate transition/physics helpers, not the complete TU. CaptureTurn animation completion reverses facing and enters EatFall with airborne bookkeeping. Its physics callback delegates to gravity and aerial friction; collision delegates to a conditional dispatcher selecting EatTurn. CaptureWait animation is empty, collision selects EatLanding, and IASA prioritizes object-specific eat/spit helper tests before an opposite-facing stick test. Detailed gameplay interpretations remain deferred where the read code establishes transitions but not their downstream captured-target effects.

### shard-main__melee__ft__kinds__ftKirby__ftkirbyspecialn-014
Reviewed the six assigned callbacks and their relevant implementation paths. Capture and capture-wait physics delegate to common gravity, terminal-velocity and aerial-friction processing. Capture animation delegates to a victim-distance guard that selects Eat or EatAir. Captured animation enters EatFall when eligible animation finishes, installs callbacks and initializes x1A6A. Collision callbacks conditionally dispatch handlers selecting the corresponding grounded motion states. Gameplay terminology and downstream carry/outcome claims remain explicitly deferred where not independently established.

### shard-main__melee__ft__kinds__ftKirby__ftkirbyspecialn-015
Reviewed the six assigned callbacks, not the entire translation unit. Captured and Drink physics delegate to shared gravity/terminal-velocity processing followed by bounded horizontal friction. Drink animation conditionally processes a victim and copy-kind result, acknowledges the command only when a victim exists, and independently enters Fall on animation completion. End animation enters Fall when frames expire. Drink and End collision wrappers conditionally dispatch to air-to-ground handlers targeting Drink0 and SpecialNEnd, respectively.

### shard-main__melee__ft__kinds__ftKirby__ftkirbyspecialn-016
Reviewed the six assigned callbacks, not the complete translation unit. The aerial loop animation callback is empty; its IASA callback decrements a countdown and subsequently tests held-input mask 0x200 before entering the ending state. Loop and ending physics delegate to common falling and aerial friction. Loop collision conditionally dispatches an air-to-ground loop setup. Aerial spit animation services a victim-dependent command and independently enters Fall when animation finishes.

### shard-main__melee__ft__kinds__ftKirby__ftkirbyspecialn-017
The assigned callbacks delegate airborne movement to shared gravity and friction processing, dispatch collision-gated grounded continuations, initialize a scripted startup effect and capture callbacks, and advance an auxiliary capture item and Kirby when a strict squared-distance threshold is met. The startup landing continuation preserves the animation frame. Review is limited to the six assigned subjects; the specific 'Star Spit' gameplay label remains unverified.

### shard-main__melee__ft__kinds__ftKirby__ftkirbyspecialn-018
The six assigned callbacks separate capture proximity processing from movement and terrain transitions. Capture0 physics delegates ground friction and movement; Capture1 physics delegates gravity and aerial friction. Their collision wrappers select opposite conditional transition events. Capture1 animation delegates retained-item proximity processing, while Capture animation directly tests the captured fighter's squared distance, initializes its invisible capture-wait state, and selects Kirby's continuation by ground/air status. This review covers only the assigned subjects, not the complete translation unit.

### shard-main__melee__ft__kinds__ftKirby__ftkirbyspecialn-019
Reviewed the six assigned callbacks and their relevant transition and shared-processing bodies, not the entire translation unit. Capture and Drink0 physics delegate unchanged fighter objects to common speed-dependent ground friction and movement. Their collision callbacks delegate to a shared conditional dispatcher, selecting transitions to SpecialAirNCapture0 and SpecialAirNDrink1 respectively. Drink0 and Drink1 animation callbacks service a command only when a retained item exists, request SFX 0x222F6, call item cleanup, and clear both item references and the command. Animation completion is independent: Drink0 calls the neutral-state dispatcher, while Drink1 calls ftCo_Fall_Enter. Gameplay labels and the sound's semantic identity remain unverified.

### shard-main__melee__ft__kinds__ftKirby__ftkirbyspecialn-020
Reviewed the six assigned callbacks, not the entire TU. Drink and Drink1 physics delegate to grounded friction/movement and airborne falling/friction respectively. Their collision wrappers select ground-to-air Drink0 and air-to-ground Drink1 transitions, restoring death callbacks. Drink animation handles a command-gated victim handoff and independently exits on animation completion; End animation only performs the completion-gated neutral-return dispatch. Full copy-application semantics remain deferred.

### shard-main__melee__ft__kinds__ftKirby__ftkirbyspecialn-021-retry180539
Reviewed the six assigned callbacks and their directly relevant helpers. SpecialNLoop animation is a no-op. Its IASA callback decrements a nonzero countdown and otherwise enters SpecialNEnd when bit 0x200 of held_buttons[0] is clear. Loop and ending physics delegate to speed-sensitive grounded friction and movement. Their collision callbacks delegate to a shared ground-status check and select the corresponding aerial state; the loop transition preserves the animation frame. This is bounded subject coverage, not complete TU coverage.

### shard-main__melee__ft__kinds__ftKirby__ftkirbyspecialn-022
The six reviewed callbacks implement item-target spit updates. Both animation callbacks gate release on a command and retained item, configure a projectile from the TransN2 joint and spit attributes, invoke item cleanup, and clear retained references. Spit0 exits through the common neutral-return dispatcher; Spit1 enters Fall. Physics delegates to grounded traction or airborne gravity/friction respectively. Collision wrappers install transitions to airborne Spit1 or grounded Spit1. This review covers only the assigned subjects and supporting code.

### shard-main__melee__ft__kinds__ftKirby__ftkirbyspecialn-023
Reviewed the six assigned subjects. Grounded fighter spit consumes a release command only when a victim exists and independently dispatches animation completion to common neutral handling. Physics delegates to speed-dependent ground friction and movement; collision delegates to a guarded airborne-Spit0 transition. Two velocity callbacks initialize horizontal or angled thrown-victim velocity and return retained movement scalars. The floor-skip helper copies Kirby's current floor index after the captured fighter's guarded downward-input request.

### shard-main__melee__ft__kinds__ftKirby__ftkirbyspecialn-024
The six assigned helpers support captured-fighter interaction with Kirby: a raw-bit guard for downward input, grounded vertical movement, ground/air horizontal velocity assignment, an EatWait/EatFall predicate, opposite-facing release orientation, and a global attribute accessor used for timed model-scale restoration. Current CaptureWaitKirby and ThrownKirby consumers corroborate these roles. This review covers only the assigned subjects and supporting source.

### shard-main__melee__ft__kinds__ftKirby__ftkirbyspecialn-025
The six assigned functions are read-only floating-point attribute accessors. Their consumers initialize ordinary-star, copy-star, post-star recovery, and capture countdowns; apply passive and input-sensitive timer reductions; and normalize post-star model-scale restoration. The capture-duration accessor also supplies an item-side cached parameter. Review is limited to these subjects and their relevant consumers, not the complete translation unit.

### shard-main__melee__ft__kinds__ftKirby__ftkirbyspecialn-026
The six reviewed helpers supply capture countdown and mash decrements, X/Y intake-motion limits, scale-reduction and distance parameters, and a facing-relative world-space capture anchor. Fighter and item capture controllers cache the tuning, shrink targets using their remaining planar offset, and move them toward the recomputed anchor. The capture-wait callback applies passive and input-driven timer reductions before release handling. Coverage is limited to these subjects and the inspected consumers.

### shard-main__melee__ft__kinds__ftKirby__ftkirbyspecialn-027
Reviewed the six assigned functions and their 33 baseline facts, not the complete translation unit. The damage hooks conditionally discard Kirby's copied ability using attribute-bounded randomness; the non-knockback hook additionally exits a numeric motion interval. Shared removal performs per-kind cleanup, resets runtime fields, invokes an optional callback, conditionally creates feedback, and restores the native hat kind. Item and fighter intake helpers use squared-distance thresholds before entering Eat/EatAir, with the fighter victim entering invisible CaptureWaitKirby first. Grounded startup resets action variables, caches animation-derived values, and installs capture callbacks.

### shard-main__melee__ft__kinds__ftKirby__ftkirbyspecialn-028
Reviewed the six assigned subjects. They initialize airborne native capture, enter grounded or airborne Eat states after intake checks, install self-clearing Kirby cleanup callbacks, tear down a retained item under native-Kirby guards, and handle grounded startup effects and animation-completion transitions. This is bounded subject coverage, not complete TU coverage.

### shard-main__melee__ft__kinds__ftKirby__ftkirbyspecialn-029
The assigned physics callback delegates to common speed-dependent ground friction and movement. The collision callback delegates environmental checking with an action-specific continuation. The assigned EatFall transition forwards the fighter to the common ground-to-air transition, installs two callbacks, and writes 0x1FF to x1A6A. Its callers include EatWait collision handling and a grounded-only vertical-velocity helper. Detailed visual and captured-opponent input interpretations remain deferred.

### shard-main__melee__ft__kinds__ftKirby__ftkirbyspecialn-030-retry180539
The assigned subjects have no baseline facts. The five current function bodies take a game-object pointer and obtain its Fighter data. fn_800F6280 passes the target item and opposite facing direction to an item helper, changes motion state, and sets flags; fn_800F6318 selects the alternate capture state and clears xF4_b0. fn_800F6450 and fn_800F6528 perform state-entry sequences. fn_800F64C8 forwards its float anim_start and fighter attributes to the walk helper. This review covers only the assigned parameter subjects, not the entire translation unit.

### shard-main__melee__ft__kinds__ftKirby__ftkirbyspecialn-031
The six assigned parameter subjects have no baseline facts. Their current function bodies use the sole `gobj` parameter to obtain Fighter data and pass the same object to motion-transition routines. `fn_800F6588`, `fn_800F6638`, `fn_800F66E8`, and `fn_800F6798` additionally set effect-hitlag callbacks, pass capture-related callbacks to `ftCommon_8007E2D0`, and set `x2225_b1`. `fn_800F6848` and `fn_800F68A8` delegate transitions to the respective SpecialAirNEnd and SpecialNEnd states. This review covers only the assigned subjects, not the complete translation unit.

### shard-main__melee__ft__kinds__ftKirby__ftkirbyspecialn-032
The six assigned parameter subjects have no baseline facts. Their functions each accept an `HSD_GObj* gobj`, obtain its Fighter, and pass both to a ground-to-air or air-to-ground state-change helper using `ftKb_MF_SpecialN_Capture_Coll`. All subsequently call `ftCommon_8007E2F4(fp, 0x1FF)`. Four also reinstall death callbacks through `ftKb_SpecialN_800F9070`; fn_800F697C and fn_800F6A5C omit that call. The six functions are registered as callbacks by the corresponding collision wrappers. This review covers these assigned subjects, not the entire translation unit.

### shard-main__melee__ft__kinds__ftKirby__ftkirbyspecialn-033
The six assigned parameter subjects have no baseline facts. Their current functions each accept an HSD_GObj* named gobj, obtain its Fighter through GET_FIGHTER, and pass the same object into state-transition and shared setup calls. Four functions invoke ground-to-air transitions; two invoke air-to-ground transitions. This review covers only the assigned subjects, not the complete translation unit.

### shard-main__melee__ft__kinds__ftKirby__ftkirbyspecialn-034
The six assigned parameter subjects have no baseline facts. Their current function bodies take a game-object pointer: four derive Fighter data and dispatch ground/air state changes, restoring death callbacks afterward; EatJump1_Anim uses the object to check animation completion, enter EatJump2, and pass the configured jump-height attribute to ftCo_800CB110; EatJump1_Coll forwards the object and fn_800F6450 to ft_8008403C. This review covers only the assigned subjects, not the entire translation unit.

### shard-main__melee__ft__kinds__ftKirby__ftkirbyspecialn-035
The six assigned parameter subjects have no baseline facts. Their canonical function bodies declare a single `gobj` parameter: `Fighter_GObj*` for the five EatJump callbacks and `HSD_GObj*` for EatLanding_Anim. EatJump1_IASA forwards it to ftCo_KneeBend_Check_ShortHop; EatJump1_Phys forwards it to ft_80084F3C; EatJump2_Phys forwards it to ftCo_Jump_Phys_Inner; EatJump2_Coll passes it to ft_80082C74 with fn_800F6528. EatJump2_Anim is empty and does not use its parameter. EatLanding_Anim checks animation completion and then changes the object's motion state to ftKb_MS_EatWait, invokes two helpers, and passes its fighter data to ftCommon_8007E2F4. This review covers only the assigned subjects, not the entire translation unit.

### shard-main__melee__ft__kinds__ftKirby__ftkirbyspecialn-036
The six assigned parameter subjects have no baseline facts. Their canonical functions declare a single Fighter_GObj* argument named gobj. EatLanding_Phys and EatTurn_Phys forward it to ft_80084F3C; their collision callbacks forward it to ft_8008403C with different callbacks. EatTurn_Anim reads the associated fighter, reverses facing when animation finishes, and changes to ftKb_MS_EatWait. EatWait_Anim is empty and does not use its argument. This review covers only the assigned subjects, not the complete translation unit.

### shard-main__melee__ft__kinds__ftKirby__ftkirbyspecialn-037
The six assigned parameter subjects have no baseline facts. Their current functions all declare a single `Fighter_GObj* gobj` parameter. EatWait and EatWalk collision callbacks forward this object to `ft_8008403C` with different callbacks. EatWait physics forwards it to `ft_80084F3C`; EatWalk animation forwards it to `ftWalkCommon_800DFDDC`. EatWait IASA uses the object's fighter data to select target-dependent input checks, followed by directional, jump-input, and walk-input checks. EatWalk IASA prioritizes jump input, otherwise conditionally changes to EatWait or delegates to `ftWalkCommon_800DFEC8`. This review is limited to the assigned subjects, not the complete translation unit.

### shard-main__melee__ft__kinds__ftKirby__ftkirbyspecialn-038
The six assigned parameter subjects correspond to object arguments in animation, physics, and collision callbacks. Eat animation transitions to EatWait when frames finish; airborne capture-turn animation reverses facing and transitions to EatFall when frames finish. Eat physics forwards the object to ft_80084F3C, and EatWalk physics forwards it to ftWalkCommon_800E0060. The two collision callbacks forward the object together with their respective transition callbacks. All six subjects have empty baseline fact lists, so there are no fact IDs to disposition.

### shard-main__melee__ft__kinds__ftKirby__ftkirbyspecialn-039
The six assigned parameter subjects have no baseline facts. Their current functions declare a single `Fighter_GObj* gobj` parameter. The capture-wait animation callback is empty; the capture animation callback forwards its argument to `ftKb_SpecialN_800F5EA8`. Capture-wait IASA obtains fighter data and selects item-target or fighter-target input checks before attempting a turn. Capture-wait and capture-turn physics forward the argument to `ft_80084EEC`; capture-wait collision forwards it to `ft_80082C74` with `fn_800F6528`. This review covers only the assigned subjects, not the complete translation unit.

### shard-main__melee__ft__kinds__ftKirby__ftkirbyspecialn-040
This bounded subjects shard contains six parameter identities, each with an empty baseline facts array. There are no baseline facts to retain, supersede, reject, or mark unresolved. No function semantics, parameter types, register mappings, or gameplay meanings are asserted.

### shard-main__melee__ft__kinds__ftKirby__ftkirbyspecialn-041
The six assigned parameter subjects have no baseline facts. Their current functions declare a single `Fighter_GObj* gobj` parameter. The Drink and End physics callbacks forward it to `ft_80084EEC`; their collision callbacks forward it to `ft_80082C74` with distinct callbacks. End animation passes it to the frame-remaining check and conditionally to `ftCo_Fall_Enter`. Loop animation is empty and does not use its parameter. This review covers only the assigned subjects, not the entire translation unit.

### shard-main__melee__ft__kinds__ftKirby__ftkirbyspecialn-042
The bundle contains six parameter subjects, each with an empty baseline fact list; therefore there are no baseline fact IDs to disposition. In the inspected canonical ftKb_SpecialAirNLoop_IASA body, gobj supplies the fighter data and is passed to the motion-state transition. A nonzero xE4 is decremented with an immediate return; otherwise, absence of held-button mask 0x200 triggers ftKb_MS_SpecialAirNEnd. This is a bounded observation, not complete translation-unit coverage.

### shard-main__melee__ft__kinds__ftKirby__ftkirbyspecialn-043
This bounded subjects bundle contains six parameter identities, each with an empty baseline facts array. There are no assigned fact IDs to retain, supersede, reject, or mark unresolved. No new parameter semantics or compiled-layout claims are proposed.

### shard-main__melee__ft__kinds__ftKirby__ftkirbyspecialn-044
The six assigned parameter subjects have no baseline facts. Their canonical functions each accept a `Fighter_GObj* gobj`. Capture_Anim derives an offset position from that object's fighter data, tests a victim-related helper result, and conditionally changes motion state. Capture1_Anim forwards the object to ftKb_SpecialN_800F5DE8. The two physics callbacks forward it to distinct helpers; the two collision callbacks forward it alongside distinct callbacks. This review covers only the assigned subjects, not the complete translation unit.

### shard-main__melee__ft__kinds__ftKirby__ftkirbyspecialn-045
The complete bundle contains six parameter subjects, each with an empty baseline fact list. There are no assigned fact IDs to assess. No source-level functionality or parameter semantics are asserted, and no translation-unit coverage is claimed.

### shard-main__melee__ft__kinds__ftKirby__ftkirbyspecialn-046
The complete bundle contains six parameter subjects, each with an empty baseline fact list and no source hints. There are no baseline fact IDs to assess in this bounded shard. No parameter semantics or gameplay mappings are asserted.

### shard-main__melee__ft__kinds__ftKirby__ftkirbyspecialn-047
The six assigned parameter subjects have no baseline facts. Their current function bodies use a single `gobj` argument: Loop_Anim leaves it unused; Loop_IASA accesses its fighter, decrements a nonzero counter and otherwise changes to SpecialNEnd when held-button mask 0x200 is absent; Loop_Phys forwards it to ft_80084F3C. Loop_Coll and Spit0_Coll forward it to ft_8008403C with distinct transition callbacks. Spit0_Anim accesses fighter/item state, conditionally initializes item-release attributes and clears capture references, then calls ft_8008A2BC when animation frames are exhausted. This review covers only the bounded subjects, not the entire translation unit.

### shard-main__melee__ft__kinds__ftKirby__ftkirbyspecialn-048
The six assigned parameter subjects have no baseline facts to disposition. Their current functions take a single `Fighter_GObj* gobj`: the physics and collision wrappers forward it to their respective helpers; the animation callbacks retrieve fighter state from it and dispatch command-triggered processing and animation-end handling. In `ftKb_SpecialNSpit1_Anim`, item processing additionally clears the target references and command variable. No compiled-register mapping or gameplay meaning is asserted for the legacy `#r3` identities.

### shard-main__melee__ft__kinds__ftKirby__ftkirbyspecialn-049
The assigned parameter subjects belong to three functions. `ftKb_SpecialNSpit_Phys` forwards its object argument unchanged to `ft_80084F3C`. `ftKb_SpecialN_800F58AC` reads attributes from its object argument, writes a supplied vector with horizontal velocity opposite the supplied facing direction and zero vertical/depth components, and returns the configured deceleration rate. `ftKb_SpecialN_800F58D8` writes a supplied vector using cosine/sine components of an attribute-defined angle, applies facing direction to its horizontal component, zeros its depth component, and returns a configured gravity value. All six assigned subjects have empty baseline fact lists; no fact dispositions or proposals are required.

### shard-main__melee__ft__kinds__ftKirby__ftkirbyspecialn-050
The assigned parameters belong to helpers that construct a velocity vector using attribute-driven trigonometry, forward fighter collision data to mpUpdateFloorSkip, test a raw field mask, and scale vertical or horizontal movement by specialn_stop_momentum. All six assigned subjects have empty baseline fact arrays; there are no baseline fact IDs to disposition. No new parameter facts are proposed because register-style identities have not been independently mapped to current source parameters.

### shard-main__melee__ft__kinds__ftKirby__ftkirbyspecialn-051
The assigned subjects have no baseline facts. The inspected functions scale a float input by `specialn_stop_momentum` into either `gr_vel` or `self_vel.x`; test the object's motion against `ftKb_MS_EatWait` and `ftKb_MS_EatFall` while ignoring the second parameter; return negated facing direction; or return the object's `specialn_star_base_duration` and `specialn_frames_in_swallow_star` attributes. This review covers only the bounded subjects, not the entire translation unit.

### shard-main__melee__ft__kinds__ftKirby__ftkirbyspecialn-052
The assigned parameter subjects belong to five attribute-access helpers. Each first argument supplies the fighter whose `dat_attrs` is read. `ftKb_SpecialN_800F5AF0`, `ftKb_SpecialN_800F5B00`, and `ftKb_SpecialN_800F5B10` return `specialn_base_duration`, `specialn_duration_divisor`, and `specialn_inhale_resistance`, respectively. `ftKb_SpecialN_800F5B20` writes the outer and inner grab-box velocity attributes into the second argument's `Vec2` x and y components. `ftKb_SpecialN_800F5B3C` returns `specialn_gravity_of_inhaled`. These observations describe source-level data flow, not verified gameplay meanings or compiled register assignments. All six assigned subjects have empty baseline fact lists.

### shard-main__melee__ft__kinds__ftKirby__ftkirbyspecialn-053
The assigned parameter subjects belong to five helpers. `800F5B4C` obtains fighter attributes through its object argument and returns `specialn_z_offset_inhaled`. `800F5B5C` uses its object argument to copy the fighter position into its output vector, then adds a facing-scaled X offset and a Y offset. `800F5BA4` and `800F5C34` accept fighter pointers and conditionally invoke `800F5D04`; the former excludes cape damage, while the latter additionally handles motion IDs in a numeric interval. `800F5D04` uses its fighter-object argument for helper calls, conditionally submits position and velocity to an item routine and plays sound, then resets `hat.kind` to `FTKIND_KIRBY`. All six assigned subjects have empty baseline fact lists; there are no baseline facts to retain, change, or reject.

### shard-main__melee__ft__kinds__ftKirby__ftkirbyspecialn-054
The complete bundle assigns six parameter subjects, each with an empty baseline fact list and no source hints. There are consequently no baseline facts to retain, supersede, reject, or mark unresolved. No parameter semantics or register-to-source mappings are asserted, and no new knowledge is proposed.

### shard-main__melee__ft__kinds__ftKirby__ftkirbyspecialn-055
This bounded subjects shard contains six parameter identities, all with empty baseline fact arrays. There are no baseline facts to retain, supersede, reject, or mark unresolved. No new parameter semantics or compiled-layout claims are proposed; this review does not establish coverage of the containing functions or the full translation unit.

### shard-main__melee__ft__kinds__ftKirby__ftkirbyspecialn-056
The assigned parameter subject has no baseline facts to assess. In canonical source, ftKb_SpecialS_800F6BB0 takes HSD_GObj* gobj, obtains its Fighter, passes both to the ground-to-air state-change helper targeting ftKb_MS_EatFall, reinstalls death callbacks, and passes the Fighter to ftCommon_8007E2F4 with 0x1FF. The function is supplied as the EatWait collision callback and is also called before a grounded fighter's vertical velocity is updated. This review covers only the assigned parameter and its local context.

### shard-main__melee__ft__kinds__ftKirby__ftkirbyspecialn-057
The reviewed links describe Kirby's capture entry and landing transitions, capture-distance-dependent target scaling, delegated grounded and aerial physics, and the aerial spit animation's transition to Fall. Current canonical code supports all twelve assigned concept relationships. This review covers only the bounded link shard, not the complete translation unit.

### shard-main__melee__ft__kinds__ftKirby__ftkirbyspecialn-058
Reviewed the twelve assigned links against current canonical bodies and relevant local callbacks. The code supports capture callback installation, ground/air continuity, retained-item release configuration, and delegated aerial physics. Some stronger gameplay and cleanup claims remain deferred where the inspected code establishes only delegation.

### shard-main__melee__ft__kinds__ftKirby__ftkirbyspecialn-059
Reviewed the twelve assigned concept links against current canonical bodies and selected dependencies. The reviewed code dispatches capture-state collision transitions, initiates jumps while holding a target, supplies a capture-position anchor, and transfers retained victims into the star-spit state. EatWait's animation callback is empty; its phase membership alone does not establish an implementation link. This is bounded link coverage, not complete TU coverage.

### shard-main__melee__ft__kinds__ftKirby__ftkirbyspecialn-060
The reviewed callbacks connect Kirby's capture, consumption, turning, and spit phases to shared ground/air physics and collision transitions. Capture initialization obtains its duration from Kirby's attributes. Item consumption clears retained references; item spitting additionally creates a configured moving item. This review covers only the twelve assigned links, not the entire translation unit.

### shard-main__melee__ft__kinds__ftKirby__ftkirbyspecialn-061
The reviewed callbacks delegate grounded friction/movement and airborne gravity to common helpers. Eat movement callbacks connect jump preparation, falling and landing states; EatJump2's animation callback is empty. Capture ground-to-air conversion explicitly selects SpecialAirNCapture1. Gameplay-family and collision-dispatch details not established by the reads below remain deferred; this is not complete TU coverage.

### shard-main__melee__ft__kinds__ftKirby__ftkirbyspecialn-062
Reviewed the 12 assigned links, not the entire translation unit. The callbacks connect retained-target movement, capture and spit ground/air transitions, shared walking and falling physics, and swallow-release velocity setup. CaptureWait's animation callback is empty; its input behavior resides in IASA. One capture-transition rationale needs qualification because callback and destination suffixes differ.

### shard-main__melee__ft__kinds__ftKirby__ftkirbyspecialn-063
Reviewed the twelve assigned concept links against current canonical bodies and local transition/capture context. These routines participate in Kirby's capture lifecycle, held-target locomotion and input handling, ground/air transitions, and probabilistic copied-kind removal. Retention concerns concept membership; numeric motion IDs are not independently interpreted as gameplay mappings. This is bounded link coverage, not complete TU coverage.

### shard-main__melee__ft__kinds__ftKirby__ftkirbyspecialn-064
The reviewed callbacks implement countdown-gated loop termination, shared ground or air physics, and collision-dispatched state transitions. The Drink transition helpers select explicit ground/air motion states and reinstall callbacks. Air-loop physics applies gravity and aerial friction. This review covers only the assigned links, not the complete translation unit.

### shard-main__melee__ft__kinds__ftKirby__ftkirbyspecialn-065
The reviewed callbacks coordinate Kirby's retained-item and captured-fighter states, delegate movement, and preserve capture/spit/end actions across ground-air transitions. The drink animation processes a command-gated victim event. This review assesses only the twelve assigned links, not the entire translation unit.

### shard-main__melee__ft__kinds__ftKirby__ftkirbyspecialn-066
The reviewed links cover Kirby's neutral-special capture machinery, held-loop exit handling, capture-position limits, shared ground friction and aerial falling physics, and collision-driven ground/air transitions. This assessment is limited to the twelve assigned links, not the entire translation unit.

### shard-main__melee__ft__kinds__ftKirby__ftkirbyspecialn-067
Reviewed the twelve assigned links. The inspected callbacks initialize capture handling, preserve Special-N phases across ground/air transitions, reverse facing after a held-target turn, and exit aerial drinking into Fall. The jump-start interrupt callback delegates to the common short-hop checker; its underlying release/latch implementation could not be inspected within the reader's ownership boundary. This is bounded link review, not complete TU coverage.

### shard-main__melee__ft__kinds__ftKirby__ftkirbyspecialn-068
The reviewed links describe Kirby Special-N loop continuity, animation-completion exits, held-opponent walking, item-swallow collision handling, airborne physics, and victim-side spit and escape timing. Current code supports all twelve relationships. This assessment covers only the assigned links, not the complete translation unit.

### shard-main__melee__ft__kinds__ftKirby__ftkirbyspecialn-069
The reviewed links concern Kirby's capture, retained-target movement, drink and spit callbacks. Grounded physics delegates to common friction and movement; aerial spit physics includes aerial friction. Collision callbacks convert drink, spit and retained-target states between ground and air. Fighter spit releases the victim into ThrownKirbyStar, while a shared attribute accessor supplies the mash parameter for both thrown-star outcomes. This is a bounded link review, not complete TU coverage.

### shard-main__melee__ft__kinds__ftKirby__ftkirbyspecialn-070
The reviewed callbacks cover retained-target movement, fighter and item expulsion, and collision-driven ground/air transitions in Kirby's neutral-special family. Two animation callbacks are intentionally empty. Shared victim recovery consumes Kirby tuning for model-scale restoration; ability removal resets the hat kind and optionally emits an item and sound. This review assesses only the twelve assigned links.

### shard-main__melee__ft__kinds__ftKirby__ftkirbyspecialn-071
The reviewed callbacks advance Kirby's target capture, preserve Eat/turn/spit/drink phases across ground-air transitions, and provide retained-target locomotion. Animation completion gates aerial turning; EatWait's animation callback is empty. The cleanup-registration helper installs two death callbacks rather than directly releasing targets. This review covers only the twelve assigned links.

### shard-main__melee__ft__kinds__ftKirby__ftkirbyspecialn-072
The reviewed callbacks support Kirby's neutral-special intake, retained-target movement, terrain transitions, and target processing. Nearby item/fighter intake updates enter EatAir; retained-opponent input can initiate EatFall and vertical movement. Ground and aerial physics delegate to shared friction/gravity helpers. Collision callbacks preserve the corresponding capture, spit, and turn phases across ground/air transitions. This assessment covers only the twelve assigned links.

### shard-main__melee__ft__kinds__ftKirby__ftkirbyspecialn-073
The reviewed callbacks support Kirby's item/opponent intake, swallowed-target movement, aerial swallowing and spit landing transitions. Grounded eating callbacks delegate to character-specific ground friction; aerial capture/end callbacks delegate to gravity and aerial friction. The star-victim physics consumes Kirby's parameter getter as a grab-mash argument. This review covers only the twelve assigned links, not the complete translation unit.

### shard-main__melee__ft__kinds__ftKirby__ftkirbyspecialn-074
Reviewed the twelve assigned concept links against current canonical code. These callbacks and helpers participate in Kirby's capture, spit, copy-result and copy-loss paths, delegate grounded or airborne physics, and preserve capture-related states across ground/air transitions. This is bounded link review, not complete translation-unit coverage.

### shard-main__melee__ft__kinds__ftKirby__ftkirbyspecialn-075
The reviewed callbacks implement portions of Kirby's native neutral-special capture machinery: startup effects and capture callback installation, delayed input-release termination, shared physics, collision dispatch, Eat jump/landing and turn transitions, and retained-item cleanup. This review assesses only the twelve assigned links, not the entire translation unit.

### shard-main__melee__ft__kinds__ftKirby__ftkirbyspecialn-076
The reviewed links cover Kirby's neutral-special terrain transitions, target-intake and turn phases, item-consumption collision handling, guarded copy-ability loss, and delegated airborne falling and grounded friction. Current bodies support these concept relationships. This review covers only the assigned links, not the complete translation unit.

### shard-main__melee__ft__kinds__ftKirby__ftkirbyspecialn-077
Reviewed the twelve assigned links, not the entire translation unit. Current code supports retained-target walking and jump transitions, ground/air continuity of capture and Drink phases, and victim-side scale and floor-skip helpers. The aerial loop animation callback is empty; its claimed motion-table role remains unverified.

### shard-main__melee__ft__kinds__ftKirby__ftkirbyspecialn-078
Reviewed the twelve assigned links against current function bodies and selected capture callers. The examined code configures airborne capture, supplies capture scaling and positioning parameters, participates in grab-mash escape, and handles holding, spit, swallow, and terrain-transition callbacks. This is bounded link review, not complete TU coverage.

### shard-main__melee__ft__kinds__ftKirby__ftkirbyspecialn-079
The reviewed callbacks advance captured fighters into Eat/EatAir, preserve capture callbacks across Special-N landing transitions, dispatch retained-target input, resolve target consumption or expulsion, and clear retained item references. EatTurn reverses facing only on animation completion. This review covers the assigned links, not the complete translation unit.

### shard-main__melee__ft__kinds__ftKirby__ftkirbyspecialn-080
Reviewed the 12 assigned links against current source. The bounded routines support Kirby's intake, retained-target movement, loop release, and ground/air phase transitions. Grounded physics delegates to friction and ground movement; captured-target scaling is distance-dependent. These findings do not establish complete TU coverage.

### shard-main__melee__ft__kinds__ftKirby__ftkirbyspecialn-081
The reviewed callbacks dispatch retained-target input handling, advance completed aerial capture into EatFall, delegate physics, and preserve capture/holding/spit states across ground–air changes. The aerial loop animation callback is empty. This review assesses only the twelve assigned links, not the complete translation unit.

### shard-main__melee__ft__kinds__ftKirby__ftkirbyspecialn-082
Reviewed the twelve assigned links. The inspected callbacks initialize and advance item capture, preserve held-target states across terrain transitions, finish airborne ending animations, and delegate ground or air physics. Drink processing passes a victim-derived result to another Kirby routine; its copy-ability interpretation remains deferred pending inspection of those callees. This review does not claim complete translation-unit coverage.

### shard-main__melee__ft__kinds__ftKirby__ftkirbyspecialn-083
Reviewed the twelve assigned links against current source. The callbacks delegate ground/air physics, advance held-target jumping, install capture callbacks after startup, and preserve capture, Drink, and Spit states across ground/air transitions. The duration accessor directly feeds the captured fighter's release countdown. Copy-ability attribution and the precise opponent-intake assignment of the airborne physics wrapper remain deferred.

### shard-main__melee__ft__kinds__ftKirby__ftkirbyspecialn-084
The reviewed callbacks coordinate Kirby's neutral-special capture and holding states: animation completion advances waiting or falling states, airborne turning reverses facing, walking checks transitions before delegating to shared walking logic, and collision callbacks dispatch ground/air continuity helpers. Eat physics delegates to common ground friction and movement. This review covers only the twelve assigned links, not the entire translation unit.

### shard-main__melee__ft__kinds__ftKirby__ftkirbyspecialn-085
The reviewed callbacks delegate physics and collision processing, preserve capture/drink states across ground-air transitions, and advance item capture using configured position offsets and an inhale-velocity threshold. The airborne capture-wait animation callback is empty. Shared-helper semantics and some broader gameplay claims remain deferred because their implementations were unavailable within the reader's ownership boundary.

### shard-main__melee__ft__kinds__ftKirby__ftkirbyspecialn-086
The reviewed callbacks coordinate animation-gated exits, ground/air state changes, shared physics, and Kirby's fighter/item capture sequence. Fighter arrival triggers hidden capture-wait initialization and Eat/EatAir entry; the captured fighter's input processing consults Kirby-side predicates and resistance attributes. This review covers only the assigned links, not the entire translation unit.

### shard-main__melee__ft__kinds__ftKirby__ftkirbyspecialn-087
The reviewed callbacks delegate grounded friction and airborne falling physics, preserve capture-family state across collisions, and handle retained-target release. CaptureWaitKirby consumes Kirby-provided mash resistance, release facing, and horizontal momentum helpers. This review assesses only the twelve assigned links, not the complete translation unit.

### shard-main__melee__ft__kinds__ftKirby__ftkirbyspecialn-088
The reviewed callbacks dispatch terrain handling into transitions among Kirby's neutral-special capture, ending, Eat, Spit, and Drink motion states. Transition helpers restore death callbacks and, in several phases, call ftCommon_8007E2F4. EatLanding shares its collision transition with EatWalk and EatJump1. The reviewed physics wrapper delegates to ft_80084F3C; the tuning accessor returns specialn_spit_spin. These bounded reads establish state-machine relationships, but do not independently establish all proposed gameplay-concept mappings.

Status: researched; no-change lead bypass; independent review and live promotion pending.
