# Ledge escape and shared climb processing

Draft at `c302741689bd67c361cd7faadb221df3193992c3`.

Ledge-wait IASA tries attack, escape, jump and climb/drop checks in order. The escape check accepts LR input or its shared secondary predicate and calls ftCo_8009B040. Entry selects Quick only for damage strictly below signed common x488; equal-or-greater values select Slow. It requests flags zero, frame zero, speed one, blend zero and no alternate source, runs animation initialization, stores 32 in x1A6A, sets x221D_b7/b5 and immediately invokes cliff-catch physics. A valid ledge is used for pose-relative position; a failed ledge test enters Fall instead.

Both escape state-table entries install the four canonical callbacks. Anim forwards to CliffClimb animation completion, which invokes ftCommon_8007D92C when frames end; that helper chooses Fall while airborne and common action-end handling while grounded. IASA is empty and provides no input-driven interruption. Phys and Coll forward unchanged to shared CliffClimb processing. Airborne physics places the fighter using ledge geometry and animation translation, converts to ground when both translation components are nonnegative, and falls if the ledge becomes invalid. Grounded physics delegates to ft_80084FA8. Collision branches on ground/air and delegates its tests/transitions; the wrapper adds no policy.

The five signatures agree with the header. Existing ftCo_CliffEscape_Enter remains a supported hypothesis; canonical callback names are preserved.

## Literal pool and permissions

Both existing objects have the same 16 bytes: `000000003f8000004330000080000000`. These are two f32 values (0 and 1), followed by the f64 signed-conversion bias 4503601774854144. Assembly loads signed x488, flips its sign bit and subtracts that bias before the damage comparison. The old description as a single-precision pool omitted this double.

Source object flags are 0x3 (WRITE|ALLOC); split-object flags are 0x2 (ALLOC). The source reads literals and never writes them, but that does not make the source-object section nonwritable or prove final runtime protection. Hashed ELF, assembly and frozen-report evidence is recorded separately. No build ran.

All outgoing links are individually retained using canonical ledge-input, state-table and callback evidence. Their historical rationale/locator is preserved without claiming the PR or Discord message was re-read.

## Canonical evidence

- code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_CliffEscape.c#L13-L41
- code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_CliffClimb.c#L1-L137
- code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftcliffcommon.c#L110-L126
- code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftmotionstates.c#L2972-L2993
- code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_CliffAttack.c#L69-L86
- code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_CliffWait.c#L43-L50
- code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftcommon.c#L596-L604
- code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftcommon.c#L906-L909
- code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftanim.c#L380-L386
- code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/types.h#L330-L338
