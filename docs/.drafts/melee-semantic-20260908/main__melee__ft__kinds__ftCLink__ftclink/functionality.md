# Young Link initialization and integration

This unit defines Young Link's character-specific motion dispatch, resource descriptors, and fighter event adapters. Its header declares the callbacks and exported resource objects. Canonical and rendered views were read completely; rendered names were treated as hypotheses, not independent evidence.

## Motion and resource definitions

The table contains 21 initializers, with source comments identifying motion IDs 341–361: the second forward-smash swing, two AppealS variants, grounded/aerial neutral-special phases, side-special phases and empty variants, up and down specials, and AirCatch/AirCatchHit. Initial side-special throws, empty side-special variants, and down specials have null IASA slots. Grounded and aerial flags are not interchangeable. Every record supplies the camera-box callback. Resource declarations include fighter and animation archive names, four demo labels, five costume descriptors, and a separate five-entry costume-list declaration. These are source-level observations, not proof of compiled section sizes, padding, or physical layout.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCLink/ftclink.c#L32-L300

## Loading and death

OnLoad enables wall jumping, derives `attackairlw_hit_anim_frame_end` through the animation helper chain using entry 72, installs Link-format attributes through `ftLk_Init_OnLoadForCLink`, registers resources 0–5, and passes resource 6 to the fighter-parts helper. The article registration helper indexes its table by `kind - It_Kind_Kuriboh`. The separate special-attribute loader delegates to Link's copy-and-scale routine, which adjusts the SpecialHi vertical offset only when vertical scale differs from 1.

OnDeath queues selection 0 for model groups 0, 1, and 2 and clears Link-family transient state, including boomerang, arrow, and milk references. The repeated assignment to `xC` is preserved. Reference clearing does not itself prove article destruction.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCLink/ftclink.c#L302-L338; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftLink/ftlink.c#L401-L407; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/it_26B1.c#L205-L208

## Item and knockback adapters

Extended pickup/drop handlers queue model-group 2 on every invocation and model-group 1 only when `itIsHeavy(...) == true`; pickup selects 1 and drop selects 0 before ordinary event forwarding. The ordinary adapters pass the original flag plus fixed arguments 1 and 1. Shared pickup handling excludes heavy items and distinguishes hold kinds; shared drop handling resets the hold pose without that heavy-item guard. Visible/invisible handlers skip heavy items. Knockback adapters pass selector 1; the shared parameter is `s32`, not a proven boolean option, and the shared routines call the animation helper for selectors 1 and 0 with 3.0 on entry or 0.0 on exit.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCLink/ftclink.c#L340-L402; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/inlines.h#L142-L205

## Passive shield: important baseline correction

`ftCl_Init_8014919C` tests pending model selection `x5F4_arr[2].prev == 0`, not an inactive collision-list pointer. The parts setter and application routine establish this field's selection semantics. The collision helper installs `shield_hit_cb` and the descriptor's bone, radius, and position, resetting flags before the CLink wrapper enables bits 2–4. Neither routine changes the selection guard, so eligible repeated calls can reinstall the descriptor; the baseline's skip-while-active explanation is unsupported.

The registered hit callback computes the shared guard response, multiplies by common `x294`, preserves the computed sign when `specialn_facing_dir < 0.0f`, and negates otherwise. It then requests sound 70106 with arguments 127 and 64. It contains no local motion transition or velocity clamp. Positivity of the computed value is not guaranteed without attribute constraints.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCLink/ftclink.c#L404-L431; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftparts.c#L555-L577; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftcoll.c#L3175-L3187

## Milk-taunt lifetime and numeric commands

Taunt entry supplies IDs 342 and 343 to the common selector, then clears command slot 1. The selector disables interruption and chooses 343 only for facing direction exactly -1 with an available animation; otherwise it chooses 342.

The AppealS animation spawns milk when command slot 1 equals 1 and the tracked reference is absent. Successful creation installs Link-family damage/death cleanup callbacks. Command 2 invokes milk removal, and animation completion invokes the same underlying cleanup. The resolved inline null-checks the fighter and tracked item, calls item-side detach/removal, then clears the fighter reference. Link-family interruption cleanup also reaches this wrapper.

The invalid-association predicate returns true for a missing object, missing fighter, motion other than 342/343, or absent tracked reference. It does not compare that reference with the calling item. Item-side notification clears the fighter reference only if its recorded parent remains its current owner, then clears reciprocal item references. The local unset callback clears only the fighter reference and retains a redundant inner null branch.

Crucially, project `bool` is `typedef int`. `ftCl_Init_801492F4` returns the raw command slot, not a normalized nonzero predicate. The milk animation shows its model only when its previously sampled item command equals exactly 1, then samples the fighter command for a subsequent update. Values 0, 1, and 2 must remain distinct.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCLink/ftclink.c#L433-L492; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCLink/ftclinkappeals.c#L20-L46; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCLink/inlines.h#L13-L30; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/kinds/itclinkmilk.c#L66-L129; code://c302741689bd67c361cd7faadb221df3193992c3/src/MSL/stdbool.h#L4-L14

## Review outcome

The checkpoint ledger explicitly covers all 107 baseline facts and 58 links: 92 facts retained and 15 unresolved; 56 links retained and 2 unresolved. Historical duplicate links retain their distinct original IDs. No compiled artifacts were supplied, and no source or knowledge-base writes were performed.

Status: synthesized; independent review and live promotion pending.
