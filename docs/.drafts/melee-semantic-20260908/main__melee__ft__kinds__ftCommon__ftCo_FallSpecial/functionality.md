# FallSpecial

Revision `c302741689bd67c361cd7faadb221df3193992c3`. This TU configures the common special-fall state and its animation, restricted input, physics and collision callbacks.

## Entry Choices

The default wrapper uses xC=1, x10=0, landing interrupt permission true, mobility multiplier one and Fighter.x2EC landing lag. The standard parameterized entry sets animation blend zero and consumes all jumps. The blend entry accepts animation blend and preserves jump use only if the fighter was already airborne. Grounded entry through either variant uses common airborne setup that consumes every jump. The x2224_b2 guard diverts before FallSpecial initialization.

Normal setup keeps fast-fall state, starts animation at zero with speed one, scales mobility by air_drift_max, stores policy and landing values, and initializes directional blend x4 to zero. The caller blend goes to Fighter_ChangeMotionState and is not stored in x4. The default wrapper's inherited alias collides with the configurable entry; the proposal changes it to ftCo_FallSpecial_EnterDefault. [Entry evidence](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_FallSpecial.c#L22-L67), [jump helper](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftcommon.c#L527-L544), [animation parameters](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/fighter.c#L933-L937).

## Animation, Input and Physics

Animation delegates neutral/forward/backward selection to the shared velocity-sensitive fall helper, then applies the updated blend. Shared source establishes the threshold, facing-relative direction and proportional smoothing. All three active FallSpecial table rows use these callbacks.

IASA independently tries parasol reopen, pickup-window arming and aerial jump in order. The stored allow_interrupt value is for subsequent landing; it does not gate these aerial checks. Each helper has its own eligibility tests, so this does not promise a jump after standard entry has consumed them. [IASA](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_FallSpecial.c#L77-L82), [pickup](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_Attack100.c#L297-L308), [jump guards](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_JumpAerial.c#L46-L116).

Physics checks fast-fall first. With xC nonzero, ordinary gravity uses terminal_velocity and horizontal target is unrestricted by the stored mobility value. With xC zero, ordinary gravity instead uses fast_fall_velocity and the requested horizontal target is capped by mobility. Fast-fall overrides either vertical regime. The horizontal helper writes acceleration state; this is not an immediate clamp of self_vel.x. [Physics](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_FallSpecial.c#L84-L127), [drift helper](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftcommon.c#L336-L372).

## Contact and Landing

The floor predicate rejects line -1 and accepts platform lines only when stick Y is strictly greater than the common threshold. Solid lines bypass that input test. Collision synchronizes CollData, queries contact, and invokes the local response when accepted; otherwise it tries the guarded ledge path.

The response enters parameterized LandingFallSpecial when x10 is set, regardless of vertical velocity, or when vertical velocity is below the fighter-dependent threshold. Other cases dispatch the shared neutral/boss path. Landing lag affects playback rate in the landing helper, whose hammer branch may divert. Landing interrupt permission is consumed in the landing IASA. [Contact](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_FallSpecial.c#L129-L155), [dispatcher](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ft_081B.c#L641-L683), [landing](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_Landing.c#L103-L113).

## Data and Review State

The eight-byte literal pool stores 1.0F then 0.0F in both existing objects. Split-object flags are ALLOC, source-object flags are ALLOC|WRITE. [Corroboration](data-corroboration.json) records hashes and report identity.

All 176 owned lines and 32 subjects are reviewed. Exact inherited fact decisions and baseline outgoing records are preserved. One link remains unresolved because its non-jump-consuming rationale ignores grounded entry.

## Canonical and Rendered Sources

- [src/melee/ft/kinds/ftCommon/ftCo_FallSpecial.c](</Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__melee__ft__kinds__ftCommon__ftCo_FallSpecial/pages/src__melee__ft__kinds__ftCommon__ftCo_FallSpecial.c.1-156.json>)
- [src/melee/ft/kinds/ftCommon/ftCo_FallSpecial.h](</Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__melee__ft__kinds__ftCommon__ftCo_FallSpecial/pages/src__melee__ft__kinds__ftCommon__ftCo_FallSpecial.h.1-20.json>)

[Supplemental canonical reads](supplemental-canonical.json) preserve precise dependency ranges and hashes.
