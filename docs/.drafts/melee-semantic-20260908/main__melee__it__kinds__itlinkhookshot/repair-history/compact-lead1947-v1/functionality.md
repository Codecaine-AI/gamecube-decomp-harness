# Disjoint Librarian Research

### shard-main__melee__it__kinds__itlinkhookshot-000
Reviewed canonical and rendered lines 1–480 of `itlinkhookshot.c`, not the complete translation unit.

This range defines a nine-entry item-state callback table and the hookshot's link construction, spawn setup, guarded cleanup, and initial visual-update machinery. Small helpers clear the stored update callback, derive item scale from owner data, free link allocations, gate rendering on `x2C_b0`, and initialize fixed collision bounds.

Link construction scales special attributes, allocates linked ItemLink/GObj pairs, initializes positions and flags, alternates ordinary joint resources, and gives the final link a distinct joint and unconditional rendering callback. It stores both chain endpoints and returns the final joint. Spawn setup accepts only four explicitly tested motion IDs, initializes a stationary spawn descriptor, builds links anchored to the resolved right-thumb joint, records the fighter association and endpoint joint, and installs that joint in fighter part slot 139. Cleanup requires valid item and associated fighter data, clears selected fighter callbacks and hookshot references, traverses the chain, and invokes item teardown.

The shared animation callback counts consecutive flagged links from the stored final endpoint and uses their fraction of the configured count to rotate and scale a descendant joint. Motion-0 physics installs an update callback that calls `it_802A6944` with fighter scale and requests removal when the motion-ID predicate fails. Four matrix helpers transform a local Z offset into a position using the stored anchor joint.

### shard-main__melee__it__kinds__itlinkhookshot-001
Reviewed canonical and rendered lines 481–960 of `itlinkhookshot.c`, not the complete translation unit.

- Motion physics callbacks 1–8 install their respective update functions in `linkhookshot.x10`. Updates obtain the owner fighter, article attributes and one of the stored link pointers, derive a position, call motion-specific helpers, and conditionally dispatch other routines.
- The motion-1 excerpt handles helper return codes, including horizontal velocity reversal/scaling and a special `motion_id == 0x168` branch that spawns two effects. Motion 2 also reverses/scales horizontal velocity for one helper result. Motion 4 chooses between two callbacks on helper completion according to `link_fighter_compare`.
- Motion 5 uses `x14` as a deferred-completion latch: a successful helper result sets it and returns; the next update calls `it_802A2B10`. Motion 6 branches on collision-check results, a link-helper result, `ground_or_air`, and newly pressed A.
- Motion 7 preserves the fighter's XY offset from the computed position while its link helper changes that position. On completion it selects between fighter callbacks, zeroing horizontal self velocity in one branch. Motion 8 similarly moves the fighter, adds that displacement to XY self velocity, copies the resulting values into `pos_delta`, and handles collision-query results, A input and a countdown tested using its pre-decrement value.
- `it_802A3C98` returns the distance between two vectors and writes their normalized difference, using a zero inverse length at zero distance. `it_802A3D90` transfers link position through collision data, updates `x2C_b1` from the collision routine's result, and returns floor/wall environment bits. The visible beginning of `it_802A3E50` selects collision history from an eligible next link and contains island-coordinate-based Y corrections.

### shard-main__melee__it__kinds__itlinkhookshot-002
Reviewed canonical and rendered lines 961–1440 only, with limited preceding collision-helper context.

- Collision helpers maintain position history, update x2C_b1 through collision calls, apply floor/wall position corrections, and return only floor/wall flags. The sound-enabled variant issues one of two audio calls on a false-to-true x2C_b1 transition, gated by x2C_b2.
- Small helpers initialize or advance collision history, integrate velocity, and conditionally add motion obtained through mpGetSpeed using x1CC.
- Three prev-linked chain passes reposition the starting link relative to an input position and constrain subsequent link separation using x30. Their differences are important: it_802A44CC applies downward acceleration, integration, and collision; it_802A4758 applies acceleration/integration and history updates without collision resolution; it_802A49B0 resolves collision without integrating velocity.
- it_802A4BFC conditionally initializes the first link under three numeric fighter-motion checks, advances it, records a contacted wall index, and walks next links to constrain or initialize their positions. Reaching the supplied position returns a collision-dependent status; exhausting the chain invokes the reverse physics pass and returns 2.
- it_802A5320 additionally applies downward acceleration and horizontal velocity reduction to the first link, integrates already-initialized next links, and selects the sound-enabled collision helper at an attribute-derived traversal index. It returns 0 or 1 when an uninitialized link reaches the supplied position, or 2 after exhausting the chain and invoking the reverse pass.

### shard-main__melee__it__kinds__itlinkhookshot-003
Reviewed canonical and rendered C lines 1441–1920, with a boundary read through the end of it_802A6DC8. This shard implements linked-chain integration, distance constraints, activation/retraction, and model transforms.

- it_802A5770 walks backward past unflagged links, subtracts x3C from vertical velocity, integrates positions, invokes per-link helpers, limits spacing using x30, and damps the final visited link's horizontal velocity using x48.
- it_802A5AE0 advances the initial link by queried map speed when permitted, then walks forward, integrating flagged links or activating additional links when the supplied position is farther than x30. Newly activated links receive matching current/previous collision positions. It returns 1 only after reaching the list end.
- it_802A5E28 and it_802A678C clear link flags while walking backward according to arg8, call it_802A44CC with min(x30, distance − arg8), and report whether a predecessor remains. it_802A5FE0 combines this pattern with preservation of a map-adjusted endpoint and forward constraints, also potentially modifying the caller's position.
- it_802A6474 preserves the map-adjusted head across a helper update. Its forward spacing corrections stop after the first flagged segment already within x30, although traversal continues; the supplied position is then constrained against the last visited link.
- it_802A6944 composes a joint matrix with a Z translation, copies it to the link object's joint, sets flag bits, and marks the matrix dirty; scl is unused.
- it_802A6A78 has three motion-ID-dependent threshold exits returning true before chain processing. Otherwise it constrains or activates forward links, maintains collision-position history, optionally calls it_802A49B0 at list end, and returns false.
- it_802A6DC8 normalizes its direction argument in place, builds an orthogonal basis with alternate reference axes near vertical, adds the supplied translation, and installs the resulting joint matrix.

### shard-main__melee__it__kinds__itlinkhookshot-004
Reviewed canonical and rendered lines 1921–2280 only.

- `it_802A6F80` normalizes a supplied direction in place, constructs perpendicular axes with a special reference-axis choice near vertical, and installs a uniformly scaled, translated joint matrix. `it_802A7168` traverses backward from the first flagged chain node, orienting joints using neighboring positions and an external endpoint. `it_802A7384` instead orients the final node along ±X according to owner facing.
- The pickup helper stores owner Y scale multiplied by item attribute scale and passes that value to a joint helper. Entry wrappers call `Item_80268E5C` with selectors 0–8 and refresh this scale. Selectors 2, 3, and 5 also call `ftColl_8007AFF8`; selector 1 first copies an input vector into the first node's velocity; selector 8 additionally copies fighter attribute `xB8` into `mv.lk.specialn.x0.y`.
- Fighter-facing callbacks conditionally delegate through the stored item reference, clear three fighter callbacks when that reference is absent, or invoke the item's optional `x10` callback. `it_802A7B34` branches on a helper result between copying an attachment-relative, Z-offset matrix and updating chain transforms. `it_802A7D40` delegates reference handling and clears `x8` when it equals the supplied object.

### shard-main__melee__it__kinds__itlinkhookshot-005
Reviewed the complete assigned header, `itlinkhookshot.h:1–108`, in canonical and rendered views. It provides declarations, not implementations: an external item-state table; item-object callbacks; an item-returning function accepting a fighter object, position vector, scalar and integer; helpers accepting ItemLink, hookshot-attribute, fighter, vector and joint pointers; and an external constant Vec4. These signatures establish the module's interface dependencies but do not establish runtime state transitions, collision algorithms, ownership or gameplay mappings. No complete translation-unit coverage is claimed.

### shard-main__melee__it__kinds__itlinkhookshot-006
The reviewed source defines nine callback-table rows, a zero vector used to initialize linked segments, and a shared attachment-offset scalar. Physics wrappers install deferred phase handlers. The state-0 handler refreshes the terminal display matrix and invokes guarded chain teardown when the owner fails a four-motion predicate. Other reviewed handlers update chain geometry, respond to collision and input, and enforce completion and timer conditions. The animation callback derives rotation and scale from the consecutive active-link fraction; its scale expression runs approximately from 1.0 to 0.35, not 0.65 to 0.35. Source-level behavior does not establish the exact contents or consumer mappings of anonymous compiled data sections.

### shard-main__melee__it__kinds__itlinkhookshot-007
Reviewed the six assigned subjects, not the entire translation unit. Motion-state physics wrappers select deferred article callbacks through linkhookshot.x10. The state-2 updater derives a joint-relative anchor, advances the segmented chain, handles wall-response and completion results, and synchronizes transforms. The state-4 updater retracts the chain and chooses state 0 or teardown according to an explicit owner-motion predicate. Pickup requests state 0 and conditionally computes owner-relative article scale. The state-0 updater copies a joint-derived model matrix before testing article lifetime; its matrix helper does not consume the supplied scale argument.

### shard-main__melee__it__kinds__itlinkhookshot-008
The five assigned physics wrappers unconditionally select state-specific functions in linkhookshot.x10; they do not themselves integrate movement. The state-5 updater processes progressive segment deactivation, records completion in x14, and calls cleanup on its next invocation. The state-6 updater orders collision checks, position processing, an owner-state check, and an A-button branch. The state-7 updater preserves owner-position offsets while processing the chain. The shared animation callback counts the active leading segment prefix and converts its fraction of attribute x2C into grandchild-joint Z rotation and X/Y scale, returning false. This review covers only the assigned subjects and supporting excerpts.

### shard-main__melee__it__kinds__itlinkhookshot-009
Reviewed the six assigned subjects. They select or clear a Hookshot updater, propagate an owner-derived scalar to article/model scale, recycle ItemLink payloads, gate segment rendering, and initialize embedded map-collision records. State 8's selected updater transfers chain displacement into fighter position and velocity and branches on obstruction, input, airborne state, and a timer. Owner-scale layout compatibility and some user-facing gameplay interpretations remain unverified; this is not complete TU coverage.

### shard-main__melee__it__kinds__itlinkhookshot-010
The six assigned functions construct the fighter-owned Hookshot and its independently managed segment chain, remove the article and fighter callbacks, and implement deferred updates for item states 1, 3, and 5. State 1 dispatches wall contact and chain completion; state 3 simulates and redraws the chain before testing the owner-motion exit; state 5 latches retraction completion and requests teardown on the next invocation. This review covers the assigned subjects, not the complete translation unit.

### shard-main__melee__it__kinds__itlinkhookshot-011
Reviewed the six assigned functions and their 33 baseline facts, not the complete translation unit. The state-6/7/8 callbacks coordinate Hookshot endpoints with fighter position, input, collision outcomes, and termination. State 7 resolves endpoint movement into ledge attachment or a scaled CliffJump2 transition; state 8 also accumulates endpoint displacement into velocity and evaluates a countdown. The geometric helper returns distance and a zero-safe normalized displacement. The collision helpers update ItemLink collision history and corrected position; the specialized helper additionally handles neighbor-dependent corrections and latched character-dependent audio.

### shard-main__melee__it__kinds__itlinkhookshot-012
Reviewed the six assigned helpers and relevant linked-article callers, not the complete translation unit. The helpers resolve segment collision, initialize or advance collision-position snapshots, integrate position by velocity, and translate a segment using its saved stage-line motion. The neighbor-floor shortcut in it_802A40D0 is significant: it returns existing collision flags after changing only the simulated Y position, bypassing collision processing and contact-state refresh.

### shard-main__melee__it__kinds__itlinkhookshot-013
Reviewed the six assigned chain-update subjects and their relevant local callers. Three backward-sweep helpers distinguish gravity plus terrain resolution, gravity plus collision-history maintenance, and terrain resolution without velocity integration. Forward deployment progressively activates segments and returns contact or exhaustion statuses. The motion-2 simulator adds gravity and horizontal damping; the motion-3 simulator traverses backward and damps the final segment. Spacing corrections are one-sided maximum-distance constraints, not rigid fixed-length constraints. This review does not claim complete TU coverage.

### shard-main__melee__it__kinds__itlinkhookshot-014
Reviewed the six assigned helpers and their local callers. They progressively activate chain links, consume links by distance during retraction, constrain chain and fighter-endpoint geometry, and synchronize the separately modeled terminal link. Retraction completion in state 5 is latched before removal on the next update. The attached-chain constraint pass stops projecting successors after the first segment already within the limit; it still clamps the endpoint. This is bounded subject coverage, not complete TU coverage.

### shard-main__melee__it__kinds__itlinkhookshot-015
Reviewed the six assigned functions and their relevant current callers. The deployment helper constrains and activates successive links, with motion-threshold early returns selecting a separate transform path. Two matrix builders convert position and direction into JObj transforms, optionally applying uniform scale. Two backward traversal routines synchronize segment models; one gives the first link a facing-dependent horizontal orientation. The state-entry wrapper selects motion 3, resets retained-fighter attack capsules, and refreshes owner-relative scale. This is bounded subject coverage, not complete TU coverage.

### shard-main__melee__it__kinds__itlinkhookshot-016
The six assigned helpers enter Hookshot states 2, 4, 5, 1, 6, and 7 with ITEM_ANIM_UPDATE and refresh owner-relative scale. States 2 and 5 also invoke the retained fighter's collision reset. State-1 entry copies a supplied velocity into the first link; its AirCatch caller computes that velocity after an obstruction check. The inspected state-4 updater returns to pickup or removes the article on completion. State-6 and state-8 update paths select state 7 on A input; state 7 moves the fighter with the updated chain endpoint. This review covers only the assigned subjects and inspected dependencies.

### shard-main__melee__it__kinds__itlinkhookshot-017
Reviewed the five assigned functions and the assigned translation-unit facts, with supporting constructor, dispatch, chain-update, rendering, and reference-cleanup code. The functions initialize state 8 and its fighter-side counter, delegate fighter-side cleanup, dispatch a nullable item updater, synchronize chain deployment and display transforms, and invalidate retained object references. The nine-row state table and delayed retraction teardown are supported. Cleanup is conditional on additional retained-fighter guards, not guaranteed merely by a non-null tracked article. This is bounded fact review, not complete TU coverage.

### shard-main__melee__it__kinds__itlinkhookshot-018
The bundle contains six parameter subjects and no baseline facts. In the inspected source, motion-0 and motion-1 physics callbacks retrieve Item data from their object argument and install deferred callbacks in linkhookshot.x10. The inspected deferred callbacks retrieve associated item, owner, and link data and dispatch updates or conditional transitions. This is a bounded review, not complete translation-unit coverage.

### shard-main__melee__it__kinds__itlinkhookshot-019
The bounded bundle assigns six parameter subjects, corresponding to the physics callbacks for UnkMotion2 through UnkMotion7. All six subjects have empty baseline fact arrays, so there are no baseline facts to retain, change, reject, or mark unresolved. No new semantic claims are proposed.

### shard-main__melee__it__kinds__itlinkhookshot-020
The bundle assigns six parameter subjects, all with empty baseline fact arrays; there are no baseline fact IDs to disposition. In the inspected canonical helpers, the object argument supplies item data for clearing linkhookshot.x10 or deriving scale from the owner; the allocation callback passes its argument to HSD_ObjFree; the rendering callback reads ItemLink user data and conditionally forwards its object to HSD_GObj_JObjCallback. These observations do not establish compiled-register parameter identities.

### shard-main__melee__it__kinds__itlinkhookshot-021
The assigned subjects concern parameters of three functions. `it_802A24A0` conditionally forwards its object and integer argument to the joint callback when the link's `x2C_b0` is set. `it_802A24D0` initializes a link's collision positions and supplies its floating-point argument to all four fixed-ECB dimensions. `it_802A2568` constructs linked objects using item attributes, stores the supplied joint in each link, uses an integer selector in attribute calculations, and records the first and last links on the item. All six assigned subjects have empty baseline fact lists; there are no baseline fact IDs to disposition. This review does not claim full translation-unit coverage.

### shard-main__melee__it__kinds__itlinkhookshot-022
The assigned subjects have no baseline facts. Their enclosing functions construct and initialize a linked collection of ItemLink objects, conditionally clear fighter callbacks and remove those objects, and populate an item-spawn request from a fighter, position, facing direction, and kind. This review covers those bodies, not the complete translation unit.

### shard-main__melee__it__kinds__itlinkhookshot-023
The six assigned parameter subjects belong to item-update callbacks. Each canonical function accepts an Item_GObj pointer and obtains item state, chain links, attributes, and the owning fighter through it. Their bodies coordinate link-update helpers and conditional transitions; the later callbacks also adjust the owner's position or velocity. All six subjects have empty baseline fact lists, so there are no fact IDs to retain, correct, or reject. This review covers only the bounded subjects, not the complete translation unit.

### shard-main__melee__it__kinds__itlinkhookshot-024
The six assigned parameter subjects have no baseline facts to assess. Their containing functions compute a normalized vector difference and its original length (`it_802A3C98`), update an ItemLink's collision history and position (`it_802A3D90`), and perform neighbor-sensitive collision adjustment with a FighterKind-dependent, latched audio call (`it_802A3E50`). This review covers only the bounded subjects, not the complete translation unit.

### shard-main__melee__it__kinds__itlinkhookshot-025
The assigned parameters belong to link-collision helpers. it_802A3E50 and it_802A40D0 update collision history, resolve collision state and position, and return floor/wall flags; their floating-point argument supplies a conditional vertical adjustment. it_802A3E50 additionally gates a sound on a newly established collision state. it_802A42F4 replaces the previous collision position's Y coordinate with its floating-point argument before collision processing. it_802A43B8 initializes both collision positions from the link position. All six assigned subjects have empty baseline fact lists.

### shard-main__melee__it__kinds__itlinkhookshot-026
The assigned subjects have no baseline facts. The reviewed function bodies operate on ItemLink objects: it_802A43EC advances collision-position history; it_802A4420 adds velocity to position; it_802A4454 conditionally adds a displacement returned by mpGetSpeed. it_802A44CC positions the initial link relative to an input vector, then traverses prev links, subtracting an attribute from vertical velocity, integrating positions, invoking a collision helper, and limiting inter-link distance using another attribute. This review covers only the bounded subjects, not the complete translation unit.

### shard-main__melee__it__kinds__itlinkhookshot-027
The assigned subjects contain no baseline facts. The three associated functions reposition an initial ItemLink relative to a supplied vector and scalar, then traverse prev links and constrain their separation using attributes->x30. it_802A44CC also updates velocity and position and invokes collision handling; it_802A4758 updates velocity, position, and collision-position history; it_802A49B0 invokes collision handling without integrating velocity in its loop. Register-labelled parameter identities are not established by these C bodies.

### shard-main__melee__it__kinds__itlinkhookshot-028
The assigned subjects have no baseline facts. The reviewed bodies operate on linked ItemLink positions: it_802A49B0 places its starting link relative to a supplied vector and scalar, then traverses prev links and limits spacing using attributes. it_802A4BFC advances the starting link, records wall collision indices, traverses next links while constraining or initializing positions relative to a supplied vector, updates collision-position history, and returns collision-dependent status values. Register-labelled parameter identities were not equated with source parameters without compiled binding evidence.

### shard-main__melee__it__kinds__itlinkhookshot-029
The six assigned parameter subjects contain no baseline facts. The reviewed functions update linked segment positions and constrain spacing using an anchor vector and hookshot attributes. it_802A4BFC additionally reads fighter motion and attribute values before advancing the chain; it_802A5320 traverses next links, applies downward acceleration and horizontal damping, and passes fighter kind to a selected collision-helper call. it_802A5770 traverses prev links, constrains the chain relative to the anchor, and damps the final processed link's horizontal velocity. No gameplay interpretation of numeric motion identifiers or compiled register-to-parameter mapping is asserted.

### shard-main__melee__it__kinds__itlinkhookshot-030
The six assigned parameter subjects contain no baseline facts. The reviewed bodies update linked positions using velocity and attribute-controlled spacing. `it_802A5770` walks backward through links, uses a supplied anchor, passes fighter kind to a helper, and damps the final link's horizontal velocity. `it_802A5AE0` conditionally adjusts the initial position using `mpGetSpeed`, walks forward, and activates additional links when its distance test exceeds the configured spacing. No gameplay interpretation or compiled register-to-parameter mapping is proposed.

### shard-main__melee__it__kinds__itlinkhookshot-031
The six assigned parameter subjects contain no baseline facts. The current body of `it_802A5E28` walks backward through links, clears link flags while a scalar exceeds the computed distance, and passes a capped distance adjustment to `it_802A44CC`. `it_802A5FE0` additionally updates and preserves a second link's position, constrains successive flagged links and the supplied position using attribute `x30`, and returns whether no flagged successor was traversed. These observations do not establish compiled register-to-parameter identities.

### shard-main__melee__it__kinds__itlinkhookshot-032
The assigned subjects have no baseline facts to disposition. Their containing routines traverse linked ItemLink records, preserve a selected link position across helper updates, and constrain link and supplied vector positions using the attributes' x30 value. it_802A5FE0 additionally clears link flags according to a distance threshold and returns whether its forward traversal visited no flagged successor links. This review covers only the assigned subjects, not the entire translation unit.

### shard-main__melee__it__kinds__itlinkhookshot-033
The six assigned parameter subjects contain no baseline facts. Their current parent bodies implement chain-position constraints using an attributes pointer (`it_802A6474`), backward link traversal and flag clearing with a scalar distance adjustment (`it_802A678C`), and copying a link joint's matrix with a local Z translation into its model joint (`it_802A6944`). No parameter-register mappings or new facts are proposed.

### shard-main__melee__it__kinds__itlinkhookshot-034
The six assigned parameter subjects contain no baseline facts. Their current functions update a linked object's matrix, constrain or activate successive chain links using a position and attribute distance, and build a joint matrix from a position and direction. No parameter-register mapping or gameplay interpretation is proposed.

### shard-main__melee__it__kinds__itlinkhookshot-035
The two inspected functions construct joint transforms from a position and a direction. Both normalize the supplied direction in place, construct perpendicular basis vectors with a special reference-axis choice near vertical directions, copy the resulting matrix to the joint, set flag bits, and mark the matrix dirty. it_802A6F80 additionally applies a uniform scale. All six assigned parameter subjects have empty baseline fact lists; there are no baseline facts to disposition. Register-key identities are not equated with source argument positions without compiled-location evidence.

### shard-main__melee__it__kinds__itlinkhookshot-036
The two assigned functions traverse the item's link chain backward after skipping links whose x2C_b0 flag is unset. They update joint translations from link positions and derive orientation vectors from neighboring positions, using the supplied Vec3 when the next link is absent or its flag is unset. it_802A7384 handles the final link separately with an X-axis direction selected by owner facing. Both pass the floating-point argument to the matrix helper. All six assigned parameter subjects have empty baseline fact lists.

### shard-main__melee__it__kinds__itlinkhookshot-037
The assigned parameter subjects belong to five item-object routines. Their first source argument supplies the item object to Item_80268E5C with respective numeric arguments 3, 2, 4, 5, and 1, followed by a shared helper that derives item scale from owner scale and item attributes. Three routines additionally pass the stored linkhookshot.x8 reference to ftColl_8007AFF8. In it_802A78B8, the second source argument is a Vec3 pointer whose value is copied into the first ItemLink's velocity before the subsequent calls. No gameplay meanings are assigned to the numeric values.

### shard-main__melee__it__kinds__itlinkhookshot-038
The six assigned parameter subjects have no baseline facts. Their current function bodies distinguish two argument roles: it_802A793C, it_802A79A0 and it_802A7A04 pass the object to item-state/update helpers (with numeric arguments 6, 7 and 8); it_802A7A04 also obtains the item's owner and copies an owner attribute into owner state. it_802A7AAC, it_802A7AF0 and it_802A7B34 interpret the object as a fighter, inspect its stored item reference, and respectively dispatch cleanup, invoke an optional item callback, or dispatch transform-related updates. No gameplay meaning is assigned to the numeric states.

### shard-main__melee__it__kinds__itlinkhookshot-039
The assigned subjects are the two parameters of `it_802A7D40`. Its first argument supplies the Item being accessed; both arguments are forwarded to `it_8026B894`. If the Item's `linkhookshot.x8` reference equals the second argument, that reference is cleared. Both assigned subjects have empty baseline fact lists, so there are no fact dispositions to record.

### shard-main__melee__it__kinds__itlinkhookshot-040
The reviewed Hookshot routines initialize linked segments, select deferred per-state updates, process chain and owner-dependent transitions, and synchronize article scale. Shared segment helpers advance position and update collision history in yo-yo and Samus grapple constraint passes. This review assesses only the twelve assigned links, not complete TU coverage.

### shard-main__melee__it__kinds__itlinkhookshot-041
The reviewed relationships cover Hookshot chain integration, collision geometry, owner-coupled updates, motion transitions, and fighter-side cleanup. Shared segment helpers also participate directly in Ness yo-yo string deployment and Samus grapple simulation. This review assesses only the twelve assigned links, not the entire translation unit.

### shard-main__melee__it__kinds__itlinkhookshot-042
Reviewed the 12 assigned links against current canonical source. The bounded evidence supports Hookshot callback selection, segment simulation and retraction, collision/contact audio, progress-driven model transforms, owner synchronization, and retained-reference cleanup. The shared position integrator is also called by the Climbers string simulation; its specific Belay gameplay mapping remains deferred.

### shard-main__melee__it__kinds__itlinkhookshot-043
The reviewed Hookshot routines install fighter-driven item update callbacks, update chain geometry and model transforms, select item motion states, and clear invalidated fighter references. A shared segment helper advances collision-position history and is also called by Sheik's chain simulation. The grapple callback checks collision, maintains chain transforms, and branches on owner state and A-button input. This review covers only the assigned links, not the entire translation unit.

### shard-main__melee__it__kinds__itlinkhookshot-044
Reviewed the twelve assigned links. Current source supports Hookshot segment rendering, progressive chain activation, fighter-driven updates, AirCatch deployment and cleanup, and shared segment collision/integration helpers used by the yo-yo and Sheik chain. The attached-chain solver constrains the endpoint used to update fighter position. Compiled .data identity and the specific wall-grapple mapping remain deferred; this is not complete TU coverage.

### shard-main__melee__it__kinds__itlinkhookshot-045
The reviewed links cover the Link-family tether factory, segmented-chain collision and motion updates, wall-contact transition into AirCatchHit, retraction and teardown, and fighter-side callback dispatch. The collision-history helper is also used by the Ness yo-yo string simulation. This assessment covers only the twelve assigned links, not the complete translation unit.

### shard-main__melee__it__kinds__itlinkhookshot-046
The reviewed routines initialize and remove linked article segments, derive item scale from the owner, enter table-selected item states, install deferred update callbacks, and constrain chain positions while tracking endpoint motion. A shared collision-history initializer is called when Sheik-chain segments become active. This review covers only the assigned links, not the entire translation unit.

### shard-main__melee__it__kinds__itlinkhookshot-047
Reviewed the assigned links against current canonical source. The examined Hookshot paths select deferred physics updaters, retract and progressively activate chain segments, constrain the attached fighter's position, resolve segment terrain contact and impact audio, build segment transforms, and request item-state transitions. This is bounded link review, not complete translation-unit coverage.

### shard-main__melee__it__kinds__itlinkhookshot-048
The reviewed Hookshot routines install per-instance simulation callbacks, enter item states, retract segmented chains, update joint transforms, and maintain a collision-tested attachment that moves the owner and responds to input or timeout. This review assesses only the twelve assigned links, not complete TU coverage.

### shard-main__melee__it__kinds__itlinkhookshot-049
The reviewed links concern Hookshot chain rendering, deferred updates, segment physics, attachment maintenance, and item-state transitions. Samus Grapple code also directly uses the shared rendering and stage-motion helpers. This assessment covers only the twelve assigned links, not the complete translation unit.

### shard-main__melee__it__kinds__itlinkhookshot-050
The reviewed functions construct and attach a fighter-owned segmented article, synchronize its model scale with its owner, select chain-update callbacks, process segment terrain collision, and complete chain cleanup. Gameplay-specific aerial-grab and wall-grapple mappings, compiled section attribution, and the common state-table dispatch implementation remain unverified in this bounded review.

### shard-main__melee__it__kinds__itlinkhookshot-051
The reviewed routines configure an ItemLink's fixed ECB and enter hookshot item state 3. The latter calls a fighter-collision helper and reapplies owner-derived scale; a chain-update callback invokes it on result 2. This review covers only the two assigned links, not the entire translation unit.

Status: researched; no-change lead bypass; independent review and live promotion pending.
