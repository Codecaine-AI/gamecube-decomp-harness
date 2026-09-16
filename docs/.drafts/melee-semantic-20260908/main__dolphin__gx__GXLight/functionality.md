## GXLight semantic review

The complete 616-line canonical and rendered file was reviewed. Rendered function names are unchanged, with no substitutions or parse errors; the established GX API names fit the implementation. Parameter and section names are outside the renderer's substitution coverage.

### Light objects

The private object contains reserved words, packed RGBA color, angular coefficients `a[3]`, distance coefficients `k[3]`, position and direction. Initializers modify CPU-side fields without uploading them. The attenuation getters and separate A/K setters preserve this division. Position is stored unchanged; direction is stored negated and the getter reverses that negation. Direction initialization does not normalize its input. HSD performs the spotlight direction transformation and normalization before calling it.

Spotlight setup converts degrees to radians, evaluates cosine, and derives flat, cosine, cosine-squared, sharp or ring profiles. Cutoffs <=0 or >90 force the off selector; off and unknown selectors write (1,0,0). Cosine is still evaluated on those paths. Distance setup selects linear, mixed or quadratic falloff; negative distance or brightness <=0 or >=1 forces off. Zero distance is not rejected and can reach division by zero. Neither helper explicitly rejects NaNs. Specular helpers either normalize (-nx,-ny,1-nz) or directly store the supplied half-angle vector, and encode a distant position using -1048576 times the direction; the normalization has no zero-magnitude guard.

`GXLoadLightObjImm` selects one of eight singleton light IDs and emits a sixteen-word XF payload at 0x600 + 0x10*index: three zero words, color, angular coefficients, distance coefficients, position and direction. It does not read the object's reserved words. Invalid IDs assert with index zero as the fallback if execution continues. Immediate upload means command emission, not proof of GPU completion. The indexed loader instead emits command 0x38 and a packed index/address word. Immediate loading sets `bpSent=1`; indexed loading sets it to zero. Debug paths additionally maintain verification state.

HSD keeps prepared diffuse and specular objects across calls, uploads them when their respective dirty flags are set, and clears those flags after the load. Startup prepares one baseline object and uploads it to all eight slots.

### Channels

Ambient and material setters preserve cached alpha for RGB-only changes and cached RGB for alpha-only changes; combined IDs replace all components. Invalid identifiers assert and return before writing or updating their shadows. Successful updates emit the selected XF register, set `bpSent=1`, and replace the corresponding cache entry.

`GXSetNumChans` has a 0–2 API precondition, updates the cached general-mode field, emits XF register 9, and ORs dirty bit 4. `GXGeometry` later dispatches that bit to `__GXSetGenMode`, which emits the cached BP word; the dirty dispatcher clears the processed mask. These assertion-based preconditions should not be interpreted as release-build clamping.

`GXSetChanCtrl` reconstructs the complete control word, selects light-mask bits and color sources, and duplicates combined color/alpha settings to the paired register. One baseline explanation incorrectly equates attenuation value zero with disabled attenuation. The enum establishes SPEC=0, SPOT=1 and NONE=2: specular mode forces diffuse encoding to zero, whereas NONE retains the requested diffuse mode. A targeted correction is proposed.

### Evidence limits

All 60 facts and 21 links were individually accounted for: 53 facts retained, one superseded, six unresolved; all links retained. The six section facts describe plausible compiled dispatch tables or constant pools, but C switches and literals do not establish section contents, alignment, sizes or references. No compiled artifacts were supplied, so those claims remain unresolved rather than being endorsed or replaced with another guess.

Status: synthesized; independent review and live promotion pending.
