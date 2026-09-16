# Common forward-smash semantic review

The canonical implementation and rendered views agree on the module's role: recognizing forward-smash commands, prioritizing held-item substitutions, dispatching character-specific entries, selecting common angled variants, and providing animation, interruption, physics and collision callbacks. The header exposes the two boolean input predicates and four lifecycle callbacks. Rendering reported no parse errors; substituted names are hypotheses, not independent evidence.

## Recognition and item priority

The general predicate requires an A press, sufficient horizontal main-stick magnitude and a tilt timer strictly below the common window. If that fails, it tries the horizontal C-stick threshold-crossing predicate. The Dash-specific predicate instead accepts A plus sufficient main-stick input along current facing without the general tilt-timer test. Its opening-Dash caller independently supports retaining `ftCo_AttackS4_CheckInputFromDash`. Both routes preserve the activating stick's folded angle, `atan2(y, abs(x))`, and try held-item handling before fighter entry.

Held-item handling preserves the exact numeric classifications. Held L/R, classification 0, classification 3 with `it_8026B594`, or `ftCo_800DF21C` permits a light smash throw. The requested direction multiplied by current facing selects LightThrowF4 versus LightThrowB4. Otherwise classification 2 updates facing and invokes the item attack with mode 2; classification 3 updates facing and invokes the shooting entry. No item or an unhandled classification returns false.

## Entry and state selection

`decideFighter` writes facing before every branch. Ness, Peach and Game & Watch receive only the fighter object through specialized entries. Pikachu and Pichu use common angle selection and then install effect-hitlag callbacks; other kinds use common selection without that extra setup. The specialized branches do not consume the supplied stick angle.

Common entry preserves this exact ordered lookup-to-selection ladder: angle above xB8 with nonzero AttackS4S x8 selects AttackS4Hi; otherwise above xBC with nonzero AttackS4LwS x8 selects AttackS4HiS; otherwise below xC4 with nonzero AttackLw4 x8 selects AttackS4Lw; otherwise below xC0 with nonzero AttackHi4 x8 selects AttackS4LwS; otherwise AttackS4S. These surprising lookup names must not be normalized to the selected states. The lookup directly indexes the supplied ID, with conditional Nana-to-Popo fallback. Its x8 field is size_t, not a pointer. Entry clears allow_interrupt, command variable 0 and throw_flags, changes motion with frame 0/rate 1, and initializes animation.

## Lifecycle and cross-file ownership

Animation expiry delegates to common completion. Ordinary completion reaches Wait, but boss, DownSpot and other exceptional handling prevent an unconditional Wait claim. IASA uses first-success priority: when interruption is allowed, side/up/neutral/down specials precede grab; the second-smash command check follows independently of allow_interrupt, but only if earlier checks did not succeed. Its predicate requires nonzero command variable 0 and an A press; its entry supports Link and Young Link and asserts for unsupported kinds. The remaining interrupt-gated checks preserve the canonical smash, tilt, jab, guard, appeal, jump, dash, squat, turn and walk order. The Attack100-named functions in the initial group actually dispatch special-move tables, not rapid jab.

Physics delegates to shared ground processing, including the strict above-walk-speed friction multiplier and animation-translation alternative to friction. Collision delegates unchanged to a helper that enters Fall when its ground check fails. Neither wrapper contains its own transition logic.

Specialized resource lifetimes remain outside common entry: Ness creates and removes a bat and installs damage/death callbacks on successful creation; Peach stores the previous random weapon motion to avoid an immediate repeat; Game & Watch defers torch creation through accessory4_cb and handles its hitlag and removal in the character module.

## Compiled evidence and dispositions

The hash-bound upstream research reports that section-evidence.json supports the compiler-generated .data dispatch table with 17 relocated code destinations and explicitly recorded source/split size differences. It also reports zero, one and minus-one float words in .sdata2, with source WRITE|ALLOC versus split ALLOC flags. These compiled findings are inherited: this lead could not restore or access the underlying section-evidence.json artifact and does not independently establish its contents. Final runtime protection remains unestablished. The unqualified read-only type claim remains unresolved, and the purpose correction omits that assertion.

Supported existing knowledge and all unchanged research dispositions are explicitly retained through handoff adoption. Four factual corrections address specialized angle consumption, horizontal versus fighter-relative direction, literal-pool permission wording and the mistaken rapid-jab interpretation. All 47 baseline link dispositions are inherited without re-emission or merging historical IDs.

Status: synthesized; independent review and live promotion pending.
