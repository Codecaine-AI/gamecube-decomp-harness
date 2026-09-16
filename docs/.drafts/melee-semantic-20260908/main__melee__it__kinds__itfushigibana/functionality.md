## Fushigibana summon controller

The owned C file implements a three-state item controller; the header declares its callbacks and state table. Both canonical and rendered files were reviewed completely, along with all 31 baseline subjects, 88 facts and 22 links. The checkpoint contains explicit dispositions for every baseline ID: 74 retained facts, 11 superseded facts, three unresolved facts; 21 retained links and one unresolved link.

### State and lifetime behavior

- **State 0 — appearance:** spawn reads special attributes, performs shared setup, plays sound `0x272f`, initializes the Fushigibana flag and interval, and enters state 0. Its animation callback delegates appearance scaling; its physics callback delegates shared startup physics and ignores the helper's completion result. Its collision path supplies `it_802D705C` as the landing callback.
- **State 1 — grounded activity:** entry selects state 1, installs effect pause/resume hitlag callbacks, and sets `fushigibana.x60.b0`. The animation callback repeats that initialization when `it_80272C6C` returns zero. Independently, an exactly zero `x64` reloads the interval and calls `it_80275288(gobj, 4, 0x2730)`. The canonical callee selects **audio**, using `0x2730 + HSD_Randi(4)`, rather than emitting graphical effect `0x2730`. The callback then decrements `x64`, decrements the lifetime, and returns whether the resulting lifetime is nonpositive. A true animation callback result requests destruction in the shared dispatcher. State-1 physics is empty.
- **State 2 — falling:** failed support testing enters state 2. Its table animation identifier is `-1`, distinct from state index 2; the entry routine subsequently evaluates descriptor 0 at frame 0, removes its animation, and clears the command pointer. Its animation callback returns false. Physics delegates a sign-dependent, pre-subtraction speed-threshold test: this is not a terminal-speed clamp and can overshoot the threshold. Qualified landing returns through the same `it_802D705C` callback used by appearance landing.

Neither state-2 entry nor its local callbacks reset the Fushigibana interval, lifetime, or `x60.b0`. Thus the flag is not an exact current-state predicate, and local interval/lifetime ticking is suspended while falling. This does not imply immunity from other shared destruction paths.

### Exceptional paths and cross-file boundaries

Appearance landing and falling-state landing use different shared collision routines. Falling-state landing requires additional checks before invoking the callback. Grounded collision also retains a supported-floor exceptional branch calling `Item_8026ADC0`; its local false result must not be interpreted as guaranteed survival. Surface alignment is called after ground processing but is internally gated by floor collision flags.

### Semantic assessment

The existing rendered names `Spawn_Phys`, `Attack_Coll`, `Fall_Anim`, `Fall_Coll`, `EnterAirState0`, and `EnterFallState2` fit their canonical roles and are retained. They remain descriptive hypotheses rather than recovered historical names. The rendered randomized-SFX helper name agrees with its canonical implementation; baseline explanations attributing the interval directly to ground/debris production need correction. Broad existing Venusaur/Earthquake lifecycle associations are retained as pinned contextual knowledge, without treating those associations as proof of a particular graphical effect path.

The renderer reported no parse errors. Its scope is function-name substitution only; unchanged fields, parameters and data labels are not evidence against their semantic interpretation. No compiled section-size or layout claims were established. All three `.sdata2` facts remain unresolved pending compiled evidence.

Status: synthesized; independent review and live promotion pending.
