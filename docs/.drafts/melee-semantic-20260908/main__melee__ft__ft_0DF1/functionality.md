## Common C-stick command predicates

`ft_0DF1.c` exports twenty `bool(Fighter*)` predicates; the header declares the same interface. Both canonical and rendered files were read completely. Rendered names are plausible semantic hypotheses, not recovered historical symbols. No equivalent-name rewrites are proposed.

The predicates read current (`cstick[0]`) and previous (`cstick[1]`) processed input, common thresholds, and selected contextual inputs without performing fighter-state transitions. Horizontal smash and aerial recognition use absolute-axis activation edges. Upward and downward smash predicates use signed crossings. Item-qualified wrappers additionally require Single-Button Mode to be off **or** held-item classification to be zero. The inline helper's explanatory AND wording does not match its OR expression. Item dereferencing is short-circuited outside Single-Button Mode; the inspected callers establish held-item validity before invoking the qualified paths.

Other predicates serve ASDI, floor recovery, ledge options, throws, grounded escapes and jump startup. ASDI uses an inclusive squared radial current-sample test, and its hitlag-exit consumer gives qualifying C-stick input priority over the main stick. Floor-roll recognition combines an absolute-X edge with a one-sided signed-angle comparison: `atan2f(y, ABS(x)) < x20_radians`, not an absolute-angle restriction. The floor-attack upward edge is certain locally, but the DownWait caller's `bool msid` leaves orientation-preserving state entry unresolved without type/compiler evidence.

Ledge attack uses an upward edge. Ledge roll uses a facing-relative horizontal edge disabled in Single-Button Mode, independently of the caller's shoulder-button alternative. The ledge activity predicate is a current-axis level test. Its consumer prioritizes the main stick, excludes C-stick input from ordinary climb, and requires a caller-owned latch for release; neutral input re-arms that latch.

Throw recognition distinguishes signed horizontal crossings, an upward edge, and a two-sample downward hold. The shared selector prioritizes horizontal commands, then upward, then downward, and initializes only when the selected motion differs from the current motion. Numeric motion IDs 219–222 are preserved. Victim-dependent initialization and exceptional character branches remain outside this unit.

Grounded roll, spot-dodge and upward jump predicates are current-sample level tests, not flick detectors. Escape consumers retain their main-stick alternatives and character-specific initialization. Jump recognition first tries ordinary jump input; C-stick success enters KneeBend with a stored input-source discriminator. KneeBend uses that source for later release-based short-hop recognition, after its ordered interrupt checks.

Two baseline explanations incorrectly assign neutral outcomes to accepted fresh C-stick edges. Those edges require at least one current axis to reach its threshold, whereas the shared neutral branches require both axes below their thresholds. Corrections separate accepted directional C-stick commands from the selectors' fallback neutral behavior.

The `.sdata2` subject and all twenty parameter subjects were enumerated and contain no baseline facts. No compiled section contents, layout, historical symbol spelling, or numeric threshold values are inferred.

Status: synthesized; independent review and live promotion pending.
