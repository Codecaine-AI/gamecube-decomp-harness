# Mushroom Kingdom Ground subsystem

The unit publishes the Inishie1 stage descriptor, four indexed Ground callback rows, seven joint mappings, and the nineteen-block mapping. Initialization caches Yakumono parameters before setting up Ground objects 0 and 3, initializes camera and blast-zone ranges, and sets clipping distances to 1 and 4000. The start hook attempts shared Zako-manager creation with a NULL descriptor; it returns normally and ignores construction failure.

Object 3 coordinates the block controller, paired Scale Lift, one-shot music check, shared library hook, and collision refresh. The remaining callback slots include deliberately empty functions and constant predicates. Descriptor-level touch-line queries return no DynamicsDesc; shadow-render eligibility always returns true.

## Blocks and temporary question-block objects

Each of nineteen allocated records starts with lifecycle `x2 = 2` and separate special `status = 0`. Match-rule guards can select two distinct initial question blocks with statuses 1 and 2. Two recurrence channels subsequently select status-zero entries, excluding each channel's previous selection, with a twenty-attempt assertion limit. A separate timing condition assigns status 3 to all nineteen entries. Consuming the last status-3 entry restarts both ordinary channels; every status-3 consumption resets the rare-event cooldown.

Lifecycle states remain distinct from special statuses: 0 waits through disappearance and clearance checking; 1 flickers; 2 decrements a lockout; 3 initiates consumption and falls through to rebound state 4. Rebound uses ±1.2 increments, reverses above five units, and restores state 2 with a ten-update lockout after crossing below zero. This unit handles state 3 but does not visibly assign it, so its entry path and player-visible rebound significance remain uncertain.

Temporary row-2 Hatena objects retain a borrowed base-block JObj, follow its world origin, and blink only while their control field is zero and countdown positive. Creation hides the base DObjs; cleanup restores those DObjs, invokes common Ground teardown, and clears the owning pointer. Common teardown tolerates NULL and clears a map-registry slot only when it still identifies the object being destroyed.

The collision callback resolves the block before testing `abs(delta_y) > 0.7`; an unknown joint reports and loops forever. The proxy callback instead ignores an unmatched source JObj. Both ordinary interaction routes consume special status before invoking the common break response. The break helper also contains a special-status item branch, but does not itself clear special status or reschedule its recurrence channels.

Item release is an attempt, not a guarantee. Both call sites copy `{0,5,0}` and use the block world origin plus five Y units. With the supplied false policy, the shared spawner replaces that temporary velocity on successful construction with randomized horizontal speed, item-configured vertical speed, and zero depth speed. Rule, selection, and construction failures can produce no item without preventing the caller's block consumption.

Initialization is not generally failure-safe: block allocation is unchecked, proxy creation may return NULL, and initial Hatena setup dereferences the result after a creation helper that can fail. Fatal mapping/JObj checks and duplicate-overlay assertions are preserved rather than described as recoverable errors. The allocated block array and registered callbacks outlive initialization; complete controller teardown ownership is not established by this unit.

## Scale Lift and shared consumers

The lift retains model joints 26 and 28 and their children, and registers collision-load callbacks for joints 20 and 21. Separate load totals drive equal-and-opposite parent translations. If either total exceeds 100000, both totals become 100000. Normal balancing applies thresholds, acceleration, clamping and damping, then clears its contact counts and load totals. Exceeding the signed displacement limit enters falling state 1.

State 1 lowers both children until both world positions are below the bottom blast-zone offset minus thirty. State 2 predecrements a timer and restores child positions and collision state only when the timer equals zero. State 3 steps the parent imbalance toward zero and returns to normal only when a nonzero displacement reaches or crosses zero. Already-zero displacement does not complete recovery. A positive recovery step is an intended configuration assumption, not a source-enforced invariant. The load callback itself has no lifecycle-state guard; ground-kind 1 remains a numeric classification.

The exported line predicate recognizes Inishie1 collision joints 20 and 21—the same lift joints—and CPU floor processing uses a true result to reject a destination. The music helper polls until the unsigned timer value is below twenty, maps 0x29→0x2A or 0x2B→0x2C, passes -1 for other tracks, and closes its one-shot flag. An unavailable timer closes the flag without an audio call.

## Semantic and rendered review

Supported existing knowledge is explicitly retained in the inherited research ledger. Corrections distinguish void return from non-returning control flow, JObj ID registration from material reset, temporary velocity initialization from successful item velocity, assumed parameter positivity from enforced behavior, and the local indexed setup wrapper from the included shared inline. The CPU predicate's formerly unidentified joint groups can be associated with the lift without renaming its accurate structural predicate name.

The hash-bound research establishes complete canonical/rendered owned-file and frozen subject/link coverage. This lead independently inspected every proposed fact's citation ranges and all indicated contradiction evidence. The C renderer reports eight parse errors, a setup-helper name collision, macro parse uncertainty, and a shadowed OnTouchLine binding; these are rendering limitations, not independent evidence against canonical behavior. No compiled section extent, padding, membership, or retail literal-order claim is established by this review.

Status: synthesized; independent review and live promotion pending.
