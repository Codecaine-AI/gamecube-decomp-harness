# Common Run semantic review

## Scope and naming
Independently reviewed all 153 canonical and rendered lines of `ftCo_Run.c`, all 17 lines of its header, all 24 subjects and all 22 links. The renderer reported no parsing problems; it substitutes function names only. Existing names for the three entry predicates remain useful hypotheses, supported by their bodies and callers rather than by rendered spelling. No cosmetic renames are proposed.

## Entry and state-local lifetime
All three predicates accept when horizontal stick input multiplied by facing direction is **at least** the shared x58 threshold. `fn_800CA5F0` supplies a zero countdown and is reached through Dash's command-variable gate. `fn_800CA644` supplies x430 from TurnRun animation completion. TurnRun's facing reversal is command-conditioned; the predicate itself tests whatever facing is current. `fn_800CA698` supplies zero while forwarding the current animation frame and playback multiplier from RunDirect. RunDirect's external gate is spelled `mv.ca.specials.grav <= 0`; that union-member spelling does not establish a gravity mechanic.

`ftCo_Run_Enter` supplies frame 0 and speed 1. The full initializer selects Run with `Ft_MF_None`, then stores the caller's first float in x0 and snapshots **post-motion-change** gr_vel into x4. x4 is not permanently an entry snapshot: Run physics replaces it with scaled target velocity. RunDirect delegates its animation, physics and collision callbacks to Run.

Evidence: [entry](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_Run.c#L22-L74), [Dash caller](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_Dash.c#L127-L134), [TurnRun caller](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_TurnRun.c#L57-L77), [RunDirect](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_RunDirect.c#L17-L57).

## Animation and countdown
Animation selects x4 when the ground-friction multiplier is below 1, otherwise gr_vel. It requests zero rate for a nonpositive facing-relative velocity, otherwise ABS(velocity)/run_animation_scaling. The rate setter can store the request for deferred application under x2223_b0; requesting zero does not invariably freeze playback immediately. Popo and Nana receive a friction multiplier of 1 from the shared query.

Positive x0 undergoes floating-point subtraction by 1 without clamping. A fractional positive value can become negative. There is no demonstrated finite, integral or bounded input invariant: sufficiently large values can round unchanged, and NaN does not satisfy the positive decrement test. The late interrupt gate requires x0<=0, so unordered x0 also blocks those late checks. No particular runtime occurrence of exceptional values is asserted.

Evidence: [animation](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_Run.c#L76-L99), [rate setter](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftanim.c#L496-L513), [friction exception](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ft_081B.c#L1235-L1241), [late gate](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_Run.c#L125-L128).

## Interrupt priority and exceptional acceptance
The order is side-special handling; up-, neutral- and down-special dispatch; the dash-catch handler; dash-attack handling plus setup; guard handling plus setup; appeal; jump-related handling; then countdown-gated TurnRun and RunBrake. Canonical `ftCo_Attack100_CheckInput` dispatches `ftData_SpecialHi`, not rapid jab. The adjacent opaque functions dispatch SpecialN and SpecialLw. Thus the rendered special names fit canonical behavior, while the legacy rapid-attack explanation does not.

A successful dash-catch handler need not mean CatchDash was selected: it has an earlier delegated acceptance path. Dash-attack handling includes item throw/swing alternatives and a Kirby-specific path. Run still invokes its post-success setup unconditionally when that checker returns true. Guard setup writes x20 from x410 and x24 from common x68. The jump checker includes an earlier delegated special-case path before its relaxed tap-jump and button checks. These handlers must not be reduced to unconditional ordinary-action transitions.

RunBrake checks absolute horizontal stick input below x58; it is not itself a down-stick crouch test. Higher-priority checks run before the x0 gate.

Evidence: [priority](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_Run.c#L101-L128), [special dispatch](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_Attack100.c#L44-L101), [catch alternatives](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_Catch.c#L38-L58), [dash-attack alternatives](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_AttackDash.c#L26-L82), [guard](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_Guard.c#L70-L128), [jump](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_Jump.c#L62-L84), [brake](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_RunBrake.c#L19-L30).

## Physics: movement preparation, not position integration
The inline producer computes acceleration from stick X times dash_accel_mul plus a signed dash_accel_base, and target velocity from stick X times dash_max_velocity. Zero stick takes the negative-base branch, but a zero target subsequently selects friction handling. For nonzero target and 0<gr_vel/target<1, Run multiplies acceleration by `(1-ratio)*run_accel_taper_gain`. Without the parameter value, this is not proof that acceleration always decreases.

Physics always refreshes x4 as target*x440. The shared target/friction helper writes xE4_ground_accel_1, with zero-target friction handling and conditional overshoot/cap branches. It does not directly integrate gr_vel. The movement helper optionally scales acceleration by a friction multiplier below 1, then constructs **ground-tangent vectors from the floor normal**: x74_anim_vel is acceleration times `(normal.y, -normal.x, 0)`, and self_vel is gr_vel times the same vector. These vectors are tangent in XY, not along the ground normal. These bodies do not advance fighter position.

Evidence: [Run physics](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_Run.c#L130-L147), [input formula](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/inlines.h#L132-L140), [friction/target preparation](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftcommon.c#L51-L97), [tangent components](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftcommon.c#L133-L152).

## Collision ambiguity
Run unconditionally delegates to ft_800844EC. Its query synchronizes Fighter and CollData positions around map collision and returns GroundOrAir. The consumer checks that enum as a Boolean: nonzero invokes the StopWall predicate, zero enters Fall. Current enum values are GA_Ground=0 and GA_Air=1. Therefore the legacy description of grounded results checking StopWall and airborne results entering Fall cannot be retained as established canonical behavior. The literal branch structure is documented; intended game interpretation is deferred to the shared owner.

The StopWall predicate itself is clear: exact facing -1/+1 with the corresponding wall-hug flag and ABS(gr_vel)>walk_max_vel permits StopWall entry.

Evidence: [Run wrapper](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_Run.c#L149-L152), [enum producer](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ft_081B.c#L393-L404), [Boolean consumer](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ft_081B.c#L1129-L1137), [enum values](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/forward.h#L442-L445), [StopWall](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_StopWall.c#L16-L57).

## Constants and evidence boundary
Scalar zero/one consumption remains supported. This packet makes no eight-byte layout, offset, alignment, byte-content or ELF-flag claim for .sdata2. The rejected proposal's object-layout extension is deferred rather than attaching unrelated C callers as compiled proof. Existing source-level literal-purpose knowledge is retained, while the compiled inferred-type fact is explicitly unresolved.

## Ledger outcome
All 55 baseline facts and 22 links are explicitly accounted for in checkpoints: 42 retained facts, nine superseded facts, four unresolved facts; 20 retained links and two unresolved links. The two physics links retain a supported running association conceptually, but their displacement rationale requires owner repair. Coverage reports no missing files, subject offsets or link offsets.

Status: synthesized; independent review and live promotion pending.
