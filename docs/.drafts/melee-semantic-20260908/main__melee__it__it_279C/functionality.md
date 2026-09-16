## Functionality

This mixed item-support unit defines parallel 47-entry Pokémon graphics and logic registries, a terminated common-Pokémon candidate list, shared Pokémon appearance and root-motion helpers, Pokémon selection and creation, effect and rebound helpers, and generic item attack-provenance/statistics adapters. The header exposes the corresponding interfaces and registry declarations.

### Selection and creation

Full-range selection excludes the two recorded recent absolute kinds, uses **one plus the eligible weight sum** as the random bound, and selects using a cumulative `>=` comparison. List selection scans at most 30 entries, stops at `It_PKind_Terminate`, compacts eligible candidates, uses the weight sum as its bound, and selects with strict `<`. These boundary rules are not interchangeable. The list selector defaults to Sonans and updates history even if no interval is selected; it does not guard a zero total.

Rare checks are ordered Celebi then Mew and share `Item_804A0E24.z`. Successful rare branches set that latch and record an encounter without shifting the ordinary history pair. Local code enforces exclusion while the latch remains set; its reset lifetime belongs to other code. The special-list null branch returns the absolute `It_PKind_Sonans`, although creation subsequently adds `It_PKind_Start` to the result. This exceptional domain mismatch is preserved rather than interpreted as a guaranteed Wobbuffet spawn.

Creation prioritizes nonzero override, common-list mode, opening movie, then debug/default selection. Ditto substitution applies only within the final branch. Selection/history and rare-recording side effects occur before factory success. Only a non-null factory result receives common appearance initialization, player/debug setup, packed attack descriptor `0x440060`, and owner attack notification.

### Appearance and movement

Common setup clears root-motion history and displacement, initializes uniform scale and phase 0, and invokes shared item setup helpers. Appearance physics runs before its timer test; a timer of 1 becomes 0 while still returning false, and subsequent expired calls continue applying physics and restoring configured scale.

Scale phase 0 grows toward configured scale, then writes phase 1. Every phase other than 0 and 2 delegates to the sequence updater. Its parity comparisons must remain literal: odd indices advance when target is at most current scale, even indices when target is at least current scale. Advancement snaps the current waypoint, increments the index, and computes the next delta using the pre-snap scale before testing completion. Duration and waypoint bounds are not validated locally.

Bone extraction scales and epsilon-filters local translation, stores its difference from previous history, updates that history, and clears the bone translation. A null bone leaves prior vectors untouched. The velocity consumer maps local Z displacement to world X multiplied by facing, copies Y, and leaves Z velocity unchanged.

### Effects, rebounds, and attribution

The effect wrapper forwards an item-scale/reference-scale ratio by address to `efSync_Spawn`; it does not validate the divisor or establish the effect's lifetime. Reflection reverses/scales horizontal velocity, flips facing, restores the lifetime field, and rotates the model. Shield bounce instead mirrors velocity about the contact vector and synchronizes facing, including the shared small-horizontal-speed exception; it does not perform the reflection lifetime reset.

Attack initialization distinguishes primary ownership from the immediate parent supplying metadata. Fighter-to-item copies, chained-item inheritance, neutral initialization, reset, packed-descriptor occurrence updates, and stale-instance updates are separate operations. Packed discriminator zero always requests a new occurrence; stale attack ID 1 always requests a new stale instance. Damage and hit adapters distinguish current fighter metadata from an attacking item's saved metadata and impose category/owner guards. Owner attack notification copies the descriptor locally and has no once-only latch.

## Semantic assessment

All owned canonical and rendered pages, all 85 frozen subjects, and all 39 links were examined. The ledger explicitly retains 178 facts and all 39 links, supersedes four factual explanations, and leaves six section-related facts unresolved. Existing useful names are retained; no equivalent-wording renames are proposed. Compiled section placement, sizes, and literal-pool membership are not inferred from authored source. The rendered collision between external callbacks `it_802D6810` and `it_802D6838` remains an owner-level follow-up.

Status: synthesized; independent review and live promotion pending.
