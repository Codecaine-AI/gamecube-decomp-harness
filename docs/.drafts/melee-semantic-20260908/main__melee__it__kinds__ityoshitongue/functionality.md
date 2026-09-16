## Yoshi tongue item lifecycle

The module installs a one-entry `ItemStateTable` on an existing item supplied by Yoshi's grounded or aerial SpecialN target-item callbacks. Setup stores the fighter in both `atk_victim` and `grab_victim`, clears `xDD0_flag.b1`, supplies the article attachment bone and Yoshi SpecialN bone to the attachment helper, and selects item state **0**. The table's motion index is **-1**, a distinct value. Animation and collision callbacks return false; physics is empty. These callbacks supply no autonomous updates or transitions. [Source](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/kinds/ityoshitongue.c#L17-L55)

Cleanup removes the attachment, samples the retained fighter's SpecialN bone into `item->pos`, calls two conditional player-reporting helpers, optionally resets `destroy_type` to **0**, clears the two item-side fighter references, and invokes final cleanup/destruction. The reporting helpers are not relationship-unregistration routines. Cleanup requires a valid retained fighter reference and has no local null guard. [Cleanup](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/kinds/ityoshitongue.c#L57-L74) · [Reporting helpers](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/it_279C.c#L1649-L1689)

The fighter owns the other half of the lifetime: ordinary script cleanup requires `cmd_vars[1]` and a non-null target item, passes false, then clears `target_item_gobj` and `x1A64`. Egg creation is a separate block guarded by `cmd_vars[0]` and `specialn.x0_b0`; cleanup and egg creation are not an unconditional same-frame operation. The fighter-victim branch is separate from this item-target branch. [SpecialN](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftYoshi/ftyoshispecialn.c#L357-L447)

General fighter cleanup checks for a target item and passes true only in `ftYs_MS_SpecialN1_1`, `ftYs_MS_SpecialN2_1`, `ftYs_MS_SpecialAirN1_2`, or `ftYs_MS_SpecialAirN2_1`; otherwise it passes false. It subsequently clears the fighter-side pointers. No additional meaning is assigned to numeric `destroy_type` zero. [General cleanup](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftYoshi/ftyoshispecialhi.c#L36-L51)

## Semantic review

The rendered Setup, Destroy, and animation-callback names remain useful semantic hypotheses, not recovered original spellings. Both owned rendered files were complete and parsed without errors. Existing supported knowledge is retained explicitly in the checkpoint; two cleanup explanations are corrected because canonical helper bodies contradict the claimed unregistration behavior. The `.sdata2` fact remains unresolved: no compiled artifact establishes its payload or section layout.

Status: synthesized; independent review and live promotion pending.
