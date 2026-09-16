# Disjoint Librarian Research

### shard-main__melee__it__kinds__itsamusgrapple-000
Reviewed canonical and rendered `src/melee/it/kinds/itsamusgrapple.c` lines 1–480 only.

- Defines nine item-state entries with physics callbacks, a constant hitbox initializer, and helpers for link initialization, joint animation/position extraction, randomized vertical values, and a four-step numeric input-mask sequence.
- `it_802B7160` configures a fighter-owned hit capsule from supplied hitbox data: conditionally enables/reinitializes its group, selects its bone, applies damage and angle through helpers, scales size and offsets, and copies collision properties and flags.
- `it_802B743C` selects among three link-model/animation resource sets; the tail helper uses a separate resource set. Both register a drawing callback and request animation frame zero.
- `it_802B75FC` derives scaled attributes and a link count, optionally doubles that count, allocates a doubly linked sequence of link objects, initializes collision data and models, stores both endpoints, and returns the tail model. GObj creation failure takes a cleanup path and returns NULL.
- `it_802B7B84` conditionally clears associated fighter callbacks/state, releases link objects, and invokes item removal, guarded by item and associated-fighter availability.
- The reviewed prefix of `it_802B7C18` rejects motion IDs outside four literal values and prepares an owner-associated `It_Kind_Samus_GBeam` spawn with supplied position/facing and zero velocity/damage. Its remaining initialization lies outside this shard.

### shard-main__melee__it__kinds__itsamusgrapple-001
Reviewed canonical and rendered lines 481–960 of `itsamusgrapple.c`, not the complete translation unit.

- The initialization tail selects an item flag from owner state, requests link creation, installs optional animations, and stores owner/link-joint references.
- Motion physics wrappers 0–7 install distinct update callbacks in `unk_10`. Updates synchronize joint matrices and animation, dispatch link-processing helpers, and branch on owner state or helper results. Two callbacks reflect link velocity using a normalized floor normal and attribute-based scaling.
- One callback supplies `x4C` as its link-processing speed on the ground and twice that value otherwise. Another sets `x14` on helper completion and calls `it_802B7B84` on its next invocation.
- Later callbacks test collision, airborne status, and input masks. `fn_802B8B54` preserves the owner's XY offset from a helper-updated position. `fn_802B8D38` additionally adds the resulting displacement to self velocity and writes that result to position delta; it also conditionally increments, then tests and decrements, a grapple counter.

### shard-main__melee__it__kinds__itsamusgrapple-002
Reviewed canonical and rendered itsamusgrapple.c lines 961–1440 only. This range implements linked-chain positioning, progressive activation, and retraction. it_802B900C and it_802B91C4 position one link relative to an anchor, then traverse previous links and enforce spacing bounds x3C/x38; their vertical-velocity adjustments differ. it_802B9328 conditionally initializes a link from its joint matrix, optionally directs its velocity toward a returned fighter, classifies collision-helper results, and activates subsequent links as anchor separation grows. it_802B99A0 uses similar forward activation with vertical-velocity adjustment and horizontal damping. Both return 3 after traversing the entire chain and applying a reverse constraint pass. it_802B9CE8 traverses backward from an active link, constrains spacing, and damps the final visited link's horizontal velocity. it_802B9FD4 performs forward activation with an upper spacing limit and reports whether traversal reached the end. it_802BA194 clears link activity during retraction, constrains the remaining chain, and blends horizontal velocities toward recorded position differences; it_802BA2D8 delegates chain selection to Item_RetractChain before constraining it.

### shard-main__melee__it__kinds__itsamusgrapple-003
Reviewed canonical and rendered lines 1441–1748 only, with the preceding function signature read for context.

- `it_802BA3BC` walks backward over unflagged links, preserves the head position around helper calls, clears link flags according to `target_dist`, and attempts to limit forward-link and endpoint spacing using `attrs->x38`. It returns true when no flagged forward links were counted. Its x-coordinate update contains an uninitialized-pointer read, so the intended constraint calculation cannot be treated as reliable execution behavior.
- `it_802BA5DC` similarly preserves the head position and adjusts the flagged chain. Forward adjustments stop after the first link already within the spacing threshold, although traversal continues; the endpoint is checked separately.
- `it_802BA760` returns true without updating links under three motion-specific attribute thresholds. Otherwise it traverses links, limits flagged-link spacing, activates unflagged links when the endpoint is beyond the threshold, and returns false. `it_802BACC4` uses that result to select between two helper paths.
- The small item entry routines call `Item_80268E5C` with values 0–8 and `ITEM_ANIM_UPDATE`, then call `it_802A2428`. Entries 2, 3 and 5 additionally call `ftColl_8007AFF8` on the stored object reference. Entry 1 copies an input velocity into the first link; entry 8 writes an integer-converted attribute value to the owner's `mv.ss.grapple.x4`.
- Fighter wrappers dispatch to the stored item's callback, invoke an item helper when the reference exists, or clear three fighter callbacks when it does not. The final event handler calls a reference helper and clears the stored `x8` reference if it equals the supplied object.

### shard-main__melee__it__kinds__itsamusgrapple-004
Reviewed the complete assigned header, `itsamusgrapple.h:1–101`, in canonical and rendered form. It defines a hitbox aggregate containing five spawn-hitbox component structures and a wrapper containing that aggregate plus sixteen one-bit fields. The declared interface connects fighter objects, item objects, joints, vectors, item links, and grapple attributes. It includes nine numbered physics callback declarations, link-oriented helper signatures with void/integer/boolean returns, fighter-facing entry points, and an external ItemStateTable array. The header establishes types and interface shape, not implementation behavior or gameplay meanings.

### shard-main__melee__it__kinds__itsamusgrapple-005
Reviewed the six assigned subjects, not the complete translation unit. The nine-entry table selects physics wrappers that install deferred item updaters. State 0 tracks an ordered fighter-input sequence, synchronizes and animates the segmented model, and requests removal outside four accepted motion IDs. State 1 processes endpoint simulation results, including wall attachment with an AirCatchHit transition, rebound responses, and full-chain deployment. Immutable source constants supply a packed fighter-hitbox template and zero-initialized link motion data. Compiled section extents and literal-pool membership remain unverified.

### shard-main__melee__it__kinds__itsamusgrapple-006
Reviewed the six assigned deferred item callbacks for states 2–7 and their supporting dispatch and chain operations. They update linked geometry, respond to collision/helper results, select subsequent item states, retract the chain, and synchronize animation. State 5 latches completion before cleanup on the next invocation. State 7 preserves the owner's endpoint offset and resolves through ledge-related fighter routines. Gameplay labels and several broader baseline interpretations remain explicitly deferred; this is not complete TU coverage.

### shard-main__melee__it__kinds__itsamusgrapple-007
The assigned callbacks initialize, select, and consume a deferred article updater. Spawn clears the updater; motion states 0 and 1 install their respective handlers; pickup requests state 0; the reference event clears a matching stored object. The state-8 updater couples owner position to a simulated link position, updates velocity and presentation, and branches on collision, ground status, input, and timer expiry. This review covers only the six assigned subjects.

### shard-main__melee__it__kinds__itsamusgrapple-008
The six assigned physics callbacks are unconditional selectors, not movement integrators: item states 2–7 store fn_802B8384, fn_802B8524, fn_802B8684, fn_802B8814, fn_802B895C, and fn_802B8B54 respectively in samusgrapple.unk_10. The fighter-side bridge invokes that slot on its tracked article. Selected workers perform link updates, animation, completion handling, owner-position synchronization, and conditional transitions. This review covers the assigned subjects and supporting excerpts, not the complete translation unit.

### shard-main__melee__it__kinds__itsamusgrapple-009
Reviewed the six assigned subjects, not the complete translation unit. They configure fighter hit capsules, install three repeating segment models, construct and publish a doubly linked beam chain, spawn and attach the parent article, tear down its links and fighter associations, and select the deferred handler for item state 8. The fighter accessory callback dispatches the selected handler. Samus's AirCatch controller directly creates and removes this article. Geometry decoding uses multiplication by 0.003906f, not quarter-unit scaling.

### shard-main__melee__it__kinds__itsamusgrapple-010
Reviewed the six assigned chain-update helpers and their relevant callers, not the complete translation unit. Two helpers place a selected endpoint and constrain predecessor spacing; one uses randomized vertical-velocity adjustments and the other subtracts an attribute value. Two forward-extension workers activate additional links and return contact or chain-exhaustion status. A backward update supports motion state 3, while a maximum-length-only forward pass supports motion state 6. Callers own article transitions and visual synchronization. Important distinctions are that randomized vertical adjustments are not uniformly downward, successor collision-history synchronization is not stage-collision testing, and the motion-state-6 helper receives x0 rather than the caller's x4 attachment link.

### shard-main__melee__it__kinds__itsamusgrapple-011
Reviewed the six assigned helpers and their immediate callers, not the entire translation unit. The helpers retract and reposition linked segments, smooth horizontal velocity during one retraction path, constrain a fighter-coupled endpoint, deploy additional links subject to fighter-state thresholds, and enter item state 3. Important qualifications are the slack latch in it_802BA5DC, the uninitialized direction-pointer read in it_802BA3BC, and two colliding inferred retraction names. Gameplay-specific mappings and compiled behavior affected by the pointer anomaly remain deferred.

### shard-main__melee__it__kinds__itsamusgrapple-012
Reviewed the six assigned article state-entry helpers and their relevant update paths. They select states 2, 4, 5, 1, 6, and 7 with ITEM_ANIM_UPDATE and invoke the shared scale helper. States 2 and 5 additionally forward the retained owner to ftColl_8007AFF8; state 1 copies the supplied velocity into the first link. Samus's AirCatch controller directly supplies the deployment and withdrawal timing. The observed workers implement rebound handling, link withdrawal, extension completion, and input-triggered owner-position updates. This is bounded subject coverage, not complete TU coverage.

### shard-main__melee__it__kinds__itsamusgrapple-013
Reviewed the assigned baseline subjects, not the entire TU. The transition helper selects item state 8 and seeds a fighter-side duration counter. Fighter-facing callbacks delegate teardown, dispatch the optional item handler, and update the segmented chain or its display transform. The chain logic activates and constrains links; deferred handlers synchronize fighter movement, respond to collision and input, and remove the article.

### shard-main__melee__it__kinds__itsamusgrapple-014
The six assigned parameter subjects correspond to callbacks whose canonical source declares a single `Item_GObj* gobj` argument. Each callback obtains item data from that argument, accesses its owner and grapple links, and performs link updates, animation, or conditional transitions. Motion callbacks 1–6 install these functions into the item's `unk_10` callback field. All six subjects have empty baseline fact lists, so there are no fact IDs to disposition.

### shard-main__melee__it__kinds__itsamusgrapple-015
The bundle contains six parameter subjects, all with empty baseline fact lists; there are no baseline fact IDs to disposition. In the inspected canonical callbacks, Spawned clears the item's `unk_10` callback field, PickedUp passes its item object to two helpers, and EvtUnk forwards both objects to a helper and clears `x8` when it matches the second object. This is a bounded review, not complete translation-unit coverage.

### shard-main__melee__it__kinds__itsamusgrapple-016
The bounded bundle assigns six parameter subjects for the motion-0 through motion-5 physics callbacks. All six have empty baseline fact lists, so there are no fact IDs to retain, change, reject, or defer. Canonical source registers these six callbacks in successive entries of the item state table; no parameter semantics or gameplay mappings are proposed.

### shard-main__melee__it__kinds__itsamusgrapple-017
The assigned subjects have no baseline facts to disposition. The three physics callbacks receive an Item_GObj pointer and install distinct deferred update callbacks in its item state. it_802B7160 receives a fighter object and hitbox data, selects and conditionally enables a fighter hitbox, and populates its properties from that data. it_802B743C receives the destination object for a selected joint model, rendering callback, and child animations. This review is limited to the assigned parameter subjects, not complete TU coverage.

### shard-main__melee__it__kinds__itsamusgrapple-018
The assigned subjects have no baseline facts to disposition. In the reviewed bodies, it_802B743C takes item attributes and a selector to install one of three joint/animation configurations. it_802B75FC derives scaled attributes and a link count, allocates and initializes a doubly linked chain, stores its endpoints in the item, and returns the tail model joint. This review does not establish register-to-parameter mappings or complete translation-unit coverage.

### shard-main__melee__it__kinds__itsamusgrapple-019
The assigned subjects have no baseline facts. Their containing functions perform guarded grapple cleanup (`it_802B7B84`), conditional item creation from a fighter owner, position and facing direction (`it_802B7C18`), and link-chain position adjustment relative to a supplied position (`it_802B900C`). The latter updates the starting link, traverses `prev` links, and constrains their separation using attribute bounds. This review covers only this bounded subject shard.

### shard-main__melee__it__kinds__itsamusgrapple-020
The two reviewed functions reposition a supplied link relative to a position and distance, then walk previous links and constrain their spacing using attribute bounds. it_802B900C adjusts vertical velocity with a randomized helper; it_802B91C4 subtracts attrs->x44. Their source signatures each contain three pointers and one floating-point distance. All six assigned parameter subjects have empty baseline fact lists; there are no baseline facts to disposition. Register-labeled identities are not equated with source argument ordinals.

### shard-main__melee__it__kinds__itsamusgrapple-021
The six assigned parameter subjects contain no baseline facts. The current definitions of it_802B9328 and it_802B99A0 both accept an ItemLink pointer, a position pointer, grapple attributes, and a Fighter pointer. Both traverse subsequent links, constrain spacing using attribute fields, activate additional links when needed, and return numeric status values. it_802B9328 additionally uses fighter state and input to condition attachment and velocity updates; it_802B99A0 reduces horizontal velocity toward zero. This review covers these bodies, not the entire translation unit.

### shard-main__melee__it__kinds__itsamusgrapple-022
The assigned subjects have no baseline facts. Their containing functions update a linked grapple chain: `it_802B99A0` traverses forward, adjusts velocities, constrains segment spacing, activates additional links, and returns a status; `it_802B9CE8` traverses backward, constrains positions relative to the supplied position and neighboring links, and damps horizontal velocity. Both use fighter state and input to conditionally invoke hitbox setup. Source-level parameters are link, position, attributes, and fighter pointers; register-labelled subject mappings remain unverified.

### shard-main__melee__it__kinds__itsamusgrapple-023
The six assigned parameter subjects have no baseline facts. In the current source, both functions take `ItemLink* link`, `Vec3* pos`, and `itSamusGrappleAttributes* attrs` as their first three parameters. `it_802B9FD4` traverses next links, constrains positions using `attrs->x38`, and conditionally activates links against the supplied position. `it_802BA194` traverses previous links, clears activation flags according to a target distance, delegates position constraints, and adjusts x/z velocities toward collision-position deltas. This review does not establish compiled register-to-parameter mappings or complete TU coverage.

### shard-main__melee__it__kinds__itsamusgrapple-024
The assigned subjects have no baseline facts. Their enclosing routines manipulate linked-chain positions and activation flags during distance-based shortening. it_802BA194 additionally adjusts horizontal velocities toward collision-position deltas; it_802BA2D8 delegates shortening to Item_RetractChain before applying constraints. it_802BA3BC preserves the head position while processing the chain and constraining the supplied position. These observations do not establish register-level parameter identities or gameplay-state names.

### shard-main__melee__it__kinds__itsamusgrapple-025
The assigned subjects have no baseline facts. Their two containing functions traverse linked ItemLink chains, preserve the initial head position across a helper call, and adjust chain and supplied endpoint positions using attrs->x38. it_802BA3BC additionally clears link flags according to target_dist and returns whether its forward traversal counted zero flagged links. it_802BA5DC stops adjusting intermediate positions after encountering a sufficiently close link, while continuing traversal and checking the endpoint.

### shard-main__melee__it__kinds__itsamusgrapple-026
The six assigned parameter subjects contain no baseline facts. In the canonical bodies, `it_802BA5DC` uses a mutable position vector and attributes to constrain linked positions while preserving the initial head position. `it_802BA760` accepts a starting link, position vector, attributes, and fighter; fighter fields can cause an early true return, otherwise it traverses subsequent links, adjusts positions using `attrs->x38`, activates links as needed, and returns false. This review is limited to the assigned subjects.

### shard-main__melee__it__kinds__itsamusgrapple-027
The five assigned functions take an Item_GObj pointer and pass it to Item_80268E5C with respective numeric arguments 3, 2, 4, 5, and 1, followed by it_802A2428. Three also pass the item's samusgrapple.x8 field to ftColl_8007AFF8. it_802BAAE4 additionally takes a Vec3 pointer and copies its value into the velocity of the link referenced by samusgrapple.x0. All six assigned parameter subjects have empty baseline fact lists; there are no baseline facts to disposition.

### shard-main__melee__it__kinds__itsamusgrapple-028
The six assigned parameter subjects have no baseline facts to assess. Their current function definitions take `Item_GObj* gobj` for it_802BAB40, it_802BAB7C, and it_802BABB8, and `Fighter_GObj* gobj` for it_802BAC3C, it_802BAC80, and it_802BACC4. The first three forward the item object to common helpers with numeric selectors 6, 7, and 8; the third also copies an owner attribute through signed-integer and float casts into `fp->mv.ss.grapple.x4`. The fighter-side functions respectively delegate through the stored item or clear callbacks, invoke an optional item callback, and conditionally process the stored item's links. This review is limited to the assigned subjects, not the entire translation unit.

### shard-main__melee__it__kinds__itsamusgrapple-029
The reviewed links concern the Grapple Beam's callback dispatch, pickup initialization, outward chain movement, wall-contact transitions, endpoint-coupled fighter movement, and timed attachment. Current source supports the wall-contact and article-subsystem relationships. The exact extended-grapple mapping, external community attribution, and compiled `.data` identity remain deferred. This review covers only the assigned links, not the entire translation unit.

### shard-main__melee__it__kinds__itsamusgrapple-030
The reviewed links cover Grapple Beam article deployment, animation setup, chain contraction, owner-position synchronization, and removal from AirCatch. Current source supports these article-level relationships. The compiled .rodata identity and the precise wall-grapple gameplay interpretation remain deferred; this review does not claim complete TU coverage.

### shard-main__melee__it__kinds__itsamusgrapple-031
The reviewed routines construct and remove a fighter-owned segmented Grapple Beam article, install deferred update callbacks, handle collision-dependent state transitions, animate links, and update the owner's position and duration counter. This review covers the assigned links, not the entire translation unit.

### shard-main__melee__it__kinds__itsamusgrapple-032
The reviewed links connect the Grapple Beam article's callback initialization, animation synchronization, segmented-chain updates, constraints, and state transitions to its implementation. AirCatch explicitly invokes deployment and withdrawal transitions at attribute-controlled thresholds. Chain constraints also feed corrected positions back into the owning fighter. This review covers only the twelve assigned links, not the entire translation unit.

### shard-main__melee__it__kinds__itsamusgrapple-033
The reviewed links concern Samus's segmented Grapple Beam article: creation from AirCatch, fighter-driven update dispatch, segment animation and constraints, contact-state transitions, and attached-beam contraction that moves the owner. This assessment covers only the twelve assigned links, not the complete translation unit.

### shard-main__melee__it__kinds__itsamusgrapple-034
The reviewed functions implement components of the Samus Grapple Beam article: callback selection, chain updates and retraction, endpoint constraints that feed owner movement, and fighter-side dispatch and teardown. Article creation explicitly selects It_Kind_Samus_GBeam and connects its linked objects to the owner. This review assesses only the twelve assigned implementation links, not the entire translation unit.

### shard-main__melee__it__kinds__itsamusgrapple-035
Reviewed the twelve assigned concept links against current source. The examined code implements the Samus beam article's callback selection, fighter hitbox configuration, segmented geometry, wall-contact processing, contraction with owner-position updates, and AirCatch cleanup. This is bounded link review, not complete TU coverage.

### shard-main__melee__it__kinds__itsamusgrapple-036
The reviewed links connect Samus's Grapple Beam article to its creation, segmented-chain simulation and retraction, aerial-grab deployment/withdrawal, and wall-contact attachment. Current callers confirm the aerial-grab integration; wall collision results feed the AirCatchHit and article-state-6 transitions. This review covers only the assigned links, not the complete translation unit.

### shard-main__melee__it__kinds__itsamusgrapple-037
The reviewed routines construct animated linked models, install and transition item update states, supply link velocity, and maintain fighter references for the grapple article. The reviewed contact-related update moves the owner with the chain and conditionally calls cliff-common handling. This review assesses only the nine assigned links, not the entire translation unit.

Status: researched; no-change lead bypass; independent review and live promotion pending.
