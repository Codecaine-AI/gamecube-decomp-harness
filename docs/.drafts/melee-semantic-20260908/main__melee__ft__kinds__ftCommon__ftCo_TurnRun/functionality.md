# TurnRun semantic review

## Scope and naming
The hash-bound research establishes complete coverage of both canonical/rendered files, all 17 subjects, 46 facts and 31 links. This distinct lead independently inspected every proposed fact's canonical citations and all contradiction evidence. No selectable same-role ancestor cache was supplied. Supported retained research rows are inherited unchanged. Rendered names are hypotheses, not evidence; no cosmetic renaming is proposed.

## Entry and lifetime
Both predicates accept exactly `lstick[0].x * facing_dir <= x38_someLStickXThreshold`. A false comparison, including an unordered comparison involving NaN, returns false without entering TurnRun. `fn_800C9CEC` preserves `cur_anim_frame` and is command-gated in RunBrake; `fn_800C9D40` starts at zero and is reached in Run only when `mv.co.run.x0 <= 0.0F` evaluates true. An unordered countdown fails that guard and also prevents the later RunBrake check.

Entry clears command variable 1, saves entry-facing direction in `turnrun.accel_mul`, changes motion with `Ft_MF_SkipAnimVel` and the supplied frame, then clears `turnrun.x14`. A non-null `x197C` enables the explicit sound call; its object identity is not inferred here. Animation later consumes command/phase state, while physics uses the saved entry-facing direction rather than the subsequently reversed facing direction.

## Animation
When command variable 1 is active, phase zero pauses playback and sets the phase flag. Only a later active-command update can take the release branch. Release requires `mv.co.walk.middle_anim_frame * gr_vel <= 0.01F`; it restores rate 1, clears the command and negates facing. This is a signed product test, not an absolute-speed test. Unordered operands do not release it. The walk-named field is preserved as the canonical access; this review does not establish its initialization or storage alias from compiled layout evidence.

Animation exhaustion is tested independently of the gate. `fn_800CA644` gets the first opportunity and enters Run on its facing-relative input comparison, initializing Run's countdown from common data. Otherwise `ft_8008A2BC` is called; no unconditional ordinary Wait destination is asserted.

## Interrupts
TurnRun IASA only delegates to `fn_800CAF78`. Hammer possession selects an exclusive branch: the selector immediately returns `ftCo_800C5A50`'s result, including false. It never falls through to the relaxed ordinary input checks while holding Hammer. The Hammer selector uses `ftCo_Jump_GetInput`, with the ordinary tap threshold, and dispatches its accepted input through `ftCo_800C5B88`. Without Hammer, relaxed upward-stick magnitude plus the strict tilt-timer window takes priority over X/Y and enters ordinary KneeBend.

## Physics
Zero target velocity selects scaled ground friction. Otherwise the direct acceleration path requires `entry_facing * accel < 0`; a failed or unordered sign comparison selects friction. Positive and negative acceleration branches conditionally subtract or add traction after comparing projected velocity with target velocity. They clamp to `target_vel - gr_vel` only if that correction crosses the target. This is not a universal target-speed cap. Every path calls common ground movement. The exact retained state_behavior is preferable to the deferred broader clamp explanations.

## Collision and exceptional destinations
`ft_800827A0` synchronizes collision position, invokes its map query, writes the resulting position back and returns the query result. False causes a call to `ftCo_Fall_Enter` followed by an immediate return. That callee is a dispatcher: Master Hand, Crazy Hand, `x2224_b2` and Hammer alternatives precede ordinary Fall. TurnRun therefore does not promise ordinary Fall on every false collision result.

On a true collision result, either left/right edge flag invokes `ftCommon_8007E2FC`; neither flag causes no further local action. The helper clears ground accelerations and movement, animation, knockback and related velocity fields without selecting another motion state. The rendered ResetVelocities name fits this behavior.

## Evidence boundaries
Source-level uses of 0, 1 and 0.01 are supported. The claimed compiled 16-byte `.sdata2` layout and explanation of remaining bytes are deferred. Numeric common-data values, animation-script timing, field alias layout and exceptional-path reachability from ordinary gameplay are not invented. Existing supported knowledge is explicitly retained in the inherited ledger; changes address factual scope rather than wording.

Status: synthesized; independent review and live promotion pending.
