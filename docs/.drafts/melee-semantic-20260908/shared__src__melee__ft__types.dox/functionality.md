### Fighter type documentation
`src/melee/ft/types.dox` supplies Doxygen annotations for `melee/ft/types.h`, not executable definitions. It describes `ftCommonData` as pointing to `PlCo.dat` and documents stick/trigger quantization, input deadzones and thresholds, movement taper/friction, dash and tap-jump windows, powershield timing, teetering, and Leadead capture parameters (code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/types.dox#L1-L116). GALE01 data values are documentation claims; the comments explicitly distinguish ordinary and relaxed tap-jump thresholds and describe above-walk-speed friction as limited to wait/turn.

The remaining annotations describe `ftCo_DatAttrs` walk acceleration components, hit-spark values (`0` normal, `1` none), a reportedly unused field, side-special ground-velocity retention endpoints, and screw-attack-item launch velocity (code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/types.dox#L118-L144). No additional numeric cases, runtime branches, object lifetimes, or compiled layout are established here.

All 144 canonical and rendered lines were reviewed. Rendering has zero substitutions and zero parse errors; it leaves these comments and field references unchanged, providing no independent behavioral corroboration. The frozen subject and link inventories are empty. No supported semantic correction or rename is warranted within this owned documentation file; spelling-only edits are not proposed.

Status: synthesized; independent review and live promotion pending.
