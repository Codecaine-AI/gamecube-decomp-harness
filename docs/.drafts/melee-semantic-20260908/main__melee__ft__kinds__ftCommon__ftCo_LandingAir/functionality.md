# Aerial landing selection and callbacks

## Scope and review
Inherited research establishes complete canonical/rendered coverage of both owned files, all 16 subjects, 36 facts, and 12 links. The distinct lead independently checked every proposed fact's canonical citations, all upstream contradiction evidence, and supporting grounding, animation, and physics definitions. Context offered no same-role ancestor restore keys or missing enumeration. Supported existing knowledge is retained without cosmetic changes. Three factual corrections and one useful caller-flow addition are adopted; compiled-section interpretations remain explicitly deferred.

## Common landing decision
`ftCo_LandingAir_EnterWithLag` starts with `ftCo_MS_None`. Only a nonzero `cmd_vars[0]` permits selection. The five standard aerial motions map to the corresponding LandingAirN/F/B/Hi/Lw motion and matching character lag attribute. If a motion was selected and `x67F < p_ftCommonData->xE4`, the routine divides lag by `xE8`, converts the quotient to an integer, replaces an integer zero with one, and assigns it back to floating lag. For finite values whose truncated result is representable as an `int`, conversion truncates toward zero. This is not a general minimum-one clamp. No local validation excludes NaN, infinity, out-of-range conversion, zero divisors, or negative lag.

Failing the timing test preserves the selected motion and its full lag. Basic landing is used only when no motion was selected, including an inactive command or an unrecognized motion. Consequently, the uninitialized local lag is not consumed on the unmatched path. Basic entry itself can choose HammerLanding; it does not unconditionally enter the ordinary Landing motion.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_LandingAir.c#L14-L57 and code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_Landing.c#L83-L91.

The supported game mapping is attack-specific landing lag, command-controlled auto-cancel fallback, and the common timed reduction associated with L-canceling. This unit does not establish fixed numeric timing-window or divisor values, nor does it prove that every consumer takes that reduction path.

## Entry helper and direct consumers
`ftCo_LandingAir_EnterWithMsidLag` performs common grounding setup, changes to the caller-supplied motion with flags None, frame zero and initial rate one, then calls `ftAnim_SetAnimRate` with `(ftAnim_8006F484(gobj) + 0.1f) / lag`. Only the motion ID—not lag—is passed to `Fighter_ChangeMotionState`. The helper contains no command gate, motion/attribute consistency check, lag reduction, or numeric validation.

Game & Watch directly calls this helper for its N, B, and Hi landing motions, bypassing the common selection/reduction wrapper. N supplies `landingairn_lag`; B supplies `landingairb_lag`; Hi also supplies `landingairb_lag`, not `landingairhi_lag`. The helper preserves these caller-selected pairs rather than deriving lag from motion. Game & Watch's surrounding landing animation and collision callbacks test for a motion change after common processing and invoke their character cleanup routine, so that character-specific lifetime remains outside this common helper.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_LandingAir.c#L59-L66 and code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftGameWatch/ftgamewatchattackair.c#L551-L697.

## Rendered names and cross-file effects
The rendered `ftCommon_SetGrounded` hypothesis fits the canonical grounding helper, but its effects exceed setting one flag: it performs air-conditioned bookkeeping, transfers/clamps velocity, resets jump-related state, unlocks the ECB, and checks for supporting ground. The rendered `ftAnim_GetEndFrame` hypothesis is independently supported: the canonical helper selects the root object's or animation skeleton's end frame according to blend state. Neither rendered substitution requires a local rename proposal.

The rate setter may store the requested rate in `x8A0_unk` and return when `x2223_b0` is set; otherwise it updates animation rates and `frame_speed_mul`. Therefore the entry call requests rate configuration, not an unconditional immediate playback change under every cross-file state.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftcommon.c#L546-L594, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftanim.c#L490-L513, and code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftanim.c#L573-L581.

## Callback behavior
`Anim` forwards to the ordinary landing completion handler. That handler checks whether animation frames remain and invokes `ft_8008A2BC` when none remain; neither wrapper nor handler advances animation. `IASA` is empty and cannot initiate an input-driven interruption. `Phys` forwards through ordinary landing physics to ground friction and movement, including the above-walk-speed friction multiplier. `Coll` forwards to ordinary landing collision handling without a local guard or transition.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_LandingAir.c#L68-L83, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_Landing.c#L115-L160, and code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ft_084E.c#L42-L53.

## Data and evidence limits
The complete source contains constant expressions and no authored gameplay table. That does not independently prove `.sdata2` contents, precise ELF layout, flags, or conversion-bias storage. All three baseline section facts are explicitly unresolved at that storage-attribution boundary. No compiled-section write from the rejected review is carried forward. The header's six declarations agree with the definitions; parameter subjects have no baseline facts, and no unsupported ABI/register interpretation is added.

Status: synthesized; independent review and live promotion pending.
