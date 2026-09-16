## Scope and evidence
Full source, rendered-view, subject, fact and link coverage is inherited from the hash-bound research handoff. The lead independently read canonical C lines 42–272, covering both proposed facts and every upstream non-retain claim's cited source. The proposal and functionality document agree; no disposition corrections are needed. Rendered names remain hypotheses rather than independent evidence. No compiled evidence establishes `.sdata2` composition or placement.

## FingerBeamEnd
The inherited research identifies ending-phase callbacks: animation exhaustion calls `ftMh_MS_389_80151018`; IASA dispatches to the empty shared `ftBossLib_8015BD20` hook only for a human player slot; physics delegates to animation-translation velocity handling; collision is empty. These callbacks do not create beams.

## FingerGun1: setup and approach
`ftMh_MS_363_801530A4` enters FingerGun1, invokes animation initialization, stores `xE4 + HSD_Randi(xE8 - xE4)` in move-local x50, and clears command variables 0–2. The local code does not validate the random-range arguments.

While animation frames remain, the animation callback does not decrement x50. On every update reporting no remaining frames, it enables command variable 2 and subtracts one from x50. A strictly negative result enters FingerGun2, then sets x54 to xF0 when `ftLib_80087120(gobj) > xEC`, otherwise to one, and clears command variable 2. This is a post-animation update countdown, not a sequence of restarted FingerGun1 animation cycles.

Physics first runs the common animation-velocity helper. When command variable 2 is nonzero, it obtains a boss-library reference position, adds xDC/xE0 to X/Y, sets destination Z to zero, and subtracts current position. The full XYZ displacement determines length. Below x2C, displacement X/Y are copied directly to self velocity; otherwise the normalized displacement is scaled by length times x28 and only X/Y are stored. Equality takes the normalized branch. Z affects the calculation but is not written to self velocity. The inline square-root implementation uses three reciprocal-square-root refinements for positive input and returns nonpositive input unchanged. IASA uses the same human-slot empty hook; collision is empty.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftMasterHand/ftmasterhandfingergun.c#L42-L161.

## FingerGun2: entry, repetition, and command consumption
`ftMh_MS_364_801533CC` enters FingerGun2, initializes animation, conditionally sets rate xF4 using the strict xEC comparison, clears self velocity X/Y, and installs `ftMh_MS_365_801535B0` in accessory4_cb. The inline restart performs the same operations. The repetition counter is initialized by the FingerGun1 caller after the entry helper returns, not by the entry helper itself.

At animation exhaustion, FingerGun2 predecrements x54. Exactly zero restores rate one and enters FingerGun3; every nonzero result restarts FingerGun2. No local validation guarantees a positive initial count. Rate and projectile-selector threshold queries are performed separately rather than latched once for the entire attack. FingerGun2 physics delegates to the common helper, so entry-time velocity clearing is not a guarantee of permanent immobility.

The accessory callback tests command variables 0 and 1 independently, in that order. The first uses FtPart_LKneeJ and xF8/xFC; the second uses FtPart_RKneeJ and x100/x104. Each requests a bullet and then clears its own command. Both can execute in one invocation; neither command is guaranteed to occur by this C code alone. The generic knee-named model parts do not establish anatomical finger identities.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftMasterHand/ftmasterhandfingergun.c#L163-L237.

## Projectile boundary and lifetimes
`ftMh_MS_365_8015364C` obtains a joint-derived position, preserves an unmodified copy, offsets X/Y in the first vector, and passes both vectors to `it_802F0AE0` with MasterHand_Bullet kind, a strict-threshold boolean, facing direction, and xD4/xD8. The fighter code does not retain a spawned-item handle. FingerGun3 entry contains only a motion-state change and animation follow-up; callback clearing by the shared motion-state machinery remains deferred.

The inherited cross-file research establishes that the item constructor synchronously copies the offset vector into SpawnItem.prev_pos and the unmodified vector into SpawnItem.pos rather than retaining these local vector pointers. It retains parent object references, applies facing to horizontal launch velocity, sets vertical launch velocity directly and Z velocity to zero, creates the item, and selects initial item state zero or one. There is no visible null check before initialization of the result. Subsequent item callbacks manage an attribute-driven lifetime independently of the fighter repetition counter. Allocation guarantees and parent-reference cleanup remain deferred.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftMasterHand/ftmasterhandfingergun.c#L239-L271; inherited cross-file evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/kinds/itmasterhandbullet.c#L28-L109.

## Naming and uncertainty
The four baseline proposed local names plausibly describe entry/spawn roles, but exact original spellings remain unknown. The rendered CrazyHand IASA name does not establish Crazy Hand-specific behavior. Broad Finger Bullet and Laser Nail mappings remain baseline contextual correspondences. Fixed 150% thresholds, three-pair counts, and greater-or-equal boundary descriptions are not verified source facts: the implementation uses configured attributes and strict greater-than comparisons. Numeric suffixes in address-style function names do not establish motion-state IDs. Source constants do not establish compiled literal-pool identity or layout.

Status: synthesized; independent review and live promotion pending.
