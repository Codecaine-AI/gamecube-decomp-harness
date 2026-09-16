## Sheik Chain fighter-side implementation

The owned C file and header implement Chain's fighter-side startup, active control, ending, collision transitions, hitbox management, and article lifecycle. Canonical and rendered pages were reviewed completely; all 111 frozen subjects, 292 facts, and 100 links were enumerated and explicitly dispositioned in checkpoints.

### State machine
- Ground/aerial startup uses states **349/352**. Entry resets shared working state; aerial entry also zeros vertical self-velocity. Startup animation increments a counter, spawns the Chain at exact attribute milestone `x1C`, initializes its facing-relative link velocity at `x1C + 1`, and reports completion only when the counter is strictly greater than attribute `x20`.
- Active entry uses **350/353**, pose selectors **305/308**, and unconditional four-hitbox activation/reset. Active IASA latches B release and processes stick deltas. Animation consumes that latch only after the incremented active counter exceeds attribute `x14`; otherwise it updates the stick-directed pose.
- Ending entry uses **351/354**. Both forms reset the phase counter and reactivate/reset hitboxes only when move-local `x1C != 0`. Ending animation uses exact item milestones, skips the collision updater only at equality with attribute `x28`, and separately exits when animation finishes.
- Startup and ending have phase-preserving ground/air conversion helpers. In contrast, active collision callbacks enter the **same-form ending state**, not the opposite active state. The grounded active-entry environment probe likewise dispatches grounded ending state 351.

### Input and hitboxes
Stick direction is facing-relative, smoothed along the shortest angular difference, and wrapped with single-step strict-bound checks. Stick magnitude is capped before smoothing and controls pose blending. Directional sound cooldowns are independent; eligibility includes nonpositive countdowns. Low-input attenuation tests both axes separately and occurs after sound processing.

The item supplies positions to four fighter hitbox slots. The position provider checks the fighter object and command variable, but not the supplied position pointer or index bounds. It records enabled positions even when XY is zero; collision updates require nonzero X or Y. The movement-sensitive updater compares squared XY displacement, updates position history, and may deactivate then reactivate in one invocation. Post-hitlag `x20` grace delays only the low-movement clearing path; independent `x1C` expiry remains effective.

### Cross-file lifetimes and exceptional paths
Chain removal calls the fighter-owner reset before clearing item ownership and deleting links. That reset performs post-hitlag notification while the article is still tracked, then clears the fighter pointer and damage/death callbacks. Consequently, the outer destroy routine's later post-hitlag helper normally observes a null pointer rather than a still-live article.

Spawn failure changes the fighter to Fall or the common grounded exit without immediately returning from the startup helper. The later completion predicate still executes. Exact milestone comparisons and the next-count item's unchecked dereference must not be replaced with an assumed universally successful startup path.

The trailing predicate and count accessor belong semantically to Needle Storm despite their SpecialS source location. Independent SpecialN producers and held-needle consumers establish their lifetime and six-model display roles. Both resolve fighter data before their textual null tests; those branches do not establish null-safe APIs.

### Semantic/rendered assessment
Existing operation-oriented names generally fit canonical behavior and are retained. Corrections address phase misidentification, activation versus cleanup, velocity versus displacement, cleanup reentrancy, exact input-field spelling, negative cooldown eligibility, and null-precondition wording. Rendered names were not used to prove themselves. The rendered ending goto-label blocks leave `ftSk_SpecialS_80110BCC` unsubstituted although other occurrences are substituted; this is a rendering limitation, not distinct behavior. No compiled section extent, padding, or constant-pool placement is asserted.

Status: synthesized; independent review and live promotion pending.
