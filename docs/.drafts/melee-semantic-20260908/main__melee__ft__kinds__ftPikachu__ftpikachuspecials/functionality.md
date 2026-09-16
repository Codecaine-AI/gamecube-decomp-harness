## Pikachu side-special semantic review

The inherited research establishes complete canonical/rendered coverage of the C and header, all 114 frozen subjects, and all 105 links. This distinct lead independently inspected every proposed fact's citation ranges and the upstream contradiction evidence. Supported existing knowledge and unchanged research dispositions are retained; seven factual corrections are adopted. Rendered identifiers remain hypotheses, not independent evidence.

### Lifecycle

The move implements Skull Bash through grounded and aerial startup, charge hold, release, travel, and ending callbacks. The inherited motion-state mapping is startup 343/348, hold 344/349, S0 release 347/352, S1 345/350, and ending 346/351. Numeric ordering must not be substituted for phase ordering. Grounded S1's four callbacks are empty; aerial S1 implements travel.

Entry installs `ftPk_SpecialN_80124DC8` in `x21EC`, divides inherited horizontal velocity by attribute `x30`, and additionally clears vertical self velocity for aerial entry. Startup animation completion enters hold. Hold increments `mv.pk.unk3.x0` before testing the strict condition `charge > x24`; B absence in `held_buttons[0]` provides the separate manual-release path. Animation exhaustion clears effects and rearms `accessory4_cb`; it does not locally rewind animation.

S0 updates enabled hit capsule 0 with `charge * x2C + x28`. Independently, command variable 0 triggers travel entry. The grounded path first invokes airborne setup. Travel entry computes charge-scaled horizontal and vertical velocity, selects state 350 at the current animation frame with KeepGfx and SkipHit, and installs `x21F8` and the damage-dealt callback. The vertical formula is not clamped to the value at charge `x24`.

Aerial travel selects gravity from `x48` or `x58` according to command variable 0, always uses `x4C` as its terminal-speed argument, and applies `x54` air friction only in the nonzero-command mode. The inherited common-helper review establishes that air friction writes horizontal animation velocity and falling changes vertical self velocity. Damage response clears horizontal self velocity and nonnegative vertical self velocity, preserves negative vertical velocity, and enters aerial ending. Ending initializers clear command variable 0 and divide the relevant horizontal velocity by `x50`.

### Exceptional paths and uncertainty

Aerial S1 collision has two sequential independent guards. The wall test still executes after the first transition; it is not an alternative `else` path. Grounded ending collision calls ordinary Fall directly rather than converting to aerial SpecialSEnd. Grounded ending animation delegates to the common action-ending helper; the inherited review preserves its exceptional guards and special-kind dispatches rather than describing an unconditional Wait transition.

Collision-condition descriptions remain unresolved: this revision declares GA_Ground=0 and GA_Air=1, while grounded callbacks negate the enum-returning helper and aerial callbacks test its nonzero result. The literal calls and transition destinations are clear, but rendered names and historical landing/ledge-loss explanations cannot resolve this mismatch. Direction-based transition-helper names remain supported by their actual common-helper calls.

Callback installation is deferred and crosses file boundaries: effect callbacks and the entry setup callback are defined outside this TU. Local absence of a charge reset or callback clear does not establish their complete runtime lifetime. No compiled evidence was delivered for `.sdata2`; source literals do not prove its layout, literal-slot types, or load attribution.

Status: synthesized; independent review and live promotion pending.
