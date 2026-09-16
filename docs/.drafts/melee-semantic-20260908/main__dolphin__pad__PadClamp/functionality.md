## PAD analog conditioning

`PADClamp` traverses exactly four consecutive mutable `PADStatus` records. Only records whose `err` equals `PAD_ERR_NONE` are transformed; all other records remain untouched, and processing continues to later slots. Successful records have both stick vectors and both analog triggers updated in place. No pointer is retained or storage allocated.

`ClampRegion` declares trigger thresholds 30/180, main-stick thresholds `(max=72, xy=40, min=15)`, and substick thresholds `(max=59, xy=31, min=15)`. These are initialized configuration values, not proof of immutability or compiled section placement.

`ClampStick` promotes signed input bytes to integers, saves signs, and removes a center margin independently from each magnitude. Magnitudes at or below `min` become zero. If both adjusted coordinates are zero, it clears both outputs and returns. Otherwise, two symmetric branches compute a weighted boundary denominator. With the supplied positive thresholds, the larger coordinate selects the major-axis formula. Scaling occurs only when the denominator exceeds `xy * max`; each coordinate is independently integer-divided before its sign is restored. Thus the intended proportional projection onto the configured octagonal boundary is quantized: output may lie inside the boundary and its direction need not be exactly preserved. The function does not validate arbitrary threshold combinations.

`ClampTrigger` maps values at or below the minimum to zero, caps larger values at the maximum, then subtracts the minimum. With the initializer, outputs range from 0 through 150.

Evidence: [configuration and complete implementation](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/src/dolphin/pad/PadClamp.c#L8-L118).

## Semantic and rendered review

All 119 canonical and rendered lines were reviewed. The rendered view reports no parse errors and no substitutions; its coverage is function names only. `ClampStick` and `PADClamp` remain useful canonical names. `ClampTrigger` has no KB identity in the rendered report. Parameter and data names were assessed from canonical declarations, not inferred from renderer substitutions. Existing conditioning knowledge and all five conceptual relationships are retained, with one purpose correction for integer quantization and two unresolved compiled-section assertions.

Status: synthesized; independent review and live promotion pending.
