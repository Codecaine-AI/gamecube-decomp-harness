# Leadead item semantic review

## Scope and evidence
The hash-bound librarian research establishes complete canonical/rendered coverage of `itleadead.c` and `itleadead.h`, all 165 subjects, 419 baseline facts and 120 links. This lead restored the cached research artifacts and independently inspected the proposed correction and the upstream contradiction evidence. Individual shard statements about partial coverage describe their historical assignments, not a remaining TU coverage gap. Supported retained knowledge is retained unchanged; unresolved compound claims remain qualified.

The header exposes the item interface and callback declarations. The C file defines an 18-entry `ItemStateTable`, state-entry routines, counter-controlled movement, collision-box processing, lifecycle-named wrappers and fighter-associated attachment handling. State indices must not be confused with the table's animation identifiers. Source declarations and literals do not establish compiled section placement, field layout or register-parameter bindings.

## Initialization and reaction dispatch
`it_802E8BCC` initializes facing, flags and local storage, saves collision-box values, clears a fighter reference and invokes state-10 entry. Exact creation-time lifecycle registration is not inferred from a rendered name.

`it_802E8CD8` conditionally saves the recorded fighter pointer across item teardown and fighter release, resets local fields and snapshots facing. States 7 and 12 return early. Otherwise it adds a shared-helper result to `xC9C` and selects successors using ordered threshold, state, terrain-predicate and random conditions. The full-threshold/state-14 branch precedes the state-8 branch. The two fallback reaction paths call `it_802E93C8`, which requests **state 11, not state 10**. All callback returns are false; their dispatcher-level lifetime meaning is not inferred here.

## Timers, movement and state ordering
- State 1 tests `x48` before decrement. Zero invokes state-2 initialization, which can reload `x48`; every nonzero value follows the decrement path.
- State 2 initializes facing-scaled horizontal velocity and clears the other components. Its physics uses facing/proximity predicates and counters. A later opposing-nudge branch can request state 3 after an earlier state-4 request.
- State 3 begins with a counter of 140. Facing reverses when an invocation observes zero, before unconditional decrement. Its separate zero-result animation-predicate branch returns through state-2 initialization, so reversal is not guaranteed before exit.
- State 4 resets velocity on entry. Physics assigns horizontal speed at observed counter values 37–113 and overwrites it with zero above 113; the initial interval makes no velocity assignment. Collision processing can request further successors after its shared collision call.
- State 10 clears `x48`, multiplies horizontal velocity by attribute `xC`, and delegates physics using fall-speed attributes. The multiplier is not proven to attenuate velocity.
- States 11 and 12 decrement positive counters, leave negative counters unchanged, and transition only when zero is observed while grounded. Their destinations are state 1 and the state-8 initializer respectively. Shared physics subtracts fall speed only while airborne; shared collision handling has distinct airborne and other branches.

## Staged collision bounds and conditional animation calls
State 7 selects ECB adjustments using `x44`, then initializes state 8. Its terminal increment occurs after that initializer resets `x44`, leaving it at one. State 8 initializes `x48` from `xC9C * attr->x1A`, tests zero before decrement, and continues its surface-processing calls on the transition invocation. State 9 selects six counter-dependent ECB argument pairs; on a zero result from `it_80272C6C`, it writes ten to `x48` and invokes state-1 entry. Ten is a countdown value, not a destination state.

`it_802EA478` derives bounds from saved or current ECB values, changes them according to two selectors, submits the result and synchronizes collision facing. These operations do not independently identify knockdown, downed or revival animations.

States 2, 3, 5, 6, 13 and 14 use guarded calls involving `it_80272C6C`. The verified description is the zero-result guard and resulting state-update calls, not a guaranteed animation-completion/restart contract. State 5 supplies `ITEM_ANIM_UPDATE | ITEM_HIT_PRESERVE`, performs lookup with argument 1 and restores the returned joint's Z translation from local storage. The lookup implementation has dynamic-table and child-chain alternatives. State 6 reloads `x4C`, clears `x48` and requests state 1. Pickup and throw bodies request states 13 and 14; their animation callbacks conditionally request those states again.

## Collision and shared processing
Shared support processing must not be treated uniformly: `it_8026D62C` has a conditional supported-path `Item_8026ADC0` call that `it_8026D6F4` lacks. Full downstream state/lifetime effects remain deferred.

State-14 collision calls `it_8027C824(gobj, NULL)`. On its contact branch, the shared helper attempts conditional creation of another item and forwards generator notification. The creation helper initializes the new item's velocity; it is not cleanup of the input item.

States 16 and 17 directly subtract configured fall speed from vertical velocity. State 15 has an empty physics callback, which does not prove stationary motion. False or empty callbacks do not establish indefinite state lifetime or required callback slots.

Shared floor-relative velocity reconstruction clears velocity for zero facing and otherwise depends on the supplied normal. Unconditional speed preservation is not established. Orientation interpolation requires contact, can snap early and can restart when the normal changes; five is a parameter rather than a guaranteed completion count.

## Fighter predicates and floor fallback
`it_802EA674` compares item facing with a horizontal side derived from a queried fighter position. Equal X selects -1; no fighter returns zero. Nearest-fighter selection remains a delegated policy.

`it_802EA6F4` decrements any nonzero `x4C`. At zero it applies random, fighter-filter and position gates, including an attribute horizontal bound and absolute vertical separation at most five. It reports gate success rather than performing capture.

`it_802EA804` compares two floor-query outputs using angle and negative-dot differences. The first query's return is ignored. Failure of the second query falls back to existing wall flags. `it_802EA988` returns eight for left-wall flags, four for right-wall flags, with right winning when both occur. Its local position offsets do not cause collision recomputation. Thus a true floor-predicate result does not invariably establish successful forward-floor sampling.

## Creation and cross-file attachment lifetime
`it_802EA9FC` requests creation of `It_Kind_Leadead` and performs facing, animation-related and state-10 setup only when creation succeeds.

`it_802EAAEC` selects state 5, records a -12 Z offset, configures facing and stores the fighter and attachment part. Fighter CaptureLeadead initialization calls this routine. Common teardown transforms the opposite local Z offset through the stored fighter part, updates item position, clears the association, resets joint translation and restores local fields. This is not simply a copy of the attachment joint origin.

Fighter timer/mash processing calls `it_802EAE80`; damage/death interruption callbacks call `it_802EADD8`. Both tear down the association first. Their grounded destinations differ: state 6 for the former and state 1 for the latter; both alternate paths request state 10. Destruction saves the fighter pointer across teardown, calls the fighter's CaptureCut transition and then forwards shared destruction handling to the generator. Generator-side completion and all transitive lifetime effects are not inferred.

## Naming and remaining uncertainty
Rendered names are hypotheses, not independent proof. The movement, timing, ECB and capture mechanics are supported, but external ReDead identity, Underground Maze placement, biting, exact animation content and terminal/defeat labels remain deferred. `ReleaseFromFighter` collides between two routines with different grounded continuations; the reported header spawn shadowed binding also remains a followup. No source/KB writes, compiled-layout claims or register-slot facts are made.

Status: synthesized; independent review and live promotion pending.
