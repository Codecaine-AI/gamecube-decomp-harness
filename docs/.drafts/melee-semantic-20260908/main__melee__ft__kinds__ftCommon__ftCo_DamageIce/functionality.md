## DamageIce semantic review

The hash-bound research handoff establishes coverage of all 515 C lines and 22 header lines in canonical and rendered views, all 42 subjects, 109 baseline facts and 66 links. Supported names and explanations are explicitly retained through the inherited ledger. This lead independently checked targeted canonical proposal and contradiction evidence; unchanged research rows were not re-audited in full.

Initial freezing enters DamageIce, initializes damage-scaled confinement, adjusts skeletal translation with rotation-aware transforms, transfers pending knockback into active movement, and constructs the ice collision box, effect, replacement hurtbox and damage callbacks. Rehit reconstruction retains graphics and refreshes movement and frozen geometry but does not repeat initial grab-timer or skeletal-translation initialization.

Frozen animation independently guards airborne rotation and passive timer decay, always invokes mash processing, and dispatches release when the resulting timer is nonpositive. The secondary hit callback subtracts damage-scaled duration without clamping; fire overwrites the timer with zero but performs no local motion transition. Both IASA callbacks are empty, not global guarantees against externally driven transitions.

Frozen physics permits movement: airborne braking and scaled gravity or grounded traction. Air collision selects its probe at frame 3, prioritizes right wall, left wall and ceiling before floor grounding, and records the direction after the impact helper returns—even if that helper changed motion state. Impact handling preserves the strict speed threshold, duplicated RightWallHug test, X/Y-only scaling after reflection, and conditional grounding. The reflection/scaling path is the comparison's else branch, including unordered comparisons; no multiplier bounds are established here, so neither attenuation nor rebound is guaranteed. Its high-speed exit delegates to a helper with a parasol exception and otherwise a literal 0x26 motion-state selection.

Timer release prioritizes held-Hammer handling. Otherwise it enters DamageIceJump, emits breakout presentation, initializes stick-controlled horizontal and configured vertical velocity, and starts a float countdown. Only a positive countdown is decremented; Fall is entered when that decrement makes it nonpositive. An initially zero or negative countdown does not trigger this animation callback's Fall transition, and the configured timer does not establish a universally brief duration. Shared collision processing can resolve eligible floor contact, wall jump or ledge grab first.

The effect-spawn helper also participates in frozen upper-KO lifetimes, including recreation after a transition to literal motion 10. Ground recovery arbitration preserves directional recovery priority, the second path's literal 199, and orientation-sensitive fallback rather than promising neutral Passive followed by unconditional knockdown.

Rendered SetupECB, SpawnEffect, CheckGroundTransition and DamageIceJump_Enter names fit their canonical roles. The renderer reports a shared proposed name for distinct collision wrappers; those names were not used as proof of equivalent behavior. Source declarations and unvalidated archived summaries do not establish compiled section layout.

Status: synthesized; independent review and live promotion pending.
