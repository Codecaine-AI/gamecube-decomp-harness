## Common Lift carrying states

`ftCo_Lift.c` implements the common grounded heavy-item carrying state family; its header declares the entry helpers and animation, IASA, physics and collision callbacks. Both owned files were read completely in canonical and rendered form. The source motion table registers LiftWait, two LiftWalk variants and LiftTurn with these callbacks. Pickup completion selects the common entry unless `x2222_b0` selects the separate `ftDk` entry; the caller's actual condition is a flag, not a direct fighter-kind comparison.

### Entry, walking and input priority

`ftCo_80096D9C` clears the lift-local step selector `x0`, enters LiftWait from frame zero and installs `ftCo_800974C4` as `take_dmg_cb`. LiftWait's animation callback is empty. Its IASA callback checks throwing, turning and walking in that order, stopping after an accepted transition.

Walking begins when horizontal left-stick input multiplied by facing direction is at least `p_ftCommonData->x228`. `ftCo_80096F48` chooses LiftWalk1 or LiftWalk2 from the old selector value, toggles the selector, changes motion, calls `ftAnim_8006EBA4` and reinstalls the damage callback. LiftWalk animation completion checks whether another step should begin; otherwise it enters LiftWait with `Ft_MF_Unk24`. This fallback does not reset the selector. Walking input is not rechecked by this animation callback while frames remain.

Walk and turn IASA callbacks only poll `ftCo_80094EA4`. Its canonical implementation independently confirms HeavyThrow selection: it requires an item, chooses A/B-triggered left-stick input or C-stick input, applies directional and timing thresholds, and reports success after dispatching a different motion. Neutral A/B input can fall back to forward throw.

### Timed turnaround

`ftCo_800970E0` accepts facing-relative input at or below `x22C`. Turn entry copies `x230` into countdown `x4`, clears midpoint latch `x8`, enters LiftTurn with `Ft_MF_Unk24`, performs animation setup, installs the damage callback and immediately calls the animation update. Thus the first decrement occurs during entry.

Each update decrements `x4`. Unless `x2222_b6` is set, it advances TransN yaw by the configured angular increment. At or below half-duration, the still-clear latch permits one reversal of facing and ground velocity, plus TopN and TransN rotation writes. The suppression flag does not suppress these midpoint writes. Expiration enters literal motion ID `174` and reinstalls the damage callback. The source motion table labels 174 as LiftWait; the literal and unknown transition-flag spelling are preserved rather than silently normalized. No validation of zero, negative or unusual configured duration appears here.

The rendered `ftPartGetRotZ` → `ftPartGetRotY` substitution was checked independently: the canonical getter returns Y rotation on both of its joint-selection paths. The inline Y setter also has null and quaternion-mode assertions. These source assertions establish exceptional diagnostic behavior, not emitted section contents.

### Physics, ground loss and item lifetime

Wait and turn physics delegate to `ft_80084F3C`, which applies ground friction, scales it above maximum walking speed and then applies ground movement. Walk physics uses a different chain: `ft_80085088` passes friction and facing to `ft_800850E0`; when `x594_b0` is set, that helper assigns ground velocity from TransN Z displacement times facing, otherwise it applies friction, then performs ground movement.

All three collision callbacks pass `ftCo_80096E68` to the same ground-check helper. On failure, an existing item is sent through `Item_8026ABD8` with a zero vector and scalar before `ftCo_80090780` runs. That callee performs airborne conversion when needed and retains a parasol-specific branch; otherwise it enters literal state `0x26`. Without an item, the Lift callback instead calls `ftCo_Fall_Enter` directly.

The damage callback drops any non-null held item; it neither tests heavy classification nor directly changes fighter motion. `ftCo_8009750C` is distinct: it drops only when an item exists and `itIsHeavy(item) == 1`. CaptureYoshi calls this cleanup before assigning captor fields and entering capture, and pickup ground-loss also calls it before Fall. The item system consumes the supplied vector as velocity, performs separate owner-relative placement, invokes the dropped callback and continues post-drop processing. The zero vector is not a held-item positioning offset.

### Semantic review outcome

The checkpoint ledger explicitly covers all 120 baseline facts and 46 links: 106 facts retained, five superseded and nine unresolved; all links retained. Corrections distinguish DamageFall from Fall, expose the heavy-only cleanup guard, document useful walk-physics behavior, replace damage-time synchronization wording with release, and remove the implication of an automatic ownership-loss exit. A missing ground-loss callback name is proposed. Other supported names and explanations are retained without equivalent rewrites.

No compiled artifacts were supplied. Assertions and inline constants do not establish the anonymous `.data`, `.sdata` or `.sdata2` contributions, their extents or their exact contents; those nine baseline facts remain unresolved.

Status: synthesized; independent review and live promotion pending.
