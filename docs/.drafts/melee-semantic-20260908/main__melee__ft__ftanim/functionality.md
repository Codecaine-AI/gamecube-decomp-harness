# Disjoint Librarian Research

### shard-main__melee__ft__ftanim-000
Reviewed canonical and rendered ftanim.c lines 1–480, with supplemental context through line 488 to finish the boundary function; this is not complete TU coverage.

- Three descriptor-tree iterators advance child-first, then through siblings and ancestors, using separate static 30-entry ancestor arrays and depth assertions.
- ftAnim_8006DF0C conditionally computes a joint translation using a hip-associated point and the inverse root matrix.
- ftAnim_8006E054 animates a joint hierarchy while extracting scaled translation histories and differences from designated joints, clearing their local translations, optionally substituting a second translation stream, and applying a further translation correction. Animation-end callbacks bracket the operation.
- ftAnim_8006E7B8 animates a part-bounded hierarchy, synchronizing joint traversal with eligible part records and skipping records with either exclusion flag set.
- ftAnim_8006E9B4 selects ordinary or secondary-skeleton animation processing, advances and clamps blend progress, dispatches weighted or terminal pose handling, and updates frame bookkeeping. ftAnim_8006EBA4 sequences this with three additional update calls.
- Setup routines select primary versus secondary skeleton paths, configure conditional looping and animation rates, and initialize blend counters. ftAnim_8006EED4 performs analogous part-specific setup and immediate animation evaluation.

### shard-main__melee__ft__ftanim-001
Reviewed canonical and rendered ftanim.c lines 481–960 only. This range implements animation-rate propagation or deferred storage, blend-dependent frame queries, and FigaTree track dispatch to primary or secondary part joints. Whole-tree and part-bounded dispatch select direct versus remapped paths by comparing the fighter kind with x597_bits; remapped paths filter unavailable parts and choose between two track helpers using flags_b3. Descriptor traversal matches joint objects and dispatches descriptor-update helpers, with special handling for the configured part index and quaternion-flag clearing on certain secondary joints. Skeleton initialization stores a helper-created skeleton and clears two animation counters. Final complete routines process eligible parts from a supplied index, selecting copy versus weighted-helper calls or unconditional SRT-copy calls.

### shard-main__melee__ft__ftanim-002
Reviewed canonical and rendered ftanim.c lines 961–1379 only.

- Joint-tree processing skips masked parts and parts marked flags_b0 or flags_b5, selecting different helper calls according to flags_b4; ftAnim_80070108 targets secondary joint objects.
- Costume animation setup attaches costume-selected animation data, requests frame zero, resolves texture objects using costume-specific indices with a costume-zero fallback, checks capacity and animation-object presence, and freezes their animation rates. Frame application and reset wrappers invoke optional per-kind callbacks and set or clear x221E_b7.
- Three joint-animation wrappers request or remove animations using flag value 1, with separate single-object and recursive request variants.
- Part-animation slots maintain separate active (x11) and saved (x10) selections. Applying a selection initializes progression fields and installs animation on eligible secondary joints, marking flags_b5. Updates advance and clamp progression, then invoke weighted transformation processing or copy secondary transforms into primary joints for listed marked parts. FigaTree processing separately walks eligible parts and passes matching track spans to lbAnim_8001E6D8.
- Saved selections can be applied individually or collectively. Individual removal clears tree-associated flags and dispatches to one of two base-animation/joint helper paths; bulk clearing instead clears listed flags and active selections without those helper calls. Saving a selection only writes x10.
- The final helper compares a queried bone X rotation against x100, updates the cache on inequality, and returns whether it changed.

### shard-main__melee__ft__ftanim-003
The assigned range is the complete `ftanim.h` declaration interface, not implementation coverage. It exposes routines accepting fighter objects, fighter parts, joint and animation trees, animation timing floats, and costume texture/display-object lists. The interface includes pointer-to-pointer tree traversal declarations, animation-rate and remaining-frame declarations, part-animation entry points, and several boolean or float queries. It contains no function bodies, storage definitions, or structure layouts; state transitions and the precise behavior of address-named routines cannot be established from this range.

### shard-main__melee__ft__ftanim-004-retry161335-retry180539
The assigned subjects cover typed ancestor stacks, hypothesized compiled literal sections, a gated hip-reference coordinate conversion, and hierarchy animation with translation extraction. The walkers maintain caller-owned depth cursors without clearing popped pointers. ftAnim_8006DF0C converts a hip-relative point into model-root coordinates and sets a metadata-selected joint translation. ftAnim_8006E054 evaluates a hierarchy, records scaled translation samples and differences, recenters distinguished joints, optionally substitutes a secondary translation source, and performs guarded compensation. Its caller supports both the main and blend skeletons. Source confirms diagnostic and floating-literal uses, but does not establish their compiled section placement or exact layout. This review covers only the assigned subjects.

### shard-main__melee__ft__ftanim-005-retry180539
Reviewed the six assigned subjects: selective joint-animation evaluation, direct/blended fighter-pose updates, coordinated animation/script/part-blend progression, motion playback initialization, auxiliary fall-motion staging, and selected-part playback restoration. The important correction is that ftAnim_8006EED4 forwards its FigaTree argument to a helper that ignores it; installed tracks come from fp->x590. This review does not claim complete TU coverage.

### shard-main__melee__ft__ftanim-006-retry180539
Reviewed the six assigned animation helpers, not the complete TU. They apply playback rate to two animation roots, provide blend-aware part-status/current-frame/end-frame queries, and attach Figa tracks either across fighter parts or through a cross-layout remapped subtree. The current-frame query has no explicit non-blending fallback return. Figa controller replacement is conditional on a non-null destination joint and nonzero track count.

### shard-main__melee__ft__ftanim-007-retry180539
Reviewed the six assigned subjects. They install counted Figa track spans using native or remapped fighter-part indices, dispatch between those layouts, find descriptor nodes corresponding to runtime joints, and restore selected descriptor transforms into primary or secondary joints. Conditional slots preserve serialized alignment; part flags gate writes. Descriptor restoration includes designated-part inverse model scaling, and secondary restoration clears quaternion mode on applicable branches. Gameplay-specific interpretations and the meaning of suppression flags remain qualified below. This is bounded subject coverage, not complete TU coverage.

### shard-main__melee__ft__ftanim-008-retry180539
Reviewed the six assigned animation helpers, not the complete translation unit. They dispatch direct versus cross-kind FigaTree installation, initialize a geometry-free auxiliary skeleton, copy or blend auxiliary transforms into primary parts, and apply authored joint hierarchies to primary or secondary parts. Part flags control eligibility and full-copy overrides; hierarchy traversal skips kind-specific exceptional slots. Observed callers use complementary blend coefficients and select direct copying at completed transitions.

### shard-main__melee__ft__ftanim-009-retry180539
The six assigned functions prepare costume-selected texture controllers, apply explicit animation frames, and reset the prepared collection to frame zero. Initialization resolves flattened texture indices, checks capacity and controller presence, and sets selected controller rates to zero. Fighter wrappers dispatch optional kind-specific callbacks and set or clear x221E_b7. The motion-state transition caller conditionally performs reset when material-animation preservation is not requested. Frame requests and immediate texture interpretation are distinct operations; setup requests frame zero but does not itself evaluate the model.

### shard-main__melee__ft__ftanim-010-retry180539
Reviewed the six assigned subjects, not the complete translation unit. Three wrappers request single-node or hierarchy animation frames and remove hierarchy animation controllers using mask 1. The partial-animation helpers initialize active/saved selectors, install authored AnimJoint controllers on alternate fighter-part joints, and transfer their SRT into primary joints using timed blending or endpoint copying. Endpoint completion does not itself deactivate a slot.

### shard-main__melee__ft__ftanim-011-retry180539
Reviewed the six assigned subjects and all 34 baseline facts. These functions install Figa tracks on selected secondary joints, maintain separate saved and active part-animation selections, apply or remove individual overrides, and clear/reapply overrides during motion-state changes. Shared item handlers use the single-slot operations for presentation synchronization. Two corrections distinguish Figa data from skeleton objects and qualify animation-object replacement for empty track sets. This is bounded subject coverage, not complete TU coverage.

### shard-main__melee__ft__ftanim-012-retry180539
Reviewed the six assigned subjects. Three tree-successor helpers implement iterative preorder traversal using separate shared ancestor stacks and mutable cursor/depth arguments. Part-animation application selects a configured variant, resets runtime progress, initializes timing, and attaches animation data. The rotation predicate updates a cached mapped-part X rotation and gates buffered movement in its callers. The frames-remaining predicate checks eligible primary or blend-target joints for active animation and supplies completion guards to action callbacks.

### shard-main__melee__ft__ftanim-013-retry180539
The reviewed animation runtime maps authored tracks and poses onto fighter parts, evaluates primary and auxiliary skeletons, blends transforms, maintains frame bookkeeping, manages temporary part overlays, and explicitly requests costume texture frames. `ftAnim_SetAnimRate` either stores the requested rate under `x2223_b0` or applies it to both animation roots and `frame_speed_mul`. RunBrake and Shouldered callers demonstrate speed-dependent pause/resume and mash-triggered rate changes. This is a bounded subject review, not a claim of complete TU coverage.

### shard-main__melee__ft__ftanim-014-retry180539
The six assigned parameter subjects contain no baseline facts. Their current enclosing functions traverse and animate fighter joints, capture scaled translation differences, animate a selected part subtree with per-part exclusions, update animation blending and frame state, forward a fighter object through an ordered update sequence, and configure animation start/rate/looping and blend counters. This review covers only the assigned subjects, not the complete translation unit.

### shard-main__melee__ft__ftanim-015
The six assigned parameter subjects contain no baseline facts. The reviewed bodies show that ftAnim_8006EBE8 takes an object and three floating-point animation controls: start, rate, and blend duration. It selects setup paths according to whether blend duration is zero, configures animation rate and optional looping, stores the blend duration, and clears the blend-frame counter. ftAnim_8006EDD0 takes a Fighter pointer, an integer passed to two animation-data lookup functions, and two floats used for an animation request and rate setting. Register-style subject suffixes are not treated as established source-parameter mappings.

### shard-main__melee__ft__ftanim-016
The assigned subjects contain no baseline facts. The inspected ftAnim_8006EDD0 body configures the fighter's animation skeleton using an animation index, requested frame, conditional looping, and playback rate. ftAnim_8006EED4 configures animation for a selected fighter part, choosing primary-only or secondary/blended processing according to x8A4_animBlendFrames; it forwards the supplied tree, requests the frame, sets looping conditionally, and applies playback speed. These source-level roles do not establish the register-labelled subject mappings.

### shard-main__melee__ft__ftanim-017
The assigned parameters belong to four animation helpers. ftAnim_8006F0FC takes a fighter game object and a floating-point rate, applies that rate to its primary and animation skeletons, and stores it in frame_speed_mul. ftAnim_8006F368 takes a Fighter pointer and part index, selecting the primary or secondary part joint according to whether blend frames are zero before calling lb_8000B074. ftAnim_8006F3DC obtains the fighter from its game object and returns the first eligible primary joint animation's current frame, or queries the animation skeleton while blending. ftAnim_8006F484 selects the game object's joint or animation skeleton for an end-frame query. All six assigned subjects have empty baseline fact arrays; there are no baseline fact IDs to disposition.

### shard-main__melee__ft__ftanim-018
The six assigned parameter subjects contain no baseline facts to disposition. Canonical source declares ftAnim_8006F4C8(Fighter* fp, bool do_blending, FigaTree* tree): it walks the supplied tree's node/track streams, filters fighter parts, and passes eligible tracks to lbAnim_8001E6D8. ftAnim_8006F628(Fighter* fp, Fighter_Part part, bool do_blending) instead obtains the tree from fp->x590, advances to the selected part, bounds traversal using parts[].xC, and remaps part indices before dispatching tracks. Both select x4_jobj2 when do_blending is true and joint otherwise. This review covers these parameter families, not the complete TU.

### shard-main__melee__ft__ftanim-019
The assigned subjects contain no baseline facts. In the current source, ftAnim_8006F7C8 takes a fighter, starting part, joint-selection flag, and FigaTree. It advances through node counts and tracks, filters parts using flags and a mask, stops at the starting part's xC boundary, and passes eligible tracks to lbAnim_8001E6D8. A nonzero selection flag chooses x4_jobj2; zero chooses joint. ftAnim_8006F954 forwards the fighter and starting part to one of two helpers according to whether kind equals x597_bits; its direct path supplies fp->x590 as the tree. This review covers only the bounded assigned subjects, not the whole translation unit.

### shard-main__melee__ft__ftanim-020
The assigned subjects have no baseline facts to assess. Current source shows that ftAnim_8006F954 forwards a blending selector through either dispatch branch and does not use its fourth parameter. ftAnim_8006F994 walks a joint-descriptor tree alongside filtered fighter parts, returning the descriptor whose corresponding primary or secondary runtime joint matches the requested joint. ftAnim_8006FA58 walks descriptors and fighter parts, selecting update helpers according to part flags and a configured special-part index. These findings cover only the bounded subjects, not the entire translation unit.

### shard-main__melee__ft__ftanim-021
The assigned parameters belong to two joint-tree traversal routines and one remapped animation routine. ftAnim_8006FA58 and ftAnim_8006FB88 take a starting part index and joint descriptor, skip parts with nonzero ftParts_8007506C results, and dispatch descriptor-processing calls according to part flags. They target primary and secondary joint objects respectively; the secondary routine additionally clears JOBJ_USE_QUATERNION in its flags_b0 branches. ftAnim_8006FCE4 obtains animation nodes, tracks, source kind and filtering bits from its Fighter argument, remaps source part indices, and dispatches animation calls for eligible destination parts.

### shard-main__melee__ft__ftanim-022
The assigned subjects have no baseline facts. Their containing functions route animation application according to whether two fighter-kind fields match, forward a blending flag, initialize animation-skeleton state and zero two animation counters, and iterate parts from a supplied starting index to conditionally copy transforms or call a transform helper. This review is limited to the assigned subjects, not the complete translation unit.

### shard-main__melee__ft__ftanim-023
The assigned subjects have no baseline facts. In the canonical source, ftAnim_8006FE9C iterates fighter parts from a supplied starting index, filters by flags, and either copies secondary-joint SRT or forwards two float arguments to lb_8000C490. ftAnim_8006FF74 uses the same range and eligibility filter to copy secondary-joint SRT. ftAnim_80070010 walks a supplied joint tree while advancing a fighter-part index, skips indices with nonzero ftParts_8007506C results, and dispatches eligible parts to lb_8000B4FC or lb_8000C868. This review is limited to the assigned parameter subjects.

### shard-main__melee__ft__ftanim-024
The two reviewed function bodies traverse an HSD_Joint tree while advancing a fighter-part index and skipping parts with a nonzero ftParts_8007506C result. Parts with flags_b0 or flags_b5 are excluded. Depending on flags_b4, each eligible part is passed to lb_8000B4FC or lb_8000C868; the latter receives t and t_inv. ftAnim_80070010 targets parts[i].joint, whereas ftAnim_80070108 targets parts[i].x4_jobj2. All six assigned parameter subjects have empty baseline fact lists; no baseline dispositions are required.

### shard-main__melee__ft__ftanim-025
The six assigned parameter subjects contain no baseline facts, so no fact dispositions are required. The inspected ftAnim_80070108 body traverses joint descriptors and conditionally passes each descriptor and the corresponding secondary joint to helpers, forwarding t and t_inv on one branch. ftAnim_80070200 initializes a costume texture-object list using supplied metadata, selects a costume-specific mapping with index-zero fallback, resolves objects through the supplied display-object list, checks animation-object presence, and sets animation rates to zero. Its inspected caller supplies the fighter and its metadata, texture-object list, and display-object list. This review is limited to the assigned subjects, not the entire translation unit.

### shard-main__melee__ft__ftanim-026
The assigned parameters belong to costume-animation setup and texture-animation frame application. ftAnim_80070308 obtains fighter data and the joint from its object, attaches costume-selected animation, requests frame zero, and initializes the texture-object list. ftAnim_80070458 checks a texture index against the supplied list count and requests/applies the selected texture object's frame; its fighter pointer supplies the diagnostic player ID. ftAnim_800704F0 obtains fighter data from its object, applies the frame, invokes an optional kind-indexed callback, and sets x221E_b7.

### shard-main__melee__ft__ftanim-027
The assigned subjects have no baseline facts. Their canonical functions apply a requested frame to an indexed costume texture object, optionally notify a fighter-kind callback, and set x221E_b7; reset every costume texture object to frame zero, optionally notify a reset callback, and clear that bit; or forward a joint and frame to HSD_JObjReqAnimAllByFlags with literal flags 1. This review covers only the bounded subjects, not the entire translation unit.

### shard-main__melee__ft__ftanim-028
The assigned parameters belong to joint-animation wrappers and fighter part-animation helpers. ftAnim_80070734 forwards a joint and frame to HSD_JObjReqAnimByFlags with flag 1; ftAnim_80070758 forwards a joint to HSD_JObjRemoveAnimAllByFlags with flag 1. ftAnim_8007077C obtains fighter data from its object and initializes both slot selectors to -1. ftAnim_800707B0 advances active slots, computes interpolation weights, and invokes transform blending or copying for flagged parts. ftAnim_80070904 receives fighter data directly, traverses an animation-joint tree, attaches and evaluates animations on eligible secondary joints, and sets their flags_b5. All six assigned subjects have empty baseline fact lists; there are no baseline fact IDs to disposition.

### shard-main__melee__ft__ftanim-029
The assigned parameters belong to three part-animation helpers. ftAnim_80070904 traverses an animation-joint tree starting at a supplied fighter-part index, installs animations on eligible secondary joints, evaluates frame zero, and sets flags_b5. ftAnim_80070A10 uses a fighter, starting part, and FigaTree to select node/track slices and pass them to lbAnim_8001E6D8 for eligible secondary joints, stopping at the node sentinel or part-depth boundary. ftAnim_80070C48 obtains the fighter from its object and applies a slot's stored x10 animation with zero duration when x10 is not -1. All six assigned subjects have empty baseline fact lists; there are no baseline fact IDs to disposition.

### shard-main__melee__ft__ftanim-030
The assigned subjects concern parameters of five part-animation routines. Their canonical bodies obtain fighter state from an object argument; the two slot-specific routines use their second argument to index x8B0. ftAnim_80070C48 applies the slot's x10 selection when it is not -1. ftAnim_80070CC4 clears associated flags and the x11 selection, then invokes animation or joint-tree restoration helpers. ftAnim_80070E74 applies non--1 x10 selections across all slots; ftAnim_80070F28 clears listed part flags and active x11 selections; ftAnim_80070FB4 stores a selection in x10. All six assigned subjects have empty baseline fact arrays, so there are no baseline fact IDs to disposition.

### shard-main__melee__ft__ftanim-031
The assigned subjects have no baseline facts to disposition. Current source shows that ftAnim_80070FB4 stores arg2 into x10 of the x8B0 slot selected by arg1; nearby consumers pass that stored value to ftAnim_ApplyPartAnim unless it is -1. ftAnim_ApplyPartAnim obtains fighter state from its object, selects matching runtime and data slots using arg1, records arg2 as the selected animation index, initializes slot fields, and passes the selected animation tree to ftAnim_80070904. ftAnim_80070FD0 compares a queried part X rotation against fp->x100, updates the cached value on inequality, and returns whether it changed. These observations cover only the assigned functions and nearby consumers, not the entire translation unit.

### shard-main__melee__ft__ftanim-032
The three tree-advance helpers update a caller-owned node pointer and depth, descending to children before siblings and unwinding separate static ancestor stacks when necessary. Exhaustion produces a NULL node. ftAnim_ApplyPartAnim selects indexed fighter animation state, stores the selected animation and float argument, resets x8, computes xC conditionally, and delegates tree application. All six assigned subjects have empty baseline fact arrays; there are no baseline fact IDs to disposition. This review covers only the bounded subjects, not the complete translation unit.

### shard-main__melee__ft__ftanim-033
The assigned subjects have no baseline facts to disposition. Canonical source shows that the material-animation traversal takes an in/out depth pointer and updates it while descending or unwinding its ancestor stack. `ftAnim_IsFramesRemaining` obtains fighter data from its game-object argument and checks eligible parts, selecting primary or secondary joints according to blend state. `ftAnim_SetAnimRate` takes a game object and a floating-point rate: it stores the rate in `x8A0_unk` when `x2223_b0` is set; otherwise it applies the rate to both animation hierarchies and updates `frame_speed_mul`. Register-labeled parameter identities are not independently established by these C bodies.

### shard-main__melee__ft__ftanim-034
The reviewed links cover motion-entry animation initialization, saved partial-pose restoration, held-item presentation, primary/auxiliary skeleton blending, playback-rate and costume-animation setup, and cached rotation-change detection. Source also establishes explicit ancestor-stack traversal. This is a bounded link review, not complete translation-unit coverage.

### shard-main__melee__ft__ftanim-035
The reviewed routines connect fighter skeleton and costume animation to HSD playback, maintain partial-animation selectors, copy or blend selected parts, and traverse animation descriptors using an explicit ancestor stack. Playback-rate changes affect both primary and auxiliary hierarchies. This assessment covers only the assigned links, not the entire translation unit.

### shard-main__melee__ft__ftanim-036
The reviewed links cover fighter joint-animation evaluation and track binding, auxiliary-pose blending, costume texture frame evaluation, and partial animations reapplied during held-item visibility handling. Fall animation callers stage direction-dependent auxiliary motions at the current frame and interpolate or copy their poses. This review covers only the assigned links, not the complete translation unit.

### shard-main__melee__ft__ftanim-037
The reviewed links cover fighter pose blending, descriptor-to-part alignment, animation binding and frame requests, texture-frame control, blend-aware completion tests, and explicit-stack descriptor traversal. Held-item invisibility removes a part-animation override and restores underlying animation; visibility instead reapplies the saved override. This review is limited to the assigned links, not complete TU coverage.

### shard-main__melee__ft__ftanim-038
The reviewed links cover costume-selected texture animation, explicit-stack animation-tree traversal, fighter hierarchy animation setup and replacement, auxiliary-skeleton blending, and restoration of stored part-animation selections. Canonical code supports these associations. The stronger action-completion interpretation of the per-part predicate remains deferred pending inspection of its external helper and gameplay consumers. This review covers only the assigned links, not the entire translation unit.

### shard-main__melee__ft__ftanim-039
The reviewed routines select blend-aware animation timing, apply Figa tracks to eligible model subtrees with optional part remapping, synchronize hierarchy frame requests, initialize and evaluate costume texture animations, and transition secondary partial poses into visible joints. Nine assigned links are supported; the knockback association is deferred because its character caller was unavailable. This is a bounded link review, not complete TU coverage.

Status: researched; no-change lead bypass; independent review and live promotion pending.
