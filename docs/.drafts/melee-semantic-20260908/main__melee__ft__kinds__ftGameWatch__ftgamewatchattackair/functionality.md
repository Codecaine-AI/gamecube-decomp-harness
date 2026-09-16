## Scope and review
The unit implements Mr. Game & Watch's specialized neutral, back, and up aerials and their landing callbacks, together with fighter-side Parachute, Turtle, and Sparky/Breath article management. Forward and down aerial entry delegate to common aerial handling. Full owned-file, 103-subject and 109-link research coverage is inherited from the hash-bound handoff. The lead independently inspected canonical evidence for all nine proposed corrections and the upstream contradiction evidence. Supported existing knowledge is retained without additional ledger overrides. No function rename or compiled-layout claim is proposed.

## Selection and aerial callbacks
The selector uses the common directional-motion helper, which chooses C-stick input when its input predicate succeeds and otherwise uses the left stick. Neutral, back, and up entry schedule their respective article setup through accessory4_cb. Animation, IASA, physics, and collision callbacks delegate to common processing. The common animation handler can reverse facing through its throw flag and enters Fall when animation ends; IASA uses an allow_interrupt gate and ordered early-return checks.

## Article ownership and lifetime
Setup reuses an existing article through OnLand or attempts creation at TransN, LShoulderN, or LHandN. Successful creation installs shared damage/death and pre/post-hitlag callbacks. Setup always clears accessory4_cb, including creation failure. In contrast, an OnLand callback with no corresponding article does nothing, including leaving accessory4_cb untouched.

Hitlag callbacks independently process every populated aerial-article slot. Item wrappers set or clear xDC8_word.flags.x3; exit also sets x5 when x7 is set. SetFlag routines exit hitlag for all retained aerial articles, clear one article pointer, and clear the shared death2_cb and take_dmg_cb slots. They do not themselves destroy the item or clear the pre/post-hitlag callbacks. Item-side removal notifies the owner before destruction, and fighter-side removal subsequently invokes SetFlag again.

Removal predicates test inclusive motion-ID intervals, not merely membership in two named endpoint states. Their numeric interiors are not expanded here. Item animation also requests removal of ownerless articles; Parachute independently requests removal when its animation frame equals exactly 30. Thus these predicates do not guarantee survival for the entire attack or landing animation.

## Landing and exceptional branches
Landing entry first exits hitlag on each present aerial article. A nonzero cmd_vars[0] selects the dedicated landing initializer and schedules the corresponding OnLand callback; zero selects basic landing followed by character-wide temporary-article cleanup. Basic landing can select HammerLanding rather than ordinary Landing.

All three OnLand routines request their item transition only when motion_id equals ftGw_MS_LandingAirN. This includes Turtle and Sparky despite their association with back and up aerials. Their normal dedicated landing paths therefore must not be described as unconditionally entering item state 1. The source comment's speculative explanation for the Turtle mismatch is not adopted as fact.

Neutral landing initialization uses landingairn_lag; back and up both use landingairb_lag. These direct calls bypass the generic timing-based lag-reduction path. Landing IASA callbacks are empty; physics delegates to common grounded movement. Animation and collision callbacks delegate first, then invoke character-wide cleanup whenever the resulting motion ID differs from their dedicated landing state.

## Evidence limits
Rendered substitutions are hypotheses, not independent proof. Owned function names remain unchanged. Historical full move names, detailed hit descriptions, and PR-history assertions that exceed delivered source evidence remain explicitly unresolved rather than rejected or silently rewritten.

Status: synthesized; independent review and live promotion pending.
