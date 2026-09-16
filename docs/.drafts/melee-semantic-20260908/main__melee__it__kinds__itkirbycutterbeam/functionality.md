## Kirby Cutter Beam semantic review

The inherited research covers both owned files in canonical and rendered forms, all 32 subjects, 80 facts and 37 links. This lead independently checked every proposed fact citation and all source evidence associated with upstream non-retain dispositions. Retain the supported 72 facts and all 37 links, supersede the two factual explanations, and preserve six compiled-section uncertainties. No overrides are needed.

### Creation and active state
Kirby's Special Hi release helper calls `it_8029BAB8` with a calculated position and facing direction. The constructor mutates the supplied position's Z to zero, copies it into `SpawnItem.prev_pos`, obtains `SpawnItem.pos` separately through a fighter-position helper, and requests `It_Kind_Kirby_CBeam`. Both parent references identify the spawning object. Projectile initialization and subsequent hooks run only when creation returns non-null.

`it_8029BB90` obtains an owner-derived angle, installs attribute speed and lifetime, computes planar velocity, requests motion state 0 with numeric flag 2, and initializes direction and position-history fields. The table contains one callback triple with a literal leading 0. The header declares four float attributes; `x4_vel` is not used in the owned implementation, so its precise meaning remains unestablished.

### Motion and collision
The animation callback delegates to `it_80273130`; inherited contextual research establishes that it decrements lifetime once and returns whether the updated timer is at most zero.

Physics snapshots the current position and reconstructs velocity from the existing speed and angle before updating stored speed. Grounded negative Y velocity is increased in magnitude by five percent. Stored speed then has `xC_decel` subtracted and is clamped to 0.01. This ordering does not guarantee a minimum current-frame velocity, and monotonic decrease depends on attribute values. The child model hierarchy is hidden when the timer is at most five and unhidden otherwise.

Collision maintains or acquires floor alignment. Losing grounded contact invokes the airborne helper and adds 0.001 to both current and collision-history Y positions. The model receives the stored angle. Wall termination explicitly tests either wall when horizontal velocity is zero, the left-wall mask when it is positive, and the right-wall mask in the remaining branch; the source's mask orientation is preserved rather than renamed intuitively.

### Interaction and reference lifetimes
Damage-dealt returns false without mutation. Clank, absorption and ordinary shield hit return true without local processing. Reflection reverses facing and XY velocity; shield bounce instead delegates XY reflection to `lbVector_Mirror` and chooses positive facing when the resulting X velocity is zero. Both recompute orientation using distinct grounded and airborne formulas, wrap angles with strict comparisons that permit the 2π endpoint, update model rotations and return false. Neither directly resets lifetime or changes motion state. Shield bounce's initial heading normalization is subsequently overwritten by its environment-dependent angle calculation.

`it_8029C4B4` forwards both objects unchanged to shared reference cleanup and discards its Boolean result. Inherited contextual research establishes that the shared helper independently clears every matching owner, reflector, absorber, fighter and toucher reference, setting source-player value 6 when clearing the primary fighter reference. The shared dispatcher preserves the prior owner before invoking this callback and can perform separate owner-dependent removal afterward; local cleanup is therefore not the entirety of the object's cross-file lifetime policy.

### Names and evidence boundaries
The rendered Spawn, Spawned, Reflected and EvtUnk hypotheses fit the canonical roles and existing callback convention; their historical spellings remain inferred. Unchanged motion callback names are not factual defects. Rendering completed without reported parse or substitution failures; its function-only coverage does not validate field names or section labels.

Source literals and rotation calls cannot establish compiled `.sdata` string placement, `.sdata2` membership or a 64-byte pool size. Those six baseline claims remain unresolved rather than being rewritten as proven section knowledge.

Status: synthesized; independent review and live promotion pending.
