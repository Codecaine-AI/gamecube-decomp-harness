## Functionality

`ftCo_800BF034` enters `ftCo_MS_DeadUpFallHitCameraIce`; `ftCo_800BF108` enters `ftCo_MS_Sleep`. Both pass `Ft_MF_None`, frame 0, speed 1, blend 0 and NULL to `Fighter_ChangeMotionState`, then set `x2219_b2` and `x2219_b1`. Neither entry guards its fighter input.

Both entries dispatch Fox and Ness to character-specific item constructors using the translated `FtPart_RThumbNb` attachment part. Sleep additionally constructs a Dr. Mario vitamin using current position, facing, `ftMr_SpecialN_VitaminRandom`, and selector 2. Constructor results are stored without success checks. Other fighter kinds do not assign `item_gobj` through these switches. The independently inspected constructors permit allocation failure, retain fighter references, and attach successful results; the pill attaches specifically for selector 2. They initialize spawn velocity and damage fields to zero, which alone does not establish every subsequent gameplay property.

`ftCo_800BF228` is a read-only predicate: null object or null Fighter returns false; otherwise it compares `motion_id` against exactly the two named constants. No item ownership or lifetime is validated by this predicate. Blaster, bat and pill animation callbacks use it to gate uniform item scaling from the referenced fighter root's Y scale—not a componentwise copy of the fighter scale vector. Cleanup and reference removal occur outside this unit.

## Semantic assessment

The rendered entry names fit the canonical state-entry operations. `Sleep_EnterWithItem` describes conditional character-specific setup, not guaranteed item creation. Header declarations match the definitions; both rendered files have no reported parsing or substitution issues. No cosmetic renaming is proposed.

All eight subjects, 24 facts and five links were enumerated and explicitly accounted for in checkpoints. Fifteen facts and four links are retained; eight facts and one link are unresolved; one data-flow fact is superseded with the scale-broadcast correction. Source-local zero initializers do not establish `.sdata2` contents, pooling, size or references. Broader Screen KO, parked-Sleep and vitamin-history interpretations are explicitly deferred rather than treated as proven by names or prior findings.

Status: synthesized; independent review and live promotion pending.
