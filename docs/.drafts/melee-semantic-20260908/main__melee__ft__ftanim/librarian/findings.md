# Fighter animation review

Revision `c302741689bd67c361cd7faadb221df3193992c3`. UTC 2026-09-08T16:03:49.850332+00:00 to 2026-09-08T16:14:09.077113+00:00. Full canonical and separately rendered C1-1379 and H1-70 read.

{"functions": 51, "sections": 4, "file_entities": 1, "parameters": 122, "existing_facts": 300, "proposed_facts": 33, "dispositions": {"unresolved": 13, "retain": 254, "supersede": 33}, "existing_links": 70, "link_dispositions": {"retain": 66, "reject": 3, "unresolved": 1}}

## Entry-point findings

### ftAnim_GetNextAnimJointInTree
Advances an iterative preorder walk of an HSD_AnimJoint hierarchy by one node, allowing callers to process the tree as a linear sequence without recursion.
Three independent static arrays each contain30 typed pointers. The depth assertion follows the push; saved entries are not cleared on pop. Null current nodes and arbitrary depth are unchecked.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftanim.c#L26-L57

### ftAnim_GetNextMatAnimJointInTree
Advances a material-animation-joint iterator to the next node in depth-first preorder, descending to a child when possible, otherwise selecting a sibling or ascending until an ancestor with a following sibling is found.
Three independent static arrays each contain30 typed pointers. The depth assertion follows the push; saved entries are not cleared on pop. Null current nodes and arbitrary depth are unchecked.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftanim.c#L59-L92

### ftAnim_GetNextJointInTree
Advances an external cursor through an HSD_Joint hierarchy in preorder depth-first order so callers can iterate every joint without recursion.
Three independent static arrays each contain30 typed pointers. The depth assertion follows the push; saved entries are not cleared on pop. Null current nodes and arbitrary depth are unchecked.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftanim.c#L94-L127

### ftAnim_8006DF0C
Updates a fighter's designated model joint from a hip-relative reference point: it finds that point in world space, converts it into the fighter model root's local coordinate space, and installs the result as the designated joint's translation.
Only x2221_b2 permits work. Converts common hip offset through HipN and inverse root matrix into one selected joint translation; no inverse-success check.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftanim.c#L129-L145

### ftAnim_8006E054
Advances animation across a fighter's complete JObj hierarchy while extracting animation-authored translation from the TransN joint. It records the scaled current and previous root positions and their per-step difference in Fighter state, removes that translation from the animated joint hierarchy, and handles an optional secondary translation source and model-joint compensation mode.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftanim.c#L156-L263

### ftAnim_8006E7B8
Advances the animation controllers for eligible model joints in the fighter-part subtree rooted at a selected part, while treating the subtree evaluation as one animation-completion callback pass.
Part scans are unbounded; b1 alignment and xC boundary assume valid matching metadata. Callback counts are global and invoked after the walk, including boundary exit.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftanim.c#L265-L312

### ftAnim_8006E9B4
Advances and applies one fighter-animation update, evaluating the active pose directly when no transition blend is in progress or evaluating and blending the primary and auxiliary skeletons during a motion transition, then synchronizing the fighter's recorded animation frame.
No animation means early return. Blend elapsed clamps but duration remains nonzero; both poses still evaluate at completion. Loop accumulation adds old current frame plus frame_speed_mul, not a queried end frame.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftanim.c#L314-L377

### ftAnim_8006EBA4
Advances a fighter's animation-driven state by one playback step, coordinating model-pose evaluation, execution of due fighter command-script events, timed blending of selected fighter parts, and a final common animation follow-up operation.
Four unconditional calls: E9B4, ftAction_80073240,707B0,ftCo_800DB500. E9B4 returning for anim_id-1 does not suppress remaining stages.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftanim.c#L380-L386

### ftAnim_8006EBE8
Initializes playback for a newly selected fighter animation at a requested start frame and rate, choosing either an immediate transition on the visible model or a blended transition that also initializes the fighter's auxiliary animation skeleton.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftanim.c#L388-L428

### ftAnim_8006EDD0
Prepares a selected fighter motion on the auxiliary animation skeleton so it can be evaluated and blended into the visible fighter pose without restarting the motion timeline. It clears the skeleton's previous animation, rebuilds secondary part transforms from the costume hierarchy, installs the selected motion's FigaTree from TopN, requests a starting frame, and applies the motion's loop and playback-rate properties.
Stages explicit motion on secondary skeleton; does not set anim_id or blend clocks, and evaluation follows in the fall caller.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftanim.c#L430-L445

### ftAnim_8006EED4
Restores current fp->x590 Figa animation on a selected part region at the supplied frame/rate. It restores descriptor transforms and attaches tracks to the primary destination when blend duration is zero, or to the secondary destination when nonzero, while requesting/rating both roots in the latter mode. It then evaluates the primary part and, in blended mode, first evaluates the secondary tree. The supplied tree argument does not select the installed data.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftanim.c#L447-L488

### ftAnim_8006F0FC
Immediately sets a fighter's animation playback rate across both the primary model hierarchy and the auxiliary animation skeleton, then synchronizes the Fighter-level frame-speed multiplier with that rate.
Broadcast mask0xFB7F excludes MObj and TObj types; applies both roots before writing frame_speed_mul. Null roots are safe inside HSD_ForeachAnim.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftanim.c#L496-L503

### ftAnim_SetAnimRate
Sets a fighter's animation playback rate, either applying it immediately across the fighter's animation hierarchies or caching it when the fighter's guarded animation mode is active.
x2223_b0 defers only into x8A0. Immediate branch broadcasts then stores frame_speed_mul.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftanim.c#L505-L513

### ftAnim_IsFramesRemaining
Determines whether any eligible animated part of a fighter still has animation work remaining. It checks the fighter's primary part joints normally and the secondary blend-target joints while an animation blend is active, returning immediately when any qualifying part remains active.
Tests attached AObj without AOBJ_NO_ANIM, not numeric remaining duration. Null selected JObj is unsafe in lb_8000B074.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftanim.c#L515-L538

### ftAnim_8006F368
Determines whether one selected fighter model part currently contributes enabled animation. It performs the same blend-aware joint-status test used by the whole-fighter frame-remaining predicate, but restricts the query to the supplied Fighter_Part.
Queries one selected part without b1/b0/b5 eligibility filtering. Same null-JObj precondition as aggregate query.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftanim.c#L540-L550

### ftAnim_8006F3DC
Queries the fighter's current animation frame in a blend-aware manner. Outside an animation blend it returns the current frame from the first eligible fighter part that owns an HSD_AObj; during a blend it returns the current frame represented by the fighter's auxiliary animation skeleton.
No primary eligible AObj falls off without a return; secondary helper returns0 on no AObj and recursively searches children/siblings without instance pruning.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftanim.c#L552-L571

### ftAnim_8006F484
Queries the fighter's animation end frame in a blend-aware manner. Outside an animation blend it reads the primary model hierarchy; while blending is active it reads the fighter's auxiliary animation skeleton.
First AObj end frame, not maximum of all controllers. Shared search includes sibling links and ignores instance pruning.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftanim.c#L573-L581

### ftAnim_8006F4C8
Installs a supplied FigaTree across the fighter's eligible model parts. It aligns the tree's node-count and track streams with the fighter's character-specific parts layout, chooses either each part's primary joint or auxiliary blending joint, and delegates installation of that part's animation controller and channels to `lbAnim_8001E6D8`.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftanim.c#L594-L636

### ftAnim_8006F628
Installs current fp->x590 Figa tracks through source-kind-to-destination-kind remapping over a depth-delimited source-index range. The depth boundary uses the current Fighter.parts array at unremapped source indices; correct source/destination hierarchy correspondence is assumed. Accepted remaps passing b1&&!b0&&!b5 receive native or specialized track decoding according to b3 on primary or secondary JObjs.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftanim.c#L638-L698

### ftAnim_8006F7C8
Installs the fighter's Figa animation on the model-joint subtree rooted at a requested fighter part when the animation skeleton uses the fighter's native part layout. It aligns the Figa node and track cursors with that part, walks active descendant parts until leaving the starting depth, and attaches each applicable track set to the corresponding primary or secondary JObj.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftanim.c#L700-L772

### ftAnim_8006F954
Dispatches application of the fighter's current FigaTree animation to a requested fighter-part subtree, selecting direct part indexing when the animation tree belongs to the current fighter kind and cross-kind part remapping otherwise.
Fourth FigaTree argument ignored. Both native and remapped installers consume fp->x590.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftanim.c#L774-L782

### ftAnim_8006F994
Finds the authored HSD_Joint descriptor corresponding to a runtime fighter-part JObj, allowing part-specific animation setup to begin at the matching subtree of the fighter's costume-joint hierarchy.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftanim.c#L784-L800

### ftAnim_8006FA58
Applies an HSD_Joint descriptor subtree to the corresponding primary runtime joints in a fighter's parts array. It keeps the descriptor traversal aligned with character-specific exceptional part slots, selectively restores each destination joint's authored transform components according to its part flags, and applies inverse character-model scale compensation to one designated part.
Special scale part receives inverse character scale even when b5 suppresses ordinary restoration. b0 preserves rotation.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftanim.c#L802-L828

### ftAnim_8006FB88
Restores an authored HSD_Joint subtree into the corresponding portion of a Fighter's secondary animation skeleton. It aligns descriptor nodes with ordinary fighter-part slots, selectively restores translation, rotation, and scale according to each part's flags, applies inverse character-model scaling to the designated normalization part, and prepares affected secondary joints for Euler-based animation evaluation.
Secondary analogue explicitly clears quaternion on b0 paths; special reciprocal scale applies unconditionally.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftanim.c#L830-L858

### ftAnim_8006FCE4
Installs the fighter's current Figa animation tree onto eligible model joints when the animation was authored for a different fighter-parts layout. It keeps tracks aligned across inactive conditional slots, remaps each source-layout joint to the corresponding joint in the fighter's actual layout, and chooses between the two Figa channel constructors for each installed joint.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftanim.c#L860-L905

### ftAnim_8006FE08
Installs the fighter's current FigaTree animation across its model parts, choosing direct part-to-track binding when the animation's source fighter kind matches the fighter and remapped binding when the kinds differ.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftanim.c#L907-L914

### ftAnim_8006FE48
Initializes a fighter's secondary animation skeleton used for pose blending: it loads a display-object-free copy of the fighter's costume joint hierarchy, resets the blend-duration and blend-frame counters, and binds the copied JObjs to the fighter's indexed part records.
Replaces auxiliary pointer and resets clocks; no old-tree release or local failure recovery. Loader temporarily selects interpolation class and suppresses descriptor DObj data.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftanim.c#L916-L923

### ftAnim_8006FE9C
Applies a partial auxiliary animation pose to the fighter's primary runtime skeleton, beginning at a specified fighter-part index. For each eligible part it either copies the auxiliary JObj's complete local transform or blends that transform with the part's current primary-joint transform using the supplied weights.
Inclusive array suffix, not subtree. b4 copies regardless of weights; other parts blend. No clamp/normalization of weights.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftanim.c#L925-L940

### ftAnim_8006FF74
Fully applies the auxiliary animation skeleton's pose to eligible fighter parts at and after a selected starting part by copying each auxiliary JObj's local scale, rotation, and translation into the corresponding visible fighter joint.
Inclusive eligible suffix with no subtree depth bound. Copies representation and marks matrix dirty.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftanim.c#L942-L952

### ftAnim_80070010
Blends an authored HSD_Joint hierarchy into the fighter's primary runtime skeleton, beginning at a specified fighter-part index. It keeps the source hierarchy aligned with ordinary fighter-part slots, skips ineligible parts, and either restores each source transform directly or combines it with the part's current transform using the supplied weights.
Walks supplied descriptor tree, skipping mask-listed parts and b0/b5 mutations; no b1 guard or part-count bound. b4 resets SRT, otherwise blends.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftanim.c#L954-L975

### ftAnim_80070108
Applies an external HSD_Joint pose tree to the fighter's secondary per-part JObjs. It walks the source hierarchy in parallel with the fighter-parts array, skips fighter-kind-specific exceptional slots, and either restores or weight-blends each eligible secondary joint's local transform.
Same descriptor traversal against secondary joints; no b1 guard or part-count bound.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftanim.c#L977-L999

### ftAnim_80070200
Initializes a runtime list of a fighter's costume-dependent animated texture objects by resolving descriptor-provided flattened texture indices against a DObj list, validating that every selected texture has an animation object, and initially setting each animation object's playback rate to zero.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftanim.c#L1001-L1020

### ftAnim_80070308
Initializes the newly constructed fighter model's costume-dependent material and texture animation state: it attaches the selected costume's material-animation hierarchy, requests the model hierarchy at frame 0, and prepares the fighter's indexed costume texture objects with stopped animation controllers.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftanim.c#L1022-L1034

### ftAnim_80070458
Selects one texture object from a fighter costume's prepared texture-animation list and immediately applies that texture object's animation at a caller-specified frame, while diagnosing an invalid texture index.
Unsigned index check precedes list lookup; valid nonnull TObj assumed. Requests frame then evaluates; AObj FIRST_PLAY suppresses normal rate increment.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftanim.c#L1047-L1055

### ftAnim_800704F0
Applies a requested animation frame to one entry in a fighter's costume texture-object list, then gives that fighter kind an optional extension callback and records on the Fighter that this texture-animation path has run.
Indexed request/evaluation precedes optional x4 callback; x221E_b7 becomes true after callback.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftanim.c#L1057-L1068

### ftAnim_800705E0
Restarts every costume texture object's animation at frame 0 and immediately evaluates that frame so the entire CostumeTObjList is placed in its initial animated-texture state.
Requests/evaluates every listed TObj at0; does not change rate or list. Null AObj safe, null listed TObj unsafe.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftanim.c#L1070-L1078

### ftAnim_80070654
Resets a fighter's active costume texture/material animation during motion-state cleanup: it returns every costume texture object to animation frame 0, applies that frame immediately, invokes the fighter-kind-specific reset callback when present, and marks the fighter as no longer carrying an active material-animation override.
Resets list, optional x0 callback, flagfalse after callback. Caller guards do not belong to this unconditional wrapper.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftanim.c#L1080-L1090

### ftAnim_80070710
Requests a common animation frame across an entire JObj hierarchy using selection flag 1, allowing fighter code to position an animation skeleton at a chosen pose before evaluating or blending that skeleton.
Mask1 affects JObj AObjs only; downstream attachment calls receive mask but their own animation bits are absent. Instance nodes process self and prune children.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftanim.c#L1092-L1095

### ftAnim_80070734
Requests animation playback from a supplied frame for the bit-0-selected animation components attached to one HSD_JObj, without traversing its child hierarchy.
Single node with mask1; no child traversal. Attachment dispatch is attempted but does not select their controllers.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftanim.c#L1097-L1100

### ftAnim_80070758
Tears down the currently attached joint-animation controllers throughout an HSD_JObj hierarchy so fighter animation setup can replace them with a newly requested animation.
Mask1 removes only JObj AObjs. Instance boundaries stop descendant traversal.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftanim.c#L1102-L1105

### ftAnim_8007077C
Initializes every fighter partial-animation control slot to an inactive state by clearing both its active animation selector and its saved replay selector to the -1 sentinel.
Only sets five x10/x11 selector pairs to-1. Does not reset timing, part flags or detach animations.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftanim.c#L1107-L1116

### ftAnim_800707B0
Advances every active partial-fighter animation transition and transfers its pose from alternate per-part JObjs into the fighter's primary visible joints, blending while time remains and copying the completed pose exactly at the transition endpoint.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftanim.c#L1118-L1163

### ftAnim_80070904
Installs and primes an authored AnimJoint hierarchy as a partial fighter-model animation, mapping its nodes onto applicable Fighter.parts entries beginning at a supplied part index and marking each joint that received the override.
No b1 guard or prior-b5 guard. Clears quaternion before frame0 request/evaluation; sets b5 afterward. Skipped nodes do not clear earlier b5.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftanim.c#L1165-L1185

### ftAnim_80070A10
Installs a supplied FigaTree on the fighter's secondary animation joints for the skeleton subtree rooted at `part`. It aligns the tree's node-count and track streams with eligible `Fighter.parts` entries, then delegates each accepted joint's animation-controller installation to `lbAnim_8001E6D8`.
Installs native-layout secondary Figa tracks without marking b5, evaluating, or configuring slot timing.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftanim.c#L1187-L1255

### ftAnim_ApplyPartAnim
Selects and applies one configured animation variant to a specified fighter animation part, resetting that part's playback progress and initializing its timing state before attaching the selected animation data to the fighter model.
Attaches/evaluates secondary pose once at0. Immediate duration0 means later updater copies; it does not directly copy primary transforms.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftanim.c#L1257-L1274

### ftAnim_80070C48
Reapplies the configured animation selection for one fighter animation-part slot, if that slot has a valid saved selection, using an immediate transition rather than a timed blend.
Saved-1 leaves slot untouched; otherwise applies saved selection with duration0. Primary pose receives it during later copy/update.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftanim.c#L1276-L1283

### ftAnim_80070CC4
Removes the selected active part override by clearing its mapped b5 flags and setting x11 to-1, then restores current Figa tracks/frame/rate through ftAnim_8006EED4 when x590 exists, or resets primary descriptor transforms when it does not. Saved x10 and slot timing are preserved; the Figa restoration branch is itself blend-aware.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftanim.c#L1304-L1327

### ftAnim_80070E74
Reapplies every configured fighter part-animation override: it scans all per-fighter part-animation channels and activates each channel's stored animation selection when that selection is enabled.
All five saved selections reapplied independently at duration0. Overlapping part groups are not reconciled here.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftanim.c#L1329-L1340

### ftAnim_80070F28
Retires every currently active fighter part-animation slot by clearing the per-part animation flags for the parts owned by that slot and marking the slot inactive.
Clears b5 only on descriptor-listed parts for active slots, sets x11-1. Leaves x10/timers/controllers/transforms intact; no overlap ownership count.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftanim.c#L1342-L1361

### ftAnim_80070FB4
Records the animation variant that should be restored for one fighter partial-animation slot, without immediately changing the model or resetting that slot's active playback state.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftanim.c#L1363-L1368

### ftAnim_80070FD0
Detects whether a designated fighter-model bone's X rotation has changed since the previous sample, updating the cached rotation and reporting the change so movement code can synchronize position updates with changes in the animated pose.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftanim.c#L1370-L1378

## Corrected boundaries

### ftAnim_GetNextAnimJointInTree / state_behavior
Child descent writes the current node to the type-specific shared stack at the incoming depth and increments depth before checking >=30. The check therefore reports after the write; an invalid incoming depth can index outside the array before assertion. Otherwise sibling movement preserves depth; ancestor backtracking decrements it until a next sibling is found, and exhaustion writes NULL and depth zero. Inputs must point to a nonnull current node and valid traversal state. Separate walks of the same type share storage and are not independently reentrant.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftanim.c#L26-L57

### ftAnim_GetNextJointInTree / state_behavior
Child descent writes the current node to the type-specific shared stack at the incoming depth and increments depth before checking >=30. The check therefore reports after the write; an invalid incoming depth can index outside the array before assertion. Otherwise sibling movement preserves depth; ancestor backtracking decrements it until a next sibling is found, and exhaustion writes NULL and depth zero. Inputs must point to a nonnull current node and valid traversal state. Separate walks of the same type share storage and are not independently reentrant.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftanim.c#L94-L127

### ftAnim_GetNextMatAnimJointInTree / state_behavior
Child descent writes the current node to the type-specific shared stack at the incoming depth and increments depth before checking >=30. The check therefore reports after the write; an invalid incoming depth can index outside the array before assertion. Otherwise sibling movement preserves depth; ancestor backtracking decrements it until a next sibling is found, and exhaustion writes NULL and depth zero. Inputs must point to a nonnull current node and valid traversal state. Separate walks of the same type share storage and are not independently reentrant.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftanim.c#L59-L92

### ftAnim_8006E054 / inferred_type
Declared signature void(Fighter* fp, HSD_JObj* root, HSD_JObj* trans_n, HSD_JObj* secondary_trans). The caller uses primary root/TransN for direct playback and auxiliary root/secondary TransN during blending, but passes the primary part-0x35 joint as secondary_trans in both cases. The fourth argument participates in sampling only when x594_b5 is set; it is not necessarily a node of the traversed auxiliary tree.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftanim.c#L156-L263

### ftAnim_8006E054 / state_behavior
Resets global AObj completion counts, animates nodes child-first while pruning children at flag0x1000, applies translation extraction/corrections, then invokes eligible end callbacks. Traversal follows siblings and parent siblings without an initial-root stopping test, so an arbitrary subtree root can escape its subtree. With x594_b5, sampled secondary vectors replace primary histories after their position difference is restored to arg2. The final !x2226_b2 && x2221_b2 path divides primary displacement by model scale and subtracts it from the metadata-selected joint. Scale denominators and distinguished-node membership are not validated.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftanim.c#L156-L263

### ftAnim_8006E054 / data_flow
Evaluates the supplied joint walk. At arg2, snapshots x68C into x698 and x6A4 into x6B0, samples scaled translation into x68C, computes the position difference into x6A4, and zeros the joint translation. With x594_b5, arg3 maintains x6C0/x6CC and x6D8/x6E4 in parallel. After traversal, arg2 receives the primary-minus-secondary position converted back through model scale, and secondary histories replace primary histories. A final gated compensation subtracts the primary translation divided by model scale from the designated joint. The auxiliary-tree caller still passes the primary0x35 joint as arg3.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftanim.c#L156-L263

### ftAnim_8006EBE8 / data_flow
Removes mask1 joint animations from both primary and auxiliary roots. Zero blend resets primary transforms from the costume child at TransN, attaches the current FigaTree to primary parts, requests the primary frame and applies loop/rate there. Nonzero blend resets and attaches only the auxiliary destination but requests and rates both roots and conditionally loops both. Finally stores the supplied blend duration and zeroes elapsed progress. The reset helpers restore descriptor transforms and designated scale; they are not merely translation-mode selectors.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftanim.c#L388-L428

### ftAnim_8006EBE8 / state_behavior
Every call removes joint animations from both roots before choosing zero versus nonzero blend duration. Zero resets/attaches the primary pose; nonzero resets/attaches the secondary pose. Both roots receive frame/rate requests only in the nonzero branch. The fighter loop bit conditionally sets AOBJ_LOOP. Stores the supplied duration unchanged, including negative values, and resets elapsed to0; no local numeric validation or pose evaluation occurs.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftanim.c#L388-L428

### ftAnim_8006EED4 / data_flow
Uses the selected primary part JObj to find its costume Joint descriptor. Zero blend resets and attaches primary tracks; nonzero blend resets and attaches secondary tracks and requests/rates both roots. Although tree is forwarded to ftAnim_8006F954, that callee ignores it: both installer paths use fp->x590. Looping comes from motion metadata in the zero branch and the fighter loop flag otherwise. The auxiliary hierarchy is evaluated first in the blend branch, followed by primary part evaluation. Blend duration and elapsed progress are not reset.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftanim.c#L447-L488

### ftAnim_8006EED4 / inferred_type
Declared signature void(Fighter* fp, Fighter_Part part, FigaTree* tree, float frame, float speed). part indexes the runtime part table; frame and speed control requests/rates. tree is forwarded but ignored by ftAnim_8006F954, so fp->x590 supplies the actual tracks in both native and remapped paths. Valid initialized part, descriptor and current animation data are required.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftanim.c#L447-L488

### ftAnim_8006EED4 / purpose
Restores current fp->x590 Figa animation on a selected part region at the supplied frame/rate. It restores descriptor transforms and attaches tracks to the primary destination when blend duration is zero, or to the secondary destination when nonzero, while requesting/rating both roots in the latter mode. It then evaluates the primary part and, in blended mode, first evaluates the secondary tree. The supplied tree argument does not select the installed data.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftanim.c#L447-L488

### ftAnim_8006F7C8 / inferred_type
Declared signature void(Fighter* ft, Fighter_Part part, int arg2, FigaTree* tree); arg2 is used as a Boolean secondary-joint selector by get_part_joint. The wrapper supplies bool, but the canonical definition and header retain int. part selects a depth-delimited region in the part array; tree supplies signed-byte counts terminated by-1 and parallel FigaTrack records. Indices and stream extents are unchecked.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftanim.c#L700-L772

### ftAnim_8006F628 / game_mapping
Provides cross-layout partial Figa installation by mapping source joint indices through shared logical parts to the destination fighter kind. The stopping depth is read from fp->parts[i] before remapping, with the start depth taken from fp->parts[part]; it does not independently verify that remapped destinations all lie beneath one destination subtree. Correct layout correspondence remains an input invariant.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftanim.c#L638-L698

### ftAnim_8006F628 / state_behavior
Seeks source entries before part, consuming node/count only for mask-accepted source indices. Each accepted index checks fp->parts[i].xC against the starting depth before ftPartsRemap; after the root a depth <=start stops traversal. Invalid remap255 or a destination failing b1&&!b0&&!b5 skips attachment while consuming the node and counted tracks. b3 chooses E6D8, otherwise E7E8. Both installers do nothing for NULL JObj or count0. Searches and signed node counts are not locally validated.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftanim.c#L638-L698

### ftAnim_8006F4C8 / state_behavior
Walks signed node counts until-1, skipping slots lacking b1 and excluded conditional b2 slots without consuming a node. b0 or b5 suppress attachment but still consume the node and tracks. The i>=140 assertion occurs after the earlier indexed scans, so it does not bound all part accesses. A zero count or NULL selected JObj makes the library installer a no-op; negative nonsentinel counts are not rejected here.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftanim.c#L594-L636

### ftAnim_8006FCE4 / state_behavior
Traversal continues until the FigaTree node stream reaches its -1 sentinel. Before each node, source-layout slots whose conditional bit is absent from `fp->x594_bits` are skipped without consuming a node or track slice. An invalid remap or a destination part failing the `flags_b1 && !flags_b0 && !flags_b5` guard suppresses installation, but that node's track count is still consumed. For an eligible part, `flags_b3` selects between the full and specialized Figa channel constructors; either active installer removes any existing JObj AObj and installs a fresh controller. Installation is conditional inside lbAnim_8001E6D8/E7E8: NULL JObjs and zero counts leave old controllers unchanged. Stream extents, negative nonsentinel counts and index scans have no local validation.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftanim.c#L860-L905

### ftAnim_80070A10 / state_behavior
Traversal ends when the Figa node stream reaches its `-1` terminator or, after leaving the root part, when the next accepted fighter part has depth less than or equal to the root's depth. Parts lacking `flags_b1` and inactive conditional slots marked by `flags_b2` are skipped while preserving stream alignment. Parts marked by either `flags_b0` or `flags_b5` consume their corresponding stream entry but do not receive a new animation object; every other selected secondary joint has its existing animation object replaced by the Figa-derived state. Installation is conditional inside lbAnim_8001E6D8/E7E8: NULL JObjs and zero counts leave old controllers unchanged. Stream extents, negative nonsentinel counts and index scans have no local validation.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftanim.c#L1187-L1255

### ftAnim_8006F994 / inferred_type
Declared signature HSD_Joint*(Fighter* fp, HSD_JObj* jobj, HSD_Joint* joint). A successful lookup returns a borrowed descriptor corresponding to either primary or secondary runtime JObj. It leaves Fighter/descriptors unchanged but mutates the shared Joint traversal stack. Exhaustion has no explicit return; it is not a NULL-on-miss API.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftanim.c#L784-L800

### ftAnim_80070308 / game_mapping
Initializes costume-dependent animation controllers during ordinary and demo fighter construction. It attaches the selected MatAnimJoint hierarchy, requests all model animation components at frame0, and sets the listed texture-controller rates to0. No animation evaluation occurs in this routine, so attachment/request alone does not establish that every rendered property has already taken its frame0 value.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftanim.c#L1022-L1034

### ftAnim_800707B0 / inferred_type
Declared signature void ftAnim_800707B0(Fighter_GObj* gobj). The suggested name ftAnim_UpdatePartAnims remains a hypothesis, not the canonical identifier. The routine updates timing in five Fighter.x8B0 slots and copies/blends selected primary JObj transforms; it does not evaluate the secondary animation controllers.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftanim.c#L1118-L1163

### ftAnim_800707B0 / state_behavior
Skips x11==-1. Active slots add xC to elapsed x8. If elapsed>=duration x4, clamps elapsed and chooses weights1/0; otherwise computes t=xC/(xC+x4-x8), t_inv=1-t without validating denominator, sign, zero or finiteness. Thus an incomplete slot does not guarantee a nonzero source weight. Only listed parts with b5 are copied/blended. Completion never clears x11 or b5; later updates continue copying. This routine does not advance the secondary pose itself.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftanim.c#L1118-L1163

### ftAnim_80070CC4 / data_flow
Indexes the five-slot x8B0 control array and corresponding ft_data->x1C descriptor. If active, walks the selected AnimJoint tree while skipping conditional part slots and clearing b5. Sets x11 to-1. When fp->x590 (a FigaTree pointer) is nonnull, calls ftAnim_8006EED4 with the current frame/rate; that helper chooses primary versus secondary destination from blend duration. Otherwise finds the costume Joint descriptor and resets primary transforms. x590 is not the auxiliary skeleton pointer.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftanim.c#L1304-L1327

### ftAnim_80070CC4 / purpose
Removes the selected active part override by clearing its mapped b5 flags and setting x11 to-1, then restores current Figa tracks/frame/rate through ftAnim_8006EED4 when x590 exists, or resets primary descriptor transforms when it does not. Saved x10 and slot timing are preserved; the Figa restoration branch is itself blend-aware.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftanim.c#L1304-L1327

### ftAnim_80070CC4 / state_behavior
x11==-1 returns without work. Otherwise clears mapped b5 flags, marks x11 inactive, and restores current Figa animation if fp->x590 is nonnull or primary costume transforms otherwise. x590 denotes animation data, not auxiliary-skeleton existence; x8A4_animBlendFrames selects the hierarchy inside the Figa restoration helper. No saved-selector, timer, or explicit old-AObj teardown is performed here.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftanim.c#L1304-L1327

### ftAnim_80070FB4 / state_behavior
Writes the s32 argument into signed-byte x10 of the selected slot without bounds, range or sentinel validation. This is a narrowing assignment; values outside s8 range are not guaranteed to survive unchanged. It leaves x11, timing and model pose untouched. Consumers later recognize-1 or forward the stored value; their sentinel test is not full index validation.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftanim.c#L1363-L1368

### ftAnim_ApplyPartAnim / inferred_type
Declared signature void(Fighter_GObj*,s32 slot_index,s32 animation_index,float duration). slot_index addresses parallel five-slot runtime and fighter-data arrays. The animation index is used at full argument width for immediate descriptor lookup but narrowed into s8 x11 for later use. duration goes to x4, elapsed x8 resets to0, and increment xC becomes selected AnimJoint end frame/duration or0 for zero duration. No bounds/range/sign validation occurs.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftanim.c#L1257-L1274

### ftAnim_80070FD0 / state_behavior
Compares the mapped part0x35 Euler X rotation with cached fp->x100 using exact floating-point !=. Inequality writes the sample and returns true; equality returns false unchanged. Ordinary equal finite samples suppress repeated releases; NaN compares unequal even to itself, so it can repeatedly produce true. The getter falls back to secondary JObj when primary uses quaternion rotation and asserts if both do.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftanim.c#L1370-L1378

### ftAnim_80070FD0 / game_mapping
Signals a change in the sampled part0x35 X rotation to movement-buffering callers. Central integration accumulates ordinary and knockback displacement only when x2222_b6 is set and x2222_b7 is clear, then releases it on an explicit throw flag, this predicate, or x594_b7. DeadUpFall separately uses this predicate when x2222_b6 gates its staged interpolation/displacement. This is exact rotation comparison, not a general animation-frame completion test.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftanim.c#L1370-L1378

### ftAnim_80070200 / state_behavior
Stores the configured count before asserting capacity, selects the current costume table or fallback0, resolves and stores each TObj, asserts its AObj exists, and sets rate0. Validation is incremental, not transactional; earlier list/controller writes remain before a later failure. The returned TObj is dereferenced before the AObj assertion. Valid texture controllers keep their rate0 until another rate operation changes it; requests and interpretation are separate operations.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftanim.c#L1001-L1020

### src/melee/ft/ftanim.c / game_mapping
Provides fighter pose/texture presentation for action playback, transition blending and selected body-part overrides. It also extracts root-motion position/deltas and exposes a cached pose-change predicate consumed by movement integration. Its ftAnim_8006EBA4 coordinator invokes fighter command interpretation after pose evaluation. The unit therefore interfaces with gameplay timing and movement rather than being wholly isolated from action-driven logic.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftanim.c#L1-L1378

### ftAnim_80070734 / data_flow
Consumes a caller-supplied HSD_JObj and frame, adds the constant component mask 1, and forwards all three values to HSD_JObjReqAnimByFlags. For a valid node, bit 0 routes the frame to the JObj's AObj and the same frame and mask are passed to eligible DObj and RObj attachments. The wrapper returns no value; its output is the resulting mutation of those animation controllers. The forwarded mask1 does not select DObj, MObj, PObj, TObj or RObj animation bits, so those attachment dispatches do not request/remove their controllers.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftanim.c#L1097-L1100

### ftAnim_80070758 / data_flow
Forwards the caller-supplied HSD_JObj root to HSD_JObjRemoveAnimAllByFlags with the constant mask 1. The HSD routine applies that mask to the root and descendants: selected joint AObjs are destroyed and cleared, attached DObj and RObj animation-removal paths receive the same mask, and traversal follows each child and sibling below non-instance nodes. The wrapper produces no separate output. The forwarded mask1 does not select DObj, MObj, PObj, TObj or RObj animation bits, so those attachment dispatches do not request/remove their controllers.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftanim.c#L1102-L1105

### ftAnim_8006F628 / purpose
Installs current fp->x590 Figa tracks through source-kind-to-destination-kind remapping over a depth-delimited source-index range. The depth boundary uses the current Fighter.parts array at unremapped source indices; correct source/destination hierarchy correspondence is assumed. Accepted remaps passing b1&&!b0&&!b5 receive native or specialized track decoding according to b3 on primary or secondary JObjs.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftanim.c#L638-L698

## Source-only helpers and data

scale_inline: Divides every vector component by supplied scale; no zero check. code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftanim.c#L148-L154
ftAnim_8006F0FC_inline: Broadcasts rate using0xFB7F, excluding material and texture types. code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftanim.c#L490-L494
get_part_joint: Returns secondary on nonzero bool, primary otherwise; no bounds check. code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftanim.c#L583-L592
tobjAnim: Requests frame then evaluates one TObj; dereferences TObj before null-safe AObj call. code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftanim.c#L1041-L1045
some_inline: Clears b5 along AnimJoint mapping, skipping conditional slots; no detach or pose restoration. code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftanim.c#L1285-L1302

Three type-specific30-pointer static ancestor arrays C22-24 retain stale entries outside the active cursor. Source declarations do not prove BSS byte layout. Assertion text and0/1 float uses are source consumers; emitted literal pooling/order remains unresolved.

All178 owned subjects covered:51 functions,4 sections,1 file and122 empty parameter subjects. Exact baseline fact records and70 link records, including duplicates and digests, are preserved. Header signatures do not acquire hypothesized names. No matching, source/shared-KB mutation, Git, UI or publication was performed.
