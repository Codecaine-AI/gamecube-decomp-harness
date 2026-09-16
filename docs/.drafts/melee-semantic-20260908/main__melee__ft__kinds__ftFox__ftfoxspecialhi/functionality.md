## Scope and reconciliation
The hash-bound research coverage and unchanged dispositions are adopted. Independently read all canonical and rendered pages of the owned C file and header, plus targeted canonical definitions in ftcommon.c, fighter.c, and ft_08A1.c. The empty proposal is consistent with retaining supported research and explicitly deferring disputed claims. Rendered helper names were not treated as independent evidence. No compiled section or emitted-match claims are established.

## Charge and launch
The unit provides 41 public void(HSD_GObj*) callbacks for the Fire Fox family; source comments identify shared Firefox/Firebird handling. Ground startup loads gravityDelay, divides ground velocity by the configured factor, enters SpecialHiHold, initializes animation processing, and schedules charge graphics. Aerial startup divides horizontal self velocity, clears vertical self velocity, and enters SpecialHiHoldAir. These arithmetic operations do not guarantee speed reduction for arbitrary attribute values.

Hold animation completion selects launch handling by actual ground/air situation. Hold IASA callbacks are empty. Aerial hold physics decrements a nonzero delay, applies falling only when the delay was already zero, and applies aerial friction on either path. Hold collision preserves phase across situation changes using explicit flags and same-frame transition arguments, not blanket state preservation.

Despite its name, ftFx_SpecialAirHi_AirToGround selects grounded launch after charge completion. Directional input, a floor-normal comparison, and ftCo_8009A134 determine whether to enter floor-aligned grounded travel or convert to aerial launch. Aerial launch selects stick-derived or upward-default angle, conditionally updates facing, initializes travel duration and two local values, constructs velocity with sine/cosine, rotates the model, installs callbacks, and consumes all jumps.

## Travel and collision
Both travel animation callbacks decrement travelFrames and select Landing or move-specific Fall at expiration according to actual situation. The independently incremented unk gates braking against x70_FOX_FIREFOX_DURATION_END; total travel duration comes from x68_FOX_FIREFOX_DURATION. Ground braking applies configured friction before movement. Aerial braking subtracts an angle-derived acceleration vector without a local clamp or state transition.

Ground collision increments unk2 before checking support loss. Same-frame aerial conversion does not locally reset this history. Otherwise floor contact updates model rotation. Rebound eligibility compares unk2 with its attribute and conditionally consults ftCo_8009A134; aerial collision does not itself increment unk2.

Aerial collision preserves exceptional source control flow: eligible absent-floor or negated floor-angle conditions enter Bound; a qualifying smaller floor angle jumps directly to facing alignment, bypassing cliff handling. The ordinary fallback checks cliff handling before ceiling, left-wall, then right-wall angle selection. Only a below-threshold angle reaches alignment. Preserve !(angle < threshold), redundant horizontal-zero tests, and the explicit fake-match warning; source reconstruction does not prove emitted behavior.

## Endings and rebound
ftFx_SpecialHiFall_AirToGround initializes frame-zero Landing after grounded travel expiration, clears effects, conditionally converts to grounded handling, and installs x21F8. ftFx_SpecialHiLanding_GroundToAir initializes move-specific Fall after airborne travel expiration. Neither misleading name establishes its triggering phase. Actual Landing support loss calls ftCo_80096900 directly. Actual move-specific Fall contact calls ftFx_SpecialHiFall_Enter, requesting Landing at frame 13 with SkipColAnim | UpdateCmd and initializing animation processing.

Landing completion delegates to ft_8008A2BC, whose downstream branches prevent describing it as an unconditional Wait transition. Fall physics delegates; Fall animation completion performs the later common special-fall handoff. Empty IASA establishes only absent local interrupt processing, not global helplessness.

Bound entry changes state, initializes animation processing, installs x21F8, scales horizontal velocity, clears command variable zero, and unconditionally spawns effect 1030. Its floor-dependent argument is a volatile scalar, not a proven Vec3. Bound animation prioritizes the airborne command-variable exit over animation completion. Both airborne exits invoke common special fall and consume all jumps; grounded completion delegates to the neutral dispatcher. Bound collision gives airborne landing priority over cliff handling.

## Cross-file lifetime and limits
Charge effect 1163 uses TransN; launch effect 1164 uses HipN. Both are gated by x2219_b0, always install effect-hitlag callbacks, and retire accessory4_cb. Rearming is not necessarily spawning. Fighter motion-state changes without KeepGfx clear latched effects through ftCommon_8007DB24, which clears the latch and destroys all effects. The travel-ending helpers also explicitly clean up. Common aerial conversion consumes jumps and locks the ECB; grounded conversion resets jump/wall-jump state and unlocks it.

Section allocation, scalar pool widths, numeric motion-state IDs, complete engine-wide lifetimes, firedashing attribution, and stronger shared-character or helplessness claims remain deferred. The handoff's source-level functionality and conservative empty proposal are reconciled without new fact or link writes.

Status: synthesized; independent review and live promotion pending.
