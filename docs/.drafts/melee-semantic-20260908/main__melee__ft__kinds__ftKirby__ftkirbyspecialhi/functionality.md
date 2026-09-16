# Kirby SpecialHi / Final Cutter

## Entry and phase progression
Grounded and aerial entry clear command slots 0–3 and SpecialHi fields x0, x4, x8.i and xC, enter their respective first phases, invoke animation setup, spawn effect 0x494, set x2219_b0, and install effect-hitlag callbacks. Both first-phase animation callbacks advance to SpecialAirHi2 when animation frames expire. The grounded version clears specialhi.x0; the aerial version writes through the displayed union member specialn_pe.facing_dir. These expressions are preserved rather than silently renamed. SpecialHi2_Anim uses numeric destination 0x187; the analogous aerial callback explicitly selects SpecialAirHi3. Analogy alone is not treated as proof of numeric-state identity. Both phase-3 animation callbacks are empty. Ending animation callbacks clear part-0 X rotation and dispatch to ft_8008A2BC when grounded or ftCo_Fall_Enter otherwise.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftKirby/ftkirbyspecialhi.c#L63-L177

## Input and movement
Only first-phase IASA callbacks process move-specific input. Reversal requires command slot 3 and specialhi.x4 both clear, horizontal-stick magnitude strictly greater than the configured threshold, and input opposite a facing value of +1 or -1. Success sets both guards before updating facing and part-0 Y rotation. Later IASA callbacks are empty; this establishes local absence of IASA processing, not global immunity to interruption.

Grounded phases 1–3 apply move-scaled horizontal conditioning followed by ground movement, with different preliminary helper calls in phases 1 and 2. Aerial phases 1 and 2 first obtain animation-translation velocity, then multiply positive vertical velocity by the configured momentum factor and apply scaled horizontal drift. The multiplication is proven; attenuation requires the actual attribute value. Aerial phase 3 only performs the horizontal update. Grounded phase 4 delegates to common movement whose translation-active branch bypasses ordinary friction; aerial ending physics delegates to translation-derived x/y velocity assignment.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftKirby/ftkirbyspecialhi.c#L179-L342; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ft_084E.c#L55-L88; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ft_084E.c#L120-L125

## Collision and exceptional branches
First-phase counterpart conversions preserve the exact source predicates: grounded collision tests ft_80082708 == GA_Ground, whereas aerial collision tests ft_80081D0C != GA_Ground. Both restore callbacks and clear y/z self-velocity; the grounded-to-air path also clears X rotation.

Phase-2 collision callbacks use the displayed specialn_pe.facing_dir field as a counter. While it is at most 0x14 they increment it and run the early collision helpers. Above that threshold, accepted ground/ledge contact has priority over cliff handling. A successful contact increments the counter; unsuccessful mature checks do not. Ground-named phase-2 and phase-3 callbacks select SpecialAirHi4, while aerial counterparts select SpecialHi4. These asymmetric destinations are retained literally. Contact transitions restore callbacks, install the projectile accessory callback, clear all self-velocity components and ground velocity, and align part 0 using facing_dir * atan2f(floor.normal.x, floor.normal.y).

Ending collision callbacks preserve move continuity across ground/air changes, reinstall the accessory callback, and alternate between slope alignment and neutral rotation. Reinstalling that callback does not itself clear the projectile's one-shot guard.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftKirby/ftkirbyspecialhi.c#L344-L539

## Projectile and cleanup lifetimes
fn_800F21E8 acts only when specialhi.xC is zero and command slot 2 is nonzero. It consumes the command and commits xC before external effect or item operations. It obtains a joint-based position, applies facing-dependent horizontal and configured vertical offsets, sets z to zero, requests effect flag 1, subtracts one from y, and invokes it_8029BAB8. The constructor explicitly selects It_Kind_Kirby_CBeam and can fail allocation. Because the fighter guard was already committed, allocation failure does not cause a retry. The constructor copies the supplied position into spawn.prev_pos and separately obtains spawn.pos; these are not conflated. Successful item initialization establishes its own speed, angle and lifetime.

ftKb_AttackDashAir_800F22D4 unconditionally resets part-0 X rotation. Both ftKb_Init_800EE74C and ftKb_Init_800EE7B8 call it in broader cleanup sequences. Its descriptive SpecialHi reset name remains a hypothesis, not a recovered original symbol or proof of exclusive use during normal move completion.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftKirby/ftkirbyspecialhi.c#L35-L98; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/kinds/itkirbycutterbeam.c#L22-L72; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftKirby/ftkirby.c#L2580-L2601

## Evidence boundaries
Research coverage and unchanged dispositions are inherited through the hash-bound handoff. The lead independently read all owned canonical/rendered pages and the contextual evidence cited above. Rendered substitutions are hypotheses, not independent proof. No compiled artifacts were supplied; recurring C literals do not establish .sdata2 contents, layout, or consumers. The header supplies declarations, not compiled-layout evidence.

Status: synthesized; independent review and live promotion pending.
