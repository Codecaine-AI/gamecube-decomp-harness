## GXTev semantic review

The unit implements hardware-facing GX configuration for TEV color/alpha operands and operations, regular and konst colors, konst selectors, channel swaps, stage routing/count, alpha testing and Z-texturing. Existing API names fit the canonical behavior; the rendered file contains no name substitutions or parse errors. Parameter subjects have no baseline facts, and no unsupported parameter renames are proposed.

### Behavior preserved
- `GXSetTevOp` expands five presets, using raster inputs for stage zero and previous-result inputs for later stages. Both operation setters receive clamped, unbiased, unit-scale addition to `GX_TEVPREV`.
- Color and alpha operation setters distinguish `op <= 1` from comparison encoding. The latter derives the scale-position bits from `op` and forces the bias-position field to 3; this does not validate every possible numeric operation value.
- Regular and signed color uploads emit RA once and BG three times. Konst uploads emit each word once. The source does not explain the repeated-write hardware rationale.
- Konst selectors and swap tables share cached `tevKsel` words but occupy separate fields. Per-stage raster/texture swap selectors occupy the low four bits of `teva`.
- `GXSetTevOrder` retains the original map separately from the sanitized hardware encoding. Null/disable handling is distinct from source-zero fallback. It emits routing immediately and marks dirty category 1; `GXSetNumTevStages` instead caches count minus one and marks category 4 for later general-mode emission.
- Alpha comparison emits a complete configuration on every call; redundant suppression belongs to HSD's wrapper. HSD signed-color pending markers are cleared after upload. Rectangle erasure uses replacement Z-texturing for depth writes and disables it after the draw.

### Corrections and uncertainties
Two state descriptions need correction: `bpSent` must not be described exclusively as a special BP-mask-command indicator, and invalid-enum assertions do not uniformly prevent later configuration. Invalid Z format falls back to type 2 if execution continues; invalid preset mode still reaches the common operation setters. Clamp mode remains an assertion-only unsupported stub with no GX state writes. Assertion statements are not proof of release-build rejection.

The source proves the identifier, nine-int initializer and routing role of local static `c2r`, but no compiled evidence establishes its association with the `.data` target. Its five baseline facts and one link remain unresolved rather than being renamed or cleared.

Coverage is complete for both owned reading views, all 76 frozen subjects, all 93 facts and all 27 links. The checkpoint explicitly retains 86 facts and 26 links, supersedes two facts, and leaves five facts plus one link unresolved.

Status: synthesized; independent review and live promotion pending.
